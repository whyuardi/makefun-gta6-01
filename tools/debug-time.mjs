// Timing probe: how long does one render.draw take, and how long does one
// rAF interval take? Run: node tools/debug-time.mjs [shot]

import { launchBrowser, launchServer, openPage, sleep } from './cdp.mjs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const shot = process.argv[2] || 'drive';
const server = await launchServer(REPO, 8080);
const browser = await launchBrowser(9222);
try {
  const s = await openPage(9222, `http://127.0.0.1:8080/?shot=${shot}&seed=7`);
  await sleep(5000);
  const drawMs = await s.evaluate(`(() => { const t0 = performance.now(); window.__render.draw(window.__solmar.G, 1/60); return performance.now() - t0; })()`);
  console.log('one render.draw:', drawMs.toFixed(0), 'ms');
  const drawMs2 = await s.evaluate(`(() => { const t0 = performance.now(); window.__render.draw(window.__solmar.G, 1/60); return performance.now() - t0; })()`);
  console.log('second render.draw:', drawMs2.toFixed(0), 'ms');
  const info = await s.evaluate(`(() => { const r = window.__render.renderer; return { calls: r.info.render.calls, triangles: r.info.render.triangles, geometries: r.info.memory.geometries, textures: r.info.memory.textures }; })()`);
  console.log('renderer info:', JSON.stringify(info));
  const noShadow = await s.evaluate(`(() => { const r = window.__render.renderer; r.shadowMap.enabled = false; const t0 = performance.now(); window.__render.draw(window.__solmar.G, 1/60); const dt = performance.now() - t0; r.shadowMap.enabled = true; return dt; })()`);
  console.log('one draw with shadows off:', noShadow.toFixed(0), 'ms');
  s.close();
} finally {
  await browser.close();
  await server.close();
}
