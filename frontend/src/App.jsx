import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useVoicePipeline } from './hooks/useVoicePipeline';
import * as api from './services/api';
import SessionsSidebar from './components/SessionsSidebar';
import TopHeader from './components/TopHeader';
import MessageFeed from './components/MessageFeed';
import VoiceOrb from './components/VoiceOrb';

export default function App() {
  const [sessions, setSessions] = useState([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [copiedId, setCopiedId] = useState(null);
  const messagesEndRef = useRef(null);

  const {
    isVoiceMode,
    state,
    isMuted,
    volume,
    transcript,
    error,
    activeSessionId,
    vadMetrics,
    lastVadEvent,
    isVadOnlyMode,
    toggleVadOnlyMode,
    enterVoiceMode,
    toggleMute,
    interrupt,
    startNewSession,
    loadSession,
  } = useVoicePipeline();

  // Load persistent SQLite sessions on mount and when transcript updates
  const refreshSessions = useCallback(async () => {
    try {
      const list = await api.getConversations();
      setSessions(list);
    } catch (err) {
      console.warn('[STORAGE] Could not fetch sessions:', err);
    }
  }, []);

  useEffect(() => {
    refreshSessions();
  }, [refreshSessions, activeSessionId, transcript.length]);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  // Derived UI states
  const isSpeaking = state === 'speaking';
  const isListening = state === 'listening';
  const isProcessing = state === 'processing';

  const currentSession = sessions.find((s) => s.id === activeSessionId) || {
    title: 'Live Voice Session',
  };

  const getStatusLabel = () => {
    if (isMuted) return 'Muted';
    if (isSpeaking) return 'Voice AI Speaking';
    if (isProcessing) return 'Thinking…';
    if (isListening) return 'Listening…';
    if (isVoiceMode) return 'Voice Mode Ready';
    return 'Voice Mode Inactive';
  };

  // Orb Action
  const handleOrbClick = () => {
    if (isSpeaking) {
      interrupt();
    } else if (!isVoiceMode) {
      enterVoiceMode();
    } else {
      toggleMute();
    }
  };

  // Create New Session
  const handleCreateNewSession = () => {
    startNewSession();
    refreshSessions();
  };

  // Delete Session
  const handleDeleteSession = async (e, id) => {
    e.stopPropagation();
    try {
      await api.deleteConversation(id);
      await refreshSessions();
      if (activeSessionId === id) {
        startNewSession();
      }
    } catch (err) {
      console.error('[STORAGE] Delete error:', err);
    }
  };

  // Audio Replay
  const handleReplayText = async (text) => {
    try {
      const audioBlob = await api.tts(text);
      const url = URL.createObjectURL(audioBlob);
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
    } catch (err) {
      console.warn('[TTS] Replay failed:', err);
    }
  };

  // Copy Message Text
  const handleCopy = (id, text) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="flex h-screen w-full bg-[#171721] text-[#ededf3] overflow-hidden font-sans select-none">
      {/* ── Sessions Drawer ── */}
      <SessionsSidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={loadSession}
        onCreateSession={handleCreateNewSession}
        onDeleteSession={handleDeleteSession}
        isListening={isListening}
        isMuted={isMuted}
        onToggleMute={toggleMute}
      />

      {/* ── Main Canvas ── */}
      <main className="flex-1 flex flex-col relative h-full w-full overflow-hidden bg-[#171721]">
        {/* Top Floating App Bar */}
        <TopHeader
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          sessionTitle={currentSession.title}
          isSpeaking={isSpeaking}
          isListening={isListening}
          isVoiceMode={isVoiceMode}
          statusLabel={getStatusLabel()}
        />

        {/* Conversation Message Feed */}
        <MessageFeed
          transcript={transcript}
          isSpeaking={isSpeaking}
          error={error}
          copiedId={copiedId}
          onCopy={handleCopy}
          onReplay={handleReplayText}
          isVadOnlyMode={isVadOnlyMode}
          vadMetrics={vadMetrics}
          lastVadEvent={lastVadEvent}
          toggleVadOnlyMode={toggleVadOnlyMode}
          isVoiceMode={isVoiceMode}
          volume={volume}
          messagesEndRef={messagesEndRef}
        />

        {/* ── Bottom Floating Action Dock ── */}
        <div className="absolute bottom-0 left-0 w-full h-48 bg-gradient-to-t from-[#171721] via-[#171721]/95 to-transparent flex flex-col items-center justify-end pb-6 pointer-events-none z-20">
          <VoiceOrb
            isVoiceMode={isVoiceMode}
            isMuted={isMuted}
            state={state}
            volume={volume}
            vadMetrics={vadMetrics}
            onOrbClick={handleOrbClick}
          />
        </div>
      </main>
    </div>
  );
}
