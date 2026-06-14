// input.js — keyboard/mouse (pointer lock) + gamepad, with a rebindable action map.
// Reports edge events (pressed/released) and held state per logical action.

// Default bindings: logical action -> array of physical codes (KeyboardEvent.code or
// 'Mouse0/1/2' or 'WheelUp/WheelDown'). All rebindable & persisted by settings.js.
export const DEFAULT_BINDINGS = {
  forward: ['KeyW'], back: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
  jump: ['Space'], descend: ['ControlLeft', 'KeyC'], sprint: ['ShiftLeft'],
  flyToggle: ['KeyF'], dash: ['KeyQ'], timewarp: ['KeyT'],
  laser: ['Mouse0'], thermal: ['Mouse2'], punch: ['Mouse0'],
  slam: ['KeyG'], clap: ['KeyC'], grab: ['KeyE'], throw: ['Mouse0'],
  pulse: ['KeyR'], cryo: ['KeyV'], gale: ['KeyX'],
  xray: ['KeyZ'], hearing: ['KeyH'], aegis: ['KeyB'],
  lockon: ['Mouse1'], powerWheel: ['Tab'], photo: ['KeyP'], sandbox: ['KeyM'],
  cycleNext: ['KeyE'], interact: ['KeyF'], pause: ['Escape'],
  nextPower: ['WheelDown'], prevPower: ['WheelUp'],
  prim1: ['Digit1'], prim2: ['Digit2'], prim3: ['Digit3'], prim4: ['Digit4'],
};

function codeFromMouse(button) { return 'Mouse' + button; }

export class Input {
  constructor(canvas, bindings = DEFAULT_BINDINGS) {
    this.canvas = canvas;
    this.bindings = JSON.parse(JSON.stringify(bindings || DEFAULT_BINDINGS));
    this.down = new Set();          // physical codes currently held
    this.pressedThisFrame = new Set();
    this.releasedThisFrame = new Set();
    this.mouse = { dx: 0, dy: 0, wheel: 0, x: 0, y: 0 };
    this.locked = false;
    this.enabled = true;
    this.sensitivity = 1;
    this.invertY = false;
    this.gamepadIndex = null;
    this._bind();
  }

  _bind() {
    const press = (code) => {
      if (!this.down.has(code)) this.pressedThisFrame.add(code);
      this.down.add(code);
    };
    const release = (code) => {
      this.down.delete(code);
      this.releasedThisFrame.add(code);
    };

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      // Allow typing in inputs (rebinding/name fields) to bypass game input.
      if (this._typing(e.target)) return;
      if (e.code === 'Tab') e.preventDefault();
      press(e.code);
      if (this._rebindResolver) { this._rebindResolver(e.code); e.preventDefault(); }
    });
    addEventListener('keyup', (e) => { if (this._typing(e.target)) return; release(e.code); });

    this.canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      press(codeFromMouse(e.button));
      if (this._rebindResolver) this._rebindResolver(codeFromMouse(e.button));
      else if (!this.locked && document.pointerLockElement !== this.canvas) this.requestLock();
    });
    addEventListener('mouseup', (e) => release(codeFromMouse(e.button)));
    addEventListener('mousemove', (e) => {
      if (this.locked) {
        this.mouse.dx += e.movementX || 0;
        this.mouse.dy += e.movementY || 0;
      }
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('wheel', (e) => {
      this.mouse.wheel += e.deltaY;
      if (e.deltaY > 0) press('WheelDown'); else if (e.deltaY < 0) press('WheelUp');
    }, { passive: true });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
    });
  }

  _typing(el) {
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
  }

  requestLock() { if (this.canvas.requestPointerLock) this.canvas.requestPointerLock(); }
  exitLock() { if (document.exitPointerLock) document.exitPointerLock(); }

  setBindings(b) { this.bindings = JSON.parse(JSON.stringify(b)); }

  // Begin capturing the next pressed key/button for `action`. Returns a Promise<code>.
  captureRebind() {
    return new Promise((resolve) => { this._rebindResolver = (code) => { this._rebindResolver = null; resolve(code); }; });
  }

  // ---- query API (logical actions) ----
  _codes(action) { return this.bindings[action] || []; }
  down_(action) { for (const c of this._codes(action)) if (this.down.has(c)) return true; return false; }
  pressed(action) { for (const c of this._codes(action)) if (this.pressedThisFrame.has(c)) return true; return false; }
  released(action) { for (const c of this._codes(action)) if (this.releasedThisFrame.has(c)) return true; return false; }
  isDown(action) { return this.down_(action); }

  // Movement vector from WASD (x = strafe, y = forward), normalized.
  moveAxis() {
    let x = 0, y = 0;
    if (this.down_('forward')) y += 1;
    if (this.down_('back')) y -= 1;
    if (this.down_('right')) x += 1;
    if (this.down_('left')) x -= 1;
    // Gamepad left stick overrides if present.
    const gp = this._gamepad();
    if (gp) {
      const gx = this._dz(gp.axes[0]), gy = this._dz(gp.axes[1]);
      if (gx || gy) { x = gx; y = -gy; }
    }
    const l = Math.hypot(x, y);
    return l > 1 ? { x: x / l, y: y / l } : { x, y };
  }

  _dz(v, dz = 0.18) { return Math.abs(v) < dz ? 0 : v; }
  _gamepad() {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  // Consume accumulated look delta (applies sensitivity & invert). Call once per frame.
  consumeLook() {
    const s = this.sensitivity * 0.0022;
    let dx = this.mouse.dx * s;
    let dy = this.mouse.dy * s * (this.invertY ? -1 : 1);
    const gp = this._gamepad();
    if (gp && gp.axes.length >= 4) {
      dx += this._dz(gp.axes[2]) * 0.045;
      dy += this._dz(gp.axes[3]) * 0.045 * (this.invertY ? -1 : 1);
    }
    this.mouse.dx = 0; this.mouse.dy = 0;
    return { dx, dy };
  }

  consumeWheel() { const w = this.mouse.wheel; this.mouse.wheel = 0; return w; }

  // Clear per-frame edge sets. Call at the END of each frame.
  endFrame() {
    this.pressedThisFrame.clear();
    this.releasedThisFrame.clear();
    // Wheel pseudo-keys are momentary.
    this.down.delete('WheelUp');
    this.down.delete('WheelDown');
  }
}
