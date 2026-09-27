# 04. Codebase Boilerplate & Environment Setup

**Project:** Conversational Voice AI Prototype  
**Scope:** Configuration Templates, Dependency Manifests, and Starter Code  

---

## 1. Environment Configuration (`.env.example`)

Create a `.env` file in the project root directory based on the template below:

```bash
# ── Groq API Configuration ───────────────────────────────────────────────────
# Get a free tier key from https://console.groq.com/keys
GROQ_API_KEY=gsk_your_groq_api_key_here

# Groq LLM model selection:
# Options: qwen/qwen3.8-27b, llama-3.3-70b-versatile, openai/gpt-oss-120b
GROQ_LLM_MODEL=qwen/qwen3.8-27b

# ── Edge TTS Configuration ───────────────────────────────────────────────────
# Default neural voice for English speech:
# Options: en-US-GuyNeural (natural male), en-US-AriaNeural (female), en-GB-SoniaNeural
TTS_VOICE=en-US-GuyNeural

# ── Server Gateway Configuration ─────────────────────────────────────────────
# Local port for the FastAPI backend server (default: 8000)
BACKEND_PORT=8000

# Comma-separated list of allowed origins for CORS and WebSocket handshake checks.
# In development, Vite runs on http://localhost:5173
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

---

## 2. Backend Dependencies (`requirements.txt`)

```text
fastapi>=0.115.0
uvicorn[standard]>=0.32.0
groq>=0.11.0
edge-tts>=6.1.12
python-dotenv>=1.0.1
pydantic>=2.9.0
httpx>=0.27.0
pytest>=8.1.0
pytest-asyncio>=0.24.0
```

### Installation Command:
```powershell
python -m pip install -r requirements.txt
```

---

## 3. Frontend Dependencies (`package.json`)

```json
{
  "name": "frontend",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "lint": "oxlint src",
    "preview": "vite preview"
  },
  "dependencies": {
    "@ricky0123/vad-web": "^0.0.31",
    "@tailwindcss/vite": "^4.3.3",
    "lucide-react": "^1.47.0",
    "onnxruntime-web": "^1.30.0",
    "react": "^19.2.8",
    "react-dom": "^19.2.8",
    "tailwindcss": "^4.3.3"
  },
  "devDependencies": {
    "@types/react": "^19.2.18",
    "@types/react-dom": "^19.2.7",
    "@vitejs/plugin-react": "^6.1.1",
    "oxlint": "^1.81.0",
    "vite": "^8.3.0"
  }
}
```

### Installation Command:
```powershell
cd frontend
npm install
```

---

## 4. Vite Configuration (`frontend/vite.config.js`)

Vite must be configured with Cross-Origin Opener Policy (COOP) and Cross-Origin Embedder Policy (COEP) headers so that ONNX Runtime Web can leverage multi-threaded WebAssembly (`SharedArrayBuffer`).

```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    // Development middleware to serve ONNX runtime WASM assets dynamically
    {
      name: 'serve-ort-wasm',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url && req.url.startsWith('/wasm/')) {
            const fileName = req.url.replace('/wasm/', '').split('?')[0];
            const filePath = path.resolve(__dirname, 'node_modules/onnxruntime-web/dist', fileName);
            if (fs.existsSync(filePath)) {
              if (fileName.endsWith('.wasm')) {
                res.setHeader('Content-Type', 'application/wasm');
              } else if (fileName.endsWith('.mjs') || fileName.endsWith('.js')) {
                res.setHeader('Content-Type', 'application/javascript');
              }
              return fs.createReadStream(filePath).pipe(res);
            }
          }
          next();
        });
      },
    },
  ],
  server: {
    port: 5173,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 1200,
  },
});
```

---

## 5. Minimal Server Starter Skeleton (`backend/main.py`)

A minimal working skeleton demonstrating WebSocket endpoint registration and CORS middleware:

```python
import logging
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from backend.config import ALLOWED_ORIGINS, BACKEND_PORT

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("voice_ai")

app = FastAPI(title="Voice AI Gateway", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "voice-ai-backend"}

@app.websocket("/ws/conversation")
async def websocket_endpoint(websocket: WebSocket):
    origin = websocket.headers.get("origin")
    if origin and origin not in ALLOWED_ORIGINS and "*" not in ALLOWED_ORIGINS:
        logger.warning("Rejected unauthorized origin: %s", origin)
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()
    logger.info("Client connected from: %s", origin)
    try:
        while True:
            data = await websocket.receive_json()
            if data.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        logger.info("Client disconnected.")
```

---

## 6. Multi-Stage Production Dockerfile (`Dockerfile`)

```dockerfile
# ── Stage 1: Build Frontend SPA ──────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# ── Stage 2: Production Python Backend & Static Gateway ──────────────────────
FROM python:3.11-slim AS runner

# Install system dependencies (build-essential and curl for healthchecks)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend codebase
COPY backend/ ./backend/
COPY .env.example .env

# Copy built frontend static bundle from Stage 1
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Create persistent storage directory for SQLite WAL database
RUN mkdir -p /app/data && chown -R 1000:1000 /app/data

# Run as non-root container user for security
USER 1000:1000

ENV PORT=8000
EXPOSE 8000

# Healthcheck probe for container orchestrators (Kubernetes / Docker Compose)
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

# Start FastAPI with Uvicorn ASGI server
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
```

---

## 7. Docker Compose Orchestration (`docker-compose.yml`)

```yaml
version: '3.8'

services:
  voice-ai-app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: voice_ai_prototype
    restart: unless-stopped
    ports:
      - "8000:8000"
    environment:
      - GROQ_API_KEY=${GROQ_API_KEY}
      - GROQ_LLM_MODEL=${GROQ_LLM_MODEL:-qwen/qwen3.8-27b}
      - TTS_VOICE=${TTS_VOICE:-en-US-GuyNeural}
      - BACKEND_PORT=8000
      - ALLOWED_ORIGINS=http://localhost:8000,http://localhost:5173
    volumes:
      # Persistent SQLite database volume mount across container restarts
      - voice_ai_data:/app/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/api/health"]
      interval: 15s
      timeout: 5s
      retries: 3
      start_period: 10s

volumes:
  voice_ai_data:
    driver: local
```
