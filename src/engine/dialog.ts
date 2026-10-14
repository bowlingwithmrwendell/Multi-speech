// Dialog State Manager (spec §1.1 Core Engine & Orchestration).
// Walks a module's prompt tree, choosing open-ended vs scaffolded prompts by
// adaptive tier and falling back to scaffolds when a response misses.
import type { AdaptiveTier, ContentModule, PromptNode } from '../types';
import { matchIntent } from './intent';
import { tierNumber } from './adaptive';
import { fill, phrasesFor, type Phrases } from './phrases';

export type DialogPhase = 'prompting' | 'done';

export interface DialogTurnResult {
  outcome: 'success' | 'fallback' | 'retry' | 'modeled' | 'silence';
  /** A correct answer the child gave (null when wrong or not understood). */
  matchedIntent: string | null;
  /** A recognised but wrong answer, e.g. "fish" for the zebra. */
  wrongIntent?: string | null;
  /** What the app should say next (feedback + next prompt). */
  speech: string[];
  nodeId: string | null; // next node to prompt, null when the module is finished
}

export class DialogStateManager {
  readonly module: ContentModule;
  private tier: AdaptiveTier;
  currentId: string | null;
  private retries = 0;
  /** When we drop into a scaffold, where to resume afterwards. */
  private resumeAfterScaffold: string | null = null;
  readonly visited: string[] = [];
  readonly phrases: Phrases;

  /** When a round uses a picked subset of items, this maps each item to the next one. */
  private nextMap: Map<string, string | null> | null = null;
  readonly itemIds: string[];

  /**
   * @param itemIds optional list of item (open-ended) node ids to play, in order. Without it the
   *   module's own next_node chain is followed.
   */
  constructor(module: ContentModule, tier: AdaptiveTier, itemIds?: string[]) {
    this.module = module;
    this.tier = tier;
    this.phrases = phrasesFor(module.language);
    const ids = (itemIds ?? []).filter((id) => module.prompt_tree.nodes[id]);
    if (ids.length) {
      this.nextMap = new Map(ids.map((id, i) => [id, ids[i + 1] ?? null]));
      this.itemIds = ids;
    } else this.itemIds = listItems(module);
    this.currentId = this.entryNode(ids.length ? ids[0] : module.prompt_tree.root_id);
  }

  private nextOf(id: string | null, node: PromptNode): string | null {
    if (this.nextMap && id && this.nextMap.has(id)) return this.nextMap.get(id) ?? null;
    if (this.nextMap) return null; // scaffolds have no next of their own; resume handles them
    return node.next_node ?? null;
  }

  get node(): PromptNode | null {
    return this.currentId ? this.module.prompt_tree.nodes[this.currentId] ?? null : null;
  }

  get phase(): DialogPhase {
    return this.currentId ? 'prompting' : 'done';
  }

  setTier(tier: AdaptiveTier): void {
    this.tier = tier;
  }

  /** Level 1 children start directly on the scaffold (forced choice) for open-ended nodes. */
  private entryNode(id: string | undefined | null): string | null {
    if (!id) return null;
    const n = this.module.prompt_tree.nodes[id];
    if (!n) return null;
    if (tierNumber(this.tier) <= 1 && n.prompt_type === 'open_ended_conversational' && n.fallback_node) {
      this.resumeAfterScaffold = this.nextOf(id, n);
      return n.fallback_node;
    }
    return id;
  }

  private advanceFrom(node: PromptNode): string | null {
    const next = this.nextOf(this.currentId, node) ?? this.resumeAfterScaffold;
    this.resumeAfterScaffold = null;
    this.retries = 0;
    return this.entryNode(next);
  }

  /** Feed a transcript (empty string = silence / VAD timeout). */
  respond(transcript: string): DialogTurnResult {
    const node = this.node;
    if (!node || !this.currentId) {
      return { outcome: 'modeled', matchedIntent: null, speech: [], nodeId: null };
    }
    this.visited.push(this.currentId);
    const heard = matchIntent(transcript, node.expected_semantic_intents, node.intent_synonyms);
    const correct = node.correct_intents ?? node.expected_semantic_intents;
    const isRight = heard != null && correct.some((c) => c.toLowerCase() === heard.toLowerCase());

    if (heard && isRight) {
      const praise = fill(node.praise_template ?? this.phrases.defaultPraise, { intent: heard });
      this.currentId = this.advanceFrom(node);
      return { outcome: 'success', matchedIntent: heard, speech: [praise], nodeId: this.currentId };
    }
    const wrong = heard && !isRight ? heard : null;

    const silent = !transcript.trim();

    // Open-ended miss → drop to scaffold node.
    if (node.fallback_node && this.module.prompt_tree.nodes[node.fallback_node]) {
      this.resumeAfterScaffold = this.nextOf(this.currentId, node) ?? this.resumeAfterScaffold;
      this.currentId = node.fallback_node;
      this.retries = 0;
      return {
        outcome: silent ? 'silence' : 'fallback',
        matchedIntent: null,
        wrongIntent: wrong,
        speech: [silent ? this.phrases.silenceFallback : wrong ? this.phrases.wrongFallback : this.phrases.missFallback],
        nodeId: this.currentId,
      };
    }

    // No fallback: one retry, then model the answer and move on.
    if (this.retries < 1) {
      this.retries++;
      return {
        outcome: silent ? 'silence' : 'retry',
        matchedIntent: null,
        wrongIntent: wrong,
        speech: [silent ? this.phrases.silenceRetry : wrong ? this.phrases.wrongChoice : this.phrases.missRetry],
        nodeId: this.currentId,
      };
    }

    const model = correct[0];
    const isChoice = node.prompt_type === 'forced_choice_scaffold';
    this.currentId = this.advanceFrom(node);
    return {
      outcome: 'modeled',
      matchedIntent: null,
      wrongIntent: wrong,
      speech: [model ? fill(isChoice ? this.phrases.modeledChoice : this.phrases.modeled, { answer: model }) : this.phrases.modeledNoAnswer],
      nodeId: this.currentId,
    };
  }
}

/** The playable items of a module: open-ended nodes (scaffolds are reached through them). */
export function listItems(module: ContentModule): string[] {
  const nodes = module.prompt_tree.nodes;
  const scaffolds = new Set(Object.values(nodes).map((n) => n.fallback_node).filter(Boolean) as string[]);
  const order: string[] = [];
  const seen = new Set<string>();
  let id: string | undefined = module.prompt_tree.root_id;
  while (id && nodes[id] && !seen.has(id)) {
    seen.add(id);
    if (!scaffolds.has(id)) order.push(id);
    id = nodes[id].next_node;
  }
  for (const k of Object.keys(nodes)) if (!seen.has(k) && !scaffolds.has(k)) order.push(k);
  return order;
}
