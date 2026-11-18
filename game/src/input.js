// Keyboard and mouse input. Held keys are read every frame; one-shot presses
// (interact, shoot, steal, pause, confirm) are queued as bit flags and taken once
// by the loop, so a press between two frames is never lost or counted twice.
// Mouse movement steers the camera while the pointer is locked; clicking the
// canvas requests the lock, and Esc releases it (the browser owns that key).

export const ACT_INTERACT = 1; // E — enter/exit car, pick up, grab
export const ACT_ATTACK = 2; // mouse click — punch or shoot
export const ACT_PAUSE = 4; // P or Escape — pause / resume
export const ACT_CONFIRM = 8; // Enter or Space on a menu
export const ACT_MUTE = 16; // M — toggle sound

const FORWARD = new Set(['KeyW', 'ArrowUp']);
const BACK = new Set(['KeyS', 'ArrowDown']);
const LEFT = new Set(['KeyA', 'ArrowLeft']);
const RIGHT = new Set(['KeyD', 'ArrowRight']);

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let mouseDX = 0;
  let mouseDY = 0;
  let locked = false;
  // Interact is edge-triggered: one key press queues exactly one ACT_INTERACT,
  // and presses closer than 150 ms apart are merged, so a single press (or a
  // key-repeat burst) can never fire two interactions.
  let lastInteractAt = -Infinity;
  const INTERACT_DEBOUNCE_MS = 150;

  window.addEventListener('keydown', (event) => {
    if (event.target && (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA')) return;
    if (FORWARD.has(event.code) || BACK.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code)) {
      keys.add(event.code);
      event.preventDefault();
    } else if (event.code === 'KeyE' || event.code === 'KeyF') {
      // E and F both interact (E: pick up / grab, F: steal / exit car).
      if (!event.repeat) {
        const now = performance.now();
        if (now - lastInteractAt >= INTERACT_DEBOUNCE_MS) {
          actions |= ACT_INTERACT;
          lastInteractAt = now;
        }
      }
    } else if (event.code === 'KeyP' || event.code === 'Escape') {
      if (!event.repeat) actions |= ACT_PAUSE;
    } else if (event.code === 'Enter') {
      if (!event.repeat) actions |= ACT_CONFIRM;
    } else if (event.code === 'KeyM') {
      if (!event.repeat) actions |= ACT_MUTE;
    } else if (event.code === 'Space') {
      if (!event.repeat) actions |= ACT_CONFIRM;
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => keys.clear());
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
  });
  document.addEventListener('mousemove', (event) => {
    if (!locked) return;
    mouseDX += event.movementX || 0;
    mouseDY += event.movementY || 0;
  });
  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) actions |= ACT_ATTACK;
    if (!locked && document.pointerLockElement !== canvas) {
      try {
        canvas.requestPointerLock();
      } catch {
        // Pointer lock can be refused in a headless tab; the game still plays.
      }
    }
  });

  function has(...codes) {
    for (const code of codes) if (keys.has(code)) return true;
    return false;
  }

  return {
    get locked() {
      return locked;
    },
    /** Forward/back along the camera (-1..1) and strafe (-1..1). */
    move() {
      const f = (has('KeyW', 'ArrowUp') ? 1 : 0) - (has('KeyS', 'ArrowDown') ? 1 : 0);
      const s = (has('KeyD', 'ArrowRight') ? 1 : 0) - (has('KeyA', 'ArrowLeft') ? 1 : 0);
      return { f, s };
    },
    get sprint() {
      return keys.has('ShiftLeft') || keys.has('ShiftRight');
    },
    get jump() {
      return keys.has('Space');
    },
    get handbrake() {
      return keys.has('Space');
    },
    /** Mouse movement since the last call, in pixels. */
    takeMouse() {
      const out = { dx: mouseDX, dy: mouseDY };
      mouseDX = 0;
      mouseDY = 0;
      return out;
    },
    /** The one-shot presses since the last call, as ACT_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
