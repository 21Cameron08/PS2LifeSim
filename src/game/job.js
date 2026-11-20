import * as THREE from 'three';
import { Rng, angleLerp, clamp, damp } from '../core/rng.js';
import { randomAppearance } from '../actors/appearance.js';
import { FIRST_NAMES, LAST_NAMES } from './dialogue.js';

// Night clerk at HALCYON 24. Real work, real-ish pay:
//  - customers walk in off the street, shop, and queue at the register
//  - you scan their items, check ID for beer and count out their change
//  - customers empty the shelves; you carry cases from the stockroom to refill them
//  - spills need mopping, the bin needs taking out to the dumpster
//  - $9.00 an hour, minus whatever the manager docks you

export const WAGE_CENTS = 900; // per game hour
const CASE_SIZE = 16;
const CATALOG = {
  drinks: [
    ['Cola 500ml', 199],
    ['Iced Coffee', 249],
    ['Sparkling Water', 129],
    ['Volt Energy', 299],
    ['Milk 1L', 189],
    ['Peach Tea', 179],
  ],
  snacks: [
    ['Choco Bar', 129],
    ['Salt Chips', 179],
    ['Gummy Worms', 149],
    ['Rice Crackers', 219],
    ['Peanut Brittle', 109],
    ['Cheese Puffs', 199],
  ],
  noodles: [
    ['Cup Noodles', 99],
    ['Ramen 5-pack', 349],
    ['Onigiri', 179],
    ['Microwave Burrito', 249],
    ['Frozen Dumplings', 429],
  ],
  household: [
    ['AA Batteries', 499],
    ['Toilet Paper 4pk', 399],
    ['Toothpaste', 279],
    ['Dish Soap', 229],
    ['Umbrella', 699],
  ],
  coffee: [
    ['Coffee (large)', 149],
    ['Coffee (small)', 99],
  ],
};
const BEER = ['Lager 6-pack', 849];
const HOTDOG = ['Hot Dog', 199];

const MANAGER_LINES = [
  "Shelves won't stock themselves.",
  "If that spill's still there in five minutes, it's coming out of your check.",
  "Nine dollars an hour doesn't pay for standing around.",
  "Don't sell beer to kids. I mean it. The fine comes out of YOUR pay.",
  "You're doing fine. Don't let it go to your head.",
  "The hot dogs have been rolling since Tuesday. Don't eat the hot dogs.",
  "If anyone asks, the bathroom is out of order. It's always out of order.",
];

