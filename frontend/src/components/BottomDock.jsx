/**
 * BottomDock — Voice AI Control Island (Text bar completely removed).
 *
 * Provides:
 * - Dedicated Microphone toggle with strike-through (mic-off) functionality:
 *   - When active (mic on): actively listens to voice instructions.
 *   - When struck out (mic off): stops listening completely.
 * - End / Exit Live Voice Mode control.
 * - Session status indicator.
 */

export default function BottomDock({
  isVoiceMode,
  voiceState,
  isMuted,
  onExitVoiceMode,
  onToggleMute,
  onInterrupt,
}) {
  if (!isVoiceMode) {
    return null;
  }

  return (
    <div className="bottom-dock-container">
      <div className="bottom-dock-voice-bar live-controls">
        {/* Mute / Unmute Mic Button with Strike-through */}
        <button
          className={`dock-voice-action-btn mic-btn ${isMuted ? 'muted' : 'active'}`}
          onClick={onToggleMute}
          title={isMuted ? 'Mic is muted — click to unmute and listen' : 'Mic is listening — click to mute (strike-through)'}
          aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
        >
          {isMuted ? (
            /* Struck-through Microphone (Mic Off) */
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="2" y1="2" x2="22" y2="22" stroke="#ef4444" strokeWidth="2.5" />
              <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
              <path d="M5 10v2a7 7 0 0 0 12 5" />
              <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
              <line x1="12" y1="19" x2="12" y2="22" />
            </svg>
          ) : (
            /* Active Microphone (Listening) */
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="22" />
            </svg>
          )}
          <span className="mic-btn-label">{isMuted ? 'Muted' : 'Mic On'}</span>
        </button>

        {/* Interrupt button (active only when assistant is speaking) */}
        {voiceState === 'speaking' && (
          <button
            className="dock-voice-action-btn interrupt-btn"
            onClick={onInterrupt}
            title="Interrupt speech"
            aria-label="Interrupt assistant speech"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
            <span>Stop Speaking</span>
          </button>
        )}

        {/* Exit Live Mode Button */}
        <button
          className="dock-voice-action-btn exit-btn"
          onClick={onExitVoiceMode}
          title="Exit Live Voice Mode"
          aria-label="Exit Live Voice Mode"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
          <span>End Session</span>
        </button>
      </div>
    </div>
  );
}
