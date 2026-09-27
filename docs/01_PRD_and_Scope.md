# 01. Product Requirements Document (PRD) & Scope

**Project Name:** Conversational Voice AI Prototype  
**Target Milestone:** Production-Hardened Real-Time Full-Duplex Voice Assistant  
**Document Version:** 1.0.0  
**Status:** Approved Specification  

---

## 1. Executive Summary & Value Proposition

Traditional voice assistants (e.g., standard Siri, Alexa, or legacy phone IVRs) operate on a **half-duplex, turn-based request-response paradigm**: the user speaks, taps a button or waits for an arbitrary silence timeout, uploads a monolithic audio recording, waits 3–6 seconds for backend batch processing, and finally listens to an un-interruptible audio response.

The **Conversational Voice AI Prototype** solves this conversational barrier by implementing a **low-latency (< 800ms Time-To-First-Audio), full-duplex streaming pipeline**. By running edge-side neural Voice Activity Detection (VAD) in the browser, streaming audio over persistent WebSockets, processing speech-to-text in-memory, chunking LLM token streams into natural clauses, and pre-synthesizing audio in parallel, the system delivers natural, fluid, and interruptible human-machine dialogue.

---

## 2. User Personas & Core Journeys

### Persona A: The Hands-Free Knowledge Worker
* **Need:** Wants to query technical documentation, brainstorm architecture, or dictate code notes without touching a keyboard or mouse.
* **Journey:**
  1. Opens the application in any modern browser.
  2. Clicks the **Voice Orb** once to grant microphone permissions and activate Voice Mode.
  3. Speaks naturally. The Voice Orb illuminates white during speech and pulses purple during processing.
  4. The assistant begins speaking the first sentence within 800ms while subtitle text streams word-by-word in lockstep with the audio.
  5. The user speaks over the assistant mid-sentence to clarify an instruction. The assistant cuts off audio in under 20ms and begins listening immediately.

### Persona B: The Multilingual Communicator
* **Need:** Speaks in mixed language contexts (e.g., English, Hindi, or conversational code-switching).
* **Journey:**
  1. User speaks in Hindi: *"नमस्ते, क्या आप मुझे क्वांटम कंप्यूटिंग के बारे में बता सकते हैं?"*
  2. Groq Whisper detects the language automatically without manual dropdown toggling.
  3. The LLM responds in Hindi. The sentence tokenizer recognizes Devanagari Poorna Viram punctuation (`।`) and streams audio chunks synthesized with an authentic regional voice (`hi-IN-SwaraNeural`).

---

## 3. Core Functional Requirements

| Requirement ID | Module | Feature Description | Acceptance Criteria |
| :--- | :--- | :--- | :--- |
| **FR-01** | Client Audio | Edge-side Neural Voice Activity Detection (VAD) | Runs Silero v5 ONNX locally in a Web Worker; detects vocal formants; isolates speech from ambient room hum. |
| **FR-02** | Client Audio | Hardware Acoustic Echo Cancellation (AEC) | Enforces browser AEC constraints; dynamically pauses VAD during assistant playback to prevent speaker echo loops. |
| **FR-03** | Transport | Full-Duplex WebSocket Streaming Gateway | Bidirectional JSON/binary channel over `/ws/conversation`; enforces strict `Origin` header validation against CSWSH. |
| **FR-04** | STT | In-Memory Speech Transcription | Converts audio bytes directly to text via Groq Whisper Large v3 Turbo in memory (`io.BytesIO`); total stage latency < 200ms. |
| **FR-05** | LLM | Pipelined Sentence-Level Token Chunking | Splits streaming token output into grammatically complete clauses across Latin and Non-Latin scripts (Devanagari, CJK). |
| **FR-06** | TTS | Concurrent Sentence-Level Audio Synthesis | Synthesizes sentence $N+1$ in parallel while sentence $N$ is playing out of client speakers via Edge-TTS. |
| **FR-07** | Client Playback | Web Audio Singleton with Hardware Clock Subtitles | Single module-scoped `AudioContext` routing to `AnalyserNode`; subtitles synchronize word-by-word with `ctx.currentTime`. |
| **FR-08** | Interruption | Sub-Millisecond Conversational Barge-In | Immediate audio cutoff (<20ms); aborts active backend generator; snapshots partial reply with `[interrupted]`. |
| **FR-09** | Persistence | SQLite Write-Ahead Logging (WAL) Storage | Stores session metadata, user inputs, and assistant turns; enforces foreign keys and cascade deletions under concurrent load. |
| **FR-10** | UI / Visuals | 60fps Dynamic Voice Orb Visualizer | Real-time Fast Fourier Transform (FFT) analysis driving CSS scale and glow transforms without canvas lag. |

---

## 4. Latency Budget & Non-Functional Requirements (NFRs)

```
Target Time-To-First-Audio (TTFA) Budget:
┌─────────────────────────────────────────────────────────────┬──────────┐
│ Pipeline Stage                                              │ Budget   │
├─────────────────────────────────────────────────────────────┼──────────┤
│ Client VAD End-of-Speech Detection Delay (Hysteresis Window)│ 400 ms   │
│ Client Audio Encoding & WebSocket Upstream Transmission     │ 40 ms    │
│ Groq Whisper Large v3 Turbo In-Memory STT                   │ 180 ms   │
│ Groq LLM First Sentence Token Generation (First 6–10 tokens)│ 70 ms    │
│ Edge-TTS First Sentence Audio Synthesis                     │ 90 ms    │
│ Client Audio Decode & Web Audio Buffer Start                │ 20 ms    │
├─────────────────────────────────────────────────────────────┼──────────┤
│ TOTAL TIME-TO-FIRST-AUDIO (TTFA)                            │ ~800 ms  │
└─────────────────────────────────────────────────────────────┴──────────┘
```

### Performance & Resilience Requirements:
1. **Zero Audio Glitches:** Inter-sentence playback gap must be under 30ms (imperceptible to human ear).
2. **Audio Context Ceiling Defense:** Must never exceed the browser limit of 6 hardware `AudioContext` instances regardless of session length.
3. **Memory Footprint:** Client heap memory must remain below 120MB during sustained 30-minute sessions.
4. **Security & CSWSH:** All WebSocket handshakes must validate client Origin headers against whitelist rules (`ALLOWED_ORIGINS`).
5. **Database Concurrency:** SQLite must execute in WAL mode with a 15-second busy timeout to eliminate `OperationalError: database is locked`.

---

## 5. Scope Boundaries

### In-Scope (Production Prototype):
* Browser-based client supporting Chrome, Edge, Safari, and Firefox.
* Edge-side neural voice activity detection via WebAssembly (`@ricky0123/vad-web`).
* Server gateway built with FastAPI and WebSockets.
* In-memory cloud STT using Groq Whisper.
* Low-latency streaming LLM orchestration using Groq LPUs (`qwen/qwen3.8-27b` or `llama-3.3-70b-versatile`).
* Natural streaming neural TTS using Microsoft Edge TTS with automatic Hindi language voice routing.
* Local persistent conversation history in SQLite with cascade deletion.

### Out-of-Scope (Future Milestones):
* Multi-party speaker diarization (distinguishing multiple voices in the same room).
* Custom voice cloning and on-premise local TTS inference (e.g., Piper or XTTS).
* Telephony SIP/PSTN trunking (e.g., Twilio or FreeSWITCH integration).
* User authentication and role-based multi-tenant cloud databases (PostgreSQL/Supabase).
