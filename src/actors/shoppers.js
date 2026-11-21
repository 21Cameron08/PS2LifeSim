import { Rng, damp, angleLerp } from '../core/rng.js';
import { randomAppearance } from './appearance.js';
import { npcWear, BRANDS } from '../game/fashion.js';
import { slopeY, ESC } from '../world/galleria.js';

// People at the Halcyon Galleria: the staff (Dot at RACK & RUIN, Kez at SPLITGRAIN,
// Céleste and Anton at MAISON VELLARD, Pruitt the guard, Benny at the pretzel
// kiosk), the mannequins (wearing the real stock), and shoppers who wander both
// floors on a little graph of waypoints, ride the escalators, browse, sit, lean on
// the balcony, toss coins in the fountain and leave with shopping bags.
// When the camera is far away they walk at 80 m/s, so the place is busy when you arrive.

const POOL = 16;
const WALK = 1.15;
const BAGS = [BRANDS.thrift.bag, BRANDS.splitgrain.bag, BRANDS.vellard.bag, '#e86a2a', '#2f5d8a', '#f4f2ec'];
const MANNEQUIN = { skin: '#e8e4dc', hair: '#e8e4dc', hairStyle: 5, top: '#e8e4dc', topStyle: 0, jacket: '#e8e4dc', bottom: '#e8e4dc', bottomStyle: 0, shoes: '#e8e4dc', height: 1.02, build: 0.92 };

const staffLook = (rng, extra) => ({ ...randomAppearance(rng), ...extra });
const STAFF = {
  dot: { name: 'Dot', role: 'rr', look: (r) => staffLook(r, { hair: '#cfcac2', hairStyle: 2, top: '#6b4a8a', topStyle: 1, jacket: '#7a6a55', bottom: '#2b2b30', height: 0.94, wear: { top: 'basic:long', outer: 'rr:cord', bottom: 'rr:flares', shoes: 'rr:bowling', glasses: 'rr:aviators' } }) },
  kez: { name: 'Kez', role: 'sg', look: (r) => staffLook(r, { hairStyle: 4, wear: { top: 'sg:hoodie', outer: null, bottom: 'sg:cargob', shoes: 'sg:volt', hat: 'sg:cap', chain: 'sg:chain' } }) },
  celeste: { name: 'Céleste', role: 'mv', look: (r) => staffLook(r, { hair: '#1b1410', hairStyle: 1, height: 1.04, build: 0.92, wear: { top: 'mv:knit', outer: null, bottom: 'mv:trousers', shoes: 'mv:loafers', watch: 'mv:meridian' } }) },
  ines: { name: 'Ines', role: 'rs', look: (r) => staffLook(r, { hair: '#3a2418', hairStyle: 1, top: '#e8dcc8', topStyle: 1, bottom: '#3a3a40', height: 0.98, wear: { top: 'basic:long', outer: null, bottom: 'mv:trousers', shoes: 'basic:shoes', glasses: 'rr:aviators' } }) },
  anton: { name: 'Anton', role: 'door', look: (r) => staffLook(r, { hairStyle: 4, height: 1.07, build: 1.12, jacket: '#141418', top: '#e8e4dc', wear: { top: 'basic:long', outer: 'basic:jacket', bottom: 'mv:trousers', shoes: 'mv:loafers', glasses: 'sg:shades' } }) },
  guard: { name: 'Pruitt', role: 'guard', look: (r) => staffLook(r, { hairStyle: 4, top: '#3a4a6a', topStyle: 1, bottom: '#1f2e4a', jacket: '#1f2e4a', build: 1.15, wear: { top: 'basic:long', outer: null, bottom: 'basic:pants', shoes: 'basic:shoes', hat: 'rr:trucker' } }) },
  pretzel: { name: 'Benny', role: 'pretzel', look: (r) => staffLook(r, { top: '#7a3a1a', topStyle: 0, wear: { top: 'basic:tee', outer: null, bottom: 'basic:pants', shoes: 'basic:shoes', hat: 'rr:beanie' } }) },
};

