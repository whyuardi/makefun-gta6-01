// A minimal Chrome DevTools Protocol driver over Node's built-in WebSocket.
// No dependencies: it launches the cached headless shell, opens a page, evaluates
// JavaScript in it, dispatches real keyboard input, and takes screenshots.
// Written for this entry's own testing; it is not part of the game.

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { homedir } from 'node:os';
import { join } from 'node:path';

const SHELL = process.env.CHROME_BIN || join(homedir(), '.cache/ms-playwright/chromium_headless_shell-1148/chrome-linux/headless_shell');

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitFor(fn, timeoutMs = 30000, intervalMs = 200) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  for (;;) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    if (Date.now() > deadline) throw new Error(`waitFor timed out after ${timeoutMs}ms: ${lastError?.message ?? ''}`);
    await sleep(intervalMs);
  }
}

/** Launch the headless shell with remote debugging and wait for its HTTP endpoint. */
export async function launchBrowser(port = 9222, windowSize = '1280,720') {
  const child = spawn(SHELL, [
    '--headless',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--use-angle=swiftshader',
    `--remote-debugging-port=${port}`,
    `--window-size=${windowSize}`,
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  child.stderr.on('data', () => {});
  await waitFor(async () => {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`);
    return res.ok;
  }, 20000);
  return {
    port,
    async close() {
      if (child.exitCode === null) {
        child.kill('SIGKILL');
        await Promise.race([once(child, 'exit'), sleep(2000)]);
      }
    },
  };
}

/** Start the repo's static server (serve.ts) on the given port. */
export async function launchServer(repoDir, port = 8080) {
  const child = spawn('node', ['serve.ts', '--port', String(port)], { cwd: repoDir, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stderr.on('data', () => {});
  await waitFor(async () => {
    const res = await fetch(`http://127.0.0.1:${port}/index.html`);
    return res.ok;
  }, 15000);
  return {
    async close() {
      if (child.exitCode === null) {
        child.kill('SIGKILL');
        await Promise.race([once(child, 'exit'), sleep(2000)]);
      }
    },
  };
}

class Session {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.handlers = new Map();
    this.eventLog = [];
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.code}: ${msg.error.message}`));
        else resolve(msg.result);
      } else if (msg.method) {
        this.eventLog.push(msg);
        const list = this.handlers.get(msg.method) ?? [];
        for (const fn of list) fn(msg.params);
      }
    });
  }

  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, fn) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(fn);
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) {
      throw new Error(`page exception: ${result.exceptionDetails.text} ${result.exceptionDetails.exception?.description ?? ''}`);
    }
    return result.result.value;
  }

  async key(type, code, key, keyCode) {
    await this.send('Input.dispatchKeyEvent', { type, code, key, keyCode, windowsVirtualKeyCode: keyCode });
  }

  async keyPress(code, key, keyCode, holdMs = 0) {
    await this.key('keyDown', code, key, keyCode);
    if (holdMs > 0) await sleep(holdMs);
    await this.key('keyUp', code, key, keyCode);
  }

  async keyDown(code, key, keyCode) {
    await this.key('keyDown', code, key, keyCode);
  }

  async keyUp(code, key, keyCode) {
    await this.key('keyUp', code, key, keyCode);
  }

  async click(x, y) {
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }

  async screenshot(path) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
    const { writeFileSync } = await import('node:fs');
    writeFileSync(path, Buffer.from(data, 'base64'));
  }

  close() {
    this.ws.close();
  }
}

/** Open a fresh tab at `url` and return an attached session with collectors. */
export async function openPage(port, url) {
  let res = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  if (!res.ok) {
    res = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`);
  }
  const target = await res.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  // Timeout guard: a headless shell that never opens its debugger must fail
  // fast here instead of hanging the whole run on the socket open. The timer
  // is cancelled the moment the socket opens — a stray timer left running
  // would close a live session mid-run (that exact bug killed every
  // playtest at ~10 s: a sleep().then(ws.close()) that fired after the race
  // had already settled).
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      try { ws.close(); } catch { /* already gone */ }
      reject(new Error('CDP websocket did not open within 10s'));
    }, 10000);
    ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    ws.addEventListener('error', (event) => {
      clearTimeout(timer);
      reject(event.error ?? new Error('CDP websocket error'));
    }, { once: true });
  });
  const session = new Session(ws);
  await session.send('Page.enable');
  await session.send('Runtime.enable');
  await session.send('Network.enable');
  await session.send('Log.enable');
  const errors = [];
  const requests = [];
  session.on('Runtime.exceptionThrown', (p) => {
    errors.push(`exception: ${p.exceptionDetails.text} ${p.exceptionDetails.exception?.description ?? ''}`);
  });
  session.on('Runtime.consoleAPICalled', (p) => {
    if (p.type === 'error') errors.push(`console.error: ${p.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
  });
  session.on('Network.requestWillBeSent', (p) => requests.push(p.request.url));
  session.on('Network.loadingFailed', (p) => {
    if (!p.canceled) errors.push(`network failed: ${p.errorText}`);
  });
  session.on('Log.entryAdded', (p) => {
    if (p.entry.level === 'error') errors.push(`log: ${p.entry.text} ${p.entry.url ?? ''}`);
  });
  session.errors = errors;
  session.requests = requests;
  await waitFor(async () => {
    try {
      return await session.evaluate('document.readyState === "complete"');
    } catch {
      return false;
    }
  }, 20000);
  return session;
}
