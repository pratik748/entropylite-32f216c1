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
import {
  executeSubsetRisk,
  executeStockComparison,
  executeNewsImpact,
  executeStressTest,
  executeLLMFallback,
} from "./quantEngine";
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
      onError: () => {
        setVoiceState("idle");
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
          speechControllerRef.current?.triggerExplicitListening();
          setVoiceState("listening");
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

      const positions: PortfolioPosition[] = hostRef.current?.getPositions() || [];
      const parsedIntent: SashaParsedIntent = routeSashaIntent(query);

      let result: SashaResult;
      try {
        switch (parsedIntent.type) {
          case "subset_risk":
            result = await executeSubsetRisk(parsedIntent, positions);
            break;
          case "stock_comparison":
            result = await executeStockComparison(parsedIntent);
            break;
          case "news_impact":
            result = await executeNewsImpact(parsedIntent, positions);
            break;
          case "stress_test":
            result = await executeStressTest(parsedIntent, positions);
            break;
          case "llm_fallback":
          default:
            result = await executeLLMFallback(parsedIntent, positions);
            break;
        }
      } catch (err: any) {
        result = {
          id: crypto.randomUUID(),
          intent: parsedIntent,
          spokenPunchline: "Encountered a calculation threshold issue; reviewing portfolio risk metrics on screen.",
          phoneticSpokenText: "Encountered a calculation threshold issue; reviewing portfolio risk metrics on screen.",
          headline: "Quantitative Diagnostic",
          cardType: "general_quant",
          cardData: {
            headline: "Quantitative Diagnostic",
            summary: err?.message || "Execution exception occurred during portfolio analysis.",
            metrics: [{ label: "Status", value: "Flagged" }],
          },
          executionTimeMs: 12,
          receipts: [
            { id: "err-rcpt", label: "Diagnostic Engine", elapsedMs: 12, badge: "Handled", status: "warning" },
          ],
          source: "error-diagnostic",
          facts: [],
          timestamp: Date.now(),
        };
      }

      setActiveResult(result);
      setHistory((prev) => [result, ...prev.slice(0, 20)]);
      setIsOpen(true);
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
    try {
      localStorage.setItem("sasha.voice.muted", muted ? "1" : "0");
    } catch {}
    if (muted) stopSpeaking();
  }, []);

  const startListening = useCallback(() => {
    speechControllerRef.current?.triggerExplicitListening();
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
