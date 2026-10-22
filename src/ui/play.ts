// Child-facing play screen: runs the conversational loop for one content module.
import type { ChildProfile, ContentModule, PromptNode } from '../types';
import { ConversationSession, type TurnOutcome } from '../engine/session';
import { E2E_LATENCY_TARGET_MS } from '../engine/vad';
import { fill, phrasesFor } from '../engine/phrases';
import { contentLanguageFor } from '../speech/languages';
import { h, fmtTier } from './dom';
import { renderScene } from './scene';
import { pickRound } from '../engine/rounds';
import type { App } from './app';
import { micMustBeExclusive } from '../audio/meter';

type Mode = 'voice' | 'tap';

export class PlayScreen {
  private app: App;
  private view: HTMLElement;
  private module: ContentModule;
  private session: ConversationSession;
  private destroyed = false;
  private mode: Mode;
  private stars = 0;
  private totalStars: number;
  private wordsSaid = new Set<string>();
  private typedResolver: ((text: string) => void) | null = null;
  private lastOutcome: TurnOutcome | null = null;

  // elements
  private artBox = h('div', { class: 'art' });
  private starRow = h('div', { class: 'stars', 'aria-label': 'stars earned' });
  private promptBubble = h('div', { class: 'bubble app', 'aria-live': 'polite' });
  private childBubble = h('div', { class: 'bubble child', hidden: true });
  private status = h('div', { class: 'status', 'aria-live': 'polite' });
  private micBtn = h('button', { class: 'mic', 'aria-label': 'Start talking' }, h('span', { class: 'ring' }), '🎤');
  private choices = h('div', { class: 'choices' });
  private typeInput = h('input', { type: 'text', placeholder: 'Type what the child said…', 'aria-label': 'Typed answer', autocomplete: 'off' });
  private parentStats = h('dl', { class: 'kv' });

  constructor(app: App, view: HTMLElement, profile: ChildProfile, module: ContentModule) {
    this.app = app;
    this.view = view;
    this.module = module;
    this.mode = app.asr.available ? 'voice' : 'tap';
    this.session = new ConversationSession(profile, module, {
      asr: app.asr,
      tts: app.tts,
      meter: app.meter,
      cdi: app.cdi,
      onProfile: (p) => app.saveProfile(p),
      onAttempt: (r) => app.logAttempt(r),
      onHeard: () => this.pulseMic(),
      onAsrError: (err) => this.handleAsrError(err),
    }, pickRound(module, app.loadAttempts(profile.profile_id)));
    this.totalStars = this.session.dialog.itemIds.length;
    this.render();
  }

  destroy(): void {
    this.destroyed = true;
    this.session.stop();
    this.app.meter.onLevel = null;
    this.typedResolver?.('');
  }

