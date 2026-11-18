// The wanted system and the Solmar PD. Heat 0-100 maps to 0-5 stars; crimes add
// heat, staying out of sight lets it cool. Police cars chase on the road graph
// and ram; foot cops run the player down and bust them. Pure logic — no three.js,
// so the sim test can import this file in plain Node.

import { CAR_TYPES, CITY, HALF, POLICE, WANTED } from './config.js';
import { randomIntersection, resolveBuildings } from './world.js';
import { collideCars, spawnCar } from './traffic.js';

export const EVENT_BUSTED = 1;

/** Stars for a heat value: 0 heat is clean, then one star per 20 heat. */
export function computeStars(heat) {
  if (heat <= 0) return 0;
  return Math.min(WANTED.maxStars, Math.ceil(heat / 20));
}

/** Add heat from a crime. Returns the new star count. */
export function addHeat(G, amount) {
  G.wanted.heat = Math.min(100, G.wanted.heat + amount);
  const stars = computeStars(G.wanted.heat);
  if (stars > G.wanted.stars) {
    G.wanted.stars = stars;
    G.events.push(`Wanted level ${stars} — Solmar PD is on you.`);
  }
  return stars;
}

function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, t);
}

/** A police car picks the neighbouring intersection closest to the player. */
function chaseNextNode(G, car) {
  const { city } = G;
  const at = car.node;
  const target = G.player.car ? G.player.car : G.player;
  let best = null;
  let bestD = Infinity;
  for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const ni = at.i + di;
    const nj = at.j + dj;
    if (ni < 0 || ni > CITY.blocks || nj < 0 || nj > CITY.blocks) continue;
    const n = city.nodeAt(ni, nj);
    const d = Math.hypot(n.x - target.x, n.z - target.z);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  if (best) {
    car.prev = at;
    car.node = best;
  }
}

function spawnPoliceCar(G) {
  const node = randomIntersection(G.rng, G.city, G.player.x, G.player.z, POLICE.spawnRange);
  const car = spawnCar(G, 'police', node.x, node.z, 0, 'police');
  car.node = node;
  car.prev = node;
  car.speed = 10;
  car.cruise = CAR_TYPES.police.topSpeed;
  G.events.push('A PD interceptor joins the chase.');
  return car;
}

function spawnCop(G) {
  // Cops arrive from just outside sight range, the same distance as the
  // interceptors: the player gets a real window to break away and cool the
  // heat (a cop spawning inside sight range would make the heat never decay
  // on foot, and mission 3 unlosable-by-hiding). spawnRange (55) stays
  // outside seeRange (46) — the clamp this relies on. A small seeded jitter
  // around the ring means two cops never spawn at the exact same spot.
  const a = G.rng.range(0, Math.PI * 2);
  const r = POLICE.spawnRange + G.rng.range(-4, 4);
  const x = G.player.x + Math.sin(a) * r;
  const z = G.player.z + Math.cos(a) * r;
  const cop = {
    id: G.nextId,
    x: Math.max(-HALF, Math.min(HALF, x)),
    z: Math.max(-HALF, Math.min(HALF, z)),
    angle: 0,
    speed: 0,
    bustTimer: 0,
    hitCooldown: 0,
  };
  G.nextId += 1;
  G.cops.push(cop);
  return cop;
}

/** Keep the police force matched to the star count. */
function maintainForce(G) {
  const stars = G.wanted.stars;
  const wantCars = Math.min(stars, POLICE.maxCars);
  const cars = G.cars.filter((c) => c.driver === 'police');
  while (cars.length < wantCars) {
    spawnPoliceCar(G);
    cars.push(G.cars[G.cars.length - 1]);
  }
  const wantCops = G.player.car ? 0 : Math.min(stars, POLICE.maxCops);
  while (G.cops.length < wantCops) spawnCop(G);
}

