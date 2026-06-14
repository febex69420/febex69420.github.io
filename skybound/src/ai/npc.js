// npc.js — the citizen: identity, emotions, memory, perception, schedule, and the
// concrete Action Tree (built on behavior_tree.js) that decides its high-level state.
// The crowd manager executes the resulting intent via steering and instanced rendering.
import { RingBuffer, RNG, clamp, clamp01, lerp } from '../core/util.js';
import { BehaviorTree, sel, seq, cond, act, SUCCESS, FAILURE } from './behavior_tree.js';

export const EMO = ['joy', 'fear', 'admiration', 'surprise', 'anger'];

let _nid = 0;
export class NPC {
  constructor(rng) {
    this.id = _nid++;
    this.rng = rng || new RNG(this.id + 1);
    this.pos = { x: 0, y: 0, z: 0 };
    this.vel = { x: 0, z: 0 };
    this.heading = this.rng.float(0, 6.28);
    this.speedMul = 0.85 + this.rng.float(0, 0.5);
    this.role = this.rng.pick(['commuter', 'shopper', 'tourist', 'jogger', 'worker']);
    this.home = { x: 0, z: 0 }; this.work = { x: 0, z: 0 };
    this.goal = null;
    this.state = 'routine';
    this.emotion = { joy: 0.2, fear: 0, admiration: 0.3, surprise: 0, anger: 0 };
    this.memory = new RingBuffer(8);
    this.animPhase = this.rng.float(0, 6.28);
    this.photoCd = 0; this.actCd = 0; this.scheduleCursor = 0;
    this.lod = 2;
    this.active = false;
    // appearance (procedural, original): hue + build
    this.hue = this.rng.int(0, 360);
    this.shade = 0.4 + this.rng.float(0, 0.45);
    this.build = 0.85 + this.rng.float(0, 0.4);
    this.bb = this;          // the NPC is its own blackboard
    this.tree = CITIZEN_TREE;
  }

  perceive(kind, dist, intensity) {
    const close = clamp01(1 - dist / 70) * intensity;
    const e = this.emotion;
    switch (kind) {
      case 'rescue': e.admiration += close * 0.9; e.joy += close * 0.7; break;
      case 'laser': case 'thermal': e.admiration += close * 0.5; e.surprise += close * 0.6; break;
      case 'pulse': case 'gale': case 'clap': case 'groundslam': case 'sonicboom':
        e.surprise += close * 0.7; e.admiration += close * 0.35; if (dist < 18) e.fear += close * 0.4; break;
      case 'flyby': case 'dash': case 'superjump': e.admiration += close * 0.5; e.surprise += close * 0.4; break;
      case 'destruction': e.surprise += close * 0.6; if (dist < 24) e.fear += close * 0.6; else e.admiration += close * 0.2; break;
      case 'combat': e.fear += close * 0.5; e.surprise += close * 0.4; break;
      case 'emergency': e.fear += close * 0.9; break;
      default: e.surprise += close * 0.3;
    }
    for (const k of EMO) e[k] = clamp01(e[k]);
    this.memory.push({ kind, dist, t: 0 });
  }

  decayEmotions(dt) {
    const e = this.emotion;
    e.fear = Math.max(0, e.fear - dt * 0.35);
    e.surprise = Math.max(0, e.surprise - dt * 0.5);
    e.admiration = lerp(e.admiration, 0.3, dt * 0.12);
    e.joy = lerp(e.joy, 0.25, dt * 0.1);
    e.anger = Math.max(0, e.anger - dt * 0.4);
  }
}

// --------------------------------------------------------- Action Tree ----
// Conditions/actions read the NPC (bb) and a shared ctx { hero, danger, time, crowd }.
function heroNear(bb, ctx) { return dist2(bb.pos, ctx.hero.pos) < 110 * 110; }
function dangerNear(bb, ctx) { return ctx.danger.near(bb.pos, 30); }
function dist2(a, b) { const dx = a.x - b.x, dz = a.z - b.z; return dx * dx + dz * dz; }

const CITIZEN_TREE = new BehaviorTree(sel(
  // 1. Flee from danger
  seq(
    cond((bb, ctx) => bb.emotion.fear > 0.45 || dangerNear(bb, ctx)),
    act((bb, ctx) => { bb.state = 'flee'; bb.goal = ctx.danger.fleeFrom(bb.pos); return SUCCESS; }),
  ),
  // 2. Adore the hero (gather, cheer, wave, photo, autograph)
  seq(
    cond((bb, ctx) => bb.emotion.admiration > 0.42 && heroNear(bb, ctx)),
    act((bb, ctx) => {
      bb.state = (dist2(bb.pos, ctx.hero.pos) < 16 * 16) ? 'adore' : 'gather';
      bb.goal = ctx.hero.pos;
      if (bb.emotion.admiration > 0.7 && bb.photoCd <= 0 && bb.rng.bool(0.02)) { bb.photoCd = 3; bb.wantPhoto = true; }
      return SUCCESS;
    }),
  ),
  // 3. Gawk / awe at a spectacle
  seq(
    cond((bb) => bb.emotion.surprise > 0.4),
    act((bb, ctx) => { bb.state = 'gawk'; bb.goal = ctx.hero.pos; return SUCCESS; }),
  ),
  // 4. Default: daily routine
  act((bb) => { if (bb.state !== 'routine') bb.state = 'routine'; return SUCCESS; }),
));

export { CITIZEN_TREE };
