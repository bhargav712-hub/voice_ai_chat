/**
 * useAudioPlayback — Web Audio streaming playback with sample-accurate word-synchronized subtitle pacing.
 *
 * Capabilities:
 * - Persistent singleton AudioContext (defends against 6-context browser limit)
 * - Hardware audio clock (ctx.currentTime) synchronization for glitch-free word pacing
 * - Queue-based sequential sentence streaming (< 800ms TTFA)
 * - Instant cutoff & buffer flush on barge-in
 * - Shared reusable AnalyserNode for 60fps volume telemetry
 */
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

export function useAudioPlayback({ onStart, onEnd, onVolumeChange, onTextProgress } = {}) {
  const queueRef               = useRef([]);
  const isPlayingRef           = useRef(false);
  const isStreamEndedRef       = useRef(false);
  const currentSourceRef       = useRef(null);
  const currentAudioRef        = useRef(null);
  const currentUrlRef          = useRef(null);
  const currentItemRef         = useRef(null);
  const currentDurationRef     = useRef(0);
  const playbackStartTimeRef   = useRef(0);
  const wordsRef               = useRef([]);
  const lastWordCountRef       = useRef(0);
  const completedTextRef       = useRef('');
  const rafRef                 = useRef(null);
  const playResolveRef         = useRef(null);

  const startPlaybackLoop = useCallback(() => {
    if (rafRef.current) return;
    const { ctx, analyser } = getSharedAudioContext();
    const data = analyser ? new Float32Array(analyser.fftSize) : null;

    function tick() {
      if (!isPlayingRef.current) {
        onVolumeChange?.(0);
        rafRef.current = null;
        return;
      }

      // 1. Volume analysis for Voice Orb visualizer
      if (analyser && data) {
        analyser.getFloatTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
        const rms = Math.sqrt(sum / data.length);
        onVolumeChange?.(Math.min(rms * 4.2, 1));
      }

      // 2. Sample-accurate word-synchronized subtitle pacing
      const duration = currentDurationRef.current;
      const words = wordsRef.current;
      if (ctx && duration > 0 && words && words.length > 0 && onTextProgress) {
        const elapsed = ctx.currentTime - playbackStartTimeRef.current;
        const ratio = Math.min(Math.max(elapsed / duration, 0), 1);
        const wordCount = Math.max(1, Math.min(Math.ceil(ratio * words.length), words.length));
        if (wordCount !== lastWordCountRef.current) {
          lastWordCountRef.current = wordCount;
          const currentSpokenChunk = words.slice(0, wordCount).join(' ');
          const fullSoFar = completedTextRef.current
            ? `${completedTextRef.current} ${currentSpokenChunk}`
            : currentSpokenChunk;
          onTextProgress(fullSoFar);
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
  }, [onVolumeChange, onTextProgress]);

  const _cleanupCurrent = useCallback(() => {
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.onended = null;
        currentSourceRef.current.stop(0);
      } catch {
        /* already stopped */
      }
      try {
        currentSourceRef.current.disconnect();
      } catch {
        /* already disconnected */
      }
      currentSourceRef.current = null;
    }
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.src = '';
      currentAudioRef.current = null;
    }
    if (currentUrlRef.current) {
      URL.revokeObjectURL(currentUrlRef.current);
      currentUrlRef.current = null;
    }
  }, []);

  const _playNext = useCallback(async () => {
    if (queueRef.current.length === 0) {
      isPlayingRef.current = false;
      _cleanupCurrent();
      if (isStreamEndedRef.current) {
        onVolumeChange?.(0);
        onEnd?.();
        playResolveRef.current?.();
        playResolveRef.current = null;
      }
      return;
    }

    _cleanupCurrent();

    const nextItem = queueRef.current.shift();
    const blob = nextItem instanceof Blob ? nextItem : nextItem.blob;
    const text = (nextItem && typeof nextItem === 'object' && nextItem.text) ? nextItem.text : '';

    currentItemRef.current = { blob, text };
    wordsRef.current = text ? text.trim().split(/\s+/) : [];
    lastWordCountRef.current = 0;
    isPlayingRef.current = true;

    const { ctx, analyser } = getSharedAudioContext();

    if (ctx && analyser) {
      try {
        if (ctx.state === 'suspended') {
          await ctx.resume();
        }

        const arrayBuffer = await blob.arrayBuffer();
        const audioBuffer = await new Promise((resolve, reject) => {
          ctx.decodeAudioData(arrayBuffer.slice(0), resolve, reject);
        });

        // Ensure user didn't interrupt while decoding
        if (!isPlayingRef.current) return;

        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(analyser); // analyser is connected to ctx.destination

        currentSourceRef.current = source;
        currentDurationRef.current = audioBuffer.duration;
        playbackStartTimeRef.current = ctx.currentTime;

        source.onended = () => {
          if (!isPlayingRef.current) return;
          if (currentItemRef.current?.text) {
            completedTextRef.current = completedTextRef.current
              ? `${completedTextRef.current} ${currentItemRef.current.text}`
              : currentItemRef.current.text;
            onTextProgress?.(completedTextRef.current);
          }
          _playNext();
        };

        source.start(0);
        onStart?.();
        startPlaybackLoop();
        return;

      } catch (decodeErr) {
        console.warn('[AudioPlayback] Web Audio buffer playback failed, trying HTMLAudioElement fallback:', decodeErr);
      }
    }

    // Fallback: HTML5 Audio Element if Web Audio decoding fails
    try {
      const url = URL.createObjectURL(blob);
      currentUrlRef.current = url;
      const audio = new Audio(url);
      currentAudioRef.current = audio;

      audio.onplay = () => {
        onStart?.();
        startPlaybackLoop();
      };

      audio.onended = () => {
        if (currentItemRef.current?.text) {
          completedTextRef.current = completedTextRef.current
            ? `${completedTextRef.current} ${currentItemRef.current.text}`
            : currentItemRef.current.text;
          onTextProgress?.(completedTextRef.current);
        }
        _playNext();
      };

      audio.onerror = (e) => {
        console.warn('[AudioPlayback] Fallback audio playback error:', e);
        if (currentItemRef.current?.text) {
          completedTextRef.current = completedTextRef.current
            ? `${completedTextRef.current} ${currentItemRef.current.text}`
            : currentItemRef.current.text;
          onTextProgress?.(completedTextRef.current);
        }
        _playNext();
      };

      await audio.play();

    } catch (fallbackErr) {
      console.warn('[AudioPlayback] Both Web Audio and HTML5 playback failed:', fallbackErr);
      if (currentItemRef.current?.text) {
        completedTextRef.current = completedTextRef.current
          ? `${completedTextRef.current} ${currentItemRef.current.text}`
          : currentItemRef.current.text;
        onTextProgress?.(completedTextRef.current);
      }
      _playNext();
    }

  }, [onStart, onEnd, onVolumeChange, onTextProgress, startPlaybackLoop, _cleanupCurrent]);

  const enqueue = useCallback((item, maybeText = '') => {
    if (!item) return;

    let entry;
    if (item instanceof Blob) {
      entry = { blob: item, text: maybeText };
    } else if (typeof item === 'object') {
      entry = { blob: item.blob || item.audioBlob || item, text: item.text || '' };
    }

    if (!entry || !entry.blob) return;

    if (!isPlayingRef.current && queueRef.current.length === 0) {
      completedTextRef.current = '';
    }

    queueRef.current.push(entry);
    if (!isPlayingRef.current) {
      isStreamEndedRef.current = false;
      _playNext();
    }
  }, [_playNext]);

  const stop = useCallback(() => {
    queueRef.current = [];
    isPlayingRef.current = false;
    isStreamEndedRef.current = true;

    _cleanupCurrent();

    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    onVolumeChange?.(0);

    completedTextRef.current = '';
    currentItemRef.current = null;
    wordsRef.current = [];
    lastWordCountRef.current = 0;
    currentDurationRef.current = 0;

    playResolveRef.current?.();
    playResolveRef.current = null;
  }, [_cleanupCurrent, onVolumeChange]);

  const setStreamFinished = useCallback(() => {
    isStreamEndedRef.current = true;
    if (!isPlayingRef.current && queueRef.current.length === 0) {
      onVolumeChange?.(0);
      onEnd?.();
      playResolveRef.current?.();
      playResolveRef.current = null;
    }
  }, [onEnd, onVolumeChange]);

  const play = useCallback((audioBlob, text = '') => {
    return new Promise((resolve) => {
      stop();
      playResolveRef.current = resolve;
      isStreamEndedRef.current = true;
      enqueue(audioBlob, text);
    });
  }, [enqueue, stop]);

  const warmup = useCallback(() => {
    const { ctx } = getSharedAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  }, []);

  return {
    enqueue,
    setStreamFinished,
    stop,
    play,
    warmup,
    isPlaying: () => isPlayingRef.current,
  };
}
