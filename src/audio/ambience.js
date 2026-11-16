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
    // outdoor ambience goes through a filter that muffles it when you're inside
    this.ambLP = ctx.createBiquadFilter();
    this.ambLP.type = 'lowpass';
    this.ambLP.frequency.value = 20000;
    this.amb = ctx.createGain();
    this.amb.connect(this.ambLP).connect(this.master);

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
    src(brown).connect(filter('lowpass', 380)).connect(this.cityG).connect(this.amb);
    // wind with a slow sweep
    this.windG = gain(0);
    const wf = filter('bandpass', 700, 0.6);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoG = gain(350);
    lfo.connect(lfoG).connect(wf.frequency);
    lfo.start();
    src(this.white).connect(wf).connect(this.windG).connect(this.amb);
    // crickets
    this.crickG = gain(0);
    src(crickets).connect(filter('highpass', 2500)).connect(this.crickG).connect(this.amb);

    // mystical pad (lydian chord) through a feedback delay
    this.padG = gain(0);
    const padF = filter('lowpass', 1400);
    const delay = ctx.createDelay(1.5);
    delay.delayTime.value = 0.42;
    const fb = gain(0.45);
    padF.connect(this.padG);
    this.padG.connect(this.amb);
    this.padG.connect(delay);
    delay.connect(fb).connect(delay);
    delay.connect(this.amb);
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
    // fluorescent hum + fridge drone inside the store
    this.humG = gain(0);
    const hum = ctx.createOscillator();
    hum.type = 'sawtooth';
    hum.frequency.value = 120;
    const humF = filter('lowpass', 420);
    hum.connect(humF).connect(this.humG).connect(this.master);
    hum.start();
    this.chimeBus = gain(1);
    this.chimeBus.connect(this.amb);
    this.chimeBus.connect(delay);
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.1);
  }

  /** s: { night, magic, green, time, indoor } */
  update(s) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const ind = s.indoor ?? 0;
    this.amb.gain.setTargetAtTime(1 - ind * 0.45, t, 0.3);
    this.ambLP.frequency.setTargetAtTime(20000 - ind * 19300, t, 0.3);
    if (this.music) this.scheduleMusic();
    this.humG.gain.setTargetAtTime((s.store ?? 0) * 0.012, t, 0.3);
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
      if (Math.random() < 0.6) this.horn(0.035, 600, this.amb);
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

  horn(vol = 0.12, cutoff = 2200, dest = this.amb) {
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
    f.connect(g).connect(dest);
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
    o.connect(f).connect(g).connect(this.amb);
    o.start(t);
    o.stop(t + 7.1);
  }

  // ---------------------------------------------------------------- music
  // A tiny generative player: Dm7 - G7 - Cmaj7 - Am7 with a different voice per
  // apartment (crackly AM radio, lo-fi records, a grand piano).
  startMusic(style) {
    const ctx = this.ctx;
    if (!ctx) return;
    this.stopMusic();
    const out = ctx.createGain();
    out.gain.value = 0.0001;
    out.gain.setTargetAtTime(style === 'piano' ? 0.16 : style === 'muzak' ? 0.07 : 0.12, ctx.currentTime, 0.4);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = style === 'radio' ? 2400 : style === 'records' ? 4200 : style === 'muzak' ? 1800 : 9000;
    out.connect(lp);
    let tail = lp;
    if (style === 'radio') {
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 350;
      lp.connect(hp);
      tail = hp;
    }
    tail.connect(this.master);
    const nodes = [];
    if (style !== 'piano' && style !== 'muzak') {
      const crackle = ctx.createBufferSource();
      crackle.buffer = this.white;
      crackle.loop = true;
      const cf = ctx.createBiquadFilter();
      cf.type = 'highpass';
      cf.frequency.value = 3500;
      const cg = ctx.createGain();
      cg.gain.value = style === 'radio' ? 0.05 : 0.025;
      crackle.connect(cf).connect(cg).connect(out);
      crackle.start();
      nodes.push(crackle);
    }
    this.music = { style, out, nodes, bar: 0, next: ctx.currentTime + 0.15, len: style === 'piano' ? 2.6 : style === 'muzak' ? 2.8 : 2.2 };
  }

  stopMusic() {
    const m = this.music;
    if (!m) return;
    this.music = null;
    m.out.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.25);
    setTimeout(() => {
      for (const n of m.nodes) {
        try {
          n.stop();
        } catch {
          /* already stopped */
        }
      }
      m.out.disconnect();
    }, 1500);
  }

  scheduleMusic() {
    const m = this.music;
    const ctx = this.ctx;
    while (m.next < ctx.currentTime + 0.6) {
      this.playBar(m, m.next);
      m.next += m.len;
      m.bar++;
    }
  }

  playBar(m, t) {
    const prog = [
      [62, 65, 69, 72],
      [55, 59, 62, 65],
      [60, 64, 67, 71],
      [57, 60, 64, 67],
    ];
    const chord = prog[m.bar % 4];
    const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);
    const L = m.len;
    const scale = [72, 74, 76, 79, 81, 84];
    if (m.style === 'muzak') {
      // ceiling-speaker store music: soft electric piano and bass, nothing to offend anyone
      chord.forEach((n, i) => this.voice(m.out, hz(n + 12), t + i * 0.05, L * 0.9, 'sine', 0.035, 0.04));
      this.voice(m.out, hz(chord[0] - 24), t, L * 0.5, 'triangle', 0.08, 0.02);
      this.voice(m.out, hz(chord[1] - 24), t + L / 2, L * 0.45, 'triangle', 0.07, 0.02);
      for (let k = 0; k < 4; k++) if (Math.random() < 0.55) this.voice(m.out, hz(scale[Math.floor(Math.random() * scale.length)]), t + (k * L) / 4, 0.6, 'sine', 0.04, 0.01);
      return;
    }
    if (m.style === 'piano') {
      chord.forEach((n, i) => this.voice(m.out, hz(n), t + i * 0.16, 2.2, 'triangle', 0.06, 0.004));
      this.voice(m.out, hz(chord[0] - 24), t, 2.4, 'sine', 0.1, 0.01);
      for (let k = 0; k < 3; k++) if (Math.random() < 0.75) this.voice(m.out, hz(scale[Math.floor(Math.random() * scale.length)]), t + 0.9 + k * 0.45, 1.2, 'triangle', 0.05, 0.004);
      return;
    }
    chord.forEach((n) => this.voice(m.out, hz(n), t, L * 0.95, m.style === 'radio' ? 'square' : 'triangle', m.style === 'radio' ? 0.012 : 0.03, 0.08));
    this.voice(m.out, hz(chord[0] - 24), t, L * 0.45, 'sine', 0.14, 0.01);
    this.voice(m.out, hz(chord[2] - 24), t + L / 2, L * 0.45, 'sine', 0.12, 0.01);
    // lazy boom-bap
    for (const b of [0, 0.5]) this.kick(m.out, t + b * L);
    for (const b of [0.25, 0.75]) this.snare(m.out, t + b * L);
    for (let k = 0; k < 8; k++) this.hat(m.out, t + (k * L) / 8 + (k % 2 ? 0.03 : 0));
    for (let k = 0; k < 4; k++) if (Math.random() < 0.6) this.voice(m.out, hz(scale[Math.floor(Math.random() * scale.length)]), t + (k * L) / 4 + 0.05, 0.5, 'sine', 0.05, 0.005);
  }

  voice(dest, freq, t, dur, type, vol, attack) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  kick(dest, t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + 0.3);
  }

  noiseAt(dest, t, freq, vol, dur, type = 'bandpass') {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.white;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random());
    s.stop(t + dur + 0.02);
  }

  snare(dest, t) {
    this.noiseAt(dest, t, 1800, 0.12, 0.16);
  }

  hat(dest, t) {
    this.noiseAt(dest, t, 8000, 0.025, 0.04, 'highpass');
  }

  // ---------------------------------------------------------------- store sounds
  chime() {
    // a generic two-tone shop door chime
    this.tone(1318.5, 'sine', 0.06, 0.9);
    setTimeout(() => this.tone(1046.5, 'sine', 0.06, 1.2), 280);
  }
  beep() {
    this.tone(2400, 'square', 0.025, 0.07);
  }
  drawer() {
    this.noiseHit(0.08, 2500, 0.08);
    setTimeout(() => this.tone(2800, 'triangle', 0.03, 0.4), 60);
  }
  punch() {
    this.noiseHit(0.12, 600, 0.06);
    setTimeout(() => this.noiseHit(0.08, 1800, 0.04), 90);
  }
  thud() {
    this.noiseHit(0.18, 220, 0.25);
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
