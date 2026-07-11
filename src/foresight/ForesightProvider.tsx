/**
 * ForesightProvider — mounts the runtime once, bridges it to React state,
 * and exposes the conversational API to the surface. The host adapter reads
 * live application state through a ref so the runtime always sees current
 * holdings without being re-instantiated.
 */

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from "react";
import "./tools";
import { ForesightRuntime } from "./runtime";
import { speak } from "./voice";
import { onUIEvent, type WorkbenchCard } from "./uiBus";
import type {
  ExecutionStep, FactRecord, HostAdapter, PendingAction, RuntimeEvent, VerificationReport,
} from "./types";

export type TranscriptItem =
  | { kind: "user"; id: string; text: string; at: number }
  | {
      kind: "run";
      id: string;
      at: number;
      ack?: string;
      goals: string[];
      steps: ExecutionStep[];
      pendings: PendingAction[];
      answer?: string;
      clarify?: string;
      verification?: VerificationReport;
      facts: FactRecord[];
      error?: string;
      done: boolean;
    };

interface ForesightAPI {
  open: boolean;
  setOpen: (open: boolean) => void;
  transcript: TranscriptItem[];
  workbench: WorkbenchCard[];
  busy: boolean;
  prefill: string;
  setPrefill: (s: string) => void;
  send: (text: string) => void;
  confirm: (nonce: string) => void;
  reject: (nonce: string) => void;
  cancel: () => void;
  clearWorkbench: () => void;
}

const ForesightContext = createContext<ForesightAPI | null>(null);

export function useForesight(): ForesightAPI {
  const ctx = useContext(ForesightContext);
  if (!ctx) throw new Error("useForesight must be used inside ForesightProvider");
  return ctx;
}

export function ForesightProvider({ host, children }: { host: HostAdapter; children: ReactNode }) {
  const hostRef = useRef(host);
  hostRef.current = host;

  const [open, setOpen] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [workbench, setWorkbench] = useState<WorkbenchCard[]>([]);
  const [busy, setBusy] = useState(false);
  const [prefill, setPrefill] = useState("");

  const applyEvent = useCallback((event: RuntimeEvent) => {
    // Voice channel — speaks conversational beats only (never the raw ledger).
    // speak() is a no-op unless the user has toggled voice on.
    if (event.type === "ack") speak(event.text);
    else if (event.type === "answer") speak(event.text);
    else if (event.type === "clarify") speak(event.question);
    else if (event.type === "error") speak("That run hit a problem — details are on screen.");

    setTranscript((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      const run = last && last.kind === "run" && !last.done ? { ...last } : null;
      if (!run) {
        // Events arriving for a finished/absent run (e.g. confirm execution):
        // open a fresh run frame so nothing is lost.
        if (event.type === "done") return prev;
        const fresh: TranscriptItem = {
          kind: "run", id: crypto.randomUUID(), at: Date.now(),
          goals: [], steps: [], pendings: [], facts: [], done: false,
        };
        next.push(fresh);
        return applyToRun(next, fresh, event);
      }
      next[next.length - 1] = run;
      return applyToRun(next, run, event);
    });
    if (event.type === "done") setBusy(false);
  }, []);

  const runtime = useMemo(() => {
    // Stable proxy host so the runtime constructed once always reads live state.
    const proxyHost: HostAdapter = {
      getPositions: () => hostRef.current.getPositions(),
      getActiveTab: () => hostRef.current.getActiveTab(),
      navigate: (tab) => hostRef.current.navigate(tab),
      openAugmentModule: (id) => hostRef.current.openAugmentModule(id),
      setActiveStock: (id) => hostRef.current.setActiveStock(id),
      addPosition: (t, b, q) => hostRef.current.addPosition(t, b, q),
      removePosition: (id) => hostRef.current.removePosition(id),
      updatePosition: (id, c) => hostRef.current.updatePosition(id, c),
      getHistoryEntries: () => hostRef.current.getHistoryEntries(),
    };
    return new ForesightRuntime({ host: proxyHost, onEvent: applyEvent });
  }, [applyEvent]);

  // Workbench + open-surface bus subscriptions.
  useEffect(() => {
    const offPin = onUIEvent("workbench_pin", ({ card }) => {
      setWorkbench((prev) => [...prev.filter((c) => c.title !== card.title), card].slice(-8));
    });
    const offClear = onUIEvent("workbench_clear", () => setWorkbench([]));
    const offOpen = onUIEvent("open_surface", ({ prefill: p }) => {
      setOpen(true);
      if (p) setPrefill(p);
    });
    return () => { offPin(); offClear(); offOpen(); };
  }, []);

  const send = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed || runtime.isBusy()) return;
    setBusy(true);
    setTranscript((prev) => [
      ...prev,
      { kind: "user", id: crypto.randomUUID(), text: trimmed, at: Date.now() },
      { kind: "run", id: crypto.randomUUID(), at: Date.now(), goals: [], steps: [], pendings: [], facts: [], done: false },
    ]);
    void runtime.runTurn(trimmed);
  }, [runtime]);

  const confirm = useCallback((nonce: string) => {
    setBusy(true);
    setTranscript((prev) => [
      ...prev,
      { kind: "run", id: crypto.randomUUID(), at: Date.now(), goals: [], steps: [], pendings: [], facts: [], done: false },
    ]);
    void runtime.confirmPending(nonce);
  }, [runtime]);

  const reject = useCallback((nonce: string) => {
    runtime.rejectPending(nonce);
    setTranscript((prev) => prev.map((item) =>
      item.kind === "run"
        ? { ...item, pendings: item.pendings.filter((p) => p.nonce !== nonce) }
        : item,
    ));
  }, [runtime]);

  const cancel = useCallback(() => runtime.cancel(), [runtime]);
  const clearWorkbench = useCallback(() => setWorkbench([]), []);

  const api = useMemo<ForesightAPI>(() => ({
    open, setOpen, transcript, workbench, busy, prefill, setPrefill,
    send, confirm, reject, cancel, clearWorkbench,
  }), [open, transcript, workbench, busy, prefill, send, confirm, reject, cancel, clearWorkbench]);

  return <ForesightContext.Provider value={api}>{children}</ForesightContext.Provider>;
}

function applyToRun(next: TranscriptItem[], run: Extract<TranscriptItem, { kind: "run" }>, event: RuntimeEvent): TranscriptItem[] {
  switch (event.type) {
    case "ack":
      run.ack = event.text;
      break;
    case "goals":
      run.goals = event.goals;
      break;
    case "step": {
      const idx = run.steps.findIndex((s) => s.nodeId === event.step.nodeId);
      run.steps = idx >= 0
        ? run.steps.map((s, i) => (i === idx ? event.step : s))
        : [...run.steps, event.step];
      break;
    }
    case "confirmation_required":
      run.pendings = [...run.pendings, event.pending];
      break;
    case "answer":
      run.answer = event.text;
      run.verification = event.verification;
      run.facts = event.facts;
      break;
    case "clarify":
      run.clarify = event.question;
      break;
    case "error":
      run.error = event.message;
      break;
    case "done":
      run.done = true;
      break;
  }
  return next;
}
