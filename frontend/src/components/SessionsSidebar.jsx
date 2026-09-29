import React from 'react';
import { Volume2, PanelLeftClose, Plus, History, Trash2, Radio, VolumeX } from 'lucide-react';
import { formatRelativeDate } from '../utils/formatters';

export default function SessionsSidebar({
  isOpen,
  onClose,
  sessions = [],
  activeSessionId,
  onSelectSession,
  onCreateSession,
  onDeleteSession,
  isListening,
  isMuted,
  onToggleMute,
}) {
  return (
    <aside
      className={`${
        isOpen ? 'w-56 md:w-64 translate-x-0' : 'w-0 -translate-x-full'
      } transition-all duration-300 ease-in-out bg-[#1e1e2a] border-r border-[#70707d]/20 flex flex-col absolute md:relative z-30 h-full shrink-0 overflow-hidden`}
    >
      {/* Sidebar Header with Brand Mark & Close Sidenav Button */}
      <div className="flex items-center justify-between p-4 border-b border-[#70707d]/20 min-w-[14rem] md:min-w-[16rem]">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-full bg-[#5266eb] flex items-center justify-center shadow-none shrink-0">
            <Volume2 className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-[480] tracking-wide text-[#ededf3]">Voice AI</h1>
            <p className="text-[9px] text-[#c3c3cc] uppercase tracking-[0.14em] font-[400]">
              Realtime Assistant
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-[#c3c3cc] hover:text-[#ededf3] bg-[#272735]/60 hover:bg-[#272735] border border-[#70707d]/20 transition flex items-center justify-center group"
          aria-label="Close sidebar"
          title="Close sidebar"
        >
          <PanelLeftClose className="w-4 h-4 transition-transform group-hover:-translate-x-0.5 text-[#c3c3cc] group-hover:text-[#ededf3]" />
        </button>
      </div>

      {/* New Session Button */}
      <div className="px-3 pt-3 pb-2 min-w-[14rem] md:min-w-[16rem]">
        <button
          onClick={onCreateSession}
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
          <span className="text-[10px] bg-[#272735] text-[#ededf3] px-2 py-0.5 rounded-full border border-[#70707d]/20">
            {sessions.length}
          </span>
        </div>

        <div className="space-y-1 mt-1">
          {sessions.map((s) => {
            const isActive = s.id === activeSessionId;
            return (
              <div
                key={s.id}
                onClick={() => onSelectSession(s.id)}
                className={`group flex items-center justify-between px-3 py-2.5 rounded-[10px] cursor-pointer text-[13px] transition-all border ${
                  isActive
                    ? 'bg-[#272735] text-[#ededf3] border-l-2 border-[#5266eb] border-t-transparent border-r-transparent border-b-transparent'
                    : 'bg-transparent border-transparent text-[#c3c3cc] hover:bg-[#272735]/60 hover:text-[#ededf3]'
                }`}
              >
                <div className="flex items-center space-x-2.5 overflow-hidden">
                  <div
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      isActive ? 'bg-[#5266eb]' : 'bg-[#70707d]/60'
                    }`}
                  />
                  <div className="truncate">
                    <p className="truncate font-[480] text-[13px]">
                      {s.title || 'Voice Session'}
                    </p>
                    <p className="text-[10px] text-[#c3c3cc]/70 truncate mt-0.5">
                      {formatRelativeDate(s.created_at)}
                    </p>
                  </div>
                </div>

                <button
                  onClick={(e) => onDeleteSession(e, s.id)}
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
          <Radio
            className={`w-3.5 h-3.5 ${
              isListening ? 'text-[#5266eb] animate-pulse' : 'text-[#70707d]'
            }`}
          />
          <span>Web Speech Engine</span>
        </div>
        {/* <button
          onClick={onToggleMute}
          className={`p-2 rounded-lg border transition ${
            isMuted
              ? 'bg-red-500/20 text-red-300 border-red-500/30'
              : 'bg-[#272735] text-[#ededf3] border-[#70707d]/20 hover:bg-[#323244]'
          }`}
          title={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
        >
          {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button> */}
      </div>
    </aside>
  );
}
