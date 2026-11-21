import { Rng, damp, angleLerp } from '../core/rng.js';
import { randomAppearance } from './appearance.js';
import { npcWear } from '../game/fashion.js';

// People up at THE CROWN: Margaux by the lift, Remy behind the bar, DJ Lune for the
// sunset sessions, and at ORRERY Anouk on the door, Kenji at the pass and Theo
// running plates. Members drift between the loungers, the fire pits, the cabanas,
// the bar and the pool (where they stand about waist-deep, drinks held high);
// in the evening ORRERY's tables fill up. Everyone arrives from the lift and walks
// a small graph of deck waypoints so nobody walks through a sofa.

const WALK = 1.1;
const N = 14;
const DINERS = 8;

// deck waypoints (local x, z) and who's connected to whom
const NODES = {
  L: [20.2, 4.2], // out of the lift
  A: [17.0, 4.3], // by the DJ corner and the bar
  B: [17.1, 9.0], // the bar's south end
  C: [12.2, 8.3], // outside ORRERY, east
  O: [4.0, 8.2], // ORRERY's door
  M: [6.6, 8.3], // between the fire pits, north
  E: [6.6, 11.8], // between the fire pits, south (the aisle by the loungers)
  F: [1.1, 11.8], // the west end
  S: [1.1, 13.9], // the top of the pool steps
  G: [12.2, 11.9], // the aisle's east end
  K: [16.9, 13.8], // between the cabanas, by the pool
};
const EDGES = [
  ['L', 'A'],
  ['A', 'B'],
  ['A', 'C'],
  ['C', 'M'],
  ['C', 'G'],
  ['M', 'O'],
  ['M', 'E'],
  ['E', 'F'],
  ['E', 'G'],
  ['F', 'S'],
  ['G', 'K'],
  ['B', 'K'],
];

const STAFF = {
  host: { name: 'Margaux', look: (r) => ({ ...randomAppearance(r), hair: '#1a1210', hairStyle: 1, top: '#f2efe8', topStyle: 1, jacket: '#16140f', bottom: '#16140f', wear: { top: 'basic:long', outer: 'basic:jacket', bottom: 'basic:pants', shoes: 'basic:shoes', watch: 'mv:meridian' } }) },
  bar: { name: 'Remy', look: (r) => ({ ...randomAppearance(r), hairStyle: 4, top: '#f2efe8', topStyle: 1, jacket: '#3a1a1a', bottom: '#16140f', wear: { top: 'basic:long', outer: 'basic:jacket', bottom: 'basic:pants', shoes: 'basic:shoes' } }) },
  dj: { name: 'DJ Lune', look: (r) => ({ ...randomAppearance(r), hair: '#e8e4dc', hairStyle: 2, top: '#e8dcc0', topStyle: 0, bottom: '#2a2a3a', wear: { top: 'basic:tee', outer: null, bottom: 'basic:pants', shoes: 'basic:shoes', glasses: 'mv:riviera', chain: 'mv:cuban' } }) },
  maitre: { name: 'Anouk', look: (r) => ({ ...randomAppearance(r), hair: '#c8a070', hairStyle: 1, top: '#16140f', topStyle: 1, jacket: '#16140f', bottom: '#16140f', height: 1.02, wear: { top: 'basic:long', outer: 'basic:jacket', bottom: 'basic:pants', shoes: 'basic:shoes' } }) },
  chef: { name: 'Kenji', look: (r) => ({ ...randomAppearance(r), hairStyle: 4, top: '#f6f4ee', topStyle: 1, bottom: '#2a2a2e', wear: { top: 'basic:long', outer: null, bottom: 'basic:pants', shoes: 'basic:shoes' } }) },
  waiter: { name: 'Theo', look: (r) => ({ ...randomAppearance(r), hairStyle: 0, top: '#f2efe8', topStyle: 1, jacket: '#1a1a1e', bottom: '#1a1a1e', wear: { top: 'basic:long', outer: 'basic:jacket', bottom: 'basic:pants', shoes: 'basic:shoes' } }) },
};
const NAMES = ['Isadora', 'Laurent', 'Pim', 'Cosima', 'Hugo', 'Saskia', 'Ravi', 'Delphine', 'Magnus', 'Yara', 'Teddy', 'Odile', 'Bastian', 'Celia'];

