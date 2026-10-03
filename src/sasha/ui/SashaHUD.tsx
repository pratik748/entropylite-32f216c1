/**
 * SASHA Floating Obsidian Pill HUD & Voice Interface
 *
 * Tier-1 Institutional Ambient Quant Copilot HUD:
 *  - Obsidian glassmorphic floating pill with live reactive audio waveform.
 *  - Sub-100ms Heuristic Intent Routing with immediate visual card rendering.
 *  - Hands-free continuous "Hey Sasha" wake-word activation and global hotkey (Alt+S / Ctrl+Space).
 *  - Clutter-free monochrome design, Times New Roman accents, zero AI slop.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  X,
  Sparkles,
  Search,
  ArrowUpRight,
  Activity,
  ChevronDown,
  Layers,
  History,
  RotateCcw,
} from "lucide-react";
import { useSasha } from "../SashaProvider";
import { SashaVisualCard } from "./SashaVisualCard";
import { springGentle } from "@/lib/motion";

export const SashaHUD: React.FC = () => {
  const {
    voiceState,
    isListening,
    isSpeaking,
    isWakeWordActive,
    isVoiceMuted,
    audioEnergy,
    activeResult,
    history,
    isOpen,
    queryInput,
    setQueryInput,
    setIsOpen,
    setWakeWordActive,
    setVoiceMuted,
    startListening,
    stopListening,
    submitQuery,
    cancelSpeech,
    clearHistory,
  } = useSasha();

  const [isExpanded, setIsExpanded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync expanded state with open request or active results
  useEffect(() => {
    if (isOpen || activeResult) {
      setIsExpanded(true);
    }
  }, [isOpen, activeResult]);

  // Focus input on expand
  useEffect(() => {
    if (isExpanded) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isExpanded]);

  // Handle query submission
  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!queryInput.trim()) return;
      submitQuery(queryInput);
    },
    [queryInput, submitQuery]
  );

  const quickPrompts = [
    { label: "Tech subset risk", query: "Analyze my tech subset risk" },
    { label: "Compare NVDA vs AMD", query: "Compare NVDA and AMD" },
    { label: "Oil +15% stress test", query: "What happens if oil spikes 15% and Nifty drops 2%?" },
    { label: "Energy news", query: "What's moving energy?" },
  ];

  // Number of waveform bars
  const NUM_BARS = 14;

  return (
    <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 flex flex-col items-end pointer-events-none select-none">
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={springGentle}
            className="pointer-events-auto mb-3 w-[92vw] max-w-[540px] max-h-[82vh] flex flex-col rounded-2xl border border-border/80 bg-background/95 backdrop-blur-xl shadow-2xl overflow-hidden"
          >
            {/* HUD Top Bar */}
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5 bg-surface-2/40">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded bg-foreground text-[10.5px] font-bold font-serif text-background">
                  S
                </span>
                <span className="font-serif text-[13px] font-semibold tracking-tight text-foreground">
                  SASHA
                </span>
                <span className="text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground/70 font-mono border-l border-border/60 pl-2">
                  Voice Quant Copilot
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                {/* Wake Word Toggle */}
                <button
                  type="button"
                  onClick={() => setWakeWordActive(!isWakeWordActive)}
                  className={`pressable flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium tracking-tight transition-colors ${
                    isWakeWordActive
                      ? "border border-foreground/30 bg-surface-3 text-foreground font-semibold"
                      : "border border-border/50 text-muted-foreground/70 hover:text-foreground"
                  }`}
                  title={isWakeWordActive ? "Wake-word 'Hey Sasha' active" : "Enable hands-free 'Hey Sasha'"}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${isWakeWordActive ? "bg-gain animate-pulse" : "bg-muted-foreground/40"}`} />
                  "Hey Sasha"
                </button>

                {/* Voice Mute Toggle */}
                <button
                  type="button"
                  onClick={() => setVoiceMuted(!isVoiceMuted)}
                  className="pressable rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
                  title={isVoiceMuted ? "Unmute Spoken Punchlines" : "Mute Spoken Voice"}
                >
                  {isVoiceMuted ? <VolumeX className="h-3.5 w-3.5 text-loss" /> : <Volume2 className="h-3.5 w-3.5" />}
                </button>

                {/* History Toggle */}
                {history.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowHistory(!showHistory)}
                    className="pressable rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
                    title="History"
                  >
                    <History className="h-3.5 w-3.5" />
                  </button>
                )}

                {/* Minimize / Close */}
                <button
                  type="button"
                  onClick={() => {
                    setIsExpanded(false);
                    setIsOpen(false);
                    cancelSpeech();
                  }}
                  className="pressable rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Scrollable HUD Content Area */}
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
              {showHistory ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between border-b border-border/40 pb-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Session Intelligence History
                    </span>
                    <button
                      onClick={clearHistory}
                      className="text-[10px] text-muted-foreground/70 hover:text-loss flex items-center gap-1 font-mono"
                    >
                      <RotateCcw className="h-2.5 w-2.5" /> Clear
                    </button>
                  </div>
                  {history.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => {
                        submitQuery(item.intent.rawQuery);
                        setShowHistory(false);
                      }}
                      className="pressable rounded-lg border border-border/50 bg-surface-2/30 p-2.5 hover:bg-surface-2/60 cursor-pointer"
                    >
                      <div className="flex items-center justify-between text-[11px] font-mono mb-1">
                        <span className="font-semibold text-foreground truncate">{item.headline}</span>
                        <span className="text-muted-foreground text-[9px]">{item.executionTimeMs}ms</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground line-clamp-1 font-serif">
                        "{item.spokenPunchline}"
                      </p>
                    </div>
                  ))}
                </div>
              ) : activeResult ? (
                <SashaVisualCard result={activeResult} />
              ) : (
                <div className="py-6 text-center space-y-3">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-border/80 bg-surface-2">
                    <Activity className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <h4 className="font-serif text-[14px] font-semibold text-foreground">
                      Institutional Voice Quant Copilot
                    </h4>
                    <p className="text-[11.5px] text-muted-foreground max-w-xs mx-auto mt-1">
                      Directly drives EntropyLite's mathematical engines, portfolio risk models, and news pipelines.
                    </p>
                  </div>
                  {/* Quick Prompts */}
                  <div className="flex flex-wrap items-center justify-center gap-1.5 pt-2">
                    {quickPrompts.map((p) => (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => submitQuery(p.query)}
                        className="pressable rounded-full border border-border/70 bg-surface-2/60 px-3 py-1 text-[11px] font-medium tracking-tight text-foreground hover:bg-surface-2 transition-colors"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* HUD Query Input Bar */}
            <form onSubmit={handleSubmit} className="border-t border-border/60 p-3 bg-surface-2/30">
              <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-surface-1 px-3 py-1.5 focus-within:border-foreground transition-colors">
                <input
                  ref={inputRef}
                  type="text"
                  value={queryInput}
                  onChange={(e) => setQueryInput(e.target.value)}
                  placeholder={
                    isListening
                      ? "Listening to voice input…"
                      : "Ask Sasha: 'Tech subset risk', 'Compare NVDA vs AMD', 'Oil +15% shock'…"
                  }
                  className="flex-1 bg-transparent text-[12.5px] text-foreground placeholder:text-muted-foreground/60 outline-none"
                />

                {/* Mic Activation Button */}
                <button
                  type="button"
                  onClick={isListening ? stopListening : startListening}
                  className={`pressable flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                    isListening
                      ? "bg-loss text-white animate-pulse"
                      : "bg-surface-3 text-muted-foreground hover:text-foreground"
                  }`}
                  title={isListening ? "Stop listening" : "Start voice dictation (Alt+S)"}
                >
                  <Mic className="h-3.5 w-3.5" />
                </button>

                <button
                  type="submit"
                  disabled={!queryInput.trim()}
                  className="pressable flex h-7 items-center justify-center rounded-lg bg-foreground px-3 text-[11px] font-semibold text-background disabled:opacity-30 transition-opacity"
                >
                  Run
                </button>
              </div>

              {/* Status / Shortcut Indicator */}
              <div className="mt-2 flex items-center justify-between px-1 text-[10px] text-muted-foreground/70 font-mono">
                <span>
                  {voiceState === "speaking"
                    ? "Sasha speaking punchline…"
                    : voiceState === "processing"
                    ? "Resolving quant engine (<100ms)…"
                    : voiceState === "listening"
                    ? "Listening for quantitative intent…"
                    : "Zero hallucination • Math backed"}
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="rounded border border-border/60 bg-surface-2 px-1 py-0.5 text-[8.5px]">Alt+S</kbd>
                  <span>talk</span>
                </span>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Obsidian Pill Trigger */}
      <motion.div
        layout
        className="pointer-events-auto flex items-center gap-2 rounded-full border border-border/80 bg-background/90 p-1.5 backdrop-blur-xl shadow-2xl hover:border-foreground transition-all cursor-pointer group"
        onClick={() => {
          if (!isExpanded) {
            setIsExpanded(true);
            setIsOpen(true);
          } else {
            // Toggle listening
            if (isListening) stopListening();
            else startListening();
          }
        }}
      >
        {/* SASHA Monogram */}
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-[11px] font-bold font-serif text-background shrink-0">
          S
        </div>

        {/* Live Reactive Audio Waveform */}
        <div className="flex items-center gap-[2px] h-5 px-1">
          {Array.from({ length: NUM_BARS }).map((_, i) => {
            // Compute dynamic height based on audio energy and voice state
            let height = 3;
            if (voiceState === "speaking") {
              const wave = Math.sin(Date.now() * 0.008 + i * 0.5);
              height = 4 + Math.abs(wave) * 12;
            } else if (voiceState === "listening") {
              const energyFactor = audioEnergy > 0.05 ? audioEnergy : 0.2;
              const jitter = Math.sin(i * 0.8 + Date.now() * 0.01);
              height = Math.max(3, 4 + energyFactor * 14 + jitter * 3);
            } else if (voiceState === "processing") {
              const pulse = (Math.sin(Date.now() * 0.015 - i * 0.4) + 1) / 2;
              height = 3 + pulse * 10;
            } else {
              // Idle state
              height = 3 + (i % 3 === 0 ? 2 : 0);
            }

            return (
              <motion.span
                key={i}
                animate={{ height: `${height}px` }}
                transition={{ duration: 0.08, ease: "linear" }}
                className={`w-[2.5px] rounded-full transition-colors ${
                  voiceState === "listening"
                    ? "bg-loss"
                    : voiceState === "speaking"
                    ? "bg-gain"
                    : voiceState === "processing"
                    ? "bg-info"
                    : "bg-muted-foreground/50 group-hover:bg-foreground"
                }`}
              />
            );
          })}
        </div>

        {/* Status Text & Shortcut Chip */}
        <div className="hidden sm:flex items-center gap-2 pr-2 text-[11.5px] font-medium tracking-tight text-foreground">
          <span>
            {voiceState === "listening"
              ? "Listening…"
              : voiceState === "speaking"
              ? "Speaking"
              : voiceState === "processing"
              ? "Computing…"
              : "SASHA"}
          </span>
          <kbd className="rounded border border-border/70 bg-surface-2/80 px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground">
            Alt+S
          </kbd>
        </div>
      </motion.div>
    </div>
  );
};
