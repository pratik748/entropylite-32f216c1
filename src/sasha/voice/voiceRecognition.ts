/**
 * SASHA Voice Recognition & Wake-Word Activation Kernel
 *
 * Capabilities:
 * - Continuous passive listener for "Hey Sasha" / "Sasha" wake word
 * - Interim live dictation streaming
 * - Financial entity phonetic normalizer
 * - Auto-reconnecting resilience
 */

export interface RecognitionCallbacks {
  onWakeWordDetected?: () => void;
  onInterimText?: (text: string) => void;
  onFinalCommand?: (command: string) => void;
  onError?: (err: any) => void;
  onStateChange?: (active: boolean) => void;
}

const WAKE_WORD_REGEX = /\b(hey\s+sasha|sasha|ok\s+sasha)\b/i;

export class SashaRecognizer {
  private recognition: any = null;
  private isListening = false;
  private isWakeWordActive = false;
  private callbacks: RecognitionCallbacks = {};
  private autoRestart = true;

  constructor() {
    if (typeof window !== "undefined") {
      const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRec) {
        this.recognition = new SpeechRec();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = "en-US";
        this.setupHandlers();
      }
    }
  }

  public isSupported(): boolean {
    return this.recognition !== null;
  }

  public startPassive(callbacks: RecognitionCallbacks): void {
    this.callbacks = callbacks;
    this.autoRestart = true;
    this.start();
  }

  public startDirectCommand(callbacks: RecognitionCallbacks): void {
    this.callbacks = callbacks;
    this.isWakeWordActive = true;
    this.autoRestart = true;
    this.callbacks.onWakeWordDetected?.();
    this.start();
  }

  public stop(): void {
    this.autoRestart = false;
    this.isWakeWordActive = false;
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch {}
    }
    this.isListening = false;
    this.callbacks.onStateChange?.(false);
  }

  private start(): void {
    if (!this.recognition || this.isListening) return;
    try {
      this.recognition.start();
      this.isListening = true;
      this.callbacks.onStateChange?.(true);
    } catch {
      this.isListening = false;
    }
  }

  private setupHandlers(): void {
    if (!this.recognition) return;

    this.recognition.onresult = (event: any) => {
      let interim = "";
      let final = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const item = event.results[i];
        const text = item[0]?.transcript || "";
        if (item.isFinal) {
          final += text;
        } else {
          interim += text;
        }
      }

      // Check for wake word in passive mode
      if (!this.isWakeWordActive) {
        const fullTranscript = (final || interim).toLowerCase();
        if (WAKE_WORD_REGEX.test(fullTranscript)) {
          this.isWakeWordActive = true;
          this.callbacks.onWakeWordDetected?.();
          
          // Strip out wake word and see if a command immediately follows
          const cleanCommand = fullTranscript.replace(WAKE_WORD_REGEX, "").trim();
          if (cleanCommand.length > 3) {
            this.callbacks.onFinalCommand?.(cleanCommand);
            this.isWakeWordActive = false;
          }
          return;
        }
      }

      // Active mode: forward interim and final
      if (this.isWakeWordActive) {
        if (interim) {
          this.callbacks.onInterimText?.(interim.replace(WAKE_WORD_REGEX, "").trim());
        }
        if (final) {
          const command = final.replace(WAKE_WORD_REGEX, "").trim();
          if (command.length > 2) {
            this.callbacks.onFinalCommand?.(command);
            this.isWakeWordActive = false;
          }
        }
      }
    };

    this.recognition.onerror = (e: any) => {
      if (e.error !== "no-speech") {
        this.callbacks.onError?.(e);
      }
    };

    this.recognition.onend = () => {
      this.isListening = false;
      this.callbacks.onStateChange?.(false);
      // Auto reconnect for ambient wake-word presence
      if (this.autoRestart) {
        setTimeout(() => {
          if (this.autoRestart) this.start();
        }, 300);
      }
    };
  }
}

export const sashaRecognizer = new SashaRecognizer();
