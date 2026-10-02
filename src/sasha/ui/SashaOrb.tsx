import React from "react";
import { Mic, MicOff, Volume2, VolumeX, Sparkles, Terminal } from "lucide-react";
import { AudioWaveformCanvas } from "./AudioWaveformCanvas";
import type { SashaState } from "../types";

interface SashaOrbProps {
  state: SashaState;
  isWakeWordListening: boolean;
  isVoiceMuted: boolean;
  isOpen: boolean;
  onToggleOpen: () => void;
  onDirectTrigger: () => void;
  onToggleWakeWord: () => void;
  onToggleVoiceMute: () => void;
}

export const SashaOrb: React.FC<SashaOrbProps> = ({
  state,
  isWakeWordListening,
  isVoiceMuted,
  isOpen,
  onToggleOpen,
  onDirectTrigger,
  onToggleWakeWord,
  onToggleVoiceMute,
}) => {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 select-none">
      {/* Floating Pill Activator */}
      <div 
        onClick={onToggleOpen}
        className={`group flex items-center gap-3 px-3.5 py-2 rounded-full cursor-pointer transition-all duration-300 shadow-2xl backdrop-blur-xl border ${
          state === "listening"
            ? "bg-zinc-950 border-amber-500/60 shadow-amber-500/10"
            : state === "speaking"
            ? "bg-zinc-950 border-emerald-500/60 shadow-emerald-500/10"
            : isOpen
            ? "bg-zinc-950 border-zinc-700 shadow-zinc-900"
            : "bg-zinc-950/90 hover:bg-zinc-900 border-zinc-800 hover:border-zinc-700"
        }`}
      >
        {/* Status indicator pip */}
        <div className="relative flex items-center justify-center">
          <span className={`h-2 w-2 rounded-full transition-colors duration-300 ${
            state === "listening"
              ? "bg-amber-400 animate-ping"
              : state === "speaking"
              ? "bg-emerald-400 animate-pulse"
              : state === "computing"
              ? "bg-blue-400 animate-spin"
              : isWakeWordListening
              ? "bg-emerald-500/80"
              : "bg-zinc-600"
          }`} />
          <span className={`absolute h-2 w-2 rounded-full ${
            state === "listening" ? "bg-amber-400" : state === "speaking" ? "bg-emerald-400" : isWakeWordListening ? "bg-emerald-500" : "bg-zinc-600"
          }`} />
        </div>

        {/* Title & State label */}
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-mono font-bold tracking-wider text-zinc-100">
              SASHA
            </span>
            <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest hidden sm:inline">
              QUANT
            </span>
          </div>
          <span className="text-[9px] font-mono text-zinc-400 -mt-0.5">
            {state === "listening" ? "LISTENING..." : state === "speaking" ? "SPEAKING" : state === "computing" ? "CALCULATING" : isWakeWordListening ? '"Hey Sasha"' : "TAP TO TALK"}
          </span>
        </div>

        {/* Live Audio Reactive Waveform */}
        <div className="w-16 h-6 flex items-center">
          <AudioWaveformCanvas state={state} width={64} height={24} />
        </div>
      </div>

      {/* Quick Audio Controls */}
      <div className="flex items-center gap-1 bg-zinc-950/90 border border-zinc-800/80 p-1 rounded-full backdrop-blur-xl shadow-lg">
        {/* Direct Mic Talk Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDirectTrigger();
          }}
          className={`h-7 w-7 rounded-full flex items-center justify-center transition-colors ${
            state === "listening" 
              ? "bg-amber-500 text-zinc-950 animate-pulse" 
              : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
          }`}
          title="Push to speak (Hold or click)"
          aria-label="Push to speak"
        >
          <Mic className="h-3.5 w-3.5" />
        </button>

        {/* Mute Spoken Responses Toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleVoiceMute();
          }}
          className={`h-7 w-7 rounded-full flex items-center justify-center transition-colors ${
            isVoiceMuted ? "text-zinc-600 hover:text-zinc-400" : "text-emerald-400 hover:bg-zinc-800"
          }`}
          title={isVoiceMuted ? "Unmute spoken replies" : "Mute spoken replies (Visual HUD only)"}
          aria-label="Toggle voice output"
        >
          {isVoiceMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
};