export class CrownFolk {
  constructor(crowd, crown) {
    this.crowd = crowd;
    this.K = crown;
    const rng = (this.rng = new Rng(5858));
    const mk = (app) => {
      const c = crowd.add(app);
      c.visible = false;
      return c;
    };
    this.staff = {};
    for (const [key, def] of Object.entries(STAFF)) this.staff[key] = { key, name: def.name, c: mk(def.look(rng)), spot: crown.staffSpots[key] };
    const rich = (r) => {
      const a = randomAppearance(r);
      return { ...a, wear: npcWear(a, r, 1) };
    };
    this.pool = [];
    for (let k = 0; k < N; k++) this.pool.push({ k, name: NAMES[k], c: mk(rich(rng)), mode: 'off', path: [], spot: null, t: rng.float(1, 20) });
    this.diners = [];
    for (let k = 0; k < DINERS; k++) this.diners.push({ k, c: mk(rich(rng)), seat: null });
    this.taken = new Set(); // seats and spots in use (shared with the player's)
    this.waiter = { path: [], t: 0 };
    this.nodes = Object.fromEntries(Object.entries(NODES).map(([k, [x, z]]) => [k, crown.w(x, z)]));
    this.adj = {};
    for (const [a, b] of EDGES) {
      (this.adj[a] ??= []).push(b);
      (this.adj[b] ??= []).push(a);
    }
    // every place a member can be, with the waypoint it's reached from
    this.spots = [];
    const near = (p) => {
      let best = 'A';
      let bd = Infinity;
      for (const [k, q] of Object.entries(this.nodes)) {
        const d = Math.hypot(q.x - p.x, q.z - p.z);
        if (d < bd) {
          bd = d;
          best = k;
        }
      }
      return best;
    };
    for (const s of crown.seats) this.spots.push({ kind: s.kind, seat: s, node: s.kind === 'lounger' ? 'E' : s.kind === 'cabana' ? 'K' : s.kind === 'bar' ? 'B' : near(s.out), via: s.out });
    for (const s of crown.poolSpots) this.spots.push({ kind: 'pool', stand: s, node: 'S', via: crown.w(1.6, 15.0) });
    for (const s of crown.standSpots) this.spots.push({ kind: 'stand', stand: s, node: near(s) });
  }

  people() {
    const out = [];
    for (const a of [...Object.values(this.staff), ...this.pool, ...this.diners]) if (a.c.visible) out.push(a.c);
    return out;
  }

  /** Push a circle (the player) out of everyone standing up here. */
  push(pos, r) {
    for (const c of this.people()) {
      if (c.sit || Math.abs(c.ground - pos.y) > 0.8) continue;
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const d = Math.hypot(dx, dz);
      const min = r + 0.26;
      if (d < min && d > 1e-4) {
        pos.x = c.x + (dx / d) * min;
        pos.z = c.z + (dz / d) * min;
      }
    }
  }

  nearest(p, r) {
    let best = null;
    let bd = r;
    for (const a of [...Object.values(this.staff), ...this.pool]) {
      if (!a.c.visible) continue;
      const d = Math.hypot(a.c.x - p.x, a.c.z - p.z);
      if (d < bd && Math.abs(a.c.ground - p.y) < 1.2) {
        bd = d;
        best = a;
      }
    }
    return best;
  }

  /** Breadth-first path between two waypoints. */
  route(from, to) {
    const prev = { [from]: null };
    const q = [from];
    while (q.length) {
      const n = q.shift();
      if (n === to) break;
      for (const m of this.adj[n] ?? []) if (!(m in prev)) (prev[m] = n), q.push(m);
    }
    const out = [];
    for (let n = to; n; n = prev[n]) out.unshift(this.nodes[n]);
    return out.map((v) => ({ x: v.x, z: v.z }));
  }

  place(c, s, y) {
    c.visible = true;
    c.x = s.x;
    c.z = s.z;
    c.yaw = s.yaw ?? 0;
    c.ground = y ?? s.y ?? this.K.DECK;
    c.y = c.ground;
    c.sit = false;
    c.work = false;
    c.amount = 0;
  }

  seatPose(c, s) {
    c.x = s.x;
    c.z = s.z;
    c.yaw = s.yaw;
    c.sit = true;
    c.ground = s.y;
    c.y = s.y + s.seatH - 0.86 * (c.app?.height ?? 1);
    c.amount = 0;
  }

  walk(a, dt, fast) {
    const c = a.c;
    const t = a.path[0];
    if (!t) return true;
    const dx = t.x - c.x;
    const dz = t.z - c.z;
    const d = Math.hypot(dx, dz);
    const step = (fast ? 60 : WALK) * dt;
    c.amount = damp(c.amount, 1, 6, dt);
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
    c.ground = this.K.groundAt(c.x, c.z, this.K.DECK, this.K.DECK);
    c.y = c.ground;
    return !a.path.length;
  }

