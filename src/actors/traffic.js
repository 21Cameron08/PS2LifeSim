import * as THREE from 'three';
import { CITY, roadLine } from '../config.js';
import { GeoBuilder, shade } from '../core/geo.js';
import { Rng, clamp } from '../core/rng.js';
import { additive } from '../render/materials.js';

// Ambient traffic on the road grid. Cars follow straight lane segments between
// intersections and Bezier curves through them, keep their distance, and stop
// for pedestrians. Right-hand traffic.

const DIRS = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];
const LANE = 2.75;
const R = CITY.ROAD / 2;
const PAINT = ['#c8c8cc', '#2a2a2e', '#7a1a1a', '#1a2a5a', '#e8e6e0', '#3a5a3a', '#8a8a90', '#5a3a2a', '#b05a1a', '#2a4a6a', '#6a6a3a', '#9a2a4a'];
const TYPES = [
  { s: [1, 1, 1], max: [9, 12] }, // sedan
  { s: [0.95, 0.97, 0.86], max: [8, 11] }, // compact
  { s: [1.08, 1.25, 1.12], max: [7, 10] }, // van
];

function bodyGeometry() {
  const b = new GeoBuilder();
  const paint = [1, 1, 1];
  const dark = shade('#1c1c1e');
  const glass = shade('#141c28');
  b.box(-0.9, 0.34, -2.1, 0.9, 0.84, 2.1, { color: paint, bottom: true });
  b.box(-0.93, 0.26, -2.16, 0.93, 0.44, 2.16, { color: dark, bottom: true });
  b.box(-0.55, 0.47, 2.1, 0.55, 0.7, 2.13, { color: dark, top: false });
  // slanted cabin
  const yb = 0.84;
  const yt = 1.36;
  const xb = 0.8;
  const xt = 0.7;
  const zf = 1.0;
  const zb = -1.4;
  const tf = 0.4;
  const tb = -1.05;
  b.quad([-xb, yb, zf], [xb, yb, zf], [xt, yt, tf], [-xt, yt, tf], [0, 0.8, 0.6], [0, 0, 1, 1], glass);
  b.quad([xb, yb, zb], [-xb, yb, zb], [-xt, yt, tb], [xt, yt, tb], [0, 0.6, -0.8], [0, 0, 1, 1], glass);
  b.quad([xb, yb, zf], [xb, yb, zb], [xt, yt, tb], [xt, yt, tf], [1, 0.2, 0], [0, 0, 1, 1], glass);
  b.quad([-xb, yb, zb], [-xb, yb, zf], [-xt, yt, tf], [-xt, yt, tb], [-1, 0.2, 0], [0, 0, 1, 1], glass);
  b.quad([-xt, yt, tf], [xt, yt, tf], [xt, yt, tb], [-xt, yt, tb], [0, 1, 0], [0, 0, 1, 1], paint);
  // mirrors
  b.box(-1.0, 0.86, 0.75, -0.88, 0.98, 0.9, { color: paint });
  b.box(0.88, 0.86, 0.75, 1.0, 0.98, 0.9, { color: paint });
  return b.build();
}

function lightGeometry() {
  const b = new GeoBuilder();
  const head = shade('#fff4dc');
  const tail = shade('#ff1a10');
  for (const s of [-1, 1]) {
    b.box(s * 0.58 - 0.17, 0.58, 2.1, s * 0.58 + 0.17, 0.75, 2.17, { color: head, bottom: true });
    b.box(s * 0.62 - 0.17, 0.62, -2.17, s * 0.62 + 0.17, 0.78, -2.1, { color: tail, bottom: true });
  }
  return b.build();
}

const _M = new THREE.Matrix4();
const _L = new THREE.Matrix4();
const _W = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
function compose(out, x, y, z, ry, sx = 1, sy = 1, sz = 1, rx = 0) {
  _e.set(rx, ry, 0, 'YXZ');
  _q.setFromEuler(_e);
  return out.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}

