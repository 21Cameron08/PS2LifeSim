import { SKIN, HAIR_COLORS, CLOTH, SHOES, HAIR_STYLES } from '../actors/appearance.js';
import { NEEDS } from '../game/needs.js';
import { ITEM, BRANDS, SLOTS, SLOT_NAMES, itemsFor } from '../game/fashion.js';

// little icons for the needs bars (16x16, drawn in currentColor)
export const NEED_ICONS = {
  hunger: '<path d="M2 7.2a6 4.2 0 0 1 12 0z"/><rect x="1.4" y="8.2" width="13.2" height="2" rx="1"/><path d="M2 11.2h12v.8a2.2 2.2 0 0 1-2.2 2.2H4.2A2.2 2.2 0 0 1 2 12z"/>',
  energy: '<path d="M9.5 1 3 9.2h4.2L6.3 15 13 6.6H8.8z"/>',
  hygiene: '<path d="M8 1.2S3.2 7 3.2 10.1a4.8 4.8 0 0 0 9.6 0C12.8 7 8 1.2 8 1.2z"/>',
  fun: '<path d="M8 1l2.1 4.5 4.9.6-3.6 3.4.9 4.9L8 12 3.7 14.4l.9-4.9L1 6.1l4.9-.6z"/>',
  social: '<path d="M2.2 2.5h11.6a1.2 1.2 0 0 1 1.2 1.2v6.6a1.2 1.2 0 0 1-1.2 1.2H7.2L4 14.4v-2.9H2.2A1.2 1.2 0 0 1 1 10.3V3.7a1.2 1.2 0 0 1 1.2-1.2z"/>',
};

