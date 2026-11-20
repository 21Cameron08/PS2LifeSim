import { Rng } from '../core/rng.js';
import { ITEM, ITEMS, BRANDS, statusOf, price as priceText } from './fashion.js';
import { UP } from '../world/galleria.js';

// Shopping at the Halcyon Galleria:
//  - browse a rack, wall, table or case (E): see what's there, the price and what
//    it does for your status
//  - try it on (you really wear it round the shop; the mirrors turn the camera on
//    you), or put it in your bag, then pay at the till: cash or card, a receipt,
//    and you walk out carrying the shop's bag
//  - walk out with something you haven't paid for and the gate shrieks
//  - RACK & RUIN's stock changes every morning (and a gem turns up now and then)
//  - "I want this": pin something you can't afford; the HUD tracks it
//  - Saturday 10 AM: the Grain Runner 9 drop at SPLITGRAIN (twelve pairs, a line)

const SHOPS = {
  rr: { name: 'RACK & RUIN', staff: 'dot', bag: BRANDS.thrift.bag },
  sg: { name: 'SPLITGRAIN', staff: 'kez', bag: BRANDS.splitgrain.bag },
  mv: { name: 'MAISON VELLARD', staff: 'celeste', bag: BRANDS.vellard.bag },
};
const SLOT_OF_DISPLAY = { 'rr-tops': ['top'], 'rr-outer': ['outer'], 'rr-bottoms': ['bottom'], 'rr-shoes': ['shoes'], 'rr-acc': ['hat', 'glasses'] };
const DROP_STOCK = 12;
const near = (p, q, r) => Math.hypot(p.x - q.x, p.z - q.z) < r && Math.abs((p.y ?? 0) - (q.y ?? p.y ?? 0)) < 1.3;
const money = (n) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const cents = (n) => Math.round(n * 100) / 100;

export class Shopping {
  constructor({ galleria, shoppers, ui, audio, state, clock, player, crowd, needs, input, rig, saveNow }) {
    Object.assign(this, { G: galleria, S: shoppers, ui, audio, state, clock, player, crowd, needs, input, rig, saveNow });
    this.rng = new Rng(Date.now() & 0xfff);
    this.cart = []; // item ids, all from one shop
    this.cartShop = null;
    this.trying = {}; // slot -> what you had on before (while trying something on)
    this.tryShop = null;
    this.zone = null; // which shop you're in
    this.greeted = new Set();
    this.seen = new Set(); // displays browsed this visit
    this.mirror = false;
    this.wishNoted = null;
    state.thrift ??= { day: -1, sold: [] };
    state.drop ??= { week: -1, stock: DROP_STOCK, mine: false };
    state.spent ??= 0;
    state.spentDay ??= { day: -1, mv: 0 };
    this.dropT = 0;
  }

  get busy() {
    return Object.keys(this.trying).length > 0;
  }

  day() {
    return Math.floor((this.clock.minutes - 6 * 60) / 1440);
  }

  // ---------------------------------------------------------------- what's on the displays
  /** RACK & RUIN restocks every morning: a few things per rail, and sometimes a gem. */
  thriftStock() {
    const day = this.day();
    if (this.stockDay === day) return this.stock;
    this.stockDay = day;
    if (this.state.thrift.day !== day) this.state.thrift = { day, sold: [] };
    const rng = new Rng(9000 + day * 7);
    const pool = ITEMS.filter((it) => it.brand === 'thrift' && !it.gem);
    const pick = (slots, n) => {
      const opts = pool.filter((it) => slots.includes(it.slot));
      const out = [];
      for (let k = 0; k < n && opts.length; k++) out.push(opts.splice(Math.floor(rng.next() * opts.length), 1)[0].id);
      return out;
    };
    this.stock = {};
    for (const [id, slots] of Object.entries(SLOT_OF_DISPLAY)) this.stock[id] = pick(slots, slots[0] === 'top' ? 3 : 2);
    // the bargain bin: anything, and every few days a real find
    this.stock['rr-bin'] = pick(['top', 'bottom', 'hat'], 2);
    if (rng.chance(0.35)) this.stock['rr-bin'].unshift(rng.pick(ITEMS.filter((it) => it.gem)).id);
    return this.stock;
  }

