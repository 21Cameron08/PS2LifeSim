import * as THREE from 'three';
import { CITY } from '../config.js';
import { Rng, angleLerp, clamp, damp } from '../core/rng.js';
import { randomAppearance } from './appearance.js';
import { npcWear } from '../game/fashion.js';
import { FIRST_NAMES, LAST_NAMES, MOODS } from '../game/dialogue.js';

// Pedestrians walk loops around the sidewalk of a block and sometimes cross the
// road at a corner to the neighbouring block. Simple rules, but with 70+ people
// it reads as a living street.

// For each corner k of a block loop: [di, dj, corner index on the neighbour]
const CORNER_NEIGHBORS = [
  [
    [-1, 0, 1],
    [0, -1, 3],
  ],
  [
    [1, 0, 0],
    [0, -1, 2],
  ],
  [
    [1, 0, 3],
    [0, 1, 1],
  ],
  [
    [-1, 0, 2],
    [0, 1, 0],
  ],
];

export class Pedestrians {
  constructor(crowd, city, count = 72, seed = 4242) {
    this.crowd = crowd;
    this.city = city;
    this.rng = new Rng(seed);
    this.list = [];
    this.loops = city.blocks.map((b) => {
      const h = CITY.SIDEWALK / 2;
      const L = { b, x0: b.x0 + h, x1: b.x1 - h, z0: b.z0 + h, z1: b.z1 - h };
      L.w = L.x1 - L.x0;
      L.h = L.z1 - L.z0;
      L.P = 2 * (L.w + L.h);
      L.corners = [0, L.w, L.w + L.h, 2 * L.w + L.h];
      return L;
    });
    const rng = this.rng;
    for (let k = 0; k < count; k++) {
      const loop = rng.pick(this.loops);
      this.spawnWalker(loop, rng.float(0, loop.P));
    }
  }

  /** How likely a passer-by is to turn and look at you (your status; main.js sets it). */
  stare = 0;

  makeNpc(app) {
    const rng = this.rng;
    const c = this.crowd.add(app ?? npcWear(randomAppearance(rng), rng, Math.pow(rng.next(), 2)));
    const npc = {
      c,
      id: `npc${c.id}`,
      name: `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`,
      mood: rng.pick(MOODS),
      mode: 'walk',
      pos: new THREE.Vector3(),
      yaw: 0,
      phase: rng.float(0, 6),
      speed: rng.float(1.15, 1.7),
      curSpeed: 0,
      nightOwl: rng.chance(0.35),
      hidden: false,
      timer: 0,
      headT: rng.float(1, 5),
    };
    this.list.push(npc);
    return npc;
  }

  spawnWalker(loop, s) {
    const npc = this.makeNpc();
    npc.loop = loop;
    npc.s = s;
    npc.dir = this.rng.sign();
    npc.lane = this.rng.float(0.3, 0.85);
    const p = this.onLoop(loop, s, npc.dir, npc.lane);
    npc.pos.set(p.x, CITY.CURB, p.z);
    npc.yaw = Math.atan2(p.mx, p.mz);
    return npc;
  }

  /** A stationary NPC (loitering, chatting, a shopkeeper...). */
  addStander(x, z, yaw, app, extra = {}) {
    const npc = this.makeNpc(app);
    npc.mode = 'stand';
    npc.pos.set(x, this.city.groundHeight(x, z), z);
    npc.yaw = yaw;
    npc.homeYaw = yaw;
    npc.nightOwl = true;
    Object.assign(npc, extra);
    return npc;
  }

  onLoop(L, s, dir, lane) {
    s = ((s % L.P) + L.P) % L.P;
    let x;
    let z;
    let dx;
    let dz;
    if (s < L.w) {
      x = L.x0 + s;
      z = L.z0;
      dx = 1;
      dz = 0;
    } else if ((s -= L.w) < L.h) {
      x = L.x1;
      z = L.z0 + s;
      dx = 0;
      dz = 1;
    } else if ((s -= L.h) < L.w) {
      x = L.x1 - s;
      z = L.z1;
      dx = -1;
      dz = 0;
    } else {
      s -= L.w;
      x = L.x0;
      z = L.z1 - s;
      dx = 0;
      dz = -1;
    }
    const mx = dx * dir;
    const mz = dz * dir;
    // keep to the right of the direction of travel
    return { x: x - mz * lane, z: z + mx * lane, mx, mz };
  }

