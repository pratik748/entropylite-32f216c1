/**
 * SASHA Ambient Capsule (SashaOrb)
 *
 * Tier-1 Institutional Ambient Quant Copilot Capsule:
 *  - Pinned at bottom-6 right-6.
 *  - Obsidian / Zinc glassmorphic styling: bg-background/90 border border-border rounded-full shadow-2xl.
 *  - Integrated 24-band live canvas audio waveform.
 *  - Status Pip:
 *    • Amber ping: LISTENING
 *    • Emerald pulse: SPEAKING
 *    • Blue spin: COMPUTING
 *    • Emerald solid: PASSIVE WAKE-WORD ACTIVE ("Hey Sasha")
 *  - Quick mute button for silent visual-only HUD mode.
 */

import React, { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Mic, Volume2, VolumeX } from "lucide-react";
import { useSasha } from "./SashaProvider";

interface SashaOrbProps {
  onToggleExpand: () => void;
  isExpanded: boolean;
}

export const SashaOrb: React.FC<SashaOrbProps> = ({ onToggleExpand, isExpanded }) => {
  const {
    voiceState,
    isListening,
    isSpeaking,
    isWakeWordActive,
    isVoiceMuted,
    audioEnergy,
    setVoiceMuted,
    startListening,
    stopListening,
  } = useSasha();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // 24-band Canvas Waveform rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const BARS = 24;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const width = canvas.width;
      const height = canvas.height;
      const barWidth = 2;
      const gap = (width - (BARS * barWidth)) / (BARS - 1);

      const isDark = true; // Obsidian HUD

      for (let i = 0; i < BARS; i++) {
        let barHeight = 3;
        const now = Date.now();

        if (voiceState === "speaking") {
          // Dynamic harmonic wave for speaking
          const freq = (i / BARS) * Math.PI * 2;
          const wave1 = Math.sin(now * 0.009 + freq * 2);
          const wave2 = Math.cos(now * 0.005 - freq);
          barHeight = 4 + (Math.abs(wave1) * 0.6 + Math.abs(wave2) * 0.4) * (height - 6);
        } else if (voiceState === "listening") {
          // Reactive audio energy wave
          const energy = Math.max(0.1, audioEnergy);
          const jitter = Math.sin(i * 0.7 + now * 0.015);
          barHeight = Math.min(height - 2, Math.max(3, 4 + energy * (height - 8) + jitter * 4));
        } else if (voiceState === "processing") {
          // Sweeping computing pulse
          const pulse = (Math.sin(now * 0.012 - (i / BARS) * Math.PI * 2) + 1) / 2;
          barHeight = 3 + pulse * (height - 8);
        } else {
          // Idle state subtle breathing
          const idleWave = Math.sin(now * 0.002 + i * 0.3);
          barHeight = 3 + (i % 4 === 0 ? 1.5 : 0) + (isWakeWordActive ? Math.abs(idleWave) * 1.5 : 0);
        }

        const x = i * (barWidth + gap);
        const y = (height - barHeight) / 2;

        // Color coding by state
        if (voiceState === "listening") {
          ctx.fillStyle = "hsl(var(--foreground) / 0.95)";
        } else if (voiceState === "speaking") {
          ctx.fillStyle = "hsl(var(--foreground) / 0.8)";
        } else if (voiceState === "processing") {
          ctx.fillStyle = "hsl(var(--foreground) / 0.6)";
        } else if (isWakeWordActive) {
          ctx.fillStyle = "hsl(var(--foreground) / 0.4)";
        } else {
          ctx.fillStyle = "hsl(var(--foreground) / 0.2)";
        }

        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 1);
        ctx.fill();
      }

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [voiceState, audioEnergy, isWakeWordActive]);

  return (
    <motion.div
      layout
      className="pointer-events-auto flex items-center gap-2 rounded-full border border-border/40 bg-background/60 p-1 pl-1.5 backdrop-blur-xl opacity-60 hover:opacity-100 hover:border-border transition-all cursor-pointer group select-none"
      onClick={() => {
        if (!isExpanded) {
          onToggleExpand();
        } else {
          if (isListening) stopListening();
          else startListening();
        }
      }}
    >
      {/* SASHA Monogram with Status Pip */}
      <div className="relative flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-[11px] font-semibold text-background shrink-0 shadow-inner">
        S
        {/* Status Pip */}
        <span
          className={`absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background transition-colors ${
            voiceState === "listening"
              ? "bg-foreground animate-pulse"
              : voiceState === "speaking"
              ? "bg-foreground/80 animate-pulse"
              : voiceState === "processing"
              ? "bg-foreground/60 animate-pulse"
              : isWakeWordActive
              ? "bg-foreground/50"
              : "bg-muted-foreground/40"
          }`}
          title={`SASHA: ${voiceState.toUpperCase()} ${isWakeWordActive ? '(Wake-Word Active)' : ''}`}
        />
      </div>

      {/* 24-Band Reactive Audio Waveform Canvas */}
      <div className="flex items-center justify-center h-6 px-1">
        <canvas
          ref={canvasRef}
          width={72}
          height={24}
          className="w-[72px] h-[24px] block"
        />
      </div>

      {/* Status Text / Hotkey Badge */}
      <div className="hidden sm:flex items-center gap-2 pr-1 text-[11.5px] font-medium tracking-tight text-foreground">
        <span className="font-serif font-semibold">
          {voiceState === "listening"
            ? "Listening…"
            : voiceState === "speaking"
            ? "Speaking…"
            : voiceState === "processing"
            ? "Computing…"
            : "SASHA"}
        </span>
        <kbd className="rounded border border-border bg-background/90 px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground">
          Alt+S
        </kbd>
      </div>

      {/* Quick Mute Toggle */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setVoiceMuted(!isVoiceMuted);
        }}
        className="pressable rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-border/60 transition-colors"
        title={isVoiceMuted ? "Unmute Spoken Punchlines" : "Mute Spoken Voice"}
      >
        {isVoiceMuted ? (
          <VolumeX className="h-3.5 w-3.5 text-foreground" />
        ) : (
          <Volume2 className="h-3.5 w-3.5" />
        )}
      </button>
    </motion.div>
  );
};