  itemsAt(d) {
    if (d.shop === 'rr') return (this.thriftStock()[d.id] ?? []).filter((id) => !this.state.thrift.sold.includes(id));
    return d.items;
  }

  // ---------------------------------------------------------------- the drop
  dropWeek() {
    return Math.floor((this.clock.day - 1) / 7);
  }

  dropState() {
    const D = this.state.drop;
    const wk = this.dropWeek();
    if (D.week !== wk) Object.assign(D, { week: wk, stock: DROP_STOCK, mine: false });
    const sat = this.clock.weekday === 'SAT';
    const h = this.clock.hour;
    return { D, sat, on: sat && h >= 10 && D.stock > 0, line: sat && h >= 8.75 && h < 10.75 && D.stock > 0, h };
  }

  /** Spots for the drop line: along the facade on the plaza, heading west from the doors. */
  lineSpots() {
    const G = this.G;
    if (!this._spots) this._spots = Array.from({ length: 16 }, (_, k) => ({ ...xzv(G.w(10.6 - k * 0.72, G.D + 1.35)), y: G.city.groundHeight(G.w(10.6 - k * 0.72, 0).x, G.w(0, G.D + 1.35).z), yaw: Math.PI / 2 }));
    return this._spots;
  }

  // ---------------------------------------------------------------- E
  /** What E does in and around the mall (or null). */
  find(p) {
    const G = this.G;
    if (this.mirror) return { label: 'Stop admiring yourself', act: () => this.endMirror() };
    const dr = this.dropState();
    // the drop line on the plaza
    if (dr.line && G.onPlaza(p) && !dr.D.mine) {
      const spots = this.lineSpots();
      const n = this.S.dropLine.length;
      const end = spots[Math.min(n, spots.length - 1)];
      if (near(p, end, 1.6)) return { label: `Join the drop line (${n} ahead)`, act: () => this.joinLine(n) };
    }
    if (!G.contains(p)) return null;
    if (!G.open) return null;
    // tills
    for (const [shop, t] of Object.entries(G.tills)) {
      if (!near(p, { ...t.stand, y: shop === 'mv' ? G.origin.y + UP : G.origin.y }, 0.9)) continue;
      const st = this.S.staff[SHOPS[shop].staff];
      if (!st.c.visible) continue;
      const mine = this.cart.length && this.cartShop === shop;
      const tryHere = this.tryShop === shop && this.busy;
      if (mine || tryHere) {
        const n = this.cart.length + (tryHere ? Object.keys(this.trying).length : 0);
        return { label: `Pay at the till (${n} item${n > 1 ? 's' : ''}, ${money(this.total(shop))})`, act: () => this.checkout(shop) };
      }
    }
    // displays
    let best = null;
    let bd = 1.1;
    for (const d of G.displays) {
      const dist = Math.hypot(p.x - d.stand.x, p.z - d.stand.z);
      if (dist < bd && Math.abs(p.y - d.stand.y) < 1.2) {
        bd = dist;
        best = d;
      }
    }
    if (best) return { label: `Browse: ${best.label}`, act: () => this.browse(best) };
    for (const m of G.mirrors) if (near(p, m.stand, 0.8)) return { label: 'Check yourself out in the mirror', act: () => this.startMirror(m) };
    if (near(p, G.fountain.stand, 1.0) || Math.hypot(p.x - G.fountain.x, p.z - G.fountain.z) < G.fountain.r + 0.7) {
      if (p.y < G.origin.y + 1) return { label: 'Toss a coin in the fountain (25¢)', act: () => this.coin() };
    }
    if (near(p, { ...G.kiosk.stand, y: G.origin.y }, 1.0)) return { label: 'PRETZEL PILOT: a pretzel ($4.50)', act: () => this.pretzel() };
    if (near(p, { ...G.directory, y: G.origin.y }, 0.9)) return { label: 'Read the directory', act: () => this.ui.toast("STREET LEVEL: RACK & RUIN (thrift), SPLITGRAIN (streetwear), PRETZEL PILOT, restrooms. UPPER LEVEL: MAISON VELLARD, ROOMSET (opening soon), BRIGHTWIRE (closed for refit). Open 10 AM - 10 PM.") };
    if (G.salon && near(p, G.salon.seat, 1.1) && this.zone === 'mv') return { label: 'Sink into the velvet sofa', act: () => this.salon() };
    return null;
  }

