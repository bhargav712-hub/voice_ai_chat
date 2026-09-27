# 08. Coding Exercises, Drills & Architectural Challenges

**Project:** Conversational Voice AI Prototype  
**Format:** 24 Tiered Technical Drills mapped to the 8 Curriculum Phases  
**Difficulty Tiers:** Level 1 (Foundation) | Level 2 (Implementation) | Level 3 (Hardening) | Level 4 (Architect)  

---

## Phase 1 & 2: Audio Capture & Neural VAD

### Drill 1.1: Audio Buffer Size Math (Level 1)
* **Problem:** A user speaks into a microphone sampled at 16,000 Hz, 16-bit linear PCM, mono channel.
  * How many bytes are generated per second of voice?
  * If Silero VAD evaluates chunks every 32 milliseconds, how many audio samples are in each chunk?
* **Hint:** $1 \text{ sample} = 2 \text{ bytes}$ (16-bit). $\text{Bytes/sec} = 16000 \times 2 \times 1 = 32,000 \text{ bytes/sec}$.
* **Expected Answer:** 32,000 bytes/sec; 512 samples per 32ms chunk.

### Drill 1.2: VAD False Positive Gate (Level 2)
* **Problem:** Ambient typing on a mechanical keyboard is triggering premature VAD speech starts.
* **Task:** In `frontend/src/hooks/useVAD.js`, tune `positiveSpeechThreshold` and `minSpeechFrames` to reject transient mechanical keyboard spikes while maintaining responsive vocal detection.
* **Verification:** Run the app; typing continuously must not illuminate the Voice Orb or trigger speech events.

### Drill 1.3: The Silent Fallback Dilemma (Level 3)
* **Problem:** If ONNX WebAssembly fails to load (e.g. strict corporate firewall or older Safari), the system falls back to energy-based RMS. Explain why `onSpeechEnd(null)` breaks `useVoicePipeline.js` and implement a standalone `MediaRecorder` capture fallback.

---

## Phase 3 & 4: Transport & In-Memory STT

### Drill 2.1: CSWSH Vulnerability Simulation (Level 2)
* **Problem:** Write an automated `pytest` test that attempts to connect to `ws://localhost:8000/ws/conversation` with header `Origin: http://malicious-site.com`.
* **Task:** Verify that the connection is rejected immediately with WebSocket status code `1008 (Policy Violation)` without accepting any frames.

### Drill 2.2: The Producer-Consumer Queue Race (Level 3)
* **Problem:** Why does calling `await websocket.send_json(...)` from two concurrent tasks trigger `RuntimeError` in Starlette?
* **Task:** Refactor a direct socket writer to use an internal `asyncio.Queue` and benchmark the throughput under 50 simultaneous mock sentence chunks.

### Drill 2.3: Zero-Disk Buffer Benchmark (Level 3)
* **Problem:** Measure the latency difference between writing a 2MB WAV file to disk via `tempfile.NamedTemporaryFile` vs. wrapping the bytes in `io.BytesIO`.
* **Expected Outcome:** In-memory pointer handoff completes in < 1ms, whereas disk I/O requires 20–80ms depending on host storage speed.

---

## Phase 5 & 6: Sentence Tokenization & Concurrent TTS

### Drill 3.1: The Multilingual Boundary Test (Level 2)
* **Problem:** Given the following raw streaming tokens from the LLM:
  `["नमस्ते", " ", "आप", " ", "कैसे", " ", "हैं।", " ", "मैं", " ", "आपकी", " ", "सहायता", " ", "करूँ?"]`
* **Task:** Write a Python test demonstrating that `extract_sentences()` emits two distinct clauses:
  1. `"नमस्ते आप कैसे हैं।"`
  2. `"मैं आपकी सहायता करूँ?"`

### Drill 3.2: Abbreviation Preservation (Level 2)
* **Problem:** Prevent `extract_sentences()` from splitting prematurely on `"Dr. Watson visited at 3.14 PM. It was cold."`.
* **Verification:** Must yield exactly 2 sentences, preserving `"Dr. Watson"` and decimal numbers intact.

### Drill 3.3: The 6-Context Crash Reproduction (Level 3)
* **Problem:** Write a 10-line vanilla JS script in browser DevTools that creates `new AudioContext()` inside a loop.
* **Task:** Observe the exact browser error thrown on iteration 7. Refactor the script to use a module-scoped singleton with a reusable `AnalyserNode`.

### Drill 3.4: Hardware Clock Subtitle Interpolation (Level 4)
* **Problem:** Calculate the highlighted word index for subtitle display using `ctx.currentTime` and sentence duration, without using imprecise `setInterval` timers.

---

## Phase 7 & 8: Barge-In & Production Durability

### Drill 4.1: Atomic Barge-In Interceptor (Level 3)
* **Problem:** During sentence 2 of 5, the user clicks the Voice Orb to interrupt.
* **Task:** Trace the lifecycle of `asyncio.CancelledError` in `backend/main.py`. Ensure the partial text spoken is preserved with `" [interrupted]"` and saved to SQLite, preventing orphaned turns in conversation history.

### Drill 4.2: SQLite WAL Mode Concurrency Stress (Level 4)
* **Problem:** Spin up 10 concurrent async workers writing user messages to `data/conversations.db` while 5 workers read full conversation histories.
* **Verification:** Zero `sqlite3.OperationalError: database is locked` exceptions; all 15 workers complete successfully.

---

## Phase 9 & Containerization: Working Memory & Docker

### Drill 5.1: Session Cache Eviction Under Load (Level 3)
* **Problem:** Write a pytest unit test for `SessionMemoryCache` simulating 600 concurrent conversations. Verify that when cache size exceeds 500, the oldest session is evicted cleanly without blocking the async event loop.

### Drill 5.2: Docker Container Health Check Probe (Level 4)
* **Problem:** In `docker-compose.yml`, configure a health check probe that queries `/api/health`. Write a test script verifying that Docker Compose reports the container as `healthy` within 15 seconds of startup, and restarts it if the backend port becomes unresponsive.

### Drill 5.3: Recall Past Spoken Utterances Across 20 Turns (Level 4)
* **Problem:** In a mock conversation lasting 25 turns, prompt the assistant: *"What did you say was the speed of light earlier?"*
* **Task:** Verify that the system prompt receives the injected `SessionMemory` block from `cache.py` and answers correctly, even though the turn where it was stated fell outside the 12-turn sliding history window.
