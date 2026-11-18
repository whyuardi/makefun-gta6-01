# SOLMAR HEAT — a complete open-world crime game in the spirit of GTA 6

[![gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/whyuardi/makefun-gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/whyuardi/makefun-gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

An open-world crime game set in **Solmar**, an original sun-soaked coastal port city. Explore it on foot and by car, steal vehicles, outrun the Solmar PD under a 1–5 star wanted level, and run five story missions for the fixer **Mara Voss**. Nothing here is from any Rockstar game: the city, characters, vehicles, story, art and sounds are all original, drawn and synthesized in code.

## The game

You are a new face in Solmar with no cash and no friends — except Mara Voss, who always has one more job:

1. **Borrowed Wheels** — steal a car and deliver it to Mara's garage ($500)
2. **The Package** — pick up a package on foot at the marina and walk it to Palm Court ($750)
3. **Heat Check** — lose a 2-star wanted level by staying out of sight ($1,000)
4. **Timed Run** — a 90-second delivery to the east docks buyer ($1,500)
5. **The Big One** — grab the Meridian Bank courier cash, shake the crew, and reach the Sunset Pier getaway ($5,000)

The city is a 10×10-block procedural grid with varied buildings, palm-lined streets, a beach and harbour, traffic that follows the roads, pedestrians who flee crimes, and police cars and foot cops who chase, ram and bust you. Crimes raise your wanted level; staying out of sight cools it down. Get caught and it's **Busted**; go down and it's **Wasted**.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move / drive |
| Mouse | Look (click the game to lock the pointer) |
| Shift | Sprint |
| Space | Jump / handbrake |
| F | Steal / exit car |
| E | Interact / pick up / grab |
| Click | Punch / shoot pistol |
| P / Esc | Pause |
| M | Mute |

## Features

- **Open world**: a full procedural city to explore on foot and by car, with traffic AI, pedestrians, a beach and harbour, sun and shadows, drifting clouds
- **Vehicles**: steal and drive four kinds — sedan, taxi, dock truck and the Viento GT sports car — each with its own speed and handling
- **Wanted system**: 1–5 stars, police interceptors and foot cops, heat that decays out of sight, Busted and Wasted screens
- **Missions and story**: a five-job chain from Mara Voss with phone briefings, waypoint markers, timers, pass/fail screens and cash rewards
- **Combat**: punch and pistol (with ammo), thug crews, health and ammo pickups
- **HUD**: health, cash, wanted stars, live 2D minimap, speed, clock, objective line, event feed and phone messages
- **Save**: cash, jobs done and best stats persist in the browser; Continue resumes your next job
- **Sound**: everything synthesized with WebAudio — engine hum, sirens, gunshots, pickup blips and an ambient pad. No audio files.
- **Deterministic screenshots**: `?shot=title|street|drive|chase` stages a fixed, seeded scene

## How to run

No build step, no network: the game is plain static files under `game/` (three.js is vendored as `game/vendor/three.module.min.js`).

```sh
node serve.ts
# open http://localhost:8080
```

Or serve `game/` with any static file server and open `game/index.html`.

## How to test

```sh
node tools/sim-test.mjs   # headless logic test: wanted math, police, all 5 missions
node tools/playtest.mjs   # scripted browser playtest with real keyboard input
node tools/shots.mjs      # takes the 4 screenshots into screenshots/
```

## Structure

- `game/index.html` — page, import map, HUD and menus
- `game/src/main.js` — boot, the fixed-step loop, screens, save/load
- `game/src/game.js` — builds the game state and advances it one step
- `game/src/config.js` — every tuning number and colour
- `game/src/random.js` — seeded RNG (no `Math.random` in logic)
- `game/src/world.js` — the city: grid, buildings, roads, beach, harbour
- `game/src/render.js` — three.js scene, meshes, camera, particles
- `game/src/traffic.js` — traffic AI, parked cars, car factory
- `game/src/pedestrians.js` — pedestrians who stroll and flee
- `game/src/police.js` — wanted system, police cars and foot cops
- `game/src/player.js` — on-foot movement and driving
- `game/src/missions.js` — Mara Voss's five-job chain
- `game/src/combat.js` — punch, pistol, thugs, pickups
- `game/src/audio.js` — synthesized WebAudio sound
- `game/src/hud.js` — HUD and menus
- `game/src/minimap.js` — live 2D minimap
- `game/src/shots.js` — deterministic screenshot staging
- `game/src/input.js` — keyboard and mouse input
- `tools/` — the CDP test driver, playtest, sim test and screenshot tool

## License

MIT — see `LICENSE`.
