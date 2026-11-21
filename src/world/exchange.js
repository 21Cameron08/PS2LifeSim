import * as THREE from 'three';
import { CITY, EXCHANGE_SITE } from '../config.js';
import { GeoBuilder, shade } from '../core/geo.js';
import { damp, smoothstep } from '../core/rng.js';
import { InteriorKit, C } from './interior/kit.js';
import { makeInteriorUniforms } from './interior/bake.js';
import { createExchangeTextures, xsignUV, BigBoard, TickerTape, ClockFaces } from '../render/exchangeTextures.js';
import { additive } from '../render/materials.js';

// HALCYON EXCHANGE, Downtown: a 1920s banking hall behind a stone portico, now a
// brokerage anyone can walk into. Part of the street like the Galleria (no loading
// screen); it builds its own shell.
//
//   x 0                         22        (local metres; z 0 is the back wall,
//   ┌─────────── BIG BOARD ───────┐  z 0    z 18 the front on the street)
//   │ back bar│  desks  desks │agent│
//   │ BAR     │  (terminals)  │desk │
//   │ stools  │  desks  desks │city │
//   │         │               │model│
//   │ booths  │    lobby      │lounge
//   └─────────[ doors ]────────────┘  z 18
//        portico, the bronze gull, the plaza
//
// Open 8 AM to midnight; the market trades 9:30 to 4, Monday to Friday.

const W = 22;
const D = 18;
const H = 9;
const ROOF = H + 1.2;
const DOOR = [9.8, 12.2];
const R90 = Math.PI / 2;
const PI = Math.PI;
export const exchangeOpen = (h) => h >= 8;

export class Exchange {
  constructor(scene, city, cityTex, interiorTex) {
    this.scene = scene;
    this.city = city;
    const site = city.exchangeSite;
    this.site = site;
    this.origin = new THREE.Vector3(site.x0 + 1.0, CITY.CURB + EXCHANGE_SITE.floorLift, site.z0 + 0.5);
    this.W = W;
    this.D = D;
    this.H = H;
    this.cityTex = cityTex;
    this.xt = createExchangeTextures();
    this.group = new THREE.Group();
    this.outside = new THREE.Group();
    scene.add(this.group, this.outside);
    this.uniforms = makeInteriorUniforms();
    this.tex = { ...interiorTex, ...this.xt.kit };
    this.open = true;

    // things other systems use (world positions)
    this.terminals = []; // { seat: { x, z, y, yaw, out }, k }
    this.stools = []; // bar stools: seats
    this.booths = []; // booth seats
    this.loungeSeats = [];
    this.standSpots = []; // where brokers stand and talk: { x, z, y, yaw }
    this.staffSpots = {};
    this.screens = new GeoBuilder(); // the terminals' green screens (unlit)

    const kit = new InteriorKit({ origin: this.origin, W, D, H, tex: this.tex, uniforms: this.uniforms });
    this.kit = kit;
    this.buildInterior(kit);
    kit.build(this.group, {}, { fog: true });
    for (const b of kit.colliders.boxes) city.colliders.add(b.x0, b.z0, b.x1, b.z1, b.y0, b.y1);
    this.fixtures = kit.lights;
    this.buildLive();
    this.buildExterior();
    this.buildDoors();
  }

  w(x, z, y = 0) {
    return new THREE.Vector3(this.origin.x + x, this.origin.y + y, this.origin.z + z);
  }

  local(p) {
    return { x: p.x - this.origin.x, z: p.z - this.origin.z, y: p.y - this.origin.y };
  }

  contains(p, pad = 0) {
    const { x, z, y } = this.local(p);
    return x > -pad && x < W + pad && z > -pad && z < D + pad && y < H;
  }

  /** On the steps and plaza out front? */
  onPlaza(p) {
    const { x, z } = this.local(p);
    return x > -1 && x < W + 1 && z > D + 0.3 && p.z < this.site.z1 + 0.5;
  }

  /** Which part of the hall p is in: 'bar' | 'floor' | 'property' | 'lobby' | null */
  zoneAt(p) {
    if (!this.contains(p)) return null;
    const { x, z } = this.local(p);
    if (x < 4.6) return 'bar';
    if (x > 17.4) return 'property';
    if (z > 12.6) return 'lobby';
    return 'floor';
  }

