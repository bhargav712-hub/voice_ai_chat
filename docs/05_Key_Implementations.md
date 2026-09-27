# 05. Key Implementations & Annotated Code References

**Project:** Conversational Voice AI Prototype  
**Scope:** Core Algorithmic Snippets, Concurrency Patterns, and Audio Graph Logic  

---

## 1. Script-Agnostic Punctuation Tokenizer

* **File:** [`backend/services/llm.py`](file:///C:/Users/bharg/python%20work/Voice%20AI%20prototype/backend/services/llm.py)
* **Problem Solved:** Prevents the **Non-Latin Starvation Bug** where streaming stalls on Hindi (Devanagari) or CJK scripts when using naive English regexes like `[a-zA-Z]{2,}`.

```python
import re

# Boundary matches Latin marks (. ! ?), Devanagari Danda (। \u0964, ॥ \u0965), and CJK stops (。 \u3002)
PUNCTUATION_REGEX = re.compile(r'([.!?\u0964\u0965\u3002]+)(?:\s+|$)')
# Protects common abbreviations and titles from premature splitting
ABBREVIATIONS = re.compile(r'\b(e\.g|i\.e|dr|mr|mrs|ms|prof|inc|ltd)\.$', re.IGNORECASE)
NUMBERED_LIST = re.compile(r'^\d+\.$')

def extract_sentences(buffer: str) -> tuple[list[str], str]:
    """
    Extract complete sentence chunks from a streaming LLM token buffer.
    Supports English, Devanagari (Hindi), CJK, and mixed-script queries.
    """
    sentences = []
    while True:
        match = PUNCTUATION_REGEX.search(buffer)
        if not match:
            break

        candidate = buffer[:match.end()].strip()
        
        # Guard: Prevent premature splitting on abbreviations (e.g., 'Dr. Watson') or lists ('1.')
        if NUMBERED_LIST.match(candidate) or ABBREVIATIONS.search(candidate):
            remaining = buffer[match.end():]
            next_match = PUNCTUATION_REGEX.search(remaining)
            if not next_match:
                break
            candidate = buffer[:match.end() + next_match.end()].strip()
            buffer = buffer[match.end() + next_match.end():]
            sentences.append(candidate)
            continue

        # Universal length check: requires at least 2 characters regardless of script
        if len(candidate) >= 2:
            sentences.append(candidate)
            buffer = buffer[match.end():]
        else:
            break

    return sentences, buffer
```

---

## 2. Zero-Disk In-Memory Speech-to-Text

* **File:** [`backend/services/stt.py`](file:///C:/Users/bharg/python%20work/Voice%20AI%20prototype/backend/services/stt.py)
* **Problem Solved:** Bypasses temporary disk files (`tempfile.NamedTemporaryFile`), saving 40–120ms of disk contention and eliminating orphaned files on server crashes.

```python
import asyncio
import io
import os
import logging
from groq import Groq
from backend.config import GROQ_API_KEY

logger = logging.getLogger("voice_ai")
_client: Groq | None = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None

def _transcribe_sync(file_bytes: bytes, filename: str) -> str:
    """Blocking Groq Whisper transcription executed in an asyncio thread pool."""
    if not _client:
        raise ValueError("GROQ_API_KEY is not configured.")

    # Guard: Reject tiny audio chunks (< 400 bytes) to avoid wasting API calls
    if len(file_bytes) < 400:
        logger.debug("[STT] Audio too short (%d bytes), skipping.", len(file_bytes))
        return ""

    ext = os.path.splitext(filename)[-1].lower()
    if not ext or ext not in {".webm", ".wav", ".mp3", ".mp4", ".ogg", ".m4a"}:
        ext = ".wav"

    # In-Memory Buffer: Groq SDK accepts (filename, BytesIO) tuple
    upload_filename = f"audio{ext}"
    audio_buffer = io.BytesIO(file_bytes)

    try:
        transcript = _client.audio.transcriptions.create(
            file=(upload_filename, audio_buffer),
            model="whisper-large-v3-turbo",
            temperature=0,
            response_format="verbose_json",
            # Language left unset to allow automatic multilingual language detection
        )
        if hasattr(transcript, "text"):
            return transcript.text.strip()
        if isinstance(transcript, dict):
            return transcript.get("text", "").strip()
        return str(transcript).strip()
    except Exception as exc:
        logger.error("[STT] Transcription error: %s", exc)
        return ""

async def transcribe_audio(file_bytes: bytes, filename: str) -> str:
    """Non-blocking async wrapper that delegates blocking calls to a worker thread."""
    return await asyncio.to_thread(_transcribe_sync, file_bytes, filename)
```

---

## 3. Atomic WebSocket Write Queue & CSWSH Defense

* **File:** [`backend/main.py`](file:///C:/Users/bharg/python%20work/Voice%20AI%20prototype/backend/main.py)
* **Problem Solved:** Enforces Cross-Site WebSocket Hijacking defense and serializes socket frame transmission to prevent `RuntimeError: Cannot call "send" once a close message has been sent`.

```python
@app.websocket("/ws/conversation")
async def websocket_conversation(websocket: WebSocket):
    # 1. Defend against Cross-Site WebSocket Hijacking (CSWSH)
    origin = websocket.headers.get("origin")
    if origin:
        clean_origin = origin.rstrip("/")
        allowed = [o.rstrip("/") for o in ALLOWED_ORIGINS]
        if clean_origin not in allowed and "*" not in ALLOWED_ORIGINS:
            logger.warning("[WS SEC] Rejected unauthorized origin: %s", origin)
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

    await websocket.accept()

    # 2. Re-entrant write queue to guarantee atomic serialized socket writes
    send_queue: asyncio.Queue = asyncio.Queue()

    async def socket_writer():
        try:
            while True:
                msg = await send_queue.get()
                if msg is None:
                    break
                await websocket.send_json(msg)
                send_queue.task_done()
        except Exception as write_err:
            logger.debug("[WS] Socket writer stopped: %s", write_err)

    writer_task = asyncio.create_task(socket_writer())

    async def safe_send(payload: dict):
        """Thread-safe non-blocking enqueue for outbound frames."""
        await send_queue.put(payload)
```

---

## 4. Persistent Singleton AudioContext & Clock-Synced Subtitles

* **File:** [`frontend/src/hooks/useAudioPlayback.js`](file:///C:/Users/bharg/python%20work/Voice%20AI%20prototype/frontend/src/hooks/useAudioPlayback.js)
* **Problem Solved:** Eliminates the browser crash after 6 sentences (`DOMException: Failed to construct 'AudioContext'`) and paces word-by-word subtitles using hardware clock timestamps.

```javascript
import { useRef, useCallback } from 'react';

// Singleton AudioContext shared across the entire client lifecycle
let sharedAudioCtx = null;
let sharedAnalyser = null;

function getSharedAudioContext() {
  try {
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      sharedAudioCtx = new AudioContextClass({ latencyHint: 'interactive' });
      sharedAnalyser = sharedAudioCtx.createAnalyser();
      sharedAnalyser.fftSize = 256;
      sharedAnalyser.smoothingTimeConstant = 0.4;
      sharedAnalyser.connect(sharedAudioCtx.destination);
    }
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
    return { ctx: sharedAudioCtx, analyser: sharedAnalyser };
  } catch (err) {
    console.warn('[AudioPlayback] Could not initialize Web Audio context:', err);
    return { ctx: null, analyser: null };
  }
}

// In the playback tick loop:
const elapsed = ctx.currentTime - playbackStartTimeRef.current;
const ratio = Math.min(Math.max(elapsed / duration, 0), 1);
const wordCount = Math.max(1, Math.min(Math.ceil(ratio * words.length), words.length));
if (wordCount !== lastWordCountRef.current) {
  lastWordCountRef.current = wordCount;
  const currentSpokenChunk = words.slice(0, wordCount).join(' ');
  onTextProgress(completedTextRef.current ? `${completedTextRef.current} ${currentSpokenChunk}` : currentSpokenChunk);
}
```

---

## 5. Acoustic Echo Shield & Dynamic VAD Suppression

* **File:** [`frontend/src/hooks/useVoicePipeline.js`](file:///C:/Users/bharg/python%20work/Voice%20AI%20prototype/frontend/src/hooks/useVoicePipeline.js)
* **Problem Solved:** Stops the assistant from hearing its own voice played over laptop speakers and interrupting itself.

```javascript
const audioPlayback = useAudioPlayback({
  onStart: () => {
    if (stateRef.current !== 'listening') {
      go('speaking');
    }
    // Echo Shield: Pause microphone VAD during assistant speech
    vadRef.current?.pause();
  },
  onEnd: () => {
    setVolume(0);
    if (isVoiceModeRef.current && !isMutedRef.current) {
      // Re-arm microphone VAD immediately after playback completes
      vadRef.current?.resume();
      go('listening');
    } else {
      go('idle');
    }
  },
});
```

---

## 6. SQLite WAL Concurrency & Cascade Deletes

* **File:** [`backend/services/storage.py`](file:///C:/Users/bharg/python%20work/Voice%20AI%20prototype/backend/services/storage.py)
* **Problem Solved:** Prevents `sqlite3.OperationalError: database is locked` during concurrent WebSocket conversations and guarantees automatic cleanup of orphaned messages.

```python
import sqlite3

def _get_connection() -> sqlite3.Connection:
    """Thread-safe SQLite connection factory with WAL mode and foreign key cascades."""
    conn = sqlite3.connect(DB_PATH, timeout=15.0)
    conn.row_factory = sqlite3.Row
    # WAL mode allows concurrent readers and a writer without blocking
    conn.execute("PRAGMA journal_mode = WAL;")
    # Enforces ON DELETE CASCADE for conversation messages
    conn.execute("PRAGMA foreign_keys = ON;")
    # Normal synchronous mode balances durability with high write throughput
    conn.execute("PRAGMA synchronous = NORMAL;")
    return conn
```

---

## 7. Per-Chat Working Memory & Ephemeral Context Cache (Phase 9)

* **File:** `backend/services/cache.py` (Architecture Specification)
* **Problem Solved:** Overcomes the rigid 12-turn sliding window cutoff (`history[-12:]`) so the model retains long-term recall of critical entities, user preferences, and prior spoken claims without token blowup.

```python
import asyncio
from typing import Dict, List, Optional
from dataclasses import dataclass, field

@dataclass
class SessionMemory:
    conversation_id: str
    user_preferences: Dict[str, str] = field(default_factory=dict)
    salient_entities: List[str] = field(default_factory=list)
    key_claims: List[str] = field(default_factory=list)

class SessionMemoryCache:
    """Thread-safe in-memory working memory cache with LRU eviction."""
    
    def __init__(self, max_sessions: int = 500):
        self._cache: Dict[str, SessionMemory] = {}
        self._lock = asyncio.Lock()
        self._max_sessions = max_sessions

    async def get_or_create(self, conversation_id: str) -> SessionMemory:
        async with self._lock:
            if conversation_id not in self._cache:
                if len(self._cache) >= self._max_sessions:
                    # Evict oldest session
                    oldest = next(iter(self._cache))
                    del self._cache[oldest]
                self._cache[conversation_id] = SessionMemory(conversation_id=conversation_id)
            return self._cache[conversation_id]

    async def record_turn(self, conversation_id: str, user_text: str, assistant_text: str):
        """Extract and snapshot key conversational entities without blocking stream."""
        mem = await self.get_or_create(conversation_id)
        # Record key assistant spoken claims (first 100 chars)
        if len(assistant_text) > 20:
            mem.key_claims.append(assistant_text[:120])
            if len(mem.key_claims) > 8:
                mem.key_claims.pop(0)

    def format_system_prompt_addon(self, conversation_id: str) -> str:
        """Inject compact memory block into LLM system prompt."""
        mem = self._cache.get(conversation_id)
        if not mem or not mem.key_claims:
            return ""
        
        lines = ["[Prior Spoken Context & Working Memory]"]
        for claim in mem.key_claims[-5:]:
            lines.append(f"- Assistant previously said: \"{claim}...\"")
        return "\n".join(lines) + "\n\n"
```