export class Shoppers {
  constructor(crowd, galleria, city) {
    this.crowd = crowd;
    this.G = galleria;
    this.city = city;
    const rng = (this.rng = new Rng(2003));
    const mk = (app) => {
      const c = crowd.add(app);
      c.visible = false;
      return c;
    };
    this.staff = {};
    for (const [key, def] of Object.entries(STAFF)) this.staff[key] = { key, name: def.name, role: def.role, c: mk(def.look(rng)), spot: galleria.staffSpots[key] };
    this.mannequins = galleria.mannequins.map((m) => ({ m, c: mk({ ...MANNEQUIN, wear: { top: 'basic:tee', outer: null, bottom: 'basic:pants', shoes: 'basic:shoes', ...m.wear } }) }));
    this.pool = [];
    for (let k = 0; k < POOL; k++) this.pool.push({ c: mk(this.look()), mode: 'off', path: [], k, plan: [] });
    this.seatTaken = new Set();
    this.spawnT = 0;
    this.time = 0;
    this.watched = false;
    this.dropLine = []; // the Saturday sneaker drop: shoppers lined up outside SPLITGRAIN
    this.onBuy = null; // (shopper, shop) => {} when someone buys something
  }

  look() {
    const rng = this.rng;
    return npcWear(randomAppearance(rng), rng, rng.float(0.3, 1.0));
  }

  // ---------------------------------------------------------------- graph paths
  /** Waypoints from node a to node b (BFS), each { x, z, y, kind }. */
  route(a, b) {
    const N = this.G.graph.nodes;
    const prev = new Map([[a, null]]);
    const q = [a];
    while (q.length) {
      const n = q.shift();
      if (n === b) break;
      for (const l of N[n].links) if (!prev.has(l.to)) {
        prev.set(l.to, { from: n, kind: l.kind });
        q.push(l.to);
      }
    }
    if (!prev.has(b)) return [];
    const out = [];
    for (let n = b; n !== a; n = prev.get(n).from) out.unshift({ x: N[n].x, z: N[n].z, y: N[n].y, kind: prev.get(n).kind });
    return out;
  }

  /** A path from where c is to a target point (on the target's level). */
  pathTo(c, t) {
    const G = this.G;
    const from = G.nodeNear({ x: c.x, y: c.ground, z: c.z });
    const to = G.nodeNear(t);
    return [...this.route(from, to), { x: t.x, z: t.z, y: t.y ?? G.graph.nodes[to].y, kind: 'walk' }];
  }

  // ---------------------------------------------------------------- shoppers
  /** Somewhere to go next: a display, a bench, the balcony, the fountain, the kiosk. */
  pickDest(a) {
    const G = this.G;
    const rng = this.rng;
    const r = rng.next();
    if (r < 0.45) {
      const d = rng.pick(G.displays.filter((x) => x.shop !== 'mv' || rng.chance(0.4)));
      return { kind: 'browse', x: d.stand.x, z: d.stand.z, y: d.stand.y, yaw: d.yaw, shop: d.shop, t: rng.float(6, 16) };
    }
    if (r < 0.62) {
      const free = G.seats.filter((s) => s.mall && !this.seatTaken.has(s));
      if (free.length) {
        const s = rng.pick(free);
        return { kind: 'sit', seat: s, x: s.out.x, z: s.out.z, y: s.y, t: rng.float(15, 40) };
      }
    }
    if (r < 0.76) {
      const l = rng.pick(G.lookouts);
      return { kind: 'look', x: l.x, z: l.z, y: l.y, yaw: l.yaw, t: rng.float(6, 14) };
    }
    if (r < 0.86) {
      const f = G.fountain;
      const ang = rng.float(-1.2, 1.2) + Math.PI / 2;
      return { kind: 'coin', x: f.x + Math.cos(ang) * (f.r + 0.5), z: f.z + Math.sin(ang) * (f.r + 0.5), y: G.origin.y, face: { x: f.x, z: f.z }, t: rng.float(4, 8) };
    }
    if (r < 0.93) return { kind: 'kiosk', x: G.kiosk.stand.x + rng.float(-0.7, 0.7), z: G.kiosk.stand.z + rng.float(0, 0.4), y: G.origin.y, yaw: Math.PI, t: rng.float(5, 10) };
    const l = rng.pick(G.lookouts);
    return { kind: 'look', x: l.x, z: l.z, y: l.y, yaw: l.yaw, t: rng.float(5, 10) };
  }

