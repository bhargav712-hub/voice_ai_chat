"""
FastAPI application — Voice AI backend.

Routes
------
GET  /api/health      — liveness probe
POST /api/transcribe  — audio → transcript (Groq Whisper)
POST /api/chat        — text → LLM reply  (Groq LLM)
POST /api/tts         — text → MP3 audio  (Edge TTS)

Timing logs are printed at each stage so you can measure latency:

  [STT] Started
  [STT] Completed: 0.42s
  [LLM] Started
  [LLM] Completed: 0.71s
  [TTS] Started
  [TTS] Completed: 0.63s

Future: WebSocket /ws/conversation for streaming.
"""
import base64
import json
import logging
import time

import uvicorn
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse

from backend.config import ALLOWED_ORIGINS, BACKEND_PORT
from backend.schemas.chat import ChatRequest
from backend.schemas.tts import TTSRequest
from backend.services import llm, stt, storage, tts


# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  [%(name)s]  %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("voice_ai")

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Voice AI API",
    version="2.0.0",
    description="Conversational Voice AI — Groq Whisper + Groq LLM + Edge TTS",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    """Liveness probe — confirms the server is reachable."""
    return {"status": "ok"}


@app.post("/api/transcribe")
async def transcribe(audio: UploadFile = File(...)):
    """
    Accept browser audio (WebM/Opus by default from MediaRecorder) and
    return a transcript via Groq Whisper.
    """
    t0 = time.monotonic()
    logger.info("[STT] Started  —  file=%s  type=%s", audio.filename, audio.content_type)

    try:
        file_bytes = await audio.read()
        if not file_bytes:
            raise HTTPException(status_code=400, detail="Empty audio file received.")

        text = await stt.transcribe_audio(file_bytes, audio.filename or "audio.webm")
        elapsed = time.monotonic() - t0
        logger.info("[STT] Completed: %.2fs  —  %r", elapsed, text[:80])
        return {"text": text}

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("[STT] Failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Transcription failed: {exc}")


