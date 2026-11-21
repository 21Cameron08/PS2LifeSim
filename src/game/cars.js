import * as THREE from 'three';
import { GeoBuilder, shade } from '../core/geo.js';
import { clamp, damp } from '../core/rng.js';
import { additive } from '../render/materials.js';

// Cars you can own (all makes made up). CORSO MOTORS sells them; once one is yours
// it's parked somewhere in the city (state.cars), and you can get in and drive it
// anywhere outdoors: on the roads, over the kerbs, through the park if you must.
//
// Driving is a simple arcade model: throttle, brake (then reverse), steering that
// tightens at low speed, a handbrake, bumps off buildings and street furniture,
// traffic stops for you and people step out of the way. There's a radio.

export const CARS = [
  { id: 'pip', make: 'CORSO', name: 'Pip', price: 8900, top: 17, accel: 3.4, grip: 2.2, L: 3.7, W: 1.66, H: 1.48, shape: 'hatch', sy: 0.4, sz: -0.35, status: 3, paints: ['#c43a2a', '#e8e4dc', '#3a6a9a', '#e8b818', '#5a8a4a'], desc: 'A used city hatch. Two careful owners and one careless one. It always starts.' },
  { id: 'strada', make: 'FERRO', name: 'Strada', price: 24000, top: 20, accel: 4.2, grip: 2.4, L: 4.5, W: 1.8, H: 1.42, shape: 'sedan', sy: 0.36, sz: 0.05, status: 6, paints: ['#2a2a2e', '#c8c8cc', '#1a2a5a', '#7a1a1a', '#e8e6e0'], desc: 'The sensible saloon. Heated seats, a big boot, cupholders that actually hold cups.' },
  { id: 'kestrel', make: 'KESTREL', name: 'GT', price: 68000, top: 27, accel: 6.2, grip: 2.9, L: 4.4, W: 1.86, H: 1.3, shape: 'coupe', sy: 0.22, sz: -0.55, status: 14, paints: ['#1a3a6a', '#c43a2a', '#e8e4dc', '#2a2a2e', '#d8b46a'], desc: 'A long-bonnet coupe with a straight six that sings above four thousand.' },
  { id: 'spider', make: 'CORSO', name: "Spider '68", price: 95000, top: 22, accel: 4.8, grip: 2.5, L: 4.1, W: 1.7, H: 1.12, shape: 'open', sy: 0.32, sz: -0.5, status: 16, paints: ['#c43a2a', '#e8dcc0', '#3a5a3a', '#5ac8d8'], desc: 'A 1968 roadster, restored bolt by bolt. No roof, no power steering, no regrets.' },
  { id: 'monarch', make: 'HALVARD', name: 'Monarch', price: 145000, top: 25, accel: 5.4, grip: 2.6, L: 5.2, W: 1.96, H: 1.5, shape: 'limo', sy: 0.42, sz: 0.35, status: 20, paints: ['#141418', '#e8e6e0', '#3a2a1a', '#2a3a2a'], desc: 'The car you get driven in. Lambswool rugs, a bottle cooler, a ride like warm butter.' },
  { id: 'rift', make: 'VANTOR', name: 'Rift', price: 380000, top: 36, accel: 9.5, grip: 3.6, L: 4.6, W: 2.0, H: 1.18, shape: 'super', sy: 0.14, sz: -0.1, status: 30, paints: ['#e8b818', '#ff6a2a', '#5aff8a', '#2a2a2e', '#e8e4dc'], desc: 'Carbon fibre, a V12 behind your head and doors that open upwards. People will film you.' },
];
export const CAR = Object.fromEntries(CARS.map((c) => [c.id, c]));

// radio stations: the game's music styles, with a frequency and a name
export const STATIONS = [
  { style: null, name: 'RADIO OFF' },
  { style: 'radio', name: '88.1 HARBOUR AM · oldies' },
  { style: 'lounge', name: '94.7 VELVET · late lounge' },
  { style: 'street', name: '99.3 GRAIN FM · beats' },
  { style: 'bossa', name: '101.5 SOL · bossa nova' },
  { style: 'jazz', name: '104.9 THE EXCHANGE · jazz' },
  { style: 'mall', name: '107.3 HALCYON · easy hits' },
];

