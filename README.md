# Port Halcyon — a PS2‑style life sim (prototype)

A browser life sim with a PlayStation‑2‑era look: a dense little city, day/night,
pedestrians, traffic, shops, neon, and one block where things get a bit magical.

```bash
npm install
npm run dev      # open the printed URL
npm run build    # static site in dist/ — host it anywhere (GitHub Pages, Netlify, itch.io)
```

## Controls

| Action | Keyboard / mouse | Touch |
| --- | --- | --- |
| Walk / run | WASD or arrows, hold Shift to run | left thumb (drag), RUN toggle |
| Look / zoom | drag with the mouse, wheel to zoom, Q snaps 45° | right thumb (drag) |
| Talk / use | E | USE |
| Wardrobe | C | STYLE |
| Pause / settings | Esc (or P) | MENU |
| Fast‑forward time | hold T | – |
| Dance (on the club's floor) | E to start, ← ↑ → ↓ or WASD on the beat, Esc to stop | USE, then the arrow pad |
| Bartending (SUBSTATION) | ingredients 1-0, Q, W · Enter finish the glass · Backspace tip it out · S serve | the panel's buttons |
| DJ set (SUBSTATION) | 1-4 pick what plays next · Space cue on the one · Esc end the set | the panel's buttons |
| City map, routes | M (↑↓ pick a place, Enter set a route) | MAP |
| Sound on/off | pause menu (Sound) | in the pause menu |

## What's in this first slice

- **The city**: a 6×6 block grid of procedurally generated buildings (7 facade styles,
  shop fronts, signs, awnings, setback towers with blinking antennas, rooftop clutter),
  sidewalks, crosswalks, street lamps, trees, benches, bus stops, vending machines,
  ATMs, steaming manholes, a park with a fountain, a ring of buildings around the
  outer road, and a fogged skyline beyond so it feels endless.
- **The Lantern Quarter** (southeast of downtown): an ancient glowing tree, floating
  lanterns, fireflies, rune stones, a rune circle, a night market. Walking toward it
  shifts the fog and sky violet and fades in a mystical soundtrack.
- **Day/night**: a full 24‑minute day with sunrise and sunset palettes, stars, a moon,
  drifting clouds, lit windows at night and sodium street lights that really light
  you and passing cars.
- **People**: ~85 NPCs walking the sidewalks, crossing at corners, idling, chatting in
  pairs, mostly going home at night. Talk to anyone (E): they have names, moods and
  a friendship value that grows when you chat once a day.
- **Traffic**: cars and taxis on the road grid that turn at junctions, queue, stop
  for pedestrians, and honk if you stand in the road.
- **Money**: cash + bank balance, working ATMs (deposit/withdraw), vending machines,
  a lantern seller and a fortune teller in the night market.
- **Apartments**: you start in **Unit 3B**, a cramped walk-up above a laundromat in
  Old Market. Two better homes are up for lease (follow the blue diamonds):
  **Loft 4** at The Kiln Works in Kiln Heights, and the **Meridian Tower Penthouse**
  Downtown. See below.
- **A job**: night clerk at **HALCYON 24**, the convenience store next door to Unit 3B.
  $9 an hour. See below.
- **A nightclub**: **SUBSTATION**, a converted power substation in Ember Row, across the
  road from the Lantern Quarter. Open 10 PM to 4 AM. See below.
- **A burger joint**: **GULLY'S** in Greenway, a little harbour-town fast food chain
  ("Snatch a bite!" since 1987). Open 6 AM to 2 AM. See below.
- **Needs**: hunger, energy, hygiene, fun and social, shown under your money with your
  mood. Eat, sleep, shower, have fun and talk to people to keep them up. See below.
- **City map** (M, or MAP on touch): the real blocks and buildings, coloured by district,
  with every place worth going to, when it's open, and a route you can follow. See below.
- **Customization**: the wardrobe (C) edits skin, hair style/colour, top style
  (tee, long sleeve, jacket over a shirt), colours, bottoms, shoes, height, build.
- **Save**: autosaves to localStorage ("memory card"): position, time, money,
  looks, friendships, needs, what's in your fridge, Gull Box toys, settings.
- **Sound**: all synthesised with WebAudio: city rumble, wind, crickets, footsteps,
  horns, distant sirens, UI blips, typewriter ticks.

## Apartments

| | Unit 3B (start) | Loft 4 | Meridian Penthouse |
| --- | --- | --- | --- |
| Where | Old Market, 3rd floor above a laundromat, facing the park | Kiln Heights, converted factory, 3rd floor | Downtown, top floor of an 18-storey glass tower |
| Rooms | hall, bathroom, bedroom, living room + kitchenette | open-plan kitchen/dining/living, bedroom, bathroom | entry, kitchen, great room, study, master bedroom, ensuite |
| Move in / rent | $300 / $85 a week | $2,500 / $280 a week | $12,000 / $950 a week |

- Each interior is built **on its real floor inside its building**, so the windows show
  the live street: traffic, people, weather of the day/night cycle. From the penthouse
  you look out over the skyline.
- Walk up to the street door (E): enter your home, or for a listing **take a tour** and
  **sign the lease** (paid from your bank account; deposit cash at an ATM). Signing
  moves you in and ends your old lease. Rent leaves your bank every Monday morning.
- At home: **sleep** (skip to 7 AM), **shower/bath**, **change clothes** at the closet,
  raid the fridge, flip the **light switch**, watch **TV** (it really plays), and put on
  music: a crackly AM radio, a lo-fi record player, or the penthouse grand piano.
- Interiors use **baked vertex lighting** like PS2 games did: every lamp and window is
  pre-computed into the walls and furniture (plus soft contact shadows), and blended at
  runtime with the time of day and the light switch. Characters still get real lights.
- Layouts are plain data in `src/world/interior/layouts.js`: rooms, walls with door and
  window openings, and furniture from the kit in `src/world/interior/kit.js`. Adding an
  apartment = a building site in `src/config.js` + a layout.

## The job: HALCYON 24

A walk-in 24-hour convenience store on the same street as Unit 3B (follow the yellow
diamond). It isn't a loading-screen interior: the sliding doors open with a chime, you
can see in through the lit windows from the street, and shoppers walk in off the
sidewalk.

- **Get hired**: talk to Mrs. Varga behind the counter.
- **Clock in** at the punch clock in the stockroom (through STAFF ONLY). You put on
  the green vest; Mrs. Varga goes to the back office.
- **Register**: customers shop, then queue. Stand behind the counter and press E:
  scan each item, **check ID for beer** (born on or before the date the register
  shows, or refuse), then approve the card or **count out the change** from the drawer.
- **Restock**: shoppers empty the shelves facing by facing. Grab a case from the
  matching stockroom rack (drinks, snacks, noodles, household) and restock the aisle.
- **Mop** spills with the mop by the yellow bucket; a wet-floor sign goes up after.
- **Trash**: when the bin by the door fills, carry the bag out to the dumpster.
- **Pay**: $9.00 per game hour, paid to your bank when you clock out, with a printed
  shift slip. Docked for customers who give up waiting ($2), empty shelves ($1),
  ignored spills ($2), giving too much change, walking off the job ($5), and a $50
  fine for selling beer to a minor. Occasional tips if your change is exact.
- The office has a desk and a **live CCTV monitor** (there's another over the counter),
  so you can watch yourself work.

At $9/hour, Loft 4's $2,500 move-in is roughly 280 hours behind the counter. Not great pay.

## SUBSTATION (nightclub)

A 1950s power substation turned club, in Ember Row facing the Lantern Quarter. Like the
store it's part of the street: no loading screen.

- **Theme nights**: every night has its own sound, colours, cover and door policy, and a lit
  TONIGHT sign by the door (the map shows it too):

  | Night | Theme | Sound | Cover |
  | --- | --- | --- | --- |
  | Mon-Wed | HOUSE NIGHT | the club's own house track, 124 BPM | $15 |
  | Thu | STATIC | glitch electro at 128: square-wave stabs that stutter, bursts of digital noise, a floor like a dead TV channel, white and cyan lasers | $15 |
  | Fri | CURRENT | house all night at 124 with piano stabs, orange and gold washes | $20 |
  | Sat | OVERLOAD | peak-time acid at 130: a squelching 303-ish bassline, an air horn and confetti cannons on every drop, lasers through the groove too | $30 |
  | Sun | LOW VOLTAGE | deep and slow at 112: soft kicks, rimshots, long pads, an echoing lead, lavender light, no strobes | $10 |

- **The door**: a queue behind a velvet rope, Dmitri on the door, a neon sign buzzing over a
  steel canopy, and Ray's fries cart on the curb ($4, open 9 PM to 5 AM). Cover is cash; the
  stamp on your hand lets you come and go until close. From down the street you only hear the
  kick drum; it opens up when the doors swing open. On busy nights there's a real line: Dmitri
  sends you to the back of it (you wait, the clock moves). Make friends with him (pay the
  cover, ask how the door is, tip him) and he waves you past it; close friends get in free on
  quiet nights. Staff walk straight in.
- **Dress code**: no shorts (except at LOW VOLTAGE); on Fridays and Saturdays no T-shirts
  (long sleeves or a jacket). Turned away? Change in the wardrobe (C) and try again.
- **Inside**: a lobby with a coat check (it really takes your jacket off you, $2), gig posters,
  an ATM and a photo booth, a strip curtain into one tall concrete hall:
  an 8x8 LED dance floor under a mirror ball and a lighting truss, a DJ on an old transformer
  housing in front of a giant copper coil, ceramic insulator stacks, speaker stacks whose
  cones pump on the kick, a long backlit bar, red velvet booths, toilets covered in stickers,
  and the stairs up to the VIP balcony and the roof.
- **The show**: an original synthesised house track at 124 BPM that loops through intro,
  groove, breakdown, build and drop. The lights follow it: washes pulse on the kick, the
  floor runs patterns per section, the mirror ball spots swirl in the breakdown, beams sweep
  through the haze, lasers fan out on the drop and the crowd puts its hands up.
- **People**: up to ~40 clubbers depending on the night (Saturday is packed, Monday isn't),
  who walk in through the lobby, dance, prop up the bar, sit in the booths and leave. Staff:
  bouncer, security, DJ, two bartenders, coat check.
- **Dance**: step onto the LED floor and press E. Arrows scroll to the line on the beat; hit
  them in time for PERFECT / GOOD. Good timing fills your groove meter, which upgrades your
  moves (side step, groove, fist pump, hands up); at full groove the dancers around you turn
  and cheer. Timing is judged against what you hear, not the frame rate.
- **The bar** (and the roof bar): water, soft drinks, beer and three house cocktails (the Live
  Wire, the Brownout, the Spark). A drink or two loosens you up (the dance timing gets a bit
  more forgiving); after four, the bartender cuts you off.
- **People**: talk to anyone off the dance floor (bar, booths, balcony, roof). Everyone has a
  name and a vibe; chatting once a night and buying them a drink builds a friendship that's
  saved. Ask someone on the floor to dance and they'll partner you, copying your moves.
- **Sit down** in the booths, on the balcony and on the roof sofas and bench.
- **VIP balcony**: Celeste on the upper door sells wristbands ($150 on Fridays and Saturdays,
  $100 other nights, card). Emerald booths over the glass rail, the best view of the floor,
  and bottle service ($200) that arrives with a sparkler and wins over the whole balcony.
- **The roof terrace**: from the stair landing, out the door and up the fire escape on the
  front of the building. Decking, string lights, patio heaters, sofas, a bench at the parapet
  facing the Lantern Quarter's glowing tree, a roof bar, and people out getting some air. The
  music is a far-off thump up here; the lights show from the street.
- **Photo booth**: $5 for four flashes and four poses. The strip pops up, it's saved (your last
  three), and the newest one is stuck on the fridge at home with a magnet.
- **Regulars**: everyone has their usual nights (party people on Fridays and Saturdays, the
  chill ones on Sundays, one random night each). Make friends and they turn up on theirs, come
  over to say hi when they spot you, and remember what you did together last time. The map
  lists who's usually in tonight.
- **Bartending job**: ask Nadia at the bar if they're hiring. $11 an hour plus tips, any
  night the club's open. She lifts the flap and you work behind the bar with her: people at the
  bar get a "!" when they want something; stand across from them and make it from the recipe
  card taped under the bar, glass by glass, in order (ice first). Every drink takes a clean
  glass, so collect the empties from the tables and booths in a crate and run the glasswasher;
  fill the ice well from the ice machine; change the keg when the beer runs dry. Leave people
  waiting and Nadia serves them (and gets the tip). Wrong drinks are docked. A slip at the end.
- **DJ gig**: talk to DJ Halflife in front of the booth. Once you can move (a good dance combo)
  or she knows you, she books you a warm-up slot on a house or STATIC night: eight 8-bar
  phrases where you pick what comes next (groove, breakdown, build, drop) and hit CUE on the
  "one" as it changes. The music and the lights really follow you. The crowd's energy is the
  score: build before you drop, give them a breather after, mix cleanly; drop too soon or
  leave them hanging after a build and the floor empties. $60 plus tips; play well twice and
  she offers you a Friday prime-time set ($140).
- **The green room** behind the DJ booth (the STAFF ONLY door): a worn red sofa that gets your
  energy back, the DJ's rider (help yourself, three times a night), a mirror ringed with bulbs,
  record crates, a clothes rail and tour laminates. Open to staff, the DJ's friends and anyone
  who's played a good set.
- **3:33.** If you're in the hall at 3:33 AM the coil hums and turns violet, and around a
  little steel hatch behind it a seam of violet light appears. For twelve minutes you can slip
  through it into **the Undercurrent**: an old cable vault where the clock stops. The Lantern
  Quarter's tree has grown through the far wall: its roots glow across the floor, lanterns
  drift under the brick arches, and through the arch you can see it standing in a violet night.
  The music is the club's song slowed right down with bells in the echo. Vesper behind the
  cable-drum bar pours a glass of nothing (it wakes you right up), a few strange regulars have
  been here since 1987, and you can close your eyes on the sofa. Time doesn't pass while you're
  down there. Once you've found it, it's on the map.
- **4 AM: lights up.** House lights snap on, the music cuts, everyone files out. At 4:30
  security walks you out.
- **Flashing lights** (pause menu): FULL adds strobes, REDUCED (default) keeps beat pulses
  without strobing, OFF keeps everything slow and calm.

How the lights work: on top of the baked lamp light, the club's surfaces have four more
baked light channels (house lights, two stage washes, the LED floor) whose colours are set
every frame from the music, so the whole hall changes colour on the beat with no real-time
lights on the walls. People get the shared pool of real point lights, recoloured the same way.

## Needs

Five bars under your money, 0 to 100, and a mood that's mostly their average (the worst
one drags it down). They drain with game time: a game hour is a real minute, so a waking
day is about 16 minutes, which is about two meals, one sleep and one shower.

| Need | Drains | Fills from |
| --- | --- | --- |
| Hunger | ~5.5 an hour | the fridge at home (one meal per portion; groceries at HALCYON 24, $18 for 5), GULLY'S (every item has its own value, filled bite by bite), hot dogs and candy at HALCYON 24, fries outside SUBSTATION, vending machines |
| Energy | ~4.5 an hour, faster on a shift and when hungry | sleeping (until 7 AM, or a two-hour nap), coffee (GULLY'S, HALCYON 24), sodas |
| Hygiene | ~3.5 an hour, faster on a shift and dancing | a shower (or the penthouse bath), washing up at GULLY'S |
| Fun | ~4.5 an hour, faster on a shift | TV and music at home, dancing, the club, drinks, the photo booth, the kiddie ride, Gull Box toys, lanterns, fortunes and just being in the Lantern Quarter |
| Social | ~3 an hour | talking to anyone (a first chat in a while counts most), dancing with someone, the club and GULLY'S crowds |

When they run low: a warning tells you what would help. Below 15 energy you can't run,
below 6 you walk slower, and at 0 you pass out: a cab takes you home ($20) and you wake
up six hours later. A hungry body tires faster, and a starving one burns out fast. Low
hygiene gets you a little green stink cloud, halves how much people warm to you, and
Dmitri won't let you into SUBSTATION. Your mood sets how fast friendships grow.

The cheat menu has a Needs row (fill, drain, starving, exhausted, smelly) for testing.

## The map

Press **M** (MAP on touch) for a top-down map drawn from the city itself: roads, every
block and building (lighter = taller), coloured by district, with the park, the Lantern
Quarter's glow, ATMs and vending machines. You're the white arrow (the soft wedge is where
the camera looks); your home is outlined in green.

The list beside it has every place worth going to: home, the flats for lease, HALCYON 24,
GULLY'S, SUBSTATION, the Lantern Quarter and Greenway Park, each with what it is, whether
it's open right now (and until when, or when it opens), how far it is, and which needs it
fills. A place that would fix one of your low needs, and is open, gets an orange badge.

Pick one and **set a route**: an orange light beam rises over its door (you can see it over
the rooftops), and a chip under the clock shows the name, the distance and an arrow that
turns with the camera. Get there and it clears itself. Sound on/off moved to the pause
menu, since M is the map now.

## GULLY'S (fast food)

A small, made-up harbour-town burger chain: a round seagull mascot called Gully in a teal
sailor cap (winking), teal/orange/cream/navy everything, "Snatch a bite!", founded 1987 as
a fish shack on Pier Road. The Greenway branch sits back from the street behind a patio
with umbrella tables, a pole sign with a turning Gully on top and a lit roof sign.

- **Inside**: window booths with pendant lamps, tables with swivel stools, a checkerboard
  floor, the harbour mural, posters (the new Seafoam Shake, collect all six Gull Box toys,
  the sunrise menu, Employee of the Month), the bins with tray stacks by the door, a drink
  station with free refills, a kids' corner with a Gully statue, a kiddie ride and a crayon
  table, and restrooms. The kitchen is in full view behind the counter: the grill and
  hood, the assembly line under heat lamps, fryers with baskets that dip, the order screens.
- **The menu** (lit boards over the counter): Gully Stack, Single Gull, Catch of the Day,
  Harbor Dog, Squawk Strips, Chip Snatchers, Onion Lifebuoys, Seafoam and Sunset shakes,
  the Gull Box (kids' meal + a toy) and the Full Flock meal. Before 11 AM the boards swap to
  the **Sunrise menu** (Early Bird, Dawn Patrol pancakes, Hash Brown Raft, Harbor Coffee...).
- **Ordering**: queue at a register (the second opens when it's busy), press E, pick your
  food, eat here or to go, pay cash or card. You get a number; it goes up on the **NOW
  SERVING** board with a ding when Marco puts your tray on the pass. Take it, find a seat
  (booths, stools or the patio) and eat: every item has its own little line. Bin your tray
  by the door after. Take a tray past the patio and Pip swaps it for a bag; a bag can be
  eaten anywhere (E).
- **Gull Box toys**: six to collect (Captain, Surfer, Astro, Chef, Disco, and the rare
  glow-in-the-dark Ghost). They line up on top of your fridge at home.
- **People**: Jo and Theo on the registers, three cooks, Marco the shift manager on the
  pass, Pip clearing tables, and customers who walk in off the street, queue, wait for
  their number, eat (or take a bag) and mostly bin their own trays. Breakfast, the lunch
  rush, dinner and the after-bars crowd are the busy times. Talk to anyone; ask Marco
  about work.
- **The kiddie ride** (50¢), refills, crayons, the mural, the sinks.
- **Sound**: the in-store radio (bouncy, a bit cheesy, with the "Snatch a bite!" jingle),
  fryer sizzle and extractor hum, fryer timers, the order-up bell.
- **2 AM**: closed. The lights dim, Pip mops and the grill gets scrubbed. Back at 6.

## How the PS2 look works

It's mostly a rendering recipe, not expensive art (see `src/render/ps2pipeline.js`):

1. Render the scene at a low internal resolution (448 lines by default, like the PS2)
   and let the browser scale it up softly.
2. Low‑poly meshes, Gouraud‑style lighting, small hand‑made textures (32–256 px,
   all painted at load time on canvases in `src/render/textures.js`).
3. Heavy distance fog that matches the sky, and fake "light pools" under lamps.
4. A big soft bloom pass (the classic PS2 glow), colour grading and a vignette.
5. Ordered dithering + 5‑bit colour quantisation, a light composite‑video smear and
   optional scanlines.

All of these are switchable in the pause menu (try 240p for a PS1 feel).

## Do you need Blender?

Not to start: everything here is built in code (boxes, cylinders, procedural
textures), which suits the PS2 style well. Blender (free) becomes the best tool when
you want **characters with real rigs and animations, clothing meshes, furniture,
cars and hero buildings**. Export as `.glb` (glTF) and load with three.js's
`GLTFLoader`. Mixamo is handy for animations; free CC0 low‑poly packs (Kenney,
Quaternius) are good placeholders. The code is structured so procedural pieces can
be swapped for models one at a time.

## Code map

```
src/
  main.js                 boot, game loop, interactions (talk, ATM, shops)
  config.js               city layout constants, special blocks, start values
  core/                   seeded RNG + math, merged-geometry builder, input
  render/                 PS2 post pipeline, procedural textures, sky, time-of-day palette
  world/                  city generator, street props, Lantern Quarter, colliders, particles,
                          apartments (doors, markers, interiors), the HALCYON 24 store,
                          the SUBSTATION club (club.js) and the room under it
                          (undercurrent.js), GULLY'S (gullys.js, and the mascot figure in
                          gullyFigure.js)
  world/interior/         room/wall builder, furniture kit, baked lighting, apartment layouts
  actors/                 crowd renderer (instanced puppets, walk/carry/dance/sit poses),
                          appearance model, player + camera, pedestrians AI, traffic,
                          clubbers (the club's staff, queue and crowd), diners (GULLY'S
                          crew, customers, orders and trays)
  game/                   clock + save system, needs (needs.js), NPC dialogue data, the
                          store job, the club's dance game (dance.js), photo booth
                          (photobooth.js), theme nights (clubNights.js), bar job
                          (barJob.js) and DJ set (djSet.js), GULLY'S menu data
                          (gullysMenu.js) and your visit there (gullysVisit.js)
  ui/                     HUD, dialogue box, wardrobe, pause menu, title, touch controls,
                          the city map (map.js; its places and hours are game/places.js,
                          the route beam is world/waypoint.js)
  audio/                  procedural ambience, sound effects and music; clubTrack.js is the
                          club's tempo and arrangement per theme night, shared with the
                          lights (and taken over by a DJ set)
```

Performance notes: static scenery is merged into one mesh per material and every
person is drawn with ~12 instanced meshes total, so a frame is roughly 60–140 draw
calls. It should run well on integrated GPUs and phones.

## Roadmap (suggested order)

The big goal: **lots of cool places to hang out**. Every new space (diner, arcade,
rooftop, karaoke bar, record shop, a 2 AM laundromat, the pier) gets a real walk-in
interior with the same detail, light and sound as the apartments and the store.

1. **GULLY'S crew job**: Marco's "come back when the forms are sorted". Early shifts on the
   fryers, the grill or a register (cook to the ticket screen, call numbers, bag to-go
   orders), entry-level pay plus a free meal, using the store's shift system.
2. **More jobs**: the store system (clock, tasks, slip) generalises to other shops:
   noodle bar cook, courier, office temp. Promotions and raises at the store.
3. **Economy**: rent and bills, a bank screen with transactions, shop inventories.
4. **Clothes shops**: buy items that unlock in the wardrobe; outfits as data.
5. **Furniture**: buy and place furniture in your apartment (the kit already has the
   pieces; this needs a placement mode and saving the layout).
6. **Cars**: enter/exit parked cars, driving model on the same road graph, parking.
7. **NPC lives**: homes, workplaces, daily schedules, memory of conversations, dating.
8. **Art pass**: Blender characters/clothing/furniture as glTF, real animations.
9. **Weather**: rain with wet-street reflections (very PS2), wind, seasonal events.
10. **Online (later later)**: a small Node server (WebSocket, e.g. Colyseus) for shared
    streets, chat and visiting apartments; the bank must move server‑side then.

All names, shops and brands in the game are made up.
