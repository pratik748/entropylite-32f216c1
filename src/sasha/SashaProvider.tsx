/**
 * SASHA React Provider
 *
 * Connects the voice quant copilot subsystem to React context, host application state,
 * global keyboard shortcuts, and HUD lifecycle.
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import type { HostAdapter, PortfolioPosition } from "@/foresight/types";
import type {
  SashaContextValue,
  SashaResult,
  SashaVoiceState,
  SashaParsedIntent,
} from "./types";
import { routeSashaIntent } from "./intentRouter";
import { useForesight } from "@/foresight/ForesightProvider";
import { toast } from "sonner";
import {
  SashaSpeechController,
  speakPunchline,
  stopSpeaking,
} from "./voiceEngine";

const SashaContext = createContext<SashaContextValue | null>(null);

export function useSasha(): SashaContextValue {
  const ctx = useContext(SashaContext);
  if (!ctx) {
    throw new Error("useSasha must be used within a SashaProvider");
  }
  return ctx;
}

interface SashaProviderProps {
  host: HostAdapter;
  children: ReactNode;
  onNavigateTab?: (tabId: string) => void;
  onOpenWorkstation?: (ticker: string) => void;
}

export const SashaProvider: React.FC<SashaProviderProps> = ({
  host,
  children,
  onNavigateTab,
  onOpenWorkstation,
}) => {
  const hostRef = useRef(host);
  hostRef.current = host;

  const onNavigateTabRef = useRef(onNavigateTab);
  onNavigateTabRef.current = onNavigateTab;

  const onOpenWorkstationRef = useRef(onOpenWorkstation);
  onOpenWorkstationRef.current = onOpenWorkstation;

  const [voiceState, setVoiceState] = useState<SashaVoiceState>("idle");
  const [isWakeWordActive, setWakeWordActiveState] = useState(false);
  const [isVoiceMuted, setVoiceMutedState] = useState(false);
  const [audioEnergy, setAudioEnergy] = useState(0);
  const [activeResult, setActiveResult] = useState<SashaResult | null>(null);
  const [history, setHistory] = useState<SashaResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [queryInput, setQueryInput] = useState("");

  const speechControllerRef = useRef<SashaSpeechController | null>(null);

  // Sasha is the voice front door to the Foresight agent: the LLM plans each
  // request and runs the mapped terminal tools; Sasha listens and speaks.
  const foresight = useForesight();
  const foresightRef = useRef(foresight);
  foresightRef.current = foresight;
  const awaitingAnswerRef = useRef(false);
  const isVoiceMutedRef = useRef(false);

  useEffect(() => {
    if (!awaitingAnswerRef.current || foresight.busy) return;
    const last = [...foresight.transcript].reverse().find((t) => t.kind === "run");
    if (!last || last.kind !== "run" || !last.done) return;
    awaitingAnswerRef.current = false;
    const text = last.answer || last.clarify || (last.error ? "That run hit a problem, details are on screen." : "");
    if (!text || isVoiceMutedRef.current) { setVoiceState("idle"); return; }
    setVoiceState("speaking");
    speakPunchline(text.split(/(?<=[.!?])\s+/).slice(0, 2).join(" "), () => setVoiceState("idle"));
  }, [foresight.busy, foresight.transcript]);

  // Initialize Speech Controller
  useEffect(() => {
    if (typeof window === "undefined") return;

    const controller = new SashaSpeechController();
    speechControllerRef.current = controller;
    setWakeWordActiveState(controller.getWakeWordEnabled());

    controller.setEnergyCallback((energy) => {
      setAudioEnergy(energy);
    });

    controller.setHandler({
      onWakeWordDetected: (remainder) => {
        setIsOpen(true);
        if (remainder && remainder.trim().length > 2) {
          handleExecuteQuery(remainder.trim());
        } else {
          setVoiceState("listening");
        }
      },
      onFinalTranscript: (transcript) => {
        if (transcript && transcript.trim().length > 1) {
          setQueryInput(transcript);
          handleExecuteQuery(transcript.trim());
        }
      },
      onInterimTranscript: (interim) => {
        setQueryInput(interim);
      },
      onListeningChange: (listening) => {
        setVoiceState((prev) => {
          if (listening) return "listening";
          return prev === "listening" ? "idle" : prev;
        });
      },
      onError: (err) => {
        setVoiceState("idle");
        if (err === "unsupported") toast.error("Voice input isn't supported in this browser. Type your question instead.");
        else if (err === "not-allowed" || err === "service-not-allowed") toast.error("Microphone access is blocked. Allow it in your browser settings to talk to Sasha.");
        else if (err === "audio-capture") toast.error("No microphone was found.");
      },
    });

    if (controller.getWakeWordEnabled()) {
      controller.startContinuousListening();
    }

    return () => {
      controller.stopContinuousListening();
      stopSpeaking();
    };
  }, []);

  // Global Hotkey Listener: Alt+S or Ctrl+Space to toggle voice quant copilot
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Alt+S or Option+S or Ctrl+Space
      const isAltS = e.altKey && (e.key === "s" || e.key === "S" || e.code === "KeyS");
      const isCtrlSpace = e.ctrlKey && (e.code === "Space" || e.key === " ");

      if (isAltS || isCtrlSpace) {
        e.preventDefault();
        setIsOpen((prev) => !prev);
        if (voiceState === "listening") {
          speechControllerRef.current?.stopContinuousListening();
          setVoiceState("idle");
        } else {
          stopSpeaking();
          if (speechControllerRef.current?.triggerExplicitListening()) setVoiceState("listening");
        }
      }

      // Escape to cancel speech or close HUD
      if (e.key === "Escape") {
        if (voiceState === "speaking") {
          stopSpeaking();
          setVoiceState("idle");
        } else if (isOpen) {
          setIsOpen(false);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [voiceState, isOpen]);

  // Execute quantitative query with sub-100ms routing
  const handleExecuteQuery = useCallback(
    async (query: string): Promise<SashaResult> => {
      setVoiceState("processing");
      stopSpeaking();

      const parsedIntent: SashaParsedIntent = routeSashaIntent(query);
      const fs = foresightRef.current;
      awaitingAnswerRef.current = true;
      fs.setOpen(true);
      fs.send(query);
      setIsOpen(false);
      const result = {
        id: crypto.randomUUID(),
        intent: parsedIntent,
        spokenPunchline: "",
        phoneticSpokenText: "",
        headline: query,
        cardType: "general_quant",
        cardData: { headline: query, summary: "Handed to the research agent.", metrics: [] },
        executionTimeMs: 0,
        receipts: [],
        source: "foresight-agent",
        facts: [],
        timestamp: Date.now(),
      } as unknown as SashaResult;
      setHistory((prev) => [result, ...prev.slice(0, 20)]);
      setQueryInput("");
      return result;
    },
    []
  );
  const _unused = useCallback(
    async (result: SashaResult) => {
      setActiveResult(result);
      setHistory((prev) => [result, ...prev.slice(0, 20)]);
      setQueryInput("");
      // Trigger crisp spoken punchline
      setVoiceState("speaking");
      speakPunchline(result.spokenPunchline, () => {
        setVoiceState("idle");
      }, result.phoneticSpokenText);

      return result;
    },
    []
  );

  const handleAction = useCallback((actionType: "risk_lab" | "workstation" | "fortress" | "screener", payload?: any) => {
    if (actionType === "risk_lab") {
      onNavigateTabRef.current?.("risk");
    } else if (actionType === "workstation" && payload?.ticker) {
      onOpenWorkstationRef.current?.(payload.ticker);
    } else if (actionType === "fortress") {
      onNavigateTabRef.current?.("fortress");
    } else if (actionType === "screener") {
      onNavigateTabRef.current?.("screener");
    }
  }, []);

  const setWakeWordActive = useCallback((enabled: boolean) => {
    setWakeWordActiveState(enabled);
    speechControllerRef.current?.setWakeWordEnabled(enabled);
  }, []);

  const setVoiceMuted = useCallback((muted: boolean) => {
    setVoiceMutedState(muted);
    isVoiceMutedRef.current = muted;
    try {
      localStorage.setItem("sasha.voice.muted", muted ? "1" : "0");
    } catch {}
    if (muted) stopSpeaking();
  }, []);

  const startListening = useCallback(() => {
    stopSpeaking();
    const ok = speechControllerRef.current?.triggerExplicitListening();
    if (!ok) return;
    setVoiceState("listening");
    setIsOpen(true);
  }, []);

  const stopListening = useCallback(() => {
    speechControllerRef.current?.stopContinuousListening();
    setVoiceState("idle");
  }, []);

  const cancelSpeech = useCallback(() => {
    stopSpeaking();
    setVoiceState("idle");
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  const value: SashaContextValue = {
    voiceState,
    isListening: voiceState === "listening",
    isSpeaking: voiceState === "speaking",
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
    submitQuery: handleExecuteQuery,
    cancelSpeech,
    clearHistory,
    handleAction,
  };

  return (
    <SashaContext.Provider value={value}>
      {children}
    </SashaContext.Provider>
  );
};
