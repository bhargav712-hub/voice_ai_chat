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

from backend.config import TTS_VOICE

logger = logging.getLogger("voice_ai.tts")


async def synthesize(text: str, voice: str | None = None) -> bytes:
    """Synthesize text → MP3 bytes using Edge TTS (in-memory stream for minimum latency)."""
    chosen_voice = voice or TTS_VOICE
    communicate = edge_tts.Communicate(text, voice=chosen_voice)
    chunks: list[bytes] = []

    try:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                chunks.append(chunk["data"])
        return b"".join(chunks)
    except Exception as exc:
        logger.warning("[TTS] In-memory stream failed (%s), falling back to temp file", exc)
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
            tmp_path = tmp.name
        try:
            await communicate.save(tmp_path)
            with open(tmp_path, "rb") as f:
                return f.read()
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

