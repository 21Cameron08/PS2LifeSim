import { SECTION_DEFS, setArrangement, SPB } from '../audio/clubTrack.js';

// Your DJ set at SUBSTATION. The track plays in 8-bar phrases; you choose what comes
// next (GROOVE, BREAKDOWN, BUILD, DROP) and hit CUE on the "one" when it changes. The
// music and the lights really follow your choices: the arrangement is handed to the
// sound system and the lighting rig (clubTrack.setArrangement).
//
// The crowd's energy is the score: builds before drops, a breather after a drop,
// clean mixes on the beat. Drop too early, keep them waiting after a build, or
// trainwreck a mix and they let you know.

export const PHRASE = 8; // bars
export const CHOICES = ['groove', 'breakdown', 'build', 'drop'];

export class DjSet {
  constructor({ ui, audio, getBeat, onEnd, onCheer }) {
    Object.assign(this, { ui, audio, getBeat, onEnd, onCheer });
    this.active = false;
  }

  /** phrases: how long the set is; slot: 'warmup' | 'prime' */
  start({ phrases = 8, slot = 'warmup' }) {
    const beat = this.getBeat();
    const bar = Math.floor(beat / 4);
    // the set starts on the next phrase boundary at least two bars away
    let s0 = Math.ceil((bar + 2) / PHRASE) * PHRASE;
    if (s0 * 4 - beat < 8) s0 += PHRASE;
    Object.assign(this, {
      active: true,
      slot,
      start0: s0,
      total: phrases,
      plan: [{ name: 'intro' }],
      next: 'groove',
      energy: 45,
      sum: 0,
      n: 0,
      judged: new Set([0]),
      pending: new Map(), // phrase -> { delta, text }
      text: 'Get ready: your set starts on the next phrase.',
      textT: 3,
      cleans: 0,
      wrecks: 0,
      drops: 0,
    });
    setArrangement((b) => this.sectionFor(b));
  }

  sectionFor(bar) {
    if (!this.active || bar < this.start0) return null;
    const k = Math.floor((bar - this.start0) / PHRASE);
    const ph = this.plan[Math.min(k, this.plan.length - 1)];
    const from = this.start0 + k * PHRASE;
    return { ...SECTION_DEFS[ph.name], from, len: PHRASE, bar: bar - from };
  }

  /** Where we are: phrase index and beats into it (from what you hear). */
  where() {
    const beat = this.getBeat();
    const into = beat - this.start0 * 4;
    return { beat, k: Math.floor(into / (PHRASE * 4)), at: into - Math.floor(into / (PHRASE * 4)) * PHRASE * 4 };
  }

  choose(name) {
    if (!this.active || !CHOICES.includes(name)) return;
    this.next = name;
    this.audio.blip(false);
  }

  /** CUE: judged against the nearest phrase change. */
  cue() {
    if (!this.active) return;
    const { beat } = this.where();
    const bnd = Math.round((beat - this.start0 * 4) / (PHRASE * 4));
    if (bnd < 1 || this.judged.has(bnd)) return;
    const err = Math.abs(beat - (this.start0 + bnd * PHRASE) * 4) * SPB;
    if (err > 0.6) return; // nowhere near a change
    this.judged.add(bnd);
    if (err <= 0.09) this.mix(bnd, 6, 'CLEAN MIX', true);
    else if (err <= 0.2) this.mix(bnd, 2, 'NICE MIX', true);
    else this.mix(bnd, -6, 'TRAINWRECK', false);
  }

  mix(bnd, delta, text, clean) {
    this.energy = Math.max(0, Math.min(100, this.energy + delta));
    this.say(text);
    if (clean) this.cleans++;
    else this.wrecks++;
    this.audio.djCue(clean);
  }

  say(text) {
    this.text = text;
    this.textT = 2.4;
  }

