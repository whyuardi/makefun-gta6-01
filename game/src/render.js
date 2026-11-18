// The three.js picture of Solmar: sky, sun and shadows, the city meshes built from
// world.js data, the cars and people, particles, and the third-person camera.
// It reads game state and paints it; it never changes the rules.

import * as THREE from 'three';
import { CAR_TYPES, CITY, HALF, HARBOUR_X, PALETTE, PITCH, SEA_Z } from './config.js';

function canvasTexture(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** A building facade: coloured plaster with a grid of lit and dark windows. */
function facadeTexture(base) {
  return canvasTexture(128, (ctx, s) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(0, s - 10, s, 10);
    for (let y = 10; y < s - 14; y += 18) {
      for (let x = 8; x < s - 12; x += 18) {
        const lit = ((x * 7 + y * 13) % 5) === 0;
        ctx.fillStyle = lit ? '#ffe9a8' : '#2c3540';
        ctx.fillRect(x, y, 11, 12);
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(x, y, 11, 2);
      }
    }
  });
}

/** Asphalt with a dashed centre line, tiled along the road. */
function roadTexture() {
  return canvasTexture(128, (ctx, s) => {
    ctx.fillStyle = '#3a3d42';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let i = 0; i < 200; i += 1) ctx.fillRect((i * 37) % s, (i * 91) % s, 2, 2);
    // Dashes run along the road (the tile's U axis), one per half tile.
    ctx.fillStyle = '#e8d44d';
    ctx.fillRect(0, s / 2 - 2, 26, 4);
    ctx.fillRect(64, s / 2 - 2, 26, 4);
  });
}

function box(w, h, d, color, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** One car, built from boxes. The group faces +X when its angle is 0. */
export function makeCarMesh(typeKey, color) {
  const type = CAR_TYPES[typeKey];
  const g = new THREE.Group();
  const L = type.length;
  const W = type.width;
  g.add(box(L * 0.98, type.height * 0.55, W, color, 0, type.height * 0.42, 0));
  const cabin = box(L * 0.5, type.height * 0.5, W * 0.82, 0x22303e, -L * 0.04, type.height * 0.9, 0);
  g.add(cabin);
  if (typeKey === 'truck') {
    g.add(box(L * 0.42, type.height * 0.5, W * 0.9, 0x6d7278, L * 0.26, type.height * 0.75, 0));
  }
  if (typeKey === 'taxi') {
    g.add(box(0.7, 0.18, 0.5, 0xf2b705, -L * 0.04, type.height * 1.22, 0));
  }
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
  for (const [wx, wz] of [[L * 0.32, W / 2], [L * 0.32, -W / 2], [-L * 0.32, W / 2], [-L * 0.32, -W / 2]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(wx, 0.36, wz);
    wheel.castShadow = true;
    g.add(wheel);
  }
  const headMat = new THREE.MeshLambertMaterial({ color: 0xfff6c9, emissive: 0x554400 });
  for (const wz of [W / 2 - 0.3, -W / 2 + 0.3]) {
    const h = box(0.08, 0.18, 0.34, 0xfff6c9, L / 2, type.height * 0.45, wz);
    h.material = headMat;
    g.add(h);
  }
  const tailMat = new THREE.MeshLambertMaterial({ color: 0xcc2222, emissive: 0x550000 });
  for (const wz of [W / 2 - 0.3, -W / 2 + 0.3]) {
    const t = box(0.08, 0.16, 0.3, 0xcc2222, -L / 2, type.height * 0.5, wz);
    t.material = tailMat;
    g.add(t);
  }
  let lightBar = null;
  if (typeKey === 'police') {
    lightBar = new THREE.Group();
    const r = box(0.5, 0.16, 0.4, 0xff2222, 0, type.height * 1.22, -0.3);
    const b = box(0.5, 0.16, 0.4, 0x2266ff, 0, type.height * 1.22, 0.3);
    r.material = new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xaa0000 });
    b.material = new THREE.MeshLambertMaterial({ color: 0x2266ff, emissive: 0x0022aa });
    lightBar.add(r, b);
    lightBar.userData = { red: r, blue: b };
    g.add(lightBar);
  }
  g.userData.lightBar = lightBar;
  return g;
}

