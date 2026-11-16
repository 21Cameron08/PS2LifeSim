import * as THREE from 'three';

// Small ambient particle effects: steam from manholes, the park fountain's spray.
export class Effects {
  constructor(scene, tex, city) {
    this.vents = city.steamVents;
    this.PER = 16;
    const n = this.vents.length * this.PER;
    this.steam = [];
    for (let v = 0; v < this.vents.length; v++)
      for (let k = 0; k < this.PER; k++) this.steam.push({ v, off: k / this.PER + Math.random() * 0.05, dx: Math.random() - 0.5, dz: Math.random() - 0.5 });
    this.steamGeo = new THREE.BufferGeometry();
    this.steamGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.steamGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 4), 4));
    this.steamMat = new THREE.PointsMaterial({
      map: tex.softGlow,
      size: 2.4,
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      color: 0xffffff,
    });
    const steam = new THREE.Points(this.steamGeo, this.steamMat);
    steam.frustumCulled = false;
    steam.renderOrder = 4;
    scene.add(steam);

    this.fountain = city.fountain;
    if (this.fountain) {
      this.FN = 90;
      this.spray = [];
      for (let k = 0; k < this.FN; k++) this.spray.push({ off: Math.random(), a: Math.random() * Math.PI * 2, v: 1.2 + Math.random() * 0.8 });
      this.sprayGeo = new THREE.BufferGeometry();
      this.sprayGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.FN * 3), 3));
      this.sprayMat = new THREE.PointsMaterial({ map: tex.glow, size: 0.35, transparent: true, depthWrite: false, color: '#cfefff', opacity: 0.8 });
      const spray = new THREE.Points(this.sprayGeo, this.sprayMat);
      spray.frustumCulled = false;
      scene.add(spray);
    }
  }

  update(time, env) {
    const pos = this.steamGeo.attributes.position.array;
    const col = this.steamGeo.attributes.color.array;
    const bright = 0.35 + (1 - env.night) * 0.55;
    for (let k = 0; k < this.steam.length; k++) {
      const p = this.steam[k];
      const v = this.vents[p.v];
      const t = (time * 0.22 + p.off) % 1;
      const spread = 0.3 + t * 1.6;
      pos[k * 3] = v.x + p.dx * spread + Math.sin(time * 0.5 + p.v) * t * 1.2;
      pos[k * 3 + 1] = v.y + t * 4.5;
      pos[k * 3 + 2] = v.z + p.dz * spread;
      col[k * 4] = bright;
      col[k * 4 + 1] = bright;
      col[k * 4 + 2] = bright * 1.05;
      col[k * 4 + 3] = Math.sin(Math.PI * t) * 0.32;
    }
    this.steamGeo.attributes.position.needsUpdate = true;
    this.steamGeo.attributes.color.needsUpdate = true;

    if (this.fountain) {
      const f = this.fountain;
      const sp = this.sprayGeo.attributes.position.array;
      for (let k = 0; k < this.FN; k++) {
        const p = this.spray[k];
        const t = (time * 0.8 + p.off) % 1;
        const r = t * p.v * 1.1;
        sp[k * 3] = f.x + Math.cos(p.a) * r;
        sp[k * 3 + 1] = f.y + 2.5 + t * 2.2 - t * t * 3.6;
        sp[k * 3 + 2] = f.z + Math.sin(p.a) * r;
      }
      this.sprayGeo.attributes.position.needsUpdate = true;
      this.sprayMat.color.setRGB(0.8 * bright + 0.1, 0.9 * bright + 0.1, bright + 0.1);
    }
  }
}
