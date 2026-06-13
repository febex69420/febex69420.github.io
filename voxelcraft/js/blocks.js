// blocks.js — block & item registries + procedural texture atlas + item icon sheet.
import { mulberry32 } from './util.js';

// ============================== TEXTURE ATLAS ==============================
// 16x16 grid of 16px tiles (256x256). Tiles registered with a draw function.
export const ATLAS_TILES = 16;
export const TEX = {};
const tileDraws = [];

function T(name, draw) {
  TEX[name] = tileDraws.length;
  tileDraws.push(draw);
  return TEX[name];
}

// drawing helpers -----------------------------------------------------------
function fill(c, col) { c.fillStyle = col; c.fillRect(0, 0, 16, 16); }
function px(c, x, y, col) { c.fillStyle = col; c.fillRect(x, y, 1, 1); }
function speckle(c, rng, cols, n = 80) {
  for (let i = 0; i < n; i++) px(c, (rng() * 16) | 0, (rng() * 16) | 0, cols[(rng() * cols.length) | 0]);
}
function shade(hex, f) { // hex '#rrggbb', f multiplier
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) * f) | 0,
    g = Math.min(255, ((n >> 8) & 255) * f) | 0,
    b = Math.min(255, (n & 255) * f) | 0;
  return `rgb(${r},${g},${b})`;
}
function noisy(base, vars, n = 90) {
  return (c, rng) => { fill(c, base); speckle(c, rng, vars, n); };
}
function border(c, col) {
  c.fillStyle = col;
  c.fillRect(0, 0, 16, 1); c.fillRect(0, 15, 16, 1);
  c.fillRect(0, 0, 1, 16); c.fillRect(15, 0, 1, 16);
}
function oreTile(baseDraw, gem) {
  return (c, rng) => {
    baseDraw(c, rng);
    for (let i = 0; i < 6; i++) {
      const x = 2 + ((rng() * 12) | 0), y = 2 + ((rng() * 12) | 0);
      c.fillStyle = gem; c.fillRect(x, y, 2, 2);
      c.fillStyle = shade(gem, 0.6); c.fillRect(x + 1, y + 1, 1, 1);
    }
  };
}

const stoneDraw = noisy('#7d7d7d', ['#6f6f6f', '#8a8a8a', '#757575'], 110);
const dirtDraw = noisy('#79553a', ['#6b4a31', '#8a6443', '#5f4128'], 120);
const sandDraw = noisy('#dcd0a4', ['#d1c391', '#e6dcb7', '#c9bb87'], 110);
const netherDraw = noisy('#6f3634', ['#5b2422', '#83403d', '#4c1f1e'], 130);

