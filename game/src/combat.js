// Combat: the player's punch and pistol, the thugs who guard the big job, and
// the health and ammo pickups scattered around Solmar. Pure logic; the hitscan
// is a cone test against people and cars, no raycaster needed.

import { PISTOL, PLAYER, THUG } from './config.js';
import { addHeat } from './police.js';
import { WANTED } from './config.js';
import { scarePeds } from './pedestrians.js';
import { resolveBuildings } from './world.js';

export function spawnThugs(G, x, z, count) {
  for (let i = 0; i < count; i += 1) {
    const a = G.rng.range(0, Math.PI * 2);
    const thug = {
      id: G.nextId,
      x: x + Math.sin(a) * (4 + i * 2),
      z: z + Math.cos(a) * (4 + i * 2),
      angle: 0,
      health: THUG.health,
      hitCooldown: 0,
      swingTimer: 0,
    };
    G.nextId += 1;
    G.thugs.push(thug);
  }
  G.events.push('Thugs! The courier crew is on you.');
}

/** Scatter health and ammo pickups at fixed spots around the city. */
export function createPickups(G) {
  const spots = [
    { x: 0, z: 0, kind: 'health' },
    { x: -180, z: 120, kind: 'health' },
    { x: 200, z: -160, kind: 'ammo' },
    { x: -60, z: -220, kind: 'health' },
    { x: 140, z: 200, kind: 'ammo' },
    { x: -240, z: -60, kind: 'ammo' },
    { x: 60, z: 260, kind: 'health' },
  ];
  for (const s of spots) {
    G.pickups.push({ id: G.nextId, x: s.x, z: s.z, kind: s.kind });
    G.nextId += 1;
  }
}

function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, t);
}

/** The player's attack: punch on foot at close range, pistol when armed. */
export function playerAttack(G) {
  const p = G.player;
  if (p.car || p.attackCooldown > 0) return;
  if (p.hasPistol && p.ammo > 0) {
    p.attackCooldown = PISTOL.cooldown;
    p.ammo -= 1;
    G.audio.gunshot();
    addHeat(G, WANTED.shoot);
    scarePeds(G, p.x, p.z, 35);
    const fx = Math.sin(p.camYaw);
    const fz = Math.cos(p.camYaw);
    // Hitscan: the closest thug, cop or pedestrian inside a narrow cone.
    let best = null;
    let bestD = PISTOL.range;
    for (const t of [...G.thugs, ...G.cops, ...G.peds]) {
      const dx = t.x - p.x;
      const dz = t.z - p.z;
      const along = dx * fx + dz * fz;
      if (along <= 0 || along > bestD) continue;
      const side = Math.abs(dx * fz - dz * fx);
      if (side < 1.2 + along * PISTOL.spread && along < bestD) {
        bestD = along;
        best = t;
      }
    }
    if (best) {
      const hx = p.x + fx * bestD;
      const hz = p.z + fz * bestD;
      G.render.spawnParticle(hx, 1.2, hz, 0xff4444, 8, 4);
      damagePerson(G, best, PISTOL.damage);
    } else {
      G.render.spawnParticle(p.x + fx * 3, 1.4, p.z + fz * 3, 0xffcc66, 3, 2);
    }
    return;
  }
  // Punch.
  p.attackCooldown = PLAYER.punchCooldown;
  G.audio.thud();
  const fx = Math.sin(p.yaw);
  const fz = Math.cos(p.yaw);
  for (const t of [...G.thugs, ...G.cops, ...G.peds]) {
    const dx = t.x - p.x;
    const dz = t.z - p.z;
    const along = dx * fx + dz * fz;
    const side = Math.abs(dx * fz - dz * fx);
    if (along > 0 && along < PLAYER.punchRange && side < 1.1) {
      damagePerson(G, t, PLAYER.punchDamage);
      G.render.spawnParticle(t.x, 1.2, t.z, 0xffffff, 5, 3);
      break;
    }
  }
}

function damagePerson(G, target, amount) {
  if (G.thugs.includes(target)) {
    target.health -= amount;
    if (target.health <= 0) {
      G.thugs = G.thugs.filter((t) => t !== target);
      G.render.spawnParticle(target.x, 1, target.z, 0x888888, 10, 4);
      G.events.push('Thug down.');
    }
  } else if (G.cops.includes(target)) {
    // Shooting a cop is a big crime; punching one is a small one.
    addHeat(G, amount >= PISTOL.damage ? WANTED.shoot : 10);
    G.cops = G.cops.filter((c) => c !== target);
    G.events.push('You dropped a cop. That will cost you.');
  } else {
    target.hit = true;
    target.state = 'flee';
    target.fleeTimer = 5;
    addHeat(G, WANTED.hitPed);
    scarePeds(G, target.x, target.z, 25);
  }
}

/** One step for the thugs: close in and swing at the player. */
export function updateThugs(G, dt) {
  const p = G.player;
  const px = p.car ? p.car.x : p.x;
  const pz = p.car ? p.car.z : p.z;
  for (const thug of G.thugs) {
    const dx = px - thug.x;
    const dz = pz - thug.z;
    const dist = Math.hypot(dx, dz);
    thug.angle = angleLerp(thug.angle, Math.atan2(dx, dz), dt * 5);
    if (dist > THUG.range) {
      const step = Math.min(THUG.speed * dt, dist - THUG.range); // stop at striking range
      thug.x += Math.sin(thug.angle) * step;
      thug.z += Math.cos(thug.angle) * step;
      const fixed = resolveBuildings(G.city, thug.x, thug.z, 0.5);
      thug.x = fixed.x;
      thug.z = fixed.z;
    } else {
      thug.swingTimer -= dt;
      if (thug.swingTimer <= 0) {
        thug.swingTimer = 0.9;
        p.health -= THUG.damage;
        G.render.addShake(0.5);
        G.audio.thud();
        G.render.spawnParticle(px, 1.2, pz, 0xff6666, 6, 3);
      }
    }
    thug.hitCooldown -= dt;
  }
}

/** Pick up anything the player walks over. */
export function updatePickups(G) {
  const p = G.player;
  if (p.car) return;
  for (const pk of [...G.pickups]) {
    if (Math.hypot(pk.x - p.x, pk.z - p.z) < 1.6) {
      G.pickups = G.pickups.filter((q) => q !== pk);
      if (pk.kind === 'health') {
        p.health = Math.min(100, p.health + 30);
        G.events.push('Health +30');
      } else {
        p.ammo += 12;
        p.hasPistol = true;
        G.events.push('Pistol ammo +12');
      }
      G.audio.blip();
      G.render.spawnParticle(pk.x, 1, pk.z, 0x66ff99, 8, 3);
    }
  }
}