/** A car's body as three geometries: paint, trim (vertex coloured) and glass. All face +z. */
function carGeometry(m) {
  const P = new GeoBuilder();
  const T = new GeoBuilder();
  const G = new GeoBuilder();
  const L = m.L / 2;
  const W = m.W / 2;
  const dark = shade('#1c1c1e');
  const chrome = shade('#c8ccd0');
  const white = [1, 1, 1];
  const low = m.shape === 'super' || m.shape === 'open';
  const sill = low ? 0.22 : 0.3;
  const belt = m.shape === 'super' ? 0.72 : m.shape === 'open' ? 0.78 : m.H - 0.55;
  // lower body and bumpers
  P.box(-W, sill, -L, W, belt, L, { color: white, bottom: true });
  T.box(-W - 0.03, sill - 0.08, -L - 0.04, W + 0.03, sill + 0.14, L + 0.04, { color: dark, bottom: true });
  T.box(-W * 0.6, sill + 0.16, L, W * 0.6, belt - 0.12, L + 0.02, { color: m.shape === 'limo' ? chrome : dark, top: false });
  // the cabin
  const cab = {
    hatch: { zf: 0.55, zb: -1.6, tf: -0.1, tb: -1.55, yt: m.H },
    sedan: { zf: 0.75, zb: -1.2, tf: 0.15, tb: -0.85, yt: m.H },
    coupe: { zf: 0.1, zb: -1.45, tf: -0.45, tb: -1.1, yt: m.H },
    limo: { zf: 0.95, zb: -1.6, tf: 0.35, tb: -1.25, yt: m.H },
    super: { zf: 0.9, zb: -0.9, tf: 0.2, tb: -0.55, yt: m.H },
    open: { zf: 0.35, zb: 0.33, tf: 0.2, tb: 0.2, yt: 1.08 },
  }[m.shape];
  const yb = belt;
  const xb = W - 0.08;
  const xt = W - (m.shape === 'super' ? 0.28 : 0.2);
  if (m.shape === 'open') {
    // a windscreen, two seats, a little rollbar hump
    G.quad([-xb, yb, cab.zf], [xb, yb, cab.zf], [xb - 0.05, cab.yt, cab.zf - 0.22], [-xb + 0.05, cab.yt, cab.zf - 0.22], [0, 0.6, 0.8], [0, 0, 1, 1], white);
    T.box(-W + 0.12, belt - 0.02, -0.9, W - 0.12, belt + 0.01, 0.3, { color: shade('#3a2a1a') });
    for (const x of [-0.42, 0.42]) {
      T.box(x - 0.22, belt, -0.75, x + 0.22, belt + 0.08, -0.25, { color: shade('#c8a070') });
      T.box(x - 0.22, belt, -0.85, x + 0.22, belt + 0.45, -0.75, { color: shade('#c8a070') });
    }
    T.box(-0.2, belt + 0.2, -0.55, 0.2, belt + 0.3, -0.25, { color: dark });
  } else {
    const { zf, zb, tf, tb, yt } = cab;
    G.quad([-xb, yb, zf], [xb, yb, zf], [xt, yt, tf], [-xt, yt, tf], [0, 0.8, 0.6], [0, 0, 1, 1], white);
    G.quad([xb, yb, zb], [-xb, yb, zb], [-xt, yt, tb], [xt, yt, tb], [0, 0.6, -0.8], [0, 0, 1, 1], white);
    G.quad([xb, yb, zf], [xb, yb, zb], [xt, yt, tb], [xt, yt, tf], [1, 0.2, 0], [0, 0, 1, 1], white);
    G.quad([-xb, yb, zb], [-xb, yb, zf], [-xt, yt, tf], [-xt, yt, tb], [-1, 0.2, 0], [0, 0, 1, 1], white);
    P.quad([-xt, yt, tf], [xt, yt, tf], [xt, yt, tb], [-xt, yt, tb], [0, 1, 0], [0, 0, 1, 1], white);
    // pillars (so the glass reads as windows)
    for (const s of [-1, 1]) T.box(s * xb - 0.03, yb, (zf + zb) / 2 - 0.04, s * xb + 0.03, yt - 0.02, (zf + zb) / 2 + 0.04, { color: dark });
  }
  // bonnet scoop, spoiler, chrome strip, side mirrors
  if (m.shape === 'super') {
    T.box(-W + 0.1, belt + 0.25, -L + 0.05, W - 0.1, belt + 0.3, -L + 0.4, { color: dark, bottom: true });
    for (const x of [-0.7, 0.7]) T.box(x - 0.04, belt, -L + 0.15, x + 0.04, belt + 0.25, -L + 0.3, { color: dark });
    T.box(-W - 0.005, sill + 0.2, -0.6, W + 0.005, sill + 0.45, 0.4, { color: dark });
  }
  if (m.shape === 'limo' || m.shape === 'coupe') for (const s of [-1, 1]) T.box(s * (W + 0.005) - 0.005, belt - 0.12, -L + 0.3, s * (W + 0.005) + 0.005, belt - 0.08, L - 0.3, { color: chrome });
  if (m.shape !== 'open') for (const s of [-1, 1]) P.box(s * (W + 0.04) - 0.06, belt + 0.02, cab.zf - 0.2, s * (W + 0.04) + 0.06, belt + 0.14, cab.zf - 0.05, { color: white });
  return { paint: P.build(), trim: T.build(), glass: G.build() };
}

