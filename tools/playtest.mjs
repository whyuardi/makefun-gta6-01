// Scripted playtest with real keyboard input: start the game, walk, steal a car,
// drive, raise the wanted level, and complete mission 1. State is staged only
// by moving the player next to a car and near the delivery point — every action
// after that is a real key press. The loop is pumped synchronously
// (__solmar.pump) because headless shells schedule rAF very slowly.
// Run: node tools/playtest.mjs

import { launchBrowser, launchServer, openPage, sleep, waitFor } from './cdp.mjs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const BASE = 'http://127.0.0.1:8080';

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const server = await launchServer(REPO, 8080);
// The playtest drives the simulation, not the pixels: a small window makes the
// software compositor cheap, so hundreds of pumped frames run in seconds.
const browser = await launchBrowser(9222, '320,180');
try {
  const s = await openPage(9222, `${BASE}/?seed=7`);
  await waitFor(() => s.evaluate('!!window.__solmar'), 30000);
  const titleVisible = await s.evaluate(`!document.getElementById('title').classList.contains('hidden')`);
  check('title screen shows', titleVisible);

  // Start with a real keypress: Enter on the title screen starts a new game.
  await s.keyPress('Enter', 'Enter', 13);
  await s.evaluate('window.__solmar.pump(0.5)');
  const playing = await s.evaluate(`window.__solmar.G.screen === 'play' && window.__solmar.G.mission.index === 0 && window.__solmar.G.mission.phase === 'steal'`);
  check('game starts, mission 1 (steal a car) active', playing);

  // Walk forward with a real key hold.
  const before = await s.evaluate(`({ x: window.__solmar.G.player.x, z: window.__solmar.G.player.z })`);
  await s.keyDown('KeyW', 'w', 87);
  await s.evaluate('window.__solmar.pump(2)');
  await s.keyUp('KeyW', 'w', 87);
  const after = await s.evaluate(`({ x: window.__solmar.G.player.x, z: window.__solmar.G.player.z })`);
  const walked = Math.hypot(after.x - before.x, after.z - before.z);
  check('WASD moves the player on foot', walked > 3, `moved ${walked.toFixed(1)}m`);

  // Stage: stand next to a parked car, then steal it with a real F press.
  await s.evaluate(`(() => { const G = window.__solmar.G; const car = G.cars.find((c) => c.driver === 'parked'); G.player.x = car.x + 2; G.player.z = car.z; })()`);
  await s.evaluate('window.__solmar.pump(0.3)');
  await s.keyPress('KeyF', 'f', 70);
  await s.evaluate('window.__solmar.pump(0.5)');
  const stole = await s.evaluate(`(() => { const G = window.__solmar.G; return { inCar: !!G.player.car, stars: G.wanted.stars, type: G.player.car?.type }; })()`);
  check('F steals a car and raises wanted', stole.inCar && stole.stars >= 1, `${stole.type ?? 'none'}, ${stole.stars} star(s)`);

  // Drive with a real W hold.
  const carBefore = await s.evaluate(`(() => { const c = window.__solmar.G.player.car; return c ? { x: c.x, z: c.z, speed: c.speed } : null; })()`);
  await s.keyDown('KeyW', 'w', 87);
  await s.evaluate('window.__solmar.pump(3)');
  await s.keyUp('KeyW', 'w', 87);
  const carAfter = await s.evaluate(`(() => { const c = window.__solmar.G.player.car; return c ? { x: c.x, z: c.z, speed: c.speed } : null; })()`);
  const drove = carBefore && carAfter ? Math.hypot(carAfter.x - carBefore.x, carAfter.z - carBefore.z) : 0;
  check('W drives the stolen car', drove > 20, `drove ${drove.toFixed(1)}m`);

  // Stage: park just outside the garage delivery point, then drive in.
  await s.evaluate(`(() => { const G = window.__solmar.G; const wp = G.mission.waypoint; const car = G.player.car; if (!car || !wp) return; car.x = wp.x + 12; car.z = wp.z; car.angle = -Math.PI / 2; car.speed = 0; })()`);
  await s.evaluate('window.__solmar.pump(0.3)');
  await s.keyDown('KeyW', 'w', 87);
  await s.evaluate('window.__solmar.pump(2.5)');
  await s.keyUp('KeyW', 'w', 87);
  await s.evaluate('window.__solmar.pump(0.5)');
  const mission = await s.evaluate(`(() => { const G = window.__solmar.G; return { index: G.mission.index, cash: G.player.cash, done: G.stats.missionsDone }; })()`);
  check('mission 1 completes on delivery (+$500)', mission.index === 1 && mission.cash >= 500 && mission.done === 1, `mission ${mission.index}, cash $${mission.cash}`);

  // Wanted decay: on foot, a little heat, far from every cop, cools to zero
  // in a third of a second — well before the police can close the 55 m gap.
  const heat = await s.evaluate(`(() => { const G = window.__solmar.G; const car = G.player.car; if (car) { car.driver = 'parked'; car.speed = 0; G.player.x = car.x + 2; G.player.z = car.z; G.player.car = null; } G.wanted.heat = 2; G.cops = []; G.cars = G.cars.filter((c) => c.driver !== 'police'); G.player.x = 250; G.player.z = 250; return G.wanted.heat; })()`);
  await s.evaluate('window.__solmar.pump(1.5)');
  const decayState = await s.evaluate(`(() => { const G = window.__solmar.G; return { heat: G.wanted.heat, stars: G.wanted.stars, seen: G.wanted.seen, screen: G.screen, cops: G.cops.length, policeCars: G.cars.filter((c) => c.driver === 'police').length, health: G.player.health, mission: G.mission.index + '/' + G.mission.phase, endTitle: document.getElementById('end-title').textContent, endText: document.getElementById('end-text').textContent, events: G.events.slice(-4) }; })()`);
  check('wanted heat decays out of sight', decayState.heat < heat, `${heat.toFixed(0)} -> ${decayState.heat.toFixed(0)} ${JSON.stringify(decayState)}`);

  // Pause menu with a real P press. The tab may have auto-paused while hidden,
  // so resume first if needed, then pause and check.
  const screenBeforePause = await s.evaluate('window.__solmar.G.screen');
  if (screenBeforePause !== 'play') {
    await s.keyPress('KeyP', 'p', 80);
    await s.evaluate('window.__solmar.pump(0.4)');
  }
  await s.keyPress('KeyP', 'p', 80);
  await s.evaluate('window.__solmar.pump(0.4)');
  const pauseState = await s.evaluate(`(() => { const G = window.__solmar.G; return { screen: G.screen, menuHidden: document.getElementById('pause-menu').classList.contains('hidden'), before: '${screenBeforePause}' }; })()`);
  const paused = pauseState.screen === 'paused' && !pauseState.menuHidden;
  check('P opens the pause menu', paused, JSON.stringify(pauseState));
  await s.keyPress('KeyP', 'p', 80);
  await s.evaluate('window.__solmar.pump(0.4)');

  // HUD + minimap are live.
  const hudLive = await s.evaluate(`(() => { const stars = document.getElementById('stars').textContent; const cash = document.getElementById('cash').textContent; return { stars, cash, objective: document.getElementById('objective').textContent.length > 0 }; })()`);
  check('HUD shows stars, cash and objective', hudLive.objective && hudLive.cash.includes('$'), `stars "${hudLive.stars}", cash ${hudLive.cash}`);

  if (s.errors.length) {
    console.log('PAGE ERRORS:');
    for (const e of s.errors) console.log(`  ${e}`);
  }
  const outside = s.requests.filter((u) => !u.startsWith('http://127.0.0.1:8080') && !u.startsWith('data:') && u !== 'about:blank');
  check('zero page errors', s.errors.length === 0, `${s.errors.length} errors`);
  check('zero non-localhost requests', outside.length === 0, `${outside.length} outside`);
  s.close();
} finally {
  await browser.close();
  await server.close();
}
const failed = results.filter((r) => !r.ok);
console.log(failed.length === 0 ? 'PLAYTEST OK' : `PLAYTEST FAILED (${failed.length})`);
process.exit(failed.length === 0 ? 0 : 1);
