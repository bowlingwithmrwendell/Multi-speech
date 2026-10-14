// Pediatric Analytics & Logging (spec §1.1). On-device attempt log with export.
import type { AttemptRecord } from '../types';

const KEY = 'multiplay.attempts.v1';
const MAX_RECORDS = 5000;
let memory: AttemptRecord[] = [];

export function loadAttempts(profileId?: string): AttemptRecord[] {
  let all: AttemptRecord[] = memory;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) all = JSON.parse(raw);
  } catch {
    /* storage unavailable */
  }
  return profileId ? all.filter((a) => a.profile_id === profileId) : all;
}

export function logAttempt(rec: AttemptRecord): void {
  const all = [...loadAttempts(), rec].slice(-MAX_RECORDS);
  memory = all;
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* keep in memory */
  }
}

export function clearAttempts(profileId: string): void {
  const rest = loadAttempts().filter((a) => a.profile_id !== profileId);
  memory = rest;
  try {
    localStorage.setItem(KEY, JSON.stringify(rest));
  } catch {
    /* ignore */
  }
}

export interface ProgressSummary {
  attempts: number;
  successRate: number;
  avgLatencyMs: number | null;
  avgDbfs: number | null;
  longPauses: number;
  falseStarts: number;
  repetitions: number;
  scoreHistory: number[];
  sessions: number;
}

export function summarize(records: AttemptRecord[]): ProgressSummary {
  const n = records.length;
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const lat = records.map((r) => r.metrics.utterance_latency_ms).filter((x): x is number => x != null);
  const db = records.map((r) => r.metrics.vocal_energy_dbfs).filter((x): x is number => x != null);
  const days = new Set(records.map((r) => r.timestamp.slice(0, 10)));
  return {
    attempts: n,
    successRate: n ? records.filter((r) => r.matched_intent).length / n : 0,
    avgLatencyMs: avg(lat),
    avgDbfs: avg(db),
    longPauses: records.reduce((s, r) => s + r.fluency.long_pauses, 0),
    falseStarts: records.reduce((s, r) => s + r.fluency.false_starts, 0),
    repetitions: records.reduce((s, r) => s + r.fluency.repetitions, 0),
    scoreHistory: records.map((r) => r.score_after),
    sessions: days.size,
  };
}

export function exportJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