  // ---------------------------------------------------------------- browsing
  browse(d) {
    const items = this.itemsAt(d).map((id) => ITEM[id]);
    const dr = this.dropState();
    this.player.locked = true;
    if (!this.seen.has(d.id)) {
      this.seen.add(d.id);
      this.needs.add('fun', 1.5);
    }
    if (d.shop === 'rr' && items.some((it) => it.gem)) setTimeout(() => this.ui.toast('Wait. Under the jumble... is that a real label?'), 300);
    const st = statusOf(this.state.appearance, this.state.home);
    this.ui.openShop({
      title: `${SHOPS[d.shop].name} · ${d.label}`,
      shop: d.shop,
      empty: d.shop === 'rr' ? 'Picked clean today. Dot restocks every morning.' : 'Nothing here.',
      rows: () =>
        items.map((it) => {
          const owned = this.state.owned.includes(it.id);
          const tryingOn = this.state.appearance.wear[it.slot] === it.id && !owned;
          let note = '';
          if (it.drop && !dr.on) note = dr.D.stock <= 0 && dr.sat ? 'SOLD OUT' : 'DROPS SATURDAY 10 AM';
          return { it, owned, tryingOn, inBag: this.cart.includes(it.id), wish: this.state.wish === it.id, note, gain: it.status, afford: this.state.cash + Math.max(0, this.state.bank) >= it.price };
        }),
      status: st,
      cash: () => this.state.cash,
      bank: () => this.state.bank,
      cartText: () => (this.cart.length ? `In your bag: ${this.cart.length} item${this.cart.length > 1 ? 's' : ''} from ${SHOPS[this.cartShop].name}, ${money(this.total(this.cartShop, true))}. Pay at the till.` : ''),
      onTry: (it) => this.tryOn(it, d.shop),
      onBag: (it) => this.toggleBag(it, d.shop),
      onWish: (it) => this.toggleWish(it),
      onClose: () => (this.player.locked = false),
    });
  }

  /** Put it on (or take it off). Returns a note to show, or null. */
  tryOn(it, shop) {
    const w = this.state.appearance.wear;
    if (this.state.owned.includes(it.id)) return "That's already yours. Change in the wardrobe (C).";
    if (it.drop && !this.dropState().on) return 'Not until Saturday, 10 AM.';
    if (it.drop && this.S.dropLine.length && !this.lineDone) return 'Kez: "There\'s a line outside, fam. Back of it."';
    if (this.tryShop && this.tryShop !== shop && this.busy) return `You're still wearing something from ${SHOPS[this.tryShop].name}.`;
    if (w[it.slot] === it.id) {
      // take it off
      w[it.slot] = this.trying[it.slot];
      delete this.trying[it.slot];
      this.redress();
      return 'Back on the hanger.';
    }
    if (!(it.slot in this.trying)) this.trying[it.slot] = w[it.slot] ?? null;
    w[it.slot] = it.id;
    this.tryShop = shop;
    this.redress();
    this.audio.tone(900, 'triangle', 0.02, 0.08);
    return `Trying on: ${it.name}. Find a mirror. Pay at the till to keep it.`;
  }

