import { SKIN, HAIR_COLORS, CLOTH, SHOES, HAIR_STYLES, TOP_STYLES, BOTTOM_STYLES } from '../actors/appearance.js';
import { NEEDS } from '../game/needs.js';

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

const WARDROBE_ROWS = [
  { label: 'Skin', key: 'skin', options: SKIN, swatch: true },
  { label: 'Hair', key: 'hairStyle', options: HAIR_STYLES.map((_, i) => i), names: HAIR_STYLES },
  { label: 'Hair colour', key: 'hair', options: HAIR_COLORS, swatch: true },
  { label: 'Top', key: 'topStyle', options: TOP_STYLES.map((_, i) => i), names: TOP_STYLES },
  { label: 'Top colour', key: 'top', options: CLOTH, swatch: true },
  { label: 'Jacket', key: 'jacket', options: CLOTH, swatch: true, when: (a) => a.topStyle === 2 },
  { label: 'Bottoms', key: 'bottomStyle', options: BOTTOM_STYLES.map((_, i) => i), names: BOTTOM_STYLES },
  { label: 'Bottom colour', key: 'bottom', options: CLOTH, swatch: true },
  { label: 'Shoes', key: 'shoes', options: SHOES, swatch: true },
  { label: 'Height', key: 'height', options: [0.92, 0.96, 1.0, 1.04, 1.08], names: ['Short', 'Smaller', 'Average', 'Taller', 'Tall'] },
  { label: 'Build', key: 'build', options: [0.88, 0.95, 1.0, 1.08, 1.16], names: ['Slim', 'Lean', 'Average', 'Sturdy', 'Broad'] },
];

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
  openWardrobe(app, onChange, onClose) {
    this.modal = 'wardrobe';
    this.menu = { kind: 'wardrobe', app: { ...app }, sel: 0, onChange, onClose };
    $('wardrobe').classList.remove('hidden');
    document.body.classList.add('in-menu');
    this.setPrompt(null);
    this.renderWardrobe();
  }
  wardrobeRows() {
    return WARDROBE_ROWS.filter((r) => !r.when || r.when(this.menu.app));
  }
  renderWardrobe() {
    const m = this.menu;
    const rows = this.wardrobeRows();
    m.sel = Math.min(m.sel, rows.length - 1);
    const box = $('wardrobe-rows');
    box.innerHTML = '';
    rows.forEach((r, i) => {
      const v = m.app[r.key];
      const idx = this.optionIndex(r, v);
      const div = document.createElement('div');
      div.className = `row${i === m.sel ? ' sel' : ''}`;
      const value = r.swatch ? `<span class="swatch" style="background:${v}"></span>` : `<span>${r.names[idx]}</span>`;
      div.innerHTML = `<span class="label">${r.label}</span><span class="val"><button class="arrow" data-d="-1">◀</button>${value}<button class="arrow" data-d="1">▶</button></span>`;
      div.querySelectorAll('.arrow').forEach((b) =>
        b.addEventListener('click', () => {
          m.sel = i;
          this.cycle(r, Number(b.dataset.d));
        }),
      );
      box.appendChild(div);
    });
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
    const i = this.optionIndex(r, m.app[r.key]);
    m.app[r.key] = r.options[(i + d + r.options.length) % r.options.length];
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
