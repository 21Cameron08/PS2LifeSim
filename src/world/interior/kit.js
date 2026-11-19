import * as THREE from 'three';
import { GeoBuilder, shade, trs } from '../../core/geo.js';
import { Colliders } from '../colliders.js';
import { bake, interiorMaterial, roomAt } from './bake.js';

// A small toolkit for building apartment interiors out of rooms, walls with
// openings, and low-poly furniture. Everything is authored in apartment-local
// metres: x across the street facade, z from the corridor (z=0) to the street
// windows (z=D), y up from the floor. Furniture's local +z is its "front".

const WHITE = [1, 1, 1];
const BOOKS_TILE = 0.9; // metres of shelf covered by one tile of the books texture
export const C = (hex, k = 1) => shade(hex, k);

export class InteriorKit {
  constructor({ origin, W, D, H, tex, uniforms }) {
    this.o = origin;
    this.W = W;
    this.D = D;
    this.H = H;
    this.tex = tex;
    this.uniforms = uniforms;
    this.B = new Map();
    this.glow = new GeoBuilder();
    this.glass = new GeoBuilder();
    this.screen = new GeoBuilder();
    this.colliders = new Colliders(3);
    this.rooms = [];
    this.lights = [];
    this.windows = [];
    this.shadows = [];
    this.interactables = [];
    this.fans = [];
    this.fxLights = []; // lights whose colour is driven at runtime (see bake.js: aFx)
  }

  b(key) {
    let b = this.B.get(key);
    if (!b) this.B.set(key, (b = new GeoBuilder()));
    return b;
  }
  target(key) {
    if (key === 'glow') return this.glow;
    if (key === 'glass') return this.glass;
    if (key === 'tv') return this.screen;
    return this.b(key);
  }
  scale(key) {
    return this.tex[key]?.scale ?? 1;
  }
  w(p) {
    return [this.o.x + p[0], this.o.y + p[1], this.o.z + p[2]];
  }

