import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Menu, X, Mic, Volume2, History, Plus, Trash2, 
  User, Radio, VolumeX, Sparkles, Copy, Check, RotateCcw,
  MoreVertical, Settings
} from 'lucide-react';
import { useVoicePipeline } from './hooks/useVoicePipeline';
import * as api from './services/api';
import VADMonitor from './components/VADMonitor';
import VoiceOrb from './components/VoiceOrb';

// ── Timestamp Formatter ──
function formatTime(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch { return ''; }
}

// ── Relative Date for Sidebar ──
function formatRelativeDate(dateStr) {
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
  } catch { return dateStr; }
}

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
    exitVoiceMode,
    toggleMute,
    interrupt,
    startNewSession,
    loadSession,
  } = useVoicePipeline();

  // Load persistent SQLite sessions on mount
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

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript, state]);

  // Current session title
  const currentSession = sessions.find(s => s.id === activeSessionId) || {
    id: activeSessionId,
    title: 'Live Voice Session',
    created_at: 'Now'
  };

  const isListening = state === 'listening';
  const isSpeaking = state === 'speaking';
  const isProcessing = state === 'processing';

  // Mercury Status Label
  const getStatusLabel = () => {
    if (isVadOnlyMode) return 'VAD Test Active';
    if (isMuted) return 'Muted';
    if (isSpeaking) return 'Speaking…';
    if (isProcessing) return 'Thinking…';
    if (isListening) return 'Listening…';
    return 'Ready to talk';
  };

  // Toggle Live Voice Mode via Central Orb
  const handleOrbClick = () => {
    if (!isVoiceMode) {
      enterVoiceMode();
    } else if (isSpeaking) {
      interrupt();
    } else {
      toggleMute();
    }
  };

  // Handle New Session
  const handleCreateNewSession = async () => {
    await startNewSession();
    await refreshSessions();
  };

  // Handle Delete Session
  const handleDeleteSession = async (e, id) => {
    e.stopPropagation();
    try {
      await api.deleteConversation(id);
      await refreshSessions();
      if (activeSessionId === id) {
        await startNewSession();
      }
    } catch (err) {
      console.error('[STORAGE] Delete error:', err);
    }
  };

  // Handle TTS Audio Replay
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

  // Handle Copy text
  const handleCopy = (id, text) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Quick Prompt Chips
  const quickChips = [
    "What can you do?",
    "Explain neural voice synthesis",
    "Tell me an interesting fact",
    "How does Silero VAD work?"
  ];

  const handleChipClick = (_chip) => {
    if (!isVoiceMode) {
      enterVoiceMode();
    }
  };

  // Message timestamp — use message.timestamp if available, else generate "now" for live messages
  const getMsgTime = (msg, _idx) => {
    if (msg.timestamp) return formatTime(msg.timestamp);
    if (msg.created_at) return formatTime(msg.created_at);
    // For live transcript messages without timestamps, show current time
    return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  return (
    <div className="flex h-screen w-full bg-[#171721] text-[#ededf3] overflow-hidden font-sans select-none">
      
      {/* ── Mercury Collapsible Sidebar (Graphite Card Surface #1e1e2a) ── */}
      <aside 
        className={`${
          isSidebarOpen ? 'w-56 md:w-64 translate-x-0' : 'w-0 -translate-x-full'
        } transition-all duration-300 ease-in-out bg-[#1e1e2a] border-r border-[#70707d]/20 flex flex-col absolute md:relative z-30 h-full shrink-0 overflow-hidden`}
      >
        {/* Sidebar Header with Brand Mark */}
        <div className="flex items-center justify-between p-4 border-b border-[#70707d]/20 min-w-[14rem] md:min-w-[16rem]">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-full bg-[#5266eb] flex items-center justify-center shadow-none shrink-0">
              <Volume2 className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-[480] tracking-wide text-[#ededf3]">
                Voice AI
              </h1>
              <p className="text-[9px] text-[#c3c3cc] uppercase tracking-[0.14em] font-[400]">Realtime Assistant</p>
            </div>
          </div>
          
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className="p-1.5 rounded-lg text-[#c3c3cc] hover:text-[#ededf3] bg-[#272735]/60 hover:bg-[#272735] border border-[#70707d]/20 transition flex items-center justify-center"
            aria-label="Close sidebar"
            title="Collapse sidebar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* New Session Button (Mercury Primary Cobalt Pill) */}
        <div className="px-3 pt-3 pb-2 min-w-[14rem] md:min-w-[16rem]">
          <button 
            onClick={handleCreateNewSession}
            className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 rounded-[32px] bg-[#5266eb] hover:bg-[#4355d6] text-white font-[400] text-[13px] transition-all active:scale-[0.98] shadow-[0_0_15px_rgba(82,102,235,0.25)]"
          >
            <Plus className="w-4 h-4" />
            <span>New Chat Session</span>
          </button>
        </div>

        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto px-3 pb-3 min-w-[14rem] md:min-w-[16rem] custom-scrollbar">
          <div className="px-1 py-2 text-[10px] font-[480] uppercase tracking-[0.1em] text-[#c3c3cc] flex items-center justify-between">
            <span className="flex items-center space-x-1.5">
              <History className="w-3.5 h-3.5" />
              <span>Chats History</span>
            </span>
            <span className="text-[10px] bg-[#272735] text-[#ededf3] px-2 py-0.5 rounded-full border border-[#70707d]/20">{sessions.length}</span>
          </div>

          <div className="space-y-1 mt-1">
            {sessions.map((s) => {
              const isActive = s.id === activeSessionId;
              return (
                <div
                  key={s.id}
                  onClick={() => loadSession(s.id)}
                  className={`group flex items-center justify-between px-3 py-2.5 rounded-[10px] cursor-pointer text-[13px] transition-all border ${
                    isActive 
                      ? 'bg-[#272735] text-[#ededf3] border-l-2 border-[#5266eb] border-t-transparent border-r-transparent border-b-transparent' 
                      : 'bg-transparent border-transparent text-[#c3c3cc] hover:bg-[#272735]/60 hover:text-[#ededf3]'
                  }`}
                >
                  <div className="flex items-center space-x-2.5 overflow-hidden">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${isActive ? 'bg-[#5266eb]' : 'bg-[#70707d]/60'}`} />
                    <div className="truncate">
                      <p className="truncate font-[480] text-[13px]">{s.title || 'Voice Session'}</p>
                      <p className="text-[10px] text-[#c3c3cc]/70 truncate mt-0.5">{formatRelativeDate(s.created_at)}</p>
                    </div>
                  </div>

                  <button
                    onClick={(e) => handleDeleteSession(e, s.id)}
                    className="opacity-60 group-hover:opacity-100 p-1.5 rounded-lg text-[#c3c3cc] hover:text-red-300 hover:bg-red-500/20 transition shrink-0 ml-1"
                    title="Delete session"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sidebar Footer */}
        <div className="px-3 py-3 border-t border-[#70707d]/20 min-w-[14rem] md:min-w-[16rem] flex items-center justify-between bg-[#1e1e2a] text-[11px] text-[#c3c3cc]">
          <div className="flex items-center space-x-2">
            <Radio className={`w-3.5 h-3.5 ${isListening ? 'text-[#5266eb] animate-pulse' : 'text-[#70707d]'}`} />
            <span>Web Speech Engine</span>
          </div>
          <button 
            onClick={toggleMute} 
            className={`p-2 rounded-lg border transition ${
              isMuted 
                ? 'bg-red-500/20 text-red-300 border-red-500/30' 
                : 'bg-[#272735] text-[#ededf3] border-[#70707d]/20 hover:bg-[#323244]'
            }`}
            title={isMuted ? "Unmute Microphone" : "Mute Microphone"}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </aside>

      {/* ── Main Canvas (Onyx Background #171721) ── */}
      <main className="flex-1 flex flex-col relative h-full w-full overflow-hidden bg-[#171721]">
        
        {/* Top Floating App Bar */}
        <header className="h-14 px-5 flex items-center justify-between border-b border-[#70707d]/20 bg-[#171721]/90 backdrop-blur-md z-20 shrink-0">
          <div className="flex items-center space-x-3">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 rounded-lg bg-[#1e1e2a] border border-[#70707d]/25 text-[#c3c3cc] hover:text-[#ededf3] hover:bg-[#272735] transition flex items-center justify-center"
              aria-label={isSidebarOpen ? "Collapse sidebar" : "Open sidebar"}
              title={isSidebarOpen ? "Collapse sidebar" : "Open sidebar"}
            >
              <Menu className="w-4 h-4" />
            </button>

            <span className="font-[480] text-sm tracking-wide text-[#ededf3] truncate max-w-[200px] md:max-w-md">
              {currentSession.title}
            </span>
          </div>

          {/* Right Controls: Status Pill + VAD Toggle + Voice Action */}
          <div className="flex items-center space-x-2.5">
            <button
              onClick={toggleVadOnlyMode}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-[32px] text-[11px] font-[480] tracking-wide transition border ${
                isVadOnlyMode 
                  ? 'bg-[#5266eb] border-[#5266eb] text-white shadow-[0_0_12px_rgba(82,102,235,0.4)]' 
                  : 'bg-[#272735] border-[#70707d]/30 text-[#c3c3cc] hover:text-[#ededf3] hover:border-[#5266eb]/50'
              }`}
              title="Toggle VAD Latency Test Mode"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isVadOnlyMode ? 'VAD Active' : 'Test VAD'}</span>
            </button>

            {/* Status Pill */}
            <div className="flex items-center space-x-2 px-3 py-1.5 rounded-[32px] bg-[#272735] border border-[#70707d]/20 text-[11px] font-[400] text-[#c3c3cc]">
              <div 
                className={`w-2 h-2 rounded-full transition-colors ${
                  isSpeaking 
                    ? 'bg-[#5266eb] animate-ping' 
                    : isListening 
                    ? 'bg-[#5266eb] animate-pulse' 
                    : isVoiceMode
                    ? 'bg-emerald-400'
                    : 'bg-[#70707d]'
                }`} 
              />
              <span className={isSpeaking || isListening ? 'text-[#ededf3]' : 'text-[#c3c3cc]'}>
                {getStatusLabel()}
              </span>
            </div>

            {isVoiceMode ? (
              <button
                onClick={exitVoiceMode}
                className="px-3 py-1.5 rounded-[32px] bg-red-500/15 hover:bg-red-500/25 text-red-300 text-[11px] font-[480] transition border border-red-500/30 flex items-center space-x-1"
                title="End Active Voice Session"
              >
                <span>Disconnect</span>
              </button>
            ) : (
              <button
                onClick={enterVoiceMode}
                className="px-3 py-1.5 rounded-[32px] bg-[#5266eb]/20 hover:bg-[#5266eb]/35 text-[#ededf3] text-[11px] font-[480] transition border border-[#5266eb]/40 flex items-center space-x-1"
                title="Connect live voice pipeline"
              >
                <Mic className="w-3 h-3 text-[#5266eb]" />
                <span>Connect Voice</span>
              </button>
            )}
          </div>
        </header>

        {/* ── Message Feed & Transcript ── */}
        <div className="flex-1 overflow-y-auto px-4 md:px-8 pt-6 pb-56 custom-scrollbar">
          <div className="max-w-2xl w-full mx-auto space-y-5">
            
            {/* Real-time VAD Latency Monitor */}
            {isVadOnlyMode && (
              <VADMonitor
                vadMetrics={vadMetrics}
                lastVadEvent={lastVadEvent}
                isVadOnlyMode={isVadOnlyMode}
                onToggleVadOnlyMode={toggleVadOnlyMode}
                isVoiceMode={isVoiceMode}
                volume={volume}
              />
            )}

            {error && (
              <div className="p-3 rounded-[12px] bg-[#272735] border border-red-500/40 text-red-300 text-xs text-center">
                {error}
              </div>
            )}

            {/* Empty state welcome */}
            {transcript.length === 0 && (
              <div className="text-center py-20 space-y-3">
                <div className="w-12 h-12 rounded-full bg-[#1e1e2a] flex items-center justify-center mx-auto text-[#5266eb]">
                  <Sparkles className="w-6 h-6" />
                </div>
                <h2 className="text-lg font-[480] text-[#ededf3] tracking-wide">Voice AI</h2>
                <p className="text-[13px] text-[#c3c3cc] max-w-sm mx-auto leading-relaxed">
                  Click the orb below or speak freely. Hands-free neural voice conversation powered by Groq Whisper, LLaMA-3.3, and Edge-TTS.
                </p>
              </div>
            )}

            {/* Messages Feed */}
            {transcript.map((msg, i) => {
              const isUser = msg.role === 'user';
              const timeStr = getMsgTime(msg, i);
              return (
                <div key={i} className={`flex items-start gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
                  
                  {/* Assistant: Copy/Replay action column (left of bubble) */}
                  {!isUser && msg.content && (
                    <div className="flex flex-col items-center gap-1 pt-2 shrink-0">
                      <button
                        onClick={() => handleCopy(`msg-${i}`, msg.content)}
                        className="p-1.5 rounded-lg text-[#c3c3cc] hover:text-[#ededf3] hover:bg-[#272735] transition opacity-75 hover:opacity-100"
                        style={{ opacity: copiedId === `msg-${i}` ? 1 : undefined }}
                        title="Copy response"
                      >
                        {copiedId === `msg-${i}` ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  )}

                  {/* Message Content */}
                  <div className={`group max-w-[80%] md:max-w-[70%] transition-all ${
                    isUser
                      ? 'text-[#ededf3] px-1 py-2'
                      : 'text-[#ededf3] px-1 py-2'
                  }`}>
                    <p className="leading-relaxed whitespace-pre-wrap text-[14px] font-[400]">{msg.content}</p>
                    
                    {/* Timestamp row */}
                    <div className={`flex items-center mt-2 ${isUser ? 'justify-end' : 'justify-between'}`}>
                      {!isUser && msg.content && (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleCopy(`msg-${i}`, msg.content)}
                            className="p-1 rounded text-[#c3c3cc] hover:text-[#ededf3] hover:bg-[#272735] transition"
                            title="Copy response"
                          >
                            {copiedId === `msg-${i}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          </button>
                          <button
                            onClick={() => handleReplayText(msg.content)}
                            className="p-1 rounded text-[#c3c3cc] hover:text-[#ededf3] hover:bg-[#272735] transition"
                            title="Replay audio"
                          >
                            <RotateCcw className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                      <span className={`text-[10px] font-[400] ${isUser ? 'text-white/60' : 'text-[#c3c3cc]/50'}`}>
                        {timeStr}
                      </span>
                    </div>
                  </div>

                  {/* User Avatar (right of bubble) */}
                  {isUser && (
                    <div className="w-7 h-7 rounded-full bg-[#272735] border border-[#70707d]/25 flex items-center justify-center text-[#ededf3] shrink-0 mt-1">
                      <User className="w-3.5 h-3.5" />
                    </div>
                  )}
                </div>
              );
            })}

            {/* Speaking / Streaming Indicator */}
            {isSpeaking && (
              <div className="flex items-center space-x-2 text-[#5266eb] text-xs px-2 py-1">
                <div className="flex space-x-1 items-center">
                  <span className="w-1.5 h-3 bg-[#5266eb] rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                  <span className="w-1.5 h-4 bg-[#7080ff] rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                  <span className="w-1.5 h-2.5 bg-[#5266eb] rounded-full animate-bounce"></span>
                </div>
                <span className="text-[#c3c3cc] font-[400]">Voice AI is speaking…</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* ── Bottom Floating Dock (Mercury Aesthetic) ── */}
        <div className="absolute bottom-0 left-0 w-full h-48 bg-gradient-to-t from-[#171721] via-[#171721]/95 to-transparent flex flex-col items-center justify-end pb-6 pointer-events-none z-20">
          
          {/* Quick Speech Starter Chips */}
          {!isVoiceMode && transcript.length === 0 && (
            <div className="pointer-events-auto flex items-center flex-wrap justify-center gap-2 mb-4 px-4 max-w-lg">
              {quickChips.map((chip, idx) => (
                <button
                  key={idx}
                  onClick={() => handleChipClick(chip)}
                  className="text-[11px] px-3.5 py-1.5 rounded-[40px] bg-[#1e1e2a] hover:bg-[#272735] text-[#c3c3cc] hover:text-[#ededf3] border border-[#70707d]/20 transition"
                >
                  "{chip}"
                </button>
              ))}
            </div>
          )}

          {/* Interactive Mercury Voice Orb + Waveform + Live VAD State */}
          <VoiceOrb
            isVoiceMode={isVoiceMode}
            isMuted={isMuted}
            state={state}
            volume={volume}
            vadMetrics={vadMetrics}
            onOrbClick={handleOrbClick}
          />
        </div>

        {/* ── Right-side Floating Action Buttons (Mercury Utility Dock) ── */}
        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2.5 z-20">
          <button 
            className="p-2.5 rounded-xl bg-[#1e1e2a] border border-[#70707d]/35 text-[#c3c3cc] hover:text-[#ededf3] hover:bg-[#272735] hover:border-[#5266eb]/60 transition shadow-lg flex items-center justify-center"
            title="More options"
            aria-label="More options"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
          <button 
            onClick={toggleVadOnlyMode}
            className={`p-2.5 rounded-xl border transition shadow-lg flex items-center justify-center ${
              isVadOnlyMode
                ? 'bg-[#5266eb] border-[#5266eb] text-white shadow-[0_0_15px_rgba(82,102,235,0.6)]' 
                : 'bg-[#1e1e2a] border-[#70707d]/35 text-[#c3c3cc] hover:text-[#ededf3] hover:bg-[#272735] hover:border-[#5266eb]/60'
            }`}
            title="Toggle VAD Latency Test"
            aria-label="Toggle VAD Latency Test"
          >
            <Sparkles className="w-4 h-4" />
          </button>
          <button 
            className="p-2.5 rounded-xl bg-[#1e1e2a] border border-[#70707d]/35 text-[#c3c3cc] hover:text-[#ededf3] hover:bg-[#272735] hover:border-[#5266eb]/60 transition shadow-lg flex items-center justify-center"
            title="Settings"
            aria-label="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>

      </main>

    </div>
  );
}
