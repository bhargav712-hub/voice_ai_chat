# Conversational Voice AI

> Lightning-fast, full-duplex conversational voice agent with **ChatGPT Advanced Voice Mode** aesthetics, neural **Silero VAD**, pipelined sentence streaming, and instant **barge-in interruption**.

[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111+-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-8.3+-646CFF?logo=vite&logoColor=white)](https://vitejs.dev)
[![Groq](https://img.shields.io/badge/Groq-LPUs-f55036?logo=speedtest&logoColor=white)](https://groq.com)
[![Silero VAD](https://img.shields.io/badge/VAD-Silero%20v5-blueviolet)](https://github.com/snakers4/silero-vad)
[![Edge-TTS](https://img.shields.io/badge/TTS-Edge--TTS%20Neural-0078D4?logo=microsoftedge&logoColor=white)](https://github.com/rany2/edge-tts)

---

## ✨ Features

- 🧠 **Neural Silero VAD v5 (In-Browser)**: Runs client-side via WebAssembly & ONNX Runtime Web. Detects genuine human vocal cords, ignores background noise, and allows natural thinking pauses without premature truncation.
- ⚡ **Instant Conversational Barge-In**: User speech triggers instant interruption. The assistant immediately halts audio playback, aborts in-flight server generation, and returns to active listening.
- 🚀 **Pipelined Sentence Streaming (TTFA < 800ms)**: Tokens stream from Groq LPUs into an intelligent sentence boundary detector. Each sentence is synthesized in-memory with Edge-TTS and enqueued for sequential client playback, cutting perceived latency down to sub-second speeds.
- 🔮 **Single Action Button Voice Orb**: Luminous floating marble Voice Orb permanently positioned at lower center. Serves as the single action trigger to activate Live Voice Mode, with real-time audio reactivity (*Listening*, *Thinking*, *Speaking*, *Muted*).
- 🎙️ **Pure Speech-to-Speech Interface**:
  - Displays exclusively: `👤 Human Voice Instruction` and `🤖 Spoken AI Output` transcripts.
  - Bottom text bar completely removed.
  - Dedicated strike-through Microphone toggle (`mic-off`) stops listening instantly when clicked.
- 💾 **Persistent Conversation Storage**: Built-in SQLite database stores speech sessions and turns, accessible via the slide-out Sessions drawer.
- 💸 **100% Free Speech Stack**: Zero local GPU requirements. Powered by Groq's high-speed inference tier and Microsoft Edge's neural voice service.

---

## 🏗️ Architecture & Data Flow

```mermaid
sequenceDiagram
    autonumber
    actor User as 👤 User
    participant VAD as 🧠 Silero VAD (ONNX Web)
    participant Client as 💻 React Frontend
    participant API as ⚡ FastAPI Backend
    participant Groq as 🚀 Groq Cloud (LPUs)
    participant TTS as 🔊 Microsoft Edge-TTS

    User->>VAD: Speaks natural query
    Note over VAD: onSpeechStart() triggers Barge-In if AI was speaking
    VAD->>Client: onSpeechEnd(wavBlob) [16kHz PCM WAV]
    Client->>API: POST /api/transcribe (audio)
    API->>Groq: Whisper Large v3 Turbo
    Groq-->>API: Transcript text (~200ms)
    API-->>Client: Return transcript
    Client->>API: POST /api/chat-stream (SSE)
    API->>Groq: Stream chat completion (AsyncGroq)
    loop As tokens stream
        Note over API: Sentence boundary detected (. ! ? \n)
        API->>TTS: In-memory synthesize(sentence)
        TTS-->>API: Audio chunk (MP3 bytes)
        API-->>Client: SSE event: sentence { text, audio_base64 }
        Client->>Client: Enqueue sentence audio & update transcript
        Note over Client: Audio begins playing immediately (< 800ms TTFA)
    end
    API-->>Client: SSE event: done
    Note over Client: Resumes listening automatically when playback finishes
```

---

## ⚛️ React SPA: State Management & API Data Fetching

This section details how the React Single-Page Application (SPA) manages conversational state variables and communicates with the FastAPI backend.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   React SPA Client                                     │
│                                                                                        │
│  ┌──────────────────────┐      ┌────────────────────────┐      ┌────────────────────┐  │
│  │   useVoicePipeline   │ ───> │        App.jsx         │ ───> │  UI Components     │  │
│  │   (Pipeline Hook)    │      │ (Sessions & App State) │      │ (Orb, VAD, Drawer) │  │
│  └──────────┬───────────┘      └───────────┬────────────┘      └────────────────────┘  │
│             │                              │                                           │
│             ▼                              ▼                                           │
│  ┌──────────────────────────────────────────────────────┐                              │
│  │               services/api.js (Transport)            │                              │
│  │   • Fetch REST Client   • SSE Parser   • WebSocket   │                              │
│  └──────────────────────────┬───────────────────────────┘                              │
└─────────────────────────────┼──────────────────────────────────────────────────────────┘
                              │ Vite Reverse Proxy (/api, /ws)
                              ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                FastAPI Backend (:8000)                                 │
│   • /api/transcribe (STT)      • /api/chat-stream (LLM+TTS)     • /ws/conversation     │
│   • /api/conversations (DB)    • /api/health                    • /api/tts             │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 1. State Variables Breakdown

The application separates state into **Session & UI Shell State** (in `App.jsx`) and **Conversational Pipeline State** (in `useVoicePipeline.js`):

| State Variable | Source File | Type | Description |
| :--- | :--- | :--- | :--- |
| `sessions` | `App.jsx` | `Array<Session>` | List of saved sessions loaded from the SQLite backend database (`id`, `title`, `updated_at`). |
| `activeSessionId` | `useVoicePipeline.js` | `string \| null` | UUID of the currently active voice session. Automatically synchronized with SQLite. |
| `isSidebarOpen` | `App.jsx` | `boolean` | Controls visibility of the session history drawer. |
| `state` | `useVoicePipeline.js` | `string` | Finite State Machine (FSM) state: `'idle'`, `'listening'`, `'processing'`, or `'speaking'`. Drives Voice Orb animations. |
| `isVoiceMode` | `useVoicePipeline.js` | `boolean` | `true` when live conversational microphone listening is active. |
| `isMuted` | `useVoicePipeline.js` | `boolean` | Microphone mute toggle (`mic-off`). Prevents audio transmission while keeping the session open. |
| `volume` | `useVoicePipeline.js` | `number` (0.0–1.0) | Normalized real-time audio volume derived from microphone analyser node for reactive orb pulsing. |
| `transcript` | `useVoicePipeline.js` | `Array<Message>` | Conversation messages array: `[{ id, role: 'user'\|'assistant', content, timestamp }]`. |
| `vadMetrics` | `useVoicePipeline.js` | `Object` | Live VAD telemetry: `{ rms, speechProbability, isSpeech }` computed in-browser. |
| `error` | `useVoicePipeline.js` | `string \| null` | Error messages from network failures, microphone denials, or backend exceptions. |

### 2. How APIs Are Fetched Into the React SPA

All network requests are centralized inside [`frontend/src/services/api.js`](frontend/src/services/api.js) and consumed cleanly by React hooks and components.

#### A. Initial Load & Session Fetching (`useEffect` + `useCallback`)
On component mount, `App.jsx` fetches the conversation history using standard native `fetch`:
```javascript
// App.jsx
const refreshSessions = useCallback(async () => {
  try {
    const list = await api.getConversations(); // GET /api/conversations
    setSessions(list);
  } catch (err) {
    console.warn('[STORAGE] Could not fetch sessions:', err);
  }
}, []);

useEffect(() => {
  refreshSessions();
}, [refreshSessions, activeSessionId, transcript.length]);
```

#### B. Speech-to-Text Transcription (`POST /api/transcribe`)
When Silero VAD detects the end of user speech (`onSpeechEnd`):
1. The 16kHz PCM audio buffer is packaged into a `Blob` and wrapped in `FormData`.
2. `api.transcribe(audioBlob, abortSignal)` calls `POST /api/transcribe`.
3. The response `{ text }` updates the local `transcript` state:
```javascript
// services/api.js
export async function transcribe(audioBlob, signal) {
  const form = new FormData();
  form.append('audio', audioBlob, 'audio.wav');
  const res = await fetch('/api/transcribe', { method: 'POST', body: form, signal });
  return res.json(); // { text: "..." }
}
```

#### C. Streaming LLM & Audio Synthesis (`POST /api/chat-stream` & SSE)
For low-latency responses, the frontend initiates a Server-Sent Events (SSE) stream using `fetch` with a `ReadableStreamDefaultReader`:
1. Dispatches `POST /api/chat-stream` with conversation context.
2. Reads incoming chunks line-by-line using `TextDecoder`.
3. Dispatches `onSentence(sentenceText, audioBlob)` as soon as each sentence completes synthesis on the backend:
```javascript
// services/api.js
const reader = res.body.getReader();
const decoder = new TextDecoder();
// Parses 'event: sentence' -> decodes base64 MP3 -> enqueues audio for immediate playback
```

#### D. Full-Duplex WebSocket Mode (`/ws/conversation`)
For sub-millisecond turn-around, `useVoicePipeline.js` opens a persistent bidirectional WebSocket:
```javascript
// services/api.js
const socket = new WebSocket('ws://localhost:5173/ws/conversation');
socket.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === 'transcript') updateTranscript(msg.text);
  if (msg.type === 'sentence')   playAudioChunk(base64ToBlob(msg.audio));
  if (msg.type === 'done')       setStatus('idle');
};
```

#### E. Conversational Barge-In Interruption
When the user speaks while the assistant is talking:
1. `useVAD.js` detects speech onset (`onSpeechStart`).
2. `interrupt()` is called immediately:
   - Halts and drains the Web Audio playback queue.
   - Sends `{"type": "interrupt"}` frame over the WebSocket.
   - Backend cancels the in-flight Groq LLM / TTS task using `asyncio.Task.cancel()`.
   - Pipeline transitions state instantly back to `listening`.

---

## 📊 STS Stage Comparison

| Stage | Technology | Speed / Footprint | Key Advantage |
| :--- | :--- | :--- | :--- |
| **1. VAD & Turn-Taking** | **Silero VAD v5** (ONNX Web) | Client-side WASM (0 server load) | Eliminates false triggers; handles natural mid-sentence thinking pauses |
| **2. STT (Speech-to-Text)** | **Groq Whisper** (`large-v3-turbo`) | ~150–250ms cloud LPU inference | Production accuracy with near-zero local resource consumption |
| **3. LLM Reasoning** | **Groq** (`openai/gpt-oss-120b`) | 300+ tok/s (< 100ms TTFT) | Deep reasoning and conversational speed without enterprise VRAM |
| **4. TTS (Voice Output)** | **Microsoft Edge Neural TTS** | ~300–450ms per sentence | In-memory streaming, 100% free, natural neural voices (`GuyNeural`, `AriaNeural`) |

---

## 🚀 Getting Started

### Prerequisites
- **Python 3.10+**
- **Node.js 18+** & npm
- A free **Groq API Key** from [console.groq.com](https://console.groq.com)
- Working microphone and speakers / headphones

---

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/username/voice-ai-prototype.git
   cd "Voice AI prototype"
   ```

2. **Configure environment variables:**
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   Open `.env` and insert your Groq API key:
   ```env
   GROQ_API_KEY=gsk_your_groq_api_key_here
   GROQ_LLM_MODEL=openai/gpt-oss-120b
   TTS_VOICE=en-US-GuyNeural
   BACKEND_PORT=8000
   ALLOWED_ORIGINS=http://localhost:5173
   ```

3. **Set up Python backend environment:**
   ```bash
   python -m venv venv
   # On Windows (PowerShell):
   venv\Scripts\Activate.ps1
   # On macOS/Linux:
   source venv/bin/activate

   pip install -r backend/requirements.txt
   ```

4. **Install React frontend dependencies:**
   ```bash
   cd frontend
   npm install
   cd ..
   ```

---

## 🏃 Running the Application

### Option A: Full-Stack Interactive Web App (Recommended)

Start the backend and frontend in separate terminals:

**Terminal 1 — FastAPI Backend:**
```bash
# In project root with venv activated:
python -m backend.main
```
*Backend runs on `http://localhost:8000` with hot reload.*

**Terminal 2 — React Frontend:**
```bash
cd frontend
npm run dev
```
*Frontend runs on `http://localhost:5173`.*

1. Open **`http://localhost:5173`** in your browser.
2. Click the central floating **Voice Orb** (the single action button) to turn on **Live Voice Mode**.
3. Allow microphone permissions.
4. Speak naturally—the assistant streams spoken responses in real time.
5. In the bottom dock, click the **Microphone** button to toggle mute:
   - Showing normal mic: active listening.
   - Showing strike-through (`mic-off`): completely pauses listening.
6. Click the top-right **Sessions** button to browse, reload, or delete stored voice conversations.

---

### Option B: Terminal CLI Prototype

For a standalone terminal-based push-to-talk experience:
```bash
# In project root with venv activated:
python voice_ai.py
```
- Press **Enter** once to start recording.
- Speak your message.
- Press **Enter** again to stop recording and hear the spoken response.

---

## 🔌 API Reference

| Method | Endpoint | Payload | Response | Description |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | None | `{"status": "ok"}` | Server health probe |
| `POST` | `/api/transcribe` | Multipart `audio` | `{"text": "..."}` | Groq Whisper STT |
| `POST` | `/api/chat` | JSON `{ message, history, conversation_id }` | `{"reply": "..."}` | Standard LLM response & persistence |
| `POST` | `/api/chat-stream` | JSON `{ message, history, conversation_id }` | `text/event-stream` | **SSE streaming**: yields sentence text + base64 MP3 chunks & auto-persists |
| `POST` | `/api/tts` | JSON `{ text, voice }` | `audio/mpeg` | Edge-TTS audio synthesis |
| `GET` | `/api/conversations` | None | `{"conversations": [...]}` | List saved voice conversations |
| `GET` | `/api/conversations/{id}` | None | `{"conversation": {...}}` | Get session details & messages |
| `POST` | `/api/conversations` | JSON `{ title }` | `{"id": "...", ...}` | Create new voice session |
| `DELETE` | `/api/conversations/{id}` | None | `{"success": true}` | Delete voice session |

---

## 🧪 Testing & Verification

- **Linting:**
  ```bash
  cd frontend && npm run lint
  ```
- **Frontend Production Build:**
  ```bash
  cd frontend && npm run build
  ```
- **Backend Syntax Check:**
  ```bash
  python -m py_compile backend/main.py backend/services/llm.py backend/services/tts.py
  ```

---

## ⚙️ Configuration Options

| Variable | Default | Description |
| :--- | :--- | :--- |
| `GROQ_API_KEY` | *required* | API key from console.groq.com |
| `GROQ_LLM_MODEL` | `openai/gpt-oss-120b` | Groq LLM model (`openai/gpt-oss-120b`, `llama-3.3-70b-versatile`, etc.) |
| `TTS_VOICE` | `en-US-GuyNeural` | Edge-TTS neural voice (`en-US-GuyNeural`, `en-US-AriaNeural`, `en-GB-SoniaNeural`) |
| `BACKEND_PORT` | `8000` | FastAPI server port |
| `ALLOWED_ORIGINS` | `http://localhost:5173` | Allowed CORS origins for the frontend |

---

## 📜 License

Distributed under the Apache 2.0 License.
