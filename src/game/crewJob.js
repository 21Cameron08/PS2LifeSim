import * as THREE from 'three';
import { Rng } from '../core/rng.js';
import { BRAND, LUNCH, BREAKFAST, TOYS, menuAt, sayItems } from './gullysMenu.js';
import { KitchenScreen } from '../render/gullysTextures.js';

// Crew member at GULLY'S. Marco (the shift manager) hires you; you work any time
// the place is open between 6 AM and 11 PM, while Jo takes register 1 and Marco
// runs the pass:
//  - register 2 is yours: customers say what they want (and sometimes change their
//    mind halfway), you punch it into the screen and send it to the kitchen. Get it
//    wrong and they bring it back. Leave them standing and Jo waves them over.
//  - the fryer: drop a basket, lift it when the timer beeps (before it burns), and
//    the portions go in the fry bin
//  - the grill: lay down patties, flip them when it beeps, pull them when they're
//    done; they go in the grill bin
//  - Marco only puts orders up when the bins have what the ticket needs, so an
//    empty bin holds up the whole line (the screens over the line show it all)
//  - to-go orders come up on the pass for you to bag and call
//  - $9.50 an hour (entry level), paid to your bank with a slip, plus a crew meal
//
// Getting on: after five good shifts Marco puts you up for shift manager ($13.50,
// a bonus on every order, and the complaints come to you: walk over to the "!").
// Ten shifts as manager and Gully HQ offers you the franchise. Then it's yours:
// the week's profit on Mondays, a special of the week, the toy of the week.

export const CREW_WAGE = 950; // cents per game hour
export const MANAGER_WAGE = 1350;
export const FRANCHISE_PRICE = 150000;
const PROMOTE_AFTER = 5; // good shifts as crew
const FRANCHISE_AFTER = 10; // shifts as manager
export const SPECIALS = [
  { id: 'none', name: 'No special', sales: 1, cost: 0, spread: 0.12, blurb: 'Just the menu. Steady.' },
  { id: 'twofer', name: 'Two-for-Tuesday Gull Stacks', sales: 1.2, cost: 0.07, spread: 0.3, blurb: 'Packs the place. Thin margins. Could go either way.' },
  { id: 'breakfast', name: 'Breakfast all day', sales: 1.08, cost: 0.015, spread: 0.15, blurb: 'Early Birds at midnight. People love it a bit more than is healthy.' },
  { id: 'family', name: 'Family Feast Fridays', sales: 1.12, cost: 0.035, spread: 0.2, blurb: 'Four meals, four Gull Boxes, one price. Loud Fridays.' },
];
const COMPLAINTS = [
  { text: 'These fries are cold. Cold! I could hear them crying.', best: 'remake', ok: 'refund' },
  { text: "I asked for no pickles. There are pickles. There are so many pickles.", best: 'remake', ok: 'refund' },
  { text: "We waited twenty minutes and the kids are melting down. Look at them. LOOK at them.", best: 'toy', ok: 'refund' },
  { text: "There's a hair in my burger. It's not my hair. I'd know my hair.", best: 'refund', ok: 'remake' },
  { text: 'My son got Captain Gully again. He has four. FOUR. He wants the ghost one.', best: 'toy', ok: 'remake' },
  { text: "The shake machine is 'broken' again? It's always broken. Is it ever not broken?", best: 'refund', ok: 'toy' },
];
const FRY_TIME = 14; // seconds a basket takes
const FRY_GRACE = 10; // seconds to lift it before it burns
const SIDE_TIME = 9; // seconds a side on the grill
const GRILL_GRACE = 9; // to flip or pull before it burns
const BIN = { fry: 16, grill: 12 };
const PER_BASKET = 4;
const PER_LOAD = 8;
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'Q', 'W', 'R', 'T'];
const ALL = [...LUNCH, ...BREAKFAST];

const MARCO_LINES = [
  "Fries don't wait for anyone. Neither do I. Well, I do. But I sigh.",
  "If the screen goes red, that's me getting older.",
  "Read the ticket back to them. Saves a remake. Saves my blood pressure.",
  'Hands washed? Good. Wash them again. Nobody ever got fired for clean hands.',
  "Twenty-two minutes on a Stack. Never again. Keep that grill moving.",
  "To-go bags get folded twice. Twice! We're not animals.",
];

const money = (c) => `${c < 0 ? '-' : ''}$${(Math.abs(c) / 100).toFixed(2)}`;
const near = (p, q, r) => Math.hypot(p.x - q.x, p.z - q.z) < r;

