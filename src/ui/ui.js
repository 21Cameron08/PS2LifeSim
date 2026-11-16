import { SKIN, HAIR_COLORS, CLOTH, SHOES, HAIR_STYLES, TOP_STYLES, BOTTOM_STYLES } from '../actors/appearance.js';

const $ = (id) => document.getElementById(id);
const money = (n) => `$${Math.round(n).toLocaleString('en-US')}`;

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
const RES_NAMES = ['240p · PS1-ish', '360p', '448p · PS2', '540p', '720p · HD-ish'];

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
    const b = `BANK ${money(bank)}`;
    if (b !== this._bank) $('bank').textContent = this._bank = b;
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
  openDialog({ name, text, choices, onClose }) {
    this.modal = 'dialog';
    this.dialog = { name, text, choices: choices?.length ? choices : [{ label: 'OK', fn: () => this.closeDialog() }], onClose, shown: 0, typing: true, sel: 0 };
    $('dialog').classList.remove('hidden');
    $('dialog-name').textContent = name;
    $('dialog-text').textContent = '';
    $('dialog-choices').innerHTML = '';
    $('hint').classList.remove('show');
    this.hintTimer = 0;
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

  // ---------------------------------------------------------------- menus
  openWardrobe(app, onChange, onClose) {
    this.modal = 'wardrobe';
    this.menu = { kind: 'wardrobe', app: { ...app }, sel: 0, onChange, onClose };
    $('wardrobe').classList.remove('hidden');
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

  closeMenu() {
    const m = this.menu;
    if (!m) return;
    this.menu = null;
    this.modal = null;
    $('wardrobe').classList.add('hidden');
    $('pause').classList.add('hidden');
    this.audio.blip(false);
    m.onClose?.(m.kind === 'wardrobe' ? m.app : m.s);
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
