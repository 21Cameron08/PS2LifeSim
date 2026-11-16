// All sound is synthesised at runtime with WebAudio: no audio files needed yet.
// Layers: city rumble, wind, night crickets, a mystical pad near the Lantern
// Quarter, plus one-shots (footsteps, car horns, UI blips, text ticks).

function loopBuffer(ctx, seconds, fn) {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  fn(d, sr, len);
  return buf;
}

export class Ambience {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.nextChime = 0;
    this.nextDistant = 10;
  }

  start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(ctx.destination);

    this.white = loopBuffer(ctx, 2, (d) => {
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    });
    const brown = loopBuffer(ctx, 4, (d) => {
      let last = 0;
      for (let i = 0; i < d.length; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        d[i] = last * 3.2;
      }
    });
    const crickets = loopBuffer(ctx, 3, (d, sr) => {
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        const burst = (t % 0.75) < 0.16 && (t % 1.5) < 1.2 ? 1 : 0;
        const pulse = Math.sin(2 * Math.PI * 32 * t) > 0 ? 1 : 0.15;
        d[i] = burst * pulse * Math.sin(2 * Math.PI * 4300 * t) * 0.5 + (((t + 0.37) % 0.9) < 0.1 ? 1 : 0) * Math.sin(2 * Math.PI * 3900 * t) * 0.25;
      }
    });

    const src = (buf) => {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.start();
      return s;
    };
    const gain = (v) => {
      const g = ctx.createGain();
      g.gain.value = v;
      return g;
    };
    const filter = (type, f, q = 0.7) => {
      const b = ctx.createBiquadFilter();
      b.type = type;
      b.frequency.value = f;
      b.Q.value = q;
      return b;
    };

    // city rumble
    this.cityG = gain(0);
    src(brown).connect(filter('lowpass', 380)).connect(this.cityG).connect(this.master);
    // wind with a slow sweep
    this.windG = gain(0);
    const wf = filter('bandpass', 700, 0.6);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoG = gain(350);
    lfo.connect(lfoG).connect(wf.frequency);
    lfo.start();
    src(this.white).connect(wf).connect(this.windG).connect(this.master);
    // crickets
    this.crickG = gain(0);
    src(crickets).connect(filter('highpass', 2500)).connect(this.crickG).connect(this.master);

    // mystical pad (lydian chord) through a feedback delay
    this.padG = gain(0);
    const padF = filter('lowpass', 1400);
    const delay = ctx.createDelay(1.5);
    delay.delayTime.value = 0.42;
    const fb = gain(0.45);
    padF.connect(this.padG);
    this.padG.connect(this.master);
    this.padG.connect(delay);
    delay.connect(fb).connect(delay);
    delay.connect(this.master);
    for (const [f, type] of [
      [146.8, 'triangle'],
      [220.0, 'sine'],
      [329.6, 'triangle'],
      [415.3, 'sine'],
      [554.4, 'sine'],
    ]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const det = ctx.createOscillator();
      det.frequency.value = 0.1 + Math.random() * 0.15;
      const detG = gain(4);
      det.connect(detG).connect(o.detune);
      det.start();
      const og = gain(0.16);
      o.connect(og).connect(padF);
      o.start();
    }
    this.chimeBus = gain(1);
    this.chimeBus.connect(this.master);
    this.chimeBus.connect(delay);
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.1);
  }

  /** s: { night, magic, green, time } */
  update(s) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.cityG.gain.setTargetAtTime((0.34 - s.night * 0.16) * (1 - s.magic * 0.6), t, 0.5);
    this.windG.gain.setTargetAtTime(0.035 + s.night * 0.03 + s.magic * 0.03, t, 0.5);
    this.crickG.gain.setTargetAtTime(s.night * (0.012 + s.green * 0.05) * (1 - s.magic * 0.5), t, 0.8);
    this.padG.gain.setTargetAtTime(s.magic * (0.05 + s.night * 0.06), t, 0.8);

    if (s.magic > 0.15 && t > this.nextChime) {
      this.nextChime = t + 0.8 + Math.random() * 2.4;
      const notes = [587.3, 659.3, 880, 987.8, 1174.7, 1318.5];
      this.tone(notes[Math.floor(Math.random() * notes.length)], 'sine', 0.05 * s.magic, 2.2, this.chimeBus);
    }
    if (t > this.nextDistant) {
      this.nextDistant = t + 20 + Math.random() * 40;
      if (Math.random() < 0.6) this.horn(0.035, 600);
      else this.siren();
    }
  }

  tone(freq, type, vol, dur, dest = this.master, glideTo = null) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur * 0.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noiseHit(vol, freq, dur) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = this.white;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.02);
  }

  step(run) {
    this.noiseHit(run ? 0.09 : 0.055, 900 + Math.random() * 500, run ? 0.09 : 0.07);
  }

  horn(vol = 0.12, cutoff = 2200) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.setValueAtTime(vol, t + 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    f.connect(g).connect(this.master);
    for (const fr of [392, 494]) {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = fr;
      o.connect(f);
      o.start(t);
      o.stop(t + 0.5);
    }
  }

  siren() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.02, t + 1.5);
    g.gain.setValueAtTime(0.02, t + 4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 7);
    for (let k = 0; k < 7; k++) {
      o.frequency.setValueAtTime(700, t + k);
      o.frequency.linearRampToValueAtTime(1000, t + k + 0.5);
      o.frequency.linearRampToValueAtTime(700, t + k + 1);
    }
    o.connect(f).connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 7.1);
  }

  blip(up = true) {
    this.tone(up ? 880 : 660, 'square', 0.03, 0.08, this.master, up ? 1320 : 440);
  }

  tick() {
    this.tone(1200 + Math.random() * 200, 'square', 0.012, 0.03);
  }

  coin() {
    this.tone(988, 'square', 0.04, 0.09);
    setTimeout(() => this.tone(1319, 'square', 0.04, 0.25), 80);
  }
}
