// Animated habitat scenes behind each prompt picture.
// Each node names a `scene` (where it is) and a `motion` (how the picture moves).
// Scenery is drawn with CSS gradients + emoji props, so it works before any artwork exists.
// ChatGPT artwork (transparent PNG, facing left) drops in as the actor with no code changes.
import type { PromptNode } from '../types';
import { h } from './dom';

interface Prop {
  e: string; // emoji
  x: number; // % from left (centre of the prop)
  y: number; // % from bottom
  s: number; // size, % of scene width
  fx?: 'drift' | 'drift-slow' | 'fly' | 'sway' | 'pulse' | 'twinkle' | 'far';
  flip?: boolean;
}

interface Scene {
  bg: string; // CSS background
  props: Prop[];
  actorY: number; // where the actor stands, % from bottom
  actorSize: number; // % of scene width
}

const SKY_DAY = 'linear-gradient(#8fd3ff, #d7f1ff 58%';
const SAVANNAH_SKY = 'linear-gradient(#ffcf87, #ffe9c2 52%';

const SCENES: Record<string, Scene> = {
  // ---------- Savannah ----------
  waterhole: {
    bg: `radial-gradient(ellipse 26% 8% at 32% 84%, #5cc0f0 0 90%, #3a93c7 96%, transparent 100%), ${SAVANNAH_SKY}, #e3b65a 52%, #c58f35)`,
    props: [
      { e: '☀️', x: 84, y: 82, s: 11, fx: 'pulse' },
      { e: '🌳', x: 12, y: 40, s: 17, fx: 'far' },
      { e: '🌳', x: 92, y: 44, s: 12, fx: 'far' },
      { e: '🐦', x: 30, y: 80, s: 5, fx: 'fly' },
      { e: '🌾', x: 6, y: 6, s: 10, fx: 'sway' },
      { e: '🌾', x: 96, y: 4, s: 11, fx: 'sway' },
      { e: '🪨', x: 64, y: 6, s: 6 },
    ],
    actorY: 14,
    actorSize: 30,
  },
  pride_rock: {
    bg: `${SAVANNAH_SKY}, #e7b75b 52%, #c48c33)`,
    props: [
      { e: '☀️', x: 16, y: 80, s: 12, fx: 'pulse' },
      { e: '☁️', x: 70, y: 82, s: 12, fx: 'drift-slow' },
      { e: '⛰️', x: 80, y: 46, s: 26, fx: 'far' },
      { e: '🌳', x: 10, y: 44, s: 13, fx: 'far' },
      { e: '🪨', x: 86, y: 6, s: 18 },
      { e: '🌾', x: 4, y: 4, s: 11, fx: 'sway' },
      { e: '🌾', x: 30, y: 2, s: 8, fx: 'sway' },
    ],
    actorY: 12,
    actorSize: 30,
  },
  acacia: {
    bg: `${SAVANNAH_SKY}, #e9bc62 55%, #c99137)`,
    props: [
      { e: '☀️', x: 12, y: 82, s: 11, fx: 'pulse' },
      { e: '☁️', x: 46, y: 84, s: 10, fx: 'drift' },
      { e: '🌳', x: 70, y: 30, s: 46 },
      { e: '🌳', x: 8, y: 46, s: 11, fx: 'far' },
      { e: '🐦', x: 20, y: 74, s: 5, fx: 'fly' },
      { e: '🌾', x: 6, y: 4, s: 10, fx: 'sway' },
      { e: '🌾', x: 40, y: 3, s: 8, fx: 'sway' },
    ],
    actorY: 10,
    actorSize: 34,
  },
  grassland: {
    bg: `${SAVANNAH_SKY}, #dcb354 56%, #b98a32)`,
    props: [
      { e: '☀️', x: 86, y: 82, s: 11, fx: 'pulse' },
      { e: '☁️', x: 24, y: 80, s: 12, fx: 'drift-slow' },
      { e: '🌳', x: 14, y: 46, s: 12, fx: 'far' },
      { e: '🌳', x: 60, y: 48, s: 9, fx: 'far' },
      { e: '🌾', x: 4, y: 4, s: 11, fx: 'sway' },
      { e: '🌾', x: 26, y: 2, s: 9, fx: 'sway' },
      { e: '🌾', x: 74, y: 3, s: 10, fx: 'sway' },
      { e: '🌾', x: 96, y: 5, s: 11, fx: 'sway' },
    ],
    actorY: 12,
    actorSize: 30,
  },
  // ---------- Farm ----------
  barnyard: {
    bg: `repeating-linear-gradient(90deg, transparent 0 9%, #fff 9% 10.5%) 0 64% / 100% 3% no-repeat, linear-gradient(#fff, #fff) 0 66% / 100% 1.6% no-repeat, linear-gradient(#fff, #fff) 0 70% / 100% 1.6% no-repeat, ${SKY_DAY}, #8fd36b 58%, #5fae45)`,
    props: [
      { e: '☀️', x: 88, y: 84, s: 10, fx: 'pulse' },
      { e: '☁️', x: 30, y: 84, s: 12, fx: 'drift' },
      { e: '🏡', x: 18, y: 46, s: 22, fx: 'far' },
      { e: '🌻', x: 92, y: 8, s: 9, fx: 'sway' },
      { e: '🌼', x: 6, y: 4, s: 6, fx: 'sway' },
      { e: '🐔', x: 78, y: 20, s: 7 },
    ],
    actorY: 10,
    actorSize: 30,
  },
  farmyard: {
    bg: `${SKY_DAY}, #93d870 58%, #63b149)`,
    props: [
      { e: '☁️', x: 70, y: 82, s: 12, fx: 'drift' },
      { e: '🌳', x: 12, y: 40, s: 22, fx: 'far' },
      { e: '🏡', x: 84, y: 46, s: 15, fx: 'far' },
      { e: '🦋', x: 40, y: 64, s: 5, fx: 'fly' },
      { e: '🎾', x: 18, y: 6, s: 6 },
      { e: '🌼', x: 94, y: 4, s: 6, fx: 'sway' },
    ],
    actorY: 8,
    actorSize: 28,
  },
  // ---------- Workshop ----------
  workbench: {
    bg: 'linear-gradient(#8a5a33, #6e4426) 0 100% / 100% 30% no-repeat, linear-gradient(#a8703f, #a8703f) 0 70% / 100% 4% no-repeat, repeating-linear-gradient(90deg, #f3d9b1 0 12%, #ecd0a4 12% 24%)',
    props: [
      { e: '🪚', x: 16, y: 64, s: 12 },
      { e: '🔧', x: 32, y: 74, s: 8 },
      { e: '🪟', x: 80, y: 66, s: 18 },
      { e: '🪵', x: 78, y: 33, s: 15 },
      { e: '🔩', x: 22, y: 34, s: 6 },
    ],
    actorY: 34,
    actorSize: 26,
  },
  craft_table: {
    bg: 'linear-gradient(#5ec2b7, #42a59a) 0 100% / 100% 32% no-repeat, linear-gradient(#e9fbf7, #c9f0e8)',
    props: [
      { e: '📄', x: 30, y: 30, s: 16 },
      { e: '🧶', x: 76, y: 32, s: 12 },
      { e: '🖍️', x: 86, y: 30, s: 8 },
      { e: '🪟', x: 20, y: 66, s: 16 },
      { e: '⭐', x: 80, y: 74, s: 6, fx: 'twinkle' },
    ],
    actorY: 34,
    actorSize: 26,
  },
  art_corner: {
    bg: 'linear-gradient(#d9c5ff, #c4a9ff) 0 100% / 100% 28% no-repeat, linear-gradient(#fff6e6, #ffe9cc)',
    props: [
      { e: '🖼️', x: 76, y: 46, s: 26 },
      { e: '🎨', x: 20, y: 30, s: 14 },
      { e: '🌈', x: 24, y: 70, s: 16, fx: 'pulse' },
      { e: '⭐', x: 90, y: 82, s: 5, fx: 'twinkle' },
    ],
    actorY: 30,
    actorSize: 24,
  },
  sandbox: {
    bg: `radial-gradient(ellipse 46% 16% at 50% 88%, #f6d98e 0 97%, #d9b664 98%, transparent 99%), ${SKY_DAY}, #8ed46d 54%, #62ad49)`,
    props: [
      { e: '☀️', x: 14, y: 84, s: 11, fx: 'pulse' },
      { e: '☁️', x: 64, y: 82, s: 12, fx: 'drift' },
      { e: '⛱️', x: 82, y: 22, s: 18 },
      { e: '🪣', x: 26, y: 10, s: 9 },
      { e: '🌳', x: 8, y: 44, s: 14, fx: 'far' },
    ],
    actorY: 10,
    actorSize: 26,
  },
  // ---------- Home ----------
  kitchen: {
    bg: 'linear-gradient(#ffffff, #ffffff) 0 70% / 100% 2.4% no-repeat, linear-gradient(#ffb36b, #f39a4a) 0 100% / 100% 30% no-repeat, repeating-linear-gradient(90deg, #fff4d6 0 10%, #ffeec5 10% 20%)',
    props: [
      { e: '🪟', x: 76, y: 66, s: 20 },
      { e: '🥛', x: 22, y: 36, s: 9 },
      { e: '🍌', x: 80, y: 33, s: 10 },
      { e: '🍳', x: 92, y: 33, s: 8 },
      { e: '☀️', x: 76, y: 72, s: 6, fx: 'pulse' },
    ],
    actorY: 32,
    actorSize: 26,
  },
  bathroom: {
    bg: 'linear-gradient(#ffffff, #f1f6fa) 0 100% / 100% 26% no-repeat, repeating-linear-gradient(90deg, transparent 0 9%, #fff 9% 9.6%), repeating-linear-gradient(0deg, #dff3ff 0 9%, #ffffff 9% 9.6%)',
    props: [
      { e: '🪞', x: 50, y: 62, s: 24 },
      { e: '🧼', x: 16, y: 28, s: 9 },
      { e: '🫧', x: 22, y: 50, s: 6, fx: 'drift' },
      { e: '🫧', x: 84, y: 44, s: 5, fx: 'drift-slow' },
      { e: '🪥', x: 86, y: 28, s: 8 },
    ],
    actorY: 26,
    actorSize: 26,
  },
  bedroom: {
    bg: 'linear-gradient(#c9a77d, #b48e62) 0 100% / 100% 26% no-repeat, repeating-linear-gradient(90deg, #e7f0ff 0 8%, #dde9ff 8% 16%)',
    props: [
      { e: '🛏️', x: 78, y: 26, s: 28 },
      { e: '🪟', x: 22, y: 64, s: 18 },
      { e: '🧸', x: 10, y: 26, s: 10 },
      { e: '🧦', x: 38, y: 6, s: 8 },
      { e: '👟', x: 58, y: 6, s: 9 },
    ],
    actorY: 28,
    actorSize: 26,
  },
  playroom: {
    bg: 'linear-gradient(#ffd1dc, #ffb8c9) 0 100% / 100% 24% no-repeat, radial-gradient(circle at 20% 30%, #fff 0 1.2%, transparent 1.4%) 0 0 / 14% 20%, linear-gradient(#fff3d1, #ffe8b0)',
    props: [
      { e: '🎈', x: 14, y: 56, s: 12, fx: 'drift-slow' },
      { e: '🎈', x: 88, y: 62, s: 10, fx: 'drift' },
      { e: '🧸', x: 84, y: 22, s: 12 },
      { e: '🪀', x: 14, y: 22, s: 8 },
      { e: '⭐', x: 50, y: 86, s: 5, fx: 'twinkle' },
    ],
    actorY: 22,
    actorSize: 30,
  },
  // ---------- City ----------
  city_street: {
    bg: `repeating-linear-gradient(90deg, #fff 0 8%, transparent 8% 16%) 0 88% / 100% 1.6% no-repeat, linear-gradient(#5f6672, #4b515c) 0 100% / 100% 26% no-repeat, linear-gradient(#bfc6cf, #bfc6cf) 0 74% / 100% 4% no-repeat, ${SKY_DAY}, #d7f1ff)`,
    props: [
      { e: '☁️', x: 30, y: 86, s: 11, fx: 'drift' },
      { e: '🏢', x: 12, y: 46, s: 22, fx: 'far' },
      { e: '🏬', x: 40, y: 46, s: 18, fx: 'far' },
      { e: '🏠', x: 66, y: 46, s: 15, fx: 'far' },
      { e: '🏢', x: 90, y: 46, s: 20, fx: 'far' },
      { e: '🌳', x: 54, y: 34, s: 9 },
      { e: '🚦', x: 84, y: 30, s: 9 },
    ],
    actorY: 6,
    actorSize: 30,
  },
  city_sky: {
    bg: `${SKY_DAY}, #bfe6ff 86%, #9ccf86 86%, #7ab865)`,
    props: [
      { e: '☀️', x: 86, y: 84, s: 11, fx: 'pulse' },
      { e: '☁️', x: 20, y: 70, s: 16, fx: 'drift' },
      { e: '☁️', x: 64, y: 54, s: 12, fx: 'drift-slow' },
      { e: '☁️', x: 40, y: 86, s: 9, fx: 'drift' },
      { e: '🏙️', x: 50, y: 4, s: 30, fx: 'far' },
      { e: '🐦', x: 70, y: 36, s: 4, fx: 'fly' },
    ],
    actorY: 30,
    actorSize: 22,
  },
  racetrack: {
    bg: `repeating-linear-gradient(90deg, #fff 0 5%, #e23 5% 10%) 0 74% / 100% 3% no-repeat, linear-gradient(#55595f, #3d4045) 0 100% / 100% 26% no-repeat, ${SKY_DAY}, #8ed06e 74%)`,
    props: [
      { e: '🏁', x: 8, y: 30, s: 11 },
      { e: '🏁', x: 92, y: 30, s: 11, flip: true },
      { e: '🏟️', x: 50, y: 48, s: 34, fx: 'far' },
      { e: '☁️', x: 24, y: 84, s: 11, fx: 'drift' },
      { e: '🎉', x: 76, y: 82, s: 6, fx: 'twinkle' },
    ],
    actorY: 5,
    actorSize: 28,
  },
};

