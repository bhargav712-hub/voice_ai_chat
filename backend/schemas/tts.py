from pydantic import BaseModel
from typing import Optional


class TTSRequest(BaseModel):
    text: str
    voice: Optional[str] = None   # falls back to TTS_VOICE env var