  edgeOf(L, s) {
    s = ((s % L.P) + L.P) % L.P;
    if (s < L.corners[1]) return 0;
    if (s < L.corners[2]) return 1;
    if (s < L.corners[3]) return 2;
    return 3;
  }

  tryCross(npc, corner) {
    const b = npc.loop.b;
    const opts = CORNER_NEIGHBORS[corner].filter(([di, dj]) => {
      const i = b.i + di;
      const j = b.j + dj;
      return i >= 0 && j >= 0 && i < CITY.N && j < CITY.N;
    });
    if (!opts.length) return false;
    const [di, dj, k] = this.rng.pick(opts);
    const target = this.loops[(b.j + dj) * CITY.N + (b.i + di)];
    // walk straight from where we are to where we'll start on the other side
    const newDir = this.rng.sign();
    const to = this.onLoop(target, target.corners[k], newDir, npc.lane);
    npc.mode = 'cross';
    npc.crossFrom = new THREE.Vector2(npc.pos.x, npc.pos.z);
    npc.crossTo = new THREE.Vector2(to.x, to.z);
    npc.nextDir = newDir;
    npc.crossT = 0;
    npc.crossLen = npc.crossFrom.distanceTo(npc.crossTo);
    npc.nextLoop = target;
    npc.nextS = target.corners[k];
    return true;
  }

