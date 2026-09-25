"""
Lab 2: Microsoft Edge Neural TTS In-Memory Synthesis
---------------------------------------------------
Why this matters:
Traditional TTS scripts save an MP3 to disk and then read it back from disk.
Disk I/O adds 50-150ms of unnecessary latency!
In `backend/services/tts.py`, we stream audio directly in-memory into RAM buffers.

Run this script in terminal (requires internet connection & virtual environment):
  python practice_sandbox/lab2_edge_tts.py
"""
import asyncio
import time
import edge_tts

async def synthesize_in_memory(text: str, voice: str = "en-US-JennyNeural") -> bytes:
    """Streams audio chunks directly in memory without touching the hard drive."""
    t0 = time.monotonic()
    communicate = edge_tts.Communicate(text, voice=voice)
    audio_chunks = []

    async for chunk in communicate.stream():
        # Edge-TTS yields dicts: {"type": "audio", "data": b'...'} or {"type": "WordBoundary", ...}
        if chunk["type"] == "audio":
            audio_chunks.append(chunk["data"])

    raw_mp3_bytes = b"".join(audio_chunks)
    elapsed = time.monotonic() - t0
    return raw_mp3_bytes, elapsed

async def main():
    print("=" * 60)
    print("LAB 2: In-Memory Edge-TTS Synthesis")
    print("=" * 60)
    
    test_sentence = "Welcome to the Voice AI prototype! You are learning how real-time audio systems operate."
    print(f"Synthesizing: \"{test_sentence}\"")
    
    try:
        audio_data, duration = await synthesize_in_memory(test_sentence)
        print(f"Success! Generated {len(audio_data)} bytes of MP3 audio in {duration:.2f} seconds.")
        print(f"Throughput: {len(audio_data) / 1024:.2f} KB in RAM.")
        
        # Save a sample file so the user can verify their speaker/audio output
        output_file = "practice_sandbox/sample_output.mp3"
        with open(output_file, "wb") as f:
            f.write(audio_data)
        print(f"Saved sample audio to: {output_file} (You can play it!)")
        
    except Exception as e:
        print(f"Error during synthesis: {e}")
        print("Note: Ensure you have an active internet connection as Edge-TTS connects to Microsoft servers.")

if __name__ == "__main__":
    asyncio.run(main())
