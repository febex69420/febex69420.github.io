// Headless integration tests: redstone, commands, entities data, world interactions.
import { World } from './js/world.js';
import { Redstone } from './js/redstone.js';
import { B, BLOCKS, ITEMS, I } from './js/blocks.js';
import { runCommand } from './js/commands.js';
import { MOBS } from './js/entities.js';
import { RECIPES, matchRecipe } from './js/crafting.js';

let fails = 0;
const ok = (cond, msg) => { if (!cond) { console.log('FAIL:', msg); fails++; } else console.log('ok:', msg); };

// stub game
const game = {
  redstone: null, mp: null, entities: { anyOnBlock: () => false, dropItem(){}, primeTNT(){}, spawn(){return{}} , list: []},
  markUnsaved(){}, audio: null, ui: { chatMsg(){}, refreshHotbar(){}, refreshStats(){} }, daylight: 1,
  peaceful: false,
};
game.redstone = new Redstone(game);
const w = new World(game, 777, 0);
game.world = w;
game.worlds = {0: w};
for (let cx=-1;cx<=1;cx++) for (let cz=-1;cz<=1;cz++) w.loadChunk(cx,cz);
const ty = w.getTopY(8,8);
const Y = ty + 1;

// --- redstone: lever -> wire -> lamp ---
// build a stone platform
for (let x=4;x<=14;x++) for (let z=6;z<=10;z++) w.setBlock(x, Y-1, 8, B.STONE);
for (let x=5;x<=12;x++) w.setBlock(x, Y, 8, B.AIR);
w.setBlock(5, Y, 8, B.LEVER, { meta: { on:false } });
for (let x=6;x<=9;x++) w.setBlock(x, Y, 8, B.WIRE, { meta: { p:0 } });
w.setBlock(10, Y, 8, B.RS_LAMP);
// flip lever
const m = w.getMeta(5, Y, 8) || {};
w.setMeta(5, Y, 8, { ...m, on: true });
game.redstone.onChange(w, 5, Y, 8);
ok((w.getMeta(6,Y,8)?.p ?? 0) > 0, 'wire powered next to lever: p=' + w.getMeta(6,Y,8)?.p);
ok((w.getMeta(9,Y,8)?.p ?? 0) > 0, 'wire carries power: p=' + w.getMeta(9,Y,8)?.p);
ok(w.getBlock(10, Y, 8) === B.GLOWSTONE_LIT, 'lamp lights up');
// flip off
w.setMeta(5, Y, 8, { on: false });
game.redstone.onChange(w, 5, Y, 8);
ok((w.getMeta(9,Y,8)?.p ?? 0) === 0, 'wire unpowered after lever off');
ok(w.getBlock(10, Y, 8) === B.RS_LAMP, 'lamp turns off');

// --- redstone torch inverter ---
w.setBlock(12, Y, 8, B.STONE);
w.setBlock(12, Y+1, 8, B.RS_TORCH);
game.redstone.tickTorch(w, 12, Y+1, 8);
ok(!(w.getMeta(12,Y+1,8)?.off), 'torch on with unpowered base');
// power the base with a redstone block adjacent
w.setBlock(13, Y, 8, B.RS_BLOCK);
game.redstone.tickTorch(w, 12, Y+1, 8);
ok(w.getMeta(12,Y+1,8)?.off === true, 'torch turns off when base powered');

// --- door ---
w.setBlock(7, Y-1, 6, B.STONE);
w.setBlock(7, Y, 6, B.DOOR, { meta: { facing: 0, open: false } });
w.setBlock(7, Y+1, 6, B.DOOR, { meta: { facing: 0, open: false, upper: true } });
ok(w.isSolidAt(7, Y, 6) === true, 'closed door is solid');
game.redstone.setDoor(w, 7, Y, 6, true, false);
ok(w.isSolidAt(7, Y, 6) === false, 'open door is passable');
ok(w.getMeta(7, Y+1, 6)?.open === true, 'both door halves open');

// --- commands ---
const player = {
  pos: { x: 8, y: Y, z: 8, set(x,y,z){ this.x=x; this.y=y; this.z=z; } },
  vel: { set(){} }, fallStart: null, gamemode: 0, flying: false,
  inventory: new Array(36).fill(null), armor: new Array(4).fill(null),
  give(id, n) { this.inventory[0] = { id, count: n }; return true; },
  lookDir: () => ({ x: 1, y: 0, z: 0 }),
  heal(){}, spawnPoint: null,
};
game.player = player;
game.time = 0; game.seed = 777;
game.setWeather = (x) => { game.weather = x; };
game.entities.spawn = () => ({});
let r = runCommand(game, '/give diamond 5');
ok(/Gave 5/.test(r), '/give: ' + r);
ok(player.inventory[0].id === I.DIAMOND, 'gave diamonds');
r = runCommand(game, '/time set night');
ok(game.time === 13500, '/time set night → ' + game.time);
r = runCommand(game, '/tp 100 70 ~5');
ok(player.pos.x === 100 && player.pos.z === 13, '/tp works: ' + JSON.stringify([player.pos.x, player.pos.z]));
r = runCommand(game, '/setblock 8 ' + (Y+3) + ' 8 glowstone');
ok(w.getBlock(8, Y+3, 8) === B.GLOWSTONE, '/setblock glowstone');
r = runCommand(game, '/gamemode creative');
ok(player.gamemode === 1, '/gamemode creative');
r = runCommand(game, '/fill 5 ' + (Y+5) + ' 5 7 ' + (Y+6) + ' 7 stone');
ok(w.getBlock(6, Y+5, 6) === B.STONE, '/fill');
r = runCommand(game, '/nonsense');
ok(/Unknown command/.test(r), 'unknown command message');
r = runCommand(game, '/weather thunder');
ok(game.weather === 'thunder', '/weather');

// --- mobs data sanity ---
for (const [name, def] of Object.entries(MOBS)) {
  ok(def.hp > 0 && def.parts.length > 0 && def.w && def.h, 'mob def ' + name);
  for (const d of def.drops) ok(ITEMS[d.id] !== undefined, name + ' drop item exists: ' + d.id);
}

// --- all recipes produce valid items / consume valid ingredients ---
for (const rec of RECIPES) {
  ok(ITEMS[rec.out.id] !== undefined, 'recipe output exists: ' + (ITEMS[rec.out.id]?.name ?? rec.out.id));
  const ids = rec.ingredients ?? Object.values(rec.key);
  for (const id of ids) ok(ITEMS[id] !== undefined, 'recipe ingredient exists: ' + id);
}

// --- TNT chain via redstone ---
w.setBlock(11, Y, 10, B.TNT);
let tntPrimed = false;
game.entities.primeTNT = () => { tntPrimed = true; };
w.setBlock(12, Y, 10, B.RS_BLOCK);
game.redstone.onChange(w, 12, Y, 10);
ok(tntPrimed, 'TNT primed by redstone block');

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILURES`);
process.exit(fails ? 1 : 0);
