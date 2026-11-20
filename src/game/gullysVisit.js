import { Rng, clamp } from '../core/rng.js';
import { menuAt, pickToy, TOYS, BREAKFAST_UNTIL, FEED, LUNCH, BREAKFAST } from './gullysMenu.js';

// Your side of GULLY'S: ordering at a register, waiting for your number, taking
// your tray to a seat and eating, Gull Box toys, binning your tray, refills, the
// kiddie ride, the crayon table, and chatting with the crew and the regulars.

const near = (p, q, r) => Math.hypot(p.x - q.x, p.z - q.z) < r;
const cents = (n) => Math.round(n * 100) / 100;

const LINES = {
  Jo: [
    "Welcome to Gully's! Step up whenever you're ready.",
    "The Seafoam Shake is new. It's green. That's all I'm allowed to say.",
    "If a gull gets in, do NOT feed it. Last time one took a whole Full Flock.",
  ],
  Theo: [
    'Register two! I can take you over here!',
    "Three weeks in and I can count change without looking at the screen. Big moment for me.",
    "Pro tip: the Gull Box is the best deal on the menu. You also get a toy. I'm not saying I collect them.",
  ],
  Marco: [
    "Marco, shift manager. Everything okay out there? Fries hot? Good. Good.",
    'Twenty-two minutes on a Stack yesterday. Twenty-two! Never again. Not on my shift.',
    "Gully's started as a fish shack on Pier Road in '87. Same fry recipe. Different fryers, thank god.",
  ],
  Pip: [
    "Leave your tray, I've got it. Or bin it. Either way I love you.",
    'The kiddie ride takes two quarters. Adults ride at their own risk. Mostly to their dignity.',
    'Someone wrote GULLY RULES on the crayon table. It wasn\'t me. It was me.',
  ],
  day: [
    'These fries are a crime and I keep committing it.',
    'Do you have the ghost one? I have four Captains. FOUR.',
    "Sorry, mouth full. It's the Stack. It's always the Stack.",
    "They make the breakfast menu end at eleven so you can never make it. I'm sure of it.",
    'I come here every lunch. My doctor knows. My doctor also comes here.',
    'The Catch of the Day is square. Every day. Same fish, I think.',
  ],
  night: [
    "Only place open that isn't the club or the 24. Bless this gull.",
    'Post-SUBSTATION fries. A sacred ritual. Do not disturb.',
    'Night shift. This is my lunch. It is 1 AM. Life is strange.',
    'I said one Chip Snatchers. I ordered three. I regret nothing.',
  ],
};

const CRAYONS = [
  'You draw Gully riding a whale. Nine out of ten, would frame.',
  "You colour Gully's cap purple. A bold choice. The crayon breaks.",
  'You write your name in orange. It is the only crayon left with a point.',
  'You do the maze on the placemat. The gull gets to the fries. Of course it does.',
  'You draw a little SUBSTATION with a gull outside in sunglasses. Nice.',
];

export class GullysVisit {
  constructor({ gullys, diners, ui, audio, state, clock, player, input, apts, saveNow, needs }) {
    Object.assign(this, { G: gullys, D: diners, ui, audio, state, clock, player, input, apts, saveNow, needs });
    this.rng = new Rng(Date.now() & 0xfff);
    this.order = null; // the order you're waiting on (a diners order)
    this.items = []; // what's in it
    this.tray = null; // what you're carrying: a tray (full/empty) or a bag
    this.food = false; // ...with food in it
    this.seat = null;
    this.meal = null; // eating: { items, t, dur, next, toys }
    this.eating = false; // standing up, out of a bag
    this.riding = 0; // seconds left on the kiddie ride
    this.cup = false; // you've got a cup: free refills
    this.serving = -1; // the register you're ordering at
    this.talking = null;
    this.fryerT = 8;
    this.kickT = 0;
    diners.onCall = (o) => this.called(o);
    diners.playerChar = player.char;
  }

