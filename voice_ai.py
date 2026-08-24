import os
import tempfile
import wave
import numpy as np
import sounddevice as sd
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

API_KEY = os.getenv("OPENAI_API_KEY")
if not API_KEY:
    raise ValueError("OPENAI_API_KEY missing from environment variables.")

client = OpenAI(api_key=API_KEY)

SAMPLE_RATE = 16000
CHANNELS = 1



def record_audio() -> np.ndarray:
    """Captures microphone input using Press-Enter push-to-talk."""
    input("\n[Press Enter to START recording]")
    print("Recording... [Press Enter again to STOP recording]")

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
    """Converts spoken audio file to English text via OpenAI Whisper."""
    with open(file_path, "rb") as audio_file:
        transcript = client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
            language="en"
        )
    return transcript.text.strip()


def generate_llm_response(prompt: str, history: list) -> str:
    """Generates conversational response using GPT-4o-mini."""
    history.append({"role": "user", "content": prompt})
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=history,
        max_tokens=150
    )
    reply = response.choices[0].message.content
    history.append({"role": "assistant", "content": reply})
    return reply


def text_to_speech_and_play(text: str) -> None:
    """Synthesizes text to speech using OpenAI TTS and plays audio via sounddevice."""
    temp_wav = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    
    response = client.audio.speech.create(
        model="tts-1",
        voice="alloy",
        input=text,
        response_format="wav"
    )
    response.stream_to_file(temp_wav.name)

    # Read the WAV file and play it through sounddevice
    with wave.open(temp_wav.name, 'rb') as wf:
        tts_sample_rate = wf.getframerate()
        n_channels = wf.getnchannels()
        sample_width = wf.getsampwidth()
        frames = wf.readframes(wf.getnframes())

    audio_data = np.frombuffer(frames, dtype=np.int16)
    if n_channels > 1:
        audio_data = audio_data.reshape(-1, n_channels)

    # Normalize to float32 for sounddevice
    audio_float = audio_data.astype(np.float32) / 32768.0

    sd.play(audio_float, samplerate=tts_sample_rate)
    sd.wait()

    os.remove(temp_wav.name)


def main():
    print("========================================")
    print("      Voice AI Prototype Running        ")
    print("========================================")

    conversation_history = [
        {
            "role": "system", 
            "content": "You are a concise, spoken voice assistant. Keep responses under 2-3 sentences and highly conversational."
        }
    ]

    while True:
        try:
            audio_data = record_audio()
            if len(audio_data) == 0:
                print("No audio recorded. Please try again.")
                continue

            temp_wav_path = save_wav_temp(audio_data)

            print("Processing: Speech-to-Text...")
            user_text = speech_to_text(temp_wav_path)
            os.remove(temp_wav_path)

            if not user_text:
                print("Could not understand audio. Try speaking again.")
                continue

            print(f"\nUser: {user_text}")

            print("Processing: LLM Response...")
            ai_reply = generate_llm_response(user_text, conversation_history)
            print(f"AI:   {ai_reply}")

            print("Processing: Text-to-Speech playback...")
            text_to_speech_and_play(ai_reply)

        except KeyboardInterrupt:
            print("\nExiting Voice AI prototype. Goodbye!")
            break
        except Exception as e:
            print(f"\nError encountered: {e}")


if __name__ == "__main__":
    main()
