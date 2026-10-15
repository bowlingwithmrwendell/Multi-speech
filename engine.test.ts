import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { attemptScore, ewma, EWMA_ALPHA, tierForScore } from '../src/engine/adaptive';
import { countFalseStarts, countRepetitions, evaluateFluency, tokenize } from '../src/engine/fluency';
import { vadWaitTimeMs, VAD_MAX_MS, VAD_MIN_MS } from '../src/engine/vad';
import { findLexicalHits, fuzzyEquals, matchIntent, stem } from '../src/engine/intent';
import { DialogStateManager, listItems } from '../src/engine/dialog';
import { pickRound, itemStats } from '../src/engine/rounds';
import { SCENE_NAMES, MOTIONS } from '../src/ui/scene';
import { ContentRegistry, validateModule } from '../src/content/registry';
import { analyzeFrames } from '../src/audio/meter';
import { applyAttempt, createProfile } from '../src/profile/profiles';
import savannah from '../src/content/modules/mod_fauna_savannah_001.json';
import type { ContentModule } from '../src/types';
import { readdirSync, readFileSync } from 'node:fs';

const mod = savannah as unknown as ContentModule;

describe('adaptive engine (spec 2.2)', () => {
  it('uses alpha 0.15', () => {
    expect(EWMA_ALPHA).toBe(0.15);
    expect(ewma(0.5, 1)).toBeCloseTo(0.15 * 1 + 0.85 * 0.5);
    expect(ewma(0.5, 0)).toBeCloseTo(0.425);
  });
  it('clamps inputs', () => {
    expect(ewma(2, 5)).toBe(1);
    expect(ewma(-1, -1)).toBe(0);
  });
  it('maps score to tiers', () => {
    expect(tierForScore(0.1)).toBe('Level_1');
    expect(tierForScore(0.4)).toBe('Level_2');
    expect(tierForScore(0.6)).toBe('Level_3');
    expect(tierForScore(0.75)).toBe('Level_4');
    expect(tierForScore(0.9)).toBe('Level_5');
  });
  it('scores silence as zero and caps scaffold answers', () => {
    const base = {
      intentMatched: true, lexicalHits: 1, lexicalExpected: 1, waitWindowMs: 2000,
      fluency: { score: 1, long_pauses: 0, false_starts: 0, repetitions: 0, syllables: 3, mora_rate: 3 },
      metrics: { transcript: 'drinking', utterance_latency_ms: 300, duration_ms: 800, vocal_energy_dbfs: -20, peak_energy_dbfs: -10, long_pauses: 0, completion_ratio: 1, asr_confidence: 0.9 },
    };
    expect(attemptScore({ ...base, wasScaffold: false })).toBeGreaterThan(0.9);
    expect(attemptScore({ ...base, wasScaffold: true })).toBe(0.75);
    expect(attemptScore({ ...base, wasScaffold: false, metrics: { ...base.metrics, transcript: '' } })).toBe(0);
  });
});

describe('fluency (spec 2.2)', () => {
  it('counts pauses over 800ms', () => {
    expect(evaluateFluency('the elephant is drinking', 2000, [500, 900, 1200]).long_pauses).toBe(2);
  });
  it('detects false starts and repetitions', () => {
    expect(countFalseStarts(tokenize('e elephant'))).toBe(1);
    expect(countFalseStarts(tokenize('ele- elephant'))).toBe(1);
    expect(countRepetitions(tokenize('the the elephant'))).toBe(1);
    expect(countRepetitions(tokenize('big cat big cat'))).toBe(1);
  });
  it('computes mora rate', () => {
    const f = evaluateFluency('elephant', 1000, []);
    expect(f.syllables).toBe(3);
    expect(f.mora_rate).toBeCloseTo(3);
    expect(f.score).toBe(1);
  });
});

