// Content Modular Registry (spec §3). Modules are declarative JSON — new domains
// load without changing engine code. Drop a new *.json file in ./modules.
import type { ContentModule, Domain } from '../types';

const DOMAINS: Domain[] = ['Animals', 'Tools', 'Everyday', 'Vehicles', 'Food', 'Learning', 'Body', 'Nature'];

export const DOMAIN_INFO: Record<Domain, { label: string; emoji: string; blurb: string }> = {
  Animals: { label: 'Animals & Ecosystems', emoji: '🦁', blurb: 'Animal names, sounds, habitats and actions' },
  Tools: { label: 'Tools & Objects', emoji: '🧰', blurb: 'What objects do and where they are' },
  Everyday: { label: 'Everyday Routines', emoji: '🌅', blurb: 'Food, clothing, home and feelings' },
  Vehicles: { label: 'Vehicles & Mobility', emoji: '🚒', blurb: 'Transport, direction, speed and size' },
  Food: { label: 'Food & Eating', emoji: '🍎', blurb: 'Fruits, vegetables and favourite foods' },
  Learning: { label: 'Colors & Shapes', emoji: '🎨', blurb: 'Color and shape names' },
  Body: { label: 'My Body', emoji: '👃', blurb: 'Body parts and what they do' },
  Nature: { label: 'Weather & Sky', emoji: '🌈', blurb: 'Weather, sky and seasons' },
};

export interface ValidationError {
  module_id: string;
  message: string;
}

export function validateModule(m: unknown): ValidationError[] {
  const errs: ValidationError[] = [];
  const mod = m as Partial<ContentModule>;
  const id = typeof mod?.module_id === 'string' ? mod.module_id : '(unknown)';
  const err = (message: string) => errs.push({ module_id: id, message });
  if (!mod || typeof mod !== 'object') return [{ module_id: id, message: 'not an object' }];
  if (!mod.module_id) err('missing module_id');
  if (!mod.title) err('missing title');
  if (!mod.domain || !DOMAINS.includes(mod.domain)) err(`invalid domain "${mod.domain}"`);
  if (!mod.target_age_group || !/^\d+-\d+$/.test(mod.target_age_group)) err('target_age_group must look like "3-5"');
  if (!mod.language) err('missing language');
  if (!Array.isArray(mod.lexical_targets)) err('lexical_targets must be an array');
  const tree = mod.prompt_tree;
  if (!tree || !tree.nodes || !tree.root_id) {
    err('prompt_tree requires root_id and nodes');
    return errs;
  }
  if (!tree.nodes[tree.root_id]) err(`root_id "${tree.root_id}" not found in nodes`);
  for (const [nid, n] of Object.entries(tree.nodes)) {
    if (!n.tts_template) err(`${nid}: missing tts_template`);
    if (!Array.isArray(n.expected_semantic_intents) || !n.expected_semantic_intents.length)
      err(`${nid}: expected_semantic_intents must be a non-empty array`);
    for (const ref of [n.fallback_node, n.next_node]) {
      if (ref && !tree.nodes[ref]) err(`${nid}: references missing node "${ref}"`);
    }
  }
  return errs;
}

export function parseAgeGroup(group: string): [number, number] {
  const [a, b] = group.split('-').map(Number);
  return [a, b];
}

export class ContentRegistry {
  private modules = new Map<string, ContentModule>();
  readonly errors: ValidationError[] = [];

  register(m: unknown): boolean {
    const errs = validateModule(m);
    if (errs.length) {
      this.errors.push(...errs);
      return false;
    }
    const mod = m as ContentModule;
    this.modules.set(mod.module_id, mod);
    return true;
  }

  get(id: string): ContentModule | undefined {
    return this.modules.get(id);
  }

  all(): ContentModule[] {
    return [...this.modules.values()];
  }

  /** Modules for a language, sorted so age-appropriate ones come first. */
  forProfile(language: string, age: number): ContentModule[] {
    return this.all()
      .filter((m) => m.language === language)
      .sort((a, b) => fitRank(a, age) - fitRank(b, age) || a.title.localeCompare(b.title));
  }
}

function fitRank(m: ContentModule, age: number): number {
  const [lo, hi] = parseAgeGroup(m.target_age_group);
  if (age >= lo && age <= hi + 1) return 0;
  return Math.min(Math.abs(age - lo), Math.abs(age - hi));
}

/** Loads every JSON file in ./modules at build time (Vite glob import). */
export function createDefaultRegistry(): ContentRegistry {
  const reg = new ContentRegistry();
  const files = import.meta.glob('./modules/*.json', { eager: true, import: 'default' });
  for (const mod of Object.values(files)) reg.register(mod);
  if (reg.errors.length) console.warn('Content validation errors', reg.errors);
  return reg;
}
