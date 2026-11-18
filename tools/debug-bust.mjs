// Focused probe: replay the playtest up to the decay staging, then step
// 0.25 s at a time and log cop distances / bust timers / screen.
// Run: node tools/debug-bust.mjs

import { launchBrowser, launchServer, openPage, sleep, waitFor } from './cdp.mjs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const BASE = 'http://127.0.0.1:8080';

const server = await launchServer(REPO, 8080);
const browser = await launchBrowser(9222, '320,180');
try {
  const s = await openPage(9222, `${BASE}/?seed=7`);
  await waitFor(() => s.evaluate('!!window.__solmar'), 30000);
  const state = () => s.evaluate(`(() => { const G = window.__solmar.G; return { screen: G.screen, heat: G.wanted.heat, stars: G.wanted.stars, seen: G.wanted.seen, health: G.player.health, inCar: !!G.player.car, px: G.player.x.toFixed(1), pz: G.player.z.toFixed(1), mission: G.mission.index + '/' + G.mission.phase, cops: G.cops.map((c) => ({ d: Math.hypot(c.x - G.player.x, c.z - G.player.z).toFixed(1), bt: (c.bustTimer || 0).toFixed(2) })), police: G.cars.filter((c) => c.driver === 'police').length, nextTimer: (G.nextMissionTimer || 0).toFixed(2) }; })()`);

  await s.keyPress('Enter', 'Enter', 13);
  await s.evaluate('window.__solmar.pump(0.5)');
  console.log('start', JSON.stringify(await state()));

  // Walk, steal, drive, deliver — same as the playtest.
  await s.keyDown('KeyW', 'w', 87);
  await s.evaluate('window.__solmar.pump(2)');
  await s.keyUp('KeyW', 'w', 87);
  await s.evaluate(`(() => { const G = window.__solmar.G; const car = G.cars.find((c) => c.driver === 'parked'); G.player.x = car.x + 2; G.player.z = car.z; })()`);
  await s.evaluate('window.__solmar.pump(0.3)');
  await s.keyPress('KeyF', 'f', 70);
  await s.evaluate('window.__solmar.pump(0.5)');
  console.log('after steal', JSON.stringify(await state()));
  await s.keyDown('KeyW', 'w', 87);
  await s.evaluate('window.__solmar.pump(3)');
  await s.keyUp('KeyW', 'w', 87);
  console.log('after drive', JSON.stringify(await state()));
  await s.evaluate(`(() => { const G = window.__solmar.G; const wp = G.mission.waypoint; const car = G.player.car; if (!car || !wp) return; car.x = wp.x + 12; car.z = wp.z; car.angle = -Math.PI / 2; car.speed = 0; })()`);
  await s.evaluate('window.__solmar.pump(0.3)');
  await s.keyDown('KeyW', 'w', 87);
  await s.evaluate('window.__solmar.pump(2.5)');
  await s.keyUp('KeyW', 'w', 87);
  await s.evaluate('window.__solmar.pump(0.5)');
  console.log('after delivery', JSON.stringify(await state()));

  // Decay staging, exactly as the playtest does it.
  await s.evaluate(`(() => { const G = window.__solmar.G; const car = G.player.car; if (car) { car.driver = 'parked'; car.speed = 0; G.player.x = car.x + 2; G.player.z = car.z; G.player.car = null; } G.wanted.heat = 2; G.cops = []; G.cars = G.cars.filter((c) => c.driver !== 'police'); G.player.x = 250; G.player.z = 250; return G.wanted.heat; })()`);
  console.log('after staging', JSON.stringify(await state()));
  for (let i = 0; i < 6; i += 1) {
    await s.evaluate('window.__solmar.pump(0.25)');
    console.log(`pump ${(i + 1) * 0.25}s`, JSON.stringify(await state()));
  }
  s.close();
} finally {
  await browser.close();
  await server.close();
}