T('grass_top', (c, rng) => { fill(c, '#5d9c3f'); speckle(c, rng, ['#549138', '#68a948', '#4c8632'], 130); });
T('grass_side', (c, rng) => {
  dirtDraw(c, rng);
  c.fillStyle = '#5d9c3f'; c.fillRect(0, 0, 16, 3);
  for (let x = 0; x < 16; x++) if (rng() < 0.6) px(c, x, 3, '#549138');
});
T('dirt', dirtDraw);
T('stone', stoneDraw);
T('cobble', (c, rng) => {
  fill(c, '#828282');
  for (let i = 0; i < 9; i++) {
    const x = (i % 3) * 5, y = ((i / 3) | 0) * 5;
    c.fillStyle = shade('#828282', 0.75 + rng() * 0.5);
    c.fillRect(x + ((rng() * 2) | 0), y + ((rng() * 2) | 0), 4, 4);
  }
  speckle(c, rng, ['#5e5e5e', '#9a9a9a'], 40);
});
T('mossy', (c, rng) => { TEXDRAW('cobble')(c, rng); speckle(c, rng, ['#4c7a35', '#5d9c3f'], 60); });
T('planks', (c, rng) => {
  fill(c, '#9c7f4e');
  for (let y = 0; y < 16; y += 4) { c.fillStyle = '#7b6038'; c.fillRect(0, y, 16, 1); }
  px(c, 4, 2, '#7b6038'); px(c, 11, 6, '#7b6038'); px(c, 6, 10, '#7b6038'); px(c, 13, 14, '#7b6038');
  speckle(c, rng, ['#8d7244', '#a98a57'], 40);
});
T('bedrock', noisy('#3a3a3a', ['#1f1f1f', '#575757', '#2a2a2a'], 140));
T('water', (c) => { fill(c, '#3355dd'); c.fillStyle = '#3f63ec'; c.fillRect(0, 3, 16, 2); c.fillRect(0, 9, 16, 2); c.fillStyle = '#2b48c4'; c.fillRect(0, 6, 16, 1); c.fillRect(0, 13, 16, 1); });
T('lava', (c, rng) => {
  fill(c, '#cf5b0c');
  for (let i = 0; i < 5; i++) {
    c.fillStyle = ['#e88a1c', '#f5c842', '#a93f08'][(rng() * 3) | 0];
    c.fillRect((rng() * 12) | 0, (rng() * 12) | 0, 3 + ((rng() * 4) | 0), 2);
  }
});
T('sand', sandDraw);
T('gravel', (c, rng) => {
  fill(c, '#867f7e');
  for (let i = 0; i < 26; i++) {
    c.fillStyle = ['#6c6362', '#9c9494', '#7a706e', '#aaa2a2'][(rng() * 4) | 0];
    c.fillRect((rng() * 14) | 0, (rng() * 14) | 0, 2, 2);
  }
});
T('gold_ore', oreTile(stoneDraw, '#fcee4b'));
T('iron_ore', oreTile(stoneDraw, '#d8af93'));
T('coal_ore', oreTile(stoneDraw, '#2f2f2f'));
T('diamond_ore', oreTile(stoneDraw, '#4aedd9'));
T('redstone_ore', oreTile(stoneDraw, '#ff3030'));
T('log_side', (c, rng) => {
  fill(c, '#6b5234');
  for (let x = 0; x < 16; x += 4) { c.fillStyle = '#54402a'; c.fillRect(x, 0, 1, 16); }
  speckle(c, rng, ['#5e4830', '#79603e'], 50);
});
T('log_top', (c, rng) => {
  fill(c, '#6b5234'); c.fillStyle = '#b89b6d'; c.fillRect(2, 2, 12, 12);
  c.fillStyle = '#9c7f4e'; c.fillRect(4, 4, 8, 8); c.fillStyle = '#b89b6d'; c.fillRect(6, 6, 4, 4);
  c.fillStyle = '#6b5234'; c.fillRect(7, 7, 2, 2);
});
T('birch_side', (c, rng) => {
  fill(c, '#d7d3c8');
  speckle(c, rng, ['#c4c0b4', '#e4e0d6'], 60);
  c.fillStyle = '#2e2c26';
  c.fillRect(2, 2, 3, 2); c.fillRect(10, 6, 4, 2); c.fillRect(4, 11, 3, 2); c.fillRect(12, 13, 3, 2);
});
T('leaves', (c, rng) => {
  fill(c, '#2c5e16');
  speckle(c, rng, ['#37741d', '#244d12', '#418a24'], 150);
});
T('birch_leaves', (c, rng) => { fill(c, '#52742c'); speckle(c, rng, ['#648c38', '#46641f', '#71a040'], 150); });
T('glass', (c) => {
  fill(c, 'rgba(200,230,255,0.25)'); border(c, '#cde4ee');
  px(c, 3, 2, '#ffffff'); px(c, 4, 3, '#ffffff'); px(c, 2, 3, '#ffffff');
});
T('obsidian', (c, rng) => { fill(c, '#15101f'); speckle(c, rng, ['#241a36', '#36254e', '#0c0813'], 70); });
T('torch', (c) => {
  fill(c, 'rgba(0,0,0,0)');
  c.fillStyle = '#8a6543'; c.fillRect(7, 6, 2, 10);
  c.fillStyle = '#f5d93f'; c.fillRect(7, 4, 2, 2);
  c.fillStyle = '#fff8c5'; c.fillRect(7, 3, 2, 1);
});
T('table_top', (c, rng) => {
  TEXDRAW('planks')(c, rng); border(c, '#6b5234');
  c.fillStyle = '#b89b6d'; c.fillRect(1, 1, 6, 6); c.fillRect(9, 9, 6, 6);
});
T('table_side', (c, rng) => {
  TEXDRAW('planks')(c, rng);
  c.fillStyle = '#e0e0e0'; c.fillRect(2, 2, 5, 4);
  c.fillStyle = '#8a8a8a'; c.fillRect(9, 2, 5, 4);
});
T('furnace_front', (c, rng) => {
  TEXDRAW('cobble')(c, rng);
  c.fillStyle = '#2a2a2a'; c.fillRect(4, 6, 8, 7);
  c.fillStyle = '#3a3a3a'; c.fillRect(4, 5, 8, 1);
});
T('furnace_front_lit', (c, rng) => {
  TEXDRAW('cobble')(c, rng);
  c.fillStyle = '#2a2a2a'; c.fillRect(4, 5, 8, 8);
  c.fillStyle = '#f5a623'; c.fillRect(5, 8, 6, 4);
  c.fillStyle = '#ffd75e'; c.fillRect(6, 10, 4, 2);
});
T('furnace_side', (c, rng) => TEXDRAW('cobble')(c, rng));
T('furnace_top', (c, rng) => { stoneDraw(c, rng); border(c, '#5e5e5e'); });
T('chest_front', (c, rng) => {
  fill(c, '#9c7044'); border(c, '#5e4226');
  c.fillStyle = '#5e4226'; c.fillRect(0, 9, 16, 1);
  c.fillStyle = '#8a8a8a'; c.fillRect(7, 7, 2, 4); c.fillStyle = '#c9c9c9'; c.fillRect(7, 8, 2, 2);
  speckle(c, rng, ['#8d6238', '#a87d4f'], 30);
});
T('chest_side', (c, rng) => {
  fill(c, '#9c7044'); border(c, '#5e4226');
  c.fillStyle = '#5e4226'; c.fillRect(0, 9, 16, 1);
  speckle(c, rng, ['#8d6238', '#a87d4f'], 30);
});
T('chest_top', (c, rng) => { fill(c, '#9c7044'); border(c, '#5e4226'); speckle(c, rng, ['#8d6238', '#a87d4f'], 30); });
T('tnt_side', (c) => {
  fill(c, '#d04a3a');
  for (let x = 0; x < 16; x += 4) { c.fillStyle = x % 8 ? '#b03325' : '#e05a48'; c.fillRect(x, 0, 2, 16); }
  c.fillStyle = '#ffffff'; c.fillRect(2, 6, 12, 4);
  c.fillStyle = '#000000'; c.font = '5px monospace'; c.fillText('TNT', 3, 10);
});
T('tnt_top', (c) => { fill(c, '#b03325'); c.fillStyle = '#d04a3a'; c.fillRect(2, 2, 12, 12); c.fillStyle = '#7a1f14'; c.fillRect(6, 6, 4, 4); });
T('wool', noisy('#e8e8e8', ['#dcdcdc', '#f4f4f4', '#d2d2d2'], 100));
T('snow', noisy('#f4fbfb', ['#e8f2f2', '#ffffff'], 70));
T('grass_snow_side', (c, rng) => {
  dirtDraw(c, rng);
  c.fillStyle = '#f4fbfb'; c.fillRect(0, 0, 16, 3);
  for (let x = 0; x < 16; x++) if (rng() < 0.5) px(c, x, 3, '#e8f2f2');
});
T('ice', (c, rng) => { fill(c, 'rgba(140,180,250,0.8)'); speckle(c, rng, ['rgba(170,205,255,0.9)', 'rgba(120,160,235,0.85)'], 60); border(c, 'rgba(180,210,255,0.9)'); });
T('cactus_side', (c, rng) => {
  fill(c, '#0f7715');
  c.fillStyle = '#1d9926'; c.fillRect(1, 0, 2, 16); c.fillRect(7, 0, 2, 16); c.fillRect(13, 0, 2, 16);
  speckle(c, rng, ['#0a5e0f', '#26a730'], 40);
});
T('cactus_top', (c, rng) => { fill(c, '#1d9926'); border(c, '#0f7715'); speckle(c, rng, ['#0a5e0f'], 30); });
T('pumpkin_side', (c, rng) => {
  fill(c, '#cf7a1a');
  for (let x = 1; x < 16; x += 5) { c.fillStyle = '#b3650f'; c.fillRect(x, 0, 1, 16); }
  speckle(c, rng, ['#e08a26', '#bd6c12'], 40);
});
T('pumpkin_face', (c, rng) => {
  TEXDRAW('pumpkin_side')(c, rng);
  c.fillStyle = '#3a2208';
  c.fillRect(3, 4, 3, 3); c.fillRect(10, 4, 3, 3); c.fillRect(7, 7, 2, 2);
  c.fillRect(3, 11, 10, 2); c.fillRect(5, 10, 2, 1); c.fillRect(9, 10, 2, 1);
});
T('pumpkin_top', (c, rng) => { fill(c, '#b3650f'); c.fillStyle = '#cf7a1a'; c.fillRect(2, 2, 12, 12); c.fillStyle = '#6b5234'; c.fillRect(7, 7, 2, 2); });
T('netherrack', netherDraw);
T('soulsand', noisy('#574230', ['#473628', '#67503a', '#3a2c1f'], 120));
T('glowstone', (c, rng) => {
  fill(c, '#9c7440');
  for (let i = 0; i < 10; i++) {
    c.fillStyle = ['#ffd75e', '#f5bd3a', '#ffeaa0'][(rng() * 3) | 0];
    c.fillRect((rng() * 13) | 0, (rng() * 13) | 0, 3, 3);
  }
});
T('portal', (c, rng) => { fill(c, 'rgba(110,30,180,0.75)'); speckle(c, rng, ['rgba(160,70,230,0.8)', 'rgba(80,10,140,0.8)'], 90); });
T('farmland', (c, rng) => {
  dirtDraw(c, rng);
  c.fillStyle = '#3a2a1a'; for (let x = 0; x < 16; x += 4) c.fillRect(x, 0, 2, 16);
});
T('wheat0', (c) => { fill(c, 'rgba(0,0,0,0)'); c.fillStyle = '#3e9a2c'; for (let x = 2; x < 16; x += 4) c.fillRect(x, 12, 1, 4); });
T('wheat1', (c) => { fill(c, 'rgba(0,0,0,0)'); c.fillStyle = '#4fae35'; for (let x = 1; x < 16; x += 3) c.fillRect(x, 8, 1, 8); });
T('wheat2', (c) => {
  fill(c, 'rgba(0,0,0,0)'); c.fillStyle = '#86b03c';
  for (let x = 1; x < 16; x += 3) { c.fillRect(x, 4, 1, 12); c.fillRect(x - 1, 4, 3, 2); }
});
T('wheat3', (c) => {
  fill(c, 'rgba(0,0,0,0)'); c.fillStyle = '#c9a93a';
  for (let x = 1; x < 16; x += 3) { c.fillRect(x, 2, 1, 14); c.fillStyle = '#dbc15a'; c.fillRect(x - 1, 1, 3, 5); c.fillStyle = '#c9a93a'; }
});
T('door_top', (c, rng) => {
  TEXDRAW('planks')(c, rng); border(c, '#6b5234');
  c.fillStyle = 'rgba(150,200,255,0.85)'; c.fillRect(3, 3, 4, 4); c.fillRect(9, 3, 4, 4);
  c.fillStyle = '#54402a'; c.fillRect(7, 3, 2, 4);
});
T('door_bottom', (c, rng) => { TEXDRAW('planks')(c, rng); border(c, '#6b5234'); c.fillStyle = '#54402a'; c.fillRect(7, 1, 2, 14); c.fillRect(2, 7, 12, 2); });
T('ladder', (c) => {
  fill(c, 'rgba(0,0,0,0)');
  c.fillStyle = '#8a6543'; c.fillRect(2, 0, 2, 16); c.fillRect(12, 0, 2, 16);
  c.fillRect(2, 2, 12, 2); c.fillRect(2, 8, 12, 2); c.fillRect(2, 14, 12, 2);
});
T('stonebrick', (c, rng) => {
  fill(c, '#7d7d7d');
  c.fillStyle = '#5e5e5e';
  c.fillRect(0, 0, 16, 1); c.fillRect(0, 7, 16, 1); c.fillRect(0, 15, 16, 1);
  c.fillRect(7, 0, 1, 8); c.fillRect(3, 8, 1, 8); c.fillRect(12, 8, 1, 8);
  speckle(c, rng, ['#6f6f6f', '#8a8a8a'], 50);
});
T('flower_yellow', (c) => {
  fill(c, 'rgba(0,0,0,0)');
  c.fillStyle = '#3e9a2c'; c.fillRect(7, 8, 2, 8);
  c.fillStyle = '#f5e33a'; c.fillRect(5, 3, 6, 6); c.fillStyle = '#c9a93a'; c.fillRect(7, 5, 2, 2);
});
T('flower_red', (c) => {
  fill(c, 'rgba(0,0,0,0)');
  c.fillStyle = '#3e9a2c'; c.fillRect(7, 8, 2, 8);
  c.fillStyle = '#d63a2e'; c.fillRect(5, 3, 6, 6); c.fillStyle = '#f5e33a'; c.fillRect(7, 5, 2, 2);
});
T('tallgrass', (c, rng) => {
  fill(c, 'rgba(0,0,0,0)'); c.fillStyle = '#4f8f33';
  for (let i = 0; i < 7; i++) { const x = 1 + ((rng() * 14) | 0); c.fillRect(x, 6 + ((rng() * 5) | 0), 1, 10); }
});
T('deadbush', (c, rng) => {
  fill(c, 'rgba(0,0,0,0)'); c.fillStyle = '#946428';
  c.fillRect(7, 8, 2, 8);
  for (let i = 0; i < 5; i++) { c.fillRect(3 + ((rng() * 10) | 0), 4 + ((rng() * 6) | 0), 1, 5); }
});
T('mushroom_brown', (c) => {
  fill(c, 'rgba(0,0,0,0)');
  c.fillStyle = '#d8cfc0'; c.fillRect(7, 10, 2, 6);
  c.fillStyle = '#9c7044'; c.fillRect(4, 6, 8, 4); c.fillRect(5, 5, 6, 1);
});
T('mushroom_red', (c) => {
  fill(c, 'rgba(0,0,0,0)');
  c.fillStyle = '#d8cfc0'; c.fillRect(7, 10, 2, 6);
  c.fillStyle = '#d63a2e'; c.fillRect(4, 6, 8, 4); c.fillRect(5, 5, 6, 1);
  c.fillStyle = '#ffffff'; c.fillRect(6, 6, 2, 2); c.fillRect(10, 8, 1, 1);
});
T('sandstone_top', (c, rng) => { sandDraw(c, rng); border(c, '#c9bb87'); });
T('sandstone_side', (c, rng) => {
  fill(c, '#dcd0a4');
  c.fillStyle = '#c9bb87'; c.fillRect(0, 0, 16, 2); c.fillRect(0, 14, 16, 2);
  speckle(c, rng, ['#d1c391', '#bfae79'], 60);
});
T('spawner', (c, rng) => {
  fill(c, '#1a2a35');
  c.fillStyle = '#2f4a5c';
  for (let i = 0; i < 16; i += 3) { c.fillRect(i, 0, 1, 16); c.fillRect(0, i, 16, 1); }
  speckle(c, rng, ['#0f1a22'], 50);
});
T('wire', (c) => {
  fill(c, 'rgba(0,0,0,0)');
  c.fillStyle = '#b3270f'; c.fillRect(0, 7, 16, 2); c.fillRect(7, 0, 2, 16);
  c.fillStyle = '#e84a2a'; c.fillRect(6, 6, 4, 4);
});
T('rs_torch_on', (c) => {
  fill(c, 'rgba(0,0,0,0)');
  c.fillStyle = '#8a6543'; c.fillRect(7, 6, 2, 10);
  c.fillStyle = '#ff3030'; c.fillRect(7, 4, 2, 2); c.fillStyle = '#ffb0a0'; c.fillRect(7, 3, 2, 1);
});
T('rs_torch_off', (c) => {
  fill(c, 'rgba(0,0,0,0)');
  c.fillStyle = '#8a6543'; c.fillRect(7, 6, 2, 10);
  c.fillStyle = '#5e1410'; c.fillRect(7, 4, 2, 2);
});
T('lever', (c) => {
  fill(c, 'rgba(0,0,0,0)');
  c.fillStyle = '#7d7d7d'; c.fillRect(4, 12, 8, 4);
  c.fillStyle = '#8a6543'; c.fillRect(7, 3, 2, 9);
});
T('rs_lamp_off', (c, rng) => { fill(c, '#46362a'); speckle(c, rng, ['#5e4a38', '#382a1f'], 70); border(c, '#382a1f'); });
T('rs_lamp_on', (c, rng) => { fill(c, '#c9952e'); speckle(c, rng, ['#e8b347', '#f5d075'], 70); border(c, '#a87820'); });
T('rs_block', (c, rng) => { fill(c, '#a82310'); speckle(c, rng, ['#c93a20', '#8a1808'], 70); border(c, '#7a1408'); });
T('iron_block', (c, rng) => { fill(c, '#d8d8d8'); border(c, '#a8a8a8'); speckle(c, rng, ['#e8e8e8', '#c4c4c4'], 40); });
T('gold_block', (c, rng) => { fill(c, '#f5d93f'); border(c, '#c9a92e'); speckle(c, rng, ['#ffe96a', '#e0bd2e'], 40); });
T('diamond_block', (c, rng) => { fill(c, '#4de0d8'); border(c, '#2eb0aa'); speckle(c, rng, ['#7fefe8', '#3acac2'], 40); });
T('bed_top', (c) => {
  fill(c, '#b03325');
  c.fillStyle = '#ffffff'; c.fillRect(1, 1, 14, 4);
  c.fillStyle = '#8a1808'; c.fillRect(0, 15, 16, 1);
});
T('bed_side', (c) => {
  fill(c, '#9c7044');
  c.fillStyle = '#b03325'; c.fillRect(0, 4, 16, 6);
  c.fillStyle = '#ffffff'; c.fillRect(0, 4, 5, 3);
});
T('bookshelf', (c, rng) => {
  fill(c, '#9c7f4e');
  for (let row = 0; row < 2; row++) {
    for (let x = 1; x < 15; x += 2) {
      c.fillStyle = ['#b03325', '#2e6bd6', '#3e9a2c', '#c9a93a', '#7a3a9c'][(rng() * 5) | 0];
      c.fillRect(x, 2 + row * 7, 2, 5);
    }
  }
  c.fillStyle = '#6b5234'; c.fillRect(0, 0, 16, 1); c.fillRect(0, 8, 16, 1); c.fillRect(0, 15, 16, 1);
});
T('button', (c) => { fill(c, 'rgba(0,0,0,0)'); c.fillStyle = '#7d7d7d'; c.fillRect(5, 6, 6, 4); c.fillStyle = '#9a9a9a'; c.fillRect(5, 6, 6, 1); });
T('plate', (c, rng) => { fill(c, 'rgba(0,0,0,0)'); c.fillStyle = '#7d7d7d'; c.fillRect(1, 1, 14, 14); c.fillStyle = '#6a6a6a'; c.fillRect(2, 2, 12, 12); });
// crack overlay stages (10)
TEX.crack = tileDraws.length;
for (let s = 0; s < 10; s++) {
  T('crack' + s, (c, rng) => {
    fill(c, 'rgba(0,0,0,0)');
    c.fillStyle = 'rgba(20,16,12,0.85)';
    const n = 6 + s * 5;
    const r2 = mulberry32(1234 + s * 7);
    for (let i = 0; i < n; i++) {
      let x = 8, y = 8;
      const len = 3 + ((r2() * 6) | 0);
      let dx = r2() < 0.5 ? -1 : 1, dy = r2() < 0.5 ? -1 : 1;
      for (let j = 0; j < len; j++) {
        c.fillRect((x + 16) % 16, (y + 16) % 16, 1, 1);
        if (r2() < 0.5) x += dx; else y += dy;
      }
    }
  });
}

