/* ============================================================
   Glaze · Image editor
   Non-destructive light/colour, looks, crop, transform, markup.
   Live preview (downscaled) + full-resolution export. On-device.
   ============================================================ */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const G = window.Glaze;

  const stage = $("#stage"), drop = $("#drop"), imgWrap = $("#imgWrap");
  const display = $("#display"), dctx = display.getContext("2d", { willReadFrequently: true });
  const markup = $("#markup"), mctx = markup.getContext("2d", { willReadFrequently: true });
  const cropBox = $("#cropBox"), ring = $("#ring");

  const PREVIEW_MAX = 1600;

  // source (base) canvas — holds the image after crop/rotate/flip bakes
  const src = document.createElement("canvas");
  const sctx = src.getContext("2d");

  const ZERO = { exposure: 0, brightness: 0, contrast: 0, saturation: 0, warmth: 0, tint: 0, hue: 0, sharpen: 0, blur: 0, vignette: 0, grain: 0, grayscale: 0, sepia: 0 };
  let settings = Object.assign({}, ZERO);
  let straighten = 0;
  let mode = "adjust";
  let loaded = false;

  // ---- Adjustment definitions ----
  const ADJ = [
    { k: "exposure", label: "Exposure", min: -100, max: 100 },
    { k: "brightness", label: "Brightness", min: -100, max: 100 },
    { k: "contrast", label: "Contrast", min: -100, max: 100 },
    { k: "saturation", label: "Saturation", min: -100, max: 100 },
    { k: "warmth", label: "Warmth", min: -100, max: 100 },
    { k: "tint", label: "Tint", min: -100, max: 100 },
    { k: "hue", label: "Hue", min: -180, max: 180, unit: "°" },
    { k: "sharpen", label: "Sharpen", min: 0, max: 100 },
    { k: "blur", label: "Blur", min: 0, max: 20 },
    { k: "vignette", label: "Vignette", min: 0, max: 100 },
    { k: "grain", label: "Grain", min: 0, max: 100 },
  ];
  const adjWrap = $("#adjustControls");
  ADJ.forEach((a) => {
    const label = document.createElement("label");
    label.className = "field";
    label.innerHTML = `<span class="field-label">${a.label} <span class="val"><span id="v-${a.k}">0</span>${a.unit || ""}</span></span>
      <input type="range" id="s-${a.k}" min="${a.min}" max="${a.max}" value="0">`;
    adjWrap.appendChild(label);
    const inp = label.querySelector("input");
    inp.addEventListener("input", () => { settings[a.k] = +inp.value; $("#v-" + a.k).textContent = inp.value; scheduleRender(); });
    inp.addEventListener("change", pushHistory);
  });
  function syncAdjustUI() {
    ADJ.forEach((a) => { const inp = $("#s-" + a.k); if (inp) { inp.value = settings[a.k]; $("#v-" + a.k).textContent = settings[a.k]; } });
  }
  $("#resetAdjust").addEventListener("click", () => { settings = Object.assign({}, ZERO); syncAdjustUI(); render(); pushHistory(); });

  // ---- Filter presets ----
  const PRESETS = [
    { name: "Original", s: {} },
    { name: "Vivid", s: { contrast: 15, saturation: 35, exposure: 5 } },
    { name: "Mono", s: { grayscale: 100, contrast: 10 } },
    { name: "Noir", s: { grayscale: 100, contrast: 35, brightness: -8, vignette: 45 } },
    { name: "Warm", s: { warmth: 35, saturation: 10, exposure: 4 } },
    { name: "Cool", s: { warmth: -35, saturation: 6 } },
    { name: "Fade", s: { contrast: -18, exposure: 10, saturation: -16 } },
    { name: "Sepia", s: { sepia: 80, contrast: 8, warmth: 12 } },
    { name: "Chrome", s: { contrast: 20, saturation: 18, sharpen: 24 } },
    { name: "Sunset", s: { warmth: 28, tint: -8, saturation: 20, contrast: 8 } },
  ];
  const filterGrid = $("#filterGrid");
  function buildFilterTiles() {
    filterGrid.innerHTML = "";
    // tiny thumbnail source
    const t = document.createElement("canvas"); const tc = t.getContext("2d");
    const TS = 80; t.width = TS; t.height = TS;
    PRESETS.forEach((p) => {
      const b = document.createElement("button");
      b.style.aspectRatio = "1.4"; b.style.position = "relative"; b.style.overflow = "hidden";
      b.style.color = "#fff"; b.style.fontSize = "12px"; b.style.fontWeight = "600";
      b.setAttribute("aria-label", p.name);
      if (loaded) {
        const s2 = Object.assign({}, ZERO, p.s);
        tc.filter = buildFilter(s2);
        tc.clearRect(0, 0, TS, TS);
        const r = Math.max(TS / src.width, TS / src.height);
        const dw = src.width * r, dh = src.height * r;
        tc.drawImage(src, (TS - dw) / 2, (TS - dh) / 2, dw, dh);
        tc.filter = "none";
        b.style.backgroundImage = `url(${t.toDataURL("image/jpeg", 0.7)})`;
        b.style.backgroundSize = "cover"; b.style.backgroundPosition = "center";
      } else { b.style.background = "var(--fill-soft)"; b.style.color = "var(--ink)"; }
      const cap = document.createElement("span");
      cap.textContent = p.name;
      cap.style.cssText = "position:absolute;left:0;right:0;bottom:0;padding:4px 8px;background:linear-gradient(0deg,rgba(0,0,0,0.6),rgba(0,0,0,0));text-shadow:0 1px 2px rgba(0,0,0,.5)";
      if (!loaded) cap.style.background = "transparent", cap.style.color = "var(--ink)", cap.style.textShadow = "none";
      b.appendChild(cap);
      b.addEventListener("click", () => { settings = Object.assign({}, ZERO, p.s); syncAdjustUI(); render(); pushHistory(); G.toast(p.name + " applied"); });
      filterGrid.appendChild(b);
    });
  }

  // ============================================================
  //  Render pipeline
  // ============================================================
  function buildFilter(s) {
    const parts = [];
    parts.push("brightness(" + Math.max(0, 1 + s.brightness / 100 + s.exposure / 120).toFixed(3) + ")");
    parts.push("contrast(" + Math.max(0, 1 + s.contrast / 100).toFixed(3) + ")");
    parts.push("saturate(" + Math.max(0, 1 + s.saturation / 100).toFixed(3) + ")");
    if (s.hue) parts.push("hue-rotate(" + s.hue + "deg)");
    if (s.blur > 0) parts.push("blur(" + s.blur + "px)");
    if (s.grayscale) parts.push("grayscale(" + (s.grayscale / 100).toFixed(2) + ")");
    if (s.sepia) parts.push("sepia(" + (s.sepia / 100).toFixed(2) + ")");
    return parts.join(" ");
  }

  function coverScaleFor(rad, w, h) {
    if (!rad) return 1;
    const c = Math.abs(Math.cos(rad)), s = Math.abs(Math.sin(rad));
    return Math.max((w * c + h * s) / w, (w * s + h * c) / h);
  }

  // renders base (no markup) into ctx at outW x outH
  function renderInto(ctx, outW, outH) {
    const rad = straighten * Math.PI / 180;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, outW, outH);
    ctx.filter = buildFilter(settings);
    ctx.translate(outW / 2, outH / 2);
    if (rad) { ctx.rotate(rad); const cov = coverScaleFor(rad, outW, outH); ctx.scale(cov, cov); }
    ctx.drawImage(src, -outW / 2, -outH / 2, outW, outH);
    ctx.restore();
    ctx.filter = "none";

    const needPass = settings.warmth || settings.tint || settings.vignette || settings.grain || settings.sharpen;
    if (needPass) pixelPass(ctx, outW, outH);
  }

  function pixelPass(ctx, w, h) {
    let id = ctx.getImageData(0, 0, w, h);
    let data = id.data;
    if (settings.sharpen) data = sharpen(data, w, h, settings.sharpen / 100 * 0.8);
    const warm = settings.warmth / 100 * 42;
    const tnt = settings.tint / 100 * 42;
    const vig = settings.vignette / 100;
    const grn = settings.grain / 100 * 64;
    const cx = w / 2, cy = h / 2, norm = Math.hypot(cx, cy);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        let r = data[i], g = data[i + 1], b = data[i + 2];
        if (warm) { r += warm; b -= warm; }
        if (tnt) { g += tnt; r -= tnt * 0.5; b -= tnt * 0.5; }
        if (vig) { const d = Math.hypot(x - cx, y - cy) / norm; const f = 1 - vig * d * d; r *= f; g *= f; b *= f; }
        if (grn) { const n = (Math.random() - 0.5) * grn; r += n; g += n; b += n; }
        data[i] = r < 0 ? 0 : r > 255 ? 255 : r;
        data[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
        data[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
      }
    }
    ctx.putImageData(id, 0, 0);
  }

  function sharpen(src8, w, h, a) {
    const out = new Uint8ClampedArray(src8.length);
    const cw = 1 + 4 * a;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        for (let c = 0; c < 3; c++) {
          const up = y > 0 ? src8[i - w * 4 + c] : src8[i + c];
          const dn = y < h - 1 ? src8[i + w * 4 + c] : src8[i + c];
          const lf = x > 0 ? src8[i - 4 + c] : src8[i + c];
          const rt = x < w - 1 ? src8[i + 4 + c] : src8[i + c];
          out[i + c] = cw * src8[i + c] - a * (up + dn + lf + rt);
        }
        out[i + 3] = src8[i + 3];
      }
    }
    // copy back into a fresh ImageData-compatible array reference
    for (let i = 0; i < src8.length; i++) src8[i] = out[i];
    return src8;
  }

  let rafPending = false;
  function scheduleRender() { if (!rafPending) { rafPending = true; requestAnimationFrame(() => { rafPending = false; render(); }); } }
  function render() {
    if (!loaded) return;
    renderInto(dctx, display.width, display.height);
  }

  // ============================================================
  //  Load / fit
  // ============================================================
  function setupImage(img) {
    const Sw = Math.min(img.naturalWidth || img.width, 6000);
    const Sh = Math.min(img.naturalHeight || img.height, 6000);
    src.width = Sw; src.height = Sh;
    sctx.clearRect(0, 0, Sw, Sh);
    sctx.drawImage(img, 0, 0, Sw, Sh);
    markup.width = Sw; markup.height = Sh;
    mctx.clearRect(0, 0, Sw, Sh);
    settings = Object.assign({}, ZERO);
    straighten = 0; $("#straighten").value = 0; $("#straightenVal").textContent = "0";
    syncAdjustUI();
    sizePreview();
    loaded = true;
    drop.classList.add("hidden");
    imgWrap.classList.remove("hidden");
    $("#exportBtn").disabled = false;
    $("#docName").textContent = Sw + " × " + Sh;
    buildFilterTiles();
    render();
    history = []; hi = -1; pushHistory();
    fitDisplay();
  }

  function sizePreview() {
    const long = Math.max(src.width, src.height);
    const scale = long > PREVIEW_MAX ? PREVIEW_MAX / long : 1;
    display.width = Math.round(src.width * scale);
    display.height = Math.round(src.height * scale);
  }

  function fitDisplay() {
    const r = stage.getBoundingClientRect();
    const pad = 24;
    const maxW = r.width - pad, maxH = r.height - pad;
    const ar = src.width / src.height;
    let w = maxW, h = w / ar;
    if (h > maxH) { h = maxH; w = h * ar; }
    imgWrap.style.width = Math.round(w) + "px";
    imgWrap.style.height = Math.round(h) + "px";
  }
  window.addEventListener("resize", () => { if (loaded) fitDisplay(); });

  async function openImage() {
    const f = await G.pickFile("image/*");
    if (f) loadFile(f);
  }
  async function loadFile(file) {
    if (!file || !file.type.startsWith("image/")) { G.toast("Please choose an image file"); return; }
    const url = URL.createObjectURL(file);
    try { const img = await G.loadImage(url); setupImage(img); G.toast("Loaded · " + G.formatBytes(file.size)); }
    catch (e) { G.toast("Couldn't open that image"); }
    finally { URL.revokeObjectURL(url); }
  }
  $("#openBtn").addEventListener("click", openImage);
  $("#chooseBtn").addEventListener("click", openImage);

  // drag & drop + paste
  ["dragenter", "dragover"].forEach((ev) => document.addEventListener(ev, (e) => { e.preventDefault(); document.body.classList.add("drag-over"); }));
  ["dragleave", "drop"].forEach((ev) => document.addEventListener(ev, (e) => { e.preventDefault(); if (ev === "drop" || e.target === document.documentElement) document.body.classList.remove("drag-over"); }));
  document.addEventListener("drop", (e) => { const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) loadFile(f); });
  document.addEventListener("paste", (e) => { const it = e.clipboardData && e.clipboardData.items; if (!it) return; for (const i of it) if (i.type.startsWith("image/")) { loadFile(i.getAsFile()); break; } });

  // ============================================================
  //  Transform (bake) helpers
  // ============================================================
  function bake2(transform, swap) {
    [src, markup].forEach((cv) => {
      const w = cv.width, h = cv.height;
      const tmp = document.createElement("canvas");
      tmp.width = swap ? h : w; tmp.height = swap ? w : h;
      const tx = tmp.getContext("2d");
      transform(tx, cv, w, h);
      cv.width = tmp.width; cv.height = tmp.height;
      const c = cv.getContext("2d"); c.clearRect(0, 0, cv.width, cv.height); c.drawImage(tmp, 0, 0);
    });
  }
  function afterTransform() { sizePreview(); render(); fitDisplay(); buildFilterTiles(); pushHistory(); $("#docName").textContent = src.width + " × " + src.height; }

  $("#rotL").innerHTML = "<span style='display:inline-flex;transform:scaleX(-1)'>" + G.icon("rotate") + "</span>"; $("#rotL").title = "Rotate left";
  $("#rotR").innerHTML = G.icon("rotate");
  $("#flipH").innerHTML = G.icon("flipH");
  $("#flipV").innerHTML = G.icon("flipV");
  $("#rotL").addEventListener("click", () => { bake2((tx, cv, w, h) => { tx.translate(0, w); tx.rotate(-Math.PI / 2); tx.drawImage(cv, 0, 0); }, true); afterTransform(); });
  $("#rotR").addEventListener("click", () => { bake2((tx, cv, w, h) => { tx.translate(h, 0); tx.rotate(Math.PI / 2); tx.drawImage(cv, 0, 0); }, true); afterTransform(); });
  $("#flipH").addEventListener("click", () => { bake2((tx, cv, w, h) => { tx.translate(w, 0); tx.scale(-1, 1); tx.drawImage(cv, 0, 0); }, false); afterTransform(); });
  $("#flipV").addEventListener("click", () => { bake2((tx, cv, w, h) => { tx.translate(0, h); tx.scale(1, -1); tx.drawImage(cv, 0, 0); }, false); afterTransform(); });
  $("#straighten").addEventListener("input", (e) => { straighten = +e.target.value; $("#straightenVal").textContent = straighten; scheduleRender(); });
  $("#straighten").addEventListener("change", pushHistory);

  // ============================================================
  //  Crop
  // ============================================================
  let crop = { x: 0.05, y: 0.05, w: 0.9, h: 0.9 };
  let aspect = null; // null = free, else [w,h]
  const ASPECTS = [["Free", null], ["1:1", [1, 1]], ["4:3", [4, 3]], ["3:2", [3, 2]], ["16:9", [16, 9]], ["3:4", [3, 4]], ["9:16", [9, 16]], ["4:5", [4, 5]]];
  const aspectChips = $("#aspectChips");
  ASPECTS.forEach(([label, ar], idx) => {
    const c = document.createElement("button"); c.className = "chip"; c.textContent = label;
    c.setAttribute("aria-pressed", idx === 0 ? "true" : "false");
    c.addEventListener("click", () => {
      aspectChips.querySelectorAll(".chip").forEach((x) => x.setAttribute("aria-pressed", "false"));
      c.setAttribute("aria-pressed", "true"); aspect = ar; applyAspect(); positionCrop();
    });
    aspectChips.appendChild(c);
  });
  function applyAspect() {
    if (!aspect) return;
    const targetPx = aspect[0] / aspect[1];
    // current center
    const cxp = (crop.x + crop.w / 2), cyp = (crop.y + crop.h / 2);
    let wPx = crop.w * src.width;
    let hPx = wPx / targetPx;
    let wf = wPx / src.width, hf = hPx / src.height;
    if (hf > 1) { hf = 1; hPx = src.height; wPx = hPx * targetPx; wf = wPx / src.width; }
    crop.w = Math.min(1, wf); crop.h = Math.min(1, hf);
    crop.x = Math.max(0, Math.min(1 - crop.w, cxp - crop.w / 2));
    crop.y = Math.max(0, Math.min(1 - crop.h, cyp - crop.h / 2));
  }
  function positionCrop() {
    cropBox.style.left = (crop.x * 100) + "%";
    cropBox.style.top = (crop.y * 100) + "%";
    cropBox.style.width = (crop.w * 100) + "%";
    cropBox.style.height = (crop.h * 100) + "%";
  }
  function showCrop(show) { cropBox.style.display = show ? "block" : "none"; if (show) positionCrop(); }

  // crop drag
  let cropDrag = null;
  cropBox.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    const handle = e.target.classList.contains("h") ? [...e.target.classList].find((c) => ["tl", "tr", "bl", "br"].includes(c)) : null;
    cropDrag = { handle, sx: e.clientX, sy: e.clientY, c: Object.assign({}, crop) };
    cropBox.setPointerCapture(e.pointerId);
  });
  cropBox.addEventListener("pointermove", (e) => {
    if (!cropDrag) return;
    const rect = imgWrap.getBoundingClientRect();
    const dx = (e.clientX - cropDrag.sx) / rect.width;
    const dy = (e.clientY - cropDrag.sy) / rect.height;
    const c0 = cropDrag.c;
    if (!cropDrag.handle) {
      crop.x = Math.max(0, Math.min(1 - c0.w, c0.x + dx));
      crop.y = Math.max(0, Math.min(1 - c0.h, c0.y + dy));
    } else {
      let x = c0.x, y = c0.y, w = c0.w, h = c0.h;
      if (cropDrag.handle.includes("l")) { x = c0.x + dx; w = c0.w - dx; }
      if (cropDrag.handle.includes("r")) { w = c0.w + dx; }
      if (cropDrag.handle.includes("t")) { y = c0.y + dy; h = c0.h - dy; }
      if (cropDrag.handle.includes("b")) { h = c0.h + dy; }
      if (aspect) {
        const targetPx = aspect[0] / aspect[1];
        // derive height from width to keep ratio
        const wPx = w * src.width; const hPx = wPx / targetPx; h = hPx / src.height;
        if (cropDrag.handle.includes("t")) y = c0.y + c0.h - h;
      }
      w = Math.max(0.05, w); h = Math.max(0.05, h);
      x = Math.max(0, Math.min(1 - w, x)); y = Math.max(0, Math.min(1 - h, y));
      crop = { x, y, w, h };
    }
    positionCrop();
  });
  cropBox.addEventListener("pointerup", () => { cropDrag = null; });

  $("#applyCrop").addEventListener("click", () => {
    const cx = Math.round(crop.x * src.width), cy = Math.round(crop.y * src.height);
    const cw = Math.max(1, Math.round(crop.w * src.width)), ch = Math.max(1, Math.round(crop.h * src.height));
    [src, markup].forEach((cv) => {
      const tmp = document.createElement("canvas"); tmp.width = cw; tmp.height = ch;
      tmp.getContext("2d").drawImage(cv, cx, cy, cw, ch, 0, 0, cw, ch);
      cv.width = cw; cv.height = ch; cv.getContext("2d").drawImage(tmp, 0, 0);
    });
    crop = { x: 0.05, y: 0.05, w: 0.9, h: 0.9 };
    afterTransform(); positionCrop(); G.toast("Cropped");
  });
  $("#cancelCrop").addEventListener("click", () => { crop = { x: 0.02, y: 0.02, w: 0.96, h: 0.96 }; positionCrop(); });

  // ============================================================
  //  Markup (smooth brush + soft eraser + text)
  // ============================================================
  const muState = { tool: "brush", size: 14, color: "#ff3b30", placingText: null };
  const MU_TOOLS = [{ id: "brush", icon: "brush", label: "Brush" }, { id: "eraser", icon: "eraser", label: "Eraser" }];
  const muToolsEl = $("#markupTools");
  MU_TOOLS.forEach((t) => {
    const b = document.createElement("button"); b.className = "tool-btn"; b.dataset.t = t.id;
    b.setAttribute("aria-pressed", t.id === "brush"); b.setAttribute("aria-label", t.label); b.innerHTML = G.icon(t.icon);
    b.addEventListener("click", () => { muState.tool = t.id; muToolsEl.querySelectorAll(".tool-btn").forEach((x) => x.setAttribute("aria-pressed", x.dataset.t === t.id)); });
    muToolsEl.appendChild(b);
  });
  $("#muSize").addEventListener("input", (e) => { muState.size = +e.target.value; $("#muSizeVal").textContent = e.target.value; updateMuRing(lastClient.x, lastClient.y); });
  $("#muColor").addEventListener("input", (e) => muState.color = e.target.value);
  $("#clearMarkup").addEventListener("click", () => { mctx.clearRect(0, 0, markup.width, markup.height); pushHistory(); G.toast("Markup cleared"); });
  $("#addText").addEventListener("click", () => {
    const m = G.modal(`<h3>Add text</h3>
      <label class="field" style="margin:12px 0"><span class="field-label">Text</span><input type="text" id="txtIn" placeholder="Type here" maxlength="120"></label>
      <p class="muted" style="font-size:var(--fs-13)">After adding, tap the image to place it.</p>
      <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="txtGo">Add</button></div>`);
    const inp = m.el.querySelector("#txtIn"); setTimeout(() => inp.focus(), 50);
    m.el.querySelector("#txtGo").addEventListener("click", () => { const v = inp.value.trim(); if (!v) return; muState.placingText = v; m.close(); G.toast("Tap the image to place the text"); });
  });

  function toSource(clientX, clientY) {
    const r = markup.getBoundingClientRect();
    return { x: (clientX - r.left) * (markup.width / r.width), y: (clientY - r.top) * (markup.height / r.height) };
  }

  let muDraw = false, muPts = [], muIdx = 0;
  let lastClient = { x: 0, y: 0 };
  markup.addEventListener("pointerdown", (e) => {
    if (mode !== "markup") return;
    if (muState.placingText) {
      const p = toSource(e.clientX, e.clientY);
      mctx.fillStyle = muState.color; mctx.textBaseline = "middle"; mctx.textAlign = "center";
      mctx.font = `700 ${Math.max(16, muState.size * 2.4)}px -apple-system, "Inter", system-ui, sans-serif`;
      mctx.fillText(muState.placingText, p.x, p.y);
      muState.placingText = null; pushHistory(); G.toast("Text placed"); return;
    }
    markup.setPointerCapture(e.pointerId);
    muDraw = true; muPts = [toSource(e.clientX, e.clientY)]; muIdx = 0;
    mctx.lineCap = "round"; mctx.lineJoin = "round"; mctx.lineWidth = muState.size;
    mctx.strokeStyle = muState.color; mctx.fillStyle = muState.color;
    mctx.globalCompositeOperation = muState.tool === "eraser" ? "destination-out" : "source-over";
    const p = muPts[0]; mctx.beginPath(); mctx.arc(p.x, p.y, Math.max(0.5, muState.size / 2), 0, Math.PI * 2); mctx.fill();
  });
  markup.addEventListener("pointermove", (e) => {
    updateMuRing(e.clientX, e.clientY);
    if (!muDraw) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of evs) muPts.push(toSource(ev.clientX, ev.clientY));
    for (; muIdx < muPts.length - 1; muIdx++) {
      if (muIdx < 1) continue;
      const p0 = muPts[muIdx - 1], p1 = muPts[muIdx], p2 = muPts[muIdx + 1];
      const m1 = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 }, m2 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      mctx.beginPath(); mctx.moveTo(m1.x, m1.y); mctx.quadraticCurveTo(p1.x, p1.y, m2.x, m2.y); mctx.stroke();
    }
  });
  function endMu(e) { if (!muDraw) return; muDraw = false; mctx.globalCompositeOperation = "source-over"; pushHistory(); }
  markup.addEventListener("pointerup", endMu);
  markup.addEventListener("pointercancel", endMu);
  markup.addEventListener("pointerleave", () => { if (!muDraw) ring.style.display = "none"; });

  function updateMuRing(cx, cy) {
    lastClient = { x: cx, y: cy };
    if (mode !== "markup" || muState.placingText) { ring.style.display = "none"; return; }
    const r = markup.getBoundingClientRect();
    if (cx < r.left || cx > r.right || cy < r.top || cy > r.bottom) { ring.style.display = "none"; return; }
    const sr = stage.getBoundingClientRect();
    const d = muState.size * (r.width / markup.width);
    ring.style.display = "block"; ring.style.left = (cx - sr.left) + "px"; ring.style.top = (cy - sr.top) + "px"; ring.style.width = d + "px"; ring.style.height = d + "px";
  }

  // ============================================================
  //  Modes (rail)
  // ============================================================
  const MODES = [
    { id: "adjust", icon: "sliders", label: "Adjust" },
    { id: "filters", icon: "sparkles", label: "Looks" },
    { id: "crop", icon: "crop", label: "Crop" },
    { id: "transform", icon: "rotate", label: "Transform" },
    { id: "markup", icon: "brush", label: "Markup" },
  ];
  const rail = $("#rail");
  MODES.forEach((mo) => {
    const b = document.createElement("button"); b.className = "tool-btn"; b.dataset.mode = mo.id;
    b.setAttribute("aria-pressed", mo.id === "adjust"); b.setAttribute("aria-label", mo.label); b.title = mo.label; b.innerHTML = G.icon(mo.icon);
    b.addEventListener("click", () => setMode(mo.id));
    rail.appendChild(b);
  });
  function setMode(id) {
    mode = id;
    rail.querySelectorAll(".tool-btn").forEach((b) => b.setAttribute("aria-pressed", b.dataset.mode === id));
    document.querySelectorAll(".pmode").forEach((p) => p.classList.toggle("active", p.dataset.mode === id));
    markup.style.pointerEvents = id === "markup" ? "auto" : "none";
    showCrop(id === "crop");
    ring.style.display = "none";
    if (loaded && window.innerWidth < 900) $("#panel").classList.add("open");
  }

  // ============================================================
  //  History
  // ============================================================
  let history = [], hi = -1;
  function pushHistory() {
    if (!loaded) return;
    history = history.slice(0, hi + 1);
    history.push({ src: src.toDataURL("image/png"), markup: markup.toDataURL("image/png"), settings: Object.assign({}, settings), straighten });
    if (history.length > 14) history.shift();
    hi = history.length - 1; refreshBtns();
  }
  async function restore(idx) {
    if (idx < 0 || idx >= history.length) return; hi = idx;
    const h = history[idx];
    const i1 = await G.loadImage(h.src), i2 = await G.loadImage(h.markup);
    src.width = i1.width; src.height = i1.height; sctx.clearRect(0, 0, src.width, src.height); sctx.drawImage(i1, 0, 0);
    markup.width = i2.width; markup.height = i2.height; mctx.clearRect(0, 0, markup.width, markup.height); mctx.drawImage(i2, 0, 0);
    settings = Object.assign({}, h.settings); straighten = h.straighten;
    $("#straighten").value = straighten; $("#straightenVal").textContent = straighten;
    syncAdjustUI(); sizePreview(); render(); fitDisplay(); buildFilterTiles();
    $("#docName").textContent = src.width + " × " + src.height; refreshBtns();
  }
  function refreshBtns() { $("#undoBtn").disabled = hi <= 0; $("#redoBtn").disabled = hi >= history.length - 1; }
  $("#undoBtn").innerHTML = G.icon("undo"); $("#redoBtn").innerHTML = G.icon("redo"); $("#panelToggle").innerHTML = G.icon("sliders");
  $("#undoBtn").addEventListener("click", () => restore(hi - 1));
  $("#redoBtn").addEventListener("click", () => restore(hi + 1));
  $("#undoBtn").disabled = true; $("#redoBtn").disabled = true;
  $("#panelToggle").addEventListener("click", () => $("#panel").classList.toggle("open"));
  $("#sheetHandle").addEventListener("click", () => $("#panel").classList.remove("open"));
  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input,textarea")) return;
    const meta = e.metaKey || e.ctrlKey;
    if (meta && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? restore(hi + 1) : restore(hi - 1); }
  });

  // ============================================================
  //  Export (full resolution, base + markup)
  // ============================================================
  function exportComposite() {
    const out = document.createElement("canvas"); out.width = src.width; out.height = src.height;
    const octx = out.getContext("2d");
    renderInto(octx, out.width, out.height);
    octx.globalCompositeOperation = "source-over";
    octx.drawImage(markup, 0, 0);
    return out;
  }
  $("#exportBtn").addEventListener("click", () => {
    if (!loaded) return;
    const html = `
      <h3>Export image</h3>
      <p class="muted" style="margin:6px 0 16px">Full-resolution render, downloaded directly to your device.</p>
      <label class="field" style="margin-bottom:14px"><span class="field-label">File name</span><input type="text" id="exName" value="glaze-photo"></label>
      <span class="field-label" style="margin-bottom:8px;display:block">Format</span>
      <div class="chips" id="exFmt" style="margin-bottom:14px">
        <button class="chip" data-fmt="png" aria-pressed="true">PNG</button>
        <button class="chip" data-fmt="jpeg">JPG</button>
        <button class="chip" data-fmt="webp">WebP</button>
        <button class="chip" data-fmt="bmp">BMP</button>
        <button class="chip" data-fmt="svg">SVG</button>
        <button class="chip" data-fmt="pdf">PDF</button>
      </div>
      <label class="field" id="exScaleField" style="margin-bottom:12px"><span class="field-label">Scale <span class="val"><span id="exScaleV">100</span>%</span></span><input type="range" id="exScale" min="10" max="100" value="100"></label>
      <label class="field" id="exQ" style="display:none;margin-bottom:6px"><span class="field-label">Quality <span class="val"><span id="exQv">92</span>%</span></span><input type="range" id="exQuality" min="40" max="100" value="92"></label>
      <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="exGo">Download</button></div>`;
    const m = G.modal(html);
    let fmt = "png";
    m.el.querySelectorAll("#exFmt .chip").forEach((c) => c.addEventListener("click", () => {
      m.el.querySelectorAll("#exFmt .chip").forEach((x) => x.setAttribute("aria-pressed", "false"));
      c.setAttribute("aria-pressed", "true"); fmt = c.dataset.fmt;
      m.el.querySelector("#exQ").style.display = ["jpeg", "webp", "pdf"].includes(fmt) ? "" : "none";
    }));
    m.el.querySelector("#exScale").addEventListener("input", (e) => m.el.querySelector("#exScaleV").textContent = e.target.value);
    m.el.querySelector("#exQuality").addEventListener("input", (e) => m.el.querySelector("#exQv").textContent = e.target.value);
    m.el.querySelector("#exGo").addEventListener("click", async () => {
      G.toast("Rendering…", 1200);
      const name = (m.el.querySelector("#exName").value || "glaze-photo").replace(/[^\w.-]+/g, "_");
      const q = (+m.el.querySelector("#exQuality").value) / 100;
      const sc = (+m.el.querySelector("#exScale").value) / 100;
      let composite = exportComposite();
      if (sc < 1) { const r = document.createElement("canvas"); r.width = Math.round(composite.width * sc); r.height = Math.round(composite.height * sc); r.getContext("2d").drawImage(composite, 0, 0, r.width, r.height); composite = r; }
      let blob, ext = fmt;
      try {
        if (fmt === "png") blob = await G.export.canvasToBlob(composite, "image/png");
        else if (fmt === "jpeg") { blob = await G.export.canvasToBlob(flatten(composite), "image/jpeg", q); ext = "jpg"; }
        else if (fmt === "webp") blob = await G.export.canvasToBlob(composite, "image/webp", q);
        else if (fmt === "bmp") blob = G.export.canvasToBMP(flatten(composite));
        else if (fmt === "svg") blob = G.export.canvasToSVG(composite);
        else if (fmt === "pdf") blob = await G.export.canvasToPDF(flatten(composite), q);
        if (!blob) throw 0;
        G.export.download(blob, name + "." + ext); m.close(); G.toast("Saved " + name + "." + ext);
      } catch (err) { G.toast("That format isn't supported here"); }
    });
  });
  function flatten(cv) { const c = document.createElement("canvas"); c.width = cv.width; c.height = cv.height; const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(cv, 0, 0); return c; }

  // boot
  setMode("adjust");
  buildFilterTiles();
})();
