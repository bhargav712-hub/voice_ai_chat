import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Square, Sparkles, Volume2 } from 'lucide-react';

const BAR_COUNT = 18;
// Baseline wave profile weights to create a natural frequency curve
const BAR_WEIGHTS = [0.25, 0.4, 0.6, 0.85, 1.0, 0.9, 0.75, 1.1, 0.95, 0.8, 1.05, 0.7, 0.85, 0.6, 0.45, 0.35, 0.25, 0.15];

// VoiceOrb: Renders the 60fps glowing voice marble using square-root volume scaling and state-driven color auras (listening, thinking, speaking, muted).
export default function VoiceOrb({
  isVoiceMode = false,
  isMuted = false,
  state = 'idle',
  volume = 0,
  isUserSpeaking: propIsUserSpeaking = false,
  onOrbClick,
  onToggleMute,
}) {
  // P-16: Visual Decay Hysteresis (280ms hold-time) to absorb inter-syllable micro-dips
  const [visualUserSpeaking, setVisualUserSpeaking] = useState(false);
  const decayTimerRef = useRef(null);

  useEffect(() => {
    if (propIsUserSpeaking) {
      if (decayTimerRef.current) {
        clearTimeout(decayTimerRef.current);
        decayTimerRef.current = null;
      }
      setVisualUserSpeaking(true);
    } else {
      decayTimerRef.current = setTimeout(() => {
        setVisualUserSpeaking(false);
        decayTimerRef.current = null;
      }, 280);
    }
    return () => {
      if (decayTimerRef.current) clearTimeout(decayTimerRef.current);
    };
  }, [propIsUserSpeaking]);

  // Authoritative neural state decoupled from raw volume cutoff
  const activeUserSpeaking = isVoiceMode && state === 'listening' && (propIsUserSpeaking || visualUserSpeaking);
  const isSpeaking = state === 'speaking';
  const isProcessing = state === 'processing';
  const isListening = state === 'listening';

  // P-16: Non-linear perceptual scaling Math.sqrt(volume)
  // Conversational speech (0.15 - 0.35) is lifted into the lively 0.38 - 0.59 visual sweet spot
  const scaledVolume = Math.sqrt(Math.max(0, Math.min(1, volume)));

  // Dynamic Scale for Orb
  const dynamicScale = activeUserSpeaking
    ? 1 + Math.min(scaledVolume * 0.3, 0.3)
    : isSpeaking
    ? 1.1 + Math.min(scaledVolume * 0.2, 0.2)
    : isListening
    ? 1 + scaledVolume * 0.15
    : 1;

  // Determine Orb visual aura color class
  const getOrbAuraClass = () => {
    if (!isVoiceMode) return 'orb-idle';
    if (isMuted) return 'orb-idle opacity-60';
    if (activeUserSpeaking) return 'orb-user-speaking';
    if (isProcessing) return 'orb-thinking';
    if (isSpeaking) return 'orb-speaking';
    if (isListening) return 'orb-listening-active';
    return 'orb-idle';
  };

  // Primary label text
  const getMainLabel = () => {
    if (!isVoiceMode) return 'Ask Voice AI';
    if (isMuted) return 'Microphone Muted';
    if (activeUserSpeaking) return 'Listening to you…';
    if (isProcessing) return 'Thinking…';
    if (isSpeaking) return 'Voice AI is speaking';
    if (isListening) return 'Listening for speech…';
    return 'Ask Voice AI';
  };

  // Secondary subtext
  const getSubLabel = () => {
    if (!isVoiceMode) return 'CLICK TO ACTIVATE';
    if (isMuted) return 'TAP TO UNMUTE';
    if (activeUserSpeaking) return 'VOICE DETECTED';
    if (isProcessing) return 'PROCESSING SPEECH';
    if (isSpeaking) return 'TAP TO INTERRUPT';
    if (isListening) return 'SPEAK NATURALLY';
    return 'READY';
  };

  return (
    <div className="flex flex-col items-center select-none pointer-events-auto max-w-xl mx-auto px-4">
      
      {/* ── Main Interactive Voice Row (Waveform + Arrow + Orb) ── */}
      <div className="flex items-center justify-center gap-4 md:gap-6 my-2">
        
        {/* Live Audio Waveform */}
        {isVoiceMode && !isMuted && (
          <div className="flex items-center gap-2.5 transition-all duration-300">
            <div 
              className="waveform-equalizer bg-[#1e1e2a]/80 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-[#70707d]/25 shadow-lg"
              title={activeUserSpeaking ? "User voice waveform" : "Ambient audio monitor"}
            >
              {Array.from({ length: BAR_COUNT }).map((_, i) => {
                const weight = BAR_WEIGHTS[i % BAR_WEIGHTS.length];
                
                // Calculate responsive height based on perceptual volume and natural weights
                let height = 4;
                if (activeUserSpeaking) {
                  height = Math.max(5, Math.min(36, scaledVolume * weight * 32 + 6));
                } else if (isSpeaking) {
                  height = Math.max(4, Math.min(30, scaledVolume * weight * 26 + 6));
                } else if (isListening) {
                  height = Math.max(4, Math.min(14, scaledVolume * weight * 12 + 4));
                }

                const barClass = activeUserSpeaking
                  ? 'bar-purple'
                  : isSpeaking
                  ? 'bar-blue'
                  : 'bar-idle';

                return (
                  <div
                    key={i}
                    className={`waveform-bar ${barClass}`}
                    style={{ height: `${height}px` }}
                  />
                );
              })}
            </div>

            {/* Connecting Directional Arrow */}
            <div className={`transition-all duration-300 hidden sm:flex items-center ${activeUserSpeaking ? 'text-[#c084fc] opacity-100 scale-110' : 'text-[#70707d]/60 opacity-60'}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <polyline points="12 5 19 12 12 19"></polyline>
              </svg>
            </div>
          </div>
        )}

        {/* ── Central Luminous Glowing Orb ── */}
        <div className="relative flex items-center justify-center">
          
          {/* Ambient Outer Halo Pulse */}
          {isVoiceMode && (isListening || isSpeaking) && (
            <>
              <div 
                className={`absolute rounded-full pointer-events-none transition-all duration-150 ${
                  activeUserSpeaking 
                    ? 'border border-[#a855f7]/40 bg-[#a855f7]/5' 
                    : 'border border-[#5266eb]/30 bg-[#5266eb]/5'
                }`}
                style={{
                  width: `${96 + scaledVolume * 64}px`,
                  height: `${96 + scaledVolume * 64}px`,
                  opacity: 0.35 + scaledVolume * 0.45,
                  transform: `scale(${dynamicScale * 0.95})`,
                }}
              />
              <div 
                className={`absolute rounded-full pointer-events-none transition-all duration-300 ${
                  activeUserSpeaking 
                    ? 'border border-[#c084fc]/20' 
                    : 'border border-[#5266eb]/15'
                }`}
                style={{
                  width: `${126 + scaledVolume * 86}px`,
                  height: `${126 + scaledVolume * 86}px`,
                  opacity: 0.2 + scaledVolume * 0.35,
                  transform: `scale(${dynamicScale * 1.05})`,
                }}
              />
            </>
          )}

          {/* Core Clickable Orb Sphere */}
          <button
            onClick={onOrbClick}
            className={`relative w-[76px] h-[76px] rounded-full flex items-center justify-center cursor-pointer transition-all duration-300 focus:outline-none shadow-2xl ${getOrbAuraClass()}`}
            style={{
              transform: `scale(${dynamicScale})`,
            }}
            aria-label={isVoiceMode ? (isSpeaking ? "Click to interrupt assistant" : "Click to mute/pause") : "Click to start Live Voice"}
            title={isVoiceMode ? (isSpeaking ? "Click to interrupt" : "Click to pause") : "Click to start Live Voice"}
          >
            {/* Glassmorphism Inner Sphere Reflection */}
            <div className="absolute inset-1 rounded-full bg-gradient-to-b from-white/20 via-transparent to-black/30 backdrop-blur-xs flex items-center justify-center">
              {isSpeaking ? (
                <Square className="w-6 h-6 text-white fill-white drop-shadow transition-transform duration-200 hover:scale-95" />
              ) : isProcessing ? (
                <Sparkles className="w-6 h-6 text-white animate-spin [animation-duration:3s]" />
              ) : activeUserSpeaking ? (
                <Volume2 className="w-6 h-6 text-white drop-shadow animate-pulse" />
              ) : isListening ? (
                <Mic className="w-7 h-7 text-white drop-shadow transition-transform duration-200" />
              ) : (
                <Mic className="w-7 h-7 text-[#ededf3] drop-shadow transition-transform duration-200 hover:scale-110" />
              )}
            </div>
          </button>
        </div>

        {/* ── Right-Side Toggle Mute Action Button ── */}
        {onToggleMute && (
          <div className="flex items-center">
            <button
              onClick={onToggleMute}
              className={`p-2 rounded-lg border transition ${
                isMuted
                  ? 'bg-red-500/20 text-red-300 border-red-500/30'
                  : 'bg-[#272735] text-[#ededf3] border-[#70707d]/20 hover:bg-[#323244]'
              }`}
              title={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
              aria-label={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
            >
              {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
          </div>
        )}
      </div>

      {/* ── State Typography & Live Status ── */}
      <div className="flex flex-col items-center text-center mt-2 space-y-1">
        
        {/* Main Status Title */}
        <span className={`text-[13.5px] font-[480] tracking-wide transition-colors ${
          activeUserSpeaking ? 'text-[#d8b4fe]' : 'text-[#ededf3]'
        }`}>
          {getMainLabel()}
        </span>

        {/* Secondary Subtitle / Action Hint */}
        <span className={`text-[10px] font-[480] tracking-[0.16em] uppercase transition-colors ${
          activeUserSpeaking 
            ? 'text-[#c084fc]' 
            : isListening 
            ? 'text-[#5266eb]' 
            : isSpeaking 
            ? 'text-emerald-400' 
            : 'text-[#70707d]'
        }`}>
          {getSubLabel()}
        </span>

      </div>

    </div>
  );
}
