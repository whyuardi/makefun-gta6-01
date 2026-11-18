// Take one screenshot: node tools/one-shot.mjs <shot> <file>

import { statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser, launchServer, openPage, sleep, waitFor } from './cdp.mjs';

const REPO = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const [shot, file] = process.argv.slice(2);
const server = await launchServer(REPO, 8080);
const browser = await launchBrowser(9222);
try {
  const session = await openPage(9222, `http://127.0.0.1:8080/?shot=${shot}&seed=7`);
  await waitFor(() => session.evaluate('window.__shotReady === true'), 60000, 500);
  await sleep(300);
  await session.screenshot(join(REPO, 'screenshots', file));
  const size = statSync(join(REPO, 'screenshots', file)).size;
  console.log(`${file} (${shot}): ${size} bytes, ${session.requests.length} requests, ${session.errors.length} errors`);
  for (const e of session.errors) console.log(`  ERROR: ${e}`);
  const outside = session.requests.filter((u) => !u.startsWith('http://127.0.0.1:8080') && !u.startsWith('data:') && u !== 'about:blank');
  for (const u of outside) console.log(`  NON-LOCAL: ${u}`);
  session.close();
} finally {
  await browser.close();
  await server.close();
}