export class CrewJob {
  constructor({ gullys, diners, visit, ui, audio, state, clock, player, crowd, needs }) {
    Object.assign(this, { G: gullys, D: diners, visit, ui, audio, state, clock, player, crowd, needs });
    this.rng = new Rng(Date.now() & 0xfff);
    state.crewJob ??= { hired: false, shift: null, earned: 0, shifts: 0 };
    this.J = state.crewJob;
    this.J.rank ??= 'crew'; // 'crew' | 'manager'
    this.J.good ??= 0; // good shifts as crew (towards the promotion)
    this.J.mgrShifts ??= 0;
    this.J.owner ??= false; // you bought the franchise
    this.complaint = null;
    this.compMark = this.makeMark();
    gullys.group.add(this.compMark);
    if (this.J.shift) this.J.shift = null; // a saved shift from last time: start fresh
    this.work = null;
    this.K = null; // the kitchen while you're on: { baskets, grill }
    this.kds = new KitchenScreen();
    this.kdsT = 0;
    this.shoutT = 0;
    this.blocked = () => false; // set by main: another job's shift is running
    diners.menuFn = () => menuAt(this.clock.hour);
    diners.onCrew = (ev, a, o) => this.crewEvent(ev, a, o);
  }

  get onShift() {
    return !!this.J.shift;
  }

  get manager() {
    return this.J.rank === 'manager' || this.J.owner;
  }

  wage() {
    return this.manager ? MANAGER_WAGE : CREW_WAGE;
  }

  /** The "!" over a customer with a complaint. */
  makeMark() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#ff8a2a';
    g.beginPath();
    g.arc(32, 32, 28, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
    g.font = 'bold 44px "Arial Black", Impact, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('!', 32, 35);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, fog: false }));
    s.scale.set(0.45, 0.45, 0.45);
    s.renderOrder = 9;
    s.visible = false;
    return s;
  }

  breakfast() {
    const h = this.clock.hour;
    return h >= 6 && h < 11;
  }

  // ---------------------------------------------------------------- Marco
  /** Extra things to say to Marco (added to his dialog in gullysVisit). */
  marcoChoices(done) {
    const ui = this.ui;
    const say = (text, choices) => ui.openDialog({ name: 'Marco', text, choices: choices ?? [{ label: 'Okay', fn: () => ui.closeDialog() }], onClose: done });
    const out = [];
    if (!this.J.hired) {
      out.push({
        label: 'Are you hiring?',
        fn: () =>
          say(
            "Always. Crew member: register two, the fryer, the grill, bagging the to-go orders. $9.50 an hour to start, and a free meal every shift. Shifts start whenever we're open, six in the morning till eleven at night. You'll smell like Chip Snatchers forever. Interested?",
            [
              {
                label: 'Sign me up',
                fn: () => {
                  this.J.hired = true;
                  this.audio.coin();
                  this.visit.saveNow?.();
                  say("Welcome to the flock. Here's your cap. Come find me at the pass when you want to start a shift. And wash your hands. Always wash your hands.");
                },
              },
              { label: 'Maybe later', fn: () => ui.closeDialog() },
            ],
          ),
      });
      return out;
    }
    if (!this.onShift && this.J.rank === 'crew' && this.J.good >= PROMOTE_AFTER)
      out.push({
        label: 'You wanted a word?',
        fn: () =>
          say(
            "I did. You've been good. Really good. I'm putting you up for shift manager. $13.50 an hour, a bonus on every order that goes out on your shift, and the complaints come to you. All of them. Also: a tie. Clip-on. Yes?",
            [
              {
                label: 'Take the job',
                fn: () => {
                  this.J.rank = 'manager';
                  this.audio.coin();
                  this.visit.saveNow?.();
                  say("Welcome to management. When someone waves you over, that's you now. Smile. Refund, remake or a free toy: pick right and the bonus goes up.");
                },
              },
              { label: 'Not yet', fn: () => ui.closeDialog() },
            ],
          ),
      });
    if (!this.onShift && this.J.rank === 'manager' && !this.J.owner && this.J.mgrShifts >= FRANCHISE_AFTER)
      out.push({
        label: 'HQ called?',
        fn: () =>
          say(
            `They did. They want to sell this place. To someone who knows it. That's you. $${FRANCHISE_PRICE.toLocaleString('en-US')} for GULLY'S Greenway: the building, the name, the fryers, me. The week's profit is yours every Monday. Run a special, pick the toy of the week. I'll still run the pass.`,
            [
              {
                label: `Buy the franchise ($${FRANCHISE_PRICE.toLocaleString('en-US')})`,
                fn: () => {
                  if (this.state.bank < FRANCHISE_PRICE) return say(`HQ wants it from your bank account, and you're $${Math.ceil(FRANCHISE_PRICE - this.state.bank).toLocaleString('en-US')} short. Keep saving. I'll tell them to wait.`);
                  this.state.bank -= FRANCHISE_PRICE;
                  this.state.ledger?.push({ t: Math.round(this.clock.minutes), what: "GULLY'S franchise", amt: -FRANCHISE_PRICE });
                  this.J.owner = true;
                  this.state.franchise = { since: this.clock.minutes, special: 'none', toy: null, last: null };
                  this.audio.coin();
                  this.needs.give({ fun: 25 });
                  this.visit.saveNow?.();
                  this.onOwner?.();
                  say("It's done. Congratulations, boss. HQ is sending a plaque. Jo is already practising saying 'boss'. You'll get the week's profit every Monday.");
                },
              },
              { label: 'Let me think about it', fn: () => ui.closeDialog() },
            ],
          ),
      });
    if (this.J.owner) out.push(...this.ownerChoices(say, done));
    if (!this.onShift) {
      out.push({ label: 'Start a shift', fn: () => (ui.closeDialog(), this.clockIn()) });
      out.push({
        label: 'How does it work again?',
        fn: () =>
          say(
            "Register two: they tell you what they want, you punch it in, check eat here or to go, send it. The fryer: drop a basket, lift it on the beep. The grill: patties down, flip on the beep, pull on the next one. I don't put an order up till the bins have what's on the ticket, so keep them full. To-go orders come up on the pass for you to bag. Easy. It's not easy.",
          ),
      });
      return out;
    }
    out.push({ label: 'How am I doing?', fn: () => say(this.verdict(false)) });
    out.push({ label: 'End my shift', fn: () => (ui.closeDialog(), this.clockOut()) });
    return out;
  }