const DEFAULT_SCENE: Scene = {
  bg: 'linear-gradient(160deg, #fff6dc, #e8fbf6)',
  props: [],
  actorY: 20,
  actorSize: 40,
};

export const SCENE_NAMES = Object.keys(SCENES);
export const MOTIONS = ['walk', 'prowl', 'trot', 'graze', 'run', 'sway', 'hammer', 'snip', 'paint', 'dig', 'steam', 'scrub', 'breathe', 'drive', 'drive_slow', 'race', 'fly'];

/** Build the animated scene for a prompt node. */
export function renderScene(node: PromptNode, alt: string): HTMLElement {
  const sc = (node.scene && SCENES[node.scene]) || DEFAULT_SCENE;
  const motion = node.motion && MOTIONS.includes(node.motion) ? node.motion : 'idle';

  const props = sc.props.map((p) =>
    h(
      'span',
      {
        class: `prop${p.fx ? ' fx-' + p.fx : ''}${p.flip ? ' flip' : ''}`,
        'aria-hidden': 'true',
        style: `left:${p.x}%;bottom:${p.y}%;--s:${p.s}`,
      },
      p.e,
    ),
  );

  const actors = [
    makeActor({ emoji: node.emoji, image: node.image, alt, motion, y: sc.actorY, size: sc.actorSize }),
    ...(node.companions ?? []).map((c) =>
      makeActor({
        emoji: c.emoji,
        image: c.image,
        alt: c.alt ?? '',
        motion: c.motion && MOTIONS.includes(c.motion) ? c.motion : motion,
        y: sc.actorY + (c.y ?? 0),
        size: sc.actorSize * (c.scale ?? 1),
        delay: c.delay,
        x: c.x,
      }),
    ),
  ];

  return h('div', { class: `scene scene-${node.scene ?? 'plain'}`, style: `background:${sc.bg}` }, props, actors);
}

