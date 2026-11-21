import * as THREE from 'three';
import { F, C } from '../world/interior/kit.js';
import { addGully } from '../world/gullyFigure.js';
import { trs } from '../core/geo.js';
import { ITEM, WATCH_COL, chainCol } from './fashion.js';

// ROOMSET's catalog: furniture you buy at the Galleria and place at home (see
// world/homeDecor.js). Every piece is built with the same interior kit as the
// apartments, so it gets baked into the room's lighting like the built-in stuff.
//
// Each piece faces +z from its origin. box = its footprint [x0, z0, x1, z1] in that
// frame (what can't overlap other things); h = how tall; kind 'floor' | 'rug' | 'wall'
// (wall pieces hang with their back at z = 0 on whatever wall you're facing).
// decor = how much it adds to your status at home. use = what E does with it.

const cyl = (rt, rb, h, s = 12, open = false) => new THREE.CylinderGeometry(rt, rb, h, s, 1, open);
// placed rugs lie a few mm above the apartments' own rugs (0.012), so they never share a plane
const rug = (P, w, l, key) => P.quad(key, [-w / 2, 0.02, l / 2], [w / 2, 0.02, l / 2], [w / 2, 0.02, -l / 2], [-w / 2, 0.02, -l / 2], [0, 1, 0], [0, 0, 1, 1]);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

export const CATS = [
  ['seating', 'Seating'],
  ['tables', 'Tables'],
  ['lamps', 'Lamps and plants'],
  ['rugs', 'Rugs'],
  ['art', 'Art'],
  ['big', 'Big ticket'],
  ['collect', 'Collections'],
];

const P_ = (id, name, cat, price, decor, kind, b, h, desc, build, extra = {}) => ({ id, name, cat, price, decor, kind, box: b, h, desc, build, ...extra });

