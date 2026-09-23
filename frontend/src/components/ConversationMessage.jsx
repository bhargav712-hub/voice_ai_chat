/**
 * ConversationMessage — ChatGPT-style speech transcript bubbles.
 *
 * Matches the reference design:
 * - User message: Right-aligned royal blue bubble with crisp white text.
 * - Assistant message: Left-aligned direct text with minimal icon action row
 *   (Copy, Thumbs Up, Share, Replay/Retry, More options).
 */
import { useState } from 'react';

export default function ConversationMessage({ role, content, onReplay }) {
  const [copied, setCopied] = useState(false);
  const [liked, setLiked] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleLike = () => {
    setLiked(prev => !prev);
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ text: content });
      } catch { /* ignored */ }
    } else {
      handleCopy();
    }
  };

  if (role === 'user') {
    return (
      <div className="transcript-row user-row">
        <div className="user-bubble">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="transcript-row assistant-row">
      <div className="assistant-text">
        {content}
      </div>
      <div className="assistant-action-row">
        {/* Copy */}
        <button
          className="chatgpt-action-btn"
          onClick={handleCopy}
          title={copied ? 'Copied to clipboard' : 'Copy'}
          aria-label="Copy transcript"
        >
          {copied ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          )}
        </button>

        {/* Thumbs Up */}
        <button
          className={`chatgpt-action-btn ${liked ? 'active' : ''}`}
          onClick={handleLike}
          title="Good response"
          aria-label="Thumbs up"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 10v12" />
            <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h3" />
            <path d="M7 10 11.29 2.71A2 2 0 0 1 13 2c.55 0 1 .45 1 1v4.5" />
          </svg>
        </button>

        {/* Share */}
        <button
          className="chatgpt-action-btn"
          onClick={handleShare}
          title="Share"
          aria-label="Share transcript"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
            <polyline points="16 6 12 2 8 6" />
            <line x1="12" y1="2" x2="12" y2="15" />
          </svg>
        </button>

        {/* Replay / Regenerate */}
        <button
          className="chatgpt-action-btn"
          onClick={() => onReplay?.(content)}
          title="Replay audio"
          aria-label="Replay audio output"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
          </svg>
        </button>

        {/* More */}
        <button
          className="chatgpt-action-btn"
          title="More options"
          aria-label="More options"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="12" r="1.5" />
            <circle cx="19" cy="12" r="1.5" />
            <circle cx="5" cy="12" r="1.5" />
          </svg>
        </button>
      </div>
    </div>
  );
}
