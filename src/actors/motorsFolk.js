import { Rng, damp, angleLerp } from '../core/rng.js';
import { randomAppearance } from './appearance.js';

// People at CORSO MOTORS: Vic on the sales desk, Nico polishing whichever car looks
// dustiest, and a few browsers who wander in, stare at the Rift and leave again.
// Everyone walks in through the doors along the middle aisle; look spots are next to
// the cars, so a browser goes door -> aisle -> spot and back.

const WALK = 1.15;
const N = 4;
const AISLE_Z = 10.8; // local z of the cross aisle between the turntable and the front row

const VIC = (r) => ({ ...randomAppearance(r), skin: '#c89070', hair: '#2a1a12', hairStyle: 4, top: '#f2efe6', topStyle: 1, jacket: '#1a1a1e', bottom: '#1a1a1e', height: 1.02, wear: { top: 'basic:long', outer: 'basic:jacket', bottom: 'basic:pants', shoes: 'basic:shoes', watch: 'mv:meridian' } });
const NICO = (r) => ({ ...randomAppearance(r), hair: '#5a3a1a', hairStyle: 0, top: '#d8241c', topStyle: 0, bottom: '#2a2a3a', wear: { top: 'basic:tee', outer: null, bottom: 'basic:pants', shoes: 'basic:shoes', hat: null } });

export class MotorsFolk {
  constructor(crowd, motors) {
    this.crowd = crowd;
    this.M = motors;
    const rng = (this.rng = new Rng(1951));
    const mk = (app) => {
      const c = crowd.add(app);
      c.visible = false;
      return c;
    };
    this.vic = { name: 'Vic', c: mk(VIC(rng)), spot: motors.staffSpots.vic };
    this.nico = { name: 'Nico', c: mk(NICO(rng)), spot: motors.staffSpots.nico };
    this.pool = [];
    for (let k = 0; k < N; k++) this.pool.push({ k, c: mk(randomAppearance(rng)), mode: 'off', path: [], spot: null, t: rng.float(2, 30), visits: 0 });
    this.taken = new Set();
  }

  people() {
    const out = [];
    for (const a of [this.vic, this.nico, ...this.pool]) if (a.c.visible) out.push(a.c);
    return out;
  }

  /** Push a circle (the player) out of everyone standing here. */
  push(pos, r) {
    for (const c of this.people()) {
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const d = Math.hypot(dx, dz);
      const min = r + 0.28;
      if (d < min && d > 1e-4) {
        pos.x = c.x + (dx / d) * min;
        pos.z = c.z + (dz / d) * min;
      }
    }
  }

  place(c, s) {
    c.visible = true;
    c.x = s.x;
    c.z = s.z;
    c.yaw = s.yaw;
    c.ground = this.M.origin.y;
    c.y = c.ground;
    c.sit = false;
    c.amount = 0;
  }

  pathTo(from, spot) {
    const M = this.M;
    const a = M.local(from);
    const b = M.local(spot);
    const mid = (x) => {
      const v = M.w(x, AISLE_Z);
      return { x: v.x, z: v.z };
    };
    return [mid(a.x), mid(b.x), { x: spot.x, z: spot.z }];
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
    c.ground = this.M.origin.y;
    c.y = c.ground;
    return !a.path.length;
  }

  freeSpot() {
    const spots = this.M.lookSpots.filter((s) => !this.taken.has(s));
    return spots.length ? this.rng.pick(spots) : null;
  }

  /** hour: the game clock; far: the camera's a long way off (skip the walking). */
  update(dt, hour, time, playerPos, far) {
    const open = this.M.open;
    const M = this.M;
    // Vic: behind the desk while the showroom's open; turns to talk when you come over
    const v = this.vic;
    if (open && !v.c.visible) this.place(v.c, v.spot);
    if (!open) v.c.visible = false;
    if (v.c.visible) {
      const dx = playerPos.x - v.c.x;
      const dz = playerPos.z - v.c.z;
      const close = Math.hypot(dx, dz) < 4;
      v.c.yaw = angleLerp(v.c.yaw, close ? Math.atan2(dx, dz) : v.spot.yaw, Math.min(1, dt * 4));
      v.c.talk = v.talking ? 1 : 0;
      v.c.amount = damp(v.c.amount, 0, 6, dt);
    }
    // Nico polishes the Kestrel (in the work pose), in and out of the day
    const n = this.nico;
    const nicoIn = open && hour >= 10 && hour < 19;
    if (nicoIn && !n.c.visible) this.place(n.c, n.spot);
    if (!nicoIn) n.c.visible = false;
    if (n.c.visible) {
      n.c.work = Math.sin(time * 0.7) > -0.4;
      n.c.yaw = n.spot.yaw + Math.sin(time * 0.9) * 0.25;
    }
    // browsers
    const want = open ? (hour >= 11 && hour < 18 ? 3 : 2) : 0;
    let inside = this.pool.filter((a) => a.mode !== 'off').length;
    for (const a of this.pool) {
      const c = a.c;
      if (a.mode === 'off') {
        c.visible = false;
        if (inside < want && (a.t -= dt) <= 0) {
          const spot = this.freeSpot();
          if (!spot) continue;
          inside++;
          const door = M.w(15, M.D - 0.3);
          this.place(c, { x: door.x, z: door.z, yaw: Math.PI });
          this.taken.add(spot);
          a.spot = spot;
          a.path = this.pathTo(door, spot);
          a.mode = 'walk';
          a.visits = 0;
        }
        continue;
      }
      if (!open && a.mode !== 'out') this.leave(a);
      if (a.mode === 'walk' || a.mode === 'out') {
        if (this.walk(a, dt, far)) {
          if (a.mode === 'out') {
            a.mode = 'off';
            a.t = this.rng.float(10, 60);
            c.visible = false;
          } else {
            a.mode = 'look';
            a.t = this.rng.float(8, 22);
          }
        }
      } else if (a.mode === 'look') {
        c.amount = damp(c.amount, 0, 6, dt);
        c.yaw = angleLerp(c.yaw, a.spot.yaw, Math.min(1, dt * 4));
        c.headYaw = Math.sin(time * 0.4 + a.k) * 0.4;
        if ((a.t -= dt) <= 0) {
          a.visits++;
          const next = a.visits < 3 && this.rng.chance(0.7) ? this.freeSpot() : null;
          if (next) {
            this.taken.delete(a.spot);
            this.taken.add(next);
            a.path = this.pathTo(a.spot, next);
            a.spot = next;
            a.mode = 'walk';
          } else this.leave(a);
        }
      }
    }
  }

  leave(a) {
    const M = this.M;
    if (a.spot) this.taken.delete(a.spot);
    const from = a.spot ?? { x: a.c.x, z: a.c.z };
    a.spot = null;
    const door = M.w(15, M.D + 1.2);
    a.path = [...this.pathTo(from, { x: door.x, z: door.z }).slice(0, 2), M.w(15, M.D - 0.4), { x: door.x, z: door.z }];
    a.mode = 'out';
  }
}
