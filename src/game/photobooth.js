import * as THREE from 'three';

// SUBSTATION's photo booth: four flashes, four poses, one strip. Each frame is your
// character rendered in a little studio (a curtain backdrop parked under the city,
// lit by borrowing one of the shared point lights as the flash), read back and
// laid out on a canvas like a real strip, with the date printed at the bottom.

const FW = 160;
const FH = 120;
const PAD = 10;
const FOOT = 26;

export class PhotoBooth {
  constructor(renderer, scene, crowd, flashLight) {
    this.renderer = renderer;
    this.scene = scene;
    this.crowd = crowd;
    this.flashLight = flashLight;
    // render targets hold linear colour: convert to sRGB on the way out (lookup table)
    this.rt = new THREE.WebGLRenderTarget(FW, FH, { depthBuffer: true });
    this.gamma = new Uint8Array(256).map((_, v) => Math.round(255 * Math.pow(v / 255, 1 / 2.2)));
    this.cam = new THREE.PerspectiveCamera(38, FW / FH, 0.1, 20);
    this.studio = new THREE.Group();
    const curtain = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshBasicMaterial({ color: '#4a1420', fog: false }));
    curtain.position.set(0, 1.3, -0.7);
    this.studio.add(curtain);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(3, 3).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#1a1a1e', fog: false }));
    this.studio.add(floor);
    this.studio.visible = false;
    scene.add(this.studio);
    this.pixels = new Uint8Array(FW * FH * 4);
    this.canvas = document.createElement('canvas');
    this.canvas.width = FW + PAD * 2;
    this.canvas.height = FH * 4 + PAD * 5 + FOOT;
    this.g = this.canvas.getContext('2d');
    this.frames = [];
  }

  /** Start a new strip. at: a Vector3 to park the studio (somewhere nobody can see). */
  begin(at, footer) {
    this.at = at.clone();
    this.footer = footer;
    this.frames = [];
  }

  /** Take frame k (0-3) of `char` (a crowd character), in pose k. */
  shoot(char, k) {
    const c = char;
    const keep = { x: c.x, y: c.y, z: c.z, ground: c.ground, yaw: c.yaw, dance: c.dance, move: c.move, beat: c.beat, sit: c.sit, talk: c.talk, nod: c.nod, amount: c.amount, headYaw: c.headYaw, visible: c.visible };
    const S = this.at;
    Object.assign(c, { x: S.x, y: S.y, z: S.z, ground: S.y, yaw: 0, sit: false, amount: 0, visible: true, headYaw: 0 });
    // four classic booth poses: a smile, a fist, both hands up, a pout with a lean
    const poses = [
      { dance: 0, talk: true, nod: -0.05 },
      { dance: 1, move: 0, beat: 0.5, nod: 0.08 },
      { dance: 1, move: 1, beat: 0.25, nod: -0.1 },
      { dance: 1, move: 2, beat: 0.7, nod: 0.12, headYaw: 0.3 },
    ];
    Object.assign(c, poses[k]);
    this.crowd.update();
    this.studio.position.copy(S);
    this.studio.visible = true;
    const L = this.flashLight;
    const lk = { pos: L.position.clone(), color: L.color.clone(), intensity: L.intensity, distance: L.distance };
    L.position.set(S.x + 0.3, S.y + 1.9, S.z + 1.4);
    L.color.set('#fff4e8');
    L.intensity = 9;
    L.distance = 6;
    // head and shoulders, with room for a raised fist
    const h = c.app.height;
    this.cam.position.set(S.x, S.y + 1.5 * h, S.z + 1.65);
    this.cam.lookAt(S.x, S.y + 1.42 * h, S.z);
    const r = this.renderer;
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.rt);
    r.render(this.scene, this.cam);
    r.readRenderTargetPixels(this.rt, 0, 0, FW, FH, this.pixels);
    r.setRenderTarget(prev);
    L.position.copy(lk.pos);
    L.color.copy(lk.color);
    L.intensity = lk.intensity;
    L.distance = lk.distance;
    this.studio.visible = false;
    Object.assign(c, keep);
    this.crowd.update();
    // flip (GL rows start at the bottom) and give it a warm, contrasty booth look
    const img = this.g.createImageData(FW, FH);
    for (let y = 0; y < FH; y++)
      for (let x = 0; x < FW; x++) {
        const i = ((FH - 1 - y) * FW + x) * 4;
        const o = (y * FW + x) * 4;
        const v = (n) => Math.min(255, Math.max(0, (this.gamma[this.pixels[i + n]] - 128) * 1.15 + 140));
        img.data[o] = v(0) * 1.04;
        img.data[o + 1] = v(1);
        img.data[o + 2] = v(2) * 0.9;
        img.data[o + 3] = 255;
      }
    this.frames[k] = img;
  }

  /** Lay the frames out as a strip. Returns a JPEG data URL. */
  finish() {
    const g = this.g;
    g.fillStyle = '#f4f0e6';
    g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.frames.forEach((img, k) => g.putImageData(img, PAD, PAD + k * (FH + PAD)));
    g.fillStyle = '#2a2a30';
    g.font = 'bold 11px "Arial Black", Impact, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(this.footer, this.canvas.width / 2, this.canvas.height - FOOT / 2 - 2);
    return this.canvas.toDataURL('image/jpeg', 0.82);
  }
}

/** A texture from a saved strip (data URL), for the fridge at home. */
export function stripTexture(url, onReady) {
  const img = new Image();
  const tex = new THREE.Texture(img);
  tex.colorSpace = THREE.SRGBColorSpace;
  img.onload = () => {
    tex.needsUpdate = true;
    onReady?.(tex);
  };
  img.src = url;
  return tex;
}
