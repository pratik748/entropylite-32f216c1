/**
 * SASHA Voice Engine
 *
 * Tier-1 Institutional Hands-Free Voice Subsystem:
 *  - Crisp Web Speech Synthesis (TTS) with priority interrupt & natural voice picker.
 *  - Financial phonetic translation for zero-glitch ticker and Greek pronunciation.
 *  - Error-resilient Web Speech Recognition (STT) with continuous wake-word
 *    listening ("Hey Sasha" / "Sasha").
 *  - Web Audio API real-time microphone energy analyzer for live reactive waveforms.
 */

import { toInstitutionalPhonetics } from "./sashaPhonetics";

const VOICE_MUTED_KEY = "sasha.voice.muted";
const WAKE_WORD_KEY = "sasha.voice.wakeword";

export const speechSupported =
  typeof window !== "undefined" && "speechSynthesis" in window;

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return ((w.SpeechRecognition || w.webkitSpeechRecognition) ?? null) as SpeechRecognitionCtor | null;
}

export const recognitionSupported = getSpeechRecognitionCtor() !== null;

// ── Text To Speech (TTS) ─────────────────────────────────────────────────────

const PREFERRED_VOICES = [
  "siri",
  "natural",
  "neural",
  "google us english",
  "google uk english female",
  "microsoft aria",
  "microsoft sonia",
  "samantha",
  "karen",
  "daniel",
  "google",
];

let cachedVoice: SpeechSynthesisVoice | null = null;

function getBestVoice(): SpeechSynthesisVoice | null {
  if (!speechSupported) return null;
  if (cachedVoice) return cachedVoice;

  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("en"));
  if (voices.length === 0) return null;

  for (const pref of PREFERRED_VOICES) {
    const hit = voices.find((v) => v.name.toLowerCase().includes(pref));
    if (hit) {
      cachedVoice = hit;
      return hit;
    }
  }
  cachedVoice = voices.find((v) => v.localService) || voices[0];
  return cachedVoice;
}

if (speechSupported) {
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoice = null;
    getBestVoice();
  };
}

export function stopSpeaking(): void {
  if (!speechSupported) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // Silent
  }
}

export function speakPunchline(text: string, onEnd?: () => void, phoneticOverride?: string): void {
  if (!speechSupported || !text) {
    onEnd?.();
    return;
  }

  try {
    const isMuted = localStorage.getItem(VOICE_MUTED_KEY) === "1";
    if (isMuted) {
      onEnd?.();
      return;
    }
  } catch {
    // LocalStorage inaccessible
  }

  stopSpeaking();

  // Use phonetic translation for institutional spoken cadence
  const spokenText = phoneticOverride || toInstitutionalPhonetics(text);
  const utterance = new SpeechSynthesisUtterance(spokenText);
  const voice = getBestVoice();
  if (voice) utterance.voice = voice;

  // Senior Quantitative Risk Officer profile: measured, clear, high-signal
  utterance.rate = 1.02;
  utterance.pitch = 0.96;
  utterance.volume = 1.0;

  utterance.onend = () => onEnd?.();
  utterance.onerror = () => onEnd?.();

  try {
    window.speechSynthesis.speak(utterance);
  } catch {
    onEnd?.();
  }
}

// ── Wake Word & Continuous Speech Recognition ────────────────────────────────

export interface WakeWordHandler {
  onWakeWordDetected: (queryRemainder?: string) => void;
  onFinalTranscript: (transcript: string) => void;
  onInterimTranscript?: (transcript: string) => void;
  onError?: (err: string) => void;
  onListeningChange?: (listening: boolean) => void;
}

export class SashaSpeechController {
  private recognition: SpeechRecognitionLike | null = null;
  private isWakeWordActive = false;
  private isExplicitListening = false;
  private shouldKeepListening = false;
  private handler: WakeWordHandler | null = null;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaStream: MediaStream | null = null;
  private animFrameId: number | null = null;
  private onEnergyCallback: ((energy: number) => void) | null = null;
  private onFrequencyDataCallback: ((freqs: Uint8Array) => void) | null = null;

  constructor() {
    try {
      this.isWakeWordActive = localStorage.getItem(WAKE_WORD_KEY) === "1";
    } catch {
      this.isWakeWordActive = false;
    }
  }

  public setHandler(handler: WakeWordHandler): void {
    this.handler = handler;
  }

  public setEnergyCallback(cb: (energy: number) => void): void {
    this.onEnergyCallback = cb;
  }

  public setFrequencyDataCallback(cb: (freqs: Uint8Array) => void): void {
    this.onFrequencyDataCallback = cb;
  }

  public getWakeWordEnabled(): boolean {
    return this.isWakeWordActive;
  }

  public setWakeWordEnabled(enabled: boolean): void {
    this.isWakeWordActive = enabled;
    try {
      localStorage.setItem(WAKE_WORD_KEY, enabled ? "1" : "0");
    } catch {
      // Silent
    }
    if (enabled && !this.shouldKeepListening) {
      this.startContinuousListening();
    } else if (!enabled && !this.isExplicitListening) {
      this.stopContinuousListening();
    }
  }

