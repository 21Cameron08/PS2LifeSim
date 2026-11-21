import { Rng, damp, angleLerp } from '../core/rng.js';
import { randomAppearance } from './appearance.js';

// People at the HALCYON EXCHANGE: Walt behind the Ticker Bar, Priya at the property
// desk, Gus on the door, and a dozen brokers. While the market's open most of them
// are at the terminals or staring at the board; after the closing bell they move to
// the bar and the booths. Everyone walks in from the doors along the front aisle and
// out the same way; each spot has a short route from that aisle so nobody walks
// through a desk.

const AISLE = 12.6; // local z of the front aisle
const WALK = 1.25;
const N = 12;
const NAMES = ['Dana', 'Felix', 'Imogen', 'Raj', 'Tomas', 'Bea', 'Hollis', 'Wren', 'Otto', 'Saoirse', 'Lionel', 'Mags'];
const SUIT = ['#1e2330', '#2a2a2e', '#3a3a40', '#1a2a3a', '#4a3a2a', '#2a3a2a'];
const SHIRT = ['#f2efe6', '#d8e4f0', '#f0e4e4', '#e8e8e0'];

const suit = (rng) => {
  const a = randomAppearance(rng);
  return { ...a, wear: { top: 'basic:long', outer: rng.chance(0.75) ? 'basic:jacket' : null, bottom: 'basic:pants', shoes: 'basic:shoes', watch: rng.chance(0.4) ? 'mv:meridian' : null, glasses: rng.chance(0.15) ? 'mv:riviera' : null }, top: rng.pick(SHIRT), topStyle: 1, jacket: rng.pick(SUIT), bottom: rng.pick(SUIT), shoes: '#1a1410' };
};
const STAFF = {
  walt: { name: 'Walt', role: 'bar', look: (r) => ({ ...randomAppearance(r), hair: '#d8d4cc', hairStyle: 4, top: '#f2efe6', topStyle: 1, jacket: '#4a1a1a', bottom: '#1a1a1e', height: 0.97, wear: { top: 'basic:long', outer: 'basic:jacket', bottom: 'basic:pants', shoes: 'basic:shoes' } }) },
  priya: { name: 'Priya', role: 'agent', look: (r) => ({ ...randomAppearance(r), hair: '#1a1210', hairStyle: 1, top: '#e8e0d0', topStyle: 1, jacket: '#2a3a4a', bottom: '#2a3a4a', wear: { top: 'basic:long', outer: 'basic:jacket', bottom: 'basic:pants', shoes: 'basic:shoes', watch: 'mv:meridian' } }) },
  gus: { name: 'Gus', role: 'door', look: (r) => ({ ...randomAppearance(r), hairStyle: 4, build: 1.15, height: 1.05, top: '#e8e4dc', topStyle: 1, jacket: '#1a1a1e', bottom: '#1a1a1e', wear: { top: 'basic:long', outer: 'basic:jacket', bottom: 'basic:pants', shoes: 'basic:shoes', hat: null } }) },
};

export class Brokers {
  constructor(crowd, exchange) {
    this.crowd = crowd;
    this.X = exchange;
    const rng = (this.rng = new Rng(1921));
    const mk = (app) => {
      const c = crowd.add(app);
      c.visible = false;
      return c;
    };
    this.staff = {};
    for (const [key, def] of Object.entries(STAFF)) this.staff[key] = { key, name: def.name, role: def.role, c: mk(def.look(rng)), spot: exchange.staffSpots[key] };
    this.pool = [];
    for (let k = 0; k < N; k++) this.pool.push({ k, name: NAMES[k], c: mk(suit(rng)), mode: 'off', path: [], spot: null, t: 0 });
    this.spots = this.buildSpots();
    this.taken = new Set(); // spots in use (shared with the player's terminals and seats)
    this.time = 0;
    this.spawnT = 0;
  }

  /** Every place a broker can be, with a route in from the front aisle. */
  buildSpots() {
    const X = this.X;
    const L = (x, z) => {
      const v = X.w(x, z);
      return { x: v.x, z: v.z, y: X.origin.y };
    };
    const loc = (p) => X.local(p);
    const out = [];
    // a spot is the seat object itself (the player's seats share the "taken" set)
    const add = (role, seat, route, extra = {}) => out.push(Object.assign(seat, { role, route: route.map(([x, z]) => L(x, z)), ...extra }));
    // the terminals (two near the aisle are kept free for you)
    for (const t of X.terminals) {
      if (t.k === 5 || t.k === 6) continue;
      const s = loc(t.seat);
      const route = s.z > 10 ? [[s.x, AISLE]] : [[11, AISLE], [11, 8.45], [s.x, 8.45]];
      add('desk', t.seat, route, { sit: true, seatH: 0.5 });
    }
    for (const s of X.stools) add('bar', s, [[5.9, AISLE], [5.9, loc(s).z]], { sit: true });
    for (const s of X.booths) add('booth', s, [[4.3, AISLE], [4.3, loc(s).z]], { sit: true });
    for (const s of X.loungeSeats) {
      const l = loc(s);
      if (s.client) add('client', s, [[17.9, AISLE], [17.9, l.z]], { sit: true });
      else add('lounge', s, [[17.9, AISLE], [l.x + Math.sin(s.yaw) * 0.9, l.z + Math.cos(s.yaw) * 0.9]], { sit: true });
    }
    for (const s of X.standSpots) {
      const l = loc(s);
      const role = l.z < 6 ? 'board' : l.x < 7 ? 'bar' : 'chat';
      const route = l.z < 6 ? [[11, AISLE], [11, 5.2]] : l.x < 7 ? [[5.9, AISLE], [5.9, l.z]] : [];
      add(role, s, route, { sit: false });
    }
    return out;
  }

