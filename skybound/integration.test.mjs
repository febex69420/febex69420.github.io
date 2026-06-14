// integration.test.mjs — broader pure-logic checks across systems. node integration.test.mjs
import { Progression, xpForLevel, SKILLS } from './src/progression.js';
import { migrate } from './src/core/settings.js';
import { generateCityPlan, GRID, DISTRICT } from './src/world/cityplan.js';
import { sliceConvex, meshVolume } from './src/physics/slicer.js';
import { RNG } from './src/core/util.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('✗ ' + m); } };
const near = (a, b, e, m) => { if (Math.abs(a - b) <= e) pass++; else { fail++; console.error(`✗ ${m}: ${a} vs ${b}`); } };

// -------- progression --------
{
  const p = new Progression();
  let leveled = 0; p.onLevelUp = () => leveled++;
  ok(p.level === 1 && p.skillPoints === 0, 'progression starts at level 1');
  p.addXP(xpForLevel(1) + 1);
  ok(p.level === 2 && p.skillPoints === 1 && leveled === 1, 'levels up and grants a skill point');
  ok(p.upgrade('power') === true, 'can spend a skill point');
  ok(p.skillPoints === 0 && p.skills.power === 1, 'skill point spent');
  ok(p.upgrade('power') === false, 'cannot overspend');
  near(p.damageMul(), 1.2, 1e-9, 'damage multiplier reflects skill');
  p.addRenown(900);
  ok(p.tier() === 'City Guardian', 'renown tier computed');
  const s = p.serialize(); const p2 = new Progression(); p2.deserialize(s);
  ok(p2.level === p.level && p2.skills.power === 1 && p2.renown === p.renown, 'progression round-trips');
  // max skill cap
  for (let i = 0; i < 20; i++) { p.skillPoints = 1; p.upgrade('energy'); }
  ok(p.skills.energy <= SKILLS.energy.max, 'skill respects max');
}

// -------- save migration --------
{
  ok(migrate(null) === null, 'migrate null safe');
  const legacy = { state: { heroName: 'X', level: 4 } }; // no version
  const m = migrate(legacy);
  ok(m && m.version >= 1 && m.state.level === 4, 'legacy save migrates with version');
  const cur = { version: 1, time: 1, state: { level: 2 } };
  ok(migrate(cur).version === 1, 'current save unchanged');
}

// -------- city plan --------
{
  const a = generateCityPlan('Lumera'), b = generateCityPlan('Lumera'), c = generateCityPlan('Metroville');
  ok(a.blocks.length === GRID * GRID, 'full block grid');
  const sig = (p) => p.blocks.map((x) => x.district).join(',');
  ok(sig(a) === sig(b), 'plan deterministic by seed');
  ok(sig(a) !== sig(c), 'plan varies by seed');
  // district coverage: a healthy city has several district types present
  const kinds = new Set(a.blocks.map((x) => x.district));
  ok(kinds.has(DISTRICT.DOWNTOWN) && kinds.has(DISTRICT.RESIDENTIAL) && kinds.has(DISTRICT.WATER) && kinds.has(DISTRICT.PARK), 'districts varied');
  ok(a.landmarks.length >= 5, 'landmarks present');
  // building ids unique
  const ids = new Set(); let dup = 0; a.blocks.forEach((bl) => bl.buildings.forEach((bd) => { if (ids.has(bd.id)) dup++; ids.add(bd.id); }));
  ok(dup === 0, 'building ids unique');
}

// -------- slicer stress: many random cuts conserve total volume --------
{
  function unitCube() {
    const positions = [], normals = [], uvs = [];
    const F = [[[0, 0, 1], [-1, -1, 1], [2, 0, 0], [0, 2, 0]], [[0, 0, -1], [1, -1, -1], [-2, 0, 0], [0, 2, 0]],
      [[1, 0, 0], [1, -1, 1], [0, 0, -2], [0, 2, 0]], [[-1, 0, 0], [-1, -1, -1], [0, 0, 2], [0, 2, 0]],
      [[0, 1, 0], [-1, 1, 1], [2, 0, 0], [0, 0, -2]], [[0, -1, 0], [-1, -1, -1], [2, 0, 0], [0, 0, 2]]];
    for (const [n, a, u, v] of F) {
      const p0 = a, p1 = [a[0] + u[0], a[1] + u[1], a[2] + u[2]], p2 = [a[0] + u[0] + v[0], a[1] + u[1] + v[1], a[2] + u[2] + v[2]], p3 = [a[0] + v[0], a[1] + v[1], a[2] + v[2]];
      for (const t of [[p0, p1, p2], [p0, p2, p3]]) for (const q of t) { positions.push(...q); normals.push(...n); uvs.push(0, 0); }
    }
    return { positions, normals, uvs };
  }
  const rng = new RNG(2024);
  let pieces = [unitCube()];
  const v0 = meshVolume(pieces[0].positions);
  for (let cut = 0; cut < 24; cut++) {
    const idx = rng.int(0, pieces.length - 1);
    const target = pieces[idx];
    const nx = rng.float(-1, 1), ny = rng.float(-1, 1), nz = rng.float(-1, 1);
    const l = Math.hypot(nx, ny, nz) || 1;
    const point = [rng.float(-0.9, 0.9), rng.float(-0.9, 0.9), rng.float(-0.9, 0.9)];
    const plane = { nx: nx / l, ny: ny / l, nz: nz / l, d: -(nx / l * point[0] + ny / l * point[1] + nz / l * point[2]) };
    const r = sliceConvex(target, plane);
    if (!r) continue;
    pieces.splice(idx, 1, r.positive, r.negative);
  }
  let vol = 0; for (const p of pieces) vol += meshVolume(p.positions);
  ok(pieces.length > 5, 'repeated random cuts produced many pieces (' + pieces.length + ')');
  near(vol, v0, 0.05, 'total volume conserved across many random cuts');
}

console.log(`\nintegration.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
