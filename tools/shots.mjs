// Takes the entry's four screenshots in headless Chromium: the cover (driving
// through the city), an on-foot street scene, a police chase, and the title
// screen. Asserts zero page errors and zero network requests outside localhost,
// and prints each file's size. Run: node tools/shots.mjs

import { statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser, launchServer, openPage, sleep, waitFor } from './cdp.mjs';

const REPO = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const BASE = 'http://127.0.0.1:8080';

const SHOTS = [
  { shot: 'drive', file: '1-drive.jpg' },
  { shot: 'street', file: '2-street.jpg' },
  { shot: 'chase', file: '3-chase.jpg' },
  { shot: 'title', file: '4-mission.jpg' },
];

const server = await launchServer(REPO, 8080);
const browser = await launchBrowser(9222);
function log(...args) {
  console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...args);
}
let failed = false;
try {
  const probe = await openPage(9222, `${BASE}/?shot=drive&seed=7`);
  const webgl = await probe.evaluate(`(() => { const c = document.createElement('canvas'); return !!c.getContext('webgl2'); })()`);
  log(`webgl2 available in headless shell: ${webgl}`);
  probe.close();

  for (const { shot, file } of SHOTS) {
    log(`opening ${shot}...`);
    const session = await openPage(9222, `${BASE}/?shot=${shot}&seed=7`);
    log(`${shot}: page loaded, waiting for __shotReady`);
    await waitFor(() => session.evaluate('window.__shotReady === true'), 60000, 500);
    await sleep(300);
    log(`${shot}: capturing screenshot`);
    await session.screenshot(join(REPO, 'screenshots', file));
    const size = statSync(join(REPO, 'screenshots', file)).size;
    const outside = session.requests.filter((u) => !u.startsWith('http://127.0.0.1:8080') && !u.startsWith('http://localhost:8080') && !u.startsWith('data:') && u !== 'about:blank');
    console.log(`${file} (${shot}): ${size} bytes, ${session.requests.length} requests, ${session.errors.length} errors`);
    if (session.errors.length) {
      failed = true;
      for (const e of session.errors) console.log(`  ERROR: ${e}`);
    }
    if (outside.length) {
      failed = true;
      for (const u of outside) console.log(`  NON-LOCAL REQUEST: ${u}`);
    }
    if (size > 262144) {
      failed = true;
      console.log(`  OVERSIZE: ${size} > 262144`);
    }
    session.close();
  }
} finally {
  await browser.close();
  await server.close();
}
if (failed) {
  console.log('SHOTS FAILED');
  process.exit(1);
}
console.log('SHOTS OK');
