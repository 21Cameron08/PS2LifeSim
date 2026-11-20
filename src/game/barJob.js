import * as THREE from 'three';
import { Rng } from '../core/rng.js';
import { GeoBuilder, shade } from '../core/geo.js';
import { additive } from '../render/materials.js';

// Bartender at SUBSTATION. Nadia (the head bartender) hires you; you work any
// night the club's open, behind the bar with her:
//  - people at the bar order (a "!" over their heads); stand across from them and
//    make what they asked for from the recipe card, glass by glass, in the right order
//  - every drink needs a clean glass: empties pile up on the tables and booths,
//    collect them in a crate and run the glasswasher behind the bar
//  - iced drinks use up the ice well (fill a bucket at the ice machine), beer runs
//    the keg dry (change it at the keg fridge)
//  - leave someone waiting too long and Nadia takes the order (and the tip)
//  - $11 an hour plus tips, paid to your bank with a slip when you clock out

export const BAR_WAGE = 1100; // cents per game hour

export const INGREDIENTS = [
  { id: 'ice', name: 'Ice', key: '1' },
  { id: 'gin', name: 'Gin', key: '2' },
  { id: 'rum', name: 'Dark rum', key: '3' },
  { id: 'lime', name: 'Lime', key: '4' },
  { id: 'blue', name: 'Blue fizz', key: '5' },
  { id: 'soda', name: 'Soda', key: '6' },
  { id: 'cola', name: 'Cola', key: '7' },
  { id: 'ginger', name: 'Ginger beer', key: '8' },
  { id: 'coffee', name: 'Cold brew', key: '9' },
  { id: 'cinnamon', name: 'Cinnamon schnapps', key: '0' },
  { id: 'tap', name: 'Beer tap', key: 'Q' },
  { id: 'water', name: 'Tap water', key: 'W' },
];

// the recipe card taped under the bar (drink names match the menu in main.js)
export const RECIPES = [
  { id: 'water', name: 'Tap water', steps: ['water'], price: 0 },
  { id: 'cola', name: 'Cola', steps: ['ice', 'cola'], price: 4 },
  { id: 'limesoda', name: 'Lime soda', steps: ['ice', 'lime', 'soda'], price: 5 },
  { id: 'ginger', name: 'Ginger beer', steps: ['ice', 'ginger'], price: 5 },
  { id: 'beer', name: 'Beer', steps: ['tap'], price: 7 },
  { id: 'livewire', name: 'Live Wire', steps: ['ice', 'gin', 'lime', 'blue', 'soda'], price: 12 },
  { id: 'brownout', name: 'Brownout', steps: ['ice', 'rum', 'cola', 'coffee'], price: 11 },
  { id: 'spark', name: 'Spark (shot)', steps: ['cinnamon'], price: 6 },
];
const BY_ID = Object.fromEntries(RECIPES.map((r) => [r.id, r]));

// what people order, by night
const TASTE = {
  house: { beer: 4, cola: 2, limesoda: 2, ginger: 1, livewire: 2, brownout: 2, spark: 1, water: 1 },
  static: { beer: 3, cola: 1, limesoda: 1, ginger: 2, livewire: 3, brownout: 1, spark: 3, water: 1 },
  current: { beer: 4, cola: 1, limesoda: 1, ginger: 1, livewire: 3, brownout: 3, spark: 2, water: 1 },
  overload: { beer: 3, cola: 1, limesoda: 1, ginger: 1, livewire: 3, brownout: 2, spark: 5, water: 2 },
  low: { beer: 3, cola: 2, limesoda: 3, ginger: 3, livewire: 1, brownout: 2, spark: 0, water: 2 },
};

const NADIA_LINES = [
  'Smile. They tip better when you smile. They tip best when you are fast.',
  'Glasses, glasses, glasses. A bar without glasses is a very sad pub.',
  'If they say "surprise me", they get a beer.',
  'Ice first. Always ice first. Who taught you, the 24?',
  "If someone's been cut off, they're cut off. I don't care whose birthday it is.",
];

