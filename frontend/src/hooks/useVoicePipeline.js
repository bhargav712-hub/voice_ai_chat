/**
 * useVoicePipeline — Full-duplex WebSocket conversational audio conductor.
 *
 * Implements:
 * - Lean WebSocket conductor pattern (resolving P-17 by extracting session persistence)
 * - State-Aware VAD Suppression & One-Click Voice Orb Barge-In (proven P-14 baseline)
 * - Automatic pause of neural VAD during assistant speech for 100% echo feedback immunity
 * - Seamless resumption of hands-free listening upon playback conclusion
 * - Authoritative neural speech state (isUserSpeaking) for the Voice Orb (P-16)
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { useVAD } from './useVAD';
import { useAudioPlayback } from './useAudioPlayback';
import * as api from '../services/api';

export function useVoicePipeline({
  sessionId,
  history = [],
  onUserTranscript,
  onAssistantSentence,
  onAssistantTextProgress,
  onAssistantDone,
} = {}) {
  const [isVoiceMode, setIsVoiceMode]       = useState(false);
  const [state, setState]                   = useState('idle'); // 'idle' | 'listening' | 'processing' | 'speaking' | 'error'
  const [isMuted, setIsMuted]               = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);  // Authoritative neural VAD indicator
  const [volume, setVolume]                 = useState(0);      // Active volume 0..1
  const [error, setError]                   = useState(null);

  const isVoiceModeRef       = useRef(false);
  const stateRef             = useRef('idle');
  const isMutedRef           = useRef(false);
  const streamRef            = useRef(null);
  const wsRef                = useRef(null);
  const vadRef               = useRef(null);
  const sessionIdRef         = useRef(sessionId);
  const historyRef           = useRef(history);

  // Keep session context refs in sync
  useEffect(() => {
    sessionIdRef.current = sessionId;
    historyRef.current = history;
    if (wsRef.current?.isConnected) {
      wsRef.current.updateSession(
        sessionId,
        history.map(m => ({ role: m.role, content: m.content }))
      );
    }
  }, [sessionId, history]);

  // go: Guardrail state machine transitioner that prevents redundant re-renders while keeping real-time audio refs synchronized with React UI state.
  const go = useCallback((s) => {
    stateRef.current = s;
    setState(s);
  }, []);

  // ── Output: Web Audio Playback & Monotonic Word Pacing ──────────────────────
  const audioPlayback = useAudioPlayback({
    onStart: () => {
      // P-14: Pause VAD listener while AI speaks to guarantee 100% echo immunity
      vadRef.current?.pause();
      if (stateRef.current !== 'listening') {
        go('speaking');
      }
    },
    onTextProgress: (spokenSoFar) => {
      onAssistantTextProgress?.(spokenSoFar);
    },
    onEnd: () => {
      setVolume(0);
      onAssistantDone?.();
      if (isVoiceModeRef.current && !isMutedRef.current) {
        // Continuous hands-free loop: smoothly resume listening immediately after AI finishes
        vadRef.current?.resume();
        go('listening');
      } else {
        go('idle');
      }
    },
    onVolumeChange: (v) => {
      if (stateRef.current === 'speaking') {
        setVolume(v);
      }
    },
  });

  // ── Transport: Persistent Bidirectional WebSocket ──────────────────────────
  // connectWebSocket: Establishes the persistent full-duplex /ws/conversation socket, routing incoming transcripts to the UI and streaming MP3 chunks into playback.
  const connectWebSocket = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const socket = api.createVoiceSocket({
      conversationId: sessionIdRef.current,
      history: historyRef.current.map(m => ({ role: m.role, content: m.content })),

      onTranscript: (data) => {
        if (!data.text?.trim()) return;
        onUserTranscript?.(data.text);
      },

      onSentence: ({ text, audioBlob }) => {
        if (audioBlob) {
          go('speaking');
          audioPlayback.enqueue({ blob: audioBlob, text });
        }
        onAssistantSentence?.({ text, audioBlob });
      },

      onDone: () => {
        audioPlayback.setStreamFinished();
      },

      onInterrupted: () => {
      },

      onError: (err) => {
        console.error('[WS] Connection error:', err);
        setError(err.message || 'Voice connection issue');
      },

      onClose: () => {
        if (isVoiceModeRef.current && !isMutedRef.current) {
          setTimeout(() => {
            if (isVoiceModeRef.current) connectWebSocket();
          }, 1000);
        }
      },
    });

    wsRef.current = socket;
    return socket;
  }, [audioPlayback, go, onAssistantSentence, onAssistantDone, onUserTranscript]);

  // ── Process Audio Payload ──────────────────────────────────────────────────
  // processAudio: Filters noise clicks (<400 bytes), shifts pipeline to 'processing', and transmits the binary WAV audio blob over the WebSocket.
  const processAudio = useCallback(async (audioBlob) => {
    if (isMutedRef.current || !audioBlob || audioBlob.size === 0) {
      if (isVoiceModeRef.current && !isMutedRef.current) {
        go('listening');
      } else {
        go('idle');
      }
      return;
    }

    if (wsRef.current?.isConnected) {
      go('processing');
      setVolume(0);
      try {
        wsRef.current.sendAudio(audioBlob);
      } catch (err) {
        console.error('[WS] Send audio failed:', err);
        setError('Transmission failed. Reconnecting...');
        go('error');
      }
      return;
    }

    console.warn('[PIPELINE] WebSocket disconnected. Reconnecting...');
    setError('Voice connection lost. Reconnecting...');
    connectWebSocket();
    go('error');
  }, [connectWebSocket, go]);

  // ── Input: Silero VAD v5 with State-Aware Echo Suppression (P-14) ───────────
  const vad = useVAD({
    onSpeechStart: () => {
      if (isMutedRef.current) return;

      // P-14 Guard: Strict suppression while assistant is actively speaking or processing
      if (stateRef.current === 'speaking' || stateRef.current === 'processing') {
        return;
      }

      if (stateRef.current === 'listening') {
        setIsUserSpeaking(true);
      }
    },

    onSpeechEnd: async (wavBlob) => {
      setIsUserSpeaking(false);
      if (isMutedRef.current) return;

      // P-14 Guard: Discard any audio events triggered while speaking
      if (stateRef.current === 'speaking' || stateRef.current === 'processing') {
        return;
      }

      if (stateRef.current !== 'listening') return;

      if (wavBlob && wavBlob.size >= 400) {
        await processAudio(wavBlob);
      } else if (isVoiceModeRef.current && !isMutedRef.current) {
        go('listening');
      }
    },

    onVolumeChange: (v) => {
      if (stateRef.current === 'listening' && !isMutedRef.current) {
        setVolume(v);
      }
    },
  });

  vadRef.current = vad;

  // ── Internal Listening Starter ─────────────────────────────────────────────
  const startListeningInternal = useCallback(async () => {
    if (stateRef.current === 'processing' || isMutedRef.current) return;

    setError(null);
    go('listening');
    setVolume(0);

    if (streamRef.current && streamRef.current.active && streamRef.current.getAudioTracks().some(t => t.readyState === 'live')) {
      vad.resume();
      return;
    }

    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      streamRef.current = stream;
      await vad.start(stream);
    } catch (err) {
      console.error('[MIC] Error:', err);
      let msg = err.message || 'Microphone error';
      if (err.name === 'NotAllowedError') {
        msg = 'Microphone permission denied. Please allow microphone access.';
      }
      setError(msg);
      go('error');
    }
  }, [go, vad]);

  // ── Controls: Voice Mode, Mute & Voice Orb Barge-In ────────────────────────
  const toggleMute = useCallback(() => {
    if (isMutedRef.current) {
      isMutedRef.current = false;
      setIsMuted(false);
      vad.resume();
      if (isVoiceModeRef.current && (stateRef.current === 'idle' || stateRef.current === 'error')) {
        startListeningInternal();
      }
    } else {
      isMutedRef.current = true;
      setIsMuted(true);
      setIsUserSpeaking(false);
      vad.pause();
      setVolume(0);
      if (stateRef.current === 'listening') {
        go('idle');
      }
    }
  }, [go, startListeningInternal, vad]);

  // enterVoiceMode: Pre-warms the shared Web Audio context via user gesture, opens the WebSocket, and unpauses the microphone for hands-free listening.
  const enterVoiceMode = useCallback(() => {
    setIsVoiceMode(true);
    isVoiceModeRef.current = true;
    isMutedRef.current = false;
    setIsMuted(false);

    audioPlayback.warmup?.();
    connectWebSocket();
    startListeningInternal();
  }, [audioPlayback, connectWebSocket, startListeningInternal]);

  // exitVoiceMode: Shuts down active microphone tracks, disconnects the WebSocket, drains the audio playback queue, and resets pipeline state to 'idle'.
  const exitVoiceMode = useCallback(() => {
    setIsVoiceMode(false);
    isVoiceModeRef.current = false;

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    vad.stop();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    audioPlayback.stop();
    go('idle');
    setVolume(0);
    setIsUserSpeaking(false);
  }, [audioPlayback, go, vad]);

  // interrupt: Emergency barge-in cutoff that instantly halts local Web Audio output and sends an interrupt frame to abort backend generation.
  // P-14: Instant Voice Orb Click-to-Interrupt
  const interrupt = useCallback(() => {
    if (wsRef.current?.isConnected) {
      wsRef.current.interrupt();
    }
    audioPlayback.stop();
    vadRef.current?.resume();
    if (isVoiceModeRef.current && !isMutedRef.current) {
      startListeningInternal();
    } else {
      go('idle');
    }
  }, [audioPlayback, go, startListeningInternal]);

  // Cleanup on unmount
  useEffect(() => {
    const stream = streamRef.current;
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      vad.stop();
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
      }
      audioPlayback.stop();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    isVoiceMode,
    state,
    isMuted,
    isUserSpeaking,
    volume,
    error,
    enterVoiceMode,
    exitVoiceMode,
    toggleMute,
    interrupt,
  };
}
