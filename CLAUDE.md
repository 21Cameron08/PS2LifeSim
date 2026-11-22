# Port Halcyon: notes for Claude

A PS2-style browser life sim (Vite + three.js, no build-time assets). See README.md for
features, controls and the code map.

## Design direction (from the owner)

- **Lots of cool places to hang out.** This is a core goal, not a side feature: the city
  should keep gaining spaces worth going to and lingering in (think diner booths, an
  arcade, rooftops, a karaoke bar, a laundromat at 2 AM, a record shop, the night market,
  a pier). Each one should have the same detail, ambience and lighting care as the
  apartments and HALCYON 24: a real walk-in interior, sounds, music, people, small things
  to do. When choosing what to build next, favour new hangout spaces.
- Dense semi-city with great detail and ambience; borderline fantasy in some areas (the
  Lantern Quarter).
- Later: more jobs, cars, bank accounts, NPC interaction, clothes, customization,
  furniture, and online play much later.
- Jobs should feel real and immersive, and entry-level pay should be low.

## Working notes

- `npm run dev` / `npm run build`. Interiors use baked vertex lighting
  (`src/world/interior/`); new interiors reuse the kit in `kit.js` and live in the city
  space or their own space (see `world/apartments.js`, `world/store.js`).
- Avoid coplanar overlapping faces (z-fighting): end panels outside spans, labels and
  glows at least 5 mm proud, buildings must not overlap their neighbours' trim.
- SUBSTATION (`world/club.js`, `actors/clubbers.js`, `audio/clubTrack.js`, `game/dance.js`,
  `game/photobooth.js`): interiors can carry four extra baked light channels (`fxLight` in
  the kit, `aFx` in bake.js) recoloured per frame; rooms with the same `zone` share lights.
  Rooms can be stacked (`y0` floor, `h` ceiling) and wall openings can have several vertical
  `gaps`. The player's ground on stairs/balcony/fire escape/roof comes from
  `club.groundAt(x, z, playerY, base)` (outdoor and club spaces both use it). Phases 1-3 are
  built. Theme nights: `game/clubNights.js` (cover, dress, palettes, looks) and
  `audio/clubTrack.js` (`setTheme` changes the tempo, so the club music restarts; `sectionAt`
  is shared by the sound, the lights and the dance game, and `setArrangement` lets a DJ set
  drive all three). The bar job (`game/barJob.js`) opens `club.setBarFlap`; the DJ set is
  `game/djSet.js`; the green room is part of the club interior. The Undercurrent
  (`world/undercurrent.js`) is its own space 30 m under the club, reached at 3:33-3:45 AM;
  `main.js` stops the clock there (`inUnder`).
