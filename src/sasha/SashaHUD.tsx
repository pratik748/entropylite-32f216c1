/**
 * SASHA Institutional Quantitative Terminal HUD & Ambient VIP Copilot
 *
 * Non-blocking, always-accessible VIP quantitative copilot:
 *  - Persistent floating dock & expandable VIP command console (pointer-events-none container).
 *  - Non-view-blocking: user can interact with underlying dashboards, charts, and workstations.
 *  - Multi-turn conversational execution with direct mathematical reality engines.
 *  - Dynamic viewport navigation across tabs and individual company workstations.
 *  - Continuous hands-free "Hey Sasha" wake-word activation, voice synthesis, and audio energy visualization.
 *  - Monochromatic luxury aesthetic, Times New Roman accents, zero promotional fluff.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic,
  Volume2,
  VolumeX,
  X,
  RotateCcw,
  Minus,
  Maximize2,
  Minimize2,
  Activity,
  CornerDownLeft,
  Compass,
  Sparkles,
  Layers,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useSasha } from "./SashaProvider";
import { SashaVisualCard } from "./SashaCards";
import { springGentle } from "@/lib/motion";

export const SashaHUD: React.FC = () => {
  const {
    executionState,
    voiceState,
    isListening,
    isSpeaking,
    isWakeWordActive,
    isVoiceMuted,
    audioEnergy,
    activeResult,
    messages,
    history,
    isOpen,
    isMinimized,
    queryInput,
    activeContextTicker,
    setQueryInput,
    setIsOpen,
    setIsMinimized,
    setWakeWordActive,
    setVoiceMuted,
    startListening,
    stopListening,
    submitQuery,
    cancelSpeech,
    clearHistory,
    navigateTo,
  } = useSasha();

  const inputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Auto-focus input when opened/expanded
  useEffect(() => {
    if (isOpen && !isMinimized) {
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [isOpen, isMinimized]);

  // Auto-scroll conversation stream to bottom
  useEffect(() => {
    if (isOpen && !isMinimized && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [messages, isOpen, isMinimized, voiceState, executionState]);

  // Handle query submission
  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!queryInput.trim()) return;
      submitQuery(queryInput);
    },
    [queryInput, submitQuery]
  );

  const quickNavTabs: Array<{ id: "risk" | "statarb" | "market" | "geopolitical" | "sandbox" | "desirable"; label: string }> = [
    { id: "risk", label: "Risk Lab" },
    { id: "statarb", label: "Stat-Arb" },
    { id: "market", label: "Market" },
    { id: "geopolitical", label: "Macro & Geo" },
    { id: "sandbox", label: "Crucible" },
    { id: "desirable", label: "Screener" },
  ];

  const quickPrompts = [
    { label: "JPM Fact Sheet", query: "What about JPM?" },
    { label: "Tech subset risk", query: "Analyze my tech subset risk" },
    { label: "Compare NVDA vs AMD", query: "Compare NVDA and AMD" },
    { label: "Oil +15% shock", query: "What happens if oil spikes 15% and Nifty drops 2%?" },
    { label: "Take me to Risk Lab", query: "Take me to Risk Lab" },
    { label: "Energy wires", query: "What's moving energy?" },
  ];

  // If completely closed, render nothing
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed bottom-3 right-3 sm:bottom-4 sm:right-4 z-40 flex flex-col items-end pointer-events-none font-sans select-none">
      <AnimatePresence mode="wait">
        {isMinimized ? (
          /* ── MINIMIZED VIP CAPSULE DOCK ──────────────────────────────────── */
          <motion.div
            key="minimized-hud"
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            transition={springGentle}
            className="pointer-events-auto flex items-center gap-2 rounded-full border border-border/90 bg-background/95 backdrop-blur-md px-3 py-1.5 shadow-2xl hover:border-foreground/40 transition-colors"
          >
            {/* VIP Status Pill */}
            <button
              type="button"
              onClick={() => setIsMinimized(false)}
              className="flex items-center gap-2 text-left group"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-[10px] font-bold font-serif text-background shadow">
                S
              </span>
              <div className="flex flex-col">
                <span className="font-serif text-[11px] font-bold tracking-tight text-foreground flex items-center gap-1">
                  SASHA VIP
                  {activeContextTicker && (
                    <span className="text-[9px] font-mono font-normal text-muted-foreground bg-surface-2 px-1 rounded">
                      {activeContextTicker}
                    </span>
                  )}
                </span>
                <span className="text-[8.5px] font-mono text-muted-foreground">
                  {executionState === "IDLE" ? "Ready" : executionState}
                </span>
              </div>
            </button>

            <div className="h-4 w-px bg-border/80" />

            {/* Mic Quick Toggle */}
            <button
              type="button"
              onClick={isListening ? stopListening : startListening}
              className={`pressable flex h-6 w-6 items-center justify-center rounded-full transition-colors ${
                isListening
                  ? "bg-red-500 text-white animate-pulse"
                  : "bg-surface-2 text-muted-foreground hover:text-foreground hover:bg-surface-3"
              }`}
              title={isListening ? "Stop listening" : "Speak to SASHA"}
            >
              <Mic className="h-3 w-3" />
            </button>

            {/* Expand HUD Button */}
            <button
              type="button"
              onClick={() => setIsMinimized(false)}
              className="pressable flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors"
              title="Expand SASHA HUD"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>

            {/* Close Toggle */}
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                cancelSpeech();
              }}
              className="pressable flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:text-red-400 hover:bg-surface-2 transition-colors"
              title="Close SASHA"
            >
              <X className="h-3 w-3" />
            </button>
          </motion.div>
        ) : (
          /* ── EXPANDED AMBIENT VIP CONSOLE ────────────────────────────────── */
          <motion.div
            key="expanded-hud"
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={springGentle}
            className="pointer-events-auto relative w-[95vw] sm:w-[480px] md:w-[540px] max-h-[82vh] flex flex-col rounded-2xl border border-border bg-background/95 backdrop-blur-md shadow-2xl overflow-hidden"
          >
            {/* VIP Header Bar */}
            <div className="flex items-center justify-between border-b border-border/80 px-3.5 py-2.5 bg-surface-2/70 shrink-0">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded bg-foreground text-[10.5px] font-bold font-serif text-background shadow">
                  S
                </span>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-serif text-[13px] font-bold tracking-tight text-foreground">
                    SASHA
                  </span>
                  <span className="text-[8.5px] uppercase tracking-[0.16em] text-muted-foreground font-mono">
                    VIP Copilot
                  </span>
                  {activeContextTicker && (
                    <span className="rounded bg-surface-3 border border-border px-1.5 py-0.2 text-[9px] font-mono text-foreground font-semibold">
                      {activeContextTicker}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {/* Wake Word Indicator & Toggle */}
                <button
                  type="button"
                  onClick={() => setWakeWordActive(!isWakeWordActive)}
                  className={`pressable flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-mono transition-colors ${
                    isWakeWordActive
                      ? "border border-border bg-surface-3 text-foreground font-semibold"
                      : "border border-border/60 text-muted-foreground hover:text-foreground"
                  }`}
                  title={isWakeWordActive ? "Wake-word 'Hey Sasha' active" : "Enable hands-free 'Hey Sasha'"}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      isWakeWordActive ? "bg-emerald-400 animate-pulse" : "bg-muted-foreground/40"
                    }`}
                  />
                  "Hey Sasha"
                </button>

                {/* Voice Mute Toggle */}
                <button
                  type="button"
                  onClick={() => setVoiceMuted(!isVoiceMuted)}
                  className="pressable rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-surface-3 transition-colors"
                  title={isVoiceMuted ? "Unmute Spoken Punchlines" : "Mute Spoken Voice"}
                >
                  {isVoiceMuted ? (
                    <VolumeX className="h-3.5 w-3.5 text-red-400" />
                  ) : (
                    <Volume2 className="h-3.5 w-3.5" />
                  )}
                </button>

                {/* Clear Conversation */}
                {messages.length > 0 && (
                  <button
                    type="button"
                    onClick={clearHistory}
                    className="pressable rounded-md p-1 text-muted-foreground hover:text-red-400 hover:bg-surface-3 transition-colors"
                    title="Clear Conversation"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                )}

                {/* Minimize to Floating Dock */}
                <button
                  type="button"
                  onClick={() => setIsMinimized(true)}
                  className="pressable rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-surface-3 transition-colors"
                  title="Minimize (Non-blocking pill)"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>

                {/* Close HUD */}
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    cancelSpeech();
                  }}
                  className="pressable rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-surface-3 transition-colors"
                  title="Close (Esc)"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Ambient Navigation Pill Strip */}
            <div className="flex items-center gap-1 overflow-x-auto px-3 py-1.5 border-b border-border/60 bg-surface-1/60 scrollbar-none text-[9.5px] font-mono">
              <span className="text-muted-foreground/60 uppercase tracking-widest text-[8px] mr-1 shrink-0 flex items-center gap-0.5">
                <Compass className="h-2.5 w-2.5" />
                Nav:
              </span>
              {quickNavTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => navigateTo(tab.id)}
                  className="shrink-0 rounded px-1.5 py-0.5 bg-surface-2/80 hover:bg-surface-3 border border-border/60 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Scrollable Conversation Stream */}
            <div
              ref={scrollContainerRef}
              className="flex-1 min-h-[160px] max-h-[52vh] overflow-y-auto p-3.5 space-y-3.5 select-text text-left"
            >
              {messages.length === 0 ? (
                <div className="py-4 text-center space-y-3 max-w-sm mx-auto">
                  <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface-2">
                    <Activity className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <h3 className="font-serif text-[14px] font-semibold text-foreground">
                      Institutional Quantitative Copilot
                    </h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed font-serif">
                      Conversational quantitative execution, Euler risk attribution, pairs cointegration, and ambient navigation.
                    </p>
                  </div>

                  {/* Quick Prompts */}
                  <div className="flex flex-wrap items-center justify-center gap-1 pt-1">
                    {quickPrompts.map((p) => (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => submitQuery(p.query)}
                        className="pressable rounded border border-border bg-surface-2/60 px-2 py-0.5 text-[10px] font-mono text-muted-foreground hover:text-foreground hover:bg-surface-3 transition-colors"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((msg) => (
                  <div key={msg.id} className="space-y-1.5">
                    {msg.role === "user" ? (
                      <div className="flex items-start justify-end gap-2">
                        <div className="rounded-xl border border-border/80 bg-surface-2 px-3 py-1.5 max-w-[88%] text-[12px] font-mono text-foreground">
                          <span className="text-muted-foreground/60 mr-1.5">›</span>
                          {msg.text}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-w-full">
                        <div className="flex items-center gap-1.5 text-[9px] font-mono text-muted-foreground">
                          <span className="flex h-3.5 w-3.5 items-center justify-center rounded bg-foreground text-[7px] font-bold font-serif text-background">
                            S
                          </span>
                          <span>SASHA</span>
                          {msg.result && (
                            <span>• {msg.result.executionTimeMs}ms execution</span>
                          )}
                        </div>

                        {msg.result && <SashaVisualCard result={msg.result} />}
                      </div>
                    )}
                  </div>
                ))
              )}

              {/* Execution Progress Indicator */}
              {executionState !== "IDLE" && executionState !== "RESPONDING" && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg border border-border bg-surface-2/40 text-[11px] font-mono text-muted-foreground animate-pulse">
                  <span className="h-1.5 w-1.5 rounded-full bg-foreground animate-ping" />
                  <span>
                    {executionState === "LISTENING" && "Listening to audio stream…"}
                    {executionState === "TRANSCRIBING" && "Transcribing voice input…"}
                    {executionState === "UNDERSTANDING" && "Parsing query parameters & intent…"}
                    {executionState === "PLANNING" && "Constructing DAG dependency execution plan…"}
                    {executionState === "EXECUTING" && "Executing quantitative risk matrices & factor models…"}
                    {executionState === "VERIFYING" && "Verifying mathematical constraints & provenance…"}
                    {executionState === "ERROR" && "Handling execution diagnostic…"}
                  </span>
                </div>
              )}
            </div>

            {/* Input & Voice Interaction Bar */}
            <form
              onSubmit={handleSubmit}
              className="border-t border-border/80 p-2.5 sm:p-3 bg-surface-2/40 shrink-0 space-y-1.5"
            >
              <div className="flex items-center gap-1.5 rounded-xl border border-border bg-surface-1 px-2.5 py-1.5 focus-within:border-foreground transition-colors shadow-inner">
                <input
                  ref={inputRef}
                  type="text"
                  value={queryInput}
                  onChange={(e) => setQueryInput(e.target.value)}
                  placeholder={
                    isListening
                      ? "Listening to voice input…"
                      : "Ask or navigate: 'Risk Lab', 'What about NVDA', 'Compare GS vs MS'…"
                  }
                  className="flex-1 bg-transparent text-[12px] text-foreground placeholder:text-muted-foreground/60 outline-none font-mono"
                />

                {/* Mic Dictation Button */}
                <button
                  type="button"
                  onClick={isListening ? stopListening : startListening}
                  className={`pressable flex h-7 px-2 items-center gap-1 rounded-lg text-[10px] font-mono transition-colors ${
                    isListening
                      ? "bg-red-500 text-white animate-pulse"
                      : "bg-surface-3 text-muted-foreground hover:text-foreground hover:bg-surface-4"
                  }`}
                  title={isListening ? "Stop listening" : "Start voice dictation (Alt+S)"}
                >
                  <Mic className="h-3 w-3" />
                  <span className="hidden sm:inline">{isListening ? "Recording…" : "Voice"}</span>
                </button>

                {/* Execute Button */}
                <button
                  type="submit"
                  disabled={!queryInput.trim()}
                  className="pressable flex h-7 items-center gap-1 rounded-lg bg-foreground px-2.5 text-[11px] font-semibold text-background disabled:opacity-30 transition-opacity"
                >
                  <span>Run</span>
                  <CornerDownLeft className="h-2.5 w-2.5" />
                </button>
              </div>

              {/* Status / Shortcut Bar */}
              <div className="flex items-center justify-between px-1 text-[9px] text-muted-foreground font-mono">
                <span className="flex items-center gap-1.5">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      executionState === "RESPONDING" || voiceState === "speaking"
                        ? "bg-emerald-400 animate-pulse"
                        : executionState === "LISTENING" || voiceState === "listening"
                        ? "bg-red-400 animate-ping"
                        : executionState === "PLANNING" || executionState === "EXECUTING" || executionState === "VERIFYING"
                        ? "bg-blue-400 animate-spin"
                        : executionState === "ERROR"
                        ? "bg-red-400"
                        : "bg-muted-foreground/40"
                    }`}
                  />
                  {executionState === "RESPONDING" || voiceState === "speaking"
                    ? "Synthesizing spoken analysis…"
                    : executionState === "PLANNING"
                    ? "Constructing DAG plan…"
                    : executionState === "EXECUTING"
                    ? "Executing quantitative models…"
                    : executionState === "LISTENING" || voiceState === "listening"
                    ? "Listening for voice input…"
                    : "Deterministic Mathematical Copilot Ready"}
                </span>

                <span className="flex items-center gap-1.5">
                  <kbd className="rounded border border-border/80 bg-surface-2 px-1 py-0.2 text-[8.5px] text-foreground">
                    Alt+S
                  </kbd>
                  <span>voice</span>
                  <span className="text-muted-foreground/40">•</span>
                  <kbd className="rounded border border-border/80 bg-surface-2 px-1 py-0.2 text-[8.5px] text-foreground">
                    Esc
                  </kbd>
                  <span>close</span>
                </span>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

