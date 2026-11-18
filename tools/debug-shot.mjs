// Debug probe: open one shot page and report what happens — errors, whether
// __shotReady appears, and how fast frames run. Run: node tools/debug-shot.mjs [shot]

import { launchBrowser, launchServer, openPage, sleep } from './cdp.mjs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const shot = process.argv[2] || 'drive';
const server = await launchServer(REPO, 8080);
const browser = await launchBrowser(9222);
try {
  const s = await openPage(9222, `http://127.0.0.1:8080/?shot=${shot}&seed=7`);
  // Count animation frames in the page to measure render speed.
  await s.evaluate(`window.__frames = 0; (function tick() { window.__frames++; requestAnimationFrame(tick); })();`);
  for (let i = 0; i < 12; i += 1) {
    await sleep(10000);
    const state = await s.evaluate(`({ ready: window.__shotReady === true, frames: window.__frames, solmar: !!window.__solmar, title: document.title, bodyText: document.body.innerText.slice(0, 200) })`).catch((e) => ({ error: e.message }));
    console.log(`t+${(i + 1) * 10}s`, JSON.stringify(state));
    console.log('  errors so far:', JSON.stringify(s.errors.slice(0, 5)));
    if (state.ready) break;
  }
  console.log('requests:', JSON.stringify(s.requests.slice(0, 10)));
  s.close();
} finally {
  await browser.close();
  await server.close();
}
