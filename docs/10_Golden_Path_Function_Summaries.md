# 10. Golden Path Function-by-Function Architectural Summaries

**Project:** Conversational Voice AI Prototype  
**Scope:** Plain-English, Human-Centric Behavioral & Architectural Reference for Every Function Across the 10 Golden Path Files  
**Target Audience:** Engineering Leads, System Architects, and Technical Interviewers  

---

## Table of Contents

1. [Client Audio Input — `frontend/src/hooks/useVAD.js`](#1-client-audio-input--usevadcjs)
   * [`startVolumeAnalyser`](#startvolumeanalyser)
   * [`startSileroVAD`](#startsilerovad)
   * [`useVAD` (Master Hook)](#usevad-master-hook)
2. [Client State Machine — `frontend/src/hooks/useVoicePipeline.js`](#2-client-state-machine--usevoicepipelinejs)
   * [`go(newState)`](#gonewstate)
   * [`connectWebSocket`](#connectwebsocket)
   * [`processAudio(wavBlob)`](#processaudiowavblob)
   * [`enterVoiceMode` / `exitVoiceMode`](#entervoicemode--exitvoicemode)
   * [`interrupt`](#interrupt)
3. [Client Transport — `frontend/src/services/api.js`](#3-client-transport--apijs)
   * [`createVoiceSocket`](#createvoicesocket)
   * [`getConversations` / `createConversation` / `deleteConversation`](#getconversations--createconversation--deleteconversation)
4. [Server Gateway & Socket — `backend/main.py`](#4-server-gateway--socket--mainpy)
   * [`websocket_conversation`](#websocket_conversation)
   * [`socket_writer` (Internal Worker)](#socket_writer-internal-worker)
   * [`run_pipeline(user_audio_bytes)` (Internal Worker)](#run_pipelineuser_audio_bytes-internal-worker)
5. [Speech-to-Text — `backend/services/stt.py`](#5-speech-to-text--sttpy)
   * [`_transcribe_sync(file_bytes, filename)`](#_transcribe_syncfile_bytes-filename)
   * [`transcribe_audio(file_bytes, filename)`](#transcribe_audiofile_bytes-filename)
6. [LLM Sentence Streaming — `backend/services/llm.py`](#6-llm-sentence-streaming--llmpy)
   * [`extract_sentences(buffer)`](#extract_sentencesbuffer)
   * [`stream_sentences(message, history)`](#stream_sentencesmessage-history)
7. [Text-to-Speech Engine — `backend/services/tts.py`](#7-text-to-speech-engine--ttspy)
   * [`synthesize(text, voice)`](#synthesizetext-voice)
8. [Client Audio Playback — `frontend/src/hooks/useAudioPlayback.js`](#8-client-audio-playback--useaudioplaybackjs)
   * [`getSharedAudioContext`](#getsharedaudiocontext)
   * [`startPlaybackLoop`](#startplaybackloop)
   * [`_playNext`](#_playnext)
   * [`enqueue(blob, text)` / `stop()`](#enqueueblob-text--stop)
9. [Persistence Layer — `backend/services/storage.py` & `frontend/src/hooks/useSession.js`](#9-persistence-layer--storagepy--usesessionjs)
   * [`_get_connection` (`storage.py`)](#_get_connection-storagepy)
   * [`add_message` / `delete_conversation` (`storage.py`)](#add_message--delete_conversation-storagepy)
   * [`useSession` (`useSession.js`)](#usesession-usesessionjs)
10. [UI Shell & Visuals — `frontend/src/App.jsx` & `frontend/src/components/VoiceOrb.jsx`](#10-ui-shell--visuals--appjsx--voiceorbjsx)
    * [`handleOrbClick` (`App.jsx`)](#handleorbclick-appjsx)
    * [`VoiceOrb` (`VoiceOrb.jsx`)](#voiceorb-voiceorbjsx)

---

# 1. Client Audio Input — `useVAD.js`

### `startVolumeAnalyser`

> **At a high level, `startVolumeAnalyser` is an automatic speech detection and recording system.** It listens to a microphone input, measures how loud the audio is in real time, and automatically records audio clips whenever someone speaks.

#### The 3 Core Jobs of This Function:

1. **Sets Up the Audio Pipeline:** It takes the raw microphone input (`stream`) and connects it to the browser's Web Audio API (`AnalyserNode`). This sets up a pathway to continuously inspect raw sound data coming through the microphone.
2. **Calculates Real-Time Volume for UI (~60 times per second):** Inside a continuous animation loop (`tick`), it inspects the current sound wave, calculates its overall volume using RMS, amplifies it to a $0$ to $1$ scale, and sends it to `onVolumeChange` to animate the visual Voice Orb. If muted, it skips calculation and emits $0$.
3. **Handles Hands-Free Voice Recording (Fallback VAD):**
   * **When you start talking:** If volume crosses the speech threshold, it triggers `onSpeechStart`, starts a `MediaRecorder`, and saves audio chunks every 100ms.
   * **When you stop talking:** It starts a countdown timer (`FALLBACK_SILENCE_MS`) so natural breath pauses between words don't prematurely slice your sentence.
   * **Finishing the recording:** If silence persists until the countdown ends, it packages all chunks into a `.webm` audio file and dispatches `onSpeechEnd`. If you speak before the timer expires, the countdown cancels and recording continues seamlessly.

---

### `startSileroVAD`

> **At a high level, `startSileroVAD` is a machine learning gatekeeper that runs locally inside your browser.** Instead of guessing speech based solely on loudness, it runs a miniature deep learning neural network (Silero v5 ONNX) inside a Web Worker to identify genuine human vocal cord formants.

#### The 3 Core Jobs of This Function:

1. **Loads the Neural Network into a Web Worker:** It initializes `@ricky0123/vad-web` pointing to local WebAssembly files (`/wasm/silero_vad_v5.onnx`). Because it runs in a background Web Worker thread, complex AI tensor calculations never freeze or stutter the 60fps UI.
2. **Calibrates Speech Confidence & Hysteresis:** It sets two strict boundaries: `positiveSpeechThreshold: 0.72` (requiring high confidence that vocal cords are active before starting) and `minSpeechFrames: 14` (~448ms of sustained vocal resonance). This ensures keyboard clicks, throat clearing, and desk bumps are ignored.
3. **Dispatches Pre-Trimmed 16-bit PCM Audio:**
   * **When you speak:** Fires `onSpeechStart` and buffers raw 16kHz audio frames in memory.
   * **Natural pause allowance (`redemptionFrames: 25`):** Grants ~800ms of tolerated pause time so you can think mid-sentence without being cut off.
   * **Finishing the turn:** Packages the exact speech segment into a pristine 16-bit PCM WAV Blob and passes it to `onSpeechEnd`.

---

### `useVAD` (Master Hook)

> **At a high level, `useVAD` is the audio hardware manager for the user's microphone.** It requests microphone permissions, decides whether to launch the neural Silero AI model or the volume-based fallback, and provides clean controls to start, stop, pause, or mute voice tracking.

#### The 3 Core Jobs of This Function:

1. **Acquires Microphone with Hardware Echo Cancellation:** Prompts the browser for microphone access enforcing `echoCancellation: true` and `noiseSuppression: true` to prevent laptop speakers from bleeding back into the input.
2. **Provides an Automatic Dual-Engine Strategy:** It attempts to launch the neural Silero VAD first. If the browser or corporate network blocks WebAssembly, it catches the error and silently switches to `startVolumeAnalyser` so voice functionality never crashes.
3. **Exposes External State Controls:** Returns functions (`start`, `stop`, `pause`, `resume`, `toggleMute`) allowing parent components to dynamically freeze the microphone when the assistant is speaking or when the user clicks mute.

---

# 2. Client State Machine — `useVoicePipeline.js`

### `go(newState)`

> **At a high level, `go` is the guardrail traffic controller for the entire voice session.** It ensures the app only transitions between valid states (`idle` $\rightarrow$ `listening` $\rightarrow$ `processing` $\rightarrow$ `speaking`) and keeps internal tracking references in sync with React UI re-renders.

#### The 2 Core Jobs of This Function:

1. **Prevents Redundant State Rerenders:** Checks if `stateRef.current === next`. If the app is already in the requested state, it aborts immediately to avoid triggering unnecessary layout recalculations.
2. **Synchronizes Instant References with React State:** Simultaneously updates both the immediate ref (`stateRef.current = next`) and React state (`setState(next)`), ensuring high-speed audio callbacks never read stale state while the UI smoothly reflects state changes.

---

### `connectWebSocket`

> **At a high level, `connectWebSocket` establishes the dedicated real-time hotline to the server.** It opens the WebSocket, registers handlers for all incoming server messages, and wires audio events to playback and subtitle rendering.

#### The 3 Core Jobs of This Function:

1. **Initializes the Socket Session:** Connects to `/ws/conversation`, sends an initial `init` payload with the active conversation ID and recent chat history, and sets up a 20-second heartbeat ping.
2. **Routes Server Events to Audio & Text:**
   * **On `transcript`:** Renders the user's recognized words on the screen immediately.
   * **On `sentence`:** Hands the base64 MP3 chunk to `audioPlayback.enqueue()` to begin speech playback.
   * **On `done`:** Informs the audio queue that generation is complete so it can gracefully conclude after the last chunk plays.
3. **Handles Connection Drops:** Catches socket drops and cleanly updates the error banner without leaving the UI frozen in a loading loop.

---

### `processAudio(wavBlob)`

> **At a high level, `processAudio` is the courier that packages your recorded voice and sends it to the cloud.** When you finish speaking, it validates your audio clip, puts the app into the "Thinking..." state, and dispatches your voice over the WebSocket.

#### The 2 Core Jobs of This Function:

1. **Filters Out Noise Clicks:** Inspects `wavBlob.size`. If the recording is smaller than 400 bytes (just an empty audio header from a tap or breath), it drops it and keeps listening.
2. **Encodes and Dispatches:** Shifts state to `'processing'`, converts the binary WAV Blob into a Base64 string, and emits `{"type": "audio_input", "audio": base64Data}` over the active WebSocket channel.

---

### `enterVoiceMode` / `exitVoiceMode`

> **At a high level, these functions act as the master power switch for the hands-free voice experience.** They warm up browser audio hardware, initialize network sockets, and clean up background tasks when exiting.

#### The 2 Core Jobs of These Functions:

1. **`enterVoiceMode` (Activation):** Unmutes the microphone, pre-warms the persistent Web Audio context via user gesture, establishes the WebSocket connection, and turns the Voice Orb to blue (`listening`).
2. **`exitVoiceMode` (Deactivation):** Stops microphone capture, severs the WebSocket connection, halts any playing audio, and resets state to `'idle'`.

---

### `interrupt`

> **At a high level, `interrupt` is the emergency brake for speech playback.** When you click the Voice Orb while the AI is talking, it cuts off the AI instantly.

#### The 2 Core Jobs of This Function:

1. **Silences Local Audio (< 20ms):** Immediately calls `audioPlayback.stop()`, which cuts speaker output, empties waiting sentence queues, and resets volume.
2. **Cancels Server Generation:** Sends an `{"type": "interrupt"}` message over the WebSocket to halt the LLM and TTS tasks on the backend, then re-arms the microphone to listen to you again.

---

# 3. Client Transport — `api.js`

### `createVoiceSocket`

> **At a high level, `createVoiceSocket` is the resilient network wrapper for the WebSocket connection.** It encapsulates socket creation, heartbeat keepalives, and event parsing inside a clean JavaScript object.

#### The 3 Core Jobs of This Function:

1. **Manages WebSocket Handshake:** Resolves absolute `ws://` or `wss://` URLs based on window location and attaches event listeners for `onopen`, `onmessage`, `onerror`, and `onclose`.
2. **Dispatches Typed Messages:** Parses incoming JSON strings and safely dispatches them to matching consumer callbacks (`onTranscript`, `onSentence`, `onDone`, `onInterrupted`, `onError`).
3. **Maintains Heartbeat:** Fires a `ping` frame every 20 seconds so cloud reverse proxies (e.g. Nginx, Cloudflare) don't disconnect the socket during silent periods.

---

> **Note on Transport Streamlining:** In earlier versions, `streamChat` served as an HTTP SSE fallback. In the current production architecture, client-side streaming transport runs 100% via full-duplex WebSockets ([`createVoiceSocket`](#createvoicesocket)), enabling sub-20ms instant conversational barge-in and eliminating HTTP polling/streaming overhead.

---

### `getConversations` / `createConversation` / `deleteConversation`

> **At a high level, these functions are the REST database communicators.** They keep the client UI in sync with historical sessions stored in SQLite on the server.

#### The Core Job of These Functions:

* Issue standard JSON HTTP requests (`GET`, `POST`, `DELETE`) to `/api/conversations` endpoints to load past chat histories, generate new session IDs, or delete conversations.

---

# 4. Server Gateway & Socket — `main.py`

### `websocket_conversation`

> **At a high level, `websocket_conversation` is the master conductor of the backend.** It hosts the `/ws/conversation` WebSocket endpoint, guards against hackers, and orchestrates audio transcription, language model reasoning, and voice generation.

#### The 4 Core Jobs of This Function:

1. **Defends Against CSWSH:** Inspects the connection's `Origin` header. If an untrusted domain attempts to connect, it closes the socket with `WS_1008_POLICY_VIOLATION`.
2. **Runs the Serialized Socket Writer:** Spawns a background worker (`socket_writer`) reading from `asyncio.Queue` so server messages never interleave or corrupt TCP frames.
3. **Processes Voice Turns (`run_pipeline`):** When user audio arrives, it coordinates Groq Whisper STT, passes transcripts to the LLM, chunks sentences, calls Edge-TTS, and streams MP3 frames back to the client.
4. **Handles Barge-In Cleanly:** If an interruption request arrives, it cancels the active task and snapshots whatever sentences were already spoken with `[interrupted]` into SQLite.

---

### `socket_writer` (Internal Worker)

> **At a high level, `socket_writer` is a thread-safe postal delivery worker.** It ensures that messages sent to the client are queued up in order and sent one at a time.

#### The 2 Core Jobs of This Function:

1. **Pulls Messages from Internal Queue:** Awaits `send_queue.get()`. If a message arrives, it calls `websocket.send_json(msg)`.
2. **Prevents Concurrent Write Crashes:** Guarantees that keepalive `pong` frames and audio `sentence` frames never attempt to write to the socket at the exact same instant.

---

### `run_pipeline(user_audio_bytes)` (Internal Worker)

> **At a high level, `run_pipeline` is the complete end-to-end processing engine for a single voice query.** It takes raw voice bytes, turns them into text, generates an answer, and streams voice chunks back.

#### The 3 Core Jobs of This Function:

1. **Transcribes Audio (< 200ms):** Calls `stt.transcribe_audio` in-memory. If speech is recognized, it immediately sends a `transcript` frame so the user sees their words on screen.
2. **Streams Sentence-by-Sentence Audio:** Queries the LLM with a 12-turn sliding history window. As each sentence finishes generating, it synthesizes MP3 bytes via Edge-TTS and emits a `sentence` frame to the client.
3. **Traps Cancellation (Barge-In):** If interrupted mid-generation, it catches `asyncio.CancelledError`, collects the sentences spoken so far, appends `" [interrupted]"`, and commits them to SQLite.

---

# 5. Speech-to-Text — `stt.py`

### `_transcribe_sync(file_bytes, filename)`

> **At a high level, `_transcribe_sync` is a zero-disk transcriber.** It takes raw audio bytes directly from computer RAM, wraps them in a memory pointer, and asks Groq Whisper to transcribe them into plain text.

#### The 3 Core Jobs of This Function:

1. **Filters Corrupt Audio:** Checks if the audio byte length is under 400 bytes. If so, it skips processing to avoid wasteful API calls on microphone noise.
2. **Bypasses Hard Disk I/O:** Instead of creating a temporary file on the hard drive, it wraps the bytes in `io.BytesIO(file_bytes)`. This eliminates disk contention and saves 40–120ms.
3. **Invokes Whisper Turbo:** Submits the in-memory buffer to Groq's `whisper-large-v3-turbo` model and returns the stripped text string.

---

### `transcribe_audio(file_bytes, filename)`

> **At a high level, `transcribe_audio` is the asynchronous bridge for Whisper.** It prevents synchronous transcription requests from freezing the server's event loop.

#### The Core Job of This Function:

* Uses `asyncio.to_thread(_transcribe_sync, ...)` to offload the blocking network call to an asynchronous background worker thread pool.

---

# 6. LLM Sentence Streaming — `llm.py`

### `extract_sentences(buffer)`

> **At a high level, `extract_sentences` is an intelligent multilingual sentence splitter.** It monitors the stream of incoming words from the AI and cuts them into clean, grammatically complete sentences the moment punctuation appears.

#### The 3 Core Jobs of This Function:

1. **Matches Universal Punctuation:** Uses `([.!?\u0964\u0965\u3002]+)` to detect Latin stops (`.`, `!`, `?`), Hindi Devanagari Danda (`।`, `॥`), and CJK full stops (`。`).
2. **Protects Abbreviations & Numbers:** Inspects candidate phrases. If it encounters titles like `Dr.`, `Mr.`, abbreviations like `e.g.`, or numbered lists like `1.`, it refuses to split early.
3. **Solves the Non-Latin Starvation Bug:** Uses universal character length rules (`len >= 2`) instead of English-only letter checks, ensuring Hindi and Asian languages stream smoothly without buffer stalls.

---

### `stream_sentences(message, history)`

> **At a high level, `stream_sentences` is the token-to-clause pipeline.** It asks Groq LPUs for answers and yields complete sentence strings as fast as they can be spoken.

#### The 2 Core Jobs of This Function:

1. **Caps Conversation Memory (Sliding Window):** Combines the system prompt with only the last 12 history turns (`history[-12:]`), guaranteeing the model never crashes due to context window limits or high token fees.
2. **Streams & Yields Clauses:** Iterates over streaming token deltas from Groq, feeds them into `extract_sentences()`, and immediately `yield`s each complete clause to the TTS engine.

---

# 7. Text-to-Speech Engine — `tts.py`

### `synthesize(text, voice)`

> **At a high level, `synthesize` is the neural voice synthesizer.** It takes a sentence string and turns it into natural-sounding spoken MP3 audio bytes using Microsoft Edge-TTS.

#### The 3 Core Jobs of This Function:

1. **Detects Language Automatically:** Inspects characters for Devanagari Unicode ranges (`\u0900`–`\u097F`). If Hindi characters are detected, it switches the voice to `hi-IN-SwaraNeural`; otherwise, it uses the default English neural voice.
2. **Streams MP3 Audio In-Memory:** Initializes `edge_tts.Communicate` and iterates through raw audio chunks in memory without creating temporary audio files on disk.
3. **Returns Combined Bytes:** Merges all streamed chunks into a single binary payload (`b"".join(...)`) ready for WebSocket transmission.

---

# 8. Client Audio Playback — `useAudioPlayback.js`

### `getSharedAudioContext`

> **At a high level, `getSharedAudioContext` is the browser crash protector.** It ensures that the entire web app shares exactly one Web Audio channel, preventing the browser's 6-context hardware crash.

#### The 2 Core Jobs of This Function:

1. **Enforces a Single Instance (Singleton):** Checks if `sharedAudioCtx` already exists. If not, it creates one master `AudioContext` and one master `AnalyserNode`.
2. **Auto-Resumes on User Click:** If the browser suspended the audio context due to autoplay restrictions, it calls `resume()` to re-awaken sound drivers.

---

### `startPlaybackLoop`

> **At a high level, `startPlaybackLoop` is the 60fps subtitle and volume clock.** It measures the exact millisecond of audio playing in your speakers and synchronizes visual subtitles and Voice Orb glowing.

#### The 2 Core Jobs of This Function:

1. **Calculates Voice Orb Glow (~60fps):** Inspects frequency data from `sharedAnalyser`, computes the RMS volume, and notifies `onVolumeChange` so the Voice Orb pulses to the rhythm of the voice.
2. **Paces Subtitles Word-by-Word:** Uses the high-precision audio clock (`ctx.currentTime`) to calculate the ratio of audio elapsed, revealing subtitle words one by one in perfect synchronization with spoken speech.

---

### `_playNext`

> **At a high level, `_playNext` is the queue manager.** It takes the next sentence audio chunk from the waiting list and plays it out of your speakers.

#### The 3 Core Jobs of This Function:

1. **Connects Audio into the Visual Graph:** Creates an `Audio` element for the next blob, hooks it to the persistent `sharedAnalyser` node using `createMediaElementSource()`, and begins playback.
2. **Seamless Chain-Playing:** Attaches an `onended` listener so that the microsecond the current sentence ends, it immediately calls `_playNext()` to play the next sentence without gaps.
3. **Concludes Stream:** When the queue is empty and the server has signaled `isStreamEnded`, it calls `onEnd()` to return the app to the listening state.

---

### `enqueue(blob, text)` / `stop()`

> **At a high level, these functions control the incoming audio stream.** `enqueue` puts new sentences into line, and `stop` acts as the immediate kill-switch.

#### The Core Jobs:

* **`enqueue`:** Pushes incoming audio and sentence text into `queueRef`. If nothing is currently playing, it kicks off playback immediately.
* **`stop`:** Wipes `queueRef`, pauses and detaches the current playing audio element, halts the animation loop, and sets volume to zero in under 20ms.

---

# 9. Persistence Layer — `storage.py` & `useSession.js`

### `_get_connection` (`storage.py`)

> **At a high level, `_get_connection` is the database reliability factory.** It opens a connection to SQLite with production pragmas that prevent database locking errors.

#### The 3 Core Jobs of This Function:

1. **Sets a 15-Second Busy Timeout:** Prevents immediate crashes if another thread is currently writing.
2. **Enables WAL Mode (`PRAGMA journal_mode = WAL;`):** Allows multiple readers and writers to access the database concurrently without blocking each other.
3. **Enforces Foreign Keys (`PRAGMA foreign_keys = ON;`):** Guarantees that deleting a conversation automatically cascades to delete all its messages.

---

### `add_message` / `delete_conversation` (`storage.py`)

> **At a high level, these functions store and remove transcript records.**

#### The Core Jobs:

* **`add_message`:** Inserts a message turn (`user` or `assistant`) linked to a session ID and updates the conversation's `updated_at` timestamp.
* **`delete_conversation`:** Removes a conversation row from SQLite, which automatically cascades to delete all associated message rows.

---

### `useSession` (`useSession.js`)

> **At a high level, `useSession` manages conversation history and active sessions on the client.** It decouples database chat histories from the real-time audio pipeline.

#### The 3 Core Jobs of This Hook:

1. **Tracks Active Session ID:** Stores the current session ID in `localStorage` so refreshing the browser doesn't lose your chat.
2. **Synchronizes with Backend SQLite:** Provides `loadSession`, `startNewSession`, and `deleteSession` to keep the UI sidebar synchronized with SQLite.
3. **Maintains In-Memory History:** Provides `appendUserMessage`, `updateAssistantMessage`, and `finalizeAssistantMessage` to cleanly render chat bubbles as audio streams in.

---

# 10. UI Shell & Visuals — `App.jsx` & `VoiceOrb.jsx`

### `handleOrbClick` (`App.jsx`)

> **At a high level, `handleOrbClick` is the single-button controller for the entire UI.** It inspects what the assistant is currently doing and triggers the appropriate action.

#### The 3 Core Jobs of This Function:

1. **If Assistant is Speaking:** Triggers `interrupt()` for an instant barge-in cutoff.
2. **If Voice Mode is Inactive:** Triggers `enterVoiceMode()` to ask for mic permissions and start listening.
3. **If Voice Mode is Active:** Toggles microphone mute on and off.

---

### `VoiceOrb` (`VoiceOrb.jsx`)

> **At a high level, `VoiceOrb` is the living visual centerpiece of the app.** It translates internal state machine states and real-time audio sound waves into fluid, organic CSS animations at 60 frames per second without using heavy canvas graphics.

#### The 4 Core Jobs of This Component:

1. **Applies Square-Root Volume Scaling:** Calculates `scale = 1 + Math.sqrt(volume) * 0.3`. Because human hearing is logarithmic, square-root scaling makes quiet whispers visibly register while preventing loud shouts from blowing up the orb.
2. **Applies Ambient Noise Filtering:** Enforces a minimum volume gate (`volume > 0.12`). Background fan noise or air conditioning is filtered out so the orb stays calm and still when no one is talking.
3. **Renders Dynamic Color Auras:**
   * **Listening:** Gentle blue ambient breathing aura.
   * **User Speaking:** Crisp luminous white pulsation matching your voice pitch.
   * **Thinking:** Fast rotating violet-purple vortex.
   * **Assistant Speaking:** Cyan-to-emerald radiant waveform pulsing in lockstep with the speaker output.
4. **Hosts Dedicated Mute Toggle Action Button:** Houses an embedded right-side microphone mute/unmute action button (`Mic` / `MicOff`) that visually alerts the user when muted (red accent glow) and toggles listening state without having to open the Sessions drawer.
