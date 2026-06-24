/* ============================================================
   input.js — keyboard + on-screen touch input
   Exposes a global `Input` with held + edge-triggered state.
   ============================================================ */
(function () {
  'use strict';

  // physical key -> logical action
  function actionFor(e) {
    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA': return 'left';
      case 'ArrowRight':
      case 'KeyD': return 'right';
      case 'ArrowUp':
      case 'KeyW':
      case 'Space': return 'jump';
      case 'KeyE':
      case 'Enter': return 'interact';
      case 'Tab': return 'menu';
      case 'Escape': return 'escape';
      case 'Digit1': case 'Numpad1': return 'd1';
      case 'Digit2': case 'Numpad2': return 'd2';
      case 'Digit3': case 'Numpad3': return 'd3';
      case 'Digit4': case 'Numpad4': return 'd4';
      case 'Digit5': case 'Numpad5': return 'd5';
      case 'Digit6': case 'Numpad6': return 'd6';
      case 'Digit7': case 'Numpad7': return 'd7';
      default: return null;
    }
  }

  // actions that should never let the browser do its default thing
  const PREVENT = new Set(['left', 'right', 'jump', 'menu', 'escape',
    'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7']);

  const Input = {
    held: {},        // currently down
    pressed: {},     // went down this frame (edge)
    _wasDown: {},

    init() {
      window.addEventListener('keydown', (e) => {
        const a = actionFor(e);
        if (!a) return;
        if (PREVENT.has(a)) e.preventDefault();
        if (e.repeat) return;
        if (!this._wasDown[a]) this.pressed[a] = true;
        this._wasDown[a] = true;
        this.held[a] = true;
      }, { passive: false });

      window.addEventListener('keyup', (e) => {
        const a = actionFor(e);
        if (!a) return;
        this._wasDown[a] = false;
        this.held[a] = false;
      });

      // dropping focus releases everything (prevents stuck-key runaway)
      window.addEventListener('blur', () => { this.held = {}; this._wasDown = {}; });

      this._bindTouch();
    },

    _bindTouch() {
      const press = (a) => {
        if (!this._wasDown[a]) this.pressed[a] = true;
        this._wasDown[a] = true;
        this.held[a] = true;
      };
      const release = (a) => { this._wasDown[a] = false; this.held[a] = false; };

      document.querySelectorAll('.tbtn[data-key]').forEach((btn) => {
        const a = btn.getAttribute('data-key');
        const start = (e) => { e.preventDefault(); press(a); };
        const end = (e) => { e.preventDefault(); release(a); };
        btn.addEventListener('touchstart', start, { passive: false });
        btn.addEventListener('touchend', end, { passive: false });
        btn.addEventListener('touchcancel', end, { passive: false });
        btn.addEventListener('mousedown', start);
        btn.addEventListener('mouseup', end);
        btn.addEventListener('mouseleave', end);
      });
    },

    down(a) { return !!this.held[a]; },
    once(a) { return !!this.pressed[a]; },

    // call at the very end of each frame
    endFrame() { this.pressed = {}; }
  };

  window.Input = Input;
})();
