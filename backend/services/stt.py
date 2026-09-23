"""
STT Service — Speech-to-Text via Groq Whisper.

Responsibility:
  - Receive raw audio bytes from the FastAPI route.
  - Write to a temp file (Groq SDK requires a file-like object).
  - Call Groq Whisper (whisper-large-v3-turbo) — same model as the original CLI.
  - Return the transcript as a plain string.

The Groq Python SDK is synchronous, so we run it in a thread pool via
asyncio.to_thread() to avoid blocking the FastAPI event loop.

Supported browser audio formats that Groq Whisper accepts:
  webm, wav, mp4, mpeg, mpga, m4a, ogg
"""
import asyncio
import logging
import os
import tempfile

from groq import Groq

from backend.config import GROQ_API_KEY

logger = logging.getLogger("voice_ai.stt")

_client: Groq | None = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None


def _transcribe_sync(file_bytes: bytes, filename: str) -> str:
    """Blocking transcription call — executed in a thread pool."""
    if not _client:
        raise ValueError("GROQ_API_KEY is not configured. Set it in the .env file.")

    # Determine file suffix from filename so Whisper recognises the format
    ext = os.path.splitext(filename)[-1].lower()
    if not ext or ext not in {".webm", ".wav", ".mp3", ".mp4", ".ogg", ".m4a"}:
        ext = ".webm"  # browser MediaRecorder default

    if len(file_bytes) < 400:
        logger.debug("[STT] Audio too short (%d bytes), skipping transcription.", len(file_bytes))
        return ""

    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp.write(file_bytes)
        tmp_path = tmp.name

    try:
        with open(tmp_path, "rb") as f:
            transcript = _client.audio.transcriptions.create(
                file=(filename, f.read()),
                model="whisper-large-v3-turbo",
                temperature=0,
                response_format="verbose_json",
                language="en",
            )

        if hasattr(transcript, "text"):
            return transcript.text.strip()
        if isinstance(transcript, dict):
            return transcript.get("text", "").strip()
        return str(transcript).strip()

    except Exception as exc:
        err_msg = str(exc).lower()
        if "could not process file" in err_msg or "invalid_media_file" in err_msg or "400" in str(exc):
            logger.warning("[STT] Invalid media chunk received (%d bytes): %s", len(file_bytes), exc)
            return ""
        raise

    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


async def transcribe_audio(file_bytes: bytes, filename: str) -> str:
    """Async wrapper — runs the blocking Groq call in a thread pool."""
    return await asyncio.to_thread(_transcribe_sync, file_bytes, filename)