function lightGeometry(m) {
  const b = new GeoBuilder();
  const L = m.L / 2;
  const W = m.W / 2;
  const y = m.shape === 'super' || m.shape === 'open' ? 0.42 : 0.55;
  for (const s of [-1, 1]) {
    b.box(s * (W - 0.32) - 0.16, y, L, s * (W - 0.32) + 0.16, y + 0.12, L + 0.06, { color: shade('#fff4dc'), bottom: true });
    b.box(s * (W - 0.28) - 0.18, y + 0.04, -L - 0.06, s * (W - 0.28) + 0.18, y + 0.15, -L, { color: shade('#ff1a10'), bottom: true });
  }
  return b.build();
}

const WHEEL = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 12).rotateZ(Math.PI / 2);
const RIM = new THREE.CylinderGeometry(0.2, 0.2, 0.28, 8).rotateZ(Math.PI / 2);

/** A car you can see (and drive): a group of meshes for one model and paint. */
/**
 * A car you can see (and drive): a group of meshes for one model and paint.
 * opts.static: a showroom car that never moves: the wheels and lamps are baked into the
 * trim mesh (four draw calls instead of fourteen), and there are no headlight beams.
 */
export function makeCarMesh(m, paint, tex, opts = {}) {
  const g = carGeometry(m);
  const group = new THREE.Group();
  const paintMat = new THREE.MeshPhongMaterial({ color: paint, vertexColors: true, shininess: 70, specular: '#555555' });
  const body = new THREE.Mesh(g.paint, paintMat);
  const wz = m.L / 2 - 0.75;
  const wheelAt = [];
  for (const z of [wz, -wz]) for (const x of [-(m.W / 2 - 0.06), m.W / 2 - 0.06]) wheelAt.push([x, z]);
  const rimCol = m.shape === 'super' || m.shape === 'limo' ? '#c8ccd0' : '#8a8c90';
  if (opts.static) {
    const T = new GeoBuilder();
    T.addGeometry(g.trim, new THREE.Matrix4());
    T.addGeometry(lightGeometry(m), new THREE.Matrix4());
    wheelAt.forEach(([x, z], k) => {
      const mx = new THREE.Matrix4().makeRotationY(k < 2 ? (opts.steer ?? 0) : 0).setPosition(x, 0.34, z);
      T.addGeometry(WHEEL, mx, shade('#1a1a1c'));
      T.addGeometry(RIM, mx, shade(rimCol));
    });
    const trim = new THREE.Mesh(T.build(), new THREE.MeshLambertMaterial({ vertexColors: true }));
    const glass = new THREE.Mesh(g.glass, new THREE.MeshPhongMaterial({ color: '#1a2838', shininess: 90, specular: '#888888', side: THREE.DoubleSide, transparent: true, opacity: 0.62, depthWrite: false }));
    glass.renderOrder = 2;
    group.add(body, trim, glass);
    if (!opts.noShadow) {
      const shadow = new THREE.Mesh(new THREE.PlaneGeometry(m.W + 0.4, m.L + 0.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex.shadow, transparent: true, depthWrite: false, opacity: 0.75 }));
      shadow.position.y = 0.03;
      shadow.renderOrder = 1;
      group.add(shadow);
    }
    return { group, paintMat, wheels: [] };
  }
  const trim = new THREE.Mesh(g.trim, new THREE.MeshLambertMaterial({ vertexColors: true }));
  // tinted, but you can see who's driving
  const glass = new THREE.Mesh(g.glass, new THREE.MeshPhongMaterial({ color: '#1a2838', shininess: 90, specular: '#888888', side: THREE.DoubleSide, transparent: true, opacity: 0.62, depthWrite: false }));
  glass.renderOrder = 2;
  const lightMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const lights = new THREE.Mesh(lightGeometry(m), lightMat);
  group.add(body, trim, glass, lights);
  const wheels = [];
  const tyre = new THREE.MeshLambertMaterial({ color: '#1a1a1c' });
  const rim = new THREE.MeshLambertMaterial({ color: rimCol });
  for (const [x, z] of wheelAt) {
    // the tyres stand a little proud of the body, so they read from the side
    const w = new THREE.Group();
    w.add(new THREE.Mesh(WHEEL, tyre), new THREE.Mesh(RIM, rim));
    w.position.set(x, 0.34, z);
    w.rotation.order = 'YXZ'; // spin about the axle, then steer
    group.add(w);
    wheels.push(w);
  }
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(m.W + 0.4, m.L + 0.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex.shadow, transparent: true, depthWrite: false, opacity: 0.75 }));
  shadow.position.y = 0.03;
  shadow.renderOrder = 1;
  group.add(shadow);
  // headlight pools on the road at night (only while someone's driving)
  const beamMat = additive({ map: tex.glow, color: new THREE.Color('#fff0d0'), opacity: 0 });
  const beam = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 10).rotateX(-Math.PI / 2).translate(0, 0.06, m.L / 2 + 5), beamMat);
  beam.renderOrder = 2;
  beam.visible = false;
  group.add(beam);
  return { group, paintMat, lightMat, wheels, beam, beamMat };
}