function TEXDRAW(name) { return tileDraws[TEX[name]]; }

export function buildAtlas() {
  const size = ATLAS_TILES * 16;
  const cv = document.createElement('canvas');
  cv.width = size; cv.height = size;
  const c = cv.getContext('2d');
  for (let i = 0; i < tileDraws.length; i++) {
    const tx = (i % ATLAS_TILES) * 16, ty = ((i / ATLAS_TILES) | 0) * 16;
    const tile = document.createElement('canvas');
    tile.width = 16; tile.height = 16;
    const tc = tile.getContext('2d');
    tileDraws[i](tc, mulberry32(7777 + i * 131));
    c.drawImage(tile, tx, ty);
  }
  return cv;
}

// ============================== BLOCKS =====================================
export const B = {};
export const BLOCKS = [];

// face order: 0:+x 1:-x 2:+y(top) 3:-y(bottom) 4:+z 5:-z
function texArr(t) {
  if (typeof t === 'number') return [t, t, t, t, t, t];
  if (Array.isArray(t)) return t;
  const side = t.side, top = t.top ?? side, bot = t.bottom ?? top;
  return [side, side, top, bot, t.front ?? side, side];
}

function block(id, key, name, opts = {}) {
  B[key] = id;
  BLOCKS[id] = {
    id, key, name,
    tex: opts.tex !== undefined ? texArr(opts.tex) : [0, 0, 0, 0, 0, 0],
    solid: opts.solid ?? true,
    opaque: opts.opaque ?? (opts.solid ?? true),
    cross: opts.cross ?? false,
    liquid: opts.liquid ?? 0,
    hard: opts.hard ?? 1.5,           // base seconds to break by hand
    tool: opts.tool ?? null,          // 'pickaxe'|'axe'|'shovel'|null
    level: opts.level ?? 0,           // required tool tier for drops
    drops: opts.drops,                // undefined = drops itself; null = nothing; fn(meta)=>[{id,count}]
    light: opts.light ?? 0,
    gravity: opts.gravity ?? false,
    climb: opts.climb ?? false,
    replaceable: opts.replaceable ?? false,
    sound: opts.sound ?? 'stone',     // 'stone','wood','grass','sand','gravel','cloth','glass','snow'
    shape: opts.shape ?? (opts.cross ? 'cross' : 'cube'), // 'cube','cross','torch','slabTop','flat','liquidTop'
    flammable: opts.flammable ?? false,
    tick: opts.tick ?? false,         // receives random ticks
  };
  return id;
}

