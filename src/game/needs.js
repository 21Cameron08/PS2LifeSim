import { clamp, lerp } from '../core/rng.js';

// Needs: the five things that pull you through a day. Each runs from 0
// (desperate) to 100 (sorted). They drain with game time (faster on a shift,
// slower asleep) and fill from things you do: GULLY'S and the fridge for hunger,
// the bed for energy, the shower for hygiene, the TV, music, the club and the
// Lantern Quarter for fun, and talking to people for social.
//
// A game hour is a real minute, so a waking day is about 16 real minutes: about
// two meals, one sleep and one shower a day keeps you going.

export const NEEDS = [
  { key: 'hunger', name: 'Hunger', low: 'Hungry', empty: 'Starving', decay: 5.5, fix: "Eat something: the fridge at home, or GULLY'S in Greenway." },
  { key: 'energy', name: 'Energy', low: 'Tired', empty: 'Exhausted', decay: 4.5, fix: 'Go home and get some sleep, or you will drop where you stand.' },
  { key: 'hygiene', name: 'Hygiene', low: 'Smelly', empty: 'Rank', decay: 3.5, fix: 'A shower at home would help. Everyone agrees.' },
  { key: 'fun', name: 'Fun', low: 'Bored', empty: 'Miserable', decay: 4.5, fix: 'Do something fun: TV, music, dancing, the Lantern Quarter.' },
  { key: 'social', name: 'Social', low: 'Lonely', empty: 'Isolated', decay: 3.0, fix: 'Talk to someone. Anyone. The person at the bus stop counts.' },
];

const START = { hunger: 80, energy: 85, hygiene: 85, fun: 70, social: 65 };

export class Needs {
  constructor(saved) {
    this.v = { ...START };
    for (const n of NEEDS) if (Number.isFinite(saved?.[n.key])) this.v[n.key] = clamp(saved[n.key], 0, 100);
    this.warned = {}; // 0: fine, 1: warned below 25, 2: warned below 10
    for (const n of NEEDS) this.warned[n.key] = this.v[n.key] < 10 ? 2 : this.v[n.key] < 25 ? 1 : 0;
    this.pulse = {}; // needs that just went up (the HUD flashes them)
    this.chats = new Map(); // who you've talked to lately (game minutes)
  }

  get(k) {
    return this.v[k];
  }

  /** Change one need; returns how much it actually moved. */
  add(k, n) {
    const before = this.v[k];
    this.v[k] = clamp(before + n, 0, 100);
    if (n >= 1) this.pulse[k] = 1;
    return this.v[k] - before;
  }

  /** Several at once: needs.give({ hunger: 30, fun: 5 }). */
  give(o) {
    for (const k in o) if (k in this.v) this.add(k, o[k]);
  }

  /** Awake, `minutes` of game time passing. mult: extra drain per need (a shift, dancing...). */
  tick(minutes, mult = {}) {
    const h = minutes / 60;
    const v = this.v;
    for (const n of NEEDS) {
      let rate = n.decay * (mult[n.key] ?? 1);
      // running on empty burns you out
      if (n.key === 'energy') rate *= v.hunger <= 0 ? 3 : v.hunger < 15 ? 1.8 : 1;
      v[n.key] = clamp(v[n.key] - rate * h, 0, 100);
    }
  }

  /** Asleep for `hours`: energy back at 12.5 an hour, the rest drains slowly. */
  sleep(hours) {
    const v = this.v;
    v.energy = clamp(v.energy + hours * 12.5, 0, 100);
    v.hunger = clamp(v.hunger - hours * 2.5, 0, 100);
    v.hygiene = clamp(v.hygiene - hours * 1.5, 0, 100);
    v.social = clamp(v.social - hours * 1, 0, 100);
    this.pulse.energy = 1;
  }

  /** A conversation: the first one with someone in a while counts for a lot more. */
  chat(key, minutes, big = 10) {
    const last = this.chats.get(key);
    const fresh = last === undefined || minutes - last > 60;
    this.chats.set(key, minutes);
    return this.add('social', fresh ? big : 2);
  }

  /** 0-100: mostly the average, but the worst need drags it down. */
  get mood() {
    let sum = 0;
    let min = 100;
    for (const n of NEEDS) {
      sum += this.v[n.key];
      min = Math.min(min, this.v[n.key]);
    }
    return (sum / NEEDS.length) * 0.65 + min * 0.35;
  }

  moodName() {
    const m = this.mood;
    return m >= 78 ? 'GREAT' : m >= 58 ? 'GOOD' : m >= 40 ? 'OKAY' : m >= 22 ? 'LOW' : 'AWFUL';
  }

  /** How well conversations go: friendships grow faster when you're in a good mood (and don't smell). */
  get charm() {
    return lerp(0.6, 1.25, this.mood / 100) * (this.v.hygiene < 25 ? 0.5 : 1);
  }

  /** Short words for whatever's low right now ('Hungry', 'Tired'...). */
  flags() {
    const out = [];
    for (const n of NEEDS) {
      const x = this.v[n.key];
      if (x < 10) out.push(n.empty);
      else if (x < 25) out.push(n.low);
    }
    return out;
  }

  /** Needs that just dropped below 25 or 10: [{ need, level }]. Re-arms once a need is back above 35. */
  warnings() {
    const out = [];
    for (const n of NEEDS) {
      const x = this.v[n.key];
      const w = this.warned[n.key];
      if (x > 35) this.warned[n.key] = 0;
      else if (x < 10 && w < 2) {
        this.warned[n.key] = 2;
        out.push({ need: n, level: 2 });
      } else if (x < 25 && w < 1) {
        this.warned[n.key] = 1;
        out.push({ need: n, level: 1 });
      }
    }
    return out;
  }

  save() {
    const out = {};
    for (const n of NEEDS) out[n.key] = Math.round(this.v[n.key] * 10) / 10;
    return out;
  }
}
