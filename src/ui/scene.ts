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
  fx?: 'drift' | 'drift-slow' | 'fly' | 'sway' | 'pulse' | 'twinkle' | 'far' | 'fall' | 'snow';
  flip?: boolean;
  d?: number; // animation delay (s), so rain/snow don't fall in step
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
      { e: '🪞', x: 82, y: 56, s: 18 },
      { e: '🧼', x: 16, y: 28, s: 9 },
      { e: '🫧', x: 22, y: 50, s: 6, fx: 'drift' },
      { e: '🫧', x: 84, y: 44, s: 5, fx: 'drift-slow' },
      { e: '🪥', x: 28, y: 30, s: 7 },
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
  // ---------- More habitats ----------
  river: {
    bg: `${SAVANNAH_SKY}, #e3b65a 52%, #d1a24a 70%, #5cc0f0 70%, #3a93c7)`,
    props: [
      { e: '☀️', x: 84, y: 82, s: 11, fx: 'pulse' },
      { e: '🌳', x: 14, y: 42, s: 15, fx: 'far' },
      { e: '🌾', x: 4, y: 28, s: 10, fx: 'sway' },
      { e: '🌾', x: 94, y: 28, s: 10, fx: 'sway' },
      { e: '🐦', x: 40, y: 78, s: 5, fx: 'fly' },
    ],
    actorY: 6,
    actorSize: 30,
  },
  savannah_lake: {
    bg: `radial-gradient(ellipse 40% 12% at 50% 86%, #8fd0f2 0 92%, #63b3df 97%, transparent 100%), ${SAVANNAH_SKY}, #e3b65a 52%, #c58f35)`,
    props: [
      { e: '☀️', x: 14, y: 82, s: 11, fx: 'pulse' },
      { e: '☁️', x: 64, y: 84, s: 11, fx: 'drift' },
      { e: '🌳', x: 88, y: 44, s: 14, fx: 'far' },
      { e: '🌾', x: 8, y: 6, s: 10, fx: 'sway' },
      { e: '🌾', x: 92, y: 6, s: 10, fx: 'sway' },
    ],
    actorY: 12,
    actorSize: 28,
  },
  pond: {
    bg: `radial-gradient(ellipse 42% 14% at 50% 84%, #6cc6f0 0 92%, #3f9fd2 97%, transparent 100%), ${SKY_DAY}, #8fd36b 58%, #5fae45)`,
    props: [
      { e: '☁️', x: 24, y: 84, s: 12, fx: 'drift' },
      { e: '🌳', x: 86, y: 44, s: 18, fx: 'far' },
      { e: '🌾', x: 10, y: 8, s: 10, fx: 'sway' },
      { e: '🌿', x: 90, y: 8, s: 9, fx: 'sway' },
      { e: '🦋', x: 30, y: 62, s: 5, fx: 'fly' },
    ],
    actorY: 14,
    actorSize: 26,
  },
  underwater: {
    bg: 'linear-gradient(#f2d48f, #e0bb6a) 0 100% / 100% 14% no-repeat, radial-gradient(ellipse 60% 30% at 50% 0%, rgba(255,255,255,.35), transparent 70%), linear-gradient(#6fd6f5, #2a95cf 60%, #146aa8)',
    props: [
      { e: '🌿', x: 8, y: 8, s: 14, fx: 'sway' },
      { e: '🌿', x: 92, y: 8, s: 12, fx: 'sway' },
      { e: '🐚', x: 70, y: 4, s: 6 },
      { e: '🪨', x: 24, y: 3, s: 9 },
      { e: '🫧', x: 30, y: 50, s: 5, fx: 'drift' },
      { e: '🫧', x: 76, y: 64, s: 4, fx: 'drift-slow' },
      { e: '🐟', x: 20, y: 74, s: 5, fx: 'fly' },
    ],
    actorY: 30,
    actorSize: 30,
  },
  reef: {
    bg: 'linear-gradient(#f5d995, #e6bf6c) 0 100% / 100% 16% no-repeat, linear-gradient(#7fe0f2, #36a9d8 60%, #1a7fbf)',
    props: [
      { e: '🌿', x: 10, y: 10, s: 16, fx: 'sway' },
      { e: '🌿', x: 30, y: 10, s: 10, fx: 'sway' },
      { e: '🌿', x: 88, y: 10, s: 15, fx: 'sway' },
      { e: '🐚', x: 64, y: 6, s: 6 },
      { e: '🐡', x: 80, y: 70, s: 6, fx: 'drift' },
      { e: '🫧', x: 46, y: 60, s: 5, fx: 'drift-slow' },
    ],
    actorY: 26,
    actorSize: 28,
  },
  beach: {
    bg: 'linear-gradient(#8fd3ff, #d7f1ff 44%, #4fb6e8 44%, #2f97d2 56%, #f6dc9c 56%, #e5c070)',
    props: [
      { e: '☀️', x: 86, y: 84, s: 10, fx: 'pulse' },
      { e: '☁️', x: 30, y: 84, s: 11, fx: 'drift' },
      { e: '🌴', x: 10, y: 22, s: 24 },
      { e: '⛱️', x: 88, y: 12, s: 16 },
      { e: '🐚', x: 64, y: 4, s: 6 },
    ],
    actorY: 8,
    actorSize: 26,
  },
  ice: {
    bg: 'linear-gradient(#bfe6ff, #eaf7ff 50%, #ffffff 50%, #dceefa)',
    props: [
      { e: '🏔️', x: 22, y: 46, s: 28, fx: 'far' },
      { e: '🧊', x: 92, y: 8, s: 10 },
      { e: '❄️', x: 20, y: 100, s: 4, fx: 'snow' },
      { e: '❄️', x: 60, y: 100, s: 3, fx: 'snow', d: 3 },
      { e: '❄️', x: 86, y: 100, s: 4, fx: 'snow', d: 5 },
    ],
    actorY: 12,
    actorSize: 28,
  },
  railway: {
    bg: `repeating-linear-gradient(90deg, #7a5230 0 2.5%, transparent 2.5% 7%) 0 92% / 100% 6% no-repeat, linear-gradient(#8d939b, #8d939b) 0 89% / 100% 1.4% no-repeat, linear-gradient(#8d939b, #8d939b) 0 96% / 100% 1.4% no-repeat, ${SKY_DAY}, #8fd36b 58%, #5fae45)`,
    props: [
      { e: '☁️', x: 30, y: 84, s: 12, fx: 'drift' },
      { e: '⛰️', x: 74, y: 46, s: 26, fx: 'far' },
      { e: '🌳', x: 14, y: 40, s: 14, fx: 'far' },
      { e: '🏡', x: 46, y: 44, s: 10, fx: 'far' },
    ],
    actorY: 8,
    actorSize: 32,
  },
  lake: {
    bg: 'linear-gradient(#8fd3ff, #d7f1ff 52%, #5bbbe8 52%, #2f8fc8)',
    props: [
      { e: '☀️', x: 86, y: 84, s: 10, fx: 'pulse' },
      { e: '⛰️', x: 22, y: 46, s: 28, fx: 'far' },
      { e: '🌲', x: 52, y: 48, s: 10, fx: 'far' },
      { e: '🌲', x: 60, y: 48, s: 8, fx: 'far' },
      { e: '🐦', x: 40, y: 76, s: 4, fx: 'fly' },
    ],
    actorY: 22,
    actorSize: 26,
  },
  space: {
    bg: 'radial-gradient(circle at 30% 40%, #fff 0 .5%, transparent .8%) 0 0 / 17% 23%, radial-gradient(circle at 70% 70%, #fff 0 .4%, transparent .7%) 0 0 / 23% 19%, linear-gradient(#0b1240, #22205e 70%, #3b2f7a)',
    props: [
      { e: '🌙', x: 82, y: 74, s: 12, fx: 'pulse' },
      { e: '🪐', x: 20, y: 70, s: 12, fx: 'far' },
      { e: '⭐', x: 50, y: 86, s: 4, fx: 'twinkle' },
      { e: '⭐', x: 66, y: 50, s: 3, fx: 'twinkle', d: 1 },
      { e: '🌍', x: 14, y: 4, s: 22 },
    ],
    actorY: 6,
    actorSize: 22,
  },
  picnic: {
    bg: `${SKY_DAY}, #93d870 54%, #63b149)`,
    props: [
      { e: '☀️', x: 86, y: 84, s: 10, fx: 'pulse' },
      { e: '☁️', x: 34, y: 84, s: 11, fx: 'drift' },
      { e: '🌳', x: 12, y: 36, s: 26 },
      { e: '🧺', x: 82, y: 10, s: 13 },
      { e: '🦋', x: 60, y: 60, s: 5, fx: 'fly' },
      { e: '🌼', x: 30, y: 4, s: 6, fx: 'sway' },
    ],
    actorY: 12,
    actorSize: 26,
  },
  garden: {
    bg: `repeating-linear-gradient(0deg, #8a5a33 0 5%, #a06c3e 5% 10%) 0 100% / 100% 32% no-repeat, ${SKY_DAY}, #8ed46d 58%, #62ad49)`,
    props: [
      { e: '☀️', x: 14, y: 84, s: 10, fx: 'pulse' },
      { e: '🌻', x: 88, y: 30, s: 14, fx: 'sway' },
      { e: '🌷', x: 8, y: 30, s: 9, fx: 'sway' },
      { e: '🌱', x: 30, y: 6, s: 7, fx: 'sway' },
      { e: '🌱', x: 70, y: 6, s: 7, fx: 'sway' },
      { e: '🐝', x: 50, y: 70, s: 5, fx: 'fly' },
    ],
    actorY: 10,
    actorSize: 26,
  },
  classroom: {
    bg: 'linear-gradient(#c9a77d, #b48e62) 0 100% / 100% 22% no-repeat, linear-gradient(#2f5d4e, #2f5d4e) 50% 26% / 62% 40% no-repeat, linear-gradient(#8a5a33, #8a5a33) 50% 25% / 66% 46% no-repeat, linear-gradient(#fff3d6, #ffe9b8)',
    props: [
      { e: '📚', x: 8, y: 22, s: 11 },
      { e: '🖍️', x: 92, y: 22, s: 8 },
      { e: '🌎', x: 90, y: 74, s: 9 },
    ],
    actorY: 30,
    actorSize: 28,
  },
  clear_sky: {
    bg: 'linear-gradient(#6fc3ff, #c9ecff 80%, #93d870 80%, #63b149)',
    props: [
      { e: '☁️', x: 18, y: 66, s: 13, fx: 'drift' },
      { e: '☁️', x: 82, y: 54, s: 10, fx: 'drift-slow' },
      { e: '🌳', x: 50, y: 6, s: 10, fx: 'far' },
    ],
    actorY: 40,
    actorSize: 30,
  },
  night_sky: {
    bg: 'radial-gradient(circle at 30% 40%, #fff 0 .5%, transparent .8%) 0 0 / 17% 23%, radial-gradient(circle at 70% 70%, #fff 0 .4%, transparent .7%) 0 0 / 23% 19%, linear-gradient(#0d1b4c, #2a3f86 78%, #1f3b2a 78%, #142a1d)',
    props: [
      { e: '⭐', x: 16, y: 80, s: 4, fx: 'twinkle' },
      { e: '⭐', x: 84, y: 70, s: 3, fx: 'twinkle', d: 1 },
      { e: '🏡', x: 84, y: 8, s: 14, fx: 'far' },
      { e: '🌲', x: 12, y: 8, s: 12, fx: 'far' },
    ],
    actorY: 40,
    actorSize: 26,
  },
  sunny: {
    bg: `${SKY_DAY}, #93d870 62%, #63b149)`,
    props: [
      { e: '☁️', x: 80, y: 74, s: 10, fx: 'drift' },
      { e: '🌻', x: 12, y: 6, s: 12, fx: 'sway' },
      { e: '🌻', x: 88, y: 6, s: 10, fx: 'sway' },
      { e: '🦋', x: 30, y: 30, s: 5, fx: 'fly' },
    ],
    actorY: 44,
    actorSize: 30,
  },
  rainy: {
    bg: 'radial-gradient(ellipse 22% 5% at 70% 92%, #8fb9d6 0 90%, transparent 100%), linear-gradient(#7d8a99, #b8c2cc 60%, #6e9a5a 60%, #4f7d43)',
    props: [
      { e: '☁️', x: 20, y: 76, s: 18, fx: 'drift-slow' },
      { e: '☁️', x: 70, y: 80, s: 16, fx: 'drift' },
      { e: '💧', x: 14, y: 100, s: 4, fx: 'fall' },
      { e: '💧', x: 34, y: 100, s: 4, fx: 'fall', d: 0.5 },
      { e: '💧', x: 56, y: 100, s: 4, fx: 'fall', d: 1.1 },
      { e: '💧', x: 78, y: 100, s: 4, fx: 'fall', d: 0.3 },
      { e: '💧', x: 92, y: 100, s: 4, fx: 'fall', d: 0.8 },
    ],
    actorY: 10,
    actorSize: 30,
  },
  snowy: {
    bg: 'linear-gradient(#a9c6e0, #dcebf7 58%, #ffffff 58%, #e6f0f8)',
    props: [
      { e: '🌲', x: 12, y: 30, s: 20, fx: 'far' },
      { e: '🏡', x: 86, y: 34, s: 16, fx: 'far' },
      { e: '❄️', x: 10, y: 100, s: 4, fx: 'snow' },
      { e: '❄️', x: 32, y: 100, s: 3, fx: 'snow', d: 2 },
      { e: '❄️', x: 54, y: 100, s: 4, fx: 'snow', d: 4 },
      { e: '❄️', x: 74, y: 100, s: 3, fx: 'snow', d: 1 },
      { e: '❄️', x: 92, y: 100, s: 4, fx: 'snow', d: 3 },
    ],
    actorY: 10,
    actorSize: 30,
  },
  windy: {
    bg: `${SKY_DAY}, #93d870 70%, #63b149)`,
    props: [
      { e: '☁️', x: 30, y: 82, s: 12, fx: 'drift' },
      { e: '🌳', x: 86, y: 4, s: 24, fx: 'sway' },
      { e: '🍃', x: 20, y: 40, s: 5, fx: 'fly' },
      { e: '🍃', x: 50, y: 20, s: 4, fx: 'fly', d: 5 },
      { e: '🍃', x: 70, y: 56, s: 4, fx: 'fly', d: 9 },
    ],
    actorY: 44,
    actorSize: 24,
  },
  cloudy: {
    bg: 'linear-gradient(#a8c8e4, #e4eef7 76%, #93c47a 76%, #6aa356)',
    props: [
      { e: '☁️', x: 16, y: 72, s: 14, fx: 'drift-slow' },
      { e: '☁️', x: 84, y: 82, s: 12, fx: 'drift' },
      { e: '🌳', x: 80, y: 4, s: 14, fx: 'far' },
    ],
    actorY: 40,
    actorSize: 32,
  },
  stormy: {
    bg: 'linear-gradient(#3b4252, #5e6779 62%, #3e5a3a 62%, #2c4429)',
    props: [
      { e: '☁️', x: 20, y: 80, s: 18, fx: 'drift-slow' },
      { e: '☁️', x: 76, y: 82, s: 18, fx: 'drift' },
      { e: '💧', x: 12, y: 100, s: 4, fx: 'fall' },
      { e: '💧', x: 40, y: 100, s: 4, fx: 'fall', d: 0.7 },
      { e: '💧', x: 88, y: 100, s: 4, fx: 'fall', d: 0.4 },
      { e: '🏡', x: 84, y: 6, s: 12, fx: 'far' },
    ],
    actorY: 30,
    actorSize: 30,
  },
  rainbow_sky: {
    bg: `${SKY_DAY}, #93d870 66%, #63b149)`,
    props: [
      { e: '☁️', x: 14, y: 46, s: 14, fx: 'drift-slow' },
      { e: '☁️', x: 86, y: 44, s: 14, fx: 'drift' },
      { e: '🌼', x: 30, y: 6, s: 6, fx: 'sway' },
      { e: '🌷', x: 70, y: 6, s: 6, fx: 'sway' },
    ],
    actorY: 34,
    actorSize: 44,
  },
};

const DEFAULT_SCENE: Scene = {
  bg: 'linear-gradient(160deg, #fff6dc, #e8fbf6)',
  props: [],
  actorY: 20,
  actorSize: 40,
};

export const SCENE_NAMES = Object.keys(SCENES);
export const MOTIONS = ['walk', 'prowl', 'trot', 'graze', 'run', 'sway', 'hammer', 'snip', 'paint', 'dig', 'steam', 'scrub', 'breathe', 'drive', 'drive_slow', 'race', 'fly', 'swim', 'hover', 'launch', 'float', 'flash', 'twist', 'sail'];

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
        style: `left:${p.x}%;bottom:${p.y}%;--s:${p.s};${p.d ? `animation-delay:${-p.d}s;` : ''}`,
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
