// Spec §2.2 Fluency Evaluation: pauses > 800 ms, false starts, phrase repetitions.
import type { FluencyResult } from '../types';

export const LONG_PAUSE_MS = 800;

/** Count pauses longer than LONG_PAUSE_MS from a list of silence gaps (ms) inside an utterance. */
export function countLongPauses(gapsMs: number[]): number {
  return gapsMs.filter((g) => g > LONG_PAUSE_MS).length;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}'\s-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * False starts: a word fragment followed by the word it begins ("ele- elephant",
 * "e elephant") or a hyphen-cut token.
 */
export function countFalseStarts(tokens: string[]): number {
  let n = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.endsWith('-')) {
      n++;
      continue;
    }
    const next = tokens[i + 1];
    if (next && t.length < next.length && t.length <= 3 && next.startsWith(t) && t !== next) n++;
  }
  return n;
}

/** Repetitions: immediately repeated words ("the the") or repeated 2-word phrases. */
export function countRepetitions(tokens: string[]): number {
  let n = 0;
  for (let i = 1; i < tokens.length; i++) if (tokens[i] === tokens[i - 1]) n++;
  for (let i = 3; i < tokens.length; i++) {
    if (tokens[i - 3] === tokens[i - 1] && tokens[i - 2] === tokens[i] && tokens[i - 1] !== tokens[i]) n++;
  }
  return n;
}

/** Rough syllable estimate (vowel-group count) — language-agnostic fallback. */
export function countSyllables(tokens: string[]): number {
  let total = 0;
  for (const t of tokens) {
    const groups = t.match(/[aeiouyàâäéèêëîïôöùûüáíóúãõåæœɛɪʊəɔ]+/giu);
    let s = groups ? groups.length : 1;
    if (/[^aeiou]e$/i.test(t) && s > 1) s--; // silent final e (English)
    total += Math.max(1, s);
  }
  return total;
}

export function evaluateFluency(transcript: string, durationMs: number, pauseGapsMs: number[]): FluencyResult {
  const tokens = tokenize(transcript);
  const long_pauses = countLongPauses(pauseGapsMs);
  const false_starts = countFalseStarts(tokens);
  const repetitions = countRepetitions(tokens);
  const syllables = tokens.length ? countSyllables(tokens) : 0;
  const mora_rate = durationMs > 0 && syllables > 0 ? syllables / (durationMs / 1000) : null;
  if (!tokens.length) return { score: 0, long_pauses, false_starts, repetitions, syllables, mora_rate };
  const disfluencies = long_pauses + false_starts + repetitions;
  // Each disfluency per word costs fluency; floor at 0.
  const score = Math.max(0, 1 - disfluencies / Math.max(tokens.length, 2));
  return { score, long_pauses, false_starts, repetitions, syllables, mora_rate };
}
