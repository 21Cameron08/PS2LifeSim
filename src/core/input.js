// Keyboard + mouse + touch input, merged into one simple per-frame snapshot.
export class Input {
  constructor(el) {
    this.el = el;
    this.keys = new Set();
    this.pressed = new Set(); // keys that went down this frame
    this.lookDX = 0;
    this.lookDY = 0;
    this.wheel = 0;
    this.stick = { x: 0, y: 0, active: false, id: null, ox: 0, oy: 0 };
    this.dragId = null;
    this.lastX = 0;
    this.lastY = 0;
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.enabled = true;
    this.anyPress = false;
    this.lastLookTime = 0;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.code;
      this.keys.add(k);
      this.pressed.add(k);
      this.anyPress = true;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(k)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', (e) => this.onUp(e));
    el.addEventListener(
      'wheel',
      (e) => {
        this.wheel += Math.sign(e.deltaY);
        e.preventDefault();
      },
      { passive: false },
    );

    this.stickEl = document.getElementById('stick');
    this.stickKnob = document.getElementById('stick-knob');
  }

  onDown(e) {
    this.anyPress = true;
    const touch = e.pointerType === 'touch';
    if (touch && this.stick.id === null && e.clientX < innerWidth * 0.45 && e.clientY > innerHeight * 0.35) {
      this.stick.id = e.pointerId;
      this.stick.ox = e.clientX;
      this.stick.oy = e.clientY;
      this.stick.active = true;
      this.showStick(e.clientX, e.clientY, 0, 0);
      return;
    }
    if (this.dragId === null) {
      this.dragId = e.pointerId;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      try {
        this.el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
  }

  onMove(e) {
    if (e.pointerId === this.stick.id) {
      const max = 50;
      let dx = e.clientX - this.stick.ox;
      let dy = e.clientY - this.stick.oy;
      const len = Math.hypot(dx, dy);
      if (len > max) {
        dx = (dx / len) * max;
        dy = (dy / len) * max;
      }
      this.stick.x = dx / max;
      this.stick.y = dy / max;
      this.showStick(this.stick.ox, this.stick.oy, dx, dy);
      return;
    }
    if (e.pointerId === this.dragId) {
      const scale = e.pointerType === 'touch' ? 1.4 : 1;
      this.lookDX += (e.clientX - this.lastX) * scale;
      this.lookDY += (e.clientY - this.lastY) * scale;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.lastLookTime = performance.now();
    }
  }

  onUp(e) {
    if (e.pointerId === this.stick.id) {
      this.stick.id = null;
      this.stick.active = false;
      this.stick.x = this.stick.y = 0;
      if (this.stickEl) this.stickEl.style.display = 'none';
    }
    if (e.pointerId === this.dragId) this.dragId = null;
  }

  showStick(x, y, dx, dy) {
    if (!this.stickEl) return;
    this.stickEl.style.display = 'block';
    this.stickEl.style.left = `${x}px`;
    this.stickEl.style.top = `${y}px`;
    this.stickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  /** Simulate a key tap from an on-screen button. */
  tap(code) {
    this.pressed.add(code);
    this.anyPress = true;
  }

  down(...codes) {
    return this.enabled && codes.some((c) => this.keys.has(c));
  }

  hit(...codes) {
    return codes.some((c) => this.pressed.has(c));
  }

  /** Movement vector in camera space: x = right, y = forward. */
  move() {
    if (!this.enabled) return { x: 0, y: 0 };
    let x = 0;
    let y = 0;
    if (this.down('KeyW', 'ArrowUp')) y += 1;
    if (this.down('KeyS', 'ArrowDown')) y -= 1;
    if (this.down('KeyA', 'ArrowLeft')) x -= 1;
    if (this.down('KeyD', 'ArrowRight')) x += 1;
    if (this.stick.active) {
      x += this.stick.x;
      y -= this.stick.y;
    }
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  endFrame() {
    this.pressed.clear();
    this.lookDX = 0;
    this.lookDY = 0;
    this.wheel = 0;
    this.anyPress = false;
  }
}