  toggleBag(it, shop) {
    if (this.state.owned.includes(it.id)) return "You've already got that.";
    if (it.drop && !this.dropState().on) return 'Not until Saturday, 10 AM.';
    if (it.drop && this.S.dropLine.length && !this.lineDone) return 'Kez: "There\'s a line outside, fam. Back of it."';
    const i = this.cart.indexOf(it.id);
    if (i >= 0) {
      this.cart.splice(i, 1);
      if (!this.cart.length) this.cartShop = null;
      return 'Put back.';
    }
    if (this.cartShop && this.cartShop !== shop) return `Pay for your ${SHOPS[this.cartShop].name} stuff first (one shop at a time).`;
    if (this.state.appearance.wear[it.slot] === it.id) return "You're wearing it. Pay at the till to keep it.";
    this.cart.push(it.id);
    this.cartShop = shop;
    this.audio.tone(1320, 'square', 0.02, 0.05);
    return `In your bag: ${it.name}. Pay at the till.`;
  }

  toggleWish(it) {
    if (this.state.owned.includes(it.id)) return "It's already yours.";
    this.state.wish = this.state.wish === it.id ? null : it.id;
    this.wishNoted = null;
    if (this.state.wish) this.audio.blip(true);
    return this.state.wish ? `Saving up for the ${it.name}. It's under your money now.` : 'Not saving for it any more.';
  }

  redress() {
    this.crowd.setAppearance(this.player.char.id, this.state.appearance);
  }

  /** What's due at a shop's till: the bag, plus anything you're wearing from there. */
  total(shop, bagOnly = false) {
    let t = 0;
    if (this.cartShop === shop) for (const id of this.cart) t += ITEM[id].price;
    if (!bagOnly && this.tryShop === shop) for (const s of Object.keys(this.trying)) t += ITEM[this.state.appearance.wear[s]]?.price ?? 0;
    return cents(t);
  }

  // ---------------------------------------------------------------- the till
  checkout(shop) {
    const sh = SHOPS[shop];
    const worn = this.tryShop === shop ? Object.keys(this.trying).map((s) => this.state.appearance.wear[s]).filter(Boolean) : [];
    const bag = this.cartShop === shop ? [...this.cart] : [];
    const ids = [...worn, ...bag];
    const total = cents(ids.reduce((s, id) => s + ITEM[id].price, 0));
    const st = this.S.staff[sh.staff];
    const line = (a, b) => `${a.length > 22 ? `${a.slice(0, 21)}…` : a.padEnd(22, '.')} ${b}`;
    const text = [`${sh.name} · ${this.clock.format()}`, '', ...ids.map((id) => line(ITEM[id].name, priceText(ITEM[id]))), '', line('TOTAL', money(total)), worn.length ? `(${worn.length} you're wearing)` : ''].join('\n');
    this.player.locked = true;
    st.serving = true;
    const done = () => {
      st.serving = false;
      this.player.locked = false;
    };
    const pay = (method) => {
      const S = this.state;
      if (method === 'cash' && S.cash < total) return this.ui.toast("You don't have that much cash.");
      if (method === 'card' && S.bank < total) return this.ui.toast(`Card declined. ${st.name} hands it back very politely.`);
      if (method === 'cash') S.cash = cents(S.cash - total);
      else {
        S.bank = cents(S.bank - total);
        this.ledger(sh.name, -total);
      }
      this.ui.closeDialog();
      this.paid(shop, ids, total, worn);
    };
    this.ui.openDialog({
      name: `${sh.name} · ${st.name}`,
      text,
      mono: true,
      choices: [
        { label: `Pay cash (${money(this.state.cash)})`, fn: () => pay('cash') },
        { label: 'Pay by card', fn: () => pay('card') },
        { label: 'Not yet', fn: () => this.ui.closeDialog() },
      ],
      onClose: done,
    });
  }

