// The game itself: builds the state, then advances it one fixed step. Screens,
// the loop and the DOM live in main.js; shots.js reuses this module so a
// screenshot is the same simulation a player gets.

import { CAR_TYPES, PISTOL, PLAYER, STEP } from './config.js';
import { createRandom } from './random.js';
import { createCity, PLACES } from './world.js';
import { createTraffic, nearestCar, updateTraffic } from './traffic.js';
import { createPedestrians, nearestPed, scarePeds, updatePeds } from './pedestrians.js';
import { EVENT_BUSTED, addHeat, updatePolice } from './police.js';
import { applyMouse, exitCar, stepDriving, stepOnFoot, tryEnterCar } from './player.js';
import { MISSION_DONE, MISSION_FAILED, missionInteract, startMission, updateMissions } from './missions.js';
import { createPickups, playerAttack, updatePickups, updateThugs } from './combat.js';
import { makePersonMesh } from './render.js';
import { ACT_ATTACK, ACT_INTERACT } from './input.js';

export function createGame(seed, render, audio) {
  const rng = createRandom(seed);
  const city = createCity(rng);
  const G = {
    seed,
    rng,
    city,
    render,
    audio,
    elapsed: 0,
    nextId: 1,
    screen: 'title',
    cameraOverride: null,
    storyComplete: false,
    cars: [],
    peds: [],
    cops: [],
    thugs: [],
    pickups: [],
    events: [],
    phone: [],
    interactPrompt: '',
    nextMissionTimer: 0,
    player: {
      x: PLACES.plaza.x + 6,
      z: PLACES.plaza.z + 6,
      y: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      yaw: Math.PI * 0.75,
      camYaw: Math.PI * 0.75,
      camPitch: 0.18,
      health: PLAYER.maxHealth,
      ammo: PISTOL.ammoStart,
      hasPistol: false,
      car: null,
      cash: 0,
      attackCooldown: 0,
    },
    wanted: { heat: 0, stars: 0, seen: false },
    mission: { index: 0, phase: 'idle', timer: 0, hasPackage: false, grabTimer: 0, waypoint: null },
    stats: { earned: 0, carsStolen: 0, missionsDone: 0 },
    save() {},
  };
  createTraffic(G);
  createPedestrians(G);
  createPickups(G);
  render.setPlayerMesh(makePersonMesh(0xc22e3d));
  return G;
}

/** Reset a game to a fresh state with the same seed (used by the shot stager). */
export function resetGame(G) {
  const fresh = createGame(G.seed, G.render, G.audio);
  for (const key of Object.keys(fresh)) {
    if (key === 'render' || key === 'audio' || key === 'save') continue;
    G[key] = fresh[key];
  }
  G.render.hideWaypoint();
}

/** What the player can do right here, shown as a prompt. */
function computePrompt(G) {
  const p = G.player;
  if (p.car) return 'F — Step out   •   Space — Handbrake';
  const m = G.mission;
  if (m.waypoint && (m.phase === 'pickup' || m.phase === 'bank')) {
    const d = Math.hypot(p.x - m.waypoint.x, p.z - m.waypoint.z);
    if (d < 4.5) return m.phase === 'pickup' ? 'E — Pick up the package' : 'E — Grab the cash';
  }
  if (nearestCar(G, p.x, p.z, 4.2, ['parked', 'traffic'])) return 'F — Steal car';
  if (nearestPed(G, p.x, p.z, 2.2)) return 'Click — Punch';
  return '';
}

/**
 * One fixed step. `input` is { move, sprint, jump, handbrake, mouse, actions }.
 * Returns a bitmask of EVENT_BUSTED (1), MISSION_DONE (2), MISSION_FAILED (4)
 * and EVENT_WASTED (8) — each flag its own bit, so a mission result is never
 * mistaken for a bust.
 */
export const EVENT_WASTED = 8;

export function stepGame(G, input, dt = STEP) {
  let flags = 0;
  G.elapsed += dt;
  const p = G.player;
  if (p.attackCooldown > 0) p.attackCooldown -= dt;

  if (input.mouse) applyMouse(G, input.mouse.dx, input.mouse.dy);

  if (input.actions & ACT_INTERACT) {
    if (!missionInteract(G)) tryEnterCar(G);
  }
  if (input.actions & ACT_ATTACK) playerAttack(G);

  if (p.car) stepDriving(G, dt, input.move, input.handbrake);
  else stepOnFoot(G, dt, input.move, input.sprint, input.jump);

  updateTraffic(G, dt);
  updatePeds(G, dt);
  const policeFlags = updatePolice(G, dt);
  if (policeFlags & EVENT_BUSTED) flags |= EVENT_BUSTED;
  updateThugs(G, dt);
  updatePickups(G);
  const missionFlags = updateMissions(G, dt);
  flags |= missionFlags;

  if (missionFlags & MISSION_DONE) {
    G.nextMissionTimer = 2.5;
  }
  if (G.nextMissionTimer > 0) {
    G.nextMissionTimer -= dt;
    if (G.nextMissionTimer <= 0 && G.mission.index < 5) {
      startMission(G, G.mission.index);
    }
  }

  G.interactPrompt = computePrompt(G);
  if (p.health <= 0) flags |= EVENT_WASTED;

  // Sound follows the state.
  if (p.car) G.audio.engineUpdate(Math.abs(p.car.speed) / CAR_TYPES[p.car.type].topSpeed);
  const sirenOn = G.wanted.stars > 0 && G.cars.some((c) => c.driver === 'police');
  G.audio.siren(sirenOn);
  return flags;
}
