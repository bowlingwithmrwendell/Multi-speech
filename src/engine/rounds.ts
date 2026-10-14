// Round builder: picks which pictures to play this time.
// - Each round is a random mix from the pack, so replays feel new.
// - Pictures the child missed recently come back first (spaced repetition, lite).
// - Pictures never tried yet are favoured over ones already answered correctly.
import type { AttemptRecord, ContentModule } from '../types';
import { listItems } from './dialog';

export const ROUND_SIZE = 5;

export interface ItemStats {
  id: string;
  tries: number;
  /** True when the most recent time this picture came up ended without a right answer. */
  lastMissed: boolean;
  lastSeen: string | null; // ISO timestamp
}

/** Summarise past attempts per item (an item = its open question + its either/or question). */
export function itemStats(module: ContentModule, attempts: AttemptRecord[]): ItemStats[] {
  const nodes = module.prompt_tree.nodes;
  const items = listItems(module);
  const owner = new Map<string, string>();
  for (const id of items) {
    owner.set(id, id);
    const fb = nodes[id]?.fallback_node;
    if (fb) owner.set(fb, id);
  }
  const mine = attempts.filter((a) => a.module_id === module.module_id && owner.has(a.node_id));
  return items.map((id) => {
    const recs = mine.filter((a) => owner.get(a.node_id) === id).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    if (!recs.length) return { id, tries: 0, lastMissed: false, lastSeen: null };
    // The last "visit" to this picture is the run of records since the previous visit's success.
    const last = recs[recs.length - 1];
    return { id, tries: recs.length, lastMissed: !last.matched_intent, lastSeen: last.timestamp };
  });
}

/** Choose this round's pictures, in play order. `rand` is injectable for tests. */
export function pickRound(
  module: ContentModule,
  attempts: AttemptRecord[],
  size = ROUND_SIZE,
  rand: () => number = Math.random,
): string[] {
  const stats = itemStats(module, attempts);
  if (stats.length <= size) return shuffle(stats.map((s) => s.id), rand);

  // 1) Up to 2 recently missed pictures always come back.
  const missed = stats.filter((s) => s.lastMissed).sort((a, b) => (b.lastSeen ?? '').localeCompare(a.lastSeen ?? ''));
  const chosen = missed.slice(0, Math.min(2, size)).map((s) => s.id);

  // 2) Fill the rest by weighted random: new pictures > other missed > already known.
  const pool = stats.filter((s) => !chosen.includes(s.id));
  while (chosen.length < size && pool.length) {
    const weights = pool.map((s) => (s.lastMissed ? 3 : s.tries === 0 ? 2.5 : 1));
    const total = weights.reduce((a, b) => a + b, 0);
    let r = rand() * total;
    let i = 0;
    while (i < pool.length - 1 && (r -= weights[i]) > 0) i++;
    chosen.push(pool[i].id);
    pool.splice(i, 1);
  }
  return shuffle(chosen, rand);
}

function shuffle<T>(xs: T[], rand: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
