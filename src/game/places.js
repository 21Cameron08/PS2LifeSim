import { isOpen as gullysOpen } from './gullysMenu.js';

// Everywhere worth going, for the map: where the door is, what it is, whether
// it's open right now, and which needs it fills. Everything is read live (your
// home changes when you sign a lease, the club's status follows the night).

const money = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
const hourText = (h) => `${((h + 11) % 12) + 1} ${h < 12 || h === 24 ? 'AM' : 'PM'}`;

// 16x16 SVG paths (drawn on the map canvas with Path2D and in the list as <svg>)
export const PLACE_ICONS = {
  home: 'M8 1.5 1 7.6h2v6.9h4v-4.2h2v4.2h4V7.6h2z',
  key: 'M5.5 2.5a3.5 3.5 0 1 0 2.9 5.5h2.1l1.2 1.2 1.2-1.2 1.3 1.2L15 7.4V6H8.4a3.5 3.5 0 0 0-2.9-3.5zM4 4.7a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6z',
  store: 'M3 5h10l-1 9.5H4zM5.6 5V4a2.4 2.4 0 0 1 4.8 0v1h-1.4V4a1 1 0 0 0-2 0v1z',
  burger: 'M2 7.2a6 4.2 0 0 1 12 0zM1.4 8.2h13.2v2H1.4zM2 11.2h12v.8a2.2 2.2 0 0 1-2.2 2.2H4.2A2.2 2.2 0 0 1 2 12z',
  club: 'M6 2.2 14 1v9.6a2.4 2 0 1 1-1.5-1.9V4.2L7.5 5v7.2A2.4 2 0 1 1 6 10.3z',
  lantern: 'M8 1 10.8 5.5 8 15 5.2 5.5zM6.6 5.6h2.8L8 11z',
  tree: 'M8 1a4.8 4.8 0 0 1 2.6 8.8H9v4.7H7V9.8H5.4A4.8 4.8 0 0 1 8 1z',
};

/**
 * w: { city, apts, state, store, job, gullys, club, lantern, park, clubNight() }
 * Each place: { id, icon, color, at: {x,z}, name(), sub(), status(hour) -> { text, open },
 *               needs() -> need keys it fills, big (always labelled) }
 */
export function buildPlaces(w) {
  const { city, apts, state, store, job, gullys, club, lantern, park } = w;
  const P = [];
  for (const a of apts.list) {
    const home = () => a.id === state.home;
    P.push({
      id: `apt:${a.id}`,
      icon: () => (home() ? 'home' : 'key'),
      color: () => (home() ? '#7dff9a' : '#7fd4ff'),
      at: { x: a.door.x, z: a.door.z },
      name: () => a.L.name,
      sub: () => (home() ? 'Home: sleep, shower, cook, TV' : `For lease · ${money(a.L.moveIn)} in, ${money(a.L.rent)} a week`),
      status: () => (home() ? { text: 'HOME', open: true } : { text: 'VIEWINGS', open: true }),
      needs: () => (home() ? ['energy', 'hygiene', 'hunger', 'fun'] : []),
      big: home,
    });
  }
  P.push({
    id: 'store',
    icon: () => 'store',
    color: () => '#5ad88a',
    at: { x: store.outsideSpot.x, z: store.outsideSpot.z },
    name: () => 'HALCYON 24',
    sub: () => (job.J.hired ? (job.J.shift ? 'Your job · on shift now' : 'Your job · night clerk, $9 an hour') : 'Groceries, coffee, hot dogs · help wanted'),
    status: () => ({ text: 'OPEN 24 HOURS', open: true }),
    needs: () => ['hunger', 'energy'],
    big: () => true,
  });
  P.push({
    id: 'gullys',
    icon: () => 'burger',
    color: () => '#ff9a4a',
    at: { x: gullys.outsideSpot.x, z: gullys.outsideSpot.z },
    name: () => "GULLY'S",
    sub: () => 'Burgers, fries, shakes · Gull Box toys',
    status: (h) => (gullysOpen(h) ? { text: 'OPEN · until 2 AM', open: true } : { text: 'CLOSED · opens 6 AM', open: false }),
    needs: () => ['hunger', 'fun', 'social'],
    big: () => true,
  });
  P.push({
    id: 'club',
    icon: () => 'club',
    color: () => '#e86aff',
    at: { x: club.outsideSpot.x, z: club.outsideSpot.z },
    name: () => 'SUBSTATION',
    sub: () => `Nightclub · ${w.clubNight().toLowerCase()} night · cover $${w.clubNight() === 'SAT' ? 30 : 20}`,
    status: () =>
      club.status === 'open'
        ? { text: 'OPEN · until 4 AM', open: true }
        : club.status === 'lightsup'
          ? { text: 'LIGHTS UP · closing', open: false }
          : { text: `CLOSED · opens ${hourText(22)}`, open: false },
    needs: () => ['fun', 'social'],
    big: () => true,
  });
  P.push({
    id: 'lantern',
    icon: () => 'lantern',
    color: () => '#b48aff',
    at: { x: lantern.keeperSpot.x, z: lantern.keeperSpot.z + 2.5 },
    name: () => 'Lantern Quarter',
    sub: () => 'The old tree, the Keeper, lanterns and fortunes',
    status: (h) => ({ text: h >= 19 || h < 5 ? 'BEST AT NIGHT · now' : 'ALWAYS OPEN', open: true }),
    needs: () => ['fun'],
    big: () => true,
  });
  if (park)
    P.push({
      id: 'park',
      icon: () => 'tree',
      color: () => '#7ad86a',
      at: { x: park.cx, z: park.z1 - 2 },
      name: () => 'Greenway Park',
      sub: () => 'Trees, paths, the fountain, a bit of quiet',
      status: () => ({ text: 'ALWAYS OPEN', open: true }),
      needs: () => ['fun'],
      big: () => true,
    });
  // the street machines: drawn small, not in the list
  const small = city.interactables.filter((it) => it.type === 'atm' || it.type === 'vending').map((it) => ({ type: it.type, x: it.x, z: it.z }));
  return { list: P, small };
}
