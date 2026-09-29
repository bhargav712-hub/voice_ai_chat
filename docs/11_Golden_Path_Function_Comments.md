# 11. Golden Path Function-by-Function Single-Line Architectural Reference

> **Project:** Conversational Voice AI Prototype  
> **Scope:** Clean, high-signal single-line comments for every critical function across the 10 Golden Path files  
> **Purpose:** Technical interview cheat-sheet, rapid code-review reference, and codebase documentation  

---

## Table of Contents

1. [Client Audio Input — `frontend/src/hooks/useVAD.js`](#file-1-frontend-src-hooks-usevadjs)
2. [Client State Machine — `frontend/src/hooks/useVoicePipeline.js`](#file-2-frontend-src-hooks-usevoicepipelinejs)
3. [Client Transport — `frontend/src/services/api.js`](#file-3-frontend-src-services-apijs)
4. [Server Gateway & Socket — `backend/main.py`](#file-4-backend-mainpy)
5. [Speech-to-Text — `backend/services/stt.py`](#file-5-backend-services-sttpy)
6. [LLM Sentence Streaming — `backend/services/llm.py`](#file-6-backend-services-llmpy)
7. [Text-to-Speech Engine — `backend/services/tts.py`](#file-7-backend-services-ttspy)
8. [Client Audio Playback — `frontend/src/hooks/useAudioPlayback.js`](#file-8-frontend-src-hooks-useaudioplaybackjs)
9. [Persistence Layer — `backend/services/storage.py` & `frontend/src/hooks/useSession.js`](#file-9-backend-services-storagepy--frontend-src-hooks-usesessionjs)
10. [UI Shell & Visuals — `frontend/src/App.jsx` & `frontend/src/components/VoiceOrb.jsx`](#file-10-frontend-src-appjsx--frontend-src-components-voiceorbjsx)

---

### File 1: [`frontend/src/hooks/useVAD.js`](file:///c:/Users/bharg/python%20work/Voice%20AI%20prototype/frontend/src/hooks/useVAD.js)

```javascript
// useVAD (Master Hook)
// Manages microphone permissions with hardware echo cancellation and orchestrates the dual-engine (Silero neural + RMS fallback) voice detection.

// startVolumeAnalyser
// Measures 60fps microphone RMS volume for Orb visual reactivity and runs hands-free fallback recording if WebAssembly fails.

// startSileroVAD
// Runs the in-browser Silero v5 ONNX neural network inside a Web Worker to detect genuine vocal cords and emit 16kHz WAV speech blobs.
```

---

### File 2: [`frontend/src/hooks/useVoicePipeline.js`](file:///c:/Users/bharg/python%20work/Voice%20AI%20prototype/frontend/src/hooks/useVoicePipeline.js)

```javascript
// go(newState)
// Guardrail state machine transitioner that prevents redundant re-renders while keeping real-time audio refs synchronized with React UI state.

// connectWebSocket
// Establishes the persistent full-duplex /ws/conversation socket, routing incoming transcripts to the UI and streaming MP3 chunks into playback.

// processAudio(wavBlob)
// Filters noise clicks (<400 bytes), shifts pipeline to 'processing', and transmits the binary WAV audio blob over the WebSocket.

// enterVoiceMode
// Pre-warms the shared Web Audio context via user gesture, opens the WebSocket, and unpauses the microphone for hands-free listening.

// exitVoiceMode
// Shuts down active microphone tracks, disconnects the WebSocket, drains the audio playback queue, and resets pipeline state to 'idle'.

// interrupt
// Emergency barge-in cutoff that instantly halts local Web Audio output and sends an interrupt frame to abort backend generation.
```

---

### File 3: [`frontend/src/services/api.js`](file:///c:/Users/bharg/python%20work/Voice%20AI%20prototype/frontend/src/services/api.js)

```javascript
// createVoiceSocket
// Manages the bidirectional WebSocket connection lifecycle, handling automatic 20s keepalive pings and typed message event dispatching.

// getConversations
// Fetches all stored voice session summaries from the backend SQLite database.

// createConversation
// Pre-creates a new conversational speech session in backend storage.

// deleteConversation
// Removes a session and all its messages with cascading delete from backend SQLite.
```

---

### File 4: [`backend/main.py`](file:///c:/Users/bharg/python%20work/Voice%20AI%20prototype/backend/main.py)

```python
# websocket_conversation
# Full-duplex WebSocket endpoint defending against CSWSH and orchestrating audio transcription, LLM reasoning, and streaming TTS.

# socket_writer (Internal Worker)
# Serialized worker consuming from an asyncio.Queue to guarantee thread-safe, atomic JSON and binary packet delivery across the socket.

# run_pipeline (Internal Worker)
# Coordinates Groq Whisper STT, streaming LLM sentence extraction, Edge-TTS audio synthesis, and atomic cancellation handling for a voice turn.
```

---

### File 5: [`backend/services/stt.py`](file:///c:/Users/bharg/python%20work/Voice%20AI%20prototype/backend/services/stt.py)

```python
# _transcribe_sync
# Performs zero-disk-I/O transcription by wrapping audio bytes in an in-memory io.BytesIO stream and querying Groq Whisper large-v3-turbo.

# transcribe_audio
# Asynchronous wrapper offloading synchronous Whisper API calls to a background thread pool to prevent blocking the FastAPI event loop.
```

---

### File 6: [`backend/services/llm.py`](file:///c:/Users/bharg/python%20work/Voice%20AI%20prototype/backend/services/llm.py)

```python
# extract_sentences
# Splits streaming token buffers on universal sentence boundaries (. ! ? । 。) with lookahead protection against abbreviations and numbered lists.

# stream_sentences
# Queries Groq LPUs with a 12-turn sliding history window and yields complete sentence strings as fast as they are generated.
```

---

### File 7: [`backend/services/tts.py`](file:///c:/Users/bharg/python%20work/Voice%20AI%20prototype/backend/services/tts.py)

```python
# synthesize
# Converts text into spoken MP3 bytes entirely in memory using Edge-TTS, auto-switching neural voices for Devanagari Hindi vs English.
```

---

### File 8: [`frontend/src/hooks/useAudioPlayback.js`](file:///c:/Users/bharg/python%20work/Voice%20AI%20prototype/frontend/src/hooks/useAudioPlayback.js)

```javascript
// getSharedAudioContext
// Maintains a shared singleton AudioContext to prevent the browser's 6-hardware-context exhaustion crash during rapid streaming.

// startPlaybackLoop
// High-precision 60fps clock measuring current audio playback to drive Voice Orb volume glow and word-by-word subtitle pacing.

// _playNext
// Dequeues the next audio chunk, connects it to the shared analyser node, and chains playback continuously until the queue is drained.

// enqueue(blob, text)
// Pushes incoming sentence audio and text into the sequential queue and kicks off the playback loop if the audio engine is idle.

// stop()
// Instantly silences audio output, empties the waiting sentence queue, and resets volume levels in under 20 milliseconds.
```

---

### File 9: [`backend/services/storage.py`](file:///c:/Users/bharg/python%20work/Voice%20AI%20prototype/backend/services/storage.py) & [`frontend/src/hooks/useSession.js`](file:///c:/Users/bharg/python%20work/Voice%20AI%20prototype/frontend/src/hooks/useSession.js)

```python
# _get_connection (storage.py)
# Opens SQLite with WAL journal mode, a 15-second busy timeout, and foreign key cascades to eliminate database locking errors.

# add_message (storage.py)
# Inserts a message turn (user or assistant) linked to a session ID and updates the conversation timestamp.

# delete_conversation (storage.py)
# Removes a conversation row from SQLite, which automatically cascades to delete all associated message rows.
```

```javascript
// useSession (useSession.js)
// Decouples chat history persistence from the real-time audio pipeline, managing active session IDs in localStorage and SQLite.
```

---

### File 10: [`frontend/src/App.jsx`](file:///c:/Users/bharg/python%20work/Voice%20AI%20prototype/frontend/src/App.jsx) & [`frontend/src/components/VoiceOrb.jsx`](file:///c:/Users/bharg/python%20work/Voice%20AI%20prototype/frontend/src/components/VoiceOrb.jsx)

```javascript
// handleOrbClick (App.jsx)
// Single-action central button handler that interrupts active speech, starts voice mode, or toggles microphone mute depending on state.

// VoiceOrb (VoiceOrb.jsx)
// Renders the 60fps glowing voice marble using square-root volume scaling and state-driven color auras (listening, thinking, speaking, muted).
```

---

## 📊 Summary Quick Reference Table

| # | File | Function | Single-Line Responsibility Summary |
| :- | :--- | :--- | :--- |
| **1** | `useVAD.js` | `useVAD` | Manages microphone permissions with hardware echo cancellation and dual-engine fallback. |
| **1** | `useVAD.js` | `startVolumeAnalyser` | Measures 60fps microphone RMS volume for Orb visual reactivity with fallback recording. |
| **1** | `useVAD.js` | `startSileroVAD` | Runs in-browser Silero v5 ONNX neural network in Web Worker to emit 16kHz WAV speech blobs. |
| **2** | `useVoicePipeline.js` | `go` | State machine transitioner preventing redundant renders while syncing refs with React state. |
| **2** | `useVoicePipeline.js` | `connectWebSocket` | Establishes persistent full-duplex socket, routing transcripts to UI and MP3 chunks to audio. |
| **2** | `useVoicePipeline.js` | `processAudio` | Filters noise clicks (<400B), sets state to 'processing', and emits WAV over WebSocket. |
| **2** | `useVoicePipeline.js` | `enterVoiceMode` | Pre-warms shared AudioContext, connects WebSocket, and unpauses mic for hands-free loop. |
| **2** | `useVoicePipeline.js` | `exitVoiceMode` | Shuts down mic tracks, closes WebSocket, drains audio queue, and resets state to 'idle'. |
| **2** | `useVoicePipeline.js` | `interrupt` | Emergency barge-in cutoff halting local Web Audio and aborting backend generation tasks. |
| **3** | `api.js` | `createVoiceSocket` | Bidirectional WebSocket connection manager handling 20s keepalive pings and typed events. |
| **3** | `api.js` | `getConversations` | Fetches saved voice session history from SQLite backend. |
| **3** | `api.js` | `createConversation` | Pre-creates a new conversational voice session record in storage. |
| **3** | `api.js` | `deleteConversation` | Deletes conversation session with cascading removal of message history. |
| **4** | `main.py` | `websocket_conversation` | Full-duplex WebSocket route defending against CSWSH and coordinating STT, LLM, and TTS. |
| **4** | `main.py` | `socket_writer` | Serialized worker consuming from an `asyncio.Queue` for thread-safe atomic socket delivery. |
| **4** | `main.py` | `run_pipeline` | Coordinates Groq Whisper STT, streaming LLM, Edge-TTS synthesis, and cancellation trapping. |
| **5** | `stt.py` | `_transcribe_sync` | Zero-disk-I/O transcription wrapping audio bytes in `io.BytesIO` for Groq Whisper Turbo. |
| **5** | `stt.py` | `transcribe_audio` | Async wrapper offloading synchronous Whisper API calls to a thread pool. |
| **6** | `llm.py` | `extract_sentences` | Splits token streams on universal punctuation (. ! ? । 。) protecting abbreviations & numbers. |
| **6** | `llm.py` | `stream_sentences` | Queries Groq LPUs with a 12-turn sliding window and yields complete sentence strings. |
| **7** | `tts.py` | `synthesize` | Converts text to MP3 bytes in memory with Edge-TTS, auto-switching for Hindi vs English. |
| **8** | `useAudioPlayback.js` | `getSharedAudioContext` | Maintains shared singleton AudioContext preventing browser 6-context hardware crash limit. |
| **8** | `useAudioPlayback.js` | `startPlaybackLoop` | 60fps clock measuring audio progress for Voice Orb volume glow and word subtitle pacing. |
| **8** | `useAudioPlayback.js` | `_playNext` | Dequeues next chunk, connects to shared analyser, and chains playback until queue drains. |
| **8** | `useAudioPlayback.js` | `enqueue` | Pushes incoming sentence audio into queue and starts playback if engine is idle. |
| **8** | `useAudioPlayback.js` | `stop` | Instantly silences audio output, flushes queue, and resets volume in under 20ms. |
| **9** | `storage.py` | `_get_connection` | Opens SQLite in WAL mode with 15s timeout and foreign keys to prevent database locks. |
| **9** | `storage.py` | `add_message` | Inserts message turn (user/assistant) linked to session and updates timestamps. |
| **9** | `storage.py` | `delete_conversation` | Deletes conversation row with cascading foreign key deletion of message rows. |
| **9** | `useSession.js` | `useSession` | Decouples chat history persistence from real-time audio, managing IDs in localStorage. |
| **10** | `App.jsx` | `handleOrbClick` | Single-action button handling barge-in interrupt, starting voice mode, or toggling mute. |
| **10** | `VoiceOrb.jsx` | `VoiceOrb` | 60fps glowing voice marble using square-root volume scaling and state-driven color auras. |
