// Pedestrians: Solmar's people, strolling the sidewalks and running when a crime
// happens nearby. Pure logic — render.js draws them. A pedestrian walks between
// random intersections on the pavement edge; when scared they sprint away from
// the scare point for a few seconds, then calm down.

import { CITY, HALF, PEDS } from './config.js';

const SHIRTS = [0xd94f4f, 0x4f7ad9, 0x4fd97a, 0xe8d44d, 0xd94fb8, 0x8a5a2e, 0xe8e8e8, 0x2e8a8a];

export function createPedestrians(G) {
  const { rng, city } = G;
  for (let i = 0; i < PEDS.count; i += 1) {
    const node = rng.pick(city.nodes);
    const ped = {
      id: G.nextId,
      x: node.x + rng.range(-5, 5),
      z: node.z + rng.range(-5, 5),
      angle: rng.range(0, Math.PI * 2),
      speed: 0,
      state: 'walk',
      target: null,
      fleeTimer: 0,
      shirt: rng.pick(SHIRTS),
    };
    G.nextId += 1;
    ped.target = pickWalkTarget(G, ped);
    G.peds.push(ped);
  }
}

/** A nearby intersection to stroll to, on the pavement. */
function pickWalkTarget(G, ped) {
  const { rng, city } = G;
  const node = rng.pick(city.nodes);
  const side = rng.chance(0.5) ? 1 : -1;
  return {
    x: node.x + side * (CITY.street / 2 + 1.2),
    z: node.z + (rng.chance(0.5) ? side * (CITY.street / 2 + 1.2) : 0),
  };
}

function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, t);
}

/** Scare every pedestrian within `radius` of (x, z): they flee from that point. */
export function scarePeds(G, x, z, radius) {
  for (const ped of G.peds) {
    const d = Math.hypot(ped.x - x, ped.z - z);
    if (d < radius) {
      ped.state = 'flee';
      ped.fleeTimer = 3 + G.rng.range(0, 2);
      const away = Math.atan2(ped.x - x, ped.z - z);
      ped.target = { x: ped.x + Math.sin(away) * 40, z: ped.z + Math.cos(away) * 40 };
    }
  }
}

/** One step for every pedestrian. */
export function updatePeds(G, dt) {
  for (const ped of G.peds) {
    const speed = ped.state === 'flee' ? PEDS.fleeSpeed : PEDS.walkSpeed;
    const dx = ped.target.x - ped.x;
    const dz = ped.target.z - ped.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1.5) {
      if (ped.state === 'flee') {
        ped.state = 'walk';
        ped.fleeTimer = 0;
      }
      ped.target = pickWalkTarget(G, ped);
      continue;
    }
    ped.angle = angleLerp(ped.angle, Math.atan2(dx, dz), dt * 5);
    ped.speed = speed;
    ped.x += Math.sin(ped.angle) * speed * dt;
    ped.z += Math.cos(ped.angle) * speed * dt;
    ped.x = Math.max(-HALF - 2, Math.min(HALF + 2, ped.x));
    ped.z = Math.max(-HALF - 2, Math.min(HALF + 2, ped.z));
    if (ped.state === 'flee') {
      ped.fleeTimer -= dt;
      if (ped.fleeTimer <= 0) ped.state = 'walk';
    }
  }
}

/** The nearest pedestrian to (x, z) within maxDist. */
export function nearestPed(G, x, z, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const ped of G.peds) {
    const d = Math.hypot(ped.x - x, ped.z - z);
    if (d < bestD) {
      bestD = d;
      best = ped;
    }
  }
  return best;
}
