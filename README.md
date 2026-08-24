# Voice AI Prototype

A minimal, turn-based Python prototype demonstrating a complete voice conversational loop: Voice Input → Speech-to-Text → LLM Processing → Text-to-Speech → Audio Playback.

## Features
- **STT**: OpenAI Whisper (`whisper-1`)
- **LLM**: OpenAI GPT-4o-mini (`gpt-4o-mini`)
- **TTS**: OpenAI Speech API (`tts-1`)
- **Interaction**: Press-Enter Push-To-Talk mechanism

## Prerequisites
- Python 3.9+ installed
- Microphone and Speakers connected
- An active OpenAI API key

## Installation

1. Clone or download this repository.
2. Create and activate a virtual environment (optional but recommended):
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

## Configuration

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Open `.env` and add your OpenAI API key:
   ```env
   OPENAI_API_KEY=sk-...
   ```

## Usage

1. Run the application:
   ```bash
   python voice_ai.py
   ```
2. Press **Enter** once to begin recording your voice via microphone.
3. Speak your prompt in English (e.g., *"What is the capital of France?"*).
4. Press **Enter** again to end recording.
5. Wait ~2–4 seconds for transcription, AI processing, and spoken output playback.
6. Press `Ctrl + C` at any point to exit the application.

## Known Limitations

* Push-to-Talk uses Enter keys in the terminal console rather than OS-level global hotkeys to maintain multi-platform support without requiring `root`/`sudo` privileges.
* Network latency relies on OpenAI API response times.