  marcoLine() {
    if (this.onShift && this.D.shift?.short) return `I'm holding tickets for ${this.D.shift.short === 'fry' ? 'FRIES' : 'the GRILL'}! Go, go, go!`;
    return this.rng.pick(MARCO_LINES);
  }

  // ---------------------------------------------------------------- the shift
  clockIn() {
    if (this.blocked()) return this.ui.toast('Marco: "You\'re on the clock somewhere else. One job at a time, hero."');
    if (!this.G.open) return this.ui.toast("We're closed. Doors open at six.");
    const h = this.clock.hour;
    if (h >= 23 || h < 6) return this.ui.toast('Marco: "Night crew\'s covered. Come back for an early one, we open at six."');
    if (this.visit.tray || this.visit.order) return this.ui.toast('Marco: "Finish your food first. I\'m not a monster."');
    this.J.shift = { start: this.clock.minutes, rung: 0, wrong: 0, lost: 0, baskets: 0, loads: 0, burnt: 0, bagged: 0, docked: 0, late: 0, notes: [], bonus: 0, handled: 0, upset: 0 };
    this.compT = this.rng.float(40, 80);
    this.complaint = null;
    this.D.shift = { stock: { fry: 6, grill: 4 }, short: null };
    this.K = { baskets: [0, 1, 2].map(() => ({ s: 'up', t: 0 })), grill: { s: 'off', t: 0 } };
    this.G.crewKitchen = { baskets: [false, false, false], grill: 'off' };
    this.G.kitchenMat.map = this.kds.tex;
    this.G.kitchenMat.needsUpdate = true;
    this.kds.key = null;
    this.shortT = 0;
    this.wearUniform(true);
    this.audio.punch?.();
    this.ui.toast(this.manager ? `Marco: "${this.J.owner ? 'Boss' : 'Manager'} on the floor! Register two, the fryer, the grill, and any complaints. Go!"` : 'Marco: "Cap on, hands washed. Register two is yours, and the fryer and the grill. Jo\'s on one, I\'m on the pass. Go!"');
    this.ui.hint('The <b>staff gate</b> at the left end of the counter is open. Keep the <b>fry</b> and <b>grill</b> bins stocked and take orders at <b>register 2</b>. The screens over the line show the tickets.', 12);
  }