/** One step of the wanted system and the police. Returns EVENT_* flags. */
export function updatePolice(G, dt) {
  let events = 0;
  const w = G.wanted;
  const player = G.player;
  const px = player.car ? player.car.x : player.x;
  const pz = player.car ? player.car.z : player.z;

  // Can any police see the player?
  let seen = false;
  for (const car of G.cars) {
    if (car.driver !== 'police') continue;
    if (Math.hypot(car.x - px, car.z - pz) < WANTED.seeRange) seen = true;
  }
  for (const cop of G.cops) {
    if (Math.hypot(cop.x - px, cop.z - pz) < WANTED.seeRange) seen = true;
  }
  w.seen = seen;

  // Heat cools only while nobody sees the player.
  if (w.heat > 0 && !seen) {
    const farFromAll =
      G.cops.every((c) => Math.hypot(c.x - px, c.z - pz) > 60) &&
      G.cars.filter((c) => c.driver === 'police').every((c) => Math.hypot(c.x - px, c.z - pz) > 60);
    const rate = farFromAll && !player.car ? WANTED.decayHidden : WANTED.decayUnseen;
    w.heat = Math.max(0, w.heat - rate * dt);
    const stars = computeStars(w.heat);
    if (stars !== w.stars) {
      w.stars = stars;
      if (stars === 0) G.events.push('You lost them. The heat is off.');
    }
  }

  if (w.stars > 0) maintainForce(G);

  // Police cars chase.
  for (const car of G.cars) {
    if (car.driver !== 'police') continue;
    const dx = car.node.x - car.x;
    const dz = car.node.z - car.z;
    if (Math.hypot(dx, dz) < 3.5) {
      chaseNextNode(G, car);
      continue;
    }
    const wantAngle = Math.atan2(dx, dz);
    car.angle = angleLerp(car.angle, wantAngle, dt * 4);
    const spec = CAR_TYPES.police;
    const distToPlayer = Math.hypot(px - car.x, pz - car.z);
    const target = distToPlayer < 8 ? spec.topSpeed * 0.4 : spec.topSpeed;
    car.speed += Math.max(-spec.brake * dt, Math.min(spec.accel * dt, target - car.speed));
    car.x += Math.sin(car.angle) * car.speed * dt;
    car.z += Math.cos(car.angle) * car.speed * dt;
    // Ramming the player's car hurts and adds heat.
    if (player.car) {
      if (collideCars(car, player.car)) {
        if (car.ramCooldown === undefined) car.ramCooldown = 0;
        if (car.ramCooldown <= 0) {
          car.ramCooldown = 1.2;
          player.health -= POLICE.ramDamage;
          addHeat(G, WANTED.hitPolice);
          G.render.addShake(0.7);
          G.render.spawnParticle(player.car.x, 1.2, player.car.z, 0xffaa00, 8, 5);
          G.audio.thud();
        }
      }
      if (car.ramCooldown > 0) car.ramCooldown -= dt;
    }
  }

  // Foot cops run the player down.
  for (const cop of G.cops) {
    const dx = px - cop.x;
    const dz = pz - cop.z;
    const dist = Math.hypot(dx, dz);
    if (player.car) {
      // The player drove off: the cop gives up once far away.
      if (dist > 70) {
        cop.gone = true;
        continue;
      }
    }
    cop.angle = angleLerp(cop.angle, Math.atan2(dx, dz), dt * 6);
    const speed = 5.4;
    const step = Math.min(speed * dt, dist); // never overshoot the player
    cop.x += Math.sin(cop.angle) * step;
    cop.z += Math.cos(cop.angle) * step;
    const fixed = resolveBuildings(G.city, cop.x, cop.z, 0.5);
    cop.x = fixed.x;
    cop.z = fixed.z;
    if (dist < 1.7 && !player.car) {
      cop.bustTimer += dt;
      if (cop.hitCooldown === undefined) cop.hitCooldown = 0;
      cop.hitCooldown -= dt;
      if (cop.hitCooldown <= 0) {
        cop.hitCooldown = 0.9;
        player.health -= POLICE.copDamage;
        G.render.addShake(0.4);
        G.audio.thud();
      }
      if (cop.bustTimer >= POLICE.bustTime) events |= EVENT_BUSTED;
    } else {
      cop.bustTimer = Math.max(0, cop.bustTimer - dt * 2);
    }
  }
  G.cops = G.cops.filter((c) => !c.gone);

  // When the heat is gone the police stand down at once.
  if (w.stars === 0) {
    G.cars = G.cars.filter((c) => c.driver !== 'police');
    G.cops = [];
  }
  return events;
}