  update(dt, playerPos, night) {
    const rng = this.rng;
    for (const npc of this.list) {
      const c = npc.c;
      const dxp = playerPos.x - npc.pos.x;
      const dzp = playerPos.z - npc.pos.z;
      const distP = Math.hypot(dxp, dzp);

      // most people go home at night; you only notice once you look back
      if (!npc.nightOwl && npc.mode !== 'talk') {
        if (!npc.hidden && night > 0.75 && distP > 55) npc.hidden = true;
        else if (npc.hidden && night < 0.5 && distP > 55) npc.hidden = false;
      }
      c.visible = !npc.hidden && distP < 190;
      if (npc.hidden) continue;

      let moving = false;
      let wantYaw = npc.yaw;
      c.talk = 0;
      if (npc.mode === 'talk') {
        wantYaw = Math.atan2(dxp, dzp);
        c.talk = npc.speaking ? 1 : 0;
      } else if (npc.mode === 'stand') {
        npc.headT -= dt;
        if (npc.headT < 0) {
          npc.headT = rng.float(2, 6);
          npc.headTarget = rng.float(-0.7, 0.7);
        }
        c.headYaw = damp(c.headYaw, npc.headTarget ?? 0, 3, dt);
        wantYaw = npc.homeYaw;
        if (distP < 3) wantYaw = Math.atan2(dxp, dzp);
        c.talk = npc.chatty ? (Math.sin(performance.now() * 0.0007 + c.id) > 0.2 ? 1 : 0) : 0;
      } else if (npc.mode === 'idle') {
        npc.timer -= dt;
        if (npc.timer <= 0) npc.mode = 'walk';
      } else {
        // walk / cross: yield to the player
        const ahead = npc.mode === 'walk' ? this.onLoop(npc.loop, npc.s, npc.dir, 0) : null;
        const fx = ahead ? ahead.mx : npc.crossTo.x - npc.crossFrom.x;
        const fz = ahead ? ahead.mz : npc.crossTo.y - npc.crossFrom.y;
        const blocked = distP < 1.3 && fx * dxp + fz * dzp > 0;
        npc.curSpeed = damp(npc.curSpeed, blocked ? 0 : npc.speed, 6, dt);
        const step = npc.curSpeed * dt;
        moving = npc.curSpeed > 0.15;
        if (npc.mode === 'walk') {
          const e0 = this.edgeOf(npc.loop, npc.s);
          const s1 = npc.s + npc.dir * step;
          const e1 = this.edgeOf(npc.loop, s1);
          npc.s = ((s1 % npc.loop.P) + npc.loop.P) % npc.loop.P;
          if (e0 !== e1) {
            const corner = npc.dir > 0 ? e1 : e0;
            if (rng.chance(0.3) && this.tryCross(npc, corner)) {
              /* now crossing */
            } else if (rng.chance(0.1)) npc.dir *= -1;
          }
          if (npc.mode === 'walk') {
            const p = this.onLoop(npc.loop, npc.s, npc.dir, npc.lane);
            npc.pos.x = p.x;
            npc.pos.z = p.z;
            wantYaw = Math.atan2(p.mx, p.mz);
            if (rng.chance(dt * 0.012)) {
              npc.mode = 'idle';
              npc.timer = rng.float(2, 7);
            }
          }
        } else if (npc.mode === 'cross') {
          npc.crossT += step / npc.crossLen;
          if (npc.crossT >= 1) {
            npc.loop = npc.nextLoop;
            npc.s = npc.nextS;
            npc.dir = npc.nextDir;
            npc.mode = 'walk';
          } else {
            npc.pos.x = npc.crossFrom.x + (npc.crossTo.x - npc.crossFrom.x) * npc.crossT;
            npc.pos.z = npc.crossFrom.y + (npc.crossTo.y - npc.crossFrom.y) * npc.crossT;
            wantYaw = Math.atan2(npc.crossTo.x - npc.crossFrom.x, npc.crossTo.y - npc.crossFrom.y);
          }
        }
      }

      npc.yaw = angleLerp(npc.yaw, wantYaw, 1 - Math.exp(-7 * dt));
      const g = this.city.groundHeight(npc.pos.x, npc.pos.z);
      npc.pos.y = damp(npc.pos.y, g, 14, dt);
      if (moving) npc.phase += (npc.curSpeed / 1.5) * Math.PI * 2 * dt;
      c.x = npc.pos.x;
      c.y = npc.pos.y;
      c.z = npc.pos.z;
      c.ground = g;
      c.yaw = npc.yaw;
      c.phase = npc.phase;
      c.amount = moving ? clamp(npc.curSpeed / 1.4, 0, 1) : damp(c.amount, 0, 8, dt);
      c.run = 0;
      // heads turn when you walk past looking like money (this.stare: 0 = nobody looks, 1 = everybody)
      if (distP > 7) npc.noticed = undefined;
      else if (npc.noticed === undefined) npc.noticed = rng.next() < this.stare;
      let look = 0;
      if (npc.noticed && distP > 0.8 && npc.mode !== 'talk') {
        let rel = Math.atan2(dxp, dzp) - npc.yaw;
        rel = Math.atan2(Math.sin(rel), Math.cos(rel));
        if (Math.abs(rel) < 2.2) look = clamp(rel, -1.25, 1.25);
      }
      if (npc.mode !== 'stand') c.headYaw = damp(c.headYaw, look, look ? 5 : 3, dt);
      else if (look) c.headYaw = damp(c.headYaw, look, 5, dt);
    }
  }

  nearest(pos, maxDist) {
    let best = null;
    let bd = maxDist;
    for (const npc of this.list) {
      if (npc.hidden || !npc.c.visible) continue;
      const d = Math.hypot(npc.pos.x - pos.x, npc.pos.z - pos.z);
      if (d < bd) {
        bd = d;
        best = npc;
      }
    }
    return best;
  }

  /** Push a circle out of nearby pedestrians (used for the player). */
  push(pos, r) {
    for (const npc of this.list) {
      if (npc.hidden) continue;
      const dx = pos.x - npc.pos.x;
      const dz = pos.z - npc.pos.z;
      const d = Math.hypot(dx, dz);
      const min = r + 0.3;
      if (d < min && d > 1e-4) {
        pos.x = npc.pos.x + (dx / d) * min;
        pos.z = npc.pos.z + (dz / d) * min;
      }
    }
  }
}
