"""
Lab 3: Minimal FastAPI Server-Sent Events (SSE) Server
------------------------------------------------------
Why this matters:
When a senior asks: "How does the backend stream sentence text and audio to React?",
you answer: "We use Server-Sent Events (SSE) via FastAPI's StreamingResponse with
text/event-stream headers, yielding structured data packets formatted as `event:` and `data:`."

To run this server:
  uvicorn practice_sandbox.lab3_minimal_fastapi_sse:app --reload --port 8005

Then open your browser or curl:
  http://localhost:8005/stream
"""
import asyncio
import json
import time
from fastapi import FastAPI
from fastapi.responses import StreamingResponse

app = FastAPI(title="SSE Practice Lab")

@app.get("/")
def home():
    return {
        "message": "Visit /stream in your browser or run curl -N http://localhost:8005/stream"
    }

@app.get("/stream")
async def sse_stream():
    """Yields SSE events one by one to show how streaming works over HTTP."""
    async def event_generator():
        sentences = [
            "Good morning! Let's understand full-duplex voice pipelines.",
            "Each sentence is sent as an independent SSE event.",
            "The client can parse each sentence and start audio playback right away.",
            "Finally, a done event signals the end of the response stream."
        ]
        
        for idx, sentence in enumerate(sentences):
            await asyncio.sleep(0.6)  # simulate LLM + TTS pipeline time
            payload = {
                "index": idx,
                "text": sentence,
                "simulated_audio_base64": "UklGRi4AAABXQVZFZm10..."
            }
            # SSE Standard Wire Format:
            # event: <event_name>\n
            # data: <json_string>\n\n
            yield f"event: sentence\ndata: {json.dumps(payload)}\n\n"
        
        # End of stream event
        yield f"event: done\ndata: {json.dumps({'status': 'finished'})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disables proxy buffering (e.g. Nginx)
        }
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("practice_sandbox.lab3_minimal_fastapi_sse:app", host="127.0.0.1", port=8005, reload=True)
