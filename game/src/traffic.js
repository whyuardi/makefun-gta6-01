// Traffic: the cars that drive Solmar's roads, the parked cars waiting to be
// stolen, and the shared car factory. Pure logic — render.js draws the cars.
// A car's heading `angle` points along (sin angle, cos angle) on the XZ plane.

import { CAR_TYPES, CITY, HALF, TRAFFIC } from './config.js';

const TRAFFIC_COLORS = [0x3f6fb5, 0xd8d8d8, 0x2e2e33, 0x7a4a8f, 0x4a7a5a, 0xb56a2e, 0x8a2e3d, 0xc9c9c9];
const TYPE_WEIGHTS = [['sedan', 0.4], ['taxi', 0.25], ['truck', 0.15], ['sports', 0.2]];

export function pickTrafficType(rng) {
  let roll = rng.next();
  for (const [type, weight] of TYPE_WEIGHTS) {
    roll -= weight;
    if (roll <= 0) return type;
  }
  return 'sedan';
}

/** A fresh car object at a road position. */
export function spawnCar(G, type, x, z, angle, driver) {
  const spec = CAR_TYPES[type];
  const color = type === 'taxi' ? 0xf2b705 : type === 'police' ? 0x1c2733 : G.rng.pick(TRAFFIC_COLORS);
  const car = {
    id: G.nextId,
    type,
    x,
    z,
    angle,
    speed: 0,
    steer: 0,
    driver,
    color,
    health: 100,
    cruise: spec.topSpeed * TRAFFIC.cruise,
    node: null,
    prev: null,
  };
  G.nextId += 1;
  G.cars.push(car);
  return car;
}

/** Fill the city with moving traffic and parked cars. */
export function createTraffic(G) {
  const { rng, city } = G;
  for (let i = 0; i < TRAFFIC.count; i += 1) {
    const node = rng.pick(city.nodes);
    const car = spawnCar(G, pickTrafficType(rng), node.x, node.z, rng.range(0, Math.PI * 2), 'traffic');
    car.node = node;
    car.prev = node;
    car.speed = car.cruise * rng.range(0.7, 1);
    pickNextNode(G, car);
  }
  for (let i = 0; i < TRAFFIC.parked; i += 1) {
    const node = rng.pick(city.nodes);
    const alongX = rng.chance(0.5);
    const side = rng.chance(0.5) ? 1 : -1;
    const x = alongX ? node.x + rng.range(-20, 20) : node.x + side * (CITY.street / 2 - 1.6);
    const z = alongX ? node.z + side * (CITY.street / 2 - 1.6) : node.z + rng.range(-20, 20);
    const angle = alongX ? (side > 0 ? 0 : Math.PI) : (side > 0 ? Math.PI / 2 : -Math.PI / 2);
    const car = spawnCar(G, pickTrafficType(rng), x, z, angle, 'parked');
    car.node = node;
  }
}

/** Choose the traffic car's next intersection: mostly straight, sometimes a turn. */
function pickNextNode(G, car) {
  const { city, rng } = G;
  const at = car.node;
  const from = car.prev;
  const options = [];
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [di, dj] of dirs) {
    const ni = at.i + di;
    const nj = at.j + dj;
    if (ni < 0 || ni > CITY.blocks || nj < 0 || nj > CITY.blocks) continue;
    if (from && ni === from.i && nj === from.j) continue; // no U-turns
    options.push(city.nodeAt(ni, nj));
  }
  if (options.length === 0) {
    car.prev = at;
    return;
  }
  // Prefer the node that continues the current direction.
  const straight = options.find((n) => {
    if (!from) return false;
    return n.i - at.i === at.i - from.i && n.j - at.j === at.j - from.j;
  });
  car.prev = at;
  car.node = straight && rng.chance(0.65) ? straight : rng.pick(options);
}

function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, t);
}

/** Is there a car right in front of `car`? Returns its distance, or Infinity. */
function carAhead(G, car) {
  const fx = Math.sin(car.angle);
  const fz = Math.cos(car.angle);
  let best = Infinity;
  for (const other of G.cars) {
    if (other === car || other.driver === 'parked') continue;
    const dx = other.x - car.x;
    const dz = other.z - car.z;
    const along = dx * fx + dz * fz;
    const side = Math.abs(dx * fz - dz * fx);
    if (along > 0 && along < 12 && side < 2.6 && along < best) best = along;
  }
  return best;
}

/** One step for every traffic car: follow the road graph, mind the car ahead. */
export function updateTraffic(G, dt) {
  for (const car of G.cars) {
    if (car.driver !== 'traffic') continue;
    const spec = CAR_TYPES[car.type];
    const dx = car.node.x - car.x;
    const dz = car.node.z - car.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 3.5) {
      pickNextNode(G, car);
      continue;
    }
    const wantAngle = Math.atan2(dx, dz);
    car.angle = angleLerp(car.angle, wantAngle, dt * 3.2);
    // Right-hand lane: shift the target point sideways once we know the heading.
    const ahead = carAhead(G, car);
    const target = ahead < TRAFFIC.minGap ? 0 : car.cruise;
    const accel = target > car.speed ? spec.accel * 0.5 : spec.brake;
    car.speed += Math.max(-accel * dt, Math.min(accel * dt, target - car.speed));
    car.x += Math.sin(car.angle) * car.speed * dt;
    car.z += Math.cos(car.angle) * car.speed * dt;
    // Keep traffic on the roads, never through a block.
    car.x = Math.max(-HALF, Math.min(HALF, car.x));
    car.z = Math.max(-HALF, Math.min(HALF, car.z));
  }
}

/** The nearest car to (x, z) within maxDist, optionally filtered by driver. */
export function nearestCar(G, x, z, maxDist, drivers) {
  let best = null;
  let bestD = maxDist;
  for (const car of G.cars) {
    if (drivers && !drivers.includes(car.driver)) continue;
    const d = Math.hypot(car.x - x, car.z - z);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

/** Push two overlapping cars apart; returns true when they collided. */
export function collideCars(a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const d = Math.hypot(dx, dz);
  const min = 2.6;
  if (d >= min || d === 0) return false;
  const push = (min - d) / 2;
  const nx = dx / d;
  const nz = dz / d;
  a.x -= nx * push;
  a.z -= nz * push;
  b.x += nx * push;
  b.z += nz * push;
  const exchange = (a.speed + b.speed) * 0.3;
  a.speed = Math.max(0, a.speed - exchange * 0.4);
  b.speed = Math.max(0, b.speed - exchange * 0.4);
  return true;
}
