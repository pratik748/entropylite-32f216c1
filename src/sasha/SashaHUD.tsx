/**
 * SASHA Institutional Quantitative Terminal HUD & Voice Interface
 *
 * Tier-1 Institutional Ambient Quant Copilot HUD:
 *  - Non-overlapping slide-over / centered modal terminal (z-50).
 *  - Full multi-turn conversational transcript with direct mathematical execution.
 *  - Proof-of-work receipts, interactive SVG Causal Transmission DAGs, Euler waterfall charts,
 *    and Engle-Granger Cointegration sparklines.
 *  - Hands-free continuous "Hey Sasha" wake-word activation and global hotkey (Alt+S / Ctrl+Space).
 *  - Strict monochrome minimalist design, Times New Roman accents, zero AI slop.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic,
  Volume2,
  VolumeX,
  X,
  RotateCcw,
  ArrowUpRight,
  Sliders,
  ShieldCheck,
  FileSearch,
  Activity,
  CornerDownLeft,
} from "lucide-react";
import { useSasha } from "./SashaProvider";
import { SashaVisualCard } from "./SashaCards";
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
    messages,
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

  const [showHistoryOnly, setShowHistoryOnly] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [isOpen]);

  // Auto-scroll to bottom of conversation
  useEffect(() => {
    if (isOpen && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [messages, isOpen, voiceState]);

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
    { label: "JPMorgan (JPM) Fact Sheet", query: "What about JPM?" },
    { label: "Tech subset risk", query: "Analyze my tech subset risk" },
    { label: "Compare NVDA vs AMD", query: "Compare NVDA and AMD" },
    { label: "Oil +15% stress test", query: "What happens if oil spikes 15% and Nifty drops 2%?" },
    { label: "Energy macro wires", query: "What's moving energy?" },
    { label: "Euler marginal risk", query: "Explain Euler marginal risk attribution" },
  ];

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm select-none">
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 10 }}
        transition={springGentle}
        className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border border-border bg-background shadow-2xl overflow-hidden font-sans"
      >
        {/* HUD Top Bar */}
        <div className="flex items-center justify-between border-b border-border/80 px-4 py-3 bg-surface-2/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="flex h-5 w-5 items-center justify-center rounded bg-foreground text-[10.5px] font-bold font-serif text-background">
              S
            </span>
            <div className="flex items-baseline gap-2">
              <span className="font-serif text-[14px] font-bold tracking-tight text-foreground">
                SASHA
              </span>
              <span className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground font-mono">
                Structural Analysis & Synthesis Heuristic Agent
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Wake Word Indicator & Toggle */}
            <button
              type="button"
              onClick={() => setWakeWordActive(!isWakeWordActive)}
              className={`pressable flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-mono transition-colors ${
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
              className="pressable rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-surface-3 transition-colors"
              title={isVoiceMuted ? "Unmute Spoken Punchlines" : "Mute Spoken Voice"}
            >
              {isVoiceMuted ? (
                <VolumeX className="h-4 w-4 text-red-400" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </button>

            {/* Clear Conversation */}
            {messages.length > 0 && (
              <button
                type="button"
                onClick={clearHistory}
                className="pressable rounded-full p-1.5 text-muted-foreground hover:text-red-400 hover:bg-surface-3 transition-colors"
                title="Clear Conversation"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            )}

            {/* Close HUD */}
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                cancelSpeech();
              }}
              className="pressable rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-surface-3 transition-colors"
              title="Close (Esc)"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Conversation Stream */}
        <div
          ref={scrollContainerRef}
          className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-4 select-text"
        >
          {messages.length === 0 ? (
            <div className="py-8 text-center space-y-4 max-w-md mx-auto">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface-2">
                <Activity className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <h3 className="font-serif text-[16px] font-semibold text-foreground">
                  Institutional Quantitative Copilot
                </h3>
                <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed font-serif">
                  Deterministic mathematical execution across portfolio Euler risk attribution,
                  Engle–Granger pairs cointegration, and macro shock causal DAG propagation.
                </p>
              </div>

              {/* Quick Prompts */}
              <div className="flex flex-wrap items-center justify-center gap-1.5 pt-2">
                {quickPrompts.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => submitQuery(p.query)}
                    className="pressable rounded-md border border-border bg-surface-2/60 px-2.5 py-1 text-[11px] font-mono text-muted-foreground hover:text-foreground hover:bg-surface-3 hover:border-border transition-colors"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className="space-y-2">
                {msg.role === "user" ? (
                  <div className="flex items-start justify-end gap-2">
                    <div className="rounded-xl border border-border/80 bg-surface-2 px-3.5 py-2 max-w-[85%] text-[12.5px] font-mono text-foreground">
                      <span className="text-muted-foreground/60 mr-1.5">›</span>
                      {msg.text}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 max-w-full">
                    <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
                      <span className="flex h-4 w-4 items-center justify-center rounded bg-foreground text-[8px] font-bold font-serif text-background">
                        S
                      </span>
                      <span>SASHA RESPONSE</span>
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

          {/* Processing / Computing Indicator */}
          {voiceState === "processing" && (
            <div className="flex items-center gap-2 p-3 rounded-lg border border-border bg-surface-2/40 text-[11.5px] font-mono text-muted-foreground animate-pulse">
              <span className="h-2 w-2 rounded-full bg-foreground animate-ping" />
              <span>Executing quantitative risk matrices & causal transmission models…</span>
            </div>
          )}
        </div>

        {/* Input & Voice Interaction Bar */}
        <form
          onSubmit={handleSubmit}
          className="border-t border-border/80 p-3 sm:p-4 bg-surface-2/40 shrink-0 space-y-2"
        >
          <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-1 px-3 py-2 focus-within:border-foreground transition-colors shadow-inner">
            <input
              ref={inputRef}
              type="text"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder={
                isListening
                  ? "Listening to voice input…"
                  : "Ask SASHA: 'Tech subset risk', 'Compare NVDA vs AMD', 'Oil +15% shock'…"
              }
              className="flex-1 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground/60 outline-none font-mono"
            />

            {/* Mic Dictation Button */}
            <button
              type="button"
              onClick={isListening ? stopListening : startListening}
              className={`pressable flex h-8 px-2.5 items-center gap-1.5 rounded-lg text-[11px] font-mono transition-colors ${
                isListening
                  ? "bg-red-500 text-white animate-pulse"
                  : "bg-surface-3 text-muted-foreground hover:text-foreground hover:bg-surface-4"
              }`}
              title={isListening ? "Stop listening" : "Start voice dictation (Alt+S)"}
            >
              <Mic className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{isListening ? "Recording…" : "Voice"}</span>
            </button>

            {/* Execute Button */}
            <button
              type="submit"
              disabled={!queryInput.trim()}
              className="pressable flex h-8 items-center gap-1 rounded-lg bg-foreground px-3 text-[11.5px] font-semibold text-background disabled:opacity-30 transition-opacity"
            >
              <span>Run</span>
              <CornerDownLeft className="h-3 w-3" />
            </button>
          </div>

          {/* Telemetry / State Line */}
          <div className="flex items-center justify-between px-1 text-[10px] text-muted-foreground font-mono">
            <span className="flex items-center gap-2">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  voiceState === "speaking"
                    ? "bg-emerald-400 animate-pulse"
                    : voiceState === "listening"
                    ? "bg-red-400 animate-ping"
                    : voiceState === "processing"
                    ? "bg-blue-400 animate-spin"
                    : "bg-muted-foreground/40"
                }`}
              />
              {voiceState === "speaking"
                ? "Speaking bottom-line punchline…"
                : voiceState === "processing"
                ? "Computing mathematical models…"
                : voiceState === "listening"
                ? "Listening for quantitative speech…"
                : "Deterministic mathematical execution"}
            </span>

            <span className="flex items-center gap-2">
              <kbd className="rounded border border-border/80 bg-surface-2 px-1.5 py-0.5 text-[9px] text-foreground">
                Alt+S
              </kbd>
              <span>voice</span>
              <span className="text-muted-foreground/40">•</span>
              <kbd className="rounded border border-border/80 bg-surface-2 px-1.5 py-0.5 text-[9px] text-foreground">
                Esc
              </kbd>
              <span>close</span>
            </span>
          </div>
        </form>
      </motion.div>
    </div>
  );
};
