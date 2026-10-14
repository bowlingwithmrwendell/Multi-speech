import type { ChildProfile, ContentModule } from '../types';
import { createDefaultRegistry, DOMAIN_INFO, type ContentRegistry } from '../content/registry';
import { buildCdiLookup } from '../content/cdi';
import { createProfile, deleteProfile, loadProfiles, upsertProfile } from '../profile/profiles';
import { clearAttempts, loadAttempts, logAttempt } from '../analytics/logger';
import { BrowserASR, BrowserTTS } from '../speech/providers';
import { LANGUAGE_MATRIX, contentLanguageFor, languageFor } from '../speech/languages';
import { MicMeter } from '../audio/meter';
import { tierNumber } from '../engine/adaptive';
import { h, avatarColor, fmtTier } from './dom';
import { PlayScreen } from './play';
import { renderDashboard } from './dashboard';

export type Route =
  | { name: 'home' }
  | { name: 'new-profile' }
  | { name: 'modules'; profileId: string }
  | { name: 'play'; profileId: string; moduleId: string }
  | { name: 'dashboard'; profileId?: string };

export class App {
  readonly root: HTMLElement;
  readonly registry: ContentRegistry;
  readonly cdi: (lemma: string) => string;
  readonly asr = new BrowserASR();
  readonly tts = new BrowserTTS();
  readonly meter = new MicMeter();
  private play: PlayScreen | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    this.registry = createDefaultRegistry();
    this.cdi = buildCdiLookup(this.registry.all());
  }

  start(): void {
    // Warm up voice list (Chrome loads it asynchronously).
    if (this.tts.available) window.speechSynthesis.getVoices();
    this.go({ name: 'home' });
  }

  profile(id: string): ChildProfile | undefined {
    return loadProfiles().find((p) => p.profile_id === id);
  }

  saveProfile(p: ChildProfile): void {
    upsertProfile(p);
  }

  go(route: Route): void {
    this.play?.destroy();
    this.play = null;
    this.root.replaceChildren(this.topbar(route));
    const view = h('main', {});
    this.root.appendChild(view);
    window.scrollTo({ top: 0 });
    switch (route.name) {
      case 'home':
        return this.renderHome(view);
      case 'new-profile':
        return this.renderNewProfile(view);
      case 'modules':
        return this.renderModules(view, route.profileId);
      case 'play': {
        const p = this.profile(route.profileId);
        const m = this.registry.get(route.moduleId);
        if (!p || !m) return this.go({ name: 'home' });
        this.play = new PlayScreen(this, view, p, m);
        return;
      }
      case 'dashboard':
        return renderDashboard(this, view, route.profileId);
    }
  }

  private topbar(route: Route): HTMLElement {
    return h(
      'header',
      { class: 'topbar' },
      h('div', { class: 'brand', role: 'button', tabindex: 0, onclick: () => this.go({ name: 'home' }) }, h('span', { class: 'logo' }, '🗣️'), 'MultiPlay Speech'),
      route.name !== 'dashboard'
        ? h('button', { class: 'link-btn', onclick: () => this.go({ name: 'dashboard', profileId: 'profileId' in route ? route.profileId : undefined }) }, '👪 Grown-ups')
        : h('button', { class: 'link-btn', onclick: () => this.go({ name: 'home' }) }, '← Back to play'),
    );
  }

  // ---- Home: who's playing? -------------------------------------------------
  private renderHome(view: HTMLElement): void {
    const profiles = loadProfiles();
    view.append(
      h('section', { class: 'hero' }, h('h1', {}, "Who's playing today?"), h('p', {}, 'Pick your name to start talking and playing.')),
      h(
        'div',
        { class: 'grid' },
        profiles.map((p) =>
          h(
            'div',
            { class: 'card tap', role: 'button', tabindex: 0, onclick: () => this.go({ name: 'modules', profileId: p.profile_id }) },
            h('div', { class: 'avatar', style: `background:${avatarColor(p.profile_id)}` }, p.display_name.slice(0, 1).toUpperCase()),
            h('div', { class: 'name' }, p.display_name),
            h('div', { class: 'meta' }, `${p.chronological_age} yrs · ${languageFor(p.target_language)?.name ?? p.target_language}`),
            h('div', { style: 'margin-top:8px' }, h('span', { class: 'badge' }, fmtTier(p.adaptive_tier))),
          ),
        ),
        h('button', { class: 'card add', onclick: () => this.go({ name: 'new-profile' }) }, h('div', {}, h('div', { style: 'font-size:2.6rem' }, '＋'), 'Add a child')),
      ),
      h('p', { class: 'note' }, '🔒 Profiles and progress stay on this device only. Nothing is uploaded.'),
    );
    if (!this.asr.available)
      view.append(h('p', { class: 'note' }, '🎙️ This browser has no built-in speech recognition — children can tap or type answers. For voice play, use Chrome or Edge.'));
  }

  // ---- New profile ------------------------------------------------------------
  private renderNewProfile(view: HTMLElement): void {
    const name = h('input', { type: 'text', id: 'pname', maxlength: 30, placeholder: 'First name or nickname', required: true, autocomplete: 'off' });
    const ageOut = h('span', { class: 'age-readout' }, '4.0 years');
    const age = h('input', { type: 'range', id: 'page', min: 2, max: 10, step: 0.5, value: 4 });
    age.addEventListener('input', () => (ageOut.textContent = `${Number(age.value).toFixed(1)} years`));
    const lang = h(
      'select',
      { id: 'plang' },
      LANGUAGE_MATRIX.map((l) =>
        h('optgroup', { label: l.name }, l.isoCodes.map((c) => h('option', { value: c, selected: c === 'en-US' }, `${l.name} (${c})`))),
      ),
    );
    const langNote = h('small', {});
    const updateLangNote = () => {
      const spec = languageFor(lang.value);
      const n = this.registry.forProfile(contentLanguageFor(lang.value), 4).length;
      langNote.textContent =
        `${n} activity pack${n === 1 ? '' : 's'} available` +
        (spec?.browserAsrLimited ? ' · voice recognition for this language is limited in browsers; tap/type answers are available.' : '');
    };
    lang.addEventListener('change', updateLangNote);
    updateLangNote();
    const phon = h('input', { type: 'text', id: 'pphon', placeholder: 'e.g. /s/, /r/, /l/ (optional)', autocomplete: 'off' });

    const form = h(
      'form',
      { class: 'card panel' },
      h('h2', { style: 'margin-bottom:14px' }, 'Add a child'),
      h('div', { class: 'field' }, h('label', { for: 'pname' }, 'Name'), name, h('small', {}, 'First name only — we never ask for a full name.')),
      h('div', { class: 'field' }, h('label', { for: 'page' }, 'Age'), ageOut, age),
      h('div', { class: 'field' }, h('label', { for: 'plang' }, 'Language'), lang, langNote),
      h('div', { class: 'field' }, h('label', { for: 'pphon' }, 'Target sounds (from your speech therapist)'), phon),
      h('div', { class: 'row end' }, h('button', { type: 'button', class: 'btn secondary', onclick: () => this.go({ name: 'home' }) }, 'Cancel'), h('button', { type: 'submit', class: 'btn' }, 'Save')),
    );
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!name.value.trim()) return name.focus();
      const p = createProfile({
        display_name: name.value,
        chronological_age: Number(age.value),
        target_language: lang.value,
        phonetic_target_set: phon.value.split(/[,\s]+/).filter(Boolean),
      });
      upsertProfile(p);
      this.go({ name: 'modules', profileId: p.profile_id });
    });
    view.append(form);
    name.focus();
  }

  // ---- Module picker ----------------------------------------------------------
  private renderModules(view: HTMLElement, profileId: string): void {
    const p = this.profile(profileId);
    if (!p) return this.go({ name: 'home' });
    const mods = this.registry.forProfile(contentLanguageFor(p.target_language), p.chronological_age);
    view.append(
      h('section', { class: 'hero' }, h('h1', {}, `Hi ${p.display_name}! What do you want to talk about?`), h('p', {}, h('span', { class: 'badge' }, `${fmtTier(p.adaptive_tier)}`), ' ', tierNumber(p.adaptive_tier) <= 1 ? 'We’ll start with easy choices.' : 'Ready for big conversations!')),
      mods.length
        ? h('div', { class: 'grid' }, mods.map((m) => this.moduleCard(p, m)))
        : h('div', { class: 'card', style: 'text-align:center' }, 'No activity packs for this language yet. Add a module JSON file in src/content/modules.'),
    );
  }

  private moduleCard(p: ChildProfile, m: ContentModule): HTMLElement {
    const info = DOMAIN_INFO[m.domain];
    const cover = h('div', { class: 'cover', style: 'display:grid;place-items:center' }, h('span', { class: 'emoji' }, m.cover_emoji ?? info.emoji));
    if (m.cover_image) {
      const img = new Image();
      img.className = 'cover';
      img.alt = m.title;
      img.onload = () => cover.replaceWith(img);
      img.src = m.cover_image;
    }
    const prompts = Object.values(m.prompt_tree.nodes).filter((n) => n.prompt_type === 'open_ended_conversational').length;
    return h(
      'div',
      { class: 'card tap domain-card', role: 'button', tabindex: 0, onclick: () => this.go({ name: 'play', profileId: p.profile_id, moduleId: m.module_id }) },
      cover,
      h('h3', {}, m.title),
      h('div', { class: 'meta' }, info.label),
      h('div', { style: 'margin-top:8px' }, h('span', { class: 'badge mint' }, `Ages ${m.target_age_group}`), ' ', h('span', { class: 'badge sun' }, `${prompts} chats`)),
    );
  }

  // ---- shared actions -----------------------------------------------------------
  logAttempt = logAttempt;
  loadAttempts = loadAttempts;

  removeProfile(id: string): void {
    deleteProfile(id);
    clearAttempts(id);
  }
}
