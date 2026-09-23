/**
 * Header — top navigation bar.
 * Shows the app title, a live state dot, session storage drawer button, and new session button.
 */
export default function Header({
  state = 'idle',
  onOpenHistory,
  onNewSession,
  hasMessages,
  isVadOnlyMode,
  onToggleVadOnlyMode,
}) {
  return (
    <header className="header">
      <div className="header-title">
        <span className="header-dot" data-state={state} aria-hidden="true" />
        <h1>Voice AI</h1>
        <span className="header-badge">Live STS</span>
        {isVadOnlyMode && <span className="header-badge vad-active-badge">⚡ VAD Latency Test</span>}
      </div>

      <div className="header-actions">
        <button
          className={`header-vad-btn ${isVadOnlyMode ? 'active' : ''}`}
          onClick={onToggleVadOnlyMode}
          title="Toggle VAD-only Latency Test Mode (Executes only Silero VAD without calling backend)"
          aria-label="Toggle VAD Latency Mode"
        >
          <span className="vad-icon">⚡</span>
          <span>{isVadOnlyMode ? 'VAD-Only Active' : 'Test VAD Only'}</span>
        </button>

        <button
          className="header-storage-btn"
          onClick={onOpenHistory}
          title="Stored Voice Conversations"
          aria-label="View saved voice sessions"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span>Sessions</span>
        </button>

        {hasMessages && (
          <button
            className="btn-icon"
            onClick={onNewSession}
            title="Start new voice session"
            aria-label="Start new session"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        )}
      </div>
    </header>
  );
}
