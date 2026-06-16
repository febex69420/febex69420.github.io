/* ============================================================
   Glaze · Paint engine
   Smooth path-based brushes + soft anti-aliased eraser,
   adjustable size/opacity/softness, zoom/pan/pinch, flood fill,
   shapes, undo/redo, multi-format export, and a pixel-by-pixel art mode.
   ============================================================ */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const G = window.Glaze;

  // ---- Elements ----
  const stage = $("#stage");
  const wrap = $("#canvasWrap");
  const art = $("#art");
  const live = $("#live");
  const ring = $("#ring");
  const pixelGridEl = $("#pixelGrid");
  const artCtx = art.getContext("2d", { willReadFrequently: true });

  // offscreen buffers
  const baseCanvas = document.createElement("canvas");
  const baseCtx = baseCanvas.getContext("2d");
  const strokeCanvas = document.createElement("canvas");
  const strokeCtx = strokeCanvas.getContext("2d");

  // ---- State ----
  const TOOLS = [
    { id: "brush", icon: "brush", label: "Brush" },
    { id: "pencil", icon: "pencil", label: "Pencil" },
    { id: "marker", icon: "highlighter", label: "Marker" },
    { id: "spray", icon: "spray", label: "Airbrush" },
    { id: "eraser", icon: "eraser", label: "Eraser" },
    { id: "bucket", icon: "bucket", label: "Fill" },
    { id: "pipette", icon: "pipette", label: "Eyedropper" },
    { id: "line", icon: "line", label: "Line" },
    { id: "rect", icon: "square", label: "Rectangle" },
    { id: "ellipse", icon: "circle", label: "Ellipse" },
    { id: "move", icon: "move", label: "Pan" },
  ];
  const defaults = {
    brush: { size: 24, opacity: 100, softness: 30 },
    pencil: { size: 4, opacity: 100, softness: 0 },
    marker: { size: 30, opacity: 45, softness: 12 },
    spray: { size: 44, opacity: 60, softness: 0 },
    eraser: { size: 32, opacity: 100, softness: 45 },
    bucket: { size: 4, opacity: 100, softness: 0 },
    pipette: { size: 4, opacity: 100, softness: 0 },
    line: { size: 6, opacity: 100, softness: 0 },
    rect: { size: 6, opacity: 100, softness: 0 },
    ellipse: { size: 6, opacity: 100, softness: 0 },
    move: { size: 4, opacity: 100, softness: 0 },
  };
  const toolSettings = JSON.parse(JSON.stringify(defaults));

  const state = {
    tool: "brush",
    color: "#1c1c1e",
    size: 24,
    opacity: 100,
    softness: 30,
    mode: "2d",
    recent: [],
    pixelBrush: 1,
  };
  const view = { scale: 1, x: 0, y: 0 };

  // ---- Build tool rail ----
  const rail = $("#toolrail");
  TOOLS.forEach((t) => {
    const b = document.createElement("button");
    b.className = "tool-btn";
    b.dataset.tool = t.id;
    b.setAttribute("aria-label", t.label);
    b.setAttribute("aria-pressed", t.id === state.tool ? "true" : "false");
    b.title = t.label;
    b.innerHTML = G.icon(t.icon);
    b.addEventListener("click", () => selectTool(t.id));
    rail.appendChild(b);
  });

  // ---- Palette ----
  const PALETTE = [
    "#000000", "#1c1c1e", "#48484a", "#8e8e93", "#c7c7cc", "#ffffff",
    "#ff3b30", "#ff6b52", "#ff9500", "#ffcc00", "#ffe066", "#a3e635",
    "#34c759", "#00c7be", "#22d3ee", "#0ea5e9", "#3b82f6", "#6366f1",
    "#8b5cf6", "#d946ef", "#ff2d95", "#f43f5e", "#a16207", "#5c3b1e",
  ];
  const paletteEl = $("#palette");
  PALETTE.forEach((c) => {
    const b = document.createElement("button");
    b.style.background = c;
    b.setAttribute("aria-label", c);
    b.addEventListener("click", () => setColor(c, true));
    paletteEl.appendChild(b);
  });

  // ---- Sliders / inputs ----
  const sizeEl = $("#size"), opacityEl = $("#opacity"), softEl = $("#softness");
  const sizeVal = $("#sizeVal"), opacityVal = $("#opacityVal"), softVal = $("#softnessVal");
  const colorEl = $("#color"), hexVal = $("#hexVal"), recentEl = $("#recent");
  const pxBrushEl = $("#pxbrush"), pxBrushVal = $("#pxbrushVal");

  sizeEl.addEventListener("input", () => { state.size = +sizeEl.value; sizeVal.textContent = state.size; toolSettings[state.tool].size = state.size; updateRing(lastRing.x, lastRing.y); });
  opacityEl.addEventListener("input", () => { state.opacity = +opacityEl.value; opacityVal.textContent = state.opacity; toolSettings[state.tool].opacity = state.opacity; });
  softEl.addEventListener("input", () => { state.softness = +softEl.value; softVal.textContent = state.softness; toolSettings[state.tool].softness = state.softness; });
  colorEl.addEventListener("input", () => setColor(colorEl.value, true));
  pxBrushEl.addEventListener("input", () => { state.pixelBrush = +pxBrushEl.value; pxBrushVal.textContent = state.pixelBrush; updateRing(lastRing.x, lastRing.y); });

  function setColor(c, fromUser) {
    state.color = c;
    colorEl.value = c;
    hexVal.textContent = c.toUpperCase();
    if (fromUser) {
      state.recent = [c].concat(state.recent.filter((x) => x !== c)).slice(0, 6);
      renderRecent();
    }
  }
  function renderRecent() {
    recentEl.innerHTML = "";
    state.recent.forEach((c) => {
      const b = document.createElement("button");
      b.style.background = c; b.setAttribute("aria-label", "Use " + c);
      b.addEventListener("click", () => setColor(c, true));
      recentEl.appendChild(b);
    });
  }

  function loadToolSettings() {
    const s = toolSettings[state.tool];
    state.size = s.size; state.opacity = s.opacity; state.softness = s.softness;
    sizeEl.value = s.size; sizeVal.textContent = s.size;
    opacityEl.value = s.opacity; opacityVal.textContent = s.opacity;
    softEl.value = s.softness; softVal.textContent = s.softness;
  }

  function selectTool(id) {
    state.tool = id;
    document.querySelectorAll(".tool-btn").forEach((b) => b.setAttribute("aria-pressed", b.dataset.tool === id ? "true" : "false"));
    $("#toolTitle").textContent = (TOOLS.find((t) => t.id === id) || {}).label || "Tool";
    loadToolSettings();
    // field visibility (raster fields only matter in Paint mode; Pixel mode manages its own)
    if (state.mode !== "pixel") {
      const usesOpacity = !["pipette", "bucket", "move"].includes(id);
      const usesSoft = ["brush", "marker", "eraser", "line", "rect", "ellipse"].includes(id);
      $("#opacityField").style.display = usesOpacity ? "" : "none";
      $("#softnessField").style.display = usesSoft ? "" : "none";
      $("#sizeField").style.display = id === "move" ? "none" : "";
    }
    $("#colorField").style.display = id === "eraser" ? "none" : "";
    updateCursor();
  }

  function updateCursor() {
    const pointerTools = ["bucket", "pipette", "move"];
    stage.style.cursor = state.tool === "move" ? "grab" : (pointerTools.includes(state.tool) ? "pointer" : "none");
    if (pointerTools.includes(state.tool)) ring.style.display = "none";
  }

  // ============================================================
  //  Canvas init / transform
  // ============================================================
  function initCanvas(w, h, bg) {
    art.width = w; art.height = h;
    live.width = w; live.height = h;
    baseCanvas.width = w; baseCanvas.height = h;
    strokeCanvas.width = w; strokeCanvas.height = h;
    wrap.style.width = w + "px";
    wrap.style.height = h + "px";
    artCtx.clearRect(0, 0, w, h);
    if (bg && bg !== "transparent") { artCtx.fillStyle = bg; artCtx.fillRect(0, 0, w, h); }
    $("#docName").textContent = w + " × " + h;
    history = []; hi = -1;
    pushHistory();
    fitView();
  }

  function applyTransform() {
    wrap.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
    $("#zoomLvl").textContent = Math.round(view.scale * 100) + "%";
    updatePixelGrid();
  }

  function updatePixelGrid() {
    if (state.mode !== "pixel" || view.scale < 5) { pixelGridEl.style.display = "none"; return; }
    pixelGridEl.style.display = "block";
    pixelGridEl.style.left = view.x + "px";
    pixelGridEl.style.top = view.y + "px";
    pixelGridEl.style.width = art.width * view.scale + "px";
    pixelGridEl.style.height = art.height * view.scale + "px";
    pixelGridEl.style.backgroundSize = view.scale + "px " + view.scale + "px";
  }
  function fitView() {
    const r = stage.getBoundingClientRect();
    const pad = 48;
    const s = Math.min((r.width - pad) / art.width, (r.height - pad) / art.height, 4);
    view.scale = Math.max(s, 0.05);
    view.x = (r.width - art.width * view.scale) / 2;
    view.y = (r.height - art.height * view.scale) / 2;
    applyTransform();
  }
  function zoomAt(cx, cy, factor) {
    const r = stage.getBoundingClientRect();
    const px = cx - r.left, py = cy - r.top;
    const s0 = view.scale;
    const s1 = Math.min(Math.max(s0 * factor, 0.05), 16);
    view.x = px - ((px - view.x) / s0) * s1;
    view.y = py - ((py - view.y) / s0) * s1;
    view.scale = s1;
    applyTransform();
  }

  function toCanvas(clientX, clientY) {
    const r = art.getBoundingClientRect();
    const sx = art.width / r.width, sy = art.height / r.height;
    return { x: (clientX - r.left) * sx, y: (clientY - r.top) * sy };
  }

  // ============================================================
  //  History (PNG snapshots — held in memory only, capped)
  // ============================================================
  let history = [], hi = -1;
  const HMAX = 30;
  function pushHistory() {
    history = history.slice(0, hi + 1);
    history.push(art.toDataURL("image/png"));
    if (history.length > HMAX) history.shift();
    hi = history.length - 1;
    refreshHistoryButtons();
  }
  function restore(idx) {
    if (idx < 0 || idx >= history.length) return;
    hi = idx;
    const img = new Image();
    img.onload = () => { artCtx.clearRect(0, 0, art.width, art.height); artCtx.drawImage(img, 0, 0); refreshHistoryButtons(); };
    img.src = history[idx];
  }
  function undo() { if (hi > 0) restore(hi - 1); }
  function redo() { if (hi < history.length - 1) restore(hi + 1); }
  function refreshHistoryButtons() {
    $("#undoBtn").disabled = hi <= 0;
    $("#redoBtn").disabled = hi >= history.length - 1;
  }

  // ============================================================
  //  Drawing pipeline
  // ============================================================
  let drawing = false, isErase = false, isShape = false, isSpray = false;
  let pts = [], drawnIdx = 0, startPt = null, shiftKey = false;
  let needsCompose = false, sprayTimer = null, composeRaf = 0;

  function colorRGBA() { const c = hexToRgb(state.color); return c; }

  function beginStroke(p) {
    drawing = true;
    isErase = state.tool === "eraser";
    isShape = ["line", "rect", "ellipse"].includes(state.tool);
    isSpray = state.tool === "spray";
    pts = [p]; drawnIdx = 0; startPt = p;
    baseCtx.clearRect(0, 0, art.width, art.height);
    baseCtx.drawImage(art, 0, 0);
    strokeCtx.clearRect(0, 0, art.width, art.height);
    strokeCtx.lineCap = "round";
    strokeCtx.lineJoin = "round";
    strokeCtx.strokeStyle = isErase ? "#000" : state.color;
    strokeCtx.fillStyle = isErase ? "#000" : state.color;
    strokeCtx.lineWidth = state.size;
    if (isSpray) { sprayDots(p); sprayTimer = setInterval(() => { if (lastSprayPt) sprayDots(lastSprayPt); requestCompose(); }, 40); }
    else if (!isShape) { dot(p); }
    requestCompose();
  }

  let lastSprayPt = null;
  function sprayDots(p) {
    lastSprayPt = p;
    const r = state.size / 2;
    const n = Math.max(6, Math.round(r * 0.9));
    strokeCtx.globalAlpha = 0.05;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const rad = Math.sqrt(Math.random()) * r;
      strokeCtx.beginPath();
      strokeCtx.arc(p.x + Math.cos(a) * rad, p.y + Math.sin(a) * rad, Math.max(1, state.size * 0.04), 0, Math.PI * 2);
      strokeCtx.fill();
    }
    strokeCtx.globalAlpha = 1;
  }

  function dot(p) {
    strokeCtx.globalAlpha = 1;
    strokeCtx.beginPath();
    strokeCtx.arc(p.x, p.y, Math.max(0.5, state.size / 2), 0, Math.PI * 2);
    strokeCtx.fill();
  }

  function extendStroke() {
    // incremental quadratic smoothing through midpoints
    strokeCtx.globalAlpha = 1;
    for (; drawnIdx < pts.length - 1; drawnIdx++) {
      const i = drawnIdx;
      if (i < 1) continue;
      const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1];
      const m1 = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
      const m2 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      strokeCtx.beginPath();
      strokeCtx.moveTo(m1.x, m1.y);
      strokeCtx.quadraticCurveTo(p1.x, p1.y, m2.x, m2.y);
      strokeCtx.stroke();
    }
  }

  function drawShape() {
    strokeCtx.clearRect(0, 0, art.width, art.height);
    strokeCtx.globalAlpha = 1;
    let a = startPt, b = pts[pts.length - 1];
    strokeCtx.beginPath();
    if (state.tool === "line") {
      let bx = b.x, by = b.y;
      if (shiftKey) { const ang = Math.atan2(by - a.y, bx - a.x); const len = Math.hypot(bx - a.x, by - a.y); const snap = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4); bx = a.x + Math.cos(snap) * len; by = a.y + Math.sin(snap) * len; }
      strokeCtx.moveTo(a.x, a.y); strokeCtx.lineTo(bx, by); strokeCtx.stroke();
    } else {
      let w = b.x - a.x, h = b.y - a.y;
      if (shiftKey) { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; }
      if (state.tool === "rect") { strokeCtx.strokeRect(a.x, a.y, w, h); }
      else { strokeCtx.ellipse(a.x + w / 2, a.y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2); strokeCtx.stroke(); }
    }
  }

  function requestCompose() { if (!needsCompose) { needsCompose = true; composeRaf = requestAnimationFrame(compose); } }
  function compose() {
    needsCompose = false;
    composeRaf = 0;
    if (isShape && drawing) drawShape();
    else if (drawing && !isSpray) extendStroke();
    artCtx.save();
    artCtx.setTransform(1, 0, 0, 1, 0, 0);
    artCtx.clearRect(0, 0, art.width, art.height);
    artCtx.drawImage(baseCanvas, 0, 0);
    if (drawing) {
      const blur = state.softness > 0 ? (state.softness / 100) * (state.size / 2) : 0;
      artCtx.globalAlpha = state.opacity / 100;
      if (blur > 0.4) artCtx.filter = "blur(" + blur.toFixed(2) + "px)";
      artCtx.globalCompositeOperation = isErase ? "destination-out" : "source-over";
      artCtx.drawImage(strokeCanvas, 0, 0);
    }
    artCtx.restore();
  }

  function endStroke() {
    if (!drawing) return;
    if (sprayTimer) { clearInterval(sprayTimer); sprayTimer = null; lastSprayPt = null; }
    // Cancel any pending rAF so it can't re-composite with drawing=false and wipe the stroke.
    if (composeRaf) { cancelAnimationFrame(composeRaf); composeRaf = 0; }
    needsCompose = false;
    compose();           // drawing is still true here, so the stroke is baked into the artwork
    drawing = false;
    // Fold the stroke into the base layer so any later compose() is a visual no-op.
    baseCtx.setTransform(1, 0, 0, 1, 0, 0);
    baseCtx.clearRect(0, 0, art.width, art.height);
    baseCtx.drawImage(art, 0, 0);
    strokeCtx.clearRect(0, 0, art.width, art.height);
    pushHistory();
  }
  function cancelStroke() {
    if (!drawing) return;
    drawing = false;
    if (sprayTimer) { clearInterval(sprayTimer); sprayTimer = null; lastSprayPt = null; }
    if (composeRaf) { cancelAnimationFrame(composeRaf); composeRaf = 0; }
    needsCompose = false;
    artCtx.setTransform(1, 0, 0, 1, 0, 0);
    artCtx.clearRect(0, 0, art.width, art.height);
    artCtx.drawImage(baseCanvas, 0, 0);
  }

  // ---- Flood fill ----
  function floodFill(p, hex) {
    const W = art.width, H = art.height;
    const sx = Math.floor(p.x), sy = Math.floor(p.y);
    if (sx < 0 || sy < 0 || sx >= W || sy >= H) return;
    const id = artCtx.getImageData(0, 0, W, H);
    const data = id.data;
    const idx = (sy * W + sx) * 4;
    const tr = data[idx], tg = data[idx + 1], tb = data[idx + 2], ta = data[idx + 3];
    const f = hexToRgb(hex);
    const fr = f.r, fg = f.g, fb = f.b, fa = 255;
    if (tr === fr && tg === fg && tb === fb && ta === fa) return;
    const tol = 36;
    function match(i) {
      const dr = data[i] - tr, dg = data[i + 1] - tg, db = data[i + 2] - tb, da = data[i + 3] - ta;
      return dr * dr + dg * dg + db * db + da * da <= tol * tol * 4;
    }
    const stack = [[sx, sy]];
    while (stack.length) {
      const [x, y0] = stack.pop();
      let y = y0;
      while (y >= 0 && match((y * W + x) * 4)) y--;
      y++;
      let reachL = false, reachR = false;
      while (y < H && match((y * W + x) * 4)) {
        const i = (y * W + x) * 4;
        data[i] = fr; data[i + 1] = fg; data[i + 2] = fb; data[i + 3] = fa;
        if (x > 0) { if (match((y * W + x - 1) * 4)) { if (!reachL) { stack.push([x - 1, y]); reachL = true; } } else reachL = false; }
        if (x < W - 1) { if (match((y * W + x + 1) * 4)) { if (!reachR) { stack.push([x + 1, y]); reachR = true; } } else reachR = false; }
        y++;
      }
    }
    artCtx.putImageData(id, 0, 0);
    pushHistory();
  }

  function pickColor(p) {
    const d = artCtx.getImageData(Math.floor(p.x), Math.floor(p.y), 1, 1).data;
    if (d[3] === 0) { G.toast("Transparent here — nothing to pick"); return; }
    setColor(rgbToHex(d[0], d[1], d[2]), true);
    G.toast("Picked " + rgbToHex(d[0], d[1], d[2]).toUpperCase());
  }

  // ============================================================
  //  Pointer handling (draw + pan + pinch)
  // ============================================================
  const pointers = new Map();
  let panning = false, panStart = null, spaceDown = false;
  let pinch = null;
  let lastRing = { x: 0, y: 0 };

  function isPanGesture() { return state.tool === "move" || spaceDown; }

  stage.addEventListener("pointerdown", (e) => {
    if (state.mode !== "2d" && state.mode !== "pixel") return;
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 2) { // start pinch
      if (drawing) cancelStroke();
      if (pixelDrawing) pixelCancel();
      const it = [...pointers.values()];
      pinch = { d: dist(it[0], it[1]), cx: (it[0].x + it[1].x) / 2, cy: (it[0].y + it[1].y) / 2, scale: view.scale, vx: view.x, vy: view.y };
      ring.style.display = "none";
      return;
    }

    if (isPanGesture() || e.button === 1) { panning = true; panStart = { x: e.clientX - view.x, y: e.clientY - view.y }; stage.style.cursor = "grabbing"; return; }

    const p = toCanvas(e.clientX, e.clientY);
    shiftKey = e.shiftKey;
    if (state.mode === "pixel") { pixelDown(p); return; }
    if (state.tool === "bucket") { floodFill(p, state.color); return; }
    if (state.tool === "pipette") { pickColor(p); return; }
    beginStroke(p);
  });

  stage.addEventListener("pointermove", (e) => {
    if (state.mode !== "2d" && state.mode !== "pixel") return;
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    updateRing(e.clientX, e.clientY);

    if (pinch && pointers.size >= 2) {
      const it = [...pointers.values()];
      const d = dist(it[0], it[1]);
      const cx = (it[0].x + it[1].x) / 2, cy = (it[0].y + it[1].y) / 2;
      const r = stage.getBoundingClientRect();
      const s1 = Math.min(Math.max(pinch.scale * (d / pinch.d), 0.05), 16);
      // zoom around initial midpoint, then pan by midpoint movement
      const px = pinch.cx - r.left, py = pinch.cy - r.top;
      view.x = px - ((px - pinch.vx) / pinch.scale) * s1 + (cx - pinch.cx);
      view.y = py - ((py - pinch.vy) / pinch.scale) * s1 + (cy - pinch.cy);
      view.scale = s1;
      applyTransform();
      return;
    }
    if (panning) { view.x = e.clientX - panStart.x; view.y = e.clientY - panStart.y; applyTransform(); return; }
    if (state.mode === "pixel") { shiftKey = e.shiftKey; if (pixelDrawing) pixelMove(e); return; }
    if (!drawing) return;

    shiftKey = e.shiftKey;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    if (isSpray) { lastSprayPt = toCanvas(e.clientX, e.clientY); requestCompose(); return; }
    for (const ev of evs) pts.push(toCanvas(ev.clientX, ev.clientY));
    requestCompose();
  });

  function endPointer(e) {
    if (state.mode !== "2d" && state.mode !== "pixel") return;
    pointers.delete(e.pointerId);
    if (pinch && pointers.size < 2) pinch = null;
    if (panning) { panning = false; stage.style.cursor = state.tool === "move" ? "grab" : (["bucket", "pipette"].includes(state.tool) ? "pointer" : "none"); }
    if (drawing && pointers.size === 0) endStroke();
    if (pixelDrawing && pointers.size === 0) pixelUp();
  }
  stage.addEventListener("pointerup", endPointer);
  stage.addEventListener("pointercancel", endPointer);
  stage.addEventListener("pointerleave", (e) => { if (!drawing) ring.style.display = "none"; });

  stage.addEventListener("wheel", (e) => {
    if (state.mode !== "2d" && state.mode !== "pixel") return;
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 1 / 1.12);
  }, { passive: false });

  function updateRing(cx, cy) {
    lastRing = { x: cx, y: cy };
    const pixel = state.mode === "pixel";
    const showFor = !["bucket", "pipette", "move"].includes(state.tool) && (state.mode === "2d" || pixel);
    if (!showFor) { ring.style.display = "none"; return; }
    const r = stage.getBoundingClientRect();
    if (cx < r.left || cx > r.right || cy < r.top || cy > r.bottom) { ring.style.display = "none"; return; }
    const d = (pixel ? state.pixelBrush : state.size) * view.scale;
    ring.style.display = "block";
    ring.style.borderRadius = pixel ? "1px" : "50%";
    ring.style.left = (cx - r.left) + "px";
    ring.style.top = (cy - r.top) + "px";
    ring.style.width = d + "px";
    ring.style.height = d + "px";
  }

  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  // ============================================================
  //  Top bar actions
  // ============================================================
  $("#undoBtn").innerHTML = G.icon("undo");
  $("#redoBtn").innerHTML = G.icon("redo");
  $("#clearBtn").innerHTML = G.icon("trash");
  $("#propsToggle").innerHTML = G.icon("sliders");
  $("#zoomIn").innerHTML = G.icon("plus");
  $("#zoomOut").innerHTML = G.icon("minus");
  $("#zoomFit").innerHTML = G.icon("maximize");

  $("#undoBtn").addEventListener("click", undo);
  $("#redoBtn").addEventListener("click", redo);
  $("#clearBtn").addEventListener("click", () => {
    artCtx.clearRect(0, 0, art.width, art.height);
    pushHistory(); G.toast("Canvas cleared");
  });
  $("#zoomIn").addEventListener("click", () => { const r = stage.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1.2); });
  $("#zoomOut").addEventListener("click", () => { const r = stage.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1 / 1.2); });
  $("#zoomFit").addEventListener("click", () => fitView());

  // props sheet (mobile)
  const props = $("#props");
  $("#propsToggle").addEventListener("click", () => props.classList.toggle("open"));
  $("#sheetHandle").addEventListener("click", () => props.classList.remove("open"));

  $("#fillBg").addEventListener("click", () => {
    artCtx.save(); artCtx.globalCompositeOperation = "destination-over"; artCtx.fillStyle = state.color; artCtx.fillRect(0, 0, art.width, art.height); artCtx.restore();
    pushHistory(); G.toast("Background filled");
  });
  $("#newCanvas").addEventListener("click", newCanvasModal);
  $("#importImg").addEventListener("click", importImage);

  async function importImage() {
    const file = await G.pickFile("image/*");
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = await G.loadImage(url);
    URL.revokeObjectURL(url);
    const W = Math.min(img.naturalWidth, 4096), H = Math.min(img.naturalHeight, 4096);
    initCanvas(W, H, null);
    artCtx.drawImage(img, 0, 0, W, H);
    pushHistory();
    G.toast("Image imported");
  }

  function newCanvasModal() {
    const html = `
      <h3>New canvas</h3>
      <p class="muted" style="margin-bottom:16px">Pick a size and background. Nothing is saved — this just resets your workspace.</p>
      <div class="chips" style="margin-bottom:14px">
        <button class="chip" data-preset="1280,800">1280 × 800</button>
        <button class="chip" data-preset="1080,1080">1080 square</button>
        <button class="chip" data-preset="1920,1080">1920 × 1080</button>
        <button class="chip" data-preset="1080,1920">Story 9:16</button>
      </div>
      <div class="field-row" style="margin-bottom:14px">
        <label class="field grow"><span class="field-label">Width</span><input type="number" id="ncw" value="1280" min="16" max="4096"></label>
        <label class="field grow"><span class="field-label">Height</span><input type="number" id="nch" value="800" min="16" max="4096"></label>
      </div>
      <div class="field-row" style="margin-bottom:6px">
        <span class="field-label">Background</span>
        <div class="segmented" id="ncbg">
          <button data-bg="#ffffff" aria-pressed="true">White</button>
          <button data-bg="#000000" aria-pressed="false">Black</button>
          <button data-bg="transparent" aria-pressed="false">Transparent</button>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn" data-close>Cancel</button>
        <button class="btn btn-primary" id="ncCreate">Create</button>
      </div>`;
    const m = G.modal(html);
    let bg = "#ffffff";
    m.el.querySelectorAll("#ncbg button").forEach((b) => b.addEventListener("click", () => {
      m.el.querySelectorAll("#ncbg button").forEach((x) => x.setAttribute("aria-pressed", "false"));
      b.setAttribute("aria-pressed", "true"); bg = b.dataset.bg;
    }));
    m.el.querySelectorAll("[data-preset]").forEach((b) => b.addEventListener("click", () => {
      const [w, h] = b.dataset.preset.split(",").map(Number);
      m.el.querySelector("#ncw").value = w; m.el.querySelector("#nch").value = h;
    }));
    m.el.querySelector("#ncCreate").addEventListener("click", () => {
      const w = Math.min(Math.max(+m.el.querySelector("#ncw").value || 1280, 16), 4096);
      const h = Math.min(Math.max(+m.el.querySelector("#nch").value || 800, 16), 4096);
      initCanvas(w, h, bg);
      m.close(); G.toast("New canvas ready");
    });
  }

  // ============================================================
  //  Export
  // ============================================================
  $("#exportBtn").addEventListener("click", exportRasterModal);

  function exportRasterModal() {
    const html = `
      <h3>Export image</h3>
      <p class="muted" style="margin:6px 0 16px">Rendered on your device and downloaded directly. Nothing is uploaded.</p>
      <label class="field" style="margin-bottom:14px">
        <span class="field-label">File name</span>
        <input type="text" id="exName" value="glaze-artwork">
      </label>
      <span class="field-label" style="margin-bottom:8px;display:block">Format</span>
      <div class="chips" id="exFmt" style="margin-bottom:14px">
        <button class="chip" data-fmt="png" aria-pressed="true">PNG</button>
        <button class="chip" data-fmt="jpeg">JPG</button>
        <button class="chip" data-fmt="webp">WebP</button>
        <button class="chip" data-fmt="bmp">BMP</button>
        <button class="chip" data-fmt="svg">SVG</button>
        <button class="chip" data-fmt="pdf">PDF</button>
      </div>
      <label class="field" id="exScaleField" style="display:none;margin-bottom:10px">
        <span class="field-label">Pixel scale <span class="val"><span id="exScaleV">8</span>×</span></span>
        <input type="range" id="exScale" min="1" max="32" value="8">
      </label>
      <label class="field" id="exQ" style="display:none;margin-bottom:6px">
        <span class="field-label">Quality <span class="val"><span id="exQv">92</span>%</span></span>
        <input type="range" id="exQuality" min="40" max="100" value="92">
      </label>
      <div class="modal-actions">
        <button class="btn" data-close>Cancel</button>
        <button class="btn btn-primary" id="exGo">Download</button>
      </div>`;
    const m = G.modal(html);
    let fmt = "png";
    const qWrap = m.el.querySelector("#exQ");
    if (state.mode === "pixel") {
      m.el.querySelector("#exScaleField").style.display = "";
      m.el.querySelector("#exScale").addEventListener("input", (e) => m.el.querySelector("#exScaleV").textContent = e.target.value);
    }
    m.el.querySelectorAll("#exFmt .chip").forEach((c) => c.addEventListener("click", () => {
      m.el.querySelectorAll("#exFmt .chip").forEach((x) => x.setAttribute("aria-pressed", "false"));
      c.setAttribute("aria-pressed", "true"); fmt = c.dataset.fmt;
      qWrap.style.display = ["jpeg", "webp", "pdf"].includes(fmt) ? "" : "none";
    }));
    m.el.querySelector("#exQuality").addEventListener("input", (e) => m.el.querySelector("#exQv").textContent = e.target.value);
    m.el.querySelector("#exGo").addEventListener("click", async () => {
      const name = (m.el.querySelector("#exName").value || "glaze-artwork").replace(/[^\w.-]+/g, "_");
      const q = (+m.el.querySelector("#exQuality").value) / 100;
      const scale = state.mode === "pixel" ? Math.max(1, +m.el.querySelector("#exScale").value || 1) : 1;
      const source = scale > 1 ? upscale(art, scale) : art;
      let blob, ext = fmt;
      try {
        if (fmt === "png") blob = await G.export.canvasToBlob(source, "image/png");
        else if (fmt === "jpeg") { blob = await G.export.canvasToBlob(flatten(source), "image/jpeg", q); ext = "jpg"; }
        else if (fmt === "webp") blob = await G.export.canvasToBlob(source, "image/webp", q);
        else if (fmt === "bmp") blob = G.export.canvasToBMP(source);
        else if (fmt === "svg") blob = G.export.canvasToSVG(source);
        else if (fmt === "pdf") blob = await G.export.canvasToPDF(flatten(source), q);
        if (!blob) throw new Error("unsupported");
        G.export.download(blob, name + "." + ext);
        m.close(); G.toast("Saved " + name + "." + ext);
      } catch (err) { G.toast("That format isn't supported on this browser"); }
    });
  }

  // flatten transparency over white for formats without alpha
  function flatten(cv) {
    cv = cv || art;
    const c = document.createElement("canvas"); c.width = cv.width; c.height = cv.height;
    const cx = c.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, c.width, c.height); cx.drawImage(cv, 0, 0);
    return c;
  }

  // nearest-neighbour upscale (crisp pixel-art export)
  function upscale(cv, s) {
    const c = document.createElement("canvas"); c.width = cv.width * s; c.height = cv.height * s;
    const x = c.getContext("2d"); x.imageSmoothingEnabled = false; x.drawImage(cv, 0, 0, c.width, c.height);
    return c;
  }

  // ============================================================
  //  Mode switch (Paint <-> Pixel)
  // ============================================================
  const mode2dBtn = $("#mode2d"), modePixelBtn = $("#modePixel");
  mode2dBtn.addEventListener("click", () => switchMode("2d"));
  modePixelBtn.addEventListener("click", () => switchMode("pixel"));

  // Each mode keeps its own independent document (canvas + history).
  const docs = {};
  function snapshotDoc() { return { w: art.width, h: art.height, data: art.toDataURL("image/png"), history: history, hi: hi }; }
  function resizeBuffers(w, h) {
    art.width = w; art.height = h; live.width = w; live.height = h;
    baseCanvas.width = w; baseCanvas.height = h; strokeCanvas.width = w; strokeCanvas.height = h;
    wrap.style.width = w + "px"; wrap.style.height = h + "px";
  }
  function applyDoc(doc) {
    resizeBuffers(doc.w, doc.h);
    history = doc.history; hi = doc.hi;
    artCtx.setTransform(1, 0, 0, 1, 0, 0); artCtx.clearRect(0, 0, doc.w, doc.h);
    artCtx.imageSmoothingEnabled = state.mode !== "pixel";
    const img = new Image();
    img.onload = () => { artCtx.imageSmoothingEnabled = state.mode !== "pixel"; artCtx.clearRect(0, 0, doc.w, doc.h); artCtx.drawImage(img, 0, 0); };
    img.src = doc.data;
    refreshHistoryButtons(); fitView();
  }
  function initPixelCanvas(n) {
    resizeBuffers(n, n);
    artCtx.setTransform(1, 0, 0, 1, 0, 0); artCtx.imageSmoothingEnabled = false; artCtx.clearRect(0, 0, n, n);
    history = []; hi = -1; pushHistory(); fitView();
  }
  function setPixelGrid(n) {
    const tmp = document.createElement("canvas"); tmp.width = n; tmp.height = n;
    const tx = tmp.getContext("2d"); tx.imageSmoothingEnabled = false;
    tx.drawImage(art, 0, 0, art.width, art.height, 0, 0, n, n);
    pixelGridSize = n;
    resizeBuffers(n, n);
    artCtx.imageSmoothingEnabled = false; artCtx.clearRect(0, 0, n, n); artCtx.drawImage(tmp, 0, 0);
    history = []; hi = -1; pushHistory();
    $("#docName").textContent = n + " × " + n + " px";
    fitView();
    document.querySelectorAll("#pxGridChips .chip").forEach((c) => c.setAttribute("aria-pressed", +c.dataset.grid === n ? "true" : "false"));
  }

  function switchMode(mode) {
    if (mode === state.mode) return;
    if (drawing) cancelStroke();
    if (pixelDrawing) pixelCancel();
    docs[state.mode] = snapshotDoc();
    state.mode = mode;
    mode2dBtn.setAttribute("aria-pressed", mode === "2d");
    modePixelBtn.setAttribute("aria-pressed", mode === "pixel");
    const pixelFields = document.querySelectorAll(".pixel-field");
    if (mode === "pixel") {
      wrap.classList.add("pixelated");
      document.querySelectorAll(".raster-only").forEach((e) => e.style.display = "none");
      pixelFields.forEach((e) => e.classList.remove("hidden"));
      $("#toolTitle").textContent = "Pixel";
      if (docs.pixel) applyDoc(docs.pixel); else initPixelCanvas(pixelGridSize);
      $("#docName").textContent = art.width + " × " + art.height + " px";
    } else {
      wrap.classList.remove("pixelated");
      document.querySelectorAll(".raster-only").forEach((e) => e.style.display = "");
      pixelFields.forEach((e) => e.classList.add("hidden"));
      applyDoc(docs["2d"]);
      $("#docName").textContent = art.width + " × " + art.height;
      selectTool(state.tool);
    }
    refreshHistoryButtons();
    updateCursor();
  }

  // ============================================================
  //  Pixel mode engine (pixel-by-pixel grid editing)
  // ============================================================
  let pixelGridSize = 32;
  let pixelDrawing = false, pixelTool = null, pixelStart = null, pixelLast = null;

  function cellOf(p) { return { x: Math.floor(p.x), y: Math.floor(p.y) }; }
  function paintCells(cx, cy, erase) {
    const n = state.pixelBrush, off = Math.floor((n - 1) / 2);
    if (erase) artCtx.clearRect(cx - off, cy - off, n, n);
    else { artCtx.fillStyle = state.color; artCtx.fillRect(cx - off, cy - off, n, n); }
  }
  function lineCells(x0, y0, x1, y1, erase) {
    let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    let sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx - dy;
    while (true) {
      paintCells(x0, y0, erase);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
  }
  function rectCells(x0, y0, x1, y1, filled) {
    const xa = Math.min(x0, x1), xb = Math.max(x0, x1), ya = Math.min(y0, y1), yb = Math.max(y0, y1);
    if (filled) { for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) paintCells(x, y, false); }
    else {
      for (let x = xa; x <= xb; x++) { paintCells(x, ya, false); paintCells(x, yb, false); }
      for (let y = ya; y <= yb; y++) { paintCells(xa, y, false); paintCells(xb, y, false); }
    }
  }
  function ellipseCells(x0, y0, x1, y1) {
    const xa = Math.min(x0, x1), xb = Math.max(x0, x1), ya = Math.min(y0, y1), yb = Math.max(y0, y1);
    const rx = (xb - xa) / 2, ry = (yb - ya) / 2, cx = (xa + xb) / 2, cy = (ya + yb) / 2;
    if (rx < 0.5 || ry < 0.5) { lineCells(xa, ya, xb, yb, false); return; }
    const steps = Math.max(24, Math.round((rx + ry) * 4));
    let px = null, py = null;
    for (let i = 0; i <= steps; i++) {
      const a = i / steps * Math.PI * 2;
      const x = Math.round(cx + Math.cos(a) * rx), y = Math.round(cy + Math.sin(a) * ry);
      if (px !== null) lineCells(px, py, x, y, false);
      px = x; py = y;
    }
  }
  function pixelDown(p) {
    const tool = state.tool;
    if (tool === "bucket") { floodFill(p, state.color); return; }
    if (tool === "pipette") { pickColor(p); return; }
    const cell = cellOf(p), erase = tool === "eraser";
    pixelTool = ["line", "rect", "ellipse"].includes(tool) ? tool : (erase ? "eraser" : "pencil");
    pixelDrawing = true;
    baseCtx.setTransform(1, 0, 0, 1, 0, 0); baseCtx.clearRect(0, 0, art.width, art.height); baseCtx.drawImage(art, 0, 0);
    pixelStart = cell; pixelLast = cell;
    if (pixelTool === "pencil" || pixelTool === "eraser") paintCells(cell.x, cell.y, erase);
  }
  function pixelMove(e) {
    if (!pixelDrawing) return;
    if (pixelTool === "pencil" || pixelTool === "eraser") {
      const erase = pixelTool === "eraser";
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of evs) { const c = cellOf(toCanvas(ev.clientX, ev.clientY)); lineCells(pixelLast.x, pixelLast.y, c.x, c.y, erase); pixelLast = c; }
    } else {
      const c = cellOf(toCanvas(e.clientX, e.clientY));
      let ex = c.x, ey = c.y;
      if (shiftKey && pixelTool !== "line") { const s = Math.max(Math.abs(ex - pixelStart.x), Math.abs(ey - pixelStart.y)); ex = pixelStart.x + Math.sign(ex - pixelStart.x || 1) * s; ey = pixelStart.y + Math.sign(ey - pixelStart.y || 1) * s; }
      artCtx.setTransform(1, 0, 0, 1, 0, 0); artCtx.clearRect(0, 0, art.width, art.height); artCtx.drawImage(baseCanvas, 0, 0);
      if (pixelTool === "line") lineCells(pixelStart.x, pixelStart.y, ex, ey, false);
      else if (pixelTool === "rect") rectCells(pixelStart.x, pixelStart.y, ex, ey, false);
      else ellipseCells(pixelStart.x, pixelStart.y, ex, ey);
    }
  }
  function pixelUp() { if (!pixelDrawing) return; pixelDrawing = false; pushHistory(); }
  function pixelCancel() {
    if (!pixelDrawing) return; pixelDrawing = false;
    artCtx.setTransform(1, 0, 0, 1, 0, 0); artCtx.clearRect(0, 0, art.width, art.height); artCtx.drawImage(baseCanvas, 0, 0);
  }

  // pixel-mode grid presets
  document.querySelectorAll("#pxGridChips .chip").forEach((c) => c.addEventListener("click", () => setPixelGrid(+c.dataset.grid)));

  window.addEventListener("resize", applyTransform);

  // ============================================================
  //  Keyboard
  // ============================================================
  const KEYS = { b: "brush", p: "pencil", m: "marker", a: "spray", e: "eraser", g: "bucket", i: "pipette", l: "line", r: "rect", o: "ellipse", h: "move", v: "move" };
  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input, textarea, select")) return;
    const meta = e.metaKey || e.ctrlKey;
    if (meta && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (meta && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
    if (e.code === "Space") { spaceDown = true; stage.style.cursor = "grab"; return; }
    if (state.mode === "pixel") {
      if (e.key === "[") { pxBrushEl.value = Math.max(1, state.pixelBrush - 1); pxBrushEl.dispatchEvent(new Event("input")); }
      else if (e.key === "]") { pxBrushEl.value = Math.min(8, state.pixelBrush + 1); pxBrushEl.dispatchEvent(new Event("input")); }
      else if (KEYS[e.key.toLowerCase()]) selectTool(KEYS[e.key.toLowerCase()]);
      return;
    }
    if (state.mode !== "2d") return;
    if (e.key === "[") { sizeEl.value = Math.max(1, state.size - Math.ceil(state.size * 0.1) - 1); sizeEl.dispatchEvent(new Event("input")); }
    else if (e.key === "]") { sizeEl.value = Math.min(400, state.size + Math.ceil(state.size * 0.1) + 1); sizeEl.dispatchEvent(new Event("input")); }
    else if (KEYS[e.key.toLowerCase()]) selectTool(KEYS[e.key.toLowerCase()]);
  });
  document.addEventListener("keyup", (e) => { if (e.code === "Space") { spaceDown = false; updateCursor(); } });

  // ---- helpers ----
  function hexToRgb(hex) {
    hex = hex.replace("#", "");
    if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
    const n = parseInt(hex, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function rgbToHex(r, g, b) { return "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join(""); }

  // ---- boot ----
  selectTool("brush");
  setColor("#1c1c1e", true);
  initCanvas(1280, 800, "#ffffff");
  G.toast("Tip: adjust size, opacity & softness on the right · keys B P M A E G");
  window.GlazePaint = { getColor: () => state.color };
})();