export class Traffic {
  constructor(scene, tex, count = 24, seed = 99) {
    this.rng = new Rng(seed);
    this.cars = [];
    this.honk = false;
    const n = count;
    const inst = (geo, mat, k = 1) => {
      const m = new THREE.InstancedMesh(geo, mat, n * k);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      scene.add(m);
      return m;
    };
    this.body = inst(bodyGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.lightMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.lights = inst(lightGeometry(), this.lightMat);
    const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 10).rotateZ(Math.PI / 2);
    this.wheels = inst(wheelGeo, new THREE.MeshLambertMaterial({ color: '#1a1a1c' }), 4);
    this.taxiMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd84a') });
    this.taxiSign = inst(new THREE.BoxGeometry(0.55, 0.18, 0.24).translate(0, 1.45, -0.3), this.taxiMat);
    this.beamMat = additive({ map: tex.glow, color: new THREE.Color('#fff0d0'), opacity: 0 });
    this.beams = inst(new THREE.PlaneGeometry(3.4, 10).rotateX(-Math.PI / 2).translate(0, 0.05, 7.2), this.beamMat);
    this.beams.renderOrder = 2;
    this.shadows = inst(
      new THREE.PlaneGeometry(2.3, 4.9).rotateX(-Math.PI / 2).translate(0, 0.03, 0),
      new THREE.MeshBasicMaterial({ map: tex.shadow, transparent: true, depthWrite: false, opacity: 0.75 }),
    );
    this.shadows.renderOrder = 1;

    const rng = this.rng;
    const col = new THREE.Color();
    for (let k = 0; k < n; k++) {
      const taxi = k % 7 === 3;
      const type = taxi ? TYPES[0] : rng.pick(TYPES);
      const car = {
        idx: k,
        taxi,
        scale: type.s,
        max: rng.float(type.max[0], type.max[1]),
        speed: 0,
        u: 0,
        ghost: 0,
        stuck: 0,
        blockedByPlayer: 0,
        honkCooldown: 0,
        wheel: 0,
        pos: new THREE.Vector3(),
        fwd: new THREE.Vector3(0, 0, 1),
        yaw: 0,
      };
      this.body.setColorAt(k, col.set(taxi ? '#e8b818' : rng.pick(PAINT)));
      this.placeRandom(car);
      this.cars.push(car);
    }
    this.body.instanceColor.needsUpdate = true;
  }

  validNode(i, j) {
    return i >= 0 && j >= 0 && i <= CITY.N && j <= CITY.N;
  }

  placeRandom(car) {
    const rng = this.rng;
    for (let tries = 0; tries < 50; tries++) {
      const i = rng.int(0, CITY.N);
      const j = rng.int(0, CITY.N);
      const d = rng.int(0, 3);
      if (!this.validNode(i + DIRS[d][0], j + DIRS[d][1])) continue;
      this.startSegment(car, i, j, d);
      car.u = rng.float(0, car.path.len);
      this.sample(car);
      if (this.cars.every((o) => o.pos.distanceTo(car.pos) > 9)) return;
    }
  }

  startSegment(car, i, j, d) {
    const [dx, dz] = DIRS[d];
    const rx = -dz;
    const rz = dx;
    const ni = i + dx;
    const nj = j + dz;
    const p0 = new THREE.Vector2(roadLine(i) + dx * R + rx * LANE, roadLine(j) + dz * R + rz * LANE);
    const p1 = new THREE.Vector2(roadLine(ni) - dx * R + rx * LANE, roadLine(nj) - dz * R + rz * LANE);
    car.path = { type: 'line', p0, p1, len: p0.distanceTo(p1) };
    car.ti = ni;
    car.tj = nj;
    car.d = d;
  }