interface ActorSpec {
  emoji?: string;
  image?: string;
  alt: string;
  motion: string;
  y: number;
  size: number;
  delay?: number; // seconds into the motion loop, so two actors stay apart
  x?: number; // fixed left % for actors that don't travel
}

// Drawn stand-ins for emoji that older phones can't show yet (they appear as a box).
const SVG_STANDINS: Record<string, string> = {
  '🪏': '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><rect x="29" y="4" width="6" height="34" rx="3" fill="#a0642c"/><rect x="22" y="2" width="20" height="7" rx="3.5" fill="#7a4a1e"/><path d="M18 38h28l-3 14c-1 6-6 10-11 10s-10-4-11-10z" fill="#8aa1b1" stroke="#5f7685" stroke-width="2"/></svg>',
};
const supportCache = new Map<string, boolean>();
/** True when this device draws the emoji in colour (not as an empty box). */
export function emojiSupported(e: string): boolean {
  if (supportCache.has(e)) return supportCache.get(e)!;
  let ok = true;
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      ctx.font = '28px sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText(e, 0, 0);
      const d = ctx.getImageData(0, 0, 32, 32).data;
      ok = false;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] > 0 && Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]) > 40) { ok = true; break; }
      }
    }
  } catch { ok = true; }
  supportCache.set(e, ok);
  return ok;
}

