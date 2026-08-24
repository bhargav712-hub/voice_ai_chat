# Voice AI Prototype (Groq + Edge-TTS Alternative)

A lightning-fast, turn-based Python Voice AI prototype demonstrating a full conversation loop:
**Voice Input → Groq Whisper (STT) → Groq Llama 3.3 (LLM) → Microsoft Edge Neural TTS → Audio Playback**.

## Features
- **Speech-to-Text (STT)**: Groq Whisper (`whisper-large-v3` — ultra low latency, ~200ms)
- **LLM Reasoning**: Groq Llama 3.3 (`llama-3.3-70b-versatile` — smart, concise conversational assistant)
- **Text-to-Speech (TTS)**: Microsoft Edge Neural TTS (`edge-tts` — **100% free**, human-like neural voices)
- **Audio I/O**: `sounddevice` + `soundfile` + `numpy` for direct microphone capture and speaker playback
- **Interaction**: Push-to-Talk via Enter key

---

## Prerequisites
- Python 3.9+ installed
- Working microphone and speakers / headphones
- Free Groq API key from [console.groq.com](https://console.groq.com)

---

## Installation

1. Clone repository and switch to this branch:
   ```bash
   git checkout feature/groq-edge-tts
   ```

2. Create and activate a virtual environment (recommended):
   ```bash
   python -m venv venv
   # On Windows:
   venv\Scripts\activate
   # On macOS/Linux:
   source venv/bin/activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

---

## Configuration

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Open `.env` and fill in your `GROQ_API_KEY`:
   ```env
   GROQ_API_KEY=gsk_...
   ```
   *(TTS requires no API key!)*

---

## Usage

1. Start the application:
   ```bash
   python voice_ai.py
   ```
2. Press **Enter** once to start recording your voice.
3. Speak your question in English (e.g., *"What is the capital of France?"*).
4. Press **Enter** again to stop recording.
5. In ~1.5–2 seconds, the AI generates and speaks the answer back to you.
6. Press `Ctrl + C` at any time to exit.

---

## Latency & Performance Comparison
- **STT**: ~0.2s - 0.4s (Groq LPUs)
- **LLM**: ~0.4s - 0.8s (Groq LPU inference)
- **TTS**: ~0.5s - 0.8s (Edge-TTS)
- **Total Turnaround Time**: **~1.5s - 2.5s** (Exceeds the 5–8s requirement).
