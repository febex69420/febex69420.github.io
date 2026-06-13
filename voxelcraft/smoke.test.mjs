import { WorldGen, BIOMES } from './js/worldgen.js';
import { B, BLOCKS, ITEMS, breakTime, getDrops, TEX } from './js/blocks.js';
import { World } from './js/world.js';
import { matchRecipe, SMELT, FUEL } from './js/crafting.js';
import { CS, CH, idx3 } from './js/util.js';

let fails = 0;
const ok = (cond, msg) => { if (!cond) { console.log('FAIL:', msg); fails++; } else console.log('ok:', msg); };

// --- worldgen ---
const gen = new WorldGen(12345, 0);
const blocks = gen.generateChunk(0, 0);
ok(blocks.length === CS*CS*CH, 'chunk size');
ok(blocks[idx3(0,0,0)] === B.BEDROCK, 'bedrock floor');
let hasStone=0, hasAir=0, top=0;
for (let i=0;i<blocks.length;i++){ if(blocks[i]===B.STONE)hasStone++; if(blocks[i]===B.AIR)hasAir++; }
ok(hasStone>1000 && hasAir>1000, 'terrain has stone & air');
const spawn = gen.findSpawn();
ok(spawn.y > 0 && spawn.y < CH, 'spawn found y='+spawn.y);
const ngen = new WorldGen(12345, 1);
const nblocks = ngen.generateChunk(0, 0);
let nether=0; for (let i=0;i<nblocks.length;i++) if(nblocks[i]===B.NETHERRACK) nether++;
ok(nether>1000, 'nether generates netherrack');

// --- world + lighting ---
const game = { redstone: null, mp: null, entities: null, markUnsaved(){}, audio:null };
const w = new World(game, 999, 0);
for (let cx=-1;cx<=1;cx++) for (let cz=-1;cz<=1;cz++) w.loadChunk(cx,cz);
const ty = w.getTopY(8,8);
ok(ty>0, 'topY '+ty);
ok(w.getSky(8, ty+2, 8) === 15, 'sky light above terrain = ' + w.getSky(8, ty+2, 8));
// place a glowstone in a dark cavity
w.setBlock(8, 5, 8, B.AIR);
w.setBlock(8, 6, 8, B.AIR);
w.setBlock(8, 5, 8, B.GLOWSTONE);
ok(w.getBlockLight(8, 6, 8) === 14, 'glowstone lights neighbor: ' + w.getBlockLight(8,6,8));
w.setBlock(8, 5, 8, B.AIR);
ok(w.getBlockLight(8, 6, 8) < 14, 'light removed after break: ' + w.getBlockLight(8,6,8));
// set/get + edits
w.setBlock(4, ty+1, 4, B.COBBLE);
ok(w.getBlock(4, ty+1, 4) === B.COBBLE, 'setBlock/getBlock');
const ser = w.serialize();
ok(Object.keys(ser.edits).length > 0, 'edits recorded');
// water tick
w.setBlock(2, ty+3, 2, B.WATER);
for (let i=0;i<60;i++) w.tick(8,8);
ok(w.getBlock(2, ty+2, 2) === B.WATER || w.getBlock(2, ty+1, 2) === B.WATER || w.getBlock(2, ty+3, 2) === B.WATER, 'water flows/persists');

// --- crafting ---
const g3 = new Array(9).fill(null);
g3[0]=B.LOG;
let m = matchRecipe(g3, 3);
ok(m && m.id===B.PLANKS && m.count===4, 'log -> planks');
const g2 = [B.PLANKS, null, B.PLANKS, null];
m = matchRecipe(g2, 2);
ok(m && m.count===4, 'sticks recipe: ' + JSON.stringify(m));
// pickaxe 3x3
const gp = [B.PLANKS,B.PLANKS,B.PLANKS, null,256,null, null,256,null];
m = matchRecipe(gp, 3);
ok(m && ITEMS[m.id].name==='Wooden Pickaxe', 'wooden pickaxe: '+(m&&ITEMS[m.id].name));
ok(SMELT[B.IRON_ORE], 'iron smelts');
ok(FUEL[282] === 80, 'coal fuel');

// --- block data sanity ---
for (const b of BLOCKS) {
  if (!b) continue;
  ok(Array.isArray(b.tex) && b.tex.length===6, 'tex array '+b.name);
  if (fails>20) break;
}
ok(breakTime(B.STONE, null) > breakTime(B.STONE, 262), 'stone pick faster than hand');
ok(getDrops(B.STONE, 262)[0].id === B.COBBLE, 'stone drops cobble with stone pick');
ok(getDrops(B.STONE, null).length === 0, 'stone needs pickaxe');
ok(getDrops(B.DIAMOND_ORE, 267).length === 1, 'diamond ore drops with iron pick');
ok(getDrops(B.DIAMOND_ORE, 262).length === 0, 'diamond ore needs iron tier');

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILURES`);
process.exit(fails?1:0);
