// Shared material library. Every generator pulls from here so draw calls batch
// well and the whole nation can be re-tinted from one place.
import * as THREE from 'three';
import { makeCanvasTex } from './utils.js';

export function initMaterials() {
  const M = {};
  const std = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.0, ...opts });

  // architecture
  M.marble = std(0xe8e4da, { roughness: 0.35, metalness: 0.05 });
  M.marbleDark = std(0xb9b2a4, { roughness: 0.5 });
  M.plaster = std(0xd8cfbc);
  M.plasterDark = std(0xb5aa93);
  M.stone = std(0x9a958c);
  M.stoneDark = std(0x6e6a62);
  M.concrete = std(0x8f8f8a);
  M.gold = std(0xd8b04a, { roughness: 0.25, metalness: 0.85 });
  M.goldDim = std(0xa8842e, { roughness: 0.4, metalness: 0.7 });
  M.roofCopper = std(0x3f7d6b, { roughness: 0.5, metalness: 0.3 });
  M.roofSlate = std(0x39404a, { roughness: 0.9 });
  M.wood = std(0x7a5a38, { roughness: 0.75 });
  M.woodDark = std(0x4c3722, { roughness: 0.8 });
  M.redCarpet = std(0x7c1622, { roughness: 1 });
  M.blueCarpet = std(0x1e2c4c, { roughness: 1 });
  M.brick = std(0x9c6248);
  M.whitewash = std(0xe6e0d0);

  // ground
  M.road = std(0x33353a, { roughness: 0.95 });
  M.roadLine = std(0xcfc79b, { roughness: 0.9 });
  M.sidewalk = std(0x86847c, { roughness: 0.95 });
  M.gravel = std(0x7d7468, { roughness: 1 });
  M.parade = std(0x77746b, { roughness: 0.95 });
  M.sand = std(0xcbb98a, { roughness: 1 });

  // nature
  M.leaf = std(0x2e5d33, { roughness: 1 });
  M.leafDark = std(0x22421f, { roughness: 1 });
  M.hedge = std(0x2c5230, { roughness: 1 });
  M.trunk = std(0x5a442e, { roughness: 1 });
  M.rock = std(0x76716a, { roughness: 1 });

  // military / hardware
  M.camo = std(0x4c5b3c, { roughness: 0.9 });
  M.camoDark = std(0x39452e, { roughness: 0.9 });
  M.gunmetal = std(0x2b2e33, { roughness: 0.55, metalness: 0.55 });
  M.metal = std(0x9aa0a8, { roughness: 0.45, metalness: 0.7 });
  M.rubber = std(0x1a1a1c, { roughness: 1 });
  M.limoBlack = std(0x0e0f12, { roughness: 0.25, metalness: 0.6 });
  M.carRed = std(0x8e2a24, { roughness: 0.4, metalness: 0.4 });
  M.carBlue = std(0x2c4a6e, { roughness: 0.4, metalness: 0.4 });
  M.carWhite = std(0xd8d6ce, { roughness: 0.4, metalness: 0.4 });
  M.carTaxi = std(0xc7a02e, { roughness: 0.45, metalness: 0.3 });
  M.glass = new THREE.MeshStandardMaterial({ color: 0x6f8fa5, roughness: 0.1, metalness: 0.6, transparent: true, opacity: 0.55 });
  M.glassDark = new THREE.MeshStandardMaterial({ color: 0x141a20, roughness: 0.15, metalness: 0.7 });
  M.headlight = new THREE.MeshStandardMaterial({ color: 0xfff2c4, emissive: 0xfff2c4, emissiveIntensity: 0 });
  M.taillight = new THREE.MeshStandardMaterial({ color: 0x551111, emissive: 0xff2211, emissiveIntensity: 0 });

  // people
  M.skin = [std(0xd9a877), std(0xb98354), std(0x8a5a38), std(0xe8c39a)];
  M.uniformGuard = std(0x2c3a55);      // palace guard: navy + gold
  M.uniformGuardTrim = std(0xc8a23c, { metalness: 0.4, roughness: 0.4 });
  M.uniformArmy = std(0x4c5b3c);
  M.uniformOfficer = std(0x3a4030);
  M.suitDark = std(0x23252b);
  M.suitGray = std(0x4a4d55);
  M.servant = std(0xdcd7ca);
  M.servantTrim = std(0x37312a);
  M.hostile = std(0x33302c);
  M.hostileBand = std(0x8e1f2f);
  M.civvies = [std(0x7c4a3c), std(0x3c5a6e), std(0x5c6e3c), std(0x6e5a7c), std(0x8a7c5a), std(0x4a6e64), std(0x7c6248), std(0x506080)];
  M.hair = [std(0x2a2018), std(0x453425), std(0x6e5a3c), std(0x8a8578), std(0x1a1a1a)];

  // emissive night windows for city towers
  M.windowsTex = makeCanvasTex(128, 256, (ctx, w, h) => {
    ctx.fillStyle = '#3a4148'; ctx.fillRect(0, 0, w, h);
    for (let y = 8; y < h - 8; y += 18) {
      for (let x = 8; x < w - 8; x += 16) {
        ctx.fillStyle = Math.random() < 0.5 ? '#151a20' : '#0d1116';
        ctx.fillRect(x, y, 10, 11);
      }
    }
  });
  M.windowsEmissiveTex = makeCanvasTex(128, 256, (ctx, w, h) => {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
    for (let y = 8; y < h - 8; y += 18) {
      for (let x = 8; x < w - 8; x += 16) {
        if (Math.random() < 0.42) {
          ctx.fillStyle = ['#ffd98a', '#ffedb8', '#cfe2ff'][Math.floor(Math.random() * 3)];
          ctx.fillRect(x, y, 10, 11);
        }
      }
    }
  });
  M.tower = [];
  for (const base of [0x8a8578, 0x9aa0a8, 0x7c7468, 0xa8a49a]) {
    const m = new THREE.MeshStandardMaterial({
      color: base, roughness: 0.85,
      map: M.windowsTex, emissiveMap: M.windowsEmissiveTex,
      emissive: 0xffffff, emissiveIntensity: 0,
    });
    M.tower.push(m);
  }

  // lamp glow (intensity driven by Sky at night)
  M.lampGlow = new THREE.MeshStandardMaterial({ color: 0xffe6b0, emissive: 0xffd98a, emissiveIntensity: 0 });
  M.screenGlow = new THREE.MeshStandardMaterial({ color: 0x0a141c, emissive: 0x3fa4d6, emissiveIntensity: 0.9 });
  M.screenRed = new THREE.MeshStandardMaterial({ color: 0x140a0a, emissive: 0xd63f3f, emissiveIntensity: 0.7 });

  // list of materials whose emissiveIntensity follows night factor
  M.nightEmissives = [M.lampGlow, ...M.tower, M.headlight, M.taillight];
  return M;
}