/**
 * Your cars: state.cars = [{ uid, id, paint, x, z, yaw }]. One of them may be `driving`.
 * deps: { scene, tex, state, ground(x, z), colliders, traffic, peds, audio, forbidden(p), bounds,
 *   blockers(c, r) (pushes a circle out of other people), onScare(npc) }
 */
export class Garage {
  constructor(deps) {
    Object.assign(this, deps);
    this.state.cars ??= [];
    this.list = [];
    for (const rec of this.state.cars) this.spawn(rec);
    this.driving = null;
    this.station = 0;
    this.engine = null;
    this._c = new THREE.Vector3();
  }

  spawn(rec) {
    const m = CAR[rec.id];
    const mesh = makeCarMesh(m, rec.paint, this.tex);
    this.scene.add(mesh.group);
    const car = { rec, m, ...mesh, speed: 0, steer: 0, spin: 0, y: this.ground(rec.x, rec.z) };
    this.place(car);
    this.list.push(car);
    return car;
  }

  /** A new car: parked at x, z facing yaw. */
  add(id, paint, x, z, yaw) {
    const S = this.state;
    S.carNext = (S.carNext ?? 1) + 1;
    const rec = { uid: S.carNext, id, paint, x, z, yaw };
    S.cars.push(rec);
    return this.spawn(rec);
  }

  remove(car) {
    this.scene.remove(car.group);
    this.list.splice(this.list.indexOf(car), 1);
    this.state.cars.splice(this.state.cars.indexOf(car.rec), 1);
  }

  place(car) {
    const r = car.rec;
    car.group.position.set(r.x, car.y, r.z);
    car.group.rotation.y = r.yaw;
  }

