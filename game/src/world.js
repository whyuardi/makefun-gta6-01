// Solmar itself: the street grid, the blocks and buildings, the palms and lamps,
// the beach and the harbour, and the road graph the traffic and the police drive on.
// Pure data — no three.js here — built once from a seeded RNG so every run with the
// same seed builds the same city. render.js turns this into meshes.

import { BEACH_Z, CITY, HALF, HARBOUR_X, PALETTE, PITCH, SEA_Z } from './config.js';

/** Street centreline coordinates, one per road, west to east and north to south. */
export function streetLines() {
  const lines = [];
  for (let i = 0; i <= CITY.blocks; i += 1) lines.push(-HALF + i * PITCH);
  return lines;
}

/** Named places the missions and the HUD point at. */
export const PLACES = {
  garage: { x: -HALF + 1 * PITCH, z: -HALF + 9 * PITCH, label: "Mara's Garage — Coral Row" },
  marinaKiosk: { x: HALF - 1 * PITCH, z: BEACH_Z - 22, label: 'Marina Kiosk' },
  palmCourt: { x: -HALF + 2 * PITCH, z: HALF - 1 * PITCH, label: 'Palm Court Drop' },
  docks: { x: HARBOUR_X - 12, z: HALF - 3 * PITCH, label: 'East Docks Buyer' },
  bank: { x: HALF - 2 * PITCH, z: -HALF + 2 * PITCH, label: 'Meridian Bank' },
  getaway: { x: -HALF + 1 * PITCH, z: BEACH_Z - 16, label: 'Sunset Pier Getaway' },
  plaza: { x: 0, z: 0, label: 'Solmar Plaza' },
};

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/** Build the city. Returns blocks, buildings, palms, lamps, road nodes and AABBs. */
export function createCity(rng) {
  const lines = streetLines();
  const buildings = [];
  const palms = [];
  const lamps = [];
  const colliders = []; // {minX,maxX,minZ,maxZ} for buildings, used by movement

  for (let bx = 0; bx < CITY.blocks; bx += 1) {
    for (let bz = 0; bz < CITY.blocks; bz += 1) {
      const x0 = lines[bx] + CITY.street / 2 + CITY.sidewalk;
      const z0 = lines[bz] + CITY.street / 2 + CITY.sidewalk;
      const inner = CITY.block - 2 * CITY.sidewalk;
      const plaza = bx === 5 && bz === 5;
      // The plaza block stays open: a fountain square, no buildings.
      if (plaza) {
        for (let p = 0; p < 8; p += 1) {
          palms.push({ x: x0 + 4 + (p % 4) * 11, z: z0 + 4 + Math.floor(p / 4) * 30, s: rng.range(0.9, 1.2) });
        }
        continue;
      }
      const n = rng.int(1, 3);
      for (let b = 0; b < n; b += 1) {
        const w = rng.range(12, 24);
        const d = rng.range(12, 24);
        const x = x0 + rng.range(2, Math.max(3, inner - w - 2));
        const z = z0 + rng.range(2, Math.max(3, inner - d - 2));
        const tall = rng.chance(0.16);
        const h = tall ? rng.range(34, 58) : rng.range(8, 26);
        const color = rng.pick(PALETTE.building);
        buildings.push({ x, z, w, d, h, color, floors: Math.max(2, Math.round(h / 3.4)) });
        colliders.push({ minX: x, maxX: x + w, minZ: z, maxZ: z + d });
      }
      // One palm per block, at a random corner, to keep the draw calls down.
      if (rng.chance(0.7)) {
        const corner = rng.int(0, 3);
        const px = corner % 2 === 0 ? x0 + 1.5 : x0 + inner - 1.5;
        const pz = corner < 2 ? z0 + 1.5 : z0 + inner - 1.5;
        palms.push({ x: px, z: pz, s: rng.range(0.85, 1.25) });
      }
    }
  }

  // Street lamps along every avenue, one per third intersection, alternating sides.
  for (const line of lines) {
    for (let i = 0; i <= CITY.blocks; i += 1) {
      if ((i + lines.indexOf(line)) % 3 !== 0) continue;
      const c = -HALF + i * PITCH;
      if ((i + lines.indexOf(line)) % 2 === 0) lamps.push({ x: line + CITY.street / 2 - 0.6, z: c, s: 1 });
      else lamps.push({ x: c, z: line + CITY.street / 2 - 0.6, s: 1 });
    }
  }

  // Road graph: nodes at every intersection, edges along every street.
  const nodes = [];
  for (let i = 0; i <= CITY.blocks; i += 1) {
    for (let j = 0; j <= CITY.blocks; j += 1) {
      nodes.push({ x: lines[i], z: lines[j], i, j });
    }
  }
  function nodeAt(i, j) {
    return nodes[j * (CITY.blocks + 1) + i];
  }

  return { lines, buildings, palms, lamps, colliders, nodes, nodeAt };
}

/** The nearest point on any road centreline to (x, z), snapped to the road. */
export function nearestRoadPoint(city, x, z) {
  let best = null;
  let bestD = Infinity;
  for (const line of city.lines) {
    const dx = Math.abs(x - line);
    if (dx < bestD) {
      bestD = dx;
      best = { x: line, z: clamp(z, -HALF, HALF) };
    }
    const dz = Math.abs(z - line);
    if (dz < bestD) {
      bestD = dz;
      best = { x: clamp(x, -HALF, HALF), z: line };
    }
  }
  return best;
}

/** A random intersection, at least `minDist` from (x, z). */
export function randomIntersection(rng, city, x, z, minDist) {
  for (let tries = 0; tries < 24; tries += 1) {
    const n = rng.pick(city.nodes);
    const d = Math.hypot(n.x - x, n.z - z);
    if (d >= minDist) return n;
  }
  return city.nodes[0];
}

/** True when the circle at (x, z) with radius r hits a building. */
export function hitsBuilding(city, x, z, r) {
  for (const c of city.colliders) {
    if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ) return c;
  }
  return null;
}

/** Push a circle out of any building it overlaps; returns the corrected position. */
export function resolveBuildings(city, x, z, r) {
  for (let pass = 0; pass < 3; pass += 1) {
    const c = hitsBuilding(city, x, z, r);
    if (!c) break;
    const pushL = x + r - c.minX;
    const pushR = c.maxX - (x - r);
    const pushT = z + r - c.minZ;
    const pushB = c.maxZ - (z - r);
    const m = Math.min(pushL, pushR, pushT, pushB);
    if (m === pushL) x = c.minX - r;
    else if (m === pushR) x = c.maxX + r;
    else if (m === pushT) z = c.minZ - r;
    else z = c.maxZ + r;
  }
  return { x, z };
}

/** Keep a position inside the playable land (beach counts, sea does not). */
export function clampToLand(x, z) {
  return {
    x: clamp(x, -HALF - 4, HARBOUR_X - 6),
    z: clamp(z, -HALF - 4, SEA_Z - 6),
  };
}
