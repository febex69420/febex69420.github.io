// smoke.test.mjs — pure-logic tests that run under plain Node (no THREE, no DOM).
// Run: node smoke.test.mjs
import {
  sliceConvex, meshVolume, meshCentroid, planeFromPointNormal, planeFromThreePoints,
} from './src/physics/slicer.js';
import {
  BehaviorTree, Sequence, Selector, seq, sel, act, cond, inv, wait, cooldown,
  SUCCESS, FAILURE, RUNNING,
} from './src/ai/behavior_tree.js';
import { mulberry32, strSeed, fbm2, RNG, clamp, lerp, smoothstep, RingBuffer, EventBus } from './src/core/util.js';

let pass = 0, fail = 0;
const eq = (a, b, msg) => { if (a === b) { pass++; } else { fail++; console.error(`✗ ${msg}: got ${a} want ${b}`); } };
const near = (a, b, eps, msg) => { if (Math.abs(a - b) <= eps) { pass++; } else { fail++; console.error(`✗ ${msg}: got ${a} want ~${b}`); } };
const ok = (c, msg) => { if (c) { pass++; } else { fail++; console.error(`✗ ${msg}`); } };

// ---- a unit cube as triangle soup, centered at origin, edge 2 (from -1..1) ----
function unitCube() {
  const positions = [];
  const normals = [];
  const uvs = [];
  // 6 faces, 2 tris each, CCW outward
  const faces = [
    { n: [0, 0, 1], a: [-1, -1, 1], u: [2, 0, 0], v: [0, 2, 0] },
    { n: [0, 0, -1], a: [1, -1, -1], u: [-2, 0, 0], v: [0, 2, 0] },
    { n: [1, 0, 0], a: [1, -1, 1], u: [0, 0, -2], v: [0, 2, 0] },
    { n: [-1, 0, 0], a: [-1, -1, -1], u: [0, 0, 2], v: [0, 2, 0] },
    { n: [0, 1, 0], a: [-1, 1, 1], u: [2, 0, 0], v: [0, 0, -2] },
    { n: [0, -1, 0], a: [-1, -1, -1], u: [2, 0, 0], v: [0, 0, 2] },
  ];
  for (const f of faces) {
    const p0 = f.a;
    const p1 = [f.a[0] + f.u[0], f.a[1] + f.u[1], f.a[2] + f.u[2]];
    const p2 = [f.a[0] + f.u[0] + f.v[0], f.a[1] + f.u[1] + f.v[1], f.a[2] + f.u[2] + f.v[2]];
    const p3 = [f.a[0] + f.v[0], f.a[1] + f.v[1], f.a[2] + f.v[2]];
    for (const tri of [[p0, p1, p2], [p0, p2, p3]]) {
      for (const p of tri) { positions.push(...p); normals.push(...f.n); uvs.push(0, 0); }
    }
  }
  return { positions, normals, uvs };
}

// ===================== Slicer =====================
{
  const cube = unitCube();
  near(meshVolume(cube.positions), 8, 1e-3, 'cube volume == 8');

  // Slice exactly through the middle on the X axis.
  const plane = planeFromPointNormal([0, 0, 0], [1, 0, 0]);
  const r = sliceConvex(cube, plane);
  ok(r, 'slice returns a result');
  const vp = meshVolume(r.positive.positions);
  const vn = meshVolume(r.negative.positions);
  near(vp, 4, 1e-3, 'positive half volume == 4');
  near(vn, 4, 1e-3, 'negative half volume == 4');
  near(vp + vn, 8, 1e-3, 'halves conserve volume');
  // pieces are watertight enough that centroids are offset to each side
  ok(meshCentroid(r.positive.positions)[0] > 0, 'positive centroid on +x');
  ok(meshCentroid(r.negative.positions)[0] < 0, 'negative centroid on -x');
  ok(r.positive.capStart < r.positive.positions.length / 3, 'positive has cap tris');
  ok(r.negative.capStart > 0, 'negative has surface tris');

  // Angled cut still conserves volume.
  const plane2 = planeFromPointNormal([0.2, 0, 0], [1, 0.7, 0.3]);
  const r2 = sliceConvex(cube, plane2);
  ok(r2, 'angled slice returns');
  near(meshVolume(r2.positive.positions) + meshVolume(r2.negative.positions), 8, 1e-2, 'angled halves conserve volume');

  // Re-slice a piece (repeated cuts stay exact).
  const r3 = sliceConvex(r.positive, planeFromPointNormal([0.5, 0, 0], [1, 0, 0]));
  ok(r3, 're-slice of a piece works');
  near(meshVolume(r3.positive.positions) + meshVolume(r3.negative.positions), 4, 1e-2, 're-slice conserves piece volume');

  // Plane that misses the mesh → null.
  const miss = sliceConvex(cube, planeFromPointNormal([5, 0, 0], [1, 0, 0]));
  eq(miss, null, 'missing plane returns null');

  // Three-point plane helper.
  const p3p = planeFromThreePoints([0, 0, 0], [1, 0, 0], [0, 1, 0]);
  ok(p3p && Math.abs(Math.abs(p3p.nz) - 1) < 1e-6, 'three-point plane normal is ±z');
}

