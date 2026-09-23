/**
 * useAudioPlayback — queue-based streaming audio playback with real-time volume analysis.
 *
 * Capabilities:
 *   - enqueue(blob): Enqueues sentence audio chunks and begins playback immediately.
 *   - setStreamFinished(): Signals that no more chunks are incoming for the current turn.
 *   - play(blob): Single-blob helper (backwards compatible).
 *   - stop(): Instant cutoff (used for conversational barge-in).
 *   - onVolumeChange(rms): Continuous 60fps volume data for the Voice Orb visualizer.
 */
import { useRef, useCallback } from 'react';

export function useAudioPlayback({ onStart, onEnd, onVolumeChange } = {}) {
  const audioRef           = useRef(null);
  const ctxRef             = useRef(null);
  const analyserRef        = useRef(null);
  const sourceRef          = useRef(null);
  const rafRef             = useRef(null);

  const queueRef           = useRef([]);
  const isPlayingRef       = useRef(false);
  const isStreamEndedRef   = useRef(false);
  const playResolveRef     = useRef(null);

  /** Clean up Web Audio context and animation loop */
  function _cleanupAudioNodes() {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    if (ctxRef.current && ctxRef.current.state !== 'closed') {
      ctxRef.current.close().catch(() => {});
      ctxRef.current = null;
      analyserRef.current = null;
      sourceRef.current = null;
    }
  }

  /** Start 60fps volume analysis on the currently playing HTMLAudioElement */
  function _attachAnalyser(audioElement) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const source = ctx.createMediaElementSource(audioElement);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.4;

      source.connect(analyser);
      analyser.connect(ctx.destination); // audio out to speakers

      ctxRef.current = ctx;
      analyserRef.current = analyser;
      sourceRef.current = source;

      const data = new Float32Array(analyser.fftSize);

      function tick() {
        if (!analyserRef.current || !isPlayingRef.current) return;
        analyserRef.current.getFloatTimeDomainData(data);

        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
        const rms = Math.sqrt(sum / data.length);

        onVolumeChange?.(Math.min(rms * 4.2, 1));
        rafRef.current = requestAnimationFrame(tick);
      }

      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      console.warn('[AudioPlayback] Analyser attach error:', err);
    }
  }

  /** Play next item in the sentence queue */
  const _playNext = useCallback(() => {
    if (queueRef.current.length === 0) {
      isPlayingRef.current = false;
      if (isStreamEndedRef.current) {
        onVolumeChange?.(0);
        _cleanupAudioNodes();
        onEnd?.();
        playResolveRef.current?.();
        playResolveRef.current = null;
      }
      return;
    }

    const nextBlob = queueRef.current.shift();
    const url = URL.createObjectURL(nextBlob);
    const audio = new Audio(url);
    audioRef.current = audio;
    isPlayingRef.current = true;

    // Attach volume analyser
    _attachAnalyser(audio);

    audio.onplay = () => {
      onStart?.();
    };

    audio.onended = () => {
      URL.revokeObjectURL(url);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (ctxRef.current && ctxRef.current.state !== 'closed') {
        ctxRef.current.close().catch(() => {});
        ctxRef.current = null;
      }
      _playNext();
    };

    audio.onerror = (e) => {
      console.error('[AudioPlayback] Chunk playback failed:', e);
      URL.revokeObjectURL(url);
      _playNext();
    };

    audio.play().catch((err) => {
      console.warn('[AudioPlayback] Auto-play prevented or aborted:', err);
      URL.revokeObjectURL(url);
      _playNext();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onStart, onEnd, onVolumeChange]);

  /** Enqueue an audio blob chunk (for sentence-level streaming) */
  const enqueue = useCallback((audioBlob) => {
    if (!audioBlob) return;
    queueRef.current.push(audioBlob);

    if (!isPlayingRef.current) {
      isStreamEndedRef.current = false;
      _playNext();
    }
  }, [_playNext]);

  /** Signal that the upstream text/audio stream has finished emitting sentences */
  const setStreamFinished = useCallback(() => {
    isStreamEndedRef.current = true;
    if (!isPlayingRef.current && queueRef.current.length === 0) {
      onVolumeChange?.(0);
      _cleanupAudioNodes();
      onEnd?.();
      playResolveRef.current?.();
      playResolveRef.current = null;
    }
  }, [onEnd, onVolumeChange]);

  /** Instantly stop playback, clear queue, and release audio nodes (barge-in) */
  const stop = useCallback(() => {
    queueRef.current = [];
    isPlayingRef.current = false;
    isStreamEndedRef.current = true;

    _cleanupAudioNodes();
    onVolumeChange?.(0);

    playResolveRef.current?.();
    playResolveRef.current = null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onVolumeChange]);

  /** Play a single audio Blob and return a Promise (backwards compatibility) */
  const play = useCallback((audioBlob) => {
    return new Promise((resolve) => {
      stop();
      playResolveRef.current = resolve;
      isStreamEndedRef.current = true;
      enqueue(audioBlob);
    });
  }, [enqueue, stop]);


  const isPlaying = useCallback(() => isPlayingRef.current, []);

  return { enqueue, setStreamFinished, play, stop, isPlaying };
}
