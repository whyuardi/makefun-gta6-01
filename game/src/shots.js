// The screenshot scenes behind ?shot=title|street|drive|chase|mission. Each one
// resets the game to the fixed seed, starts the real rules, and drives them
// forward with scripted inputs for a fixed number of steps — so the frame is
// what a short game really looks like, and the same seed always gives the
// same frame.

import { STEP } from './config.js';
import { resetGame, stepGame } from './game.js';
import { startMission } from './missions.js';
import { addHeat } from './police.js';
import { spawnCar } from './traffic.js';
import { tryEnterCar } from './player.js';
import { PLACES } from './world.js';

const IDLE = { move: { f: 0, s: 0 }, sprint: false, jump: false, handbrake: false, mouse: null, actions: 0 };
const DRIVE = { move: { f: 1, s: 0 }, sprint: false, jump: false, handbrake: false, mouse: null, actions: 0 };
const WALK = { move: { f: 0.7, s: 0 }, sprint: false, jump: false, handbrake: false, mouse: null, actions: 0 };

function steps(G, input, seconds) {
  for (let i = 0; i < seconds / STEP; i += 1) stepGame(G, input, STEP);
}

/** Put the player on Coral Avenue (the z = 0 road), facing east, and steal a car there. */
function stealOnAvenue(G, type, x) {
  const p = G.player;
  p.x = x - 2;
  p.z = -2.5;
  p.camYaw = Math.PI / 2;
  p.yaw = Math.PI / 2;
  spawnCar(G, type, x, -2.5, Math.PI / 2, 'parked');
  tryEnterCar(G);
}

/** A traffic car on the avenue: it needs its road-graph nodes to drive. */
function avenueTraffic(G, type, x, z, angle) {
  const car = spawnCar(G, type, x, z, angle, 'traffic');
  // The avenue is row j = 5 (z = 0); the car heads for the next intersection.
  const i = Math.max(0, Math.min(10, Math.round((x + 290) / 58)));
  const east = angle === Math.PI / 2;
  car.prev = G.city.nodeAt(east ? i : i + 1, 5);
  car.node = G.city.nodeAt(east ? Math.min(10, i + 1) : Math.max(0, i), 5);
  car.speed = car.cruise;
  return car;
}

/**
 * Set `G` to the named scene and return the screen to draw over it.
 * Any unknown name stages the title.
 */
export function stageShot(name, G) {
  resetGame(G);
  G.cameraOverride = null;
  if (name === 'street') {
    startMission(G, 0);
    const p = G.player;
    p.x = -40;
    p.z = 8.5;
    p.camYaw = Math.PI / 2;
    p.yaw = Math.PI / 2;
    // A few pedestrians on this stretch of pavement, strolling east.
    for (let i = 0; i < 3; i += 1) {
      const ped = G.peds[i];
      ped.x = -30 + i * 7;
      ped.z = i % 2 === 0 ? 8.5 : -8.5;
      ped.target = { x: ped.x + 30, z: ped.z };
    }
    steps(G, WALK, 2.5);
    return 'play';
  }
  if (name === 'drive') {
    startMission(G, 0);
    stealOnAvenue(G, 'sports', -116);
    avenueTraffic(G, 'taxi', -40, 2.5, -Math.PI / 2); // oncoming, westbound lane
    avenueTraffic(G, 'truck', 80, -2.5, Math.PI / 2); // ahead, same lane
    steps(G, DRIVE, 4);
    // Guarantee the cover shows the living city, not an empty road: stage one
    // traffic car and one pedestrian relative to where the drive actually
    // ended, both inside the chase camera's forward view by construction.
    const car = G.player.car;
    avenueTraffic(G, 'taxi', car.x + 45, 2.5, -Math.PI / 2); // oncoming, ahead
    const ped = G.peds[0];
    ped.x = car.x + 30;
    ped.z = 8.5; // pavement ahead-right, in frame
    ped.target = { x: ped.x + 30, z: ped.z };
    steps(G, DRIVE, 0.5);
    addHeat(G, 25); // keep the two stars lit for the cover
    return 'play';
  }
  if (name === 'mission') {
    // Mission 2, The Package: on foot at the marina kiosk, waypoint beacon
    // lit and the objective line live — a mission in progress, not a menu.
    startMission(G, 1);
    const kiosk = PLACES.marinaKiosk;
    const p = G.player;
    p.x = kiosk.x - 9;
    p.z = kiosk.z + 7;
    p.camYaw = Math.atan2(kiosk.x - p.x, kiosk.z - p.z);
    p.yaw = p.camYaw;
    for (let i = 0; i < 2; i += 1) {
      const ped = G.peds[i];
      ped.x = kiosk.x - 16 + i * 6;
      ped.z = kiosk.z + 11;
      ped.target = { x: ped.x + 24, z: ped.z };
    }
    steps(G, WALK, 1.5);
    return 'play';
  }
  if (name === 'chase') {
    stealOnAvenue(G, 'sedan', -58);
    addHeat(G, 55); // three stars
    steps(G, DRIVE, 3);
    // Frame the getaway from the front: the car, the avenue behind it, and the
    // interceptors closing in from the west.
    const car = G.player.car;
    G.cameraOverride = {
      pos: [car.x + 34, 8, car.z + 13],
      look: [car.x - 12, 2, car.z],
    };
    return 'play';
  }
  // title: a quiet street-level view of Solmar Plaza at golden hour.
  G.cameraOverride = {
    pos: [26, 9, 52],
    look: [-14, 5, -46],
  };
  steps(G, IDLE, 1.5);
  return 'title';
}
