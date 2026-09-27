"""
TTS Service — Text-to-Speech via Microsoft Edge Neural TTS.

Responsibility:
  - Receive assistant text + optional voice name.
  - Call edge-tts (same library as the original CLI — 100% free).
  - Return raw MP3 bytes that FastAPI streams directly to the browser.

edge-tts.Communicate.save() is a native async method, so no thread pool
wrapper is needed here.
"""
import logging
import os
import tempfile

import edge_tts

from backend.config import TTS_VOICE, TTS_VOLUME

logger = logging.getLogger("voice_ai.tts")


async def synthesize(text: str, voice: str | None = None) -> bytes:
    """Synthesize text → MP3 bytes using Edge TTS (in-memory stream for minimum latency)."""
    if not text or not text.strip():
        return b""

    # Detect Devanagari (Hindi) characters: U+0900 to U+097F
    is_hindi = any('\u0900' <= char <= '\u097F' for char in text) 
    chosen_voice = "hi-IN-SwaraNeural" if is_hindi else (voice or TTS_VOICE)

    communicate = edge_tts.Communicate(text, voice=chosen_voice, volume=TTS_VOLUME)
    chunks: list[bytes] = []

    try:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                chunks.append(chunk["data"])
        return b"".join(chunks)
    except Exception as exc:
        logger.warning("[TTS] In-memory stream failed (%s), attempting fresh fallback", exc)
        try:
            # Create a FRESH instance (Communicate cannot be reused)
            fallback_voice = "hi-IN-SwaraNeural" if is_hindi else TTS_VOICE
            fresh_comm = edge_tts.Communicate(text, voice=fallback_voice, volume=TTS_VOLUME)
            fallback_chunks: list[bytes] = []
            async for chunk in fresh_comm.stream():
                if chunk["type"] == "audio":
                    fallback_chunks.append(chunk["data"])
            return b"".join(fallback_chunks)
        except Exception as fallback_err:
            logger.error("[TTS] Fallback synthesis failed: %s", fallback_err)
            return b""

