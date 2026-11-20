// SUBSTATION's week. Every night has a theme with its own sound, colours, door
// policy and crowd. The music side (tempo, arrangement) is in audio/clubTrack.js;
// this is everything else. The posters in the lobby advertise the four big ones.

const pal = (...pairs) => pairs;

export const NIGHTS = {
  house: {
    id: 'house',
    name: 'HOUSE NIGHT',
    blurb: 'midweek house · easy door',
    cover: 15,
    sleeves: false, // T-shirts are fine
    shorts: false,
    strobe: true,
    palettes: pal(['#ff2a6a', '#2a5aff'], ['#ff7a1a', '#9a2aff'], ['#1affb0', '#ff2ad0'], ['#ffd02a', '#2ad8ff'], ['#ff2a2a', '#ffffff'], ['#8a2aff', '#2affd0']),
    sign: ['#6ab8ff', '#ff6aa8'],
    look: ['#141418', '#2b2b30', '#e8e4dc', '#7a2330', '#1f2e4a', '#e86a2a', '#d77aa0', '#5ac8d8'],
  },
  static: {
    id: 'static',
    name: 'STATIC',
    blurb: 'glitch electro · thursdays',
    cover: 15,
    sleeves: false,
    shorts: false,
    strobe: true,
    palettes: pal(['#3ae8ff', '#ff2ad0'], ['#ffffff', '#3ae8ff'], ['#ff2ad0', '#141418'], ['#3ae8ff', '#8a2aff']),
    sign: ['#3ae8ff', '#ff2ad0'],
    look: ['#141418', '#0e0e10', '#e8e4dc', '#3ae8ff', '#ff2ad0', '#2b2b30', '#5a5a64'],
  },
  current: {
    id: 'current',
    name: 'CURRENT',
    blurb: 'house all night · fridays',
    cover: 20,
    sleeves: true,
    shorts: false,
    strobe: true,
    palettes: pal(['#ff6a2a', '#ffd23a'], ['#ff2a4a', '#ffb02a'], ['#ffd23a', '#2a8aff'], ['#ff6a2a', '#8a2aff']),
    sign: ['#ffb02a', '#ff6a2a'],
    look: ['#141418', '#e8e4dc', '#7a2330', '#e86a2a', '#c9b48a', '#2b2b30', '#ffd23a'],
  },
  overload: {
    id: 'overload',
    name: 'OVERLOAD',
    blurb: 'peak time acid · saturdays',
    cover: 30,
    sleeves: true,
    shorts: false,
    strobe: true,
    lasers: true, // in the groove too, not just the drop
    confetti: true,
    palettes: pal(['#c8ff2a', '#ff2a6a'], ['#ff2a6a', '#2affd0'], ['#c8ff2a', '#8a2aff'], ['#ffffff', '#ff2a6a']),
    sign: ['#c8ff2a', '#ff2a6a'],
    look: ['#141418', '#c8ff2a', '#ff2a6a', '#e8e4dc', '#2b2b30', '#8a2aff', '#0e0e10'],
  },
  low: {
    id: 'low',
    name: 'LOW VOLTAGE',
    blurb: 'deep and slow · sundays',
    cover: 10,
    sleeves: false,
    shorts: true, // it's Sunday, wear what you like
    strobe: false,
    palettes: pal(['#a8b8ff', '#5a3aaa'], ['#6a8aff', '#e8c8ff'], ['#3a5aaa', '#a8f0ff'], ['#8a6aff', '#ffd8e8']),
    sign: ['#a8b8ff', '#ffffff'],
    look: ['#2b2b30', '#5a6a8a', '#e8e4dc', '#8a7aa8', '#3a4a6a', '#c9b48a', '#1f2e4a'],
  },
};

export const WEEK = { MON: 'house', TUE: 'house', WED: 'house', THU: 'static', FRI: 'current', SAT: 'overload', SUN: 'low' };
export const nightTheme = (weekday) => NIGHTS[WEEK[weekday] ?? 'house'];

// regulars: which nights each clubber comes out, from who they are
const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const FAVOURITE = { hyped: ['SAT', 'FRI'], raver: ['SAT', 'THU'], chill: ['SUN', 'WED'], shy: ['THU', 'SUN'], chatty: ['FRI', 'TUE'], regular: ['FRI', 'SAT'], flash: ['SAT', 'FRI'] };

/** The nights someone usually comes out: two or three that suit them, plus one random night. */
export function nightsFor(k, vibe) {
  const out = new Set(FAVOURITE[vibe] ?? ['FRI', 'SAT']);
  let h = (k * 2654435761) >>> 0;
  const next = () => ((h = (h * 1103515245 + 12345) >>> 0) >>> 8) / 16777216;
  if (next() < 0.6) out.add(DAYS[Math.floor(next() * 7)]);
  if (next() < 0.35) out.add(DAYS[Math.floor(next() * 7)]);
  return out;
}

export const dayName = (d) => ({ MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday', FRI: 'Friday', SAT: 'Saturday', SUN: 'Sunday' })[d] ?? d;
