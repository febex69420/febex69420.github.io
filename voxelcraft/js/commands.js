// commands.js — chat command parser.
import { B, BLOCKS, I, ITEMS } from './blocks.js';
import { MOBS } from './entities.js';
import { clamp } from './util.js';

function findItem(name) {
  name = name.toUpperCase();
  if (/^\d+$/.test(name)) return ITEMS[+name] ? +name : null;
  if (I[name] !== undefined) return I[name];
  if (B[name] !== undefined && ITEMS[B[name]]) return B[name];
  if (I['BI_' + name] !== undefined) return I['BI_' + name];
  // fuzzy by display name
  const q = name.replace(/_/g, ' ').toLowerCase();
  for (const id in ITEMS) if (ITEMS[id].name.toLowerCase() === q) return +id;
  for (const id in ITEMS) if (ITEMS[id].name.toLowerCase().includes(q)) return +id;
  return null;
}

function findBlock(name) {
  name = name.toUpperCase();
  if (/^\d+$/.test(name)) return BLOCKS[+name] ? +name : null;
  if (B[name] !== undefined) return B[name];
  const q = name.replace(/_/g, ' ').toLowerCase();
  for (const b of BLOCKS) if (b && b.name.toLowerCase() === q) return b.id;
  return null;
}

const COMMANDS = {
  help: {
    usage: '/help', desc: 'List commands',
    run: () => 'Commands: ' + Object.keys(COMMANDS).map(c => '/' + c).join(' '),
  },
  give: {
    usage: '/give <item> [count]', desc: 'Give items',
    run: (g, a) => {
      if (!a[0]) return 'Usage: /give <item> [count]';
      const id = findItem(a[0]);
      if (id === null) return 'Unknown item: ' + a[0];
      const n = clamp(parseInt(a[1] || '1', 10) || 1, 1, 999);
      g.player.give(id, n);
      return `Gave ${n} × ${ITEMS[id].name}`;
    },
  },
  tp: {
    usage: '/tp <x> <y> <z>', desc: 'Teleport',
    run: (g, a) => {
      if (a.length < 3) return 'Usage: /tp <x> <y> <z>';
      const p = g.player.pos;
      const parse = (s, cur) => s.startsWith('~') ? cur + (parseFloat(s.slice(1)) || 0) : parseFloat(s);
      const x = parse(a[0], p.x), y = parse(a[1], p.y), z = parse(a[2], p.z);
      if ([x, y, z].some(isNaN)) return 'Invalid coordinates';
      g.player.pos.set(x, y, z);
      g.player.vel.set(0, 0, 0);
      g.player.fallStart = null;
      return `Teleported to ${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}`;
    },
  },
  time: {
    usage: '/time set <day|noon|night|midnight|0-24000>', desc: 'Set time',
    run: (g, a) => {
      if (a[0] === 'set') {
        const names = { day: 1000, noon: 6000, sunset: 12000, night: 13500, midnight: 18000, sunrise: 23000 };
        const t = names[a[1]] !== undefined ? names[a[1]] : parseInt(a[1], 10);
        if (isNaN(t)) return 'Usage: ' + COMMANDS.time.usage;
        g.time = ((t % 24000) + 24000) % 24000;
        return 'Time set to ' + g.time;
      }
      if (a[0] === 'add') { g.time = (g.time + (parseInt(a[1], 10) || 0)) % 24000; return 'Time is now ' + Math.floor(g.time); }
      return 'Time is ' + Math.floor(g.time);
    },
  },
  weather: {
    usage: '/weather <clear|rain|thunder>', desc: 'Set weather',
    run: (g, a) => {
      if (!['clear', 'rain', 'thunder'].includes(a[0])) return 'Usage: ' + COMMANDS.weather.usage;
      g.setWeather(a[0]);
      return 'Weather set to ' + a[0];
    },
  },
  gamemode: {
    usage: '/gamemode <survival|creative|spectator>', desc: 'Change game mode',
    run: (g, a) => {
      const modes = { survival: 0, s: 0, 0: 0, creative: 1, c: 1, 1: 1, spectator: 2, sp: 2, 2: 2 };
      const m = modes[a[0]];
      if (m === undefined) return 'Usage: ' + COMMANDS.gamemode.usage;
      g.player.gamemode = m;
      if (m !== 1) g.player.flying = m === 2;
      g.ui.refreshStats();
      return 'Game mode set to ' + ['Survival', 'Creative', 'Spectator'][m];
    },
  },
  summon: {
    usage: '/summon <mob> [count]', desc: 'Spawn a mob',
    run: (g, a) => {
      if (!MOBS[a[0]]) return 'Unknown mob. Mobs: ' + Object.keys(MOBS).join(', ');
      const n = clamp(parseInt(a[1] || '1', 10) || 1, 1, 20);
      const p = g.player.pos, d = g.player.lookDir();
      for (let i = 0; i < n; i++)
        g.entities.spawn(a[0], g.world, p.x + d.x * 3 + (Math.random() - 0.5) * 2, p.y + 1, p.z + d.z * 3 + (Math.random() - 0.5) * 2);
      return `Summoned ${n} × ${a[0]}`;
    },
  },
  kill: {
    usage: '/kill [mobs|items|all]', desc: 'Kill entities (or yourself)',
    run: (g, a) => {
      if (!a[0]) { g.player.damage(1000, 'void'); g.player.hp = 0; g.player.die('void'); return 'Ouch.'; }
      let n = 0;
      for (const e of [...g.entities.list]) {
        const isMob = e.def !== undefined;
        if ((a[0] === 'mobs' && isMob) || (a[0] === 'items' && e.type === 'item') || a[0] === 'all') { e.remove(); n++; }
      }
      return `Removed ${n} entities`;
    },
  },
  clear: {
    usage: '/clear', desc: 'Clear inventory',
    run: (g) => {
      g.player.inventory.fill(null);
      g.player.armor.fill(null);
      g.ui.refreshHotbar();
      return 'Inventory cleared';
    },
  },
  seed: { usage: '/seed', desc: 'Show world seed', run: (g) => 'Seed: ' + g.seed },
  setblock: {
    usage: '/setblock <x> <y> <z> <block>', desc: 'Place a block',
    run: (g, a) => {
      if (a.length < 4) return 'Usage: ' + COMMANDS.setblock.usage;
      const p = g.player.pos;
      const parse = (s, cur) => s.startsWith('~') ? Math.floor(cur + (parseFloat(s.slice(1)) || 0)) : parseInt(s, 10);
      const x = parse(a[0], p.x), y = parse(a[1], p.y), z = parse(a[2], p.z);
      const id = findBlock(a[3]);
      if (id === null) return 'Unknown block: ' + a[3];
      g.world.setBlock(x, y, z, id);
      return `Set ${BLOCKS[id].name} at ${x},${y},${z}`;
    },
  },
  fill: {
    usage: '/fill <x1> <y1> <z1> <x2> <y2> <z2> <block>', desc: 'Fill a region (max 32768)',
    run: (g, a) => {
      if (a.length < 7) return 'Usage: ' + COMMANDS.fill.usage;
      const p = g.player.pos;
      const parse = (s, cur) => s.startsWith('~') ? Math.floor(cur + (parseFloat(s.slice(1)) || 0)) : parseInt(s, 10);
      const c = [parse(a[0], p.x), parse(a[1], p.y), parse(a[2], p.z), parse(a[3], p.x), parse(a[4], p.y), parse(a[5], p.z)];
      if (c.some(isNaN)) return 'Invalid coordinates';
      const id = findBlock(a[6]);
      if (id === null) return 'Unknown block: ' + a[6];
      const [x1, x2] = [Math.min(c[0], c[3]), Math.max(c[0], c[3])];
      const [y1, y2] = [Math.min(c[1], c[4]), Math.max(c[1], c[4])];
      const [z1, z2] = [Math.min(c[2], c[5]), Math.max(c[2], c[5])];
      const vol = (x2 - x1 + 1) * (y2 - y1 + 1) * (z2 - z1 + 1);
      if (vol > 32768) return 'Region too large: ' + vol;
      for (let x = x1; x <= x2; x++) for (let y = y1; y <= y2; y++) for (let z = z1; z <= z2; z++)
        g.world.setBlock(x, y, z, id, { noUpdate: vol > 512 });
      return `Filled ${vol} blocks with ${BLOCKS[id].name}`;
    },
  },
  spawnpoint: {
    usage: '/spawnpoint', desc: 'Set your spawn here',
    run: (g) => {
      const p = g.player.pos;
      g.player.spawnPoint = { x: p.x, y: p.y, z: p.z };
      return 'Spawn point set';
    },
  },
  difficulty: {
    usage: '/difficulty <peaceful|normal>', desc: 'Toggle hostile mobs',
    run: (g, a) => {
      if (a[0] === 'peaceful') {
        g.peaceful = true;
        for (const e of [...g.entities.list]) if (e.def?.hostile) e.remove();
        return 'Difficulty set to Peaceful';
      }
      if (a[0] === 'normal') { g.peaceful = false; return 'Difficulty set to Normal'; }
      return 'Usage: ' + COMMANDS.difficulty.usage;
    },
  },
  heal: { usage: '/heal', desc: 'Restore health', run: (g) => { g.player.heal(20); return 'Healed'; } },
  feed: { usage: '/feed', desc: 'Restore hunger', run: (g) => { g.player.food = 20; g.player.saturation = 20; g.ui.refreshStats(); return 'Fed'; } },
  say: {
    usage: '/say <message>', desc: 'Broadcast a message',
    run: (g, a, raw) => {
      const msg = '[Server] ' + raw.slice(raw.indexOf(' ') + 1);
      g.ui.chatMsg(msg, '#fd5');
      g.mp?.sendChat(msg);
      return null;
    },
  },
};

export function runCommand(game, text) {
  const raw = text.slice(1).trim();
  const parts = raw.split(/\s+/);
  const name = parts[0].toLowerCase();
  const cmd = COMMANDS[name];
  if (!cmd) return `Unknown command: /${name}. Try /help`;
  try {
    return cmd.run(game, parts.slice(1), raw);
  } catch (e) {
    console.error(e);
    return 'Command error: ' + e.message;
  }
}
