"""
Configuration — reads all settings from environment variables.
All secrets remain server-side; the React frontend never sees API keys.
"""
import os
from dotenv import load_dotenv

# Load .env from the project root (one level above backend/)
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))

# ── Groq ──────────────────────────────────────────────────────────────────────
GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
GROQ_LLM_MODEL: str = os.getenv("GROQ_LLM_MODEL", "qwen/qwen3.8-27b")
STT_LANGUAGE: str = os.getenv("STT_LANGUAGE", "en")  # ISO-639-1 English default to bypass Whisper language-id overhead

# ── Edge TTS ──────────────────────────────────────────────────────────────────
TTS_VOICE: str = os.getenv("TTS_VOICE", "en-US-GuyNeural")
TTS_VOLUME: str = os.getenv("TTS_VOLUME", "+0%")

# ── Server ────────────────────────────────────────────────────────────────────
BACKEND_PORT: int = int(os.getenv("BACKEND_PORT", "8000"))

# Comma-separated allowed origins for CORS (dev: http://localhost:5173)
ALLOWED_ORIGINS: list[str] = [
    o.strip()
    for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")
    if o.strip()
]
