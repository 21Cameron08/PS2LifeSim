import * as THREE from 'three';
import { Rng } from '../core/rng.js';

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SKY_FRAG = /* glsl */ `
uniform vec3 top;
uniform vec3 horizon;
uniform vec3 bottom;
uniform vec3 sunDir;
uniform vec3 sunColor;
uniform vec3 magic;
uniform float magicAmt;
uniform float night;
uniform float time;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(horizon, top, smoothstep(0.0, 0.6, h));
  col = mix(col, bottom, smoothstep(0.0, -0.2, h));
  vec3 sd = normalize(sunDir);
  float s = max(dot(d, sd), 0.0);
  float sunVis = smoothstep(-0.15, 0.05, sd.y);
  col += sunColor * (smoothstep(0.9992, 0.9996, s) * 6.0 + pow(s, 10.0) * 0.45 + pow(s, 120.0) * 0.6) * sunVis;
  vec3 md = normalize(vec3(-sd.x, max(-sd.y, 0.25), -sd.z + 0.3));
  float m = max(dot(d, md), 0.0);
  col += vec3(0.85, 0.9, 1.1) * (smoothstep(0.99935, 0.9996, m) * 2.4 + pow(m, 60.0) * 0.12) * night;
  // a faint, slow aurora-like glow that only shows near the Lantern Quarter
  float band = smoothstep(0.42, 0.05, abs(h - 0.12 - 0.05 * sin(d.x * 6.0 + time * 0.2)));
  col += magic * magicAmt * band * (0.6 + 0.4 * sin(d.z * 9.0 + time * 0.3));
  gl_FragColor = vec4(col, 1.0);
}`;

const CLOUD_VERT = /* glsl */ `
varying vec2 vUv;
varying float vDist;
uniform float time;
void main() {
  vUv = uv * 3.0 + vec2(time * 0.004, time * 0.0015);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vDist = length(position.xy);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const CLOUD_FRAG = /* glsl */ `
uniform sampler2D map;
uniform vec3 color;
uniform float opacity;
varying vec2 vUv;
varying float vDist;
void main() {
  float a = texture2D(map, vUv).a;
  a = smoothstep(0.05, 0.6, a) * opacity * smoothstep(620.0, 250.0, vDist);
  gl_FragColor = vec4(color, a);
}`;

export class Sky {
  constructor(scene, tex) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.uniforms = {
      top: { value: new THREE.Color() },
      horizon: { value: new THREE.Color() },
      bottom: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      sunColor: { value: new THREE.Color() },
      magic: { value: new THREE.Color('#7b4dff') },
      magicAmt: { value: 0 },
      night: { value: 0 },
      time: { value: 0 },
    };
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(520, 24, 16),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    );
    dome.renderOrder = -10;
    dome.frustumCulled = false;
    this.group.add(dome);

    // stars
    const rng = new Rng(77);
    const pts = [];
    for (let i = 0; i < 700; i++) {
      const u = rng.float(0.04, 1);
      const a = rng.float(0, Math.PI * 2);
      const r = Math.sqrt(1 - u * u);
      pts.push(Math.cos(a) * r * 480, u * 480, Math.sin(a) * r * 480);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.starMat = new THREE.PointsMaterial({
      color: 0xdfe8ff,
      size: 1.4,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    });
    const stars = new THREE.Points(sg, this.starMat);
    stars.renderOrder = -9;
    stars.frustumCulled = false;
    this.group.add(stars);

    // a single big cloud layer
    this.cloudUniforms = {
      map: { value: tex.clouds },
      color: { value: new THREE.Color() },
      opacity: { value: 0.7 },
      time: { value: 0 },
    };
    const cloud = new THREE.Mesh(
      new THREE.PlaneGeometry(1300, 1300, 1, 1),
      new THREE.ShaderMaterial({
        uniforms: this.cloudUniforms,
        vertexShader: CLOUD_VERT,
        fragmentShader: CLOUD_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      }),
    );
    cloud.rotation.x = Math.PI / 2;
    cloud.position.y = 160;
    cloud.renderOrder = -8;
    cloud.frustumCulled = false;
    this.group.add(cloud);
  }

  update(camera, time) {
    this.group.position.copy(camera.position);
    this.uniforms.time.value = time;
    this.cloudUniforms.time.value = time;
  }
}