  pick(night) {
    const free = this.spots.filter((s) => !this.taken.has(s.seat ?? s.stand) && (night ? s.kind !== 'lounger' && s.kind !== 'pool' : s.kind !== 'pit'));
    if (!free.length) return null;
    // the pool and the loungers by day, the fire pits and the bar at night
    const w = (s) => ({ lounger: 3, pool: 2.5, cabana: 1, bar: night ? 3 : 1, pit: 3, stand: 1.5 })[s.kind];
    let sum = 0;
    for (const s of free) sum += w(s);
    let r = this.rng.next() * sum;
    for (const s of free) if ((r -= w(s)) <= 0) return s;
    return free[0];
  }

  /** s: { hour, time, far, playerPos, reserved (the player's table) } */
  update(dt, s) {
    const K = this.K;
    const h = s.hour;
    const open = K.open;
    const night = h >= 19 || h < 6;
    // staff
    const on = (key, yes) => {
      const a = this.staff[key];
      if (yes && !a.c.visible) this.place(a.c, a.spot);
      if (!yes) a.c.visible = false;
      return a.c.visible ? a : null;
    };
    const look = (a, base) => {
      if (!a) return;
      const dx = s.playerPos.x - a.c.x;
      const dz = s.playerPos.z - a.c.z;
      const close = Math.hypot(dx, dz) < 3.5 && Math.abs(s.playerPos.y - a.c.ground) < 1.5;
      a.c.yaw = angleLerp(a.c.yaw, close ? Math.atan2(dx, dz) : base, Math.min(1, dt * 4));
      a.c.talk = a.talking ? 1 : 0;
    };
    look(on('host', open), K.staffSpots.host.yaw);
    const bar = on('bar', open);
    if (bar) {
      bar.c.work = Math.sin(s.time * 0.5) > 0;
      look(bar, K.staffSpots.bar.yaw);
    }
    const dj = on('dj', open && h >= 18 && h < 22);
    if (dj) {
      dj.c.ground = K.DECK + 0.2;
      dj.c.y = dj.c.ground + Math.abs(Math.sin(s.time * 4.3)) * 0.04;
      dj.c.work = true;
      dj.c.headYaw = Math.sin(s.time * 2.15) * 0.3;
    }
    const din = h >= 18.5 && h < 23.5;
    look(on('maitre', din), K.staffSpots.maitre.yaw);
    const chef = on('chef', din);
    if (chef) chef.c.work = true;
    const waiter = on('waiter', din);
    if (waiter) this.runPlates(waiter, dt, s);
    // ORRERY diners: most tables taken through dinner, never yours
    const tablesFor = din ? Math.min(this.K.tables.length, 5) : 0;
    let slot = 0;
    for (const t of this.K.tables) {
      if (t.k === s.reserved) continue;
      for (const seat of t.seats) {
        const d = this.diners[slot];
        if (!d) break;
        const want = slot < tablesFor * 2 && !this.taken.has(seat);
        if (want) {
          d.seat = seat;
          d.c.visible = true;
          this.seatPose(d.c, seat);
          d.c.eat = Math.sin(s.time * 0.8 + slot * 1.3) > 0.2;
        } else if (d.seat === seat) {
          d.c.visible = false;
          d.seat = null;
        }
        slot++;
      }
    }
    for (; slot < this.diners.length; slot++) this.diners[slot].c.visible = false;
    // members
    const want = !open ? 0 : h >= 10 && h < 12 ? 6 : h >= 12 && h < 22 ? N : 9;
    let up = this.pool.filter((a) => a.mode !== 'off').length;
    for (const a of this.pool) {
      const c = a.c;
      if (a.mode === 'off') {
        c.visible = false;
        if (up < want && (a.t -= dt) <= 0) {
          const spot = this.pick(night);
          if (!spot) continue;
          up++;
          this.place(c, { ...K.liftArrive, y: K.DECK });
          this.claim(a, spot);
          a.path = this.pathTo('L', spot);
          a.mode = 'walk';
          // when nobody's looking, people are already where they're going
          if (s.far) this.arrive(a);
        }
        continue;
      }
      if ((!open || up > want + 1) && a.mode !== 'out') {
        this.leave(a);
        up--;
      }
      if (a.mode === 'walk' || a.mode === 'out') {
        if (this.walk(a, dt, s.far)) {
          if (a.mode === 'out') {
            a.mode = 'off';
            a.t = this.rng.float(20, 120);
            c.visible = false;
          } else this.arrive(a);
        }
      } else if (a.mode === 'stay') {
        const sp = a.spot;
        if (sp.seat) this.seatPose(c, sp.seat);
        else {
          c.amount = damp(c.amount, 0, 6, dt);
          c.yaw = angleLerp(c.yaw, sp.stand.yaw, Math.min(1, dt * 3));
          if (sp.kind === 'pool') c.y = sp.stand.y + Math.sin(s.time * 1.3 + a.k) * 0.03;
          c.talk = sp.kind === 'stand' && Math.sin(s.time * 0.6 + a.k * 2) > 0.3 ? 1 : 0;
        }
        if ((a.t -= dt) <= 0) {
          const next = this.rng.chance(0.55) ? this.pick(night) : null;
          if (next) {
            const from = this.release(a);
            this.claim(a, next);
            a.path = [...from, ...this.pathTo(a.lastNode ?? 'A', next).slice(1)];
            a.mode = 'walk';
            c.sit = false;
          } else this.leave(a);
        }
      }
    }
  }