block(0, 'AIR', 'Air', { solid: false, opaque: false, replaceable: true, drops: null });
block(1, 'STONE', 'Stone', { tex: TEX.stone, hard: 7.5, tool: 'pickaxe', level: 1, drops: () => [{ id: 4, count: 1 }] });
block(2, 'GRASS', 'Grass Block', { tex: { top: TEX.grass_top, side: TEX.grass_side, bottom: TEX.dirt }, hard: 0.9, tool: 'shovel', sound: 'grass', drops: () => [{ id: 3, count: 1 }], tick: true });
block(3, 'DIRT', 'Dirt', { tex: TEX.dirt, hard: 0.75, tool: 'shovel', sound: 'gravel' });
block(4, 'COBBLE', 'Cobblestone', { tex: TEX.cobble, hard: 10, tool: 'pickaxe', level: 1 });
block(5, 'PLANKS', 'Oak Planks', { tex: TEX.planks, hard: 3, tool: 'axe', sound: 'wood', flammable: true });
block(6, 'SAPLING', 'Oak Sapling', { tex: TEX.tallgrass, cross: true, solid: false, opaque: false, hard: 0, sound: 'grass', tick: true });
block(7, 'BEDROCK', 'Bedrock', { tex: TEX.bedrock, hard: Infinity, drops: null });
block(8, 'WATER', 'Water', { tex: TEX.water, solid: false, opaque: false, liquid: 1, hard: Infinity, replaceable: true, drops: null, shape: 'liquid' });
block(9, 'LAVA', 'Lava', { tex: TEX.lava, solid: false, opaque: false, liquid: 2, hard: Infinity, replaceable: true, drops: null, light: 15, shape: 'liquid' });
block(10, 'SAND', 'Sand', { tex: TEX.sand, hard: 0.75, tool: 'shovel', sound: 'sand', gravity: true });
block(11, 'GRAVEL', 'Gravel', { tex: TEX.gravel, hard: 0.9, tool: 'shovel', sound: 'gravel', gravity: true, drops: () => Math.random() < 0.15 ? [{ id: 286, count: 1 }] : [{ id: 11, count: 1 }] });
block(12, 'GOLD_ORE', 'Gold Ore', { tex: TEX.gold_ore, hard: 15, tool: 'pickaxe', level: 2 });
block(13, 'IRON_ORE', 'Iron Ore', { tex: TEX.iron_ore, hard: 15, tool: 'pickaxe', level: 1 });
block(14, 'COAL_ORE', 'Coal Ore', { tex: TEX.coal_ore, hard: 15, tool: 'pickaxe', level: 1, drops: () => [{ id: 282, count: 1 }] });
block(15, 'LOG', 'Oak Log', { tex: { top: TEX.log_top, side: TEX.log_side }, hard: 3, tool: 'axe', sound: 'wood', flammable: true });
block(16, 'LEAVES', 'Oak Leaves', { tex: TEX.leaves, opaque: false, hard: 0.3, sound: 'grass', flammable: true, drops: () => Math.random() < 0.08 ? [{ id: 6, count: 1 }] : (Math.random() < 0.05 ? [{ id: 296, count: 1 }] : []) });
block(17, 'GLASS', 'Glass', { tex: TEX.glass, opaque: false, hard: 0.45, sound: 'glass', drops: null });
block(18, 'DIAMOND_ORE', 'Diamond Ore', { tex: TEX.diamond_ore, hard: 15, tool: 'pickaxe', level: 2, drops: () => [{ id: 285, count: 1 }] });
block(19, 'REDSTONE_ORE', 'Redstone Ore', { tex: TEX.redstone_ore, hard: 15, tool: 'pickaxe', level: 2, drops: () => [{ id: 331, count: 4 + (Math.random() * 2 | 0) }] });
block(20, 'OBSIDIAN', 'Obsidian', { tex: TEX.obsidian, hard: 50, tool: 'pickaxe', level: 3 });
block(21, 'TORCH', 'Torch', { tex: TEX.torch, solid: false, opaque: false, hard: 0, light: 14, sound: 'wood', shape: 'torch' });
block(22, 'CRAFTING', 'Crafting Table', { tex: { top: TEX.table_top, side: TEX.table_side, bottom: TEX.planks, front: TEX.table_front ?? TEX.table_side }, hard: 3.75, tool: 'axe', sound: 'wood', flammable: true });
block(23, 'FURNACE', 'Furnace', { tex: { top: TEX.furnace_top, side: TEX.furnace_side, front: TEX.furnace_front }, hard: 5, tool: 'pickaxe', level: 1 });
block(24, 'CHEST', 'Chest', { tex: { top: TEX.chest_top, side: TEX.chest_side, front: TEX.chest_front }, hard: 3.75, tool: 'axe', sound: 'wood', flammable: true });
block(25, 'MOSSY', 'Mossy Cobblestone', { tex: TEX.mossy, hard: 10, tool: 'pickaxe', level: 1 });
block(26, 'TNT', 'TNT', { tex: { top: TEX.tnt_top, bottom: TEX.tnt_top, side: TEX.tnt_side }, hard: 0, sound: 'grass' });
block(27, 'BOOKSHELF', 'Bookshelf', { tex: { top: TEX.planks, bottom: TEX.planks, side: TEX.bookshelf }, hard: 2.25, tool: 'axe', sound: 'wood', flammable: true });
block(28, 'WOOL', 'Wool', { tex: TEX.wool, hard: 1.2, sound: 'cloth', flammable: true });
block(29, 'SNOW_BLOCK', 'Snow Block', { tex: TEX.snow, hard: 0.3, tool: 'shovel', sound: 'snow' });
block(30, 'ICE', 'Ice', { tex: TEX.ice, opaque: false, hard: 0.75, tool: 'pickaxe', sound: 'glass', drops: null });
block(31, 'CACTUS', 'Cactus', { tex: { top: TEX.cactus_top, bottom: TEX.cactus_top, side: TEX.cactus_side }, opaque: false, hard: 0.6, sound: 'cloth', tick: true });
block(32, 'PUMPKIN', 'Pumpkin', { tex: { top: TEX.pumpkin_top, bottom: TEX.pumpkin_top, side: TEX.pumpkin_side, front: TEX.pumpkin_face }, hard: 1.5, tool: 'axe', sound: 'wood' });
block(33, 'NETHERRACK', 'Netherrack', { tex: TEX.netherrack, hard: 0.6, tool: 'pickaxe', level: 1 });
block(34, 'SOULSAND', 'Soul Sand', { tex: TEX.soulsand, hard: 0.75, tool: 'shovel', sound: 'sand' });
block(35, 'GLOWSTONE', 'Glowstone', { tex: TEX.glowstone, hard: 0.45, light: 15, sound: 'glass' });
block(36, 'PORTAL', 'Nether Portal', { tex: TEX.portal, solid: false, opaque: false, hard: Infinity, light: 11, drops: null, shape: 'portal' });
block(37, 'FARMLAND', 'Farmland', { tex: { top: TEX.farmland, side: TEX.dirt, bottom: TEX.dirt }, hard: 0.9, tool: 'shovel', sound: 'gravel', drops: () => [{ id: 3, count: 1 }], shape: 'slabTop' });
block(38, 'WHEAT', 'Wheat Crops', {
  tex: TEX.wheat0, cross: true, solid: false, opaque: false, hard: 0, sound: 'grass', tick: true,
  drops: (meta) => (meta && meta.stage >= 7)
    ? [{ id: 293, count: 1 }, { id: 294, count: 1 + (Math.random() * 2 | 0) }]
    : [{ id: 294, count: 1 }],
});
block(39, 'DOOR', 'Oak Door', { tex: TEX.door_bottom, solid: true, opaque: false, hard: 4.5, tool: 'axe', sound: 'wood', shape: 'door', drops: () => [{ id: 318, count: 1 }] });
block(40, 'LADDER', 'Ladder', { tex: TEX.ladder, solid: false, opaque: false, hard: 0.6, tool: 'axe', sound: 'wood', climb: true, shape: 'ladder' });
block(41, 'STONEBRICK', 'Stone Bricks', { tex: TEX.stonebrick, hard: 7.5, tool: 'pickaxe', level: 1 });
block(42, 'FLOWER_Y', 'Dandelion', { tex: TEX.flower_yellow, cross: true, solid: false, opaque: false, hard: 0, sound: 'grass' });
block(43, 'FLOWER_R', 'Poppy', { tex: TEX.flower_red, cross: true, solid: false, opaque: false, hard: 0, sound: 'grass' });
block(44, 'TALLGRASS', 'Grass', { tex: TEX.tallgrass, cross: true, solid: false, opaque: false, hard: 0, sound: 'grass', replaceable: true, drops: () => Math.random() < 0.3 ? [{ id: 294, count: 1 }] : [] });
block(45, 'DEADBUSH', 'Dead Bush', { tex: TEX.deadbush, cross: true, solid: false, opaque: false, hard: 0, sound: 'grass', replaceable: true, drops: () => [{ id: 256, count: 1 }] });
block(46, 'MUSHROOM_B', 'Brown Mushroom', { tex: TEX.mushroom_brown, cross: true, solid: false, opaque: false, hard: 0, sound: 'grass' });
block(47, 'MUSHROOM_R', 'Red Mushroom', { tex: TEX.mushroom_red, cross: true, solid: false, opaque: false, hard: 0, sound: 'grass' });
block(48, 'SANDSTONE', 'Sandstone', { tex: { top: TEX.sandstone_top, side: TEX.sandstone_side, bottom: TEX.sandstone_top }, hard: 4, tool: 'pickaxe', level: 1 });
block(49, 'SPAWNER', 'Monster Spawner', { tex: TEX.spawner, opaque: false, hard: 25, tool: 'pickaxe', level: 1, drops: null, tick: true });
block(50, 'WIRE', 'Redstone Dust', { tex: TEX.wire, solid: false, opaque: false, hard: 0, drops: () => [{ id: 331, count: 1 }], shape: 'flat' });
block(51, 'RS_TORCH', 'Redstone Torch', { tex: TEX.rs_torch_on, solid: false, opaque: false, hard: 0, light: 7, sound: 'wood', shape: 'torch' });
block(52, 'LEVER', 'Lever', { tex: TEX.lever, solid: false, opaque: false, hard: 0.75, shape: 'torch' });
block(53, 'BUTTON', 'Stone Button', { tex: TEX.button, solid: false, opaque: false, hard: 0.75, shape: 'torch' });
block(54, 'PLATE', 'Pressure Plate', { tex: TEX.plate, solid: false, opaque: false, hard: 0.75, shape: 'flat' });
block(55, 'RS_LAMP', 'Redstone Lamp', { tex: TEX.rs_lamp_off, hard: 0.45, sound: 'glass' });
block(56, 'RS_BLOCK', 'Block of Redstone', { tex: TEX.rs_block, hard: 7.5, tool: 'pickaxe', level: 1 });
block(57, 'IRON_BLOCK', 'Block of Iron', { tex: TEX.iron_block, hard: 25, tool: 'pickaxe', level: 1 });
block(58, 'GOLD_BLOCK', 'Block of Gold', { tex: TEX.gold_block, hard: 15, tool: 'pickaxe', level: 2 });
block(59, 'DIAMOND_BLOCK', 'Block of Diamond', { tex: TEX.diamond_block, hard: 25, tool: 'pickaxe', level: 2 });
block(60, 'BED', 'Bed', { tex: { top: TEX.bed_top, side: TEX.bed_side, bottom: TEX.planks }, solid: false, opaque: false, hard: 0.9, sound: 'wood', shape: 'slabTop', drops: () => [{ id: 319, count: 1 }] });
block(61, 'BIRCH_LOG', 'Birch Log', { tex: { top: TEX.log_top, side: TEX.birch_side }, hard: 3, tool: 'axe', sound: 'wood', flammable: true, drops: () => [{ id: 15, count: 1 }] });
block(62, 'BIRCH_LEAVES', 'Birch Leaves', { tex: TEX.birch_leaves, opaque: false, hard: 0.3, sound: 'grass', flammable: true, drops: () => Math.random() < 0.08 ? [{ id: 6, count: 1 }] : [] });
block(63, 'GLOWSTONE_LIT', 'Glowing Lamp', { tex: TEX.rs_lamp_on, hard: 0.45, light: 15, sound: 'glass', drops: () => [{ id: 55, count: 1 }] });