// Calendar for ID checks: day 1 is Monday 4 October 2004.
const DAY_ONE = Date.UTC(2004, 9, 4);
const fmtDate = (ms) => {
  const d = new Date(ms);
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}/${d.getUTCFullYear()}`;
};
export const money = (c) => `${c < 0 ? '-' : ''}$${(Math.abs(c) / 100).toFixed(2)}`;

export class StoreJob {
  constructor({ store, crowd, ui, audio, state, clock, player }) {
    this.store = store;
    this.crowd = crowd;
    this.ui = ui;
    this.audio = audio;
    this.state = state;
    this.clock = clock;
    this.player = player;
    this.rng = new Rng(Date.now() & 0xffff);
    state.job ??= { hired: false, shift: null, earned: 0, shifts: 0 };
    this.J = state.job;
    this.carry = null;
    this.work = null;
    this.spill = null;
    this.spawnT = 6;
    this.warned = false;
    this.L = (x, z) => store.w(x, z);
    const L = this.L;

    // where customers stand to browse, and which aisle gets them there
    this.spots = [
      { cat: 'drinks', p: L(1.55, 6.0), yaw: -Math.PI / 2, aisle: 1.55 },
      { cat: 'drinks', p: L(1.55, 8.8), yaw: -Math.PI / 2, aisle: 1.55 },
      { cat: 'snacks', p: L(1.6, 7.4), yaw: Math.PI / 2, aisle: 1.55 },
      { cat: 'snacks', p: L(3.8, 6.6), yaw: -Math.PI / 2, aisle: 3.8 },
      { cat: 'noodles', p: L(3.8, 8.6), yaw: Math.PI / 2, aisle: 3.8 },
      { cat: 'noodles', p: L(6.2, 6.6), yaw: -Math.PI / 2, aisle: 6.2 },
      { cat: 'snacks', p: L(6.2, 8.6), yaw: Math.PI / 2, aisle: 6.2 },
      { cat: 'household', p: L(8.6, 7.6), yaw: -Math.PI / 2, aisle: 8.9 },
      { cat: 'household', p: L(2.4, 4.95), yaw: Math.PI, aisle: 3.8, back: true },
      { cat: 'noodles', p: L(7.4, 4.95), yaw: Math.PI, aisle: 6.2, back: true },
      { cat: 'coffee', p: L(11.3, 4.95), yaw: Math.PI, aisle: 8.9, back: true },
    ];
    this.queueSpots = [7.6, 8.45, 9.3, 10.15].map((z) => L(10.05, z));
    this.queue = [];
    this.FRONT_Z = 10.8;

    // the manager, and a small pool of shoppers
    this.manager = this.makeActor({
      skin: '#d39b74',
      hair: '#9a9590',
      hairStyle: 2,
      top: '#c8b48a',
      topStyle: 2,
      jacket: '#6a4a6a',
      bottom: '#2b2b30',
      bottomStyle: 0,
      shoes: '#1e1e22',
      height: 0.95,
      build: 1.08,
    });
    this.manager.name = 'Mrs. Varga';
    this.placeManager(!!this.J.shift);
    this.customers = [];
    for (let k = 0; k < 4; k++) {
      const a = this.makeActor(randomAppearance(this.rng));
      a.state = 'gone';
      a.c.visible = false;
      this.customers.push(a);
    }
    if (this.J.shift) this.wearUniform(true);
  }

  makeActor(app) {
    const c = this.crowd.add(app);
    return { c, pos: new THREE.Vector3(), path: [], yaw: 0, speed: 1.35, phase: 0, moving: false };
  }

  placeManager(onShift) {
    const m = this.manager;
    m.path = [];
    if (onShift) {
      m.pos.copy(this.store.officeSpot);
      m.yaw = Math.PI / 2;
    } else {
      m.pos.copy(this.store.registerSpot);
      m.yaw = -Math.PI / 2;
    }
    m.home = onShift ? 'office' : 'counter';
  }

  walkManager(toOffice) {
    const L = this.L;
    const counterToOffice = [L(12.0, 5.6), L(8.9, 5.0), L(4.5, 5.0), L(4.5, 3.5), L(7.6, 3.5), L(7.6, 2.05), L(9.6, 2.05), this.store.officeSpot];
    const m = this.manager;
    m.path = toOffice ? counterToOffice : [...counterToOffice].reverse().slice(1).concat([this.store.registerSpot]);
    m.home = toOffice ? 'office' : 'counter';
    m.speed = 1.2;
  }

  // ----------------------------------------------------------------- actors
  step(a, dt) {
    a.moving = false;
    if (a.wait > 0) a.wait -= dt;
    else if (a.path.length) {
      const t = a.path[0];
      const dx = t.x - a.pos.x;
      const dz = t.z - a.pos.z;
      const d = Math.hypot(dx, dz);
      const s = a.speed * dt;
      if (d <= s) {
        a.pos.x = t.x;
        a.pos.z = t.z;
        a.path.shift();
      } else {
        a.pos.x += (dx / d) * s;
        a.pos.z += (dz / d) * s;
        a.yaw = angleLerp(a.yaw, Math.atan2(dx, dz), 1 - Math.exp(-9 * dt));
        a.moving = true;
      }
    } else if (a.face !== undefined) a.yaw = angleLerp(a.yaw, a.face, 1 - Math.exp(-6 * dt));
    if (a.moving) a.phase += (a.speed / 1.5) * Math.PI * 2 * dt;
    const c = a.c;
    c.x = a.pos.x;
    c.z = a.pos.z;
    c.y = this.store.origin.y;
    c.ground = this.store.origin.y;
    c.yaw = a.yaw;
    c.phase = a.phase;
    c.amount = a.moving ? 1 : damp(c.amount, 0, 8, dt);
    c.run = 0;
  }

  spawnCustomer() {
    const a = this.customers.find((x) => x.state === 'gone');
    if (!a) return;
    const rng = this.rng;
    this.crowd.setAppearance(a.c.id, randomAppearance(rng));
    a.name = `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
    a.spot = rng.pick(this.spots.filter((s) => !this.customers.some((o) => o !== a && o.spot === s && o.state !== 'gone')));
    if (!a.spot) return;
    const side = rng.sign();
    const walkZ = this.store.outsideSpot.z + 0.3;
    a.pos.set(this.store.outsideSpot.x + side * rng.float(16, 24), this.store.origin.y, walkZ);
    a.speed = rng.float(1.2, 1.5);
    a.path = [new THREE.Vector3(this.store.outsideSpot.x + side * 1.5, 0, walkZ), this.store.outsideSpot, this.store.insideSpot, ...this.toSpot(a.spot)];
    a.state = 'arrive';
    a.items = [];
    a.face = undefined;
    a.c.visible = true;
    a.c.talk = 0;
  }

  toSpot(s) {
    const L = this.L;
    const oz = this.store.origin.z;
    return s.back ? [L(s.aisle, this.FRONT_Z), L(s.aisle, 5.0), s.p] : [L(s.aisle, this.FRONT_Z), L(s.aisle, s.p.z - oz), s.p];
  }

  fromSpotToQueue(a, qi) {
    const L = this.L;
    const s = a.spot;
    const pts = [];
    if (s.back) {
      pts.push(L(s.aisle, 5.0));
      if (s.aisle !== 8.9) {
        pts.push(L(s.aisle, this.FRONT_Z));
        pts.push(L(8.9, this.FRONT_Z));
      }
    } else if (s.aisle !== 8.9) {
      pts.push(L(s.aisle, s.p.z - this.store.origin.z));
      pts.push(L(s.aisle, this.FRONT_Z));
      pts.push(L(8.9, this.FRONT_Z));
    }
    pts.push(L(8.9, this.queueSpots[qi].z - this.store.origin.z));
    pts.push(this.queueSpots[qi]);
    return pts;
  }

  leave(a, angry = false) {
    const L = this.L;
    this.queue = this.queue.filter((x) => x !== a);
    const out = this.store.outsideSpot;
    const side = this.rng.sign();
    a.path = [L(8.9, a.pos.z - this.store.origin.z), L(8.9, this.FRONT_Z), this.store.insideSpot, out, new THREE.Vector3(out.x + side * 1.5, 0, out.z + 0.3), new THREE.Vector3(out.x + side * 22, 0, out.z + 0.3)];
    a.state = 'leave';
    a.face = undefined;
    a.angry = angry;
    a.c.talk = 0;
    this.reflowQueue();
  }

  reflowQueue() {
    this.queue.forEach((q, i) => {
      if (q.state === 'queue') {
        q.path = [this.queueSpots[Math.min(i, this.queueSpots.length - 1)].clone()];
        q.face = i === 0 ? Math.PI / 2 : Math.PI;
        if (i === 0 && q.state === 'queue') q.patience = Math.max(q.patience ?? 0, 50);
      }
    });
  }

  makeBasket(a) {
    const rng = this.rng;
    const cat = a.spot.cat;
    const items = [];
    if (cat === 'coffee') items.push(rng.pick(CATALOG.coffee));
    else {
      const want = rng.int(1, 3);
      // shoppers rummage: each item bought clears a couple of facings from the shelf
      const got = Math.ceil(this.store.take(cat, a.spot.p, want * 3) / 3);
      for (let k = 0; k < got; k++) items.push(rng.pick(CATALOG[cat]));
      if (got === 0) return null;
      if (cat === 'drinks' && rng.chance(0.3)) {
        items.push(BEER);
        a.minor = rng.chance(0.35);
      }
    }
    if (rng.chance(0.15)) items.push(HOTDOG);
    if (rng.chance(0.15) && cat !== 'coffee') items.push(rng.pick(CATALOG.coffee));
    // the ID they'd show if asked
    const today = DAY_ONE + (this.clock.day - 1) * 86400000;
    const years = a.minor ? rng.int(16, 20) : rng.int(21, 64);
    const dob = today - years * 365.25 * 86400000 - rng.int(10, 330) * 86400000;
    a.id = { name: a.name.toUpperCase(), dob: fmtDate(dob), minor: a.minor };
    return items;
  }

  // ----------------------------------------------------------------- update
  update(dt, time, ctx) {
    const J = this.J;
    const st = this.store;
    const playerFar = ctx.playerPos.distanceTo(st.doorCenter) > 80;

    // spawn shoppers (more of them while you're on shift; none when nobody's around)
    if (!playerFar) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        this.spawnT = J.shift ? this.rng.float(14, 30) : this.rng.float(25, 55);
        this.spawnCustomer();
      }
    }

    for (const a of this.customers) {
      if (a.state === 'gone') continue;
      this.step(a, dt);
      if (a.state === 'arrive' && !a.path.length) {
        a.state = 'browse';
        a.face = a.spot.yaw;
        a.wait = this.rng.float(3, 7);
        a.c.work = true;
      } else if (a.state === 'browse' && a.wait <= 0) {
        a.c.work = false;
        a.items = this.makeBasket(a);
        if (!a.items) {
          if (J.shift) this.dock(100, `a customer couldn't find any ${a.spot.cat}`, true);
          this.leave(a, true);
          continue;
        }
        if (J.shift && !this.spill && a.spot.cat !== 'coffee' && this.rng.chance(0.14)) {
          this.spill = a.spot.p.clone().add(new THREE.Vector3(this.rng.float(-0.3, 0.3), 0, this.rng.float(-0.4, 0.4)));
          if (a.spot.yaw === Math.PI) this.spill.z += 0.4;
          this.spillT = 0;
          st.showSpill(this.spill);
          this.ui.toast('Crash! Something just spilled in an aisle.');
        }
        this.queue.push(a);
        const qi = Math.min(this.queue.length - 1, this.queueSpots.length - 1);
        a.path = this.fromSpotToQueue(a, qi);
        a.state = 'toQueue';
        a.face = qi === 0 ? Math.PI / 2 : Math.PI;
        a.patience = 55;
      } else if (a.state === 'toQueue' && !a.path.length) {
        a.state = 'queue';
        this.reflowQueue();
      } else if (a.state === 'queue') {
        const front = this.queue[0] === a;
        if (front && !a.path.length) {
          a.face = Math.PI / 2;
          if (!J.shift && this.manager.home === 'counter' && !this.manager.path.length) {
            // off the clock, the manager serves them
            a.serveT = (a.serveT ?? 3.5) - dt;
            this.manager.c.talk = 1;
            if (a.serveT <= 0) {
              this.audio.beep?.();
              this.manager.c.talk = 0;
              a.serveT = undefined;
              st.trash = Math.min(1.2, st.trash + 0.04);
              this.leave(a);
            }
          } else if (!this.serving || this.serving !== a) {
            a.patience -= dt;
            a.c.talk = a.patience < 15 ? 1 : 0;
            if (a.patience <= 0) {
              this.dock(200, 'a customer gave up waiting and left', true);
              this.leave(a, true);
            }
          }
        }
      } else if (a.state === 'leave' && !a.path.length) {
        a.state = 'gone';
        a.c.visible = false;
        a.c.work = false;
        a.c.talk = 0;
      }
    }

    // manager
    const m = this.manager;
    m.face = m.home === 'counter' ? -Math.PI / 2 : Math.PI / 2;
    this.step(m, dt);

    // spill gets worse for your pay if ignored
    if (this.spill) {
      this.spillT += dt;
      if (J.shift && this.spillT > 150 && !this.spillDocked) {
        this.spillDocked = true;
        this.dock(200, 'nobody mopped the spill', true);
      }
    }
    if (st.trash >= 1 && J.shift && !this.trashNoted) {
      this.trashNoted = true;
      this.ui.toast('The trash can is full. Take it out to the dumpster.');
    }

    // timed work (restocking, mopping...)
    const p = this.player;
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
    const carried = { case: st.carryCase, mop: st.carryMop, bag: st.carryBag };
    for (const [k, mesh] of Object.entries(carried)) mesh.visible = this.carry?.type === k;
    st.mopRest.visible = this.carry?.type !== 'mop';
    p.char.carry = !!this.carry && !this.work;
    p.slow = this.carry ? 0.8 : 1;
    if (this.carry) {
      const mesh = carried[this.carry.type];
      const fx = Math.sin(p.yaw);
      const fz = Math.cos(p.yaw);
      const h = p.char.app.height;
      const fwd = this.carry.type === 'case' ? 0.42 : this.carry.type === 'bag' ? 0.36 : 0.38;
      const up = this.carry.type === 'case' ? 1.0 : this.carry.type === 'bag' ? 0.82 : 0.95;
      mesh.position.set(p.pos.x + fx * fwd, p.pos.y + up * h, p.pos.z + fz * fwd);
      mesh.rotation.set(this.carry.type === 'mop' ? 0.5 : 0, p.yaw, 0);
    }

    // wandering off the job
    if (J.shift) {
      const d = ctx.playerPos.distanceTo(st.doorCenter);
      if (d > 45 && !this.warned) {
        this.warned = true;
        this.ui.toast("You're on the clock! Get back to the store.");
      }
      if (d < 30) this.warned = false;
      if (d > 95) this.clockOut(true);
      this.updateHUD();
    }
  }

  dock(cents, why, toast = false) {
    const s = this.J.shift;
    if (!s) return;
    s.docked += cents;
    s.notes.push(`${why} (${money(-cents)})`);
    if (toast) this.ui.toast(`Docked ${money(cents)}: ${why}.`);
  }

  updateHUD() {
    const s = this.J.shift;
    const mins = this.clock.minutes - s.start;
    const pay = Math.floor((mins / 60) * WAGE_CENTS) + s.tips - s.docked;
    const tasks = [];
    const waiting = this.queue.filter((q) => q.state === 'queue').length;
    if (waiting) tasks.push(`${waiting} customer${waiting > 1 ? 's' : ''} at the register`);
    for (const cat of ['drinks', 'snacks', 'noodles', 'household']) if (this.store.stockLevel(cat) < 0.45) tasks.push(`${cat} running low`);
    if (this.spill) tasks.push('spill in an aisle');
    if (this.store.trash >= 1) tasks.push('trash is full');
    this.ui.setShift(`ON SHIFT · ${Math.floor(mins / 60)}h ${String(Math.floor(mins % 60)).padStart(2, '0')}m · ${money(pay)}`, tasks);
  }

  // ----------------------------------------------------------------- uniform
  wearUniform(on) {
    const app = this.state.appearance;
    this.crowd.setAppearance(this.player.char.id, on ? { ...app, wear: null, topStyle: 2, top: '#f2f0ea', jacket: '#2e6a46' } : app);
  }

  clockIn() {
    const busy = this.blocked?.();
    if (busy) return this.ui.toast(`You're already working a shift at ${busy}.`);
    this.J.shift = { start: this.clock.minutes, served: 0, stocked: 0, mopped: 0, trash: 0, tips: 0, docked: 0, notes: [], ids: 0 };
    this.wearUniform(true);
    this.audio.punch?.();
    this.walkManager(true);
    this.spawnT = 4;
    this.ui.toast('Clocked in. $9.00 an hour. Vest on.');
    this.ui.hint('Serve customers at the register, restock from the stockroom, mop spills, take out the trash. Clock out here when you are done.', 10);
  }

  clockOut(walkedOff = false) {
    const s = this.J.shift;
    if (!s) return;
    if (walkedOff) this.dock(500, 'walked off the job');
    const mins = Math.max(0, this.clock.minutes - s.start);
    const wage = Math.floor((mins / 60) * WAGE_CENTS);
    const total = Math.max(0, wage + s.tips - s.docked);
    this.state.bank += total / 100;
    this.state.ledger?.push({ t: Math.round(this.clock.minutes), what: 'HALCYON 24 wages', amt: total / 100 });
    this.J.earned += total;
    this.J.shifts++;
    this.J.shift = null;
    this.carry = null;
    this.wearUniform(false);
    this.audio.punch?.();
    this.ui.setShift(null);
    this.walkManager(false);
    const verdict =
      s.docked > wage / 2
        ? 'Mrs. Varga: "We need to talk about your performance."'
        : s.served >= 8
          ? 'Mrs. Varga: "Not bad. Not good, but not bad."'
          : mins < 30
            ? 'Mrs. Varga: "That was barely a shift."'
            : 'Mrs. Varga: "See you next time. Wipe your feet."';
    const line = (a, b) => `${a.padEnd(18, '.')} ${b}`;
    const text = [
      line('Time worked', `${Math.floor(mins / 60)}h ${String(Math.floor(mins % 60)).padStart(2, '0')}m`),
      line('Wage @ $9.00/hr', money(wage)),
      line('Customers served', String(s.served)),
      line('Cases stocked', String(s.stocked)),
      line('Spills mopped', String(s.mopped)),
      line('Trash runs', String(s.trash)),
      line('Tips', money(s.tips)),
      line('Docked', money(-s.docked)),
      ...s.notes.slice(-4).map((n) => `  - ${n}`),
      line('Paid to bank', money(total)),
      '',
      walkedOff ? 'You walked off the job. Clocked out automatically.' : verdict,
    ].join('\n');
    this.player.locked = true;
    this.ui.openDialog({
      name: 'HALCYON 24 · SHIFT SLIP',
      text,
      choices: [{ label: 'Pocket the slip', fn: () => this.ui.closeDialog() }],
      onClose: () => (this.player.locked = false),
    });
  }

  // ----------------------------------------------------------------- talk
  talkManager() {
    const ui = this.ui;
    const p = this.player;
    p.locked = true;
    const close = () => (p.locked = false);
    const m = this.manager;
    m.c.talk = 1;
    const done = () => {
      m.c.talk = 0;
      close();
    };
    if (!this.J.hired) {
      const menu = () => [
        {
          label: "I'll take it",
          fn: () => {
            this.J.hired = true;
            this.store.helpWanted.visible = false;
            ui.openDialog({
              name: m.name,
              text: "Good. Time clock's in the back, through the STAFF ONLY door. Punch in, put the vest on, and the register is yours. Count the change twice. Card readers lie.",
              choices: [{ label: 'Got it', fn: () => ui.closeDialog() }],
              onClose: done,
            });
          },
        },
        {
          label: "What's the work?",
          fn: () =>
            ui.openDialog({
              name: m.name,
              text: 'Ring people up. Check ID for beer: twenty-one or no sale. Keep the shelves full; stock is in the back. Mop what gets spilled. Take the trash out to the dumpster. Nine an hour, paid when you clock out.',
              choices: menu(),
              onClose: done,
            }),
        },
        { label: 'Never mind', fn: () => ui.closeDialog() },
      ];
      ui.openDialog({
        name: m.name,
        text: "You here about the sign? Night clerk. Nine dollars an hour, no benefits, free day-old hot dogs. We're open twenty-four hours, so you work when you want, as long as you work.",
        choices: menu(),
        onClose: done,
      });
      return;
    }
    const text = this.J.shift ? this.rng.pick(MANAGER_LINES) : "Shift starts when you punch in. Time clock's in the back.";
    ui.openDialog({ name: m.name, text, choices: [{ label: 'OK', fn: () => ui.closeDialog() }], onClose: done });
  }

  // ----------------------------------------------------------------- register
  serve(a) {
    const ui = this.ui;
    const p = this.player;
    this.serving = a;
    p.locked = true;
    const today = DAY_ONE + (this.clock.day - 1) * 86400000;
    const cutoff = new Date(today);
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 21);
    const total = a.items.reduce((s, it) => s + it[1], 0);
    const rng = this.rng;
    const card = rng.chance(0.4);
    let paid = 0;
    if (!card) {
      const bills = [500, 1000, 2000, 5000].filter((b) => b >= total);
      paid = rng.chance(0.25) && bills.length > 1 ? bills[1] : bills[0];
    }
    a.c.talk = 1;
    ui.openRegister({
      customer: a.name,
      items: a.items.map(([name, price]) => ({ name, price, id: name === BEER[0] })),
      card,
      paid,
      today: fmtDate(today),
      cutoff: fmtDate(cutoff.getTime()),
      idCard: a.id,
      onScan: () => this.audio.beep?.(),
      onDrawer: () => this.audio.drawer?.(),
      onDone: (r) => {
        const s = this.J.shift;
        a.c.talk = 0;
        if (s) {
          s.served++;
          if (r.soldBeerTo === 'minor') this.dock(5000, 'sold beer to a minor (store fine)', true);
          if (r.refused === 'adult') s.notes.push('refused beer to an adult (they were not happy)');
          if (r.refused === 'minor') s.ids++;
          if (!r.card) {
            const diff = r.given - r.due;
            if (diff > 0) this.dock(diff, `gave ${money(diff)} too much change`);
            else if (diff < 0) s.notes.push(`short-changed a customer by ${money(-diff)}`);
            if (diff === 0 && rng.chance(0.18)) {
              const tip = rng.pick([25, 50, 100]);
              s.tips += tip;
              ui.toast(`"Keep the change." +${money(tip)} tip`);
            }
          }
        }
        this.store.trash = Math.min(1.2, this.store.trash + 0.12);
        this.serving = null;
        p.locked = false;
        this.leave(a, r.refused === 'adult' || (!r.card && r.given < r.due));
      },
      onClose: () => {
        a.c.talk = 0;
        this.serving = null;
        p.locked = false;
      },
    });
  }

  // ----------------------------------------------------------------- interactions
  startWork(label, dur, done) {
    this.player.locked = true;
    this.work = { label, dur, t: 0, done };
  }

  workLabel() {
    if (!this.work) return null;
    return `${this.work.label}… ${Math.floor((this.work.t / this.work.dur) * 100)}%`;
  }

  findInteraction(pp) {
    const st = this.store;
    const J = this.J;
    const near = (v, r) => Math.hypot(v.x - pp.x, v.z - pp.z) < r;
    if (Math.hypot(pp.x - st.doorCenter.x, pp.z - st.doorCenter.z) > 22) return null;
    if (this.work) return { label: this.workLabel(), act: () => {} };
    const m = this.manager;
    const s = J.shift;

    // register
    if (s && near(st.registerSpot, 1.1)) {
      const a = this.queue[0];
      if (a && a.state === 'queue' && !a.path.length) return { label: `Serve ${a.name.split(' ')[0]} at the register`, act: () => this.serve(a) };
    }
    // carrying a case: restock
    if (this.carry?.type === 'case' && st.emptyNear(this.carry.cat, pp))
      return {
        label: `Restock the ${this.carry.cat} (${this.carry.left} left in case)`,
        act: () =>
          this.startWork('Restocking', 2.4, () => {
            const n = st.restock(this.carry.cat, pp, this.carry.left);
            this.carry.left -= n;
            this.audio.tone?.(600, 'triangle', 0.03, 0.08);
            if (this.carry.left <= 0) {
              this.carry = null;
              if (s) s.stocked++;
              this.ui.toast('Case empty. You flatten the box.');
            }
          }),
      };
    // spill
    if (this.spill && near(this.spill, 1.3)) {
      if (this.carry?.type === 'mop')
        return {
          label: 'Mop up the spill',
          act: () =>
            this.startWork('Mopping', 3.2, () => {
              const pos = this.spill.clone();
              this.spill = null;
              this.spillDocked = false;
              st.showSpill(null);
              st.showWetSign(pos);
              setTimeout(() => st.showWetSign(null), 25000);
              if (s) s.mopped++;
            }),
        };
      return { label: 'Spill (get the mop from the stockroom)', act: () => this.ui.toast('The mop lives in the stockroom, by the bucket.') };
    }
    // trash
    if (st.trash >= 1 && !this.carry && near(st.binSpot, 1.3))
      return {
        label: 'Take out the trash',
        act: () => {
          st.trash = 0.05;
          this.trashNoted = false;
          this.carry = { type: 'bag' };
        },
      };
    if (this.carry?.type === 'bag' && near(st.dumpsterSpot, 1.8))
      return {
        label: 'Toss the bag in the dumpster',
        act: () => {
          this.carry = null;
          this.audio.thud?.();
          if (s) s.trash++;
        },
      };
    // stockroom, mop, time clock
    for (const it of st.interactables) {
      if (!near(it, it.r)) continue;
      if (it.job === 'clock') {
        if (!J.hired) return { label: 'Time clock (staff only)', act: () => this.ui.toast('You need to be hired first. Talk to the manager.') };
        return s ? { label: 'Clock out', act: () => this.clockOut() } : { label: 'Clock in', act: () => this.clockIn() };
      }
      if (it.job === 'case') {
        if (!s) continue;
        if (this.carry?.type === 'case' && this.carry.cat === it.cat) return { label: 'Put the case back', act: () => (this.carry = null) };
        if (!this.carry) return { label: it.label, act: () => (this.carry = { type: 'case', cat: it.cat, left: CASE_SIZE }) };
      }
      if (it.job === 'mop') {
        if (this.carry?.type === 'mop') return { label: 'Put the mop back', act: () => (this.carry = null) };
        if (!this.carry && s) return { label: 'Take the mop', act: () => (this.carry = { type: 'mop' }) };
      }
    }
    // the manager
    if (near(m.pos, 1.9) && !m.path.length) return { label: J.hired ? `Talk to ${m.name}` : `Ask ${m.name} about the job`, act: () => this.talkManager() };
    return null;
  }

  /** Everyone who can open the sliding doors. */
  people(playerPos) {
    const out = [playerPos];
    for (const a of this.customers) if (a.state !== 'gone') out.push(a.pos);
    return out;
  }

  /** Keep the player from walking through shoppers and the manager. */
  push(pos, r) {
    for (const a of [this.manager, ...this.customers]) {
      if (a.state === 'gone') continue;
      const dx = pos.x - a.pos.x;
      const dz = pos.z - a.pos.z;
      const d = Math.hypot(dx, dz);
      const min = r + 0.28;
      if (d < min && d > 1e-4) {
        pos.x = a.pos.x + (dx / d) * min;
        pos.z = a.pos.z + (dz / d) * min;
      }
    }
  }
}