  public startContinuousListening(): void {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;

    this.shouldKeepListening = true;
    this.initAudioAnalyser();

    if (!this.recognition) {
      this.recognition = new Ctor();
      this.recognition.lang = "en-US";
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.maxAlternatives = 1;

      this.recognition.onstart = () => {
        this.handler?.onListeningChange?.(true);
      };

      this.recognition.onresult = (event: SpeechRecognitionEventLike) => {
        let interim = "";
        let final = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const item = event.results[i];
          const transcript = item[0]?.transcript || "";
          if (item.isFinal) {
            final += transcript;
          } else {
            interim += transcript;
          }
        }

        const currentText = (final || interim).trim();
        if (!currentText) return;

        // Wake word pattern: "Hey Sasha", "Sasha", "Ok Sasha"
        const wakeWordRegex = /^(?:hey\s+sasha|sasha|ok\s+sasha|sasha,)\s*(.*)$/i;
        const match = currentText.match(wakeWordRegex);

        if (match) {
          const remainder = match[1]?.trim();
          if (remainder && remainder.length > 2 && final) {
            // Full command with wake word
            this.handler?.onFinalTranscript(remainder);
          } else {
            this.handler?.onWakeWordDetected(remainder);
          }
        } else if (this.isExplicitListening) {
          if (final) {
            this.handler?.onFinalTranscript(final.trim());
          } else if (interim) {
            this.handler?.onInterimTranscript?.(interim.trim());
          }
        }
      };

      this.recognition.onerror = (e) => {
        const err = e.error || "unknown";
        if (err !== "no-speech" && err !== "aborted") {
          // Non-fatal recognition error
        }
      };

      this.recognition.onend = () => {
        if (this.shouldKeepListening) {
          // Auto-restart with slight backoff to avoid browser crash
          setTimeout(() => {
            if (this.shouldKeepListening && this.recognition) {
              try {
                this.recognition.start();
              } catch {
                // Ignore start collision
              }
            }
          }, 200);
        } else {
          this.handler?.onListeningChange?.(false);
        }
      };
    }

    try {
      this.recognition.start();
    } catch {
      // Already running
    }
  }

  public stopContinuousListening(): void {
    this.shouldKeepListening = false;
    this.isExplicitListening = false;
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        // Silent
      }
    }
    this.stopAudioAnalyser();
    this.handler?.onListeningChange?.(false);
  }

  public triggerExplicitListening(): void {
    this.isExplicitListening = true;
    this.shouldKeepListening = true;
    this.startContinuousListening();
    this.handler?.onListeningChange?.(true);
  }

  // ── Audio Energy Analyser (Web Audio API) ──────────────────────────────────

  private initAudioAnalyser(): void {
    if (typeof window === "undefined" || this.audioCtx) return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      this.audioCtx = new AudioCtx();
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 64;
      this.analyser.smoothingTimeConstant = 0.8;

      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices
          .getUserMedia({ audio: true })
          .then((stream) => {
            this.mediaStream = stream;
            if (this.audioCtx && this.analyser) {
              const source = this.audioCtx.createMediaStreamSource(stream);
              source.connect(this.analyser);
              this.startEnergyLoop();
            }
          })
          .catch(() => {
            // Fallback to synthetic energy loop
            this.startSyntheticEnergyLoop();
          });
      } else {
        this.startSyntheticEnergyLoop();
      }
    } catch {
      this.startSyntheticEnergyLoop();
    }
  }

  private startEnergyLoop(): void {
    const bufferLength = this.analyser?.frequencyBinCount || 32;
    const dataArray = new Uint8Array(bufferLength);

    const check = () => {
      if (!this.shouldKeepListening) {
        this.onEnergyCallback?.(0);
        return;
      }

      if (this.analyser) {
        this.analyser.getByteFrequencyData(dataArray);
        this.onFrequencyDataCallback?.(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength;
        const normalized = Math.min(1, Math.max(0, avg / 128));
        this.onEnergyCallback?.(normalized);
      }

      this.animFrameId = requestAnimationFrame(check);
    };

    check();
  }

  private startSyntheticEnergyLoop(): void {
    let tick = 0;
    const dummyFreqs = new Uint8Array(24);
    const check = () => {
      if (!this.shouldKeepListening) {
        this.onEnergyCallback?.(0);
        return;
      }
      tick += 0.1;
      const energy = 0.2 + 0.15 * Math.sin(tick) + 0.1 * Math.cos(tick * 1.5);
      for (let i = 0; i < 24; i++) {
        dummyFreqs[i] = Math.floor(Math.abs(Math.sin(tick + i * 0.4)) * 200 * energy);
      }
      this.onFrequencyDataCallback?.(dummyFreqs);
      this.onEnergyCallback?.(energy);
      this.animFrameId = requestAnimationFrame(check);
    };
    check();
  }

  private stopAudioAnalyser(): void {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
    if (this.audioCtx && this.audioCtx.state !== "closed") {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
      this.analyser = null;
    }
    this.onEnergyCallback?.(0);
  }
}