export const FURNITURE = [
  // ---------------------------------------------------------------- seating
  P_('beanbag', 'Beanbag', 'seating', 85, 1, 'floor', [-0.45, -0.45, 0.45, 0.45], 0.6, 'Fills with whatever shape you are.', (P) => {
    P.geo('fabric', new THREE.SphereGeometry(0.45, 12, 8), 0, 0.27, 0, C('#c4483a'), 0, 1, 0.62, 1);
    P.geo('fabric', new THREE.SphereGeometry(0.28, 10, 6), 0, 0.5, -0.12, C('#b43a2e'), 0, 1, 0.7, 0.8);
    P.collide(-0.42, -0.42, 0.42, 0.42, 0.55).shadow(-0.42, -0.42, 0.42, 0.42, 0.4);
  }, { use: 'sit', label: 'Flop into the beanbag', seats: [[0, 0.02]], chip: '#c4483a' }),
  P_('armchair', 'Reading armchair', 'seating', 420, 2, 'floor', [-0.48, 0, 0.48, 0.95], 0.9, 'Leather the colour of good coffee.', (P) => F.armchair(P, { col: '#7a4a2a', style: 'old' }), { use: 'sit', seats: [[0, 0.45]], chip: '#7a4a2a' }),
  P_('sofa', 'Leather sofa', 'seating', 1200, 4, 'floor', [-1.0, 0, 1.0, 0.92], 0.9, 'Three seats, a dent where the last owner sat. New, though.', (P) => F.sofa(P, { w: 2.0, col: '#4a2e1e', style: 'old', accent: '#c8a050' }), { use: 'sit', seats: [[-0.5, 0.45], [0.5, 0.45]], chip: '#4a2e1e' }),
  P_('cloud', 'Cloud sofa', 'seating', 6800, 10, 'floor', [-1.3, 0, 1.3, 0.97], 0.8, 'Designer. Low, white, impossible to get up from.', (P) => {
    F.sofa(P, { w: 2.6, col: '#ece6da', style: 'modern', accent: '#ece6da' });
    for (const x of [-0.9, 0.9]) P.geo('fabric', new THREE.SphereGeometry(0.2, 10, 6), x, 0.6, 0.3, C('#c8b89a'), 0, 1, 0.6, 0.5);
  }, { use: 'sit', seats: [[-0.8, 0.5], [0, 0.5], [0.8, 0.5]], chip: '#ece6da' }),
  P_('lounger', 'Leather lounge chair', 'seating', 3400, 7, 'floor', [-0.45, 0, 0.45, 1.5], 1.0, 'With an ottoman. The chair rich people read magazines in.', (P) => {
    const leather = C('#1a1210');
    P.geo('solid', cyl(0.25, 0.28, 0.04, 14), 0, 0.02, 0.4, C('#2a2a2e'));
    P.geo('solid', cyl(0.03, 0.03, 0.3, 6), 0, 0.17, 0.4, C('#8a8c90'));
    P.box('fabric', -0.4, 0.32, 0.15, 0.4, 0.45, 0.75, leather);
    P.geo('fabric', box(0.8, 0.7, 0.12), 0, 0.72, 0.12, leather, 0, 1, 1, 1, -0.35);
    P.box('wood', -0.43, 0.32, 0.05, -0.38, 0.62, 0.75, C('#7a4a2a'));
    P.box('wood', 0.38, 0.32, 0.05, 0.43, 0.62, 0.75, C('#7a4a2a'));
    P.box('fabric', -0.3, 0.2, 1.0, 0.3, 0.38, 1.45, leather);
    P.geo('solid', cyl(0.03, 0.03, 0.2, 6), 0, 0.1, 1.22, C('#8a8c90'));
    P.collide(-0.43, 0.05, 0.43, 0.75, 0.9).collide(-0.3, 1.0, 0.3, 1.45, 0.38).shadow(-0.43, 0.05, 0.43, 1.45, 0.35);
  }, { use: 'sit', label: 'Sink into the lounge chair', seats: [[0, 0.45]], chip: '#1a1210' }),
  // ---------------------------------------------------------------- tables
  P_('sideTable', 'Side table', 'tables', 90, 1, 'floor', [-0.25, -0.25, 0.25, 0.25], 0.55, 'Round, oak, holds exactly one drink and one remote.', (P) => {
    P.geo('wood', cyl(0.25, 0.25, 0.03, 16), 0, 0.53, 0, C('#a8784a'));
    P.geo('wood', cyl(0.03, 0.04, 0.52, 8), 0, 0.26, 0, C('#8a6a4a'));
    P.geo('wood', cyl(0.18, 0.2, 0.02, 12), 0, 0.01, 0, C('#8a6a4a'));
    P.collide(-0.25, -0.25, 0.25, 0.25, 0.55);
  }, { chip: '#a8784a' }),
  P_('coffeeGlass', 'Glass coffee table', 'tables', 450, 2, 'floor', [-0.6, -0.32, 0.6, 0.32], 0.42, 'Glass top, chrome legs, a magazine you will never read.', (P) => F.coffeeTable(P, { w: 1.2, d: 0.64, glass: true }), { chip: '#a8c8e0' }),
  P_('tradeDesk', 'Trading desk', 'tables', 2800, 4, 'floor', [-0.85, 0, 0.85, 1.3], 1.3, 'Walnut, three screens, a ticker running all day. Trade from home.', (P) => {
    const walnut = C('#4a2e1e');
    P.box('wood', -0.85, 0.72, 0, 0.85, 0.76, 0.75, walnut, { bottom: true });
    for (const x of [-0.82, 0.78]) P.box('wood', x, 0, 0.05, x + 0.04, 0.72, 0.7, walnut);
    P.box('wood', -0.78, 0.4, 0.04, 0.78, 0.72, 0.08, walnut);
    for (const [x, ry] of [
      [-0.5, 0.35],
      [0, 0],
      [0.5, -0.35],
    ]) {
      const S = P.sub(x, 0.18, ry, 0.76);
      S.box('solid', -0.24, 0.12, -0.02, 0.24, 0.44, 0.02, C('#141418'));
      S.box('glow', -0.22, 0.14, 0.02, 0.22, 0.42, 0.026, C('#0a3a1e'));
      for (let k = 0; k < 4; k++) S.box('glow', -0.19, 0.36 - k * 0.06, 0.026, -0.19 + 0.12 + ((k * 37) % 23) * 0.012, 0.375 - k * 0.06, 0.031, C(k % 2 ? '#ff6a5a' : '#5aff8a'));
      S.box('solid', -0.02, 0, -0.06, 0.02, 0.12, -0.02, C('#2a2a2e'));
      S.box('solid', -0.1, 0, -0.1, 0.1, 0.012, 0.04, C('#2a2a2e'));
    }
    P.box('solid', -0.25, 0.76, 0.42, 0.25, 0.78, 0.58, C('#2a2a2e'));
    // an office chair
    P.geo('solid', cyl(0.25, 0.25, 0.03, 10), 0, 0.03, 1.0, C('#2a2a2e'));
    P.geo('solid', cyl(0.025, 0.025, 0.4, 6), 0, 0.24, 1.0, C('#8a8c90'));
    P.box('fabric', -0.26, 0.44, 0.76, 0.26, 0.52, 1.24, C('#1a1a1e'));
    P.box('fabric', -0.24, 0.52, 1.2, 0.24, 1.05, 1.27, C('#1a1a1e'));
    P.light(0, 1.1, 0.4, '#5aff8a', 0.12);
    P.collide(-0.85, 0, 0.85, 0.75, 1.3).collide(-0.27, 0.76, 0.27, 1.27, 1.05).shadow(-0.85, 0, 0.85, 1.27, 0.4);
  }, { use: 'trade', label: 'Check the markets', reach: 1.6, chip: '#0a3a1e' }),
  P_('dining', 'Marble dining table', 'tables', 3200, 6, 'floor', [-1.0, -1.05, 1.0, 1.05], 0.92, 'Four chairs, one slab of marble that weighs more than you.', (P) => F.diningTable(P, { w: 1.7, d: 0.9, col: '#e8e4dc', topKey: 'marble', chairCol: '#2a2a2e', chairs: 4 }), { chip: '#e8e4dc' }),
  // ---------------------------------------------------------------- lamps and plants
  P_('floorLamp', 'Floor lamp', 'lamps', 160, 1, 'floor', [-0.2, -0.2, 0.2, 0.2], 1.7, 'Warm shade, brass stem.', (P) => {
    P.geo('solid', cyl(0.16, 0.16, 0.03, 12), 0, 0.015, 0, C('#2a2a2a'));
    P.box('solid', -0.015, 0.03, -0.015, 0.015, 1.5, 0.015, C('#a8844a'));
    P.geo('glow', cyl(0.16, 0.22, 0.28, 12, true), 0, 1.55, 0, C('#f2e2c0', 0.85));
    P.collide(-0.18, -0.18, 0.18, 0.18, 1.7);
    P.light(0, 1.5, 0, '#ffd8a8', 0.55);
  }, { chip: '#f2e2c0' }),
  P_('arcLamp', 'Arc lamp', 'lamps', 1400, 4, 'floor', [-0.22, -0.22, 0.22, 0.22], 1.2, 'A marble base and a steel arc that reaches over the sofa.', (P) => {
    P.box('marble', -0.2, 0, -0.2, 0.2, 0.3, 0.2, C('#ece6da'));
    const pts = 8;
    for (let k = 0; k < pts; k++) {
      const a0 = (k / pts) * Math.PI * 0.62;
      const a1 = ((k + 1) / pts) * Math.PI * 0.62;
      const p0 = [0, 0.3 + Math.sin(a0) * 1.75, (1 - Math.cos(a0)) * 1.0];
      const p1 = [0, 0.3 + Math.sin(a1) * 1.75, (1 - Math.cos(a1)) * 1.0];
      const len = Math.hypot(p1[1] - p0[1], p1[2] - p0[2]);
      P.geo('solid', box(0.03, 0.03, len + 0.02), 0, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2, C('#c8ccd0'), 0, 1, 1, 1, -Math.atan2(p1[1] - p0[1], p1[2] - p0[2]));
    }
    P.geo('solid', new THREE.SphereGeometry(0.24, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0, 1.82, 1.55, C('#c8ccd0'));
    P.geo('glow', new THREE.CircleGeometry(0.2, 12).rotateX(Math.PI / 2), 0, 1.815, 1.55, C('#fff2d8'));
    P.collide(-0.2, -0.2, 0.2, 0.2, 0.3);
    P.light(0, 1.7, 1.55, '#fff2d8', 0.6, true);
  }, { chip: '#c8ccd0' }),
  P_('plant', 'Potted plant', 'lamps', 45, 1, 'floor', [-0.22, -0.22, 0.22, 0.22], 1.6, 'Green. Alive. Low maintenance, high reward.', (P) => F.plant(P, { kind: 'tall' }), { chip: '#4a8a4a' }),
  P_('fig', 'Fiddle-leaf fig', 'lamps', 180, 2, 'floor', [-0.3, -0.3, 0.3, 0.3], 1.4, 'Every design magazine has one. Now so do you.', (P) => F.plant(P, { kind: 'big', pot: '#ece6da' }), { chip: '#3a7a3a' }),
  P_('olive', 'Olive tree in a stone pot', 'lamps', 2600, 5, 'floor', [-0.42, -0.42, 0.42, 0.42], 2.2, 'Forty years old. Shipped from somewhere sunnier.', (P) => {
    P.geo('solid', cyl(0.4, 0.32, 0.55, 12), 0, 0.275, 0, C('#b8b0a0'));
    P.geo('solid', cyl(0.36, 0.36, 0.02, 12), 0, 0.55, 0, C('#4a3a2a'));
    P.geo('wood', cyl(0.05, 0.08, 1.1, 7), 0.04, 1.05, 0, C('#6a5a48'), 0, 1, 1, 1, 0.1);
    for (const [x, y, z, r] of [
      [0.2, 1.75, 0.1, 0.42],
      [-0.25, 1.6, -0.05, 0.36],
      [0.05, 2.0, -0.15, 0.38],
      [-0.1, 1.85, 0.25, 0.3],
    ])
      P.geo('solid', new THREE.IcosahedronGeometry(r, 0), x, y, z, C('#7a8a5a'), x * 3, 1, 0.7, 1);
    P.collide(-0.4, -0.4, 0.4, 0.4, 2.1).shadow(-0.4, -0.4, 0.4, 0.4, 0.4);
  }, { chip: '#7a8a5a' }),
  P_('neon', 'Neon sign', 'lamps', 650, 3, 'wall', [-0.6, 0, 0.6, 0.1], 0, 'A pink palm tree on black acrylic. Hums faintly.', (P) => {
    P.box('solid', -0.6, 1.2, 0, 0.6, 2.0, 0.03, C('#141418'));
    const g = (x0, y0, x1, y1, col) => P.box('glow', x0, y0, 0.036, x1, y1, 0.05, C(col));
    g(-0.02, 1.3, 0.02, 1.75, '#ff6ac8');
    for (const [a, l] of [
      [-0.9, 0.32],
      [-0.4, 0.36],
      [0.4, 0.36],
      [0.9, 0.32],
    ])
      P.geo('glow', box(l, 0.035, 0.014), Math.sin(a) * l * 0.5, 1.8 - Math.abs(a) * 0.12, 0.043, C('#5ae8a0'), 0, 1, 1, 1, 0, -a * 0.6);
    g(-0.45, 1.28, 0.45, 1.31, '#5ae8ff');
    P.light(0, 1.6, 0.35, '#ff7ad0', 0.22);
  }, { chip: '#ff6ac8' }),
  // ---------------------------------------------------------------- rugs
  P_('rugStripe', 'Striped rug', 'rugs', 120, 1, 'rug', [-1.0, -0.7, 1.0, 0.7], 0.02, 'Cotton, washable, cheerful.', (P) => rug(P, 2.0, 1.4, 'rugStripe'), { chip: '#3a6a9a' }),
  P_('rugModern', 'Modern rug', 'rugs', 480, 2, 'rug', [-1.2, -0.85, 1.2, 0.85], 0.02, 'Abstract shapes in wool. Very gallery.', (P) => rug(P, 2.4, 1.7, 'rugModern'), { chip: '#c8b89a' }),
  P_('rugPersian', 'Persian rug', 'rugs', 4500, 6, 'rug', [-1.5, -1.0, 1.5, 1.0], 0.02, 'Hand-knotted. Older than the building.', (P) => rug(P, 3.0, 2.0, 'rugPersian'), { chip: '#8a2a2a' }),
  // ---------------------------------------------------------------- art
  P_('print', 'Framed print', 'art', 120, 1, 'wall', [-0.36, 0, 0.36, 0.05], 0, 'A limited run of two hundred. Yours is number 147.', (P, c) => F.art(P, { idx: c.variant % 8, w: 0.6, h: 0.6, y: 1.55 }), { chip: '#d8a85a' }),
  P_('poster', 'Gig poster', 'art', 40, 1, 'wall', [-0.25, 0, 0.25, 0.02], 0, 'From a night at SUBSTATION nobody remembers properly.', (P, c) => F.poster(P, { idx: 4 + (c.variant % 4), w: 0.45, h: 0.6, y: 1.5 }), { chip: '#e8503a' }),
  P_('oil', 'Original oil painting', 'art', 18000, 12, 'wall', [-0.8, 0, 0.8, 0.06], 0, 'Harbour at night, by a painter who only sells one a year.', (P) => F.art(P, { idx: 6, w: 1.4, h: 1.0, y: 1.55, frame: '#a8844a' }), { chip: '#2a3a5a' }),
  P_('sculpture', 'Gold sculpture', 'art', 9500, 9, 'floor', [-0.32, -0.32, 0.32, 0.32], 1.7, 'A gold ring on a black plinth. It means something.', (P) => {
    P.box('solid', -0.3, 0, -0.3, 0.3, 0.9, 0.3, C('#141418'));
    P.geo('solid', new THREE.TorusGeometry(0.32, 0.06, 8, 22), 0, 1.28, 0, C('#e8c060'), 0.4);
    P.collide(-0.3, -0.3, 0.3, 0.3, 1.6).shadow(-0.3, -0.3, 0.3, 0.3, 0.4);
  }, { chip: '#e8c060' }),
  // ---------------------------------------------------------------- big ticket
  P_('aquarium', 'Aquarium', 'big', 7500, 10, 'floor', [-0.8, 0, 0.8, 0.55], 1.75, 'Two metres of reef, twelve fish, one very expensive pump.', (P, c) => {
    P.box('wood', -0.8, 0, 0, 0.8, 0.75, 0.55, C('#1a1a1e'));
    P.box('glass', -0.78, 0.75, 0.02, 0.78, 1.65, 0.53, C('#ffffff'));
    P.box('glow', -0.76, 0.76, 0.04, 0.76, 1.55, 0.06, C('#1a5a7a', 0.65));
    P.box('solid', -0.76, 0.76, 0.06, 0.76, 0.84, 0.51, C('#d8c8a0'));
    for (const [x, z, h, col] of [
      [-0.5, 0.2, 0.35, '#3a8a4a'],
      [-0.2, 0.3, 0.25, '#e86a8a'],
      [0.3, 0.18, 0.4, '#4aa85a'],
      [0.55, 0.35, 0.22, '#e8a03a'],
    ])
      P.geo('solid', box(0.05, h, 0.05), x, 0.84 + h / 2, z, C(col), x * 4);
    P.box('solid', -0.8, 1.65, 0, 0.8, 1.75, 0.55, C('#1a1a1e'));
    P.collide(-0.8, 0, 0.8, 0.55, 1.75).shadow(-0.8, 0, 0.8, 0.55, 0.45);
    c.dyn.push({ type: 'fish', m: P.m.clone(), x0: -0.68, x1: 0.68, y0: 0.95, y1: 1.5, z0: 0.12, z1: 0.45 });
    P.light(0, 1.2, 0.75, '#5ab8e8', 0.22);
  }, { use: 'fish', label: 'Watch the fish', chip: '#2a8ab8' }),
  P_('homeBar', 'Home bar', 'big', 5200, 8, 'floor', [-1.1, 0, 1.1, 1.45], 2.0, 'Backlit shelves, a walnut counter, two stools. Bartender not included.', (P) => {
    P.box('wood', -1.1, 0, 0, 1.1, 2.0, 0.32, C('#2a1e16'));
    for (let r = 0; r < 3; r++) {
      P.box('glow', -1.0, 0.95 + r * 0.32, 0.321, 1.0, 1.2 + r * 0.32, 0.326, C('#8a5a30'));
      for (let k = 0; k < 9; k++) P.geo('solid', cyl(0.035, 0.035, 0.2, 6), -0.85 + k * 0.21, 1.05 + r * 0.32, 0.37, C(['#3a6a3a', '#a8844a', '#e8e4dc', '#6a2a2a'][(k + r) % 4]));
      P.box('wood', -1.05, 0.93 + r * 0.32, 0.32, 1.05, 0.95 + r * 0.32, 0.45, C('#3a2a1e'));
    }
    P.box('wood', -1.0, 0, 0.85, 1.0, 1.0, 1.2, C('#4a2e1e'));
    P.box('wood', -1.05, 1.0, 0.8, 1.05, 1.05, 1.28, C('#7a4a2a'), { bottom: true });
    for (const x of [-0.45, 0.45]) {
      P.geo('fabric', cyl(0.18, 0.18, 0.06, 12), x, 0.72, 1.55, C('#1a1a1e'));
      P.geo('solid', cyl(0.025, 0.025, 0.7, 6), x, 0.35, 1.55, C('#8a8c90'));
    }
    P.collide(-1.1, 0, 1.1, 0.45, 2.0).collide(-1.05, 0.8, 1.05, 1.28, 1.05).shadow(-1.1, 0, 1.1, 1.28, 0.45);
    P.light(0, 1.4, 0.7, '#ffb060', 0.3);
  }, { use: 'bar', label: 'Mix a drink', reach: 1.75, chip: '#7a4a2a' }),
  P_('arcade', 'Arcade cabinet', 'big', 2400, 5, 'floor', [-0.38, 0, 0.38, 0.8], 1.85, 'NIGHT RUNNER, 1999. Real coin slot. Free play.', (P) => {
    const body = C('#2a1a4a');
    P.box('solid', -0.36, 0, 0, 0.36, 1.0, 0.6, body); // lower cabinet
    P.box('solid', -0.34, 1.0, 0, 0.34, 1.62, 0.42, body); // the screen sits back in a hood
    for (const x of [-0.36, 0.34]) P.box('solid', x, 1.0, 0, x + 0.02, 1.62, 0.6, C('#ff6ac8', 0.55)); // side wings
    P.box('solid', -0.36, 1.62, 0, 0.36, 1.85, 0.6, body, { bottom: true }); // marquee header
    P.box('glow', -0.3, 1.66, 0.6, 0.3, 1.8, 0.606, C('#ff6ac8', 0.8));
    P.box('glow', -0.27, 1.08, 0.42, 0.27, 1.52, 0.426, C('#14204a'));
    P.box('glow', -0.27, 1.12, 0.426, 0.27, 1.13, 0.431, C('#5a4a8a')); // rooftops on the screen
    P.box('glow', -0.12, 1.13, 0.426, -0.1, 1.17, 0.431, C('#5ae8ff')); // the runner
    for (const x of [0.02, 0.08, 0.14]) P.box('glow', x, 1.2, 0.426, x + 0.015, 1.215, 0.431, C('#ffd23a')); // coins
    P.box('solid', -0.36, 0.95, 0.6, 0.36, 1.05, 0.8, C('#1a1a1e'), { bottom: true }); // control panel
    for (const [x, col] of [
      [-0.15, '#e83a3a'],
      [0.05, '#3ae86a'],
      [0.15, '#f0c030'],
    ])
      P.geo('solid', cyl(0.025, 0.025, 0.03, 8), x, 1.065, 0.7, C(col));
    P.box('glow', -0.05, 0.55, 0.6, 0.05, 0.62, 0.606, C('#e83a3a', 0.7)); // coin slot
    P.collide(-0.36, 0, 0.36, 0.8, 1.85).shadow(-0.36, 0, 0.36, 0.8, 0.45);
    P.light(0, 1.4, 0.7, '#5ae8ff', 0.12);
  }, { use: 'arcade', label: 'Play NIGHT RUNNER', chip: '#2a1a4a' }),
  P_('jukebox', 'Jukebox', 'big', 3800, 6, 'floor', [-0.45, 0, 0.45, 0.6], 1.6, 'Bubbling tubes, chrome, sixty records you will play two of.', (P) => {
    P.box('wood', -0.45, 0, 0, 0.45, 1.2, 0.55, C('#7a2a1a'));
    P.geo('wood', cyl(0.45, 0.45, 0.53, 16, false), 0, 1.2, 0.275, C('#7a2a1a'), 0, 1, 1, 1, Math.PI / 2); // caps 1 cm inside the body's faces
    for (const [x, col] of [
      [-0.4, '#ff8a3a'],
      [0.4, '#5ae8ff'],
    ])
      P.box('glow', x - 0.03, 0.2, 0.551, x + 0.03, 1.25, 0.56, C(col, 0.8));
    P.box('glow', -0.3, 0.75, 0.551, 0.3, 1.1, 0.556, C('#a89060'));
    P.box('solid', -0.25, 0.25, 0.551, 0.25, 0.55, 0.556, C('#c8ccd0'));
    P.collide(-0.45, 0, 0.45, 0.6, 1.6).shadow(-0.45, 0, 0.45, 0.6, 0.45);
    P.light(0, 0.9, 0.7, '#ffb070', 0.2);
  }, { use: 'jukebox', label: 'Pick a record', chip: '#7a2a1a' }),
  P_('hotTub', 'Hot tub', 'big', 22000, 15, 'floor', [-1.15, -1.15, 1.15, 1.15], 0.95, 'Six jets, mood lighting, seats four. Needs a big room.', (P) => {
    const wood = C('#6a4a32');
    const cap = C('#e8e4dc');
    P.box('wood', -1.15, 0, -1.15, 1.15, 0.7, 1.15, wood); // the shell below the water
    // the walls above the water line, then a pale cap round the rim (a ring, so the water shows)
    for (const [x0, z0, x1, z1] of [
      [-1.15, -1.15, 1.15, -0.95],
      [-1.15, 0.95, 1.15, 1.15],
      [-1.15, -0.95, -0.95, 0.95],
      [0.95, -0.95, 1.15, 0.95],
    ])
      P.box('wood', x0, 0.7, z0, x1, 0.85, z1, wood);
    for (const [x0, z0, x1, z1] of [
      [-1.18, -1.18, 1.18, -0.93],
      [-1.18, 0.93, 1.18, 1.18],
      [-1.18, -0.93, -0.93, 0.93],
      [0.93, -0.93, 1.18, 0.93],
    ])
      P.box('solid', x0, 0.85, z0, x1, 0.92, z1, cap, { bottom: true });
    P.quad('glow', [-0.95, 0.765, 0.95], [0.95, 0.765, 0.95], [0.95, 0.765, -0.95], [-0.95, 0.765, -0.95], [0, 1, 0], [0, 0, 1, 1], C('#1a7a9a'));
    // the jets: little lights 6 mm proud of the inside walls
    const jet = C('#bfe8ff', 0.6);
    for (const x of [-0.6, 0.6]) P.box('glow', x - 0.04, 0.79, -0.95, x + 0.04, 0.83, -0.944, jet).box('glow', x - 0.04, 0.79, 0.944, x + 0.04, 0.83, 0.95, jet);
    P.box('glow', -0.95, 0.79, -0.04, -0.944, 0.83, 0.04, jet).box('glow', 0.944, 0.79, -0.04, 0.95, 0.83, 0.04, jet);
    P.box('wood', -0.5, 0, 1.15, 0.5, 0.32, 1.45, C('#6a4a32'));
    P.collide(-1.18, -1.18, 1.18, 1.18, 0.95).shadow(-1.15, -1.15, 1.15, 1.45, 0.5);
    P.light(0, 1.0, 0, '#3ac8e8', 0.3);
  }, { use: 'tub', label: 'Get in the hot tub', reach: 1.75, chip: '#3ac8e8' }),
  // ---------------------------------------------------------------- collections (they fill themselves from what you own)
  P_('sneakerWall', 'Sneaker wall', 'collect', 900, 3, 'floor', [-0.9, 0, 0.9, 0.42], 2.05, 'Sixteen lit cubbies. Every pair you own goes up on it.', (P, c) => {
    const frame = C('#1c1c20');
    P.box('wood', -0.9, 0, 0, 0.9, 2.05, 0.2, frame); // the back
    // four rows of shelves, five dividers: sixteen open cubbies with a lit back
    for (let r = 0; r <= 4; r++) P.box('wood', -0.9, 0.08 + r * 0.48, 0.2, 0.9, 0.12 + r * 0.48, 0.62, frame, { bottom: r > 0 });
    for (let k = 0; k <= 4; k++) {
      const x = -0.9 + k * 0.45;
      const [x0, x1] = k === 0 ? [-0.9, -0.88] : k === 4 ? [0.88, 0.9] : [x - 0.01, x + 0.01];
      for (let r = 0; r < 4; r++) P.box('wood', x0, 0.12 + r * 0.48, 0.2, x1, 0.56 + r * 0.48, 0.62, frame, { bottom: false });
    }
    const shoes = c.shoes;
    for (let r = 0; r < 4; r++)
      for (let k = 0; k < 4; k++) {
        const x = -0.88 + k * 0.45;
        const y = 0.12 + r * 0.48;
        P.box('glow', x + 0.01, y + 0.01, 0.2, x + 0.42, y + 0.43, 0.206, C('#6a5e50'));
        const it = shoes[(3 - r) * 4 + k]; // the best pairs go up top
        if (!it) continue;
        P.box('solid', x + 0.08, y + 0.03, 0.3, x + 0.34, y + 0.14, 0.56, C(it.look.shoes ?? '#e8e4dc'));
        P.box('solid', x + 0.075, y, 0.295, x + 0.345, y + 0.03, 0.565, C(it.look.sole ?? '#e8e4dc'), { bottom: false });
      }
    P.collide(-0.9, 0, 0.9, 0.62, 2.05).shadow(-0.9, 0, 0.9, 0.62, 0.4);
    P.light(0, 1.2, 0.8, '#fff4e0', 0.18);
  }, { use: 'sneakers', label: 'Look at your sneakers', chip: '#1c1c20' }),
  P_('watchCase', 'Watch case', 'collect', 1800, 4, 'floor', [-0.55, 0, 0.55, 0.55], 1.0, 'Walnut and glass. Your watches and chains, lit like museum pieces.', (P, c) => {
    P.box('wood', -0.55, 0, 0, 0.55, 0.85, 0.55, C('#4a2e1e'));
    P.box('glass', -0.53, 0.85, 0.02, 0.53, 1.0, 0.53, C('#ffffff'));
    P.box('glow', -0.5, 0.85, 0.05, 0.5, 0.855, 0.5, C('#8a8070'));
    c.jewels.forEach((it, k) => {
      const x = -0.4 + (k % 4) * 0.27;
      const z = 0.17 + Math.floor(k / 4) * 0.2;
      if (it.slot === 'watch') P.geo('solid', cyl(0.05, 0.05, 0.02, 12), x, 0.87, z, C(WATCH_COL[it.look.watch]));
      else P.geo('solid', new THREE.TorusGeometry(0.06, 0.012, 4, 14), x, 0.865, z, C(chainCol(it.look.chain)), 0, 1, 1, 1, Math.PI / 2);
    });
    P.collide(-0.55, 0, 0.55, 0.55, 1.0).shadow(-0.55, 0, 0.55, 0.55, 0.4);
    P.light(0, 1.2, 0.5, '#fff0d0', 0.1);
  }, { use: 'watches', label: 'Look at your watches', chip: '#4a2e1e' }),
  P_('trophyShelf', 'Trophy shelf', 'collect', 250, 2, 'floor', [-0.6, 0, 0.6, 0.32], 1.45, 'Three glass shelves. Your Gull Box toys move here from the fridge.', (P, c) => {
    P.box('wood', -0.6, 0, 0, -0.57, 1.45, 0.3, C('#e8e4dc'));
    P.box('wood', 0.57, 0, 0, 0.6, 1.45, 0.3, C('#e8e4dc'));
    P.box('wood', -0.6, 0, 0, 0.6, 0.06, 0.3, C('#e8e4dc'));
    for (const y of [0.5, 0.95, 1.42]) P.box('solid', -0.57, y, 0.0, 0.57, y + 0.02, 0.3, C('#c8e0e8'), { bottom: true });
    c.toys.forEach((t, k) => {
      const m = P.m.clone().multiply(trs(-0.4 + (k % 3) * 0.4, 0.52 + Math.floor(k / 3) * 0.45, 0.15)).multiply(new THREE.Matrix4().makeScale(0.16, 0.16, 0.16));
      addGully(P.k.target('solid'), m, t);
    });
    P.collide(-0.6, 0, 0.6, 0.32, 1.45);
  }, { use: 'toys', label: 'Look at your Gull Box toys', chip: '#c8e0e8' }),
  P_('photoWall', 'Photo wall', 'collect', 150, 1, 'wall', [-0.6, 0, 0.6, 0.04], 0, 'Four frames. Your photo-booth strips, newest first.', (P, c) => {
    for (let k = 0; k < 4; k++) {
      const x = -0.45 + k * 0.3;
      P.box('solid', x - 0.12, 1.17, 0, x + 0.12, 1.83, 0.025, C('#141418'));
      P.panel('solid', x - 0.1, 1.21, x + 0.1, 1.79, 0.031, [0, 0, 1, 1], C('#f2f0ea'));
      c.dyn.push({ type: 'photo', idx: k, m: P.m.clone().multiply(trs(x, 1.5, 0.037)), w: 0.17, h: 0.52 });
    }
  }, { use: 'photos', label: 'Look at your photos', chip: '#141418' }),
];

export const FURN = Object.fromEntries(FURNITURE.map((f) => [f.id, f]));

const FISH_COLS = ['#f0a030', '#e84a3a', '#5ac8f0', '#f0e060', '#c86af0', '#f2f0ea'];
let fishGeo = null;

/** Ten little fish swimming laps in an aquarium (two instanced draws). d: the tank's bounds and matrix, from the aquarium's build. */
export class FishTank {
  constructor(group, d, n = 10) {
    fishGeo ??= {
      body: new THREE.ConeGeometry(0.025, 0.09, 5).rotateZ(-Math.PI / 2),
      tail: new THREE.ConeGeometry(0.02, 0.035, 3).rotateZ(Math.PI / 2).translate(-0.055, 0, 0),
    };
    this.d = d;
    this.mat = new THREE.MeshBasicMaterial({ fog: false });
    this.body = new THREE.InstancedMesh(fishGeo.body, this.mat, n);
    this.tail = new THREE.InstancedMesh(fishGeo.tail, this.mat, n);
    for (const m of [this.body, this.tail]) {
      m.frustumCulled = false;
      group.add(m);
    }
    const col = new THREE.Color();
    this.fish = [];
    for (let k = 0; k < n; k++) {
      col.set(FISH_COLS[k % FISH_COLS.length]);
      this.body.setColorAt(k, col);
      this.tail.setColorAt(k, col);
      const sc = 0.8 + (k % 3) * 0.25;
      this.fish.push({ ph: k * 1.7, sp: 0.25 + (k % 4) * 0.08, scale: new THREE.Matrix4().makeScale(sc, sc, sc) });
    }
    this.m = new THREE.Matrix4();
    this.w = new THREE.Matrix4();
    this.t = new THREE.Matrix4();
  }

  update(time) {
    const d = this.d;
    const { m, w, t } = this;
    this.fish.forEach((f, k) => {
      const u = time * f.sp + f.ph;
      const x = (d.x0 + d.x1) / 2 + Math.sin(u) * (d.x1 - d.x0) * 0.46;
      const y = d.y0 + (d.y1 - d.y0) * (0.5 + 0.4 * Math.sin(u * 0.37 + f.ph * 2));
      const z = (d.z0 + d.z1) / 2 + Math.sin(u * 0.61 + f.ph) * (d.z1 - d.z0) * 0.4;
      m.makeRotationY(Math.cos(u) >= 0 ? 0 : Math.PI).setPosition(x, y, z);
      w.copy(d.m).multiply(m).multiply(f.scale);
      this.body.setMatrixAt(k, w);
      this.tail.setMatrixAt(k, w.multiply(t.makeRotationY(Math.sin(time * 9 + f.ph) * 0.4)));
    });
    this.body.instanceMatrix.needsUpdate = true;
    this.tail.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    for (const m of [this.body, this.tail]) {
      m.removeFromParent();
      m.dispose();
    }
    this.mat.dispose();
  }
}

/** What a collection piece shows: everything you own of its kind. */
export function collectionsFor(state, toyDefs) {
  const owned = (state.owned ?? []).map((id) => ITEM[id]).filter(Boolean);
  return {
    shoes: owned.filter((it) => it.slot === 'shoes').sort((a, b) => b.price - a.price),
    jewels: owned.filter((it) => it.slot === 'watch' || it.slot === 'chain').sort((a, b) => b.price - a.price),
    toys: toyDefs.filter((t) => (state.gullToys ?? []).includes(t.id)),
  };
}