  spawn(arrived) {
    const a = this.pool.find((p) => p.mode === 'off');
    if (!a) return;
    const G = this.G;
    const rng = this.rng;
    const c = a.c;
    this.crowd.setAppearance(c.id, this.look());
    c.bags = rng.chance(0.45) ? [rng.pick(BAGS), rng.chance(0.3) ? rng.pick(BAGS) : null] : null;
    c.visible = true;
    c.sit = false;
    c.work = false;
    c.talk = false;
    a.stops = rng.int(2, 5);
    if (arrived) {
      // already here: somewhere in the middle of their visit
      const d = this.pickDest(a);
      a.dest = d;
      this.place(c, d.x, d.z, d.y, d.yaw ?? 0);
      this.arrive(a);
      return;
    }
    const door = G.graph.nodes[G.graph.id.door];
    this.place(c, door.x + rng.float(-0.8, 0.8), G.doorCenter.z + 1.5, G.origin.y, Math.PI);
    a.path = [{ x: door.x, z: door.z, y: door.y, kind: 'walk' }];
    a.dest = this.pickDest(a);
    a.path.push(...this.pathTo({ x: door.x, z: door.z, ground: door.y }, a.dest));
    a.mode = 'walk';
  }

  place(c, x, z, y, yaw) {
    c.x = x;
    c.z = z;
    c.ground = y;
    c.y = y;
    if (yaw !== undefined) c.yaw = yaw;
  }

  arrive(a) {
    const d = a.dest;
    a.mode = 'linger';
    a.t = d.t;
    const c = a.c;
    if (d.kind === 'sit') {
      if (this.seatTaken.has(d.seat)) {
        a.t = 0;
        return;
      }
      this.seatTaken.add(d.seat);
      a.seat = d.seat;
      this.place(c, d.seat.x, d.seat.z, d.seat.y, d.seat.yaw);
      c.sit = true;
    }
    if (d.kind === 'browse' && this.rng.chance(0.25)) a.buy = d.shop;
  }

  leaveSeat(a) {
    const c = a.c;
    if (!a.seat) return;
    this.seatTaken.delete(a.seat);
    c.sit = false;
    this.place(c, a.seat.out.x, a.seat.out.z, a.seat.y);
    a.seat = null;
  }

  next(a) {
    this.leaveSeat(a);
    const c = a.c;
    c.work = false;
    if (a.buy) {
      // a bag from the shop they were looking at
      const bag = { rr: BRANDS.thrift.bag, sg: BRANDS.splitgrain.bag, mv: BRANDS.vellard.bag }[a.buy];
      c.bags = [bag, c.bags?.[0] ?? null];
      this.onBuy?.(a, a.buy);
      a.buy = null;
    }
    if (--a.stops <= 0 || !this.G.open) return this.leave(a);
    a.dest = this.pickDest(a);
    a.path = this.pathTo(c, a.dest);
    a.mode = 'walk';
  }

  leave(a) {
    this.leaveSeat(a);
    const G = this.G;
    const door = G.graph.nodes[G.graph.id.door];
    a.path = [...this.pathTo(a.c, { x: door.x, z: door.z, y: door.y }), { x: door.x, z: G.doorCenter.z + 2.2, y: G.origin.y, kind: 'walk' }, { x: door.x + this.rng.sign() * 6, z: G.site.z1 + 0.8, y: G.origin.y, kind: 'out' }];
    a.mode = 'out';
  }

  despawn(a) {
    this.leaveSeat(a);
    a.mode = 'off';
    a.path = [];
    a.c.visible = false;
    a.c.sit = false;
    a.c.bags = null;
    const i = this.dropLine.indexOf(a);
    if (i >= 0) this.dropLine.splice(i, 1);
  }

