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
// groundH is the shop's ceiling height; floorLift keeps its floor off the pavement
// it is built on (coplanar surfaces z-fight). The flats start exactly where the
// shop's walls end, so the two never overlap.
export const STORE_SITE = { block: [2, 1], width: 14, depth: 13, floors: 3, style: 'cream', groundH: 3.1, floorLift: 0.015 };

// SUBSTATION: a nightclub in an old power substation in Ember Row, across the
// road from the Lantern Quarter (src/world/club.js). It's a single tall hall with
// no flats above, so the club builds its own concrete shell instead of a city facade.
export const CLUB_SITE = { block: [4, 3], width: 24, depth: 18, floorLift: 0.015 };

// GULLY'S: a fast food restaurant (a small made-up harbour chain) in Greenway, just
// south of the park. A low standalone building set back behind a patio (src/world/gullys.js).
export const GULLYS_SITE = { block: [1, 3], width: 20, depth: 17, floorLift: 0.015 };

// The Halcyon Galleria: a two-storey shopping mall Downtown, between Greenway Park and
// the Meridian tower, set back behind a plaza (src/world/galleria.js).
export const GALLERIA_SITE = { block: [2, 2], width: 28, depth: 25, floorLift: 0.015 };

// HALCYON EXCHANGE: a 1920s banking hall Downtown, now a brokerage with a bar and a
// property desk, behind a portico and a bronze gull (src/world/exchange.js).
export const EXCHANGE_SITE = { block: [3, 3], width: 24, depth: 22, floorLift: 0.015 };

// CORSO MOTORS: a glass-fronted car showroom in Kiln Heights, just north of the
// Meridian tower, with a forecourt on the street (src/world/motors.js).
export const MOTORS_SITE = { block: [3, 1], width: 32, depth: 24, floorLift: 0.015 };

const ALL_SITES = [...Object.entries(APARTMENT_SITES), ['store', STORE_SITE], ['club', CLUB_SITE], ['gullys', GULLYS_SITE], ['galleria', GALLERIA_SITE], ['exchange', EXCHANGE_SITE], ['motors', MOTORS_SITE]];
export const siteForBlock = (i, j) => ALL_SITES.find(([, s]) => s.block[0] === i && s.block[1] === j);

export const START = {
  hour: 17.6, // golden hour, so the first night falls a couple of minutes in
  cash: 240,
  bank: 1200,
};

export const GAME_TITLE = 'PORT HALCYON';