describe('VAD wait-time (spec 5)', () => {
  it('stays within 1.2s–2.8s', () => {
    for (const age of [1, 3, 5, 8, 12]) for (const fl of [0, 0.5, 1]) {
      const ms = vadWaitTimeMs(age, fl);
      expect(ms).toBeGreaterThanOrEqual(VAD_MIN_MS);
      expect(ms).toBeLessThanOrEqual(VAD_MAX_MS);
    }
  });
  it('gives younger, less fluent children more time', () => {
    expect(vadWaitTimeMs(3, 0)).toBe(VAD_MAX_MS);
    expect(vadWaitTimeMs(8, 1)).toBe(VAD_MIN_MS);
    expect(vadWaitTimeMs(4, 0.3)).toBeGreaterThan(vadWaitTimeMs(7, 0.9));
  });
});

describe('intent matching', () => {
  it('stems and fuzzes', () => {
    expect(stem('drinking')).toBe('drink');
    expect(stem('running')).toBe('run');
    expect(fuzzyEquals('elefant', 'elephant')).toBe(true);
    expect(fuzzyEquals('cat', 'car')).toBe(false);
  });
  it('matches intents with synonyms and phrases', () => {
    expect(matchIntent('he is drinking water', ['eating', 'drinking'])).toBe('drinking');
    expect(matchIntent('splash!', ['spraying'], { spraying: ['splash'] })).toBe('spraying');
    expect(matchIntent('a fire truck', ['fire truck'])).toBe('fire truck');
    expect(matchIntent('banana', ['drinking'])).toBeNull();
  });
  it('finds lexical targets', () => {
    expect(findLexicalHits('the elephant drinks', mod.lexical_targets)).toEqual(expect.arrayContaining(['elephant', 'drinking']));
  });
});

describe('dialog state manager', () => {
  it('advances on success, falls back to scaffold on miss, resumes after scaffold', () => {
    const d = new DialogStateManager(mod, 'Level_3');
    expect(d.currentId).toBe('elephant');
    const miss = d.respond('banana');
    expect(miss.outcome).toBe('fallback');
    expect(d.currentId).toBe('elephant_choice');
    const ok = d.respond('drinking');
    expect(ok.outcome).toBe('success');
    expect(d.currentId).toBe('lion');
    expect(d.respond('roar').outcome).toBe('success');
    expect(d.currentId).toBe('giraffe');
  });
  it('Level_1 starts on scaffolds', () => {
    const d = new DialogStateManager(mod, 'Level_1');
    expect(d.currentId).toBe('elephant_choice');
    d.respond('drinking');
    expect(d.currentId).toBe('lion_choice');
  });
  it('does not praise the wrong choice (zebra vs fish)', () => {
    const d = new DialogStateManager(mod, 'Level_3');
    for (const a of ['drinking', 'roar', 'leaves']) d.respond(a);
    expect(d.currentId).toBe('zebra');
    const cow = d.respond('a cow');
    expect(cow.outcome).toBe('fallback');
    expect(d.currentId).toBe('zebra_choice');
    const fish = d.respond('fish');
    expect(fish.outcome).toBe('retry');
    expect(fish.matchedIntent).toBeNull();
    expect(fish.wrongIntent).toBe('fish');
    expect(fish.speech.join(' ')).not.toMatch(/nice|great|yes/i);
    const again = d.respond('fish');
    expect(again.outcome).toBe('modeled');
    expect(again.speech[0]).toContain('zebra');
    expect(d.currentId).toBe('hippo');
  });
  it('treats "horse" as a close guess for the zebra, not a right answer', () => {
    const d = new DialogStateManager(mod, 'Level_3');
    for (const a of ['drinking', 'roar', 'leaves']) d.respond(a);
    const r = d.respond('horse');
    expect(r.outcome).toBe('fallback');
    expect(r.wrongIntent).toBe('horse');
    expect(d.respond('zebra').outcome).toBe('success');
  });
  it('accepts the right choice on a scaffold', () => {
    const d = new DialogStateManager(mod, 'Level_1');
    expect(d.respond('it is sleeping').outcome).toBe('retry');
    expect(d.respond('drinking').outcome).toBe('success');
  });
  it('retries once then models the answer on a scaffold miss', () => {
    const d = new DialogStateManager(mod, 'Level_1');
    expect(d.respond('').outcome).toBe('silence');
    expect(d.currentId).toBe('elephant_choice');
    const m = d.respond('pizza');
    expect(m.outcome).toBe('modeled');
    expect(m.speech[0]).toContain('drinking');
    expect(d.currentId).toBe('lion_choice');
  });
  it('finishes the module', () => {
    const d = new DialogStateManager(mod, 'Level_3');
    for (const a of ['drinking', 'roar', 'leaves', 'zebra', 'hippo', 'monkey', 'rhino', 'leopard', 'pink', 'crocodile']) d.respond(a);
    expect(d.phase).toBe('done');
  });
});