  /** reason: null (you asked), 'walked', 'closed', 'passout' */
  clockOut(reason = null) {
    const s = this.J.shift;
    if (!s) return;
    if (reason === 'walked') this.dock(500, 'walked off mid-shift');
    const mins = Math.max(0, this.clock.minutes - s.start);
    const rate = this.wage();
    const wage = Math.floor((mins / 60) * rate);
    // managers get a bonus on what went out on their shift
    if (this.manager) s.bonus += s.rung * 40 + s.bagged * 25;
    const bonus = this.manager ? Math.max(0, s.bonus) : 0;
    const total = Math.max(0, wage + bonus - s.docked);
    this.clearComplaint();
    const good = !reason && mins >= 60 && s.wrong <= 3 && s.burnt <= 2 && s.lost <= 3;
    if (this.J.rank === 'crew' && good) this.J.good++;
    if (this.manager && !reason && mins >= 60) this.J.mgrShifts++;
    this.state.bank += total / 100;
    this.state.ledger?.push({ t: Math.round(this.clock.minutes), what: "GULLY'S wages", amt: total / 100 });
    this.J.earned += total;
    this.J.shifts++;
    this.J.shift = null;
    if (this.work) {
      this.work = null;
      this.player.locked = false;
      this.player.char.work = false;
    }
    if (this.ui.modal === 'pos') this.ui.closePos();
    this.D.endShift();
    this.K = null;
    this.G.crewKitchen = null;
    this.G.kitchenMat.map = this.G.gt.kitchen;
    this.G.kitchenMat.needsUpdate = true;
    this.wearUniform(false);
    this.audio.punch?.();
    this.ui.setShift(null);
    if (reason === 'passout') return;
    const line = (a, b) => `${a.padEnd(18, '.')} ${b}`;
    const text = [
      line('Time worked', `${Math.floor(mins / 60)}h ${String(Math.floor(mins % 60)).padStart(2, '0')}m`),
      line(`Wage @ ${money(rate)}/hr`, money(wage)),
      ...(this.manager ? [line('Manager bonus', money(bonus)), line('Complaints', `${s.handled} sorted, ${s.upset} walked`)] : []),
      line('Orders rung up', String(s.rung)),
      line('Wrong orders', String(s.wrong)),
      line('Sent to Jo', String(s.lost)),
      line('Baskets / grills', `${s.baskets} / ${s.loads}`),
      line('Burnt', String(s.burnt)),
      line('To-go bagged', String(s.bagged)),
      line('Docked', money(-s.docked)),
      ...s.notes.slice(-4).map((n) => `  - ${n}`),
      line('Paid to bank', money(total)),
      '',
      this.verdict(true, reason, mins),
      ...(this.J.rank === 'crew' && this.J.good >= PROMOTE_AFTER ? ['', 'Marco: "Come and see me before you go. I want a word."'] : []),
      ...(this.J.rank === 'manager' && !this.J.owner && this.J.mgrShifts >= FRANCHISE_AFTER ? ['', 'Marco: "HQ called about you. Come and talk to me."'] : []),
    ].join('\n');
    const meal = mins >= 60 && reason !== 'walked' && this.G.open;
    this.player.locked = true;
    this.ui.openDialog({
      name: "GULLY'S · PAY SLIP",
      text,
      mono: true,
      choices: [{ label: 'Pocket the slip', fn: () => (meal ? this.offerMeal() : this.ui.closeDialog()) }],
      onClose: () => (this.player.locked = false),
    });
  }

  verdict(final, reason = null, mins = 0) {
    const s = this.J.shift ?? {};
    if (reason === 'walked') return 'You walked out mid-shift. Marco will remember this.';
    if (reason === 'closed') return 'Marco: "Two o\'clock, lights down. Go home, you smell like a fryer."';
    if (final && mins < 60) return 'Marco: "That was a coffee break, not a shift."';
    if ((s.wrong ?? 0) > 3) return 'Marco: "Read the ticket back to them. Every time."';
    if ((s.burnt ?? 0) > 2) return 'Marco: "Less charcoal, more food. Listen for the beep."';
    if ((s.lost ?? 0) > 3) return 'Marco: "Jo did half your register. Don\'t leave them standing."';
    if ((s.rung ?? 0) >= 10) return 'Marco: "Look at you. Crew of the month material. Don\'t tell Jo I said that."';
    return final ? 'Marco: "Solid. Same time tomorrow?"' : 'Marco: "Not bad. Keep the bins full and the line moves."';
  }

  /** The crew meal after a real shift. */
  offerMeal() {
    const am = this.breakfast();
    const ids = am ? ['earlybird', 'raft', 'coffee'] : ['single', 'fries', 'soda'];
    const what = sayItems(ids, ALL);
    this.ui.openDialog({
      name: 'Marco',
      text: `Crew meal's on me. ${what[0].toUpperCase()}${what.slice(1)}?`,
      choices: [
        { label: 'Eat here', fn: () => (this.ui.closeDialog(), this.visit.crewMeal(ids, false)) },
        { label: 'To go', fn: () => (this.ui.closeDialog(), this.visit.crewMeal(ids, true)) },
        { label: "I'm good, thanks", fn: () => this.ui.closeDialog() },
      ],
      onClose: () => (this.player.locked = false),
    });
  }

  dock(cents, why, toast = false) {
    const s = this.J.shift;
    if (!s) return;
    s.docked += cents;
    s.notes.push(`${why} (${money(-cents)})`);
    if (toast) this.ui.toast(`Docked ${money(cents)}: ${why}.`);
  }

  wearUniform(on) {
    const app = this.state.appearance;
    const m = this.manager;
    this.crowd.setAppearance(this.player.char.id, on ? { ...app, wear: null, top: m ? BRAND.navy : BRAND.teal, topStyle: m ? 1 : 0, bottom: m ? '#2a2a2e' : BRAND.navy, bottomStyle: 0, shoes: '#1e1e22' } : app);
  }

  /** From the restaurant sim: someone at your register gave up, or got the wrong food. */
  crewEvent(ev, a, o) {
    const s = this.J.shift;
    if (!s) return;
    if (ev === 'lost') {
      s.lost++;
      s.notes.push('Jo took someone from your line');
      this.ui.toast('Jo: "I can take you over here!" Your customer gives up on register 2.');
    } else if (ev === 'wrong') {
      s.wrong++;
      this.dock(200, `remade #${o.num}`);
      const wanted = sayItems(o.wish?.items ?? [], ALL);
      this.audio.tone(300, 'square', 0.03, 0.2);
      this.ui.toast(`#${o.num}: "This isn't what I ordered. I said ${wanted}${o.wish && o.wish.toGo !== o.toGo ? (o.wish.toGo ? ', to go' : ', for here') : ''}." Marco comps it and apologises. Docked $2.00.`);
    }
  }

