import * as THREE from 'three';

// The "PS2 look" is mostly a post-process recipe:
//  1. render the 3D scene at a low internal resolution (default 448 lines, like the PS2)
//  2. a big soft glow ("PS2 bloom") around bright things like windows and lamps
//  3. colour grading + vignette
//  4. ordered dithering + colour quantisation (the PS2 often ran 16-bit framebuffers)
//  5. let the browser scale the small image up to the screen (soft, CRT-ish)

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const BRIGHT = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 texel;
uniform float threshold;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv + texel * vec2(-1.0, -1.0)).rgb
         + texture2D(tSrc, vUv + texel * vec2( 1.0, -1.0)).rgb
         + texture2D(tSrc, vUv + texel * vec2(-1.0,  1.0)).rgb
         + texture2D(tSrc, vUv + texel * vec2( 1.0,  1.0)).rgb;
  c *= 0.25;
  float l = max(c.r, max(c.g, c.b));
  c *= smoothstep(threshold, threshold + 0.6, l);
  gl_FragColor = vec4(min(c, vec3(6.0)), 1.0);
}`;

const BLUR = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 dir;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb * 0.227027;
  c += texture2D(tSrc, vUv + dir * 1.3846).rgb * 0.316216;
  c += texture2D(tSrc, vUv - dir * 1.3846).rgb * 0.316216;
  c += texture2D(tSrc, vUv + dir * 3.2307).rgb * 0.070270;
  c += texture2D(tSrc, vUv - dir * 3.2307).rgb * 0.070270;
  gl_FragColor = vec4(c, 1.0);
}`;

const COMPOSITE = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform vec2 texel;
uniform float bloomStrength;
uniform float exposure;
uniform float saturation;
uniform float contrast;
uniform vec3 tint;
uniform float vignette;
uniform float dither;
uniform float scanlines;
uniform float soft;
uniform float levels;
uniform float time;
varying vec2 vUv;

float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
  vec3 c = texture2D(tScene, vUv).rgb;
  if (soft > 0.0) {
    // composite-video style horizontal smear
    vec3 l = texture2D(tScene, vUv - vec2(texel.x, 0.0)).rgb;
    vec3 r = texture2D(tScene, vUv + vec2(texel.x, 0.0)).rgb;
    c = mix(c, (l + c * 2.0 + r) * 0.25, soft);
  }
  c += texture2D(tBloom, vUv).rgb * bloomStrength;
  c *= exposure;
  c = aces(c);
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(lum), c, saturation);
  c = (c - 0.5) * contrast + 0.5;
  c *= tint;
  c = pow(max(c, 0.0), vec3(1.0 / 2.2));
  vec2 d = vUv - 0.5;
  c *= 1.0 - vignette * dot(d, d) * 1.8;
  if (scanlines > 0.0) c *= 1.0 - scanlines * step(1.0, mod(gl_FragCoord.y, 2.0));
  if (dither > 0.0) {
    float b = bayer4(gl_FragCoord.xy) - 0.5;
    c += b / levels;
    c = floor(c * levels + 0.5) / levels;
  }
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

export class PS2Pipeline {
  constructor(renderer) {
    this.r = renderer;
    const rtOpts = {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    };
    this.rtScene = new THREE.WebGLRenderTarget(4, 4, { ...rtOpts, depthBuffer: true });
    this.rtA = new THREE.WebGLRenderTarget(4, 4, { ...rtOpts, depthBuffer: false });
    this.rtB = new THREE.WebGLRenderTarget(4, 4, { ...rtOpts, depthBuffer: false });

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.quad = new THREE.Mesh(geo);
    this.quad.frustumCulled = false;
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quad);
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const mk = (frag, uniforms) =>
      new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
    this.brightMat = mk(BRIGHT, { tSrc: { value: null }, texel: { value: new THREE.Vector2() }, threshold: { value: 0.75 } });
    this.blurMat = mk(BLUR, { tSrc: { value: null }, dir: { value: new THREE.Vector2() } });
    this.compMat = mk(COMPOSITE, {
      tScene: { value: this.rtScene.texture },
      tBloom: { value: this.rtA.texture },
      texel: { value: new THREE.Vector2() },
      bloomStrength: { value: 0.8 },
      exposure: { value: 1.15 },
      saturation: { value: 1.08 },
      contrast: { value: 1.04 },
      tint: { value: new THREE.Vector3(1, 1, 1) },
      vignette: { value: 0.55 },
      dither: { value: 1 },
      scanlines: { value: 0.05 },
      soft: { value: 0.6 },
      levels: { value: 31 },
      time: { value: 0 },
    });
    this.settings = { bloom: true, dither: true, scanlines: true, soft: true };
    this.width = 4;
    this.height = 4;
  }

  setSize(w, h) {
    this.width = w;
    this.height = h;
    this.rtScene.setSize(w, h);
    const bw = Math.max(2, Math.floor(w / 4));
    const bh = Math.max(2, Math.floor(h / 4));
    this.rtA.setSize(bw, bh);
    this.rtB.setSize(bw, bh);
    this.brightMat.uniforms.texel.value.set(1 / w, 1 / h);
    this.compMat.uniforms.texel.value.set(1 / w, 1 / h);
    this.bloomTexel = new THREE.Vector2(1 / bw, 1 / bh);
  }

  pass(mat, target) {
    this.quad.material = mat;
    this.r.setRenderTarget(target);
    this.r.render(this.quadScene, this.quadCam);
  }

  render(scene, camera, time = 0) {
    const r = this.r;
    r.setRenderTarget(this.rtScene);
    r.clear();
    r.render(scene, camera);

    const u = this.compMat.uniforms;
    if (this.settings.bloom) {
      this.brightMat.uniforms.tSrc.value = this.rtScene.texture;
      this.pass(this.brightMat, this.rtA);
      for (const spread of [1, 2.2]) {
        this.blurMat.uniforms.tSrc.value = this.rtA.texture;
        this.blurMat.uniforms.dir.value.set(this.bloomTexel.x * spread, 0);
        this.pass(this.blurMat, this.rtB);
        this.blurMat.uniforms.tSrc.value = this.rtB.texture;
        this.blurMat.uniforms.dir.value.set(0, this.bloomTexel.y * spread);
        this.pass(this.blurMat, this.rtA);
      }
    }
    u.dither.value = this.settings.dither ? 1 : 0;
    u.scanlines.value = this.settings.scanlines ? 0.06 : 0;
    u.soft.value = this.settings.soft ? 0.6 : 0;
    u.time.value = time;
    const bs = u.bloomStrength.value;
    if (!this.settings.bloom) u.bloomStrength.value = 0;
    this.pass(this.compMat, null);
    u.bloomStrength.value = bs;
  }
}
