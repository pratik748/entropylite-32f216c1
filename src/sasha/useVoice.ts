/**
 * SASHA Voice Hook (useVoice)
 *
 * Exposes the speech recognition (STT) and institutional speech synthesis (TTS)
 * subsystem with live microphone frequency analysis, continuous "Hey Sasha"
 * wake-word listening, and instant priority interrupt.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  SashaSpeechController,
  speakPunchline,
  stopSpeaking,
  speechSupported,
  recognitionSupported,
} from "./voiceEngine";
import type { SashaVoiceState } from "./types";

export interface UseVoiceOptions {
  onTranscript?: (transcript: string) => void;
  onWakeWord?: (remainder?: string) => void;
  onInterim?: (interim: string) => void;
}

export function useVoice(options?: UseVoiceOptions) {
  const [voiceState, setVoiceState] = useState<SashaVoiceState>("idle");
  const [isWakeWordActive, setWakeWordActiveState] = useState(false);
  const [isVoiceMuted, setVoiceMutedState] = useState(false);
  const [audioEnergy, setAudioEnergy] = useState(0);
  const [frequencyData, setFrequencyData] = useState<Uint8Array>(new Uint8Array(24));

  const controllerRef = useRef<SashaSpeechController | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (typeof window === "undefined") return;

    const controller = new SashaSpeechController();
    controllerRef.current = controller;
    setWakeWordActiveState(controller.getWakeWordEnabled());

    try {
      setVoiceMutedState(localStorage.getItem("sasha.voice.muted") === "1");
    } catch {}

    controller.setEnergyCallback((energy) => {
      setAudioEnergy(energy);
    });

    controller.setFrequencyDataCallback((freqs) => {
      setFrequencyData(new Uint8Array(freqs));
    });

    controller.setHandler({
      onWakeWordDetected: (remainder) => {
        setVoiceState("listening");
        optionsRef.current?.onWakeWord?.(remainder);
      },
      onFinalTranscript: (transcript) => {
        setVoiceState("processing");
        optionsRef.current?.onTranscript?.(transcript);
      },
      onInterimTranscript: (interim) => {
        optionsRef.current?.onInterim?.(interim);
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

  const startListening = useCallback(() => {
    stopSpeaking();
    controllerRef.current?.triggerExplicitListening();
    setVoiceState("listening");
  }, []);

  const stopListening = useCallback(() => {
    controllerRef.current?.stopContinuousListening();
    setVoiceState("idle");
  }, []);

  const speak = useCallback((text: string, phoneticOverride?: string, onEnd?: () => void) => {
    if (isVoiceMuted) {
      onEnd?.();
      return;
    }
    setVoiceState("speaking");
    speakPunchline(text, () => {
      setVoiceState("idle");
      onEnd?.();
    }, phoneticOverride);
  }, [isVoiceMuted]);

  const cancelSpeech = useCallback(() => {
    stopSpeaking();
    setVoiceState("idle");
  }, []);

  const toggleWakeWord = useCallback((enabled?: boolean) => {
    const next = enabled !== undefined ? enabled : !isWakeWordActive;
    setWakeWordActiveState(next);
    controllerRef.current?.setWakeWordEnabled(next);
  }, [isWakeWordActive]);

  const toggleVoiceMute = useCallback((muted?: boolean) => {
    const next = muted !== undefined ? muted : !isVoiceMuted;
    setVoiceMutedState(next);
    try {
      localStorage.setItem("sasha.voice.muted", next ? "1" : "0");
    } catch {}
    if (next) cancelSpeech();
  }, [isVoiceMuted, cancelSpeech]);

  return {
    voiceState,
    isListening: voiceState === "listening",
    isSpeaking: voiceState === "speaking",
    isWakeWordActive,
    isVoiceMuted,
    audioEnergy,
    frequencyData,
    speechSupported,
    recognitionSupported,
    startListening,
    stopListening,
    speak,
    cancelSpeech,
    toggleWakeWord,
    toggleVoiceMute,
  };
}