- GULLY'S (`world/gullys.js`, `world/gullyFigure.js`, `render/gullysTextures.js`,
  `actors/diners.js`, `game/gullysMenu.js`, `game/gullysVisit.js`): the menu is plain data
  in gullysMenu.js. Diners owns the crew, customers, orders and the tray/bag meshes (the
  player's tray is a diners tray too); when the camera is far away people walk at 80 m/s
  and new customers can spawn already seated or waiting, so the place is busy on arrival.
  Seats carry a `route` from the aisle; crowd poses `c.tray` and `c.eat` came with it.
- GULLY'S crew job (`game/crewJob.js`): Marco hires you through `gullysVisit.talk`
  (`crew.marcoChoices`). On a shift `diners.shift = { stock: { fry, grill }, short }`: register 2
  waits for you (customers carry a `wish`, `diners.ringUp` sends your ticket), Marco only
  plates orders whose `items` the bins can cover (`KITCHEN` in gullysMenu.js), to-go orders
  wait in state `bag` for you, and `diners.onCrew` reports 'lost'/'wrong'. The kitchen side
  is reached through the staff gate (`gullys.staffGate` collider, opened while
  `gullys.crewKitchen` is set or you're still `behindCounter`); the live ticket screen is
  `KitchenScreen` swapped onto `gullys.kitchenMat`. One job at a time: `onClock()` in main.js.
- Clothes and status (`game/fashion.js`): the appearance carries `wear` (an item id per slot);
  `crowd.setAppearance` runs it through `dress()`, so anything that sets an appearance works
  (uniforms pass `wear: null`). Slots left out of `wear` keep the appearance's own clothes
  (NPCs that only add accessories). New wearables are instanced parts in `actors/crowd.js`
  (hood, coat tail, cap, beanie, shades, chain, watch, sole, bags via `c.bags`, logo prints
  from the atlas in `render/fashionTextures.js`). `statusOf(app, home)` drives the HUD,
  `peds.stare`, staff greetings, Dmitri and Jo. Bank card payments push to `state.ledger`
  (the ATM statement).
- The Halcyon Galleria (`world/galleria.js`, `actors/shoppers.js`, `game/shopping.js`,
  `render/galleriaTextures.js`): two floors (`UP` = 4.6) and escalators in one kit;
  `galleria.groundAt` is chained into the city's ground like the club's, and
  `escalatorFlow` carries the player. Displays, tills, mirrors, seats and staff spots are
  data on the galleria object; shoppers walk a small waypoint graph (`buildGraph`) with
  'up'/'down' escalator legs. RACK & RUIN's stock is seeded by the day. The Saturday drop
  is `dropFor(week)` (a Grain Runner 9 colourway per week, `GR9` in fashion.js); one-off
  pieces carry `oneOff` (never on NPCs).
- Furniture (`game/furniture.js` catalog, `world/homeDecor.js` placing, `game/homeLife.js`
  using, `game/nightRunner.js` the arcade game): `state.furniture.pieces` are
  `{ uid, id, home, x, z, r, variant }` (home null = storage; x/z apartment-local, r quarter
  turns). Each piece's `build(P, ctx)` uses the interior kit (local +z is its front;
  `box`/`h` are its footprint and height; wall pieces hang with their back at z = 0).
  `decor.rebuild(apt)` builds everything placed into one mesh per texture, adds its
  colliders and interactables (`use: 'decor'`) to the apartment, and re-bakes the room
  with the placed lamps and shadows. Fit tests: colliders, `kit.doorways`, other pieces,
  and a triangle index of the room (`TriIndex`) for built-in clutter and wall support.
  ROOMSET (`galleria.buildRoomset`, zone 'rs') builds the same catalog pieces as its
  displays; its orders go through `shopping.delivered` into storage. `extraStatus.decor`
  in fashion.js is the home's status. Wishes for furniture are `'f:<id>'` (`lookup`).
- Getting rich (`game/market.js`, `game/property.js`, `game/resale.js`, `world/exchange.js`,
  `actors/brokers.js`, `render/exchangeTextures.js`): stock prices are a pure function of the
  clock (`market.day(sym, d)` caches each day's open/close from seeded noise and the
  morning's `news(d)`; `EPOCH` days of history before day 0), so nothing about the market is
  saved but your holdings (`state.market`). The Exchange is its own shell like the Galleria
  (`exchange.contains`, `exchSpace`); its board, LED crawl and clocks are canvas textures
  redrawn in `exchange.update`, and `setModel(highlights)` rebuilds the city model from
  `city.footprints` (which now carry `i, j, shop, gf, faces`). Brokers' spots are the
  Exchange's own seat objects with a `route` from the front aisle, so `brokers.taken` is
  shared with the player's seats. Property picks its buildings from footprints by block and
  rule; `property.buildSigns` puts the boards up. Weekly money (rent out, dividends,
  property rent, franchise profit) all runs from `payRent`/`weeklyIncome` in main.js.
  GULLY'S ranks live on `state.crewJob` (`rank`, `good`, `mgrShifts`, `owner`); the
  franchise on `state.franchise`. `netWorth()` in main.js feeds milestones and
  `extraStatus.wealth`.
- Cars (`game/cars.js`): `CARS` catalog, `makeCarMesh` (`static: true` bakes the wheels and
  lamps into the trim for showroom cars), `Garage` owns `state.cars` (`{ uid, id, paint, x,
  z, yaw, demo? }`; demo cars aren't saved). Driving replaces `player.update` in the frame
  (`updateDriving`), the camera has a `'drive'` mode (`rig.car`), the car's circles resolve
  against `city.colliders`, traffic (`traffic.obstacles`, refilled by `garage.update`) and
  people (walkers get an `ox/oz` offset in pedestrians.js; standers stop the car); shells
  are off limits via `forbidden`. CORSO MOTORS (`world/motors.js`, `actors/motorsFolk.js`,
  `render/motorsTextures.js`) is a shell like the Exchange; sales, test drives and trade-ins
  are in main.js. `extraStatus.car/phone/help` add to status like `decor`.
- THE CROWN (`world/crown.js`, `actors/crownFolk.js`, `game/orrery.js`,
  `render/crownTextures.js`): one InteriorKit on the Meridian tower's roof (origin at
  `DECK`, 1.15 m above the roof) with open-air rooms (`noCeil`, `sky` = daylight from the
  whole sky, a kit room option) and the ORRERY pavilion as a normal room; fx channels:
  0 fire pits, 1 pool lights, 2 the DJ. `crown.groundAt` is chained outermost into the
  city's ground (deck, pool steps and floor, the DJ platform); pool walls are colliders that
  only exist below the deck. You get up and down with `crownLift` (a fade); `onCrown` /
  `inOrrery` in main.js. Members walk a small waypoint graph (`NODES`/`EDGES`); seats are
  shared through `crownFolk.taken`. ORRERY's dinner is `dinner` in main.js (`openDinner`,
  the plate is `TablePlate`).
- BRIGHTWIRE (in galleria.js, `buildBrightwire`, zone `'bw'`) is a second furniture shop
  (`FURN_SHOPS` in shopping.js); its stock is furniture.js cat `'tech'` (uses `watch`,
  `hifi`, `cinema`, `arcade` in homeLife.js). Screens use the kit's `'tv'` target (placed
  furniture renders `tk.screen` too); the Galleria draws the shared TV texture when you're
  not at home. The phone (`state.phone`, Tab / `#phone-btn`) and its apps (cabs, valet,
  ORRERY, markets, bank, the Agency's hired help `HELP`/`state.help`, wages in
  `weeklyIncome`) are in main.js. SUBSTATION's bottle list is `BOTTLES`; the sparkler
  parade is `club.sparkle(pos, { n, from })` and a big bottle sets `clubbers.vipBoost`.
