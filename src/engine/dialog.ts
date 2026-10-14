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
  matchedIntent: string | null;
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

  constructor(module: ContentModule, tier: AdaptiveTier) {
    this.module = module;
    this.tier = tier;
    this.phrases = phrasesFor(module.language);
    this.currentId = this.entryNode(module.prompt_tree.root_id);
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
      this.resumeAfterScaffold = n.next_node ?? null;
      return n.fallback_node;
    }
    return id;
  }

  private advanceFrom(node: PromptNode): string | null {
    const next = node.next_node ?? this.resumeAfterScaffold;
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
    const matched = matchIntent(transcript, node.expected_semantic_intents, node.intent_synonyms);

    if (matched) {
      const praise = fill(node.praise_template ?? this.phrases.defaultPraise, { intent: matched });
      this.currentId = this.advanceFrom(node);
      return { outcome: 'success', matchedIntent: matched, speech: [praise], nodeId: this.currentId };
    }

    const silent = !transcript.trim();

    // Open-ended miss → drop to scaffold node.
    if (node.fallback_node && this.module.prompt_tree.nodes[node.fallback_node]) {
      this.resumeAfterScaffold = node.next_node ?? this.resumeAfterScaffold;
      this.currentId = node.fallback_node;
      this.retries = 0;
      return {
        outcome: silent ? 'silence' : 'fallback',
        matchedIntent: null,
        speech: [silent ? this.phrases.silenceFallback : this.phrases.missFallback],
        nodeId: this.currentId,
      };
    }

    // No fallback: one retry, then model the answer and move on.
    if (this.retries < 1) {
      this.retries++;
      return {
        outcome: silent ? 'silence' : 'retry',
        matchedIntent: null,
        speech: [silent ? this.phrases.silenceRetry : this.phrases.missRetry],
        nodeId: this.currentId,
      };
    }

    const model = node.expected_semantic_intents[0];
    this.currentId = this.advanceFrom(node);
    return {
      outcome: 'modeled',
      matchedIntent: null,
      speech: [model ? fill(this.phrases.modeled, { answer: model }) : this.phrases.modeledNoAnswer],
      nodeId: this.currentId,
    };
  }
}