  startTurn(car) {
    const rng = this.rng;
    const d = car.d;
    const opts = [];
    for (const [d2, w] of [
      [d, 5],
      [(d + 1) % 4, 2.5],
      [(d + 3) % 4, 2.5],
    ]) {
      if (this.validNode(car.ti + DIRS[d2][0], car.tj + DIRS[d2][1])) opts.push([d2, w]);
    }
    let d2 = (d + 2) % 4;
    if (opts.length) {
      let r = rng.float(0, opts.reduce((s, o) => s + o[1], 0));
      for (const [dd, w] of opts) {
        if ((r -= w) <= 0) {
          d2 = dd;
          break;
        }
      }
    }
    const [dx2, dz2] = DIRS[d2];
    const bx = roadLine(car.ti);
    const bz = roadLine(car.tj);
    const p0 = car.path.p1.clone();
    const q = new THREE.Vector2(bx + dx2 * R - dz2 * LANE, bz + dz2 * R + dx2 * LANE);
    let c;
    if (d2 === d) c = p0.clone().add(q).multiplyScalar(0.5);
    else if (d2 === (d + 2) % 4) c = new THREE.Vector2(bx + DIRS[d][0] * R, bz + DIRS[d][1] * R);
    else if (DIRS[d][0] !== 0) c = new THREE.Vector2(q.x, p0.y);
    else c = new THREE.Vector2(p0.x, q.y);
    const len = (p0.distanceTo(c) + c.distanceTo(q)) * 0.92;
    car.path = { type: 'bez', p0, c, p1: q, len, d2 };
  }

  sample(car) {
    const P = car.path;
    const t = clamp(car.u / P.len, 0, 1);
    let x;
    let z;
    let tx;
    let tz;
    if (P.type === 'line') {
      x = P.p0.x + (P.p1.x - P.p0.x) * t;
      z = P.p0.y + (P.p1.y - P.p0.y) * t;
      tx = P.p1.x - P.p0.x;
      tz = P.p1.y - P.p0.y;
    } else {
      const a = (1 - t) * (1 - t);
      const b = 2 * (1 - t) * t;
      const cc = t * t;
      x = a * P.p0.x + b * P.c.x + cc * P.p1.x;
      z = a * P.p0.y + b * P.c.y + cc * P.p1.y;
      tx = 2 * (1 - t) * (P.c.x - P.p0.x) + 2 * t * (P.p1.x - P.c.x);
      tz = 2 * (1 - t) * (P.c.y - P.p0.y) + 2 * t * (P.p1.y - P.c.y);
    }
    const l = Math.hypot(tx, tz) || 1;
    car.pos.set(x, 0, z);
    car.fwd.set(tx / l, 0, tz / l);
    car.yaw = Math.atan2(car.fwd.x, car.fwd.z);
  }

