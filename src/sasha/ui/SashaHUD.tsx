import React, { useState } from "react";
import { X, Volume2, Sparkles, Terminal, ChevronRight, Activity, ArrowRight, CornerDownLeft, Mic } from "lucide-react";
import type { SashaResponse, SashaState } from "../types";
import { AudioWaveformCanvas } from "./AudioWaveformCanvas";
import { SubsetRiskCard } from "./cards/SubsetRiskCard";
import { PairsCompareCard } from "./cards/PairsCompareCard";
import { ScenarioStressCard } from "./cards/ScenarioStressCard";

interface SashaHUDProps {
  isOpen: boolean;
  onClose: () => void;
  state: SashaState;
  interimTranscript: string;
  lastResponse: SashaResponse | null;
  onExecutePrompt: (prompt: string) => void;
  onDirectTrigger: () => void;
  onReplayAudio: () => void;
  onActionClick: (action: { label: string; actionType: string; payload?: any }) => void;
}

const SAMPLE_PROMPTS = [
  "Analyze my tech subset",
  "Compare NVDA vs AMD",
  "What if oil spikes 15%?",
  "Stress test my banking subset",
  "Where is the highest alpha today?",
  "Analyze my underperforming positions"
];

export const SashaHUD: React.FC<SashaHUDProps> = ({
  isOpen,
  onClose,
  state,
  interimTranscript,
  lastResponse,
  onExecutePrompt,
  onDirectTrigger,
  onReplayAudio,
  onActionClick
}) => {
  const [typedInput, setTypedInput] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!typedInput.trim()) return;
    onExecutePrompt(typedInput.trim());
    setTypedInput("");
  };

  return (
    <div className="fixed inset-x-4 bottom-20 md:inset-x-auto md:right-6 md:bottom-24 md:w-[540px] z-50 max-h-[82vh] flex flex-col rounded-2xl border border-zinc-800 bg-zinc-950/95 shadow-2xl backdrop-blur-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* Terminal Title Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/80 bg-zinc-900/40">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center h-6 w-6 rounded-md bg-zinc-900 border border-zinc-800 text-emerald-400">
            <Terminal className="h-3.5 w-3.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-mono font-bold tracking-wider text-zinc-100">
                SASHA
              </span>
              <span className="text-[9px] font-mono uppercase px-1.5 py-0.2 rounded bg-zinc-800/80 text-zinc-400 border border-zinc-700/50">
                AI QUANT COPILOT
              </span>
            </div>
            <div className="text-[9.5px] font-mono text-zinc-500">
              Institutional Mathematical Heuristics
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <AudioWaveformCanvas state={state} width={80} height={20} />
          <button
            onClick={onClose}
            className="h-7 w-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 transition-colors"
            aria-label="Close SASHA"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Main Content Body */}
      <div className="p-4 overflow-y-auto space-y-4 max-h-[58vh] font-mono text-[12px]">
        {/* Real-time Listening Transcript */}
        {state === "listening" && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3.5 space-y-1.5 animate-pulse">
            <div className="text-[10px] uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-ping" />
              Live Listening Stream
            </div>
            <div className="text-[13px] text-zinc-100 font-medium italic">
              {interimTranscript ? `"${interimTranscript}..."` : '"Listening for command..."'}
            </div>
          </div>
        )}

        {/* Previous or Active Response */}
        {lastResponse && (
          <div className="space-y-3.5">
            {/* User Query Echo */}
            <div className="text-[11px] text-zinc-400 flex items-center gap-1.5">
              <span className="text-zinc-600">Query:</span>
              <span className="text-zinc-200 font-semibold">"{lastResponse.query}"</span>
            </div>

            {/* Spoken Punchline Summary */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3.5 relative group">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[13px] text-zinc-100 leading-relaxed font-sans font-medium">
                  {lastResponse.spokenSummary}
                </p>
                <button
                  onClick={onReplayAudio}
                  className="shrink-0 p-1.5 rounded-lg bg-zinc-800/60 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
                  title="Replay Voice Audio"
                >
                  <Volume2 className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Execution Proof Receipts Stream */}
              {lastResponse.executionReceipts.length > 0 && (
                <div className="mt-3 pt-2.5 border-t border-zinc-800/60 flex flex-wrap gap-1.5">
                  {lastResponse.executionReceipts.map((r, i) => (
                    <span 
                      key={i}
                      className="inline-flex items-center gap-1 text-[9.5px] font-mono px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-400"
                      title={r.proof}
                    >
                      <span className="text-emerald-400 font-bold">✓</span>
                      <span>{r.step}</span>
                      <span className="text-zinc-600">({r.durationMs}ms)</span>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* High-Density Mathematical Cards */}
            {lastResponse.cards.subsetRisk && (
              <SubsetRiskCard metrics={lastResponse.cards.subsetRisk} />
            )}
            {lastResponse.cards.pairsCompare && (
              <PairsCompareCard metrics={lastResponse.cards.pairsCompare} />
            )}
            {lastResponse.cards.scenarioStress && (
              <ScenarioStressCard impact={lastResponse.cards.scenarioStress} />
            )}

            {/* One-Touch Action Buttons */}
            {lastResponse.actionSuggestions.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {lastResponse.actionSuggestions.map((act, i) => (
                  <button
                    key={i}
                    onClick={() => onActionClick(act)}
                    className="inline-flex items-center gap-1.5 text-[11px] font-mono px-3 py-1.5 rounded-lg bg-emerald-950/40 hover:bg-emerald-950/70 border border-emerald-800/60 text-emerald-300 transition-colors"
                  >
                    <span>{act.label}</span>
                    <ArrowRight className="h-3 w-3" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Zero State / Suggested Prompts */}
        {!lastResponse && state !== "listening" && (
          <div className="py-4 space-y-3">
            <div className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider">
              Ready · Speak or select a query
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SAMPLE_PROMPTS.map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => onExecutePrompt(prompt)}
                  className="text-left text-[11px] p-2.5 rounded-xl border border-zinc-800/80 bg-zinc-900/40 hover:bg-zinc-900 hover:border-zinc-700 text-zinc-300 hover:text-zinc-100 transition-all flex items-center justify-between group"
                >
                  <span className="truncate">"{prompt}"</span>
                  <ChevronRight className="h-3 w-3 text-zinc-600 group-hover:text-zinc-400 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Interactive Voice & Text Input Bar */}
      <div className="p-3 border-t border-zinc-800/80 bg-zinc-900/30">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <button
            type="button"
            onClick={onDirectTrigger}
            className={`h-9 w-9 rounded-xl flex items-center justify-center transition-colors shrink-0 ${
              state === "listening"
                ? "bg-amber-500 text-zinc-950 animate-pulse"
                : "bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
            }`}
            title="Click to talk"
          >
            <Mic className="h-4 w-4" />
          </button>

          <input
            value={typedInput}
            onChange={(e) => setTypedInput(e.target.value)}
            placeholder="Ask Sasha or say 'Hey Sasha'..."
            className="flex-1 h-9 rounded-xl border border-zinc-800 bg-zinc-950 px-3 text-[12px] font-mono text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-zinc-700"
          />

          <button
            type="submit"
            disabled={!typedInput.trim()}
            className="h-9 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200 flex items-center justify-center shrink-0 transition-colors"
          >
            <CornerDownLeft className="h-3.5 w-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
};
