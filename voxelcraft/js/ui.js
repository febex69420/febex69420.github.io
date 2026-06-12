// ui.js — HUD, inventory & container screens, creative inventory, chat,
// pause/settings/death screens, drag-and-drop item handling.
import { ITEMS, ICON_COLS, ICON_PX, getIconSheet, stackMax } from './blocks.js';
import { matchRecipe, SMELT, FUEL } from './crafting.js';
import { runCommand } from './commands.js';
import { clamp } from './util.js';

export class UI {
  constructor(game) {
    this.game = game;
    this.cursor = null;          // stack held by mouse
    this.screen = null;          // 'inventory'|'crafting'|'furnace'|'chest'|'creative'|'pause'|'settings'|'death'
    this.chatOpen = false;
    this.chatLog = [];
    this.craftGrid = new Array(9).fill(null);
    this.craftSize = 2;
    this.container = null;       // {type, world, x,y,z}
    this.iconURL = null;
    this.creativeTab = 'building';
    this.creativeSearch = '';
    this.buildDOM();
  }

  // ---------- icons ----------
  applyIcon(el, id) {
    if (!this.iconURL) this.iconURL = getIconSheet().toDataURL();
    el.style.backgroundImage = `url(${this.iconURL})`;
    el.style.backgroundSize = `${ICON_COLS * ICON_PX * 2}px auto`;
    const x = (id % ICON_COLS) * ICON_PX * 2, y = ((id / ICON_COLS) | 0) * ICON_PX * 2;
    el.style.backgroundPosition = `-${x}px -${y}px`;
  }

