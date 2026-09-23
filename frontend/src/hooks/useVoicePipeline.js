/**
 * useVoicePipeline — ChatGPT Advanced Voice conversational orchestration.
 *
 * Implements:
 * - Neural Silero VAD v5 with automatic pause tolerance
 * - Instant Barge-In interruption (cuts audio playback and active LLM stream)
 * - Pipelined Sentence-Level Streaming (Time-To-First-Audio < 800ms)
 * - Hands-free continuous turn-taking
 * - Microphone Mute / Unmute toggle (strike-through mic control)
 * - Speech-to-Speech Conversation Storage & Session Management
 * - Real-time Voice Orb volume dynamics
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { useVAD }          from './useVAD';
import { useAudioPlayback } from './useAudioPlayback';
import * as api            from '../services/api';

function generateId() {
  return 'conv_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
}

export function useVoicePipeline({ voice } = {}) {
  const [isVoiceMode, setIsVoiceMode]   = useState(false);
  const [state,       setState]         = useState('idle'); // 'idle' | 'listening' | 'processing' | 'speaking' | 'error'
  const [isMuted,     setIsMuted]       = useState(false);
  const [transcript,  setTranscript]    = useState([]);     // human instructions & AI responses
  const [error,       setError]         = useState(null);
  const [volume,      setVolume]        = useState(0);      // mic or assistant volume (0..1)
  const [activeSessionId, setActiveSessionId] = useState(() => {
    return localStorage.getItem('voice_ai_session_id') || generateId();
  });

  const [isVadOnlyMode, setIsVadOnlyMode] = useState(false);
  const [lastVadEvent,  setLastVadEvent]  = useState(null);

  const isVoiceModeRef       = useRef(false);
  const isVadOnlyModeRef     = useRef(false);
  const stateRef             = useRef('idle');
  const isMutedRef           = useRef(false);
  const historyRef           = useRef([]);
  const streamRef            = useRef(null);
  const autoListenTimerRef   = useRef(null);
  const abortControllerRef   = useRef(null);
  const activeSessionIdRef   = useRef(activeSessionId);
  const speechStartTimeRef   = useRef(0);

  // Sync ref
  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
    localStorage.setItem('voice_ai_session_id', activeSessionId);
  }, [activeSessionId]);

  function go(s) {
    stateRef.current = s;
    setState(s);
  }

  function addMsg(msg) {
    setTranscript(prev => [...prev, msg]);
  }

  function updateLastAssistantMsg(textChunk) {
    setTranscript(prev => {
      if (prev.length === 0) return [{ role: 'assistant', content: textChunk }];
      const last = prev[prev.length - 1];
      if (last.role === 'assistant') {
        const updated = { ...last, content: (last.content ? last.content + ' ' : '') + textChunk };
        return [...prev.slice(0, -1), updated];
      }
      return [...prev, { role: 'assistant', content: textChunk }];
    });
  }

  const toggleVadOnlyMode = useCallback(() => {
    setIsVadOnlyMode(prev => {
      const next = !prev;
      isVadOnlyModeRef.current = next;
      return next;
    });
  }, []);

  // ── Audio Playback ──────────────────────────────────────────────────────────
  const audioPlayback = useAudioPlayback({
    onStart: () => {
      speechStartTimeRef.current = Date.now();
      if (stateRef.current !== 'listening') {
        go('speaking');
      }
    },
    onEnd: () => {
      setVolume(0);
      if (isVoiceModeRef.current && !isMutedRef.current) {
        // Continuous loop: smoothly resume listening immediately after AI finishes speaking
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

  // ── Process Spoken Audio ───────────────────────────────────────────────────
  const processAudio = useCallback(async (audioBlob) => {
    if (isMutedRef.current || !audioBlob || audioBlob.size === 0) {
      if (isVoiceModeRef.current && !isMutedRef.current) {
        go('listening');
      } else {
        go('idle');
      }
      return;
    }

    go('processing');
    setVolume(0);

    // Cancel any previous stream
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortCtrl = new AbortController();
    abortControllerRef.current = abortCtrl;

    try {
      // 1. STT via Groq Whisper (with abort signal support)
      const { text } = await api.transcribe(audioBlob, abortCtrl.signal);
      if (abortCtrl.signal.aborted) return;

      if (!text?.trim()) {
        if (isVoiceModeRef.current && !isMutedRef.current) {
          go('listening');
        } else {
          go('idle');
        }
        return;
      }

      if (abortCtrl.signal.aborted) return;

      const userMsg = { role: 'user', content: text };
      addMsg(userMsg);

      const apiHistory = historyRef.current.map(m => ({ role: m.role, content: m.content }));
      historyRef.current.push(userMsg);

      // 2. Add placeholder for assistant response
      setTranscript(prev => [...prev, { role: 'assistant', content: '' }]);

      let fullAssistantText = '';

      // 3. Sentence-level streaming pipeline
      await api.streamChat({
        message: text,
        history: apiHistory,
        conversationId: activeSessionIdRef.current,
        signal: abortCtrl.signal,
        onSentence: ({ text: sentenceText, audioBlob: sentenceAudio }) => {
          if (abortCtrl.signal.aborted) return;

          fullAssistantText = (fullAssistantText ? fullAssistantText + ' ' : '') + sentenceText;
          updateLastAssistantMsg(sentenceText);

          if (sentenceAudio) {
            go('speaking');
            audioPlayback.enqueue(sentenceAudio);
          }
        },
        onDone: () => {
          if (abortCtrl.signal.aborted) return;
          audioPlayback.setStreamFinished();
          if (fullAssistantText) {
            historyRef.current.push({ role: 'assistant', content: fullAssistantText });
          }
        },
        onError: (err) => {
          if (abortCtrl.signal.aborted) return;
          console.error('[STREAM] Error during chat stream:', err);
          setError(err.message || 'Stream generation failed');
          go('error');
        },
      });

    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error('[VOICE] Pipeline error:', err);
      const msg = err.message?.includes('fetch')
        ? 'Cannot connect to backend server. Is FastAPI running on port 8000?'
        : err.message || 'Error processing speech.';
      setError(msg);
      go('error');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioPlayback, voice]);

  // ── Silero VAD Setup ────────────────────────────────────────────────────────
  const vad = useVAD({
    onSpeechStart: () => {
      if (isMutedRef.current) return;
      setLastVadEvent({
        type: 'start',
        timestamp: Date.now(),
      });

      // Instant Barge-In: if user speaks while AI is speaking or thinking, cut off immediately!
      if (!isVadOnlyModeRef.current && (stateRef.current === 'speaking' || stateRef.current === 'processing')) {
        // Prevent accidental transient trigger during the first 180ms of playback starting
        if (stateRef.current === 'speaking' && (Date.now() - speechStartTimeRef.current < 180)) {
          return;
        }
        console.log('[PIPELINE] Barge-in triggered by user speech!');
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
        }
        audioPlayback.stop();
        go('listening');
      }
    },
    onSpeechEnd: async (wavBlob, metrics) => {
      if (isMutedRef.current) return;
      setLastVadEvent({
        type: 'end',
        timestamp: Date.now(),
        metrics,
        wavBlob,
      });

      // If in VAD-only test mode, do not send to backend
      if (isVadOnlyModeRef.current) {
        console.log('[VAD-ONLY] Speech captured without sending to backend:', metrics);
        return;
      }

      // Safety fallback: if state was speaking or processing when user finished interrupting
      if (stateRef.current === 'speaking' || stateRef.current === 'processing') {
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
        }
        audioPlayback.stop();
        go('listening');
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

  // ── Internal Listen Starter ────────────────────────────────────────────────
  const startListeningInternal = useCallback(async () => {
    if (stateRef.current === 'processing' || isMutedRef.current) return;

    setError(null);
    go('listening');
    setVolume(0);

    // Reuse existing live stream if active
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
        msg = 'Microphone permission denied. Please allow microphone access in your browser.';
      }
      setError(msg);
      go('error');
    }
  }, [vad]);

  // ── Mute / Unmute Toggle (Strike-through Mic Action) ───────────────────────
  const toggleMute = useCallback(() => {
    if (isMutedRef.current) {
      // Unmute: resume listening
      isMutedRef.current = false;
      setIsMuted(false);
      vad.resume();
      if (isVoiceModeRef.current && (stateRef.current === 'idle' || stateRef.current === 'error')) {
        startListeningInternal();
      }
    } else {
      // Mute: pause listening and stop audio analysis
      isMutedRef.current = true;
      setIsMuted(true);
      vad.pause();
      setVolume(0);
      if (stateRef.current === 'listening') {
        go('idle');
      }
    }
  }, [vad, startListeningInternal]);

  // ── Enter Voice Mode ───────────────────────────────────────────────────────
  const enterVoiceMode = useCallback(() => {
    setIsVoiceMode(true);
    isVoiceModeRef.current = true;
    isMutedRef.current = false;
    setIsMuted(false);
    startListeningInternal();
  }, [startListeningInternal]);

  // ── Exit Voice Mode ────────────────────────────────────────────────────────
  const exitVoiceMode = useCallback(() => {
    setIsVoiceMode(false);
    isVoiceModeRef.current = false;
    clearTimeout(autoListenTimerRef.current);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    vad.stop();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    audioPlayback.stop();
    go('idle');
    setVolume(0);
  }, [vad, audioPlayback]);

  // ── Manual Interrupt / Barge-In Click ─────────────────────────────────────
  const interrupt = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    audioPlayback.stop();
    if (isVoiceModeRef.current && !isMutedRef.current) {
      startListeningInternal();
    } else {
      go('idle');
    }
  }, [audioPlayback, startListeningInternal]);

  // ── Speech-to-Speech Session Storage Controls ─────────────────────────────
  const startNewSession = useCallback(async () => {
    const newId = generateId();
    setActiveSessionId(newId);
    activeSessionIdRef.current = newId;
    setTranscript([]);
    historyRef.current = [];
    setError(null);

    try {
      await api.createConversation('New Voice Session', newId);
    } catch (e) {
      console.warn('[STORAGE] Could not pre-create session on backend:', e);
    }
  }, []);

  const loadSession = useCallback(async (sessionId) => {
    try {
      const conv = await api.getConversation(sessionId);
      if (conv) {
        setActiveSessionId(conv.id);
        activeSessionIdRef.current = conv.id;
        setTranscript(conv.messages || []);
        historyRef.current = (conv.messages || []).map(m => ({ role: m.role, content: m.content }));
      }
    } catch (err) {
      console.error('[STORAGE] Error loading session:', err);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    const timer = autoListenTimerRef.current;
    const abortCtrl = abortControllerRef.current;
    const stream = streamRef.current;
    return () => {
      clearTimeout(timer);
      if (abortCtrl) {
        abortCtrl.abort();
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
    volume,
    transcript,
    error,
    activeSessionId,
    vadMetrics: vad.vadMetrics,
    lastVadEvent,
    isVadOnlyMode,
    toggleVadOnlyMode,
    enterVoiceMode,
    exitVoiceMode,
    toggleMute,
    startListening: startListeningInternal,
    stopListening: () => vad.pause(),
    interrupt,
    startNewSession,
    loadSession,
    clearTranscript: startNewSession,
  };
}
