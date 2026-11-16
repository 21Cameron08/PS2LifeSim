// City layout constants. Everything is in metres-ish world units.
// The city is a grid of N x N blocks separated by roads.
//
//   | road |  sidewalk | lot (buildings) | sidewalk | road |
//
export const CITY = {
  N: 6, // blocks per side
  LOT: 36, // buildable area inside a block
  SIDEWALK: 3.5,
  ROAD: 11,
  CURB: 0.2, // sidewalk height
  FLOOR_H: 3.2,
  GF_H: 4.4, // ground-floor shop height
  SEED: 20061026, // the PS2's EU launch date, for luck
};
CITY.PITCH = CITY.LOT + CITY.SIDEWALK * 2 + CITY.ROAD;
CITY.HALF = (CITY.N * CITY.PITCH) / 2;
// The playable edge: outer road + the far sidewalk ring.
CITY.EDGE = CITY.HALF + CITY.ROAD / 2 + CITY.SIDEWALK;

/** x (or z) of road centre line i, for i = 0..N */
export const roadLine = (i) => i * CITY.PITCH - CITY.HALF;

/** Outer bounds of block (i,j) including its sidewalk ring. */
export function blockBounds(i, j) {
  const h = CITY.ROAD / 2;
  return {
    i,
    j,
    x0: roadLine(i) + h,
    x1: roadLine(i + 1) - h,
    z0: roadLine(j) + h,
    z1: roadLine(j + 1) - h,
    cx: (roadLine(i) + roadLine(i + 1)) / 2,
    cz: (roadLine(j) + roadLine(j + 1)) / 2,
  };
}

// Special blocks. i = west->east, j = north->south.
export const SPECIAL_BLOCKS = {
  '1,2': 'park',
  '4,4': 'lantern',
};
export const blockKind = (i, j) => SPECIAL_BLOCKS[`${i},${j}`] ?? 'city';

// Apartment buildings. Each interior (src/world/interior/layouts.js) is built on
// its real floor inside one of these buildings, so its windows look out at the
// actual street. The building sits in the middle of the block's south side.
export const APARTMENT_SITES = {
  starter: { block: [1, 1], width: 13, depth: 14, floors: 4, style: 'brick', shop: true, signRow: 6, unitFloor: 1 },
  loft: { block: [4, 1], width: 16, depth: 14, floors: 4, style: 'factory', shop: false, unitFloor: 2 },
  penthouse: { block: [3, 2], width: 22, depth: 18, floors: 18, style: 'glass', shop: false, unitFloor: 17 },
};
// Your first job: a 24-hour convenience store on the street next to Unit 3B. Its
// ground floor is a real walk-in interior (src/world/store.js); flats above.
export const STORE_SITE = { block: [2, 1], width: 14, depth: 13, floors: 3, style: 'cream', groundH: 3.1 };

const ALL_SITES = [...Object.entries(APARTMENT_SITES), ['store', STORE_SITE]];
export const siteForBlock = (i, j) => ALL_SITES.find(([, s]) => s.block[0] === i && s.block[1] === j);

export const START = {
  hour: 17.6, // golden hour, so the first night falls a couple of minutes in
  cash: 240,
  bank: 1200,
};

export const GAME_TITLE = 'PORT HALCYON';
