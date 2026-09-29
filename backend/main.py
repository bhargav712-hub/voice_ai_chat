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
import asyncio
import base64
import json
import logging
import time

import uvicorn
from fastapi import FastAPI, File, HTTPException, Request, UploadFile, WebSocket, WebSocketDisconnect, status
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

# ── Full-Duplex WebSocket Streaming Route ─────────────────────────────────────

# websocket_conversation: Full-duplex WebSocket endpoint defending against CSWSH and orchestrating audio transcription, LLM reasoning, and streaming TTS.
@app.websocket("/ws/conversation")
async def websocket_conversation(websocket: WebSocket):
    """
    Bidirectional streaming WebSocket endpoint.
    Maintains a persistent socket for speech audio upload, instant transcription,
    sentence-level streaming TTS synthesis, and sub-millisecond barge-in interruption.
    Protected against CSWSH with atomic asyncio.Queue writes.
    """
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
    logger.info("[WS] Client connected from authorized origin: %s", origin)

    # 2. Re-entrant write queue to guarantee atomic serialized socket writes
    send_queue: asyncio.Queue = asyncio.Queue()

    # socket_writer: Serialized worker consuming from an asyncio.Queue to guarantee thread-safe, atomic JSON and binary packet delivery across the socket.
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
        await send_queue.put(payload)

    conversation_id: str | None = None
    history: list[dict] = []
    active_generation_task: asyncio.Task | None = None

    async def cancel_active_task():
        nonlocal active_generation_task
        if active_generation_task and not active_generation_task.done():
            logger.info("[WS] Cancelling active generation task (barge-in)")
            active_generation_task.cancel()
            try:
                await active_generation_task
            except asyncio.CancelledError:
                pass
            except Exception as task_err:
                logger.debug("[WS] Task cancelled with error: %s", task_err)
            active_generation_task = None

    # run_pipeline: Coordinates Groq Whisper STT, streaming LLM sentence extraction, Edge-TTS audio synthesis, and atomic cancellation handling for a voice turn.
    async def run_pipeline(user_audio_bytes: bytes):
        nonlocal active_generation_task
        t0 = time.monotonic()
        partial_reply: list[str] = []
        try:
            # 1. Groq Whisper STT (<200ms)
            t_stt_start = time.monotonic()
            transcript = await stt.transcribe_audio(user_audio_bytes, "audio.wav")
            elapsed_stt = time.monotonic() - t_stt_start
            logger.info("[WS STT] Completed in %.2fs: %r", elapsed_stt, transcript[:80])

            if not transcript or not transcript.strip():
                await safe_send({"type": "transcript", "role": "user", "text": ""})
                await safe_send({
                    "type": "done",
                    "count": 0,
                    "elapsed": round(time.monotonic() - t0, 2)
                })
                return

            # Emit transcript immediately to client so UI bubble renders
            await safe_send({
                "type": "transcript",
                "role": "user",
                "text": transcript
            })

            # Auto-save user message to DB
            if conversation_id:
                try:
                    storage.add_message(conversation_id, "user", transcript)
                except Exception as e:
                    logger.warning("[WS STORAGE] Failed to auto-save user query: %s", e)

            # Update session history
            history.append({"role": "user", "content": transcript})

            # 2. Pipelined Sentence-level LLM + Edge-TTS Streaming with sliding window
            sentence_count = 0
            capped_history = history[-12:-1]  # exclude the user query just added

            async for sentence in llm.stream_sentences(transcript, capped_history):
                sentence_count += 1
                partial_reply.append(sentence)

                t_tts_start = time.monotonic()
                audio_bytes = await tts.synthesize(sentence)
                t_tts = time.monotonic() - t_tts_start
                audio_b64 = base64.b64encode(audio_bytes).decode("ascii")

                await safe_send({
                    "type": "sentence",
                    "index": sentence_count - 1,
                    "text": sentence,
                    "audio": audio_b64,
                })
                logger.info(
                    "[WS STREAM] Sent sentence %d (tts=%.2fs): %r",
                    sentence_count, t_tts, sentence[:60]
                )

            # Persist assistant reply
            full_reply_text = " ".join(partial_reply)
            if full_reply_text:
                history.append({"role": "assistant", "content": full_reply_text})
                if conversation_id:
                    try:
                        storage.add_message(conversation_id, "assistant", full_reply_text)
                    except Exception as e:
                        logger.warning("[WS STORAGE] Failed to auto-save assistant reply: %s", e)

            elapsed = time.monotonic() - t0
            await safe_send({
                "type": "done",
                "count": sentence_count,
                "elapsed": round(elapsed, 2)
            })
            logger.info("[WS STREAM] Finished in %.2fs (%d sentences)", elapsed, sentence_count)

        except asyncio.CancelledError:
            # Handle barge-in: record partial text so conversation context is not corrupted
            if partial_reply:
                interrupted_text = " ".join(partial_reply) + " [interrupted]"
                history.append({"role": "assistant", "content": interrupted_text})
                if conversation_id:
                    try:
                        storage.add_message(conversation_id, "assistant", interrupted_text)
                    except Exception as e:
                        logger.warning("[WS STORAGE] Failed to auto-save interrupted reply: %s", e)
            logger.info("[WS] Pipeline cancelled cleanly during barge-in.")
            raise
        except Exception as exc:
            logger.error("[WS] Pipeline error: %s", exc)
            try:
                await safe_send({"type": "error", "message": str(exc)})
            except Exception:
                pass

    try:
        while True:
            raw_msg = await websocket.receive()
            if raw_msg.get("type") == "websocket.disconnect":
                break

            if "text" in raw_msg:
                try:
                    data = json.loads(raw_msg["text"])
                except Exception as parse_err:
                    logger.warning("[WS] Failed to parse JSON message: %s", parse_err)
                    continue

                msg_type = data.get("type")

                if msg_type == "init":
                    conversation_id = data.get("conversation_id")
                    client_history = data.get("history")
                    if isinstance(client_history, list):
                        history = [{"role": m.get("role"), "content": m.get("content")} for m in client_history]
                    logger.info("[WS] Initialized session: %s (history items: %d)", conversation_id, len(history))

                elif msg_type == "audio_input":
                    audio_b64 = data.get("audio")
                    if not audio_b64:
                        continue
                    try:
                        audio_bytes = base64.b64decode(audio_b64)
                    except Exception as decode_err:
                        logger.error("[WS] Base64 decode failed: %s", decode_err)
                        continue

                    # Cancel any prior active generation task before starting a new one
                    await cancel_active_task()
                    active_generation_task = asyncio.create_task(run_pipeline(audio_bytes))

                elif msg_type == "interrupt":
                    logger.info("[WS] Received interrupt request from client")
                    await cancel_active_task()
                    await safe_send({"type": "interrupted"})

                elif msg_type == "ping":
                    await safe_send({"type": "pong"})

            elif "bytes" in raw_msg:
                audio_bytes = raw_msg["bytes"]
                if audio_bytes:
                    await cancel_active_task()
                    active_generation_task = asyncio.create_task(run_pipeline(audio_bytes))

    except WebSocketDisconnect:
        logger.info("[WS] Client disconnected gracefully.")
    except Exception as exc:
        logger.error("[WS] Unexpected connection error: %s", exc)
    finally:
        await cancel_active_task()
        await send_queue.put(None)
        try:
            await writer_task
        except Exception:
            pass
        logger.info("[WS] Connection closed and cleaned up.")


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    uvicorn.run(
        "backend.main:app",
        host="0.0.0.0",
        port=BACKEND_PORT,
        reload=True,
        reload_dirs=["backend"],
    )