  // ==========================================================================
  /** What E does around GULLY'S (or null). */
  find() {
    const p = this.player.pos;
    const G = this.G;
    const D = this.D;
    if (this.riding > 0) return { label: 'Get off the ride', act: () => this.endRide() };
    if (this.seat) return { label: this.meal ? 'Stand up (take your food)' : 'Stand up', act: () => this.standUp() };
    if (this.eating) return null;
    const inside = G.contains(p, 0.2);
    const patio = G.onPatio(p);
    if (!inside && !patio) {
      if (!G.open && near(p, G.doorOut, 1.6)) return { label: "GULLY'S", act: () => this.ui.toast('Closed. The sign says BACK AT 6 AM. Somewhere inside, a mop squeaks.') };
      return null;
    }
    const t = this.tray;
    if (t && this.food) {
      const sp = this.seatNear(p);
      if (sp) return { label: 'Sit down and eat', act: () => this.sit(sp) };
    }
    if (t && t.kind === 'empty' && G.binSpots.some((b) => near(p, b, 1.0))) return { label: 'Empty your tray', act: () => this.binTray() };
    const o = this.order;
    if (o && o.state === 'ready' && near(p, G.pickSlots[o.slot].stand, 1.1)) return { label: `Take your ${o.toGo ? 'bag' : 'tray'} (#${o.num})`, act: () => this.takeOrder() };
    if (inside) {
      for (let r = 0; r < 2; r++) {
        if (!near(p, G.queues[r][0], 0.8)) continue;
        if (!G.open) return null;
        if (!D.registerOpen(r)) return { label: 'Register 2 (closed)', act: () => this.ui.toast('"I can take you over here!" Register 1 is open.') };
        if (D.ordering(r)) return { label: 'Wait your turn', act: () => this.ui.toast("Someone's ordering. You wait, like a civilised gull.") };
        if (o) return { label: `Your order: #${o.num}`, act: () => this.ui.toast(`You're #${o.num}. "Coming right up, keep an eye on the board!"`) };
        if (t) return { label: 'Order (hands full)', act: () => this.ui.toast('Your hands are full. Put that down first.') };
        return { label: `Order at register ${r + 1}`, act: () => this.openOrder(r) };
      }
      if (near(p, G.drinkSpot, 1.1)) return { label: this.cup ? 'Refill your drink' : 'Drink station', act: () => this.drinkStation() };
      if (near(p, G.rideStand, 0.9)) return { label: 'Ride Gully (50¢)', act: () => this.startRide() };
      if (near(p, G.crayonSpot, 0.9))
        return {
          label: 'Colour in a placemat',
          act: () => {
            this.needs.add('fun', 4);
            this.ui.toast(this.rng.pick(CRAYONS));
          },
        };
      if (G.sinkSpots.some((q) => near(p, q, 0.8)))
        return {
          label: 'Wash your hands',
          act: () => {
            this.needs.add('hygiene', 5);
            this.ui.toast(
              this.needs.get('hygiene') < 30
                ? "You wash your hands, then your face, then your neck. It's a start. A shower would be better."
                : 'You wash your hands. The dryer roars like a jet engine for eleven seconds.',
            );
          },
        };
      if (near(p, G.muralLook, 1.5))
        return {
          label: 'Look at the mural',
          act: () => {
            this.needs.add('fun', 2);
            this.ui.toast("Pier Road, 1987: the first Gully's, a fish shack. Gulls everywhere. One wears a tiny sailor cap.");
          },
        };
    }
    // talk or sit: whichever is nearer
    const a = D.nearest(p, 1.5);
    const sp = t ? null : this.seatNear(p);
    const da = a ? Math.hypot(a.c.x - p.x, a.c.z - p.z) - (a.role === 'cashier' || a.role === 'manager' ? 0.7 : 0) : Infinity;
    const ds = sp ? Math.hypot(sp.x - p.x, sp.z - p.z) : Infinity;
    if (a && da <= ds) return { label: `Talk to ${a.name ?? 'customer'}`, act: () => this.talk(a) };
    if (sp) return { label: 'Sit down', act: () => this.sit(sp) };
    return null;
  }

