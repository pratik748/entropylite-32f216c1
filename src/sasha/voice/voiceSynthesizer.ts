/**
 * SASHA Executive Voice Synthesis Kernel
 *
 * Designed specifically for high-density quantitative finance:
 * - Natural pronunciation overrides for tickers, financial jargon, and Greek letters
 * - Calibrated rate (1.06x) and pitch (0.96x) for decisive, calm executive demeanor
 * - Real-time speech event hooks for audio visualizer sync
 */

export interface SpeechCallbacks {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (err: any) => void;
}

const PHONETIC_DICTIONARY: Array<[RegExp, string]> = [
  [/\bNVDA\b/gi, "NVIDIA"],
  [/\bAAPL\b/gi, "Apple"],
  [/\bMSFT\b/gi, "Microsoft"],
  [/\bTSLA\b/gi, "Tesla"],
  [/\bHDFCBANK\.NS\b/gi, "H D F C Bank"],
  [/\bRELIANCE\.NS\b/gi, "Reliance"],
  [/\bTCS\.NS\b/gi, "T C S"],
  [/\bVaR\b/gi, "V-A-R"],
  [/\bCVaR\b/gi, "C-V-A-R"],
  [/\bPnL\b/gi, "P and L"],
  [/\bbps\b/gi, "basis points"],
  [/\bσ\b/g, "sigma"],
  [/\bμ\b/g, "mu"],
  [/\bEV\b/gi, "expected value"],
  [/\b1d\b/gi, "one day"],
  [/\b95%\b/g, "ninety five percent"],
  [/\b99%\b/g, "ninety nine percent"],
  [/\bstat-arb\b/gi, "statistical arbitrage"],
  [/\bstat arb\b/gi, "statistical arbitrage"]
];

function phoneticSanitize(text: string): string {
  let result = text;
  for (const [regex, replacement] of PHONETIC_DICTIONARY) {
    result = result.replace(regex, replacement);
  }
  return result;
}

export class SashaSpeaker {
  private synth: SpeechSynthesis | null = null;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private isSpeakingInternal = false;

  constructor() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      this.synth = window.speechSynthesis;
    }
  }

  public isAvailable(): boolean {
    return this.synth !== null;
  }

  public isSpeaking(): boolean {
    return this.isSpeakingInternal;
  }

  public speak(rawText: string, callbacks?: SpeechCallbacks): void {
    if (!this.synth) {
      callbacks?.onEnd?.();
      return;
    }

    this.stop();

    const sanitized = phoneticSanitize(rawText);
    const utterance = new SpeechSynthesisUtterance(sanitized);

    // Pick top natural voice
    const voices = this.synth.getVoices();
    const englishVoices = voices.filter(v => v.lang.toLowerCase().startsWith("en"));
    
    // Prioritize natural / Siri / Google neural voices
    const preferred = englishVoices.find(v => {
      const name = v.name.toLowerCase();
      return name.includes("natural") || name.includes("siri") || name.includes("google") || name.includes("samantha");
    }) || englishVoices[0];

    if (preferred) utterance.voice = preferred;

    utterance.rate = 1.05;   // Crisp, decisive speed
    utterance.pitch = 0.96;  // Measured, mature executive frequency
    utterance.volume = 1.0;

    utterance.onstart = () => {
      this.isSpeakingInternal = true;
      callbacks?.onStart?.();
    };

    utterance.onend = () => {
      this.isSpeakingInternal = false;
      this.currentUtterance = null;
      callbacks?.onEnd?.();
    };

    utterance.onerror = (e) => {
      this.isSpeakingInternal = false;
      this.currentUtterance = null;
      callbacks?.onError?.(e);
    };

    this.currentUtterance = utterance;
    this.synth.speak(utterance);
  }

  public stop(): void {
    if (this.synth) {
      this.synth.cancel();
      this.isSpeakingInternal = false;
      this.currentUtterance = null;
    }
  }
}

export const sashaSpeaker = new SashaSpeaker();
