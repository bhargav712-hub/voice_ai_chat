/**
 * Transcript — Scrollable voice conversation feed.
 *
 * Exclusively displays:
 * 1. Human Voice Instructions (transcribed via STT)
 * 2. Spoken AI Output (synthesized via TTS)
 */
import { useEffect, useRef } from 'react';
import ConversationMessage from './ConversationMessage';

export default function Transcript({ messages = [], isVoiceMode = false, onReplay }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isVoiceMode]);

  const currentTime = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  return (
    <div className="transcript-canvas voice-canvas">
      <div className="transcript-date-stamp">Voice Session · Today {currentTime}</div>

      {messages.length === 0 ? (
        <div className="transcript-welcome voice-welcome">
          <div className="voice-welcome-badge">🎙️ Voice AI Mode</div>
          <h2>Ready for Conversation</h2>
          <p>Tap the Voice Orb below to turn on Live Mode and speak. Your spoken instructions and the AI's audio replies will appear here.</p>
        </div>
      ) : (
        <div className="transcript-messages">
          {messages.map((msg, i) => (
            <ConversationMessage
              key={i}
              role={msg.role}
              content={msg.content}
              onReplay={onReplay}
            />
          ))}
        </div>
      )}
      <div ref={bottomRef} className="transcript-bottom-spacer" />
    </div>
  );
}
