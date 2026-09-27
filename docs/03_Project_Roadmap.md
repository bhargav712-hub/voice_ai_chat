# 03. Project Roadmap & Learning Curriculum

**Project:** Conversational Voice AI Prototype  
**Curriculum Structure:** 8 Sequential Build Phases  
**Prerequisites:** Modern JavaScript (ES6+), Python 3.10+, Asyncio, Web Audio fundamentals  

---

## Roadmap Overview

```
Phase 1: Web Audio Foundations & Microphone Capture
   ↓
Phase 2: Edge-Side Neural VAD with Silero ONNX (Web Worker)
   ↓
Phase 3: Asynchronous Full-Duplex WebSocket Gateway
   ↓
Phase 4: In-Memory Sub-200ms STT with Groq Whisper
   ↓
Phase 5: Script-Agnostic LLM Token-to-Sentence Streaming
   ↓
Phase 6: Concurrent TTS Synthesis & Web Audio Singleton
   ↓
Phase 7: Sub-Millisecond Barge-In & State Synchronization
   ↓
Phase 8: SQLite WAL Persistence, 60fps Visuals & Hardening
   ↓
Phase 9: Per-Chat Working Memory & Utterance Cache (Upcoming)
```

---

## Phase 1: Web Audio Foundations & Hardware Microphone Capture

### 1. Objectives
Establish a reliable browser audio stream with hardware-level noise suppression and acoustic echo cancellation.

### 2. Core Concepts
* **AudioContext & MediaStream:** The browser's audio routing graph.
* **Hardware Acoustic Echo Cancellation (AEC):** Preventing speaker output from looping back into microphone input.
* **16kHz Resampling:** Standardizing sample rates across differing microphone hardware for machine learning models.

### 3. Implementation Tasks
* Call `navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })`.
* Inspect supported constraints across Chrome, Firefox, and Safari.
* Handle user permission rejections and microphone disconnect events gracefully.

