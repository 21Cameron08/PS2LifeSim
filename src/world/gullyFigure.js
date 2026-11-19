import * as THREE from 'three';
import { shade, trs } from '../core/geo.js';

// Gully, the GULLY'S mascot: a round seagull in a sailor cap, winking. One low-poly
// figure (about 1.2 m tall at scale 1, feet at y = 0, facing +z) used for the pole
// sign, the statue in the kids' corner, the kiddie ride and the Gull Box toys.

const sph = (r, w = 10, h = 7) => new THREE.SphereGeometry(r, w, h);
const cyl = (rt, rb, h, s = 12) => new THREE.CylinderGeometry(rt, rb, h, s);

export function gullyParts({ cap = '#17a2a8', body = '#f6f4ee', wing = '#c8ccd4', beak = '#ff8a2a', band = '#ffffff' } = {}) {
  const P = [];
  const add = (geo, m, col) => P.push({ geo, m, col });
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.12, 0.04, 0.16), trs(s * 0.12, 0.02, 0.05), beak);
    add(cyl(0.025, 0.025, 0.2, 6), trs(s * 0.11, 0.14, 0), beak);
    add(sph(0.3, 8, 6), trs(s * 0.3, 0.5, -0.02, 0, 0.35, 0.8, 1.0, 0, s * 0.25), wing);
  }
  add(sph(0.33), trs(0, 0.5, 0, 0, 1, 0.95, 1.12), body);
  add(new THREE.ConeGeometry(0.14, 0.32, 8), trs(0, 0.55, -0.42, 0, 1, 1, 1, -Math.PI / 2 + 0.4), wing);
  add(sph(0.23), trs(0, 0.95, 0.06), body);
  add(new THREE.ConeGeometry(0.065, 0.24, 8), trs(0, 0.92, 0.36, 0, 1, 1, 1, Math.PI / 2), beak);
  add(sph(0.035, 6, 4), trs(0.09, 1.0, 0.25), '#141418');
  add(new THREE.BoxGeometry(0.08, 0.014, 0.02), trs(-0.09, 1.0, 0.255, 0, 1, 1, 1, 0, 0.25), '#141418'); // the wink
  add(cyl(0.2, 0.22, 0.1), trs(0, 1.13, 0.03), cap);
  add(cyl(0.225, 0.225, 0.035), trs(0, 1.075, 0.03), band);
  add(new THREE.BoxGeometry(0.2, 0.02, 0.12), trs(0, 1.08, 0.24, 0, 1, 1, 1, 0.2), '#1d2c4c');
  return P;
}

/** Add a Gully to a GeoBuilder at world matrix m. */
export function addGully(builder, m, opts) {
  for (const p of gullyParts(opts)) builder.addGeometry(p.geo, m.clone().multiply(p.m), shade(p.col));
}
