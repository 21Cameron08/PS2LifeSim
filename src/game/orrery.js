import * as THREE from 'three';

// ORRERY: seven courses at a window table on top of the Meridian tower. You book a
// table (Anouk at the host stand, or later the phone), turn up dressed for it, and
// Theo brings the courses one at a time: eat each one when you're ready (the clock
// moves on a quarter of an hour a course). The wine pairing pours a glass with
// each. The bill comes at the end, on your card.

export const ORRERY_PRICE = 420;
export const PAIRING_PRICE = 260;
export const DRESS_TIER = 4; // Sharp or better (game/fashion.js TIERS)
export const SLOTS = [19, 20, 21]; // booking times (7, 8, 9 PM)

export const ORRERY_MENU = [
  { name: 'Oyster', desc: 'One Harbour Rock oyster, finger lime, a drop of sea water from right below you.', wine: 'Brut, Maison Lune NV', col: '#d8dcd0', hunger: 4 },
  { name: 'Tomato tea', desc: 'Clear as glass, tastes like August. Basil oil floating on top like a map.', wine: 'Riesling, Kiln Valley', col: '#e8b8a0', hunger: 4 },
  { name: 'Scallop', desc: 'Seared on one side only. Brown butter, hazelnut, something green and very small.', wine: 'Chardonnay, Halcyon Ridge', col: '#f2e0c0', hunger: 9 },
  { name: 'Tagliolini', desc: 'Cut by hand this afternoon. Black truffle shaved at the table until you say stop. You do not say stop.', wine: 'Nebbiolo, Vigna Corsa', col: '#e8d090', hunger: 14 },
  { name: 'Short rib', desc: 'Glazed for nine hours, smoked onion, a sauce reduced until it could stand up on its own.', wine: 'Syrah, Ember Hill', col: '#5a2a1a', hunger: 18 },
  { name: 'A serious cheese', desc: 'Comes with its own biography, read aloud by Theo. Honeycomb. Walnut bread.', wine: 'Tawny, twenty years', col: '#f0d890', hunger: 8 },
  { name: 'The Orrery', desc: 'A dark chocolate planet. Theo pours hot caramel over it and it opens like a flower. People at the next table clap.', wine: 'Château Gull, late harvest', col: '#3a2418', hunger: 8 },
];

/** A plate (and maybe a glass) on a table, for the current course. */
export class TablePlate {
  constructor(scene) {
    this.group = new THREE.Group();
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.02, 18), new THREE.MeshLambertMaterial({ color: '#f6f4ee' }));
    this.foodMat = new THREE.MeshLambertMaterial({ color: '#e8d090' });
    this.food = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 1), this.foodMat);
    this.food.position.y = 0.04;
    this.food.scale.set(1, 0.55, 1);
    this.glass = new THREE.Group();
    const gm = new THREE.MeshPhongMaterial({ color: '#e8f0f4', transparent: true, opacity: 0.45, shininess: 90 });
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.022, 0.07, 10, 1, true), gm);
    bowl.position.y = 0.16;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.1, 5), gm);
    stem.position.y = 0.07;
    this.wineMat = new THREE.MeshLambertMaterial({ color: '#7a1a2a' });
    const wine = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.022, 0.035, 10), this.wineMat);
    wine.position.y = 0.145;
    this.glass.add(bowl, stem, wine);
    this.glass.position.set(0.18, 0, -0.1);
    this.group.add(plate, this.food, this.glass);
    this.group.visible = false;
    scene.add(this.group);
  }

  /** Put course k in front of seat (at the table's centre-ish); wine: show a glass. */
  set(at, seat, course, wine) {
    if (!course) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    // halfway between the table's centre and the diner
    this.group.position.set((at.x * 2 + seat.x) / 3, at.y + 0.01, (at.z * 2 + seat.z) / 3);
    this.group.rotation.y = seat.yaw;
    this.foodMat.color.set(course.col);
    this.glass.visible = !!wine;
    this.wineMat.color.set(/Brut|Riesling|Chardonnay|late/.test(course.wine) ? '#e8d890' : course.wine.startsWith('Tawny') ? '#a8582a' : '#6a1a2a');
  }
}