  // ---------------------------------------------------------------- stations
  /** What E does while you're on the clock (or null). */
  find(p) {
    if (!this.onShift) return null;
    if (this.work) return { label: `${this.work.label}… ${Math.floor((this.work.t / this.work.dur) * 100)}%`, act: () => {} };
    const cp = this.complaint;
    if (cp && near(p, cp.a.c, 1.5)) return { label: 'Sort out the complaint', act: () => this.handleComplaint() };
    if (!this.G.behindCounter(p)) return null;
    const St = this.G.stations;
    const K = this.K;
    const stock = this.D.shift.stock;
    const am = this.breakfast();
    // register 2
    if (near(p, St.register, 0.9)) {
      const a = this.D.waitingAt(1);
      if (a) return { label: 'Take their order (register 2)', act: () => this.openPos(a) };
      return { label: 'Register 2 (no one waiting)', act: () => this.ui.toast('Nobody at your register. Check the bins, or tidy something.') };
    }
    // bag to-go orders at the pass
    const bag = this.D.orders.filter((o) => o.state === 'bag' && (near(p, this.G.pickSlots[o.slot].expo, 1.1) || near(p, St.pass, 1.3)));
    if (bag.length) {
      const o = bag.sort((x, y) => x.bagAt - y.bagAt)[0];
      return { label: `Bag #${o.num} and call it`, act: () => this.startWork('Bagging', 1.6, 0, () => this.bagged(o)) };
    }
    // the fryer
    if (near(p, St.fryer, 1.1)) {
      const lift = K.baskets.filter((b) => b.s === 'done' || b.s === 'burnt');
      if (lift.length) return { label: `Lift ${lift.length > 1 ? `${lift.length} baskets` : 'the basket'}${lift.some((b) => b.s === 'burnt') ? ' (burnt!)' : ''}`, act: () => this.startWork('Shaking and salting', 1.4, 0, () => this.liftBaskets()) };
      const up = K.baskets.find((b) => b.s === 'up');
      const coming = K.baskets.filter((b) => b.s === 'frying').length * PER_BASKET;
      if (up && stock.fry + coming < BIN.fry) return { label: `Drop a basket of ${am ? 'hash browns' : 'fries'} (bin ${stock.fry})`, act: () => this.startWork('Filling a basket', 1.0, 0, () => this.dropBasket(up)) };
      if (up) return { label: 'Fry bin is full', act: () => this.ui.toast('The fry bin is full. They go limp if they sit, so wait.') };
      const next = Math.min(...K.baskets.map((b) => FRY_TIME - b.t));
      return { label: `Fryer: ${Math.max(0, Math.ceil(next))}s`, act: () => {} };
    }
    // the grill
    if (near(p, St.grill, 1.2)) {
      const g = K.grill;
      const what = am ? 'eggs and sausage' : 'patties';
      if (g.s === 'off') {
        if (stock.grill >= BIN.grill) return { label: 'Grill bin is full', act: () => this.ui.toast("The warming cabinet's full. Nothing dries out faster than a held patty.") };
        return { label: `Lay down ${what} (bin ${stock.grill})`, act: () => this.startWork(`Laying down ${what}`, 1.8, Math.PI, () => this.grillTo('side1')) };
      }
      if (g.s === 'flip') return { label: `Flip the ${am ? 'eggs' : 'patties'}`, act: () => this.startWork('Flipping', 1.2, Math.PI, () => this.grillTo('side2')) };
      if (g.s === 'ready') return { label: `Pull the ${what}`, act: () => this.startWork('Pulling them into the cabinet', 1.4, Math.PI, () => this.pullGrill()) };
      if (g.s === 'burnt') return { label: 'Scrape the grill (burnt)', act: () => this.startWork('Scraping', 2.4, Math.PI, () => this.grillTo('off')) };
      return { label: `Sizzling: ${Math.max(0, Math.ceil(SIDE_TIME - g.t))}s`, act: () => {} };
    }
    return null;
  }

  startWork(label, dur, yaw, done) {
    this.player.locked = true;
    if (yaw !== null) this.player.yaw = yaw;
    this.work = { label, dur, t: 0, done };
  }

  dropBasket(b) {
    b.s = 'frying';
    b.t = 0;
    this.audio.noiseHit?.(0.1, 2600, 0.6);
  }

  liftBaskets() {
    const s = this.J.shift;
    const st = this.D.shift.stock;
    let good = 0;
    for (const b of this.K.baskets) {
      if (b.s === 'done') {
        good++;
        st.fry = Math.min(BIN.fry, st.fry + PER_BASKET);
        s.baskets++;
      } else if (b.s === 'burnt') {
        s.burnt++;
        this.dock(100, 'burnt basket');
      } else continue;
      b.s = 'up';
      b.t = 0;
    }
    this.audio.noiseHit?.(0.05, 5000, 0.2);
    this.ui.toast(good ? `Shake, salt, scoop. Fry bin: ${st.fry}.` : 'Black and crunchy in the wrong way. Into the bin. Docked $1.00.');
  }

