/**
 * HistoryDrawer — Slide-out drawer for Speech-to-Speech conversation storage.
 *
 * Displays saved sessions, message counts, and lets the user browse,
 * reload past speech transcripts, or start a new voice session.
 */
import { useEffect, useState } from 'react';
import * as api from '../services/api';

export default function HistoryDrawer({
  isOpen,
  activeSessionId,
  onClose,
  onSelectSession,
  onNewSession,
}) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let ignore = false;
    async function fetchSessions() {
      setLoading(true);
      try {
        const list = await api.getConversations();
        if (!ignore) setConversations(list);
      } catch (err) {
        console.warn('[STORAGE] Could not fetch conversations:', err);
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    if (isOpen) {
      fetchSessions();
    }
    return () => { ignore = true; };
  }, [isOpen]);

  async function handleDelete(e, id) {
    e.stopPropagation();
    try {
      await api.deleteConversation(id);
      setConversations(prev => prev.filter(c => c.id !== id));
      if (activeSessionId === id) {
        onNewSession?.();
      }
    } catch (err) {
      console.error('[STORAGE] Error deleting session:', err);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer-content" onClick={e => e.stopPropagation()}>
        <div className="drawer-header">
          <div className="drawer-title-group">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <h2>Voice Sessions</h2>
          </div>
          <button className="drawer-close-btn" onClick={onClose} title="Close drawer">
            ✕
          </button>
        </div>

        <div className="drawer-actions">
          <button
            className="drawer-new-session-btn"
            onClick={() => {
              onNewSession?.();
              onClose?.();
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>New Voice Session</span>
          </button>
        </div>

        <div className="drawer-list">
          {loading ? (
            <div className="drawer-loading">Loading saved sessions…</div>
          ) : conversations.length === 0 ? (
            <div className="drawer-empty">
              <p>No saved voice conversations yet.</p>
              <span>Speak in Voice Mode to auto-save conversations here.</span>
            </div>
          ) : (
            conversations.map(conv => (
              <div
                key={conv.id}
                className={`drawer-item ${conv.id === activeSessionId ? 'active' : ''}`}
                onClick={() => {
                  onSelectSession?.(conv.id);
                  onClose?.();
                }}
              >
                <div className="drawer-item-body">
                  <div className="drawer-item-title">{conv.title || 'Voice Session'}</div>
                  {conv.first_instruction && (
                    <div className="drawer-item-preview">"{conv.first_instruction}"</div>
                  )}
                  <div className="drawer-item-meta">
                    <span className="drawer-msg-count">{conv.message_count || 0} turns</span>
                    <span className="drawer-date">
                      {new Date(conv.updated_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
                <button
                  className="drawer-delete-btn"
                  onClick={e => handleDelete(e, conv.id)}
                  title="Delete conversation"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
