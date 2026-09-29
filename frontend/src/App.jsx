import React, { useState, useEffect, useRef } from 'react';
import { useSession } from './hooks/useSession';
import { useVoicePipeline } from './hooks/useVoicePipeline';
import * as api from './services/api';
import SessionsSidebar from './components/SessionsSidebar';
import TopHeader from './components/TopHeader';
import MessageFeed from './components/MessageFeed';
import VoiceOrb from './components/VoiceOrb';

export default function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [copiedId, setCopiedId] = useState(null);
  const messagesEndRef = useRef(null);

  // Decoupled SQLite session persistence (P-17)
  const {
    sessions,
    activeSessionId,
    transcript,
    history,
    refreshSessions,
    loadSession,
    startNewSession,
    deleteSession,
    appendUserMessage,
    initAssistantMessage,
    updateAssistantMessage,
    finalizeAssistantMessage,
  } = useSession();

  // Lean real-time conversational audio conductor (P-17, P-18)
  const {
    isVoiceMode,
    state,
    isMuted,
    isUserSpeaking,
    volume,
    error,
    enterVoiceMode,
    toggleMute,
    interrupt,
  } = useVoicePipeline({
    sessionId: activeSessionId,
    history,
    onUserTranscript: (text) => {
      appendUserMessage(text);
      initAssistantMessage();
    },
    onAssistantTextProgress: (spokenSoFar) => {
      updateAssistantMessage(spokenSoFar);
    },
    onAssistantDone: () => {
      finalizeAssistantMessage();
      refreshSessions();
    },
  });

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

  // handleOrbClick: Single-action central button handler that interrupts active speech, starts voice mode, or toggles microphone mute depending on state.
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
  const handleCreateNewSession = async () => {
    await startNewSession();
  };

  // Delete Session
  const handleDeleteSession = async (e, id) => {
    e.stopPropagation();
    await deleteSession(id);
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
          messagesEndRef={messagesEndRef}
        />

        {/* ── Bottom Floating Action Dock ── */}
        <div className="absolute bottom-0 left-0 w-full h-48 bg-gradient-to-t from-[#171721] via-[#171721]/95 to-transparent flex flex-col items-center justify-end pb-6 pointer-events-none z-20">
          <VoiceOrb
            isVoiceMode={isVoiceMode}
            isMuted={isMuted}
            state={state}
            volume={volume}
            isUserSpeaking={isUserSpeaking}
            onOrbClick={handleOrbClick}
            onToggleMute={toggleMute}
          />
        </div>
      </main>
    </div>
  );
}
