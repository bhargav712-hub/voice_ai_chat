"""
Lab 1: Python Async/Await & Async Generators
-------------------------------------------
Why this matters:
The entire Voice AI backend runs on asynchronous Python.
If you don't understand how `async def`, `await`, and `async for` (async generators) work,
you won't understand how `llm.stream_sentences()` or `main.py` handle live streaming!

Run this script in terminal:
  python practice_sandbox/lab1_async_streaming.py
"""
import asyncio
import time

# 1. Simulating streaming tokens from an LLM
async def fake_llm_token_stream():
    """Simulates an LLM producing tokens one-by-one with realistic delay."""
    words = [
        "Hello", "there!", "I", "am", "your", "conversational", "voice", "AI.",
        "How", "can", "I", "assist", "you", "today?"
    ]
    for word in words:
        await asyncio.sleep(0.08)  # simulate Groq LPU streaming delay (80ms)
        yield word + " "

# 2. Sentence boundary detector (just like backend/services/llm.py extract_sentences!)
async def stream_sentences(token_generator):
    """Accumulates incoming tokens into a buffer and yields whenever a sentence completes."""
    buffer = ""
    sentence_terminators = (".", "!", "?")

    async for token in token_generator:
        buffer += token
        # Check if any sentence terminator exists in the buffer
        for char in sentence_terminators:
            if char in buffer:
                idx = buffer.index(char)
                sentence = buffer[:idx + 1].strip()
                buffer = buffer[idx + 1:].strip()
                if sentence:
                    yield sentence

    # Flush any remaining text at the end
    if buffer.strip():
        yield buffer.strip()

# 3. Simulating concurrent TTS generation
async def fake_tts_synthesize(sentence: str):
    """Simulates generating audio for a sentence concurrently."""
    t0 = time.monotonic()
    await asyncio.sleep(0.2)  # simulate Edge-TTS delay (200ms)
    elapsed = time.monotonic() - t0
    audio_bytes_simulated = f"<AudioBytes for '{sentence[:15]}...'>"
    return audio_bytes_simulated, elapsed

# 4. Main Event Loop Execution
async def main():
    print("=" * 60)
    print("LAB 1: Async Pipeline Simulation (LLM Token -> Sentence -> TTS)")
    print("=" * 60)
    
    t_start = time.monotonic()
    sentence_idx = 0

    # We consume sentences as soon as they are ready
    async for sentence in stream_sentences(fake_llm_token_stream()):
        sentence_idx += 1
        t_sentence = time.monotonic() - t_start
        print(f"\n[Sentence {sentence_idx} Ready at {t_sentence:.2f}s]: '{sentence}'")
        
        # Start TTS immediately! (Notice we don't wait for the rest of the message!)
        audio, tts_time = await fake_tts_synthesize(sentence)
        print(f" -> [TTS Audio Generated in {tts_time:.2f}s]: {audio}")

    total_time = time.monotonic() - t_start
    print("\n" + "=" * 60)
    print(f"Total time elapsed: {total_time:.2f}s")
    print("KEY TAKEAWAY FOR SENIOR INTERVIEWS:")
    print("Notice how Sentence 1 was synthesized into audio and ready to play at < 0.6s,")
    print("long before the whole response finished generating at 1.4s!")
    print("This is called 'Time-To-First-Audio (TTFA) optimization'.")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(main())
