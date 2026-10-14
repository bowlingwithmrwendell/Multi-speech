// Regenerates IMAGE_LIST.md from the content modules: `node scripts/gen-image-list.mjs`
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

const dir = 'src/content/modules';
const out = [
  '# Image list for MultiPlay Speech',
  '',
  'Create each image in ChatGPT, then save it as a PNG at the exact path below, inside the `public/` folder.',
  'Until a file exists, the app shows the matching emoji instead, so you can add the images one at a time.',
  '',
  "**Style for every image:** bright, friendly children's picture-book illustration; simple shapes; soft colors; plain or lightly textured background; no text or letters in the image; landscape 4:3 (e.g. 1536×1152).",
  '',
  'The second column is what the app says while the picture is on screen, so the image should match it.',
  '',
];
let count = 0;
for (const f of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  const m = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
  const seen = new Map();
  if (m.cover_image) seen.set(m.cover_image, `Cover art for the "${m.title}" pack (${m.domain})`);
  for (const n of Object.values(m.prompt_tree.nodes)) if (n.image && !seen.has(n.image)) seen.set(n.image, n.tts_template);
  out.push(`## ${m.title} (${m.language})`, '', '| Save as | What the picture should show |', '|---|---|');
  for (const [k, v] of seen) out.push(`| \`public/${k}\` | ${v} |`);
  out.push('');
  count += seen.size;
}
writeFileSync('IMAGE_LIST.md', out.join('\n'));
console.log(`IMAGE_LIST.md: ${count} images`);
