/**
 * SASHA Floating Obsidian Pill HUD & Voice Interface
 *
 * Tier-1 Institutional Ambient Quant Copilot HUD:
 *  - Obsidian glassmorphic floating pill (SashaOrb) with live 24-band reactive audio waveform.
 *  - Slide-up obsidian terminal card (max-w-[540px]) docked bottom-right.
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
import { useSasha } from "./SashaProvider";
import { SashaVisualCard } from "./SashaCards";
import { SashaOrb } from "./SashaOrb";
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
    { label: "Energy macro signal", query: "What's moving energy?" },
  ];

  return (
    <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 flex flex-col items-end pointer-events-none select-none">
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={springGentle}
            className="pointer-events-auto mb-3 w-[92vw] max-w-[540px] max-h-[82vh] flex flex-col rounded-2xl border border-border bg-background/95 backdrop-blur-2xl shadow-2xl overflow-hidden"
          >
            {/* HUD Top Bar */}
            <div className="flex items-center justify-between border-b border-border/80 px-4 py-2.5 bg-background/60">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded bg-foreground text-[10.5px] font-bold font-serif text-background">
                  S
                </span>
                <span className="font-serif text-[13px] font-semibold tracking-tight text-muted-foreground">
                  SASHA
                </span>
                <span className="text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground font-mono border-l border-border pl-2">
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
                      ? "border border-border bg-border text-muted-foreground font-semibold"
                      : "border border-border text-muted-foreground hover:text-muted-foreground"
                  }`}
                  title={isWakeWordActive ? "Wake-word 'Hey Sasha' active" : "Enable hands-free 'Hey Sasha'"}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${isWakeWordActive ? "bg-foreground animate-pulse" : "bg-muted"}`} />
                  "Hey Sasha"
                </button>

                {/* Voice Mute Toggle */}
                <button
                  type="button"
                  onClick={() => setVoiceMuted(!isVoiceMuted)}
                  className="pressable rounded p-1 text-muted-foreground hover:text-muted-foreground transition-colors"
                  title={isVoiceMuted ? "Unmute Spoken Punchlines" : "Mute Spoken Voice"}
                >
                  {isVoiceMuted ? <VolumeX className="h-3.5 w-3.5 text-foreground" /> : <Volume2 className="h-3.5 w-3.5" />}
                </button>

                {/* History Toggle */}
                {history.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowHistory(!showHistory)}
                    className="pressable rounded p-1 text-muted-foreground hover:text-muted-foreground transition-colors"
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
                  className="pressable rounded p-1 text-muted-foreground hover:text-muted-foreground transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Scrollable HUD Content Area */}
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
              {showHistory ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between border-b border-border/60 pb-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Session Intelligence History
                    </span>
                    <button
                      onClick={clearHistory}
                      className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 font-mono"
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
                      className="pressable rounded-lg border border-border/70 bg-background/30 p-2.5 hover:bg-background/60 cursor-pointer text-left"
                    >
                      <div className="flex items-center justify-between text-[11px] font-mono mb-1">
                        <span className="font-semibold text-muted-foreground truncate">{item.headline}</span>
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
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background">
                    <Activity className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <h4 className="font-serif text-[14px] font-semibold text-muted-foreground">
                      Senior Quantitative Risk Officer
                    </h4>
                    <p className="text-[11.5px] text-muted-foreground max-w-xs mx-auto mt-1">
                      Direct mathematical execution across portfolio Euler risk, Engle-Granger pairs cointegration, and macro shock propagation.
                    </p>
                  </div>
                  {/* Quick Prompts */}
                  <div className="flex flex-wrap items-center justify-center gap-1.5 pt-2">
                    {quickPrompts.map((p) => (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => submitQuery(p.query)}
                        className="pressable rounded-full border border-border bg-background/80 px-3 py-1 text-[11px] font-medium tracking-tight text-muted-foreground hover:bg-border hover:text-muted-foreground transition-colors"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* HUD Query Input Bar */}
            <form onSubmit={handleSubmit} className="border-t border-border/80 p-3 bg-background/40">
              <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-1.5 focus-within:border-zinc-600 transition-colors">
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
                  className="flex-1 bg-transparent text-[12.5px] text-muted-foreground placeholder:text-muted-foreground outline-none"
                />

                {/* Mic Activation Button */}
                <button
                  type="button"
                  onClick={isListening ? stopListening : startListening}
                  className={`pressable flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                    isListening
                      ? "bg-foreground text-white animate-pulse"
                      : "bg-border text-muted-foreground hover:text-muted-foreground"
                  }`}
                  title={isListening ? "Stop listening" : "Start voice dictation (Alt+S)"}
                >
                  <Mic className="h-3.5 w-3.5" />
                </button>

                <button
                  type="submit"
                  disabled={!queryInput.trim()}
                  className="pressable flex h-7 items-center justify-center rounded-lg bg-muted px-3 text-[11px] font-semibold text-muted-foreground disabled:opacity-30 transition-opacity"
                >
                  Run
                </button>
              </div>

              {/* Status / Shortcut Indicator */}
              <div className="mt-2 flex items-center justify-between px-1 text-[10px] text-muted-foreground font-mono">
                <span>
                  {voiceState === "speaking"
                    ? "Sasha speaking punchline…"
                    : voiceState === "processing"
                    ? "Resolving quant engine (<50ms)…"
                    : voiceState === "listening"
                    ? "Listening for quantitative intent…"
                    : "Zero hallucination • Math backed"}
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="rounded border border-border bg-background px-1 py-0.5 text-[8.5px] text-muted-foreground">Alt+S</kbd>
                  <span>talk</span>
                </span>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Obsidian Ambient Capsule (SashaOrb) */}
      <SashaOrb
        onToggleExpand={() => {
          setIsExpanded((prev) => !prev);
          setIsOpen(!isExpanded);
        }}
        isExpanded={isExpanded}
      />
    </div>
  );
};