/** One person: legs, torso, head. Faces +Z when its angle is 0. */
export function makePersonMesh(shirt, skin = 0xc98e6b) {
  const g = new THREE.Group();
  g.add(box(0.34, 0.75, 0.2, 0x2a2f38, 0, 0.38, 0));
  g.add(box(0.52, 0.62, 0.3, shirt, 0, 1.05, 0));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), new THREE.MeshLambertMaterial({ color: skin }));
  head.position.set(0, 1.55, 0);
  head.castShadow = true;
  g.add(head);
  return g;
}

export function createRender(canvas) {
  // Software rasterizers (SwiftShader in headless testing) pay for every pixel
  // of antialiasing and every texel of shadow map, so detect one first and
  // trade those for speed; real GPUs keep the full quality.
  let softwareGL = false;
  try {
    const probe = document.createElement('canvas').getContext('webgl2');
    const ext = probe && probe.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? String(probe.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    softwareGL = /swiftshader|llvmpipe|software/i.test(name);
  } catch {
    softwareGL = false;
  }
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !softwareGL, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  // PCFSoft's many taps are far too slow in a software rasterizer; there the
  // game uses a single-tap shadow map at a quarter of the resolution.
  renderer.shadowMap.type = softwareGL ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 180, 700);

  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1200);
  camera.position.set(0, 40, 60);

  const sun = new THREE.DirectionalLight(PALETTE.sun, 2.6);
  sun.castShadow = true;
  const shadowSize = softwareGL ? 512 : 2048;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  sun.shadow.camera.left = -160;
  sun.shadow.camera.right = 160;
  sun.shadow.camera.top = 160;
  sun.shadow.camera.bottom = -160;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 700;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x8a7f66, 1.1));

  const carMeshes = new Map();
  const personMeshes = new Map();
  const pickupMeshes = new Map();
  const particles = [];
  const clouds = [];
  let playerMesh = null;
  let waypointMarker = null;
  let shake = 0;

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  function buildCity(city) {
    const roadTex = roadTexture();
    roadTex.wrapS = THREE.RepeatWrapping;
    roadTex.wrapT = THREE.RepeatWrapping;
    // Ground: sidewalk tone everywhere; roads and block pads drawn on top.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(HALF * 2 + 320, HALF * 2 + 320),
      new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, 40);
    ground.receiveShadow = true;
    scene.add(ground);

    // Roads: one long strip per street line, both directions.
    const roadLen = HALF * 2 + CITY.street;
    const roadGeoX = new THREE.PlaneGeometry(roadLen, CITY.street);
    const roadGeoZ = new THREE.PlaneGeometry(CITY.street, roadLen);
    for (const line of city.lines) {
      const texX = roadTex.clone();
      texX.needsUpdate = true;
      texX.repeat.set(roadLen / 16, 1);
      const rx = new THREE.Mesh(roadGeoX, new THREE.MeshLambertMaterial({ map: texX }));
      rx.rotation.x = -Math.PI / 2;
      rx.position.set(0, 0.02, line);
      rx.receiveShadow = true;
      scene.add(rx);
      const texZ = roadTex.clone();
      texZ.needsUpdate = true;
      texZ.repeat.set(roadLen / 16, 1);
      const rz = new THREE.Mesh(roadGeoZ, new THREE.MeshLambertMaterial({ map: texZ }));
      rz.rotation.x = -Math.PI / 2;
      rz.rotation.z = Math.PI / 2;
      rz.position.set(line, 0.02, 0);
      rz.receiveShadow = true;
      scene.add(rz);
    }

    // Block tops: one big pad per block is a hundred draw calls; the sidewalk
    // ground already reads as pavement, so the pads are skipped entirely.

    // Buildings, with a facade texture per colour. One mesh per building: the
    // box carries the facade on its sides and a flat roof colour on top/bottom.
    const facadeCache = new Map();
    function facade(color) {
      if (!facadeCache.has(color)) {
        facadeCache.set(color, facadeTexture('#' + color.toString(16).padStart(6, '0')));
      }
      return facadeCache.get(color);
    }
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x5c5648 });
    for (const b of city.buildings) {
      const sideMat = new THREE.MeshLambertMaterial({ map: facade(b.color) });
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(b.w, b.h, b.d),
        [sideMat, sideMat, roofMat, roofMat, sideMat, sideMat],
      );
      mesh.position.set(b.x + b.w / 2, b.h / 2, b.z + b.d / 2);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
    }

    // Palms: trunk + one crown cone each, to keep the draw calls down.
    const trunkMat = new THREE.MeshLambertMaterial({ color: PALETTE.palmTrunk });
    const leafMat = new THREE.MeshLambertMaterial({ color: PALETTE.palmLeaf });
    for (const p of city.palms) {
      const palm = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 5.4 * p.s, 6), trunkMat);
      trunk.position.y = 2.7 * p.s;
      trunk.castShadow = true;
      palm.add(trunk);
      const crown = new THREE.Mesh(new THREE.SphereGeometry(2.0, 8, 6), leafMat);
      crown.scale.set(1, 0.55, 1);
      crown.position.y = 6.4 * p.s;
      crown.castShadow = true;
      palm.add(crown);
      palm.position.set(p.x, 0, p.z);
      scene.add(palm);
    }

    // Street lamps.
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x2e3136 });
    const lampMat = new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0x665511 });
    for (const l of city.lamps) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 6, 6), poleMat);
      pole.position.set(l.x, 3, l.z);
      pole.castShadow = true;
      scene.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), lampMat);
      bulb.position.set(l.x, 6.1, l.z);
      scene.add(bulb);
    }

    // Beach sand, the sea to the south and east, and wooden piers.
    const sand = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2 + 320, SEA_Z - HALF + 60), new THREE.MeshLambertMaterial({ color: PALETTE.sand }));
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(0, 0.01, HALF + (SEA_Z - HALF) / 2);
    sand.receiveShadow = true;
    scene.add(sand);
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(1200, 500), new THREE.MeshLambertMaterial({ color: PALETTE.sea }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, -0.4, SEA_Z + 240);
    scene.add(sea);
    const seaEast = new THREE.Mesh(new THREE.PlaneGeometry(320, 1200), new THREE.MeshLambertMaterial({ color: PALETTE.sea }));
    seaEast.rotation.x = -Math.PI / 2;
    seaEast.position.set(HARBOUR_X + 150, -0.4, 0);
    scene.add(seaEast);
    const woodMat = new THREE.MeshLambertMaterial({ color: 0x8a6a44 });
    const pier = new THREE.Mesh(new THREE.BoxGeometry(10, 0.5, 46), woodMat);
    pier.position.set(-HALF + PITCH, 0.4, HALF + 26);
    pier.castShadow = true;
    pier.receiveShadow = true;
    scene.add(pier);
    const dock = new THREE.Mesh(new THREE.BoxGeometry(40, 0.5, 12), woodMat);
    dock.position.set(HARBOUR_X + 14, 0.4, HALF - 3 * PITCH);
    dock.castShadow = true;
    dock.receiveShadow = true;
    scene.add(dock);

    // Drifting clouds.
    const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    for (let i = 0; i < 9; i += 1) {
      const cloud = new THREE.Group();
      for (let j = 0; j < 4; j += 1) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(7 + j * 2, 10, 8), cloudMat);
        puff.position.set(j * 8 - 12, j % 2, j * 3 - 4);
        puff.scale.y = 0.45;
        cloud.add(puff);
      }
      cloud.position.set(-320 + i * 80, 95 + (i % 3) * 12, -260 + (i * 53) % 520);
      scene.add(cloud);
      clouds.push(cloud);
    }
  }

  function getCarMesh(car) {
    let mesh = carMeshes.get(car.id);
    if (!mesh) {
      mesh = makeCarMesh(car.type, car.color);
      scene.add(mesh);
      carMeshes.set(car.id, mesh);
    }
    return mesh;
  }

  function getPersonMesh(entity, shirt) {
    let mesh = personMeshes.get(entity.id);
    if (!mesh) {
      mesh = makePersonMesh(shirt);
      scene.add(mesh);
      personMeshes.set(entity.id, mesh);
    }
    return mesh;
  }

  function spawnParticle(x, y, z, color, count, speed) {
    for (let i = 0; i < count; i += 1) {
      let p = particles.find((q) => !q.alive);
      if (!p) {
        if (particles.length >= 120) return;
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.22, 0.22, 0.22),
          new THREE.MeshBasicMaterial({ color }),
        );
        scene.add(mesh);
        p = { mesh, alive: false, vx: 0, vy: 0, vz: 0, life: 0 };
        particles.push(p);
      }
      p.alive = true;
      p.life = 0.5;
      p.mesh.visible = true;
      p.mesh.position.set(x, y, z);
      const a = Math.random() * Math.PI * 2;
      p.vx = Math.cos(a) * speed;
      p.vz = Math.sin(a) * speed;
      p.vy = speed * 0.7;
    }
  }

  /** Move the sun to follow the player so shadows stay crisp. */
  function followSun(focus) {
    sun.position.set(focus.x + 140, 220, focus.z + 90);
    sun.target.position.set(focus.x, 0, focus.z);
    sun.target.updateMatrixWorld();
  }

  return {
    scene,
    camera,
    renderer,
    buildCity,
    spawnParticle,
    addShake(amount) {
      shake = Math.min(1.2, shake + amount);
    },
    setPlayerMesh(mesh) {
      if (playerMesh) scene.remove(playerMesh);
      playerMesh = mesh;
      scene.add(mesh);
    },
    setWaypoint(x, z) {
      if (!waypointMarker) {
        const mat = new THREE.MeshBasicMaterial({ color: 0xffb703, transparent: true, opacity: 0.35 });
        waypointMarker = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 26, 8), mat);
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(2.4, 3.2, 24),
          new THREE.MeshBasicMaterial({ color: 0xffb703, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = -12.8;
        waypointMarker.add(ring);
        scene.add(waypointMarker);
      }
      waypointMarker.visible = true;
      waypointMarker.position.set(x, 13, z);
    },
    hideWaypoint() {
      if (waypointMarker) waypointMarker.visible = false;
    },
    /** Paint one frame from game state. */
    draw(G, dt) {
      for (const car of G.cars) {
        const mesh = getCarMesh(car);
        mesh.visible = true;
        mesh.position.set(car.x, 0, car.z);
        mesh.rotation.y = car.angle - Math.PI / 2;
        const bar = mesh.userData.lightBar;
        if (bar) {
          const phase = Math.floor(G.elapsed * 6) % 2 === 0;
          bar.userData.red.material.emissive.setHex(phase ? 0xff0000 : 0x220000);
          bar.userData.blue.material.emissive.setHex(phase ? 0x000022 : 0x0033ff);
        }
        mesh.rotation.z = car.steer ? -car.steer * 0.02 : 0;
      }
      for (const [id, mesh] of carMeshes) {
        if (!G.cars.some((c) => c.id === id)) mesh.visible = false;
      }
      for (const ped of G.peds) {
        const mesh = getPersonMesh(ped, ped.shirt);
        mesh.visible = true;
        mesh.position.set(ped.x, 0, ped.z);
        mesh.rotation.y = ped.angle;
        mesh.position.y = Math.abs(Math.sin(G.elapsed * 9 + ped.id * 1.7)) * (ped.state === 'flee' ? 0.14 : 0.07);
      }
      for (const cop of G.cops) {
        const mesh = getPersonMesh(cop, 0x1e3a5f);
        mesh.visible = true;
        mesh.position.set(cop.x, 0, cop.z);
        mesh.rotation.y = cop.angle;
      }
      for (const thug of G.thugs) {
        const mesh = getPersonMesh(thug, 0x4a4a4a);
        mesh.visible = true;
        mesh.position.set(thug.x, 0, thug.z);
        mesh.rotation.y = thug.angle;
      }
      for (const [id, mesh] of personMeshes) {
        const alive =
          G.peds.some((p) => p.id === id) || G.cops.some((p) => p.id === id) || G.thugs.some((p) => p.id === id);
        if (!alive) mesh.visible = false;
      }
      for (const pk of G.pickups) {
        let mesh = pickupMeshes.get(pk.id);
        if (!mesh) {
          const color = pk.kind === 'health' ? 0x2ecc71 : 0xf2b705;
          mesh = new THREE.Group();
          mesh.add(box(0.9, 0.28, 0.28, color, 0, 0.9, 0));
          mesh.add(box(0.28, 0.9, 0.28, color, 0, 0.9, 0));
          scene.add(mesh);
          pickupMeshes.set(pk.id, mesh);
        }
        mesh.visible = true;
        mesh.position.set(pk.x, 0, pk.z);
        mesh.rotation.y = G.elapsed * 1.6;
      }
      for (const [id, mesh] of pickupMeshes) {
        if (!G.pickups.some((p) => p.id === id)) mesh.visible = false;
      }
      if (playerMesh) {
        if (G.player.car) {
          playerMesh.visible = false;
        } else {
          playerMesh.visible = true;
          playerMesh.position.set(G.player.x, G.player.y, G.player.z);
          playerMesh.rotation.y = G.player.yaw;
        }
      }
      for (const p of particles) {
        if (!p.alive) continue;
        p.life -= dt;
        if (p.life <= 0) {
          p.alive = false;
          p.mesh.visible = false;
          continue;
        }
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;
        p.vy -= 12 * dt;
      }
      for (const cloud of clouds) {
        cloud.position.x += dt * 1.2;
        if (cloud.position.x > 420) cloud.position.x = -420;
      }
      const focus = G.player.car ? G.player.car : G.player;
      followSun(focus);
      if (G.cameraOverride) {
        camera.position.set(G.cameraOverride.pos[0], G.cameraOverride.pos[1], G.cameraOverride.pos[2]);
        camera.lookAt(G.cameraOverride.look[0], G.cameraOverride.look[1], G.cameraOverride.look[2]);
      } else {
        const yaw = G.player.camYaw;
        const pitch = G.player.camPitch;
        const driving = !!G.player.car;
        const dist = driving ? 10.5 : 6.5;
        const height = driving ? 4.2 : 3.1;
        const tx = focus.x;
        const tz = focus.z;
        const cx = tx - Math.sin(yaw) * Math.cos(pitch) * dist;
        const cz = tz - Math.cos(yaw) * Math.cos(pitch) * dist;
        const cy = (focus.y || 0) + height + Math.sin(pitch) * dist;
        camera.position.x += (cx - camera.position.x) * Math.min(1, dt * 8);
        camera.position.y += (cy - camera.position.y) * Math.min(1, dt * 8);
        camera.position.z += (cz - camera.position.z) * Math.min(1, dt * 8);
        const lookY = (focus.y || 0) + (driving ? 1.6 : 1.4);
        camera.lookAt(tx, lookY, tz);
        if (shake > 0.01) {
          camera.position.x += (Math.random() - 0.5) * shake * 0.5;
          camera.position.y += (Math.random() - 0.5) * shake * 0.5;
          shake *= Math.pow(0.02, dt);
        }
        const targetFov = driving ? 62 + Math.min(10, Math.abs(focus.speed || 0) * 0.22) : 62;
        if (Math.abs(camera.fov - targetFov) > 0.05) {
          camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 4);
          camera.updateProjectionMatrix();
        }
      }
      renderer.render(scene, camera);
    },
  };
}
