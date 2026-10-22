// Ingress & signal processing (spec §1.1 / §4.1), MVP edition.
// Browser-side: mic capture with noise suppression + echo cancellation constraints,
// an energy-based VAD, and vocal-energy (dBFS) measurement for Verbal Attempt Metrics.
// Production replaces this with the server pipeline (VTLN, log-mel features, Conformer).

export interface MeterReport {
  speechStartMs: number | null;
  speechEndMs: number | null;
  meanDbfs: number | null;
  peakDbfs: number | null;
  /** Silence gaps (ms) between voiced segments inside the utterance. */
  gapsMs: number[];
}

const FRAME_MS = 30;

/**
 * Phones and tablets can't reliably share the microphone: while our level meter holds
 * an open mic stream, Chrome's speech recognizer often gets silence, so the child's
 * answer isn't heard even though the mic indicator moves. On these devices we only use
 * the meter to ask for permission, then hand the mic to the recognizer alone.
 */
export function micMustBeExclusive(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const iPadOS = /Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || iPadOS;
}

export class MicMeter {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private timer: number | null = null;
  private buf: Float32Array = new Float32Array(0);
  private t0 = 0;
  private noiseFloor = -60;
  private frames: { t: number; db: number; voiced: boolean }[] = [];
  onLevel: ((db: number, voiced: boolean) => void) | null = null;

  async init(): Promise<boolean> {
    if (this.stream) return true;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { noiseSuppression: true, echoCancellation: true, autoGainControl: false, channelCount: 1, sampleRate: 16000 },
      });
      this.ctx = new AudioContext();
      const src = this.ctx.createMediaStreamSource(this.stream);
      // High-pass ~80 Hz to drop rumble; children's F0 is well above this.
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 80;
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      src.connect(hp).connect(this.analyser);
      this.buf = new Float32Array(this.analyser.fftSize);
      return true;
    } catch {
      return false;
    }
  }

  get ready(): boolean {
    return !!this.analyser;
  }

  private frameDb(): number {
    if (!this.analyser) return -100;
    this.analyser.getFloatTimeDomainData(this.buf);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
    const rms = Math.sqrt(sum / this.buf.length);
    return rms > 0 ? 20 * Math.log10(rms) : -100;
  }

  /** Measure ambient noise for ~300 ms to set the VAD threshold. */
  async calibrate(): Promise<void> {
    if (!this.analyser) return;
    await this.ctx?.resume();
    const samples: number[] = [];
    for (let i = 0; i < 10; i++) {
      samples.push(this.frameDb());
      await new Promise((r) => setTimeout(r, FRAME_MS));
    }
    samples.sort((a, b) => a - b);
    this.noiseFloor = Math.max(-75, samples[Math.floor(samples.length / 2)]);
  }

  start(): void {
    if (!this.analyser) return;
    void this.ctx?.resume();
    this.frames = [];
    this.t0 = performance.now();
    const threshold = this.noiseFloor + 12;
    this.timer = window.setInterval(() => {
      const db = this.frameDb();
      const voiced = db > threshold;
      this.frames.push({ t: performance.now() - this.t0, db, voiced });
      this.onLevel?.(db, voiced);
    }, FRAME_MS);
  }

  stop(): MeterReport {
    if (this.timer != null) clearInterval(this.timer);
    this.timer = null;
    return analyzeFrames(this.frames);
  }

  dispose(): void {
    this.stop();
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close();
    this.stream = null;
    this.ctx = null;
    this.analyser = null;
  }
}

/** Pure analysis of meter frames — exported for unit tests. */
export function analyzeFrames(frames: { t: number; db: number; voiced: boolean }[]): MeterReport {
  // Require 3 consecutive voiced frames (~90 ms) to count as speech (debounce clicks).
  const segments: [number, number][] = [];
  let runStart = -1;
  let run = 0;
  let segStart = -1;
  let lastVoiced = -1;
  for (const f of frames) {
    if (f.voiced) {
      if (run === 0) runStart = f.t;
      run++;
      if (run === 3 && segStart < 0) segStart = runStart;
      if (run >= 3) lastVoiced = f.t;
    } else {
      if (segStart >= 0 && lastVoiced >= 0 && f.t - lastVoiced > 250) {
        segments.push([segStart, lastVoiced]);
        segStart = -1;
      }
      run = 0;
    }
  }
  if (segStart >= 0 && lastVoiced >= 0) segments.push([segStart, lastVoiced]);
  if (!segments.length) return { speechStartMs: null, speechEndMs: null, meanDbfs: null, peakDbfs: null, gapsMs: [] };
  const start = segments[0][0];
  const end = segments[segments.length - 1][1];
  const gapsMs = segments.slice(1).map((s, i) => s[0] - segments[i][1]);
  const voicedDb = frames.filter((f) => f.voiced && f.t >= start && f.t <= end).map((f) => f.db);
  const mean = voicedDb.length ? voicedDb.reduce((a, b) => a + b, 0) / voicedDb.length : null;
  const peak = voicedDb.length ? Math.max(...voicedDb) : null;
  const round = (n: number | null) => (n == null ? null : Math.round(n * 10) / 10);
  return { speechStartMs: start, speechEndMs: end, meanDbfs: round(mean), peakDbfs: round(peak), gapsMs };
}
