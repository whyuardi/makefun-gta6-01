// Boot and the one loop: input is read every frame, the game advances in fixed
// 1/60 s steps, and the renderer paints what is there. The game moves between
// four screens: title, play, paused and end (busted, wasted, failed, story).
// ?seed=N fixes the city. ?shot=title|street|drive|chase (with &seed=N) stages
// that scene instead of running the loop, paints it and sets window.__shotReady.

import { SAVE_KEY, STEP } from './config.js';
import { createGame, EVENT_WASTED, resetGame, stepGame } from './game.js';
import { createRender } from './render.js';
import { ACT_ATTACK, ACT_CONFIRM, ACT_INTERACT, ACT_MUTE, ACT_PAUSE, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createMinimap } from './minimap.js';
import { stageShot } from './shots.js';
import { EVENT_BUSTED } from './police.js';
import { MISSION_DONE, MISSION_FAILED, startMission } from './missions.js';
import { updateTraffic } from './traffic.js';
import { updatePeds } from './pedestrians.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 7;

const canvas = document.getElementById('game');
const audio = createAudio();
const render = createRender(canvas);
const G = createGame(seed, render, audio);
render.buildCity(G.city);
const input = createInput(canvas);
const hud = createHud();
const minimap = createMinimap(document.getElementById('minimap'));

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSave() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: G.player.cash,
      missionsDone: G.stats.missionsDone,
      earned: G.stats.earned,
      storyComplete: G.storyComplete,
    }));
  } catch {
    // Storage can be off (private windows): progress then lasts this visit only.
  }
}
G.save = writeSave;

function applySave(save) {
  G.player.cash = save.cash || 0;
  G.stats.earned = save.earned || 0;
  G.stats.missionsDone = save.missionsDone || 0;
  G.storyComplete = !!save.storyComplete;
}

/** Begin a fresh run: a new city from the session seed, Mara's first job. */
function startNewGame() {
  resetGame(G);
  G.storyComplete = false;
  G.player.cash = 0;
  startMission(G, 0);
  G.screen = 'play';
  hud.showScreen('play');
  hud.banner('SOLMAR HEAT — Mara Voss has a job for you.');
  audio.unlock();
}

function continueGame(save) {
  resetGame(G);
  applySave(save);
  startMission(G, Math.min(save.missionsDone || 0, 4));
  G.screen = 'play';
  hud.showScreen('play');
  hud.banner('Welcome back to Solmar.');
  audio.unlock();
}

let endAction = 'respawn';

function showEnd(title, text, sub, color, action) {
  endAction = action;
  G.screen = 'end';
  hud.showScreen('end', { title, text, sub, color });
  document.getElementById('end-btn').textContent =
    action === 'retry' ? 'Retry the job' : action === 'freeroam' ? 'Keep playing' : 'Respawn — $100 hospital fee';
}

function handleEndAction() {
  if (endAction === 'retry') {
    startMission(G, G.mission.index);
    G.screen = 'play';
    hud.showScreen('play');
  } else if (endAction === 'freeroam') {
    G.screen = 'play';
    hud.showScreen('play');
  } else {
    // Respawn: patched up at the plaza clinic, heat cleared, job restarts.
    G.player.health = 100;
    G.player.cash = Math.max(0, G.player.cash - 100);
    G.wanted.heat = 0;
    G.wanted.stars = 0;
    G.cops = [];
    G.cars = G.cars.filter((c) => c.driver !== 'police');
    if (G.player.car) {
      G.player.car.driver = 'parked';
      G.player.car = null;
    }
    G.player.x = 6;
    G.player.z = 6;
    G.player.y = 0;
    if (G.mission.index < 5 && G.mission.phase !== 'done') startMission(G, G.mission.index);
    G.screen = 'play';
    hud.showScreen('play');
  }
  audio.unlock();
}

function runShot(name) {
  const screen = stageShot(name, G);
  G.screen = screen;
  window.__solmar = { G, version: 'solmar-heat-1.0.0' };
  window.__render = render;
  if (screen === 'title') {
    hud.showScreen('title', { hasSave: false });
  } else {
    hud.showScreen('play');
    hud.update(G, 0);
  }
  // The shots are painted synchronously — headless shells schedule rAF very
  // slowly, so waiting on it would take minutes. The last draw stays in the
  // canvas (preserveDrawingBuffer) for the screenshot to take.
  for (let i = 0; i < 40; i += 1) {
    render.draw(G, STEP);
    minimap.draw(G);
  }
  window.__shotReady = true;
}

