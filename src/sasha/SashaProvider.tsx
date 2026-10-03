/**
 * SASHA React Provider
 *
 * Connects the voice quant copilot subsystem to React context, host application state,
 * global keyboard shortcuts, and HUD lifecycle.
 *
 * Powered by SASHA Universal Tool Registry & DAG Orchestration Engine.
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
  SashaExecutionState,
  SashaMessage,
} from "./types";
import { executeSashaOrchestration } from "./orchestration";
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

  const [executionState, setExecutionState] = useState<SashaExecutionState>("IDLE");
  const [voiceState, setVoiceState] = useState<SashaVoiceState>("idle");
  const [isWakeWordActive, setWakeWordActiveState] = useState(false);
  const [isVoiceMuted, setVoiceMutedState] = useState(false);
  const [audioEnergy, setAudioEnergy] = useState(0);
  const [activeResult, setActiveResult] = useState<SashaResult | null>(null);
  const [history, setHistory] = useState<SashaResult[]>([]);
  const [messages, setMessages] = useState<SashaMessage[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [queryInput, setQueryInput] = useState("");
  const [activeContextTicker, setActiveContextTicker] = useState<string | null>(null);

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
          setExecutionState("LISTENING");
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
        setExecutionState("TRANSCRIBING");
      },
      onListeningChange: (listening) => {
        setVoiceState((prev) => {
          if (listening) {
            setExecutionState("LISTENING");
            return "listening";
          }
          if (prev === "listening") {
            setExecutionState("IDLE");
            return "idle";
          }
          return prev;
        });
      },
      onError: () => {
        setVoiceState("idle");
        setExecutionState("IDLE");
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
      const isAltS = e.altKey && (e.key === "s" || e.key === "S" || e.code === "KeyS");
      const isCtrlSpace = e.ctrlKey && (e.code === "Space" || e.key === " ");

      if (isAltS || isCtrlSpace) {
        e.preventDefault();
        setIsOpen((prev) => {
          const next = !prev;
          if (!next) {
            cancelSpeech();
          }
          return next;
        });
        if (voiceState === "listening") {
          speechControllerRef.current?.stopContinuousListening();
          setVoiceState("idle");
          setExecutionState("IDLE");
        } else {
          speechControllerRef.current?.triggerExplicitListening();
          setVoiceState("listening");
          setExecutionState("LISTENING");
        }
      }

      // Escape to cancel speech or close HUD
      if (e.key === "Escape") {
        if (voiceState === "speaking") {
          stopSpeaking();
          setVoiceState("idle");
          setExecutionState("IDLE");
        } else if (isOpen) {
          setIsOpen(false);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [voiceState, isOpen]);

  // Execute quantitative query with universal tool orchestration and DAG planning
  const handleExecuteQuery = useCallback(
    async (query: string): Promise<SashaResult> => {
      const trimmed = query.trim();
      if (!trimmed) {
        throw new Error("Empty query");
      }

      setVoiceState("processing");
      setExecutionState("UNDERSTANDING");
      stopSpeaking();

      // Add user message to conversation thread
      const userMsgId = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        {
          id: userMsgId,
          role: "user",
          text: trimmed,
          timestamp: Date.now(),
        },
      ]);

      const positions: PortfolioPosition[] = hostRef.current?.getPositions() || [];

      let result: SashaResult;
      try {
        const orchestration = await executeSashaOrchestration(
          trimmed,
          {
            userId: "current_user",
            executionId: `exec_${Date.now()}`,
            positions,
            portfolioValue: positions.reduce((acc, p) => acc + (p.currentPrice || p.buyPrice || 100) * (p.quantity || 1), 0) || 100000,
            timestamp: Date.now(),
          },
          (state) => {
            setExecutionState(state);
          }
        );
        result = orchestration.result;
      } catch (err: any) {
        setExecutionState("ERROR");
        result = {
          id: crypto.randomUUID(),
          intent: { type: "llm_fallback", rawQuery: trimmed },
          spokenPunchline: "Encountered an execution threshold issue; reviewing quantitative metrics on screen.",
          phoneticSpokenText: "Encountered an execution threshold issue; reviewing quantitative metrics on screen.",
          headline: "Quantitative Diagnostic",
          cardType: "general_quant",
          cardData: {
            headline: "Quantitative Diagnostic",
            summary: err?.message || "Execution exception occurred during portfolio analysis.",
            metrics: [{ label: "Status", value: "Handled", tone: "neutral" }],
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

      // Add Sasha response to conversation thread
      const sashaMsgId = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        {
          id: sashaMsgId,
          role: "sasha",
          text: result.spokenPunchline,
          result,
          timestamp: Date.now(),
        },
      ]);

      setActiveResult(result);
      setHistory((prev) => [result, ...prev.slice(0, 30)]);
      setIsOpen(true);
      setIsMinimized(false);
      setQueryInput("");

      // Ambient Auto-Navigation Trigger for VIP experience
      if (result.intent.type === "navigation") {
        if (result.intent.target === "workstation" && result.intent.ticker) {
          setActiveContextTicker(result.intent.ticker);
          onOpenWorkstationRef.current?.(result.intent.ticker);
        } else if (result.intent.target === "tab" && result.intent.tabId) {
          onNavigateTabRef.current?.(result.intent.tabId);
        }
      } else if (result.intent.type === "single_stock") {
        setActiveContextTicker(result.intent.ticker);
      }

      // Speak punchline with institutional phonetics
      setVoiceState("speaking");
      setExecutionState("RESPONDING");
      speakPunchline(
        result.spokenPunchline,
        () => {
          setVoiceState("idle");
          setExecutionState("IDLE");
        },
        result.phoneticSpokenText,
      );

      return result;
    },
    []
  );

  const handleAction = useCallback((actionType: "risk_lab" | "workstation" | "screener" | "tab", payload?: any) => {
    if (actionType === "risk_lab") {
      onNavigateTabRef.current?.("risk");
    } else if (actionType === "workstation" && payload?.ticker) {
      setActiveContextTicker(payload.ticker);
      onOpenWorkstationRef.current?.(payload.ticker);
    } else if (actionType === "screener") {
      onNavigateTabRef.current?.("desirable");
    } else if (actionType === "tab" && payload?.tabId) {
      onNavigateTabRef.current?.(payload.tabId);
    }
  }, []);

  const navigateTo = useCallback(
    (
      destination: "dashboard" | "market" | "sandbox" | "statarb" | "augment" | "geopolitical" | "desirable" | "risk" | "fortress" | "system",
      ticker?: string
    ) => {
      if (ticker) {
        setActiveContextTicker(ticker);
        onOpenWorkstationRef.current?.(ticker);
      } else if (destination) {
        onNavigateTabRef.current?.(destination);
      }
    },
    []
  );

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
    setExecutionState("LISTENING");
    setIsOpen(true);
  }, []);

  const stopListening = useCallback(() => {
    speechControllerRef.current?.stopContinuousListening();
    setVoiceState("idle");
    setExecutionState("IDLE");
  }, []);

  const cancelSpeech = useCallback(() => {
    stopSpeaking();
    setVoiceState("idle");
    setExecutionState("IDLE");
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    setMessages([]);
    setActiveResult(null);
  }, []);

  const value: SashaContextValue = {
    executionState,
    voiceState,
    isListening: voiceState === "listening",
    isSpeaking: voiceState === "speaking",
    isWakeWordActive,
    isVoiceMuted,
    audioEnergy,
    activeResult,
    history,
    messages,
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
    submitQuery: handleExecuteQuery,
    cancelSpeech,
    clearHistory,
    handleAction,
    navigateTo,
  };

  return (
    <SashaContext.Provider value={value}>
      {children}
    </SashaContext.Provider>
  );
};