function emojiNode(emoji: string, alt: string): HTMLElement {
  const svg = SVG_STANDINS[emoji];
  if (svg && !emojiSupported(emoji)) return h('span', { class: 'e svg', role: 'img', 'aria-label': alt || null, html: svg });
  return h('span', { class: 'e', role: 'img', 'aria-label': alt || null }, emoji);
}

/** One moving picture: emoji now, ChatGPT picture later (swapped in when the PNG loads). */
function makeActor(a: ActorSpec): HTMLElement {
  const body = h('span', { class: 'body' }, emojiNode(a.emoji ?? '🖼️', a.alt));
  if (a.image) {
    const img = new Image();
    img.alt = a.alt;
    img.className = 'pic';
    img.onload = () => body.replaceChildren(img);
    img.src = a.image;
  }
  const delay = a.delay ? `animation-delay:${-a.delay}s;` : '';
  const actor = h(
    'div',
    { class: `actor m-${a.motion}`, style: `--y:${a.y};--s:${a.size};${a.x != null ? `left:${a.x}%;` : ''}${delay}` },
    h('div', { class: 'facing', style: delay || null }, body),
  );
  // Tap a picture and it jumps.
  actor.addEventListener('click', () => {
    body.classList.remove('boing');
    void body.offsetWidth; // restart the animation
    body.classList.add('boing');
  });
  return actor;
}
