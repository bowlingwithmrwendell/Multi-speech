// Shared data models — mirrors §2.1 (profile schema) and §3.1 (content schema) of the
// MultiPlay Speech Technical Specifications.

/** Spec §2.1 `adaptive_tier` — system-calculated difficulty level. */
export type AdaptiveTier = 'Level_1' | 'Level_2' | 'Level_3' | 'Level_4' | 'Level_5';

/** Spec §2.1 User Profile Schema. */
export interface ChildProfile {
  profile_id: string; // UUIDv4
  display_name: string; // first name / nickname only (COPPA data minimisation)
  chronological_age: number; // decimal years, e.g. 4.5
  target_language: string; // ISO / BCP-47 code, e.g. "en-US"
  phonetic_target_set: string[]; // IPA phonemes, e.g. ["/s/", "/r/"]
  baseline_mora_rate: number; // syllables/sec
  fluency_score_index: number; // rolling composite 0..1
  adaptive_score: number; // EWMA score 0..1 (spec §2.2)
  adaptive_tier: AdaptiveTier;
  vocabulary_acquired: Record<string, VocabEntry>; // lemma -> entry
  created_at: string;
  updated_at: string;
}

export interface VocabEntry {
  lemma: string;
  cdi_category: string;
  first_produced: string;
  times_produced: number;
}

/** Spec §3.1 lexical target. */
export interface LexicalTarget {
  lemma: string;
  ipa: string;
  difficulty_tier: number; // 1..5
  synonyms?: string[];
  cdi_category?: string;
}

export type PromptType =
  | 'open_ended_conversational'
  | 'forced_choice_scaffold'
  | 'imitation'
  | 'naming';

/** Spec §3.1 prompt-tree node (with additive MVP fields). */
export interface PromptNode {
  prompt_type: PromptType;
  tts_template: string;
  expected_semantic_intents: string[];
  fallback_node?: string;
  /** MVP extension: node to advance to after a successful response. */
  next_node?: string;
  /** MVP extension: image shown with the prompt (path under /public). */
  image?: string;
  /** MVP extension: emoji shown if the image is missing. */
  emoji?: string;
  /** MVP extension: spoken after a successful response. */
  praise_template?: string;
  /** MVP extension: synonyms per intent, e.g. { drinking: ["drink", "sip"] }. */
  intent_synonyms?: Record<string, string[]>;
  /**
   * Which of `expected_semantic_intents` are right answers. Any other expected intent is a
   * recognised wrong answer (e.g. "fish" in "Is it a zebra, or a fish?"). Omit = all are right.
   */
  correct_intents?: string[];
  /** Habitat / setting drawn behind the picture (see src/ui/scene.ts). */
  scene?: string;
  /** How the picture moves in the scene (see src/ui/scene.ts). */
  motion?: string;
  /** Extra pictures the prompt talks about, e.g. the little car next to the bus. */
  companions?: Companion[];
}

export interface Companion {
  emoji: string;
  image?: string;
  alt?: string;
  motion?: string;
  scale?: number; // size relative to the main picture
  delay?: number; // seconds ahead in the motion loop
  x?: number; // fixed position (% from left) for non-travelling motions
  y?: number; // raise/lower (% of scene height)
}

export type Domain = 'Animals' | 'Tools' | 'Everyday' | 'Vehicles' | 'Food' | 'Learning' | 'Body' | 'Nature';

/** Spec §3.1 content module. */
export interface ContentModule {
  $schema?: string;
  module_id: string;
  title: string;
  domain: Domain;
  target_age_group: string; // "3-5"
  language: string; // base language, e.g. "en"
  cover_image?: string;
  cover_emoji?: string;
  lexical_targets: LexicalTarget[];
  prompt_tree: {
    root_id: string;
    nodes: Record<string, PromptNode>;
  };
}

/** Spec §2.2 Verbal Attempt Metrics. */
export interface AttemptMetrics {
  transcript: string;
  utterance_latency_ms: number | null; // prompt end -> speech start
  duration_ms: number; // speech start -> speech end
  vocal_energy_dbfs: number | null; // mean dBFS while speaking
  peak_energy_dbfs: number | null;
  long_pauses: number; // pauses > 800 ms (spec §2.2)
  completion_ratio: number; // 0..1, did the child finish a response
  asr_confidence: number | null;
}

export interface FluencyResult {
  score: number; // 0..1
  long_pauses: number;
  false_starts: number;
  repetitions: number;
  syllables: number;
  mora_rate: number | null; // syllables/sec
}

export interface AttemptRecord {
  timestamp: string;
  profile_id: string;
  module_id: string;
  node_id: string;
  prompt_type: PromptType;
  metrics: AttemptMetrics;
  fluency: FluencyResult;
  matched_intent: string | null;
  lexical_hits: string[];
  attempt_score: number;
  score_after: number;
  tier_after: AdaptiveTier;
}