  // ==========================================================================
  buildInterior(kit) {
    const P = (x, z, r = 0, y = 0) => kit.place(x, z, r, y);
    const walnut = C('#4a2e1e');
    const brass = C('#c8a050');
    const cream = C('#e8dcc4');

    kit.room('hall', 0, 0, W, D, {
      floor: 'marble',
      floorColor: '#d8cfbe',
      wall: 'plaster',
      wallColor: '#e6dcc6',
      wainscot: { key: 'wood', h: 1.2, color: '#5a3a24', cap: '#b8904a' },
      ceil: '#e8dfcc',
      ceilKey: 'plaster',
      base: '#2a1a10',
      trim: '#b8904a',
      zone: 'hall',
    });

    // ---------------------------------------------------------------- walls
    const win = (y0, y1, grid = [2, 4]) => ({ y0, y1, kind: 'window', grid, frame: '#3a3020', trim: '#b8904a' });
    kit.wall('x', 0, 0, W, { t: 0.3, ext: -1 });
    kit.wall('z', 0, 0, D, { t: 0.3, ext: -1 });
    kit.wall('z', W, 0, D, { t: 0.3, ext: 1 });
    kit.wall('x', D, 0, W, {
      t: 0.3,
      ext: 1,
      open: [
        { from: 1.2, to: 3.8, ...win(1.1, 6.6) },
        { from: 5.0, to: 7.6, ...win(1.1, 6.6) },
        { from: DOOR[0], to: DOOR[1], gaps: [{ y0: 0, y1: 3.4, kind: 'opening', trim: '#b8904a' }, win(3.9, 6.6, [2, 2])] },
        { from: 14.4, to: 17.0, ...win(1.1, 6.6) },
        { from: 18.2, to: 20.8, ...win(1.1, 6.6) },
      ],
    });

    // ---------------------------------------------------------------- the hall: columns, coffers, chandeliers
    for (const x of [5.0, 17.0])
      for (const z of [3.6, 8.0, 12.2]) {
        const Cl = P(x, z);
        Cl.box('marble', -0.45, 0, -0.45, 0.45, 0.25, 0.45, C('#c8bca8'));
        Cl.geo('marble', new THREE.CylinderGeometry(0.3, 0.33, H - 0.75, 16, 1, true), 0, 0.25 + (H - 0.75) / 2, 0, C('#e8e0d0'));
        Cl.box('solid', -0.42, H - 0.5, -0.42, 0.42, H, 0.42, C('#d8ccb0'), { bottom: true });
        Cl.box('solid', -0.36, H - 0.56, -0.36, 0.36, H - 0.5, 0.36, brass, { bottom: true });
        Cl.collide(-0.45, -0.45, 0.45, 0.45, H);
      }
    // coffered ceiling: beams across the room, short ribs between them
    const xs = [2.75, 5.5, 8.25, 11, 13.75, 16.5, 19.25];
    for (const x of xs) P(x, 0).box('solid', -0.14, H - 0.36, 0.0, 0.14, H, D, cream, { bottom: true });
    for (let k = 0; k <= xs.length; k++) {
      const a = k === 0 ? 0 : xs[k - 1] + 0.14;
      const b = k === xs.length ? W : xs[k] - 0.14;
      for (const z of [3.6, 8.0, 12.2, 15.6]) P(0, z).box('solid', a, H - 0.3, -0.12, b, H, 0.12, cream, { bottom: true });
    }
    // three brass chandeliers over the floor
    for (const z of [4.4, 9.0, 13.8]) {
      const Ch = P(11, z);
      Ch.box('solid', -0.01, 6.0, -0.01, 0.01, H - 0.36, 0.01, brass);
      Ch.geo('solid', new THREE.TorusGeometry(0.8, 0.04, 6, 24), 0, 5.9, 0, brass, 0, 1, 1, 1, R90);
      Ch.geo('solid', new THREE.TorusGeometry(0.45, 0.03, 6, 18), 0, 6.15, 0, brass, 0, 1, 1, 1, R90);
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        Ch.geo('glow', new THREE.SphereGeometry(0.07, 6, 5), Math.cos(a) * 0.8, 6.02, Math.sin(a) * 0.8, C('#fff0d0'));
      }
      Ch.light(0, 5.6, 0, '#ffe4b8', 0.85);
    }
    // sconces down the side walls
    for (const [x, r, z] of [
      [0.0, R90, 2.0],
      [0.0, R90, 14.6],
      [W, -R90, 2.0],
      [W, -R90, 10.4],
      [W, -R90, 14.6],
    ]) {
      const Sc = P(x, z, r);
      Sc.box('solid', -0.08, 2.4, 0, 0.08, 2.75, 0.06, brass);
      Sc.geo('glow', new THREE.CylinderGeometry(0.1, 0.07, 0.18, 10, 1, true), 0, 2.85, 0.16, C('#ffe8c0', 0.9));
      Sc.light(0, 2.9, 0.4, '#ffd8a0', 0.16);
    }

    // ---------------------------------------------------------------- the big board, the ticker crawl, the clocks
    const Bd = P(11, 0);
    Bd.box('wood', -5.95, 3.12, 0, 5.95, 7.04, 0.14, walnut);
    Bd.box('solid', -6.05, 3.02, 0, 6.05, 3.12, 0.18, brass, { bottom: true });
    Bd.box('solid', -6.05, 7.04, 0, 6.05, 7.14, 0.18, brass, { bottom: true });
    Bd.box('wood', -8.45, 2.28, 0, 8.45, 2.84, 0.1, C('#1a1210'));
    Bd.box('wood', -1.6, 7.28, 0, 1.6, 8.56, 0.08, walnut);
    Bd.light(0, 5.0, 1.6, '#c8ffd8', 0.3);
    this.boardAt = { x: 11, y0: 3.3, y1: 6.86, w: 11.4, z: 0.146 };
    this.tickerAt = { x: 11, y0: 2.34, y1: 2.78, w: 16.6, z: 0.106 };
    this.clocksAt = { x: 11, y0: 7.34, y1: 8.5, w: 2.78, z: 0.086 };

