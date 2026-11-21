import * as THREE from 'three';
import { Rng } from '../core/rng.js';
import { GeoBuilder } from '../core/geo.js';
import { xsignUV } from '../render/exchangeTextures.js';

// Property: real buildings around Port Halcyon you can buy at the HALCYON EXCHANGE's
// property desk. Each one carries a FOR SALE board on its street side until it's
// yours (then a PRIVATE PROPERTY plaque). Rent comes in on Monday mornings with the
// rest of your money; so do repairs, and now and then a flat sits empty. Values
// drift with the market (each district has its own cycle): sell at the desk for
// what it's worth now, less 3% in fees.
//
// state.property = { owned: { id: { paid, week } }, log: [] }

export const PROPS = [
  { id: 'garages', name: 'Lock-up garages', where: 'Ember Row', block: [5, 3], pick: 'small', price: 24000, rent: 210, blurb: 'Six roll-up doors. One has a drum kit in it and nobody knows whose.' },
  { id: 'laundromat', name: 'The laundromat under Unit 3B', where: 'Old Market', block: [1, 1], pick: 'starter', price: 68000, rent: 520, blurb: 'Twelve washers, eight dryers, a change machine that eats quarters. Open 24 hours.' },
  { id: 'corner', name: 'Corner shop unit', where: 'Old Market', block: [0, 1], pick: 'shop', price: 95000, rent: 690, blurb: 'A shop on the ground floor and two flats above. The shop sells everything and nothing.' },
  { id: 'walkup', name: 'Walk-up, six flats', where: 'Greenway', block: [0, 4], pick: 'mid', price: 260000, rent: 1700, blurb: 'Six flats over four floors, no lift, very good radiators. The tenants mostly pay.' },
  { id: 'warehouse', name: 'Kiln Heights warehouse', where: 'Kiln Heights', block: [5, 1], pick: 'big', price: 480000, rent: 2900, blurb: 'Brick, steel windows, studios on every floor. Artists, a bakery, a man who makes boats.' },
  { id: 'rehearsal', name: 'Rehearsal rooms', where: 'Ember Row', block: [3, 4], pick: 'mid', price: 720000, rent: 4200, blurb: 'Soundproofed rooms rented by the hour to every band in the city. Loud. Profitable.' },
  { id: 'offices', name: 'Office building', where: 'Downtown', block: [2, 3], pick: 'tall', price: 1350000, rent: 7600, blurb: 'Eight floors of desks, a lobby with a fountain, and a lift that sings between floors.' },
  { id: 'tower', name: 'Corner tower', where: 'Downtown', block: [3, 2], pick: 'tall', price: 2400000, rent: 13000, blurb: 'Glass, steel and a view of the Meridian Tower that makes its tenants feel important.' },
];
export const PROP = Object.fromEntries(PROPS.map((p) => [p.id, p]));
const PHASE = { 'Ember Row': 0.4, 'Old Market': 1.7, Greenway: 3.1, 'Kiln Heights': 4.4, Downtown: 5.6 };
const cents = (n) => Math.round(n * 100) / 100;

export class Property {
  constructor({ city, clock, state }) {
    this.city = city;
    this.clock = clock;
    this.state = state;
    state.property ??= { owned: {} };
    this.S = state.property;
    // find each property's building
    for (const p of PROPS) p.fp = this.findBuilding(p);
    this.signs = new THREE.Group();
  }

  findBuilding(p) {
    const fps = this.city.footprints.filter((f) => f.i === p.block[0] && f.j === p.block[1]);
    const street = fps.filter((f) => Object.values(f.faces ?? {}).some(Boolean));
    const area = (f) => (f.x1 - f.x0) * (f.z1 - f.z0);
    const site = this.city.apartmentSites?.starter;
    if (p.pick === 'starter' && site) return fps.find((f) => Math.abs(f.x0 - site.x0) < 0.01 && Math.abs(f.z0 - site.z0) < 0.01) ?? street[0];
    const pool = (street.length ? street : fps).filter((f) => !(site && Math.abs(f.x0 - site.x0) < 0.01 && Math.abs(f.z0 - site.z0) < 0.01));
    const sorted = {
      small: [...pool].sort((a, b) => area(a) * a.top - area(b) * b.top),
      shop: [...pool].sort((a, b) => (b.shop ? 1 : 0) - (a.shop ? 1 : 0) || area(a) - area(b)),
      mid: [...pool].sort((a, b) => Math.abs(a.top - 18) - Math.abs(b.top - 18)),
      big: [...pool].sort((a, b) => area(b) - area(a)),
      tall: [...pool].sort((a, b) => b.top - a.top),
    }[p.pick];
    return sorted?.[0] ?? fps[0] ?? null;
  }

  week(minutes = this.clock.minutes) {
    return Math.floor((minutes - 6 * 60) / (7 * 1440));
  }

  owns(id) {
    return !!this.S.owned[id];
  }

  ownedList() {
    return PROPS.filter((p) => this.owns(p.id));
  }

  /** What a property is worth this week (each district rises and falls on its own cycle). */
  value(p, minutes = this.clock.minutes) {
    const w = this.week(minutes);
    const wave = Math.sin(w / 9 + PHASE[p.where]) * 0.06 + Math.sin(w / 3.3 + PHASE[p.where] * 2) * 0.015;
    return Math.round((p.price * (1 + 0.0025 * Math.max(0, w) + wave)) / 100) * 100;
  }

  rent(p) {
    return Math.round(p.rent * (1 + 0.002 * Math.max(0, this.week())));
  }

  /** Everything you own is worth (for your net worth). */
  worth() {
    return this.ownedList().reduce((s, p) => s + this.value(p), 0);
  }