  /** Subdivided quad: a + i*du + j*dv. Normal must equal du x dv. uvFn(localPoint) -> [u,v]. */
  grid(key, a, du, dv, n, uvFn, col = WHITE, cell = 0.55) {
    const lu = Math.hypot(du[0], du[1], du[2]);
    const lv = Math.hypot(dv[0], dv[1], dv[2]);
    const nu = Math.max(1, Math.ceil(lu / cell));
    const nv = Math.max(1, Math.ceil(lv / cell));
    const B = this.target(key);
    const P = (i, j) => [a[0] + (du[0] * i) / nu + (dv[0] * j) / nv, a[1] + (du[1] * i) / nu + (dv[1] * j) / nv, a[2] + (du[2] * i) / nu + (dv[2] * j) / nv];
    for (let i = 0; i < nu; i++)
      for (let j = 0; j < nv; j++) {
        const q = [P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)];
        const uv = q.flatMap((p) => uvFn(p));
        B.quad(this.w(q[0]), this.w(q[1]), this.w(q[2]), this.w(q[3]), n, uv, col);
      }
  }

  // ---------------------------------------------------------------- rooms
  /** f: { floor, floorColor, wall, wallColor, ceil, base, trim, wainscot:{key,h,color} } */
  room(id, x0, z0, x1, z1, f = {}) {
    const R = {
      id,
      lx0: x0,
      lz0: z0,
      lx1: x1,
      lz1: z1,
      x0: this.o.x + x0,
      z0: this.o.z + z0,
      x1: this.o.x + x1,
      z1: this.o.z + z1,
      f: { floor: 'woodOak', wall: 'plaster', wallColor: '#ece6da', ceil: '#f2f0ea', base: '#ebe6dc', trim: '#f0ece4', ...f },
      lampAmb: new THREE.Color(0, 0, 0),
      dayAmb: 0,
      // rooms in the same zone share their lights (one big space split into rectangles)
      zone: f.zone,
      // rooms can be stacked: a floor at y0 (f.y0) and a ceiling at y1 (f.h)
      y0: f.y0 ?? 0,
      y1: f.h ?? this.H,
    };
    R.wy0 = this.o.y + R.y0;
    R.wy1 = this.o.y + R.y1;
    this.rooms.push(R);
    const fs = this.scale(R.f.floor);
    if (!R.f.noFloor) this.grid(R.f.floor, [x0, R.y0, z1], [x1 - x0, 0, 0], [0, 0, -(z1 - z0)], [0, 1, 0], (p) => [p[0] / fs, -p[2] / fs], R.f.floorColor ? C(R.f.floorColor) : WHITE, 0.5);
    const ck = R.f.ceilKey ?? 'plaster';
    const cs = this.scale(ck);
    // f.h: a lower ceiling than the kit's H (the walls still run full height above it)
    const ch = R.f.h ?? this.H;
    if (!R.f.noCeil) this.grid(ck, [x0, ch, z0], [x1 - x0, 0, 0], [0, 0, z1 - z0], [0, -1, 0], (p) => [p[0] / cs, p[2] / cs], C(R.f.ceil), 0.6);
    return R;
  }

  roomAtLocal(x, z, y = null) {
    for (const R of this.rooms) if (x >= R.lx0 && x <= R.lx1 && z >= R.lz0 && z <= R.lz1 && (y === null || (y >= R.y0 - 0.05 && y <= R.y1 + 0.05))) return R;
    return null;
  }

  // ---------------------------------------------------------------- walls
  /**
   * axis 'x': wall along x at z = c, from a0 to a1. axis 'z': along z at x = c.
   * ext: 0 = partition centred on c; +1 / -1 = exterior wall whose body lies on that side of c.
   * open: [{ from, to, kind: 'door'|'opening'|'window'|'entry', y0, y1, ...dressing }]
   */
  wall(axis, c, a0, a1, { t = 0.12, ext = 0, open = [], outside = null } = {}) {
    const H = this.H;
    const lo = ext === 0 ? c - t / 2 : ext > 0 ? c : c - t;
    const hi = lo + t;
    const ops = open
      .map((o) => ({ kind: 'door', y0: 0, y1: o.kind === 'window' ? 2.3 : 2.1, ...o }))
      .map((o) => (o.kind === 'window' ? { y0: 0.85, ...o } : o))
      .sort((p, q) => p.from - q.from);
    // outside: { key, color, trim } finish for the street side of an exterior wall
    this._outside = outside ? { f: { wall: outside.key ?? 'solid', wallColor: outside.color, base: null, trim: outside.trim ?? outside.color } } : null;
    let cur = a0;
    const pieces = [];
    for (const o of ops) {
      if (o.from > cur) pieces.push([cur, o.from, 0, H]);
      // gaps: several holes stacked in one span, e.g. an arch with a balcony opening above it
      const gaps = o.gaps ? [...o.gaps].sort((g, k) => g.y0 - k.y0) : [o];
      let y = 0;
      for (const g of gaps) {
        if (g.y0 > y) pieces.push([o.from, o.to, y, g.y0]);
        y = g.y1;
      }
      if (y < H) pieces.push([o.from, o.to, y, H]);
      cur = o.to;
    }
    if (cur < a1) pieces.push([cur, a1, 0, H]);
    for (const [p0, p1, q0, q1] of pieces) this.wallPiece(axis, lo, hi, p0, p1, q0, q1, p0 > a0 + 1e-4, p1 < a1 - 1e-4);
    for (const o of ops) {
      if (o.gaps) for (const g of o.gaps) this.opening(axis, lo, hi, { ...o, kind: 'opening', ...g, gaps: null }, ext);
      else this.opening(axis, lo, hi, o, ext);
    }
    this._outside = null;
  }

  // local point from wall-frame coords (a = along, y, d = across)
  wp(axis, a, y, d) {
    return axis === 'x' ? [a, y, d] : [d, y, a];
  }

  faceRoom(axis, a, y, d, dn) {
    const p = this.wp(axis, a, y, d + dn * 0.1);
    return this.roomAtLocal(p[0], p[2], y);
  }

  wallPiece(axis, lo, hi, p0, p1, q0, q1, endLo, endHi) {
    const mid = (p0 + p1) / 2;
    const yMid = (q0 + q1) / 2;
    for (const side of [-1, 1]) {
      const d = side < 0 ? lo : hi;
      // a wall can face several rooms along its length: give each its own finish
      const dp = d + side * 0.1;
      let covered = 0;
      for (const R of this.rooms) {
        const inside = axis === 'x' ? dp >= R.lz0 && dp <= R.lz1 : dp >= R.lx0 && dp <= R.lx1;
        if (!inside) continue;
        const s0 = Math.max(p0, axis === 'x' ? R.lx0 : R.lz0);
        const s1 = Math.min(p1, axis === 'x' ? R.lx1 : R.lz1);
        // only the part of the wall between this room's floor and ceiling
        const t0 = Math.max(q0, R.y0);
        const t1 = Math.min(q1, R.y1);
        if (s1 - s0 > 0.001 && t1 - t0 > 0.001) {
          this.wallFace(axis, side, d, s0, s1, t0, t1, R);
          covered += s1 - s0;
        }
      }
      // the street side of an exterior wall
      if (covered < 0.01 && this._outside) this.wallFace(axis, side, d, p0, p1, q0, q1, this._outside);
    }
    this.wallEdges(axis, lo, hi, p0, p1, q0, q1, endLo, endHi, mid, yMid);
  }

  wallFace(axis, side, d, p0, p1, q0, q1, R) {
    const ws = (key) => this.scale(key);
    {
      const bands = [];
      const wc = R.f.wainscot;
      const fy = R.y0 ?? 0;
      const wh = wc ? fy + wc.h : 0;
      if (wc && q0 < wh) {
        bands.push([q0, Math.min(q1, wh), wc.key, wc.color ?? '#ffffff']);
        if (q1 > wh) bands.push([wh, q1, R.f.wall, R.f.wallColor]);
      } else bands.push([q0, q1, R.f.wall, R.f.wallColor]);
      for (const [y0, y1, key, col] of bands) {
        const s = ws(key);
        let a;
        let du;
        let n;
        let uv;
        if (axis === 'x') {
          if (side > 0) [a, du, n, uv] = [[p0, y0, d], [p1 - p0, 0, 0], [0, 0, 1], (p) => [p[0] / s, p[1] / s]];
          else [a, du, n, uv] = [[p1, y0, d], [-(p1 - p0), 0, 0], [0, 0, -1], (p) => [-p[0] / s, p[1] / s]];
        } else if (side > 0) [a, du, n, uv] = [[d, y0, p1], [0, 0, -(p1 - p0)], [1, 0, 0], (p) => [-p[2] / s, p[1] / s]];
        else [a, du, n, uv] = [[d, y0, p0], [0, 0, p1 - p0], [-1, 0, 0], (p) => [p[2] / s, p[1] / s]];
        this.grid(key, a, du, [0, y1 - y0, 0], n, uv, C(col));
      }
      if (Math.abs(q0 - fy) < 1e-4 && R.f.base) {
        const bd = d + side * 0.014;
        const [x0, , z0] = this.wp(axis, p0, 0, Math.min(d, bd));
        const [x1, , z1] = this.wp(axis, p1, 0, Math.max(d, bd));
        const g = new GeoBuilder();
        g.box(x0, fy, z0, x1, fy + 0.09, z1, { color: C(R.f.base) });
        this.b('solid').addGeometry(g.build(), trs(this.o.x, this.o.y, this.o.z));
      }
      if (wc && wc.cap && q0 < wh && q1 > wh) {
        const bd = d + side * 0.018;
        const [x0, , z0] = this.wp(axis, p0, 0, Math.min(d, bd));
        const [x1, , z1] = this.wp(axis, p1, 0, Math.max(d, bd));
        const g = new GeoBuilder();
        g.box(x0, wh - 0.02, z0, x1, wh + 0.03, z1, { color: C(wc.cap), bottom: true });
        this.b('solid').addGeometry(g.build(), trs(this.o.x, this.o.y, this.o.z));
      }
    }
  }

  wallEdges(axis, lo, hi, p0, p1, q0, q1, endLo, endHi, mid, yMid) {
    // reveals (jambs), sill tops and lintel undersides, in the trim colour of an adjoining room
    const R = this.faceRoom(axis, mid, yMid, lo, -1) || this.faceRoom(axis, mid, yMid, hi, 1);
    const col = C(R?.f.trim ?? '#f0ece4');
    const t = hi - lo;
    const S = this.b('solid');
    const W = (p) => this.w(p);
    const quad = (a, du, dv, n) => S.quad(W(a), W(add(a, du)), W(add(add(a, du), dv)), W(add(a, dv)), n, [0, 0, 1, 1], col);
    if (axis === 'x') {
      if (endHi) quad([p1, q0, hi], [0, 0, -t], [0, q1 - q0, 0], [1, 0, 0]);
      if (endLo) quad([p0, q0, lo], [0, 0, t], [0, q1 - q0, 0], [-1, 0, 0]);
      if (q1 < this.H) quad([p0, q1, hi], [p1 - p0, 0, 0], [0, 0, -t], [0, 1, 0]);
      if (q0 > 0) quad([p0, q0, lo], [p1 - p0, 0, 0], [0, 0, t], [0, -1, 0]);
    } else {
      if (endHi) quad([lo, q0, p1], [t, 0, 0], [0, q1 - q0, 0], [0, 0, 1]);
      if (endLo) quad([hi, q0, p0], [-t, 0, 0], [0, q1 - q0, 0], [0, 0, -1]);
      if (q1 < this.H) quad([lo, q1, p1], [t, 0, 0], [0, 0, -(p1 - p0)], [0, 1, 0]);
      if (q0 > 0) quad([lo, q0, p0], [t, 0, 0], [0, 0, p1 - p0], [0, -1, 0]);
    }
    // collision (lintels only stop the camera; you walk under them)
    const [x0, , z0] = this.wp(axis, p0, 0, lo);
    const [x1, , z1] = this.wp(axis, p1, 0, hi);
    this.colliders.add(this.o.x + x0, this.o.z + z0, this.o.x + x1, this.o.z + z1, this.o.y + q0, this.o.y + q1);
  }

  opening(axis, lo, hi, o, ext) {
    const trimBox = (a0, a1, y0, y1, d0, d1, col, key = 'solid') => {
      const p = this.wp(axis, a0, y0, d0);
      const q = this.wp(axis, a1, y1, d1);
      const g = new GeoBuilder();
      g.box(Math.min(p[0], q[0]), y0, Math.min(p[2], q[2]), Math.max(p[0], q[0]), y1, Math.max(p[2], q[2]), { color: col, bottom: true });
      this.target(key).addGeometry(g.build(), trs(this.o.x, this.o.y, this.o.z));
    };
    const mid = (o.from + o.to) / 2;
    const ym = (o.y0 + o.y1) / 2;
    const outer = this._outside && { f: { trim: o.frame ?? this._outside.f.trim } };
    const sides = [
      [-1, lo, this.faceRoom(axis, mid, ym, lo, -1) || outer],
      [1, hi, this.faceRoom(axis, mid, ym, hi, 1) || outer],
    ].filter((s) => s[2]);
    const cw = 0.07;
    for (const [side, d, R] of o.noTrim ? [] : sides) {
      const col = C(o.trim ?? R.f.trim);
      const d0 = d;
      const d1 = d + side * 0.018;
      if (o.kind === 'window') {
        trimBox(o.from - cw, o.from, o.y0 - 0.02, o.y1 + cw, d0, d1, col);
        trimBox(o.to, o.to + cw, o.y0 - 0.02, o.y1 + cw, d0, d1, col);
        trimBox(o.from - cw, o.to + cw, o.y1, o.y1 + cw, d0, d1, col);
        trimBox(o.from - 0.09, o.to + 0.09, o.y0 - 0.04, o.y0, d, d + side * 0.09, col);
      } else {
        const yb = o.y0 ?? 0;
        trimBox(o.from - cw, o.from, yb, o.y1 + cw, d0, d1, col);
        trimBox(o.to, o.to + cw, yb, o.y1 + cw, d0, d1, col);
        trimBox(o.from - cw, o.to + cw, o.y1, o.y1 + cw, d0, d1, col);
      }
    }
    if (o.kind === 'window') {
      // glass, mullions, collision, daylight, dressing
      const dc = (lo + hi) / 2;
      const fr = C(o.frame ?? '#f2f0ea');
      const gp = (a, y) => this.w(this.wp(axis, a, y, dc));
      const n = axis === 'x' ? [0, 0, 1] : [1, 0, 0];
      this.glass.quad(gp(o.from, o.y0), gp(o.to, o.y0), gp(o.to, o.y1), gp(o.from, o.y1), n, [0, 0, 1, 1], WHITE);
      const gx = o.grid?.[0] ?? 2;
      const gy = o.grid?.[1] ?? 2;
      for (let k = 1; k < gx; k++) {
        const a = o.from + ((o.to - o.from) * k) / gx;
        trimBox(a - 0.02, a + 0.02, o.y0, o.y1, dc - 0.03, dc + 0.03, fr);
      }
      for (let k = 1; k < gy; k++) {
        const y = o.y0 + ((o.y1 - o.y0) * k) / gy;
        trimBox(o.from, o.to, y - 0.02, y + 0.02, dc - 0.03, dc + 0.03, fr);
      }
      trimBox(o.from, o.to, o.y0, o.y0 + 0.04, dc - 0.04, dc + 0.04, fr);
      trimBox(o.from, o.to, o.y1 - 0.04, o.y1, dc - 0.04, dc + 0.04, fr);
      const [x0, , z0] = this.wp(axis, o.from, 0, lo);
      const [x1, , z1] = this.wp(axis, o.to, 0, hi);
      this.colliders.add(this.o.x + x0, this.o.z + z0, this.o.x + x1, this.o.z + z1, this.o.y + o.y0, this.o.y + o.y1);
      // inward normal: the interior is on the opposite side to the exterior body
      const inSide = ext > 0 ? -1 : 1;
      const dIn = inSide < 0 ? lo : hi;
      const c = this.w(this.wp(axis, mid, ym, dIn));
      const nIn = axis === 'x' ? [0, inSide] : [inSide, 0];
      this.windows.push({ x: c[0], y: c[1], z: c[2], nx: nIn[0], nz: nIn[1], area: (o.to - o.from) * (o.y1 - o.y0) });
      if (o.dress === 'curtains') {
        const col = C(o.color ?? '#e8e0d0');
        const dd = dIn + inSide * 0.12;
        const S = this.b('curtain');
        for (const [a0, a1] of [
          [o.from - 0.18, o.from + 0.22],
          [o.to - 0.22, o.to + 0.18],
        ]) {
          const P = (a, y) => this.w(this.wp(axis, a, y, dd));
          const nn = axis === 'x' ? [0, 0, inSide] : [inSide, 0, 0];
          const lowY = o.long ? 0.02 : o.y0 - 0.08;
          const [qa, qb] = (axis === 'x') === inSide > 0 ? [a0, a1] : [a1, a0];
          S.quad(P(qa, lowY), P(qb, lowY), P(qb, o.y1 + 0.18), P(qa, o.y1 + 0.18), nn, [0, 0, 2, 1], col);
        }
        trimBox(o.from - 0.3, o.to + 0.3, o.y1 + 0.17, o.y1 + 0.2, dd - 0.015, dd + 0.015, C(o.rod ?? '#3a3a3a'));
      } else if (o.dress === 'blinds') {
        const down = o.down ?? 0.45;
        const dd = dIn + inSide * 0.05;
        const y0 = o.y1 - (o.y1 - o.y0) * down;
        const P = (a, y) => this.w(this.wp(axis, a, y, dd));
        const nn = axis === 'x' ? [0, 0, inSide] : [inSide, 0, 0];
        const s = this.scale('blinds');
        const [qa, qb] = (axis === 'x') === inSide > 0 ? [o.from, o.to] : [o.to, o.from];
        this.b('blinds').quad(P(qa, y0), P(qb, y0), P(qb, o.y1), P(qa, o.y1), nn, [0, 0, (o.to - o.from) / s, (o.y1 - y0) / s], WHITE);
        trimBox(o.from, o.to, o.y1 - 0.06, o.y1, dd - 0.03, dd + 0.03, C('#e8e6e0'));
      }
    } else if (o.kind === 'door' && o.swing) {
      // interior door left open against the wall
      const side = o.swing;
      const d = side > 0 ? hi : lo;
      const dw = o.to - o.from - 0.02;
      const col = C(o.doorColor ?? '#f0ece2');
      const hinge = o.hinge === 'to' ? o.to - 0.05 : o.from + 0.01;
      trimBox(hinge, hinge + 0.04, 0.01, 2.06, d + side * 0.01, d + side * (dw + 0.01), col);
      const hy = 1.0;
      trimBox(hinge - 0.03, hinge + 0.07, hy - 0.03, hy + 0.03, d + side * (dw - 0.1), d + side * (dw - 0.04), C('#b8b0a0'));
    } else if (o.kind === 'entry') {
      const side = o.inside ?? 1;
      const d = side > 0 ? hi : lo;
      const col = C(o.doorColor ?? '#6a4a32');
      trimBox(o.from + 0.01, o.to - 0.01, 0.01, o.y1 - 0.01, d - side * 0.06, d - side * 0.02, col, 'wood');
      // raised panels
      for (const [y0, y1] of [
        [0.15, 0.95],
        [1.15, 1.95],
      ])
        for (const [f0, f1] of [
          [0.1, 0.46],
          [0.54, 0.9],
        ]) {
          const w = o.to - o.from;
          trimBox(o.from + w * f0, o.from + w * f1, y0, y1, d - side * 0.02, d - side * 0.005, C(o.doorColor ?? '#6a4a32', 1.15), 'wood');
        }
      const knobA = o.to - 0.1;
      trimBox(knobA - 0.03, knobA + 0.03, 1.0, 1.06, d - side * 0.005, d + side * 0.06, C('#c8b070'));
      trimBox(knobA - 0.03, knobA + 0.03, 1.18, 1.24, d - side * 0.005, d + side * 0.03, C('#c8b070'));
      trimBox(mid - 0.012, mid + 0.012, 1.55, 1.58, d - side * 0.005, d + side * 0.012, C('#2a2a2a'));
      const [x0, , z0] = this.wp(axis, o.from, 0, lo);
      const [x1, , z1] = this.wp(axis, o.to, 0, hi);
      this.colliders.add(this.o.x + x0, this.o.z + z0, this.o.x + x1, this.o.z + z1, this.o.y, this.o.y + 2.1);
    }
  }

  // ---------------------------------------------------------------- furniture
  place(x, z, rot = 0, y = 0) {
    return new Placer(this, trs(this.o.x + x, this.o.y + y, this.o.z + z, rot));
  }

  // ---------------------------------------------------------------- build
  build(group, matOpts = {}, globalOpts = {}) {
    for (const R of this.rooms) {
      R.lampAmb.setRGB(0, 0, 0);
      R.dayAmb = 0;
    }
    const zone = (k) => (k < 0 ? -1 : (this.rooms[k].zone ?? `#${k}`));
    for (const L of this.lights) {
      L.room = roomAt(this.rooms, L.x, L.z, L.y);
      if (L.room < 0) continue;
      const z = zone(L.room);
      const amb = L.color.clone().multiplyScalar(L.power * 0.07);
      this.rooms.forEach((R, k) => zone(k) === z && R.lampAmb.add(amb));
    }
    for (const L of this.fxLights) L.room = roomAt(this.rooms, L.x, L.z, L.y);
    for (const Wn of this.windows) {
      Wn.room = roomAt(this.rooms, Wn.x + Wn.nx * 0.3, Wn.z + Wn.nz * 0.3, Wn.y);
      const R = this.rooms[Wn.room];
      if (R) R.dayAmb += (Wn.area / ((R.x1 - R.x0) * (R.z1 - R.z0))) * 0.45;
    }
    const ctx = { rooms: this.rooms, lights: this.lights, windows: this.windows, shadows: this.shadows, floorY: this.o.y, ceil: this.H, fx: this.fxLights };
    const mats = {};
    for (const [key, b] of this.B) {
      if (b.empty) continue;
      const geo = b.build();
      bake(geo, ctx);
      const o = { ...globalOpts, ...(matOpts[key] || {}) };
      if (key === 'blinds' || key === 'books') Object.assign(o, { alphaTest: 0.5, side: THREE.DoubleSide });
      if (key === 'curtain') o.side = THREE.DoubleSide;
      const mat = interiorMaterial(this.tex[key].map, this.uniforms, o);
      mats[key] = mat;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = `interior:${key}`;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
    }
    this.glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, ...globalOpts });
    if (!this.glow.empty) group.add(new THREE.Mesh(this.glow.build(), this.glowMat));
    this.glassMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#a8c8e0'),
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
      ...globalOpts,
    });
    if (!this.glass.empty) {
      const g = new THREE.Mesh(this.glass.build(), this.glassMat);
      g.renderOrder = 5;
      group.add(g);
    }
    if (!this.screen.empty) {
      this.screenMat = new THREE.MeshBasicMaterial({ map: this.tex.tv.tex, fog: false, ...globalOpts });
      group.add(new THREE.Mesh(this.screen.build(), this.screenMat));
    }
    return mats;
  }
}

