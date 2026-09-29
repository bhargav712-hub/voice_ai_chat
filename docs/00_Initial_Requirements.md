# Mini Task – Basic English-Speaking Voice AI Prototype

> **Document Version:** 1.0 (Original Project Inception Specification)  
> **Status:** Completed & Exceeded in Current Architecture  
> **Archived In:** `docs/00_Initial_Requirements.md`

---

## 1. Objective

The objective of this task is to build a basic working Voice AI prototype that can:
1. Listen to the user's voice through a microphone.
2. Convert the user's speech into English text.
3. Send the text to an AI/LLM to generate a response.
4. Convert the AI response into natural English speech.
5. Play the response back to the user through the speaker.

The focus is to demonstrate a complete **Voice → AI → Voice** conversation flow. This is a prototype and does not need to be production-ready.

---

## 2. Functional Requirements

### FR-01: Voice Input
The application must allow the user to speak through their microphone.
* **Requirement:**
  * The system should capture the user's voice.
  * The user should be able to speak in English.
  * The application should clearly identify when it is listening.

### FR-02: Speech-to-Text
The application must convert the user's voice into English text.
* **Requirement:**
  * The speech should be transcribed accurately.
  * The system should handle normal conversational English.
  * The transcribed text should be available to the AI processing layer.
* **Suggested Options:**
  * OpenAI Whisper
  * OpenAI Speech-to-Text API
  * SpeechRecognition
  * Any other suitable STT solution *(Implemented: Groq Whisper `whisper-large-v3-turbo`)*

### FR-03: AI Response Generation
The transcribed text must be sent to an LLM to generate a response.
* **Requirement:**
  * The AI should understand the user's question/request.
  * The AI should generate a relevant response.
  * The response should be in English.
  * Basic conversation context should be maintained where required.
* **Suggested Options:**
  * OpenAI
  * Groq *(Implemented: Groq LPUs with `llama-3.3-70b-versatile` / `qwen`)*
  * Local LLM
  * Any other suitable LLM

### FR-04: Text-to-Speech
The AI-generated response must be converted into spoken English.
* **Requirement:**
  * The generated response should be converted to audio.
  * The voice should sound clear and natural.
  * The audio should automatically play through the user's speakers.
* **Suggested Options:**
  * OpenAI TTS
  * ElevenLabs
  * pyttsx3
  * Any other suitable TTS solution *(Implemented: Microsoft Edge Neural TTS)*

### FR-05: User Interaction
The prototype should provide a simple way for the user to start speaking. One of the following approaches can be used:
* **Option A – Push to Talk:** User presses and holds a key/button, speaks, and releases the key/button. AI processes and responds. *(Preferred initially)*
* **Option B – Continuous Conversation:** Application continuously listens. User speaks when prompted. AI processes and responds. *(Implemented via In-Browser Silero VAD)*
* **Option C – Wake Word:** User says a predefined phrase such as "Hey AI". System starts listening.

*(For the initial mini-task, Push to Talk was preferred for simplicity, later upgraded to full-duplex hands-free neural VAD).*

---

## 3. Suggested Technology Stack

The following stack was recommended, with flexibility for valid engineering alternatives:

| Component | Suggested Technology | Final Implementation in Codebase |
| :--- | :--- | :--- |
| **Programming Language** | Python | Python 3.14 (FastAPI) + React 19 / JavaScript |
| **Speech-to-Text** | OpenAI Whisper / SpeechRecognition | **Groq Whisper** (`whisper-large-v3-turbo`) |
| **AI / LLM** | OpenAI / Groq | **Groq LPUs** (`llama-3.3-70b-versatile`) |
| **Text-to-Speech** | OpenAI TTS / ElevenLabs / pyttsx3 | **Microsoft Edge Neural TTS** |
| **Frontend / Audio Capture** | CLI or Basic GUI | **In-Browser Silero VAD v5 + Web Audio API** |
| **Transport** | Standard REST / CLI loop | **Full-Duplex WebSockets (`/ws/conversation`)** |
| **Environment Variables**| `.env` | Python `python-dotenv` |
| **Package Management** | `requirements.txt` | Python `requirements.txt` + `package.json` |