  update(dt, playerPos, peds, night) {
    this.honk = false;
    this.obstacles ??= [];
    const cars = this.cars;
    for (const car of cars) {
      const f = car.fwd;
      const rx = -f.z;
      const rz = f.x;
      let block = Infinity;
      let byPlayer = false;
      const look = 6 + car.speed * 1.3;
      for (const o of cars) {
        if (o === car) continue;
        const dx = o.pos.x - car.pos.x;
        const dz = o.pos.z - car.pos.z;
        const along = dx * f.x + dz * f.z;
        if (along <= 0 || along > look + 5) continue;
        if (Math.abs(dx * rx + dz * rz) > 1.8) continue;
        if (o.fwd.x * f.x + o.fwd.z * f.z < 0.2) continue;
        block = Math.min(block, along);
      }
      const people = (x, z, isPlayer) => {
        const dx = x - car.pos.x;
        const dz = z - car.pos.z;
        const along = dx * f.x + dz * f.z;
        if (along <= 0 || along > look) return;
        if (Math.abs(dx * rx + dz * rz) > 1.7) return;
        const d = along + 1.2;
        if (d < block) {
          block = d;
          byPlayer = isPlayer;
        }
      };
      people(playerPos.x, playerPos.z, true);
      for (const p of peds) if (!p.hidden) people(p.pos.x, p.pos.z, false);
      // your cars: the one you're driving counts as you (they honk), parked ones don't
      for (const o of this.obstacles) people(o.x, o.z, o.you);

      if (car.ghost > 0) {
        car.ghost -= dt;
        block = Infinity;
      }
      let target = car.max * clamp((block - 5.5) / 7, 0, 1);
      if (car.path.type === 'bez' && car.path.d2 !== car.d) target = Math.min(target, car.max * 0.5);
      car.speed += clamp(target - car.speed, -14 * dt, 4.5 * dt);
      if (car.speed < 0.2) {
        car.stuck += dt;
        if (car.stuck > 7 && !byPlayer) {
          car.ghost = 2.5;
          car.stuck = 0;
        }
      } else car.stuck = 0;
      car.honkCooldown -= dt;
      if (byPlayer && car.speed < 1) {
        car.blockedByPlayer += dt;
        if (car.blockedByPlayer > 1.6 && car.honkCooldown <= 0) {
          this.honk = car.pos;
          car.honkCooldown = 5;
        }
      } else car.blockedByPlayer = 0;

      car.u += car.speed * dt;
      while (car.u >= car.path.len) {
        car.u -= car.path.len;
        if (car.path.type === 'line') this.startTurn(car);
        else this.startSegment(car, car.ti, car.tj, car.path.d2);
      }
      this.sample(car);
      car.wheel += (car.speed * dt) / 0.34;
    }
    this.writeMatrices(night);
  }

  writeMatrices(night) {
    for (const car of this.cars) {
      const k = car.idx;
      const [sx, sy, sz] = car.scale;
      compose(_M, car.pos.x, 0, car.pos.z, car.yaw, sx, sy, sz);
      this.body.setMatrixAt(k, _M);
      this.lights.setMatrixAt(k, _M);
      this.beams.setMatrixAt(k, _M);
      this.taxiSign.setMatrixAt(k, car.taxi ? _M : ZERO);
      compose(_L, car.pos.x, 0, car.pos.z, car.yaw, sx, 1, sz);
      this.shadows.setMatrixAt(k, _L);
      let w = 0;
      for (const zx of [-1.32, 1.32])
        for (const xx of [-0.86, 0.86]) {
          compose(_W, xx, 0.34, zx, 0, 1, 1, 1, car.wheel);
          _L.multiplyMatrices(_M, _W);
          this.wheels.setMatrixAt(k * 4 + w++, _L);
        }
    }
    for (const m of [this.body, this.lights, this.beams, this.taxiSign, this.shadows, this.wheels]) m.instanceMatrix.needsUpdate = true;
    this.lightMat.color.setScalar(0.8 + night * 3.2);
    this.taxiMat.color.set('#ffd84a').multiplyScalar(0.9 + night * 1.6);
    this.beamMat.opacity = night * 0.42;
  }

  /** Keep a circle (the player) out of cars. */
  push(pos, r) {
    for (const car of this.cars) {
      const f = car.fwd;
      const dx = pos.x - car.pos.x;
      const dz = pos.z - car.pos.z;
      const lz = dx * f.x + dz * f.z;
      const lx = dx * -f.z + dz * f.x;
      const hw = 0.95 * car.scale[0] + r;
      const hl = 2.2 * car.scale[2] + r;
      if (Math.abs(lx) >= hw || Math.abs(lz) >= hl) continue;
      const px = hw - Math.abs(lx);
      const pz = hl - Math.abs(lz);
      if (px < pz) {
        const s = Math.sign(lx) * px;
        pos.x += -f.z * s;
        pos.z += f.x * s;
      } else {
        const s = Math.sign(lz) * pz;
        pos.x += f.x * s;
        pos.z += f.z * s;
      }
    }
  }
}