// wheat growth-stage textures used by the mesher
export const WHEAT_TEX = [TEX.wheat0, TEX.wheat0, TEX.wheat1, TEX.wheat1, TEX.wheat2, TEX.wheat2, TEX.wheat3, TEX.wheat3];

// ============================== ITEMS ======================================
// Items 0..255 are block items (auto). 256+ are pure items.
export const I = {};
export const ITEMS = {};

const TIERS = {
  wood: { tier: 0, speed: 2, dur: 60, color: '#8a6543', dmgBase: 3 },
  stone: { tier: 1, speed: 4, dur: 132, color: '#8a8a8a', dmgBase: 4 },
  iron: { tier: 2, speed: 6, dur: 251, color: '#d8d8d8', dmgBase: 5 },
  gold: { tier: 0, speed: 12, dur: 33, color: '#f5d93f', dmgBase: 3 },
  diamond: { tier: 3, speed: 8, dur: 1562, color: '#4de0d8', dmgBase: 6 },
};

function item(id, key, name, opts = {}) {
  I[key] = id;
  ITEMS[id] = {
    id, key, name,
    stack: opts.stack ?? 64,
    place: opts.place,
    tool: opts.tool,
    food: opts.food,
    armor: opts.armor,        // {slot:0..3 (head..feet), points, dur}
    dmg: opts.dmg ?? 1,       // attack damage
    icon: opts.icon,          // {kind:'tile',tile} | {kind:'tool',shape,color} | {kind:'pix',fn}
    tab: opts.tab ?? 'misc',
  };
  return id;
}