  el(tag, cls, parent, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (parent) parent.appendChild(e);
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // ---------- DOM scaffolding ----------
  buildDOM() {
    const hud = document.getElementById('hud');
    this.crosshair = this.el('div', 'crosshair', hud, '+');
    this.hurtFlashEl = this.el('div', 'hurt-flash', hud);
    this.statsEl = this.el('div', 'stats', hud);
    this.heartsEl = this.el('div', 'hearts', this.statsEl);
    this.foodEl = this.el('div', 'food', this.statsEl);
    this.airEl = this.el('div', 'air', this.statsEl);
    this.hotbarEl = this.el('div', 'hotbar', hud);
    this.tipEl = this.el('div', 'item-tip', hud);
    this.debugEl = this.el('div', 'debug', hud);
    this.debugEl.style.display = 'none';
    this.chatLogEl = this.el('div', 'chat-log', hud);
    this.chatInputWrap = this.el('div', 'chat-input-wrap', hud);
    this.chatInput = this.el('input', 'chat-input', this.chatInputWrap);
    this.chatInput.maxLength = 256;
    this.chatInputWrap.style.display = 'none';
    this.modal = document.getElementById('modal');
    this.cursorEl = this.el('div', 'cursor-stack', document.body);
    this.cursorEl.style.display = 'none';

    for (let i = 0; i < 9; i++) {
      const s = this.el('div', 'slot hotbar-slot', this.hotbarEl);
      s.dataset.i = i;
    }
    this.refreshHotbar();
    this.bindGlobal();
  }

  bindGlobal() {
    document.addEventListener('mousemove', (e) => {
      if (this.cursor) {
        this.cursorEl.style.left = e.clientX - 16 + 'px';
        this.cursorEl.style.top = e.clientY - 16 + 'px';
      }
    });
    document.addEventListener('keydown', (e) => {
      const g = this.game;
      if (!g.running) return;
      if (this.chatOpen) {
        if (e.code === 'Escape') this.closeChat();
        else if (e.code === 'Enter') this.submitChat();
        return;
      }
      if (e.code === 'KeyE') {
        e.preventDefault();
        if (this.screen === null) g.player.gamemode === 1 ? this.openCreative() : this.openInventory();
        else if (['inventory', 'crafting', 'furnace', 'chest', 'creative'].includes(this.screen)) this.closeScreen();
      } else if (e.code === 'Escape') {
        if (this.screen && this.screen !== 'death') this.closeScreen();
      } else if (e.code === 'KeyT' && this.screen === null) {
        e.preventDefault();
        this.openChat('');
      } else if (e.code === 'Slash' && this.screen === null) {
        e.preventDefault();
        this.openChat('/');
      } else if (e.code === 'F3') {
        e.preventDefault();
        this.debugEl.style.display = this.debugEl.style.display === 'none' ? 'block' : 'none';
      }
    });
    document.addEventListener('pointerlockchange', () => {
      this.game.pointerLocked = document.pointerLockElement === this.game.canvas;
      if (!this.game.pointerLocked && this.game.running && this.screen === null && !this.chatOpen) {
        this.openPause();
      }
    });
  }

  anyScreenOpen() { return this.screen !== null; }

  lockPointer() {
    if (this.game.canvas.requestPointerLock) this.game.canvas.requestPointerLock();
  }

  // ---------- HUD ----------
  refreshHotbar() {
    const p = this.game.player;
    if (!p) return;
    const slots = this.hotbarEl.children;
    for (let i = 0; i < 9; i++) {
      const s = slots[i];
      s.classList.toggle('sel', i === p.sel);
      this.renderStackIn(s, p.inventory[i]);
    }
    const cur = p.inventory[p.sel];
    this.tipEl.textContent = cur ? ITEMS[cur.id].name : '';
    this.tipEl.style.opacity = 1;
    clearTimeout(this._tipT);
    this._tipT = setTimeout(() => { this.tipEl.style.opacity = 0; }, 1500);
  }

  renderStackIn(slotEl, stack) {
    slotEl.innerHTML = '';
    slotEl.style.backgroundImage = '';
    if (!stack) return;
    const ic = this.el('div', 'slot-icon', slotEl);
    this.applyIcon(ic, stack.id);
    if (stack.count > 1) this.el('span', 'slot-count', slotEl, stack.count);
    const def = ITEMS[stack.id];
    const maxDur = def.tool?.dur ?? def.armor?.dur;
    if (stack.dur !== undefined && maxDur && stack.dur < maxDur) {
      const bar = this.el('div', 'dur-bar', slotEl);
      const fill = this.el('div', 'dur-fill', bar);
      const f = stack.dur / maxDur;
      fill.style.width = (f * 100) + '%';
      fill.style.background = f > 0.5 ? '#5d5' : f > 0.2 ? '#dd5' : '#d55';
    }
  }

  refreshStats() {
    const p = this.game.player;
    if (!p) return;
    const surv = p.gamemode === 0;
    this.statsEl.style.display = surv ? 'flex' : 'none';
    if (!surv) return;
    const hearts = [];
    for (let i = 0; i < 10; i++) {
      const v = p.hp - i * 2;
      hearts.push(`<span class="${v >= 2 ? 'h-full' : v >= 1 ? 'h-half' : 'h-empty'}">♥</span>`);
    }
    this.heartsEl.innerHTML = hearts.join('');
    const food = [];
    for (let i = 0; i < 10; i++) {
      const v = p.food - i * 2;
      food.push(`<span class="${v >= 2 ? 'f-full' : v >= 1 ? 'f-half' : 'f-empty'}">⯈</span>`);
    }
    this.foodEl.innerHTML = food.join('');
    if (p.air < 10) {
      const bub = [];
      for (let i = 0; i < 10; i++) bub.push(`<span class="${p.air > i ? 'b-full' : 'b-empty'}">●</span>`);
      this.airEl.innerHTML = bub.join('');
      this.airEl.style.display = 'block';
    } else this.airEl.style.display = 'none';
  }

  flashHurt() {
    this.hurtFlashEl.style.opacity = 0.45;
    clearTimeout(this._hurtT);
    this._hurtT = setTimeout(() => { this.hurtFlashEl.style.opacity = 0; }, 180);
  }

  updateDebug() {
    if (this.debugEl.style.display === 'none') return;
    const g = this.game, p = g.player;
    const cx = Math.floor(p.pos.x) >> 4, cz = Math.floor(p.pos.z) >> 4;
    this.debugEl.innerHTML =
      `VoxelCraft | FPS ${g.fps | 0}<br>` +
      `XYZ: ${p.pos.x.toFixed(2)} / ${p.pos.y.toFixed(2)} / ${p.pos.z.toFixed(2)}<br>` +
      `Chunk: ${cx}, ${cz} (${g.world.chunks.size} loaded)<br>` +
      `Time: ${Math.floor(g.time)} | Day ${Math.floor(g.day)} | ${g.weather}<br>` +
      `Dim: ${g.world.dim === 0 ? 'Overworld' : 'Nether'} | Biome: ${g.biomeName()}<br>` +
      `Entities: ${g.entities.list.length} | Seed: ${g.seed}` +
      (g.mp && g.mp.peers.size ? `<br>Peers: ${g.mp.peers.size}` : '');
  }

  // ---------- chat ----------
  chatMsg(text, color) {
    this.chatLog.push({ text, color, t: Date.now() });
    if (this.chatLog.length > 80) this.chatLog.shift();
    this.renderChat();
  }

  renderChat() {
    const recent = this.chatLog.slice(-10);
    this.chatLogEl.innerHTML = recent
      .map(m => `<div class="chat-line" style="color:${m.color || '#fff'}">${escapeHTML(m.text)}</div>`).join('');
    this.chatLogEl.style.opacity = 1;
    clearTimeout(this._chatT);
    if (!this.chatOpen) this._chatT = setTimeout(() => { this.chatLogEl.style.opacity = 0; }, 6000);
  }

  openChat(prefill) {
    this.chatOpen = true;
    this.chatInputWrap.style.display = 'block';
    this.chatInput.value = prefill;
    this.renderChat();
    document.exitPointerLock?.();
    setTimeout(() => this.chatInput.focus(), 0);
  }

  closeChat() {
    this.chatOpen = false;
    this.chatInputWrap.style.display = 'none';
    this.chatInput.blur();
    this.lockPointer();
  }

  submitChat() {
    const text = this.chatInput.value.trim();
    this.closeChat();
    if (!text) return;
    if (text.startsWith('/')) {
      const reply = runCommand(this.game, text);
      if (reply) this.chatMsg(reply, '#ffd');
    } else {
      const line = `<${this.game.playerName}> ${text}`;
      this.chatMsg(line);
      this.game.mp?.sendChat(line);
    }
  }

  // ---------- screens ----------
  closeScreen(relock = true) {
    // return crafting grid items
    if (['inventory', 'crafting'].includes(this.screen)) {
      for (let i = 0; i < 9; i++) {
        if (this.craftGrid[i]) {
          const left = this.game.player.addItem(this.craftGrid[i]);
          if (left > 0) this.game.entities.dropItem(this.game.world, this.game.player.pos.x, this.game.player.pos.y + 1, this.game.player.pos.z, { ...this.craftGrid[i], count: left });
          this.craftGrid[i] = null;
        }
      }
    }
    if (this.cursor) {
      const left = this.game.player.addItem(this.cursor);
      if (left > 0) this.game.entities.dropItem(this.game.world, this.game.player.pos.x, this.game.player.pos.y + 1, this.game.player.pos.z, { ...this.cursor, count: left });
      this.cursor = null;
      this.renderCursor();
    }
    this.screen = null;
    this.container = null;
    this.modal.style.display = 'none';
    this.modal.innerHTML = '';
    this.refreshHotbar();
    if (relock && this.game.running && !this.game.player.dead) this.lockPointer();
  }

  openScreen(name) {
    this.screen = name;
    this.modal.style.display = 'flex';
    this.modal.innerHTML = '';
    document.exitPointerLock?.();
  }

  renderCursor() {
    if (this.cursor) {
      this.cursorEl.style.display = 'block';
      this.renderStackIn(this.cursorEl, this.cursor);
    } else {
      this.cursorEl.style.display = 'none';
    }
  }

  // generic slot element bound to {get,set} accessors
  slotEl(parent, ref, opts = {}) {
    const s = this.el('div', 'slot' + (opts.cls ? ' ' + opts.cls : ''), parent);
    this.renderStackIn(s, ref.get());
    s.addEventListener('mousedown', (e) => {
      e.preventDefault();
      if (opts.output) this.clickOutput(ref, e, opts);
      else if (e.shiftKey && opts.quickMove) opts.quickMove(ref);
      else this.clickSlot(ref, e.button, opts);
      this.rerenderScreen();
    });
    s.addEventListener('contextmenu', e => e.preventDefault());
    return s;
  }

  clickSlot(ref, button, opts = {}) {
    const cur = this.cursor;
    const slot = ref.get();
    const g = this.game;
    if (button === 0) {
      if (cur && slot && cur.id === slot.id && cur.dur === undefined && slot.dur === undefined) {
        const max = stackMax(slot.id);
        const take = Math.min(max - slot.count, cur.count);
        slot.count += take; cur.count -= take;
        if (cur.count <= 0) this.cursor = null;
        ref.set(slot);
      } else {
        if (cur && opts.filter && !opts.filter(cur)) return;
        ref.set(cur);
        this.cursor = slot;
      }
    } else if (button === 2) {
      if (!cur && slot) {
        const half = Math.ceil(slot.count / 2);
        this.cursor = { ...slot, count: half };
        slot.count -= half;
        ref.set(slot.count > 0 ? slot : null);
      } else if (cur && (!slot || (slot.id === cur.id && slot.count < stackMax(slot.id) && cur.dur === undefined))) {
        if (opts.filter && !opts.filter(cur)) return;
        if (!slot) ref.set({ ...cur, count: 1 });
        else { slot.count++; ref.set(slot); }
        cur.count--;
        if (cur.count <= 0) this.cursor = null;
      }
    }
    g.audio?.play('click', { vol: 0.3 });
    this.renderCursor();
    g.markUnsaved?.();
  }

  clickOutput(ref, e, opts) {
    const out = ref.get();
    if (!out) return;
    if (this.cursor) {
      if (this.cursor.id !== out.id || this.cursor.dur !== undefined) return;
      if (this.cursor.count + out.count > stackMax(out.id)) return;
      this.cursor.count += out.count;
    } else {
      this.cursor = { ...out };
    }
    opts.onTake?.();
    this.game.audio?.play('click', { vol: 0.3 });
    this.renderCursor();
  }

  rerenderScreen() {
    if (!this.screen) return;
    const sc = this.screen;
    if (sc === 'inventory') this.openInventory(true);
    else if (sc === 'crafting') this.openCrafting(true);
    else if (sc === 'furnace') this.renderFurnace();
    else if (sc === 'chest') this.renderChest();
    else if (sc === 'creative') this.renderCreative();
    this.refreshHotbar();
  }

  invRef(i) {
    const p = this.game.player;
    return { get: () => p.inventory[i], set: (v) => { p.inventory[i] = v; } };
  }
  craftRef(i) {
    return { get: () => this.craftGrid[i], set: (v) => { this.craftGrid[i] = v; } };
  }

  quickMoveInv(i) {
    // move between hotbar and main inventory (or into open container)
    const p = this.game.player;
    const s = p.inventory[i];
    if (!s) return;
    if (this.screen === 'chest' && this.container) {
      const items = this.containerMeta().items;
      if (this.tryInsert(items, s)) p.inventory[i] = s.count > 0 ? s : null;
      this.saveContainerMeta();
      return;
    }
    const target = i < 9 ? [9, 36] : [0, 9];
    const rest = this.tryInsertRange(p.inventory, s, target[0], target[1]);
    p.inventory[i] = rest > 0 ? { ...s, count: rest } : null;
  }

  tryInsert(arr, stack) {
    const max = stackMax(stack.id);
    for (let i = 0; i < arr.length && stack.count > 0; i++) {
      if (arr[i] && arr[i].id === stack.id && arr[i].dur === undefined && stack.dur === undefined && arr[i].count < max) {
        const t = Math.min(max - arr[i].count, stack.count);
        arr[i].count += t; stack.count -= t;
      }
    }
    for (let i = 0; i < arr.length && stack.count > 0; i++) {
      if (!arr[i]) { arr[i] = { ...stack }; stack.count = 0; }
    }
    return stack.count <= 0;
  }

  tryInsertRange(arr, stack, from, to) {
    const max = stackMax(stack.id);
    let count = stack.count;
    for (let i = from; i < to && count > 0; i++) {
      if (arr[i] && arr[i].id === stack.id && arr[i].dur === undefined && arr[i].count < max) {
        const t = Math.min(max - arr[i].count, count);
        arr[i].count += t; count -= t;
      }
    }
    for (let i = from; i < to && count > 0; i++) {
      if (!arr[i]) { arr[i] = { ...stack, count: Math.min(count, max) }; count -= arr[i].count; }
    }
    return count;
  }

  // player inventory rows: 9-35 main, 0-8 hotbar
  buildInvRows(parent) {
    const main = this.el('div', 'slot-grid g9', parent);
    for (let i = 9; i < 36; i++) this.slotEl(main, this.invRef(i), { quickMove: () => this.quickMoveInv(i) });
    const hot = this.el('div', 'slot-grid g9 hotrow', parent);
    for (let i = 0; i < 9; i++) this.slotEl(hot, this.invRef(i), { quickMove: () => this.quickMoveInv(i) });
  }

  buildCraftArea(parent, size) {
    this.craftSize = size;
    const wrap = this.el('div', 'craft-wrap', parent);
    const grid = this.el('div', 'slot-grid g' + size, wrap);
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
      this.slotEl(grid, this.craftRef(r * 3 + c));
    }
    this.el('div', 'craft-arrow', wrap, '→');
    const outRef = {
      get: () => {
        const ids = [];
        for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) ids.push(this.craftGrid[r * 3 + c]?.id ?? null);
        const m = matchRecipe(ids, size);
        if (!m) return null;
        const st = { id: m.id, count: m.count };
        const def = ITEMS[m.id];
        if (def.tool) st.dur = def.tool.dur;
        if (def.armor) st.dur = def.armor.dur;
        return st;
      },
      set: () => { },
    };
    this.slotEl(wrap, outRef, {
      output: true, cls: 'out',
      onTake: () => {
        for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
          const i = r * 3 + c;
          if (this.craftGrid[i]) {
            this.craftGrid[i].count--;
            if (this.craftGrid[i].count <= 0) this.craftGrid[i] = null;
          }
        }
        this.game.audio?.play('place_wood', { vol: 0.5 });
      },
    });
  }

  openInventory(rerender) {
    if (!rerender) { this.openScreen('inventory'); this.craftGrid.fill(null); }
    else this.modal.innerHTML = '';
    this.screen = 'inventory';
    const panel = this.el('div', 'panel', this.modal);
    this.el('h3', null, panel, 'Inventory');
    const top = this.el('div', 'inv-top', panel);
    // armor
    const armorCol = this.el('div', 'armor-col', top);
    const p = this.game.player;
    const names = ['Helmet', 'Chest', 'Legs', 'Boots'];
    for (let i = 0; i < 4; i++) {
      const ref = { get: () => p.armor[i], set: (v) => { p.armor[i] = v; } };
      const s = this.slotEl(armorCol, ref, { filter: (st) => ITEMS[st.id].armor?.slot === i });
      s.title = names[i];
    }
    this.buildCraftArea(top, 2);
    this.buildInvRows(panel);
  }

  openCrafting(rerender) {
    if (!rerender) { this.openScreen('crafting'); this.craftGrid.fill(null); }
    else this.modal.innerHTML = '';
    this.screen = 'crafting';
    const panel = this.el('div', 'panel', this.modal);
    this.el('h3', null, panel, 'Crafting Table');
    const top = this.el('div', 'inv-top', panel);
    this.buildCraftArea(top, 3);
    this.buildInvRows(panel);
  }

  // ---------- furnace ----------
  containerMeta() {
    const c = this.container;
    return c.world.getMeta(c.x, c.y, c.z) || {};
  }
  saveContainerMeta(m) {
    const c = this.container;
    const meta = m || this.containerMeta();
    c.world.setMeta(c.x, c.y, c.z, meta);
    this.game.markUnsaved?.();
    if (this.game.mp) this.game.mp.sendMeta(c.world.dim, c.x, c.y, c.z, meta);
  }

  openFurnace(world, x, y, z) {
    let m = world.getMeta(x, y, z);
    if (!m || !m.fitems) { m = { ...(m || {}), fitems: [null, null, null], burn: 0, burnMax: 0, prog: 0 }; world.setMeta(x, y, z, m); }
    this.container = { type: 'furnace', world, x, y, z };
    this.openScreen('furnace');
    this.renderFurnace();
  }

  renderFurnace() {
    this.modal.innerHTML = '';
    const panel = this.el('div', 'panel', this.modal);
    this.el('h3', null, panel, 'Furnace');
    const m = this.containerMeta();
    const fr = (i) => ({
      get: () => m.fitems[i],
      set: (v) => { m.fitems[i] = v; this.saveContainerMeta(m); },
    });
    const area = this.el('div', 'furnace-area', panel);
    const colL = this.el('div', 'furnace-col', area);
    this.slotEl(colL, fr(0));
    const flame = this.el('div', 'furnace-flame', colL);
    flame.textContent = '\u{1F525}';
    flame.style.opacity = m.burn > 0 ? clamp(m.burn / Math.max(1, m.burnMax), 0.25, 1) : 0.12;
    this.slotEl(colL, fr(1));
    const mid = this.el('div', 'furnace-col', area);
    const prog = this.el('div', 'furnace-prog', mid);
    this.el('div', 'furnace-prog-fill', prog).style.width = ((m.prog || 0) * 10) + '%';
    this.slotEl(this.el('div', 'furnace-col', area), fr(2), {
      output: true, cls: 'out', onTake: () => { m.fitems[2] = null; this.saveContainerMeta(m); },
    });
    this.buildInvRows(panel);
  }

  openChest(world, x, y, z) {
    let m = world.getMeta(x, y, z);
    if (!m || !m.items) {
      m = { ...(m || {}), items: new Array(27).fill(null) };
      // naturally generated (dungeon) chests have no meta yet and sit on dungeon floor
      const below = world.getBlock(x, y - 1, z);
      if (below === 4 /* cobble */ || below === 25 /* mossy */) m.loot = true;
      world.setMeta(x, y, z, m);
    }
    if (m.loot) {
      this.fillLoot(m);
      delete m.loot;
      world.setMeta(x, y, z, m);
    }
    this.container = { type: 'chest', world, x, y, z };
    this.openScreen('chest');
    this.renderChest();
  }

  fillLoot(m) {
    const table = [[282, 1, 5], [283, 1, 3], [295, 1, 2], [289, 2, 6], [294, 1, 3], [284, 1, 2], [285, 1, 1]];
    for (let i = 0; i < 5; i++) {
      const [id, a, b] = table[(Math.random() * table.length) | 0];
      m.items[(Math.random() * 27) | 0] = { id, count: a + ((Math.random() * (b - a + 1)) | 0) };
    }
  }

  renderChest() {
    this.modal.innerHTML = '';
    const panel = this.el('div', 'panel', this.modal);
    this.el('h3', null, panel, 'Chest');
    const m = this.containerMeta();
    const grid = this.el('div', 'slot-grid g9', panel);
    for (let i = 0; i < 27; i++) {
      const ref = {
        get: () => m.items[i],
        set: (v) => { m.items[i] = v; this.saveContainerMeta(m); },
      };
      this.slotEl(grid, ref, {
        quickMove: () => {
          const s = m.items[i];
          if (!s) return;
          const rest = this.tryInsertRange(this.game.player.inventory, s, 0, 36);
          m.items[i] = rest > 0 ? { ...s, count: rest } : null;
          this.saveContainerMeta(m);
        },
      });
    }
    this.buildInvRows(panel);
  }

  // ---------- creative ----------
  openCreative() {
    this.openScreen('creative');
    this.renderCreative();
  }

  renderCreative() {
    this.modal.innerHTML = '';
    const panel = this.el('div', 'panel wide', this.modal);
    this.el('h3', null, panel, 'Creative Inventory');
    const tabs = this.el('div', 'tabs', panel);
    const tabDefs = [['building', 'Blocks'], ['deco', 'Decoration'], ['redstone', 'Redstone'], ['tools', 'Tools & Combat'], ['food', 'Food'], ['misc', 'Materials']];
    for (const [key, label] of tabDefs) {
      const t = this.el('button', 'tab' + (this.creativeTab === key ? ' active' : ''), tabs, label);
      t.onclick = () => { this.creativeTab = key; this.renderCreative(); };
    }
    const search = this.el('input', 'search', panel);
    search.placeholder = 'Search items…';
    search.value = this.creativeSearch;
    search.oninput = () => { this.creativeSearch = search.value; renderGrid(); };
    const grid = this.el('div', 'slot-grid g9 creative-grid', panel);
    const renderGrid = () => {
      grid.innerHTML = '';
      const q = this.creativeSearch.toLowerCase();
      for (const idStr of Object.keys(ITEMS)) {
        const id = +idStr;
        const def = ITEMS[id];
        if (q) { if (!def.name.toLowerCase().includes(q)) continue; }
        else if (def.tab !== this.creativeTab) continue;
        const ref = {
          get: () => ({ id, count: 1 }),
          set: () => { },
        };
        const s = this.el('div', 'slot', grid);
        this.renderStackIn(s, { id, count: 1 });
        s.title = def.name;
        s.addEventListener('mousedown', (e) => {
          e.preventDefault();
          if (e.shiftKey) { this.game.player.give(id, stackMax(id)); this.refreshHotbar(); return; }
          if (e.button === 0) {
            if (this.cursor && this.cursor.id === id) this.cursor.count = Math.min(stackMax(id), this.cursor.count + 1);
            else { const st = { id, count: 1 }; const d = ITEMS[id]; if (d.tool) st.dur = d.tool.dur; if (d.armor) st.dur = d.armor.dur; this.cursor = st; }
          } else if (e.button === 2) this.cursor = null;
          this.renderCursor();
        });
        s.addEventListener('contextmenu', e => e.preventDefault());
      }
    };
    renderGrid();
    this.el('p', 'hint', panel, 'Click an item to grab it (shift-click for a full stack). Right-click to clear held. Drop into your inventory below.');
    this.buildInvRows(panel);
  }

  // ---------- pause / settings / death ----------
  openPause() {
    this.openScreen('pause');
    const panel = this.el('div', 'panel menu', this.modal);
    this.el('h3', null, panel, 'Game Paused');
    const mk = (label, fn) => { const b = this.el('button', 'menu-btn', panel, label); b.onclick = fn; return b; };
    mk('Back to Game', () => this.closeScreen());
    mk('Settings', () => { this.closeScreenSoft(); this.openSettings('pause'); });
    mk('Save & Quit to Title', () => {
      this.closeScreenSoft();
      this.game.quitToTitle();
    });
  }

  closeScreenSoft() {
    this.screen = null;
    this.modal.style.display = 'none';
    this.modal.innerHTML = '';
  }

  openSettings(returnTo) {
    this.openScreen('settings');
    const g = this.game;
    const panel = this.el('div', 'panel menu', this.modal);
    this.el('h3', null, panel, 'Settings');
    const slider = (label, min, max, step, val, fn) => {
      const row = this.el('div', 'setting-row', panel);
      const lab = this.el('label', null, row, label + ': ' + val);
      const s = this.el('input', null, row);
      s.type = 'range'; s.min = min; s.max = max; s.step = step; s.value = val;
      s.oninput = () => { fn(+s.value); lab.textContent = label + ': ' + s.value; };
      return s;
    };
    slider('Render Distance', 2, 10, 1, g.settings.renderDist, v => { g.settings.renderDist = v; g.saveSettings(); });
    slider('FOV', 50, 110, 1, g.settings.fov, v => { g.settings.fov = v; g.camera.fov = v; g.camera.updateProjectionMatrix(); g.saveSettings(); });
    slider('Mouse Sensitivity', 0.2, 3, 0.1, g.settings.sensitivity, v => { g.settings.sensitivity = v; g.saveSettings(); });
    slider('Master Volume', 0, 1, 0.05, g.audio.volumes.master, v => { g.audio.setVolume('master', v); g.settings.volMaster = v; g.saveSettings(); });
    slider('SFX Volume', 0, 1, 0.05, g.audio.volumes.sfx, v => { g.audio.setVolume('sfx', v); g.settings.volSfx = v; g.saveSettings(); });
    slider('Music Volume', 0, 1, 0.05, g.audio.volumes.music, v => { g.audio.setVolume('music', v); g.settings.volMusic = v; g.saveSettings(); });
    const back = this.el('button', 'menu-btn', panel, 'Done');
    back.onclick = () => {
      this.closeScreenSoft();
      if (returnTo === 'pause' && this.game.running) this.openPause();
      else if (!this.game.running) this.game.showTitle();
    };
  }

  showDeath(source) {
    this.openScreen('death');
    const panel = this.el('div', 'panel menu death-panel', this.modal);
    this.el('h3', null, panel, 'You Died!');
    const causes = { fall: 'You fell from a high place', lava: 'You tried to swim in lava', drown: 'You drowned', mob: 'You were slain', explosion: 'You were blown up', arrow: 'You were shot', cactus: 'You were pricked to death', void: 'You fell out of the world', starve: 'You starved to death' };
    this.el('p', null, panel, causes[source] || 'You died');
    const b = this.el('button', 'menu-btn', panel, 'Respawn');
    b.onclick = () => { this.game.player.respawn(); };
    const b2 = this.el('button', 'menu-btn', panel, 'Title Screen');
    b2.onclick = () => { this.game.player.respawn(); this.game.quitToTitle(); };
  }

  hideDeath() { this.closeScreen(); }
}

function escapeHTML(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
