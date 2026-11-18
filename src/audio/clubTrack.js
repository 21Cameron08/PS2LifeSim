// SUBSTATION's house track. The arrangement lives here so the audio (what plays)
// and the club's lights (what flashes) always agree on where the drop is.
// Everything is original and synthesised: four-on-the-floor, offbeat bass,
// minor-key chord stabs, a riser and a drop, looping every 48 bars.

export const BPM = 124;
export const SPB = 60 / BPM; // seconds per beat
export const LOOP = 48; // bars

// energy drives the lights: 0 = ambient, 1 = everything going
const SECTIONS = [
  { from: 0, name: 'intro', energy: 0.35, kick: 1, hats: 1 },
  { from: 8, name: 'groove', energy: 0.6, kick: 1, hats: 1, clap: 1, bass: 1 },
  { from: 16, name: 'breakdown', energy: 0.22, stabs: 1, pad: 1 },
  { from: 20, name: 'build', energy: 0.5, hats: 1, stabs: 1, pad: 1, riser: 1 },
  { from: 24, name: 'drop', energy: 1, kick: 1, hats: 1, open: 1, clap: 1, bass: 1, stabs: 1, lead: 1 },
  { from: 40, name: 'groove', energy: 0.6, kick: 1, hats: 1, clap: 1, bass: 1 },
];
SECTIONS.forEach((s, k) => (s.len = (SECTIONS[k + 1]?.from ?? LOOP) - s.from));

export function sectionAt(bar) {
  const b = ((Math.floor(bar) % LOOP) + LOOP) % LOOP;
  let s = SECTIONS[0];
  for (const x of SECTIONS) if (b >= x.from) s = x;
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
