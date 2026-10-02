import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import type { PortfolioStock } from "@/components/PortfolioPanel";
import type { SashaResponse, SashaState } from "./types";
import { processSashaQuery } from "./engine/sashaEngine";
import { sashaSpeaker } from "./voice/voiceSynthesizer";
import { sashaRecognizer } from "./voice/voiceRecognition";
import { SashaOrb } from "./ui/SashaOrb";
import { SashaHUD } from "./ui/SashaHUD";

interface SashaContextType {
  state: SashaState;
  isOpen: boolean;
  isWakeWordListening: boolean;
  isVoiceMuted: boolean;
  lastResponse: SashaResponse | null;
  toggleOpen: () => void;
  triggerVoiceCommand: () => void;
  executePrompt: (prompt: string) => Promise<void>;
  toggleWakeWord: () => void;
  toggleVoiceMute: () => void;
  stopAudio: () => void;
}

const SashaContext = createContext<SashaContextType | null>(null);

export const useSasha = () => {
  const ctx = useContext(SashaContext);
  if (!ctx) throw new Error("useSasha must be used within SashaProvider");
  return ctx;
};

interface SashaProviderProps {
  children: React.ReactNode;
  stocks: PortfolioStock[];
  onNavigateTab?: (tab: string) => void;
}

export const SashaProvider: React.FC<SashaProviderProps> = ({
  children,
  stocks,
  onNavigateTab
}) => {
  const navigate = useNavigate();
  const [state, setState] = useState<SashaState>("dormant");
  const [isOpen, setIsOpen] = useState(false);
  const [isWakeWordListening, setIsWakeWordListening] = useState(true);
  const [isVoiceMuted, setIsVoiceMuted] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [lastResponse, setLastResponse] = useState<SashaResponse | null>(null);

  const stocksRef = useRef(stocks);
  useEffect(() => {
    stocksRef.current = stocks;
  }, [stocks]);

  const executePrompt = useCallback(async (prompt: string) => {
    setState("computing");
    setIsOpen(true);
    setInterimTranscript("");

    try {
      const response = await processSashaQuery(prompt, stocksRef.current);
      setLastResponse(response);

      if (!isVoiceMuted && sashaSpeaker.isAvailable()) {
        setState("speaking");
        sashaSpeaker.speak(response.spokenSummary, {
          onEnd: () => {
            setState(isWakeWordListening ? "dormant" : "dormant");
          },
          onError: () => {
            setState("dormant");
          }
        });
      } else {
        setState("dormant");
      }
    } catch (err) {
      console.error("SASHA computation error:", err);
      setState("error");
      setTimeout(() => setState("dormant"), 2000);
    }
  }, [isVoiceMuted, isWakeWordListening]);

  // Setup passive wake word recognition
  useEffect(() => {
    if (!sashaRecognizer.isSupported()) return;

    if (isWakeWordListening) {
      sashaRecognizer.startPassive({
        onWakeWordDetected: () => {
          setState("listening");
          setIsOpen(true);
          sashaSpeaker.stop(); // Interruption capability
        },
        onInterimText: (text) => {
          setInterimTranscript(text);
        },
        onFinalCommand: (command) => {
          void executePrompt(command);
        },
        onError: () => {
          setState("dormant");
        }
      });
    } else {
      sashaRecognizer.stop();
      setState("dormant");
    }

    return () => {
      sashaRecognizer.stop();
    };
  }, [isWakeWordListening, executePrompt]);

  // Global keyboard shortcuts (Alt+S or Ctrl+Space)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.altKey && e.code === "KeyS") || (e.ctrlKey && e.code === "Space")) {
        e.preventDefault();
        triggerVoiceCommand();
      } else if (e.code === "Escape" && isOpen) {
        setIsOpen(false);
        sashaSpeaker.stop();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const triggerVoiceCommand = useCallback(() => {
    sashaSpeaker.stop();
    setIsOpen(true);
    setState("listening");
    setInterimTranscript("");

    sashaRecognizer.startDirectCommand({
      onInterimText: (text) => {
        setInterimTranscript(text);
      },
      onFinalCommand: (command) => {
        void executePrompt(command);
      },
      onError: () => {
        setState("dormant");
      }
    });
  }, [executePrompt]);

  const toggleOpen = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);

  const toggleWakeWord = useCallback(() => {
    setIsWakeWordListening(prev => !prev);
  }, []);

  const toggleVoiceMute = useCallback(() => {
    setIsVoiceMuted(prev => {
      const next = !prev;
      if (next) sashaSpeaker.stop();
      return next;
    });
  }, []);

  const stopAudio = useCallback(() => {
    sashaSpeaker.stop();
  }, []);

  const handleActionClick = useCallback((action: { label: string; actionType: string; payload?: any }) => {
    if (action.actionType === "NAVIGATE" && action.payload) {
      if (onNavigateTab) onNavigateTab(action.payload);
      setIsOpen(false);
    } else if (action.actionType === "OPEN_WORKSTATION" && action.payload) {
      navigate(`/company/${encodeURIComponent(action.payload)}`);
      setIsOpen(false);
    } else if (action.actionType === "DIRECT_PROFIT") {
      if (onNavigateTab) onNavigateTab("dashboard");
      setIsOpen(false);
    }
  }, [navigate, onNavigateTab]);

  return (
    <SashaContext.Provider
      value={{
        state,
        isOpen,
        isWakeWordListening,
        isVoiceMuted,
        lastResponse,
        toggleOpen,
        triggerVoiceCommand,
        executePrompt,
        toggleWakeWord,
        toggleVoiceMute,
        stopAudio
      }}
    >
      {children}

      {/* Floating Ambient SASHA Activator */}
      <SashaOrb
        state={state}
        isWakeWordListening={isWakeWordListening}
        isVoiceMuted={isVoiceMuted}
        isOpen={isOpen}
        onToggleOpen={toggleOpen}
        onDirectTrigger={triggerVoiceCommand}
        onToggleWakeWord={toggleWakeWord}
        onToggleVoiceMute={toggleVoiceMute}
      />

      {/* Interactive Obsidian HUD */}
      <SashaHUD
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        state={state}
        interimTranscript={interimTranscript}
        lastResponse={lastResponse}
        onExecutePrompt={executePrompt}
        onDirectTrigger={triggerVoiceCommand}
        onReplayAudio={() => {
          if (lastResponse?.spokenSummary) {
            setState("speaking");
            sashaSpeaker.speak(lastResponse.spokenSummary, {
              onEnd: () => setState("dormant")
            });
          }
        }}
        onActionClick={handleActionClick}
      />
    </SashaContext.Provider>
  );
};
