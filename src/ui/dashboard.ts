// Grown-ups dashboard: progress tracking (spec §2.2), vocabulary mapping, system specs (§4.2, §5).
import { loadProfiles } from '../profile/profiles';
import { exportJson, summarize } from '../analytics/logger';
import { LANGUAGE_MATRIX, languageFor } from '../speech/languages';
import { E2E_LATENCY_TARGET_MS, VAD_MAX_MS, VAD_MIN_MS, vadWaitTimeMs } from '../engine/vad';
import { EWMA_ALPHA } from '../engine/adaptive';
import { h, fmtTier } from './dom';
import type { App } from './app';
import type { ChildProfile } from '../types';

export function renderDashboard(app: App, view: HTMLElement, profileId?: string): void {
  const profiles = loadProfiles();
  const selected = profiles.find((p) => p.profile_id === profileId) ?? profiles[0];
  const tabs = h(
    'div',
    { class: 'tabs', role: 'tablist' },
    profiles.map((p) =>
      h('button', { class: `tab ${p === selected ? 'active' : ''}`, role: 'tab', onclick: () => app.go({ name: 'dashboard', profileId: p.profile_id }) }, p.display_name),
    ),
    h('button', { class: `tab ${!selected ? 'active' : ''}`, onclick: () => app.go({ name: 'new-profile' }) }, '＋ Add child'),
  );
  view.append(h('section', { class: 'hero', style: 'text-align:left' }, h('h1', {}, 'Progress for grown-ups'), h('p', {}, 'Speech practice insights, stored only on this device.')), tabs);
  if (selected) view.append(profilePanel(app, selected));
  else view.append(h('div', { class: 'card' }, 'No profiles yet. Add a child to get started.'));
  view.append(systemPanel(app));
}

function stat(label: string, value: string, sub?: string): HTMLElement {
  return h('div', { class: 'card stat' }, h('div', { class: 'label' }, label), h('div', { class: 'value' }, value), sub ? h('div', { class: 'sub' }, sub) : null);
}

function sparkline(values: number[]): SVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 300 90');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('class', 'spark');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Adaptive score over time');
  // tier threshold guides
  for (const t of [0.35, 0.55, 0.7, 0.85]) {
    const l = document.createElementNS(ns, 'line');
    const y = String(85 - t * 80);
    Object.entries({ x1: '0', x2: '300', y1: y, y2: y, stroke: '#e6e1fb', 'stroke-dasharray': '4 4' }).forEach(([k, v]) => l.setAttribute(k, v));
    svg.appendChild(l);
  }
  if (values.length > 1) {
    const pts = values.map((v, i) => `${(i / (values.length - 1)) * 300},${85 - v * 80}`).join(' ');
    const pl = document.createElementNS(ns, 'polyline');
    Object.entries({ points: pts, fill: 'none', stroke: '#5b4bdb', 'stroke-width': '3', 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke' }).forEach(([k, v]) => pl.setAttribute(k, v));
    svg.appendChild(pl);
  }
  return svg;
}

function profilePanel(app: App, p: ChildProfile): HTMLElement {
  const records = app.loadAttempts(p.profile_id);
  const s = summarize(records);
  const vocab = Object.values(p.vocabulary_acquired);
  const byCat = new Map<string, string[]>();
  for (const v of vocab) byCat.set(v.cdi_category, [...(byCat.get(v.cdi_category) ?? []), v.lemma]);
  const recent = records.slice(-12).reverse();

  return h(
    'div',
    { class: 'dash' },
    stat('Current level', fmtTier(p.adaptive_tier), `EWMA score ${p.adaptive_score.toFixed(2)} (α = ${EWMA_ALPHA})`),
    stat('Answers practiced', String(s.attempts), `${Math.round(s.successRate * 100)}% understood · ${s.sessions} day(s)`),
    stat('Fluency index', p.fluency_score_index.toFixed(2), `${s.longPauses} long pauses · ${s.falseStarts} false starts · ${s.repetitions} repeats`),
    stat('Speech rate', p.baseline_mora_rate ? `${p.baseline_mora_rate.toFixed(1)}` : '—', 'syllables per second (baseline)'),
    stat('Response time', s.avgLatencyMs != null ? `${(s.avgLatencyMs / 1000).toFixed(1)} s` : '—', `wait window ${(vadWaitTimeMs(p.chronological_age, p.fluency_score_index) / 1000).toFixed(1)} s`),
    stat('Voice loudness', s.avgDbfs != null ? `${s.avgDbfs.toFixed(0)} dBFS` : '—', 'average while speaking'),
    h(
      'div',
      { class: 'card wide' },
      h('h3', {}, '⭐ How stars work'),
      h('p', {}, 'Each picture in a round is worth one star. Your child earns the star by answering correctly, either:'),
      h(
        'ul',
        {},
        h('li', {}, h('b', {}, 'On their own'), ' — naming it from the open question (“What is this animal?”), or'),
        h('li', {}, h('b', {}, 'With help'), ' — picking it from two choices (“Is it a cow or a duck?”).'),
      ),
      h('p', { class: 'meta' }, 'New players start at Level 1, where every picture begins with the two choices. From Level 2 up, pictures start with the open question, and the two choices come only if your child needs help. The end-of-round screen shows how many were on their own and how many were with help.'),
    ),
    h('div', { class: 'card wide' }, h('h3', {}, 'Progress over time'), s.scoreHistory.length > 1 ? sparkline(s.scoreHistory) : h('p', { class: 'meta' }, 'Play a few rounds to see the progress line.')),
    h(
      'div',
      { class: 'card wide' },
      h('h3', {}, `Words produced (${vocab.length})`),
      h('p', { class: 'meta', style: 'margin-top:4px' }, 'Grouped by MacArthur-Bates CDI category.'),
      vocab.length
        ? h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Category'), h('th', {}, 'Words'))), h('tbody', {}, [...byCat.entries()].map(([c, ws]) => h('tr', {}, h('td', {}, c), h('td', {}, ws.join(', ')))))))
        : h('p', { class: 'meta' }, 'No target words yet.'),
    ),
    h(
      'div',
      { class: 'card wide' },
      h('h3', {}, 'Recent answers'),
      recent.length
        ? h(
            'div',
            { class: 'table-wrap' },
            h(
              'table',
              {},
              h('thead', {}, h('tr', {}, ['When', 'Pack', 'Prompt', 'Said', 'Matched', 'Score', 'Latency'].map((t) => h('th', {}, t)))),
              h(
                'tbody',
                {},
                recent.map((r) =>
                  h(
                    'tr',
                    {},
                    h('td', {}, new Date(r.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })),
                    h('td', {}, app.registry.get(r.module_id)?.title ?? r.module_id),
                    h('td', {}, r.prompt_type === 'forced_choice_scaffold' ? 'Choice' : 'Open'),
                    h('td', {}, r.metrics.transcript || '(silence)'),
                    h('td', { class: r.matched_intent ? 'ok' : 'warn' }, r.matched_intent ?? '—'),
                    h('td', {}, r.attempt_score.toFixed(2)),
                    h('td', {}, r.metrics.utterance_latency_ms != null ? `${(r.metrics.utterance_latency_ms / 1000).toFixed(1)} s` : '—'),
                  ),
                ),
              ),
            ),
          )
        : h('p', { class: 'meta' }, 'No answers yet.'),
    ),
    h(
      'div',
      { class: 'card wide' },
      h('h3', {}, 'Profile'),
      h(
        'dl',
        { class: 'kv' },
        ['Profile ID', p.profile_id, 'Age', `${p.chronological_age} years`, 'Language', `${languageFor(p.target_language)?.name ?? ''} (${p.target_language})`, 'Target sounds', p.phonetic_target_set.join(' ') || '—', 'Created', new Date(p.created_at).toLocaleDateString()].flatMap((v, i) => (i % 2 ? [h('dd', {}, v)] : [h('dt', {}, v)])),
      ),
      h(
        'div',
        { class: 'row', style: 'margin-top:14px' },
        h('button', { class: 'btn', onclick: () => app.go({ name: 'modules', profileId: p.profile_id }) }, '▶ Play'),
        h('button', { class: 'btn secondary', onclick: () => exportJson({ profile: p, attempts: records }, `multiplay-${p.display_name}-${new Date().toISOString().slice(0, 10)}.json`) }, '⬇ Export data'),
        h(
          'button',
          {
            class: 'btn danger',
            onclick: () => {
              if (confirm(`Delete ${p.display_name}'s profile and all progress on this device?`)) {
                app.removeProfile(p.profile_id);
                app.go({ name: 'dashboard' });
              }
            },
          },
          '🗑 Delete',
        ),
      ),
    ),
  );
}

