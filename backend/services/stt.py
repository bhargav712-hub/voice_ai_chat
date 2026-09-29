"""
STT Service — Speech-to-Text via Groq Whisper.

Responsibility:
  - Receive raw audio bytes from the FastAPI route.
  - Stream directly from memory via io.BytesIO (Zero disk I/O overhead).
  - Call Groq Whisper (whisper-large-v3-turbo) in a thread pool.
  - Return the transcript as a plain string.

Supported browser audio formats that Groq Whisper accepts:
  webm, wav, mp4, mpeg, mpga, m4a, ogg
"""
import asyncio
import io
import logging
import os

from groq import Groq

from backend.config import GROQ_API_KEY, STT_LANGUAGE

logger = logging.getLogger("voice_ai.stt")

_client: Groq | None = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None


# _transcribe_sync: Performs zero-disk-I/O transcription by wrapping audio bytes in an in-memory io.BytesIO stream and querying Groq Whisper large-v3-turbo.
def _transcribe_sync(file_bytes: bytes, filename: str) -> str:
    """Blocking transcription call executed in a thread pool via io.BytesIO."""
    if not _client:
        raise ValueError("GROQ_API_KEY is not configured. Set it in the .env file.")

    if len(file_bytes) < 400:
        logger.debug("[STT] Audio too short (%d bytes), skipping transcription.", len(file_bytes))
        return ""

    # Determine file extension from filename so Whisper recognises the format
    ext = os.path.splitext(filename)[-1].lower()
    if not ext or ext not in {".webm", ".wav", ".mp3", ".mp4", ".ogg", ".m4a"}:
        ext = ".wav"

    upload_filename = f"audio{ext}"
    audio_buffer = io.BytesIO(file_bytes)

    try:
        kwargs = {
            "file": (upload_filename, audio_buffer),
            "model": "whisper-large-v3-turbo",
            "temperature": 0,
            "response_format": "verbose_json",
        }
        # Enforce English (or STT_LANGUAGE) to bypass Whisper language-id latency (~50-80ms)
        # and prevent misclassification of accented speech or short utterances.
        if STT_LANGUAGE:
            kwargs["language"] = STT_LANGUAGE

        transcript = _client.audio.transcriptions.create(**kwargs)

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
        logger.error("[STT] Transcription failed: %s", exc)
        raise


# transcribe_audio: Asynchronous wrapper offloading synchronous Whisper API calls to a background thread pool to prevent blocking the FastAPI event loop.
async def transcribe_audio(file_bytes: bytes, filename: str) -> str:
    """Async wrapper — runs the blocking Groq call in a thread pool."""
    return await asyncio.to_thread(_transcribe_sync, file_bytes, filename)
