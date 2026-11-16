import * as THREE from 'three';
import { GeoBuilder } from '../core/geo.js';

// Renders every person in the game (player + NPCs) with ~12 instanced meshes,
// one per body part. Each person is a little puppet of boxes with hips, knees,
// shoulders and elbows, like a PS2-era LOD model. Appearance = instance colours.

const HIP_Y = 0.86;
const NECK_Y = 1.46;

function boxUV(b, x0, y0, z0, x1, y1, z1, front, other) {
  b.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], front);
  b.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], other);
  b.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], other);
  b.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], other);
  b.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], other);
  b.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], other);
}

function geo(fn) {
  const b = new GeoBuilder();
  fn(b);
  return b.build();
}
const bx = (b, x0, y0, z0, x1, y1, z1) => b.box(x0, y0, z0, x1, y1, z1, { bottom: true });

const GEOS = {
  torso: () =>
    geo((b) => {
      bx(b, -0.19, 0, -0.115, 0.19, 0.32, 0.115);
      bx(b, -0.22, 0.3, -0.125, 0.22, 0.6, 0.125);
    }),
  jacket: () =>
    geo((b) => {
      bx(b, -0.245, 0.0, -0.15, 0.245, 0.63, -0.1); // back
      bx(b, -0.245, 0.0, -0.1, -0.2, 0.63, 0.1); // sides
      bx(b, 0.2, 0.0, -0.1, 0.245, 0.63, 0.1);
      bx(b, -0.245, 0.0, 0.1, -0.055, 0.63, 0.15); // front panels with a gap
      bx(b, 0.055, 0.0, 0.1, 0.245, 0.63, 0.15);
      bx(b, -0.245, 0.6, -0.15, 0.245, 0.65, 0.15); // shoulders
      bx(b, -0.13, 0.62, -0.16, 0.13, 0.72, -0.08); // collar
    }),
  head: () =>
    geo((b) => {
      const plain = [0.74, 0.45, 0.76, 0.55];
      boxUV(b, -0.055, -0.03, -0.055, 0.055, 0.08, 0.055, plain, plain);
      boxUV(b, -0.14, 0.06, -0.14, 0.14, 0.36, 0.14, [0, 0, 0.5, 1], plain);
    }),
  hairCap: () => geo((b) => bx(b, -0.155, -0.1, -0.16, 0.155, 0.045, 0.152)),
  hairBack: () => geo((b) => bx(b, -0.156, -1, -0.165, 0.156, 0, -0.06)),
  upperArm: () => geo((b) => bx(b, -0.065, -0.3, -0.07, 0.065, 0.04, 0.07)),
  foreArm: () => geo((b) => bx(b, -0.055, -0.27, -0.06, 0.055, 0.01, 0.06)),
  hand: () => geo((b) => bx(b, -0.05, -0.38, -0.055, 0.05, -0.26, 0.055)),
  thigh: () => geo((b) => bx(b, -0.09, -0.42, -0.1, 0.09, 0.04, 0.1)),
  shin: () => geo((b) => bx(b, -0.08, -0.36, -0.09, 0.08, 0.01, 0.09)),
  shoe: () => geo((b) => bx(b, -0.085, -0.45, -0.1, 0.085, -0.35, 0.15)),
};

// hair style -> [cap scale y, cap lift, back length, cap width]
const HAIR = [
  [1, 0, 0.16, 1],
  [1, 0, 0.5, 1],
  [1.05, 0, 0.3, 1.08],
  [1.8, 0.1, 0.14, 0.98],
  [0.5, 0, 0.08, 0.98],
  [0, 0, 0, 0],
];

const _M = new THREE.Matrix4();
const _A = new THREE.Matrix4();
const _B = new THREE.Matrix4();
const _L = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const _c = new THREE.Color();

function local(out, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(sx, sy, sz);
  return out.compose(_p, _q, _s);
}

