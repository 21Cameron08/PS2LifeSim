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
  bag: 'M2.5 5h11l.8 9.5H1.7zM5.4 5V3.8a2.6 2.6 0 0 1 5.2 0V5H9.2V3.8a1.2 1.2 0 0 0-2.4 0V5z',
  chart: 'M1 1.5h1.6v11.4H15v1.6H1zM3.6 10.6l3.2-4 2.4 2 3.6-4.8-1.4-.1L12.9 2l.6 3.4-1-.9-3.3 4.4-2.4-2-2 2.6z',
  crown: 'M1.5 12.5V4.5l3.2 3.2L8 2.5l3.3 5.2 3.2-3.2v8zM1.5 13.3h13v1.6h-13z',
  car: 'M2 8.2 3.6 4.4A1.5 1.5 0 0 1 5 3.5h6a1.5 1.5 0 0 1 1.4.9L14 8.2a1.4 1.4 0 0 1 1 1.3V12H1V9.5a1.4 1.4 0 0 1 1-1.3zM3 12.5h3V14a.8.8 0 0 1-.8.8H3.8A.8.8 0 0 1 3 14zm7 0h3V14a.8.8 0 0 1-.8.8h-1.4A.8.8 0 0 1 10 14z',
};

/**
 * w: { city, apts, state, store, job, gullys, club, lantern, park, clubNight() }
 * Each place: { id, icon, color, at: {x,z}, name(), sub(), status(hour) -> { text, open },
 *               needs() -> need keys it fills, big (always labelled) }
 */
export function buildPlaces(w) {
  const { city, apts, state, store, job, gullys, club, lantern, park, motors, crown } = w;
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
    sub: () => (w.crew?.J.owner ? "It's yours · the franchise, profit every Monday" : w.crew?.J.hired ? (w.crew.onShift ? 'Your job · on shift now' : w.crew.manager ? 'Your job · shift manager, $13.50 an hour + bonus' : 'Your job · crew, $9.50 an hour + a meal') : 'Burgers, fries, shakes · Gull Box toys · hiring'),
    status: (h) => (gullysOpen(h) ? { text: 'OPEN · until 2 AM', open: true } : { text: 'CLOSED · opens 6 AM', open: false }),
    needs: () => ['hunger', 'fun', 'social'],
    big: () => true,
  });
  P.push({
    id: 'galleria',
    icon: () => 'bag',
    color: () => '#d8b46a',
    at: { x: w.galleria.outsideSpot.x, z: w.galleria.outsideSpot.z },
    name: () => 'HALCYON GALLERIA',
    sub: () => {
      const sat = w.weekday?.() === 'SAT';
      return `RACK & RUIN thrift · SPLITGRAIN streetwear · MAISON VELLARD luxury · ROOMSET furniture${sat ? " · Grain Runner 9 drop today, 10 AM" : ''}`;
    },
    status: (h) => (h >= 10 && h < 22 ? { text: 'OPEN · until 10 PM', open: true } : { text: 'CLOSED · opens 10 AM', open: false }),
    needs: () => ['fun', 'social', 'hunger'],
    big: () => true,
  });
  if (w.exchange)
    P.push({
      id: 'exchange',
      icon: () => 'chart',
      color: () => '#8affb0',
      at: { x: w.exchange.outsideSpot.x, z: w.exchange.outsideSpot.z },
      name: () => 'HALCYON EXCHANGE',
      sub: () => 'Trade shares on the floor · the Ticker Bar · property for sale',
      status: (h) => (h >= 8 ? { text: w.market?.isOpen() ? 'OPEN · the market trades till 4 PM' : 'OPEN · the bar until midnight', open: true } : { text: 'CLOSED · opens 8 AM', open: false }),
      needs: () => ['fun', 'social', 'energy'],
      big: () => true,
    });
  P.push({
    id: 'club',
    icon: () => 'club',
    color: () => '#e86aff',
    at: { x: club.outsideSpot.x, z: club.outsideSpot.z },
    name: () => 'SUBSTATION',
    sub: () => {
      const th = w.clubTheme();
      const friends = w.clubFriends();
      return `${th.name}: ${th.blurb} · cover $${th.cover}${friends.length ? ` · usually in tonight: ${friends.slice(0, 3).join(', ')}` : ''}`;
    },
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
  // the room behind the coil: only on the map once you've found it
  if (club.hatch)
    P.push({
      id: 'undercurrent',
      icon: () => 'lantern',
      color: () => '#c88aff',
      at: { x: club.hatch.x, z: club.hatch.z + 1.2 },
      name: () => 'The Undercurrent',
      sub: () => 'Behind the coil at SUBSTATION. The clock stops down there.',
      status: (h) => (club.status === 'open' && h >= 3.55 && h < 3.75 ? { text: 'OPEN · until 3:45', open: true } : { text: 'OPENS 3:33 AM', open: false }),
      needs: () => ['energy', 'fun'],
      big: () => true,
      hidden: () => !state.seen?.undercurrent,
    });
  if (motors)
    P.push({
      id: 'motors',
      icon: () => 'car',
      color: () => '#ff6a5a',
      at: { x: motors.outsideSpot.x, z: motors.outsideSpot.z },
      name: () => 'CORSO MOTORS',
      sub: () => (state.cars?.length ? 'Car showroom · sell yours back to Vic, test drives' : 'Car showroom · from $8,900 · test drives · free espresso'),
      status: (h) => (h >= 9 && h < 20 ? { text: 'OPEN · until 8 PM', open: true } : { text: 'OPENS 9 AM', open: false }),
      needs: () => ['fun', 'energy'],
      big: () => true,
    });
  if (crown) {
    const member = () => !!state.crownMember || state.home === 'penthouse';
    P.push({
      id: 'crown',
      icon: () => 'crown',
      color: () => '#d8b46a',
      at: { x: crown.lobbyDoor.x, z: crown.lobbyDoor.z + 1.2 },
      name: () => 'THE CROWN',
      sub: () => (member() ? 'Your club: pool, cabanas, fire pits, sunset sessions' : 'Rooftop members\' club on the Meridian tower · $25,000 to join'),
      status: (h) => (h >= 10 || h < 2 ? { text: h >= 18 && h < 22 ? 'SUNSET SESSION' : 'OPEN · until 2 AM', open: true } : { text: 'OPENS 10 AM', open: false }),
      needs: () => ['fun', 'energy', 'social', 'hygiene'],
      big: () => true,
    });
    P.push({
      id: 'orrery',
      icon: () => 'crown',
      color: () => '#f0d8a0',
      at: { x: crown.lobbyDoor.x + 0.6, z: crown.lobbyDoor.z + 1.8 },
      name: () => 'ORRERY',
      sub: () => (state.orrery ? `Seven courses on the roof · your table: ${((state.orrery.hour + 11) % 12) + 1} PM` : 'Seven courses on the roof · book with Anouk (or by phone) · dress Sharp'),
      status: (h) => (h >= 19 && h < 23 ? { text: 'SERVING · until 11', open: true } : { text: 'DINNER 7 - 11 PM', open: false }),
      needs: () => ['hunger', 'fun', 'social'],
      big: () => false,
    });
  }
  // the street machines: drawn small, not in the list
  const small = city.interactables.filter((it) => it.type === 'atm' || it.type === 'vending').map((it) => ({ type: it.type, x: it.x, z: it.z }));
  return { list: P, small };
}