  claim(a, spot) {
    a.spot = spot;
    this.taken.add(spot.seat ?? spot.stand);
    a.t = this.rng.float(40, 160);
  }

  /** Free the spot; returns the steps back out to its waypoint. */
  release(a) {
    const sp = a.spot;
    if (!sp) return [];
    this.taken.delete(sp.seat ?? sp.stand);
    a.spot = null;
    a.lastNode = sp.node;
    const back = [];
    if (sp.seat) back.push({ x: sp.seat.out.x, z: sp.seat.out.z });
    if (sp.seat?.approach) back.push({ ...sp.seat.approach });
    if (sp.via && !sp.seat) back.push({ x: sp.via.x, z: sp.via.z });
    if (sp.kind === 'pool') back.push({ x: this.nodes.S.x, z: this.nodes.S.z });
    back.push({ x: this.nodes[sp.node].x, z: this.nodes[sp.node].z });
    return back;
  }

  pathTo(fromNode, spot) {
    const p = this.route(fromNode, spot.node);
    if (spot.kind === 'pool') p.push({ x: spot.via.x, z: spot.via.z });
    else if (spot.seat) {
      if (spot.seat.approach) p.push({ ...spot.seat.approach });
      p.push({ x: spot.seat.out.x, z: spot.seat.out.z });
    }
    const end = spot.seat ?? spot.stand;
    p.push({ x: end.x, z: end.z });
    return p;
  }

  arrive(a) {
    const sp = a.spot;
    a.path = [];
    a.mode = 'stay';
    if (sp.seat) this.seatPose(a.c, sp.seat);
    else this.place(a.c, sp.stand, sp.stand.y);
  }

  leave(a) {
    const back = this.release(a);
    a.c.sit = false;
    a.path = [...back, ...this.route(a.lastNode ?? 'A', 'L').slice(1)];
    a.mode = 'out';
  }

  /** Theo: pass -> a table -> pass, all evening. */
  runPlates(w, dt, s) {
    const K = this.K;
    const c = w.c;
    const st = this.waiter;
    if (!st.path.length) {
      if ((st.t -= dt) > 0) {
        c.amount = damp(c.amount, 0, 6, dt);
        return;
      }
      const busy = this.diners.filter((d) => d.seat);
      const t = busy.length ? K.tables[busy[Math.floor(this.rng.next() * busy.length)].seat.table] : null;
      const home = K.waiterHome;
      if (t) st.path = [{ x: t.at.x + 0.75, z: t.at.z }, { x: home.x, z: home.z }];
      st.t = this.rng.float(3, 8);
      return;
    }
    const t = st.path[0];
    const dx = t.x - c.x;
    const dz = t.z - c.z;
    const d = Math.hypot(dx, dz);
    const step = (s.far ? 30 : 1.25) * dt;
    c.amount = damp(c.amount, 1, 6, dt);
    c.carry = true;
    if (d <= step) {
      c.x = t.x;
      c.z = t.z;
      st.path.shift();
    } else {
      c.x += (dx / d) * step;
      c.z += (dz / d) * step;
      c.yaw = angleLerp(c.yaw, Math.atan2(dx, dz), Math.min(1, dt * 10));
      c.phase += step * 2.7;
    }
  }
}