const money = (c) => `${c < 0 ? '-' : ''}$${(Math.abs(c) / 100).toFixed(2)}`;

export class BarJob {
  constructor({ scene, club, clubbers, ui, audio, state, clock, player, crowd, tex }) {
    Object.assign(this, { club, clubbers, ui, audio, state, clock, player, crowd });
    this.rng = new Rng(Date.now() & 0xfff);
    state.barJob ??= { hired: false, shift: null, earned: 0, shifts: 0 };
    this.J = state.barJob;
    this.orders = [];
    this.orderT = 4;
    this.ids = 0;
    this.carry = null; // { type: 'crate', n } | { type: 'ice' }
    this.work = null;
    this.serving = null;
    this.covered = new Set(); // orders Nadia took
    this.L = (x, z, y = 0) => club.w(x, z, y);
    const L = this.L;
    // where things are behind the bar
    this.washer = L(22.25, 7.2);
    this.iceMachine = L(22.4, 5.85);
    this.iceWell = L(20.65, 9.4);
    this.kegFridge = L(22.25, 11.6);
    // tables where empties pile up
    this.tables = [
      ...[
        [6.4, 7.3],
        [17.0, 7.3],
        [13.9, 12.7],
        [5.9, 12.9],
      ].map(([x, z]) => ({ at: L(x, z), top: 1.08, n: 0 })),
      ...[5.8, 9.0, 12.2].map((z) => ({ at: L(1.15, z), stand: L(2.35, z), top: 0.76, n: 0 })),
      ...[7.6, 10.4].map((z) => ({ at: L(19.75, z), stand: L(18.9, z), top: 1.17, n: 0, bar: true })),
    ];
    this.buildMeshes(scene, tex);
    // a saved shift from last time: start it fresh
    if (this.J.shift) this.J.shift = null;
  }

