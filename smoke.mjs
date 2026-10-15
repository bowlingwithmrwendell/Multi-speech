// Browser smoke test: tap mode + voice mode (scripted fake recognizer).
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const out = process.argv[2] || '.';
const server = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { stdio: 'pipe' });
await new Promise((r) => { server.stdout.on('data', () => r()); server.stderr.on('data', (d) => process.stderr.write(d)); setTimeout(r, 4000); });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch({ headless: false, executablePath: '/opt/pw-browsers/chromium', args: ['--headless=new', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const errors = [];

const fastTTS = () => {
  window.speechSynthesis.speak = (u) => setTimeout(() => u.onend && u.onend(), 20);
  window.__spoken = [];
  const orig = window.speechSynthesis.speak;
  window.speechSynthesis.speak = (u) => { window.__spoken.push(u.text); orig(u); };
};

async function run(name, initScript, answer) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 860 }, permissions: ['microphone'] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${name} console: ${m.text()}`));
  await page.addInitScript(fastTTS);
  if (initScript) await page.addInitScript(initScript);
  await page.goto('http://localhost:4173/');
  await page.screenshot({ path: `${out}/${name}-1-home.png` });
  await page.click('text=Add a child');
  await page.fill('#pname', 'Ava');
  await page.screenshot({ path: `${out}/${name}-2-profile.png` });
  await page.click('button[type=submit]');
  await page.waitForSelector('.domain-card');
  await page.screenshot({ path: `${out}/${name}-3-modules.png` });
  await page.click('text=Savannah Animals');
  await page.waitForSelector('.stage');
  await page.screenshot({ path: `${out}/${name}-4-play.png` });
  await answer(page);
  await page.waitForSelector('.done', { timeout: 45000 }).catch(async (e) => { console.log(name, 'NOT DONE', await page.evaluate(() => [document.querySelector('.status')?.textContent, document.querySelector('.bubble.app')?.textContent, window.__spoken.slice(-6).join(' | ')])); throw e; });
  await page.screenshot({ path: `${out}/${name}-5-done.png` });
  await page.click('text=Grown-ups');
  await page.waitForSelector('.dash');
  await page.screenshot({ path: `${out}/${name}-6-dashboard.png`, fullPage: true });
  const spoken = await page.evaluate(() => window.__spoken);
  const rows = await page.$$eval('tbody tr', (t) => t.length);
  console.log(name, 'spoken lines:', spoken.length, 'table rows:', rows);
  console.log(spoken.slice(0, 8).join(' | '));
  await ctx.close();
}

// Tap mode: no SpeechRecognition available.
await run('tap', () => { delete window.webkitSpeechRecognition; delete window.SpeechRecognition; }, async (page) => {
  await page.click('text=▶ Start');
  // Pictures come in a random mix, so read the right answer from the picture's label.
  // The first turn is answered wrong on purpose (open question -> either/or question).
  let first = true;
  while (!(await page.$('.done'))) {
    const ready = await page.waitForFunction(() => document.querySelector('.done') || document.querySelector('.status')?.textContent?.includes('Tap or type'), null, { timeout: 20000 });
    if (await page.$('.done')) break;
    const answer = first ? 'banana' : await page.$eval('.scene .actor .e, .photo-scene .photo', (e) => e.getAttribute('aria-label') ?? e.getAttribute('alt'));
    first = false;
    await page.fill('.typebox input', answer);
    await page.click('.typebox button');
    await page.waitForTimeout(150);
  }
});

// Voice mode: fake recognizer that "hears" scripted answers.
await run('voice', () => {
  // First turn silent; after that "say" the picture's right answer.
  let i = 0;
  class FakeRec {
    start() {
      const text = i++ === 0 ? '' : 'it is ' + ((e) => e?.getAttribute('aria-label') ?? e?.getAttribute('alt') ?? '')(document.querySelector('.scene .actor .e, .photo-scene .photo'));
      setTimeout(() => {
        if (!text) return; // silence → wait-time timeout
        this.onspeechstart?.();
        this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: text, confidence: 0.91 }], { isFinal: true })] });
        this.onspeechend?.();
        this.onend?.();
      }, 400);
    }
    abort() {}
    stop() {}
  }
  window.webkitSpeechRecognition = FakeRec;
  window.SpeechRecognition = FakeRec;
}, async (page) => {
  await page.click('.mic');
});

console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
server.kill();
