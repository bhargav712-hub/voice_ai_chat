# 09. Troubleshooting Guide, Stack Traces & FAQ

**Project:** Conversational Voice AI Prototype  
**Scope:** Production Bug Catalog, Stack Traces, Root Causes, and Verified Fixes  

---

## 1. Web Audio Context Exhaustion

### Error Message / Stack Trace:
```text
Uncaught (in promise) DOMException: Failed to construct 'AudioContext': 
The number of hardware contexts provided (6) is greater than the maximum allowed.
    at _playNext (useAudioPlayback.js:52)
```

### Root Cause:
The browser client instantiates `new AudioContext()` on every incoming sentence chunk. Browsers (Chrome, Edge, Safari) limit hardware audio contexts to **6 per browsing session** to conserve operating system audio driver handles. Even if `ctx.close()` is called, garbage collection does not synchronously release OS hardware handles.

### Verified Fix:
Implement a module-scoped singleton `sharedAudioCtx` in [`frontend/src/hooks/useAudioPlayback.js`](file:///C:/Users/bharg/python%20work/Voice%20AI%20prototype/frontend/src/hooks/useAudioPlayback.js). Attach temporary audio elements to the shared context using `ctx.createMediaElementSource(audio)` and disconnect only the source node upon completion.

---

## 2. Non-Reentrant WebSocket Frame Interleaving

### Error Message / Stack Trace:
```text
RuntimeError: Cannot call "send" once a close message has been sent.
    or
RuntimeError: WebSocket is not connected: frame interleaving detected
    at WebSocket.send_json (starlette/websockets.py:165)
```

### Root Cause:
In Starlette / FastAPI, `WebSocket.send_json()` is not thread-safe or re-entrant. If the server is awaiting transmission of a streaming sentence audio frame while the client sends a `ping` keepalive frame, the event loop attempts two concurrent writes on the same TCP socket handle.

### Verified Fix:
Decouple socket transmission into a dedicated background worker consuming from an `asyncio.Queue()`. All route handlers emit messages via `await send_queue.put(payload)`.

---

## 3. SQLite Database Locked Contention

### Error Message / Stack Trace:
```text
sqlite3.OperationalError: database is locked
    at cursor.execute("INSERT INTO messages ...") in storage.py:42
```

### Root Cause:
Default SQLite connections run in rollback journal mode, locking the entire database file during write operations. Under concurrent WebSocket sessions where multiple users write audio transcripts simultaneously, write transactions collide.

### Verified Fix:
Enable Write-Ahead Logging (WAL) and set a 15-second busy timeout in [`backend/services/storage.py`](file:///C:/Users/bharg/python%20work/Voice%20AI%20prototype/backend/services/storage.py):
```python
conn = sqlite3.connect(DB_PATH, timeout=15.0)
conn.execute("PRAGMA journal_mode = WAL;")
conn.execute("PRAGMA foreign_keys = ON;")
conn.execute("PRAGMA synchronous = NORMAL;")
```

---

## 4. Acoustic Echo Self-Interruption Loop

### Symptom:
When running on laptop speakers without headphones, the assistant starts speaking, but after ~200ms cuts off its own voice and transitions back into `thinking` or `listening`.

### Root Cause:
Synthesized speech playing through laptop speakers leaks physically into the laptop microphone. The neural VAD detects human vocal frequencies in the assistant's voice and fires `onSpeechStart()`, erroneously triggering barge-in.

### Verified Fix:
1. Enforce hardware Acoustic Echo Cancellation: `navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true } })`.
2. Dynamically pause the VAD listener when the assistant begins speaking (`vadRef.current?.pause()`), and re-arm it only when playback finishes (`vadRef.current?.resume()`).

> [!NOTE]
> **Known Side-Effect on Barge-In:** While pausing the VAD listener successfully prevents speaker echo feedback, it makes the microphone deaf during AI speech. Consequently, **conversational voice barge-in is currently inactive/non-functional** during assistant playback and remains an open engineering item for future dual-threshold AEC improvements.

---

## 5. Non-Latin Streaming Starvation Bug

### Symptom:
When speaking in Hindi (Devanagari) or Japanese, the assistant remains in the "Thinking..." state for 4–8 seconds, then dumps the entire speech response all at once instead of streaming sentences incrementally.

### Root Cause:
The sentence boundary detector used a Latin-only regex constraint:
```python
# BUGGY CODE:
if len(cand) >= 4 and re.search(r'[a-zA-Z]{2,}', cand):
```
In Devanagari or CJK scripts, zero Latin characters exist. The regex never matched, causing the buffer to accumulate indefinitely until the stream closed.

### Verified Fix:
Update the tokenizer in [`backend/services/llm.py`](file:///C:/Users/bharg/python%20work/Voice%20AI%20prototype/backend/services/llm.py) to match universal punctuation:
```python
PUNCTUATION_REGEX = re.compile(r'([.!?\u0964\u0965\u3002]+)(?:\s+|$)')
```

---

## 6. Production 404 on ONNX WASM Assets

### Error Message / Stack Trace:
```text
GET http://localhost:5173/wasm/ort-wasm-simd-threaded.wasm 404 (Not Found)
Uncaught (in promise) Error: failed to load onnxruntime-web wasm binary
```

### Root Cause:
`useVAD.js` requests WASM binaries from `/wasm/`. In development, a Vite plugin served files dynamically from `node_modules/`. However, running `npm run build` failed to bundle the WASM files into the production `dist/` directory.

### Verified Fix:
Bundle static WASM binaries into `frontend/public/wasm/`. Vite automatically copies everything in `public/` directly into the root of `dist/` during production builds.

---

## 7. Short Audio Chunk Rejection (< 400 Bytes)

### Symptom:
Clicking the Voice Orb rapidly or making quiet breath sounds causes Groq Whisper to throw `400 Bad Request: Invalid media file` or `could not process file`.

### Root Cause:
Tiny audio fragments (< 400 bytes) contain only the 44-byte WAV header and zero PCM data samples. Whisper cannot decode files lacking audio frames.

### Verified Fix:
Add an in-memory guard in [`backend/services/stt.py`](file:///C:/Users/bharg/python%20work/Voice%20AI%20prototype/backend/services/stt.py):
```python
if len(file_bytes) < 400:
    return ""
```

---

## 8. Docker / Nginx WebSocket 1006 / 502 Bad Gateway Drops

### Error Message / Stack Trace:
```text
WebSocket connection to 'ws://localhost:8000/ws/conversation' failed: 
Error during WebSocket handshake: Unexpected response code: 502
  or
WebSocket is closed before the connection is established. Code: 1006
```

### Root Cause:
Nginx or Docker reverse proxies default to HTTP/1.0 and drop `Upgrade` headers. Without explicit `Upgrade $http_upgrade` and `Connection "Upgrade"` directives, the WebSocket handshake fails to complete.

### Verified Fix:
In the Nginx reverse proxy configuration, explicitly enable HTTP/1.1 and forward hop-by-hop upgrade headers:
```nginx
location /ws {
    proxy_pass http://backend:8000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "Upgrade";
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
}
```

---

## 9. Docker Volume Permission Lock on SQLite Database

### Symptom:
When running inside Docker containers, the backend logs:
`sqlite3.OperationalError: unable to open database file` or `permission denied: /app/data/conversations.db`.

### Root Cause:
Docker volumes created on the host machine default to `root:root` ownership, preventing the non-root container user (`USER 1000:1000`) from creating the SQLite database or writing WAL journal files.

### Verified Fix:
In the `Dockerfile`, create and chown the `/app/data` directory before switching to the unprivileged user:
```dockerfile
RUN mkdir -p /app/data && chown -R 1000:1000 /app/data
USER 1000:1000
```