### 4. Codebase Reference
* [`frontend/src/hooks/useVAD.js`](file:///C:/Users/bharg/python%20work/Voice%20AI%20prototype/frontend/src/hooks/useVAD.js)

### 5. Verification Milestone
Microphone captures clean voice audio; volume levels register accurately on an oscilloscope or level meter without clipping.

---

## Phase 2: Edge-Side Neural VAD with Silero ONNX

### 1. Objectives
Isolate human speech from ambient room hum directly in the browser, eliminating unnecessary network bandwidth and server processing costs.

### 2. Core Concepts
* **Energy Gate vs. Neural Classification:** Why decibel thresholds fail on keyboard clicks and whispers.
* **Web Workers & WebAssembly:** Running a quantized machine learning model (Silero v5 ONNX) without blocking the React UI thread (60fps).
* **Multi-Layer Hysteresis:** Setting speech initiation thresholds (`positiveSpeechThreshold: 0.72`) and completion frame windows (`minSpeechFrames: 14`).

### 3. Implementation Tasks
* Configure `@ricky0123/vad-web` with static WASM assets (`/wasm/silero_vad_v5.onnx`).
* Buffer raw 16-bit PCM samples into memory while speech is active.
* Package frames into a clean WAV Blob when speech terminates and invoke `onSpeechEnd(wavBlob)`.

### 4. Codebase Reference
* [`frontend/src/hooks/useVAD.js`](file:///C:/Users/bharg/python%20work/Voice%20AI%20prototype/frontend/src/hooks/useVAD.js)

### 5. Verification Milestone
Typing loudly or coughing does not trigger speech events; speaking a sentence emits a clean, pre-trimmed WAV blob within 400ms of pausing.

---

## Phase 3: Asynchronous Full-Duplex WebSocket Gateway

### 1. Objectives
Create a secure, persistent, non-blocking communication channel between the React frontend and FastAPI backend.

### 2. Core Concepts
* **Full-Duplex vs. Half-Duplex:** Bidirectional frame passing without HTTP connection overhead.
* **Cross-Site WebSocket Hijacking (CSWSH):** Why CORS does not protect WebSockets and how to validate handshake Origin headers.
* **Non-Reentrant Sockets:** Why `websocket.send_json()` fails under concurrent access and how a producer-consumer `asyncio.Queue` solves it.

### 3. Implementation Tasks
* Set up `@app.websocket("/ws/conversation")` in FastAPI.
* Implement Origin whitelist validation returning `WS_1008_POLICY_VIOLATION` for unauthorized sites.
* Build a decoupled `socket_writer` background task consuming from `send_queue`.

### 4. Codebase Reference
* [`backend/main.py`](file:///C:/Users/bharg/python%20work/Voice%20AI%20prototype/backend/main.py)
* [`frontend/src/services/api.js`](file:///C:/Users/bharg/python%20work/Voice%20AI%20prototype/frontend/src/services/api.js)

### 5. Verification Milestone
Automated tests pass for unauthorized origin rejection; bidirectional ping/pong frames exchange without race conditions.

---

## Phase 4: In-Memory Sub-200ms STT with Groq Whisper

### 1. Objectives
Transcribe audio payloads in under 200ms without touching the server's physical hard drive.

### 2. Core Concepts
* **Disk Contention Penalties:** How synchronous tempfile creation adds 40–120ms of disk I/O latency.
* **Zero-Disk Streaming:** Passing in-memory byte buffers (`io.BytesIO`) directly to cloud API clients.
* **Thread Offloading:** Using `asyncio.to_thread` to prevent synchronous API calls from blocking the Python event loop.

### 3. Implementation Tasks
* Configure `groq.Groq` client with `whisper-large-v3-turbo`.
* Reject short/corrupt audio frames (< 400 bytes) before hitting the API.
* Return user transcripts immediately downstream so the UI bubble renders instantly.

### 4. Codebase Reference
* [`backend/services/stt.py`](file:///C:/Users/bharg/python%20work/Voice%20AI%20prototype/backend/services/stt.py)

### 5. Verification Milestone
A 3-second voice WAV blob is transcribed and returned in < 200ms; zero temporary files are created on disk.

---

## Phase 5: Script-Agnostic LLM Token-to-Sentence Streaming

### 1. Objectives
Stream text tokens from the LLM, chunk them into natural syntactic clauses in real time, and support non-Latin scripts.

### 2. Core Concepts
* **Token vs. Sentence Granularity:** Why TTS engines cannot synthesize raw individual tokens.
* **The Non-Latin Starvation Bug:** How `[a-zA-Z]{2,}` regexes stall streaming on Hindi, Japanese, and Arabic.
* **Universal Punctuation Tokenization:** Matching Latin marks (`[.!?]`), Devanagari Danda (`[। ॥]`), and CJK stops (`[。]`) while exempting abbreviations (`Dr.`, `e.g.`).
* **Sliding Window Memory:** Capping historical turns (`history[-12:]`) to prevent context window bloat and TPM rate limit exhaustion.

### 3. Implementation Tasks
* Build `extract_sentences(buffer)` with script-agnostic regex boundaries.
* Connect Groq chat completions streaming API with `AsyncGroq`.
* Yield complete sentence chunks as generator items as soon as boundaries are reached.

### 4. Codebase Reference
* [`backend/services/llm.py`](file:///C:/Users/bharg/python%20work/Voice%20AI%20prototype/backend/services/llm.py)

### 5. Verification Milestone
Unit tests verify sentence extraction for English, Hindi, and abbreviation-laden sentences; first sentence chunks yield within 70ms of STT completion.

---

## Phase 6: Concurrent TTS Synthesis & Web Audio Singleton

### 1. Objectives
Synthesize audio chunks in parallel with LLM generation and play them seamlessly in the browser with sample-accurate subtitle pacing.

### 2. Core Concepts
* **Pipelined Execution:** Synthesizing Sentence 2 while Sentence 1 is playing.
* **Browser Hardware Context Ceiling:** Why instantiating `new AudioContext()` crashes after 6 sentences.
* **Hardware Audio Clock Synchronization:** Using `ctx.currentTime` to compute precise word-level subtitle highlight timings.

### 3. Implementation Tasks
* Implement `tts.synthesize(sentence)` using Edge-TTS with regional voice routing (e.g. `hi-IN-SwaraNeural`).
* Create a module-scoped singleton `sharedAudioCtx` and `sharedAnalyser` in `useAudioPlayback.js`.
* Drive a 60fps `requestAnimationFrame` volume loop updating Voice Orb RMS telemetry.

### 4. Codebase Reference
* [`backend/services/tts.py`](file:///C:/Users/bharg/python%20work/Voice%20AI%20prototype/backend/services/tts.py)
* [`frontend/src/hooks/useAudioPlayback.js`](file:///C:/Users/bharg/python%20work/Voice%20AI%20prototype/frontend/src/hooks/useAudioPlayback.js)

### 5. Verification Milestone
Conversations with 20+ sentences stream continuously without AudioContext limit errors; word-by-word subtitles advance in exact sync with spoken audio.

---

## Phase 7: Sub-Millisecond Barge-In & State Synchronization

### 1. Objectives
Allow the user to interrupt the assistant at any millisecond, cutting off audio immediately and preserving clean dialogue state.

### 2. Core Concepts
* **Full-Duplex Interruption:** User speech detection while assistant playback is active.
* **Atomic Generator Cancellation:** Cancelling active Python `asyncio.Task` workers cleanly.
* **Partial Snapshotting:** Recording the partial text spoken up to the point of interruption (`[interrupted]`) to keep chat history synchronized.

### 3. Implementation Tasks
* Wire client interrupt signals to `audioPlayback.stop()` and send `{"type": "interrupt"}`.
* In `main.py`, catch `asyncio.CancelledError`, assemble `partial_reply`, and commit to SQLite and session history.

### 4. Codebase Reference
* [`backend/main.py`](file:///C:/Users/bharg/python%20work/Voice%20AI%20prototype/backend/main.py)
* [`frontend/src/hooks/useVoicePipeline.js`](file:///C:/Users/bharg/python%20work/Voice%20AI%20prototype/frontend/src/hooks/useVoicePipeline.js)

### 5. Verification Milestone
Speaking or clicking the Orb while the AI is talking cuts audio in < 20ms; SQLite records the partial utterance with `[interrupted]`.

---

## Phase 8: SQLite WAL Persistence, 60fps Visuals & Hardening

### 1. Objectives
Persist full conversation transcripts, drive real-time visual telemetry, and harden against race conditions.

### 2. Core Concepts
* **SQLite Write-Ahead Logging (WAL):** Allowing concurrent reads while writes occur without locking errors.
* **Foreign Key Constraints:** Cascading deletions when sessions are removed.
* **Canvas-Free CSS Reactivity:** Using Fast Fourier Transform time-domain RMS data to drive CSS transforms at 60fps.

### 3. Implementation Tasks
* Configure `sqlite3` connection factory with `PRAGMA journal_mode = WAL;` and `timeout=15.0`.
* Build `VoiceOrb.jsx` with CSS scale/glow driven by volume thresholds.
* Implement session creation, deletion, and replay endpoints in FastAPI and React.

### 4. Codebase Reference
* [`backend/services/storage.py`](file:///C:/Users/bharg/python%20work/Voice%20AI%20prototype/backend/services/storage.py)
* [`frontend/src/components/VoiceOrb.jsx`](file:///C:/Users/bharg/python%20work/Voice%20AI%20prototype/frontend/src/components/VoiceOrb.jsx)

### 5. Verification Milestone
Multiple browser tabs read and write sessions simultaneously with zero lock contention; the Voice Orb animates smoothly at 60fps.

---

## Phase 9: Per-Chat Working Memory & Utterance Context Cache (Upcoming Feature)

### 1. Objectives
Implement a lightweight, low-latency per-session context cache so the LLM retains long-term recall of words spoken, key topics, and user preferences across an extended conversation without incurring token bloat or increasing Time-To-First-Token (TTFT) latency.

### 2. Core Concepts
* **Sliding Window Limitation:** The current 12-turn window (`history[-12:]`) bounds token cost to $O(1)$, but causes the model to forget facts or exact words spoken 15 turns ago.
* **Per-Session Ephemeral Cache:** An in-memory key-value or rolling summary buffer keyed by `conversation_id`.
* **Dynamic Context Injection:** Extracting salient entity/keyword snapshots from past turns and injecting a compact memory bullet block into the system prompt:
  ```
  [Session Memory & Past Spoken Context]
  - User Name: Alex
  - Discussed: Quantum entanglement, Bell test experiment
  - Assistant previously stated: "Entanglement does not transmit faster-than-light signals."
  ```
* **Zero Disk Latency:** Kept in RAM during active WebSocket streaming, with periodic background synchronization to SQLite.

### 3. Proposed Implementation
* Create `backend/services/cache.py` with an async thread-safe `SessionMemoryCache`.
* Hook into `main.py` pipeline: on each completed turn, update the session cache with key entities and spoken highlights.
* Prepend the session memory block into `llm.stream_sentences()`.

### 4. Verification Milestone
In a 25-turn conversation, asking *"What exact words did you use when explaining the speed of light earlier?"* correctly retrieves the previous answer from the session cache without context window overflow.