  paid(shop, ids, total, worn) {
    const S = this.state;
    const sh = SHOPS[shop];
    for (const id of ids) if (!S.owned.includes(id)) S.owned.push(id);
    if (shop === 'rr') S.thrift.sold.push(...ids);
    for (const id of ids)
      if (ITEM[id].drop) {
        S.drop.mine = true;
        S.drop.stock = Math.max(0, S.drop.stock - 1);
      }
    this.cart = this.cartShop === shop ? [] : this.cart;
    if (this.cartShop === shop) this.cartShop = null;
    if (this.tryShop === shop) {
      this.trying = {};
      this.tryShop = null;
    }
    S.spent = cents(S.spent + total);
    const day = this.day();
    if (S.spentDay.day !== day) S.spentDay = { day, mv: 0 };
    if (shop === 'mv') S.spentDay.mv += total;
    // the bag in your hand
    const c = this.player.char;
    c.bags = c.bags?.[0] && c.bags[0] !== sh.bag ? [sh.bag, c.bags[0]] : [sh.bag, c.bags?.[1] ?? null];
    // buying things feels good (for a bit)
    this.needs.add('fun', Math.min(30, 5 + Math.log10(Math.max(1, total)) * 6));
    this.audio.coin();
    setTimeout(() => this.audio.tone(2400, 'sine', 0.05, 0.25), 120);
    const lines = {
      rr: ['Dot folds it into a crinkly paper bag and adds a free button. "For luck."', 'Dot: "Oh, that one\'s got a story. I don\'t know it, but it\'s got one."'],
      sg: ['Kez drops it in a black bag and nods. "Respect."', 'Kez: "Wear them, don\'t bin them. I mean box them. Whatever."'],
      mv: ['Céleste wraps it in tissue, ties a ribbon, and hands you a heavy bag with rope handles.', 'Céleste: "An excellent choice. It suits you. Truly."'],
    };
    this.ui.toast(`Ka-ching! ${this.rng.pick(lines[shop])}`);
    if (worn.length < ids.length) setTimeout(() => this.ui.hint("It's yours: change into it with the wardrobe (<b>C</b>).", 6), 1200);
    if (this.state.wish && ids.includes(this.state.wish)) this.state.wish = null;
    this.saveNow?.();
  }

  ledger(what, amt) {
    const L = this.state.ledger;
    L.push({ t: Math.round(this.clock.minutes), what, amt: cents(amt) });
    if (L.length > 80) L.splice(0, L.length - 80);
  }

  /** Walked out of a shop without paying: the gate shrieks, everything goes back. */
  alarm(shop) {
    const sh = SHOPS[shop];
    const st = this.S.staff[sh.staff];
    let n = this.cartShop === shop ? this.cart.length : 0;
    if (this.cartShop === shop) {
      this.cart = [];
      this.cartShop = null;
    }
    if (this.tryShop === shop) {
      n += Object.keys(this.trying).length;
      Object.assign(this.state.appearance.wear, this.trying);
      this.trying = {};
      this.tryShop = null;
      this.redress();
    }
    if (!n) return;
    for (let k = 0; k < 6; k++) setTimeout(() => this.audio.tone(k % 2 ? 1400 : 1900, 'square', 0.035, 0.12), k * 140);
    const lines = { rr: 'Dot: "Sweetie! You forgot to pay! Here, I\'ll take those back."', sg: 'BEEP BEEP BEEP. Kez: "Nah nah nah. Pay or put it back, fam."', mv: 'A soft, expensive chime. Anton steps in front of you. "I believe these are ours."' };
    this.ui.toast(lines[shop] ?? `${st.name} takes the things back.`);
  }

