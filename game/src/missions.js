// Mara Voss's five jobs: the story chain. Each mission is a small state machine
// with a waypoint, an objective line and a pass/fail. Missions unlock in order;
// progress is saved, so Continue resumes the next job. Pure logic — no three.js.

import { MISSIONS } from './config.js';
import { PLACES } from './world.js';
import { addHeat } from './police.js';
import { spawnThugs } from './combat.js';

// Step flags are a bitmask shared with the police and game modules, so each
// flag gets its own bit: EVENT_BUSTED is 1, these are 2 and 4, EVENT_WASTED
// is 8. (MISSION_DONE used to be 1 too — the same value as EVENT_BUSTED —
// so finishing a job showed the BUSTED screen. Never re-use a bit.)
export const MISSION_DONE = 2;
export const MISSION_FAILED = 4;

function setWaypoint(G, place) {
  G.mission.waypoint = { x: place.x, z: place.z, label: place.label };
  G.render.setWaypoint(place.x, place.z);
}

function clearWaypoint(G) {
  G.mission.waypoint = null;
  G.render.hideWaypoint();
}

function phone(G, text) {
  G.phone.push({ from: 'Mara Voss', text });
  if (G.phone.length > 3) G.phone.shift();
}

/** Begin mission `index` (0-based). Shows Mara's briefing in the phone panel. */
export function startMission(G, index) {
  const def = MISSIONS[index];
  const m = G.mission;
  m.index = index;
  m.phase = 'start';
  m.timer = 0;
  m.hasPackage = false;
  m.grabTimer = 0;
  phone(G, def.brief);
  G.events.push(`New job: ${def.name} — $${def.reward.toLocaleString('en-US')}`);
  if (index === 0) {
    m.phase = 'steal';
    clearWaypoint(G);
  } else if (index === 1) {
    m.phase = 'pickup';
    setWaypoint(G, PLACES.marinaKiosk);
  } else if (index === 2) {
    m.phase = 'escape';
    addHeat(G, 40); // a flat 2 stars to lose
    clearWaypoint(G);
  } else if (index === 3) {
    m.phase = 'pickup';
    m.timer = 95; // 5 s to read the brief, then 90 s on the road
    setWaypoint(G, PLACES.plaza);
  } else if (index === 4) {
    m.phase = 'bank';
    setWaypoint(G, PLACES.bank);
  }
}

/** The objective line the HUD shows for the current mission. */
export function missionObjective(G) {
  const m = G.mission;
  if (m.index >= MISSIONS.length) return 'Solmar is yours. Free roam — cause trouble, or don\'t.';
  const def = MISSIONS[m.index];
  switch (m.phase) {
    case 'steal': return `${def.name}: Steal a car (F near one)`;
    case 'deliver': return `${def.name}: Deliver it to ${m.waypoint ? m.waypoint.label : 'the marker'}`;
    case 'pickup': return `${def.name}: Pick up the package (E)`;
    case 'escape': return m.index === 2 ? `${def.name}: Lose the cops — stay out of sight` : `${def.name}: Get to the getaway`;
    case 'bank': return `${def.name}: Grab the courier cash at the bank (E)`;
    case 'grab': return `${def.name}: Grabbing the cash — hold on…`;
    default: return def.name;
  }
}

/** E pressed: consume it for a mission pickup or grab. Returns true if used. */
export function missionInteract(G) {
  const m = G.mission;
  const p = G.player;
  const px = p.car ? p.car.x : p.x;
  const pz = p.car ? p.car.z : p.z;
  if (m.index >= MISSIONS.length) return false;
  if (m.phase === 'pickup' && m.waypoint) {
    if (Math.hypot(px - m.waypoint.x, pz - m.waypoint.z) < 4) {
      m.hasPackage = true;
      if (m.index === 1) {
        m.phase = 'deliver';
        setWaypoint(G, PLACES.palmCourt);
        phone(G, 'Mara: "Package in hand. Palm Court, quiet streets. Go."');
      } else if (m.index === 3) {
        m.phase = 'deliver';
        m.timer = 90;
        setWaypoint(G, PLACES.docks);
        phone(G, 'Mara: "Clock is running. Ninety seconds to the docks."');
      }
      G.audio.blip();
      return true;
    }
  }
  if (m.phase === 'bank' && m.waypoint) {
    if (Math.hypot(px - m.waypoint.x, pz - m.waypoint.z) < 5) {
      m.phase = 'grab';
      m.grabTimer = 2;
      phone(G, 'Mara: "That\'s it — take the bag. His crew is coming, move!"');
      return true;
    }
  }
  return false;
}