  /** Things you can do anywhere (eat out of a to-go bag). */
  anywhere() {
    if (this.tray?.kind === 'bag' && this.food && !this.eating && !this.seat) return { label: 'Eat from the bag', act: () => this.eatStanding() };
    return null;
  }

  seatNear(p) {
    let best = null;
    let bd = 1.15;
    for (const sp of this.D.freeSeats()) {
      if (Math.abs(sp.y - p.y) > 0.6) continue;
      const d = Math.min(Math.hypot(sp.x - p.x, sp.z - p.z), sp.out ? Math.hypot(sp.out.x - p.x, sp.out.z - p.z) + 0.3 : Infinity);
      if (d < bd) {
        bd = d;
        best = sp;
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- ordering
  openOrder(r) {
    const hour = this.clock.hour;
    const menu = menuAt(hour);
    const breakfast = hour >= 6 && hour < BREAKFAST_UNTIL;
    this.serving = r;
    this.player.locked = true;
    const cashier = this.D.cashiers[r];
    this.ui.openOrder({
      title: `GULLY'S · REGISTER ${r + 1}`,
      sub: breakfast ? 'SUNRISE MENU · until 11 AM' : 'ALL DAY MENU',
      greet: `${cashier.name}: "${this.rng.pick((this.statusTier?.() ?? 0) >= 5 ? ["Oh, fancy! Slumming it with us today?", "Wow. Nice watch. Er, what can I get you?", "Are you famous? You look famous. What can I get you?"] : ['Welcome to Gully\'s! What can I get you?', 'Hi! What are we having today?', 'Snatch a bite! What\'ll it be?'])}"`,
      menu,
      cash: this.state.cash,
      bank: this.state.bank,
      onPay: (sel) => this.pay(sel, cashier),
      onClose: () => {
        this.serving = -1;
        this.player.locked = false;
      },
    });
  }

  /** sel: { lines: [{ item, qty }], toGo, method }. Returns an error to show, or null. */
  pay(sel, cashier) {
    const st = this.state;
    const total = cents(sel.lines.reduce((s, l) => s + l.item.price * l.qty, 0));
    if (!total) return 'Pick something first.';
    if (sel.method === 'cash') {
      if (st.cash < total) return "You don't have enough cash.";
      st.cash = cents(st.cash - total);
      this.audio.coin();
    } else {
      if (st.bank < total) return 'Card declined. Ouch.';
      st.bank = cents(st.bank - total);
      st.ledger?.push({ t: Math.round(this.clock.minutes), what: "GULLY'S", amt: -total });
      this.audio.tone(1800, 'sine', 0.04, 0.15);
    }
    const items = sel.lines.flatMap((l) => Array(l.qty).fill(l.item));
    const o = this.D.placeOrder('player', sel.toGo, clamp(8 + items.length * 1.5, 9, 20));
    this.order = o;
    this.items = items;
    if (items.some((i) => i.drink || i.id.startsWith('flock'))) this.cup = true;
    st.gullOrders = (st.gullOrders ?? 0) + 1;
    setTimeout(() => {
      this.ui.toast(`${cashier.name}: "Number ${o.num}! ${sel.toGo ? "It'll be in a bag at pick up." : "Grab a seat if you like, we'll call it."}"`);
      this.ui.hint(`You're <b>#${o.num}</b>. Watch the <b>NOW SERVING</b> board by PICK UP.`, 9);
    }, 200);
    return null;
  }

  called(o) {
    const p = this.player.pos;
    const here = this.G.contains(p, 2) || this.G.onPatio(p);
    if (o.owner === 'player') {
      this.audio.ding?.(0.09);
      this.ui.toast(`"Number ${o.num}!" That's you. It's up at PICK UP.`);
      this.ui.hint(`<b>#${o.num}</b> is ready: take your ${o.toGo ? 'bag' : 'tray'} from the PICK UP counter.`, 10);
    } else if (here) this.audio.ding?.(0.035);
  }

  takeOrder() {
    const o = this.order;
    this.tray = this.D.collect(o, this.player.char);
    this.food = true;
    this.order = null;
    this.ui.clearHint();
    this.ui.toast(o.toGo ? 'Warm paper bag, already a bit see-through. Perfect.' : 'Hot tray. The fries are already shifting.');
    this.ui.hint(o.toGo ? 'Eat it anywhere: find a seat, or press <b>E</b> outside.' : 'Find a seat to eat: a booth, a stool, or out on the patio.', 7);
  }

  // ---------------------------------------------------------------- sitting and eating
  sit(sp) {
    this.seat = sp;
    this.D.taken.add(sp);
    this.player.locked = true;
    if (this.tray && this.food) {
      this.D.onTable(this.tray, sp);
      this.startMeal();
    } else if (this.tray) this.D.onTable(this.tray, sp);
  }

  standUp() {
    const sp = this.seat;
    this.seat = null;
    this.D.taken.delete(sp);
    const c = this.player.char;
    c.sit = false;
    c.eat = 0;
    this.player.locked = false;
    this.player.pos.x = sp.out.x;
    this.player.pos.z = sp.out.z;
    if (this.meal) {
      this.meal.paused = true;
      this.ui.toast('You take your food with you.');
    }
    if (this.tray) this.D.carry(this.tray, c);
    if (this.tray?.kind === 'empty') this.ui.hint('Bin your tray on the way out: the bins are by the door.', 6);
  }

  startMeal() {
    if (this.meal) {
      this.meal.paused = false;
      return;
    }
    const items = this.items.length ? this.items : [];
    // what the whole meal does for your needs; it goes in bite by bite
    const feed = {};
    for (const it of items) for (const [k, n] of Object.entries(FEED[it.id] ?? { hunger: 10 })) feed[k] = (feed[k] ?? 0) + n;
    this.meal = { items, t: 0, dur: clamp(8 + items.length * 3, 10, 24), next: 0, line: 0, toys: items.filter((i) => i.toy).length, feed, fed: 0 };
  }

  eatStanding() {
    this.eating = true;
    this.player.locked = true;
    this.startMeal();
    this.meal.standing = true;
  }

  updateMeal(dt) {
    const m = this.meal;
    if (!m || m.paused) return;
    m.t += dt;
    const done = Math.min(1, m.t / m.dur);
    for (const [k, n] of Object.entries(m.feed)) this.needs.add(k, n * (done - m.fed));
    m.fed = done;
    const lines = m.items.filter((it, i, all) => all.indexOf(it) === i);
    if (m.line < lines.length && m.t >= m.next) {
      this.ui.toast(lines[m.line].eat);
      m.line++;
      m.next = m.t + Math.max(3, (m.dur - 2) / Math.max(1, lines.length));
    }
    if (m.t < m.dur) return;
    // done
    this.meal = null;
    this.food = false;
    this.state.gullMeals = (this.state.gullMeals ?? 0) + 1;
    this.state.lastMeal = this.clock.minutes;
    const t = this.tray;
    if (t?.kind === 'bag') {
      this.D.drop(t);
      this.tray = null;
    } else if (t) t.kind = 'empty';
    if (m.standing) {
      this.eating = false;
      this.player.locked = false;
      this.player.char.eat = 0;
    }
    let delay = 0;
    for (let k = 0; k < m.toys; k++) setTimeout(() => this.giveToy(), (delay += 2600));
    setTimeout(() => this.ui.toast(this.rng.pick(['Full. Properly full.', 'That hit the spot.', 'You are now 40% fries.', 'Done. You feel like a well-fed gull.'])), (delay += 2600));
    this.saveNow();
  }

  giveToy() {
    const toy = pickToy(this.rng);
    const st = this.state;
    st.gullToys = st.gullToys ?? [];
    const isNew = !st.gullToys.includes(toy.id);
    if (isNew) st.gullToys = [...st.gullToys, toy.id];
    this.needs.add('fun', isNew ? 10 : 3);
    const n = st.gullToys.length;
    this.apts.setToys(st.gullToys);
    this.audio.blip(true);
    if (isNew && n === TOYS.length) this.ui.toast(`GULL BOX: ${toy.name}! That's the whole flock: all ${TOYS.length} Gullys are on your fridge.`);
    else this.ui.toast(isNew ? `GULL BOX: ${toy.name}! New one (${n}/${TOYS.length}). It's going on top of your fridge.` : `GULL BOX: ${toy.name}. You've got that one. (${n}/${TOYS.length})`);
    this.saveNow();
  }

  binTray() {
    this.D.drop(this.tray);
    this.tray = null;
    this.audio.noiseHit?.(0.06, 900, 0.2);
    this.ui.toast(this.rng.pick(['The bin flap says THANK YOU. You feel thanked.', 'Tray on the stack, rubbish in the bin. Model citizen.', 'Pip gives you a thumbs up from across the room.']));
  }

  // ---------------------------------------------------------------- little things
  drinkStation() {
    if (!this.cup) return this.ui.toast('Free refills, but you need a cup. Cups come with a drink.');
    this.audio.noiseHit?.(0.05, 1400, 0.7);
    this.needs.give({ hunger: 2, energy: 4 });
    this.ui.toast(this.rng.pick(['Refill. Mostly ice. Some drink. Perfect ratio.', 'You mix three sodas together like a kid. Nobody stops you.', 'Fizz all the way up to the lid. Then over it.']));
  }

  startRide() {
    if (this.state.cash < 0.5) return this.ui.toast('Two quarters. You check your pockets: nothing.');
    this.state.cash = cents(this.state.cash - 0.5);
    this.audio.coin();
    this.riding = 14;
    this.needs.add('fun', 12);
    this.player.locked = true;
    this.audio.jingle?.();
    this.jingleT = 3.2;
    this.ui.toast('Clunk. Gully lurches into motion. A kid watches you with deep respect.');
  }

  endRide() {
    this.riding = 0;
    this.player.locked = false;
    const c = this.player.char;
    c.sit = false;
    this.player.pos.x = this.G.rideStand.x;
    this.player.pos.z = this.G.rideStand.z;
    this.player.pos.y = this.G.origin.y;
  }

  talk(a) {
    const night = this.clock.hour >= 21 || this.clock.hour < 4;
    const lines = a.name ? LINES[a.name] : night ? LINES.night : LINES.day;
    this.talking = a;
    this.needs.chat(`gullys:${a.name ?? a.k}`, this.clock.minutes, 8);
    this.player.locked = true;
    const close = () => this.ui.closeDialog();
    const choices = [];
    // Marco hires you and runs your shifts (see crewJob.js)
    if (a.name === 'Marco' && this.crew) choices.push(...this.crew.marcoChoices(() => this.endTalk()));
    choices.push({ label: this.crew?.onShift && a.role ? 'Back to work' : 'Bye', fn: close });
    const text = a.name === 'Marco' && this.crew?.onShift ? this.crew.marcoLine() : this.rng.pick(lines);
    this.ui.openDialog({ name: a.name ?? 'Customer', text, choices, onClose: () => this.endTalk() });
  }

  /** Marco's crew meal after a shift: it goes on the screen like any other order. */
  crewMeal(ids, toGo) {
    if (this.order || this.tray) return this.ui.toast('Your hands are already full. Marco shrugs: "Next time, then."');
    const items = ids.map((id) => [...LUNCH, ...BREAKFAST].find((m) => m.id === id)).filter(Boolean);
    const o = this.D.placeOrder('player', toGo, 7, ids);
    this.order = o;
    this.items = items;
    if (items.some((i) => i.drink)) this.cup = true;
    this.ui.toast(`Marco punches it in himself. "Number ${o.num}. On the house. You earned it."`);
  }

  endTalk() {
    this.talking = null;
    this.player.locked = !!(this.seat || this.riding || this.eating);
  }

  /** Stop sitting/riding/eating right now (warps, cutscenes). */
  interrupt() {
    if (this.riding) this.endRide();
    if (this.seat) this.standUp();
    if (this.eating) {
      this.eating = false;
      this.player.locked = false;
      if (this.meal) this.meal.paused = true;
    }
  }

  // ==========================================================================
  /** inside: the player is in the building. */
  update(dt, inside) {
    const p = this.player.pos;
    const c = this.player.char;
    const G = this.G;
    const D = this.D;
    // you're first in line if you're standing at a register
    for (let r = 0; r < 2; r++) D.hold[r] = inside && G.open && (this.serving === r || (near(p, G.queues[r][0], 0.7) && !this.tray));

    if (this.seat) {
      const sp = this.seat;
      p.set(sp.x, sp.y, sp.z);
      this.player.yaw = sp.yaw;
      c.x = sp.x;
      c.z = sp.z;
      c.yaw = sp.yaw;
      c.sit = true;
      c.ground = sp.y;
      c.y = sp.y + 0.5 - 0.86 * this.state.appearance.height;
      c.amount = 0;
      c.eat = this.meal && !this.meal.paused ? 1 : 0;
      const mv = this.input.move();
      if (!this.ui.modal && Math.hypot(mv.x, mv.y) > 0.6) this.standUp();
    } else if (this.eating) {
      c.eat = 1;
      c.amount = 0;
      const mv = this.input.move();
      if (!this.ui.modal && Math.hypot(mv.x, mv.y) > 0.6) this.interrupt();
    }
    this.updateMeal(dt);

    if (this.riding > 0) {
      this.riding -= dt;
      const bob = G.ride.position.y - (G.origin.y + 0.22);
      p.set(G.rideSpot.x - 0.05, G.origin.y, G.rideSpot.z + 0.05);
      this.player.yaw = 0;
      c.x = p.x;
      c.z = p.z;
      c.yaw = 0;
      c.sit = true;
      c.ground = G.origin.y;
      c.y = G.origin.y + 0.86 + bob - 0.86 * this.state.appearance.height;
      c.amount = 0;
      if ((this.jingleT -= dt) <= 0 && this.riding > 3) {
        this.jingleT = 3.4;
        this.audio.jingle?.();
      }
      if (this.riding <= 0) {
        this.endRide();
        this.ui.toast('The ride wheezes to a stop. Worth every cent of the fifty.');
      }
    }

    // trays don't leave the building
    const onSite = G.contains(p, 0.5) || G.onPatio(p);
    if (this.tray && !onSite && this.tray.kind !== 'bag') {
      if (this.food) {
        this.tray.kind = 'bag';
        c.tray = false;
        this.ui.toast('Pip catches you at the edge of the patio and swaps your tray for a to-go bag. Smooth.');
      } else {
        this.D.drop(this.tray);
        this.tray = null;
        this.ui.toast('You leave the empty tray on a planter. Somewhere, Pip sighs.');
      }
    }
    // an order you walked away from
    if (this.order && Math.hypot(p.x - G.doorCenter.x, p.z - G.doorCenter.z) > 90) {
      this.ui.toast(`You walked off and left order #${this.order.num} on the counter. Some lucky gull is eating well tonight.`);
      this.D.cancel(this.order);
      this.order = null;
      this.items = [];
    }
    if (!onSite && this.cup && !this.tray) this.cup = false;

    // the fryers beep for the cooks
    if (inside && G.open && (this.fryerT -= dt) <= 0) {
      this.fryerT = this.rng.float(9, 24);
      this.audio.fryer?.();
    }
  }
}