---

## 4. Non-Functional Requirements

### NFR-01: Response Time
The complete interaction should ideally take **less than 5–8 seconds** from the end of the user's speech to the beginning of the AI's spoken response.  
*(Current Architecture: Exceeded by a factor of 10× $\rightarrow$ **Time-To-First-Audio is < 800ms** via pipelined sentence streaming).*

### NFR-02: Code Quality
* Code should be clean and easy to understand.
* Functions should be separated logically.
* Basic comments should be provided where required.
* API keys must **not** be hardcoded in the source code.

### NFR-03: Configuration
* API keys and configuration values must be stored in a `.env` file.
* Example:
  ```env
  GROQ_API_KEY=your_api_key_here
  ```
* The `.env` file must **never** be committed to Git.

---

## 5. Deliverables

* **D-01: Source Code:** A working Python backend and frontend application.
* **D-02: Requirements File:** A `requirements.txt` file containing all required dependencies.
* **D-03: Environment Configuration:** A sample environment file `.env.example` showing required keys without exposing secrets.
* **D-04: README:** A comprehensive `README.md` covering prerequisites, installation, API key configuration, usage instructions, and architecture.

---

## 6. Acceptance Criteria

- [x] Application can be started successfully on a local machine.
- [x] Application can access the microphone.
- [x] User can speak an English sentence.
- [x] User's speech is accurately converted into text.
- [x] Transcribed text is sent to the LLM.
- [x] LLM generates a relevant response.
- [x] AI response is converted into English speech.
- [x] AI response is played through the speaker.
- [x] The complete Voice → AI → Voice flow works without manual intervention between steps.
- [x] Response time is ideally within 5–8 seconds *(Achieved: Sub-second < 800ms)*.
- [x] API keys are stored securely using `.env`.
- [x] `requirements.txt` is provided.
- [x] `README.md` contains clear setup and usage instructions.
- [x] Code is clean, structured, and understandable.

---

## 7. Example Test Case

```
Test Input:
User speaks: "What is the capital of France?"

Expected Flow:
User speaks
     ↓
Microphone captures voice
     ↓
Speech-to-Text
     ↓
"What is the capital of France?"
     ↓
LLM
     ↓
"The capital of France is Paris."
     ↓
Text-to-Speech
     ↓
AI speaks the answer

Expected Result:
The application verbally responds with the correct answer in a clear English voice.
```

---

## 8. Out of Scope (For Initial Prototype)

The following were declared out of scope for the initial mini-task:
* Production deployment
* User authentication
* Database integration *(Added later via SQLite session storage)*
* Multiple users
* Admin dashboard
* Mobile application
* Advanced conversation memory *(Added later via 12-turn sliding context window)*
* Custom AI model training
* Complex UI *(Added later via React 19 + Voice Orb visualizer)*
* Voice analytics
* Call-center integration
* Advanced wake-word detection

---

## 9. Timeline

> *"The priority is to get the complete working Voice → Speech-to-Text → LLM → Text-to-Speech → Voice loop working first. UI improvements and additional features can be considered after the basic flow is completed."*

---

## 10. Known Limitations & Active Development Context

> [!WARNING]
> **Barge-In / Interruption Status:**  
> Although interruption handler functions (`interrupt()`, `cancel_active_task()`, `audioPlayback.stop()`) have been created in the codebase, **conversational barge-in is currently NOT working reliably**.  
> *Technical Cause:* To prevent the assistant's speaker playback from leaking into the laptop microphone (acoustic echo loop), the frontend VAD listener is paused during playback (`vadRef.current?.pause()` in `useVoicePipeline.js`). As a result, speaking over the assistant cannot trigger voice interruption, and manual click interruption suffers from in-flight WebSocket packet races. This is preserved as a known limitation in the project context.