  // ---------------------------------------------------------------- the drop line
  joinLine(ahead) {
    const dr = this.dropState();
    const D = dr.D;
    this.player.locked = true;
    const close = () => this.ui.closeDialog();
    const wait = Math.max(0, (10 - dr.h) * 60) + ahead * 1.2;
    this.ui.openDialog({
      name: "SPLITGRAIN · GRAIN RUNNER 9 'HARBOUR'",
      text: `${ahead} people ahead of you. ${D.stock} pairs. Doors at 10. Someone in a camping chair has been here since six.`,
      choices: [
        {
          label: `Wait in line (about ${Math.round(wait)} min)`,
          fn: () => {
            close();
            this.ui.fade(() => {
              this.clock.minutes = Math.max(this.clock.minutes, Math.floor(this.clock.minutes / 1440) * 1440 + 600) + ahead * 1.2;
              D.stock = Math.max(0, D.stock - ahead);
              for (let k = 0; k < ahead; k++) this.S.serveDrop();
              this.lineDone = true;
              const d = this.G.displays.find((x) => x.id === 'sg-drop');
              this.player.teleport(this.player.space, d.stand.x, d.stand.z, d.yaw);
              if (D.stock > 0) {
                this.ui.toast(`Kez waves you in. "You made it. ${D.stock} left." The case is open.`);
                setTimeout(() => this.browse(d), 900);
              } else this.ui.toast('By the time you get in, the case is empty. Kez shrugs. "Sold out, fam. Next time come with a chair."');
            }, 'IN THE LINE');
          },
        },
        { label: 'Not worth it', fn: close },
      ],
      onClose: () => (this.player.locked = false),
    });
  }

  // ---------------------------------------------------------------- little things
  startMirror(m) {
    this.mirror = true;
    this.player.locked = true;
    this.player.teleport(this.player.space, m.stand.x, m.stand.z, m.yaw);
    this.rig.setMode('wardrobe');
    const st = statusOf(this.state.appearance, this.state.home);
    const tried = Object.keys(this.trying).length;
    const verdicts = ['You look... like you got dressed in the dark.', 'You look like a regular person. Fine. Fine!', 'Put-together. Your mum would approve.', 'Fresh. You turn a little to see the back.', 'Sharp. You nod at yourself. You deserve it.', 'Flashy. The mirror is lucky to have you.', 'Rich. You look like money. Because you are.', "Untouchable. You'd follow you on everything."];
    this.ui.toast(`${verdicts[st.tier]}${tried ? ' (Not paid for yet.)' : ''}`);
    this.ui.hint('Move or press <b>E</b> to step away from the mirror.', 5);
    if (!this.seen.has(`mirror:${m.shop}`)) {
      this.seen.add(`mirror:${m.shop}`);
      this.needs.add('fun', 2);
    }
  }

  endMirror() {
    this.mirror = false;
    this.player.locked = false;
    this.rig.setMode('follow');
  }

  coin() {
    if (this.state.cash < 0.25) return this.ui.toast('Not even a quarter. The fountain judges you silently.');
    this.state.cash = cents(this.state.cash - 0.25);
    this.audio.coin();
    setTimeout(() => this.audio.noiseHit?.(0.05, 2600, 0.3), 380);
    this.needs.add('fun', 3);
    const it = this.state.wish && ITEM[this.state.wish];
    this.ui.toast(
      it
        ? `Plink. You wish for the ${it.name}. The fountain gurgles noncommittally.`
        : this.rng.pick(['Plink. You wish for more wishes. Classic.', 'Plink. A kid next to you wishes for a pony. You wish for a better job.', 'Plink. Somewhere, a quarter is worth a lot more to someone.', 'Plink. It lands heads up. That has to mean something.']),
    );
  }

  pretzel() {
    if (this.state.cash < 4.5) return this.ui.toast('Benny: "Four fifty, cash. Cash only. Sorry, the card thing broke in 2003."');
    this.state.cash = cents(this.state.cash - 4.5);
    this.audio.coin();
    this.needs.give({ hunger: 18, fun: 2 });
    this.ui.toast(this.rng.pick(['A warm pretzel the size of your face, salt like gravel. Perfect.', 'Benny dunks it in cinnamon sugar without asking. He was right.', 'You eat it walking. Classic mall behaviour.']));
  }