    // ---------------------------------------------------------------- the trading floor: four desks, eight terminals
    let k = 0;
    for (const z of [6.9, 10.1])
      for (const x of [7.7, 14.3]) {
        const Dk = P(x, z);
        Dk.box('wood', -2.0, 0, -0.4, 2.0, 0.72, 0.4, walnut);
        Dk.box('solid', -2.04, 0.72, -0.44, 2.04, 0.76, 0.44, C('#2a1a10'), { bottom: true });
        Dk.box('fabric', -1.9, 0.76, -0.3, 1.9, 0.765, 0.36, C('#1e4a2e'));
        Dk.collide(-2.04, -0.44, 2.04, 0.44, 0.9);
        Dk.shadow(-2.04, -0.44, 2.04, 0.44, 0.35);
        for (const sx of [-1.0, 1.0]) {
          // a terminal: a beige box with a green screen, facing the trader
          const T = P(x + sx, z - 0.12, 0, 0.765);
          T.box('solid', -0.26, 0.0, -0.22, 0.26, 0.04, 0.22, C('#c8c0a8'));
          T.box('solid', -0.24, 0.04, -0.2, 0.24, 0.42, 0.18, C('#d8d0b8'));
          T.box('solid', -0.2, 0.0, 0.26, 0.2, 0.02, 0.4, C('#c8c0a8'));
          const sw = this.w(x + sx, z - 0.12 + 0.186, 0.765);
          const uv = xsignUV('terminal');
          this.screens.quad([sw.x - 0.2, sw.y + 0.08, sw.z], [sw.x + 0.2, sw.y + 0.08, sw.z], [sw.x + 0.2, sw.y + 0.38, sw.z], [sw.x - 0.2, sw.y + 0.38, sw.z], [0, 0, 1], uv);
          // an office chair behind it
          const Cr = P(x + sx, z + 0.9);
          Cr.geo('solid', new THREE.CylinderGeometry(0.24, 0.24, 0.03, 10), 0, 0.03, 0, C('#2a2a2e'));
          Cr.geo('solid', new THREE.CylinderGeometry(0.025, 0.025, 0.4, 6), 0, 0.24, 0, C('#8a8c90'));
          Cr.box('fabric', -0.24, 0.44, -0.24, 0.24, 0.52, 0.24, C('#3a1a14'));
          Cr.box('fabric', -0.22, 0.52, 0.2, 0.22, 1.0, 0.27, C('#3a1a14'));
          const s = this.w(x + sx, z + 0.9);
          const out = this.w(x + sx + (sx > 0 ? 0.6 : -0.6), z + 1.3);
          this.terminals.push({ k: k++, seat: { x: s.x, z: s.z, y: this.origin.y, yaw: PI, out: { x: out.x, z: out.z }, seatH: 0.5 } });
        }
        // a green banker's lamp between the two
        const Lp = P(x, z - 0.2, 0, 0.765);
        Lp.geo('solid', new THREE.CylinderGeometry(0.07, 0.08, 0.02, 10), 0, 0.01, 0, brass);
        Lp.box('solid', -0.008, 0.02, -0.008, 0.008, 0.3, 0.008, brass);
        Lp.geo('glow', new THREE.CylinderGeometry(0.05, 0.12, 0.08, 10, 1, true), 0, 0.33, 0.02, C('#3a9a5a', 0.85), 0, 1, 1, 1, 0.3);
        Lp.light(0, 0.3, 0.1, '#c8ffc0', 0.1);
      }
    // brass stanchions and a rope round the floor
    P(6.0, 12.6).panel('xSigns', -0.6, 0.85, 0.6, 1.0, 0.026, xsignUV('floor'));
    for (const x of [5.4, 6.6]) P(x, 12.6).geo('solid', new THREE.CylinderGeometry(0.03, 0.05, 0.95, 8), 0, 0.475, 0, brass);
    P(6.0, 12.6).box('solid', -0.6, 0.78, -0.012, 0.6, 1.07, 0.012, C('#2a1a10'));

    // ---------------------------------------------------------------- the Ticker Bar (west)
    const Bar = P(0, 0);
    Bar.box('wood', 2.5, 0, 3.6, 3.2, 1.05, 11.6, walnut);
    Bar.box('marble', 2.42, 1.05, 3.52, 3.36, 1.1, 11.68, C('#3a2a24'), { bottom: true });
    Bar.box('solid', 3.3, 0.14, 3.6, 3.34, 0.18, 11.6, brass);
    for (let z = 4.0; z < 11.4; z += 1.2) Bar.box('wood', 3.2, 0.2, z, 3.21, 0.95, z + 0.9, C('#5a3a28'));
    Bar.collide(2.42, 3.52, 3.36, 11.68, 1.1);
    Bar.shadow(2.42, 3.52, 3.36, 11.68, 0.35);
    // the back bar: a cabinet, a mirror, lit shelves of bottles
    Bar.box('wood', 0.0, 0, 3.8, 0.55, 0.95, 11.4, walnut);
    Bar.box('marble', 0.0, 0.95, 3.76, 0.6, 0.99, 11.44, C('#3a2a24'), { bottom: true });
    P(0.005, 7.6, R90).panel('mirror', -3.6, 1.28, 3.6, 2.45, 0.0, [0, 0, 1, 1]);
    for (let r = 0; r < 3; r++) {
      Bar.box('solid', 0.0, 1.3 + r * 0.42, 3.8, 0.32, 1.33 + r * 0.42, 11.4, brass, { bottom: true });
      Bar.box('glow', 0.012, 1.335 + r * 0.42, 3.85, 0.018, 1.36 + r * 0.42, 11.35, C('#8a5a20', 0.8));
      for (let z = 4.0; z < 11.3; z += 0.22) {
        const col = ['#3a6a3a', '#a8844a', '#e8e4dc', '#6a2a2a', '#2a3a6a'][Math.floor(z * 7 + r) % 5];
        Bar.geo('solid', new THREE.CylinderGeometry(0.035, 0.035, 0.24 + ((z * 13) % 3) * 0.03, 6), 0.17, 1.33 + r * 0.42 + 0.13, z, C(col));
      }
    }
    Bar.collide(0, 3.76, 0.6, 11.44, 2.4);
    P(0.0, 7.6, R90).panel('xSigns', -1.5, 2.62, 1.5, 3.37, 0.006, xsignUV('bar'));
    P(0.0, 12.6, R90).panel('xSigns', -0.45, 1.35, 0.45, 2.7, 0.006, xsignUV('menu'));
    for (const z of [4.8, 7.6, 10.4]) {
      const Pd = P(2.75, z);
      Pd.box('solid', -0.005, 3.0, -0.005, 0.005, H - 0.36, 0.005, brass);
      Pd.geo('glow', new THREE.SphereGeometry(0.16, 10, 8), 0, 2.85, 0, C('#ffd890', 0.95));
      Pd.light(0, 2.6, 0, '#ffc880', 0.32);
    }
    this.staffSpots.walt = { ...xz(this.w(1.4, 7.6)), y: this.origin.y, yaw: R90 };
    this.barSpot = { ...xz(this.w(3.9, 7.6)), y: this.origin.y };
    // stools along the bar
    for (const z of [4.4, 5.5, 6.6, 9.0, 10.1, 11.2]) {
      const St = P(3.85, z);
      St.geo('fabric', new THREE.CylinderGeometry(0.19, 0.19, 0.06, 12), 0, 0.76, 0, C('#5a1a1a'));
      St.geo('solid', new THREE.CylinderGeometry(0.025, 0.025, 0.73, 6), 0, 0.37, 0, brass);
      St.geo('solid', new THREE.TorusGeometry(0.15, 0.012, 4, 14), 0, 0.3, 0, brass, 0, 1, 1, 1, R90);
      St.geo('solid', new THREE.CylinderGeometry(0.2, 0.22, 0.02, 12), 0, 0.01, 0, brass);
      const s = this.w(3.85, z);
      const out = this.w(4.6, z);
      this.stools.push({ x: s.x, z: s.z, y: this.origin.y, yaw: -R90, out: { x: out.x, z: out.z }, seatH: 0.79, stool: true });
    }
    // a booth by the front window
    const Bo = P(0, 0);
    Bo.box('wood', 0.9, 0, 14.9, 2.9, 0.72, 16.1, walnut);
    Bo.box('marble', 0.85, 0.72, 14.85, 2.95, 0.76, 16.15, C('#3a2a24'), { bottom: true });
    for (const [z0, z1, back0, back1] of [
      [13.75, 14.45, 13.45, 13.75],
      [16.55, 17.25, 17.25, 17.55],
    ]) {
      Bo.box('fabric', 0.4, 0, z0, 3.4, 0.46, z1, C('#5a1a1a'));
      Bo.box('fabric', 0.4, 0, back0, 3.4, 1.25, back1, C('#4a1414'));
      Bo.collide(0.4, Math.min(z0, back0), 3.4, Math.max(z1, back1), 1.25);
    }
    Bo.collide(0.85, 14.85, 2.95, 16.15, 0.76);
    for (const [z, yaw] of [
      [14.1, 0],
      [16.9, PI],
    ])
      for (const x of [1.4, 2.6]) {
        const s = this.w(x, z);
        const out = this.w(3.9, z);
        this.booths.push({ x: s.x, z: s.z, y: this.origin.y, yaw, out: { x: out.x, z: out.z }, seatH: 0.5 });
      }
    P(1.9, 15.5).light(0, 2.4, 0, '#ffd8a0', 0.3);
    P(1.9, 15.5).geo('glow', new THREE.SphereGeometry(0.14, 8, 6), 0, 2.4, 0, C('#ffd890'));
    P(1.9, 15.5).box('solid', -0.005, 2.54, -0.005, 0.005, H - 0.3, 0.005, brass);

