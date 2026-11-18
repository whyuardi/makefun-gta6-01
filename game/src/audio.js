// Sound, all synthesized with WebAudio — no audio files. Engine hum, police
// sirens, gunshots, pickup blips and a slow ambient pad. Everything starts on
// the first user gesture; M mutes.

export function createAudio() {
  let ctx = null;
  let muted = false;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let padNodes = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    return ctx;
  }

  function noiseBuffer(duration) {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function startPad() {
    if (padNodes || !ctx) return;
    // A slow major pad: two detuned triangles a fifth apart, breathing via LFO.
    const gain = ctx.createGain();
    gain.gain.value = 0.05;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.025;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    const freqs = [130.81, 196.0, 261.63];
    const oscs = freqs.map((f) => {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      o.connect(gain);
      o.start();
      return o;
    });
    gain.connect(ctx.destination);
    lfo.start();
    padNodes = { gain, oscs, lfo };
  }

  return {
    get muted() {
      return muted;
    },
    /** Call on the first gesture so the context is allowed to start. */
    unlock() {
      if (!ensure()) return;
      startPad();
    },
    toggleMute() {
      muted = !muted;
      if (padNodes) padNodes.gain.gain.value = muted ? 0 : 0.05;
      if (engineGain) engineGain.gain.value = muted ? 0 : 0.06;
      if (sirenGain) sirenGain.gain.value = muted ? 0 : 0.045;
      return muted;
    },
    engineStart() {
      if (!ensure() || engineOsc) return;
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 320;
      engineGain = ctx.createGain();
      engineGain.gain.value = muted ? 0 : 0.06;
      engineOsc.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(ctx.destination);
      engineOsc.start();
    },
    /** Engine pitch follows speed: 0..1 of top speed. */
    engineUpdate(ratio) {
      if (!engineOsc || !ctx) return;
      engineOsc.frequency.setTargetAtTime(55 + ratio * 130, ctx.currentTime, 0.08);
    },
    engineStop() {
      if (!engineOsc) return;
      try {
        engineOsc.stop();
      } catch {
        // Already stopped.
      }
      engineOsc = null;
      engineGain = null;
    },
    siren(on) {
      if (!ensure()) return;
      if (on && !sirenOsc) {
        sirenOsc = ctx.createOscillator();
        sirenOsc.type = 'sine';
        sirenOsc.frequency.value = 750;
        const lfo = ctx.createOscillator();
        lfo.type = 'square';
        lfo.frequency.value = 0.55;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 220;
        lfo.connect(lfoGain);
        lfoGain.connect(sirenOsc.frequency);
        sirenGain = ctx.createGain();
        sirenGain.gain.value = muted ? 0 : 0.045;
        sirenOsc.connect(sirenGain);
        sirenGain.connect(ctx.destination);
        sirenOsc.start();
        lfo.start();
        sirenOsc._lfo = lfo;
      } else if (!on && sirenOsc) {
        try {
          sirenOsc.stop();
          sirenOsc._lfo.stop();
        } catch {
          // Already stopped.
        }
        sirenOsc = null;
        sirenGain = null;
      }
    },
    gunshot() {
      if (!ensure() || muted) return;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(0.16);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.5, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      src.start();
    },
    blip() {
      if (!ensure() || muted) return;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(660, ctx.currentTime);
      o.frequency.setValueAtTime(990, ctx.currentTime + 0.08);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
      o.connect(gain);
      gain.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.24);
    },
    thud() {
      if (!ensure() || muted) return;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(140, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.12);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);
      o.connect(gain);
      gain.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.16);
    },
  };
}