@app.post("/api/chat")
async def chat(req: ChatRequest):
    """
    Receive user message + conversation history, return LLM reply.
    History format: [{"role": "user"|"assistant", "content": "..."}]
    """
    t0 = time.monotonic()
    logger.info("[LLM] Started  —  message=%r", req.message[:80])

    try:
        history = [{"role": m.role, "content": m.content} for m in req.history]
        reply = await llm.generate_reply(req.message, history)
        elapsed = time.monotonic() - t0
        logger.info("[LLM] Completed: %.2fs  —  %r", elapsed, reply[:80])

        # Persist conversation if conversation_id provided
        if req.conversation_id:
            try:
                storage.add_message(req.conversation_id, "user", req.message)
                storage.add_message(req.conversation_id, "assistant", reply)
            except Exception as store_err:
                logger.warning("[STORAGE] Failed to auto-save chat message: %s", store_err)

        return {"reply": reply}

    except Exception as exc:
        logger.error("[LLM] Failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"LLM generation failed: {exc}")


@app.post("/api/chat-stream")
async def chat_stream(req: ChatRequest):
    """
    Sentence-level streaming conversation endpoint:
    Streams SSE events containing generated text sentences and their pre-synthesized
    MP3 audio (base64) as soon as each sentence finishes generation.
    Enables instant Time-To-First-Audio (< 800ms) and interruptibility.
    """
    logger.info("[STREAM] Started  —  message=%r", req.message[:80])
    history = [{"role": m.role, "content": m.content} for m in req.history]

    # Pre-save human voice instruction if session ID exists
    if req.conversation_id:
        try:
            storage.add_message(req.conversation_id, "user", req.message)
        except Exception as store_err:
            logger.warning("[STORAGE] Failed to auto-save user voice instruction: %s", store_err)

    async def event_generator():
        t0 = time.monotonic()
        sentence_count = 0
        full_assistant_reply: list[str] = []
        try:
            async for sentence in llm.stream_sentences(req.message, history):
                sentence_count += 1
                full_assistant_reply.append(sentence)
                t_tts_start = time.monotonic()
                audio_bytes = await tts.synthesize(sentence)
                t_tts = time.monotonic() - t_tts_start
                audio_b64 = base64.b64encode(audio_bytes).decode("ascii")

                payload = json.dumps({
                    "index": sentence_count - 1,
                    "text": sentence,
                    "audio": audio_b64,
                })
                yield f"event: sentence\ndata: {payload}\n\n"
                logger.info(
                    "[STREAM] Sent sentence %d (tts=%.2fs): %r",
                    sentence_count, t_tts, sentence[:60]
                )

            # Persist full assistant spoken response
            if req.conversation_id and full_assistant_reply:
                try:
                    storage.add_message(
                        req.conversation_id,
                        "assistant",
                        " ".join(full_assistant_reply)
                    )
                except Exception as store_err:
                    logger.warning("[STORAGE] Failed to auto-save assistant voice response: %s", store_err)

            elapsed = time.monotonic() - t0
            yield f"event: done\ndata: {json.dumps({'count': sentence_count, 'elapsed': round(elapsed, 2)})}\n\n"
            logger.info("[STREAM] Finished in %.2fs (%d sentences)", elapsed, sentence_count)

        except Exception as exc:
            logger.error("[STREAM] Error: %s", exc)
            yield f"event: error\ndata: {json.dumps({'error': str(exc)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ── Speech-to-Speech Conversation Storage Routes ──────────────────────────────

@app.get("/api/conversations")
async def list_conversations():
    """List all stored voice conversations with session metadata."""
    return {"conversations": storage.get_conversations()}


@app.get("/api/conversations/{conv_id}")
async def get_conversation(conv_id: str):
    """Retrieve full transcript of a specific speech-to-speech session."""
    conv = storage.get_conversation(conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation session not found.")
    return conv


@app.post("/api/conversations")
async def create_conversation_endpoint(req: Request):
    """Create a new conversation session."""
    try:
        body = await req.json()
    except Exception:
        body = {}
    title = body.get("title") if isinstance(body, dict) else None
    conv_id = body.get("id") if isinstance(body, dict) else None
    return storage.create_conversation(title=title, conv_id=conv_id)


@app.post("/api/conversations/{conv_id}/messages")
async def add_conversation_message(conv_id: str, req: Request):
    """Manually append a transcript message to a conversation."""
    body = await req.json()
    role = body.get("role", "user")
    content = body.get("content", "")
    if not content:
        raise HTTPException(status_code=400, detail="Content cannot be empty.")
    return storage.add_message(conv_id, role, content)


@app.delete("/api/conversations/{conv_id}")
async def delete_conversation_endpoint(conv_id: str):
    """Delete a conversation session and all its messages."""
    success = storage.delete_conversation(conv_id)
    return {"success": success}




@app.post("/api/tts")
async def text_to_speech(req: TTSRequest):
    """
    Convert assistant text to MP3 audio via Edge TTS.
    Returns raw audio/mpeg bytes the browser can play directly.
    """
    t0 = time.monotonic()
    logger.info("[TTS] Started  —  voice=%s  text=%r", req.voice, req.text[:60])

    try:
        audio_bytes = await tts.synthesize(req.text, req.voice)
        elapsed = time.monotonic() - t0
        logger.info("[TTS] Completed: %.2fs  —  %d bytes", elapsed, len(audio_bytes))
        return Response(content=audio_bytes, media_type="audio/mpeg")

    except Exception as exc:
        logger.error("[TTS] Failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"TTS synthesis failed: {exc}")


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    uvicorn.run(
        "backend.main:app",
        host="0.0.0.0",
        port=BACKEND_PORT,
        reload=True,
        reload_dirs=["backend"],
    )