const $ = (id) => document.getElementById(id);
// whole dollars, unless there are cents (fries cost $2.29)
const money = (n) => {
  const c = Math.round(n * 100) / 100;
  return `$${c.toLocaleString('en-US', Number.isInteger(c) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// what the basics' colour rows follow (only shown while you're wearing the basic one)
const BASIC_COLOUR = { top: ['top', 'Top colour', CLOTH], outer: ['jacket', 'Jacket colour', CLOTH], bottom: ['bottom', 'Bottom colour', CLOTH], shoes: ['shoes', 'Shoe colour', SHOES] };
const itemName = (id) => {
  const it = id && ITEM[id];
  if (!it) return 'None';
  return it.basic ? it.name : `${BRANDS[it.brand].name} ${it.name}`;
};
/** The wardrobe: your body, then a row per slot with the basics and everything you own. */
function wardrobeRows(app, owned) {
  const rows = [
    { label: 'Skin', key: 'skin', options: SKIN, swatch: true },
    { label: 'Hair', key: 'hairStyle', options: HAIR_STYLES.map((_, i) => i), names: HAIR_STYLES },
    { label: 'Hair colour', key: 'hair', options: HAIR_COLORS, swatch: true },
  ];
  for (const slot of SLOTS) {
    const items = itemsFor(slot, owned);
    const optional = !['top', 'bottom', 'shoes'].includes(slot);
    if (optional && !items.length) continue;
    const options = [...(optional ? [null] : []), ...items.map((it) => it.id)];
    rows.push({ label: SLOT_NAMES[slot], slot, options, names: options.map(itemName) });
    const bc = BASIC_COLOUR[slot];
    if (bc && ITEM[app.wear?.[slot]]?.basic) rows.push({ label: bc[1], key: bc[0], options: bc[2], swatch: true });
  }
  rows.push(
    { label: 'Height', key: 'height', options: [0.92, 0.96, 1.0, 1.04, 1.08], names: ['Short', 'Smaller', 'Average', 'Taller', 'Tall'] },
    { label: 'Build', key: 'build', options: [0.88, 0.95, 1.0, 1.08, 1.16], names: ['Slim', 'Lean', 'Average', 'Sturdy', 'Broad'] },
  );
  return rows;
}

const RES = [240, 360, 448, 540, 720];
// cheat menu money presets; any amount can also be typed with the number keys
const AMOUNTS = [100, 500, 1000, 5000, 10000, 50000, 100000, 1e6, 1e7, 1e8];
const MAX_AMOUNT = 1e12;
const RES_NAMES = ['240p · PS1-ish', '360p', '448p · PS2', '540p', '720p · HD-ish'];
const FLASH = ['full', 'reduced', 'off'];
const FLASH_NAMES = ['FULL · strobes', 'REDUCED', 'OFF · calm'];

export class UI {
  constructor(audio) {
    this.audio = audio;
    this.modal = 'title';
    this.locTimer = 0;
    this.toastTimer = 0;
    this.hintTimer = 0;
    this.dialog = null;
    this.menu = null;
    // Registered before Input so a key that closes a menu doesn't also reach the game.
    window.addEventListener('keydown', (e) => this.onKey(e));
    $('title').addEventListener('pointerdown', () => this.start());
    document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => this.closeMenu()));
  }

  // ---------------------------------------------------------------- title
  showTitle(saveText, onStart) {
    $('save-status').textContent = saveText;
    this.onStart = onStart;
  }
  start() {
    if (this.modal !== 'title') return;
    this.modal = null;
    $('title').classList.add('out');
    setTimeout(() => $('title').classList.add('hidden'), 1300);
    $('hud').classList.remove('hidden');
    if (this.touchInput?.isTouch) $('touch').classList.remove('hidden');
    this.onStart?.();
  }

  bindTouch(input) {
    this.touchInput = input;
    if (!input.isTouch) return;
    document.querySelectorAll('#touch [data-key]').forEach((b) =>
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.modal === 'dialog' && b.dataset.key === 'KeyE') return this.dialogConfirm();
        input.tap(b.dataset.key);
      }),
    );
    const run = document.querySelector('#touch [data-run]');
    run.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      input.autoRun = !input.autoRun;
      run.classList.toggle('on', input.autoRun);
    });
  }

  // ---------------------------------------------------------------- HUD
  setClock(text, day) {
    if (text !== this._clock) $('clock').textContent = this._clock = text;
    if (day !== this._day) $('day').textContent = `DAY ${(this._day = day)}`;
  }
  setMoney(cash, bank) {
    const c = money(cash);
    if (c !== this._cash) {
      const el = $('cash');
      el.textContent = this._cash = c;
      el.classList.add('bump');
      setTimeout(() => el.classList.remove('bump'), 160);
    }
    const b = `BANK ${bank < 0 ? '-' : ''}${money(Math.abs(bank))}`;
    if (b !== this._bank) {
      $('bank').textContent = this._bank = b;
      $('bank').classList.toggle('neg', bank < 0);
    }
  }
  /** Your status under the money: st = statusOf(); wish = { name, have, price } or null. */
  setStatus(st, wish) {
    const pips = Array.from({ length: 7 }, (_, i) => `<i class="${i < st.tier ? 'on' : ''}"></i>`).join('');
    const html = `<span class="pips">${pips}</span>${st.name.toUpperCase()}`;
    if (html !== this._status) {
      $('status').innerHTML = this._status = html;
      $('status').dataset.tier = st.tier;
    }
    const w = wish ? `WANT · ${wish.name} <span class="wish-bar"><i style="width:${Math.min(100, Math.max(0, Math.round((wish.have / wish.price) * 100)))}%"></i></span>` : '';
    if (w !== this._wish) {
      $('wish').innerHTML = this._wish = w;
      $('wish').classList.toggle('hidden', !w);
    }
  }
  /** The route chip under the clock: where you're headed, how far, which way (degrees, 0 = straight ahead). */
  setRoute(name, dist = 0, turn = 0) {
    const el = $('route');
    if (!name) {
      el.classList.add('hidden');
      this._route = null;
      return;
    }
    el.classList.remove('hidden');
    if (name !== this._route) $('route-name').textContent = this._route = name;
    const d = `${dist < 1000 ? Math.round(dist / 5) * 5 : (dist / 1000).toFixed(1) + 'k'} m`;
    if (d !== this._routeD) $('route-dist').textContent = this._routeD = d;
    $('route-arrow').style.transform = `rotate(${Math.round(turn)}deg)`;
  }

  /** The needs bars under the money (needs: a Needs). */
  setNeeds(needs) {
    const el = $('needs');
    if (!this.needRows) {
      el.innerHTML =
        `<div class="need-mood"><span>MOOD</span><b id="need-mood">OKAY</b></div>` +
        NEEDS.map(
          (n) =>
            `<div class="need" id="need-${n.key}" title="${n.name}"><svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">${NEED_ICONS[n.key]}</svg><span class="need-name">${n.name}</span><div class="need-bar"><i></i></div></div>`,
        ).join('') +
        `<div class="need-flags" id="need-flags"></div>`;
      this.needRows = NEEDS.map((n) => {
        const row = $(`need-${n.key}`);
        return { key: n.key, row, fill: row.querySelector('i'), shown: -1, low: null };
      });
    }
    for (const r of this.needRows) {
      const v = needs.v[r.key];
      const w = Math.round(v);
      if (w !== r.shown) {
        r.shown = w;
        r.fill.style.width = `${w}%`;
        r.fill.style.background = `hsl(${Math.round(v * 1.15)}, 78%, 52%)`;
      }
      const low = v < 10 ? 'crit' : v < 25 ? 'low' : '';
      if (low !== r.low) {
        r.low = low;
        r.row.classList.toggle('low', low === 'low');
        r.row.classList.toggle('crit', low === 'crit');
      }
      if (needs.pulse[r.key]) {
        needs.pulse[r.key] = 0;
        r.row.classList.remove('up');
        void r.row.offsetWidth; // restart the flash
        r.row.classList.add('up');
      }
    }
    const mood = needs.moodName();
    if (mood !== this._mood) {
      this._mood = mood;
      const m = $('need-mood');
      m.textContent = mood;
      m.className = `mood-${mood.toLowerCase()}`;
    }
    const flags = needs.flags().join(' · ');
    if (flags !== this._flags) $('need-flags').textContent = this._flags = flags;
  }

  showLocation(name, sub = '') {
    const el = $('location');
    el.innerHTML = `${name}${sub ? `<small>${sub}</small>` : ''}`;
    el.classList.add('show');
    this.locTimer = 3.2;
  }
  setPrompt(text) {
    const el = $('prompt');
    if (!text) {
      el.classList.remove('show');
      this._prompt = null;
      return;
    }
    if (text !== this._prompt) {
      const key = this.touchInput?.isTouch ? 'USE' : 'E';
      el.innerHTML = `<b>${key}</b>${text}`;
      this._prompt = text;
    }
    el.classList.add('show');
  }
  /** Fade to black, run mid() while the screen is dark, fade back in. */
  fade(mid, label = 'LOADING') {
    if (this.fading) return;
    this.fading = true;
    const el = $('fade');
    el.querySelector('span').textContent = label;
    el.classList.add('on');
    setTimeout(() => {
      mid();
      setTimeout(() => {
        el.classList.remove('on');
        this.fading = false;
      }, 300);
    }, 420);
  }

  toast(text) {
    const el = $('toast');
    el.textContent = text;
    el.classList.add('show');
    this.toastTimer = 2.4;
  }
  hint(text, seconds = 8) {
    const el = $('hint');
    el.innerHTML = text;
    el.classList.add('show');
    this.hintTimer = seconds;
  }

  clearHint() {
    $('hint').classList.remove('show');
    this.hintTimer = 0;
  }

  update(dt) {
    if (this.locTimer > 0 && (this.locTimer -= dt) <= 0) $('location').classList.remove('show');
    if (this.toastTimer > 0 && (this.toastTimer -= dt) <= 0) $('toast').classList.remove('show');
    if (this.hintTimer > 0 && (this.hintTimer -= dt) <= 0) $('hint').classList.remove('show');
    const d = this.dialog;
    if (d && d.typing) {
      const before = Math.floor(d.shown);
      d.shown = Math.min(d.text.length, d.shown + dt * 48);
      const now = Math.floor(d.shown);
      if (now !== before) {
        $('dialog-text').textContent = d.text.slice(0, now);
        if (now % 3 === 0) this.audio.tick();
      }
      if (now >= d.text.length) this.finishTyping();
    }
  }

  // ---------------------------------------------------------------- dialogue
  /** choices: [{ label, fn }]. fn() can open another dialog or call closeDialog(). */
  openDialog({ name, text, choices, onClose, mono = false }) {
    this.modal = 'dialog';
    this.dialog = { name, text, choices: choices?.length ? choices : [{ label: 'OK', fn: () => this.closeDialog() }], onClose, shown: 0, typing: true, sel: 0 };
    $('dialog').classList.remove('hidden');
    $('dialog-name').textContent = name;
    $('dialog-text').textContent = '';
    $('dialog-text').classList.toggle('mono', mono || name.includes('SLIP'));
    $('dialog-choices').innerHTML = '';
    this.clearHint();
    this.setPrompt(null);
  }
  finishTyping() {
    const d = this.dialog;
    d.typing = false;
    d.shown = d.text.length;
    $('dialog-text').textContent = d.text;
    const box = $('dialog-choices');
    box.innerHTML = '';
    d.choices.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = `choice${i === d.sel ? ' sel' : ''}`;
      b.innerHTML = `<span>${i + 1}</span>${c.label}`;
      b.addEventListener('click', () => this.choose(i));
      box.appendChild(b);
    });
  }
  dialogConfirm() {
    const d = this.dialog;
    if (!d) return;
    if (d.typing) this.finishTyping();
    else this.choose(d.sel);
  }
  choose(i) {
    const d = this.dialog;
    if (!d || d.typing || !d.choices[i]) return;
    this.audio.blip(true);
    d.choices[i].fn();
  }
  closeDialog() {
    const d = this.dialog;
    this.dialog = null;
    this.modal = null;
    $('dialog').classList.add('hidden');
    d?.onClose?.();
  }
  moveSel(delta) {
    const d = this.dialog;
    if (!d || d.typing) return;
    d.sel = (d.sel + delta + d.choices.length) % d.choices.length;
    [...$('dialog-choices').children].forEach((b, i) => b.classList.toggle('sel', i === d.sel));
    this.audio.blip(false);
  }

  // ---------------------------------------------------------------- shift HUD
  setShift(text, tasks = []) {
    const el = $('shift');
    if (!text) {
      el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');
    $('shift-title').textContent = text;
    const html = tasks.map((t) => `<li>${t}</li>`).join('');
    if (html !== this._tasks) $('shift-tasks').innerHTML = this._tasks = html;
  }

  // ---------------------------------------------------------------- register
  /** A small point-of-sale: scan items, check ID for alcohol, take card or count out change. */
  openRegister(o) {
    this.modal = 'register';
    this.reg = { ...o, stage: 'scan', pending: o.items.map((it, i) => ({ ...it, code: `0${48 + i}${(it.price * 37) % 9973}`.slice(0, 8) })), scanned: [], given: 0, soldBeerTo: null, refused: null };
    $('register').classList.remove('hidden');
    this.setPrompt(null);
    this.renderRegister();
  }
  regTotal() {
    return this.reg.scanned.reduce((s, it) => s + it.price, 0);
  }
  renderRegister() {
    const r = this.reg;
    const m = (c) => `$${(c / 100).toFixed(2)}`;
    const total = this.regTotal();
    let left = '';
    if (r.stage === 'scan') {
      left = `<h3>ON THE COUNTER · ${r.customer.toUpperCase()}</h3><div class="reg-btns">${r.pending
        .map((it, i) => `<button class="reg-btn" data-scan="${i}"><span>${i + 1}</span>${it.name}<em>${it.code}</em></button>`)
        .join('')}</div><div class="reg-note">Scan every item (click or press its number).</div>`;
    } else if (r.stage === 'id') {
      const id = r.idCard;
      left = `<h3>ID CHECK · ${r.beer.name.toUpperCase()}</h3>
        <div class="idcard"><b>HALCYON STATE · DRIVER LICENSE</b>${id.name}<br>DOB&nbsp;&nbsp;<strong>${id.dob}</strong></div>
        <div class="reg-note">Register: customer must be born on or before <strong>${r.cutoff}</strong>.</div>
        <div class="reg-btns"><button class="reg-btn go" data-id="sell"><span>Y</span>Sell</button><button class="reg-btn no" data-id="refuse"><span>N</span>Refuse</button></div>`;
    } else if (r.stage === 'pay') {
      if (!r.scanned.length) {
        left = `<h3>NO SALE</h3><div class="reg-note">Nothing left to ring up.</div><div class="reg-btns"><button class="reg-btn go" data-done="1"><span>↵</span>Next customer</button></div>`;
      } else if (r.card) {
        left = `<h3>PAYMENT</h3><div class="reg-note">The customer taps their card on the reader…</div><div class="reg-btns"><button class="reg-btn go" data-done="1"><span>↵</span>Approve card</button></div>`;
      } else {
        const due = r.paid - total;
        const den = [
          [1000, '$10'],
          [500, '$5'],
          [100, '$1'],
          [25, '25¢'],
          [10, '10¢'],
          [5, '5¢'],
          [1, '1¢'],
        ];
        left = `<h3>CASH · COUNT OUT THE CHANGE</h3><div class="reg-note">They hand you ${m(r.paid)}. Change due: <strong>${m(due)}</strong>. Counted: <strong>${m(r.given)}</strong></div>
          <div class="reg-btns">${den.map(([v, l], i) => `<button class="reg-btn" data-cash="${v}"><span>${i + 1}</span>${l}</button>`).join('')}
          <button class="reg-btn no" data-clear="1"><span>⌫</span>Clear</button><button class="reg-btn go" data-done="1"><span>↵</span>Hand over</button></div>`;
      }
    }
    const lines = r.scanned.map((it) => `<div><span>${it.name}</span><span>${m(it.price)}</span></div>`).join('');
    const tail =
      r.stage === 'pay' && r.scanned.length
        ? r.card
          ? `<div><span>CARD</span><span>${m(total)}</span></div>`
          : `<div><span>CASH</span><span>${m(r.paid)}</span></div><div><span>CHANGE</span><span>${m(r.paid - total)}</span></div>`
        : '';
    $('register').innerHTML = `<div class="reg-head"><span>HALCYON 24 · REGISTER 1</span><span>${r.today}</span></div>
      <div class="reg-body"><div>${left}</div><div class="receipt">${lines || '<div><span>— ready —</span></div>'}<div class="tot"><span>TOTAL</span><span>${m(total)}</span></div>${tail}</div></div>
      <div class="reg-foot">Esc: step away (they keep waiting) · keys: numbers, Y/N, Backspace, Enter</div>`;
    $('register').querySelectorAll('[data-scan]').forEach((b) => b.addEventListener('click', () => this.regScan(Number(b.dataset.scan))));
    $('register').querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', () => this.regId(b.dataset.id === 'sell')));
    $('register').querySelectorAll('[data-cash]').forEach((b) => b.addEventListener('click', () => this.regCash(Number(b.dataset.cash))));
    $('register').querySelectorAll('[data-clear]').forEach((b) => b.addEventListener('click', () => this.regCash(0)));
    $('register').querySelectorAll('[data-done]').forEach((b) => b.addEventListener('click', () => this.regDone()));
  }
  regAdvance() {
    const r = this.reg;
    if (!r.pending.length) {
      r.stage = 'pay';
      if (!r.card && r.scanned.length) r.onDrawer?.();
    }
    this.renderRegister();
  }
  regScan(i) {
    const r = this.reg;
    const it = r.pending[i];
    if (!it || r.stage !== 'scan') return;
    r.pending.splice(i, 1);
    if (it.id) {
      r.stage = 'id';
      r.beer = it;
      this.audio.tone(520, 'square', 0.03, 0.18);
      return this.renderRegister();
    }
    r.scanned.push(it);
    r.onScan?.();
    this.regAdvance();
  }
  regId(sell) {
    const r = this.reg;
    if (r.stage !== 'id') return;
    const who = r.idCard.minor ? 'minor' : 'adult';
    if (sell) {
      r.scanned.push(r.beer);
      r.soldBeerTo = who;
      r.onScan?.();
    } else r.refused = who;
    r.stage = 'scan';
    this.regAdvance();
  }
  regCash(v) {
    const r = this.reg;
    if (r.stage !== 'pay' || r.card) return;
    r.given = v ? r.given + v : 0;
    this.audio.tone(v ? 1400 : 500, 'triangle', 0.02, 0.05);
    this.renderRegister();
  }
  regDone() {
    const r = this.reg;
    if (r.stage !== 'pay') return;
    const total = this.regTotal();
    const res = { card: r.card || !r.scanned.length, given: r.given, due: r.paid ? r.paid - total : 0, soldBeerTo: r.soldBeerTo, refused: r.refused, total };
    if (res.card && r.scanned.length) this.audio.tone(1800, 'sine', 0.04, 0.15);
    this.reg = null;
    this.modal = null;
    $('register').classList.add('hidden');
    r.onDone?.(res);
  }
  closeRegister() {
    const r = this.reg;
    this.reg = null;
    this.modal = null;
    $('register').classList.add('hidden');
    r?.onClose?.();
  }

  // ---------------------------------------------------------------- menus
  /** opts: { owned: [item ids], status(app) -> html } */
  openWardrobe(app, onChange, onClose, opts = {}) {
    this.modal = 'wardrobe';
    this.menu = { kind: 'wardrobe', app: { ...app, wear: { ...app.wear } }, sel: 0, onChange, onClose, owned: opts.owned ?? [], status: opts.status };
    $('wardrobe').classList.remove('hidden');
    document.body.classList.add('in-menu');
    this.setPrompt(null);
    this.renderWardrobe();
  }
  wardrobeRows() {
    return wardrobeRows(this.menu.app, this.menu.owned);
  }
  renderWardrobe() {
    const m = this.menu;
    const rows = this.wardrobeRows();
    m.sel = Math.min(m.sel, rows.length - 1);
    const box = $('wardrobe-rows');
    box.innerHTML = '';
    rows.forEach((r, i) => {
      const v = r.slot ? m.app.wear[r.slot] : m.app[r.key];
      const idx = this.optionIndex(r, v);
      const div = document.createElement('div');
      div.className = `row${i === m.sel ? ' sel' : ''}`;
      const it = r.slot && ITEM[v];
      const value = r.swatch ? `<span class="swatch" style="background:${v}"></span>` : `<span${it && !it.basic ? ` class="branded" style="color:${BRANDS[it.brand].color}"` : ''}>${r.names[idx]}</span>`;
      div.innerHTML = `<span class="label">${r.label}</span><span class="val"><button class="arrow" data-d="-1">◀</button>${value}<button class="arrow" data-d="1">▶</button></span>`;
      div.querySelectorAll('.arrow').forEach((b) =>
        b.addEventListener('click', () => {
          m.sel = i;
          this.cycle(r, Number(b.dataset.d));
        }),
      );
      box.appendChild(div);
    });
    $('wardrobe-status').innerHTML = m.status ? m.status(m.app) : '';
  }
  optionIndex(r, v) {
    if (typeof v === 'number' && !Number.isInteger(v)) {
      let best = 0;
      r.options.forEach((o, i) => {
        if (Math.abs(o - v) < Math.abs(r.options[best] - v)) best = i;
      });
      return best;
    }
    const i = r.options.indexOf(v);
    return i < 0 ? 0 : i;
  }
  cycle(r, d) {
    const m = this.menu;
    const i = this.optionIndex(r, r.slot ? m.app.wear[r.slot] : m.app[r.key]);
    const v = r.options[(i + d + r.options.length) % r.options.length];
    if (r.slot) m.app.wear[r.slot] = v;
    else m.app[r.key] = v;
    this.audio.blip(d > 0);
    m.onChange(m.app);
    this.renderWardrobe();
  }

  openPause(settings, onChange, onClose, onReset) {
    this.modal = 'pause';
    this.menu = { kind: 'pause', s: settings, sel: 0, onChange, onClose, onReset };
    $('pause').classList.remove('hidden');
    document.body.classList.add('in-menu');
    this.setPrompt(null);
    this.renderPause();
  }
  pauseRows() {
    const s = this.menu.s;
    const onoff = (k, label) => ({ label, value: s[k] ? 'ON' : 'OFF', change: () => (s[k] = !s[k]) });
    return [
      {
        label: 'Resolution',
        value: RES_NAMES[Math.max(0, RES.indexOf(s.res))],
        change: (d) => (s.res = RES[(RES.indexOf(s.res) + d + RES.length) % RES.length]),
      },
      onoff('dither', 'Dithering'),
      onoff('bloom', 'Glow'),
      onoff('soft', 'Soft video'),
      onoff('scanlines', 'Scanlines'),
      onoff('crisp', 'Crisp pixels'),
      { label: 'Sound', value: s.muted ? 'OFF' : 'ON', change: () => (s.muted = !s.muted) },
      {
        label: 'Flashing lights',
        value: FLASH_NAMES[Math.max(0, FLASH.indexOf(s.flash))],
        change: (d) => (s.flash = FLASH[(Math.max(0, FLASH.indexOf(s.flash)) + d + FLASH.length) % FLASH.length]),
      },
      { label: 'New life', value: 'ERASE SAVE', action: () => this.menu.onReset?.() },
    ];
  }
  renderPause() {
    const m = this.menu;
    const box = $('pause-rows');
    box.innerHTML = '';
    this.pauseRows().forEach((r, i) => {
      const div = document.createElement('div');
      div.className = `row${i === m.sel ? ' sel' : ''}`;
      div.innerHTML = r.action
        ? `<span class="label">${r.label}</span><span class="val"><button class="arrow" style="width:auto;padding:0 10px">${r.value}</button></span>`
        : `<span class="label">${r.label}</span><span class="val"><button class="arrow" data-d="-1">◀</button><span>${r.value}</span><button class="arrow" data-d="1">▶</button></span>`;
      div.querySelectorAll('.arrow').forEach((b) =>
        b.addEventListener('click', () => {
          m.sel = i;
          this.pauseChange(r, Number(b.dataset.d || 1));
        }),
      );
      box.appendChild(div);
    });
  }
  pauseChange(r, d) {
    if (r.action) return r.action();
    r.change(d);
    this.audio.blip(d > 0);
    this.menu.onChange(this.menu.s);
    this.renderPause();
  }

  // ---------------------------------------------------------------- cheats
  /**
   * The secret cheat menu. ctx: { give(kind, amount), places: [{ label, go }],
   * times: [{ label, hour }], setTime(hour), onClose }.
   */
  openCheats(ctx) {
    this.modal = 'cheats';
    this.menu = { kind: 'cheats', ctx, sel: 0, amount: 10000, typed: false, place: 0, time: 0, onClose: ctx.onClose };
    $('cheats').classList.remove('hidden');
    document.body.classList.add('in-menu');
    this.setPrompt(null);
    this.renderCheats();
  }
  cheatRows() {
    const m = this.menu;
    const c = m.ctx;
    const wrap = (i, n) => (i + n) % n;
    const amt = m.amount ? money(m.amount) : '$0';
    return [
      { label: 'Amount', value: amt, change: (d) => this.stepAmount(d) },
      { label: 'Cash', button: `+ ${amt} CASH`, act: () => c.give('cash', m.amount) },
      { label: 'Bank', button: `+ ${amt} BANK`, act: () => c.give('bank', m.amount) },
      { label: 'Warp to', value: c.places[m.place].label, change: (d) => (m.place = wrap(m.place + d, c.places.length)), button: 'GO', act: () => this.cheatAndClose(() => c.places[m.place].go()) },
      { label: 'Time', value: c.times[m.time].label, change: (d) => (m.time = wrap(m.time + d, c.times.length)), button: 'SET', act: () => this.cheatAndClose(() => c.setTime(c.times[m.time].hour)) },
      { label: 'Needs', value: ['Fill all', 'Drain all', 'Starving', 'Exhausted', 'Smelly'][m.need ?? 0], change: (d) => (m.need = wrap((m.need ?? 0) + d, 5)), button: 'DO IT', act: () => c.setNeeds(m.need ?? 0) },
    ];
  }
  cheatAndClose(fn) {
    this.closeMenu();
    fn();
  }
  stepAmount(d) {
    const m = this.menu;
    const a = m.amount;
    m.amount = d > 0 ? (AMOUNTS.find((v) => v > a) ?? AMOUNTS[0]) : ([...AMOUNTS].reverse().find((v) => v < a) ?? AMOUNTS[AMOUNTS.length - 1]);
    m.typed = false;
  }
  typeAmount(digit) {
    const m = this.menu;
    if (digit < 0) m.amount = Math.floor(m.amount / 10);
    else if (!m.typed) m.amount = digit;
    else if (m.amount * 10 + digit <= MAX_AMOUNT) m.amount = m.amount * 10 + digit;
    m.typed = digit >= 0 || m.amount > 0;
    this.audio.tick();
    this.renderCheats();
  }
  renderCheats() {
    const m = this.menu;
    const box = $('cheat-rows');
    box.innerHTML = '';
    this.cheatRows().forEach((r, i) => {
      const div = document.createElement('div');
      div.className = `row${i === m.sel ? ' sel' : ''}`;
      const value = r.change
        ? `<button class="arrow" data-d="-1">◀</button><span class="cheat-val${i === 0 && m.typed ? ' typing' : ''}">${r.value}</span><button class="arrow" data-d="1">▶</button>`
        : '';
      const btn = r.act ? `<button class="arrow wide" data-act>${r.button}</button>` : '';
      div.innerHTML = `<span class="label">${r.label}</span><span class="val">${value}${btn}</span>`;
      div.querySelectorAll('[data-d]').forEach((b) =>
        b.addEventListener('click', () => {
          m.sel = i;
          this.cheatChange(r, Number(b.dataset.d));
        }),
      );
      div.querySelector('[data-act]')?.addEventListener('click', () => {
        m.sel = i;
        r.act();
        if (this.menu === m) this.renderCheats();
      });
      box.appendChild(div);
    });
  }
  cheatChange(r, d) {
    if (!r.change) return;
    r.change(d);
    this.audio.blip(d > 0);
    this.renderCheats();
  }

  closeMenu() {
    const m = this.menu;
    if (!m) return;
    this.menu = null;
    this.modal = null;
    $('wardrobe').classList.add('hidden');
    $('pause').classList.add('hidden');
    $('cheats').classList.add('hidden');
    document.body.classList.remove('in-menu');
    this.audio.blip(false);
    m.onClose?.(m.kind === 'wardrobe' ? m.app : m.s);
  }

  // ---------------------------------------------------------------- SUBSTATION's bar (the bar job)
  /** o: { order, orderText, ingredients, recipes, stock(), pour(steps) -> error|null, match(steps), onServe(tray), onClose } */
  openBar(o) {
    this.modal = 'bar';
    this.barS = { ...o, glass: [], tray: [], note: '' };
    $('bar').classList.remove('hidden');
    document.body.classList.add('in-menu');
    this.setPrompt(null);
    this.renderBar();
  }
  renderBar() {
    const b = this.barS;
    const ing = Object.fromEntries(b.ingredients.map((i) => [i.id, i]));
    const st = b.stock();
    const bar = (v) => `<span class="bar-meter"><i style="width:${Math.round(v * 100)}%"></i></span>`;
    const glass = b.glass.length ? b.glass.map((id) => `<span class="bar-chip">${ing[id].name}</span>`).join('<span class="bar-arrow">›</span>') : '<span class="bar-empty">— clean glass —</span>';
    const want = [...b.order.items];
    const tray = b.tray
      .map((id) => {
        const r = b.recipes.find((x) => x.id === id);
        const i = want.indexOf(id);
        if (i >= 0) want.splice(i, 1);
        return `<div class="${i >= 0 ? 'ok' : 'bad'}"><span>${r.name}</span><span>${i >= 0 ? '✓' : '✗'}</span></div>`;
      })
      .join('');
    const card = b.recipes.map((r) => `<div><b>${r.name}</b><span>${r.steps.map((s) => ing[s].name).join(' › ')}</span></div>`).join('');
    $('bar').innerHTML = `<div class="reg-head"><span>SUBSTATION · BAR</span><span>${b.order.name.toUpperCase()}: ${b.orderText}</span></div>
      <div class="bar-body"><div>
        <h3>THE GLASS</h3><div class="bar-glass">${glass}</div>
        <div class="reg-btns">${b.ingredients.map((i) => `<button class="reg-btn" data-ing="${i.id}"><span>${i.key}</span>${i.name}</button>`).join('')}</div>
        <div class="reg-btns bar-acts"><button class="reg-btn go" data-finish="1"><span>↵</span>Finish the glass</button><button class="reg-btn no" data-tip="1"><span>⌫</span>Tip it out</button></div>
        <div class="reg-note">${b.note}</div>
      </div><div>
        <h3>THE TRAY</h3><div class="receipt bar-tray">${tray || '<div><span>— empty —</span></div>'}${want.length ? `<div class="tot"><span>still to make</span><span>${want.length}</span></div>` : ''}</div>
        <div class="reg-btns bar-acts"><button class="reg-btn go" data-serve="1"><span>S</span>Serve</button><button class="reg-btn" data-away="1"><span>Esc</span>Step away</button></div>
        <div class="bar-stock">glasses <b>${st.glasses}</b> · ice ${bar(st.ice)} · keg ${bar(st.keg)}</div>
        <h3>THE CARD (taped under the bar)</h3><div class="bar-card">${card}</div>
      </div></div>
      <div class="reg-foot">keys: ingredients 1-0, Q, W · Enter finish · Backspace tip out · S serve · Esc step away (they keep waiting)</div>`;
    const el = $('bar');
    el.querySelectorAll('[data-ing]').forEach((x) => x.addEventListener('click', () => this.barAdd(x.dataset.ing)));
    el.querySelector('[data-finish]').addEventListener('click', () => this.barFinish());
    el.querySelector('[data-tip]').addEventListener('click', () => this.barTip());
    el.querySelector('[data-serve]').addEventListener('click', () => this.barServe());
    el.querySelector('[data-away]').addEventListener('click', () => this.closeBar());
  }
  barAdd(id) {
    const b = this.barS;
    if (b.glass.length >= 6) return;
    b.glass.push(id);
    b.note = '';
    this.audio.tone(id === 'ice' ? 2600 : id === 'tap' ? 300 : 700 + b.glass.length * 90, id === 'ice' ? 'square' : 'triangle', 0.02, id === 'tap' ? 0.35 : 0.08);
    this.renderBar();
  }
  barTip() {
    const b = this.barS;
    if (!b.glass.length) return;
    b.glass = [];
    b.note = 'You tip it down the sink. Start again.';
    this.audio.noiseHit?.(0.04, 800, 0.25);
    this.renderBar();
  }
  barFinish() {
    const b = this.barS;
    if (!b.glass.length) return;
    const r = b.match(b.glass);
    if (!r) {
      b.note = "That's not anything on the card. Tipped out. (Order matters: ice first.)";
      b.glass = [];
      this.audio.tone(300, 'square', 0.03, 0.2);
      return this.renderBar();
    }
    const err = b.pour(b.glass);
    if (err) {
      b.note = err;
      this.audio.tone(300, 'square', 0.03, 0.2);
      return this.renderBar();
    }
    b.tray.push(r.id);
    b.glass = [];
    b.note = `${r.name} on the tray.`;
    this.audio.tone(1500, 'sine', 0.03, 0.12);
    this.renderBar();
  }
  barServe() {
    const b = this.barS;
    if (!b.tray.length) {
      b.note = 'The tray is empty.';
      return this.renderBar();
    }
    const tray = b.tray;
    this.barS = null;
    this.modal = null;
    $('bar').classList.add('hidden');
    document.body.classList.remove('in-menu');
    b.onServe(tray);
    b.onClose?.();
  }
  closeBar() {
    const b = this.barS;
    this.barS = null;
    this.modal = null;
    $('bar').classList.add('hidden');
    document.body.classList.remove('in-menu');
    b?.onClose?.();
  }

  // ---------------------------------------------------------------- the Galleria's shop panel
  /** o: { title, shop, empty, rows() -> [{ it, owned, tryingOn, inBag, wish, note, gain, afford }], cash(), bank(), cartText(), onTry(it), onBag(it), onWish(it), onClose } */
  openShop(o) {
    this.modal = 'shop';
    this.shopS = { ...o, sel: 0, note: '' };
    const el = $('shop');
    el.classList.remove('hidden');
    el.dataset.shop = o.shop;
    document.body.classList.add('in-menu');
    this.setPrompt(null);
    this.renderShop();
  }
  renderShop() {
    const r = this.shopS;
    const rows = r.rows();
    r.sel = Math.min(r.sel, Math.max(0, rows.length - 1));
    const chip = (it) => {
      const L = it.look;
      if (L.watch) return ['', '#f0c858', '#d0d4dc', '#1e1a1c'][L.watch];
      if (L.chain) return L.chain === 1 ? '#f0c858' : '#d0d4dc';
      return L.jacket ?? L.top ?? L.bottom ?? L.shoes ?? L.hatColor ?? L.glassesColor ?? '#888';
    };
    const html = rows
      .map(({ it, owned, tryingOn, inBag, wish, note, gain, afford }, i) => {
        const tags = [owned && '<em class="own">YOURS</em>', tryingOn && '<em>TRYING ON</em>', inBag && '<em>IN YOUR BAG</em>', wish && '<em class="want">WANT</em>', note && `<em class="note">${note}</em>`, it.gem && !owned && '<em class="gem">ONE OF A KIND</em>'].filter(Boolean).join('');
        const acts = owned || note
          ? ''
          : `<button class="reg-btn" data-act="try" data-i="${i}"><span>T</span>${tryingOn ? 'Take off' : 'Try on'}</button><button class="reg-btn go" data-act="bag" data-i="${i}"><span>↵</span>${inBag ? 'Put back' : 'Bag it'}</button><button class="reg-btn${wish ? ' on' : ''}" data-act="wish" data-i="${i}"><span>␣</span>${wish ? 'Unwant' : 'I want this'}</button>`;
        return `<div class="shop-item${i === r.sel ? ' sel' : ''}" data-sel="${i}">
          <span class="chip" style="background:${chip(it)}"></span>
          <div class="shop-name"><b>${it.name}</b>${tags}<small>${it.desc}</small></div>
          <div class="shop-price${afford ? '' : ' dear'}">${it.price ? money(it.price) : 'free'}<small>+${gain} status</small></div>
          <div class="shop-acts">${acts}</div>
        </div>`;
      })
      .join('');
    $('shop').innerHTML = `<div class="reg-head"><span>${r.title}</span><span>${money(r.cash())} cash · ${money(r.bank())} bank</span></div>
      <div class="shop-list">${html || `<div class="shop-empty">${r.empty}</div>`}</div>
      <div class="reg-note">${r.note || r.cartText()}</div>
      <div class="reg-foot">↑↓ pick · T try on · Enter bag it · Space I want this · Esc done</div>`;
    const el = $('shop');
    el.querySelectorAll('[data-sel]').forEach((b) => b.addEventListener('click', () => ((r.sel = Number(b.dataset.sel)), this.renderShop())));
    el.querySelectorAll('[data-act]').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        r.sel = Number(b.dataset.i);
        this.shopAct(b.dataset.act);
      }),
    );
    el.querySelector('.shop-item.sel')?.scrollIntoView({ block: 'nearest' });
  }
  shopAct(kind) {
    const r = this.shopS;
    const row = r.rows()[r.sel];
    if (!row || row.owned || row.note) return;
    const fn = { try: r.onTry, bag: r.onBag, wish: r.onWish }[kind];
    r.note = fn(row.it) ?? '';
    this.audio.blip(kind !== 'wish');
    this.renderShop();
  }
  closeShop() {
    const r = this.shopS;
    this.shopS = null;
    if (this.modal === 'shop') this.modal = null;
    $('shop').classList.add('hidden');
    document.body.classList.remove('in-menu');
    r?.onClose?.();
  }

  // ---------------------------------------------------------------- GULLY'S register 2 (the crew job)
  /** o: { title, who, says, menu, keys, patience() -> 0..1, onSend({ items, toGo }) -> error|null, onClose } */
  openPos(o) {
    this.modal = 'pos';
    this.posS = { ...o, items: [], toGo: false, note: '' };
    $('pos').classList.remove('hidden');
    document.body.classList.add('in-menu');
    this.setPrompt(null);
    this.renderPos();
  }
  renderPos() {
    const r = this.posS;
    const m = (n) => `$${n.toFixed(2)}`;
    const byId = Object.fromEntries(r.menu.map((it) => [it.id, it]));
    const counts = {};
    for (const id of r.items) counts[id] = (counts[id] ?? 0) + 1;
    const lines = Object.entries(counts)
      .map(([id, n]) => `<div><span>${n} × ${byId[id].name}</span><span>${m(byId[id].price * n)}</span></div>`)
      .join('');
    const total = r.items.reduce((s, id) => s + byId[id].price, 0);
    const btns = r.menu.map((it, i) => `<button class="reg-btn" data-add="${i}"><span>${r.keys[i]}</span>${it.name}</button>`).join('');
    const pat = Math.max(0, Math.min(1, r.patience()));
    $('pos').innerHTML = `<div class="reg-head"><span>${r.title}</span><span>${r.who}</span></div>
      <div class="pos-says"><span class="pos-pat"><i style="width:${Math.round(pat * 100)}%"></i></span>${r.says}</div>
      <div class="bar-body"><div>
        <h3>THE SCREEN</h3><div class="reg-btns pos-grid">${btns}</div>
        <div class="ord-where"><button class="reg-btn${r.toGo ? '' : ' on'}" data-where="here">EAT HERE</button><button class="reg-btn${r.toGo ? ' on' : ''}" data-where="togo">TO GO</button></div>
      </div><div>
        <h3>THE TICKET</h3><div class="receipt">${lines || '<div><span>— empty —</span></div>'}<div class="tot"><span>${r.toGo ? 'TO GO' : 'EAT HERE'} · TOTAL</span><span>${m(total)}</span></div></div>
        <div class="reg-btns bar-acts"><button class="reg-btn go" data-send="1"><span>↵</span>Send to the kitchen</button><button class="reg-btn no" data-void="1"><span>⌫</span>Void last</button><button class="reg-btn" data-away="1"><span>Esc</span>Step away</button></div>
        <div class="reg-note">${r.note}</div>
      </div></div>
      <div class="reg-foot">keys: items ${r.keys[0]}-${r.keys[r.menu.length - 1]} · Space eat here / to go · Backspace void last · Enter send · Esc step away (they keep waiting)</div>`;
    const el = $('pos');
    el.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => this.posAdd(Number(b.dataset.add))));
    el.querySelectorAll('[data-where]').forEach((b) => b.addEventListener('click', () => this.posWhere(b.dataset.where === 'togo')));
    el.querySelector('[data-send]').addEventListener('click', () => this.posSend());
    el.querySelector('[data-void]').addEventListener('click', () => this.posVoid());
    el.querySelector('[data-away]').addEventListener('click', () => this.closePos());
  }
  posAdd(i) {
    const r = this.posS;
    if (r.items.length >= 8) return;
    r.items.push(r.menu[i].id);
    r.note = '';
    this.audio.tone(1320, 'square', 0.02, 0.05);
    this.renderPos();
  }
  posVoid() {
    const r = this.posS;
    if (!r.items.length) return;
    r.items.pop();
    r.note = '';
    this.audio.tone(660, 'square', 0.02, 0.06);
    this.renderPos();
  }
  posWhere(toGo) {
    this.posS.toGo = toGo;
    this.audio.blip(false);
    this.renderPos();
  }
  posSend() {
    const r = this.posS;
    if (!r.items.length) {
      r.note = 'The ticket is empty.';
      this.audio.tone(300, 'square', 0.03, 0.2);
      return this.renderPos();
    }
    const err = r.onSend({ items: [...r.items].sort(), toGo: r.toGo });
    if (err) {
      r.note = err;
      this.audio.tone(300, 'square', 0.03, 0.2);
      return this.renderPos();
    }
    this.closePos();
  }
  closePos() {
    const r = this.posS;
    this.posS = null;
    if (this.modal === 'pos') this.modal = null;
    $('pos').classList.add('hidden');
    document.body.classList.remove('in-menu');
    r?.onClose?.();
  }

  // ---------------------------------------------------------------- GULLY'S order panel
  /** o: { title, sub, greet, menu, cash, bank, onPay(sel) -> error|null, onClose } */
  openOrder(o) {
    this.modal = 'order';
    this.ord = { ...o, qty: o.menu.map(() => 0), sel: 0, toGo: false, note: '' };
    $('order').classList.remove('hidden');
    document.body.classList.add('in-menu');
    this.setPrompt(null);
    this.renderOrder();
  }
  ordTotal() {
    const r = this.ord;
    return Math.round(r.menu.reduce((s, it, i) => s + it.price * r.qty[i], 0) * 100) / 100;
  }
  renderOrder() {
    const r = this.ord;
    const m = (n) => `$${n.toFixed(2)}`;
    const total = this.ordTotal();
    const rows = r.menu
      .map(
        (it, i) => `<div class="ord-item${i === r.sel ? ' sel' : ''}" data-sel="${i}">
          <div class="ord-name">${it.name}${it.toy ? ' <em>+ TOY</em>' : ''}<small>${it.desc}</small></div>
          <div class="ord-price">${m(it.price)}</div>
          <div class="ord-qty"><button class="arrow" data-minus="${i}">−</button><b>${r.qty[i]}</b><button class="arrow" data-plus="${i}">+</button></div>
        </div>`,
      )
      .join('');
    const lines = r.menu
      .map((it, i) => (r.qty[i] ? `<div><span>${r.qty[i]} × ${it.name}</span><span>${m(it.price * r.qty[i])}</span></div>` : ''))
      .join('');
    const canCash = total > 0 && r.cash >= total;
    const canCard = total > 0 && r.bank >= total;
    $('order').innerHTML = `<div class="ord-head"><span>${r.title}</span><span>${r.sub}</span></div>
      <div class="ord-greet">${r.greet}</div>
      <div class="ord-body"><div class="ord-menu">${rows}</div>
      <div><div class="receipt">${lines || '<div><span>— tap + to add —</span></div>'}<div class="tot"><span>TOTAL</span><span>${m(total)}</span></div></div>
      <div class="ord-where"><button class="reg-btn${r.toGo ? '' : ' on'}" data-where="here">EAT HERE</button><button class="reg-btn${r.toGo ? ' on' : ''}" data-where="togo">TO GO</button></div>
      <div class="ord-pay"><button class="reg-btn go" data-pay="cash"${canCash ? '' : ' disabled'}>PAY CASH</button><button class="reg-btn go" data-pay="card"${canCard ? '' : ' disabled'}>PAY CARD</button><button class="reg-btn no" data-cancel="1">CANCEL</button></div>
      <div class="reg-note">${r.note}</div></div></div>
      <div class="reg-foot">↑↓ pick · ←→ fewer / more · Space eat here / to go · Enter pay · Esc cancel</div>`;
    const el = $('order');
    el.querySelectorAll('[data-sel]').forEach((b) => b.addEventListener('click', () => ((r.sel = Number(b.dataset.sel)), this.renderOrder())));
    el.querySelectorAll('[data-plus]').forEach((b) => b.addEventListener('click', (e) => (e.stopPropagation(), this.ordQty(Number(b.dataset.plus), 1))));
    el.querySelectorAll('[data-minus]').forEach((b) => b.addEventListener('click', (e) => (e.stopPropagation(), this.ordQty(Number(b.dataset.minus), -1))));
    el.querySelectorAll('[data-where]').forEach((b) => b.addEventListener('click', () => ((r.toGo = b.dataset.where === 'togo'), this.audio.blip(false), this.renderOrder())));
    el.querySelectorAll('[data-pay]').forEach((b) => b.addEventListener('click', () => this.ordPay(b.dataset.pay)));
    el.querySelector('[data-cancel]').addEventListener('click', () => this.closeOrder());
    el.querySelector('.ord-item.sel')?.scrollIntoView({ block: 'nearest' });
  }
  ordQty(i, d) {
    const r = this.ord;
    r.sel = i;
    r.qty[i] = Math.max(0, Math.min(9, r.qty[i] + d));
    r.note = '';
    this.audio.tone(d > 0 ? 1320 : 880, 'square', 0.02, 0.05);
    this.renderOrder();
  }
  ordPay(method) {
    const r = this.ord;
    const total = this.ordTotal();
    if (!method) method = r.cash >= total ? 'cash' : 'card';
    const lines = r.menu.map((item, i) => ({ item, qty: r.qty[i] })).filter((l) => l.qty);
    const err = r.onPay({ lines, toGo: r.toGo, method, total });
    if (err) {
      r.note = err;
      this.audio.tone(300, 'square', 0.03, 0.2);
      return this.renderOrder();
    }
    this.closeOrder();
  }
  closeOrder() {
    const r = this.ord;
    this.ord = null;
    this.modal = null;
    $('order').classList.add('hidden');
    document.body.classList.remove('in-menu');
    if (r && r.onClose) r.onClose();
  }

  // ---------------------------------------------------------------- the DJ set
  /** onKey(code | 'stop' | 'cue' | section name) */
  openDj(onKey) {
    this.modal = 'dj';
    this.djKey = onKey;
    this.setPrompt(null);
    this.clearHint();
    document.body.classList.add('in-menu');
    const el = $('dj');
    el.classList.remove('hidden');
    el.innerHTML = `<div class="dj-top"><span class="dj-title">YOUR SET</span><span id="dj-phrase"></span><span id="dj-text"></span><button class="arrow wide" data-dj="stop">END SET</button></div>
      <div class="dj-row"><div class="dj-now"><small>PLAYING</small><b id="dj-now"></b></div>
      <div class="dj-count"><small>NEXT CHANGE</small><div id="dj-beats"></div></div>
      <div class="dj-meter"><small>CROWD</small><div class="dj-energy"><i id="dj-energy"></i></div></div></div>
      <div class="dj-picks">${['groove', 'breakdown', 'build', 'drop'].map((n, i) => `<button class="reg-btn" data-dj="${n}"><span>${i + 1}</span>${n.toUpperCase()}</button>`).join('')}
      <button class="reg-btn go dj-cue" data-dj="cue"><span>␣</span>CUE</button></div>
      <div class="dj-foot">pick what plays next (1-4), hit CUE (Space) on the ONE when it changes · build before a drop · Esc ends the set</div>`;
    el.querySelectorAll('[data-dj]').forEach((b) =>
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.djKey?.(b.dataset.dj);
      }),
    );
  }
  setDj(v) {
    if (this.modal !== 'dj') return;
    $('dj-phrase').textContent = `PHRASE ${v.phrase} / ${v.total}`;
    $('dj-now').textContent = v.playing.toUpperCase();
    const n = Math.ceil(v.beatsLeft);
    const pips = [];
    for (let k = 4; k >= 1; k--) pips.push(`<i class="${n <= k && n > 0 ? 'on' : ''}${n === 1 && k === 1 ? ' one' : ''}">${k}</i>`);
    $('dj-beats').innerHTML = pips.join('') + `<em>${n > 4 ? `${Math.ceil(n / 4)} bars` : ''}</em>`;
    const e = $('dj-energy');
    e.style.width = `${Math.round(v.energy)}%`;
    e.style.background = `hsl(${Math.round(v.energy * 1.2)}, 85%, 55%)`;
    $('dj-text').textContent = v.text;
    document.querySelectorAll('#dj [data-dj]').forEach((b) => {
      const name = b.dataset.dj;
      b.classList.toggle('on', name === v.next);
      b.classList.toggle('locked', v.locked && name === v.next);
    });
  }
  closeDj() {
    if (this.modal === 'dj') this.modal = null;
    $('dj').classList.add('hidden');
    document.body.classList.remove('in-menu');
  }

  // ---------------------------------------------------------------- dance / photos
  /** The dance game owns the keys while it runs: onKey(code) gets them, 'stop' to end. */
  openDance(onKey) {
    this.modal = 'dance';
    this.danceKey = onKey;
    this.setPrompt(null);
    this.clearHint();
    document.body.classList.add('in-menu');
  }
  closeDance() {
    if (this.modal === 'dance') this.modal = null;
    document.body.classList.remove('in-menu');
  }
  /** A white camera flash, with an optional countdown number. */
  flash(text = '', on = true) {
    $('flash-count').textContent = text;
    $('flash').classList.toggle('on', on);
  }
  openPhoto(url, onClose) {
    this.modal = 'photo';
    $('photo-img').src = url;
    $('photo').classList.remove('hidden');
    document.body.classList.add('in-menu');
    this.photoClose = onClose;
    $('photo-close').onclick = () => this.closePhoto();
  }
  closePhoto() {
    if (this.modal !== 'photo') return;
    this.modal = null;
    $('photo').classList.add('hidden');
    document.body.classList.remove('in-menu');
    this.audio.blip(false);
    this.photoClose?.();
  }

  // ---------------------------------------------------------------- keys
  onKey(e) {
    if (!this.modal) return;
    const k = e.code;
    const eat = () => {
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    if (this.modal === 'title') {
      if (!e.repeat) this.start();
      return eat();
    }
    if (this.modal === 'register') {
      const r = this.reg;
      if (k === 'Escape') this.closeRegister();
      else if (r.stage === 'scan' && /^Digit[1-9]$/.test(k)) this.regScan(Number(k.slice(5)) - 1);
      else if (r.stage === 'id' && (k === 'KeyY' || k === 'KeyS')) this.regId(true);
      else if (r.stage === 'id' && (k === 'KeyN' || k === 'KeyR')) this.regId(false);
      else if (r.stage === 'pay' && /^Digit[1-7]$/.test(k)) this.regCash([1000, 500, 100, 25, 10, 5, 1][Number(k.slice(5)) - 1]);
      else if (r.stage === 'pay' && k === 'Backspace') this.regCash(0);
      else if (r.stage === 'pay' && (k === 'Enter' || k === 'Space')) this.regDone();
      return eat();
    }
    if (this.modal === 'map') {
      if (!e.repeat) this.mapView?.key(k);
      return eat();
    }
    if (this.modal === 'bar') {
      const b = this.barS;
      const ingr = b.ingredients.find((i) => k === `Digit${i.key}` || k === `Key${i.key}` || k === `Numpad${i.key}`);
      if (k === 'Escape') this.closeBar();
      else if (ingr) this.barAdd(ingr.id);
      else if (k === 'Enter' || k === 'NumpadEnter') this.barFinish();
      else if (k === 'Backspace') this.barTip();
      else if (k === 'KeyS') this.barServe();
      return eat();
    }
    if (this.modal === 'shop') {
      const r = this.shopS;
      const n = r.rows().length;
      if (k === 'Escape') this.closeShop();
      else if ((k === 'ArrowUp' || k === 'KeyW' || k === 'ArrowDown' || k === 'KeyS') && n) {
        r.sel = (r.sel + (k === 'ArrowUp' || k === 'KeyW' ? -1 : 1) + n) % n;
        r.note = '';
        this.audio.blip(false);
        this.renderShop();
      } else if (k === 'KeyT') this.shopAct('try');
      else if (k === 'Enter' || k === 'KeyE' || k === 'NumpadEnter') this.shopAct('bag');
      else if (k === 'Space') this.shopAct('wish');
      return eat();
    }
    if (this.modal === 'pos') {
      const r = this.posS;
      const i = r.keys.findIndex((key) => k === `Digit${key}` || k === `Key${key}` || k === `Numpad${key}`);
      if (k === 'Escape') this.closePos();
      else if (i >= 0 && i < r.menu.length) this.posAdd(i);
      else if (k === 'Space' || k === 'Tab') this.posWhere(!r.toGo);
      else if (k === 'Backspace') this.posVoid();
      else if (k === 'Enter' || k === 'NumpadEnter') this.posSend();
      return eat();
    }
    if (this.modal === 'order') {
      const r = this.ord;
      if (k === 'Escape') this.closeOrder();
      else if (k === 'ArrowUp' || k === 'KeyW' || k === 'ArrowDown' || k === 'KeyS') {
        r.sel = (r.sel + (k === 'ArrowUp' || k === 'KeyW' ? -1 : 1) + r.menu.length) % r.menu.length;
        this.audio.blip(false);
        this.renderOrder();
      } else if (k === 'ArrowRight' || k === 'KeyD' || k === 'Equal' || k === 'NumpadAdd') this.ordQty(r.sel, 1);
      else if (k === 'ArrowLeft' || k === 'KeyA' || k === 'Minus' || k === 'NumpadSubtract' || k === 'Backspace') this.ordQty(r.sel, -1);
      else if (k === 'Space' || k === 'Tab') {
        r.toGo = !r.toGo;
        this.audio.blip(false);
        this.renderOrder();
      } else if (k === 'Enter' || k === 'KeyE') this.ordPay();
      return eat();
    }
    if (this.modal === 'dj') {
      if (!e.repeat) {
        const pick = { Digit1: 'groove', Digit2: 'breakdown', Digit3: 'build', Digit4: 'drop' }[k];
        if (k === 'Escape' || k === 'KeyP') this.djKey?.('stop');
        else if (pick) this.djKey?.(pick);
        else if (k === 'Space' || k === 'KeyE' || k === 'Enter') this.djKey?.('cue');
      }
      return eat();
    }
    if (this.modal === 'dance') {
      if (!e.repeat) this.danceKey?.(k === 'Escape' || k === 'KeyE' || k === 'KeyP' ? 'stop' : k);
      return eat();
    }
    if (this.modal === 'photo') {
      if (k === 'Escape' || k === 'Enter' || k === 'Space' || k === 'KeyE') this.closePhoto();
      return eat();
    }
    if (this.modal === 'busy') return eat();
    if (this.modal === 'dialog') {
      if (/^Digit[1-9]$/.test(k)) this.choose(Number(k.slice(5)) - 1);
      else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'KeyA' || k === 'KeyW') this.moveSel(-1);
      else if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'KeyD' || k === 'KeyS' || k === 'Tab') this.moveSel(1);
      else if (k === 'Enter' || k === 'Space' || k === 'KeyE') this.dialogConfirm();
      else if (k === 'Escape') this.closeDialog();
      return eat();
    }
    const m = this.menu;
    if (!m) return;
    if (m.kind === 'cheats') {
      const rows = this.cheatRows();
      const r = rows[m.sel];
      const digit = /^(Digit|Numpad)([0-9])$/.exec(k);
      if (digit) this.typeAmount(Number(digit[2]));
      else if (k === 'Backspace') this.typeAmount(-1);
      else if (k === 'ArrowUp' || k === 'KeyW' || k === 'ArrowDown' || k === 'KeyS') {
        m.sel = (m.sel + (k === 'ArrowUp' || k === 'KeyW' ? -1 : 1) + rows.length) % rows.length;
        this.audio.blip(false);
        this.renderCheats();
      } else if (k === 'ArrowLeft' || k === 'KeyA' || k === 'ArrowRight' || k === 'KeyD') this.cheatChange(r, k === 'ArrowLeft' || k === 'KeyA' ? -1 : 1);
      else if (k === 'Enter' || k === 'Space' || k === 'KeyE') {
        if (r.act) {
          r.act();
          if (this.menu === m) this.renderCheats();
        } else this.cheatChange(r, 1);
      } else if (k === 'Escape') this.closeMenu();
      return eat();
    }
    const rows = m.kind === 'wardrobe' ? this.wardrobeRows() : this.pauseRows();
    const render = () => (m.kind === 'wardrobe' ? this.renderWardrobe() : this.renderPause());
    if (k === 'ArrowUp' || k === 'KeyW') {
      m.sel = (m.sel - 1 + rows.length) % rows.length;
      this.audio.blip(false);
      render();
    } else if (k === 'ArrowDown' || k === 'KeyS') {
      m.sel = (m.sel + 1) % rows.length;
      this.audio.blip(false);
      render();
    } else if (k === 'ArrowLeft' || k === 'KeyA' || k === 'ArrowRight' || k === 'KeyD' || k === 'Enter') {
      const d = k === 'ArrowLeft' || k === 'KeyA' ? -1 : 1;
      if (m.kind === 'wardrobe') this.cycle(rows[m.sel], d);
      else this.pauseChange(rows[m.sel], d);
    } else if (k === 'Escape' || (k === 'KeyC' && m.kind === 'wardrobe') || (k === 'KeyP' && m.kind === 'pause')) {
      this.closeMenu();
    }
    eat();
  }
}
