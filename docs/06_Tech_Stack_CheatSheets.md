# 06. Tech Stack Syntax & API Cheat Sheets

**Project:** Conversational Voice AI Prototype  
**Scope:** Authoritative Syntax Guides for FastAPI, Web Audio, Groq, Silero, and Edge-TTS  

---

## 1. FastAPI & Starlette WebSockets

```python
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, status

app = FastAPI()

@app.websocket("/ws/channel")
async def websocket_handler(websocket: WebSocket):
    # 1. Inspect headers during handshake
    origin = websocket.headers.get("origin")
    
    # 2. Accept or reject connection
    if not is_allowed(origin):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    await websocket.accept()

    try:
        while True:
            # 3. Receive typed message (JSON or text)
            data = await websocket.receive_json()
            
            # 4. Send response frame
            await websocket.send_json({"type": "ack", "payload": data})
    except WebSocketDisconnect:
        # 5. Handle clean client disconnect
        logger.info("Client closed socket")
    finally:
        # 6. Cleanup background tasks
        cleanup_resources()
```

---

## 2. Web Audio API & Volume Telemetry

```javascript
// 1. Initialize persistent AudioContext
const AudioContextClass = window.AudioContext || window.webkitAudioContext;
const ctx = new AudioContextClass({ latencyHint: 'interactive' });

// 2. Create and configure AnalyserNode for volume analysis
const analyser = ctx.createAnalyser();
analyser.fftSize = 256;                  // Frequency bin resolution
analyser.smoothingTimeConstant = 0.4;    // Smooth out transient spikes
analyser.connect(ctx.destination);

// 3. Connect HTML5 Audio element to Web Audio graph
const audio = new Audio(audioUrl);
const source = ctx.createMediaElementSource(audio);
source.connect(analyser);

// 4. Calculate RMS (Root Mean Square) volume in requestAnimationFrame
const data = new Float32Array(analyser.fftSize);
function getVolume() {
  analyser.getFloatTimeDomainData(data);
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i] * data[i];
  }
  const rms = Math.sqrt(sum / data.length);
  return Math.min(rms * 4.2, 1); // Normalized 0.0 to 1.0
}
```

---

## 3. Groq Python SDK (Whisper & LPU Streaming)

```python
from groq import Groq, AsyncGroq
import io

# 1. In-Memory Groq Whisper STT (Sync in Thread Pool)
client = Groq(api_key="gsk_...")

def transcribe(audio_bytes: bytes) -> str:
    audio_buffer = io.BytesIO(audio_bytes)
    res = client.audio.transcriptions.create(
        file=("audio.wav", audio_buffer),
        model="whisper-large-v3-turbo",
        temperature=0,
        response_format="verbose_json",
    )
    return res.text

# 2. Low-Latency Streaming LLM (AsyncGroq)
async_client = AsyncGroq(api_key="gsk_...")

async def stream_tokens(prompt: str, history: list[dict]):
    stream = await async_client.chat.completions.create(
        model="qwen/qwen3.8-27b",
        messages=[{"role": "system", "content": "You are a voice AI."}] + history + [{"role": "user", "content": prompt}],
        stream=True,
        temperature=0.6,
        max_tokens=1024,
    )
    async for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta
```

---

## 4. Silero VAD WebAssembly (`@ricky0123/vad-web`)

```javascript
import { MicVAD } from '@ricky0123/vad-web';

const vad = await MicVAD.new({
  // 1. Static asset paths for browser Web Workers
  onnxWASMBasePath: '/wasm/',
  baseAssetPath: '/wasm/',

  // 2. Sensitivity and duration thresholds
  positiveSpeechThreshold: 0.72,  // Confidence required to trigger speech start
  negativeSpeechThreshold: 0.50,  // Confidence drop to begin silence countdown
  minSpeechFrames: 14,             // Minimum consecutive speech frames (~448ms)
  redemptionFrames: 25,            // Silence frames tolerated before ending turn (~800ms)

  // 3. Lifecycle callbacks
  onSpeechStart: () => {
    console.log("User started speaking");
  },
  onSpeechEnd: (audio) => {
    // audio is a Float32Array at 16,000 Hz
    const wavBlob = utils.encodeWAV(audio);
    sendAudioToBackend(wavBlob);
  },
});

vad.start();
```