// block items
for (let id = 1; id < BLOCKS.length; id++) {
  const b = BLOCKS[id];
  if (!b) continue;
  if (id === B.PORTAL || id === B.WHEAT || id === B.DOOR || id === B.BED || id === B.GLOWSTONE_LIT || id === B.WIRE) continue;
  let tab = 'building';
  if (b.cross || id === B.GLASS || id === B.BOOKSHELF || id === B.WOOL || id === B.TORCH || id === B.LADDER) tab = 'deco';
  if ([B.WIRE, B.RS_TORCH, B.LEVER, B.BUTTON, B.PLATE, B.RS_LAMP, B.RS_BLOCK, B.TNT].includes(id)) tab = 'redstone';
  item(id, 'BI_' + b.key, b.name, { place: id, tab, icon: { kind: 'block', block: id } });
}

const toolDef = (mat, kind) => {
  const t = TIERS[mat];
  const speedMul = kind === 'sword' ? 1.5 : t.speed;
  const dmg = kind === 'sword' ? t.dmgBase + 1 : (kind === 'axe' ? t.dmgBase : 2);
  return {
    stack: 1, dmg,
    tool: { type: kind === 'sword' ? 'sword' : kind, tier: t.tier, speed: speedMul, dur: t.dur },
    icon: { kind: 'tool', shape: kind, color: t.color },
    tab: 'tools',
  };
};

