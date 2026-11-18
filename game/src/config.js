// SOLMAR HEAT — every tuning number and colour in one place.
// The city is a grid of blocks and streets on the XZ plane: x runs east, z runs south.
// The beach and sea sit on the south edge, the harbour on the east edge.

export const STEP = 1 / 60;

export const CITY = {
  blocks: 10, // blocks per side
  block: 44, // building block depth, metres
  street: 14, // road width, metres
  sidewalk: 4, // pavement width around each block
};
// Pitch between neighbouring street centrelines.
export const PITCH = CITY.block + CITY.street;
export const HALF = (CITY.blocks * PITCH) / 2; // 290: streets run -290..290
export const BEACH_Z = HALF + 8; // sand starts here
export const SEA_Z = HALF + 68; // water starts here
export const HARBOUR_X = HALF + 8; // docks start here

export const PLAYER = {
  radius: 0.55,
  walkSpeed: 5.2,
  sprintSpeed: 9.0,
  accel: 40,
  jumpSpeed: 7.5,
  gravity: 22,
  maxHealth: 100,
  punchDamage: 12,
  punchRange: 2.1,
  punchCooldown: 0.45,
};

export const PISTOL = {
  damage: 34,
  range: 60,
  ammoStart: 24,
  cooldown: 0.28,
  spread: 0.02,
};

export const CAR_TYPES = {
  sedan: { label: 'Solmar Sedan', length: 4.4, width: 1.9, height: 1.35, topSpeed: 30, accel: 13, brake: 26, turn: 1.9, color: 0x3f6fb5 },
  taxi: { label: 'Harbour Taxi', length: 4.4, width: 1.9, height: 1.35, topSpeed: 28, accel: 12, brake: 26, turn: 1.9, color: 0xf2b705 },
  truck: { label: 'Dock Truck', length: 6.6, width: 2.4, height: 2.7, topSpeed: 21, accel: 8, brake: 20, turn: 1.3, color: 0x8a8f96 },
  sports: { label: 'Viento GT', length: 4.3, width: 2.0, height: 1.05, topSpeed: 43, accel: 19, brake: 30, turn: 2.3, color: 0xc22e3d },
  police: { label: 'Solmar PD Interceptor', length: 4.5, width: 1.95, height: 1.35, topSpeed: 34, accel: 15, brake: 30, turn: 2.1, color: 0x1c2733 },
};

export const TRAFFIC = { count: 26, parked: 14, minGap: 7, cruise: 0.55 };
export const PEDS = { count: 42, walkSpeed: 1.4, fleeSpeed: 4.2 };

export const WANTED = {
  stealCar: 25,
  hitPed: 15,
  shoot: 20,
  hitPolice: 20,
  killThug: 0,
  decayUnseen: 3.0, // heat per second while no police can see the player
  decayHidden: 6.0, // heat per second while far from every cop and on foot
  seeRange: 46,
  maxStars: 5,
};

export const POLICE = {
  maxCars: 5,
  maxCops: 4,
  ramDamage: 9,
  copDamage: 6,
  bustTime: 1.4, // seconds a cop must hold the player to bust them
  spawnRange: 55,
};

export const THUG = { count: 4, health: 50, speed: 3.6, damage: 8, range: 1.9 };

export const MISSIONS = [
  { id: 1, name: 'Borrowed Wheels', reward: 500, brief: 'Mara: "Welcome to Solmar, kid. First job — borrow a car. Any car. Bring it to my garage on Coral Row and nobody gets hurt."' },
  { id: 2, name: 'The Package', reward: 750, brief: 'Mara: "Nice driving. Now on foot — pick up the package at the marina kiosk, then walk it to the drop on Palm Court. No cars, no noise."' },
  { id: 3, name: 'Heat Check', reward: 1000, brief: 'Mara: "The PD has your face now. Lose them. Stay out of sight till the heat dies — then call me."' },
  { id: 4, name: 'Timed Run', reward: 1500, brief: 'Mara: "A buyer is waiting at the east docks. Ninety seconds, door to door. Drive like the tide is coming in — because it is."' },
  { id: 5, name: 'The Big One', reward: 5000, brief: 'Mara: "Last one. The Meridian Bank vault courier is carrying the weekend take. Grab it, shake the crew, and bring it to the getaway on Sunset Pier. Then we are rich, kid."' },
];

export const SAVE_KEY = 'solmar-heat-save-v1';

export const PALETTE = {
  sky: 0x8ec9ee,
  fog: 0xa8d4f0,
  sun: 0xfff2d8,
  ground: 0x9aa08b,
  asphalt: 0x3a3d42,
  sidewalk: 0xb9b3a4,
  sand: 0xe8d49a,
  sea: 0x2e7fa8,
  building: [0xe8dcc8, 0xd9b48f, 0xb8c4c9, 0xe0a58a, 0xc9d6de, 0xf0e6d2, 0x9fb8a8, 0xd8c2a8],
  palmTrunk: 0x8a6a44,
  palmLeaf: 0x3f9e4d,
  text: '#f4f1e8',
  muted: '#b9c2c9',
  accent: '#ffb703',
  danger: '#e5484d',
  police: '#4aa3ff',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
