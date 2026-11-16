import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../core/rng.js';

// Time-of-day palette. Each key: hour -> look. Colours are blended between keys.
// This table is the single biggest lever on the game's mood, so tweak freely.
const NIGHT = {
  top: '#03050f',
  hor: '#141b33',
  ground: '#07080d',
  hemiSky: '#4a5a9a',
  hemiGround: '#1a1a26',
  hemi: 1.5,
  sun: '#9fb6ff',
  sunI: 0.55,
  cloud: '#1a2038',
  fogNear: 12,
  fogFar: 175,
  exposure: 1.25,
  tint: [0.94, 0.98, 1.08],
};
const KEYS = [
  [0, NIGHT],
  [4.6, NIGHT],
  [5.6, { top: '#151d3d', hor: '#56486a', ground: '#141420', hemiSky: '#6a6a96', hemiGround: '#2a2430', hemi: 1.2, sun: '#c09ab0', sunI: 0.5, cloud: '#5a4a68', fogNear: 15, fogFar: 190, exposure: 1.2, tint: [1, 0.97, 1.03] }],
  [6.6, { top: '#3d5f93', hor: '#f0a77c', ground: '#3a3030', hemiSky: '#9cb0d4', hemiGround: '#4a3b33', hemi: 1.6, sun: '#ffc28a', sunI: 2.0, cloud: '#ffd2b0', fogNear: 25, fogFar: 230, exposure: 1.1, tint: [1.04, 1.0, 0.95] }],
  [8.5, { top: '#4a7fc0', hor: '#b9d0e4', ground: '#4a4a48', hemiSky: '#c8daee', hemiGround: '#5a5248', hemi: 1.9, sun: '#fff1d8', sunI: 3.0, cloud: '#ffffff', fogNear: 35, fogFar: 270, exposure: 1.05, tint: [1, 1, 1] }],
  [15.5, { top: '#4b7ec2', hor: '#ccd8de', ground: '#4a4a48', hemiSky: '#c8d8e8', hemiGround: '#5a5248', hemi: 1.9, sun: '#fff0d4', sunI: 2.9, cloud: '#ffffff', fogNear: 35, fogFar: 270, exposure: 1.05, tint: [1.01, 1, 0.98] }],
  [17.4, { top: '#45619a', hor: '#efb486', ground: '#3d3534', hemiSky: '#b4aabc', hemiGround: '#4a3a34', hemi: 1.7, sun: '#ffb070', sunI: 2.4, cloud: '#ffd8b8', fogNear: 30, fogFar: 240, exposure: 1.08, tint: [1.06, 0.99, 0.92] }],
  [18.5, { top: '#2d3a70', hor: '#ff8a5a', ground: '#2a2228', hemiSky: '#8d7096', hemiGround: '#3a2a2a', hemi: 1.35, sun: '#ff7a45', sunI: 1.4, cloud: '#ff9a7a', fogNear: 22, fogFar: 215, exposure: 1.12, tint: [1.08, 0.97, 0.95] }],
  [19.5, { top: '#121a3e', hor: '#5e3a66', ground: '#120f18', hemiSky: '#4e4878', hemiGround: '#1c1824', hemi: 1.15, sun: '#a090d0', sunI: 0.6, cloud: '#4a3a62', fogNear: 15, fogFar: 190, exposure: 1.2, tint: [1.0, 0.96, 1.05] }],
  [21, NIGHT],
  [24, NIGHT],
];

const _a = new THREE.Color();
const _b = new THREE.Color();
function mixColor(out, h1, h2, t) {
  _a.set(h1);
  _b.set(h2);
  return out.copy(_a).lerp(_b, t);
}