    // ---------------------------------------------------------------- the property desk (east)
    const Ag = P(19.2, 5.0);
    Ag.box('wood', -0.4, 0, -0.95, 0.4, 0.74, 0.95, walnut);
    Ag.box('solid', -0.43, 0.74, -0.98, 0.43, 0.78, 0.98, C('#1a2a3a'), { bottom: true });
    Ag.box('solid', -0.15, 0.78, -0.6, 0.05, 0.8, -0.2, C('#f2efe6'));
    Ag.box('solid', -0.2, 0.78, 0.2, 0.2, 0.82, 0.6, C('#2a2a2e'));
    Ag.geo('solid', new THREE.CylinderGeometry(0.07, 0.08, 0.02, 10), 0.1, 0.79, 0.72, brass);
    Ag.box('solid', 0.09, 0.8, 0.71, 0.11, 1.1, 0.73, brass);
    Ag.geo('glow', new THREE.CylinderGeometry(0.05, 0.12, 0.08, 10, 1, true), 0.05, 1.12, 0.72, C('#3a9a5a', 0.85));
    Ag.light(0, 1.2, 0.5, '#fff0d0', 0.18);
    Ag.collide(-0.43, -0.98, 0.43, 0.98, 0.8);
    Ag.shadow(-0.43, -0.98, 0.43, 0.98, 0.3);
    // her chair, and two leather chairs for clients
    P(20.25, 5.0).box('fabric', -0.25, 0.44, -0.25, 0.25, 0.52, 0.25, C('#1a1a1e')).box('fabric', 0.2, 0.52, -0.22, 0.27, 1.05, 0.22, C('#1a1a1e'));
    for (const z of [4.4, 5.6]) {
      const Cc = P(18.1, z, R90);
      Cc.box('fabric', -0.3, 0.2, -0.3, 0.3, 0.45, 0.3, C('#5a3a24'));
      Cc.box('fabric', -0.3, 0.45, -0.33, 0.3, 0.95, -0.22, C('#5a3a24'));
      for (const sx of [-0.34, 0.28]) Cc.box('fabric', sx, 0.2, -0.32, sx + 0.06, 0.65, 0.32, C('#4a2e1e')); // arms stand proud of the seat (no shared faces)
      Cc.collide(-0.33, -0.33, 0.33, 0.3, 0.9);
      const s = this.w(18.1, z);
      this.loungeSeats.push({ x: s.x, z: s.z, y: this.origin.y, yaw: R90, out: { x: s.x - 0.8, z: s.z }, seatH: 0.48, client: true });
    }
    this.staffSpots.priya = { ...xz(this.w(20.25, 5.0)), y: this.origin.y, yaw: -R90 };
    this.agentSpot = { ...xz(this.w(17.7, 5.0)), y: this.origin.y };
    P(W, 5.0, -R90).panel('xSigns', -1.3, 2.5, 1.3, 2.99, 0.006, xsignUV('property'));
    P(W, 8.4, -R90).panel('xSigns', -1.3, 1.45, 1.3, 3.4, 0.026, xsignUV('listings'));
    P(W, 8.4, -R90).box('wood', -1.38, 1.37, 0, 1.38, 3.48, 0.02, walnut);
    // the city model on its plinth (the buildings themselves are built live: see buildLive)
    const Md = P(19.4, 10.9);
    Md.box('wood', -1.15, 0, -1.15, 1.15, 0.85, 1.15, C('#2a1a10'));
    Md.box('solid', -1.18, 0.85, -1.18, 1.18, 0.87, 1.18, brass, { bottom: true });
    Md.box('glass', -1.12, 0.87, -1.12, 1.12, 1.27, 1.12, C('#ffffff'));
    Md.collide(-1.18, -1.18, 1.18, 1.18, 1.3);
    Md.shadow(-1.18, -1.18, 1.18, 1.18, 0.4);
    Md.light(0, 2.6, 0, '#fff4e0', 0.3, true);
    this.modelAt = { ...xz(this.w(19.4, 10.9)), y: this.origin.y + 0.875, size: 2.16 };
    // the lounge: two armchairs and a fern by the front window
    for (const [x, z, r] of [
      [18.8, 15.8, R90],
      [20.9, 15.0, PI],
    ]) {
      const A = P(x, z, r);
      A.box('fabric', -0.42, 0.2, -0.4, 0.42, 0.45, 0.4, C('#3a2418'));
      A.box('fabric', -0.42, 0.45, -0.42, 0.42, 1.0, -0.28, C('#3a2418'));
      for (const sx of [-0.46, 0.36]) A.box('fabric', sx, 0.2, -0.43, sx + 0.1, 0.68, 0.42, C('#2e1c12'));
      A.collide(-0.42, -0.42, 0.42, 0.4, 0.9);
      const s = A.point(0, 0, 0.05);
      const out = A.point(0, 0, 0.9);
      this.loungeSeats.push({ x: s.x, z: s.z, y: this.origin.y, yaw: r, out: { x: out.x, z: out.z }, seatH: 0.48 });
    }
    P(21.2, 16.9).geo('solid', new THREE.CylinderGeometry(0.28, 0.22, 0.5, 10), 0, 0.25, 0, brass).geo('solid', new THREE.IcosahedronGeometry(0.5, 0), 0, 0.95, 0, C('#3a6a3a'), 0, 1, 0.8, 1).collide(-0.3, -0.3, 0.3, 0.3, 1.2);