  private render(): void {
    const typeForm = h('form', { class: 'typebox' }, this.typeInput, h('button', { class: 'btn', type: 'submit' }, 'Send'));
    typeForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = this.typeInput.value.trim();
      if (!v) return;
      this.typeInput.value = '';
      this.submitTyped(v);
    });

    this.micBtn.addEventListener('click', () => this.begin());
    this.renderStars();
    this.renderStats();
    this.view.append(
      h(
        'div',
        { class: 'play' },
        h('div', { class: 'stage' }, this.artBox, this.starRow),
        h(
          'div',
          { class: 'side' },
          this.promptBubble,
          this.childBubble,
          h('div', { class: 'mic-wrap' }, this.mode === 'voice' ? this.micBtn : null, this.status),
          this.choices,
          h(
            'div',
            { class: 'row', style: 'justify-content:center' },
            h('button', { class: 'btn secondary', onclick: () => this.repeat() }, '🔁 Say it again'),
            h('button', { class: 'btn secondary', onclick: () => this.app.go({ name: 'modules', profileId: this.session.profile.profile_id }) }, '⏹ Stop'),
          ),
          h(
            'details',
            { class: 'parent', open: this.mode === 'tap' },
            h('summary', {}, '👪 Grown-up tools'),
            h('p', { style: 'margin:8px 0;font-size:.9rem;color:var(--muted)' }, this.mode === 'voice' ? 'Type an answer to test without the microphone.' : 'Voice recognition is not available in this browser. Type or tap the child’s answer.'),
            typeForm,
            this.parentStats,
          ),
        ),
      ),
    );
    this.showNode(this.session.dialog.node);
    this.promptBubble.prepend(h('span', { class: 'who' }, 'MultiPlay'));
    this.setStatus(this.mode === 'voice' ? 'Tap the microphone to start!' : 'Tap Start to begin!');
    if (this.mode === 'tap') {
      this.choices.replaceChildren(h('button', { class: 'btn', onclick: () => this.begin() }, '▶ Start'));
    }
  }

  private started = false;
  private async begin(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.micBtn.classList.add('busy');
    this.choices.replaceChildren();
    if (this.mode === 'voice') {
      this.setStatus('Getting the microphone ready…');
      const ok = await this.app.meter.init();
      if (ok) await this.app.meter.calibrate();
      // Tablets/phones: release our mic stream so the speech recognizer gets the mic alone.
      if (ok && micMustBeExclusive()) this.app.meter.dispose();
      this.app.meter.onLevel = (db) => {
        const lvl = Math.min(1.35, Math.max(1, 1 + (db + 50) / 80));
        this.micBtn.style.setProperty('--lvl', String(lvl));
      };
    }
    const ph = phrasesFor(contentLanguageFor(this.session.profile.target_language));
    this.setStatus('');
    await this.session.say(fill(ph.greeting, { name: this.session.profile.display_name }));
    await this.loop();
  }

  private async loop(): Promise<void> {
    while (!this.destroyed && this.session.dialog.node) {
      const node = this.session.dialog.node;
      this.showNode(node);
      this.micBtn.className = 'mic busy';
      this.setStatus('🔊 Listen…');
      await this.session.prompt();
      if (this.destroyed) return;

      let outcome: TurnOutcome | null;
      if (this.mode === 'voice') {
        this.micBtn.className = 'mic listening';
        this.setStatus('👂 Your turn! I’m listening…');
        const typed = new Promise<string>((r) => (this.typedResolver = r));
        const listened = this.session.listenTurn();
        const first = await Promise.race([listened.then((o) => ({ kind: 'voice' as const, o })), typed.then((t) => ({ kind: 'typed' as const, t }))]);
        if (first.kind === 'typed') {
          this.session.cancelListen();
          await listened;
          if (this.destroyed) return;
          outcome = await this.session.submitText(first.t);
        } else outcome = first.o;
        this.typedResolver = null;
      } else {
        this.showChoices(node);
        this.setStatus('Tap or type the answer');
        const t = await new Promise<string>((r) => (this.typedResolver = r));
        this.typedResolver = null;
        if (this.destroyed) return;
        outcome = await this.session.submitText(t);
      }
      if (this.destroyed || !outcome) return;
      this.micBtn.className = 'mic busy';
      await this.handleOutcome(outcome);
    }
    if (!this.destroyed) await this.finish();
  }

  private submitTyped(text: string): void {
    if (this.typedResolver) this.typedResolver(text);
  }

  private async handleOutcome(o: TurnOutcome): Promise<void> {
    this.lastOutcome = o;
    const said = o.record.metrics.transcript;
    this.childBubble.hidden = false;
    this.childBubble.replaceChildren(h('span', { class: 'who' }, this.session.profile.display_name), said ? `“${said}”` : '…');
    o.record.lexical_hits.forEach((w) => this.wordsSaid.add(w));
    if (o.dialog.outcome === 'success' && o.record.prompt_type === 'open_ended_conversational') this.stars++;
    else if (o.dialog.outcome === 'success') this.stars += 0.5;
    this.renderStars();
    this.renderStats();
    this.setStatus(o.dialog.outcome === 'success' ? '⭐ Great job!' : o.dialog.wrongIntent ? '👀 Look again!' : '💛 Nice try!');
    for (const line of o.dialog.speech) await this.session.say(line);
  }

  private async finish(): Promise<void> {
    const ph = phrasesFor(contentLanguageFor(this.session.profile.target_language));
    this.micBtn.className = 'mic';
    this.view.replaceChildren(
      h(
        'div',
        { class: 'card done' },
        h('div', { class: 'big' }, '🏆'),
        h('h1', {}, `Amazing, ${this.session.profile.display_name}!`),
        h('p', {}, `You earned ${Math.round(this.stars)} of ${this.totalStars} stars in ${this.module.title}.`),
        this.wordsSaid.size ? h('div', {}, h('p', { style: 'margin-bottom:0' }, 'Words you said:'), h('div', { class: 'chips' }, [...this.wordsSaid].map((w) => h('span', { class: 'chip' }, w)))) : null,
        h('p', { class: 'meta' }, `Level now: ${fmtTier(this.session.profile.adaptive_tier)}`),
        h(
          'div',
          { class: 'row', style: 'justify-content:center;margin-top:12px' },
          h('button', { class: 'btn', onclick: () => this.app.go({ name: 'play', profileId: this.session.profile.profile_id, moduleId: this.module.module_id }) }, '🔁 Play again'),
          h('button', { class: 'btn secondary', onclick: () => this.app.go({ name: 'modules', profileId: this.session.profile.profile_id }) }, 'Pick another'),
        ),
      ),
    );
    await this.session.say(ph.moduleDone);
  }

  private async repeat(): Promise<void> {
    if (!this.started) return void this.begin();
    if (this.micBtn.classList.contains('listening')) return; // don't talk over the child's turn
    await this.session.prompt();
  }

  private shownNode: PromptNode | null = null;
  private showNode(node: PromptNode | null): void {
    if (!node) return;
    // Keep the same scene running on a retry; rebuild only for a new picture.
    if (node !== this.shownNode) this.artBox.replaceChildren(renderScene(node, (node.correct_intents ?? node.expected_semantic_intents)[0] ?? 'picture'));
    this.shownNode = node;
    const who = this.promptBubble.querySelector('.who');
    this.promptBubble.replaceChildren(...(who ? [who] : []), node.tts_template);
    this.choices.replaceChildren();
  }

  private showChoices(node: PromptNode): void {
    // Show the right answer(s) mixed with recognised wrong ones, in a random order.
    const right = node.correct_intents ?? node.expected_semantic_intents;
    const wrong = node.expected_semantic_intents.filter((x) => !right.includes(x));
    const opts = node.prompt_type === 'forced_choice_scaffold'
      ? [...node.expected_semantic_intents]
      : [...right.slice(0, wrong.length ? 1 : 4), ...wrong.slice(0, 3)].slice(0, 4);
    for (let i = opts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [opts[i], opts[j]] = [opts[j], opts[i]];
    }
    this.choices.replaceChildren(...opts.map((o) => h('button', { class: 'choice', onclick: () => this.submitTyped(o) }, o)));
  }

  private renderStars(): void {
    const n = Math.max(this.totalStars, 1);
    this.starRow.replaceChildren(...Array.from({ length: n }, (_, i) => h('span', { class: i < Math.floor(this.stars) ? 'on' : '' }, '⭐')));
  }

  private renderStats(): void {
    const p = this.session.profile;
    const m = this.lastOutcome?.record.metrics;
    const f = this.lastOutcome?.record.fluency;
    const lat = this.lastOutcome?.responseLatencyMs;
    const rows: [string, string | HTMLElement][] = [
      ['Level', fmtTier(p.adaptive_tier)],
      ['EWMA score', p.adaptive_score.toFixed(3)],
      ['Fluency index', p.fluency_score_index.toFixed(2)],
      ['Wait window', `${(this.session.waitWindowMs / 1000).toFixed(1)} s`],
    ];
    if (m && f) {
      rows.push(
        ['Last answer', m.transcript || '(silence)'],
        ['Matched', this.lastOutcome?.record.matched_intent ?? '—'],
        ['Attempt score', this.lastOutcome!.record.attempt_score.toFixed(2)],
        ['Latency', m.utterance_latency_ms != null ? `${m.utterance_latency_ms} ms` : '—'],
        ['Vocal energy', m.vocal_energy_dbfs != null ? `${m.vocal_energy_dbfs} dBFS` : '—'],
        ['Pauses > 800 ms', String(f.long_pauses)],
        ['Speech rate', f.mora_rate ? `${f.mora_rate.toFixed(1)} syl/s` : '—'],
        ['ASR confidence', m.asr_confidence != null ? m.asr_confidence.toFixed(2) : '—'],
        ['Engine response', lat != null ? h('span', { class: lat < E2E_LATENCY_TARGET_MS ? 'ok' : 'warn' }, `${lat} ms (target < ${E2E_LATENCY_TARGET_MS})`) : '—'],
      );
    }
    this.parentStats.replaceChildren(...rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]));
  }

  private pulseTimer: number | undefined;
  /** Bump the mic animation when the recognizer hears the child (used when no level meter). */
  private pulseMic(): void {
    this.micBtn.style.setProperty('--lvl', '1.3');
    clearTimeout(this.pulseTimer);
    this.pulseTimer = window.setTimeout(() => this.micBtn.style.setProperty('--lvl', '1'), 250);
  }

  private handleAsrError(err: string): void {
    const messages: Record<string, string> = {
      'not-allowed': 'The microphone is blocked. Allow it in the browser settings, then reload. Switching to tap answers for now.',
      'service-not-allowed': 'This browser won’t allow voice answers. Switching to tap answers.',
      'audio-capture': 'Another app may be using the microphone. Close it and try again.',
      network: 'Voice answers need an internet connection. Check the Wi-Fi and try again.',
      'language-not-supported': 'This browser can’t listen in this language. Switching to tap answers.',
    };
    console.warn('[MultiPlay] speech recognition error:', err);
    this.setStatus('⚠️ ' + (messages[err] ?? `Voice problem (${err}). Try again.`));
    if (err === 'not-allowed' || err === 'service-not-allowed' || err === 'language-not-supported') this.mode = 'tap';
  }

  private setStatus(t: string): void {
    this.status.textContent = t;
  }
}
