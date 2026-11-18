// The HUD and the menus: health, cash, wanted stars, objective, speed, clock,
// the event feed, Mara's phone messages, and the title / pause / end screens.
// All DOM; the 3D view stays in render.js.

import { missionObjective } from './missions.js';

function el(id) {
  return document.getElementById(id);
}

function fmtCash(n) {
  return '$' + Math.floor(n).toLocaleString('en-US');
}

function fmtClock(seconds) {
  const total = 10 * 3600 + seconds; // the day starts at 10:00
  const h = Math.floor(total / 3600) % 24;
  const m = Math.floor((total % 3600) / 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

export function createHud() {
  const nodes = {
    hud: el('hud'),
    healthFill: el('health-fill'),
    healthText: el('health-text'),
    cash: el('cash'),
    stars: el('stars'),
    objective: el('objective'),
    timer: el('timer'),
    speed: el('speed'),
    clock: el('clock'),
    ammo: el('ammo'),
    feed: el('feed'),
    phone: el('phone'),
    phoneText: el('phone-text'),
    interact: el('interact'),
    crosshair: el('crosshair'),
    banner: el('banner'),
    title: el('title'),
    pauseMenu: el('pause-menu'),
    endScreen: el('end-screen'),
    endTitle: el('end-title'),
    endText: el('end-text'),
    endSub: el('end-sub'),
    damage: el('damage-flash'),
  };
  let lastHealth = -1;
  let bannerTimer = 0;

  function showOnly(screen) {
    nodes.title.classList.toggle('hidden', screen !== 'title');
    nodes.pauseMenu.classList.toggle('hidden', screen !== 'paused');
    nodes.endScreen.classList.toggle('hidden', screen !== 'end');
    nodes.hud.classList.toggle('hidden', screen === 'title');
  }

  return {
    showScreen(screen, data) {
      showOnly(screen);
      if (screen === 'end' && data) {
        nodes.endTitle.textContent = data.title;
        nodes.endText.textContent = data.text;
        nodes.endSub.textContent = data.sub || '';
        nodes.endTitle.style.color = data.color || '#f4f1e8';
      }
      if (screen === 'title') {
        const save = data && data.hasSave;
        el('continue-btn').classList.toggle('hidden', !save);
        if (save && data.save) {
          el('continue-label').textContent =
            `Continue — ${data.save.missionsDone} job${data.save.missionsDone === 1 ? '' : 's'} done, ${fmtCash(data.save.cash)}`;
        }
      }
    },
    banner(text, seconds = 2.5) {
      nodes.banner.textContent = text;
      nodes.banner.classList.remove('hidden');
      bannerTimer = seconds;
    },
    update(G, dt) {
      if (bannerTimer > 0) {
        bannerTimer -= dt;
        if (bannerTimer <= 0) nodes.banner.classList.add('hidden');
      }
      const p = G.player;
      // Health bar flashes red when it drops.
      nodes.healthFill.style.width = Math.max(0, p.health) + '%';
      nodes.healthFill.style.background = p.health > 50 ? '#3fae5a' : p.health > 25 ? '#e8a13d' : '#e5484d';
      nodes.healthText.textContent = Math.ceil(Math.max(0, p.health)) + '';
      if (p.health < lastHealth) {
        nodes.damage.classList.remove('hidden');
        setTimeout(() => nodes.damage.classList.add('hidden'), 180);
      }
      lastHealth = p.health;
      nodes.cash.textContent = fmtCash(p.cash);
      const stars = G.wanted.stars;
      nodes.stars.textContent = '★'.repeat(stars) + '☆'.repeat(5 - stars);
      nodes.stars.style.color = stars === 0 ? 'rgba(244,241,232,0.45)' : '#ffb703';
      nodes.objective.textContent = missionObjective(G);
      const m = G.mission;
      nodes.timer.textContent =
        m.index === 3 && m.phase === 'deliver' && m.timer > 0 ? Math.ceil(m.timer) + 's' : '';
      const speed = p.car ? Math.abs(p.car.speed) * 3.6 : 0;
      nodes.speed.textContent = p.car ? Math.round(speed) + ' km/h' : '';
      nodes.clock.textContent = fmtClock(G.elapsed) + '  •  Solmar';
      nodes.ammo.textContent = p.hasPistol ? `Pistol ${p.ammo}` : 'Fists';
      // Event feed: the last three lines.
      const feed = G.events.slice(-3);
      nodes.feed.innerHTML = feed.map((line) => `<div>${line}</div>`).join('');
      // Phone: Mara's latest message.
      const last = G.phone[G.phone.length - 1];
      if (last) {
        nodes.phone.classList.remove('hidden');
        nodes.phoneText.textContent = last.text;
      } else {
        nodes.phone.classList.add('hidden');
      }
      // Interact prompt.
      nodes.interact.textContent = G.interactPrompt || '';
      nodes.interact.classList.toggle('hidden', !G.interactPrompt);
      nodes.crosshair.classList.toggle('hidden', !!p.car || G.screen !== 'play');
    },
  };
}
