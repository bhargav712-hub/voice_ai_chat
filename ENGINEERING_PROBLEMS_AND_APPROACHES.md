# Engineering Problem-Solution Matrix & Architectural Decision Records (ADR)

> **Project:** Conversational Voice AI Prototype  
> **Author / Engineer:** Self-Audited & Implemented  
> **Purpose:** Technical interview cheat-sheet and architectural reference mapping self-identified bugs, bottlenecks, and security vulnerabilities to the evaluated alternatives and chosen engineering solutions.

---

## Quick Reference Index

| ID | Problem Statement | Category | Chosen Approach |
| :--- | :--- | :--- | :--- |
| **P-01** | Web Audio Context Exhaustion (6-Context Crash) | Audio Graph / Web Audio | Persistent Shared Singleton `AudioContext` |
| **P-02** | Voice Orb Ambient Noise State Flapping | UI / VAD Calibration | Multi-Layer Hysteresis & Neural VAD Tuning |
| **P-03** | Acoustic Echo Self-Interruption Loop | Full-Duplex Audio / AEC | Echo Cancellation + 400ms Startup Debounce |
| **P-04** | Non-Reentrant WebSocket Frame Race Condition | Network Concurrency | Serialized Producer-Consumer `asyncio.Queue` |
| **P-05** | Barge-In Interruption Session History Desync | Distributed State / DB | Atomic `CancelledError` Interceptor & Partial Snapshot |
| **P-06** | Multilingual Sentence Starvation (Non-Latin Bug) | NLP / Tokenization | Script-Agnostic Punctuation Tokenizer |
| **P-07** | STT Disk I/O Contention & Latency Penalty | Backend Performance | In-Memory `io.BytesIO` Streaming Pipeline |
| **P-08** | Broken Silero VAD RMS Fallback (Silent Failure) | Fault Tolerance / Audio | On-Demand `MediaRecorder` Buffer Pipeline |
| **P-09** | Production Build 404 on ONNX WASM Assets | Build Systems / Vite | Bundled `/public/wasm/` Asset Distribution |
| **P-10** | SQLite Database Locking & Missing Cascade Deletes | Data Persistence | WAL Mode + Foreign Keys + 15s Busy Timeout |
| **P-11** | Cross-Site WebSocket Hijacking (CSWSH) | Security & Access Control | Handshake Origin Header Policy Validation |
| **P-12** | Infinite Context Token Exhaustion (Context Bloat) | LLM Orchestration | Sliding-Window History Truncation (12 Turns) |
| **P-13** | Transcript & Speech Desynchronization (Text Pre-Dumping) | UX / Subtitle Synchronization | Audio Context Time-Synchronized Pacing |
| **P-14** | Acoustic Echo Feedback Self-Interruption (Voice Cut-off Loop) | Full-Duplex Audio / AEC | State-Aware VAD Suppression & Orb Barge-In |
| **P-15** | Chromium Streaming MP3 `Infinity` Duration & Clock Desync | Audio Decoding & Clock Sync | Web Audio `decodeAudioData` & Hardware Audio Clock |
| **P-16** | Rigid Volume Gating Flapping & Perceptual Compression | UI Acoustics & Turn-Taking | Decoupled Neural State + Visual Hysteresis + $\sqrt{\text{Volume}}$ Scaling |
| **P-17** | Monolithic Hook Bloat & Transport Redundancy | Frontend Architecture / State Management | Separation of Audio Transport from Session Persistence (Lean Audio Conductor) |
| **P-18** | Deaf Assistant During Audio Playback (Voice Barge-In Blockade) | Full-Duplex Audio / Turn-Taking | Evaluated: Asymmetric Dual-Gate (Baseline: P-14 Orb Interruption) |
| **P-19** | Loud Speaker Acoustic Saturation & Microphone Masking | Audio DSP / Acoustic Saturation | Evaluated: Volume Attenuation (Baseline: P-14 State-Aware Suppression) |

---

## Detailed Problem-Approach Breakdowns

```
Format:
  Problem Statement   : Exact failure mechanism, impact, and root cause identified
  Approaches Considered:
    • Approach A       : [Pros / Cons / Why Rejected]
    • Approach B       : [Pros / Cons / Why Rejected]
    • Approach C (Won) : [Core Rationale & Implementation Details]
  Codebase Reference  : Primary file and function location
```

---

### [P-01] Web Audio Context Exhaustion

* **Problem Statement:**  
  Inside `useAudioPlayback.js`, each incoming sentence chunk initialized a fresh `new AudioContext()`. Modern browsers (Chrome, Edge, Safari) enforce a strict hardware limit of **6 AudioContext instances** per browsing session. After sentence 6, the browser threw `DOMException: Failed to construct 'AudioContext': The number of hardware contexts provided (6) is greater than the maximum allowed`, permanently killing audio output and leaving the UI frozen in the `speaking` state.
* **Approaches Considered:**
  * **Approach A (Synchronous Close):** Call `ctx.close()` immediately on audio completion.  
    *Why Rejected:* Browser garbage collection does not synchronously release OS hardware audio handles. The DOMException still triggers during rapid sentence streaming.
  * **Approach B (HTML5 Audio Fallback):** Discard Web Audio entirely and use raw `new Audio().play()`.  
    *Why Rejected:* Loses the ability to connect an `AnalyserNode`, eliminating the real-time 60fps volume dynamics that drive the Voice Orb's physical reactivity.
  * **Approach C (Persistent Singleton — CHOSEN):**  
    Maintain a single, module-scoped `sharedAudioCtx` and `sharedAnalyser` across the client lifecycle. When chunks play, dynamically attach each temporary `AudioElement` to the shared node via `ctx.createMediaElementSource()`, and disconnect only the source on completion.