function runGame() {
  let screen = 'title';
  let accumulator = 0;
  let last = performance.now();
  // Interact/attack presses are stashed here by handleActions and handed to the
  // next simulation step, so a press is never lost or counted twice.
  let pendingActions = 0;
  const save = readSave();
  G.screen = 'title';
  hud.showScreen('title', { hasSave: !!save, save });

  document.getElementById('start-btn').addEventListener('click', () => {
    if (screen !== 'title') return;
    startNewGame();
    screen = 'play';
  });
  document.getElementById('continue-btn').addEventListener('click', () => {
    if (screen !== 'title') return;
    const s = readSave();
    if (s) continueGame(s);
    screen = 'play';
  });
  document.getElementById('end-btn').addEventListener('click', () => {
    if (screen !== 'end') return;
    handleEndAction();
    screen = 'play';
  });
  document.getElementById('resume-btn').addEventListener('click', () => {
    if (screen !== 'paused') return;
    screen = 'play';
    G.screen = 'play';
    hud.showScreen('play');
  });
  document.getElementById('quit-btn').addEventListener('click', () => {
    if (screen !== 'paused') return;
    writeSave();
    screen = 'title';
    G.screen = 'title';
    const s = readSave();
    hud.showScreen('title', { hasSave: !!s, save: s });
  });

  function handleActions() {
    const actions = input.takeActions();
    pendingActions |= actions & (ACT_INTERACT | ACT_ATTACK);
    if (actions & ACT_MUTE) {
      const muted = audio.toggleMute();
      hud.banner(muted ? 'Sound off (M to turn back on)' : 'Sound on');
    }
    if (screen === 'title' && (actions & ACT_CONFIRM)) {
      startNewGame();
      screen = 'play';
    } else if (screen === 'play' && (actions & ACT_PAUSE)) {
      screen = 'paused';
      G.screen = 'paused';
      hud.showScreen('paused');
    } else if (screen === 'paused' && (actions & (ACT_PAUSE | ACT_CONFIRM))) {
      screen = 'play';
      G.screen = 'play';
      hud.showScreen('play');
    } else if (screen === 'end' && (actions & ACT_CONFIRM)) {
      handleEndAction();
      screen = 'play';
    }
  }

  // One frame of the game, driven by rAF in play and synchronously by the
  // automated playtest (headless shells schedule rAF very slowly).
  function pump(frameMs) {
    accumulator += Math.min(frameMs / 1000, MAX_FRAME);
    handleActions();
    if (screen === 'play') {
      const mouse = input.takeMouse();
      let stepActions = pendingActions;
      pendingActions = 0;
      while (accumulator >= STEP) {
        const flags = stepGame(G, {
          move: input.move(),
          sprint: input.sprint,
          jump: input.jump,
          handbrake: input.handbrake,
          mouse,
          actions: stepActions,
        });
        stepActions = 0;
        accumulator -= STEP;
        if (flags & EVENT_BUSTED) {
          showEnd('BUSTED', 'The Solmar PD took you in. Mara posts your bail — this time.', 'Your jobs wait where you left them.', '#4aa3ff', 'respawn');
          screen = 'end';
          break;
        }
        if (flags & EVENT_WASTED) {
          showEnd('WASTED', 'You went down in the streets of Solmar.', 'The clinic patches you up. The city does not forget.', '#e5484d', 'respawn');
          screen = 'end';
          break;
        }
        if (flags & MISSION_FAILED) {
          showEnd('JOB FAILED', 'Mara is not angry. Mara is disappointed. Which is worse.', 'Retry the job when you are ready.', '#e8a13d', 'retry');
          screen = 'end';
          break;
        }
        if (flags & MISSION_DONE) {
          if (G.storyComplete) {
            showEnd('THE BIG ONE — DONE', 'Five jobs. One clean getaway. Solmar is yours now, kid.', 'Free roam: the city, the cars and the cops are all still here.', '#ffb703', 'freeroam');
            screen = 'end';
          } else {
            hud.banner('Job done. Mara will call with the next one.');
          }
          break;
        }
      }
      if (screen === 'play') {
        render.draw(G, STEP);
        minimap.draw(G);
        hud.update(G, STEP);
      }
    } else if (screen === 'title') {
      // The title screen lives over a slow drift through a living city.
      G.elapsed += STEP;
      G.player.camYaw += STEP * 0.02;
      updateTraffic(G, STEP);
      updatePeds(G, STEP);
      render.draw(G, STEP);
    } else if (screen === 'paused' || screen === 'end') {
      render.draw(G, 0);
    }
    G.screen = screen;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    pump(now - last);
    last = now;
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'play') {
      screen = 'paused';
      G.screen = 'paused';
      hud.showScreen('paused');
    }
  });

  // A handle for the automated playtest: the real game state, read-only use,
  // plus pump(seconds), which runs the loop synchronously for that long.
  window.__solmar = {
    G,
    version: 'solmar-heat-1.0.0',
    pump(seconds) {
      const n = Math.round(seconds * 60);
      for (let i = 0; i < n; i += 1) pump(1000 / 60);
    },
  };
  window.__render = render;
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
