// Tiny DOM helper — no framework needed for the MVP.
type Attrs = Record<string, string | number | boolean | null | undefined | EventListener>;
type Child = Node | string | number | null | undefined | false | Child[];

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'html') el.innerHTML = String(v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  append(el, children);
  return el;
}

function append(el: Node, children: Child[]): void {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/** Image with emoji fallback — shows the emoji until the ChatGPT artwork file exists. */
export function art(src: string | undefined, emoji: string | undefined, alt: string, cls = ''): HTMLElement {
  const fallback = h('span', { class: 'emoji', role: 'img', 'aria-label': alt }, emoji ?? '🖼️');
  if (!src) return fallback;
  const wrap = h('span', { class: cls }, fallback);
  const img = new Image();
  img.alt = alt;
  img.className = cls;
  img.onload = () => wrap.replaceWith(img);
  img.src = src;
  return wrap;
}

const AVATAR_COLORS = ['#5b4bdb', '#2ec4a5', '#ff6b6b', '#ffb627', '#4cc9f0', '#c86bfa'];
export function avatarColor(id: string): string {
  let n = 0;
  for (const ch of id) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}

export function fmtTier(t: string): string {
  return t.replace('_', ' ');
}
