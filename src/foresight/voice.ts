/**
 * Foresight voice — speech output (Web Speech synthesis) and dictation input
 * (Web Speech recognition). Zero dependencies, degrades silently where the
 * platform lacks support (feature flags are exported so the UI can hide the
 * controls instead of showing dead buttons).
 *
 * Output voice selection prefers the most natural voice the device ships:
 * Siri / "Natural" / Google voices first, then any local en-* voice. The
 * spoken register matches Foresight's written one — measured and compact —
 * via a slightly lowered rate and pitch.
 */

const VOICE_PREF_KEY = "foresight.voice.enabled";

// ── Support flags ────────────────────────────────────────────────────

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
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}

function recognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return ((w.SpeechRecognition || w.webkitSpeechRecognition) ?? null) as SpeechRecognitionCtor | null;
}

export const recognitionSupported = recognitionCtor() !== null;

// ── Voice output (TTS) ───────────────────────────────────────────────

let voiceEnabled = ((): boolean => {
  try {
    return localStorage.getItem(VOICE_PREF_KEY) === "1";
  } catch {
    return false;
  }
})();

export function isVoiceEnabled(): boolean {
  return voiceEnabled && speechSupported;
}

export function setVoiceEnabled(on: boolean): void {
  voiceEnabled = on;
  try {
    localStorage.setItem(VOICE_PREF_KEY, on ? "1" : "0");
  } catch {
    // Private mode — preference just won't persist.
  }
  if (!on) stopSpeaking();
}

/** Ranked substrings — first match wins. Covers iOS/macOS, Chrome, Edge, Android. */
const PREFERRED_VOICES = [
  "siri",
  "natural",
  "neural",
  "google uk english female",
  "google us english",
  "samantha",
  "karen",
  "daniel",
  "microsoft aria",
  "microsoft sonia",
  "google",
];

let cachedVoice: SpeechSynthesisVoice | null = null;

function pickVoice(): SpeechSynthesisVoice | null {
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

// Voice list loads asynchronously on some browsers — refresh the cache once ready.
if (speechSupported) {
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoice = null;
    pickVoice();
  };
}

/** Strip markup/ledger noise so the spoken line sounds like a person, not a printout. */
export function toSpeakable(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*_#`|]/g, "")
    .replace(/\[(low|medium|high)\]/gi, "")
    .replace(/•/g, ",")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);
}

/**
 * Speak a line, cancelling anything already queued — Foresight speaks its
 * latest state, it does not backlog. No-op when voice is off/unsupported.
 */
export function speak(text: string): void {
  if (!isVoiceEnabled()) return;
  const clean = toSpeakable(text);
  if (!clean) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(clean);
  const voice = pickVoice();
  if (voice) utterance.voice = voice;
  utterance.rate = 1.04;
  utterance.pitch = 0.95;
  utterance.volume = 1;
  synth.speak(utterance);
}

export function stopSpeaking(): void {
  if (speechSupported) window.speechSynthesis.cancel();
}

// ── Voice input (dictation) ──────────────────────────────────────────

export interface Recognizer {
  start(): void;
  stop(): void;
}

export interface RecognizerCallbacks {
  /** Streaming partial transcript — update the input draft live. */
  onInterim: (text: string) => void;
  /** Final transcript for the utterance. */
  onFinal: (text: string) => void;
  /** Recognition ended (finished, error, or no speech). */
  onEnd: () => void;
}

export function createRecognizer(cb: RecognizerCallbacks): Recognizer | null {
  const Ctor = recognitionCtor();
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = navigator.language || "en-US";
  rec.continuous = false;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  rec.onresult = (event) => {
    let interim = "";
    let final = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const res = event.results[i];
      if (res.isFinal) final += res[0].transcript;
      else interim += res[0].transcript;
    }
    if (final.trim()) cb.onFinal(final.trim());
    else if (interim.trim()) cb.onInterim(interim.trim());
  };
  rec.onerror = () => cb.onEnd();
  rec.onend = () => cb.onEnd();

  return {
    start: () => {
      stopSpeaking(); // don't transcribe our own TTS
      try {
        rec.start();
      } catch {
        // start() throws if already running — harmless.
      }
    },
    stop: () => {
      try {
        rec.stop();
      } catch {
        cb.onEnd();
      }
    },
  };
}
