import { END_OF_TURN_PAUSE_MS } from '../engine/vad';
// Speech & Language Services (spec §1.1, §4). Provider interfaces let the MVP's
// browser speech be swapped for production services (Conformer/XLSR ASR, neural TTS)
// without touching the engines or UI.

export interface RecognitionResult {
  transcript: string;
  confidence: number | null;
  /** ms since listen() was called; null if unknown */
  speechStartMs: number | null;
  speechEndMs: number | null;
}

export interface ASRProvider {
  readonly name: string;
  readonly available: boolean;
  /** Listen for one utterance. Resolves with an empty transcript on timeout/silence. */
  listen(opts: { locale: string; noSpeechTimeoutMs: number; maxUtteranceMs: number; signal?: AbortSignal }): Promise<RecognitionResult>;
}

export interface TTSProvider {
  readonly name: string;
  readonly available: boolean;
  speak(text: string, opts: { locale: string; rate?: number; pitch?: number }): Promise<void>;
  cancel(): void;
}

// ---------------------------------------------------------------------------
// Browser implementations (Web Speech API)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RecognitionCtor = new () => any;

function recognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export class BrowserASR implements ASRProvider {
  readonly name = 'Browser Web Speech API';
  get available(): boolean {
    return typeof window !== 'undefined' && recognitionCtor() !== null;
  }

  listen({ locale, noSpeechTimeoutMs, maxUtteranceMs, signal }: Parameters<ASRProvider['listen']>[0]): Promise<RecognitionResult> {
    const Ctor = recognitionCtor();
    if (!Ctor) return Promise.resolve({ transcript: '', confidence: null, speechStartMs: null, speechEndMs: null });
    return new Promise((resolve) => {
      const rec = new Ctor();
      rec.lang = locale;
      rec.interimResults = true;
      rec.continuous = true; // don't stop at the first short pause — we decide when the turn ends
      rec.maxAlternatives = 3;
      const t0 = performance.now();
      let speechStart: number | null = null;
      let speechEnd: number | null = null;
      let finalText = '';
      let interim = '';
      let confidence: number | null = null;
      let settled = false;

      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(noSpeechTimer);
        clearTimeout(maxTimer);
        clearTimeout(pauseTimer);
        try {
          rec.abort();
        } catch {
          /* already stopped */
        }
        resolve({
          transcript: (finalText || interim).trim(),
          confidence,
          speechStartMs: speechStart,
          speechEndMs: speechEnd ?? (speechStart != null ? performance.now() - t0 : null),
        });
      };

      // Pediatric wait-time (spec §5): give up if the child hasn't started speaking.
      const noSpeechTimer = setTimeout(() => {
        if (speechStart == null && !interim) finish();
      }, noSpeechTimeoutMs);
      const maxTimer = setTimeout(finish, maxUtteranceMs);
      // After the child starts talking, end the turn only after a real pause.
      let pauseTimer: ReturnType<typeof setTimeout> | undefined;
      const armPause = () => {
        clearTimeout(pauseTimer);
        pauseTimer = setTimeout(finish, END_OF_TURN_PAUSE_MS);
      };
      signal?.addEventListener('abort', finish);

      rec.onspeechstart = () => {
        if (speechStart == null) speechStart = performance.now() - t0;
      };
      rec.onspeechend = () => {
        speechEnd = performance.now() - t0;
      };
      rec.onresult = (e: any) => {
        if (speechStart == null) speechStart = performance.now() - t0;
        interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) {
            finalText += ' ' + r[0].transcript;
            confidence = typeof r[0].confidence === 'number' ? r[0].confidence : null;
          } else interim += r[0].transcript;
        }
        armPause();
      };
      rec.onerror = (e: any) => {
        // "no-speech"/"aborted" are normal on phones; onend decides. Anything else ends the turn.
        if (e?.error && e.error !== 'no-speech' && e.error !== 'aborted') finish();
      };
      rec.onend = () => {
        if (settled) return;
        // Android Chrome can stop listening early. If the child hasn't spoken yet and their
        // wait time isn't over, start listening again instead of giving up.
        if (speechStart == null && !interim && !finalText && performance.now() - t0 < noSpeechTimeoutMs - 250) {
          try {
            rec.start();
            return;
          } catch {
            /* fall through */
          }
        }
        finish();
      };
      try {
        rec.start();
      } catch {
        finish();
      }
    });
  }
}

export class BrowserTTS implements TTSProvider {
  readonly name = 'Browser SpeechSynthesis';
  get available(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  private pickVoice(locale: string): SpeechSynthesisVoice | null {
    const voices = window.speechSynthesis.getVoices();
    const base = locale.split('-')[0];
    return (
      voices.find((v) => v.lang === locale && /female|natural|samantha|google/i.test(v.name)) ??
      voices.find((v) => v.lang === locale) ??
      voices.find((v) => v.lang.replace('_', '-').startsWith(base)) ??
      null
    );
  }

  speak(text: string, { locale, rate = 0.9, pitch = 1.1 }: { locale: string; rate?: number; pitch?: number }): Promise<void> {
    if (!this.available || !text) return Promise.resolve();
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = locale;
      u.rate = rate;
      u.pitch = pitch;
      const v = this.pickVoice(locale);
      if (v) u.voice = v;
      // Safety timeout: some browsers never fire onend.
      const guard = setTimeout(resolve, 1500 + text.length * 90);
      u.onend = u.onerror = () => {
        clearTimeout(guard);
        resolve();
      };
      window.speechSynthesis.speak(u);
    });
  }

  cancel(): void {
    if (this.available) window.speechSynthesis.cancel();
  }
}
