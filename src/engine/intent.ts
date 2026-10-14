// Semantic intent matching against `expected_semantic_intents` (spec §3.1).
// MVP approach: normalised token match with light stemming + synonyms + fuzzy match
// to tolerate child pronunciation errors in ASR output.
import { tokenize } from './fluency';
import type { LexicalTarget } from '../types';

/** Very light English-leaning stemmer: drinking→drink, eats→eat, buses→bus. */
export function stem(word: string): string {
  let w = word.toLowerCase();
  if (w.length > 5 && w.endsWith('ing')) {
    w = w.slice(0, -3);
    if (/(.)\1$/.test(w)) w = w.slice(0, -1); // running → run
    return w;
  }
  if (w.length > 4 && w.endsWith('es') && /(s|x|z|ch|sh)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2);
  return w;
}

export function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

/** True if a spoken token approximately equals a target word (tolerates 1 edit per 4 letters). */
export function fuzzyEquals(spoken: string, target: string): boolean {
  const s = stem(spoken);
  const t = stem(target);
  if (s === t) return true;
  if (t.length < 4) return false;
  return levenshtein(s, t) <= Math.floor(t.length / 4);
}

function containsPhrase(tokens: string[], phrase: string): boolean {
  const p = tokenize(phrase);
  if (!p.length) return false;
  if (p.length === 1) return tokens.some((t) => fuzzyEquals(t, p[0]));
  for (let i = 0; i + p.length <= tokens.length; i++) {
    if (p.every((w, k) => fuzzyEquals(tokens[i + k], w))) return true;
  }
  return false;
}

export function matchIntent(
  transcript: string,
  intents: string[],
  synonyms: Record<string, string[]> = {},
): string | null {
  const tokens = tokenize(transcript);
  if (!tokens.length) return null;
  for (const intent of intents) {
    const forms = [intent, ...(synonyms[intent] ?? [])];
    if (forms.some((f) => containsPhrase(tokens, f))) return intent;
  }
  return null;
}

export function findLexicalHits(transcript: string, targets: LexicalTarget[]): string[] {
  const tokens = tokenize(transcript);
  return targets
    .filter((t) => [t.lemma, ...(t.synonyms ?? [])].some((f) => containsPhrase(tokens, f)))
    .map((t) => t.lemma);
}