let tid = 256;
item(tid++, 'STICK', 'Stick', { icon: { kind: 'tool', shape: 'stick', color: '#8a6543' }, tab: 'misc' });
for (const mat of ['wood', 'stone', 'iron', 'gold', 'diamond']) {
  const cap = mat[0].toUpperCase() + mat.slice(1);
  const matName = mat === 'wood' ? 'Wooden' : mat === 'gold' ? 'Golden' : cap;
  item(tid++, (mat + '_PICK').toUpperCase(), matName + ' Pickaxe', toolDef(mat, 'pickaxe'));
  item(tid++, (mat + '_AXE').toUpperCase(), matName + ' Axe', toolDef(mat, 'axe'));
  item(tid++, (mat + '_SHOVEL').toUpperCase(), matName + ' Shovel', toolDef(mat, 'shovel'));
  item(tid++, (mat + '_SWORD').toUpperCase(), matName + ' Sword', toolDef(mat, 'sword'));
  item(tid++, (mat + '_HOE').toUpperCase(), matName + ' Hoe', toolDef(mat, 'hoe'));
}
item(282, 'COAL', 'Coal', { icon: { kind: 'blob', color: '#2f2f2f' }, tab: 'misc' });
item(283, 'IRON_INGOT', 'Iron Ingot', { icon: { kind: 'ingot', color: '#d8d8d8' }, tab: 'misc' });
item(284, 'GOLD_INGOT', 'Gold Ingot', { icon: { kind: 'ingot', color: '#f5d93f' }, tab: 'misc' });
item(285, 'DIAMOND', 'Diamond', { icon: { kind: 'gem', color: '#4de0d8' }, tab: 'misc' });
item(286, 'FLINT', 'Flint', { icon: { kind: 'blob', color: '#44403c' }, tab: 'misc' });
item(287, 'FLINT_STEEL', 'Flint and Steel', { stack: 1, icon: { kind: 'tool', shape: 'flint_steel', color: '#d8d8d8' }, tab: 'tools', tool: { type: 'igniter', tier: 0, speed: 1, dur: 64 } });
item(288, 'BOW', 'Bow', { stack: 1, icon: { kind: 'tool', shape: 'bow', color: '#8a6543' }, tab: 'tools', dmg: 1, tool: { type: 'bow', tier: 0, speed: 1, dur: 384 } });
item(289, 'ARROW', 'Arrow', { icon: { kind: 'tool', shape: 'arrow', color: '#d8d8d8' }, tab: 'tools' });
item(290, 'STRING', 'String', { icon: { kind: 'tool', shape: 'string', color: '#e8e8e8' }, tab: 'misc' });
item(291, 'FEATHER', 'Feather', { icon: { kind: 'tool', shape: 'feather', color: '#f0f0f0' }, tab: 'misc' });
item(292, 'GUNPOWDER', 'Gunpowder', { icon: { kind: 'blob', color: '#6a6a6a' }, tab: 'misc' });
item(293, 'WHEAT_ITEM', 'Wheat', { icon: { kind: 'tile', tile: TEX.wheat3 }, tab: 'food' });
item(294, 'SEEDS', 'Wheat Seeds', { icon: { kind: 'seeds', color: '#3e9a2c' }, tab: 'food' });
item(295, 'BREAD', 'Bread', { food: 5, icon: { kind: 'bread', color: '#b3650f' }, tab: 'food' });
item(296, 'APPLE', 'Apple', { food: 4, icon: { kind: 'fruit', color: '#d63a2e' }, tab: 'food' });
item(297, 'PORK_RAW', 'Raw Porkchop', { food: 3, icon: { kind: 'meat', color: '#f0a0a8' }, tab: 'food' });
item(298, 'PORK', 'Cooked Porkchop', { food: 8, icon: { kind: 'meat', color: '#b06a3a' }, tab: 'food' });
item(299, 'BEEF_RAW', 'Raw Beef', { food: 3, icon: { kind: 'meat', color: '#d05a5a' }, tab: 'food' });
item(300, 'BEEF', 'Steak', { food: 8, icon: { kind: 'meat', color: '#7a4a2a' }, tab: 'food' });
item(301, 'CHICKEN_RAW', 'Raw Chicken', { food: 2, icon: { kind: 'meat', color: '#f0c8b0' }, tab: 'food' });
item(302, 'CHICKEN', 'Cooked Chicken', { food: 6, icon: { kind: 'meat', color: '#c08a4a' }, tab: 'food' });
item(303, 'LEATHER', 'Leather', { icon: { kind: 'blob', color: '#9c5a2a' }, tab: 'misc' });
item(304, 'BONE', 'Bone', { icon: { kind: 'tool', shape: 'bone', color: '#f0f0e0' }, tab: 'misc' });
item(305, 'FLESH', 'Rotten Flesh', { food: 4, icon: { kind: 'meat', color: '#8a5a3a' }, tab: 'food' });
item(306, 'BUCKET', 'Bucket', { stack: 16, icon: { kind: 'bucket', color: '#d8d8d8' }, tab: 'tools' });
item(307, 'WATER_BUCKET', 'Water Bucket', { stack: 1, icon: { kind: 'bucket', color: '#3355dd' }, tab: 'tools' });
item(308, 'LAVA_BUCKET', 'Lava Bucket', { stack: 1, icon: { kind: 'bucket', color: '#cf5b0c' }, tab: 'tools' });
item(309, 'MUTTON_RAW', 'Raw Mutton', { food: 2, icon: { kind: 'meat', color: '#e08080' }, tab: 'food' });
const armorDef = (mat, slot, points, durMul) => ({
  stack: 1, armor: { slot, points, dur: 100 * durMul },
  icon: { kind: 'armor', slot, color: TIERS[mat].color }, tab: 'tools',
});
item(310, 'MUTTON', 'Cooked Mutton', { food: 6, icon: { kind: 'meat', color: '#a06a3a' }, tab: 'food' });
item(311, 'IRON_HELMET', 'Iron Helmet', armorDef('iron', 0, 2, 2));
item(312, 'IRON_CHEST', 'Iron Chestplate', armorDef('iron', 1, 6, 3));
item(313, 'IRON_LEGS', 'Iron Leggings', armorDef('iron', 2, 5, 3));
item(314, 'IRON_BOOTS', 'Iron Boots', armorDef('iron', 3, 2, 2));
item(315, 'DIAMOND_HELMET', 'Diamond Helmet', armorDef('diamond', 0, 3, 4));
item(316, 'DIAMOND_CHEST', 'Diamond Chestplate', armorDef('diamond', 1, 8, 6));
item(317, 'DIAMOND_LEGS', 'Diamond Leggings', armorDef('diamond', 2, 6, 6));
item(318, 'DOOR_ITEM', 'Oak Door', { stack: 16, place: B.DOOR, icon: { kind: 'tile', tile: TEX.door_top }, tab: 'building' });
item(319, 'BED_ITEM', 'Bed', { stack: 1, place: B.BED, icon: { kind: 'tile', tile: TEX.bed_top }, tab: 'deco' });
item(320, 'DIAMOND_BOOTS', 'Diamond Boots', armorDef('diamond', 3, 3, 4));
item(321, 'GOLDEN_APPLE', 'Golden Apple', { food: 4, icon: { kind: 'fruit', color: '#f5d93f' }, tab: 'food' });
item(331, 'REDSTONE', 'Redstone Dust', { place: B.WIRE, icon: { kind: 'blob', color: '#d8301a' }, tab: 'redstone' });

export function itemDef(id) { return ITEMS[id]; }
export function stackMax(id) { return ITEMS[id] ? ITEMS[id].stack : 64; }

// ============================== ICON SHEET =================================
export const ICON_COLS = 24, ICON_PX = 16;
let _atlasCanvas = null;
export function getAtlasCanvas() { return _atlasCanvas || (_atlasCanvas = buildAtlas()); }

function drawTileTo(c, tile, dx, dy, dw = 16, dh = 16) {
  const atlas = getAtlasCanvas();
  const sx = (tile % ATLAS_TILES) * 16, sy = ((tile / ATLAS_TILES) | 0) * 16;
  c.drawImage(atlas, sx, sy, 16, 16, dx, dy, dw, dh);
}

function drawBlockIcon(c, x, y, blockId) {
  const b = BLOCKS[blockId];
  if (b.cross || b.shape === 'torch' || b.shape === 'flat' || b.shape === 'ladder') {
    drawTileTo(c, b.tex[4], x, y); return;
  }
  // mini isometric cube
  c.save();
  c.translate(x + 8, y + 4);
  // top
  c.save(); c.transform(0.5, 0.25, -0.5, 0.25, 0, 0); drawTileTo(c, b.tex[2], -8, -8); c.restore();
  // left (-x)
  c.save(); c.transform(0.5, 0.25, 0, 0.55, 0, 0); c.globalAlpha = 0.8; drawTileTo(c, b.tex[1], -8, 0); c.restore();
  // right (+z)
  c.save(); c.transform(0.5, -0.25, 0, 0.55, 0, 4); c.globalAlpha = 0.6; drawTileTo(c, b.tex[4], 0, 0); c.restore();
  c.restore();
}

const TOOL_PIX = {
  pickaxe: ['.MMMM...', 'MM..MM..', 'M....M..', '....HM..', '...H..M.', '..H.....', '.H......', 'H.......'],
  axe: ['..MMM...', '.MMMM...', '.MMHM...', '..MH....', '..H.....', '.H......', '.H......', 'H.......'],
  shovel: ['....MM..', '...MMM..', '...HM...', '..H.....', '..H.....', '.H......', '.H......', 'H.......'],
  sword: ['......M.', '.....MM.', '....MM..', '...MM...', 'H.MM....', '.HM.....', '.HH.....', 'H..H....'],
  hoe: ['..MMMM..', '..M.....', '...H....', '...H....', '..H.....', '..H.....', '.H......', '.H......'],
  stick: ['........', '......H.', '.....H..', '....H...', '...H....', '..H.....', '.H......', 'H.......'],
  bow: ['..MMM...', '.M...M..', 'M.....M.', 'M..s..M.', 'M..s..M.', 'M.....M.', '.M...M..', '..MMM...'],
  arrow: ['......WW', '.....WW.', '....MW..', '...M....', '..M.....', '.HM.....', 'HH......', 'H.......'],
  string: ['.W......', '.W......', '..W.....', '..W.....', '...W....', '...W....', '....W...', '....W...'],
  feather: ['....WW..', '...WWW..', '...WWW..', '..WWW...', '..WW....', '.WW.....', '.W......', 'H.......'],
  bone: ['WW....WW', 'WWW..WWW', '.WWWWWW.', '..WWW...', '..WWW...', '.WWWWWW.', 'WWW..WWW', 'WW....WW'],
  flint_steel: ['........', '.MM.....', 'M..M....', 'M.......', '......bb', '.....bbb', '....bbb.', '........'],
};