  /** How the room fills: how many people, and where they want to be. */
  schedule(hour, weekday) {
    const wk = !['SAT', 'SUN'].includes(weekday);
    if (hour < 8) return { n: 0, w: {} };
    if (wk && hour >= 9.5 && hour < 16) return { n: 11, w: { desk: 0.5, board: 0.16, bar: 0.1, chat: 0.12, client: 0.06, lounge: 0.06 } };
    if (wk && hour < 9.5) return { n: 7, w: { board: 0.3, bar: 0.35, desk: 0.2, chat: 0.15 } };
    if (hour < 20) return { n: wk ? 10 : 6, w: { bar: 0.42, booth: 0.22, chat: 0.16, lounge: 0.1, desk: 0.04, board: 0.06 } };
    return { n: wk ? 6 : 5, w: { bar: 0.5, booth: 0.3, chat: 0.1, lounge: 0.1 } };
  }

  pickSpot(w) {
    const free = this.spots.filter((s) => !this.taken.has(s) && w[s.role]);
    if (!free.length) return null;
    let total = 0;
    for (const s of free) total += w[s.role];
    let r = this.rng.next() * total;
    for (const s of free) if ((r -= w[s.role]) <= 0) return s;
    return free[free.length - 1];
  }

  place(c, x, z, y, yaw) {
    c.x = x;
    c.z = z;
    c.ground = y;
    c.y = y;
    if (yaw !== undefined) c.yaw = yaw;
  }

  /** Someone comes in (or, when nobody's watching, is simply already there). */
  spawn(a, w, instant) {
    const s = this.pickSpot(w);
    if (!s) return;
    this.taken.add(s);
    a.spot = s;
    a.t = this.rng.float(40, 120);
    const X = this.X;
    const door = X.w(11, X.D - 0.4);
    const aisleIn = X.w(11, AISLE);
    if (instant) return this.sitAt(a, s);
    this.place(a.c, door.x, door.z, X.origin.y, Math.PI);
    a.c.sit = false;
    a.path = [{ x: aisleIn.x, z: aisleIn.z }, ...this.aisleTo(s), ...s.route, { x: s.x, z: s.z }];
    a.mode = 'walk';
  }

  /** Along the front aisle to where a spot's route starts. */
  aisleTo(s) {
    const r = s.route[0] ?? s;
    const X = this.X;
    const p = X.w(X.local(r).x, AISLE);
    return [{ x: p.x, z: p.z }];
  }

  sitAt(a, s) {
    const c = a.c;
    a.mode = 'stay';
    a.path = [];
    c.visible = true;
    c.sit = s.sit;
    this.place(c, s.x, s.z, s.y, s.yaw);
    if (s.sit) c.y = s.y + (s.seatH ?? 0.5) - 0.86 * c.app.height;
    c.amount = 0;
  }

  /** Time to go somewhere else (or home). */
  move(a, w, leave) {
    const s = a.spot;
    const X = this.X;
    const back = [...s.route].reverse();
    a.c.sit = false;
    a.c.y = a.c.ground;
    this.taken.delete(s);
    a.spot = null;
    if (leave) {
      const door = X.w(11, X.D - 0.2);
      a.path = [...back, ...this.aisleBack(back[back.length - 1] ?? s), { x: X.w(11, AISLE).x, z: X.w(11, AISLE).z }, { x: door.x, z: door.z }];
      a.mode = 'out';
      return;
    }
    const n = this.pickSpot(w);
    if (!n) return this.move(a, w, true);
    this.taken.add(n);
    a.spot = n;
    a.t = this.rng.float(40, 140);
    a.path = [...back, ...this.aisleTo(n), ...n.route, { x: n.x, z: n.z }];
    a.mode = 'walk';
  }

  aisleBack(p) {
    const X = this.X;
    const q = X.w(X.local(p).x, AISLE);
    return [{ x: q.x, z: q.z }];
  }

