/**
 * Foresight surface — the command console through which Foresight operates
 * the terminal. Ledger-style, monochrome, hairline construction: an activity
 * register, not a chat bubble UI. The interface itself (tabs, modules,
 * highlights) is where results are shown; this panel carries the
 * conversation, the execution ledger, evidence, and confirmations.
 *
 * Two presentations of the same panel:
 *   ≥ md — docked right-hand aside (⌘J).
 *   < md — full-screen sheet, launched from a small always-visible button
 *          pinned top-center over the header.
 * Voice runs in both: dictation via the mic control, spoken replies via the
 * speaker toggle (see ../voice.ts).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUpRight, ChevronRight, Command, Mic, Sparkles, Square, Volume2, VolumeX, X } from "lucide-react";
import { springGentle } from "@/lib/motion";
import { useForesight, type TranscriptItem } from "../ForesightProvider";
import {
  createRecognizer, isVoiceEnabled, recognitionSupported, setVoiceEnabled,
  speechSupported, stopSpeaking, type Recognizer,
} from "../voice";
import type { ExecutionStep, FactRecord, PendingAction, VerificationReport } from "../types";
import type { WorkbenchCard } from "../uiBus";

const STATUS_GLYPH: Record<ExecutionStep["status"], { char: string; cls: string }> = {
  pending: { char: "·", cls: "text-muted-foreground/50" },
  running: { char: "▸", cls: "text-info animate-pulse" },
  done: { char: "▪", cls: "text-gain" },
  failed: { char: "✕", cls: "text-loss" },
  skipped: { char: "–", cls: "text-muted-foreground/50" },
  awaiting_confirmation: { char: "◇", cls: "text-warning" },
};

function StepRow({ step }: { step: ExecutionStep }) {
  const glyph = STATUS_GLYPH[step.status];
  const ms = step.startedAt && step.finishedAt ? step.finishedAt - step.startedAt : null;
  return (
    <div className="flex items-baseline gap-2 py-[3px] min-w-0">
      <span className={`w-3 shrink-0 text-center text-[10px] leading-none ${glyph.cls}`}>{glyph.char}</span>
      <span className="font-mono text-[10.5px] tracking-tight text-foreground/85 shrink-0">{step.tool}</span>
      {step.reason && (
        <span className="text-[10.5px] text-muted-foreground/70 truncate min-w-0">{step.reason}</span>
      )}
      <span className="ml-auto shrink-0 text-[9.5px] tabular-nums text-muted-foreground/60">
        {step.cached ? "cached" : ms !== null ? `${(ms / 1000).toFixed(1)}s` : ""}
      </span>
    </div>
  );
}

function ConfirmationCard({ pending, onConfirm, onReject }: {
  pending: PendingAction;
  onConfirm: (nonce: string) => void;
  onReject: (nonce: string) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springGentle}
      className="mt-2 border border-border bg-surface-2/50 rounded-md overflow-hidden"
    >
      <div className="border-l-2 border-warning px-3 py-2.5">
        <div className="text-[8.5px] font-semibold uppercase tracking-[0.22em] text-warning/90 mb-1">
          Requires approval
        </div>
        <p className="text-[12px] leading-snug text-foreground">{pending.preview}</p>
        <div className="mt-2.5 flex items-center gap-2">
          <button
            onClick={() => onConfirm(pending.nonce)}
            className="pressable h-6.5 rounded border border-border bg-primary px-3 py-1 text-[10.5px] font-semibold tracking-tight text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Proceed
          </button>
          <button
            onClick={() => onReject(pending.nonce)}
            className="pressable h-6.5 rounded border border-border/70 px-3 py-1 text-[10.5px] font-medium tracking-tight text-muted-foreground hover:bg-surface-2 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function VerificationLine({ v }: { v: VerificationReport }) {
  const numericOk = v.numericCheck.ok;
  const goalOk = v.goalCheck ? v.goalCheck.satisfied : true;
  if (numericOk && goalOk) {
    return (
      <div className="mt-1.5 text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground/60">
        figures verified against engine output
      </div>
    );
  }
  return (
    <div className="mt-1.5 space-y-0.5">
      {!numericOk && (
        <div className="text-[10px] text-warning">
          Unverified figures: {v.numericCheck.unsupported.slice(0, 6).join(", ")} — treat with caution.
        </div>
      )}
      {v.goalCheck && !v.goalCheck.satisfied && v.goalCheck.issues.slice(0, 2).map((issue, i) => (
        <div key={i} className="text-[10px] text-warning">{issue}</div>
      ))}
    </div>
  );
}

function EvidenceDisclosure({ facts }: { facts: FactRecord[] }) {
  const [open, setOpen] = useState(false);
  if (facts.length === 0) return null;
  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-[9.5px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70 hover:text-foreground transition-colors"
      >
        <ChevronRight className={`h-2.5 w-2.5 transition-transform ${open ? "rotate-90" : ""}`} />
        Evidence · {facts.length}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="mt-1.5 border-l border-border/60 pl-2.5 space-y-[3px]">
              {facts.map((f) => (
                <div key={f.id} className="text-[10px] leading-snug text-muted-foreground">
                  <span className="text-foreground/80 tabular-nums font-mono">
                    {typeof f.value === "number" ? f.value : f.value}{f.unit ? ` ${f.unit}` : ""}
                  </span>{" "}
                  {f.label}
                  <span className="text-muted-foreground/50"> · {f.tool}{f.cached ? " · cached" : ""}{f.confidence ? ` · ${f.confidence}` : ""}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function WorkbenchCardView({ card }: { card: WorkbenchCard }) {
  return (
    <div className="border border-border/60 rounded-md bg-surface-1/60 px-2.5 py-2">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{card.title}</span>
        <span className="text-[8.5px] text-muted-foreground/50 font-mono shrink-0">{card.source}</span>
      </div>
      {card.kind === "metrics" && Array.isArray((card.body as { items?: unknown[] })?.items) && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          {((card.body as { items: Array<{ label: string; value: unknown; unit?: string }> }).items).slice(0, 8).map((m, i) => (
            <div key={i} className="min-w-0">
              <div className="text-[9px] text-muted-foreground/70 truncate">{m.label}</div>
              <div className="text-[12px] font-mono tabular-nums text-foreground">{String(m.value)}{m.unit ? ` ${m.unit}` : ""}</div>
            </div>
          ))}
        </div>
      )}
      {card.kind === "table" && (card.body as { columns?: string[] })?.columns && (
        <div className="overflow-x-auto">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="text-muted-foreground/70">
                {(card.body as { columns: string[] }).columns.map((c, i) => (
                  <th key={i} className="text-left font-medium pb-0.5 pr-3 whitespace-nowrap">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {((card.body as { rows?: unknown[][] }).rows || []).slice(0, 10).map((row, ri) => (
                <tr key={ri} className="border-t border-border/40">
                  {(row as unknown[]).map((cell, ci) => (
                    <td key={ci} className="py-0.5 pr-3 font-mono tabular-nums text-foreground/85 whitespace-nowrap">{String(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {card.kind === "text" && (
        <p className="text-[11px] leading-snug text-foreground/85 whitespace-pre-wrap">
          {String((card.body as { text?: string })?.text || "")}
        </p>
      )}
    </div>
  );
}

function RunBlock({ run, onConfirm, onReject }: {
  run: Extract<TranscriptItem, { kind: "run" }>;
  onConfirm: (nonce: string) => void;
  onReject: (nonce: string) => void;
}) {
  const hasLedger = run.steps.length > 0;
  return (
    <div className="pl-3 border-l border-border/50">
      {run.ack && !run.answer && (
        <p className="text-[11.5px] text-muted-foreground leading-snug">{run.ack}</p>
      )}
      {hasLedger && (
        <div className="mt-1">
          {run.steps.map((s) => <StepRow key={s.nodeId} step={s} />)}
        </div>
      )}
      {run.pendings.map((p) => (
        <ConfirmationCard key={p.nonce} pending={p} onConfirm={onConfirm} onReject={onReject} />
      ))}
      {run.clarify && (
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-foreground">{run.clarify}</p>
      )}
      {run.answer && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-foreground whitespace-pre-wrap">{run.answer}</p>
          {run.verification && <VerificationLine v={run.verification} />}
          <EvidenceDisclosure facts={run.facts} />
        </motion.div>
      )}
      {run.error && (
        <p className="mt-1.5 text-[11.5px] leading-snug text-loss">{run.error}</p>
      )}
      {!run.done && !run.answer && !run.clarify && run.pendings.length === 0 && !hasLedger && !run.ack && (
        <p className="text-[11px] text-muted-foreground/60 animate-pulse">interpreting…</p>
      )}
    </div>
  );
}

const SUGGESTIONS = [
  "Why is my portfolio down today?",
  "Run a Black–Litterman optimization",
  "Stress test my holdings if oil reaches $120",
  "Compare my two largest positions",
];

/** The console itself — shared by the desktop dock and the mobile sheet. */
function PanelBody() {
  const {
    setOpen, transcript, workbench, busy, prefill, setPrefill,
    send, confirm, reject, cancel, clearWorkbench,
  } = useForesight();
  const [draft, setDraft] = useState("");
  const [voiceOn, setVoiceOn] = useState(isVoiceEnabled());
  const [listening, setListening] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognizerRef = useRef<Recognizer | null>(null);

  // Consume prefill from the command palette / UI bus.
  useEffect(() => {
    if (prefill) {
      setDraft(prefill);
      setPrefill("");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [prefill, setPrefill]);

  // Keep the ledger pinned to the latest activity.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcript, busy]);

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  // Halt dictation when the panel unmounts (surface closed mid-listen).
  useEffect(() => () => recognizerRef.current?.stop(), []);

  const submit = useCallback((textOverride?: string) => {
    const text = (textOverride ?? draft).trim();
    if (!text || busy) return;
    setDraft("");
    send(text);
  }, [draft, busy, send]);

  const toggleVoice = useCallback(() => {
    const next = !voiceOn;
    setVoiceEnabled(next);
    setVoiceOn(next);
    if (!next) stopSpeaking();
  }, [voiceOn]);

  const toggleMic = useCallback(() => {
    if (listening) {
      recognizerRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = createRecognizer({
      onInterim: (text) => setDraft(text),
      onFinal: (text) => {
        setListening(false);
        setDraft("");
        submit(text);
      },
      onEnd: () => setListening(false),
    });
    if (!rec) return;
    recognizerRef.current = rec;
    setListening(true);
    rec.start();
  }, [listening, submit]);

  return (
    <div className="flex h-full w-full flex-col min-h-0">
      {/* Header */}
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border/60 px-3">
        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${busy ? "bg-info animate-breathe" : "bg-muted-foreground/30"}`} />
        <span className="text-[9px] font-semibold uppercase tracking-[0.26em] text-muted-foreground">Foresight</span>
        <span className="text-[8.5px] text-muted-foreground/50 tracking-tight">operating layer</span>
        <div className="ml-auto flex items-center gap-1">
          {busy && (
            <button
              onClick={cancel}
              title="Stop the current run"
              className="pressable flex h-6 items-center gap-1 rounded border border-border/70 px-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground transition-colors"
            >
              <Square className="h-2 w-2" /> Stop
            </button>
          )}
          {speechSupported && (
            <button
              onClick={toggleVoice}
              className={`pressable flex h-6 w-6 items-center justify-center rounded transition-colors ${voiceOn ? "text-foreground bg-surface-2" : "text-muted-foreground hover:text-foreground hover:bg-accent"}`}
              title={voiceOn ? "Voice replies on — click to mute" : "Speak replies aloud"}
            >
              {voiceOn ? <Volume2 className="h-3 w-3" /> : <VolumeX className="h-3 w-3" />}
            </button>
          )}
          <button
            onClick={() => setOpen(false)}
            className="pressable flex h-6 w-6 items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title="Close (⌘J)"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Workbench */}
      {workbench.length > 0 && (
        <div className="shrink-0 border-b border-border/60 px-3 py-2 space-y-1.5 max-h-[38%] overflow-y-auto">
          <div className="flex items-center justify-between">
            <span className="text-[8.5px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/70">Workbench</span>
            <button
              onClick={clearWorkbench}
              className="text-[8.5px] uppercase tracking-[0.12em] text-muted-foreground/50 hover:text-foreground transition-colors"
            >
              Clear
            </button>
          </div>
          {workbench.map((card) => <WorkbenchCardView key={card.id} card={card} />)}
        </div>
      )}

      {/* Transcript / activity register */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-4">
        {transcript.length === 0 && (
          <div className="pt-6">
            <p className="text-[11.5px] leading-relaxed text-muted-foreground">
              Describe what you want — Foresight routes it through the platform's
              engines and operates the terminal. Numbers come only from
              EntropyLite computations; state changes always ask first.
            </p>
            <div className="mt-4 space-y-1">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => { setDraft(s); inputRef.current?.focus(); }}
                  className="group flex w-full items-center gap-1.5 rounded border border-transparent px-1.5 py-1 text-left text-[11px] text-muted-foreground hover:text-foreground hover:border-border/60 hover:bg-surface-2/50 transition-colors"
                >
                  <ArrowUpRight className="h-2.5 w-2.5 shrink-0 text-muted-foreground/40 group-hover:text-muted-foreground" />
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {transcript.map((item) =>
          item.kind === "user" ? (
            <div key={item.id} className="flex items-baseline gap-2">
              <span className="text-[10px] text-muted-foreground/50 shrink-0 font-mono">›</span>
              <p className="text-[12px] font-medium tracking-tight text-foreground leading-snug">{item.text}</p>
            </div>
          ) : (
            <RunBlock key={item.id} run={item} onConfirm={confirm} onReject={reject} />
          ),
        )}
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-border/60 px-3 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-2 rounded-md border border-border/70 bg-surface-2/50 px-2.5 h-9 focus-within:border-border transition-colors">
          <Command className="h-3 w-3 shrink-0 text-muted-foreground/50" />
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            placeholder={listening ? "Listening…" : busy ? "Working…" : "Ask, compare, simulate, operate…"}
            disabled={busy}
            className="flex-1 bg-transparent text-[12px] tracking-tight text-foreground placeholder:text-muted-foreground/50 outline-none disabled:opacity-60"
          />
          {recognitionSupported && (
            <button
              onClick={toggleMic}
              disabled={busy}
              className={`pressable flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors disabled:opacity-40 ${
                listening
                  ? "bg-loss/15 text-loss animate-pulse"
                  : "text-muted-foreground/70 hover:text-foreground hover:bg-accent"
              }`}
              title={listening ? "Stop listening" : "Dictate a request"}
            >
              <Mic className="h-3 w-3" />
            </button>
          )}
          <kbd className="hidden lg:inline text-[8.5px] font-mono text-muted-foreground/40 border border-border/50 rounded px-1 py-px">⏎</kbd>
        </div>
      </div>
    </div>
  );
}

export default function ForesightSurface() {
  const { open, setOpen, busy } = useForesight();

  // ⌘J / Ctrl+J toggles the surface.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "j" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  return (
    <>
      {/* Phone launcher — small button pinned top-center over the header. */}
      <AnimatePresence initial={false}>
        {!open && (
          <motion.button
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={springGentle}
            onClick={() => setOpen(true)}
            className="md:hidden fixed top-2 left-1/2 -translate-x-1/2 z-50 pressable flex h-8 w-8 items-center justify-center rounded-full border border-border/70 bg-surface-2/90 backdrop-blur text-foreground shadow-soft-xl"
            aria-label="Open Foresight"
            title="Foresight"
          >
            <Sparkles className={`h-3.5 w-3.5 ${busy ? "text-info animate-pulse" : "text-muted-foreground"}`} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Desktop — docked right-hand aside (⌘J). */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 400, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={springGentle}
            className="hidden md:flex shrink-0 border-l border-border/60 bg-background overflow-hidden"
            data-density="compact"
          >
            <div className="h-full w-[400px]">
              <PanelBody />
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Phone — full-screen sheet. */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={springGentle}
            className="md:hidden fixed inset-0 z-[70] bg-background flex flex-col"
            data-density="compact"
          >
            <PanelBody />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
