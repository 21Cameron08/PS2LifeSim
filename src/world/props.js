import * as THREE from 'three';
import { GeoBuilder, shade, trs } from '../core/geo.js';

// Low-poly street furniture templates, built once and stamped all over the city.
// Local space: origin on the ground, +z faces the street (or the viewer).
// Each template is a plain BufferGeometry with vertex colours, so the whole city's
// props can be merged into a handful of draw calls.

const metal = shade('#55605e');
const darkMetal = shade('#30383a');
const wood = shade('#80583a');
const concrete = shade('#9a958c');

function cyl(rTop, rBot, h, seg = 8) {
  return new THREE.CylinderGeometry(rTop, rBot, h, seg, 1);
}

export function makePropTemplates() {
  const T = {};

  // --- street lamp (arm reaches toward +z, i.e. over the road)
  {
    const b = new GeoBuilder();
    b.cbox(0, 0, 0, 0.36, 0.5, 0.36, metal);
    b.cbox(0, 0.5, 0, 0.16, 5.9, 0.16, metal);
    b.box(-0.06, 6.3, 0, 0.06, 6.44, 1.45, { color: metal, bottom: true });
    b.box(-0.21, 6.18, 1.2, 0.21, 6.44, 2.1, { color: metal, bottom: false });
    T.lamp = b.build();
    const g = new GeoBuilder();
    g.box(-0.16, 6.16, 1.28, 0.16, 6.2, 2.02, { color: shade('#ffb15a'), bottom: true, top: false });
    T.lampGlass = g.build();
    T.lampHead = new THREE.Vector3(0, 6.05, 1.65);
  }

  // --- park lamp: short post with a globe
  {
    const b = new GeoBuilder();
    b.cbox(0, 0, 0, 0.26, 0.4, 0.26, darkMetal);
    b.cbox(0, 0.4, 0, 0.1, 2.9, 0.1, darkMetal);
    b.cbox(0, 3.25, 0, 0.3, 0.06, 0.3, darkMetal);
    T.parkLamp = b.build();
    const g = new GeoBuilder();
    g.addGeometry(new THREE.IcosahedronGeometry(0.26, 0), trs(0, 3.55, 0), shade('#ffe2b0'));
    T.parkLampGlass = g.build();
    T.parkLampHead = new THREE.Vector3(0, 3.55, 0);
  }

  // --- bench (sitter faces +z)
  {
    const b = new GeoBuilder();
    b.cbox(0, 0.42, 0, 1.7, 0.07, 0.48, wood);
    b.box(-0.85, 0.55, -0.26, 0.85, 0.95, -0.2, { color: wood, bottom: true });
    for (const x of [-0.72, 0.72]) {
      b.cbox(x, 0, 0.12, 0.08, 0.42, 0.08, darkMetal);
      b.cbox(x, 0, -0.18, 0.08, 0.95, 0.08, darkMetal);
    }
    T.bench = b.build();
  }

  // --- trash can
  {
    const b = new GeoBuilder();
    b.addGeometry(cyl(0.27, 0.24, 0.9, 8), trs(0, 0.45, 0), shade('#2e4a3a'));
    b.addGeometry(cyl(0.3, 0.3, 0.07, 8), trs(0, 0.93, 0), shade('#1f3328'));
    T.trash = b.build();
  }

  // --- fire hydrant
  {
    const b = new GeoBuilder();
    const red = shade('#a8281e');
    b.addGeometry(cyl(0.12, 0.15, 0.55, 8), trs(0, 0.28, 0), red);
    b.addGeometry(new THREE.IcosahedronGeometry(0.12, 0), trs(0, 0.58, 0), red);
    b.cbox(0, 0.32, 0, 0.42, 0.1, 0.1, red);
    T.hydrant = b.build();
  }

  // --- newspaper box
  T.newsbox = ['#2f5aa0', '#b03030', '#d8b030', '#3a7a4a'].map((c) => {
    const b = new GeoBuilder();
    b.cbox(0, 0.15, 0, 0.5, 0.85, 0.45, shade(c));
    b.box(-0.18, 0.6, 0.226, 0.18, 0.9, 0.23, { color: shade('#d8dce0'), top: false });
    for (const x of [-0.2, 0.2]) b.cbox(x, 0, 0, 0.05, 0.15, 0.4, darkMetal);
    return b.build();
  });

  // --- planter
  {
    const b = new GeoBuilder();
    b.cbox(0, 0, 0, 1.2, 0.55, 1.2, concrete);
    b.cbox(0, 0.55, 0, 1.05, 0.06, 1.05, shade('#3d5a2a'));
    b.addGeometry(new THREE.IcosahedronGeometry(0.45, 0), trs(0, 0.85, 0, 0, 1, 0.7, 1), shade('#4a7a34'));
    T.planter = b.build();
  }

  // --- vending machine (front +z). Colours vary; front panel glows.
  T.vending = ['#c0302a', '#e8e6e0', '#2a5ab0', '#2a8a5a'].map((c) => {
    const b = new GeoBuilder();
    b.cbox(0, 0, 0, 0.95, 1.9, 0.75, shade(c));
    b.box(-0.4, 0.12, 0.375, 0.4, 0.42, 0.39, { color: darkMetal, top: false });
    const g = new GeoBuilder();
    g.box(-0.4, 0.7, 0.376, 0.4, 1.78, 0.385, { color: shade('#fff4dc'), top: false, sides: [true, false, false, false] });
    // bottles behind the glass
    const cols = ['#e04040', '#40a0e0', '#f0c040', '#60c060', '#f08040'];
    for (let r = 0; r < 3; r++)
      for (let k = 0; k < 5; k++)
        g.box(-0.34 + k * 0.15, 0.82 + r * 0.32, 0.386, -0.26 + k * 0.15, 1.0 + r * 0.32, 0.39, {
          color: shade(cols[(k + r) % cols.length]),
          top: false,
          sides: [true, false, false, false],
        });
    return { solid: b.build(), glow: g.build() };
  });

  // --- ATM kiosk (front +z)
  {
    const b = new GeoBuilder();
    b.cbox(0, 0, 0, 0.85, 1.75, 0.6, shade('#5a6068'));
    b.cbox(0, 1.75, 0, 0.95, 0.4, 0.66, shade('#2a3a5a'));
    b.box(-0.3, 0.95, 0.3, 0.3, 1.0, 0.45, { color: shade('#3a3e44'), bottom: true });
    const g = new GeoBuilder();
    g.box(-0.24, 1.15, 0.301, 0.24, 1.5, 0.31, { color: shade('#6fd0ff'), top: false, sides: [true, false, false, false] });
    g.box(-0.45, 1.8, 0.331, 0.45, 2.1, 0.335, { color: shade('#50e080'), top: false, sides: [true, false, false, false] });
    T.atm = { solid: b.build(), glow: g.build() };
  }

  // --- bus shelter (open side +z)
  {
    const b = new GeoBuilder();
    b.cbox(0, 2.45, 0, 3.3, 0.12, 1.5, metal);
    for (const x of [-1.55, 1.55]) {
      b.cbox(x, 0, -0.62, 0.08, 2.45, 0.08, metal);
      b.cbox(x, 0, 0.62, 0.08, 2.45, 0.08, metal);
    }
    b.box(-1.5, 0.3, -0.66, 1.5, 2.3, -0.6, { color: shade('#33424c'), bottom: true });
    b.cbox(0, 0.45, -0.4, 2.2, 0.06, 0.38, wood);
    for (const x of [-0.9, 0.9]) b.cbox(x, 0, -0.4, 0.06, 0.45, 0.3, darkMetal);
    T.busStop = b.build();
    const g = new GeoBuilder();
    g.box(1.53, 0.5, -0.5, 1.58, 2.0, 0.5, { color: shade('#e0ecff'), top: false, sides: [false, false, true, true] });
    T.busStopGlow = g.build();
  }

  // --- trees: trunk + chunky flat-shaded canopy (two variants)
  {
    const b = new GeoBuilder();
    b.addGeometry(cyl(0.14, 0.2, 2.8, 6), trs(0, 1.4, 0), shade('#4a3a30'));
    b.box(-0.6, 0.005, -0.6, 0.6, 0.02, 0.6, { color: shade('#2a2a2a'), sides: [false, false, false, false] });
    T.trunk = b.build();
    T.canopies = [0, 1, 2].map((v) => {
      const l = new GeoBuilder();
      const greens = [
        ['#3f6b2e', '#4f7f36'],
        ['#55772f', '#6a8c3a'],
        ['#2f5a3a', '#3e6e46'],
      ][v];
      l.addGeometry(new THREE.IcosahedronGeometry(1.7, 0), trs(0, 3.7, 0, v), shade(greens[0]));
      l.addGeometry(new THREE.IcosahedronGeometry(1.2, 0), trs(0.7, 4.6, 0.3, v * 2), shade(greens[1]));
      l.addGeometry(new THREE.IcosahedronGeometry(1.0, 0), trs(-0.8, 4.3, -0.4, v * 3), shade(greens[1]));
      return l.build();
    });
  }

  // --- rooftop water tower
  {
    const b = new GeoBuilder();
    const w = shade('#6a5040');
    for (const [x, z] of [
      [-0.9, -0.9],
      [0.9, -0.9],
      [-0.9, 0.9],
      [0.9, 0.9],
    ])
      b.cbox(x, 0, z, 0.15, 2.2, 0.15, darkMetal);
    b.cbox(0, 2.1, 0, 2.4, 0.12, 2.4, darkMetal);
    b.addGeometry(cyl(1.2, 1.2, 2.6, 10), trs(0, 3.5, 0), w);
    b.addGeometry(new THREE.ConeGeometry(1.35, 0.9, 10), trs(0, 5.25, 0), shade('#3a3030'));
    T.waterTower = b.build();
  }

  // --- manhole cover
  {
    const b = new GeoBuilder();
    b.addGeometry(new THREE.CircleGeometry(0.45, 10).rotateX(-Math.PI / 2), trs(0, 0, 0), shade('#25262a'));
    T.manhole = b.build();
  }

  return T;
}
