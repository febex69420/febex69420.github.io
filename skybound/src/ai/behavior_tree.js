// behavior_tree.js — the Action Tree that drives every NPC decision.
//
// A compact, allocation-light behavior tree. One tree instance is shared across many
// agents; all per-agent running state (memory indices, timers) lives on the agent's
// BLACKBOARD (bb), not on the nodes — so thousands of NPCs can tick the same tree.
//
// Pure: no THREE import → unit-testable. Status is a 3-state enum.

export const SUCCESS = 'success';
export const FAILURE = 'failure';
export const RUNNING = 'running';

let _nid = 0;

class Node {
  constructor() { this.id = _nid++; }
  tick(_bb, _ctx) { return FAILURE; }
}

// Per-agent scratch for memory/timers, lazily created.
function runState(bb) { return bb._bt || (bb._bt = {}); }

// ---------------------------------------------------------------- composites ----
export class Sequence extends Node {
  constructor(children, memory = false) { super(); this.children = children; this.memory = memory; }
  tick(bb, ctx) {
    const rs = this.memory ? runState(bb) : null;
    let i = this.memory ? (rs[this.id] | 0) : 0;
    for (; i < this.children.length; i++) {
      const st = this.children[i].tick(bb, ctx);
      if (st === RUNNING) { if (rs) rs[this.id] = i; return RUNNING; }
      if (st === FAILURE) { if (rs) rs[this.id] = 0; return FAILURE; }
    }
    if (rs) rs[this.id] = 0;
    return SUCCESS;
  }
}

export class Selector extends Node {
  constructor(children, memory = false) { super(); this.children = children; this.memory = memory; }
  tick(bb, ctx) {
    const rs = this.memory ? runState(bb) : null;
    let i = this.memory ? (rs[this.id] | 0) : 0;
    for (; i < this.children.length; i++) {
      const st = this.children[i].tick(bb, ctx);
      if (st === RUNNING) { if (rs) rs[this.id] = i; return RUNNING; }
      if (st === SUCCESS) { if (rs) rs[this.id] = 0; return SUCCESS; }
    }
    if (rs) rs[this.id] = 0;
    return FAILURE;
  }
}

// Ticks all children every tick. Succeeds when >= successThreshold succeed; fails if it
// becomes impossible to reach the threshold. RUNNING otherwise.
export class Parallel extends Node {
  constructor(children, successThreshold = 1) { super(); this.children = children; this.thr = successThreshold; }
  tick(bb, ctx) {
    let succ = 0, fail = 0;
    for (const c of this.children) {
      const st = c.tick(bb, ctx);
      if (st === SUCCESS) succ++; else if (st === FAILURE) fail++;
    }
    if (succ >= this.thr) return SUCCESS;
    if (this.children.length - fail < this.thr) return FAILURE;
    return RUNNING;
  }
}

// Picks one child by weight each entry; resumes the same child while it is RUNNING.
export class RandomSelector extends Node {
  constructor(children, weights = null) { super(); this.children = children; this.weights = weights; }
  pick(bb) {
    const r = (bb.rng ? bb.rng() : Math.random());
    if (!this.weights) return Math.floor(r * this.children.length);
    let total = 0; for (const w of this.weights) total += w;
    let x = r * total;
    for (let i = 0; i < this.weights.length; i++) { x -= this.weights[i]; if (x <= 0) return i; }
    return this.children.length - 1;
  }
  tick(bb, ctx) {
    const rs = runState(bb);
    let i = rs['rsel' + this.id];
    if (i == null) i = rs['rsel' + this.id] = this.pick(bb);
    const st = this.children[i].tick(bb, ctx);
    if (st !== RUNNING) rs['rsel' + this.id] = null;
    return st;
  }
}

// ---------------------------------------------------------------- decorators ----
export class Inverter extends Node {
  constructor(child) { super(); this.child = child; }
  tick(bb, ctx) { const s = this.child.tick(bb, ctx); return s === RUNNING ? RUNNING : s === SUCCESS ? FAILURE : SUCCESS; }
}
export class Succeeder extends Node {
  constructor(child) { super(); this.child = child; }
  tick(bb, ctx) { const s = this.child.tick(bb, ctx); return s === RUNNING ? RUNNING : SUCCESS; }
}
export class Repeat extends Node {
  constructor(child, count = Infinity) { super(); this.child = child; this.count = count; }
  tick(bb, ctx) {
    const rs = runState(bb); const key = 'rep' + this.id;
    let n = rs[key] | 0;
    const s = this.child.tick(bb, ctx);
    if (s === RUNNING) return RUNNING;
    n++; if (n >= this.count) { rs[key] = 0; return SUCCESS; }
    rs[key] = n; return RUNNING;
  }
}
// Gate a subtree behind a per-agent cooldown (seconds). While cooling down → FAILURE.
export class Cooldown extends Node {
  constructor(child, seconds) { super(); this.child = child; this.seconds = seconds; }
  tick(bb, ctx) {
    const rs = runState(bb); const key = 'cd' + this.id;
    const now = ctx.time || 0;
    if (rs[key] && now < rs[key]) return FAILURE;
    const s = this.child.tick(bb, ctx);
    if (s === SUCCESS) rs[key] = now + this.seconds;
    return s;
  }
}
// Guard: only ticks child when predicate(bb,ctx) is true; otherwise FAILURE.
export class Guard extends Node {
  constructor(pred, child) { super(); this.pred = pred; this.child = child; }
  tick(bb, ctx) { return this.pred(bb, ctx) ? this.child.tick(bb, ctx) : FAILURE; }
}

// ---------------------------------------------------------------- leaves ----
export class Condition extends Node {
  constructor(pred) { super(); this.pred = pred; }
  tick(bb, ctx) { return this.pred(bb, ctx) ? SUCCESS : FAILURE; }
}
export class Action extends Node {
  constructor(fn) { super(); this.fn = fn; }
  tick(bb, ctx) { const r = this.fn(bb, ctx); return r === undefined ? SUCCESS : r; }
}
// Wait a number of seconds (per-agent timer on the blackboard).
export class Wait extends Node {
  constructor(seconds) { super(); this.seconds = seconds; }
  tick(bb, ctx) {
    const rs = runState(bb); const key = 'wait' + this.id;
    const now = ctx.time || 0;
    if (rs[key] == null) rs[key] = now + (typeof this.seconds === 'function' ? this.seconds(bb) : this.seconds);
    if (now >= rs[key]) { rs[key] = null; return SUCCESS; }
    return RUNNING;
  }
}

// ---------------------------------------------------------------- builders ----
export const seq = (...c) => new Sequence(c);
export const seqM = (...c) => new Sequence(c, true);
export const sel = (...c) => new Selector(c);
export const selM = (...c) => new Selector(c, true);
export const par = (thr, ...c) => new Parallel(c, thr);
export const rsel = (children, weights) => new RandomSelector(children, weights);
export const cond = (fn) => new Condition(fn);
export const act = (fn) => new Action(fn);
export const inv = (n) => new Inverter(n);
export const ok = (n) => new Succeeder(n);
export const guard = (pred, n) => new Guard(pred, n);
export const cooldown = (secs, n) => new Cooldown(n, secs);
export const wait = (s) => new Wait(s);

// Build a reusable tree wrapper. `tick(bb, ctx)` drives one agent.
export class BehaviorTree {
  constructor(root) { this.root = root; }
  tick(bb, ctx) { return this.root.tick(bb, ctx); }
}
