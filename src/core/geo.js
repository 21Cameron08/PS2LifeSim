import * as THREE from 'three';

const WHITE = [1, 1, 1];
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();

/**
 * Accumulates quads / boxes / arbitrary geometry into one big BufferGeometry.
 * Merging static scenery like this keeps draw calls low (one per material),
 * which is exactly how PS2-era city games stayed fast.
 */
export class GeoBuilder {
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.uv = [];
    this.col = [];
    this.idx = [];
    this.n = 0;
  }

  get empty() {
    return this.n === 0;
  }

  /**
   * a,b,c,d: corners counter-clockwise seen from the front (a = bottom-left).
   * n: [x,y,z] or four normals. uv: [u0,v0,u1,v1] rect or 8 explicit numbers.
   * col: [r,g,b] or four colours.
   */
  quad(a, b, c, d, n, uv = [0, 0, 1, 1], col = WHITE) {
    const s = this.n;
    this.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2]);
    if (Array.isArray(n[0])) for (const q of n) this.nrm.push(q[0], q[1], q[2]);
    else for (let k = 0; k < 4; k++) this.nrm.push(n[0], n[1], n[2]);
    if (uv.length === 8) this.uv.push(...uv);
    else this.uv.push(uv[0], uv[1], uv[2], uv[1], uv[2], uv[3], uv[0], uv[3]);
    if (Array.isArray(col[0])) for (const q of col) this.col.push(q[0], q[1], q[2]);
    else for (let k = 0; k < 4; k++) this.col.push(col[0], col[1], col[2]);
    this.idx.push(s, s + 1, s + 2, s, s + 2, s + 3);
    this.n += 4;
  }

  /** Double-sided quad (two faces back to back). */
  quad2(a, b, c, d, n, uv, col) {
    this.quad(a, b, c, d, n, uv, col);
    const flip = uv && uv.length === 8 ? [uv[2], uv[3], uv[0], uv[1], uv[6], uv[7], uv[4], uv[5]] : uv && [uv[2], uv[1], uv[0], uv[3]];
    this.quad(b, a, d, c, [-n[0], -n[1], -n[2]], flip, col);
  }

  /**
   * Axis aligned box. UVs are in world units (sx/sy units per texture tile) so one
   * shared tiling texture fits buildings of any size.
   * o: { sx, sy, ou, ov, vRange:[v0,v1], sides:[+z,-z,+x,-x], top, bottom, topScale, color, topColor }
   */
  box(x0, y0, z0, x1, y1, z1, o = {}) {
    const sx = o.sx ?? 1;
    const sy = o.sy ?? 1;
    const ou = o.ou ?? 0;
    const ov = o.ov ?? 0;
    const col = o.color ?? WHITE;
    const topCol = o.topColor ?? col;
    const w = x1 - x0;
    const h = y1 - y0;
    const d = z1 - z0;
    const V0 = o.vRange ? o.vRange[0] : ov;
    const V1 = o.vRange ? o.vRange[1] : ov + h / sy;
    const sides = o.sides ?? [true, true, true, true];
    if (sides[0]) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], [ou, V0, ou + w / sx, V1], col);
    if (sides[1]) this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], [ou, V0, ou + w / sx, V1], col);
    if (sides[2]) this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], [ou, V0, ou + d / sx, V1], col);
    if (sides[3]) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], [ou, V0, ou + d / sx, V1], col);
    if (o.top !== false) {
      const ts = o.topScale ?? sx;
      this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], [x0 / ts, -z1 / ts, x1 / ts, -z0 / ts], topCol);
    }
    if (o.bottom) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], [0, 0, 1, 1], col);
  }

  /** Box centred on (cx, cz) sitting on y0. Convenience for props. */
  cbox(cx, y0, cz, w, h, d, col = WHITE, o = {}) {
    this.box(cx - w / 2, y0, cz - d / 2, cx + w / 2, y0 + h, cz + d / 2, { ...o, color: col, bottom: o.bottom ?? false });
  }

  /** Append a THREE.BufferGeometry, transformed by matrix m, tinted by col. */
  addGeometry(geo, m, col = WHITE) {
    const p = geo.attributes.position;
    const nr = geo.attributes.normal;
    const uv = geo.attributes.uv;
    const c = geo.attributes.color;
    _nm.getNormalMatrix(m);
    const s = this.n;
    for (let k = 0; k < p.count; k++) {
      _v.fromBufferAttribute(p, k).applyMatrix4(m);
      this.pos.push(_v.x, _v.y, _v.z);
      if (nr) _n.fromBufferAttribute(nr, k).applyMatrix3(_nm).normalize();
      else _n.set(0, 1, 0);
      this.nrm.push(_n.x, _n.y, _n.z);
      if (uv) this.uv.push(uv.getX(k), uv.getY(k));
      else this.uv.push(0, 0);
      if (c) this.col.push(c.getX(k) * col[0], c.getY(k) * col[1], c.getZ(k) * col[2]);
      else this.col.push(col[0], col[1], col[2]);
    }
    if (geo.index) {
      const ix = geo.index.array;
      for (let k = 0; k < ix.length; k++) this.idx.push(s + ix[k]);
    } else {
      for (let k = 0; k < p.count; k++) this.idx.push(s + k);
    }
    this.n += p.count;
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }

  /** Build and wrap in a mesh (or return null if nothing was added). */
  mesh(material) {
    if (this.empty) return null;
    const m = new THREE.Mesh(this.build(), material);
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    return m;
  }
}

export const hex = (h) => {
  const c = new THREE.Color(h);
  return [c.r, c.g, c.b];
};

/** sRGB hex -> plain [r,g,b] in 0..1 *display* space, scaled. Used for vertex colours. */
export const shade = (h, k = 1) => {
  const c = hex(h);
  return [c[0] * k, c[1] * k, c[2] * k];
};

const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
export function trs(x, y, z, ry = 0, sx = 1, sy = sx, sz = sx, rx = 0, rz = 0) {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(sx, sy, sz);
  return _m4.clone().compose(_p, _q, _s);
}
