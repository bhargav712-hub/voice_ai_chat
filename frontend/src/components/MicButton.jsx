/**
 * MicButton — microphone trigger button.
 *
 * Behaviour by state
 * ──────────────────
 *   idle        → click starts listening
 *   listening   → click manually stops recording (submit early)
 *   processing  → disabled (pipeline in flight)
 *   speaking    → click cancels AI playback
 *   error       → click retries (starts listening)
 */

// SVG icons for each state
function MicIcon() {
  return (
    <svg className="mic-icon" width="22" height="22" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8"  y1="23" x2="16" y2="23" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg className="mic-icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"
      aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="3" />
    </svg>
  );
}

function CancelIcon() {
  return (
    <svg className="mic-icon" width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export default function MicButton({ state = 'idle', onClick }) {
  const isDisabled = state === 'processing';

  const icon = state === 'listening' ? <StopIcon />
    : state === 'speaking'           ? <CancelIcon />
    : <MicIcon />;

  const label = state === 'idle'        ? 'Start listening'
    : state === 'listening'             ? 'Stop recording'
    : state === 'processing'            ? 'Processing…'
    : state === 'speaking'              ? 'Stop AI response'
    : 'Retry';

  return (
    <button
      id="btn-mic"
      className="mic-btn"
      data-state={state}
      onClick={onClick}
      disabled={isDisabled}
      aria-label={label}
      title={label}
    >
      {state === 'processing'
        ? <span className="processing-dots" aria-hidden="true">
            <span /><span /><span />
          </span>
        : icon
      }
      <span className="sr-only">{label}</span>
    </button>
  );
}
