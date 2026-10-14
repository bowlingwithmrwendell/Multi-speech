// Profile engine (spec §2.1). MVP persistence is on-device only (localStorage):
// no child data leaves the browser, which keeps the demo inside COPPA data-minimisation
// expectations. A server-side store must add parental consent + encryption (see README).
import type { AttemptRecord, ChildProfile, VocabEntry } from '../types';
import { ewma, initialScoreForAge, tierForScore } from '../engine/adaptive';

const KEY = 'multiplay.profiles.v1';

export interface NewProfileInput {
  display_name: string;
  chronological_age: number;
  target_language: string;
  phonetic_target_set?: string[];
}

export function uuidv4(): string {
  const c = globalThis.crypto as Crypto;
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function createProfile(input: NewProfileInput): ChildProfile {
  const age = Math.round(Math.min(Math.max(input.chronological_age, 1.5), 12) * 10) / 10;
  const score = initialScoreForAge(age);
  const now = new Date().toISOString();
  return {
    profile_id: uuidv4(),
    display_name: input.display_name.trim().slice(0, 30) || 'Friend',
    chronological_age: age,
    target_language: input.target_language,
    phonetic_target_set: input.phonetic_target_set ?? [],
    baseline_mora_rate: 0,
    fluency_score_index: 0.5,
    adaptive_score: score,
    adaptive_tier: tierForScore(score),
    vocabulary_acquired: {},
    created_at: now,
    updated_at: now,
  };
}

/** Apply one scored attempt to a profile (pure — returns a new object). */
export function applyAttempt(
  p: ChildProfile,
  a: { attemptScore: number; fluencyScore: number; moraRate: number | null; lexicalHits: string[]; cdi: (lemma: string) => string },
): ChildProfile {
  const adaptive_score = ewma(p.adaptive_score, a.attemptScore);
  const fluency_score_index = a.fluencyScore > 0 ? ewma(p.fluency_score_index, a.fluencyScore) : p.fluency_score_index;
  let baseline_mora_rate = p.baseline_mora_rate;
  if (a.moraRate && a.moraRate > 0 && a.moraRate < 12) {
    baseline_mora_rate = baseline_mora_rate > 0 ? ewma(baseline_mora_rate / 12, a.moraRate / 12) * 12 : a.moraRate;
  }
  const now = new Date().toISOString();
  const vocabulary_acquired: Record<string, VocabEntry> = { ...p.vocabulary_acquired };
  for (const lemma of a.lexicalHits) {
    const prev = vocabulary_acquired[lemma];
    vocabulary_acquired[lemma] = prev
      ? { ...prev, times_produced: prev.times_produced + 1 }
      : { lemma, cdi_category: a.cdi(lemma), first_produced: now, times_produced: 1 };
  }
  return {
    ...p,
    adaptive_score,
    adaptive_tier: tierForScore(adaptive_score),
    fluency_score_index,
    baseline_mora_rate: Math.round(baseline_mora_rate * 100) / 100,
    vocabulary_acquired,
    updated_at: now,
  };
}

// ---- persistence -------------------------------------------------------------

let memory: ChildProfile[] | null = null;

export function loadProfiles(): ChildProfile[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as ChildProfile[];
  } catch {
    /* storage unavailable */
  }
  return memory ?? [];
}

export function saveProfiles(list: ChildProfile[]): void {
  memory = list;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable — keep in memory */
  }
}

export function upsertProfile(p: ChildProfile): void {
  const list = loadProfiles().filter((x) => x.profile_id !== p.profile_id);
  saveProfiles([...list, p]);
}

export function deleteProfile(id: string): void {
  saveProfiles(loadProfiles().filter((x) => x.profile_id !== id));
}

export type { AttemptRecord };