function completeMission(G) {
  // A mission completes exactly once: a second completion call for the same
  // job (two steps landing on the waypoint in one frame, a re-run after a
  // phase reset) pays nothing, and completing a failed mission is a no-op.
  if (G.mission.phase === 'done' || G.mission.phase === 'failed') return 0;
  if (G.mission.completedIndex === G.mission.index) return 0;
  G.mission.completedIndex = G.mission.index;
  const def = MISSIONS[G.mission.index];
  G.player.cash += def.reward;
  G.stats.earned += def.reward;
  G.stats.missionsDone += 1;
  G.events.push(`Job done: ${def.name} — +$${def.reward.toLocaleString('en-US')}`);
  G.audio.blip();
  G.mission.index += 1;
  G.mission.phase = 'done';
  clearWaypoint(G);
  G.save();
  return MISSION_DONE;
}

function failMission(G, reason) {
  G.events.push(`Job failed: ${reason}`);
  G.mission.phase = 'failed';
  clearWaypoint(G);
  return MISSION_FAILED;
}

/** One step of the active mission. Returns MISSION_* flags. */
export function updateMissions(G, dt) {
  const m = G.mission;
  if (m.index >= MISSIONS.length || m.phase === 'done' || m.phase === 'failed') return 0;
  const p = G.player;
  const px = p.car ? p.car.x : p.x;
  const pz = p.car ? p.car.z : p.z;

  if (m.index === 0) {
    if (m.phase === 'steal' && p.car) {
      m.phase = 'deliver';
      setWaypoint(G, PLACES.garage);
      phone(G, 'Mara: "Good. Now bring it to my garage on Coral Row."');
    } else if (m.phase === 'deliver' && m.waypoint && p.car) {
      if (Math.hypot(px - m.waypoint.x, pz - m.waypoint.z) < 7) return completeMission(G);
    }
  } else if (m.index === 1) {
    if (m.phase === 'deliver' && m.waypoint) {
      if (Math.hypot(px - m.waypoint.x, pz - m.waypoint.z) < 5) return completeMission(G);
    }
  } else if (m.index === 2) {
    if (m.phase === 'escape' && G.wanted.heat <= 0) {
      phone(G, 'Mara: "Clean. You learn fast, kid."');
      return completeMission(G);
    }
  } else if (m.index === 3) {
    if (m.timer > 0) {
      m.timer -= dt;
      if (m.timer <= 0) return failMission(G, 'Out of time — the buyer walked.');
    }
    if (m.phase === 'deliver' && m.waypoint) {
      if (Math.hypot(px - m.waypoint.x, pz - m.waypoint.z) < 7) return completeMission(G);
    }
  } else if (m.index === 4) {
    if (m.phase === 'grab') {
      m.grabTimer -= dt;
      if (Math.hypot(px - PLACES.bank.x, pz - PLACES.bank.z) > 6) {
        m.phase = 'bank';
        phone(G, 'Mara: "Stay on the bag, kid."');
      } else if (m.grabTimer <= 0) {
        m.phase = 'escape';
        setWaypoint(G, PLACES.getaway);
        addHeat(G, 60); // 3 stars for the getaway
        spawnThugs(G, PLACES.bank.x, PLACES.bank.z, 4);
        phone(G, 'Mara: "GO. Sunset Pier. Don\'t stop for anyone."');
      }
    } else if (m.phase === 'escape' && m.waypoint) {
      if (Math.hypot(px - m.waypoint.x, pz - m.waypoint.z) < 8) {
        const done = completeMission(G);
        G.storyComplete = true;
        return done;
      }
    }
  }
  return 0;
}