  walk(a, dt, fast) {
    const c = a.c;
    const t = a.path[0];
    if (!t) return true;
    const dx = t.x - c.x;
    const dz = t.z - c.z;
    const d = Math.hypot(dx, dz);
    const step = (fast ? 80 : WALK) * dt;
    c.amount = damp(c.amount, 1, 6, dt);
    c.run = 0;
    if (d <= step || d < 1e-4) {
      c.x = t.x;
      c.z = t.z;
      a.path.shift();
    } else {
      c.x += (dx / d) * step;
      c.z += (dz / d) * step;
      c.yaw = angleLerp(c.yaw, Math.atan2(dx, dz), Math.min(1, dt * 10));
      c.phase += step * 2.7;
    }
    c.ground = this.X.origin.y;
    c.y = c.ground;
    return !a.path.length;
  }

  /** s: { hour, weekday, near, watched, playerPos } */
  update(dt, s) {
    this.time += dt;
    const show = s.near;
    const X = this.X;
    const open = X.open;
    // staff: on while the doors are open
    for (const st of Object.values(this.staff)) {
      const c = st.c;
      c.visible = show && open;
      if (!c.visible) continue;
      const sp = st.spot;
      if (!st.placed) {
        this.place(c, sp.x, sp.z, sp.y, sp.yaw);
        if (st.role === 'agent') {
          c.sit = true;
          c.y = sp.y + 0.5 - 0.86 * c.app.height;
        }
        st.placed = true;
      }
      c.amount = damp(c.amount, 0, 6, dt);
      const pp = s.playerPos;
      const close = Math.hypot(pp.x - c.x, pp.z - c.z) < 3.2;
      c.yaw = angleLerp(c.yaw, close || st.serving ? Math.atan2(pp.x - c.x, pp.z - c.z) : sp.yaw, Math.min(1, dt * 4));
      c.talk = !!st.serving || st.talking;
      c.work = !close && st.role === 'bar' && Math.sin(this.time * 0.5) > 0.4;
    }
    const { n, w } = open ? this.schedule(s.hour, s.weekday) : { n: 0, w: {} };
    // the room changes mood (the bell, the evening): people move on sooner
    const key = `${n}:${Object.keys(w).join()}`;
    if (key !== this.phaseKey) {
      this.phaseKey = key;
      for (const a of this.pool) if (a.mode === 'stay') a.t = Math.min(a.t, this.rng.float(3, 25));
    }
    const active = this.pool.filter((a) => a.mode !== 'off');
    // arriving (or warping in): the room is already busy
    if (show && !this.wasNear) for (const a of this.pool) if (a.mode === 'off' && this.pool.filter((p) => p.mode !== 'off').length < n) this.spawn(a, w, true);
    this.wasNear = show;
    if ((this.spawnT -= dt) <= 0) {
      this.spawnT = s.watched ? this.rng.float(4, 10) : 0.5;
      const off = this.pool.find((a) => a.mode === 'off');
      if (active.length < n && off) this.spawn(off, w, !s.watched);
      else if (active.length > n) {
        const a = active.find((p) => p.mode === 'stay');
        if (a) this.move(a, w, true);
      }
    }
    for (const a of this.pool) {
      const c = a.c;
      if (a.mode === 'off') {
        c.visible = false;
        continue;
      }
      c.visible = show;
      if (a.mode === 'walk' || a.mode === 'out') {
        if (this.walk(a, dt, !s.watched)) {
          if (a.mode === 'out') {
            a.mode = 'off';
            c.visible = false;
          } else this.sitAt(a, a.spot);
        }
        continue;
      }
      // staying put: typing, talking, looking up at the board
      const sp = a.spot;
      c.amount = damp(c.amount, 0, 6, dt);
      if (!sp.sit) c.yaw = angleLerp(c.yaw, sp.yaw, Math.min(1, dt * 3));
      const wave = Math.sin(this.time * 0.6 + a.k * 1.7);
      c.work = sp.role === 'desk' && wave > -0.3;
      c.talk = (sp.role === 'bar' || sp.role === 'booth' || sp.role === 'chat' || sp.role === 'client') && wave > 0.2;
      c.nod = sp.role === 'board' ? 0.2 : 0;
      c.headYaw = damp(c.headYaw, Math.sin(this.time * 0.3 + a.k) * 0.4, 2, dt);
      if ((a.t -= s.watched ? dt : dt * 20) <= 0 || !open) this.move(a, w, !open || this.rng.chance(0.25));
    }
  }

  /** Someone to talk to near p (staff count as a bit closer, they're behind desks). */
  nearest(p, r) {
    let best = null;
    let bd = r;
    for (const a of [...Object.values(this.staff), ...this.pool]) {
      const c = a.c;
      if (!c.visible || a.mode === 'walk' || a.mode === 'out') continue;
      const d = Math.hypot(c.x - p.x, c.z - p.z) - (a.role ? 0.6 : 0);
      if (d < bd) {
        bd = d;
        best = a;
      }
    }
    return best;
  }

  people() {
    return [...this.pool.filter((a) => a.mode !== 'off').map((a) => a.c), ...Object.values(this.staff).map((s) => s.c)];
  }
}