- Needs (`game/needs.js`, `updateNeeds`/`passOut` in main.js, HUD in `ui.setNeeds`): decay
  comes from game time each frame (`needs.tick`); jumps of 30+ minutes are skipped there, so
  anything that skips time on purpose (sleep, shower, fridge, passing out) applies its own
  effect and resets `needsLast`. Activities call `needs.give({...})`; conversations call
  `needs.chat(key, minutes)`. New things to do should feed at least one need.
- The map (`ui/map.js`, places in `game/places.js`, route beam `world/waypoint.js`): it is
  drawn from `city.blocks`/`city.footprints`, so new buildings show up on their own. A new
  hangout space needs an entry in `buildPlaces` (door position, live status/hours, needs it
  fills) to appear in the list, on the map and as a route target.
- On-screen messages (`ui.toast`, `ui.hint`, `ui.showLocation`, `ui.setPrompt`, the job panel
  `#shift`) live in two containers, `#msgs-top` and `#msgs-bottom`. On a desktop they keep
  their absolute positions; on a phone or narrow window (`body.compact`) they become two
  stacked columns placed by `ui.layoutMessages` (under the HUD / above the touch buttons, or
  beside them on short `body.short` screens), so nothing overlaps; `crowd1`/`crowd2` drop the
  banner, then park the hint, when even that doesn't fit. Toasts queue (`toastQ`) and stay up
  longer when they're long. New HUD panels should go in the HUD columns (`#hud-left`,
  `#hud-right`) so the message columns measure round them.
- Secret cheat menu (money, warps, time) for testing: type `BLING` while walking around,
  or tap the money display five times. Code is in `main.js` (`openCheats`) and
  `ui/ui.js` (`openCheats`). Not listed in the in-game controls on purpose.
- All names, shops and brands in the game are made up; keep it that way.
