import { SPB, sectionAt, CHORDS, ROOTS, chordAt, hz as noteHz, theme } from './clubTrack.js';

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
    // a fast-food kitchen: fryer sizzle and extractor fans
    this.kitchenG = gain(0);
    const sizzle = filter('bandpass', 5200, 0.8);
    const crackle = ctx.createOscillator();
    crackle.frequency.value = 7.3;
    const crackleG = gain(900);
    crackle.connect(crackleG).connect(sizzle.frequency);
    crackle.start();
    src(this.white).connect(sizzle).connect(this.kitchenG).connect(this.master);
    const fan = filter('lowpass', 260);
    const fanG = gain(0.6);
    src(brown).connect(fan).connect(fanG).connect(this.kitchenG);
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
    this.kitchenG.gain.setTargetAtTime((s.kitchen ?? 0) * 0.02, t, 0.4);
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
  startMusic(style, opts = {}) {
    const ctx = this.ctx;
    if (!ctx) return;
    this.stopMusic();
    if (style === 'club') return this.startClub(opts.beat ?? 0);
    const out = ctx.createGain();
    out.gain.value = 0.0001;
    const GAIN = { piano: 0.16, muzak: 0.07, gullys: 0.075, under: 0.14, mall: 0.075, street: 0.09, lounge: 0.085, bossa: 0.09, jazz: 0.095 };
    out.gain.setTargetAtTime(GAIN[style] ?? 0.12, ctx.currentTime, 0.4);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    const CUT = { radio: 2400, records: 4200, muzak: 1800, gullys: 2800, under: 2200, mall: 3200, street: 3600, lounge: 2600, bossa: 3400, jazz: 3000 };
    lp.frequency.value = CUT[style] ?? 9000;
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
    let echo = null;
    if (style === 'under') {
      // everything down here comes back off the bricks
      echo = ctx.createDelay(2);
      echo.delayTime.value = 0.64;
      const fb = ctx.createGain();
      fb.gain.value = 0.55;
      const ef = ctx.createBiquadFilter();
      ef.type = 'lowpass';
      ef.frequency.value = 1800;
      echo.connect(ef).connect(fb).connect(echo);
      ef.connect(out);
    }
    if (style === 'radio' || style === 'records' || style === 'under') {
      const crackle = ctx.createBufferSource();
      crackle.buffer = this.white;
      crackle.loop = true;
      const cf = ctx.createBiquadFilter();
      cf.type = 'highpass';
      cf.frequency.value = 3500;
      const cg = ctx.createGain();
      cg.gain.value = style === 'radio' ? 0.05 : style === 'under' ? 0.03 : 0.025;
      crackle.connect(cf).connect(cg).connect(out);
      crackle.start();
      nodes.push(crackle);
    }
    const LEN = { piano: 2.6, muzak: 2.8, gullys: 2.0, under: (4 * 60) / 70, mall: (4 * 60) / 96, street: (4 * 60) / 88, lounge: (4 * 60) / 104, bossa: (4 * 60) / 128, jazz: (4 * 60) / 126 };
    this.music = { style, out, echo, nodes, bar: 0, next: ctx.currentTime + 0.15, len: LEN[style] ?? 2.2 };
  }

  // ---------------------------------------------------------------- club
  /** The club's sound system. beat: where the club's song is right now. */
  startClub(beat) {
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0.0001;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 300;
    out.connect(lp).connect(this.master);
    // everything melodic ducks under the kick (sidechain pump)
    const pump = ctx.createGain();
    pump.connect(out);
    const filt = (f, q = 0.8) => {
      const b = ctx.createBiquadFilter();
      b.type = 'lowpass';
      b.frequency.value = f;
      b.Q.value = q;
      b.connect(pump);
      return b;
    };
    const t0 = ctx.currentTime - beat * SPB;
    const bar = Math.ceil(beat / 4 + 0.02);
    this.music = {
      style: 'club',
      out,
      lp,
      pump,
      bassF: filt(420, 2),
      stabF: filt(1200, 5),
      padF: filt(1600),
      nodes: [],
      t0,
      bar,
      next: t0 + bar * 4 * SPB,
      len: 4 * SPB,
    };
  }

  /**
   * Where the club's song is, in beats (null when it isn't playing). This is the beat
   * you HEAR: the sound card's output delay is taken off, so the lights and the dance
   * game line up with the speakers, not with the scheduler.
   */
  musicBeat() {
    const m = this.music;
    if (m?.style !== 'club') return null;
    const ctx = this.ctx;
    const lag = ctx.outputLatency || ctx.baseLatency || 0;
    return (ctx.currentTime - lag - m.t0) / SPB;
  }

  /** Muffle the music by where you're standing: the street gets the thump only. */
  setMusicMix(cutoff, gain) {
    const m = this.music;
    if (!m?.lp) return;
    const t = this.ctx.currentTime;
    m.lp.frequency.setTargetAtTime(cutoff, t, 0.12);
    m.out.gain.setTargetAtTime(Math.max(0.0001, gain), t, 0.2);
  }

  playClubBar(m, t) {
    const S = sectionAt(m.bar);
    const th = theme().id;
    const sb = SPB;
    const ci = chordAt(m.bar);
    const chord = CHORDS[ci];
    const root = ROOTS[ci];
    const D = m.out;
    const P = m.pump.gain;
    const kickVol = th === 'low' ? 0.36 : th === 'overload' ? 0.66 : 0.55;
    // the stab filter opens through the build
    const open = S.name === 'build' ? 900 + (S.bar / S.len) * 3600 : S.name === 'breakdown' ? 800 : th === 'low' ? 1400 : 2600;
    m.stabF.frequency.setValueAtTime(open, t);
    for (let k = 0; k < 4; k++) {
      const tb = t + k * sb;
      if (S.kick) {
        this.clubKick(D, tb, kickVol);
        P.setValueAtTime(th === 'low' ? 0.55 : 0.3, tb);
        P.linearRampToValueAtTime(1, tb + sb * 0.6);
      }
      if (S.clap && (k === 1 || k === 3)) {
        if (th === 'low') this.noiseAt(D, tb, 3400, 0.05, 0.03); // a rimshot, not a clap
        else this.clap(D, tb);
      }
      if (S.hats) {
        this.noiseAt(D, tb + sb / 2, 9000, th === 'low' ? 0.03 : 0.05, 0.04, 'highpass');
        const sixteenths = S.name === 'drop' || S.name === 'build' || th === 'static' || th === 'overload';
        if (sixteenths)
          for (const q of [0.25, 0.75]) if (th !== 'static' || Math.random() < 0.8) this.noiseAt(D, tb + sb * q, 10000, 0.018, 0.025, 'highpass');
      }
      if (S.open || (th === 'overload' && S.name === 'groove')) this.noiseAt(D, tb + sb / 2, 7000, 0.035, 0.22, 'highpass');
      if (S.bass && th !== 'overload') {
        const wave = th === 'static' ? 'square' : 'sawtooth';
        this.voice(m.bassF, noteHz(root - 12), tb + sb / 2, sb * (th === 'static' ? 0.22 : 0.42), wave, th === 'low' ? 0.12 : 0.16, 0.005);
        this.voice(m.bassF, noteHz(root - 24), tb + sb / 2, sb * 0.42, 'sine', 0.14, 0.005);
        if (th === 'low') this.voice(m.bassF, noteHz(root - 24), tb, sb * 0.3, 'sine', 0.08, 0.01);
      }
    }
    // OVERLOAD's acid line: sixteen squelchy notes a bar through a resonant filter
    if (S.bass && th === 'overload') {
      const seq = [0, 0, 12, 0, 3, 0, 7, 12, 0, 10, 0, 12, 3, 0, 15, 7];
      const f = m.bassF.frequency;
      for (let k = 0; k < 16; k++) {
        const tn = t + (k * sb) / 4;
        if (k % 4 === 3 && m.bar % 2) continue;
        this.voice(m.bassF, noteHz(root - 12 + seq[k]), tn, sb * 0.22, 'sawtooth', 0.12, 0.003);
        f.setValueAtTime(seq[k] > 6 ? 2400 : 1300, tn);
        f.exponentialRampToValueAtTime(260, tn + sb * 0.22);
      }
      this.voice(m.bassF, noteHz(root - 24), t, 4 * sb * 0.95, 'sine', 0.1, 0.01);
    } else m.bassF.frequency.setValueAtTime(420, t);
    if (S.stabs) {
      if (th === 'low') {
        // soft chords on the one and the three, with a long tail
        for (const q of [0, 2]) for (const n of chord) this.voice(m.stabF, noteHz(n), t + q * sb, 1.6 * sb, 'triangle', 0.03, 0.02);
      } else if (th === 'current') {
        // piano-ish stabs: a bright attack and a ringing decay
        for (const q of [0.75, 1.5, 2.75, 3.5])
          for (const n of chord) {
            this.voice(m.stabF, noteHz(n + 12), t + q * sb, 0.42, 'triangle', 0.034, 0.002);
            this.voice(m.stabF, noteHz(n), t + q * sb, 0.3, 'sine', 0.02, 0.002);
          }
      } else {
        const wave = th === 'static' ? 'square' : 'sawtooth';
        for (const q of [0.75, 1.5, 2.75, 3.5]) for (const n of chord) this.voice(m.stabF, noteHz(n), t + q * sb, th === 'static' ? 0.08 : 0.2, wave, 0.028, 0.004);
        // STATIC stutters: the last stab of every other bar repeats on sixteenths
        if (th === 'static' && m.bar % 2) for (let r = 1; r < 4; r++) for (const n of chord) this.voice(m.stabF, noteHz(n), t + (3.5 + r * 0.125) * sb, 0.05, 'square', 0.02, 0.002);
      }
    }
    // STATIC: a random burst of digital noise somewhere in the bar
    if (th === 'static' && S.name !== 'breakdown' && Math.random() < 0.6) {
      const tg = t + Math.floor(Math.random() * 16) * (sb / 4);
      this.glitch(D, tg, 0.04);
    }
    if (S.pad || (th === 'low' && S.name !== 'intro')) for (const n of chord) this.voice(m.padF, noteHz(n - 12), t, 4 * sb * 1.05, 'triangle', th === 'low' && !S.pad ? 0.025 : 0.045, 0.6);
    if (S.lead || (th === 'current' && S.name === 'groove' && m.bar % 4 >= 2)) {
      const arp = [chord[0] + 12, chord[2] + 12, chord[3] + 12, chord[1] + 24];
      const wave = th === 'low' ? 'sine' : 'square';
      const vol = th === 'current' && S.name === 'groove' ? 0.01 : 0.016;
      for (let k = 0; k < 16; k++)
        if (k % 4 !== 3) {
          this.voice(m.pump, noteHz(arp[k % 4]), t + (k * sb) / 4, sb * 0.2, wave, vol, 0.004);
          // LOW VOLTAGE's lead has an echo
          if (th === 'low') this.voice(m.pump, noteHz(arp[k % 4]), t + (k * sb) / 4 + sb * 0.75, sb * 0.2, wave, vol * 0.4, 0.004);
        }
    }
    if (S.riser && S.bar === 0) {
      // noise riser over the whole build, snare roll over its last two bars
      const len = S.len * 4 * sb;
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.white;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 2;
      f.frequency.setValueAtTime(300, t);
      f.frequency.exponentialRampToValueAtTime(6000, t + len);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(th === 'low' ? 0.05 : 0.09, t + len);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.1);
      src.connect(f).connect(g).connect(D);
      src.start(t);
      src.stop(t + len + 0.2);
    }
    if (S.riser && S.bar >= S.len - 2 && th !== 'low') {
      const n = S.bar === S.len - 1 ? 16 : 8;
      for (let k = 0; k < n; k++) this.noiseAt(D, t + (k * 4 * sb) / n, 1800, 0.05 + (k / n) * 0.05, 0.08);
    }
    if (S.name === 'drop' && S.bar === 0) {
      this.cheer(D, t);
      if (th === 'overload') this.airHorn(D, t);
    }
    m.onBar?.(m.bar, t, S);
  }

  /** A burst of bit-crushed-sounding noise (STATIC's glitches, a DJ's trainwreck). */
  glitch(dest, t, vol = 0.05) {
    for (let k = 0; k < 6; k++) this.noiseAt(dest, t + k * 0.018, 600 + Math.random() * 6000, vol, 0.015);
    this.voice(dest, 80 + Math.random() * 400, t, 0.08, 'square', vol * 0.5, 0.001);
  }

  /** OVERLOAD's air horn on the drop. */
  airHorn(dest, t) {
    for (const [f, d] of [
      [466, 0],
      [466, 0.18],
      [466, 0.36],
    ])
      for (const det of [1, 1.006, 1.5])
        this.voice(dest, f * det, t + d, 0.16, 'sawtooth', 0.022, 0.005);
    this.voice(dest, 466, t + 0.56, 0.7, 'sawtooth', 0.025, 0.005);
  }

  /** The DJ game's mix sounds: a filter sweep for a clean cue, a scratch for a trainwreck. */
  djCue(clean) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (clean) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.white;
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 3;
      f.frequency.setValueAtTime(5000, t);
      f.frequency.exponentialRampToValueAtTime(400, t + 0.5);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.05, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      src.connect(f).connect(g).connect(this.master);
      src.start(t, Math.random());
      src.stop(t + 0.6);
    } else {
      this.glitch(this.master, t, 0.09);
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(300, t);
      o.frequency.exponentialRampToValueAtTime(60, t + 0.35);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.06, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + 0.45);
    }
  }

  /** The coil at 3:33: a deep hum that swells and shimmers. */
  coilHum() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const [f, v] of [
      [55, 0.09],
      [110.4, 0.04],
      [330.8, 0.015],
    ]) {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(f, t);
      o.frequency.linearRampToValueAtTime(f * 1.012, t + 6);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + 2.5);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 7);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + 7.1);
    }
    for (let k = 0; k < 5; k++) this.voice(this.chimeBus ?? this.master, [987.8, 1174.7, 1318.5, 1567.98, 1760][k], t + 1.5 + k * 0.6, 2.5, 'sine', 0.025, 0.2);
  }

  clubKick(dest, t, vol = 0.55) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(46, t + 0.09);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + 0.4);
    this.noiseAt(dest, t, 3500, 0.04, 0.012, 'highpass');
  }

  clap(dest, t) {
    for (let k = 0; k < 3; k++) this.noiseAt(dest, t + k * 0.011, 1400, 0.07, k === 2 ? 0.16 : 0.03);
  }

  /** a crowd "woo" when the drop lands */
  cheer(dest, t) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.white;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(900, t);
    f.frequency.linearRampToValueAtTime(1600, t + 0.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    src.connect(f).connect(g).connect(dest);
    src.start(t);
    src.stop(t + 2.3);
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
    // after a stall (background tab) skip the missed bars instead of playing them all at once
    if (m.next < ctx.currentTime - 0.1) {
      const skip = Math.ceil((ctx.currentTime - m.next) / m.len);
      m.next += skip * m.len;
      m.bar += skip;
    }
    while (m.next < ctx.currentTime + 0.6) {
      this.playBar(m, m.next);
      m.next += m.len;
      m.bar++;
    }
  }

  playBar(m, t) {
    if (m.style === 'club') return this.playClubBar(m, t);
    if (m.style === 'gullys') return this.playGullysBar(m, t);
    if (m.style === 'under') return this.playUnderBar(m, t);
    if (m.style === 'mall') return this.playMallBar(m, t);
    if (m.style === 'street') return this.playStreetBar(m, t);
    if (m.style === 'lounge') return this.playLoungeBar(m, t);
    if (m.style === 'bossa') return this.playBossaBar(m, t);
    if (m.style === 'jazz') return this.playJazzBar(m, t);
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

  // GULLY'S in-store radio: bright, bouncy, a bit cheesy. C - G - Am - F, a
  // walking bass, electric piano on the offbeats, and the jingle every 8 bars.
  playGullysBar(m, t) {
    const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);
    const prog = [
      [60, 64, 67],
      [59, 62, 67],
      [57, 60, 64],
      [57, 60, 65],
    ];
    const roots = [48, 43, 45, 41];
    const L = m.len;
    const k = m.bar % 4;
    const chord = prog[k];
    const r = roots[k];
    [r, r + 12, r + 7, r + 12].forEach((n, i) => this.voice(m.out, hz(n - 12), t + (i * L) / 4, L * 0.2, 'triangle', 0.11, 0.01));
    for (const b of [0.125, 0.375, 0.625, 0.875]) chord.forEach((n) => this.voice(m.out, hz(n + 12), t + b * L, L * 0.09, 'square', 0.008, 0.005));
    for (const b of [0, 0.5]) this.kick(m.out, t + b * L);
    for (const b of [0.25, 0.75]) this.noiseAt(m.out, t + b * L, 2400, 0.05, 0.08);
    for (let i = 0; i < 8; i++) this.hat(m.out, t + (i * L) / 8);
    if (m.bar % 8 === 7) this.jingle(m.out, t, 0.05);
    else {
      const scale = [72, 74, 76, 79, 81, 84];
      for (let i = 0; i < 4; i++) if (Math.random() < 0.45) this.voice(m.out, hz(scale[Math.floor(Math.random() * scale.length)]), t + (i * L) / 4 + 0.02, 0.35, 'sine', 0.035, 0.01);
    }
  }

  // The Galleria's ceiling speakers: shiny 2003 mall pop. Major sevenths on an
  // electric piano, a round bass, a shaker, a little bell melody that never resolves.
  playMallBar(m, t) {
    const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);
    const prog = [
      [60, 64, 67, 71],
      [57, 60, 64, 67],
      [62, 65, 69, 72],
      [55, 59, 62, 65],
    ];
    const L = m.len;
    const chord = prog[m.bar % 4];
    chord.forEach((n, i) => {
      this.voice(m.out, hz(n + 12), t + i * 0.012, L * 0.45, 'sine', 0.03, 0.01);
      this.voice(m.out, hz(n + 12) * 1.004, t + L * 0.5 + 0.03, L * 0.4, 'sine', 0.022, 0.01);
    });
    [0, 0.375, 0.5, 0.875].forEach((b, i) => this.voice(m.out, hz(chord[i === 1 ? 2 : 0] - 24), t + b * L, L * 0.18, 'triangle', 0.09, 0.008));
    for (let i = 0; i < 8; i++) this.noiseAt(m.out, t + (i * L) / 8, 6500, i % 2 ? 0.012 : 0.02, 0.05, 'highpass');
    this.kick(m.out, t);
    this.noiseAt(m.out, t + L / 2, 2000, 0.05, 0.1);
    const bells = [79, 83, 84, 86, 88, 91];
    for (let i = 0; i < 4; i++) if (Math.random() < 0.5) this.voice(m.out, hz(bells[Math.floor(Math.random() * bells.length)]), t + (i * L) / 4 + 0.03, 0.5, 'sine', 0.03, 0.004);
  }

  // SPLITGRAIN: a slow, heavy beat. Kick, a cracking snare, swung hats, a dark bass and a stab.
  playStreetBar(m, t) {
    const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);
    const L = m.len;
    const roots = [45, 45, 41, 43];
    const r = roots[m.bar % 4];
    for (const b of [0, 0.375, 0.625]) this.kick(m.out, t + b * L);
    for (const b of [0.25, 0.75]) this.noiseAt(m.out, t + b * L, 1500, 0.14, 0.14);
    for (let i = 0; i < 8; i++) this.hat(m.out, t + ((i + (i % 2 ? 0.16 : 0)) * L) / 8);
    this.voice(m.out, hz(r - 12), t, L * 0.3, 'sawtooth', 0.05, 0.01);
    this.voice(m.out, hz(r - 12), t + L * 0.5, L * 0.25, 'sawtooth', 0.045, 0.01);
    if (m.bar % 2 === 0) [r + 24, r + 27, r + 31].forEach((n) => this.voice(m.out, hz(n), t + L * 0.125, 0.18, 'square', 0.012, 0.004));
  }

  // MAISON VELLARD: lounge. Soft four-on-the-floor, brushed hats, rhodes ninths, a walking bass.
  playLoungeBar(m, t) {
    const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);
    const L = m.len;
    const prog = [
      [62, 65, 69, 72, 76],
      [55, 59, 62, 65, 69],
      [60, 64, 67, 71, 74],
      [57, 60, 64, 67, 71],
    ];
    const chord = prog[m.bar % 4];
    chord.forEach((n, i) => this.voice(m.out, hz(n), t + 0.02 + i * 0.02, L * 0.7, 'triangle', 0.018, 0.06));
    [0, 0.25, 0.5, 0.75].forEach((b, i) => this.voice(m.out, hz(chord[[0, 2, 1, 3][i]] - 24), t + b * L, L * 0.22, 'sine', 0.1, 0.01));
    for (let i = 0; i < 4; i++) this.noiseAt(m.out, t + (i * L) / 4, 140, 0.05, 0.12, 'lowpass');
    for (let i = 0; i < 8; i++) this.noiseAt(m.out, t + (i * L) / 8 + 0.01, 9000, 0.008, 0.09, 'highpass');
  }

  // ROOMSET (and the jukebox's B-side): bossa nova. Nylon-string comping on the
  // syncopated pattern, a bass on the root and fifth, rim clicks, a shaker, a breathy flute.
  playBossaBar(m, t) {
    const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);
    const L = m.len;
    const prog = [
      [57, 60, 64, 67, 71],
      [62, 66, 69, 72, 76],
      [55, 59, 62, 66, 69],
      [60, 64, 67, 71, 74],
    ];
    const roots = [45, 50, 43, 48];
    const k = m.bar % 4;
    const chord = prog[k];
    const r = roots[k];
    for (const s of [0, 3, 6, 10, 13]) chord.slice(1).forEach((n, i) => this.voice(m.out, hz(n), t + (s * L) / 16 + i * 0.009, L * 0.16, 'triangle', 0.013, 0.003));
    [
      [0, 0],
      [0.375, 7],
      [0.5, 0],
      [0.875, 7],
    ].forEach(([b, iv]) => this.voice(m.out, hz(r - 12 + iv), t + b * L, L * 0.32, 'sine', 0.11, 0.012));
    for (const s of m.bar % 2 ? [2, 6, 10, 13] : [0, 3, 6, 10, 12]) this.noiseAt(m.out, t + (s * L) / 16, 2600, 0.03, 0.025);
    for (let i = 0; i < 16; i++) this.noiseAt(m.out, t + (i * L) / 16, 7500, i % 2 ? 0.007 : 0.012, 0.04, 'highpass');
    const flute = [76, 79, 81, 83, 86, 88];
    if (m.bar % 8 > 3) for (let i = 0; i < 3; i++) if (Math.random() < 0.55) this.voice(m.out, hz(flute[Math.floor(Math.random() * flute.length)]), t + ((i * 5 + 2) * L) / 16, L * 0.28, 'sine', 0.022, 0.06);
  }

  // HALCYON EXCHANGE: a cool jazz trio in the corner. ii-V-I-VI in F: a walking bass,
  // brushes on a ride with the swing, vibraphone chords on the off-beats, a lick now and then.
  playJazzBar(m, t) {
    const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);
    const L = m.len;
    const prog = [
      [55, 58, 62, 65],
      [60, 64, 67, 70],
      [57, 60, 64, 65],
      [62, 65, 69, 72],
    ];
    const roots = [43, 48, 41, 50];
    const k = m.bar % 4;
    const r = roots[k];
    const next = roots[(k + 1) % 4];
    // walking bass: root, third, fifth, a chromatic step into the next chord
    [r, r + (k === 1 ? 4 : 3), r + 7, next + (next > r ? -1 : 1)].forEach((n, i) => this.voice(m.out, hz(n - 12), t + (i * L) / 4, L * 0.22, 'triangle', 0.13, 0.008));
    // the ride: ding, ding-a, ding, ding-a (swung)
    const sw = L / 4;
    for (const b of [0, 1, 1 + 2 / 3, 2, 3, 3 + 2 / 3]) this.noiseAt(m.out, t + b * sw, 8200, b % 1 ? 0.01 : 0.016, 0.12, 'highpass');
    for (const b of [1, 3]) this.noiseAt(m.out, t + b * sw, 1800, 0.035, 0.09);
    // vibes: chord stabs on the and-of-two and the and-of-four, with a slow shimmer
    for (const b of [1 + 2 / 3, 3 + 2 / 3])
      prog[k].forEach((n) => {
        this.voice(m.out, hz(n + 12), t + b * sw, L * 0.3, 'sine', 0.022, 0.004);
        this.voice(m.out, hz(n + 12) * 1.006, t + b * sw, L * 0.28, 'sine', 0.012, 0.004);
      });
    const lick = [65, 67, 69, 72, 74, 77];
    if (m.bar % 4 === 2) for (let i = 0; i < 4; i++) if (Math.random() < 0.6) this.voice(m.out, hz(lick[Math.floor(Math.random() * lick.length)] + 12), t + (i + 0.5) * sw, sw * 0.8, 'sine', 0.028, 0.005);
  }

  // The Undercurrent: SUBSTATION's chords, slowed to 70 BPM and pitched down, detuned
  // pads, a heartbeat for a kick, bells in the echo and swells that play backwards.
  playUnderBar(m, t) {
    const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);
    const sb = 60 / 70;
    const ci = Math.floor((m.bar % 8) / 2);
    const chord = CHORDS[ci].map((n) => n - 5);
    const root = ROOTS[ci] - 5;
    for (const n of chord)
      for (const det of [0.996, 1.004]) {
        const o = this.ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = hz(n) * det;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.022, t + 1.4);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 4 * sb * 1.08);
        o.connect(g).connect(m.out);
        o.start(t);
        o.stop(t + 4 * sb * 1.1);
      }
    this.voice(m.out, hz(root - 24), t, 4 * sb, 'sine', 0.09, 0.4);
    // lub-dub
    for (const q of [0, 0.32]) {
      const o = this.ctx.createOscillator();
      o.frequency.setValueAtTime(70, t + q);
      o.frequency.exponentialRampToValueAtTime(38, t + q + 0.12);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(q ? 0.12 : 0.18, t + q);
      g.gain.exponentialRampToValueAtTime(0.0001, t + q + 0.3);
      o.connect(g).connect(m.out);
      o.start(t + q);
      o.stop(t + q + 0.35);
    }
    // bells into the echo
    const bells = [72, 74, 76, 79, 81, 84].map((n) => n - 5);
    for (let k = 0; k < 4; k++)
      if (Math.random() < 0.4) {
        const f = hz(bells[Math.floor(Math.random() * bells.length)]);
        this.voice(m.echo ?? m.out, f, t + k * sb + 0.05, 1.8, 'sine', 0.03, 0.005);
        this.voice(m.out, f, t + k * sb + 0.05, 1.8, 'sine', 0.025, 0.005);
      }
    // a reversed swell every fourth bar
    if (m.bar % 4 === 3) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = hz(chord[2] + 12);
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(300, t + 2 * sb);
      f.frequency.exponentialRampToValueAtTime(2400, t + 4 * sb);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + 2 * sb);
      g.gain.exponentialRampToValueAtTime(0.03, t + 4 * sb - 0.02);
      g.gain.linearRampToValueAtTime(0.0001, t + 4 * sb);
      o.connect(f).connect(g).connect(m.out);
      o.start(t + 2 * sb);
      o.stop(t + 4 * sb + 0.05);
    }
  }

  /** The GULLY'S jingle: "Snatch-a-bite!" on a little bell. */
  jingle(dest = this.master, t = this.ctx?.currentTime, vol = 0.06) {
    if (!this.ctx) return;
    const notes = [
      [79, 0, 0.18],
      [76, 0.18, 0.18],
      [79, 0.36, 0.18],
      [84, 0.6, 0.5],
      [81, 1.2, 0.2],
      [84, 1.4, 0.7],
    ];
    const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);
    for (const [n, at, d] of notes) {
      this.voice(dest, hz(n), t + at, d + 0.3, 'triangle', vol, 0.005);
      this.voice(dest, hz(n + 12), t + at, d * 0.6, 'sine', vol * 0.4, 0.005);
    }
  }

  /** The order-up bell (a counter bell plus the screen's two-tone). */
  ding(vol = 0.08) {
    if (!this.ctx) return;
    this.tone(1568, 'sine', vol, 1.0);
    this.tone(3136, 'sine', vol * 0.3, 0.6);
    setTimeout(() => this.tone(2093, 'sine', vol * 0.8, 1.1), 140);
  }

  /** The fryer timer going off. */
  fryer() {
    if (!this.ctx) return;
    for (let i = 0; i < 3; i++) setTimeout(() => this.tone(1850, 'square', 0.012, 0.12), i * 180);
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
