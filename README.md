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
| Mute | M | in the pause menu |

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
- **Customization**: the wardrobe (C) edits skin, hair style/colour, top style
  (tee, long sleeve, jacket over a shirt), colours, bottoms, shoes, height, build.
- **Save**: autosaves to localStorage ("memory card"): position, time, money,
  looks, friendships, settings.
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

- **The door**: a queue behind a velvet rope, Dmitri on the door, a neon sign buzzing over a
  steel canopy, and Ray's fries cart on the curb ($4, open 9 PM to 5 AM). Cover is $20 ($30 on
  Saturdays), cash only; the stamp on your hand lets you come and go until close. From down
  the street you only hear the kick drum; it opens up when the doors swing open.
- **Inside**: a lobby with a coat check (it really takes your jacket off you, $2), gig posters,
  an ATM and a photo booth (out of film for now), a strip curtain into one tall concrete hall:
  an 8x8 LED dance floor under a mirror ball and a lighting truss, a DJ on an old transformer
  housing in front of a giant copper coil, ceramic insulator stacks, speaker stacks whose
  cones pump on the kick, a long backlit bar, red velvet booths, toilets covered in stickers,
  and the VIP stairs (roped off: the balcony is "closed for a refit").
- **The show**: an original synthesised house track at 124 BPM that loops through intro,
  groove, breakdown, build and drop. The lights follow it: washes pulse on the kick, the
  floor runs patterns per section, the mirror ball spots swirl in the breakdown, beams sweep
  through the haze, lasers fan out on the drop and the crowd puts its hands up.
- **People**: up to ~40 clubbers depending on the night (Saturday is packed, Monday isn't),
  who walk in through the lobby, dance, prop up the bar, sit in the booths and leave. Staff:
  bouncer, security, DJ, two bartenders, coat check.
- **4 AM: lights up.** House lights snap on, the music cuts, everyone files out. At 4:30
  security walks you out.
- **Flashing lights** (pause menu): FULL adds strobes, REDUCED (default) keeps beat pulses
  without strobing, OFF keeps everything slow and calm.

How the lights work: on top of the baked lamp light, the club's surfaces have four more
baked light channels (house lights, two stage washes, the LED floor) whose colours are set
every frame from the music, so the whole hall changes colour on the beat with no real-time
lights on the walls. People get the shared pool of real point lights, recoloured the same way.

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
                          the SUBSTATION club (club.js)
  world/interior/         room/wall builder, furniture kit, baked lighting, apartment layouts
  actors/                 crowd renderer (instanced puppets, walk/carry/dance/sit poses),
                          appearance model, player + camera, pedestrians AI, traffic,
                          clubbers (the club's staff, queue and crowd)
  game/                   clock + save system, NPC dialogue data, the store job
  ui/                     HUD, dialogue box, wardrobe, pause menu, title, touch controls
  audio/                  procedural ambience, sound effects and music; clubTrack.js is the
                          club song's arrangement, shared with the lights
```

Performance notes: static scenery is merged into one mesh per material and every
person is drawn with ~12 instanced meshes total, so a frame is roughly 60–120 draw
calls. It should run well on integrated GPUs and phones.

## Roadmap (suggested order)

The big goal: **lots of cool places to hang out**. Every new space (diner, arcade,
rooftop, karaoke bar, record shop, a 2 AM laundromat, the pier) gets a real walk-in
interior with the same detail, light and sound as the apartments and the store.

1. **SUBSTATION phase 2**: a dance rhythm game, a proper drinks menu and buying drinks for
   people, a dress code at the door, the VIP balcony and the roof terrace, a working photo
   booth (keep the strip, hang it at home), club chat for NPCs. **Phase 3**: theme nights,
   regulars, a bartender job, and a door behind the transformer that opens at 3:33 AM.
2. **Needs**: hunger/energy/fun/social bars that the fridge, bed, shower and TV refill.
3. **More jobs**: the store system (clock, tasks, slip) generalises to other shops:
   noodle bar cook, courier, office temp. Promotions and raises at the store.
4. **Economy**: rent and bills, a bank screen with transactions, shop inventories.
5. **Clothes shops**: buy items that unlock in the wardrobe; outfits as data.
6. **Furniture**: buy and place furniture in your apartment (the kit already has the
   pieces; this needs a placement mode and saving the layout).
7. **Cars**: enter/exit parked cars, driving model on the same road graph, parking.
8. **NPC lives**: homes, workplaces, daily schedules, memory of conversations, dating.
9. **Art pass**: Blender characters/clothing/furniture as glTF, real animations.
10. **Weather**: rain with wet-street reflections (very PS2), wind, seasonal events.
11. **Online (later later)**: a small Node server (WebSocket, e.g. Colyseus) for shared
    streets, chat and visiting apartments; the bank must move server‑side then.

All names, shops and brands in the game are made up.
