import * as THREE from 'three';
import { Rng } from '../core/rng.js';
import { ITEM, GR9 } from './fashion.js';

// SOLE SWAP: Dex's reseller stall at the night market (6 PM - 2 AM). He buys any
// Grain Runner 9 colourway at what it's going for this week and sells the ones you
// missed at a markup. A pair is worth most the week it drops, then dips, then climbs
// again as fewer are left; some colourways are grails. He'll take your other clothes
// too: thrift gems and VELLARD hold their value, streetwear less so.

export const SWAP_OPEN = (h) => h >= 18 || h < 2;
const GRAIL = { 'sg:gr9': 1.1, 'sg:gr9e': 1.0, 'sg:gr9s': 1.15, 'sg:gr9m': 0.9, 'sg:gr9u': 1.3, 'sg:gr9b': 1.5 };
const BUYS = 0.8; // Dex pays 80% of the going rate for a drop pair
const SELLS = 1.2; // and sells at 120%

export class Resale {
  constructor({ clock, state }) {
    this.clock = clock;
    this.state = state;
  }

  week() {
    return Math.floor((this.clock.day - 1) / 7);
  }

  /** Weeks since a colourway last dropped (0: this week's), or null if it never has. Drops are Saturdays at 10. */
  sinceDrop(id) {
    const k = GR9.indexOf(id);
    const w = this.week();
    // this week's drop has happened once it's Saturday 10 AM (or Sunday)
    const done = this.clock.weekday === 'SUN' || (this.clock.weekday === 'SAT' && this.clock.hour >= 10);
    const latest = done ? w : w - 1;
    for (let back = 0; back <= latest; back++) if ((latest - back) % GR9.length === k) return back;
    return null;
  }

  /** What a colourway is going for this week (null: not dropped yet). */
  market(id) {
    const it = ITEM[id];
    const a = this.sinceDrop(id);
    if (a === null) return null;
    const hype = a === 0 ? 2.6 : a === 1 ? 2.1 : 1.55 + a * 0.16;
    const r = new Rng(4242 + this.week() * 31 + GR9.indexOf(id));
    return Math.round(it.price * hype * GRAIL[id] * r.float(0.9, 1.1));
  }

  /** What Dex pays for something you own. */
  offer(id) {
    const it = ITEM[id];
    if (!it || it.basic) return 0;
    if (it.drop) return Math.round((this.market(id) ?? it.price) * BUYS);
    if (it.gem) return Math.round(it.price * 3);
    if (it.oneOff) return Math.round(it.price * 0.8);
    const f = { thrift: 0.5, splitgrain: 0.35, vellard: 0.55 }[it.brand] ?? 0.3;
    return Math.max(1, Math.round(it.price * f));
  }

  /** What Dex asks for a colourway you missed. */
  ask(id) {
    const m = this.market(id);
    return m === null ? null : Math.round(m * SELLS);
  }

  /** Sell something you own: it leaves your wardrobe (anything you're wearing swaps for the basic). */
  sell(id, appearance, baseWear) {
    const st = this.state;
    const i = st.owned.indexOf(id);
    if (i < 0) return { ok: false, msg: "That's not yours to sell." };
    const pay = this.offer(id);
    st.owned.splice(i, 1);
    for (const [slot, w] of Object.entries(appearance.wear)) if (w === id) appearance.wear[slot] = baseWear[slot] ?? null;
    st.cash = Math.round((st.cash + pay) * 100) / 100;
    if (st.wish === id) st.wish = null;
    return { ok: true, pay, msg: `Dex counts out ${money(pay)} in twenties. "Pleasure."` };
  }

  /** Buy a colourway you missed, cash. */
  buy(id) {
    const st = this.state;
    const p = this.ask(id);
    if (p === null) return { ok: false, msg: '"Nobody has those yet. Saturday, ten AM, SPLITGRAIN. Bring a chair."' };
    if (st.owned.includes(id)) return { ok: false, msg: '"You\'ve got a pair. Nobody needs two. Well. I need two."' };
    if (st.cash < p) return { ok: false, msg: `"${money(p)}, cash. I don't do cards, I'm a stall."` };
    st.cash -= p;
    st.owned.push(id);
    return { ok: true, msg: `Dex hands over a box that has never been opened. "Deadstock. Don't wear them in the rain."` };
  }

  /** Everything you own is worth this much to Dex (for your net worth). */
  worth() {
    return (this.state.owned ?? []).reduce((s, id) => s + this.offer(id), 0);
  }
}

/** The chalkboard at the stall: this week's Grain Runner 9 prices. */
export class SwapBoard {
  constructor() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 320;
    this.c = c;
    this.g = c.getContext('2d');
    this.tex = new THREE.CanvasTexture(c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.week = -1;
  }
  draw(resale) {
    if (this.week === resale.week()) return;
    this.week = resale.week();
    const g = this.g;
    const HAND = '"Comic Sans MS", "Marker Felt", cursive';
    g.fillStyle = '#1c2420';
    g.fillRect(0, 0, 256, 320);
    g.strokeStyle = '#8a6a40';
    g.lineWidth = 10;
    g.strokeRect(5, 5, 246, 310);
    g.textAlign = 'center';
    g.fillStyle = '#ff8a2a';
    g.font = `bold 30px ${HAND}`;
    g.fillText('SOLE SWAP', 128, 44);
    g.fillStyle = '#f2efe6';
    g.font = `16px ${HAND}`;
    g.fillText('buying · selling · no fakes', 128, 68);
    g.textAlign = 'left';
    GR9.forEach((id, k) => {
      const it = ITEM[id];
      const m = resale.market(id);
      const y = 104 + k * 34;
      g.fillStyle = it.look.shoes;
      g.fillRect(20, y - 12, 16, 10);
      g.fillStyle = it.look.sole;
      g.fillRect(20, y - 2, 16, 4);
      g.fillStyle = '#f2efe6';
      g.font = `18px ${HAND}`;
      g.fillText(it.name.replace("Grain Runner 9 '", '').replace("'", ''), 46, y);
      g.textAlign = 'right';
      g.fillStyle = m === null ? '#8a9a8a' : '#f2d080';
      g.fillText(m === null ? 'soon' : `$${m}`, 236, y);
      g.textAlign = 'left';
    });
    this.tex.needsUpdate = true;
  }
}

/** Which of your clothes Dex would look at (not the basics), best first. */
export function sellable(state) {
  return (state.owned ?? [])
    .map((id) => ITEM[id])
    .filter((it) => it && !it.basic)
    .sort((a, b) => b.price - a.price);
}

export const DEX_LOOK = { top: '#1c1c20', topStyle: 1, bottom: '#1c1c20', wear: { top: 'sg:hoodieb', outer: null, bottom: 'sg:cargob', shoes: 'sg:gr9u', hat: 'sg:cap', chain: 'sg:chain', glasses: null } };

function money(n) {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}
