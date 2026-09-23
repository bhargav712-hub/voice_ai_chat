/**
 * StatusIndicator — text beneath the orb describing current state.
 *
 * Renders a primary status line and a contextual hint.
 */
const STATUS_CONFIG = {
  idle: {
    text: 'Tap to speak',
    hint: 'Click the microphone button to start a conversation',
  },
  listening: {
    text: 'Listening…',
    hint: 'Speak now — I\'ll detect when you stop',
  },
  processing: {
    text: 'Thinking…',
    hint: null,
  },
  speaking: {
    text: 'Speaking…',
    hint: 'Click the microphone to interrupt',
  },
  error: {
    text: null,  // overridden by error message
    hint: 'Click the microphone to try again',
  },
};

export default function StatusIndicator({ state = 'idle', error = null }) {
  const cfg = STATUS_CONFIG[state] ?? STATUS_CONFIG.idle;

  return (
    <div className="status-indicator" aria-live="polite" aria-atomic="true">
      <p className="status-text" data-state={state}>
        {state === 'error' ? (error ?? 'An error occurred') : cfg.text}
      </p>
      {cfg.hint && (
        <p className="status-hint">{cfg.hint}</p>
      )}
    </div>
  );
}