---

## 5. Microsoft Edge-TTS (Python Async Engine)

```python
import edge_tts

async def synthesize_sentence(text: str, voice: str = "en-US-GuyNeural") -> bytes:
    # 1. Detect language script dynamically
    is_hindi = any('\u0900' <= char <= '\u097F' for char in text)
    chosen_voice = "hi-IN-SwaraNeural" if is_hindi else voice

    # 2. Stream synthesized MP3 chunks
    communicate = edge_tts.Communicate(text, voice=chosen_voice)
    audio_chunks = []
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_chunks.append(chunk["data"])

    return b"".join(audio_chunks)
```

---

## 6. SQLite3 Concurrency & Pragmas (Python)

```python
import sqlite3

def get_db(db_path: str = "conversations.db") -> sqlite3.Connection:
    conn = sqlite3.connect(db_path, timeout=15.0)
    conn.row_factory = sqlite3.Row  # Dict-like row access
    
    # Critical Production Pragmas:
    conn.execute("PRAGMA journal_mode = WAL;")        # Write-Ahead Logging
    conn.execute("PRAGMA foreign_keys = ON;")         # Referential integrity
    conn.execute("PRAGMA synchronous = NORMAL;")      # Fast sync for WAL mode
    conn.execute("PRAGMA cache_size = -64000;")       # 64MB memory page cache
    return conn
```

---

## 7. PyTorch Audio & ONNX Runtime (Python / WebAssembly)

```python
import torch
import numpy as np

# 1. Convert raw 16-bit PCM bytes to Normalized Float32 Tensor (-1.0 to 1.0)
def pcm_bytes_to_tensor(pcm_bytes: bytes) -> torch.Tensor:
    int16_data = np.frombuffer(pcm_bytes, dtype=np.int16)
    float32_data = int16_data.astype(np.float32) / 32768.0
    return torch.from_numpy(float32_data).unsqueeze(0)  # Shape: (1, num_samples)

# 2. Silero VAD Model Input Dimensions
# Silero v5 expects 512 samples per chunk at 16kHz (32ms per window)
# Tensor shape: (batch_size, samples) -> (1, 512)
sample_chunk = torch.randn(1, 512, dtype=torch.float32)

# 3. Exporting PyTorch Model to ONNX for Browser Web Workers
def export_model_to_onnx(torch_model, output_path="silero_vad.onnx"):
    torch_model.eval()
    dummy_input = torch.randn(1, 512, dtype=torch.float32)
    torch.onnx.export(
        torch_model,
        dummy_input,
        output_path,
        export_params=True,
        opset_version=17,
        do_constant_folding=True,
        input_names=["input"],
        output_names=["output", "state"],
        dynamic_axes={"input": {1: "sequence_length"}}
    )
```

---

## 8. Docker & Container Networking for Real-Time Voice

```bash
# 1. Multi-Stage Build with BuildKit Caching
docker build --build-arg BUILDKIT_INLINE_CACHE=1 -t voice-ai-app:latest .

# 2. Running Container with Persistent Storage Mount & Port Forwarding
docker run -d \
  --name voice_ai_instance \
  -p 8000:8000 \
  --env-file .env \
  -v $(pwd)/data:/app/data \
  --restart unless-stopped \
  voice-ai-app:latest

# 3. Inspect Container Resource Usage (CPU & Memory Limits)
docker stats voice_ai_instance

# 4. Nginx WebSocket Proxy Headers (Critical for avoiding 1006 / 502 socket drops)
# Inside /etc/nginx/conf.d/default.conf:
# proxy_http_version 1.1;
# proxy_set_header Upgrade $http_upgrade;
# proxy_set_header Connection "Upgrade";
# proxy_read_timeout 3600s;
```