  /** Step along the path. Escalator legs ride at the steps' speed and follow the slope. */
  walk(a, dt) {
    const c = a.c;
    const t = a.path[0];
    if (!t) return true;
    const ride = t.kind === 'up' || t.kind === 'down';
    const speed = this.watched ? (ride ? ESC.speed : WALK) : 80;
    const dx = t.x - c.x;
    const dz = t.z - c.z;
    const d = Math.hypot(dx, dz);
    const step = speed * dt;
    c.amount = damp(c.amount, ride ? 0 : 1, 6, dt);
    c.run = 0;
    if (d <= step || d < 1e-4) {
      c.x = t.x;
      c.z = t.z;
      a.path.shift();
    } else {
      c.x += (dx / d) * step;
      c.z += (dz / d) * step;
      c.yaw = angleLerp(c.yaw, Math.atan2(dx, dz), Math.min(1, dt * 10));
      if (!ride) c.phase += step * 2.7;
    }
    if (ride) c.ground = this.G.origin.y + Math.min(4.6, slopeY(c.z - this.G.origin.z) + 0.035);
    else if (t.kind === 'out') c.ground = this.city.groundHeight(c.x, c.z);
    else c.ground = t.y ?? c.ground;
    c.y = c.ground;
    return a.path.length === 0;
  }

  update(dt, s) {
    this.time += dt;
    this.watched = s.watched;
    const G = this.G;
    const show = s.near;
    const open = G.open;
    // staff: on from just before opening to just after closing
    const staffOn = show && s.hour >= 9.75 && s.hour < 22.25;
    for (const st of Object.values(this.staff)) {
      const c = st.c;
      c.visible = staffOn;
      if (!c.visible) continue;
      const sp = st.spot;
      if (!st.placed) {
        this.place(c, sp.x, sp.z, sp.y, sp.yaw);
        st.placed = true;
      }
      c.amount = damp(c.amount, 0, 6, dt);
      const pp = s.playerPos;
      const close = Math.hypot(pp.x - c.x, pp.z - c.z) < 3.2 && Math.abs(pp.y - c.ground) < 1.5;
      const look = close || st.serving ? Math.atan2(pp.x - c.x, pp.z - c.z) : sp.yaw;
      c.yaw = angleLerp(c.yaw, look, Math.min(1, dt * 4));
      c.talk = !!st.serving || st.talking;
      c.work = !close && st.role !== 'door' && st.role !== 'guard' && Math.sin(this.time * 0.4 + sp.x) > 0.6;
    }
    // mannequins just stand there looking expensive
    for (const { m, c } of this.mannequins) {
      c.visible = show;
      if (!c.placed) {
        this.place(c, m.x, m.z, m.y, m.yaw);
        c.placed = true;
        c.amount = 0;
      }
    }
    // how busy: quiet mornings, a lunch bump, the after-work rush, busier at weekends
    const h = s.hour;
    let busy = h < 12 ? 0.35 : h < 14 ? 0.7 : h < 17 ? 0.6 : h < 20 ? 0.9 : 0.5;
    if (s.weekend) busy = Math.min(1, busy + 0.25);
    const want = open ? Math.round(POOL * busy) : 0;
    let active = this.pool.filter((a) => a.mode !== 'off').length;
    // arriving (or warping in): the place is already busy
    if (show && !this.wasNear && open) while (active < want && this.pool.some((p) => p.mode === 'off')) {
      this.spawn(true);
      active++;
    }
    this.wasNear = show;
    if ((this.spawnT -= dt) <= 0) {
      this.spawnT = this.watched ? this.rng.float(3, 8) : 0.2;
      if (active < want) this.spawn(!this.watched);
    }
    for (const a of this.pool) {
      if (a.mode === 'off') continue;
      const c = a.c;
      c.visible = show;
      switch (a.mode) {
        case 'walk':
          if (this.walk(a, dt)) this.arrive(a);
          break;
        case 'linger': {
          const d = a.dest;
          c.amount = damp(c.amount, 0, 6, dt);
          if (d.kind === 'coin') this.faceTo(c, d.face, dt);
          else if (d.yaw !== undefined && d.kind !== 'sit') c.yaw = angleLerp(c.yaw, d.yaw, Math.min(1, dt * 4));
          c.headYaw = damp(c.headYaw, Math.sin(this.time * 0.35 + a.k) * 0.5, 2, dt);
          c.work = d.kind === 'browse' && Math.sin(this.time * 0.9 + a.k) > 0.3;
          c.nod = d.kind === 'look' ? 0.25 : d.kind === 'browse' ? 0.15 : 0;
          if (!open && !this.watched) {
            this.despawn(a);
            break;
          }
          if ((a.t -= this.watched ? dt : dt * 20) <= 0 || !open) this.next(a);
          break;
        }
        case 'line':
          c.amount = damp(c.amount, 0, 6, dt);
          c.yaw = angleLerp(c.yaw, a.lineYaw ?? 0, Math.min(1, dt * 4));
          if (this.walk(a, dt)) c.amount = damp(c.amount, 0, 6, dt);
          break;
        case 'out':
          if (!this.watched || this.walk(a, dt)) this.despawn(a);
          break;
      }
    }
    this.updateDropLine(s);
  }

