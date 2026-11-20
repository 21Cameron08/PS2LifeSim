import * as THREE from 'three';
import { GeoBuilder, shade, trs } from '../core/geo.js';
import { Rng, damp, angleLerp, clamp } from '../core/rng.js';
import { randomAppearance } from './appearance.js';
import { BRAND, LUNCH, makeWish, kitchenNeeds, sameOrder } from '../game/gullysMenu.js';

// Everyone at GULLY'S: the crew behind the counter and the customers. Customers
// walk in off the street, queue at a register, order, wait by the pickup end for
// their number, carry a tray to a table (or a bag out the door), eat, and leave.
// Most bin their own tray; Pip, the lobby attendant, clears the rest. The kitchen
// cooks in real time and Marco, the shift manager, puts orders up at the pass and
// calls the numbers on the NOW SERVING board.
//
// When nobody's watching (camera far away) people walk at 80 m/s and new
// customers can appear already sitting down, so the place is busy when you
// arrive instead of filling up in front of you.

const POOL = 26;
const WALK = 1.15;
const MAX_TRAYS = 40;
// customers in the building at each hour: breakfast, the lunch rush, dinner, the late crowd
const BUSY = [7, 4, 0, 0, 0, 0, 2, 5, 8, 7, 5, 8, 16, 18, 11, 6, 6, 9, 13, 14, 10, 7, 8, 9];
const TWO_REGISTERS = 9; // the second register opens when it's this busy

const xz = (v) => ({ x: v.x, z: v.z });
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _up = new THREE.Vector3(0, 1, 0);

// ---------------------------------------------------------------- trays and bags
function trayGeo(full) {
  const b = new GeoBuilder();
  const col = (c) => ({ color: shade(c) });
  b.box(-0.22, 0, -0.16, 0.22, 0.022, 0.16, { color: shade(BRAND.orange), bottom: true });
  b.box(-0.19, 0.022, -0.13, 0.19, 0.027, 0.13, col('#fff3dc')); // paper liner
  b.box(-0.05, 0.027, 0.06, 0.05, 0.032, 0.11, col(BRAND.teal)); // the logo on the liner
  if (full) {
    b.addGeometry(new THREE.CylinderGeometry(0.06, 0.055, 0.03, 10), trs(-0.08, 0.042, -0.03), shade('#d89a50'));
    b.addGeometry(new THREE.CylinderGeometry(0.064, 0.064, 0.018, 10), trs(-0.08, 0.066, -0.03), shade('#4a2a18'));
    b.addGeometry(new THREE.CylinderGeometry(0.068, 0.068, 0.006, 4), trs(-0.08, 0.078, -0.03, Math.PI / 4), shade('#f0c030'));
    b.addGeometry(new THREE.SphereGeometry(0.063, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.6, 1), trs(-0.08, 0.081, -0.03), shade('#e0a050'));
    b.box(0.03, 0.027, -0.11, 0.12, 0.12, -0.05, col('#d83a2a'));
    for (let k = 0; k < 6; k++) {
      const fx = 0.037 + (k % 3) * 0.027;
      const fz = -0.103 + Math.floor(k / 3) * 0.024;
      b.box(fx, 0.12, fz, fx + 0.012, 0.145 + (k % 2) * 0.025, fz + 0.012, col('#f0c848'));
    }
  } else {
    for (let k = 0; k < 3; k++) b.addGeometry(new THREE.IcosahedronGeometry(0.035, 0), trs(-0.12 + k * 0.07, 0.05, -0.05 + (k % 2) * 0.05, k), shade(k === 1 ? '#d83a2a' : '#f4ead6'));
  }
  b.addGeometry(new THREE.CylinderGeometry(0.045, 0.036, 0.15, 10), trs(0.1, 0.102, 0.07), shade('#f4f4f0'));
  b.addGeometry(new THREE.CylinderGeometry(0.049, 0.046, 0.04, 10), trs(0.1, 0.13, 0.07), shade(BRAND.teal));
  b.addGeometry(new THREE.CylinderGeometry(0.048, 0.048, 0.01, 10), trs(0.1, 0.182, 0.07), shade('#f4f4f0'));
  b.box(0.104, 0.187, 0.066, 0.112, 0.26, 0.074, col(BRAND.orange));
  return b.build();
}

function bagGeo() {
  const b = new GeoBuilder();
  b.box(-0.12, 0, -0.075, 0.12, 0.28, 0.075, { color: shade('#d8b888'), bottom: true });
  b.box(-0.126, 0.12, -0.081, 0.126, 0.17, 0.081, { color: shade(BRAND.orange) });
  b.box(-0.12, 0.28, -0.02, 0.12, 0.31, 0.02, { color: shade('#c8a878') });
  b.box(-0.05, 0.19, 0.075, 0.05, 0.25, 0.081, { color: shade(BRAND.teal) });
  return b.build();
}