  buildMeshes(scene, tex) {
    // dirty glasses on the tables
    const gg = new THREE.CylinderGeometry(0.04, 0.034, 0.13, 8).translate(0, 0.065, 0);
    this.glassMesh = new THREE.InstancedMesh(gg, new THREE.MeshLambertMaterial({ color: '#b8c8d0', transparent: true, opacity: 0.7 }), 48);
    this.glassMesh.count = 0;
    this.glassMesh.frustumCulled = false;
    scene.add(this.glassMesh);
    // order markers over people's heads
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12 * 3), 3));
    this.markMat = additive({ map: tex.glow, color: new THREE.Color('#ffb04a'), size: 0.55, points: true, fog: false });
    this.marks = new THREE.Points(mg, this.markMat);
    this.marks.frustumCulled = false;
    scene.add(this.marks);
    // what you carry: a crate of glasses, an ice bucket
    const cb = new GeoBuilder();
    cb.box(-0.24, 0, -0.17, 0.24, 0.14, 0.17, { color: shade('#2a2a30'), bottom: true });
    for (let k = 0; k < 6; k++) cb.addGeometry(new THREE.CylinderGeometry(0.04, 0.034, 0.13, 6), new THREE.Matrix4().makeTranslation(-0.15 + (k % 3) * 0.15, 0.2, -0.07 + Math.floor(k / 3) * 0.14), shade('#b8c8d0'));
    this.crateMesh = new THREE.Mesh(cb.build(), new THREE.MeshLambertMaterial({ vertexColors: true }));
    const ib = new GeoBuilder();
    ib.addGeometry(new THREE.CylinderGeometry(0.16, 0.13, 0.26, 12), new THREE.Matrix4().makeTranslation(0, 0.13, 0), shade('#c8ccd0'));
    ib.addGeometry(new THREE.CylinderGeometry(0.15, 0.15, 0.02, 12), new THREE.Matrix4().makeTranslation(0, 0.25, 0), shade('#e8f4ff'));
    this.iceMesh = new THREE.Mesh(ib.build(), new THREE.MeshLambertMaterial({ vertexColors: true }));
    for (const m of [this.crateMesh, this.iceMesh]) {
      m.visible = false;
      scene.add(m);
    }
  }

  get onShift() {
    return !!this.J.shift;
  }

  // ---------------------------------------------------------------- the shift
  clockIn(nightIndex) {
    const s = (this.J.shift = { start: this.clock.minutes, night: nightIndex, served: 0, drinks: 0, wrong: 0, tips: 0, docked: 0, washed: 0, iceRuns: 0, kegs: 0, covered: 0, notes: [] });
    this.glasses = 16;
    this.ice = 0.8;
    this.keg = 0.7;
    this.orders = [];
    this.orderT = 3;
    this.carry = null;
    for (const t of this.tables) t.n = this.rng.int(0, 2);
    this.clubbers.offShift.add(this.clubbers.bartenders[1]);
    this.wearUniform(true);
    this.audio.punch?.();
    this.ui.toast('Nadia lifts the flap. "Get back here. Apron on, ice first, smile."');
    this.ui.hint('People at the bar get a <b>!</b> when they want a drink: stand across from them and press <b>E</b>. Keep the glasses, ice and beer topped up.', 10);
    return s;
  }

  clockOut(reason = null) {
    const s = this.J.shift;
    if (!s) return;
    if (reason === 'walked') this.dock(500, 'walked off mid-shift');
    const mins = Math.max(0, this.clock.minutes - s.start);
    const wage = Math.floor((mins / 60) * BAR_WAGE);
    const total = Math.max(0, wage + s.tips - s.docked);
    this.state.bank += total / 100;
    this.J.earned += total;
    this.J.shifts++;
    this.J.shift = null;
    this.carry = null;
    this.orders = [];
    this.clubbers.offShift.clear();
    this.wearUniform(false);
    this.audio.punch?.();
    this.ui.setShift(null);
    const line = (a, b) => `${a.padEnd(18, '.')} ${b}`;
    const verdict =
      reason === 'walked'
        ? 'You walked out mid-shift. Nadia is not impressed.'
        : s.wrong > 3
          ? 'Nadia: "Read. The. Card."'
          : s.served >= 10
            ? 'Nadia: "Not bad for a newbie. Same time next week?"'
            : mins < 60
              ? 'Nadia: "That was barely a shift."'
              : 'Nadia: "Go home. Drink water. Tomorrow you will be faster."';
    const text = [
      line('Time worked', `${Math.floor(mins / 60)}h ${String(Math.floor(mins % 60)).padStart(2, '0')}m`),
      line('Wage @ $11.00/hr', money(wage)),
      line('Orders served', String(s.served)),
      line('Drinks made', String(s.drinks)),
      line('Glasses washed', String(s.washed)),
      line('Ice runs / kegs', `${s.iceRuns} / ${s.kegs}`),
      line('Tips', money(s.tips)),
      line('Docked', money(-s.docked)),
      ...s.notes.slice(-4).map((n) => `  - ${n}`),
      line('Paid to bank', money(total)),
      '',
      verdict,
    ].join('\n');
    this.player.locked = true;
    this.ui.openDialog({ name: 'SUBSTATION · BAR SLIP', text, mono: true, choices: [{ label: 'Pocket the slip', fn: () => this.ui.closeDialog() }], onClose: () => (this.player.locked = false) });
  }

  dock(cents, why, toast = false) {
    const s = this.J.shift;
    if (!s) return;
    s.docked += cents;
    s.notes.push(`${why} (${money(-cents)})`);
    if (toast) this.ui.toast(`Docked ${money(cents)}: ${why}.`);
  }

  wearUniform(on) {
    const app = this.state.appearance;
    this.crowd.setAppearance(this.player.char.id, on ? { ...app, topStyle: 0, top: '#141418', bottom: '#141418' } : app);
  }

  nadiaLine() {
    return this.rng.pick(NADIA_LINES);
  }

  // ---------------------------------------------------------------- orders
  newOrder(nightId) {
    const busy = new Set(this.orders.map((o) => o.a));
    const atBar = this.clubbers.pool.filter((a) => a.mode === 'bar' && a.c.visible && !a.path.length && !busy.has(a));
    if (!atBar.length) return;
    const a = this.rng.pick(atBar);
    const taste = TASTE[nightId] ?? TASTE.house;
    const pick = () => {
      let r = this.rng.next() * Object.values(taste).reduce((s, w) => s + w, 0);
      for (const [id, w] of Object.entries(taste)) if ((r -= w) < 0) return id;
      return 'beer';
    };
    const n = this.rng.chance(0.55) ? 1 : this.rng.chance(0.7) ? 2 : 3;
    const items = Array.from({ length: n }, pick).sort();
    this.orders.push({ id: ++this.ids, a, name: a.name, items, t: 0 });
  }

  orderText(o) {
    const counts = {};
    for (const id of o.items) counts[id] = (counts[id] ?? 0) + 1;
    return Object.entries(counts)
      .map(([id, n]) => `${n > 1 ? `${n}× ` : ''}${BY_ID[id].name}`)
      .join(', ');
  }

  /** The bar UI's result: the tray you put up. */
  serve(o, tray) {
    const s = this.J.shift;
    if (!s) return;
    const want = [...o.items].sort();
    const got = [...tray].sort();
    let wrong = 0;
    const left = [...want];
    for (const id of got) {
      const i = left.indexOf(id);
      if (i >= 0) left.splice(i, 1);
      else wrong++;
    }
    wrong += left.length;
    this.orders.splice(this.orders.indexOf(o), 1);
    s.served++;
    // empties appear on a table a minute or so later
    setTimeout(() => {
      const t = this.rng.pick(this.tables);
      t.n = Math.min(4, t.n + got.length);
    }, 25000 + this.rng.next() * 30000);
    const price = want.reduce((sum, id) => sum + BY_ID[id].price, 0);
    if (wrong) {
      s.wrong += wrong;
      this.dock(200 * wrong, `${wrong} wrong drink${wrong > 1 ? 's' : ''} for ${o.name}`);
      this.ui.toast(`${o.name}: "That's not what I ordered." Docked ${money(200 * wrong)}.`);
      this.audio.tone(300, 'square', 0.03, 0.2);
      return;
    }
    const fast = o.t < 20 ? 1 : o.t < 40 ? 0.5 : 0;
    const tip = price === 0 ? 0 : Math.round((fast * (this.rng.float(1, 3) + price * 0.1) + (this.rng.chance(0.2) ? 1 : 0)) * 100);
    s.tips += tip;
    this.audio.coin();
    this.ui.toast(price ? `${o.name} taps their card: $${price}.${tip ? ` Tip: ${money(tip)}.` : ''}` : `${o.name}: "Water, perfect, thanks."`);
  }

  /** Pour one glass: spends a glass, ice, beer. Returns an error, or null. */
  pour(steps) {
    if (this.glasses <= 0) return 'No clean glasses! Collect the empties and run the glasswasher.';
    if (steps.includes('ice') && this.ice <= 0.02) return 'The ice well is empty. Fill a bucket at the ice machine.';
    if (steps.includes('tap') && this.keg <= 0.02) return 'The beer tap just sputters. Change the keg.';
    this.glasses--;
    if (steps.includes('ice')) this.ice = Math.max(0, this.ice - 0.07);
    if (steps.includes('tap')) this.keg = Math.max(0, this.keg - 1 / 28);
    this.J.shift.drinks++;
    return null;
  }

  /** Which recipe these steps make (in order), or null. */
  static match(steps) {
    return RECIPES.find((r) => r.steps.length === steps.length && r.steps.every((x, i) => x === steps[i])) ?? null;
  }

  // ---------------------------------------------------------------- interactions
  behindBar(p) {
    const { x, z } = this.club.local(p);
    return x > 20.25 && x < 22.75 && z > 5.4 && z < 13.0 && p.y < this.club.origin.y + 1;
  }

  find(p, near) {
    const s = this.J.shift;
    if (!s) return null;
    if (this.work) return { label: `${this.work.label}… ${Math.floor((this.work.t / this.work.dur) * 100)}%`, act: () => {} };
    if (this.behindBar(p)) {
      // serve whoever's across the bar from you
      let best = null;
      let bd = 1.0;
      for (const o of this.orders) {
        const c = o.a.c;
        const dz = Math.abs(c.z - p.z);
        if (dz < bd && Math.abs(c.x - p.x) < 2.4) {
          bd = dz;
          best = o;
        }
      }
      if (best) return { label: `Serve ${best.name}: ${this.orderText(best)}`, act: () => this.openBar(best) };
      if (this.carry?.type === 'crate' && near(p, this.washer, 1.2)) return { label: `Run the glasswasher (${this.carry.n})`, act: () => this.startWork('Washing glasses', 3.2, () => this.wash()) };
      if (!this.carry && near(p, this.iceMachine, 1.2)) return { label: 'Fill an ice bucket', act: () => this.startWork('Scooping ice', 2.0, () => (this.carry = { type: 'ice' })) };
      if (this.carry?.type === 'ice' && near(p, this.iceWell, 1.3)) return { label: 'Tip the ice into the well', act: () => this.fillIce() };
      if (!this.carry && this.keg < 0.25 && near(p, this.kegFridge, 1.2)) return { label: 'Change the keg', act: () => this.startWork('Changing the keg', 4.5, () => this.changeKeg()) };
      if (this.carry && near(p, this.washer, 1.2) && this.carry.type === 'ice') return null;
    }
    // collecting empties out on the floor
    for (const t of this.tables) {
      if (!t.n) continue;
      const at = t.stand ?? t.at;
      if (near(p, at, t.stand ? 1.0 : 1.1) && Math.abs(p.y - this.club.origin.y) < 0.6) {
        if (this.carry && this.carry.type !== 'crate') return null;
        return { label: `Collect the empties (${t.n})`, act: () => this.collect(t) };
      }
    }
    return null;
  }

  startWork(label, dur, done) {
    this.player.locked = true;
    this.work = { label, dur, t: 0, done };
  }

  collect(t) {
    const room = 12 - (this.carry?.n ?? 0);
    const n = Math.min(room, t.n);
    if (!n) return this.ui.toast('The crate is full. Take it to the glasswasher behind the bar.');
    t.n -= n;
    this.carry = { type: 'crate', n: (this.carry?.n ?? 0) + n };
    this.audio.tone(1800, 'triangle', 0.02, 0.08);
  }

  wash() {
    const n = this.carry.n;
    this.carry = null;
    this.glasses += n;
    this.J.shift.washed += n;
    this.audio.noiseHit?.(0.06, 1200, 0.5);
    this.ui.toast(`${n} clean glasses, steaming. (${this.glasses} clean)`);
  }

  fillIce() {
    this.carry = null;
    this.ice = 1;
    this.J.shift.iceRuns++;
    this.audio.noiseHit?.(0.08, 3000, 0.4);
  }

  changeKeg() {
    this.keg = 1;
    this.J.shift.kegs++;
    this.audio.thud?.();
    this.ui.toast('New keg on. The tap coughs, then pours. Lovely.');
  }

  openBar(o) {
    this.serving = o;
    this.player.locked = true;
    o.a.talking = true;
    this.ui.openBar({
      order: o,
      orderText: this.orderText(o),
      ingredients: INGREDIENTS,
      recipes: RECIPES,
      stock: () => ({ glasses: this.glasses, ice: this.ice, keg: this.keg }),
      pour: (steps) => this.pour(steps),
      match: (steps) => BarJob.match(steps),
      onServe: (tray) => this.serve(o, tray),
      onClose: () => {
        o.a.talking = false;
        this.serving = null;
        this.player.locked = false;
      },
    });
  }

  // ---------------------------------------------------------------- per frame
  /** ctx: { open, nightId, inClub, playerPos, near(a, b, r) } */
  update(dt, ctx) {
    const s = this.J.shift;
    const p = this.player;
    // the flap at the end of the bar only opens for staff
    this.club.setBarFlap(!!s);
    if (this.work) {
      this.work.t += dt;
      p.char.work = true;
      if (this.work.t >= this.work.dur) {
        const w = this.work;
        this.work = null;
        p.char.work = false;
        p.locked = false;
        w.done();
      }
    }
    // what you're carrying
    this.crateMesh.visible = this.carry?.type === 'crate';
    this.iceMesh.visible = this.carry?.type === 'ice';
    if (s) {
      p.char.carry = !!this.carry && !this.work;
      const mesh = this.carry?.type === 'crate' ? this.crateMesh : this.carry ? this.iceMesh : null;
      if (mesh) {
        const fx = Math.sin(p.yaw);
        const fz = Math.cos(p.yaw);
        mesh.position.set(p.pos.x + fx * 0.42, p.pos.y + (this.carry.type === 'crate' ? 1.0 : 0.92) * p.char.app.height, p.pos.z + fz * 0.42);
        mesh.rotation.set(0, p.yaw, 0);
      }
    }
    // empties on the tables
    let n = 0;
    const m = new THREE.Matrix4();
    if (s && ctx.inClub)
      for (const t of this.tables)
        for (let k = 0; k < t.n && n < 48; k++) {
          m.makeTranslation(t.at.x + Math.cos(k * 2.1) * 0.12, t.at.y + t.top, t.at.z + Math.sin(k * 2.1) * 0.12);
          this.glassMesh.setMatrixAt(n++, m);
        }
    this.glassMesh.count = n;
    this.glassMesh.instanceMatrix.needsUpdate = true;
    // order markers
    const mp = this.marks.geometry.attributes.position;
    let mk = 0;
    if (s) for (const o of this.orders.slice(0, 12)) if (o.a.c.visible) mp.setXYZ(mk++, o.a.c.x, o.a.c.y + 2.15 * o.a.c.app.height, o.a.c.z);
    mp.needsUpdate = true;
    this.marks.geometry.setDrawRange(0, mk);
    this.markMat.opacity = 0.7 + 0.3 * Math.sin(this.clock.minutes * 3);
    if (!s) return;

    // the night's over
    if (!ctx.open) {
      this.clockOut();
      return;
    }
    // people order; Nadia covers anyone left waiting too long
    if ((this.orderT -= dt) <= 0) {
      this.orderT = this.rng.float(9, 20);
      if (this.orders.length < 5) this.newOrder(ctx.nightId);
    }
    for (const o of [...this.orders]) {
      if (o.a.mode !== 'bar') {
        this.orders.splice(this.orders.indexOf(o), 1);
        continue;
      }
      if (this.serving === o) continue;
      o.t += dt;
      if (o.t > 45) {
        this.orders.splice(this.orders.indexOf(o), 1);
        s.covered++;
        s.notes.push(`Nadia covered ${o.name}'s order`);
        this.ui.toast(`Nadia serves ${o.name}. "I got it. Keep up!"`);
      }
    }
    // wandering off
    const d = Math.hypot(ctx.playerPos.x - this.club.doorCenter.x, ctx.playerPos.z - this.club.doorCenter.z);
    if (d > 60) {
      this.clockOut('walked');
      return;
    }
    // the HUD
    const mins = this.clock.minutes - s.start;
    const pay = Math.floor((mins / 60) * BAR_WAGE) + s.tips - s.docked;
    const tasks = [];
    if (this.orders.length) tasks.push(`${this.orders.length} order${this.orders.length > 1 ? 's' : ''} waiting`);
    tasks.push(`${this.glasses} clean glasses${this.glasses < 5 ? ': collect the empties' : ''}`);
    if (this.ice < 0.3) tasks.push(this.ice <= 0.02 ? 'ice well EMPTY' : 'ice running low');
    if (this.keg < 0.25) tasks.push(this.keg <= 0.02 ? 'beer keg EMPTY' : 'beer keg nearly out');
    if (this.carry?.type === 'crate') tasks.push(`carrying ${this.carry.n} empties: glasswasher`);
    if (this.carry?.type === 'ice') tasks.push('carrying ice: the ice well');
    this.ui.setShift(`BAR SHIFT · ${Math.floor(mins / 60)}h ${String(Math.floor(mins % 60)).padStart(2, '0')}m · ${money(pay)}`, tasks);
  }
}