// ===================== Behavior Tree =====================
{
  const log = [];
  const tree = new BehaviorTree(seq(
    act(() => { log.push('a'); return SUCCESS; }),
    cond(() => true),
    act(() => { log.push('b'); return SUCCESS; }),
  ));
  const bb = {}; const ctx = { time: 0 };
  eq(tree.tick(bb, ctx), SUCCESS, 'sequence success');
  eq(log.join(','), 'a,b', 'sequence ran in order');

  // Selector falls through failures to the first success.
  const t2 = new BehaviorTree(sel(
    cond(() => false),
    act(() => FAILURE),
    act(() => SUCCESS),
  ));
  eq(t2.tick({}, { time: 0 }), SUCCESS, 'selector picks first success');

  // Inverter flips.
  eq(new BehaviorTree(inv(cond(() => false))).tick({}, { time: 0 }), SUCCESS, 'inverter true');

  // Wait stays RUNNING then SUCCEEDS after the duration.
  const wbb = {};
  const wt = new BehaviorTree(wait(1.0));
  eq(wt.tick(wbb, { time: 0 }), RUNNING, 'wait running at t=0');
  eq(wt.tick(wbb, { time: 0.5 }), RUNNING, 'wait running at t=0.5');
  eq(wt.tick(wbb, { time: 1.1 }), SUCCESS, 'wait success after duration');

  // Cooldown blocks repeat success within the window.
  const cbb = {};
  const ct = new BehaviorTree(cooldown(2.0, act(() => SUCCESS)));
  eq(ct.tick(cbb, { time: 0 }), SUCCESS, 'cooldown first success');
  eq(ct.tick(cbb, { time: 1.0 }), FAILURE, 'cooldown blocks within window');
  eq(ct.tick(cbb, { time: 2.5 }), SUCCESS, 'cooldown allows after window');

  // Sequence with memory resumes at the RUNNING child.
  let phase = 0;
  const mseq = new BehaviorTree(new Sequence([
    act(() => SUCCESS),
    act(() => (phase < 2 ? (phase++, RUNNING) : SUCCESS)),
    act(() => SUCCESS),
  ], true));
  const mbb = {};
  eq(mseq.tick(mbb, { time: 0 }), RUNNING, 'memory seq running 1');
  eq(mseq.tick(mbb, { time: 0 }), RUNNING, 'memory seq running 2');
  eq(mseq.tick(mbb, { time: 0 }), SUCCESS, 'memory seq completes');
}

// ===================== Core util =====================
{
  const r1 = mulberry32(12345), r2 = mulberry32(12345);
  eq(r1(), r2(), 'mulberry32 deterministic');
  eq(strSeed('Lumera'), strSeed('Lumera'), 'strSeed deterministic');
  ok(strSeed('a') !== strSeed('b'), 'strSeed varies');

  const n = fbm2(3.2, 5.7, { seed: 7 });
  ok(n >= 0 && n <= 1, 'fbm2 in [0,1]');
  eq(fbm2(3.2, 5.7, { seed: 7 }), n, 'fbm2 deterministic');

  eq(clamp(5, 0, 1), 1, 'clamp upper');
  eq(lerp(0, 10, 0.5), 5, 'lerp mid');
  near(smoothstep(0, 1, 0.5), 0.5, 1e-9, 'smoothstep mid');

  const rng = new RNG('seed');
  const v = rng.int(1, 6); ok(v >= 1 && v <= 6, 'RNG.int in range');

  const rb = new RingBuffer(3);
  rb.push(1); rb.push(2); rb.push(3); rb.push(4);
  eq(rb.len, 3, 'ring capped');
  eq(rb.get(0), 2, 'ring dropped oldest');

  const bus = new EventBus(); let got = 0;
  bus.on('x', (v) => { got = v; });
  bus.emit('x', 42);
  eq(got, 42, 'eventbus delivers');
}

console.log(`\nsmoke.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