export class Diners {
  constructor(crowd, gullys, city, scene) {
    this.crowd = crowd;
    this.G = gullys;
    this.city = city;
    const G = gullys;
    const rng = (this.rng = new Rng(1987));
    const mk = (app) => {
      const c = crowd.add(app);
      c.visible = false;
      return c;
    };
    const crew = (top, topStyle, extra = {}) => ({ ...randomAppearance(rng), top, topStyle, bottom: BRAND.navy, bottomStyle: 0, shoes: '#1e1e22', ...extra });
    this.cashiers = [0, 1].map((k) => ({ c: mk(crew(BRAND.teal, 0, k ? { hairStyle: 4 } : { hairStyle: 1 })), name: k ? 'Theo' : 'Jo', spot: G.cashierSpots[k], reg: k, role: 'cashier' }));
    this.cooks = ['grill', 'assembly', 'fry'].map((role) => ({ c: mk(crew(BRAND.teal, 1)), role, spot: G.crewSpots[role], turnAt: 0, turned: false }));
    this.expo = { c: mk(crew('#f4f4f0', 1, { hairStyle: 4, height: 1.03 })), name: 'Marco', role: 'manager', spot: G.crewSpots.expo, path: [], task: null };
    const lobbyHome = { ...xz(G.w(16.9, 7.7)), yaw: -Math.PI / 2 };
    this.lobby = { c: mk(crew(BRAND.orange, 0, { hairStyle: 2 })), name: 'Pip', role: 'lobby', path: [], task: null, t: 0, home: lobbyHome };
    this.crew = [...this.cashiers, ...this.cooks, this.expo, this.lobby];
    this.pool = [];
    for (let k = 0; k < POOL; k++) this.pool.push({ c: mk(randomAppearance(rng)), mode: 'off', path: [], k });
    this.queue = [[], []];
    this.hold = [false, false]; // the player is standing at (or ordering at) a register
    this.taken = new Set(); // seats someone is in or walking to
    this.waitTaken = new Set();
    this.orders = [];
    this.num = 100 + rng.int(0, 60);
    this.slots = G.pickSlots.map(() => ({ order: null }));
    this.trays = [];
    this.dirty = []; // trays left on tables
    this.arriveT = 0;
    this.time = 0;
    this.busy = 0;
    this.watched = false;
    this.onCall = null; // (order) => {}, when a number goes up on the board
    this.menuFn = () => LUNCH; // what's on the boards right now
    this.shift = null; // you're on the crew: { stock: { fry, grill }, short } (see game/crewJob.js)
    this.onCrew = null; // (event, customer, order) => {}: 'lost' (gave up on register 2), 'wrong' (wrong food)

    // which seats share a table (people prefer an empty table)
    this.seats = [...G.seats, ...G.patioSeats];
    this.tables = [];
    for (const sp of this.seats) {
      let t = this.tables.find((T) => T.some((q) => Math.hypot(q.tray.x - sp.tray.x, q.tray.z - sp.tray.z) < 1.0));
      if (!t) this.tables.push((t = []));
      t.push(sp);
      sp.table = t;
    }

    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const mesh = (geo) => {
      const m = new THREE.InstancedMesh(geo, mat, MAX_TRAYS);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
      scene.add(m);
      return m;
    };
    this.trayMesh = { full: mesh(trayGeo(true)), empty: mesh(trayGeo(false)), bag: mesh(bagGeo()) };
  }

  // ==========================================================================
  // helpers
  ground(x, z) {
    return this.G.contains({ x, y: 0, z }) ? this.G.origin.y : this.city.groundHeight(x, z);
  }

  place(c, x, z, yaw) {
    c.x = x;
    c.z = z;
    c.ground = this.ground(x, z);
    c.y = c.ground;
    if (yaw !== undefined) c.yaw = yaw;
  }

  /** Step towards t; true once there. */
  stepTo(c, t, dt, speed = this.speed) {
    const dx = t.x - c.x;
    const dz = t.z - c.z;
    const d = Math.hypot(dx, dz);
    const step = speed * dt;
    if (d < 1e-4) {
      c.amount = damp(c.amount, 0, 6, dt);
      return true;
    }
    c.amount = damp(c.amount, 1, 6, dt);
    c.run = 0;
    if (d <= step) {
      c.x = t.x;
      c.z = t.z;
    } else {
      c.x += (dx / d) * step;
      c.z += (dz / d) * step;
      c.yaw = angleLerp(c.yaw, Math.atan2(dx, dz), Math.min(1, dt * 10));
    }
    c.phase += Math.min(step, d) * 2.7;
    c.ground = this.ground(c.x, c.z);
    c.y = c.ground;
    return d <= step;
  }

  /** Walk along a.path; true when it's done. */
  walk(a, dt, speed) {
    const t = a.path[0];
    if (!t) return true;
    if (this.stepTo(a.c, t, dt, speed)) a.path.shift();
    return a.path.length === 0;
  }

  idle(c, dt) {
    c.amount = damp(c.amount, 0, 6, dt);
  }

  face(c, yaw, dt, rate = 6) {
    c.yaw = angleLerp(c.yaw, yaw, Math.min(1, dt * rate));
  }

  faceTo(c, p, dt, rate = 6) {
    this.face(c, Math.atan2(p.x - c.x, p.z - c.z), dt, rate);
  }

  inDining(p) {
    return this.G.contains({ x: p.x, y: this.G.origin.y, z: p.z }, -0.1);
  }