  salon() {
    const st = statusOf(this.state.appearance, this.state.home);
    const day = this.day();
    const vip = st.tier >= 5 || (this.state.spentDay.day === day && this.state.spentDay.mv >= 1000);
    if (vip && this.state.champagneDay !== day) {
      this.state.champagneDay = day;
      this.needs.give({ fun: 10, social: 5, energy: 3 });
      this.audio.tone(2600, 'sine', 0.03, 0.4);
      return this.ui.toast('Céleste appears with a flute of champagne before you\'ve even sat down. "For you. Take your time."');
    }
    this.needs.add('energy', 2);
    this.ui.toast(vip ? 'Velvet. Silence. A second glass is not offered. One is classy, two is a habit.' : 'You sit. Céleste glances over, then goes back to folding a scarf. Nobody brings you anything.');
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    const p = this.player.pos;
    const zone = this.G.zoneAt(p);
    // leaving a shop with things you haven't paid for
    if (this.zone && ['rr', 'sg', 'mv'].includes(this.zone) && zone !== this.zone) this.alarm(this.zone);
    // walking into a shop: the staff notice you (and what you're wearing)
    if (zone !== this.zone && ['rr', 'sg', 'mv'].includes(zone) && this.G.open && !this.greeted.has(zone)) {
      this.greeted.add(zone);
      this.greet(zone);
    }
    if (!zone) {
      this.greeted.clear();
      this.seen.clear();
    }
    this.zone = zone;
    if (this.mirror) {
      const mv = this.input.move();
      if (!this.ui.modal && Math.hypot(mv.x, mv.y) > 0.6) this.endMirror();
    }
    // the thing you're saving for
    const it = this.state.wish && ITEM[this.state.wish];
    if (it && this.wishNoted !== it.id && this.state.cash + Math.max(0, this.state.bank) >= it.price && !this.state.owned.includes(it.id)) {
      this.wishNoted = it.id;
      this.ui.toast(`You can afford the ${it.name} now. Just saying.`);
      this.audio.blip(true);
    }
    // the drop: the line grows from 8:45, the doors open at 10, a pair a minute or so
    const dr = this.dropState();
    const h = dr.h;
    this.drop = { line: dr.line, want: dr.line ? Math.min(14, Math.max(0, Math.round((h - 8.75) * 14))) : 0, spots: this.lineSpots() };
    if (dr.line && h >= 10 && this.S.dropLine.length) {
      if ((this.dropT += dt) > 1.2) {
        this.dropT = 0;
        if (dr.D.stock > 0) {
          dr.D.stock--;
          this.S.serveDrop();
        }
      }
    }
  }

  greet(zone) {
    const st = statusOf(this.state.appearance, this.state.home);
    const t = st.tier;
    const lines = {
      rr: ['Dot: "Hi sweetie! New stuff came in this morning. Have a dig."', 'Dot: "Welcome in! Mind the bin, it bites."', 'Dot: "Ooh, look at you! Come and see what I\'ve got."'],
      sg: t >= 3 ? ['Kez looks at your fit. "Okay. Okay, I see you."', 'Kez: "Clean. Real clean."'] : ['Kez: "Yo." He goes back to his phone.', 'Kez nods without looking up.'],
      mv:
        t <= 2
          ? ['Céleste looks you up and down. Twice. "...Can I help you?"', 'Céleste: "Are you... lost?" She smiles. It does not reach her eyes.']
          : t <= 4
            ? ['Céleste: "Welcome to Maison Vellard."', 'Céleste: "Good afternoon. Let me know if anything catches your eye."']
            : ['Céleste: "There you are! We\'ve been hoping you\'d come in."', 'Céleste: "Darling. Champagne? Sit, sit."'],
    };
    this.ui.toast(this.rng.pick(lines[zone]));
    if (zone === 'mv') this.audio.tone(2200, 'sine', 0.02, 0.5);
  }
}

function xzv(v) {
  return { x: v.x, z: v.z };
}
