/* ============================================================
   Glaze · Voxel 3D editor (ES module, lazy-loaded)
   Three.js + OrbitControls from CDN. Place / erase voxels in 3D,
   orbit & zoom, adjustable brush size, undo/redo, export.
   ============================================================ */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export async function createVoxelEditor(container, opts) {
  opts = opts || {};
  const GRID = 32;
  const MAX_VOXELS = 40000;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(container.clientWidth || 800, container.clientHeight || 600);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, (container.clientWidth || 800) / (container.clientHeight || 600), 0.1, 1000);
  camera.position.set(20, 18, 22);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, 2, 0);
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.minDistance = 4;
  controls.maxDistance = 120;

  // Lighting
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9098a4, 1.0));
  const dir = new THREE.DirectionalLight(0xffffff, 1.1);
  dir.position.set(14, 24, 10);
  scene.add(dir);
  scene.add(new THREE.AmbientLight(0xffffff, 0.25));

  // Grid + invisible ground for raycasting the first layer
  const grid = new THREE.GridHelper(GRID, GRID, 0x888888, 0xbbbbbb);
  grid.material.opacity = 0.35; grid.material.transparent = true;
  scene.add(grid);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(GRID, GRID),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // Rollover highlight
  const roll = new THREE.Mesh(
    new THREE.BoxGeometry(1.02, 1.02, 1.02),
    new THREE.MeshBasicMaterial({ color: 0x1c1c1e, opacity: 0.25, transparent: true })
  );
  roll.visible = false;
  scene.add(roll);

  // Voxel storage
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const matCache = new Map();
  function matFor(hex) {
    if (!matCache.has(hex)) matCache.set(hex, new THREE.MeshLambertMaterial({ color: new THREE.Color(hex) }));
    return matCache.get(hex);
  }
  const voxels = new Map(); // "x,y,z" -> { mesh, color }
  const key = (x, y, z) => x + "," + y + "," + z;

  function addVoxel(x, y, z, hex) {
    if (voxels.has(key(x, y, z)) || voxels.size >= MAX_VOXELS) return;
    if (Math.abs(x) > GRID / 2 || Math.abs(z) > GRID / 2 || y < 0 || y > GRID) return;
    const m = new THREE.Mesh(boxGeo, matFor(hex));
    m.position.set(x + 0.5, y + 0.5, z + 0.5);
    m.userData.cell = { x, y, z };
    scene.add(m);
    voxels.set(key(x, y, z), { mesh: m, color: hex });
  }
  function removeVoxel(x, y, z) {
    const v = voxels.get(key(x, y, z));
    if (!v) return;
    scene.remove(v.mesh);
    voxels.delete(key(x, y, z));
  }
  function clearAll() {
    voxels.forEach((v) => scene.remove(v.mesh));
    voxels.clear();
  }

  // State
  const st = { color: opts.color || "#1c1c1e", brush: opts.brushSize || 1, tool: "add" };

  // ---- History ----
  let hist = [], hi = -1;
  function snapshot() {
    const arr = [];
    voxels.forEach((v, k) => arr.push([k, v.color]));
    return arr;
  }
  function pushHist() {
    hist = hist.slice(0, hi + 1);
    hist.push(snapshot());
    if (hist.length > 40) hist.shift();
    hi = hist.length - 1;
  }
  function restore(idx) {
    if (idx < 0 || idx >= hist.length) return;
    hi = idx;
    clearAll();
    hist[idx].forEach(([k, color]) => {
      const [x, y, z] = k.split(",").map(Number);
      addVoxel(x, y, z, color);
    });
  }
  pushHist(); // initial empty

  // ---- Raycasting ----
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  function setPointer(clientX, clientY) {
    const r = renderer.domElement.getBoundingClientRect();
    pointer.x = ((clientX - r.left) / r.width) * 2 - 1;
    pointer.y = -((clientY - r.top) / r.height) * 2 + 1;
  }
  function pick() {
    raycaster.setFromCamera(pointer, camera);
    const objs = [ground];
    voxels.forEach((v) => objs.push(v.mesh));
    const hits = raycaster.intersectObjects(objs, false);
    return hits.length ? hits[0] : null;
  }
  function targetCell(hit, forAdd) {
    if (hit.object === ground) {
      return { x: Math.floor(hit.point.x), y: 0, z: Math.floor(hit.point.z) };
    }
    const c = hit.object.userData.cell;
    if (!forAdd) return { x: c.x, y: c.y, z: c.z };
    const n = hit.face.normal;
    return { x: c.x + Math.round(n.x), y: c.y + Math.round(n.y), z: c.z + Math.round(n.z) };
  }

  function applyBrush(cell, add) {
    const n = st.brush;
    for (let dx = 0; dx < n; dx++)
      for (let dy = 0; dy < n; dy++)
        for (let dz = 0; dz < n; dz++) {
          const x = cell.x + dx, y = cell.y + dy, z = cell.z + dz;
          if (add) addVoxel(x, y, z, st.color);
          else removeVoxel(x, y, z);
        }
    pushHist();
  }

  function updateRoll() {
    const hit = pick();
    if (!hit) { roll.visible = false; return; }
    const cell = targetCell(hit, st.tool === "add");
    roll.position.set(cell.x + 0.5, cell.y + 0.5, cell.z + 0.5);
    roll.material.color.set(st.tool === "add" ? st.color : "#ff3b30");
    roll.visible = true;
  }

  // ---- Pointer interaction (click = place, drag = orbit) ----
  let downPos = null, moved = false, downBtn = 0;
  const el = renderer.domElement;
  el.style.touchAction = "none";
  el.addEventListener("pointerdown", (e) => { downPos = { x: e.clientX, y: e.clientY }; moved = false; downBtn = e.button; });
  el.addEventListener("pointermove", (e) => {
    setPointer(e.clientX, e.clientY);
    if (downPos && Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 6) moved = true;
    updateRoll();
  });
  el.addEventListener("pointerup", (e) => {
    if (!moved && downBtn === 0) {
      setPointer(e.clientX, e.clientY);
      const hit = pick();
      if (hit) applyBrush(targetCell(hit, st.tool === "add"), st.tool === "add");
    }
    downPos = null;
  });
  el.addEventListener("pointerleave", () => { roll.visible = false; });

  // ---- Render loop ----
  let running = false, raf = 0;
  function loop() {
    if (!running) return;
    controls.update();
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  }
  function start() { if (!running) { running = true; loop(); } }
  function stop() { running = false; cancelAnimationFrame(raf); }

  function resize() {
    const w = container.clientWidth || 800, h = container.clientHeight || 600;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  // ---- Export ----
  function exportPNG() {
    renderer.render(scene, camera);
    return new Promise((res) => renderer.domElement.toBlob((b) => res(b), "image/png"));
  }
  function exportOBJ() {
    let out = "# Glaze voxel export\n";
    let vbase = 1;
    const corners = [
      [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
      [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
    ];
    const faces = [
      [1, 2, 3, 4], [5, 8, 7, 6], [1, 5, 6, 2],
      [2, 6, 7, 3], [3, 7, 8, 4], [5, 1, 4, 8],
    ];
    voxels.forEach((v) => {
      const c = v.mesh.userData.cell;
      corners.forEach((o) => out += `v ${c.x + o[0]} ${c.y + o[1]} ${c.z + o[2]}\n`);
      faces.forEach((f) => out += `f ${f[0] + vbase - 1} ${f[1] + vbase - 1} ${f[2] + vbase - 1} ${f[3] + vbase - 1}\n`);
      vbase += 8;
    });
    return out;
  }
  function exportJSON() {
    const arr = [];
    voxels.forEach((v) => { const c = v.mesh.userData.cell; arr.push({ x: c.x, y: c.y, z: c.z, color: v.color }); });
    return JSON.stringify({ grid: GRID, voxels: arr }, null, 2);
  }

  function fit() { camera.position.set(20, 18, 22); controls.target.set(0, 2, 0); controls.update(); }

  start();

  return {
    setColor: (c) => { st.color = c; },
    setBrushSize: (n) => { st.brush = Math.max(1, Math.min(4, n | 0)); },
    setTool: (t) => { st.tool = t === "erase" ? "erase" : "add"; },
    undo: () => restore(hi - 1),
    redo: () => restore(hi + 1),
    clear: () => { clearAll(); pushHist(); },
    exportPNG, exportOBJ, exportJSON, fit,
    onShow: () => { resize(); start(); },
    onHide: () => stop(),
    onResize: resize,
  };
}
