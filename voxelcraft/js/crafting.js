// crafting.js — shaped & shapeless recipes, smelting, fuel.
import { B, I } from './blocks.js';

// Shaped recipe: { pattern: ['XX','XX'], key: {X: itemId}, out: {id,count} }
// Shapeless: { ingredients: [itemId,...], out }
export const RECIPES = [];

function shaped(pattern, key, id, count = 1) { RECIPES.push({ pattern, key, out: { id, count } }); }
function shapeless(ingredients, id, count = 1) { RECIPES.push({ ingredients, out: { id, count } }); }

// --- basics ---
shapeless([B.LOG], B.PLANKS, 4);
shapeless([B.BIRCH_LOG], B.PLANKS, 4);
shaped(['P', 'P'], { P: B.PLANKS }, I.STICK, 4);
shaped(['C', 'S'], { C: I.COAL, S: I.STICK }, B.TORCH, 4);
shaped(['PP', 'PP'], { P: B.PLANKS }, B.CRAFTING);
shaped(['CCC', 'C.C', 'CCC'], { C: B.COBBLE }, B.FURNACE);
shaped(['PPP', 'P.P', 'PPP'], { P: B.PLANKS }, B.CHEST);

// --- tools (material x kind) ---
const mats = [
  ['P', B.PLANKS, 'WOOD'], ['C', B.COBBLE, 'STONE'],
  ['I', I.IRON_INGOT, 'IRON'], ['G', I.GOLD_INGOT, 'GOLD'], ['D', I.DIAMOND, 'DIAMOND'],
];
for (const [ch, mat, name] of mats) {
  const key = { M: mat, S: I.STICK };
  shaped(['MMM', '.S.', '.S.'], key, I[name + '_PICK']);
  shaped(['MM', 'MS', '.S'], key, I[name + '_AXE']);
  shaped(['M', 'S', 'S'], key, I[name + '_SHOVEL']);
  shaped(['M', 'M', 'S'], key, I[name + '_SWORD']);
  shaped(['MM', '.S', '.S'], key, I[name + '_HOE']);
}

// --- armor ---
shaped(['III', 'I.I'], { I: I.IRON_INGOT }, I.IRON_HELMET);
shaped(['I.I', 'III', 'III'], { I: I.IRON_INGOT }, I.IRON_CHEST);
shaped(['III', 'I.I', 'I.I'], { I: I.IRON_INGOT }, I.IRON_LEGS);
shaped(['I.I', 'I.I'], { I: I.IRON_INGOT }, I.IRON_BOOTS);
shaped(['DDD', 'D.D'], { D: I.DIAMOND }, I.DIAMOND_HELMET);
shaped(['D.D', 'DDD', 'DDD'], { D: I.DIAMOND }, I.DIAMOND_CHEST);
shaped(['DDD', 'D.D', 'D.D'], { D: I.DIAMOND }, I.DIAMOND_LEGS);
shaped(['D.D', 'D.D'], { D: I.DIAMOND }, I.DIAMOND_BOOTS);

// --- combat / utility ---
shaped(['.SF', 'S.F', '.SF'], { S: I.STICK, F: I.STRING }, I.BOW);
shaped(['F', 'S', 'E'], { F: I.FLINT, S: I.STICK, E: I.FEATHER }, I.ARROW, 4);
shapeless([I.IRON_INGOT, I.FLINT], I.FLINT_STEEL);
shaped(['I.I', '.I.'], { I: I.IRON_INGOT }, I.BUCKET);
shaped(['PP', 'PP', 'PP'], { P: B.PLANKS }, I.DOOR_ITEM, 2);
shaped(['S.S', 'SSS'], { S: I.STICK }, B.LADDER, 3);
shaped(['WWW', 'PPP'], { W: B.WOOL, P: B.PLANKS }, I.BED_ITEM);
shaped(['GSG', 'SGS', 'GSG'], { G: I.GUNPOWDER, S: B.SAND }, B.TNT);
shaped(['FF', 'FF'], { F: I.STRING }, B.WOOL);
shaped(['WWW'], { W: I.WHEAT_ITEM }, I.BREAD);
shaped(['GGG', 'GAG', 'GGG'], { G: I.GOLD_INGOT, A: I.APPLE }, I.GOLDEN_APPLE);
shaped(['PPP', 'WWW', 'PPP'], { P: B.PLANKS, W: I.WHEAT_ITEM }, B.BOOKSHELF);