describe('content registry', () => {
  it('validates all shipped modules', () => {
    const dir = 'src/content/modules';
    const reg = new ContentRegistry();
    for (const f of readdirSync(dir)) reg.register(JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')));
    expect(reg.errors).toEqual([]);
    expect(reg.all().length).toBeGreaterThanOrEqual(5);
    expect(new Set(reg.all().map((m) => m.domain))).toEqual(new Set(['Animals', 'Tools', 'Everyday', 'Vehicles', 'Food', 'Learning', 'Body', 'Nature']));
  });
  it('rejects broken modules', () => {
    const errs = validateModule({ module_id: 'x', domain: 'Space', prompt_tree: { root_id: 'a', nodes: { a: { tts_template: 'hi', expected_semantic_intents: ['x'], fallback_node: 'missing' } } } });
    expect(errs.map((e) => e.message).join()).toMatch(/domain/);
    expect(errs.map((e) => e.message).join()).toMatch(/missing node/);
  });
});

describe('mic meter analysis', () => {
  it('finds speech start, end, and gaps', () => {
    const frames = [] as { t: number; db: number; voiced: boolean }[];
    for (let t = 0; t < 3000; t += 30) {
      const voiced = (t >= 600 && t < 1200) || (t >= 2100 && t < 2500);
      frames.push({ t, db: voiced ? -20 : -60, voiced });
    }
    const r = analyzeFrames(frames);
    expect(r.speechStartMs).toBe(600);
    expect(r.gapsMs.length).toBe(1);
    expect(r.gapsMs[0]).toBeGreaterThan(800);
    expect(r.meanDbfs).toBe(-20);
  });
  it('reports silence', () => {
    expect(analyzeFrames([{ t: 0, db: -70, voiced: false }]).speechStartMs).toBeNull();
  });
});

describe('profiles (spec 2.1)', () => {
  it('creates a UUIDv4 profile and applies attempts', () => {
    const p = createProfile({ display_name: 'Ava', chronological_age: 4.5, target_language: 'en-US' });
    expect(p.profile_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    const q = applyAttempt(p, { attemptScore: 1, fluencyScore: 1, moraRate: 3, lexicalHits: ['elephant'], cdi: () => 'Animals' });
    expect(q.adaptive_score).toBeCloseTo(0.15 + 0.85 * p.adaptive_score);
    expect(q.vocabulary_acquired.elephant.cdi_category).toBe('Animals');
    expect(q.baseline_mora_rate).toBe(3);
  });
});

const allModules = (): ContentModule[] =>
  readdirSync('src/content/modules').map((f) => JSON.parse(readFileSync(`src/content/modules/${f}`, 'utf8')) as ContentModule);

describe('content packs', () => {
  it('has bigger packs (8+ pictures each) and 100+ pictures in all', () => {
    const counts = allModules().map((m) => listItems(m).length);
    expect(Math.min(...counts)).toBeGreaterThanOrEqual(8);
    expect(counts.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(100);
  });
  for (const m of allModules()) {
    describe(m.title, () => {
      const nodes = m.prompt_tree.nodes;
      it('every picture has a known scene, motion and emoji', () => {
        for (const [id, n] of Object.entries(nodes)) {
          expect(SCENE_NAMES, `${id} scene`).toContain(n.scene);
          expect(MOTIONS, `${id} motion`).toContain(n.motion);
          expect(n.emoji, `${id} emoji`).toBeTruthy();
        }
      });
      it('every photo points to a file in public/', () => {
        for (const [id, n] of Object.entries(nodes)) {
          if (n.photo) expect(existsSync(`public/${n.photo}`), `${id} photo ${n.photo}`).toBe(true);
        }
      });
      it('either/or questions accept only the right answer', () => {
        for (const [id, n] of Object.entries(nodes)) {
          if (n.prompt_type !== 'forced_choice_scaffold') continue;
          expect(n.correct_intents, id).toHaveLength(1);
          const [right] = n.correct_intents!;
          const wrong = n.expected_semantic_intents.find((x) => x !== right)!;
          expect(matchIntent(right, n.expected_semantic_intents, n.intent_synonyms), `${id} right`).toBe(right);
          expect(matchIntent(wrong, n.expected_semantic_intents, n.intent_synonyms), `${id} wrong`).toBe(wrong);
        }
      });
      it('open questions never mistake a wrong answer for a right one', () => {
        for (const [id, n] of Object.entries(nodes)) {
          if (n.prompt_type !== 'open_ended_conversational') continue;
          const right = n.correct_intents ?? n.expected_semantic_intents;
          for (const r of right) expect(right, `${id}: "${r}"`).toContain(matchIntent(r, n.expected_semantic_intents, n.intent_synonyms));
          for (const w of n.expected_semantic_intents.filter((x) => !right.includes(x)))
            expect(right, `${id}: wrong "${w}"`).not.toContain(matchIntent(w, n.expected_semantic_intents, n.intent_synonyms));
        }
      });
    });
  }
});

describe('rounds: random mix + repeat what was missed', () => {
  const seeded = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const rec = (node_id: string, ok: boolean, t: string) =>
    ({ module_id: mod.module_id, node_id, matched_intent: ok ? 'x' : null, timestamp: t }) as never;
  it('plays 5 different pictures from the pack', () => {
    const r = pickRound(mod, [], 5, seeded(7));
    expect(r).toHaveLength(5);
    expect(new Set(r).size).toBe(5);
    for (const id of r) expect(listItems(mod)).toContain(id);
  });
  it('different games get different mixes', () => {
    const rounds = new Set([1, 2, 3, 4, 5, 6].map((s) => pickRound(mod, [], 5, seeded(s)).join(',')));
    expect(rounds.size).toBeGreaterThan(3);
  });
  it('brings back pictures the child missed', () => {
    const history = [rec('zebra', false, '2026-10-14T10:00:00Z'), rec('zebra_choice', false, '2026-10-14T10:00:05Z'), rec('hippo_choice', false, '2026-10-14T10:01:00Z'), rec('lion', true, '2026-10-14T10:02:00Z')];
    expect(itemStats(mod, history).find((s) => s.id === 'zebra')!.lastMissed).toBe(true);
    for (const s of [1, 2, 3, 4, 5]) {
      const r = pickRound(mod, history, 5, seeded(s));
      expect(r).toContain('zebra');
      expect(r).toContain('hippo');
    }
  });
  it('a game plays exactly the picked pictures, then ends', () => {
    const d = new DialogStateManager(mod, 'Level_3', ['zebra', 'lion']);
    expect(d.currentId).toBe('zebra');
    d.respond('fish'); // open miss -> choice
    expect(d.currentId).toBe('zebra_choice');
    d.respond('zebra');
    expect(d.currentId).toBe('lion');
    d.respond('roar');
    expect(d.phase).toBe('done');
  });
  it('Level 1 children start each picked picture on its either/or question', () => {
    const d = new DialogStateManager(mod, 'Level_1', ['giraffe', 'zebra']);
    expect(d.currentId).toBe('giraffe_choice');
    d.respond('leaves');
    expect(d.currentId).toBe('zebra_choice');
  });
});