  /** From anywhere in the dining room (or out on the patio), the way to a seat. */
  pathToSeat(from, sp) {
    const G = this.G;
    const x = Math.min(from.x, G.w(16.7, 0).x); // keep clear of the side table by the drinks
    if (sp.patio) return [...(this.inDining(from) ? [G.aisle(x), xz(G.doorIn), xz(G.doorOut)] : []), ...sp.route];
    return [...(this.inDining(from) ? [G.aisle(x)] : [xz(G.doorOut), xz(G.doorIn)]), ...sp.route];
  }

  /** From a seat back to the aisle (or the patio walkway). */
  pathFromSeat(sp) {
    return sp.route.slice(0, -1).reverse();
  }

  exitPath(fromPatio) {
    const G = this.G;
    const rng = this.rng;
    const out = fromPatio ? [] : [xz(G.doorIn), xz(G.doorOut)];
    return [...out, { x: G.patioGate.x + rng.float(-0.6, 0.6), z: G.patioGate.z }, { x: G.street.x + rng.sign() * rng.float(3, 9), z: G.street.z + rng.float(-0.5, 0.5) }];
  }

  nearestBin(c) {
    let best = null;
    let bd = Infinity;
    for (const b of this.G.binSpots) {
      const d = Math.hypot(b.x - c.x, b.z - c.z);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    return xz(best);
  }

  freeSeats() {
    return this.seats.filter((sp) => !this.taken.has(sp) && !sp.dirty);
  }

  chooseSeat(patioOk) {
    const rng = this.rng;
    const free = this.freeSeats().filter((sp) => patioOk || !sp.patio);
    if (!free.length) return null;
    const empty = free.filter((sp) => sp.table.every((q) => !this.taken.has(q)));
    const list = empty.length && rng.chance(0.8) ? empty : free;
    const patio = list.filter((sp) => sp.patio);
    if (patioOk && patio.length && rng.chance(0.35)) return rng.pick(patio);
    const inside = list.filter((sp) => !sp.patio);
    return rng.pick(inside.length ? inside : list);
  }

  // ---------------------------------------------------------------- trays
  newTray(kind) {
    let t = this.trays.find((q) => q.state === 'off');
    if (!t) {
      if (this.trays.length >= MAX_TRAYS) return null;
      t = { state: 'off' };
      this.trays.push(t);
    }
    Object.assign(t, { kind, state: 'on', holder: null, x: 0, y: 0, z: 0, yaw: 0 });
    return t;
  }

  carry(t, c) {
    if (!t) return;
    t.holder = c;
    c.tray = t.kind !== 'bag';
  }

  putDown(t, x, y, z, yaw) {
    if (!t) return;
    if (t.holder) t.holder.tray = false;
    Object.assign(t, { holder: null, x, y, z, yaw });
  }

  onTable(t, sp) {
    if (t) this.putDown(t, sp.tray.x, sp.tray.y, sp.tray.z, sp.yaw);
  }

  drop(t) {
    if (!t) return;
    if (t.holder) t.holder.tray = false;
    t.holder = null;
    t.state = 'off';
  }

  renderTrays(show) {
    const n = { full: 0, empty: 0, bag: 0 };
    if (show) {
      for (const t of this.trays) {
        if (t.state === 'off') continue;
        let { x, y, z, yaw } = t;
        const c = t.holder;
        if (c) {
          if (!c.visible && c !== this.playerChar) continue;
          const h = c.app.height;
          const b = c.app.build;
          yaw = c.yaw;
          const sy = Math.sin(yaw);
          const cy = Math.cos(yaw);
          const bob = Math.abs(Math.sin(c.phase)) * 0.035 * c.amount;
          if (t.kind === 'bag') {
            x = c.x + cy * 0.31 * b + sy * 0.04;
            z = c.z - sy * 0.31 * b + cy * 0.04;
            y = c.y + 0.47 * h + bob;
          } else {
            x = c.x + sy * 0.36 * b;
            z = c.z + cy * 0.36 * b;
            y = c.y + 1.19 * h + bob;
          }
        }
        _q.setFromAxisAngle(_up, yaw);
        _m.compose(_p.set(x, y, z), _q, _s);
        this.trayMesh[t.kind].setMatrixAt(n[t.kind]++, _m);
      }
    }
    for (const k of ['full', 'empty', 'bag']) {
      const m = this.trayMesh[k];
      m.count = n[k];
      m.instanceMatrix.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------- orders
  placeOrder(owner, toGo, cook, items = null) {
    const o = { num: this.num, owner, toGo, state: 'cooking', readyAt: this.time + (cook ?? this.rng.float(12, 28)), slot: -1, tray: null, items: items ?? makeWish(this.menuFn(), this.rng).items, at: this.time };
    this.num = this.num >= 199 ? 100 : this.num + 1;
    this.orders.push(o);
    return o;
  }

  /** A to-go order bagged at the pass (by you, or by Marco if you leave it): its number goes up. */
  bagUp(o) {
    if (o.state !== 'bag') return;
    o.tray = this.newTray('bag');
    const P = this.G.pickSlots[o.slot].tray;
    this.putDown(o.tray, P.x, P.y, P.z, 0);
    o.state = 'ready';
    this.onCall?.(o);
  }

  /** Numbers up on the NOW SERVING board. */
  serving() {
    return this.orders.filter((o) => o.state === 'ready').map((o) => o.num);
  }

  /** Someone takes a ready order off the pass. */
  collect(o, c) {
    this.slots[o.slot].order = null;
    o.state = 'done';
    this.orders.splice(this.orders.indexOf(o), 1);
    this.carry(o.tray, c);
    return o.tray;
  }

  cancel(o) {
    if (o.slot >= 0 && this.slots[o.slot].order === o) this.slots[o.slot].order = null;
    if (o.tray) this.drop(o.tray);
    const i = this.orders.indexOf(o);
    if (i >= 0) this.orders.splice(i, 1);
    o.state = 'gone';
  }

  /** The spot a queue slot stands on (they run back towards the door if it's long). */
  slotSpot(r, k) {
    const Q = this.G.queues[r];
    if (k < Q.length) return Q[k];
    const last = Q[Q.length - 1];
    return { x: last.x, z: last.z + (k - Q.length + 1) * 0.75 };
  }

  /** The NPC at the front of a register's queue who's already ordering (or null). */
  ordering(r) {
    const a = this.queue[r][0];
    return a && a.ordering ? a : null;
  }

  registerOpen(r) {
    return this.open && (r === 0 || !!this.shift || this.busy >= TWO_REGISTERS || this.queue[1].length > 0);
  }

  /** Is there enough in the holding bins for this order? (Only matters when you're on the crew.) */
  stocked(o) {
    if (!this.shift) return true;
    const n = kitchenNeeds(o.items);
    const st = this.shift.stock;
    if (st.fry >= n.fry && st.grill >= n.grill) return true;
    this.shift.short = st.fry < n.fry ? 'fry' : 'grill';
    return false;
  }

  consume(o) {
    if (!this.shift) return;
    const n = kitchenNeeds(o.items);
    this.shift.stock.fry -= n.fry;
    this.shift.stock.grill -= n.grill;
  }

  /** The customer at register 2 (yours, on a shift) who's waiting to order, if any. */
  waitingAt(r) {
    const a = this.queue[r][0];
    return a && a.mode === 'queue' && a.wish && !a.path.length ? a : null;
  }

  /** You rang them up: their order goes to the kitchen with whatever you put on the ticket. */
  ringUp(a, ticket) {
    const i = this.queue[a.reg].indexOf(a);
    if (i >= 0) this.queue[a.reg].splice(i, 1);
    a.toGo = ticket.toGo;
    a.order = this.placeOrder(a, ticket.toGo, this.rng.float(5, 10), [...ticket.items]);
    a.order.wrong = !sameOrder(ticket, a.wish);
    a.order.wish = a.wish;
    a.wish = null;
    a.c.talk = false;
    this.goWait(a);
    return a.order;
  }

  goWait(a) {
    const G = this.G;
    const rng = this.rng;
    const free = G.waitSpots.filter((w) => !this.waitTaken.has(w));
    a.wait = free.length ? rng.pick(free) : null;
    if (a.wait) this.waitTaken.add(a.wait);
    const to = a.wait ?? { x: G.w(rng.float(12.6, 16), 0).x, z: G.w(0, rng.float(9.0, 9.5)).z, yaw: Math.PI };
    a.spot = to;
    a.path = [to];
    a.mode = 'toWait';
  }

  // ---------------------------------------------------------------- customers
  /** how: 'walk' in from the street, or (nobody watching) already 'seat'ed or 'wait'ing. */
  spawn(a, how = 'walk') {
    const G = this.G;
    const rng = this.rng;
    const c = a.c;
    Object.assign(a, { order: null, seat: null, tray: null, reg: -1, slot: -1, wait: null, ordering: false, path: [], t: 0 });
    c.sit = false;
    c.eat = 0;
    c.tray = false;
    c.talk = false;
    c.work = false;
    c.nod = 0;
    c.headYaw = 0;
    a.toGo = rng.chance(0.3);
    a.refill = rng.chance(0.3);
    a.chatty = rng.chance(0.4);
    if (how === 'seat' && !a.toGo) {
      const sp = this.chooseSeat(this.patioWeather);
      if (sp) {
        this.sitDown(a, sp);
        a.t = rng.float(8, a.total);
        if (a.t < a.total - a.eatFor) a.tray.kind = 'empty';
        return;
      }
    }
    if (how === 'wait') {
      const free = G.waitSpots.filter((w) => !this.waitTaken.has(w));
      if (free.length) {
        a.wait = a.spot = rng.pick(free);
        this.waitTaken.add(a.wait);
        a.order = this.placeOrder(a, a.toGo, rng.float(2, 18));
        this.place(c, a.wait.x, a.wait.z, a.wait.yaw);
        a.mode = 'wait';
        return;
      }
    }
    this.place(c, G.street.x + rng.sign() * rng.float(3, 9), G.street.z + rng.float(-0.5, 0.5), 0);
    a.mode = 'in';
    a.path = [{ x: G.patioGate.x + rng.float(-0.6, 0.6), z: G.patioGate.z }, xz(G.doorOut), xz(G.doorIn)];
    a.reg = this.registerOpen(1) && (this.shift ? this.queue[1].length <= this.queue[0].length : this.queue[1].length < this.queue[0].length) ? 1 : 0;
    this.queue[a.reg].push(a);
  }

  sitDown(a, sp) {
    const rng = this.rng;
    a.seat = sp;
    this.taken.add(sp);
    a.mode = 'sit';
    a.total = rng.float(45, 110);
    a.eatFor = a.total * rng.float(0.5, 0.75);
    a.t = a.total;
    if (!a.tray) a.tray = this.newTray('full');
    this.onTable(a.tray, sp);
    this.place(a.c, sp.x, sp.z, sp.yaw);
    a.c.sit = true;
  }

  despawn(a) {
    this.drop(a.tray);
    a.tray = null;
    if (a.seat) this.taken.delete(a.seat);
    if (a.wait) this.waitTaken.delete(a.wait);
    if (a.order) this.cancel(a.order);
    for (const Q of this.queue) {
      const i = Q.indexOf(a);
      if (i >= 0) Q.splice(i, 1);
    }
    Object.assign(a, { mode: 'off', seat: null, wait: null, order: null, ordering: false, path: [] });
    a.c.visible = false;
    a.c.sit = false;
    a.c.eat = 0;
    a.c.tray = false;
    a.c.talk = false;
  }

  leave(a, viaPatio = false) {
    if (a.wait) this.waitTaken.delete(a.wait);
    a.wait = null;
    a.mode = 'out';
    a.path = [...a.path, ...this.exitPath(viaPatio)];
  }

  updateCustomer(a, dt, s) {
    const G = this.G;
    const rng = this.rng;
    const c = a.c;
    switch (a.mode) {
      case 'in': {
        if (!this.open) {
          const i = this.queue[a.reg].indexOf(a);
          if (i >= 0) this.queue[a.reg].splice(i, 1);
          return this.leave(a);
        }
        if (this.walk(a, dt)) a.mode = 'queue';
        return;
      }
      case 'queue': {
        if (!this.open) {
          const i = this.queue[a.reg].indexOf(a);
          if (i >= 0) this.queue[a.reg].splice(i, 1);
          a.ordering = false;
          c.talk = false;
          return this.leave(a);
        }
        const there = this.stepTo(c, this.slotSpot(a.reg, a.slot), dt);
        if (!there) return;
        this.idle(c, dt);
        this.face(c, Math.PI, dt);
        if (a.slot !== 0) return;
        if (a.reg === 1 && this.shift) {
          // your register: they say what they want and wait for you to ring it up
          if (!a.wish) {
            a.wish = makeWish(this.menuFn(), rng);
            a.waitT = 0;
          }
          c.talk = Math.sin(this.time * 1.7 + a.k) > 0.7;
          if (!a.atPos && (a.waitT += dt) > 45) {
            // Jo waves them over to register 1
            this.queue[1].shift();
            a.reg = 0;
            this.queue[0].push(a);
            a.wish = null;
            c.talk = false;
            this.onCrew?.('lost', a);
          }
          return;
        }
        if (!a.ordering) {
          a.ordering = true;
          a.t = rng.float(3.5, 7);
        }
        c.talk = true;
        if ((a.t -= dt) > 0) return;
        // ordered: take a number and wait by the pickup end
        c.talk = false;
        a.ordering = false;
        this.queue[a.reg].shift();
        a.order = this.placeOrder(a, a.toGo);
        this.goWait(a);
        return;
      }
      case 'toWait':
        if (this.walk(a, dt)) a.mode = 'wait';
        return;
      case 'wait': {
        this.idle(c, dt);
        this.face(c, a.spot.yaw ?? Math.PI, dt, 3);
        c.headYaw = damp(c.headYaw, Math.sin(this.time * 0.3 + a.k) * 0.5, 2, dt);
        const o = a.order;
        if (o.state === 'ready') {
          if (a.wait) this.waitTaken.delete(a.wait);
          a.wait = null;
          a.path = [G.pickSlots[o.slot].stand];
          a.mode = 'toPick';
          c.headYaw = 0;
        } else if (!this.open && o.state === 'cooking') {
          this.cancel(o);
          a.order = null;
          this.leave(a);
        }
        return;
      }
      case 'toPick': {
        if (!this.walk(a, dt)) return;
        this.face(c, Math.PI, 1);
        const got = a.order;
        a.tray = this.collect(got, c);
        a.order = null;
        if (got.wrong && this.shift) {
          this.onCrew?.('wrong', a, got);
          return this.leave(a);
        }
        if (a.toGo || !this.open) return this.leave(a);
        if (a.refill && this.open) {
          a.path = [xz(G.w(16.7, 7.6)), xz(G.drinkSpot)];
          a.mode = 'toDrink';
          return;
        }
        return this.goSit(a);
      }
      case 'toDrink':
        if (this.walk(a, dt)) {
          a.mode = 'drink';
          a.t = rng.float(2, 4);
        }
        return;
      case 'drink':
        this.idle(c, dt);
        this.face(c, Math.PI / 2, dt);
        if ((a.t -= dt) <= 0) {
          a.path = [xz(G.w(16.7, 7.6))];
          this.goSit(a);
        }
        return;
      case 'toSeat':
        if (this.walk(a, dt)) this.sitDown(a, a.seat);
        return;
      case 'sit': {
        const sp = a.seat;
        c.x = sp.x;
        c.z = sp.z;
        c.yaw = sp.yaw;
        c.ground = sp.y;
        c.sit = true;
        c.y = sp.y + 0.5 - 0.86 * c.app.height;
        c.amount = 0;
        const eating = a.t > a.total - a.eatFor;
        c.eat = damp(c.eat || 0, eating ? 1 : 0, 3, dt);
        if (!eating && a.tray.kind === 'full') a.tray.kind = 'empty';
        c.talk = !eating && a.chatty && Math.sin(this.time * 0.35 + a.k * 1.7) > 0.4;
        c.headYaw = damp(c.headYaw, eating ? 0 : Math.sin(this.time * 0.2 + a.k) * 0.6, 2, dt);
        c.nod = eating ? 0.12 : damp(c.nod, 0, 3, dt);
        if (!this.open) a.t = Math.min(a.t, rng.float(0, 8));
        if ((a.t -= dt) > 0) return;
        // done: bin the tray (most people) or leave it for Pip
        c.sit = false;
        c.eat = 0;
        c.talk = false;
        c.nod = 0;
        c.headYaw = 0;
        this.taken.delete(sp);
        a.seat = null;
        this.place(c, sp.x, sp.z);
        a.path = this.pathFromSeat(sp);
        if (rng.chance(0.65)) {
          this.carry(a.tray, c);
          a.path.push(...(sp.patio ? [xz(G.doorOut), xz(G.doorIn)] : [G.aisle(c.x)]), this.nearestBin(sp.patio ? G.doorIn : c));
          a.mode = 'toBin';
        } else {
          sp.dirty = a.tray;
          this.dirty.push({ tray: a.tray, seat: sp });
          a.tray = null;
          this.leave(a, sp.patio);
        }
        return;
      }
      case 'toBin':
        if (!this.walk(a, dt)) return;
        this.drop(a.tray);
        a.tray = null;
        this.leave(a);
        return;
      case 'out':
        if (this.walk(a, dt)) this.despawn(a);
        return;
    }
  }

  goSit(a) {
    const sp = this.chooseSeat(this.patioWeather);
    if (!sp) {
      // nowhere to sit: bag it up and take it home
      a.tray.kind = 'bag';
      a.c.tray = false;
      return this.leave(a);
    }
    a.seat = sp;
    this.taken.add(sp);
    a.path = [...a.path, ...this.pathToSeat(a.path.length ? a.path[a.path.length - 1] : a.c, sp)];
    a.mode = 'toSeat';
  }

  // ---------------------------------------------------------------- crew
  updateCrew(dt, s) {
    const G = this.G;
    const rng = this.rng;
    const open = this.open;
    const show = s.near;
    const pp = s.playerPos;
    // cashiers: one register, two when it's busy
    for (const k of this.cashiers) {
      const c = k.c;
      c.visible = show && this.registerOpen(k.reg) && !(k.reg === 1 && this.shift);
      if (!c.visible) continue;
      this.place(c, k.spot.x, k.spot.z);
      this.idle(c, dt);
      const front = this.ordering(k.reg);
      const serving = s.serving === k.reg;
      c.work = !!front && Math.sin(this.time * 1.3 + k.reg) > 0.2;
      c.talk = serving || (!!front && Math.sin(this.time * 0.9) > 0);
      const look = serving || (Math.hypot(pp.x - c.x, pp.z - c.z) < 3 && !front) ? pp : front ? front.c : null;
      if (look) this.faceTo(c, look, dt, 4);
      else this.face(c, k.spot.yaw, dt, 3);
    }
    // cooks: the grill, the assembly line, the fryers
    for (const k of this.cooks) {
      const c = k.c;
      c.visible = show && (open || (k.role === 'grill' && s.cleaning)) && !(this.shift && (k.role === 'fry' || k.role === 'grill'));
      if (!c.visible) continue;
      this.place(c, k.spot.x, k.spot.z);
      this.idle(c, dt);
      c.work = true;
      if (k.role === 'assembly' && open && this.time > k.turnAt) {
        // turn round to grab patties off the grill now and then
        k.turned = !k.turned;
        k.turnAt = this.time + (k.turned ? rng.float(1.5, 3) : rng.float(4, 9));
      }
      this.face(c, k.turned ? Math.PI : k.spot.yaw, dt, 5);
      c.nod = k.role === 'fry' ? 0.15 + Math.sin(this.time * 0.7) * 0.1 : 0.1;
    }
    // Marco puts finished orders up at the pass and calls the numbers
    const E = this.expo;
    E.c.visible = show && open;
    if (!E.task && open) {
      if (this.shift) this.shift.short = null;
      const o = this.orders.find((q) => q.state === 'cooking' && this.time >= q.readyAt && this.stocked(q));
      const k = this.slots.findIndex((sl) => !sl.order);
      if (o && k >= 0) {
        this.consume(o);
        E.task = { o, k };
        this.slots[k].order = o;
        o.state = 'plating';
        E.path = [G.pickSlots[k].expo];
      }
    }
    if (!E.c.placed) {
      this.place(E.c, E.spot.x, E.spot.z, 0);
      E.c.placed = true;
    }
    if (E.task) {
      E.c.work = false;
      if (this.walk(E, dt, this.watched ? 1.5 : 80)) {
        const { o, k } = E.task;
        E.task = null;
        if (o.state === 'plating' && this.shift && o.toGo) {
          // to go: the food goes up on the pass for you to bag and call
          o.state = 'bag';
          o.slot = k;
          o.bagAt = this.time;
        } else if (o.state === 'plating') {
          o.tray = this.newTray(o.toGo ? 'bag' : 'full');
          const P = G.pickSlots[k].tray;
          this.putDown(o.tray, P.x, P.y, P.z, 0);
          o.state = 'ready';
          o.slot = k;
          this.onCall?.(o);
        } else this.slots[k].order = null;
        E.workT = 0.8;
        E.path = [E.spot];
      }
    } else if (E.path.length) {
      this.walk(E, dt, this.watched ? 1.5 : 80);
    } else {
      this.idle(E.c, dt);
      E.workT = (E.workT ?? 0) - dt;
      E.c.work = E.workT > 0;
      E.c.talk = Math.hypot(pp.x - E.c.x, pp.z - E.c.z) < 2.2 && s.talking === E;
      this.face(E.c, E.spot.yaw, dt, 4);
    }
    this.updateLobby(dt, s);
  }

  /** Pip: clears tables, wipes them down, fills the napkins; mops after closing. */
  updateLobby(dt, s) {
    const G = this.G;
    const rng = this.rng;
    const L = this.lobby;
    const c = L.c;
    c.visible = s.near && (this.open || s.cleaning);
    if (!c.placed) {
      this.place(c, L.home.x, L.home.z, L.home.yaw);
      c.placed = true;
    }
    if (!this.open && !s.cleaning) {
      L.task = null;
      L.path = [];
      c.work = false;
      c.tray = false;
      if (L.tray) this.drop(L.tray);
      L.tray = null;
      return;
    }
    const speed = this.watched ? (L.task?.kind === 'mop' ? 0.5 : 1.25) : 80;
    if (!L.task) {
      if (!this.open) {
        L.task = { kind: 'mop', t: rng.float(3, 6) };
        L.path = [xz(G.w(rng.float(1, 18.4), rng.float(7.3, 11.6)))];
      } else if (this.dirty.length) {
        const d = this.dirty.shift();
        L.task = { kind: 'clear', d };
        L.path = [...this.pathToSeat(c, d.seat).slice(0, -1)];
      } else {
        const r = rng.next();
        if (r < 0.4) {
          const free = this.freeSeats().filter((sp) => !sp.patio);
          const sp = free.length ? rng.pick(free) : null;
          if (sp) {
            L.task = { kind: 'wipe', t: rng.float(2, 4), at: sp.tray };
            L.path = this.pathToSeat(c, sp).slice(0, -1);
          }
        } else if (r < 0.55) {
          L.task = { kind: 'wipe', t: rng.float(3, 5), at: G.w(G.W, 5.0) };
          L.path = [G.aisle(Math.min(c.x, G.w(16.7, 0).x)), xz(G.w(16.7, 7.6)), xz(G.drinkSpot)];
        }
        if (!L.task) {
          L.task = { kind: 'stand', t: rng.float(4, 9) };
          L.path = [G.aisle(Math.min(c.x, L.home.x)), L.home];
        }
      }
    }
    const T = L.task;
    if (L.path.length) {
      c.work = T.kind === 'mop';
      this.walk(L, dt, speed);
      return;
    }
    this.idle(c, dt);
    if (T.kind === 'clear') {
      if (!T.picked) {
        this.faceTo(c, T.d.seat.tray, dt);
        c.work = true;
        T.t = (T.t ?? 1.4) - dt;
        if (T.t > 0) return;
        c.work = false;
        T.picked = true;
        T.d.seat.dirty = null;
        L.tray = T.d.tray;
        this.carry(L.tray, c);
        L.path = [...this.pathFromSeat(T.d.seat).slice(1), ...(T.d.seat.patio ? [xz(G.doorOut), xz(G.doorIn)] : [G.aisle(c.x)]), this.nearestBin(T.d.seat.patio ? G.doorIn : c)];
        return;
      }
      this.drop(L.tray);
      L.tray = null;
      L.task = null;
      return;
    }
    if (T.at) this.faceTo(c, T.at, dt);
    else if (T.kind === 'stand') {
      const pp = s.playerPos;
      if (Math.hypot(pp.x - c.x, pp.z - c.z) < 3) this.faceTo(c, pp, dt, 3);
      else this.face(c, L.home.yaw, dt, 3);
    }
    c.work = T.kind !== 'stand';
    c.talk = s.talking === L;
    if ((T.t -= dt) <= 0) L.task = null;
  }

  // ==========================================================================
  /**
   * s: { hour, open, time, playerPos, near (camera close enough to bother
   *      drawing anyone), watched (close enough that walking is worth seeing),
   *      cleaning (closed, crew still in), serving (register the player is
   *      ordering at, or -1), talking (who the player's talking to) }
   */
  update(dt, s) {
    const rng = this.rng;
    this.time = s.time;
    this.open = s.open;
    this.watched = s.watched;
    this.speed = s.watched ? WALK : 80;
    this.patioWeather = s.hour > 8.5 && s.hour < 20.5;
    const i = Math.floor(s.hour) % 24;
    const f = s.hour - Math.floor(s.hour);
    this.busy = BUSY[i] + (BUSY[(i + 1) % 24] - BUSY[i]) * f;
    const target = this.open ? Math.round(this.busy) : 0;

    // who's where in each queue (the player standing at a register counts as first)
    for (let r = 0; r < 2; r++) {
      const off = this.hold[r] && !this.ordering(r) ? 1 : 0;
      this.queue[r].forEach((a, k) => (a.slot = k + off));
    }

    // arrivals: just make it so when nobody's looking; otherwise one at a time
    const present = this.pool.filter((a) => a.mode !== 'off' && a.mode !== 'out' && a.mode !== 'toBin');
    const queued = this.queue[0].length + this.queue[1].length;
    if (present.length < target) {
      if (!this.watched) {
        while (present.length < target) {
          const a = this.pool.find((p) => p.mode === 'off');
          if (!a) break;
          const r = rng.next();
          this.spawn(a, r < 0.62 ? 'seat' : r < 0.8 ? 'wait' : 'walk');
          present.push(a);
        }
      } else if ((this.arriveT -= dt) <= 0 && queued < 9) {
        this.arriveT = rng.float(2, 6) * clamp(8 / Math.max(1, target), 0.5, 2.5);
        const a = this.pool.find((p) => p.mode === 'off');
        if (a) this.spawn(a);
      }
    }
    if (!this.watched) for (const d of this.dirty.splice(0)) this.clearDirty(d);

    this.updateCrew(dt, s);
    for (const a of this.pool) {
      if (a.mode === 'off') continue;
      a.c.visible = s.near;
      this.updateCustomer(a, dt, s);
    }
    this.renderTrays(s.near);
  }

  clearDirty(d) {
    d.seat.dirty = null;
    this.drop(d.tray);
  }

  /** People who open the front doors. */
  people() {
    const out = [];
    for (const a of this.pool) if (a.c.visible && (a.mode === 'in' || a.mode === 'out' || a.mode === 'toSeat' || a.mode === 'toBin')) out.push(a.c);
    if (this.lobby.c.visible && this.lobby.path.length) out.push(this.lobby.c);
    return out;
  }

  /** Keep the player from walking through people. */
  push(pos, r) {
    const list = [...this.pool, this.lobby];
    for (const a of list) {
      const c = a.c;
      if (!c.visible || c.sit) continue;
      if (Math.abs(c.ground - pos.y) > 0.6) continue;
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const rr = r + 0.24;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        pos.x = c.x + (dx / d) * rr;
        pos.z = c.z + (dz / d) * rr;
      }
    }
  }

  /** Someone to talk to near p: crew across the counter, or a customer. */
  nearest(p, r = 1.6) {
    let best = null;
    let bd = r;
    for (const a of [...this.crew, ...this.pool]) {
      const c = a.c;
      if (!c.visible) continue;
      // the counter's in the way: crew behind it count as a bit closer than they are
      const d = Math.hypot(c.x - p.x, c.z - p.z) - (a.role === 'cashier' || a.role === 'manager' ? 0.7 : 0);
      if (d < bd) {
        bd = d;
        best = a;
      }
    }
    return best;
  }

  /** You clocked out: Theo and the cooks take over again. */
  endShift() {
    this.shift = null;
    for (const o of this.orders) if (o.state === 'bag') this.bagUp(o);
    for (const Q of this.queue)
      for (const a of Q) {
        a.wish = null;
        a.atPos = false;
      }
  }

  /** Put the restaurant back as it is at hour h (after a jump in time). */
  reset() {
    for (const a of this.pool) if (a.mode !== 'off') this.despawn(a);
    for (const d of this.dirty.splice(0)) this.clearDirty(d);
    for (const o of [...this.orders]) if (o.owner !== 'player') this.cancel(o);
    this.queue = [[], []];
    for (const sp of this.seats) sp.dirty = null;
    this.taken.clear();
    this.waitTaken.clear();
    const E = this.expo;
    if (E.task) {
      if (E.task.o.state === 'plating') E.task.o.state = 'cooking';
      this.slots[E.task.k].order = null;
    }
    E.task = null;
    E.path = [];
    E.c.placed = false;
    this.lobby.task = null;
    this.lobby.path = [];
    if (this.lobby.tray) this.drop(this.lobby.tray);
    this.lobby.tray = null;
    for (const sl of this.slots) if (sl.order && sl.order.owner !== 'player') sl.order = null;
  }
}