// --- blocks ---
shaped(['SS', 'SS'], { S: B.STONE }, B.STONEBRICK, 4);
shaped(['SS', 'SS'], { S: B.SAND }, B.SANDSTONE, 4);
shaped(['III', 'III', 'III'], { I: I.IRON_INGOT }, B.IRON_BLOCK);
shaped(['GGG', 'GGG', 'GGG'], { G: I.GOLD_INGOT }, B.GOLD_BLOCK);
shaped(['DDD', 'DDD', 'DDD'], { D: I.DIAMOND }, B.DIAMOND_BLOCK);
shaped(['RRR', 'RRR', 'RRR'], { R: I.REDSTONE }, B.RS_BLOCK);
shapeless([B.IRON_BLOCK], I.IRON_INGOT, 9);
shapeless([B.GOLD_BLOCK], I.GOLD_INGOT, 9);
shapeless([B.DIAMOND_BLOCK], I.DIAMOND, 9);
shapeless([B.RS_BLOCK], I.REDSTONE, 9);

// --- redstone ---
shaped(['R', 'S'], { R: I.REDSTONE, S: I.STICK }, B.RS_TORCH);
shaped(['S', 'C'], { S: I.STICK, C: B.COBBLE }, B.LEVER);
shapeless([B.STONE], B.BUTTON);
shaped(['SS'], { S: B.STONE }, B.PLATE);
shaped(['RGR', 'GRG', 'RGR'], { R: I.REDSTONE, G: B.GLOWSTONE }, B.RS_LAMP);

// ---- matching --------------------------------------------------------------
// grid: array of itemId|null, size x size
export function matchRecipe(grid, size) {
  // build trimmed matrix of the used area
  let minR = size, maxR = -1, minC = size, maxC = -1;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    if (grid[r * size + c] != null) { minR = Math.min(minR, r); maxR = Math.max(maxR, r); minC = Math.min(minC, c); maxC = Math.max(maxC, c); }
  }
  if (maxR < 0) return null;
  const h = maxR - minR + 1, w = maxC - minC + 1;
  const cells = [];
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) cells.push(grid[(r + minR) * size + (c + minC)]);

  outer:
  for (const rec of RECIPES) {
    if (rec.ingredients) {
      const need = [...rec.ingredients];
      const have = cells.filter(x => x != null);
      if (have.length !== need.length) continue;
      for (const id of have) {
        const k = need.indexOf(id);
        if (k < 0) continue outer;
        need.splice(k, 1);
      }
      if (need.length === 0) return rec.out;
      continue;
    }
    const ph = rec.pattern.length, pw = rec.pattern[0].length;
    if (ph !== h || pw !== w) continue;
    let ok = true, okMir = true;
    for (let r = 0; r < h && (ok || okMir); r++) for (let c = 0; c < w; c++) {
      const cell = cells[r * w + c];
      const want = rec.pattern[r][c] === '.' ? null : rec.key[rec.pattern[r][c]];
      const wantM = rec.pattern[r][pw - 1 - c] === '.' ? null : rec.key[rec.pattern[r][pw - 1 - c]];
      if (cell !== want) ok = false;
      if (cell !== wantM) okMir = false;
    }
    if (ok || okMir) return rec.out;
  }
  return null;
}

// ---- smelting --------------------------------------------------------------
export const SMELT = {
  [B.IRON_ORE]: { id: I.IRON_INGOT, count: 1 },
  [B.GOLD_ORE]: { id: I.GOLD_INGOT, count: 1 },
  [B.SAND]: { id: B.GLASS, count: 1 },
  [B.COBBLE]: { id: B.STONE, count: 1 },
  [B.LOG]: { id: I.COAL, count: 1 },
  [B.BIRCH_LOG]: { id: I.COAL, count: 1 },
  [I.PORK_RAW]: { id: I.PORK, count: 1 },
  [I.BEEF_RAW]: { id: I.BEEF, count: 1 },
  [I.CHICKEN_RAW]: { id: I.CHICKEN, count: 1 },
  [I.MUTTON_RAW]: { id: I.MUTTON, count: 1 },
};

// fuel burn time in smelt-progress seconds (one item takes 10s)
export const FUEL = {
  [I.COAL]: 80,
  [I.LAVA_BUCKET]: 1000,
  [B.PLANKS]: 15,
  [B.LOG]: 15,
  [B.BIRCH_LOG]: 15,
  [I.STICK]: 5,
  [B.CRAFTING]: 15,
  [B.CHEST]: 15,
  [B.BOOKSHELF]: 15,
  [B.SAPLING]: 5,
};