  buy(id) {
    const p = PROP[id];
    if (this.owns(id)) return { ok: false, msg: "It's already yours." };
    const v = this.value(p);
    if (this.state.bank < v) return { ok: false, msg: `That's ${money(v)}, and your bank has ${money(this.state.bank)}. Priya: "No mortgages here, I'm afraid. Cash buyers only."` };
    this.state.bank = cents(this.state.bank - v);
    this.S.owned[id] = { paid: v, week: this.week() };
    this.ledger(`Bought · ${p.name}`, -v);
    return { ok: true, msg: `${p.name} is yours. Rent starts on Monday.`, v };
  }

  sell(id) {
    const p = PROP[id];
    const o = this.S.owned[id];
    if (!o) return { ok: false, msg: "You don't own that." };
    const v = Math.round(this.value(p) * 0.97);
    this.state.bank = cents(this.state.bank + v);
    delete this.S.owned[id];
    this.ledger(`Sold · ${p.name}`, v);
    return { ok: true, msg: `Sold for ${money(v)} after fees: ${v >= o.paid ? `a ${money(v - o.paid)} profit` : `a ${money(o.paid - v)} loss`}.`, v, gain: v - o.paid };
  }

  /** Monday morning: rent in, repairs out. n weeks (if you were away). Returns { net, notes }. */
  collect(n = 1) {
    let net = 0;
    const notes = [];
    const w = this.week();
    for (const p of this.ownedList()) {
      for (let k = 0; k < n; k++) {
        const r = new Rng((w - k) * 7919 + p.price);
        let rent = this.rent(p);
        if (r.chance(0.07)) {
          rent = 0;
          notes.push(`${p.name}: a unit sat empty`);
        }
        if (rent) {
          this.ledger(`Rent in · ${p.name}`, rent);
          net += rent;
        }
        if (r.chance(0.12)) {
          const cost = Math.round(p.rent * r.float(0.3, 1.4));
          this.ledger(`Repairs · ${p.name}`, -cost);
          net -= cost;
          notes.push(`${p.name}: ${r.pick(['a boiler', 'a leaky roof', 'a broken buzzer', 'the drains', 'a window', 'the stairwell lights'])} (-${money(cost)})`);
        } else if (r.chance(0.02)) {
          const cost = Math.round(p.price * 0.02);
          this.ledger(`Major repairs · ${p.name}`, -cost);
          net -= cost;
          notes.push(`${p.name}: the whole roof (-${money(cost)})`);
        }
      }
    }
    this.state.bank = cents(this.state.bank + net);
    return { net, notes };
  }

  ledger(what, amt) {
    const L = this.state.ledger;
    if (!L) return;
    L.push({ t: Math.round(this.clock.minutes), what, amt: cents(amt) });
    if (L.length > 80) L.splice(0, L.length - 80);
  }

  /** Highlights for the Exchange's city model: red for sale, green yours. */
  modelHighlights() {
    return PROPS.filter((p) => p.fp).map((p) => ({ ...p.fp, col: this.owns(p.id) ? '#5aff8a' : '#ff5a4a' }));
  }

  /** Where to stand to look at a property (on its street side). */
  frontOf(p) {
    const f = p.fp;
    if (!f) return null;
    const face = this.face(f);
    const cx = (f.x0 + f.x1) / 2;
    const cz = (f.z0 + f.z1) / 2;
    const off = 2.2;
    return { s: { x: cx, z: f.z1 + off }, n: { x: cx, z: f.z0 - off }, e: { x: f.x1 + off, z: cz }, w: { x: f.x0 - off, z: cz } }[face];
  }

  face(f) {
    const F = f.faces ?? {};
    return ['s', 'n', 'e', 'w'].find((k) => F[k]) ?? 's';
  }

  /** The boards on the buildings: FOR SALE, or the plaque once it's yours. */
  buildSigns(tex) {
    for (const m of this.signs.children) m.geometry.dispose();
    this.signs.clear();
    const b = new GeoBuilder();
    for (const p of PROPS) {
      const f = p.fp;
      if (!f) continue;
      const face = this.face(f);
      const uv = xsignUV(this.owns(p.id) ? 'sold' : 'forsale');
      const y0 = (f.gf || 0) + (f.gf ? 0.55 : 2.6);
      const y1 = y0 + 0.9;
      const hw = 0.6;
      const off = 0.06;
      const cx = (f.x0 + f.x1) / 2;
      const cz = (f.z0 + f.z1) / 2;
      if (face === 's') b.quad([cx - hw, y0, f.z1 + off], [cx + hw, y0, f.z1 + off], [cx + hw, y1, f.z1 + off], [cx - hw, y1, f.z1 + off], [0, 0, 1], uv);
      else if (face === 'n') b.quad([cx + hw, y0, f.z0 - off], [cx - hw, y0, f.z0 - off], [cx - hw, y1, f.z0 - off], [cx + hw, y1, f.z0 - off], [0, 0, -1], uv);
      else if (face === 'e') b.quad([f.x1 + off, y0, cz + hw], [f.x1 + off, y0, cz - hw], [f.x1 + off, y1, cz - hw], [f.x1 + off, y1, cz + hw], [1, 0, 0], uv);
      else b.quad([f.x0 - off, y0, cz - hw], [f.x0 - off, y0, cz + hw], [f.x0 - off, y1, cz + hw], [f.x0 - off, y1, cz - hw], [-1, 0, 0], uv);
    }
    this.signMat ??= new THREE.MeshLambertMaterial({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.25 });
    this.signs.add(new THREE.Mesh(b.build(), this.signMat));
  }
}

export function money(n) {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}