  /** The car you could get into from p (or null). */
  nearest(p, r = 1.4) {
    let best = null;
    let bd = r;
    for (const car of this.list) {
      if (car === this.driving) continue;
      const d = this.distToBody(car, p);
      if (d < bd) {
        bd = d;
        best = car;
      }
    }
    return best;
  }

  distToBody(car, p) {
    const r = car.rec;
    const fx = Math.sin(r.yaw);
    const fz = Math.cos(r.yaw);
    const dx = p.x - r.x;
    const dz = p.z - r.z;
    const lz = dx * fx + dz * fz;
    const lx = dx * fz - dz * fx;
    return Math.hypot(Math.max(0, Math.abs(lx) - car.m.W / 2), Math.max(0, Math.abs(lz) - car.m.L / 2));
  }

  /** Keep a walking person out of parked cars. */
  push(pos, rad) {
    for (const car of this.list) {
      if (car === this.driving) continue;
      const r = car.rec;
      const fx = Math.sin(r.yaw);
      const fz = Math.cos(r.yaw);
      const dx = pos.x - r.x;
      const dz = pos.z - r.z;
      const lz = dx * fx + dz * fz;
      const lx = dx * fz - dz * fx;
      const hw = car.m.W / 2 + rad;
      const hl = car.m.L / 2 + rad;
      if (Math.abs(lx) >= hw || Math.abs(lz) >= hl) continue;
      const px = hw - Math.abs(lx);
      const pz = hl - Math.abs(lz);
      if (px < pz) {
        const s = Math.sign(lx) * px;
        pos.x += fz * s;
        pos.z += -fx * s;
      } else {
        const s = Math.sign(lz) * pz;
        pos.x += fx * s;
        pos.z += fz * s;
      }
    }
  }

  enter(car) {
    this.driving = car;
    car.speed = 0;
    this.startEngine();
  }

  /** Where you get out: the driver's side if there's room, else the other side, else behind. */
  exitSpot(car) {
    const r = car.rec;
    const fx = Math.sin(r.yaw);
    const fz = Math.cos(r.yaw);
    const lx = fz; // the car's left (driver's side, right-hand traffic)
    const lz = -fx;
    const tries = [
      [lx * (car.m.W / 2 + 0.6), lz * (car.m.W / 2 + 0.6)],
      [-lx * (car.m.W / 2 + 0.6), -lz * (car.m.W / 2 + 0.6)],
      [-fx * (car.m.L / 2 + 0.7), -fz * (car.m.L / 2 + 0.7)],
      [fx * (car.m.L / 2 + 0.7), fz * (car.m.L / 2 + 0.7)],
    ];
    for (const [dx, dz] of tries) {
      const p = this._c.set(r.x + dx, 0, r.z + dz);
      const before = p.clone();
      this.colliders.resolveCircle(p, 0.35, this.ground(p.x, p.z));
      if (p.distanceTo(before) < 0.05 && !this.forbidden(p)) return { x: p.x, z: p.z, yaw: r.yaw + Math.PI / 2 };
    }
    return { x: r.x + tries[0][0], z: r.z + tries[0][1], yaw: r.yaw };
  }

  exit() {
    const car = this.driving;
    if (!car) return null;
    this.driving = null;
    car.speed = 0;
    this.stopEngine();
    return this.exitSpot(car);
  }

  // ---------------------------------------------------------------- the radio and the engine
  nextStation() {
    this.station = (this.station + 1) % STATIONS.length;
    const st = STATIONS[this.station];
    if (st.style) this.audio.startMusic(st.style);
    else this.audio.stopMusic();
    return st;
  }

  startEngine() {
    const ctx = this.audio.ctx;
    if (!ctx || this.engine) return;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const o2 = ctx.createOscillator();
    o2.type = 'square';
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    g.gain.setTargetAtTime(0.035, ctx.currentTime, 0.2);
    o.connect(lp);
    o2.connect(lp);
    lp.connect(g).connect(this.audio.master);
    o.start();
    o2.start();
    this.engine = { o, o2, g, lp };
  }

