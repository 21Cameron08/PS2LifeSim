// SUBSTATION's music. The arrangement lives here so the audio (what plays) and the
// club's lights (what flashes) always agree on where the drop is. Everything is
// original and synthesised: four-on-the-floor, offbeat bass, minor-key chord stabs,
// a riser and a drop, looping every 48 bars.
//
// Each night of the week has a theme (see game/clubNights.js) with its own tempo
// and arrangement; the sound (ambience.js playClubBar) and the lights (club.js)
// read the current one. A DJ set (game/djSet.js) can take over the arrangement
// live with setArrangement().

// energy drives the lights: 0 = ambient, 1 = everything going
export const SECTION_DEFS = {
  intro: { name: 'intro', energy: 0.35, kick: 1, hats: 1 },
  groove: { name: 'groove', energy: 0.6, kick: 1, hats: 1, clap: 1, bass: 1 },
  breakdown: { name: 'breakdown', energy: 0.22, stabs: 1, pad: 1 },
  build: { name: 'build', energy: 0.5, hats: 1, stabs: 1, pad: 1, riser: 1 },
  drop: { name: 'drop', energy: 1, kick: 1, hats: 1, open: 1, clap: 1, bass: 1, stabs: 1, lead: 1 },
};

const arrange = (list) => {
  let from = 0;
  return list.map(([name, len]) => {
    const s = { ...SECTION_DEFS[name], from, len };
    from += len;
    return s;
  });
};

export const LOOP = 48; // bars
export const THEMES = {
  // midweek house: the club's own track
  house: { id: 'house', bpm: 124, sections: arrange([['intro', 8], ['groove', 8], ['breakdown', 4], ['build', 4], ['drop', 16], ['groove', 8]]) },
  // STATIC (Thursday): glitchy electro, a bit faster, short breakdowns
  static: { id: 'static', bpm: 128, sections: arrange([['intro', 8], ['groove', 8], ['build', 4], ['drop', 12], ['breakdown', 4], ['build', 4], ['drop', 8]]) },
  // CURRENT (Friday): the flagship house night
  current: { id: 'current', bpm: 124, sections: arrange([['intro', 8], ['groove', 8], ['breakdown', 4], ['build', 4], ['drop', 16], ['groove', 8]]) },
  // OVERLOAD (Saturday): peak time, acid, two drops
  overload: { id: 'overload', bpm: 130, sections: arrange([['intro', 4], ['groove', 8], ['build', 4], ['drop', 12], ['breakdown', 4], ['build', 4], ['drop', 12]]) },
  // LOW VOLTAGE (Sunday): deep and slow, long breakdowns
  low: { id: 'low', bpm: 112, sections: arrange([['intro', 8], ['groove', 12], ['breakdown', 8], ['build', 4], ['drop', 8], ['groove', 8]]) },
};

let cur = THEMES.house;
export let BPM = cur.bpm;
export let SPB = 60 / BPM; // seconds per beat
let override = null;

/** Switch tonight's theme (only while the music's stopped: it changes the tempo). */
export function setTheme(id) {
  cur = THEMES[id] ?? THEMES.house;
  BPM = cur.bpm;
  SPB = 60 / BPM;
}
export const theme = () => cur;

/** A live arrangement (bar -> section or null), e.g. a DJ set; null hands back to the theme's. */
export function setArrangement(fn) {
  override = fn;
}

export function sectionAt(bar) {
  if (override) {
    const s = override(Math.floor(bar));
    if (s) return s;
  }
  const b = ((Math.floor(bar) % LOOP) + LOOP) % LOOP;
  let s = cur.sections[0];
  for (const x of cur.sections) if (b >= x.from) s = x;
  return { ...s, bar: b - s.from };
}

// A minor: Am7 - Fmaj7 - C - G, two bars each
export const CHORDS = [
  [57, 60, 64, 67],
  [53, 57, 60, 64],
  [55, 60, 64, 67],
  [55, 59, 62, 67],
];
export const ROOTS = [45, 41, 48, 43];
export const chordAt = (bar) => Math.floor((((Math.floor(bar) % 8) + 8) % 8) / 2);
export const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);
