import os
import asyncio
import tempfile
import wave
import numpy as np
import sounddevice as sd
import soundfile as sf
import edge_tts
from dotenv import load_dotenv
from groq import Groq

# Load environment variables
load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if not GROQ_API_KEY:
    print("Warning: GROQ_API_KEY is missing from .env. Please add it to start voice processing.")

client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None

# Audio Recording Configuration
SAMPLE_RATE = 16000
CHANNELS = 1
TTS_VOICE = os.getenv("TTS_VOICE", "en-US-GuyNeural")  # e.g., en-US-GuyNeural, en-US-AriaNeural, en-US-JennyNeural


def record_audio() -> np.ndarray:
    """Captures microphone input using Press-Enter push-to-talk."""
    input("\n[Press Enter to START recording]")
    print("🎤 Listening... [Press Enter again to STOP recording]")

    audio_chunks = []
    is_recording = True

    def audio_callback(indata, frames, time, status):
        if is_recording:
            audio_chunks.append(indata.copy())

    stream = sd.InputStream(samplerate=SAMPLE_RATE, channels=CHANNELS, callback=audio_callback)
    with stream:
        input()
        is_recording = False

    if audio_chunks:
        return np.concatenate(audio_chunks, axis=0)
    return np.array([])


def save_wav_temp(audio_np: np.ndarray) -> str:
    """Saves raw numpy audio data into a temporary WAV file."""
    temp_wav = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    audio_int16 = (audio_np * 32767).astype(np.int16)
    
    with wave.open(temp_wav.name, 'wb') as wf:
        wf.setnchannels(CHANNELS)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(audio_int16.tobytes())

    return temp_wav.name


def speech_to_text(file_path: str) -> str:
    """Converts spoken audio file to English text using Groq Whisper (whisper-large-v3)."""
    if not client:
        raise ValueError("GROQ_API_KEY is not configured in .env file.")

    with open(file_path, "rb") as audio_file:
        transcript = client.audio.transcriptions.create(
            model="whisper-large-v3",
            file=audio_file,
            language="en",
            response_format="json"
        )
    return transcript.text.strip()


def generate_llm_response(prompt: str, history: list) -> str:
    """Generates conversational response using Groq Llama 3.3 / 3.1."""
    if not client:
        raise ValueError("GROQ_API_KEY is not configured in .env file.")

    history.append({"role": "user", "content": prompt})
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=history,
        max_tokens=150,
        temperature=0.7
    )
    reply = response.choices[0].message.content.strip()
    history.append({"role": "assistant", "content": reply})
    return reply


async def _synthesize_edge_tts(text: str, output_path: str) -> None:
    """Helper coroutine for edge-tts synthesis."""
    communicate = edge_tts.Communicate(text, voice=TTS_VOICE)
    await communicate.save(output_path)


def text_to_speech_and_play(text: str) -> None:
    """Synthesizes text to speech using Microsoft Edge TTS and plays back through speaker."""
    temp_mp3 = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False)
    temp_mp3_path = temp_mp3.name
    temp_mp3.close()

    try:
        # Generate neural audio using edge-tts
        asyncio.run(_synthesize_edge_tts(text, temp_mp3_path))

        # Decode and play audio
        audio_data, sample_rate = sf.read(temp_mp3_path, dtype="float32")
        print("🔊 Speaking response...")
        sd.play(audio_data, samplerate=sample_rate)
        sd.wait()
    finally:
        if os.path.exists(temp_mp3_path):
            os.remove(temp_mp3_path)


def main():
    print("=========================================================")
    print("   Voice AI Prototype (Groq + Edge-TTS Alternative)      ")
    print("   - STT: Groq Whisper-large-v3                          ")
    print("   - LLM: Groq Llama-3.3-70b-versatile                   ")
    print("   - TTS: Microsoft Edge Neural TTS (100% Free)          ")
    print("=========================================================")

    if not GROQ_API_KEY:
        print("\n[!] ERROR: GROQ_API_KEY is not set.")
        print("Please obtain a free key from https://console.groq.com and set GROQ_API_KEY in .env\n")

    conversation_history = [
        {
            "role": "system",
            "content": "You are a concise, friendly spoken voice assistant. Keep answers under 2-3 sentences and highly conversational."
        }
    ]

    while True:
        try:
            audio_data = record_audio()
            if len(audio_data) == 0:
                print("No audio recorded. Please try again.")
                continue

            temp_wav_path = save_wav_temp(audio_data)

            print("⚡ Processing: Speech-to-Text via Groq...")
            user_text = speech_to_text(temp_wav_path)
            os.remove(temp_wav_path)

            if not user_text:
                print("Could not understand audio. Try speaking again.")
                continue

            print(f"\n👤 User: {user_text}")

            print("⚡ Processing: LLM Response via Llama 3.3...")
            ai_reply = generate_llm_response(user_text, conversation_history)
            print(f"🤖 AI:   {ai_reply}\n")

            print("⚡ Processing: Text-to-Speech via Edge-TTS...")
            text_to_speech_and_play(ai_reply)

        except KeyboardInterrupt:
            print("\nExiting Voice AI prototype. Goodbye!")
            break
        except Exception as e:
            print(f"\nError encountered: {e}")


if __name__ == "__main__":
    main()
