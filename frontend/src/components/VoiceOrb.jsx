import React, { useState, useEffect } from 'react';
import { Mic, Square, Sparkles, Volume2 } from 'lucide-react';

const BAR_COUNT = 18;
// Baseline wave profile weights to create a natural frequency curve
const BAR_WEIGHTS = [0.25, 0.4, 0.6, 0.85, 1.0, 0.9, 0.75, 1.1, 0.95, 0.8, 1.05, 0.7, 0.85, 0.6, 0.45, 0.35, 0.25, 0.15];

export default function VoiceOrb({
  isVoiceMode = false,
  isMuted = false,
  state = 'idle',
  volume = 0,
  vadMetrics = null,
  onOrbClick,
}) {
  const [tick, setTick] = useState(0);

  // Micro animation loop for lively waveform movements when speaking
  useEffect(() => {
    let animId;
    if (isVoiceMode && (state === 'listening' || state === 'speaking')) {
      const loop = () => {
        setTick((t) => (t + 1) % 1000);
        animId = requestAnimationFrame(loop);
      };
      animId = requestAnimationFrame(loop);
    }
    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [isVoiceMode, state]);

  const isUserSpeaking = isVoiceMode && state === 'listening' && (vadMetrics?.isSpeaking || volume > 0.04);
  const isSpeaking = state === 'speaking';
  const isProcessing = state === 'processing';
  const isListening = state === 'listening';

  // Dynamic Scale for Orb
  const dynamicScale = isUserSpeaking
    ? 1 + Math.min(volume * 0.35, 0.3)
    : isSpeaking
    ? 1.1 + Math.min(volume * 0.2, 0.2)
    : isListening
    ? 1 + volume * 0.15
    : 1;

  // Determine Orb visual aura color class
  const getOrbAuraClass = () => {
    if (!isVoiceMode) return 'orb-idle';
    if (isMuted) return 'orb-idle opacity-60';
    if (isUserSpeaking) return 'orb-user-speaking';
    if (isProcessing) return 'orb-thinking';
    if (isSpeaking) return 'orb-speaking';
    if (isListening) return 'orb-listening-active';
    return 'orb-idle';
  };

  // Primary label text
  const getMainLabel = () => {
    if (!isVoiceMode) return 'Ask Voice AI';
    if (isMuted) return 'Microphone Muted';
    if (isUserSpeaking) return 'Listening to you…';
    if (isProcessing) return 'Thinking…';
    if (isSpeaking) return 'Voice AI is speaking';
    if (isListening) return 'Listening for speech…';
    return 'Ask Voice AI';
  };

  // Secondary subtext
  const getSubLabel = () => {
    if (!isVoiceMode) return 'CLICK TO ACTIVATE';
    if (isMuted) return 'TAP TO UNMUTE';
    if (isUserSpeaking) return 'VOICE DETECTED';
    if (isProcessing) return 'PROCESSING SPEECH';
    if (isSpeaking) return 'TAP TO INTERRUPT';
    if (isListening) return 'SPEAK NATURALLY';
    return 'READY';
  };

  return (
    <div className="flex flex-col items-center select-none pointer-events-auto max-w-xl mx-auto px-4">
      
      {/* ── Main Interactive Voice Row (Waveform + Arrow + Orb) ── */}
      <div className="flex items-center justify-center gap-4 md:gap-6 my-2">
        
        {/* Live Audio Waveform (Image 2 representation) */}
        {isVoiceMode && !isMuted && (
          <div className="flex items-center gap-2.5 transition-all duration-300">
            <div 
              className="waveform-equalizer bg-[#1e1e2a]/80 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-[#70707d]/25 shadow-lg"
              title={isUserSpeaking ? "User voice waveform" : "Ambient audio monitor"}
            >
              {Array.from({ length: BAR_COUNT }).map((_, i) => {
                const weight = BAR_WEIGHTS[i % BAR_WEIGHTS.length];
                
                // Calculate responsive height based on volume and micro-sin wave
                let height = 4;
                if (isUserSpeaking) {
                  const microWave = Math.sin((tick * 0.25) + i * 0.6) * 6;
                  height = Math.max(5, Math.min(36, volume * weight * 60 + microWave + 12));
                } else if (isSpeaking) {
                  const microWave = Math.cos((tick * 0.2) + i * 0.5) * 5;
                  height = Math.max(4, Math.min(30, volume * weight * 45 + microWave + 8));
                } else if (isListening) {
                  height = Math.max(4, Math.min(14, volume * weight * 20 + 4));
                }

                const barClass = isUserSpeaking
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

            {/* Connecting Directional Arrow (Image 2 style) */}
            <div className={`transition-all duration-300 hidden sm:flex items-center ${isUserSpeaking ? 'text-[#c084fc] opacity-100 scale-110' : 'text-[#70707d]/60 opacity-60'}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <polyline points="12 5 19 12 12 19"></polyline>
              </svg>
            </div>
          </div>
        )}

        {/* ── Central Luminous Glowing Orb (Images 1 & 2) ── */}
        <div className="relative flex items-center justify-center">
          
          {/* Ambient Outer Halo Pulse */}
          {isVoiceMode && (isListening || isSpeaking) && (
            <>
              <div 
                className={`absolute rounded-full pointer-events-none transition-all duration-150 ${
                  isUserSpeaking 
                    ? 'border border-[#a855f7]/40 bg-[#a855f7]/5' 
                    : 'border border-[#5266eb]/30 bg-[#5266eb]/5'
                }`}
                style={{
                  width: `${96 + volume * 70}px`,
                  height: `${96 + volume * 70}px`,
                  opacity: 0.35 + volume * 0.5,
                  transform: `scale(${dynamicScale * 0.95})`,
                }}
              />
              <div 
                className={`absolute rounded-full pointer-events-none transition-all duration-300 ${
                  isUserSpeaking 
                    ? 'border border-[#c084fc]/20' 
                    : 'border border-[#5266eb]/15'
                }`}
                style={{
                  width: `${126 + volume * 95}px`,
                  height: `${126 + volume * 95}px`,
                  opacity: 0.2 + volume * 0.4,
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
              ) : isUserSpeaking ? (
                <Volume2 className="w-6 h-6 text-white drop-shadow animate-pulse" />
              ) : isListening ? (
                <Mic className="w-7 h-7 text-white drop-shadow transition-transform duration-200" />
              ) : (
                <Mic className="w-7 h-7 text-[#ededf3] drop-shadow transition-transform duration-200 hover:scale-110" />
              )}
            </div>
          </button>
        </div>
      </div>

      {/* ── State Typography & Live Status ── */}
      <div className="flex flex-col items-center text-center mt-2 space-y-1">
        
        {/* Main Status Title */}
        <span className={`text-[13.5px] font-[480] tracking-wide transition-colors ${
          isUserSpeaking ? 'text-[#d8b4fe]' : 'text-[#ededf3]'
        }`}>
          {getMainLabel()}
        </span>

        {/* Secondary Subtitle / Action Hint */}
        <span className={`text-[10px] font-[480] tracking-[0.16em] uppercase transition-colors ${
          isUserSpeaking 
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
