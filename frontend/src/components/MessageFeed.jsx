import React from 'react';
import { Sparkles, Copy, Check, RotateCcw, User } from 'lucide-react';
import VADMonitor from './VADMonitor';
import { getMsgTime } from '../utils/formatters';

export default function MessageFeed({
  transcript = [],
  isSpeaking,
  error,
  copiedId,
  onCopy,
  onReplay,
  isVadOnlyMode,
  vadMetrics,
  lastVadEvent,
  toggleVadOnlyMode,
  isVoiceMode,
  volume,
  messagesEndRef,
}) {
  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 pt-6 pb-56 custom-scrollbar">
      <div className="max-w-2xl w-full mx-auto space-y-5">
        {/* Real-time VAD Latency Monitor (Optional Diagnostic) */}
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

        {/* Global Error Banner */}
        {error && (
          <div className="p-3 rounded-[12px] bg-[#272735] border border-red-500/40 text-red-300 text-xs text-center">
            {error}
          </div>
        )}

        {/* Empty State Welcome */}
        {transcript.length === 0 && (
          <div className="text-center py-20 space-y-3">
            <div className="w-12 h-12 rounded-full bg-[#1e1e2a] flex items-center justify-center mx-auto text-[#5266eb]">
              <Sparkles className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-[480] text-[#ededf3] tracking-wide">Voice AI</h2>
            <p className="text-[13px] text-[#c3c3cc] max-w-sm mx-auto leading-relaxed">
              Click the orb below or speak freely. Hands-free neural voice conversation powered
              by Groq Whisper, LLaMA-3.3, and Edge-TTS.
            </p>
          </div>
        )}

        {/* Messages Feed */}
        {transcript.map((msg, i) => {
          const isUser = msg.role === 'user';
          const timeStr = getMsgTime(msg);
          const msgId = `msg-${i}`;

          return (
            <div
              key={i}
              className={`flex items-start gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
            >
              {/* Assistant: Quick Copy column (left of bubble) */}
              {!isUser && msg.content && (
                <div className="flex flex-col items-center gap-1 pt-2 shrink-0">
                  <button
                    onClick={() => onCopy(msgId, msg.content)}
                    className="p-1.5 rounded-lg text-[#c3c3cc] hover:text-[#ededf3] hover:bg-[#272735] transition opacity-75 hover:opacity-100"
                    title="Copy response"
                  >
                    {copiedId === msgId ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              )}

              {/* Message Content Bubble */}
              <div className="group max-w-[80%] md:max-w-[70%] transition-all text-[#ededf3] px-1 py-2">
                <p className="leading-relaxed whitespace-pre-wrap text-[14px] font-[400]">
                  {msg.content}
                </p>

                {/* Timestamp & Action Row */}
                <div
                  className={`flex items-center mt-2 ${
                    isUser ? 'justify-end' : 'justify-between'
                  }`}
                >
                  {!isUser && msg.content && (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => onCopy(msgId, msg.content)}
                        className="p-1 rounded text-[#c3c3cc] hover:text-[#ededf3] hover:bg-[#272735] transition"
                        title="Copy response"
                      >
                        {copiedId === msgId ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                      <button
                        onClick={() => onReplay(msg.content)}
                        className="p-1 rounded text-[#c3c3cc] hover:text-[#ededf3] hover:bg-[#272735] transition"
                        title="Replay audio"
                      >
                        <RotateCcw className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  <span
                    className={`text-[10px] font-[400] ${
                      isUser ? 'text-white/60' : 'text-[#c3c3cc]/50'
                    }`}
                  >
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
  );
}
