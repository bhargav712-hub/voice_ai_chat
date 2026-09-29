/**
 * useSession — SQLite conversation session management and persistence.
 *
 * Decouples relational session state and message history from real-time
 * audio hardware orchestration (resolving Architectural Problem P-17).
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import * as api from '../services/api';

function generateId() {
  return 'conv_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
}

// useSession: Decouples chat history persistence from the real-time audio pipeline, managing active session IDs in localStorage and SQLite.
export function useSession() {
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(() => {
    return localStorage.getItem('voice_ai_session_id') || generateId();
  });
  const [transcript, setTranscript] = useState([]);
  const historyRef = useRef([]);

  // Sync activeSessionId to localStorage
  useEffect(() => {
    localStorage.setItem('voice_ai_session_id', activeSessionId);
  }, [activeSessionId]);

  // Fetch all persisted conversation sessions from SQLite
  const refreshSessions = useCallback(async () => {
    try {
      const list = await api.getConversations();
      setSessions(list);
    } catch (err) {
      console.warn('[SESSION] Could not fetch conversations:', err);
    }
  }, []);

  // Initial load of sessions and active conversation
  useEffect(() => {
    refreshSessions();
  }, [refreshSessions]);

  // Load active conversation messages from SQLite on mount or session change
  const loadSession = useCallback(async (sessionId) => {
    try {
      const conv = await api.getConversation(sessionId);
      if (conv) {
        setActiveSessionId(conv.id);
        const msgs = conv.messages || [];
        setTranscript(msgs);
        historyRef.current = msgs.map(m => ({ role: m.role, content: m.content }));
      }
    } catch (err) {
      console.error('[SESSION] Error loading session:', err);
    }
  }, []);

  // Create a fresh conversation session
  const startNewSession = useCallback(async () => {
    const newId = generateId();
    setActiveSessionId(newId);
    setTranscript([]);
    historyRef.current = [];

    try {
      await api.createConversation('New Voice Session', newId);
      await refreshSessions();
    } catch (e) {
      console.warn('[SESSION] Could not pre-create session on backend:', e);
    }
    return newId;
  }, [refreshSessions]);

  // Delete a conversation session
  const deleteSession = useCallback(async (sessionId) => {
    try {
      await api.deleteConversation(sessionId);
      await refreshSessions();
      if (activeSessionId === sessionId) {
        await startNewSession();
      }
    } catch (err) {
      console.error('[SESSION] Delete session error:', err);
    }
  }, [activeSessionId, refreshSessions, startNewSession]);

  // Append user message to transcript and history
  const appendUserMessage = useCallback((text) => {
    if (!text || !text.trim()) return;
    const userMsg = { role: 'user', content: text.trim() };
    setTranscript(prev => [...prev, userMsg]);
    historyRef.current.push(userMsg);
  }, []);

  // Initialize placeholder for assistant response bubble
  const initAssistantMessage = useCallback(() => {
    setTranscript(prev => [...prev, { role: 'assistant', content: '' }]);
  }, []);

  // Progressively update assistant message text synchronized with spoken audio
  const updateAssistantMessage = useCallback((text) => {
    setTranscript(prev => {
      if (prev.length === 0) return [{ role: 'assistant', content: text }];
      const last = prev[prev.length - 1];
      if (last.role === 'assistant') {
        const updated = { ...last, content: text };
        return [...prev.slice(0, -1), updated];
      }
      return [...prev, { role: 'assistant', content: text }];
    });
  }, []);

  // Finalize assistant message into history when audio playback concludes
  const finalizeAssistantMessage = useCallback((finalText) => {
    setTranscript(prev => {
      const last = prev[prev.length - 1];
      const content = finalText || (last?.role === 'assistant' ? last.content : '');
      if (content) {
        const alreadySaved = historyRef.current.length > 0 &&
          historyRef.current[historyRef.current.length - 1].role === 'assistant' &&
          historyRef.current[historyRef.current.length - 1].content === content;
        if (!alreadySaved) {
          historyRef.current.push({ role: 'assistant', content });
        }
      }
      return prev;
    });
  }, []);

  return {
    sessions,
    activeSessionId,
    transcript,
    history: historyRef.current,
    refreshSessions,
    loadSession,
    startNewSession,
    deleteSession,
    appendUserMessage,
    initAssistantMessage,
    updateAssistantMessage,
    finalizeAssistantMessage,
  };
}