function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

const _v = new THREE.Vector3();
class Placer {
  constructor(kit, m) {
    this.k = kit;
    this.m = m;
  }
  sub(x, z, rot = 0, y = 0) {
    return new Placer(this.k, this.m.clone().multiply(trs(x, y, z, rot)));
  }
  box(key, x0, y0, z0, x1, y1, z1, col = WHITE, o = {}) {
    const s = this.k.scale(key);
    const g = new GeoBuilder();
    g.box(x0, y0, z0, x1, y1, z1, { sx: s, sy: s, topScale: s, bottom: false, ...o, color: col });
    this.k.target(key).addGeometry(g.build(), this.m);
    return this;
  }
  cbox(key, cx, y0, cz, w, h, d, col, o) {
    return this.box(key, cx - w / 2, y0, cz - d / 2, cx + w / 2, y0 + h, cz + d / 2, col, o);
  }
  geo(key, geometry, x, y, z, col = WHITE, ry = 0, sx = 1, sy = sx, sz = sx, rx = 0, rz = 0) {
    this.k.target(key).addGeometry(geometry, this.m.clone().multiply(trs(x, y, z, ry, sx, sy, sz, rx, rz)), col);
    return this;
  }
  quad(key, a, b, c, d, n, uv, col = WHITE) {
    const g = new GeoBuilder();
    g.quad(a, b, c, d, n, uv, col);
    this.k.target(key).addGeometry(g.build(), this.m);
    return this;
  }
  /** a quad facing local +z at depth z, from (x0,y0) to (x1,y1) */
  panel(key, x0, y0, x1, y1, z, uv = [0, 0, 1, 1], col = WHITE) {
    return this.quad(key, [x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], [0, 0, 1], uv, col);
  }
  rect(x0, z0, x1, z1) {
    const pts = [
      [x0, z0],
      [x1, z0],
      [x1, z1],
      [x0, z1],
    ].map(([x, z]) => _v.set(x, 0, z).applyMatrix4(this.m).clone());
    return {
      x0: Math.min(...pts.map((p) => p.x)),
      x1: Math.max(...pts.map((p) => p.x)),
      z0: Math.min(...pts.map((p) => p.z)),
      z1: Math.max(...pts.map((p) => p.z)),
      y: pts[0].y,
    };
  }
  collide(x0, z0, x1, z1, h) {
    const r = this.rect(x0, z0, x1, z1);
    this.k.colliders.add(r.x0, r.z0, r.x1, r.z1, r.y, r.y + h);
    return this;
  }
  shadow(x0, z0, x1, z1, k = 0.45) {
    const r = this.rect(x0, z0, x1, z1);
    this.k.shadows.push({ ...r, k });
    return this;
  }
  point(x, y, z) {
    return new THREE.Vector3(x, y, z).applyMatrix4(this.m);
  }
  light(x, y, z, col, power, down = false) {
    const p = this.point(x, y, z);
    this.k.lights.push({ x: p.x, y: p.y, z: p.z, color: new THREE.Color(col), power, down });
    return this;
  }
  /** A light baked into colour channel ch (0-3) of aFx; its colour is set at runtime. */
  fxLight(x, y, z, ch, power, { down = false, fall = 0.6 } = {}) {
    const p = this.point(x, y, z);
    this.k.fxLights.push({ x: p.x, y: p.y, z: p.z, ch, power, down, fall });
    return this;
  }
  interact(x, z, def) {
    const p = this.point(x, 0, z);
    this.k.interactables.push({ r: 1.3, ...def, x: p.x, z: p.z });
    return this;
  }
}

// ============================================================================
// Furniture catalogue. Unless noted, the back of each piece sits at z = 0
// (against a wall) and it faces +z.

const cyl = (rt, rb, h, s = 10, open = false) => new THREE.CylinderGeometry(rt, rb, h, s, 1, open);
const ico = (r, d = 0) => new THREE.IcosahedronGeometry(r, d);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