* **Codebase Reference:** [`frontend/src/hooks/useAudioPlayback.js`](file:///c:/Users/bharg/python%20work/Voice%20AI%20prototype/frontend/src/hooks/useAudioPlayback.js)

---

### [P-02] Voice Orb Ambient Noise State Flapping

* **Problem Statement:**  
  When outside background noise entered the room (traffic, fan, keyboard clicks), the Voice Orb continuously oscillated between *Listening (Blue)*, *User Speaking (Luminous White)*, and *Thinking (Purple)* without any human speech.
* **Approaches Considered:**
  * **Approach A (Software Push-to-Talk):** Disable active listening and require manual button clicks.  
    *Why Rejected:* Destroys the core hands-free conversational voice UX of the prototype.
  * **Approach B (Pure Software Gate):** Filter solely with an aggressive volume noise gate.  
    *Why Rejected:* Volume gates fail because quiet human speech (whispers) has lower energy than sudden non-speech clatter (dropping a pen).
  * **Approach C (Multi-Layer Neural Hysteresis — CHOSEN):**  
    1. Raised the visual UI threshold in `VoiceOrb.jsx` from `0.04` to `0.12` so ambient room hum doesn't trigger visual pulsing.  
    2. Calibrated Silero VAD neural confidence: raised `positiveSpeechThreshold` from `0.6` to `0.72` and `minSpeechFrames` from `10` to `14` (~448ms). Brief noise bursts are discarded by the neural network before ever hitting the backend.
* **Codebase Reference:** [`frontend/src/components/VoiceOrb.jsx`](file:///c:/Users/bharg/python%20work/Voice%20AI%20prototype/frontend/src/components/VoiceOrb.jsx) & [`frontend/src/hooks/useVAD.js`](file:///c:/Users/bharg/python%20work/Voice%20AI%20prototype/frontend/src/hooks/useVAD.js)

---

### [P-03] Acoustic Echo Self-Interruption Loop

* **Problem Statement:**  
  When running on laptop speakers without headphones, synthesized speech played through the speakers leaked back into the microphone. After an initial 180ms window, Silero VAD detected human vocal cord formants in the audio and fired `onSpeechStart()`, causing the assistant to interrupt itself.
* **Approaches Considered:**
  * **Approach A (Enforce Headphone Usage):** Display a UI alert requiring headphones.  
    *Why Rejected:* Fragile user experience; unacceptable for enterprise voice demos.
  * **Approach B (Half-Duplex Mic Muting):** Completely mute the microphone track while the assistant is speaking.  
    *Why Rejected:* Completely breaks conversational barge-in; users are unable to interrupt long-winded answers.
  * **Approach C (AEC Constraints + Extended Dynamic Debounce — CHOSEN):**  
    1. Enforced browser/OS-level hardware Acoustic Echo Cancellation via `navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })`.  
    2. Extended the initial playback debounce window from 180ms to 400ms to absorb speaker activation thumps and room reverb transients.
* **Codebase Reference:** [`frontend/src/hooks/useVoicePipeline.js`](file:///c:/Users/bharg/python%20work/Voice%20AI%20prototype/frontend/src/hooks/useVoicePipeline.js)

---

### [P-04] Non-Reentrant WebSocket Frame Race Condition

* **Problem Statement:**  
  In FastAPI / Starlette, `WebSocket.send_json()` is not thread-safe or re-entrant. While the pipeline was streaming sentence audio frames downstream, if a client keepalive `ping` arrived, the socket handler concurrently invoked `await websocket.send_json({"type": "pong"})`. This caused frame interleaving and fatal `RuntimeError: Cannot call 'send' once a close message has been sent`.
* **Approaches Considered:**
  * **Approach A (Asyncio Mutex Lock):** Wrap every `send_json` call in an `asyncio.Lock()`.  
    *Why Rejected:* High contention and risk of head-of-line blocking under rapid audio chunk emission.
  * **Approach B (Drop Pings During Streaming):** Ignore client keepalive frames while generating.  
    *Why Rejected:* Reverse proxies (e.g. Nginx, Cloudflare) terminate idle connections if keepalive intervals lapse during long LLM thoughts.
  * **Approach C (Producer-Consumer `asyncio.Queue` — CHOSEN):**  
    Decoupled socket transmission into a dedicated background `socket_writer` task consuming from an internal `send_queue`. All routes and streaming generators emit messages via non-blocking `safe_send(payload)`, guaranteeing atomic, sequential serialization.
* **Codebase Reference:** [`backend/main.py`](file:///c:/Users/bharg/python%20work/Voice%20AI%20prototype/backend/main.py)

---

### [P-05] Barge-In Interruption Session History Desync

* **Problem Statement:**  
  When a user interrupted the assistant mid-utterance, `cancel_active_task()` cancelled the async generator. The user query was already written to SQLite and `history`, but because generation aborted before reaching the final assistant save block, the assistant's partial speech was lost. The conversation history contained two consecutive user turns without an assistant reply, corrupting conversational context and session replay.
* **Approaches Considered:**
  * **Approach A (Rollback User Message):** Delete the user's initiating turn from database on barge-in.  
    *Why Rejected:* Destructive; user's actual instruction vanishes from transcript.
  * **Approach B (Pre-Save Placeholder):** Write an empty assistant message before generation begins.  
    *Why Rejected:* Pollutes database with empty strings if generation fails immediately.
  * **Approach C (Atomic `CancelledError` Partial Snapshot — CHOSEN):**  
    In `backend/main.py`, the pipeline tracks `partial_reply: list[str]`. When `asyncio.CancelledError` is caught during cancellation, it snapshots the sentences spoken so far, appends `" [interrupted]"`, and commits the partial turn to both SQLite and the in-memory history before re-raising the cancellation.
* **Codebase Reference:** [`backend/main.py`](file:///c:/Users/bharg/python%20work/Voice%20AI%20prototype/backend/main.py)

---

### [P-06] Multilingual Sentence Starvation (The Non-Latin Bug)

* **Problem Statement:**  
  In `llm.py`, `extract_sentences()` enforced `re.search(r'[a-zA-Z]{2,}', cand)`. When the user spoke in Hindi (Devanagari script), Japanese, or Arabic, the candidate string contained zero Latin characters (`[a-zA-Z]`). The regex never matched, causing the buffer to accumulate indefinitely until the entire LLM response finished. Pipelined sentence streaming failed completely for non-English queries.
* **Approaches Considered:**
  * **Approach A (Simple Whitespace Chunking):** Split text every N words.  
    *Why Rejected:* Cuts mid-phrase; produces unnatural, robotic TTS prosody and breaks intonation.
  * **Approach B (Heavy External NLP Library):** Install `spaCy` / `nltk` sentence segmenters.  
    *Why Rejected:* Adds 500MB+ in dependencies and introduces 50–100ms processing overhead per streaming token batch.
  * **Approach C (Script-Agnostic Punctuation Regex — CHOSEN):**  
    Rewrote tokenizer using `([.!?\u0964\u0965\u3002]+)(?:\s+|$)`, supporting Latin marks, Devanagari Danda (`।`, `॥`), and East Asian full stops (`。`). Replaced the Latin letter requirement with a universal character count (`len(candidate) >= 2`) while preserving abbreviation exemptions (`Dr.`, `e.g.`, `1.`).
* **Codebase Reference:** [`backend/services/llm.py`](file:///c:/Users/bharg/python%20work/Voice%20AI%20prototype/backend/services/llm.py)

---

### [P-07] STT Disk I/O Contention & Latency Penalty

* **Problem Statement:**  
  `backend/services/stt.py` received raw audio bytes in memory, wrote them to a physical disk file via `NamedTemporaryFile(delete=False)`, reopened the file for reading, and then unlinked it. This synchronous disk I/O added 40–120ms of disk contention and risked orphaned temporary files on process termination.
* **Approaches Considered:**
  * **Approach A (Async File I/O via `aiofiles`):** Make disk writes non-blocking.  
    *Why Rejected:* Still writes to physical disk; does not eliminate I/O queue overhead or file system cleanup issues.
  * **Approach B (In-Memory `io.BytesIO` Buffer — CHOSEN):**  
    Groq Whisper's SDK accepts a file tuple `(filename, io.BytesIO(file_bytes))`. Bypassed physical disk storage entirely, streaming raw audio straight from RAM in a thread pool (`asyncio.to_thread`) for zero disk latency.
* **Codebase Reference:** [`backend/services/stt.py`](file:///c:/Users/bharg/python%20work/Voice%20AI%20prototype/backend/services/stt.py)

---

### [P-08] Broken Silero VAD RMS Fallback (Silent Failure)

* **Problem Statement:**  
  When WebAssembly or ONNX failed to initialize, `useVAD.js` switched to an RMS volume fallback. On speech end, it executed `onSpeechEnd?.(null)`. In `useVoicePipeline.js`, a guard checked `if (wavBlob && wavBlob.size >= 400)`. Because `wavBlob` was `null`, the audio was discarded and the user was left in silence with no transcription.
* **Approaches Considered:**
  * **Approach A (Hard Fail with Error Banner):** Disable the mic and tell the user to use a supported browser.  
    *Why Rejected:* Zero fault tolerance; degrades accessibility on restricted browser environments.
  * **Approach B (Integrated `MediaRecorder` Buffer — CHOSEN):**  
    When running in RMS fallback, `useVAD.js` automatically instantiates a browser `MediaRecorder` on `onSpeechStart`. It buffers streaming audio chunks in memory and compiles them into a valid `audio/webm` Blob when the silence timer triggers, restoring full functionality even without WASM.
* **Codebase Reference:** [`frontend/src/hooks/useVAD.js`](file:///c:/Users/bharg/python%20work/Voice%20AI%20prototype/frontend/src/hooks/useVAD.js)

---

### [P-09] Production Build 404 on ONNX WASM Assets

* **Problem Statement:**  
  The WebAssembly files required by `@ricky0123/vad-web` (`ort-wasm-simd-threaded.wasm`) were served via a custom Vite development server hook (`configureServer`). When compiling for production via `npm run build`, `configureServer` does not run. Deployments threw HTTP 404s when fetching `/wasm/*.wasm`, crashing Silero VAD in production.
* **Approaches Considered:**
  * **Approach A (External CDN URLs):** Point ONNX loader to unpkg/jsdelivr.  
    *Why Rejected:* Introduces cross-origin latency, third-party availability risks, and breaks offline/air-gapped deployments.
  * **Approach B (Bundled `/public/wasm/` Static Assets — CHOSEN):**  
    Copied all ONNX WebAssembly binaries, SIMD threads, and worklet bundles into `frontend/public/wasm/`. Vite automatically copies the `public/` directory verbatim into `dist/` on build, guaranteeing identical behavior across dev and production.
* **Codebase Reference:** [`frontend/public/wasm/`](file:///c:/Users/bharg/python%20work/Voice%20AI%20prototype/frontend/public/wasm/) & [`frontend/vite.config.js`](file:///c:/Users/bharg/python%20work/Voice%20AI%20prototype/frontend/vite.config.js)

---

### [P-10] SQLite Database Locking & Missing Cascade Deletes

* **Problem Statement:**  
  Under concurrent voice session activity, default SQLite synchronous file locking caused `sqlite3.OperationalError: database is locked`. Furthermore, foreign key constraints were not active by default in SQLite, meaning deleting a conversation orphaned its records in the `messages` table.
* **Approaches Considered:**
  * **Approach A (Migrate to External PostgreSQL):** Replace SQLite with a dedicated database server.  
    *Why Rejected:* Over-engineering for a local prototype; adds operational burden and external dependencies.
  * **Approach B (Hardened SQLite Configuration — CHOSEN):**  
    Configured connection pragmas on every database handle:  
    1. `PRAGMA journal_mode = WAL;` (Write-Ahead Logging allows concurrent readers and writers without blocking).  
    2. `PRAGMA foreign_keys = ON;` (Enforces relational integrity and cascading deletes).  
    3. `PRAGMA synchronous = NORMAL;` and `sqlite3.connect(..., timeout=15.0)` to eliminate lock timeouts.
* **Codebase Reference:** [`backend/services/storage.py`](file:///c:/Users/bharg/python%20work/Voice%20AI%20prototype/backend/services/storage.py)

---

### [P-11] Cross-Site WebSocket Hijacking (CSWSH)

* **Problem Statement:**  
  While FastAPI's REST endpoints were protected by `CORSMiddleware`, Starlette WebSocket handshakes bypass CORS policies by default. An attacker hosting a malicious site could open a WebSocket to `ws://localhost:8000/ws/conversation` from the user's browser, hijacking the mic stream and burning Groq API credits.
* **Approaches Considered:**
  * **Approach A (Cookie-Based Auth):** Attach session cookies to the initial request.  
    *Why Rejected:* Browser sends ambient cookies automatically on cross-origin requests; does not mitigate CSWSH without anti-CSRF tokens.
  * **Approach B (Origin Header Validation — CHOSEN):**  
    Inspect `websocket.headers.get("origin")` inside `websocket_conversation` before handshake acceptance. Compare against `ALLOWED_ORIGINS` and reject unauthorized origins immediately with WebSocket close code `1008 (Policy Violation)`.
* **Codebase Reference:** [`backend/main.py`](file:///c:/Users/bharg/python%20work/Voice%20AI%20prototype/backend/main.py)

---

### [P-12] Infinite Context Token Exhaustion (Context Bloat)

* **Problem Statement:**  
  The full conversation history array was appended and transmitted to Groq LPUs on every turn: `messages.extend(history)`. In long conversational sessions, token count scaled linearly until exceeding model limits, resulting in `400 Bad Request: ContextWindowExceededError` and increasing Time-To-First-Token (TTFT) latency.
* **Approaches Considered:**
  * **Approach A (Summarization Agent):** Run a background LLM pass every 5 turns to summarize older dialogue.  
    *Why Rejected:* High API cost, adds latency overhead, and can introduce hallucinated compression errors.
  * **Approach B (Fixed Session Timeout):** Disconnect and wipe session after 10 minutes.  
    *Why Rejected:* Unfriendly user experience; frustrates users during extended voice workflows.
  * **Approach C (Sliding-Window Truncation — CHOSEN):**  
    Applied a sliding-window context buffer: `messages.extend(history[-12:])`. Keeps the system prompt and the 12 most recent turns (6 back-and-forth exchanges), maintaining rich context while bounding memory and latency strictly to $O(1)$.
* **Codebase Reference:** [`backend/services/llm.py`](file:///c:/Users/bharg/python%20work/Voice%20AI%20prototype/backend/services/llm.py) & [`backend/main.py`](file:///c:/Users/bharg/python%20work/Voice%20AI%20prototype/backend/main.py)

---

### [P-13] Transcript & Speech Desynchronization (Text Pre-Dumping)

* **Problem Statement:**  
  Groq LPUs stream text tokens at 300+ tok/s, generating complete paragraphs in under 800ms. In the original implementation, the frontend appended text to the chat transcript as soon as the WebSocket emitted each sentence. Because real-time voice playback requires 30–45 seconds, the entire text response appeared instantly on screen while the audio had barely spoken word 5, breaking the conversational illusion and confusing users.
* **Approaches Considered:**
  * **Approach A (Server-Side Throttle):** Slow down LLM token streaming on the server to match audio speed.  
    *Why Rejected:* Increases server resource hold time, defeats Groq's high-speed inference, and delays downstream TTS synthesis.
  * **Approach B (Artificial Word Timers / `setTimeout`):** Calculate average WPM and trigger word timeouts.  
    *Why Rejected:* Fragile and un-synced. Audio buffering, pauses, and variable pitch/rate cause drift; text gradually lags behind or races ahead of the actual audio.
  * **Approach C (Audio Context Time-Synchronized Pacing — CHOSEN):**  
    Enqueued `{ blob, text }` tuples into `useAudioPlayback.js`. Inside the active 60fps `requestAnimationFrame` loop, tracked exact audio playback position: `ratio = audio.currentTime / audio.duration`. Progressively revealed words precisely when the audio cursor hit their timestamp. Guaranteed that transcript generation matches spoken audio in real time with zero drift.
* **Codebase Reference:** [`frontend/src/hooks/useAudioPlayback.js`](file:///c:/Users/bharg/python%20work/Voice%20AI%20prototype/frontend/src/hooks/useAudioPlayback.js) & [`frontend/src/hooks/useVoicePipeline.js`](file:///c:/Users/bharg/python%20work/Voice%20AI%20prototype/frontend/src/hooks/useVoicePipeline.js)

---

### [P-14] Acoustic Echo Feedback Self-Interruption (Voice Cut-off Loop)

* **Problem Statement:**  
  During continuous hands-free voice conversation, the assistant's voice playing through laptop speakers was picked up by the microphone. Although `onSpeechStart` was guarded, when the speaker audio paused or ended, Silero VAD fired `onSpeechEnd`. Because the pipeline state was `'speaking'`, `onSpeechEnd` triggered `ws.interrupt()` and `audioPlayback.stop()`, causing the AI voice response to abruptly cut off mid-speech.
* **Approaches Considered:**
  * **Approach A (Pure Push-To-Talk):** Disable continuous hands-free voice mode and require holding a physical key to talk.  
    *Why Rejected:* Breaks the fluid, natural conversational voice UX.
  * **Approach B (Software Acoustic Echo Cancellation Filter):** Apply custom client DSP echo subtraction filters.  
    *Why Rejected:* High CPU overhead in JavaScript, inconsistent cross-platform microphone latency, and residual phase cancelation distortion.
  * **Approach C (State-Aware VAD Suppression & Orb Barge-In — CHOSEN):**  
    1. Pauses the neural VAD listener (`vad.pause()`) when assistant playback starts (`onStart`), and resumes it (`vad.resume()`) when playback concludes (`onEnd`).
    2. Enforced strict state guards in `onSpeechStart` and `onSpeechEnd` to immediately return and ignore audio events when `state === 'speaking'`.
    3. Retained instantaneous, zero-latency user barge-in anytime via a single tap on the central Voice Orb.
* **Codebase Reference:** [`frontend/src/hooks/useVoicePipeline.js`](file:///c:/Users/bharg/python%20work/Voice%20AI%20prototype/frontend/src/hooks/useVoicePipeline.js)

---

### [P-15] Chromium Streaming MP3 `Infinity` Duration & Hardware Clock Synchronization

* **Problem Statement:**  
  Edge-TTS streams raw MP3 frames without TLEN or Xing headers. When Chrome loads such in-memory blobs via `new Audio(blobUrl)`, it sets `audio.duration` to `Infinity` because it treats the blob as an unbounded stream. Consequently, `isFinite(audio.duration)` evaluated to `false`, causing duration calculations to yield `0`. The 60fps word pacing loop could not interpolate progress, and upon chunk completion or auto-play catch, the entire sentence text dumped onto the screen in a single frame.
* **Approaches Considered:**
  * **Approach A (Server-Side MP3 Tag Injection):** Repackage and inject MP3 Xing/ID3 header frames with fixed duration before streaming.  
    *Why Rejected:* Adds latency overhead and CPU strain on the backend for every sentence chunk.
  * **Approach B (Web Audio `decodeAudioData` & Hardware Audio Clock — CHOSEN):**  
    Decoded incoming audio blobs directly into native Web Audio `AudioBuffer` objects via `ctx.decodeAudioData()`. `audioBuffer.duration` provides the mathematically exact PCM duration in seconds. Played audio through `AudioBufferSourceNode` routed into the shared `AnalyserNode`, and tracked progress against Web Audio's monotonic hardware clock: `(ctx.currentTime - startTime) / duration`. Guaranteed exact word pacing synchronized with the sound coming out of the physical speakers.
* **Codebase Reference:** [`frontend/src/hooks/useAudioPlayback.js`](file:///c:/Users/bharg/python%20work/Voice%20AI%20prototype/frontend/src/hooks/useAudioPlayback.js)

---

### [P-16] Rigid Volume Gating Flapping & Perceptual Compression

* **Problem Statement:**  
  Inside `VoiceOrb.jsx`, the visual speech detection state (`isUserSpeaking`) was originally coupled to a rigid scalar volume threshold (`volume > 0.12` or `volume > 0.25`). Because natural human speech contains unvoiced consonants (*s*, *th*, *p*, *t*), natural vocal inflections, and brief syllable transitions where acoustic energy drops below the gate, evaluating raw volume per-frame caused severe visual fluttering/strobe-flapping (rapidly oscillating between blue *Listening* and purple *User Speaking* mid-sentence). Furthermore, raising the threshold to `0.25` caused whispered or soft-spoken input to be visually ignored, while linear scaling (`volume * 65`) failed to match logarithmic human hearing, leaving normal conversational vocal energy ($0.15 - 0.35$) feeling visually compressed, stiff, and insensitive.
* **Approaches Considered:**
  * **Approach A (Linear Noise Gate Tuning):** Incrementally adjust the static volume cutoff threshold between 0.12 and 0.25.  
    *Why Rejected:* A fundamental binary trade-off. Lower thresholds flap from background room hum (AC, fans, typing clicks); higher thresholds fail to register soft voices or whispers. Neither eliminates inter-syllable flutter.
  * **Approach B (Client-Side Audio Peak RMS Smoothing Only):** Apply an Exponential Moving Average (EMA) filter directly on the raw RMS audio stream.  
    *Why Rejected:* Dampens rapid drops but still cannot distinguish non-speech noise bursts (clapping, keyboard clatter, heavy breathing) from genuine human vocal cord formants.
  * **Approach C (Decoupled Neural State + Visual Hysteresis + Non-Linear Perceptual Scaling — CHOSEN):**  
    1. **Decouple Semantic State from Magnitude:** Delegated the authoritative speech detection state exclusively to Silero VAD's neural model (`onSpeechStart` $\rightarrow$ `isUserSpeaking = true`, `onSpeechEnd` $\rightarrow$ `isUserSpeaking = false`). Silero's built-in pause forgiveness (`redemptionFrames: 24` / ~768ms) guarantees that the visual aura remains stably engaged throughout natural pauses across an entire spoken sentence.  
    2. **Visual Decay Hysteresis:** Maintained a 250ms–300ms hold-time on visual state transitions to absorb micro-dips between syllables without strobe flashing.  
    3. **Non-Linear Perceptual Curve:** Applied square-root scaling `Math.sqrt(volume)` to the equalizer bars and orb halo. Conversational speech ($0.15 - 0.35$) is dynamically lifted into the lively $0.38 - 0.59$ visual sweet spot, ensuring whispers and normal speech feel energetic while loud speech is smoothly compressed without clipping.
* **Codebase Reference:** [`frontend/src/components/VoiceOrb.jsx`](file:///c:/Users/bharg/python%20work/Voice%20AI%20prototype/frontend/src/components/VoiceOrb.jsx) & [`frontend/src/hooks/useVoicePipeline.js`](file:///c:/Users/bharg/python%20work/Voice%20AI%20prototype/frontend/src/hooks/useVoicePipeline.js)

---

### [P-17] Monolithic Hook Bloat & Transport Redundancy (`useVoicePipeline` Over-Engineering)

* **Problem Statement:**  
  [`useVoicePipeline.js`](file:///c:/Users/bharg/python%20work/Voice%20AI%20prototype/frontend/src/hooks/useVoicePipeline.js) expanded to over 540 lines of code, transforming from a lean audio orchestration utility into an entangled monolith. This architectural drift accumulated across three developmental iterations:
  1. **Dual Network Transport Redundancy:** The hook retained ~75 lines of legacy HTTP fallback logic (`api.transcribe`, `api.streamChat`, `AbortController`, manual audio slicing) originally written for stateless REST communication, despite the application standardizing on full-duplex WebSocket streaming.
  2. **Violation of Single Responsibility:** Real-time audio hardware orchestration (microphone capture, VAD, Web Audio buffers) was tightly coupled with relational database session persistence (`startNewSession`, `loadSession`, `api.createConversation`, `api.getConversation`).
  3. **State Mirroring Duplication:** To avoid stale closures across asynchronous WebSocket callbacks, VAD event listeners, and Web Audio hardware loops, multiple variables (`isVoiceMode`, `isMuted`, `state`, `activeSessionId`) were mirrored simultaneously across both React `useState` and `useRef`.
  The result was high cognitive overhead, fragile state synchronization, and increased risk of regressions when tuning real-time audio turn-taking.
* **Approaches Considered:**
  * **Approach A (Status Quo Monolith with In-Place Dead Code Pruning):** Retain all logic inside `useVoicePipeline.js` and only delete small unused variables or metrics.  
    *Why Rejected:* Fails to address the underlying architectural defect. The audio pipeline remains directly bound to SQLite REST calls, perpetuating high file length (~470+ lines) and making isolated testing or maintenance of audio transport difficult.
  * **Approach B (Hyper-Granular Micro-Hooks Decomposition):** Split the pipeline into 6+ micro-hooks (`useMicStream`, `useBargeIn`, `useWebSocketTransport`, `useTurnTaking`, `useMuteState`, `useSessionSync`).  
    *Why Rejected:* Introduced severe hook-orchestration overhead ("hook soup"). Managing real-time conversational audio requires atomic, zero-latency coordination between microphone input, barge-in cancellation, and playback queues; splitting these across multiple decoupled hooks introduced race conditions and complex cross-hook dependency graphs.
  * **Approach C (Layered Separation of Concerns: Lean WebSocket Conductor + Extracted Session Persistence — CHOSEN):**  
    1. **Purge Legacy HTTP Streaming:** Completely remove the dead 75-line HTTP fallback, enforcing the robust, low-latency WebSocket connection as the single source of truth for conversational audio streaming.
    2. **Decouple Database Persistence:** Extract session management (`createConversation`, `loadSession`, `messages` state) out of the audio pipeline into [`App.jsx`](file:///c:/Users/bharg/python%20work/Voice%20AI%20prototype/frontend/src/App.jsx) or a focused `useSession` store.
    3. **Focus on Real-Time Audio Conductor:** Retain `useVoicePipeline` purely as a conductor orchestrating three distinct layers: Input ([`useVAD.js`](file:///c:/Users/bharg/python%20work/Voice%20AI%20prototype/frontend/src/hooks/useVAD.js)), Transport (`wsRef` bidirectional streaming), and Output ([`useAudioPlayback.js`](file:///c:/Users/bharg/python%20work/Voice%20AI%20prototype/frontend/src/hooks/useAudioPlayback.js) Web Audio playback and barge-in).  
    Reduces `useVoicePipeline.js` from 544 lines to ~200 lines (~60% reduction in complexity), restores single-responsibility boundaries, and eliminates dual-transport technical debt.
* **Codebase Reference:** [`frontend/src/hooks/useVoicePipeline.js`](file:///c:/Users/bharg/python%20work/Voice%20AI%20prototype/frontend/src/hooks/useVoicePipeline.js), [`frontend/src/hooks/useSession.js`](file:///c:/Users/bharg/python%20work/Voice%20AI%20prototype/frontend/src/hooks/useSession.js) & [`frontend/src/App.jsx`](file:///c:/Users/bharg/python%20work/Voice%20AI%20prototype/frontend/src/App.jsx)

---

### [P-18] Deaf Assistant During Audio Playback (Voice Barge-In Blockade)

* **Problem Statement:**  
  When the AI assistant is playing its spoken response, conversational voice barge-in **does not work properly**; the system ignores human speech until the assistant finishes talking.  
  Although interruption handler functions (`interrupt()`, `cancel_active_task()`, `audioPlayback.stop()`) have been created across the stack, full voice-activated interruption is blocked by the echo-prevention mechanism installed to solve [P-14] (Acoustic Echo Feedback Self-Interruption):
  1. [`frontend/src/hooks/useVoicePipeline.js:62`](file:///c:/Users/bharg/python%20work/Voice%20AI%20prototype/frontend/src/hooks/useVoicePipeline.js#L62): `vadRef.current?.pause()` is explicitly invoked inside `audioPlayback.onStart`. The moment the assistant starts playing audio through speakers, the microphone's Silero VAD is paused (`micVad.pause()`), making the browser microphone completely deaf to the user.
  2. [`frontend/src/hooks/useVAD.js:180`](file:///c:/Users/bharg/python%20work/Voice%20AI%20prototype/frontend/src/hooks/useVAD.js#L180): Inside `MicVAD`, `onSpeechEnd` immediately exits early via `if (isMutedRef.current) return`, discarding all microphone input while playback is active.
  3. [`frontend/src/hooks/useVoicePipeline.js:75`](file:///c:/Users/bharg/python%20work/Voice%20AI%20prototype/frontend/src/hooks/useVoicePipeline.js#L75): `vadRef.current?.resume()` is only executed inside `audioPlayback.onEnd`, meaning the mic listener remains paused for the entire duration of the assistant's speech.
  4. **Click-to-Interrupt Race Conditions:** Even when the user manually clicks the Voice Orb to trigger `interrupt()`, already in-flight sentence chunks over the WebSocket and queued Web Audio buffers can cause brief stutter before the cutoff takes full effect.
* **Approaches Evaluated:**
  * **Approach A (Unconditional VAD Unpause & Naive Speech Interrupt):** Remove `vad.pause()` and trigger `interrupt()` immediately on `onSpeechStart`.  
    *Why Rejected:* Causes severe regression [P-14]. On laptops without headphones, the assistant's voice from speakers leaks into the microphone, causing the AI to trigger `onSpeechStart` and cut its own speech off after 100–300ms (self-interruption loop).
  * **Approach B (Status Quo — Mic Deaf During Playback):** Keep the microphone deaf during playback via `vadRef.current?.pause()`.  
    *Trade-off:* Guarantees 100% echo immunity on all hardware, but completely blocks voice-driven barge-in.
  * **Approach C (Asymmetric Dual-Threshold Full-Duplex VAD & Echo Guard Window — FUTURE RFC):**  
    1. **Full-Duplex VAD with Hardware AEC:** Keep Silero VAD running continuously during audio playback (remove `vad.pause()`), relying on browser-native `echoCancellation: true` to suppress linear speaker bleed.
    2. **Acoustic Startup Guard (400ms Debounce):** Discard speech onset triggers occurring within the first 400ms of assistant audio to absorb speaker startup energy and room reflections.
    3. **Asymmetric Speech Energy/Probability Gate:** While `state === 'speaking'`, elevate the speech trigger criteria (e.g., require sustained speech frames $> 18$ / ~576ms and volume $> 0.28$) so residual speaker leakage is ignored while direct, close-proximity human vocal cord formants confidently trigger `ws.interrupt()` and `audioPlayback.stop()`.
* **Codebase Reference:** [`frontend/src/hooks/useVoicePipeline.js`](file:///c:/Users/bharg/python%20work/Voice%20AI%20prototype/frontend/src/hooks/useVoicePipeline.js), [`frontend/src/hooks/useVAD.js`](file:///c:/Users/bharg/python%20work/Voice%20AI%20prototype/frontend/src/hooks/useVAD.js), [`frontend/src/App.jsx`](file:///c:/Users/bharg/python%20work/Voice%20AI%20prototype/frontend/src/App.jsx), and [`backend/main.py`](file:///c:/Users/bharg/python%20work/Voice%20AI%20prototype/backend/main.py)  
* **Production Status:** ⚠️ **ACTIVE KNOWN LIMITATION (PARTIAL IMPLEMENTATION).** The current codebase maintains `vadRef.current?.pause()` in `useVoicePipeline.js` to ensure zero feedback loops. As a result, **voice-activated barge-in is currently NOT functioning properly** and remains an open engineering item for future hardware-calibrated AEC.

---

### [P-19] Loud Speaker Acoustic Saturation & Microphone Masking (TTS Overpowering Human Voice)

* **Problem Statement:**  
  When Microsoft Edge-TTS audio plays through laptop or desktop speakers, the output volume is extraordinarily loud (normalized at 0 dBFS full scale) and directly routed to `ctx.destination` without an intermediate `GainNode`. This physical proximity between speakers and the built-in laptop microphone causes three severe acoustic breakdown mechanisms:
  1. **Acoustic Masking / Negative SNR:** Speaker output produces 80–85 dBA of acoustic sound pressure directly at the microphone capsule (located 1–2 inches away), while the human voice 1 meter away produces only 55–65 dBA. The resulting -20 dB Signal-to-Noise Ratio (SNR) physically drowns out the human vocal sound waves.
  2. **Destructive AGC Clamping:** The browser's native `autoGainControl: true` detects the roaring speaker output and aggressively clamps the microphone analog/digital preamp gain down by 20–30 dB to prevent clipping. When the user attempts to speak over the AI, the microphone's sensitivity is clamped so low that the human voice literally cannot register.
  3. **Silero VAD Saturation:** The neural Silero VAD model is flooded by the loud speaker audio frames, making it impossible to separate genuine human voice formants from the speaker's acoustic reflections.
* **Approaches Considered:**
  * **Approach A (Hardware Headphone Enforcement):** Mandate using headphones or earbuds for conversation.  
    *Why Rejected:* Unacceptable friction for hands-free casual use; users expect a conversational voice AI to operate seamlessly through default laptop hardware.
  * **Approach B (Complex DSP Dynamic Ducking & Audio Curves):**  
    Build a dynamic audio ducking engine with scheduled exponential volume ramps and real-time noise tracking.  
    *Why Rejected:* Excessive engineering overhead, hard to debug, and adds needless complexity to React hooks.
  * **Approach C (Lean 2-Step Fix: Edge-TTS Native Volume Calibration + Unpaused VAD):**  
    1. **Native TTS Output Attenuation:** Pass `volume="-30%"` directly to `edge_tts.Communicate(text, voice=chosen_voice, volume="-30%")` in [`backend/services/tts.py`](file:///c:/Users/bharg/python%20work/Voice%20AI%20prototype/backend/services/tts.py). This is a native 1-parameter change that comfortably lowers speaker loudness at the source without adding any frontend audio math or state machines.
    2. **Unpaused VAD & Direct Interruption:** Remove `vad.pause()` from `audioPlayback.onStart`, and when `onSpeechStart` detects voice while `state === 'speaking'`, immediately call `ws.interrupt()` and `audioPlayback.stop()`.
* **Codebase Reference:** [`backend/services/tts.py`](file:///c:/Users/bharg/python%20work/Voice%20AI%20prototype/backend/services/tts.py) & [`frontend/src/hooks/useVoicePipeline.js`](file:///c:/Users/bharg/python%20work/Voice%20AI%20prototype/frontend/src/hooks/useVoicePipeline.js)  
* **Production Status:** Evaluated & Archived. Standard unattenuated output is maintained with P-14 state-aware suppression preventing speaker acoustic masking.

---

## Upcoming Architectural Enhancements (RFC Backlog)

### [RFC-01] Per-Session Working Memory & Conversational Context Cache

* **Problem / Opportunity:**  
  Currently, [P-12] applies a sliding-window context buffer: `messages.extend(history[-12:])`. While this strictly guarantees $O(1)$ token cost and avoids Groq context overflow, the assistant loses long-range recall of exact statements, specific user instructions, or technical terminology uttered earlier in prolonged dialogues (turns $> 12$).
* **Proposed Architecture (Context Cache Layer):**
  1. **In-Memory Per-Chat Context Store:**  
     Maintain a lightweight in-memory cache keyed by `conversation_id`:
     ```python
     class ConversationMemoryCache:
         def __init__(self):
             self._cache: dict[str, list[dict]] = {}
     ```
  2. **Salient Fact & Utterance Extraction:**  
     At the end of each dialogue turn, extract key entities, spoken facts, or exact terms into an ephemeral working memory summary block.
  3. **Dynamic System Context Injection:**  
     Inject the condensed memory block directly into the system prompt:
     ```
     [Working Memory for Active Session]
     - User stated: Prefers concise answers in bullet points.
     - Previously discussed: Quantum entanglement, Bell tests.
     - Assistant earlier affirmed: "Entanglement does not transmit FTL signals."
     ```
  4. **Latency & Cost Profile:**  
     $O(1)$ lookup time, zero disk contention, preserves sub-800ms TTFA while giving the assistant long-term memory across 50+ turns.
* **Status:** Upcoming Feature Candidate (Planned for Phase 9 Roadmap).




