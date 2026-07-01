// gfx/geom.js — bake a list of colored primitive "parts" into one
// BufferGeometry with vertex colors. Everything visible in the game (houses,
// tanks, people, trees) is built from these low-poly parts and then rendered
// through InstancedMesh for performance.

import * as THREE from 'three';

/**
 * @param {Array} parts — {shape:'box'|'cyl'|'cone'|'sphere', size:[], pos:[x,y,z], rotY?, rotX?, color}
 * @returns {THREE.BufferGeometry} merged, vertex-colored
 */
export function bake(parts) {
  const geos = [];
  for (const p of parts) {
    let g;
    switch (p.shape) {
      case 'box': g = new THREE.BoxGeometry(...p.size); break;
      case 'cyl': g = new THREE.CylinderGeometry(...p.size); break;
      case 'cone': g = new THREE.ConeGeometry(...p.size); break;
      case 'sphere': g = new THREE.SphereGeometry(...p.size); break;
      default: continue;
    }
    g = g.toNonIndexed();
    const c = new THREE.Color(p.color ?? 0xffffff);
    const n = g.attributes.position.count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    if (p.rotX) g.rotateX(p.rotX);
    if (p.rotZ) g.rotateZ(p.rotZ);
    if (p.rotY) g.rotateY(p.rotY);
    if (p.pos) g.translate(...p.pos);
    geos.push(g);
  }
  return mergeGeos(geos);
}

/** Minimal non-indexed merge (position/normal/color). */
export function mergeGeos(geos) {
  let total = 0;
  for (const g of geos) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  let off = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, off * 3);
    nor.set(g.attributes.normal.array, off * 3);
    col.set(g.attributes.color.array, off * 3);
    off += g.attributes.position.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

/** Standard vertex-colored material used by all baked geometry. */
export function bakedMaterial(opts = {}) {
  return new THREE.MeshLambertMaterial({ vertexColors: true, ...opts });
}

/** Text label rendered to a sprite (settlement names etc.). */
export function makeLabel(text, { size = 26, color = '#ffffff', bg = 'rgba(8,12,20,0.55)' } = {}) {
  const pad = 10;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = `600 ${size}px system-ui, sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width) + pad * 2;
  canvas.width = w; canvas.height = size + pad * 1.4;
  const c2 = canvas.getContext('2d');
  c2.font = `600 ${size}px system-ui, sans-serif`;
  c2.fillStyle = bg;
  c2.beginPath();
  c2.roundRect(0, 0, canvas.width, canvas.height, 8);
  c2.fill();
  c2.fillStyle = color;
  c2.textBaseline = 'middle';
  c2.fillText(text, pad, canvas.height / 2 + 1);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(canvas.width * 0.16, canvas.height * 0.16, 1);
  return sprite;
}