export const F = {
  bed(P, { w = 1.4, l = 2.0, frame = '#6a4a32', sheet = '#e8e4dc', blanket = '#3a5a8a', pillow = '#f2eee6', head = frame, headKey = 'wood', messy = false } = {}) {
    const z0 = 0.07;
    for (const [x, z] of [
      [-w / 2, z0 + 0.04],
      [w / 2 - 0.06, z0 + 0.04],
      [-w / 2, z0 + l - 0.1],
      [w / 2 - 0.06, z0 + l - 0.1],
    ])
      P.box('wood', x, 0, z, x + 0.06, 0.14, z + 0.06, C(frame, 0.7));
    P.box('wood', -w / 2 - 0.03, 0.14, z0, w / 2 + 0.03, 0.34, z0 + l, C(frame));
    P.box('fabric', -w / 2, 0.34, z0 + 0.02, w / 2, 0.56, z0 + l - 0.02, C(sheet));
    const bl = l * 0.64;
    P.geo('fabric', box(w + 0.08, 0.05, bl), 0, 0.58, z0 + l - bl / 2 + 0.02, C(blanket), messy ? 0.07 : 0);
    for (const s of [-1, 1]) P.box('fabric', s > 0 ? w / 2 : -w / 2 - 0.04, 0.3, z0 + l - bl, s > 0 ? w / 2 + 0.04 : -w / 2, 0.6, z0 + l + 0.02, C(blanket, 0.92));
    const pw = w > 1.1 ? w / 2 - 0.12 : w - 0.2;
    const px = w > 1.1 ? [-w / 4, w / 4] : [0];
    for (const x of px) P.geo('fabric', box(pw, 0.13, 0.36), x, 0.63, z0 + 0.28, C(pillow), messy ? 0.12 : 0, 1, 1, 1, messy ? 0.15 : 0.1);
    P.box(headKey, -w / 2 - 0.06, 0, 0, w / 2 + 0.06, 1.05, z0, C(head));
    P.collide(-w / 2 - 0.06, 0, w / 2 + 0.06, z0 + l, 0.62).shadow(-w / 2, 0, w / 2, z0 + l, 0.6);
    return P.point(w / 2 + 0.6, 0, z0 + l * 0.55);
  },

  nightstand(P, { col = '#6a4a32', lamp = true, shade: shadeCol = '#f0dcb4' } = {}) {
    P.box('wood', -0.24, 0, 0, 0.24, 0.55, 0.4, C(col));
    P.box('solid', -0.2, 0.33, 0.4, 0.2, 0.345, 0.405, C('#2a2018'));
    P.box('solid', -0.025, 0.42, 0.4, 0.025, 0.45, 0.43, C('#c8b070'));
    if (lamp) {
      P.geo('solid', cyl(0.06, 0.09, 0.26), 0, 0.68, 0.2, C('#c8b89a'));
      P.geo('glow', cyl(0.11, 0.16, 0.2, 12, true), 0, 0.9, 0.2, C(shadeCol, 0.9));
      P.light(0, 0.9, 0.2, '#ffc890', 0.5);
    }
    P.collide(-0.24, 0, 0.24, 0.4, 0.6).shadow(-0.24, 0, 0.24, 0.4, 0.4);
  },

  dresser(P, { w = 1.1, col = '#7a5a3a', h = 0.85 } = {}) {
    P.box('wood', -w / 2, 0.05, 0, w / 2, h, 0.5, C(col));
    for (let k = 1; k < 3; k++) P.box('solid', -w / 2 + 0.03, 0.05 + ((h - 0.05) * k) / 3, 0.5, w / 2 - 0.03, 0.06 + ((h - 0.05) * k) / 3 + 0.008, 0.505, C('#2a2018'));
    for (let k = 0; k < 3; k++)
      for (const s of [-1, 1]) P.cbox('solid', s * w * 0.25, 0.05 + ((h - 0.05) * (k + 0.5)) / 3, 0.52, 0.08, 0.025, 0.03, C('#c8b070'));
    P.geo('solid', box(0.18, 0.22, 0.03), -w * 0.3, h + 0.11, 0.2, C('#3a3a3a'), 0, 1, 1, 1, -0.2);
    P.cbox('wood', w * 0.25, h, 0.25, 0.22, 0.1, 0.14, C('#5a2a2a'));
    P.collide(-w / 2, 0, w / 2, 0.5, h).shadow(-w / 2, 0, w / 2, 0.5, 0.45);
  },

  wardrobe(P, { w = 1.0, col = '#8a6a4a', h = 2.05 } = {}) {
    P.box('wood', -w / 2, 0, 0, w / 2, h, 0.6, C(col));
    P.box('wood', -w / 2 - 0.03, h, -0.0, w / 2 + 0.03, h + 0.06, 0.63, C(col, 0.85));
    P.box('solid', -0.006, 0.05, 0.6, 0.006, h - 0.05, 0.605, C('#2a2018'));
    for (const s of [-1, 1]) P.cbox('solid', s * 0.06, 0.95, 0.62, 0.02, 0.22, 0.03, C('#c8b070'));
    P.collide(-w / 2, 0, w / 2, 0.6, h).shadow(-w / 2, 0, w / 2, 0.6, 0.5);
  },

  sofa(P, { w = 2.0, col = '#6a5a8a', style = 'old', accent = '#d8b04a' } = {}) {
    const d = style === 'modern' ? 0.95 : 0.9;
    const arm = style === 'modern' ? 0.12 : 0.22;
    const seatTop = style === 'old' ? 0.48 : 0.43;
    const c = C(col);
    P.box('fabric', -w / 2, 0.09, 0, w / 2, 0.3, d, c);
    const n = w > 1.6 ? 3 : w > 1.2 ? 2 : 1;
    const sw = (w - arm * 2) / n;
    for (let k = 0; k < n; k++) {
      const x0 = -w / 2 + arm + k * sw;
      P.box('fabric', x0 + 0.01, 0.3, 0.22, x0 + sw - 0.01, seatTop, d - 0.02, C(col, 1.05));
      P.box('fabric', x0 + 0.01, 0.3, 0.02, x0 + sw - 0.01, style === 'modern' ? 0.78 : 0.88, 0.24, C(col, 0.95));
    }
    P.box('fabric', -w / 2, 0.3, 0, w / 2, style === 'modern' ? 0.72 : 0.8, 0.1, c);
    for (const s of [-1, 1]) P.box('fabric', s < 0 ? -w / 2 : w / 2 - arm, 0.09, 0, s < 0 ? -w / 2 + arm : w / 2, style === 'old' ? 0.66 : 0.6, d, C(col, 0.95));
    for (const [x, z] of [
      [-w / 2 + 0.05, 0.05],
      [w / 2 - 0.09, 0.05],
      [-w / 2 + 0.05, d - 0.09],
      [w / 2 - 0.09, d - 0.09],
    ])
      P.box('wood', x, 0, z, x + 0.04, 0.09, z + 0.04, C('#3a2a1e'));
    P.geo('fabric', box(0.4, 0.36, 0.12), -w / 2 + arm + 0.25, seatTop + 0.17, 0.3, C(accent), 0.3, 1, 1, 1, -0.25, 0.1);
    if (w > 1.6) P.geo('fabric', box(0.38, 0.34, 0.12), w / 2 - arm - 0.25, seatTop + 0.16, 0.3, C(accent, 0.8), -0.25, 1, 1, 1, -0.25, -0.12);
    P.collide(-w / 2, 0, w / 2, d, 0.85).shadow(-w / 2, 0, w / 2, d, 0.55);
  },

  armchair(P, { col = '#8a5a3a', style = 'old' } = {}) {
    F.sofa(P, { w: 0.95, col, style, accent: col });
  },

  coffeeTable(P, { w = 1.1, d = 0.6, col = '#6a4a32', glass = false } = {}) {
    if (glass) {
      P.box('glass', -w / 2, 0.38, -d / 2, w / 2, 0.41, d / 2);
      P.box('solid', -w / 2, 0.36, -d / 2, w / 2, 0.38, d / 2, C('#c8c8c8'), { top: false });
    } else P.box('wood', -w / 2, 0.36, -d / 2, w / 2, 0.41, d / 2, C(col));
    for (const [x, z] of [
      [-w / 2 + 0.04, -d / 2 + 0.04],
      [w / 2 - 0.08, -d / 2 + 0.04],
      [-w / 2 + 0.04, d / 2 - 0.08],
      [w / 2 - 0.08, d / 2 - 0.08],
    ])
      P.box(glass ? 'solid' : 'wood', x, 0, z, x + 0.04, 0.36, z + 0.04, C(glass ? '#b8b8b8' : col, 0.9));
    P.box('wood', -w / 2 + 0.05, 0.1, -d / 2 + 0.05, w / 2 - 0.05, 0.12, d / 2 - 0.05, C(col, 0.85));
    P.cbox('solid', -w * 0.2, 0.41, 0, 0.22, 0.015, 0.28, C('#c84a3a'));
    P.cbox('solid', -w * 0.2, 0.425, 0.02, 0.2, 0.012, 0.26, C('#e8e2d0'));
    P.geo('solid', cyl(0.04, 0.035, 0.09), w * 0.25, 0.455, 0.05, C('#e8e4dc'));
    P.collide(-w / 2, -d / 2, w / 2, d / 2, 0.42).shadow(-w / 2, -d / 2, w / 2, d / 2, 0.3);
  },

  tvCRT(P, { onTV } = {}) {
    P.box('wood', -0.48, 0, 0, 0.48, 0.5, 0.45, C('#4a3a2a'));
    P.box('solid', -0.42, 0.06, 0.45, 0.42, 0.2, 0.452, C('#1a1a1a'));
    P.box('solid', -0.3, 0.26, 0.05, 0.3, 0.34, 0.42, C('#2a2a2c'));
    P.box('glow', -0.26, 0.29, 0.42, -0.2, 0.31, 0.421, C('#3aff6a'));
    P.box('solid', -0.34, 0.5, 0.0, 0.34, 1.0, 0.4, C('#2c2c2e'));
    P.box('solid', -0.24, 0.55, -0.22, 0.24, 0.95, 0.0, C('#262628'));
    P.panel('tv', -0.27, 0.57, 0.21, 0.95, 0.401);
    P.box('solid', 0.23, 0.6, 0.4, 0.31, 0.92, 0.402, C('#161616'));
    for (const s of [-1, 1]) P.geo('solid', box(0.012, 0.42, 0.012), s * 0.12, 1.17, 0.15, C('#a8a8a8'), 0, 1, 1, 1, 0, s * 0.45);
    P.collide(-0.48, -0.22, 0.48, 0.45, 1.0).shadow(-0.48, 0, 0.48, 0.45, 0.4);
    if (onTV) P.interact(0, 1.3, onTV);
  },

  tvFlat(P, { w = 1.3, console = '#2a2a2e', consoleKey = 'wood', onTV } = {}) {
    const cw = w + 0.4;
    P.box(consoleKey, -cw / 2, 0.08, 0, cw / 2, 0.5, 0.42, C(console));
    P.box('solid', -cw / 2 + 0.05, 0, 0.05, cw / 2 - 0.05, 0.08, 0.37, C('#1a1a1a'));
    for (const x of [-cw / 4, cw / 4]) P.box('solid', x - 0.005, 0.12, 0.42, x + 0.005, 0.46, 0.425, C('#111'));
    const h = (w * 9) / 16;
    P.box('solid', -0.15, 0.5, 0.12, 0.15, 0.52, 0.3, C('#1a1a1a'));
    P.box('solid', -0.03, 0.52, 0.18, 0.03, 0.65, 0.22, C('#1a1a1a'));
    P.box('solid', -w / 2, 0.62, 0.16, w / 2, 0.62 + h, 0.2, C('#141416'));
    P.panel('tv', -w / 2 + 0.02, 0.64, w / 2 - 0.02, 0.6 + h, 0.201);
    P.collide(-cw / 2, 0, cw / 2, 0.42, 0.5).shadow(-cw / 2, 0, cw / 2, 0.42, 0.4);
    if (onTV) P.interact(0, 1.3, onTV);
  },

  bookshelf(P, { w = 0.9, h = 1.9, col = '#6a4a32', n = 5 } = {}) {
    const d = 0.32;
    P.box('wood', -w / 2, 0, 0, -w / 2 + 0.03, h, d, C(col));
    P.box('wood', w / 2 - 0.03, 0, 0, w / 2, h, d, C(col));
    P.box('wood', -w / 2, 0, 0, w / 2, 0.06, d, C(col));
    P.box('wood', -w / 2, h - 0.03, 0, w / 2, h, d, C(col));
    P.panel('wood', -w / 2, 0, w / 2, h, 0.01, [0, 0, w, h], C(col, 0.7));
    const step = (h - 0.06) / n;
    for (let k = 0; k < n; k++) {
      const y = 0.06 + k * step;
      if (k > 0) P.box('wood', -w / 2 + 0.03, y - 0.02, 0, w / 2 - 0.03, y, d, C(col));
      const u0 = ((k * 37) % 10) / 10;
      const bw = (w - 0.06) / BOOKS_TILE;
      P.panel('books', -w / 2 + 0.03, y, w / 2 - 0.03, y + Math.min(step - 0.04, 0.3), 0.2, [u0, 0, u0 + bw, 1]);
    }
    P.collide(-w / 2, 0, w / 2, d, h).shadow(-w / 2, 0, w / 2, d, 0.45);
  },

  rug(P, { w = 2, l = 1.4, key = 'rugPersian' } = {}) {
    P.quad(key, [-w / 2, 0.012, l / 2], [w / 2, 0.012, l / 2], [w / 2, 0.012, -l / 2], [-w / 2, 0.012, -l / 2], [0, 1, 0], [0, 0, 1, 1]);
  },

  floorLamp(P, { col = '#2a2a2a', shade: s = '#f2e2c0', power = 0.65 } = {}) {
    P.geo('solid', cyl(0.16, 0.16, 0.03, 12), 0, 0.015, 0, C(col));
    P.box('solid', -0.015, 0.03, -0.015, 0.015, 1.5, 0.015, C(col));
    P.geo('glow', cyl(0.16, 0.22, 0.28, 12, true), 0, 1.55, 0, C(s, 0.85));
    P.light(0, 1.55, 0, '#ffc890', power);
    P.collide(-0.18, -0.18, 0.18, 0.18, 1.7);
  },

  plant(P, { kind = 'small', pot = '#a8583a' } = {}) {
    const leaf = [C('#3f6b2e'), C('#4f8a3a'), C('#2f5a2a')];
    if (kind === 'tall') {
      P.geo('solid', cyl(0.2, 0.15, 0.4, 10), 0, 0.2, 0, C(pot));
      P.box('wood', -0.02, 0.4, -0.02, 0.02, 1.2, 0.02, C('#5a4030'));
      [
        [0.15, 0.85, 0.05, 0.25],
        [-0.12, 1.05, 0.1, 0.22],
        [0.05, 1.3, -0.08, 0.28],
        [-0.05, 1.55, 0.05, 0.22],
        [0.12, 1.15, -0.12, 0.2],
      ].forEach(([x, y, z, r], i) => P.geo('solid', ico(r), x, y, z, leaf[i % 3], i, 1, 0.6, 1));
      P.collide(-0.22, -0.22, 0.22, 0.22, 1.6);
    } else if (kind === 'big') {
      P.geo('solid', cyl(0.24, 0.2, 0.45, 10), 0, 0.225, 0, C(pot));
      [
        [0.18, 0.75, 0.1, 0.35],
        [-0.2, 0.8, -0.05, 0.32],
        [0, 1.05, 0, 0.38],
      ].forEach(([x, y, z, r], i) => P.geo('solid', ico(r), x, y, z, leaf[i % 3], i, 1.2, 0.7, 1.2));
      P.collide(-0.28, -0.28, 0.28, 0.28, 1.2);
    } else {
      P.geo('solid', cyl(0.1, 0.08, 0.16, 8), 0, 0.08, 0, C(pot));
      P.geo('solid', ico(0.16), 0, 0.26, 0, leaf[1], 0, 1, 0.8, 1);
    }
  },

  // --- kitchen -------------------------------------------------------------
  counter(P, { x0, x1, cab = '#e8e4dc', cabKey = 'solid', top = '#7a7a76', topKey = 'solid', handles = '#8a8a8a', d = 0.62 } = {}) {
    P.box('solid', x0, 0, 0, x1, 0.1, d - 0.08, C('#2a2826'));
    P.box(cabKey, x0, 0.1, 0, x1, 0.86, d - 0.02, C(cab));
    P.box(topKey, x0 - 0.02, 0.86, 0, x1 + 0.02, 0.9, d + 0.02, C(top), { bottom: true });
    for (let x = x0 + 0.6; x < x1 - 0.1; x += 0.6) P.box('solid', x - 0.004, 0.12, d - 0.02, x + 0.004, 0.84, d - 0.015, C('#3a3632'));
    for (let x = x0 + 0.3; x < x1; x += 0.6) P.box('solid', x - 0.1, 0.74, d - 0.02, x + 0.1, 0.76, d + 0.01, C(handles));
    P.collide(x0, 0, x1, d, 0.9).shadow(x0, 0, x1, d, 0.35);
  },
  upper(P, { x0, x1, col = '#e8e4dc', key = 'solid', y0 = 1.45, y1 = 2.2, handles = '#8a8a8a' } = {}) {
    P.box(key, x0, y0, 0, x1, y1, 0.34, C(col), { bottom: true });
    for (let x = x0 + 0.5; x < x1 - 0.1; x += 0.5) P.box('solid', x - 0.004, y0 + 0.02, 0.34, x + 0.004, y1 - 0.02, 0.345, C('#3a3632'));
    for (let x = x0 + 0.25; x < x1; x += 0.5) P.box('solid', x - 0.01, y0 + 0.05, 0.34, x + 0.01, y0 + 0.2, 0.37, C(handles));
  },
  backsplash(P, { x0, x1, key = 'subway', y0 = 0.9, y1 = 1.45, col = '#ffffff' } = {}) {
    const s = 0.6;
    P.panel(key, x0, y0, x1, y1, 0.006, [x0 / s, y0 / s, x1 / s, y1 / s], C(col));
  },
  sink(P, { x = 0, steel = true } = {}) {
    P.box('solid', x - 0.32, 0.86, 0.1, x + 0.32, 0.905, 0.5, C(steel ? '#9aa0a6' : '#e8e8e4'));
    P.box('solid', x - 0.28, 0.905, 0.14, x + 0.28, 0.906, 0.46, C('#4a4e52'));
    P.box('solid', x - 0.02, 0.9, 0.04, x + 0.02, 1.2, 0.08, C('#c8ccd0'));
    P.box('solid', x - 0.02, 1.16, 0.04, x + 0.02, 1.2, 0.28, C('#c8ccd0'));
  },
  stove(P, { x = 0, style = 'old', w = 0.76 } = {}) {
    const body = style === 'old' ? '#e6dfc8' : '#9ea4aa';
    P.box('solid', x - w / 2, 0, 0, x + w / 2, 0.9, 0.64, C(body), { top: false });
    P.box('solid', x - w / 2, 0.9, 0, x + w / 2, 0.92, 0.64, C(style === 'old' ? '#2a2a2a' : '#1a1a1c'));
    P.box('solid', x - w / 2 + 0.06, 0.15, 0.64, x + w / 2 - 0.06, 0.65, 0.645, C('#1a1a1c'));
    P.box('solid', x - w / 2 + 0.06, 0.68, 0.64, x + w / 2 - 0.06, 0.7, 0.68, C('#c8ccd0'));
    for (const [bx, bz, r] of [
      [-0.18, 0.18, 0.1],
      [0.18, 0.18, 0.08],
      [-0.18, 0.46, 0.08],
      [0.18, 0.46, 0.1],
    ])
      P.geo('solid', cyl(r, r, 0.012, 10), x + bx, 0.926, bz, C('#3a3a3a'));
    for (let k = 0; k < 4; k++) P.geo('solid', cyl(0.022, 0.022, 0.03, 8), x - 0.22 + k * 0.146, 0.8, 0.655, C('#2a2a2a'), 0, 1, 1, 1, Math.PI / 2);
    if (style === 'old') {
      P.box('solid', x - w / 2, 0.92, 0, x + w / 2, 1.12, 0.06, C(body));
      P.box('glow', x - 0.05, 1.0, 0.061, x + 0.05, 1.04, 0.062, C('#4aff8a'));
    }
    P.collide(x - w / 2, 0, x + w / 2, 0.64, 0.92);
  },
  hood(P, { x = 0, w = 0.76, steel = true } = {}) {
    P.box('solid', x - w / 2, 1.55, 0, x + w / 2, 1.7, 0.5, C(steel ? '#a8aeb4' : '#e6dfc8'), { bottom: true });
    P.box('solid', x - 0.18, 1.7, 0, x + 0.18, 2.4, 0.25, C(steel ? '#a8aeb4' : '#e6dfc8'));
  },
  fridge(P, { x = 0, style = 'old', w = 0.75, h = 1.75, onUse } = {}) {
    const body = style === 'old' ? '#ece6d4' : '#aab0b6';
    P.box('solid', x - w / 2, 0, 0, x + w / 2, h, 0.7, C(body));
    const seamY = style === 'old' ? h * 0.72 : h * 0.4;
    P.box('solid', x - w / 2 + 0.01, seamY, 0.7, x + w / 2 - 0.01, seamY + 0.01, 0.705, C('#3a3a3a'));
    if (style !== 'old') P.box('solid', x - 0.004, seamY, 0.7, x + 0.004, h - 0.02, 0.705, C('#3a3a3a'));
    const hx = style === 'old' ? x + w / 2 - 0.08 : x - 0.04;
    P.box('solid', hx, seamY + 0.12, 0.7, hx + 0.03, seamY + 0.5, 0.75, C(style === 'old' ? '#c8c8c0' : '#d8dce0'));
    if (style !== 'old') P.box('solid', x + 0.01, seamY + 0.12, 0.7, x + 0.04, seamY + 0.5, 0.75, C('#d8dce0'));
    if (style === 'old') {
      for (const [mx, my, col] of [
        [x - 0.1, 1.1, '#e83a3a'],
        [x + 0.05, 0.9, '#3a7ae8'],
        [x - 0.15, 0.7, '#f0f0e0'],
      ])
        P.box('solid', mx, my, 0.7, mx + (col === '#f0f0e0' ? 0.16 : 0.05), my + (col === '#f0f0e0' ? 0.2 : 0.05), 0.71, C(col));
    }
    P.collide(x - w / 2, 0, x + w / 2, 0.7, h).shadow(x - w / 2, 0, x + w / 2, 0.7, 0.5);
    if (onUse) P.interact(x, 1.2, onUse);
    // where a photo-booth strip gets stuck with a magnet (see apartments.js)
    P.k.fridgePhoto = P.m.clone().multiply(trs(x + 0.145, 0.61, 0.716));
  },
  microwave(P, { x = 0, z = 0.1 } = {}) {
    P.box('solid', x - 0.25, 0.9, z, x + 0.25, 1.18, z + 0.36, C('#e0e0dc'));
    P.box('solid', x - 0.22, 0.93, z + 0.36, x + 0.1, 1.15, z + 0.365, C('#1a1a1c'));
    P.box('glow', x + 0.13, 1.1, z + 0.36, x + 0.21, 1.13, z + 0.365, C('#3aff6a'));
  },
  kettle(P, { x = 0, z = 0.3 } = {}) {
    P.geo('solid', cyl(0.08, 0.1, 0.2, 10), x, 1.0, z, C('#c03a2a'));
  },
  fruitBowl(P, { x = 0, y = 0.9, z = 0.3 } = {}) {
    P.geo('solid', cyl(0.16, 0.08, 0.06, 10), x, y + 0.03, z, C('#e8e4dc'));
    [
      ['#e8a02a', -0.05, 0],
      ['#c82a2a', 0.05, 0.03],
      ['#e8d84a', 0, -0.05],
    ].forEach(([c, dx, dz]) => P.geo('solid', ico(0.045, 1), x + dx, y + 0.09, z + dz, C(c)));
  },
  island(P, { w = 2.0, d = 0.95, cab = '#2e3a44', top = '#e8e6e0', topKey = 'marble', stools = 3, stoolCol = '#3a3a3a' } = {}) {
    P.box('solid', -w / 2, 0.08, -d / 2, w / 2, 0.88, d / 2 - 0.25, C(cab));
    P.box('solid', -w / 2 + 0.04, 0, -d / 2 + 0.04, w / 2 - 0.04, 0.08, d / 2 - 0.3, C('#1a1a1a'));
    P.box(topKey, -w / 2 - 0.03, 0.88, -d / 2 - 0.03, w / 2 + 0.03, 0.92, d / 2 + 0.03, C(top), { bottom: true });
    for (let k = 0; k < stools; k++) {
      const x = -w / 2 + (w * (k + 0.5)) / stools;
      const S = P.sub(x, d / 2 + 0.35);
      S.geo('fabric', cyl(0.2, 0.2, 0.06, 12), 0, 0.68, 0, C(stoolCol));
      S.geo('solid', cyl(0.025, 0.025, 0.66, 6), 0, 0.33, 0, C('#a8a8a8'));
      S.geo('solid', cyl(0.18, 0.18, 0.02, 12), 0, 0.01, 0, C('#a8a8a8'));
      S.geo('solid', cyl(0.16, 0.16, 0.015, 12, true), 0, 0.3, 0, C('#a8a8a8'));
    }
    P.collide(-w / 2, -d / 2, w / 2, d / 2, 0.92).shadow(-w / 2, -d / 2, w / 2, d / 2, 0.5);
    P.collide(-w / 2, d / 2 + 0.15, w / 2, d / 2 + 0.55, 0.7);
  },

  // --- dining / office -------------------------------------------------------
  chair(P, { col = '#6a4a32', seat = null } = {}) {
    P.box('wood', -0.22, 0.43, -0.22, 0.22, 0.47, 0.22, C(seat ?? col));
    for (const [x, z] of [
      [-0.2, -0.2],
      [0.17, -0.2],
      [-0.2, 0.17],
      [0.17, 0.17],
    ])
      P.box('wood', x, 0, z, x + 0.03, 0.43, z + 0.03, C(col, 0.85));
    P.box('wood', -0.21, 0.47, -0.22, 0.21, 0.92, -0.19, C(col));
    P.collide(-0.24, -0.24, 0.24, 0.24, 0.9);
  },
  diningTable(P, { w = 1.6, d = 0.9, col = '#6a4a32', chairs = 4, chairCol, seat, round = false, topKey = 'wood' } = {}) {
    if (round) {
      P.geo(topKey, cyl(w / 2, w / 2, 0.04, 16), 0, 0.74, 0, C(col));
      P.geo('wood', cyl(0.06, 0.06, 0.72, 8), 0, 0.36, 0, C(col, 0.8));
      P.geo('wood', cyl(0.3, 0.3, 0.03, 12), 0, 0.015, 0, C(col, 0.8));
    } else {
      P.box(topKey, -w / 2, 0.72, -d / 2, w / 2, 0.76, d / 2, C(col), { bottom: true });
      for (const [x, z] of [
        [-w / 2 + 0.05, -d / 2 + 0.05],
        [w / 2 - 0.1, -d / 2 + 0.05],
        [-w / 2 + 0.05, d / 2 - 0.1],
        [w / 2 - 0.1, d / 2 - 0.1],
      ])
        P.box('wood', x, 0, z, x + 0.05, 0.72, z + 0.05, C(col, 0.85));
    }
    const spots =
      chairs === 2
        ? [
            [0, -d / 2 - 0.3, 0],
            [0, d / 2 + 0.3, Math.PI],
          ]
        : chairs === 6
          ? [
              [-w / 3, -d / 2 - 0.3, 0],
              [0, -d / 2 - 0.3, 0],
              [w / 3, -d / 2 - 0.3, 0],
              [-w / 3, d / 2 + 0.3, Math.PI],
              [0, d / 2 + 0.3, Math.PI],
              [w / 3, d / 2 + 0.3, Math.PI],
            ]
          : [
              [-w / 4, -d / 2 - 0.3, 0],
              [w / 4, -d / 2 - 0.3, 0],
              [-w / 4, d / 2 + 0.3, Math.PI],
              [w / 4, d / 2 + 0.3, Math.PI],
            ];
    for (const [x, z, r] of spots) F.chair(P.sub(x, z, r), { col: chairCol ?? col, seat });
    P.collide(-w / 2, -d / 2, w / 2, d / 2, 0.76).shadow(-w / 2, -d / 2, w / 2, d / 2, 0.5);
  },
  desk(P, { w = 1.2, col = '#e8e4dc', legs = '#2a2a2a', monitor = true, lamp = true } = {}) {
    P.box('wood', -w / 2, 0.72, 0, w / 2, 0.76, 0.65, C(col), { bottom: true });
    for (const x of [-w / 2 + 0.02, w / 2 - 0.05]) P.box('solid', x, 0, 0.05, x + 0.03, 0.72, 0.6, C(legs));
    if (monitor) {
      P.box('solid', -0.1, 0.76, 0.12, 0.1, 0.78, 0.28, C('#1a1a1a'));
      P.box('solid', -0.02, 0.78, 0.18, 0.02, 0.95, 0.22, C('#1a1a1a'));
      P.box('solid', -0.3, 0.92, 0.18, 0.3, 1.27, 0.22, C('#141416'));
      P.box('glow', -0.28, 0.94, 0.221, 0.28, 1.25, 0.222, C('#2a4a7a'));
      P.box('solid', -0.22, 0.76, 0.38, 0.22, 0.775, 0.52, C('#2a2a2c'));
    }
    if (lamp) {
      P.box('solid', w / 2 - 0.2, 0.76, 0.1, w / 2 - 0.1, 0.78, 0.2, C('#2a2a2a'));
      P.geo('solid', box(0.015, 0.4, 0.015), w / 2 - 0.15, 0.97, 0.15, C('#2a2a2a'), 0, 1, 1, 1, 0.3);
      P.geo('glow', cyl(0.05, 0.09, 0.1, 10, true), w / 2 - 0.15, 1.13, 0.27, C('#fff0c8'));
      P.light(w / 2 - 0.15, 1.1, 0.3, '#ffe0b0', 0.35);
    }
    P.box('solid', -w / 2 + 0.1, 0.76, 0.42, -w / 2 + 0.32, 0.78, 0.58, C('#f2f0ea'));
    P.collide(-w / 2, 0, w / 2, 0.65, 0.76).shadow(-w / 2, 0, w / 2, 0.65, 0.35);
    const S = P.sub(0, 0.95, Math.PI);
    S.geo('fabric', cyl(0.24, 0.24, 0.07, 10), 0, 0.48, 0, C('#2a2a2c'));
    S.box('fabric', -0.22, 0.52, 0.18, 0.22, 1.05, 0.24, C('#2a2a2c'));
    S.geo('solid', cyl(0.03, 0.03, 0.42, 6), 0, 0.24, 0, C('#8a8a8a'));
    S.geo('solid', cyl(0.28, 0.28, 0.03, 5), 0, 0.03, 0, C('#2a2a2a'));
    S.collide(-0.26, -0.26, 0.26, 0.26, 1.0);
  },

  // --- bathroom ------------------------------------------------------------
  toilet(P, {} = {}) {
    const w = C('#f4f4f0');
    P.box('solid', -0.2, 0.4, 0, 0.2, 0.8, 0.18, w);
    P.box('solid', -0.21, 0.8, -0.01, 0.21, 0.83, 0.19, w);
    P.geo('solid', cyl(0.19, 0.15, 0.4, 12), 0, 0.2, 0.42, w, 0, 1, 1, 1.3);
    P.geo('solid', cyl(0.2, 0.2, 0.03, 12), 0, 0.415, 0.42, C('#ececE6'), 0, 1, 1, 1.3);
    P.box('solid', -0.05, 0.75, 0.18, 0.05, 0.77, 0.2, C('#c8ccd0'));
    P.collide(-0.22, 0, 0.22, 0.7, 0.8);
  },
  vanity(P, { w = 0.8, col = '#e8e4dc', top = '#eeeeea', topKey = 'solid', mirror = true, mirrorW, light = true } = {}) {
    P.box('solid', -w / 2, 0.1, 0, w / 2, 0.82, 0.48, C(col));
    P.box('solid', -w / 2 + 0.02, 0, 0, w / 2 - 0.02, 0.1, 0.44, C('#3a3632'));
    P.box(topKey, -w / 2 - 0.02, 0.82, 0, w / 2 + 0.02, 0.86, 0.5, C(top), { bottom: true });
    P.box('solid', -0.004, 0.14, 0.48, 0.004, 0.78, 0.485, C('#3a3632'));
    P.geo('solid', cyl(0.2, 0.17, 0.03, 14), 0, 0.865, 0.26, C('#d8dcdc'), 0, 1, 1, 0.75);
    P.box('solid', -0.015, 0.86, 0.04, 0.015, 1.05, 0.07, C('#c8ccd0'));
    P.box('solid', -0.015, 1.02, 0.04, 0.015, 1.05, 0.16, C('#c8ccd0'));
    if (mirror) {
      const mw = mirrorW ?? w;
      P.box('solid', -mw / 2 - 0.03, 1.08, 0, mw / 2 + 0.03, 1.92, 0.02, C('#c8c4b8'));
      P.panel('mirror', -mw / 2, 1.11, mw / 2, 1.89, 0.021);
    }
    if (light) {
      P.box('solid', -w / 2, 1.96, 0, w / 2, 2.04, 0.1, C('#c8ccd0'));
      P.box('glow', -w / 2 + 0.05, 1.955, 0.02, w / 2 - 0.05, 1.96, 0.09, C('#fff4e0'));
      P.light(0, 1.9, 0.35, '#fff0dc', 0.6);
    }
    P.collide(-w / 2, 0, w / 2, 0.5, 0.86).shadow(-w / 2, 0, w / 2, 0.5, 0.35);
  },
  bathtub(P, { l = 1.6, d = 0.75, curtain = '#d8e4e8', onUse } = {}) {
    const w = C('#f2f2ee');
    P.box('solid', -l / 2, 0, 0, l / 2, 0.55, d, w, { top: false });
    P.box('solid', -l / 2, 0.55, 0, l / 2, 0.57, 0.08, w);
    P.box('solid', -l / 2, 0.55, d - 0.08, l / 2, 0.57, d, w);
    P.box('solid', -l / 2, 0.55, 0.08, -l / 2 + 0.08, 0.57, d - 0.08, w);
    P.box('solid', l / 2 - 0.08, 0.55, 0.08, l / 2, 0.57, d - 0.08, w);
    P.box('solid', -l / 2 + 0.08, 0.2, 0.08, l / 2 - 0.08, 0.21, d - 0.08, C('#cfd8dc'));
    P.box('solid', l / 2 - 0.2, 1.7, 0.01, l / 2 - 0.15, 1.75, 0.2, C('#c8ccd0'));
    P.box('solid', l / 2 - 0.22, 0.75, 0.01, l / 2 - 0.12, 0.85, 0.08, C('#c8ccd0'));
    if (curtain) {
      P.box('solid', -l / 2, 1.98, d - 0.03, l / 2, 2.0, d - 0.01, C('#c8ccd0'));
      P.quad('curtain', [-l / 2 + 0.02, 0.62, d - 0.02], [-l / 2 + 0.55, 0.62, d - 0.02], [-l / 2 + 0.55, 1.97, d - 0.02], [-l / 2 + 0.02, 1.97, d - 0.02], [0, 0, 1], [0, 0, 3, 1], C(curtain));
    }
    P.collide(-l / 2, 0, l / 2, d, 0.57);
    if (onUse) P.interact(0, d + 0.45, onUse);
  },
  shower(P, { w = 1.0, d = 1.0, onUse } = {}) {
    P.box('solid', -w / 2, 0, 0, w / 2, 0.05, d, C('#e8e8e4'));
    P.box('solid', -0.05, 0.051, d / 2 - 0.05, 0.05, 0.052, d / 2 + 0.05, C('#5a5e62'));
    P.box('glass', w / 2 - 0.01, 0.05, 0, w / 2 + 0.01, 2.0, d);
    P.box('glass', -w / 2, 0.05, d - 0.01, w / 2 - 0.45, 2.0, d + 0.01);
    for (const [x0, x1, z0, z1] of [
      [w / 2 - 0.02, w / 2 + 0.02, 0, d],
      [-w / 2, w / 2 - 0.45, d - 0.02, d + 0.02],
    ])
      P.box('solid', x0, 1.98, z0, x1, 2.01, z1, C('#a8acb0'), { bottom: true });
    P.geo('solid', cyl(0.1, 0.1, 0.02, 12), 0, 2.05, 0.3, C('#c8ccd0'));
    P.box('solid', -0.015, 2.05, 0, 0.015, 2.08, 0.3, C('#c8ccd0'));
    P.collide(w / 2 - 0.03, 0, w / 2 + 0.03, d, 2.0);
    P.collide(-w / 2, d - 0.03, w / 2 - 0.45, d + 0.03, 2.0);
    if (onUse) P.interact(0, d + 0.3, onUse);
  },
  freeTub(P, { onUse } = {}) {
    P.geo('solid', cyl(0.85, 0.75, 0.6, 16), 0, 0.3, 0, C('#f4f4f2'), 0, 1, 1, 0.48);
    P.geo('solid', cyl(0.78, 0.7, 0.01, 16), 0, 0.605, 0, C('#cfd8dc'), 0, 1, 1, 0.42);
    P.box('solid', 0.7, 0, -0.05, 0.75, 0.95, 0.05, C('#c8ccd0'));
    P.box('solid', 0.6, 0.92, -0.02, 0.75, 0.95, 0.02, C('#c8ccd0'));
    P.collide(-0.85, -0.42, 0.85, 0.42, 0.6).shadow(-0.85, -0.42, 0.85, 0.42, 0.4);
    if (onUse) P.interact(0, 0.85, onUse);
  },
  towelRack(P, { col = '#e8e0d0' } = {}) {
    P.box('solid', -0.3, 1.2, 0.0, 0.3, 1.22, 0.08, C('#c8ccd0'));
    P.box('fabric', -0.22, 0.75, 0.05, 0.22, 1.23, 0.09, C(col));
  },
  bathMat(P, { w = 0.8, l = 0.5, col = '#8ab0c8' } = {}) {
    P.box('fabric', -w / 2, 0, -l / 2, w / 2, 0.015, l / 2, C(col));
  },

  // --- fixtures & details ----------------------------------------------------
  ceilingLight(P, H, { style = 'dome', power = 1, color = '#ffd8a8', metal = '#2a2a2a' } = {}) {
    if (style === 'dome') {
      P.geo('glow', ico(0.22, 1), 0, H - 0.04, 0, C('#fff1d8'), 0, 1, 0.3, 1);
      P.light(0, H - 0.25, 0, color, power, true);
    } else if (style === 'pendant') {
      P.box('solid', -0.005, H - 0.7, -0.005, 0.005, H, 0.005, C('#1a1a1a'));
      P.geo('solid', cyl(0.06, 0.24, 0.22, 12, true), 0, H - 0.8, 0, C(metal));
      P.geo('glow', cyl(0.2, 0.2, 0.005, 12), 0, H - 0.905, 0, C('#fff0d0'));
      P.light(0, H - 1.0, 0, color, power, true);
    } else if (style === 'tube') {
      P.box('solid', -0.65, H - 0.08, -0.08, 0.65, H, 0.08, C('#d8d8d4'));
      P.box('glow', -0.6, H - 0.09, -0.05, 0.6, H - 0.08, 0.05, C('#f4f8ff'));
      P.light(0, H - 0.3, 0, '#eef4ff', power, true);
    } else if (style === 'recessed') {
      P.geo('glow', cyl(0.07, 0.07, 0.01, 10), 0, H - 0.004, 0, C('#fff4e4'));
      P.light(0, H - 0.3, 0, color, power, true);
    } else if (style === 'chandelier') {
      P.box('solid', -0.008, H - 0.6, -0.008, 0.008, H, 0.008, C('#b8a070'));
      P.geo('solid', cyl(0.4, 0.4, 0.02, 16, true), 0, H - 0.75, 0, C('#b8a070'));
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        P.geo('glow', ico(0.05, 1), Math.cos(a) * 0.4, H - 0.7, Math.sin(a) * 0.4, C('#fff0d0'));
      }
      P.light(0, H - 0.9, 0, color, power, true);
    }
  },
  fan(P, H, { power = 0.9 } = {}) {
    P.geo('solid', cyl(0.08, 0.1, 0.18, 10), 0, H - 0.09, 0, C('#6a5a4a'));
    P.geo('glow', ico(0.14, 1), 0, H - 0.28, 0, C('#fff0d8'), 0, 1, 0.6, 1);
    P.light(0, H - 0.4, 0, '#ffd8a8', power, true);
    const p = P.point(0, H - 0.2, 0);
    P.k.fans.push(p);
  },
  art(P, { idx = 0, w = 0.6, h = 0.6, y = 1.55, frame = '#2a2a2a', mat = true } = {}) {
    const u0 = (idx % 4) / 4;
    const v0 = 1 - (Math.floor(idx / 4) + 1) / 2;
    P.box('solid', -w / 2 - 0.04, y - h / 2 - 0.04, 0, w / 2 + 0.04, y + h / 2 + 0.04, 0.03, C(frame));
    if (mat) P.panel('solid', -w / 2 - 0.01, y - h / 2 - 0.01, w / 2 + 0.01, y + h / 2 + 0.01, 0.031, [0, 0, 1, 1], C('#f2f0ea'));
    P.panel('art', -w / 2 + (mat ? 0.05 : 0), y - h / 2 + (mat ? 0.05 : 0), w / 2 - (mat ? 0.05 : 0), y + h / 2 - (mat ? 0.05 : 0), 0.032, [u0, v0, u0 + 0.25, v0 + 0.5]);
  },
  poster(P, { idx = 4, w = 0.45, h = 0.6, y = 1.5 } = {}) {
    const u0 = (idx % 4) / 4;
    const v0 = 1 - (Math.floor(idx / 4) + 1) / 2;
    P.panel('art', -w / 2, y - h / 2, w / 2, y + h / 2, 0.006, [u0, v0, u0 + 0.25, v0 + 0.5]);
  },
  radiator(P, { w = 0.9 } = {}) {
    const c = C('#e4e0d4');
    for (let x = -w / 2; x < w / 2; x += 0.06) P.box('solid', x, 0.12, 0.02, x + 0.04, 0.72, 0.14, c);
    P.box('solid', -w / 2, 0.68, 0.04, w / 2, 0.72, 0.12, c);
    P.box('solid', -w / 2, 0.12, 0.04, w / 2, 0.16, 0.12, c);
    P.box('solid', -w / 2 - 0.05, 0, 0.06, -w / 2 - 0.02, 0.2, 0.09, C('#8a8a86'));
    P.collide(-w / 2, 0, w / 2, 0.15, 0.72);
  },
  windowAC(P, {} = {}) {
    P.box('solid', -0.32, 0, -0.1, 0.32, 0.38, 0.22, C('#d8d2c0'));
    P.panel('solid', -0.28, 0.04, 0.28, 0.34, 0.221, [0, 0, 1, 1], C('#8a8678'));
    for (let y = 0.07; y < 0.33; y += 0.04) P.box('solid', -0.28, y, 0.221, 0.28, y + 0.012, 0.226, C('#bdb6a2'));
  },
  boxes(P, { n = 3 } = {}) {
    const cb = '#b08a5a';
    let y = 0;
    for (let k = 0; k < n; k++) {
      const w = 0.5 - k * 0.06;
      const ry = (k % 2 ? 0.2 : -0.1) * k;
      P.geo('solid', box(w, 0.36, w * 0.8), k * 0.04, y + 0.18, 0, C(cb, 1 - k * 0.06), ry);
      P.geo('solid', box(w + 0.005, 0.02, 0.06), k * 0.04, y + 0.36, 0, C('#d8c090'), ry);
      y += 0.36;
    }
    P.collide(-0.3, -0.25, 0.35, 0.25, y);
  },
  laundry(P, {} = {}) {
    P.geo('solid', cyl(0.24, 0.2, 0.45, 10, true), 0, 0.225, 0, C('#d8d0b8'));
    P.geo('fabric', ico(0.18), 0.05, 0.42, 0, C('#3a5a8a'), 0, 1, 0.5, 1);
    P.geo('fabric', ico(0.14), -0.08, 0.45, 0.06, C('#c84a4a'), 0, 1, 0.5, 1);
    P.collide(-0.25, -0.25, 0.25, 0.25, 0.5);
  },
  coatHooks(P, { cols = ['#3a4a6a', '#8a5a3a'] } = {}) {
    P.box('wood', -0.4, 1.6, 0, 0.4, 1.68, 0.02, C('#5a4030'));
    cols.forEach((c, i) => P.geo('fabric', box(0.36, 0.8, 0.1), -0.2 + i * 0.4, 1.25, 0.08, C(c), 0, 1, 1, 1, 0.05));
    P.box('solid', -0.3, 0, 0.05, 0.3, 0.1, 0.3, C('#3a2a1e'));
  },
  outlet(P, { y = 0.3 } = {}) {
    P.box('solid', -0.035, y - 0.05, 0, 0.035, y + 0.05, 0.008, C('#f2f0ea'));
  },
  switchPlate(P, { y = 1.25 } = {}) {
    P.box('solid', -0.035, y - 0.06, 0, 0.035, y + 0.06, 0.008, C('#f2f0ea'));
    P.box('solid', -0.008, y - 0.015, 0.008, 0.008, y + 0.015, 0.016, C('#dcd8cc'));
  },
  smoke(P, H) {
    P.geo('solid', cyl(0.07, 0.07, 0.03, 10), 0, H - 0.015, 0, C('#f2f0ea'));
  },
  fireplace(P, { w = 1.8, onUse } = {}) {
    P.box('solid', -w / 2, 0, 0, w / 2, 1.0, 0.36, C('#2a2a2e'));
    P.box('solid', -w / 2 - 0.1, 1.0, 0, w / 2 + 0.1, 1.06, 0.42, C('#3a3a3e'));
    P.box('solid', -w / 2 + 0.15, 0.25, 0.36, w / 2 - 0.15, 0.55, 0.361, C('#0c0c0e'));
    P.box('glow', -w / 2 + 0.25, 0.27, 0.362, w / 2 - 0.25, 0.37, 0.363, C('#ff8a2a'));
    P.box('glow', -w / 2 + 0.35, 0.37, 0.362, w / 2 - 0.35, 0.44, 0.363, C('#ffc04a'));
    P.light(0, 0.4, 0.6, '#ff9a4a', 0.55);
    P.collide(-w / 2, 0, w / 2, 0.42, 1.06);
    if (onUse) P.interact(0, 0.9, onUse);
  },
  piano(P, { onUse } = {}) {
    const k = C('#0e0e10');
    P.box('solid', -0.75, 0.7, 0, 0.75, 1.0, 1.2, k);
    P.geo('solid', cyl(0.75, 0.75, 0.3, 16, false), 0, 0.85, 1.2, k, 0, 1, 1, 0.8);
    P.quad('solid', [-0.72, 1.0, 0.1], [0.72, 1.0, 0.1], [0.6, 1.75, 1.0], [-0.6, 1.75, 1.0], [0, 0.75, -0.66], [0, 0, 1, 1], k);
    P.quad('solid', [0.72, 1.0, 0.1], [-0.72, 1.0, 0.1], [-0.6, 1.75, 1.0], [0.6, 1.75, 1.0], [0, -0.75, 0.66], [0, 0, 1, 1], k);
    for (const [x, z] of [
      [-0.65, 0.1],
      [0.65, 0.1],
      [0, 1.7],
    ])
      P.geo('solid', cyl(0.04, 0.05, 0.7, 6), x, 0.35, z, k);
    P.box('solid', -0.72, 0.72, -0.18, 0.72, 0.76, 0.0, C('#f2f0ea'));
    for (let x = -0.68; x < 0.68; x += 0.06) if (Math.round(x * 100) % 7 !== 0) P.box('solid', x, 0.76, -0.12, x + 0.025, 0.775, 0.0, k);
    P.box('fabric', -0.4, 0.45, -0.75, 0.4, 0.5, -0.45, C('#1a1a1a'));
    for (const [x, z] of [
      [-0.36, -0.72],
      [0.33, -0.72],
      [-0.36, -0.5],
      [0.33, -0.5],
    ])
      P.box('solid', x, 0, z, x + 0.03, 0.45, z + 0.03, k);
    P.collide(-0.8, -0.2, 0.8, 1.9, 1.0).shadow(-0.8, 0, 0.8, 1.9, 0.5);
    if (onUse) P.interact(0, -1.1, onUse);
  },
  recordPlayer(P, { onUse } = {}) {
    P.box('wood', -0.8, 0, 0, 0.8, 0.6, 0.42, C('#8a5a32'));
    for (const x of [-0.4, 0.4]) P.box('solid', x - 0.005, 0.05, 0.42, x + 0.005, 0.55, 0.425, C('#2a1a10'));
    P.box('solid', -0.24, 0.6, 0.06, 0.24, 0.7, 0.38, C('#2a2a2a'));
    P.geo('solid', cyl(0.15, 0.15, 0.01, 14), -0.04, 0.71, 0.22, C('#101010'));
    P.geo('solid', cyl(0.05, 0.05, 0.012, 10), -0.04, 0.712, 0.22, C('#c83a2a'));
    P.box('solid', 0.13, 0.71, 0.1, 0.15, 0.73, 0.32, C('#c8ccd0'));
    for (const x of [-0.65, 0.65]) {
      P.box('wood', x - 0.13, 0.6, 0.06, x + 0.13, 1.05, 0.34, C('#3a2a1e'));
      P.geo('solid', cyl(0.08, 0.08, 0.01, 12), x, 0.75, 0.341, C('#1a1a1a'), 0, 1, 1, 1, Math.PI / 2);
      P.geo('solid', cyl(0.04, 0.04, 0.01, 10), x, 0.95, 0.341, C('#1a1a1a'), 0, 1, 1, 1, Math.PI / 2);
    }
    P.collide(-0.8, 0, 0.8, 0.42, 1.05).shadow(-0.8, 0, 0.8, 0.42, 0.4);
    if (onUse) P.interact(0, 0.9, onUse);
  },
  radio(P, { onUse } = {}) {
    P.box('wood', -0.18, 0, 0.0, 0.18, 0.2, 0.14, C('#7a4a2a'));
    P.panel('solid', -0.15, 0.03, 0.03, 0.17, 0.141, [0, 0, 1, 1], C('#c8b48a'));
    P.box('glow', 0.06, 0.12, 0.141, 0.15, 0.15, 0.142, C('#ffb84a'));
    if (onUse) P.interact(0, 0.7, onUse);
  },
  pipes(P, { len = 8, y = 2.8 } = {}) {
    P.geo('solid', cyl(0.05, 0.05, len, 8), 0, y, 0, C('#8a8e92'), 0, 1, 1, 1, 0, Math.PI / 2);
    P.geo('solid', cyl(0.035, 0.035, len, 8), 0, y - 0.04, 0.22, C('#a86a3a'), 0, 1, 1, 1, 0, Math.PI / 2);
    P.box('solid', -len / 2, y - 0.11, 0.45, len / 2, y + 0.11, 0.8, C('#b8bec4'), { bottom: true });
    for (let x = -len / 2 + 1; x < len / 2; x += 1.5) P.box('solid', x, y - 0.125, 0.43, x + 0.04, y + 0.125, 0.82, C('#9aa0a6'), { bottom: true });
  },
  beam(P, { len = 9, y = 2.95 } = {}) {
    P.box('solid', -0.05, y - 0.2, -len / 2, 0.05, y + 0.05, len / 2, C('#6a7076'), { bottom: true });
    P.box('solid', -0.1, y - 0.22, -len / 2, 0.1, y - 0.19, len / 2, C('#6a7076'), { bottom: true });
  },
  barCart(P, {} = {}) {
    for (const y of [0.2, 0.75]) P.box('glass', -0.35, y, 0, 0.35, y + 0.02, 0.45);
    for (const [x, z] of [
      [-0.35, 0],
      [0.32, 0],
      [-0.35, 0.42],
      [0.32, 0.42],
    ])
      P.box('solid', x, 0, z, x + 0.03, 0.8, z + 0.03, C('#c8a860'));
    ['#5a2a1a', '#2a4a2a', '#c8c0a0'].forEach((c, i) => P.geo('solid', cyl(0.035, 0.04, 0.28, 8), -0.2 + i * 0.18, 0.92, 0.2, C(c)));
    P.collide(-0.36, 0, 0.36, 0.46, 0.9);
  },
  bench(P, { w = 1.4, col = '#c8b8a0' } = {}) {
    P.box('fabric', -w / 2, 0.38, 0, w / 2, 0.48, 0.42, C(col));
    for (const x of [-w / 2 + 0.04, w / 2 - 0.08]) P.box('wood', x, 0, 0.04, x + 0.04, 0.38, 0.38, C('#3a2a1e'));
    P.collide(-w / 2, 0, w / 2, 0.42, 0.48);
  },
};