  /** Lock in what plays next and score the choice (it lands when the phrase starts). */
  commit() {
    const prev = this.plan[this.plan.length - 1].name;
    const nxt = this.next;
    const run = [...this.plan].reverse().findIndex((p) => p.name !== 'groove');
    const grooves = run < 0 ? this.plan.length : run;
    let delta = 0;
    let text = '';
    if (nxt === 'drop') {
      if (prev === 'build') {
        delta = 22 + (this.energy > 60 ? 5 : 0);
        text = 'THE DROP!';
      } else {
        delta = -12;
        text = 'Too soon! No build-up.';
      }
    } else if (prev === 'build') {
      delta = -15;
      text = 'They wanted the drop...';
    } else if (nxt === 'build') {
      delta = prev === 'drop' ? 0 : 4;
      text = prev === 'drop' ? 'Straight back up?' : 'Building...';
    } else if (nxt === 'breakdown') {
      delta = prev === 'drop' ? 6 : prev === 'breakdown' ? -10 : -2;
      text = prev === 'drop' ? 'A breather.' : prev === 'breakdown' ? "You're losing them." : 'Slow already?';
    } else if (nxt === 'groove') {
      delta = grooves >= 2 ? -8 : ['intro', 'drop', 'breakdown'].includes(prev) ? 4 : 0;
      text = grooves >= 2 ? 'Bit samey...' : 'Locked in.';
    }
    this.plan.push({ name: nxt });
    this.pending.set(this.plan.length - 1, { delta, text, drop: nxt === 'drop' && prev === 'build' });
    // after a drop most DJs ride the groove; default to that
    this.next = nxt === 'build' ? 'drop' : 'groove';
  }

  update(dt) {
    if (!this.active) return;
    const { beat, k, at } = this.where();
    // lock the next phrase in a couple of beats before it starts (the sound is scheduled ahead)
    const nextStart = (this.start0 + this.plan.length * PHRASE) * 4;
    if (this.plan.length < this.total && beat >= nextStart - 2.5) this.commit();
    // a phrase starting: its choice lands with the crowd
    if (k >= 1 && this.pending.has(k) && at >= 0) {
      const p = this.pending.get(k);
      this.pending.delete(k);
      this.energy = Math.max(0, Math.min(100, this.energy + p.delta));
      if (p.text) this.say(p.text);
      if (p.drop) {
        this.drops++;
        this.onCheer?.();
      }
    }
    // missed a cue
    if (k >= 1 && !this.judged.has(k) && at > 1.2) {
      this.judged.add(k);
      this.energy = Math.max(0, this.energy - 3);
      this.say('Sloppy mix');
    }
    // the energy drifts with what's playing
    if (k >= 0) {
      const name = this.plan[Math.min(k, this.plan.length - 1)].name;
      const drift = { intro: -0.3, groove: -0.15, breakdown: -0.45, build: 0.15, drop: 0.5 }[name] ?? 0;
      this.energy = Math.max(0, Math.min(100, this.energy + drift * dt));
      this.sum += this.energy * dt;
      this.n += dt;
    }
    if ((this.textT -= dt) <= 0) this.text = '';
    if (k >= this.total) this.end(false);
  }

  /** The rest of the set gets played by the resident. */
  end(early) {
    if (!this.active) return;
    this.active = false;
    setArrangement(null);
    const avg = this.n ? this.sum / this.n : this.energy;
    this.onEnd?.({ early, avg, energy: this.energy, cleans: this.cleans, wrecks: this.wrecks, drops: this.drops, slot: this.slot, played: Math.max(0, this.where().k) });
  }

  /** What the panel shows. */
  view() {
    const { k, at } = this.where();
    const playing = k >= 0 ? this.plan[Math.min(k, this.plan.length - 1)].name : 'waiting';
    const toNext = k < 0 ? -k * PHRASE * 4 - at : PHRASE * 4 - at;
    const locked = this.plan.length > Math.max(0, k) + 1;
    return {
      playing,
      next: locked ? this.plan[Math.max(0, k) + 1].name : this.next,
      locked,
      beatsLeft: Math.max(0, toNext),
      phrase: Math.max(0, k) + 1,
      total: this.total,
      energy: this.energy,
      text: this.text,
    };
  }
}