  faceTo(c, p, dt) {
    c.yaw = angleLerp(c.yaw, Math.atan2(p.x - c.x, p.z - c.z), Math.min(1, dt * 5));
  }

  // ---------------------------------------------------------------- the Saturday drop
  /** s.drop: { line: bool, spots: [{x,z,y}], served } (see game/shopping.js) */
  updateDropLine(s) {
    const D = s.drop;
    if (!D?.line) {
      for (const a of this.dropLine.splice(0)) if (a.mode === 'line') this.leave(a);
      return;
    }
    // fill the line up to its length
    while (this.dropLine.length < D.want) {
      const a = this.pool.find((p) => p.mode === 'off');
      if (!a) break;
      this.spawn(true);
      a.mode = 'line';
      this.dropLine.push(a);
      const k = this.dropLine.length - 1;
      const sp = D.spots[Math.min(k, D.spots.length - 1)];
      this.place(a.c, sp.x, sp.z, sp.y, sp.yaw);
      a.lineYaw = sp.yaw;
      a.path = [];
      a.c.sit = false;
    }
    // shuffle forward
    this.dropLine.forEach((a, k) => {
      const sp = D.spots[Math.min(k, D.spots.length - 1)];
      if (Math.hypot(a.c.x - sp.x, a.c.z - sp.z) > 0.1 && !a.path.length) a.path = [{ ...sp, kind: 'walk' }];
      a.lineYaw = sp.yaw;
    });
  }

  /** The front of the drop line goes in and buys a pair. */
  serveDrop() {
    const a = this.dropLine.shift();
    if (!a) return;
    a.c.bags = [BRANDS.splitgrain.bag, null];
    this.leave(a);
  }

  // ---------------------------------------------------------------- the player
  /** Keep the player from walking through people. */
  push(pos, r) {
    for (const a of [...this.pool, ...Object.values(this.staff)]) {
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

  /** Someone to talk to near p (staff count as a bit closer, they're behind counters). */
  nearest(p, r = 1.6) {
    let best = null;
    let bd = r;
    for (const a of [...Object.values(this.staff), ...this.pool]) {
      const c = a.c;
      if (!c.visible || a.mode === 'off' || Math.abs(c.ground - p.y) > 1.2) continue;
      const d = Math.hypot(c.x - p.x, c.z - p.z) - (a.role ? 0.6 : 0);
      if (d < bd) {
        bd = d;
        best = a;
      }
    }
    return best;
  }

  /** People who open the front doors. */
  people() {
    const out = [];
    for (const a of this.pool) if (a.c.visible && (a.mode === 'walk' || a.mode === 'out')) out.push(a.c);
    return out;
  }

  /** Everyone, for the status reactions: [{ c, name? }] */
  everyone() {
    return [...this.pool.filter((a) => a.mode !== 'off'), ...Object.values(this.staff)];
  }
}