function systemPanel(app: App): HTMLElement {
  return h(
    'details',
    { class: 'card wide', style: 'margin-top:16px' },
    h('summary', { style: 'cursor:pointer;font-weight:700' }, '⚙️ System & language specifications'),
    h(
      'dl',
      { class: 'kv', style: 'margin:12px 0' },
      h('dt', {}, 'Speech recognition'),
      h('dd', { class: app.asr.available ? 'ok' : 'warn' }, app.asr.available ? `${app.asr.name} — available` : 'Not available in this browser (tap/type mode)'),
      h('dt', {}, 'Text-to-speech'),
      h('dd', { class: app.tts.available ? 'ok' : 'warn' }, app.tts.available ? `${app.tts.name} — available` : 'Not available'),
      h('dt', {}, 'End-to-end latency target'),
      h('dd', {}, `< ${E2E_LATENCY_TARGET_MS} ms (end of utterance → reply)`),
      h('dt', {}, 'Pediatric wait-time'),
      h('dd', {}, `${VAD_MIN_MS / 1000}–${VAD_MAX_MS / 1000} s, by age and fluency`),
      h('dt', {}, 'Content modules'),
      h('dd', {}, `${app.registry.all().length} loaded${app.registry.errors.length ? `, ${app.registry.errors.length} validation error(s)` : ''}`),
    ),
    h(
      'div',
      { class: 'table-wrap' },
      h(
        'table',
        {},
        h('thead', {}, h('tr', {}, ['Language', 'ISO codes', 'Production ASR model', 'Target WER', 'MVP browser support'].map((t) => h('th', {}, t)))),
        h(
          'tbody',
          {},
          LANGUAGE_MATRIX.map((l) =>
            h('tr', {}, h('td', {}, l.name), h('td', {}, l.isoCodes.join(', ')), h('td', {}, l.asrBaseModel), h('td', {}, `< ${(l.targetWer * 100).toFixed(1)}%`), h('td', { class: l.browserAsrLimited ? 'warn' : 'ok' }, l.browserAsrLimited ? 'Limited — tap/type' : 'Yes')),
          ),
        ),
      ),
    ),
  );
}
