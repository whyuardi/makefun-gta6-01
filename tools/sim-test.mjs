// Headless logic test for the pure simulation: wanted-level math, the police
// bust, and the full five-mission state machine. No browser, no three.js —
// these modules import nothing the DOM owns. Run: node tools/sim-test.mjs

import { computeStars, addHeat, updatePolice, EVENT_BUSTED } from '../game/src/police.js';
import { MISSION_DONE, MISSION_FAILED, missionInteract, startMission, updateMissions } from '../game/src/missions.js';
import { createRandom } from '../game/src/random.js';
import { createCity, PLACES } from '../game/src/world.js';
import { STEP } from '../game/src/config.js';

let passed = 0;
let failed = 0;
function check(name, ok, detail = '') {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function stubGame() {
  const rng = createRandom(1);
  const city = createCity(rng);
  return {
    rng,
    city,
    nextId: 1,
    cars: [],
    peds: [],
    cops: [],
    thugs: [],
    pickups: [],
    events: [],
    phone: [],
    elapsed: 0,
    player: { x: 0, z: 0, y: 0, vx: 0, vy: 0, vz: 0, yaw: 0, camYaw: 0, camPitch: 0, health: 100, ammo: 24, hasPistol: false, car: null, cash: 0, attackCooldown: 0 },
    wanted: { heat: 0, stars: 0, seen: false },
    mission: { index: 0, phase: 'idle', timer: 0, hasPackage: false, grabTimer: 0, waypoint: null },
    stats: { earned: 0, carsStolen: 0, missionsDone: 0 },
    storyComplete: false,
    render: { setWaypoint() {}, hideWaypoint() {}, addShake() {}, spawnParticle() {} },
    audio: { blip() {}, thud() {}, siren() {}, engineUpdate() {}, engineStart() {}, engineStop() {} },
    save() {},
  };
}

function at(G, x, z) {
  G.player.x = x;
  G.player.z = z;
  if (G.player.car) {
    G.player.car.x = x;
    G.player.car.z = z;
  }
}

// --- Step flags: one bit each, or a mission result reads as a bust ---
// Regression: MISSION_DONE used to equal EVENT_BUSTED (both 1), so finishing
// a job showed the BUSTED screen. A mission-done flag must never set the
// bust bit, and no two flags may share a bit.
check('step flags are distinct bits', (MISSION_DONE & EVENT_BUSTED) === 0 && (MISSION_FAILED & EVENT_BUSTED) === 0 && (MISSION_DONE & MISSION_FAILED) === 0 && MISSION_DONE !== 0 && MISSION_FAILED !== 0 && EVENT_BUSTED !== 0, `DONE=${MISSION_DONE} FAILED=${MISSION_FAILED} BUSTED=${EVENT_BUSTED}`);
// Mirrors the startup assertion in game.js: every flag must be a single bit
// (a power of two) — a flag with two bits set would alias two outcomes at once.
const isSingleBit = (f) => f !== 0 && (f & (f - 1)) === 0;
check('step flags are each a single bit (power of two)', isSingleBit(EVENT_BUSTED) && isSingleBit(MISSION_DONE) && isSingleBit(MISSION_FAILED), `BUSTED=${EVENT_BUSTED} DONE=${MISSION_DONE} FAILED=${MISSION_FAILED}`);

// --- Wanted math ---
check('stars: 0 heat is clean', computeStars(0) === 0);
check('stars: 1 heat is 1 star', computeStars(1) === 1);
check('stars: 20 heat is 1 star', computeStars(20) === 1);
check('stars: 21 heat is 2 stars', computeStars(21) === 2);
check('stars: 41 heat is 3 stars', computeStars(41) === 3);
check('stars: 100 heat caps at 5', computeStars(100) === 5);

// --- addHeat ---
{
  const G = stubGame();
  addHeat(G, 25);
  check('stealing a car gives 2 stars', G.wanted.stars === 2, `heat ${G.wanted.heat}`);
  addHeat(G, 80);
  check('heat caps at 100 / 5 stars', G.wanted.heat === 100 && G.wanted.stars === 5);
}

// --- Wanted decay out of sight ---
{
  const G = stubGame();
  G.wanted.heat = 30;
  G.wanted.stars = 2;
  updatePolice(G, 1);
  check('heat decays with no police around', G.wanted.heat < 30, `30 -> ${G.wanted.heat.toFixed(1)}`);
}
{
  // Fresh game: no police cars spawned yet, so nobody can see the player.
  const G = stubGame();
  G.wanted.heat = 2;
  G.wanted.stars = 1;
  updatePolice(G, 1);
  check('heat reaching 0 clears the stars', G.wanted.heat === 0 && G.wanted.stars === 0);
}

// --- A cop holding the player busts them ---
{
  const G = stubGame();
  G.wanted.heat = 25;
  G.wanted.stars = 2;
  G.cops.push({ id: 9, x: 0.5, z: 0.5, angle: 0, speed: 0, bustTimer: 0, hitCooldown: 0 });
  let flags = 0;
  for (let i = 0; i < 4; i += 1) flags |= updatePolice(G, 0.5);
  check('cop holding the player for 1.4s busts them', (flags & EVENT_BUSTED) !== 0);
}

// --- Mission 1: steal and deliver ---
{
  const G = stubGame();
  startMission(G, 0);
  check('M1 starts in steal phase', G.mission.phase === 'steal');
  G.player.car = { id: 1, type: 'sedan', x: 0, z: 0, angle: 0, speed: 0 };
  updateMissions(G, STEP);
  check('M1 moves to deliver once in a car', G.mission.phase === 'deliver' && G.mission.waypoint?.label.includes('Garage'));
  at(G, PLACES.garage.x, PLACES.garage.z);
  const flags = updateMissions(G, STEP);
  check('M1 completes at the garage (+$500)', (flags & MISSION_DONE) !== 0 && G.player.cash === 500 && G.mission.index === 1);
}

// --- Mission 2: package pickup and drop ---
{
  const G = stubGame();
  startMission(G, 1);
  at(G, PLACES.marinaKiosk.x, PLACES.marinaKiosk.z);
  check('M2 pickup consumes E at the kiosk', missionInteract(G) === true && G.mission.phase === 'deliver');
  at(G, PLACES.palmCourt.x, PLACES.palmCourt.z);
  const flags = updateMissions(G, STEP);
  check('M2 completes at Palm Court (+$750)', (flags & MISSION_DONE) !== 0 && G.player.cash === 750);
}

// --- Mission 3: lose the heat ---
{
  const G = stubGame();
  startMission(G, 2);
  check('M3 starts with 2 stars', G.wanted.stars === 2, `heat ${G.wanted.heat}`);
  G.wanted.heat = 0;
  const flags = updateMissions(G, STEP);
  check('M3 completes when the heat is gone (+$1000)', (flags & MISSION_DONE) !== 0 && G.player.cash === 1000);
}

// --- Mission 4: timed run, and the timeout fail ---
{
  const G = stubGame();
  startMission(G, 3);
  at(G, PLACES.plaza.x, PLACES.plaza.z);
  check('M4 pickup at the plaza starts the 90s clock', missionInteract(G) === true && G.mission.timer === 90);
  at(G, PLACES.docks.x, PLACES.docks.z);
  const flags = updateMissions(G, STEP);
  check('M4 completes at the docks (+$1500)', (flags & MISSION_DONE) !== 0 && G.player.cash === 1500);

  const G2 = stubGame();
  startMission(G2, 3);
  G2.mission.timer = 0.05;
  const failFlags = updateMissions(G2, 0.1);
  check('M4 fails when the clock runs out', (failFlags & MISSION_FAILED) !== 0);
}

// --- Mission 5: the big one ---
{
  const G = stubGame();
  startMission(G, 4);
  at(G, PLACES.bank.x, PLACES.bank.z);
  check('M5 grab starts at the bank', missionInteract(G) === true && G.mission.phase === 'grab');
  updateMissions(G, 2.1);
  check('M5 grab spawns thugs and 3 stars', G.mission.phase === 'escape' && G.thugs.length === 4 && G.wanted.stars === 3);
  at(G, PLACES.getaway.x, PLACES.getaway.z);
  const flags = updateMissions(G, STEP);
  check('M5 completes at the getaway (+$5000) and ends the story', (flags & MISSION_DONE) !== 0 && G.player.cash === 5000 && G.storyComplete === true);
}

console.log(failed === 0 ? `SIM TEST OK (${passed} checks)` : `SIM TEST FAILED (${failed} of ${passed + failed})`);
process.exit(failed === 0 ? 0 : 1);
