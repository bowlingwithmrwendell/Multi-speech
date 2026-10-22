// Session orchestrator — the bidirectional conversational loop (spec §1):
// prompt (TTS) → listen (ASR + mic meter) → score (metrics, fluency, EWMA) →
// adapt (tier) → respond (dialog state) → next prompt.
import type { AttemptMetrics, AttemptRecord, ChildProfile, ContentModule } from '../types';
import { DialogStateManager, type DialogTurnResult } from './dialog';
import { attemptScore } from './adaptive';
import { evaluateFluency } from './fluency';
import { findLexicalHits } from './intent';
import { MIC_OPEN_DELAY_MS, vadWaitTimeMs } from './vad';
import { applyAttempt } from '../profile/profiles';
import type { ASRProvider, TTSProvider } from '../speech/providers';
import type { MeterReport } from '../audio/meter';
import { browserLocale } from '../speech/languages';

export interface MeterLike {
  readonly ready: boolean;
  start(): void;
  stop(): MeterReport;
}

export interface SessionDeps {
  asr: ASRProvider;
  tts: TTSProvider;
  meter: MeterLike | null;
  cdi: (lemma: string) => string;
  onProfile: (p: ChildProfile) => void;
  onAttempt: (r: AttemptRecord) => void;
  /** Called whenever the recognizer hears speech (drives the mic animation on tablets). */
  onHeard?: () => void;
  /** Called when the browser's recognizer reports an error that stopped listening. */
  onAsrError?: (error: string) => void;
}

export interface TurnOutcome {
  record: AttemptRecord;
  dialog: DialogTurnResult;
  /** Time from end of child speech to start of the app's spoken reply (spec §5, target < 850 ms). */
  responseLatencyMs: number | null;
}

export class ConversationSession {
  readonly dialog: DialogStateManager;
  profile: ChildProfile;
  private deps: SessionDeps;
  private abort: AbortController | null = null;
  private discardListen = false;

  constructor(profile: ChildProfile, module: ContentModule, deps: SessionDeps, itemIds?: string[]) {
    this.profile = profile;
    this.deps = deps;
    this.dialog = new DialogStateManager(module, profile.adaptive_tier, itemIds);
  }

  get locale(): string {
    return browserLocale(this.profile.target_language);
  }

  get waitWindowMs(): number {
    return vadWaitTimeMs(this.profile.chronological_age, this.profile.fluency_score_index);
  }

  say(text: string): Promise<void> {
    return this.deps.tts.speak(text, { locale: this.locale });
  }

  /** Speak the current node's prompt. */
  async prompt(): Promise<void> {
    const node = this.dialog.node;
    if (node) await this.say(node.tts_template);
  }

  stop(): void {
    this.discardListen = true;
    this.abort?.abort();
    this.deps.tts.cancel();
  }

  /** Abort an in-progress listen without scoring it (e.g. the parent typed an answer instead). */
  cancelListen(): void {
    this.discardListen = true;
    this.abort?.abort();
  }

  /** Listen for the child's answer via ASR, measuring the mic in parallel. */
  async listenTurn(): Promise<TurnOutcome | null> {
    if (!this.dialog.node) return null;
    this.abort = new AbortController();
    this.discardListen = false;
    await new Promise((r) => setTimeout(r, MIC_OPEN_DELAY_MS));
    if (this.discardListen) return null;
    const meter = this.deps.meter?.ready ? this.deps.meter : null;
    meter?.start();
    const res = await this.deps.asr.listen({
      locale: this.locale,
      noSpeechTimeoutMs: this.waitWindowMs,
      maxUtteranceMs: 15000,
      signal: this.abort.signal,
      onHeard: this.deps.onHeard,
    });
    const report = meter?.stop() ?? null;
    if (this.discardListen) return null;
    if (res.error) this.deps.onAsrError?.(res.error);
    const latency = report?.speechStartMs ?? res.speechStartMs;
    const start = report?.speechStartMs ?? res.speechStartMs;
    const end = report?.speechEndMs ?? res.speechEndMs;
    const metrics: AttemptMetrics = {
      transcript: res.transcript,
      utterance_latency_ms: latency != null ? Math.round(latency) : null,
      duration_ms: start != null && end != null ? Math.max(0, Math.round(end - start)) : 0,
      vocal_energy_dbfs: report?.meanDbfs ?? null,
      peak_energy_dbfs: report?.peakDbfs ?? null,
      long_pauses: 0,
      completion_ratio: res.transcript ? 1 : 0,
      asr_confidence: res.confidence,
    };
    return this.process(metrics, report?.gapsMs ?? []);
  }

  /** Typed / tapped answer path (no microphone, or parent practice mode). */
  submitText(text: string): Promise<TurnOutcome | null> {
    const metrics: AttemptMetrics = {
      transcript: text,
      utterance_latency_ms: null,
      duration_ms: 0,
      vocal_energy_dbfs: null,
      peak_energy_dbfs: null,
      long_pauses: 0,
      completion_ratio: text.trim() ? 1 : 0,
      asr_confidence: null,
    };
    return this.process(metrics, []);
  }

  private async process(metrics: AttemptMetrics, gaps: number[]): Promise<TurnOutcome | null> {
    const node = this.dialog.node;
    const nodeId = this.dialog.currentId;
    if (!node || !nodeId) return null;
    const tSpeechEnd = performance.now();
    const module = this.dialog.module;
    const fluency = evaluateFluency(metrics.transcript, metrics.duration_ms, gaps);
    metrics.long_pauses = fluency.long_pauses;
    const lexical_hits = findLexicalHits(metrics.transcript, module.lexical_targets);
    // Lexical targets that are valid answers for this node (e.g. "leaves" for the giraffe prompt).
    const intents = node.expected_semantic_intents.map((i) => i.toLowerCase());
    const relevantTargets = module.lexical_targets.filter((t) =>
      [t.lemma, ...(t.synonyms ?? [])].some((f) => intents.includes(f.toLowerCase())),
    );

    const dialog = this.dialog.respond(metrics.transcript);
    const score = attemptScore({
      intentMatched: dialog.matchedIntent != null,
      lexicalHits: lexical_hits.filter((h) => relevantTargets.some((t) => t.lemma === h)).length,
      lexicalExpected: Math.min(1, relevantTargets.length),
      metrics,
      fluency,
      waitWindowMs: this.waitWindowMs,
      wasScaffold: node.prompt_type === 'forced_choice_scaffold',
    });

    this.profile = applyAttempt(this.profile, {
      attemptScore: score,
      fluencyScore: fluency.score,
      moraRate: fluency.mora_rate,
      lexicalHits: lexical_hits,
      cdi: this.deps.cdi,
    });
    this.dialog.setTier(this.profile.adaptive_tier);
    this.deps.onProfile(this.profile);

    const record: AttemptRecord = {
      timestamp: new Date().toISOString(),
      profile_id: this.profile.profile_id,
      module_id: module.module_id,
      node_id: nodeId,
      prompt_type: node.prompt_type,
      metrics,
      fluency,
      matched_intent: dialog.matchedIntent,
      lexical_hits,
      attempt_score: Math.round(score * 1000) / 1000,
      score_after: Math.round(this.profile.adaptive_score * 1000) / 1000,
      tier_after: this.profile.adaptive_tier,
    };
    this.deps.onAttempt(record);
    const responseLatencyMs = Math.round(performance.now() - tSpeechEnd);
    return { record, dialog, responseLatencyMs };
  }
}