  stopEngine() {
    const e = this.engine;
    if (!e) return;
    const ctx = this.audio.ctx;
    e.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.15);
    setTimeout(() => {
      e.o.stop();
      e.o2.stop();
      e.g.disconnect();
    }, 600);
    this.engine = null;
  }

  // ---------------------------------------------------------------- driving
  /** keys: { thr (-1..1), steer (-1 right..1 left), hand (bool) } */
  drive(dt, keys) {
    const car = this.driving;
    const m = car.m;
    const r = car.rec;
    let v = car.speed;
    const thr = keys.thr;
    // throttle, brakes, reverse
    if (thr > 0.05) {
      if (v < -0.3) v = Math.min(0, v + 14 * dt);
      else v += m.accel * thr * dt * clamp(1.15 - v / m.top, 0, 1);
    } else if (thr < -0.05) {
      if (v > 0.3) v = Math.max(0, v - 16 * -thr * dt);
      else v = Math.max(-m.top * 0.3, v - m.accel * 0.7 * -thr * dt);
    } else v -= v * 0.35 * dt + Math.sign(v) * Math.min(Math.abs(v), 0.6 * dt);
    if (keys.hand) v -= Math.sign(v) * Math.min(Math.abs(v), 9 * dt);
    // steering: lots of lock when slow, less at speed; the handbrake swings the tail
    const lock = 0.6 / (1 + Math.abs(v) * 0.06);
    car.steer = damp(car.steer, keys.steer * lock, 8, dt);
    const wb = m.L * 0.62;
    let yawRate = (v / wb) * Math.tan(car.steer);
    const maxRate = m.grip * (keys.hand ? 1.6 : 1) / Math.max(1, Math.abs(v) * 0.12);
    yawRate = clamp(yawRate, -maxRate, maxRate);
    r.yaw += yawRate * dt;
    const fx = Math.sin(r.yaw);
    const fz = Math.cos(r.yaw);
    r.x += fx * v * dt;
    r.z += fz * v * dt;
    // bump off buildings, lamp posts, other cars; people get out of the way
    let hit = 0;
    const rad = m.W / 2 + 0.05;
    for (const off of [-m.L / 2 + rad, 0, m.L / 2 - rad]) {
      const c = this._c.set(r.x + fx * off, 0, r.z + fz * off);
      const bx = c.x;
      const bz = c.z;
      this.colliders.resolveCircle(c, rad, car.y);
      this.traffic.push(c, rad - 0.2);
      for (const other of this.list) if (other !== car) this.pushOut(c, other, rad);
      this.blockers?.(c, rad);
      const dx = c.x - bx;
      const dz = c.z - bz;
      if (dx || dz) {
        r.x += dx * 0.6;
        r.z += dz * 0.6;
        hit = Math.max(hit, Math.hypot(dx, dz));
        // only slow down if we were driving into it
        if ((dx * fx + dz * fz) * Math.sign(v) < -0.002) v *= 0.55;
      }
    }
    const B = this.bounds;
    if (B) {
      r.x = clamp(r.x, B.x0 + 2, B.x1 - 2);
      r.z = clamp(r.z, B.z0 + 2, B.z1 - 2);
    }
    if (this.forbidden(r)) {
      r.x -= fx * v * dt * 1.5;
      r.z -= fz * v * dt * 1.5;
      v = 0;
      hit = 1;
    }
    // people: walkers jump out of the way, people standing about stop the car
    const W2 = m.W / 2 + 0.4;
    for (const npc of this.peds.list) {
      if (npc.hidden) continue;
      const dx = npc.pos.x - r.x;
      const dz = npc.pos.z - r.z;
      if (dx * dx + dz * dz > 100) continue;
      const lz = dx * fx + dz * fz;
      const lx = dx * fz - dz * fx;
      if (Math.abs(lx) >= W2) continue;
      const body = m.L / 2 + 0.4;
      const fixed = npc.mode === 'stand' || npc.mode === 'talk';
      if (fixed) {
        if (Math.abs(lz) < body) {
          const back = (body - Math.abs(lz)) * Math.sign(lz);
          r.x -= fx * back;
          r.z -= fz * back;
          if (lz * v > 0) v = 0;
        }
        continue;
      }
      const ahead = body + Math.max(0, v) * 0.6;
      const behind = body + Math.max(0, -v) * 0.6;
      if (lz > ahead || lz < -behind) continue;
      const s = lx >= 0 ? 1 : -1;
      const inBody = Math.abs(lz) < body;
      const step = inBody ? W2 - Math.abs(lx) : Math.min(W2 - Math.abs(lx), 7 * dt);
      npc.ox = (npc.ox ?? 0) + fz * s * step;
      npc.oz = (npc.oz ?? 0) - fx * s * step;
      npc.pos.x += fz * s * step;
      npc.pos.z -= fx * s * step;
      if (inBody && Math.abs(v) > 4 && !(npc.yelp > performance.now())) {
        npc.yelp = performance.now() + 4000;
        this.audio.tone(620 + Math.random() * 200, 'triangle', 0.05, 0.18, undefined, 900);
        this.onScare?.(npc);
      }
    }
    car.speed = v;
    if (hit > 0.08 && Math.abs(v) > 2) this.audio.tone(90, 'square', 0.08, 0.15);
    car.y = damp(car.y, this.ground(r.x, r.z), 14, dt);
    // engine note
    const e = this.engine;
    if (e) {
      const rpm = 0.25 + (Math.abs(v) / m.top) * 0.9 + (thr > 0.05 ? 0.08 : 0);
      const base = m.shape === 'super' ? 70 : m.shape === 'limo' ? 38 : 48;
      e.o.frequency.value = base * (1 + rpm * 2.2);
      e.o2.frequency.value = base * 0.5 * (1 + rpm * 2.2);
      e.lp.frequency.value = 300 + rpm * 900;
    }
    return { hit };
  }

  pushOut(c, other, rad) {
    const r = other.rec;
    const fx = Math.sin(r.yaw);
    const fz = Math.cos(r.yaw);
    const dx = c.x - r.x;
    const dz = c.z - r.z;
    const lz = dx * fx + dz * fz;
    const lx = dx * fz - dz * fx;
    const hw = other.m.W / 2 + rad * 0.7;
    const hl = other.m.L / 2 + rad * 0.7;
    if (Math.abs(lx) >= hw || Math.abs(lz) >= hl) return;
    const px = hw - Math.abs(lx);
    const pz = hl - Math.abs(lz);
    if (px < pz) {
      c.x += fz * Math.sign(lx) * px;
      c.z += -fx * Math.sign(lx) * px;
    } else {
      c.x += fx * Math.sign(lz) * pz;
      c.z += fz * Math.sign(lz) * pz;
    }
  }

  /** Every frame: wheels, lights, positions, and where traffic has to stop for them. */
  update(dt, night) {
    const obs = (this.traffic.obstacles ??= []);
    obs.length = 0;
    for (const car of this.list) {
      const r0 = car.rec;
      const fx = Math.sin(r0.yaw);
      const fz = Math.cos(r0.yaw);
      for (const k of [-0.4, 0, 0.4]) obs.push({ x: r0.x + fx * car.m.L * k, z: r0.z + fz * car.m.L * k, you: car === this.driving });
    }
    for (const car of this.list) {
      const r = car.rec;
      if (car !== this.driving) car.y = this.ground(r.x, r.z);
      this.place(car);
      car.spin += (car.speed * dt) / 0.34;
      car.wheels.forEach((w, i) => {
        w.rotation.x = car.spin;
        w.rotation.y = i < 2 ? car.steer : 0;
      });
      const on = car === this.driving;
      car.lightMat.color.setScalar(on ? 0.8 + night * 3.2 : 0.45);
      car.beam.visible = on && night > 0.05;
      car.beamMat.opacity = night * 0.42;
    }
  }

  /** Where the driver's head would be (for the camera) and the seat (for the character). */
  seat(car) {
    const r = car.rec;
    const fx = Math.sin(r.yaw);
    const fz = Math.cos(r.yaw);
    const side = 0.36;
    const m = car.m;
    return { x: r.x + fz * side + fx * m.sz, z: r.z - fx * side + fz * m.sz, y: car.y, h: m.sy };
  }
}

export function kmh(v) {
  return Math.round(Math.abs(v) * 3.6 * 1.6);
}