function drawPixShape(c, x, y, shape, color) {
  const rows = TOOL_PIX[shape] || TOOL_PIX.stick;
  const cols = { M: color, m: shade(color, 0.6), H: '#8a6543', W: '#f0f0f0', s: '#e8e8e8', b: '#44403c' };
  for (let r = 0; r < 8; r++) for (let cc = 0; cc < 8; cc++) {
    const ch = rows[r][cc];
    if (ch === '.') continue;
    c.fillStyle = cols[ch] || color;
    c.fillRect(x + cc * 2, y + r * 2, 2, 2);
  }
}

function drawItemIcon(c, x, y, def) {
  const ic = def.icon;
  if (!ic) { c.fillStyle = '#f0f'; c.fillRect(x + 4, y + 4, 8, 8); return; }
  switch (ic.kind) {
    case 'block': drawBlockIcon(c, x, y, ic.block); break;
    case 'tile': drawTileTo(c, ic.tile, x, y); break;
    case 'tool': drawPixShape(c, x, y, ic.shape, ic.color); break;
    case 'ingot':
      c.fillStyle = shade(ic.color, 0.7); c.fillRect(x + 2, y + 7, 12, 6);
      c.fillStyle = ic.color; c.fillRect(x + 3, y + 5, 10, 5);
      c.fillStyle = shade(ic.color, 1.25); c.fillRect(x + 4, y + 6, 4, 2);
      break;
    case 'gem':
      c.fillStyle = ic.color;
      c.beginPath(); c.moveTo(x + 8, y + 2); c.lineTo(x + 14, y + 7); c.lineTo(x + 8, y + 14); c.lineTo(x + 2, y + 7); c.closePath(); c.fill();
      c.fillStyle = shade(ic.color, 1.3); c.fillRect(x + 6, y + 5, 3, 3);
      break;
    case 'blob':
      c.fillStyle = ic.color; c.fillRect(x + 4, y + 5, 8, 7); c.fillRect(x + 5, y + 4, 6, 9);
      c.fillStyle = shade(ic.color, 1.4); c.fillRect(x + 6, y + 6, 3, 2);
      break;
    case 'seeds':
      c.fillStyle = ic.color;
      for (const [sx, sy] of [[4, 5], [9, 4], [6, 9], [11, 8], [8, 12], [4, 11]]) c.fillRect(x + sx, y + sy, 2, 3);
      break;
    case 'bread':
      c.fillStyle = ic.color; c.fillRect(x + 2, y + 6, 12, 6);
      c.fillStyle = shade(ic.color, 1.3); c.fillRect(x + 3, y + 5, 10, 3);
      break;
    case 'fruit':
      c.fillStyle = ic.color; c.fillRect(x + 4, y + 5, 8, 8); c.fillRect(x + 3, y + 6, 10, 6);
      c.fillStyle = '#54402a'; c.fillRect(x + 7, y + 3, 2, 3);
      c.fillStyle = '#3e9a2c'; c.fillRect(x + 9, y + 3, 3, 2);
      break;
    case 'meat':
      c.fillStyle = ic.color; c.fillRect(x + 3, y + 5, 10, 8);
      c.fillStyle = shade(ic.color, 1.25); c.fillRect(x + 4, y + 6, 4, 3);
      c.fillStyle = shade(ic.color, 0.7); c.fillRect(x + 10, y + 10, 3, 3);
      break;
    case 'bucket':
      c.fillStyle = '#d8d8d8'; c.fillRect(x + 4, y + 7, 8, 7);
      c.fillStyle = '#a8a8a8'; c.fillRect(x + 3, y + 6, 1, 4); c.fillRect(x + 12, y + 6, 1, 4);
      if (ic.color !== '#d8d8d8') { c.fillStyle = ic.color; c.fillRect(x + 5, y + 7, 6, 2); }
      break;
    case 'armor': {
      c.fillStyle = ic.color;
      const s = ic.slot;
      if (s === 0) { c.fillRect(x + 4, y + 4, 8, 5); c.fillRect(x + 4, y + 9, 2, 3); c.fillRect(x + 10, y + 9, 2, 3); }
      else if (s === 1) { c.fillRect(x + 4, y + 4, 8, 8); c.fillRect(x + 2, y + 4, 2, 4); c.fillRect(x + 12, y + 4, 2, 4); }
      else if (s === 2) { c.fillRect(x + 4, y + 4, 8, 3); c.fillRect(x + 4, y + 7, 3, 7); c.fillRect(x + 9, y + 7, 3, 7); }
      else { c.fillRect(x + 4, y + 5, 3, 6); c.fillRect(x + 9, y + 5, 3, 6); c.fillRect(x + 3, y + 11, 4, 2); c.fillRect(x + 9, y + 11, 4, 2); }
      c.fillStyle = shade(ic.color, 0.7);
      c.fillRect(x + 5, y + 5, 2, 2);
      break;
    }
    default: c.fillStyle = '#f0f'; c.fillRect(x + 4, y + 4, 8, 8);
  }
}

let _iconSheet = null;
export function getIconSheet() {
  if (_iconSheet) return _iconSheet;
  const ids = Object.keys(ITEMS).map(Number);
  const maxId = Math.max(...ids);
  const rows = Math.ceil((maxId + 1) / ICON_COLS);
  const cv = document.createElement('canvas');
  cv.width = ICON_COLS * ICON_PX; cv.height = rows * ICON_PX;
  const c = cv.getContext('2d');
  c.imageSmoothingEnabled = false;
  for (const id of ids) {
    const x = (id % ICON_COLS) * ICON_PX, y = ((id / ICON_COLS) | 0) * ICON_PX;
    drawItemIcon(c, x, y, ITEMS[id]);
  }
  _iconSheet = cv;
  return cv;
}

export function iconCSS(id) {
  const sheet = getIconSheet();
  const x = (id % ICON_COLS) * ICON_PX, y = ((id / ICON_COLS) | 0) * ICON_PX;
  return { x, y, sheet };
}

// ============================== HELPERS ====================================
export function isOpaque(id) { const b = BLOCKS[id]; return b ? b.opaque : false; }
export function isSolid(id) { const b = BLOCKS[id]; return b ? b.solid : false; }

// seconds to break `blockId` with held item (or null)
export function breakTime(blockId, heldId) {
  const b = BLOCKS[blockId];
  if (!b || b.hard === Infinity) return Infinity;
  if (b.hard === 0) return 0.05;
  let mult = 1;
  const it = heldId != null ? ITEMS[heldId] : null;
  const tool = it && it.tool;
  if (b.tool && tool && tool.type === b.tool) mult = tool.speed;
  if (tool && tool.type === 'sword' && (b.flammable || b.cross)) mult = 1.5;
  let time = b.hard / 5 / mult * 1.5;
  if (b.level > 0 && (!tool || tool.type !== b.tool || tool.tier < b.level)) time = b.hard / 5 * 5;
  return Math.max(0.05, time);
}

export function getDrops(blockId, heldId, meta) {
  const b = BLOCKS[blockId];
  if (!b) return [];
  const it = heldId != null ? ITEMS[heldId] : null;
  const tool = it && it.tool;
  if (b.level > 0) {
    if (!tool || tool.type !== b.tool || tool.tier < b.level) return [];
  }
  if (b.drops === null) return [];
  if (typeof b.drops === 'function') return b.drops(meta) || [];
  return [{ id: blockId, count: 1 }];
}
