// Keyboard + pointer-lock mouse input. Exposes edge-triggered `pressed()` and
// held `key()` queries; consumers read state each frame, no per-key callbacks.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.justPressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.buttons = [false, false, false];
    this.btnJust = [false, false, false];
    this.wheel = 0;
    this.locked = false;
    this.wantLock = false;

    window.addEventListener('keydown', e => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.justPressed.add(e.code);
      if (['Space', 'Tab', 'F1'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    document.addEventListener('mousemove', e => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    document.addEventListener('mousedown', e => {
      if (!this.locked) return;
      this.buttons[e.button] = true;
      this.btnJust[e.button] = true;
    });
    document.addEventListener('mouseup', e => { this.buttons[e.button] = false; });
    document.addEventListener('wheel', e => { if (this.locked) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) this.keys.clear();
    });
    document.addEventListener('contextmenu', e => { if (this.locked) e.preventDefault(); });
  }

  requestLock() {
    if (!this.locked) this.canvas.requestPointerLock?.();
  }
  releaseLock() {
    if (this.locked) document.exitPointerLock?.();
  }

  key(code) { return this.keys.has(code); }
  pressed(code) { return this.justPressed.has(code); }
  button(i) { return this.buttons[i]; }
  buttonPressed(i) { return this.btnJust[i]; }

  consumeMouse() {
    const d = { x: this.mouseDX, y: this.mouseDY };
    this.mouseDX = 0; this.mouseDY = 0;
    return d;   // wheel is consumed separately (weapon cycling)
  }
  endFrame() {
    this.justPressed.clear();
    this.btnJust[0] = this.btnJust[1] = this.btnJust[2] = false;
  }
}