export class Environment {
  constructor(scene, sky, pipeline) {
    this.scene = scene;
    this.sky = sky;
    this.pipeline = pipeline;
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    this.sun = new THREE.DirectionalLight(0xffffff, 1);
    scene.add(this.hemi, this.sun, this.sun.target);
    scene.fog = new THREE.Fog(0x000000, 20, 200);
    this.night = 0;
    this.magic = 0; // 0..1, how close the player is to the Lantern Quarter
    this.listeners = [];
    this.fogColor = new THREE.Color();
    this.tmp = new THREE.Color();
    this.magicFog = new THREE.Color('#3b2a66');
  }

  /** Register fn(env) called every frame after lighting updates. */
  onUpdate(fn) {
    this.listeners.push(fn);
  }

  update(hour, time, focus) {
    let k = 0;
    while (k < KEYS.length - 2 && KEYS[k + 1][0] <= hour) k++;
    const [h0, A] = KEYS[k];
    const [h1, B] = KEYS[k + 1];
    const t = smoothstep(0, 1, clamp((hour - h0) / (h1 - h0), 0, 1));

    const su = this.sky.uniforms;
    mixColor(su.top.value, A.top, B.top, t);
    mixColor(su.horizon.value, A.hor, B.hor, t);
    mixColor(su.bottom.value, A.ground, B.ground, t);

    // night factor: 1 = full night
    this.night = 1 - smoothstep(5.2, 7.0, hour) + smoothstep(17.8, 20.2, hour);
    this.night = clamp(this.night, 0, 1);

    // sun arc: rises in the east (+x) at 6, sets in the west at 18-19
    const ang = ((hour - 6.2) / 12.6) * Math.PI;
    const sunDir = new THREE.Vector3(Math.cos(ang), Math.sin(ang), 0.35).normalize();
    su.sunDir.value.copy(sunDir);
    mixColor(su.sunColor.value, A.sun, B.sun, t);
    su.night.value = this.night;
    this.sky.starMat.opacity = this.night * 0.9;

    // light from the sun when it's up, otherwise from the moon (opposite side)
    const lightDir = sunDir.y > -0.05 ? sunDir.clone() : new THREE.Vector3(-sunDir.x, Math.max(-sunDir.y, 0.4), -sunDir.z + 0.3).normalize();
    this.sun.position.copy(focus).addScaledVector(lightDir, 100);
    this.sun.target.position.copy(focus);
    this.sun.color.copy(su.sunColor.value);
    this.sun.intensity = lerp(A.sunI, B.sunI, t);
    mixColor(this.hemi.color, A.hemiSky, B.hemiSky, t);
    mixColor(this.hemi.groundColor, A.hemiGround, B.hemiGround, t);
    this.hemi.intensity = lerp(A.hemi, B.hemi, t);

    // fog = horizon colour, nudged towards violet near the Lantern Quarter
    this.fogColor.copy(su.horizon.value).lerp(this.magicFog, this.magic * (0.35 + this.night * 0.3));
    this.scene.fog.color.copy(this.fogColor);
    su.horizon.value.copy(this.fogColor);
    const near = lerp(A.fogNear, B.fogNear, t);
    const far = lerp(A.fogFar, B.fogFar, t);
    this.scene.fog.near = near * (1 - this.magic * 0.4);
    this.scene.fog.far = far * (1 - this.magic * 0.25);
    su.magicAmt.value = this.magic * (0.25 + this.night * 0.6);

    mixColor(this.sky.cloudUniforms.color.value, A.cloud, B.cloud, t);
    this.sky.cloudUniforms.opacity.value = lerp(0.75, 0.45, this.night);

    const cu = this.pipeline.compMat.uniforms;
    cu.exposure.value = lerp(A.exposure, B.exposure, t);
    cu.tint.value.set(lerp(A.tint[0], B.tint[0], t), lerp(A.tint[1], B.tint[1], t), lerp(A.tint[2], B.tint[2], t));
    cu.bloomStrength.value = lerp(0.5, 0.7, this.night) + this.magic * 0.3;
    this.pipeline.brightMat.uniforms.threshold.value = lerp(1.0, 0.85, this.night);

    this.time = time;
    this.hour = hour;
    for (const fn of this.listeners) fn(this);
  }
}
