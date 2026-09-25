import React from 'react';
import { Menu } from 'lucide-react';

export default function TopHeader({
  isSidebarOpen,
  onToggleSidebar,
  sessionTitle = 'Voice Session',
  isSpeaking,
  isListening,
  isVoiceMode,
  statusLabel,
}) {
  return (
    <header className="h-14 px-5 flex items-center justify-between border-b border-[#70707d]/20 bg-[#171721]/90 backdrop-blur-md z-20 shrink-0">
      <div className="flex items-center space-x-3">
        <button
          onClick={onToggleSidebar}
          className="p-2 rounded-lg bg-[#1e1e2a] border border-[#70707d]/25 text-[#c3c3cc] hover:text-[#ededf3] hover:bg-[#272735] transition flex items-center justify-center"
          aria-label={isSidebarOpen ? 'Collapse sidebar' : 'Open sidebar'}
          title={isSidebarOpen ? 'Collapse sidebar' : 'Open sidebar'}
        >
          <Menu className="w-4 h-4" />
        </button>

        <span className="font-[480] text-sm tracking-wide text-[#ededf3] truncate max-w-[200px] md:max-w-md">
          {sessionTitle}
        </span>
      </div>

      {/* Right Controls: Status Pill */}
      <div className="flex items-center space-x-2.5">
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
            {statusLabel}
          </span>
        </div>
      </div>
    </header>
  );
}
