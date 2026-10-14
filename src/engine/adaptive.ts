// Spec §2.2 Adaptive Progress Tracking Engine.
// Score_t = α · AttemptScore + (1 − α) · Score_{t−1},  α = 0.15
import type { AdaptiveTier, AttemptMetrics, FluencyResult } from '../types';

export const EWMA_ALPHA = 0.15;

export function ewma(previous: number, attempt: number, alpha = EWMA_ALPHA): number {
  return clamp01(alpha * clamp01(attempt) + (1 - alpha) * clamp01(previous));
}

/** Tier thresholds on the 0..1 EWMA score. */
const TIER_THRESHOLDS: [number, AdaptiveTier][] = [
  [0.85, 'Level_5'],
  [0.7, 'Level_4'],
  [0.55, 'Level_3'],
  [0.35, 'Level_2'],
];

export function tierForScore(score: number): AdaptiveTier {
  for (const [min, tier] of TIER_THRESHOLDS) if (score >= min) return tier;
  return 'Level_1';
}

export function tierNumber(tier: AdaptiveTier): number {
  return Number(tier.split('_')[1]);
}

/** Starting EWMA score for a new profile, based on age (older → slightly higher start). */
export function initialScoreForAge(age: number): number {
  return clamp01(0.3 + (Math.min(Math.max(age, 2), 8) - 2) * 0.04);
}

export interface AttemptScoreInput {
  intentMatched: boolean;
  lexicalHits: number;
  lexicalExpected: number;
  metrics: AttemptMetrics;
  fluency: FluencyResult;
  waitWindowMs: number;
  wasScaffold: boolean;
}

/**
 * Composite attempt score (0..1) from the Verbal Attempt Metrics:
 *  - semantic intent match          45%
 *  - lexical target production      20%
 *  - response latency               15%  (faster within the wait window is better)
 *  - fluency                        10%
 *  - completion ratio               10%
 * Scaffolded (forced-choice) answers are capped at 0.75 so the tier only climbs
 * on open-ended success.
 */
export function attemptScore(i: AttemptScoreInput): number {
  if (!i.metrics.transcript.trim()) return 0;
  const intent = i.intentMatched ? 1 : 0;
  const lexical = i.lexicalExpected > 0 ? Math.min(1, i.lexicalHits / i.lexicalExpected) : intent;
  const lat = i.metrics.utterance_latency_ms;
  const latency = lat == null ? 0.5 : clamp01(1 - lat / Math.max(i.waitWindowMs * 2, 1));
  const score =
    0.45 * intent +
    0.2 * lexical +
    0.15 * latency +
    0.1 * i.fluency.score +
    0.1 * clamp01(i.metrics.completion_ratio);
  return i.wasScaffold ? Math.min(score, 0.75) : clamp01(score);
}

export function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}
