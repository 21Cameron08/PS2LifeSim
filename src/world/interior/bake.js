import * as THREE from 'three';
import { smoothstep } from '../../core/rng.js';

// PS2-style baked vertex lighting for interiors.
//
// Each vertex stores two pre-computed values:
//   aLamp (rgb)  how much light it gets from the room's lamps
//   aDay  (float) how much daylight reaches it through the windows
// At runtime the shader mixes them: ambient + aLamp * lampsOn + aDay * skyColour.
// So lights can switch on/off and daylight can follow the clock, with zero
// real-time lights on the walls. Contact shadows under furniture and darker
// corners are baked in too.

export function makeInteriorUniforms() {
  return {
    uLampOn: { value: 1 },
    uDayColor: { value: new THREE.Color(1, 1, 1) },
    uAmbient: { value: new THREE.Color(0.035, 0.035, 0.042) },
  };
}

export function interiorMaterial(map, uniforms, opts = {}) {
  const m = new THREE.MeshBasicMaterial({ map, vertexColors: true, fog: false, ...opts });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec3 aLamp;
attribute float aDay;
uniform float uLampOn;
uniform vec3 uDayColor;
uniform vec3 uAmbient;
varying vec3 vBake;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vBake = uAmbient + aLamp * uLampOn + aDay * uDayColor;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vBake;`)
      .replace('#include <color_fragment>', `#include <color_fragment>\ndiffuseColor.rgb *= vBake;`);
  };
  m.customProgramCacheKey = () => 'interior-baked';
  return m;
}

/**
 * ctx: { rooms: [{x0,z0,x1,z1, lampAmb:Color, dayAmb}], lights: [{x,y,z,color,power,down,room}],
 *        windows: [{x,y,z,nx,nz,area,room}], shadows: [{x0,z0,x1,z1,k}], floorY, ceil }
 */
export function bake(geo, ctx) {
  const pos = geo.attributes.position;
  const nrm = geo.attributes.normal;
  const n = pos.count;
  const lamp = new Float32Array(n * 3);
  const day = new Float32Array(n);
  const { rooms, lights, windows, shadows, floorY, ceil } = ctx;
  for (let i = 0; i < n; i++) {
    const px = pos.getX(i);
    const py = pos.getY(i);
    const pz = pos.getZ(i);
    const nx = nrm.getX(i);
    const ny = nrm.getY(i);
    const nz = nrm.getZ(i);
    const room = roomAt(rooms, px + nx * 0.12, pz + nz * 0.12);
    let r = 0;
    let g = 0;
    let b = 0;
    let d = 0;
    if (room >= 0) {
      const R = rooms[room];
      r = R.lampAmb.r;
      g = R.lampAmb.g;
      b = R.lampAmb.b;
      d = R.dayAmb;
      for (const L of lights) {
        if (L.room !== room) continue;
        const dx = L.x - px;
        const dy = L.y - py;
        const dz = L.z - pz;
        const d2 = dx * dx + dy * dy + dz * dz;
        const dl = Math.sqrt(d2) || 1e-4;
        const ndl = (nx * dx + ny * dy + nz * dz) / dl;
        let w = Math.max(0, (ndl + 0.12) / 1.12);
        // ceiling fixtures throw most of their light downward
        if (L.down) w *= 0.3 + 0.7 * Math.max(0, dy / dl);
        const att = (L.power * 1.7) / (1 + d2 * 0.6);
        r += L.color.r * w * att;
        g += L.color.g * w * att;
        b += L.color.b * w * att;
      }
      for (const W of windows) {
        if (W.room !== room) continue;
        const vx = px - W.x;
        const vy = py - W.y;
        const vz = pz - W.z;
        const dl = Math.hypot(vx, vy, vz) || 1e-4;
        const front = (W.nx * vx + W.nz * vz) / dl;
        if (front <= 0) continue;
        const facing = Math.max(0, (-(nx * vx + ny * vy + nz * vz) / dl + 0.25) / 1.25);
        d += (W.area * front * facing * 0.6) / (1 + dl * dl * 0.28);
      }
    }
    // ambient occlusion-ish darkening
    let ao = 1;
    const h = py - floorY;
    if (Math.abs(ny) < 0.5) ao *= 0.72 + 0.28 * smoothstep(0, 0.7, h);
    if (ny < -0.5 && h > ceil - 0.05) ao *= 0.9;
    if (ny > 0.5 && h < 0.05) {
      for (const S of shadows) {
        const ex = Math.max(S.x0 - px, 0, px - S.x1);
        const ez = Math.max(S.z0 - pz, 0, pz - S.z1);
        const dist = Math.hypot(ex, ez);
        ao *= 1 - S.k * (1 - smoothstep(0, 0.45, dist));
      }
      if (room >= 0) {
        const R = rooms[room];
        const edge = Math.min(px - R.x0, R.x1 - px, pz - R.z0, R.z1 - pz);
        ao *= 0.74 + 0.26 * smoothstep(0, 0.5, edge);
      }
    }
    lamp[i * 3] = r * ao;
    lamp[i * 3 + 1] = g * ao;
    lamp[i * 3 + 2] = b * ao;
    day[i] = d * ao;
  }
  geo.setAttribute('aLamp', new THREE.BufferAttribute(lamp, 3));
  geo.setAttribute('aDay', new THREE.BufferAttribute(day, 1));
}

export function roomAt(rooms, x, z) {
  for (let k = 0; k < rooms.length; k++) {
    const R = rooms[k];
    if (x >= R.x0 && x <= R.x1 && z >= R.z0 && z <= R.z1) return k;
  }
  return -1;
}
