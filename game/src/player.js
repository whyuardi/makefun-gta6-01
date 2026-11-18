// The player: on foot with WASD, sprint, jump and a mouse-steered camera, and
// behind the wheel with arcade driving, a handbrake and building collisions.
// Pure movement logic; render.js owns the camera's smoothing.

import { CAR_TYPES, PLAYER, WANTED } from './config.js';
import { clampToLand, resolveBuildings } from './world.js';
import { collideCars, nearestCar } from './traffic.js';
import { addHeat } from './police.js';
import { scarePeds } from './pedestrians.js';

/** Step the player on foot: move, jump, collide with buildings, stay on land. */
export function stepOnFoot(G, dt, move, sprint, jumpHeld) {
  const p = G.player;
  const speed = sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
  // Movement is relative to the camera yaw.
  const fx = Math.sin(p.camYaw);
  const fz = Math.cos(p.camYaw);
  const rx = Math.cos(p.camYaw);
  const rz = -Math.sin(p.camYaw);
  let mx = fx * move.f + rx * move.s;
  let mz = fz * move.f + rz * move.s;
  const len = Math.hypot(mx, mz);
  if (len > 0) {
    mx /= len;
    mz /= len;
    p.yaw = Math.atan2(mx, mz);
  }
  p.vx += (mx * speed - p.vx) * Math.min(1, dt * 10);
  p.vz += (mz * speed - p.vz) * Math.min(1, dt * 10);
  p.x += p.vx * dt;
  p.z += p.vz * dt;
  if (jumpHeld && p.y === 0) {
    p.vy = PLAYER.jumpSpeed;
    p.y += 0.01;
  }
  if (p.y > 0 || p.vy !== 0) {
    p.vy -= PLAYER.gravity * dt;
    p.y += p.vy * dt;
    if (p.y <= 0) {
      p.y = 0;
      p.vy = 0;
    }
  }
  const fixed = resolveBuildings(G.city, p.x, p.z, PLAYER.radius);
  p.x = fixed.x;
  p.z = fixed.z;
  const land = clampToLand(p.x, p.z);
  p.x = land.x;
  p.z = land.z;
}

/** Step the player's car: throttle, steering, handbrake drift, collisions. */
export function stepDriving(G, dt, move, handbrake) {
  const car = G.player.car;
  const spec = CAR_TYPES[car.type];
  const throttle = move.f;
  if (throttle > 0) car.speed += spec.accel * dt;
  else if (throttle < 0) {
    car.speed -= (car.speed > 0.5 ? spec.brake : spec.accel * 0.6) * dt;
  } else {
    car.speed -= Math.sign(car.speed) * 4 * dt;
    if (Math.abs(car.speed) < 0.2) car.speed = 0;
  }
  const grip = handbrake ? 0.35 : 1;
  car.speed = Math.max(-spec.topSpeed * 0.4, Math.min(spec.topSpeed, car.speed));
  const steerInput = move.s;
  const steerTarget = steerInput * spec.turn * (car.speed >= 0 ? 1 : -1) * grip;
  car.steer += (steerTarget - car.steer) * Math.min(1, dt * 8);
  car.angle += car.steer * dt * Math.min(1, Math.abs(car.speed) / 8);
  car.x += Math.sin(car.angle) * car.speed * dt;
  car.z += Math.cos(car.angle) * car.speed * dt;
  const fixed = resolveBuildings(G.city, car.x, car.z, 1.4);
  if (fixed.x !== car.x || fixed.z !== car.z) {
    car.speed *= 0.5;
    G.render.addShake(0.3);
    if (Math.abs(car.speed) > 8) G.audio.thud();
  }
  car.x = fixed.x;
  car.z = fixed.z;
  const land = clampToLand(car.x, car.z);
  if (land.x !== car.x || land.z !== car.z) car.speed *= 0.6;
  car.x = land.x;
  car.z = land.z;
  // Colliding with other cars (not police — they ram on their own terms) slows
  // both down and throws sparks.
  for (const other of G.cars) {
    if (other === car || other.driver === 'police') continue;
    if (collideCars(car, other) && Math.abs(car.speed) > 6) {
      G.render.addShake(0.4);
      G.audio.thud();
      G.render.spawnParticle(car.x, 1.2, car.z, 0xffaa00, 6, 4);
    }
  }
  // Hitting a pedestrian while driving is a crime.
  for (const ped of G.peds) {
    if (ped.hit) continue;
    const d = Math.hypot(ped.x - car.x, ped.z - car.z);
    if (d < 1.9 && Math.abs(car.speed) > 3) {
      ped.hit = true;
      ped.state = 'flee';
      ped.fleeTimer = 5;
      addHeat(G, WANTED.hitPed);
      scarePeds(G, car.x, car.z, 30);
      G.events.push('You ran someone over. The city saw it.');
      G.render.spawnParticle(ped.x, 1, ped.z, 0xff5555, 10, 5);
      G.render.addShake(0.6);
      car.speed *= 0.7;
    }
  }
}

/** Try to steal the nearest car: F near a parked or traffic car. */
export function tryEnterCar(G) {
  const p = G.player;
  if (p.car) {
    exitCar(G);
    return;
  }
  const car = nearestCar(G, p.x, p.z, 4.2, ['parked', 'traffic']);
  if (!car) return false;
  car.driver = 'player';
  car.speed = 0;
  p.car = car;
  p.camYaw = car.angle;
  G.stats.carsStolen += 1;
  addHeat(G, WANTED.stealCar);
  scarePeds(G, p.x, p.z, 25);
  G.events.push(`You took the ${CAR_TYPES[car.type].label}. The owner is calling it in.`);
  G.audio.engineStart();
  return true;
}

export function exitCar(G) {
  const p = G.player;
  if (!p.car) return;
  const car = p.car;
  car.driver = 'parked';
  car.speed = 0;
  p.x = car.x + Math.cos(car.angle) * 2.2;
  p.z = car.z - Math.sin(car.angle) * 2.2;
  p.y = 0;
  p.vx = 0;
  p.vz = 0;
  p.car = null;
  G.audio.engineStop();
}

/** Turn mouse movement into camera yaw and pitch. */
export function applyMouse(G, dx, dy) {
  const p = G.player;
  p.camYaw -= dx * 0.0028;
  p.camPitch = Math.max(-0.15, Math.min(0.55, p.camPitch + dy * 0.0022));
}
