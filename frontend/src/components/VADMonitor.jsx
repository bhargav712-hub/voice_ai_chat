import { useState, useEffect, useMemo } from 'react';

/**
 * VADMonitor — Visual real-time Voice Activity Detection (VAD) latency tester.
 * Allows observing speech start, speech end, detection latency, and audio sample metrics
 * directly on screen without waiting for STT/LLM/TTS.
 */
export default function VADMonitor({
  vadMetrics,
  lastVadEvent,
  isVadOnlyMode,
  onToggleVadOnlyMode,
  isVoiceMode,
  volume = 0,
}) {
  const [liveDuration, setLiveDuration] = useState(0);

  // Update live speaking duration while user is speaking
  useEffect(() => {
    if (!vadMetrics.isSpeaking || !vadMetrics.speechStartTime) {
      return;
    }
    const interval = setInterval(() => {
      setLiveDuration(Math.round(performance.now() - vadMetrics.speechStartTime));
    }, 50);
    return () => {
      clearInterval(interval);
      setLiveDuration(0);
    };
  }, [vadMetrics.isSpeaking, vadMetrics.speechStartTime]);

  // Derive playable URL for captured speech blob
  const audioUrl = useMemo(() => {
    if (lastVadEvent && lastVadEvent.wavBlob) {
      return URL.createObjectURL(lastVadEvent.wavBlob);
    }
    return null;
  }, [lastVadEvent]);

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const handlePlayCapturedAudio = () => {
    if (audioUrl) {
      const audio = new Audio(audioUrl);
      audio.play().catch(e => console.warn('Audio play error:', e));
    }
  };

  return (
    <div className={`vad-monitor-card ${isVadOnlyMode ? 'active-test-mode' : ''}`}>
      <div className="vad-monitor-header">
        <div className="vad-monitor-title">
          <span className="vad-pulse-dot" data-speaking={vadMetrics.isSpeaking} />
          <strong>VAD Latency Monitor</strong>
          <span className="vad-engine-badge">{vadMetrics.engine || 'Silero VAD v5'}</span>
        </div>

        <button
          className={`vad-toggle-btn ${isVadOnlyMode ? 'btn-active' : ''}`}
          onClick={onToggleVadOnlyMode}
          title={isVadOnlyMode ? 'Disable VAD-Only Mode' : 'Enable VAD-Only Latency Mode'}
        >
          {isVadOnlyMode ? '⚡ VAD-Only Active' : '⚡ Test VAD Only'}
        </button>
      </div>

      {/* Visual Speech Activity Bar */}
      <div className="vad-activity-indicator" data-speaking={vadMetrics.isSpeaking}>
        <div className="vad-activity-state">
          {!isVoiceMode ? (
            <span className="vad-state-idle">⚪ Voice Mode Off (Click Orb to Start)</span>
          ) : vadMetrics.isSpeaking ? (
            <span className="vad-state-speaking">
              🎙️ Speech Active · <strong>{liveDuration} ms</strong>
            </span>
          ) : lastVadEvent?.type === 'end' ? (
            <span className="vad-state-ended">
              ⚡ Speech Ended · Detected in <strong>{lastVadEvent.metrics?.durationMs || 0} ms</strong>
            </span>
          ) : (
            <span className="vad-state-ready">👂 Listening for speech…</span>
          )}
        </div>

        {/* Volume Level bar */}
        <div className="vad-volume-track">
          <div
            className="vad-volume-fill"
            style={{ width: `${Math.min(100, Math.round(volume * 100))}%` }}
          />
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="vad-stats-grid">
        <div className="vad-stat-box">
          <span className="vad-stat-label">Last Duration</span>
          <span className="vad-stat-value">
            {lastVadEvent?.metrics?.durationMs ? `${lastVadEvent.metrics.durationMs} ms` : '—'}
          </span>
        </div>

        <div className="vad-stat-box">
          <span className="vad-stat-label">Audio Samples</span>
          <span className="vad-stat-value">
            {lastVadEvent?.metrics?.samplesCount ? `${lastVadEvent.metrics.samplesCount.toLocaleString()}` : '—'}
          </span>
        </div>

        <div className="vad-stat-box">
          <span className="vad-stat-label">WAV Size</span>
          <span className="vad-stat-value">
            {lastVadEvent?.metrics?.blobSize ? `${(lastVadEvent.metrics.blobSize / 1024).toFixed(1)} KB` : '—'}
          </span>
        </div>

        <div className="vad-stat-box">
          <span className="vad-stat-label">Capture Quality</span>
          <span className="vad-stat-value">16kHz Mono</span>
        </div>
      </div>

      {/* Audio Slice Verification */}
      {audioUrl && (
        <div className="vad-audio-preview-row">
          <button
            className="vad-playback-btn"
            onClick={handlePlayCapturedAudio}
            title="Play back the exact audio slice detected by Silero VAD"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            <span>Play Captured Audio Slice</span>
          </button>
          <span className="vad-preview-hint">Verified 16kHz WAV format</span>
        </div>
      )}
    </div>
  );
}
