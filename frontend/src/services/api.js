/**
 * API service layer — all fetch calls to FastAPI.
 *
 * SECURITY: The browser never touches Groq API keys.
 *   Browser → /api/* (FastAPI proxy via Vite in dev) → Groq
 *
 * All endpoints return JSON except /api/tts which returns audio/mpeg.
 */

const BASE = import.meta.env.VITE_API_URL ?? '';

/** Shared error extractor */
async function handleError(res) {
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch { /* ignore parse errors */ }
    throw new Error(detail);
  }
  return res;
}

/**
 * POST /api/transcribe
 * Sends browser audio (WebM/Opus) → returns { text: string }
 */
export async function transcribe(audioBlob, signal) {
  if (!audioBlob || audioBlob.size < 400) {
    return { text: '' };
  }

  const form = new FormData();
  const filename = audioBlob.type?.includes('webm') ? 'audio.webm'
    : audioBlob.type?.includes('wav')               ? 'audio.wav'
    : 'audio.wav';
  form.append('audio', audioBlob, filename);

  const res = await fetch(`${BASE}/api/transcribe`, { method: 'POST', body: form, signal });
  await handleError(res);
  return res.json(); // { text }
}


/**
 * POST /api/tts
 * Sends { text, voice? } → returns audio Blob (audio/mpeg)
 */
export async function tts(text, voice) {
  const res = await fetch(`${BASE}/api/tts`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ text, voice: voice || undefined }),
  });
  await handleError(res);
  return res.blob(); // MP3 blob
}

/**
 * Helper to convert base64 MP3 string to Blob
 */
export function base64ToBlob(base64, contentType = 'audio/mpeg') {
  const byteCharacters = atob(base64);
  const byteArrays = [];
  const sliceSize = 512;

  for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
    const slice = byteCharacters.slice(offset, offset + sliceSize);
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    byteArrays.push(new Uint8Array(byteNumbers));
  }
  return new Blob(byteArrays, { type: contentType });
}

/** GET /api/health → { status: "ok" } */
export async function health() {
  const res = await fetch(`${BASE}/api/health`);
  await handleError(res);
  return res.json();
}

/**
 * Speech-to-Speech Conversation Storage APIs
 */

// getConversations: Fetches all stored voice session summaries from the backend SQLite database.
export async function getConversations() {
  const res = await fetch(`${BASE}/api/conversations`);
  await handleError(res);
  const data = await res.json();
  return data.conversations || [];
}

export async function getConversation(id) {
  const res = await fetch(`${BASE}/api/conversations/${id}`);
  await handleError(res);
  return res.json();
}

// createConversation: Pre-creates a new conversational speech session in backend storage.
export async function createConversation(title, id) {
  const res = await fetch(`${BASE}/api/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, id }),
  });
  await handleError(res);
  return res.json();
}

// deleteConversation: Removes a session and all its messages with cascading delete from backend SQLite.
export async function deleteConversation(id) {
  const res = await fetch(`${BASE}/api/conversations/${id}`, {
    method: 'DELETE',
  });
  await handleError(res);
  return res.json();
}

/**
 * Creates a bidirectional WebSocket connection to /ws/conversation
 * Handles continuous speech-to-speech lifecycle, barge-in, and auto-reconnection.
 */
// createVoiceSocket: Manages the bidirectional WebSocket connection lifecycle, handling automatic 20s keepalive pings and typed message event dispatching.
export function createVoiceSocket({
  conversationId,
  history = [],
  onTranscript,
  onSentence,
  onDone,
  onInterrupted,
  onError,
  onOpen,
  onClose,
}) {
  const wsUrl = import.meta.env.VITE_WS_URL || (() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    return `${protocol}//${host}/ws/conversation`;
  })();

  let ws = null;
  let isClosedManually = false;
  let pingInterval = null;

  try {
    ws = new WebSocket(wsUrl);
  } catch (err) {
    onError?.(err);
    return null;
  }

  ws.onopen = () => {
    // Handshake with current session context
    ws.send(JSON.stringify({
      type: 'init',
      conversation_id: conversationId,
      history,
    }));
    onOpen?.();

    // 20s keepalive ping
    pingInterval = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 20000);
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      switch (data.type) {
        case 'transcript':
          onTranscript?.(data);
          break;
        case 'sentence': {
          const audioBlob = data.audio ? base64ToBlob(data.audio, 'audio/mpeg') : null;
          onSentence?.({ index: data.index, text: data.text, audioBlob });
          break;
        }
        case 'done':
          onDone?.(data);
          break;
        case 'interrupted':
          onInterrupted?.();
          break;
        case 'error':
          onError?.(new Error(data.message || 'WebSocket error from server'));
          break;
        case 'pong':
          break;
        default:
          console.debug('[WS] Message:', data);
      }
    } catch (err) {
      console.warn('[WS] Parse error on incoming frame:', err);
    }
  };

  ws.onerror = (event) => {
    console.error('[WS] Socket error event:', event);
    onError?.(new Error('WebSocket connection error'));
  };

  ws.onclose = (event) => {
    clearInterval(pingInterval);
    if (!isClosedManually) {
      onClose?.(event);
    }
  };

  return {
    sendAudio(blob) {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        throw new Error('WebSocket is not connected');
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64Data = reader.result.split(',')[1];
        ws.send(JSON.stringify({
          type: 'audio_input',
          audio: base64Data,
        }));
      };
      reader.readAsDataURL(blob);
    },
    interrupt() {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'interrupt' }));
      }
    },
    updateSession(newId, newHistory = []) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'init',
          conversation_id: newId,
          history: newHistory,
        }));
      }
    },
    close() {
      isClosedManually = true;
      clearInterval(pingInterval);
      if (ws) {
        ws.close();
      }
    },
    get isConnected() {
      return ws && ws.readyState === WebSocket.OPEN;
    },
  };
}


