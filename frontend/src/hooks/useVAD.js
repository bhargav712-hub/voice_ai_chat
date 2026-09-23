/**
 * useVAD — Neural Voice Activity Detection via Silero VAD v5 (ONNX Runtime Web)
 * with graceful fallback to Web Audio RMS.
 *
 * Implements:
 * - High-confidence neural human voice detection (Silero VAD v5)
 * - Instant onSpeechStart() for conversational barge-in / interruption
 * - Clean onSpeechEnd(wavBlob) providing pristine 16kHz WAV audio
 * - Forgiving pause grace period (redemptionFrames) so natural thinking pauses don't cut off
 * - Companion AnalyserNode providing real-time volume (0–1) and multi-band frequencies for the Voice Orb
 */
import { useState, useRef, useCallback } from 'react';
import { MicVAD, utils } from '@ricky0123/vad-web';

// RMS Fallback constants (only used if WebAssembly/WASM fails)
const FALLBACK_SPEECH_THRESHOLD  = 0.018;
const FALLBACK_SILENCE_THRESHOLD = 0.010;
const FALLBACK_SILENCE_MS        = 1200;

export function useVAD({ onSpeechStart, onSpeechEnd, onVolumeChange } = {}) {
  const micVadRef        = useRef(null);
  const audioCtxRef      = useRef(null);
  const analyserRef      = useRef(null);
  const rafRef           = useRef(null);
  const isFallbackRef    = useRef(false);
  const isSpeakingRef    = useRef(false);
  const hasSpeechRef     = useRef(false);
  const silenceTimerRef  = useRef(null);
  const activeStreamRef  = useRef(null);
  const isMutedRef       = useRef(false);

  /** Clean up volume analyser animation loop */
  function stopAnalyser() {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
      analyserRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }

  /** Starts volume analyzer on the audio stream for the fluid Voice Orb visualizer */
  function startVolumeAnalyser(stream) {
    stopAnalyser();
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.4;
      source.connect(analyser);

      audioCtxRef.current = ctx;
      analyserRef.current = analyser;

      const data = new Float32Array(analyser.fftSize);

      function tick() {
        if (!analyserRef.current) return;

        if (isMutedRef.current) {
          onVolumeChange?.(0);
          rafRef.current = requestAnimationFrame(tick);
          return;
        }

        analyserRef.current.getFloatTimeDomainData(data);

        // Compute RMS
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
        const rms = Math.sqrt(sum / data.length);

        // Notify volume callback (amplified and clamped to 0..1)
        onVolumeChange?.(Math.min(rms * 4.5, 1));

        // If running in RMS fallback mode
        if (isFallbackRef.current && !isMutedRef.current) {
          if (rms > FALLBACK_SPEECH_THRESHOLD) {
            if (!isSpeakingRef.current) {
              isSpeakingRef.current = true;
              hasSpeechRef.current = true;
              onSpeechStart?.();
            }
            if (silenceTimerRef.current) {
              clearTimeout(silenceTimerRef.current);
              silenceTimerRef.current = null;
            }
          } else if (rms < FALLBACK_SILENCE_THRESHOLD) {
            if (isSpeakingRef.current && !silenceTimerRef.current) {
              silenceTimerRef.current = setTimeout(() => {
                silenceTimerRef.current = null;
                if (hasSpeechRef.current) {
                  isSpeakingRef.current = false;
                  // In fallback, we signal speech ended
                  onSpeechEnd?.(null);
                }
              }, FALLBACK_SILENCE_MS);
            }
          }
        }

        rafRef.current = requestAnimationFrame(tick);
      }

      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      console.warn('[VAD] Volume analyser could not be initialized:', err);
    }
  }

  /** Start VAD with Silero VAD neural model */
  const [vadMetrics, setVadMetrics] = useState({
    engine: 'Initializing...',
    isSpeaking: false,
    speechStartTime: null,
    speechDuration: 0,
    endLatency: 0,
    samplesCount: 0,
    blobSize: 0,
    lastEventTime: null,
  });

  const speechStartTimestampRef = useRef(null);

  /** Start VAD with Silero VAD neural model */
  const start = useCallback(async (stream) => {
    stop();
    activeStreamRef.current = stream;
    isMutedRef.current = false;

    // Start volume analyzer for UI responsiveness
    startVolumeAnalyser(stream);

    try {
      console.log('[VAD] Initializing Silero VAD v5 (ONNX WebAssembly)...');
      const vadInstance = await MicVAD.new({
        getStream: async () => stream,
        pauseStream: async () => {},
        resumeStream: async () => stream,
        model: 'v5',
        baseAssetPath: '/',
        onnxWASMBasePath: '/wasm/',
        positiveSpeechThreshold: 0.6,
        negativeSpeechThreshold: 0.4,
        redemptionFrames: 25,      // ~800ms silence tolerance (matches speculative_reopen_ms: 800ms)
        preSpeechPadFrames: 16,    // ~512ms pre-speech buffer (matches speech_pad_ms: 500ms, preserves first words)
        minSpeechFrames: 10,       // ~320ms minimum speech (matches min_speech_ms: 384ms, filters breaths & clicks)
        ortConfig: (ort) => {
          ort.env.wasm.numThreads = 1;
        },
        onSpeechStart: () => {
          if (isMutedRef.current) return;
          const now = performance.now();
          speechStartTimestampRef.current = now;
          console.log('[Silero VAD] Speech started at', now.toFixed(1), 'ms');
          isSpeakingRef.current = true;
          setVadMetrics(prev => ({
            ...prev,
            isSpeaking: true,
            speechStartTime: now,
            lastEventTime: Date.now(),
          }));
          onSpeechStart?.();
        },
        onSpeechEnd: (audio) => {
          if (isMutedRef.current) return;
          const endNow = performance.now();
          const startNow = speechStartTimestampRef.current || endNow;
          const speechDuration = Math.round(endNow - startNow);
          console.log('[Silero VAD] Speech ended. Duration:', speechDuration, 'ms. Samples:', audio?.length);
          isSpeakingRef.current = false;

          let wavBlob = null;
          try {
            const wavBuffer = utils.encodeWAV(audio);
            wavBlob = new Blob([wavBuffer], { type: 'audio/wav' });
          } catch (encodeErr) {
            console.error('[Silero VAD] Error encoding WAV:', encodeErr);
          }

          setVadMetrics(prev => ({
            ...prev,
            isSpeaking: false,
            speechDuration,
            samplesCount: audio?.length || 0,
            blobSize: wavBlob?.size || 0,
            lastEventTime: Date.now(),
          }));

          onSpeechEnd?.(wavBlob, {
            durationMs: speechDuration,
            samplesCount: audio?.length || 0,
            blobSize: wavBlob?.size || 0,
          });
        },
        onVADMisfire: () => {
          console.log('[Silero VAD] Misfire (too short, ignored)');
          isSpeakingRef.current = false;
          setVadMetrics(prev => ({ ...prev, isSpeaking: false }));
        },
      });

      micVadRef.current = vadInstance;
      isFallbackRef.current = false;
      setVadMetrics(prev => ({ ...prev, engine: 'Silero VAD v5 (ONNX WebAssembly)' }));
      console.log('[VAD] Silero VAD v5 active.');

    } catch (err) {
      console.warn('[VAD] Silero VAD initialization failed, falling back to Web Audio RMS:', err);
      isFallbackRef.current = true;
      setVadMetrics(prev => ({ ...prev, engine: 'Web Audio RMS Fallback' }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Stop VAD and release all media & analyser resources */
  const stop = useCallback(() => {
    if (micVadRef.current) {
      try {
        micVadRef.current.destroy();
      } catch { /* ignore */ }
      micVadRef.current = null;
    }
    stopAnalyser();
    activeStreamRef.current = null;
    isSpeakingRef.current = false;
    hasSpeechRef.current = false;
    isFallbackRef.current = false;
    isMutedRef.current = false;
  }, []);

  const pause = useCallback(() => {
    isMutedRef.current = true;
    if (micVadRef.current) {
      try {
        micVadRef.current.pause();
      } catch { /* ignore */ }
    }
  }, []);

  const resume = useCallback(() => {
    isMutedRef.current = false;
    if (micVadRef.current) {
      try {
        micVadRef.current.start();
      } catch { /* ignore */ }
    }
  }, []);

  return { start, stop, pause, resume, vadMetrics };
}

