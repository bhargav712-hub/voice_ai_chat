/**
 * Pure date & time formatting utilities for conversational feeds and sessions.
 */

export function formatTime(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch {
    return '';
  }
}

export function formatRelativeDate(dateStr) {
  if (!dateStr) return 'Saved session';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const now = new Date();
    const diffMs = now - d;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return `Today, ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}`;
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  } catch {
    return dateStr;
  }
}

export function getMsgTime(msg) {
  if (msg?.timestamp) return formatTime(msg.timestamp);
  if (msg?.created_at) return formatTime(msg.created_at);
  return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
}