  grillTo(state) {
    const g = this.K.grill;
    if (state === 'off' && g.s === 'burnt') this.ui.toast('Scraped clean. The grill hisses like it forgives you.');
    g.s = state;
    g.t = 0;
    if (state !== 'off') this.audio.noiseHit?.(0.09, 1800, 0.5);
  }

  pullGrill() {
    const st = this.D.shift.stock;
    st.grill = Math.min(BIN.grill, st.grill + PER_LOAD);
    this.J.shift.loads++;
    this.K.grill.s = 'off';
    this.K.grill.t = 0;
    this.ui.toast(`Into the warming cabinet. Grill bin: ${st.grill}.`);
  }

  bagged(o) {
    if (o.state !== 'bag') return;
    this.D.bagUp(o);
    this.J.shift.bagged++;
    this.audio.noiseHit?.(0.05, 900, 0.3);
    this.ui.toast(`Fold, fold, napkins, receipt stapled on. "Number ${o.num}!"`);
  }

  // ---------------------------------------------------------------- register 2
  openPos(a) {
    const D = this.D;
    const menu = menuAt(this.clock.hour);
    a.atPos = true;
    this.player.locked = true;
    this.player.yaw = 0;
    this.ui.openPos({
      title: "GULLY'S · REGISTER 2",
      who: `${this.breakfast() ? 'SUNRISE MENU' : 'ALL DAY MENU'} · #${D.num}`,
      says: `"${a.wish.text}"`,
      menu,
      keys: KEYS,
      patience: () => 1 - (a.waitT ?? 0) / 45,
      onSend: (ticket) => {
        if (!a.wish || a.mode !== 'queue') return 'They wandered off.';
        const o = D.ringUp(a, ticket);
        this.J.shift.rung++;
        this.needs.add('social', 1.5);
        const total = ticket.items.reduce((sum, id) => sum + (menu.find((m) => m.id === id)?.price ?? 0), 0);
        this.audio.tone(1800, 'sine', 0.04, 0.15);
        this.ui.toast(`They tap their card: $${total.toFixed(2)}. "Number ${o.num}, we'll call it!"`);
        return null;
      },
      onClose: () => {
        a.atPos = false;
        this.player.locked = false;
      },
    });
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    const p = this.player;
    const G = this.G;
    G.staffInside = !this.onShift && G.behindCounter(p.pos);
    if (this.work) {
      this.work.t += dt;
      p.char.work = true;
      if (this.work.t >= this.work.dur) {
        const w = this.work;
        this.work = null;
        p.char.work = false;
        p.locked = false;
        w.done();
      }
    }
    const s = this.J.shift;
    if (!s) return;
    const D = this.D;
    const K = this.K;
    const stock = D.shift.stock;
    const inside = G.contains(p.pos, 0.5);

    // the fryer and the grill keep cooking whatever you're doing
    for (const b of K.baskets) {
      if (b.s === 'frying' && (b.t += dt) >= FRY_TIME) {
        b.s = 'done';
        b.t = 0;
        if (inside) this.audio.fryer?.();
        if (inside) this.ui.toast('BEEP BEEP BEEP. The fryer timer: lift that basket.');
      } else if (b.s === 'done' && (b.t += dt) >= FRY_GRACE) {
        b.s = 'burnt';
        this.audio.tone(220, 'square', 0.02, 0.4);
      }
    }
    const g = K.grill;
    if (g.s !== 'off' && g.s !== 'burnt') g.t += dt;
    if (g.s === 'side1' && g.t >= SIDE_TIME) {
      g.s = 'flip';
      g.t = 0;
      if (inside) this.audio.beep?.();
      if (inside) this.ui.toast(`The grill beeps: flip the ${this.breakfast() ? 'eggs' : 'patties'}!`);
    } else if (g.s === 'side2' && g.t >= SIDE_TIME) {
      g.s = 'ready';
      g.t = 0;
      if (inside) this.audio.beep?.();
      if (inside) this.ui.toast('The grill beeps twice: pull them!');
    } else if ((g.s === 'flip' || g.s === 'ready') && g.t >= GRILL_GRACE) {
      g.s = 'burnt';
      g.t = 0;
      s.burnt++;
      this.dock(150, 'burnt a grill load');
      this.audio.tone(220, 'square', 0.02, 0.4);
      if (inside) this.ui.toast('Smoke. The patties are charcoal. Docked $1.50: scrape the grill.');
    }
    G.crewKitchen.baskets = K.baskets.map((b) => b.s !== 'up');
    G.crewKitchen.grill = g.s === 'off' ? 'off' : g.s === 'burnt' ? 'burnt' : g.s === 'side1' || g.s === 'flip' ? 'raw' : 'cooked';

    // Marco bags anything you leave on the pass too long
    for (const o of D.orders)
      if (o.state === 'bag' && D.time - o.bagAt > 35) {
        D.bagUp(o);
        s.notes.push(`Marco bagged #${o.num} himself`);
        this.ui.toast(`Marco bags #${o.num} himself and gives you a look.`);
      }
    // an empty bin holds the line up
    if (D.shift.short) {
      if ((this.shortT += dt) > 10 && this.shoutT <= 0) {
        this.shoutT = 25;
        this.ui.toast(`Marco: "${this.marcoLine()}"`);
      }
    } else this.shortT = 0;
    this.shoutT -= dt;

    // the screens over the line
    if ((this.kdsT -= dt) <= 0) {
      this.kdsT = 0.5;
      const tickets = D.orders
        .filter((o) => o.state === 'cooking' || o.state === 'plating' || o.state === 'bag')
        .map((o) => ({ num: o.num, items: o.items, age: D.time - (o.at ?? D.time), state: o.state, toGo: o.toGo }));
      this.kds.draw(tickets, { fry: stock.fry, grill: stock.grill, short: D.shift.short });
    }

    // managers: every few minutes someone waves you over
    if (this.manager && inside) this.updateComplaint(dt);
    // closing time, or walking off
    if (!G.open) return this.clockOut('closed');
    if (Math.hypot(p.pos.x - G.doorCenter.x, p.pos.z - G.doorCenter.z) > 45) return this.clockOut('walked');

    // the HUD
    const mins = this.clock.minutes - s.start;
    const pay = Math.floor((mins / 60) * this.wage()) + (this.manager ? s.bonus + s.rung * 40 + s.bagged * 25 : 0) - s.docked;
    const tasks = [];
    const w = D.waitingAt(1);
    if (this.complaint) tasks.push(`COMPLAINT: go to the "!" in the dining room (${Math.max(0, Math.ceil(70 - this.complaint.t))}s)`);
    if (w) tasks.push(`REGISTER 2: someone waiting (${Math.max(0, Math.ceil(45 - (w.waitT ?? 0)))}s)`);
    const bags = D.orders.filter((o) => o.state === 'bag');
    if (bags.length) tasks.push(`BAG to go: ${bags.map((o) => `#${o.num}`).join(', ')}`);
    const fryState = K.baskets.some((b) => b.s === 'burnt') ? ' · BURNT basket!' : K.baskets.some((b) => b.s === 'done') ? ' · basket READY' : K.baskets.some((b) => b.s === 'frying') ? ' · frying' : '';
    tasks.push(`Fry bin ${stock.fry}/${BIN.fry}${stock.fry < 3 ? ' (low)' : ''}${fryState}`);
    const grillState = { off: '', side1: ' · sizzling', flip: ' · FLIP NOW', side2: ' · sizzling', ready: ' · PULL NOW', burnt: ' · BURNT: scrape it' }[g.s];
    tasks.push(`Grill bin ${stock.grill}/${BIN.grill}${stock.grill < 3 ? ' (low)' : ''}${grillState}`);
    const open = D.orders.filter((o) => o.state === 'cooking' && o.owner !== 'player').length;
    if (open) tasks.push(`${open} ticket${open > 1 ? 's' : ''} on the screen${D.shift.short ? ` · held for ${D.shift.short === 'fry' ? 'FRIES' : 'GRILL'}` : ''}`);
    this.ui.setShift(`${this.J.owner ? "OWNER'S SHIFT" : this.manager ? 'MANAGER SHIFT' : 'CREW SHIFT'} · ${Math.floor(mins / 60)}h ${String(Math.floor(mins % 60)).padStart(2, '0')}m · ${money(pay)}`, tasks);
  }

  // ---------------------------------------------------------------- complaints (managers)
  updateComplaint(dt) {
    const cp = this.complaint;
    if (!cp) {
      if ((this.compT -= dt) > 0) return;
      this.compT = this.rng.float(70, 130);
      const seated = this.D.pool.filter((a) => a.mode === 'sit' && a.c.visible && this.G.contains(a.c, -0.3)); // inside, not on the patio
      if (!seated.length) return;
      const a = this.rng.pick(seated);
      this.complaint = { a, type: this.rng.pick(COMPLAINTS), t: 0 };
      this.audio.tone(660, 'triangle', 0.04, 0.2);
      this.ui.toast('Someone in the dining room is waving at you. Manager! (the "!")');
      return;
    }
    cp.t += dt;
    const c = cp.a.c;
    this.compMark.visible = true;
    this.compMark.position.set(c.x, c.y + 2.0 + Math.sin(cp.t * 4) * 0.06, c.z);
    if (cp.a.mode !== 'sit' || cp.t > 70) {
      const s = this.J.shift;
      s.upset++;
      s.bonus -= 200;
      s.notes.push('a complaint walked out');
      this.ui.toast('They give up waiting and storm out. Marco: "That\'s a one-star review."');
      this.clearComplaint();
    }
  }

  clearComplaint() {
    this.complaint = null;
    if (this.compMark) this.compMark.visible = false;
  }

  handleComplaint() {
    const cp = this.complaint;
    if (!cp) return;
    const s = this.J.shift;
    this.player.locked = true;
    const choose = (how) => {
      this.ui.closeDialog();
      if (how === cp.type.best) {
        s.bonus += 250;
        s.handled++;
        this.needs.add('social', 3);
        this.ui.toast(this.rng.pick(['"Oh. Well. That\'s... actually very nice. Thank you." Crisis over. +$2.50 bonus.', 'They soften completely. One of them even says sorry. +$2.50 bonus.']));
      } else if (how === cp.type.ok) {
        s.bonus += 50;
        s.handled++;
        this.ui.toast('"Fine. I suppose." Not thrilled, but they stay. +$0.50 bonus.');
      } else {
        s.bonus -= 100;
        s.handled++;
        this.ui.toast('"That\'s it? Really?" They take it, grumbling. -$1.00 bonus.');
      }
      this.clearComplaint();
    };
    this.ui.openDialog({
      name: 'A CUSTOMER',
      text: cp.type.text,
      choices: [
        { label: 'Refund them', fn: () => choose('refund') },
        { label: 'Remake it, on the house', fn: () => choose('remake') },
        { label: 'Give the table a free Gull Box toy', fn: () => choose('toy') },
      ],
      onClose: () => (this.player.locked = false),
    });
  }

  // ---------------------------------------------------------------- the franchise (owners)
  ownerChoices(say, done) {
    const F = (this.state.franchise ??= { since: this.clock.minutes, special: 'none', toy: null, last: null });
    const sp = SPECIALS.find((x) => x.id === F.special) ?? SPECIALS[0];
    return [
      {
        label: "Let's look at the books",
        fn: () => {
          const L = F.last;
          const line = (a, b) => `${a.padEnd(20, '.')} ${b}`;
          const m = (d) => `${d < 0 ? '-' : ''}$${Math.abs(d).toLocaleString('en-US')}`;
          const text = L
            ? [`GULLY'S GREENWAY · WEEK ${L.week}`, '', line('Sales', m(L.sales)), line('Food and staff', m(-L.costs)), line('Toy promotion', m(-L.toy)), line('Profit (paid to you)', m(L.profit)), '', `Special: ${L.special}`].join('\n')
            : 'No week closed yet. The books close on Monday morning, and the profit goes straight to your bank.';
          this.ui.openDialog({ name: "GULLY'S · THE BOOKS", text, mono: !!L, choices: [{ label: 'Close the books', fn: () => this.ui.closeDialog() }], onClose: done });
        },
      },
      {
        label: `This week's special (${sp.name})`,
        fn: () =>
          say(
            'What are we running this week? Specials bring people in. Not all of them bring money in.',
            [
              ...SPECIALS.map((x) => ({
                label: `${x.name}${x.id === F.special ? ' (now)' : ''}`,
                fn: () => {
                  F.special = x.id;
                  this.visit.saveNow?.();
                  say(`${x.name}. ${x.blurb} It runs till Monday.`);
                },
              })),
            ],
          ),
      },
      {
        label: `The toy of the week (${F.toy ? TOYS.find((t) => t.id === F.toy).name : 'none'})`,
        fn: () =>
          say(
            'Which Gully goes in most of the boxes this week? It costs a bit to switch the order. The kids will notice.',
            [
              ...TOYS.map((t) => ({
                label: `${t.name}${t.id === F.toy ? ' (now)' : ''}`,
                fn: () => {
                  F.toy = t.id;
                  this.visit.saveNow?.();
                  say(`${t.name} it is. Five times as many in the boxes this week.`);
                },
              })),
              { label: 'Mix them up again', fn: () => ((F.toy = null), say('Back to the usual mix.')) },
            ],
          ),
      },
    ];
  }

  /** Monday morning: the weeks' profit (n weeks if you were away). Returns the total, in dollars. */
  franchiseProfit(n, week) {
    if (!this.J.owner) return 0;
    const F = (this.state.franchise ??= { since: this.clock.minutes, special: 'none', toy: null, last: null });
    const sp = SPECIALS.find((x) => x.id === F.special) ?? SPECIALS[0];
    let total = 0;
    for (let k = 0; k < n; k++) {
      const r = new Rng(31337 + (week - k) * 7);
      const sales = Math.round(21000 * sp.sales * (1 + r.float(-sp.spread, sp.spread)));
      const costs = Math.round(sales * (0.78 + sp.cost));
      const toy = F.toy ? 300 : 0;
      const profit = sales - costs - toy;
      F.last = { week: week - k, sales, costs, toy, profit, special: sp.name };
      total += profit;
    }
    this.state.bank += total;
    this.state.ledger?.push({ t: Math.round(this.clock.minutes), what: "GULLY'S Greenway profit", amt: total });
    return total;
  }
}