export class Crowd {
  constructor(scene, tex, max = 128) {
    this.max = max;
    this.chars = [];
    this.parts = {};
    const lift = new THREE.Color('#141820');
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: lift });
    const headMat = new THREE.MeshLambertMaterial({ map: tex.face, emissive: lift });
    const mk = (name, mult, material = mat) => {
      const m = new THREE.InstancedMesh(GEOS[name](), material, max * mult);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      for (let k = 0; k < max * mult; k++) {
        m.setMatrixAt(k, ZERO);
        m.setColorAt(k, _c.set(0xffffff));
      }
      m.count = 0;
      scene.add(m);
      this.parts[name] = m;
      return m;
    };
    mk('torso', 1);
    mk('jacket', 1);
    mk('head', 1, headMat);
    mk('hairCap', 1);
    mk('hairBack', 1);
    mk('upperArm', 2);
    mk('foreArm', 2);
    mk('hand', 2);
    mk('thigh', 2);
    mk('shin', 2);
    mk('shoe', 2);

    const sg = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.shadow = new THREE.InstancedMesh(
      sg,
      new THREE.MeshBasicMaterial({ map: tex.shadow, transparent: true, depthWrite: false, opacity: 0.6 }),
      max,
    );
    this.shadow.frustumCulled = false;
    this.shadow.renderOrder = 1;
    this.shadow.count = 0;
    scene.add(this.shadow);
  }

  add(app) {
    const id = this.chars.length;
    if (id >= this.max) throw new Error('Crowd is full');
    const c = { id, x: 0, y: 0, z: 0, ground: 0, yaw: 0, phase: 0, amount: 0, run: 0, headYaw: 0, nod: 0, talk: 0, visible: true, app: null };
    this.chars.push(c);
    this.setAppearance(id, app);
    return c;
  }

  setAppearance(id, app) {
    const c = this.chars[id];
    c.app = { ...app };
    const P = this.parts;
    const set = (name, k, col) => P[name].setColorAt(k, _c.set(col));
    const sleeve = app.topStyle === 2 ? app.jacket : app.top;
    const fore = app.topStyle === 0 ? app.skin : sleeve;
    set('torso', id, app.top);
    set('jacket', id, app.jacket);
    set('head', id, app.skin);
    set('hairCap', id, app.hair);
    set('hairBack', id, app.hair);
    for (const s of [0, 1]) {
      const k = id * 2 + s;
      set('upperArm', k, sleeve);
      set('foreArm', k, fore);
      set('hand', k, app.skin);
      set('thigh', k, app.bottom);
      set('shin', k, app.bottomStyle === 1 ? app.skin : app.bottom);
      set('shoe', k, app.shoes);
    }
    for (const m of Object.values(P)) m.instanceColor.needsUpdate = true;
  }

  update() {
    const P = this.parts;
    const n = this.chars.length;
    for (const name of ['upperArm', 'foreArm', 'hand', 'thigh', 'shin', 'shoe']) P[name].count = n * 2;
    for (const name of ['torso', 'jacket', 'head', 'hairCap', 'hairBack']) P[name].count = n;
    this.shadow.count = n;

    for (const c of this.chars) {
      const id = c.id;
      if (!c.visible) {
        for (const name of ['torso', 'jacket', 'head', 'hairCap', 'hairBack']) P[name].setMatrixAt(id, ZERO);
        for (const name of ['upperArm', 'foreArm', 'hand', 'thigh', 'shin', 'shoe']) {
          P[name].setMatrixAt(id * 2, ZERO);
          P[name].setMatrixAt(id * 2 + 1, ZERO);
        }
        this.shadow.setMatrixAt(id, ZERO);
        continue;
      }
      const app = c.app;
      const a = c.amount;
      const run = c.run;
      const ph = c.phase;
      const bob = Math.abs(Math.sin(ph)) * (0.035 + 0.04 * run) * a + Math.sin(performance.now() * 0.002 + id) * 0.004 * (1 - a);
      local(_M, c.x, c.y + bob, c.z, 0, c.yaw, 0, app.build, app.height, app.build);

      const lean = (0.04 + 0.12 * run) * a;
      local(_L, 0, HIP_Y, 0, lean, Math.sin(ph) * 0.08 * a, 0);
      _A.multiplyMatrices(_M, _L);
      P.torso.setMatrixAt(id, _A);
      P.jacket.setMatrixAt(id, app.topStyle === 2 ? _A : ZERO);

      // head (child of torso)
      const nod = c.nod + (c.talk ? Math.sin(performance.now() * 0.012) * 0.06 : 0);
      local(_L, 0, NECK_Y - HIP_Y, 0, nod - lean * 0.6, c.headYaw, 0);
      _B.multiplyMatrices(_A, _L);
      P.head.setMatrixAt(id, _B);
      const hs = HAIR[app.hairStyle] || HAIR[0];
      if (hs[0] > 0) {
        local(_L, 0, 0.36 + hs[1], 0, 0, 0, 0, hs[3], hs[0], hs[3]);
        P.hairCap.setMatrixAt(id, _L.premultiply(_B));
        local(_L, 0, 0.36, 0, 0, 0, 0, hs[3], hs[2], 1);
        P.hairBack.setMatrixAt(id, _L.premultiply(_B));
      } else {
        P.hairCap.setMatrixAt(id, ZERO);
        P.hairBack.setMatrixAt(id, ZERO);
      }

      // limbs
      const A = (0.5 + 0.25 * run) * a;
      for (const s of [0, 1]) {
        const side = s === 0 ? -1 : 1;
        const p = ph + (s === 0 ? 0 : Math.PI);
        const k = id * 2 + s;
        // legs
        const thigh = -Math.sin(p) * A;
        const knee = (0.08 + (0.55 + 0.5 * run) * Math.max(0, Math.cos(p))) * a;
        local(_L, side * 0.1, HIP_Y, 0, thigh, 0, 0);
        _A.multiplyMatrices(_M, _L);
        P.thigh.setMatrixAt(k, _A);
        local(_L, 0, -0.41, 0, knee, 0, 0);
        _B.multiplyMatrices(_A, _L);
        P.shin.setMatrixAt(k, _B);
        P.shoe.setMatrixAt(k, _B);
        // arms swing opposite to the leg on the same side; they ride on the torso
        local(_L, 0, HIP_Y, 0, lean, Math.sin(ph) * 0.08 * a, 0);
        _A.multiplyMatrices(_M, _L);
        // carrying holds both arms out front; working makes them busy
        const tnow = performance.now();
        const arm = c.carry ? -1.05 : c.work ? -0.75 + Math.sin(tnow * 0.011 + s * 2.2) * 0.35 : Math.sin(p) * A * 0.85;
        const talkWave = !c.carry && !c.work && c.talk && s === 1 ? -0.5 + Math.sin(tnow * 0.006) * 0.15 : 0;
        local(_L, side * 0.285, NECK_Y - HIP_Y - 0.04, 0, arm + talkWave, 0, side * (c.carry ? 0.1 : -0.07));
        _A.multiply(_L);
        P.upperArm.setMatrixAt(k, _A);
        const elbow = c.carry ? -0.55 : c.work ? -0.7 : -(0.18 + 0.5 * run) * (0.4 + 0.6 * a) + (c.talk && s === 1 ? -0.6 : 0);
        local(_L, 0, -0.29, 0, elbow, 0, 0);
        _B.multiplyMatrices(_A, _L);
        P.foreArm.setMatrixAt(k, _B);
        P.hand.setMatrixAt(k, _B);
      }
      local(_L, c.x, c.ground + 0.03, c.z, 0, 0, 0, 0.95 * app.build, 1, 0.95 * app.build);
      this.shadow.setMatrixAt(id, _L);
    }
    for (const m of Object.values(P)) m.instanceMatrix.needsUpdate = true;
    this.shadow.instanceMatrix.needsUpdate = true;
  }
}
