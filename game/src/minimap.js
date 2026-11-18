// The live 2D minimap: streets, blocks, the beach and sea, the player arrow,
// traffic, police, pedestrians and the mission marker. North is up; the whole
// city fits in the canvas.

import { BEACH_Z, HALF, HARBOUR_X, SEA_Z } from './config.js';

const SIZE = 220;

function toMap(x, z) {
  const span = HALF * 2 + 90;
  return [
    ((x + HALF + 45) / span) * SIZE,
    ((z + HALF + 45) / span) * SIZE,
  ];
}

export function createMinimap(canvas) {
  const ctx = canvas.getContext('2d');
  canvas.width = SIZE;
  canvas.height = SIZE;

  return {
    draw(G) {
      ctx.clearRect(0, 0, SIZE, SIZE);
      // Sea and sand.
      ctx.fillStyle = '#2e7fa8';
      ctx.fillRect(0, 0, SIZE, SIZE);
      const [bx0, bz0] = toMap(-HALF - 45, BEACH_Z);
      ctx.fillStyle = '#e8d49a';
      ctx.fillRect(0, bz0, SIZE, toMap(0, SEA_Z)[1] - bz0);
      ctx.fillStyle = '#e8d49a';
      const [hx] = toMap(HARBOUR_X, 0);
      ctx.fillRect(hx, 0, SIZE - hx, SIZE);
      // City ground.
      ctx.fillStyle = '#3f4a3a';
      ctx.fillRect(0, 0, SIZE, toMap(0, HALF + 45)[1]);
      // Blocks.
      ctx.fillStyle = '#6b7280';
      for (const b of G.city.buildings) {
        const [x, z] = toMap(b.x, b.z);
        const w = (b.w / (HALF * 2 + 90)) * SIZE;
        const h = (b.d / (HALF * 2 + 90)) * SIZE;
        ctx.fillRect(x, z, Math.max(1, w), Math.max(1, h));
      }
      // Streets.
      ctx.strokeStyle = '#9aa0a8';
      ctx.lineWidth = 2;
      for (const line of G.city.lines) {
        const [x] = toMap(line, 0);
        const [, z] = toMap(0, line);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, SIZE);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, z);
        ctx.lineTo(SIZE, z);
        ctx.stroke();
      }
      // Mission waypoint.
      const wp = G.mission.waypoint;
      if (wp) {
        const [x, z] = toMap(wp.x, wp.z);
        const pulse = 5 + Math.sin(G.elapsed * 5) * 2;
        ctx.fillStyle = '#ffb703';
        ctx.beginPath();
        ctx.moveTo(x, z - pulse);
        ctx.lineTo(x + pulse, z);
        ctx.lineTo(x, z + pulse);
        ctx.lineTo(x - pulse, z);
        ctx.closePath();
        ctx.fill();
      }
      // Pedestrians.
      ctx.fillStyle = '#d8d8d8';
      for (const ped of G.peds) {
        const [x, z] = toMap(ped.x, ped.z);
        ctx.fillRect(x - 1, z - 1, 2, 2);
      }
      // Traffic cars.
      ctx.fillStyle = '#e8e8e8';
      for (const car of G.cars) {
        if (car.driver === 'police') continue;
        const [x, z] = toMap(car.x, car.z);
        ctx.fillRect(x - 1.5, z - 1.5, 3, 3);
      }
      // Police: flashing red/blue.
      const policeFlash = Math.floor(G.elapsed * 4) % 2 === 0;
      ctx.fillStyle = policeFlash ? '#ff4444' : '#4488ff';
      for (const car of G.cars) {
        if (car.driver !== 'police') continue;
        const [x, z] = toMap(car.x, car.z);
        ctx.fillRect(x - 2.5, z - 2.5, 5, 5);
      }
      for (const cop of G.cops) {
        const [x, z] = toMap(cop.x, cop.z);
        ctx.fillRect(x - 2, z - 2, 4, 4);
      }
      // Player arrow.
      const p = G.player;
      const px = p.car ? p.car.x : p.x;
      const pz = p.car ? p.car.z : p.z;
      const [x, z] = toMap(px, pz);
      const heading = p.car ? p.car.angle : p.camYaw;
      ctx.save();
      ctx.translate(x, z);
      ctx.rotate(heading);
      ctx.fillStyle = '#ffb703';
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(5, 5);
      ctx.lineTo(0, 2.5);
      ctx.lineTo(-5, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      // Border.
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, SIZE - 2, SIZE - 2);
    },
  };
}
