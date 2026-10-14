import { describe, expect, it } from 'vitest';
import { attemptScore, ewma, EWMA_ALPHA, tierForScore } from '../src/engine/adaptive';
import { countFalseStarts, countRepetitions, evaluateFluency, tokenize } from '../src/engine/fluency';
import { vadWaitTimeMs, VAD_MAX_MS, VAD_MIN_MS } from '../src/engine/vad';
import { findLexicalHits, fuzzyEquals, matchIntent, stem } from '../src/engine/intent';
import { DialogStateManager } from '../src/engine/dialog';
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
    expect(d.currentId).toBe('node_001');
    const miss = d.respond('banana');
    expect(miss.outcome).toBe('fallback');
    expect(d.currentId).toBe('node_001_scaffold');
    const ok = d.respond('drinking');
    expect(ok.outcome).toBe('success');
    expect(d.currentId).toBe('node_002');
    expect(d.respond('roar').outcome).toBe('success');
    expect(d.currentId).toBe('node_003');
  });
  it('Level_1 starts on scaffolds', () => {
    const d = new DialogStateManager(mod, 'Level_1');
    expect(d.currentId).toBe('node_001_scaffold');
    d.respond('drinking');
    expect(d.currentId).toBe('node_002_scaffold');
  });
  it('does not praise the wrong choice (zebra vs fish)', () => {
    const d = new DialogStateManager(mod, 'Level_3');
    for (const a of ['drinking', 'roar', 'leaves']) d.respond(a);
    expect(d.currentId).toBe('node_004');
    const cow = d.respond('a cow');
    expect(cow.outcome).toBe('fallback');
    expect(d.currentId).toBe('node_004_scaffold');
    const fish = d.respond('fish');
    expect(fish.outcome).toBe('retry');
    expect(fish.matchedIntent).toBeNull();
    expect(fish.wrongIntent).toBe('fish');
    expect(fish.speech.join(' ')).not.toMatch(/nice|great|yes/i);
    const again = d.respond('fish');
    expect(again.outcome).toBe('modeled');
    expect(again.speech[0]).toContain('zebra');
    expect(d.phase).toBe('done');
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
    expect(d.currentId).toBe('node_001_scaffold');
    const m = d.respond('pizza');
    expect(m.outcome).toBe('modeled');
    expect(m.speech[0]).toContain('drinking');
    expect(d.currentId).toBe('node_002_scaffold');
  });
  it('finishes the module', () => {
    const d = new DialogStateManager(mod, 'Level_3');
    for (const a of ['drinking', 'roar', 'leaves', 'zebra']) d.respond(a);
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
    expect(new Set(reg.all().map((m) => m.domain))).toEqual(new Set(['Animals', 'Tools', 'Everyday', 'Vehicles']));
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