    // ---------------------------------------------------------------- the lobby: palms by the doors, the welcome board
    for (const x of [8.9, 13.1]) {
      const Pm = P(x, 17.2);
      Pm.geo('solid', new THREE.CylinderGeometry(0.3, 0.24, 0.6, 12), 0, 0.3, 0, brass);
      Pm.geo('solid', new THREE.CylinderGeometry(0.05, 0.07, 1.4, 6), 0, 1.3, 0, C('#6a5a40'));
      for (let k = 0; k < 7; k++) Pm.geo('solid', new THREE.BoxGeometry(0.9, 0.02, 0.22), Math.cos(k) * 0.4, 2.0 - (k % 2) * 0.12, Math.sin(k) * 0.4, C('#3a7a3a'), k * 0.9, 1, 1, 1, 0, -0.35);
      Pm.collide(-0.32, -0.32, 0.32, 0.32, 2.2);
    }
    const Wb = P(7.6, 15.6, R90 * 0.5);
    for (const sx of [-0.55, 0.55]) Wb.box('wood', sx - 0.03, 0, -0.03, sx + 0.03, 1.6, 0.03, walnut);
    Wb.box('wood', -0.62, 1.0, -0.02, 0.62, 1.32, 0.02, walnut);
    Wb.panel('xSigns', -0.6, 1.02, 0.6, 1.3, 0.026, xsignUV('welcome'));
    Wb.collide(-0.6, -0.1, 0.6, 0.1, 1.6);
    this.staffSpots.gus = { ...xz(this.w(13.4, 16.6)), y: this.origin.y, yaw: -R90 * 0.6 };

    // ---------------------------------------------------------------- where brokers stand and talk
    for (const [x, z, yaw] of [
      [9.0, 4.4, PI],
      [12.6, 4.0, PI],
      [14.8, 4.5, PI],
      [5.6, 6.3, -R90],
      [5.7, 10.4, -R90],
      [10.4, 13.6, 0],
      [11.6, 13.9, PI],
      [16.0, 14.4, -R90 * 0.5],
    ])
      this.standSpots.push({ ...xz(this.w(x, z)), y: this.origin.y, yaw });

    // daylight from the front windows reaches further than the room's shape suggests
    const o = this.origin;
    kit.windows.push({ x: o.x + 11, y: o.y + 7.5, z: o.z + D - 0.5, nx: 0, nz: -1, area: 6 });
  }

  // ==========================================================================
  /** The live parts: the board, the crawl, the clocks, the terminals' screens, the city model. */
  buildLive() {
    const o = this.origin;
    this.board = new BigBoard();
    this.tape = new TickerTape();
    this.clocks = new ClockFaces();
    const quad = (at, tex) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(at.w, at.y1 - at.y0), new THREE.MeshBasicMaterial({ map: tex, fog: false }));
      m.position.set(o.x + at.x, o.y + (at.y0 + at.y1) / 2, o.z + at.z);
      this.group.add(m);
      return m;
    };
    this.boardMesh = quad(this.boardAt, this.board.tex);
    this.tapeMesh = quad(this.tickerAt, this.tape.tex);
    this.tape.tex.repeat.x = this.tickerAt.w / (this.tickerAt.y1 - this.tickerAt.y0) / 32;
    this.clockMesh = quad(this.clocksAt, this.clocks.tex);
    this.screenMat = new THREE.MeshBasicMaterial({ map: this.xt.xsigns, fog: false });
    this.group.add(new THREE.Mesh(this.screens.build(), this.screenMat));
    this.modelGroup = new THREE.Group();
    this.group.add(this.modelGroup);
    this.boardT = 0;
    this.tapeT = 0;
    this.clockMin = -1;
  }

  /**
   * The city model under glass: every building, scaled down; highlights is a list of
   * { x0, z0, x1, z1, top, col } (properties for sale or owned) drawn lit up.
   */
  setModel(highlights = []) {
    const M = this.modelAt;
    const span = CITY.N * CITY.PITCH + CITY.ROAD;
    const s = M.size / span;
    for (const m of this.modelGroup.children) m.geometry.dispose();
    this.modelGroup.clear();
    const b = new GeoBuilder();
    const g = new GeoBuilder();
    const lit = (f) => highlights.find((h) => Math.abs(h.x0 - f.x0) < 0.01 && Math.abs(h.z0 - f.z0) < 0.01);
    const put = (B, f, col) => B.box(M.x + f.x0 * s, M.y, M.z + f.z0 * s, M.x + f.x1 * s, M.y + Math.max(0.006, f.top * s * 0.6), M.z + f.z1 * s, { color: shade(col), bottom: false });
    // the ground: blocks as pale slabs, the park green
    for (const bl of this.city.blocks) {
      const col = bl.kind === 'park' ? '#5a8a4a' : bl.kind === 'lantern' ? '#6a4a8a' : '#b8b0a0';
      b.box(M.x + bl.x0 * s, M.y, M.z + bl.z0 * s, M.x + bl.x1 * s, M.y + 0.002, M.z + bl.z1 * s, { color: shade(col), bottom: false });
    }
    const sites = [
      [this.city.clubSite, 9, '#5a3a6e'],
      [this.city.gullysSite, 6, '#17a2a8'],
      [this.city.galleriaSite, 10, '#d8c8a8'],
      [this.city.exchangeSite, 10.5, '#d8b46a'],
    ];
    for (const [st, top, col] of sites) if (st) put(b, { ...st, top }, col);
    for (const f of this.city.footprints) {
      const h = lit(f);
      if (h) put(g, f, h.col);
      else put(b, f, '#e8e0d0');
    }
    this.modelGroup.add(new THREE.Mesh(b.build(), new THREE.MeshLambertMaterial({ vertexColors: true })));
    if (!g.empty) this.modelGroup.add(new THREE.Mesh(g.build(), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })));
  }

  // ==========================================================================
  buildExterior() {
    const o = this.origin;
    const s = this.site;
    const lx = (x) => o.x + x;
    const ly = (y) => o.y + y;
    const Zf = o.z + D + 0.3;
    const Yb = CITY.CURB;
    this.Zf = Zf;
    // --- the shell: granite plinth, limestone, a cornice band
    const shell = new GeoBuilder();
    const bands = [
      [Yb, ly(0.7), '#4a4644'],
      [ly(0.7), ly(H + 0.4), '#e0d6c0'],
      [ly(H + 0.4), ly(ROOF), '#cfc2a4'],
    ];
    const S = 3;
    const face = (ax, az, bx, bz, y0, y1, n) => {
      for (const [b0, b1, col] of bands) {
        const ya = Math.max(y0, b0);
        const yb = Math.min(y1, b1);
        if (yb - ya < 0.001) continue;
        const len = Math.hypot(bx - ax, bz - az);
        const u0 = n[2] ? (n[2] > 0 ? ax : -ax) : n[0] > 0 ? -az : az;
        shell.quad([ax, ya, az], [bx, ya, bz], [bx, yb, bz], [ax, yb, az], n, [u0 / S, ya / S, (u0 + len) / S, yb / S], shade(col));
      }
    };
    const holes = [
      [1.2, 3.8, 1.1, 6.6],
      [5.0, 7.6, 1.1, 6.6],
      [DOOR[0], DOOR[1], 0, 3.4],
      [DOOR[0], DOOR[1], 3.9, 6.6],
      [14.4, 17.0, 1.1, 6.6],
      [18.2, 20.8, 1.1, 6.6],
    ];
    for (const [x0, x1, y0, y1] of solidAround(-0.3, W + 0.3, 0, ROOF, holes)) face(lx(x0), Zf, lx(x1), Zf, y0 <= 0 ? Yb : ly(y0), ly(y1), [0, 0, 1]);
    face(lx(W + 0.3), o.z - 0.3, lx(-0.3), o.z - 0.3, Yb, ly(ROOF), [0, 0, -1]);
    face(lx(-0.3), o.z - 0.3, lx(-0.3), Zf, Yb, ly(ROOF), [-1, 0, 0]);
    face(lx(W + 0.3), Zf, lx(W + 0.3), o.z - 0.3, Yb, ly(ROOF), [1, 0, 0]);
    this.outside.add(new THREE.Mesh(shell.build(), new THREE.MeshLambertMaterial({ map: this.tex.plaster.map, vertexColors: true })));

    const st = new GeoBuilder();
    const box = (x0, y0, z0, x1, y1, z1, col, op = {}) => st.box(x0, y0, z0, x1, y1, z1, { color: shade(col), bottom: true, ...op });
    // roof, parapet, cornice, window surrounds
    box(lx(-0.27), ly(H + 0.36), o.z - 0.27, lx(W + 0.27), ly(H + 0.5), Zf - 0.03, '#8a8a88');
    box(lx(-0.4), ly(H + 0.4), Zf, lx(W + 0.4), ly(H + 0.6), Zf + 0.25, '#d8ccb0');
    box(lx(-0.4), ly(ROOF), o.z - 0.4, lx(W + 0.4), ly(ROOF + 0.15), Zf + 0.1, '#d8ccb0');
    for (const [x0, x1] of [
      [1.2, 3.8],
      [5.0, 7.6],
      [14.4, 17.0],
      [18.2, 20.8],
    ]) {
      box(lx(x0 - 0.2), ly(6.6), Zf, lx(x1 + 0.2), ly(7.0), Zf + 0.14, '#d8ccb0'); // a pediment-ish hood over each window
      box(lx(x0 - 0.15), ly(0.95), Zf, lx(x1 + 0.15), ly(1.1), Zf + 0.16, '#cfc2a4'); // the sill
    }
    // the portico: four columns, an entablature with the name carved in, a pediment
    const P0 = CITY.CURB + 0.03;
    const col = this.city.colliders;
    const colGeo = new THREE.CylinderGeometry(0.38, 0.44, ly(7.4) - P0 - 0.5, 16, 1, true);
    for (const x of [6.6, 9.4, 12.6, 15.4]) {
      const cx = lx(x);
      const cz = Zf + 1.6;
      box(cx - 0.55, P0, cz - 0.55, cx + 0.55, P0 + 0.3, cz + 0.55, '#c8bca8');
      st.addGeometry(colGeo, new THREE.Matrix4().makeTranslation(cx, P0 + 0.3 + (ly(7.4) - P0 - 0.5) / 2, cz), shade('#e8e0d0'));
      box(cx - 0.5, ly(7.2), cz - 0.5, cx + 0.5, ly(7.4), cz + 0.5, '#d8ccb0');
      col.add(cx - 0.5, cz - 0.5, cx + 0.5, cz + 0.5, 0, ly(7.4));
    }
    box(lx(5.6), ly(7.4), Zf, lx(16.4), ly(8.6), Zf + 2.2, '#e0d6c0');
    box(lx(5.5), ly(8.6), Zf, lx(16.5), ly(8.75), Zf + 2.3, '#d8ccb0');
    // the pediment: a stone triangle over the entablature
    const ped = new GeoBuilder();
    const zf = Zf + 2.3;
    const yA = ly(8.75);
    const yB = ly(10.4);
    ped.quad([lx(5.5), yA, zf], [lx(16.5), yA, zf], [lx(11), yB, zf], [lx(11), yB, zf], [0, 0, 1], [0, 0, 1, 1], shade('#e0d6c0'));
    ped.quad([lx(5.5), yA, Zf], [lx(5.5), yA, zf], [lx(11), yB, zf], [lx(11), yB, Zf], [-0.29, 0.96, 0], [0, 0, 1, 1], shade('#a8a090'));
    ped.quad([lx(16.5), yA, zf], [lx(16.5), yA, Zf], [lx(11), yB, Zf], [lx(11), yB, zf], [0.29, 0.96, 0], [0, 0, 1, 1], shade('#a8a090'));
    this.outside.add(new THREE.Mesh(ped.build(), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));
    // plaza paving, two lanterns on posts, the bronze gull on its plinth
    const pz = new GeoBuilder();
    pz.box(s.x0, CITY.CURB, Zf, s.x1, P0, s.z1, { sx: 3, sy: 3, topScale: 3, bottom: false });
    this.outside.add(new THREE.Mesh(pz.build(), new THREE.MeshLambertMaterial({ map: this.tex.marble.map, color: '#cfc8bc' })));
    this.lanterns = [];
    for (const x of [4.6, 17.4]) {
      box(lx(x) - 0.06, P0, Zf + 2.2, lx(x) + 0.06, P0 + 3.2, Zf + 2.32, '#2a2a2a');
      col.add(lx(x) - 0.15, Zf + 2.1, lx(x) + 0.15, Zf + 2.4, 0, 3.4);
      this.lanterns.push(new THREE.Vector3(lx(x), P0 + 3.35, Zf + 2.26));
    }
    const gx = lx(2.6);
    const gz = Zf + 2.0;
    box(gx - 0.55, P0, gz - 0.5, gx + 0.55, P0 + 1.0, gz + 0.5, '#4a4644');
    col.add(gx - 0.6, gz - 0.55, gx + 0.6, gz + 0.55, 0, P0 + 2.0);
    this.gull = { x: gx, z: gz + 0.95, y: CITY.CURB, look: new THREE.Vector3(gx, P0 + 1.4, gz) };
    this.outside.add(new THREE.Mesh(st.build(), new THREE.MeshLambertMaterial({ vertexColors: true })));
    this.outside.add(this.bronzeGull(gx, P0 + 1.0, gz));

    // --- signs: the name in the frieze, EST. 1921, the hours, the gull's plaque
    const signTex = this.xt.xsigns;
    this.signMat = new THREE.MeshLambertMaterial({ map: signTex, emissive: '#ffffff', emissiveMap: signTex, emissiveIntensity: 0.15 });
    const sq = new GeoBuilder();
    const sign = (key, x0, x1, ya, yb, z) => sq.quad([x0, ya, z], [x1, ya, z], [x1, yb, z], [x0, yb, z], [0, 0, 1], xsignUV(key));
    sign('pediment', lx(7.0), lx(15.0), ly(7.5), ly(8.5), Zf + 2.206);
    sign('est', lx(13.0), lx(15.2), ly(3.55), ly(3.82), Zf + 0.006);
    sign('hours', lx(12.6), lx(13.9), ly(1.6), ly(1.92), Zf + 0.006);
    sign('gull', gx - 0.5, gx + 0.5, P0 + 0.55, P0 + 0.8, gz + 0.506);
    this.outside.add(new THREE.Mesh(sq.build(), this.signMat));
    // at night: warm light pooling under the portico, the lanterns
    this.poolMat = additive({ map: this.cityTex.glow, color: new THREE.Color('#ffe0b0'), opacity: 0 });
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(13, 5).rotateX(-R90), this.poolMat);
    pool.position.set(lx(11), P0 + 0.015, Zf + 2.0);
    pool.renderOrder = 2;
    this.outside.add(pool);
    this.lanternMat = additive({ map: this.cityTex.glow, color: new THREE.Color('#ffd890'), size: 1.4, points: true, opacity: 0 });
    const lg = new THREE.BufferGeometry().setFromPoints(this.lanterns);
    this.outside.add(new THREE.Points(lg, this.lanternMat));
    this.outsideSpot = { x: lx(11), z: s.z1 + 1.2, yaw: PI };
    this.doorCenter = this.w((DOOR[0] + DOOR[1]) / 2, D + 0.15);
  }

  /** The Harbour Gull: a bronze gull, wings half open. Rubbing its beak is supposed to be lucky. */
  bronzeGull(x, y, z) {
    const g = new GeoBuilder();
    const bronze = shade('#8a6a3a');
    const dark = shade('#5a4424');
    const add = (geo, px, py, pz, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, c = bronze) => {
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x + px, y + py, z + pz), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
      g.addGeometry(geo, m, c);
    };
    add(new THREE.SphereGeometry(0.3, 12, 8), 0, 0.42, 0, 0, 0, 0, 0.8, 0.75, 1.3);
    add(new THREE.SphereGeometry(0.17, 10, 8), 0, 0.72, 0.32);
    add(new THREE.ConeGeometry(0.05, 0.22, 6), 0, 0.7, 0.53, R90, 0, 0, 1, 1, 1, shade('#c8a050'));
    add(new THREE.BoxGeometry(0.06, 0.4, 0.12), 0, 0.16, 0.05, 0, 0, 0, 1, 1, 1, dark);
    add(new THREE.BoxGeometry(0.7, 0.04, 0.32), -0.42, 0.62, -0.05, 0, 0.2, 0.55);
    add(new THREE.BoxGeometry(0.7, 0.04, 0.32), 0.42, 0.62, -0.05, 0, -0.2, -0.55);
    add(new THREE.BoxGeometry(0.24, 0.03, 0.26), 0, 0.42, -0.42, -0.3);
    return new THREE.Mesh(g.build(), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: '#1a1208' }));
  }

  buildDoors() {
    const o = this.origin;
    const mk = () => {
      const g = new THREE.Group();
      const b = new GeoBuilder();
      const fr = shade('#b8904a');
      b.box(-0.6, 0, -0.03, 0.6, 0.08, 0.03, { color: fr, bottom: true });
      b.box(-0.6, 3.32, -0.03, 0.6, 3.38, 0.03, { color: fr, bottom: true });
      b.box(-0.6, 0, -0.03, -0.55, 3.38, 0.03, { color: fr });
      b.box(0.55, 0, -0.03, 0.6, 3.38, 0.03, { color: fr });
      b.box(-0.05, 1.0, 0.03, 0.05, 1.5, 0.07, { color: fr });
      g.add(new THREE.Mesh(b.build(), new THREE.MeshLambertMaterial({ vertexColors: true })));
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 3.24), new THREE.MeshBasicMaterial({ color: '#c8d8d0', transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }));
      glass.position.y = 1.7;
      glass.renderOrder = 5;
      g.add(glass);
      this.outside.add(g);
      return g;
    };
    this.doorL = mk();
    this.doorR = mk();
    this.doorOpen = 0;
    this.gate = this.city.colliders.add(o.x + DOOR[0], o.z + D - 0.05, o.x + DOOR[1], o.z + D + 0.32, o.y, o.y + 3.4);
    this.gateTop = this.gate.y1;
    this.positionDoors();
  }

  positionDoors() {
    const o = this.origin;
    const z = o.z + D + 0.15;
    this.doorL.position.set(o.x + DOOR[0] + 0.6 - this.doorOpen * 1.1, o.y, z);
    this.doorR.position.set(o.x + DOOR[1] - 0.6 + this.doorOpen * 1.1, o.y, z);
  }

  // ==========================================================================
  /** s: { hour, camera, people, market, clockText, tape() -> [{ text, col }] } */
  update(dt, time, env, s) {
    const cam = s.camera.position;
    const near = cam.distanceTo(this.doorCenter) < 95;
    this.group.visible = near;
    const open = exchangeOpen(s.hour);
    this.open = open;
    this.gate.y1 = open ? -10 : this.gateTop;
    const u = this.uniforms;
    u.uLampOn.value = damp(u.uLampOn.value, open ? 1 : 0.2, 2, dt);
    const sunUp = smoothstep(-0.05, 0.3, env.sky.uniforms.sunDir.value.y);
    u.uDayColor.value.copy(env.hemi.color).multiplyScalar(env.hemi.intensity * 0.35).add(env.sun.color.clone().multiplyScalar(sunUp * env.sun.intensity * 0.08));
    if (this.kit.glowMat) this.kit.glowMat.color.setScalar(open ? 1.25 : 0.35);
    const night = env.night ?? 1 - sunUp;
    this.signMat.emissiveIntensity = 0.12 + night * 0.5;
    this.poolMat.opacity = night * (open ? 0.4 : 0.15);
    this.lanternMat.opacity = night * 0.9;
    let want = 0;
    if (open) for (const p of s.people) if (Math.abs(p.x - this.doorCenter.x) < 2.4 && Math.abs(p.z - this.doorCenter.z) < 2.4) want = 1;
    this.doorOpen = damp(this.doorOpen, want, want ? 6 : 3, dt);
    this.positionDoors();
    if (!near) return;
    // the board every couple of seconds, the crawl scrolling, the clocks each minute
    const lit = open ? 1 : 0.25;
    this.boardMesh.material.color.setScalar(lit);
    this.tapeMesh.material.color.setScalar(lit);
    this.screenMat.color.setScalar(open ? 1 : 0.15);
    if ((this.boardT -= dt) <= 0) {
      this.boardT = 2;
      this.board.draw(s.market, s.stocks, s.clockText);
      this.board.tex.needsUpdate = true;
    }
    if ((this.tapeT -= dt) <= 0) {
      this.tapeT = 12;
      this.tape.draw(s.tape());
    }
    this.tape.tex.offset.x = (this.tape.tex.offset.x + dt * 0.035) % 1;
    const min = Math.floor(s.hour * 60);
    if (min !== this.clockMin) {
      this.clockMin = min;
      this.clocks.draw(s.hour);
    }
  }
}

/** Rectangles of a wall face (x0..x1, y0..y1) with the holes cut out. */
function solidAround(x0, x1, y0, y1, holes) {
  const xs = [...new Set([x0, x1, ...holes.flatMap((h) => [h[0], h[1]])])].filter((x) => x >= x0 && x <= x1).sort((a, b) => a - b);
  const ys = [...new Set([y0, y1, ...holes.flatMap((h) => [h[2], h[3]])])].filter((y) => y >= y0 && y <= y1).sort((a, b) => a - b);
  const out = [];
  for (let j = 0; j < ys.length - 1; j++) {
    let run = null;
    for (let i = 0; i < xs.length - 1; i++) {
      const cx = (xs[i] + xs[i + 1]) / 2;
      const cy = (ys[j] + ys[j + 1]) / 2;
      const hole = holes.some((h) => cx > h[0] && cx < h[1] && cy > h[2] && cy < h[3]);
      if (!hole) {
        if (run) run[1] = xs[i + 1];
        else run = [xs[i], xs[i + 1], ys[j], ys[j + 1]];
      } else if (run) {
        out.push(run);
        run = null;
      }
    }
    if (run) out.push(run);
  }
  return out;
}

function xz(v) {
  return { x: v.x, z: v.z };
}
