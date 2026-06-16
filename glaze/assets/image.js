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
    selResize();          // size the selection overlay buffer to the new image
    selClear();           // start with no active selection
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
  function afterTransform() { selResize(); selClear(); sizePreview(); render(); fitDisplay(); buildFilterTiles(); pushHistory(); $("#docName").textContent = src.width + " × " + src.height; }

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
  //  Selection tools (marquee / lasso / polygon / magic wand)
  //  Selection lives in SOURCE pixel space as an offscreen MASK
  //  canvas where any opaque (alpha>0) pixel = selected.
  // ============================================================
  const selOverlay = $("#selOverlay");
  const sodx = selOverlay.getContext("2d"); // on-screen overlay (dim + marching ants)

  // offscreen mask: opaque == selected, at source resolution
  const selMask = document.createElement("canvas");
  const smctx = selMask.getContext("2d", { willReadFrequently: true });

  const selState = {
    tool: "rect",        // rect | ellipse | lasso | polygon | wand
    tolerance: 24,       // wand colour tolerance 0-100
    feather: 0,          // edge feather radius 0-50px
    hasSel: false,       // is there an active (non-empty) selection?
    drawing: false,      // pointer drag in progress (rect/ellipse/lasso)
    start: null,         // drag start in source coords
    cur: null,           // current pointer in source coords
    lassoPts: [],        // freehand lasso points (source coords)
    polyPts: [],         // polygon-lasso committed points (source coords)
    polyHover: null,     // live polygon cursor point
    antsOffset: 0,       // marching-ants dash animation offset
    raf: 0,              // animation frame handle
    edgeDirty: true,     // recompute cached mask-edge ring on next paint
  };

  const SEL_TOOLS = [
    { id: "rect", icon: "marquee", label: "Rectangle marquee" },
    { id: "ellipse", icon: "marquee", label: "Ellipse marquee" },
    { id: "lasso", icon: "lasso", label: "Lasso (freehand)" },
    { id: "polygon", icon: "polygon", label: "Polygonal lasso" },
    { id: "wand", icon: "wand", label: "Magic wand" },
  ];
  const selToolsEl = $("#selTools");
  SEL_TOOLS.forEach((t) => {
    const b = document.createElement("button");
    b.className = "tool-btn"; b.dataset.t = t.id;
    b.setAttribute("aria-pressed", t.id === selState.tool);
    b.setAttribute("aria-label", t.label); b.title = t.label;
    // ellipse uses a circle-ish glyph so it reads differently from the rectangle marquee
    b.innerHTML = t.id === "ellipse"
      ? '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="12" rx="9" ry="6" stroke-dasharray="3 3"/></svg>'
      : G.icon(t.icon);
    b.addEventListener("click", () => selSetTool(t.id));
    selToolsEl.appendChild(b);
  });
  function selSetTool(id) {
    // changing tool abandons any in-progress polygon/drag
    selCancelInProgress();
    selState.tool = id;
    selToolsEl.querySelectorAll(".tool-btn").forEach((x) => x.setAttribute("aria-pressed", x.dataset.t === id));
    $("#selTolField").style.display = id === "wand" ? "" : "none";
  }

  // sliders
  $("#selTol").addEventListener("input", (e) => { selState.tolerance = +e.target.value; $("#selTolVal").textContent = e.target.value; });
  $("#selFeather").addEventListener("input", (e) => { selState.feather = +e.target.value; $("#selFeatherVal").textContent = e.target.value; });

  // Keep the mask + overlay buffers matched to the current source size.
  function selResize() {
    selMask.width = src.width; selMask.height = src.height;
    selOverlay.width = src.width; selOverlay.height = src.height;
  }

  // Enable/disable interaction and visuals for Select mode.
  function selSetActive(on) {
    selOverlay.classList.toggle("on", on);
    if (on) { if (selMask.width !== src.width || selMask.height !== src.height) selResize(); selPaint(); selStartAnts(); }
    else { selCancelInProgress(); selStopAnts(); sodx.clearRect(0, 0, selOverlay.width, selOverlay.height); }
  }

  function selCancelInProgress() {
    selState.drawing = false; selState.start = null; selState.cur = null;
    selState.lassoPts = []; selState.polyPts = []; selState.polyHover = null;
    try { selOverlay.releasePointerCapture && selOverlay.releasePointerCapture(selPid); } catch (e) {}
  }

  // --- Mask helpers -----------------------------------------------------
  function selClear() {
    selCancelInProgress();
    smctx.clearRect(0, 0, selMask.width, selMask.height);
    selState.hasSel = false;
    selState.edgeDirty = true;
    selUpdateButtons();
    if (mode === "select") selPaint();
  }

  // True if the mask has at least one selected pixel.
  function selMaskNotEmpty() {
    if (!selMask.width) return false;
    const d = smctx.getImageData(0, 0, selMask.width, selMask.height).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return true;
    return false;
  }

  function selUpdateButtons() {
    const has = selState.hasSel;
    ["selDelete", "selCutout", "selCrop", "selInvert", "selFill", "selCopy", "selDeselect"].forEach((id) => {
      const b = $("#" + id); if (b) b.disabled = !has;
    });
  }

  // Fill the mask from a vector path (rect/ellipse/lasso/polygon) in source coords.
  function selMaskFromPath(drawPath) {
    smctx.save();
    smctx.setTransform(1, 0, 0, 1, 0, 0);
    smctx.clearRect(0, 0, selMask.width, selMask.height);
    smctx.fillStyle = "#fff";
    smctx.beginPath();
    drawPath(smctx);
    smctx.closePath();
    smctx.fill();
    smctx.restore();
    selState.hasSel = selMaskNotEmpty();
    selState.edgeDirty = true;
    selUpdateButtons();
  }

  // Magic wand: contiguous flood select from src pixels within tolerance.
  function selWandAt(sx, sy) {
    const w = src.width, h = src.height;
    sx = Math.round(sx); sy = Math.round(sy);
    if (sx < 0 || sy < 0 || sx >= w || sy >= h) return;
    const img = sctx.getImageData(0, 0, w, h);
    const d = img.data;
    const start = (sy * w + sx) * 4;
    const sr = d[start], sg = d[start + 1], sb = d[start + 2], sa = d[start + 3];
    // tolerance 0-100 mapped to a squared-distance threshold over RGBA
    const tol = selState.tolerance / 100 * 442; // ~max euclidean dist over RGB(+A)
    const tol2 = tol * tol;
    const visited = new Uint8Array(w * h);
    const out = new Uint8ClampedArray(w * h * 4); // mask RGBA
    const stack = [sx, sy];
    while (stack.length) {
      const y = stack.pop(), x = stack.pop();
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const p = y * w + x;
      if (visited[p]) continue;
      visited[p] = 1;
      const i = p * 4;
      const dr = d[i] - sr, dg = d[i + 1] - sg, db = d[i + 2] - sb, da = d[i + 3] - sa;
      if (dr * dr + dg * dg + db * db + da * da > tol2) continue;
      out[i] = 255; out[i + 1] = 255; out[i + 2] = 255; out[i + 3] = 255; // selected
      stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
    }
    smctx.putImageData(new ImageData(out, w, h), 0, 0);
    selState.hasSel = selMaskNotEmpty();
    selState.edgeDirty = true;
    selUpdateButtons();
    selPaint();
    if (selState.hasSel) G.toast("Magic wand selection");
  }

  // Returns a feathered copy of the mask (or the mask itself if feather==0).
  function selFeatheredMask() {
    if (!selState.feather) return selMask;
    const f = document.createElement("canvas");
    f.width = selMask.width; f.height = selMask.height;
    const fx = f.getContext("2d");
    fx.filter = "blur(" + selState.feather + "px)";
    fx.drawImage(selMask, 0, 0);
    fx.filter = "none";
    return f;
  }

  // --- Selection display (dim outside + marching ants) ------------------
  function selPaint() {
    if (mode !== "select") return;
    const w = selOverlay.width, h = selOverlay.height;
    sodx.setTransform(1, 0, 0, 1, 0, 0);
    sodx.clearRect(0, 0, w, h);

    // Live (in-progress) path takes priority for the dim + outline so the
    // user sees feedback before releasing.
    const livePath = selLivePath();

    if (selState.hasSel || livePath) {
      // Dim everything, then punch a hole where the selection is.
      sodx.save();
      sodx.fillStyle = "rgba(0,0,0,0.45)";
      sodx.fillRect(0, 0, w, h);
      sodx.globalCompositeOperation = "destination-out";
      if (livePath) { sodx.beginPath(); livePath(sodx); sodx.closePath(); sodx.fill(); }
      else { sodx.drawImage(selMask, 0, 0); }
      sodx.restore();
    }

    // Marching ants outline.
    selPaintAnts(livePath);
  }

  // Build a path function for whatever is being drawn right now, or null.
  function selLivePath() {
    const s = selState;
    if (s.tool === "rect" && s.drawing && s.start && s.cur) {
      const x = Math.min(s.start.x, s.cur.x), y = Math.min(s.start.y, s.cur.y);
      const ww = Math.abs(s.cur.x - s.start.x), hh = Math.abs(s.cur.y - s.start.y);
      return (c) => c.rect(x, y, ww, hh);
    }
    if (s.tool === "ellipse" && s.drawing && s.start && s.cur) {
      const cx = (s.start.x + s.cur.x) / 2, cy = (s.start.y + s.cur.y) / 2;
      const rx = Math.abs(s.cur.x - s.start.x) / 2, ry = Math.abs(s.cur.y - s.start.y) / 2;
      return (c) => c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    }
    if (s.tool === "lasso" && s.drawing && s.lassoPts.length > 1) {
      const pts = s.lassoPts;
      return (c) => { c.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y); };
    }
    if (s.tool === "polygon" && s.polyPts.length) {
      const pts = s.polyPts, hov = s.polyHover;
      return (c) => {
        c.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
        if (hov) c.lineTo(hov.x, hov.y);
      };
    }
    return null;
  }

  // Stroke marching ants. For vector tools we stroke the known path; for the
  // wand (and committed masks of any kind) we derive an edge from the mask.
  function selPaintAnts(livePath) {
    const w = selOverlay.width;
    // Scale dash to roughly device-pixels so it looks consistent at any zoom.
    const px = Math.max(1, w / Math.max(1, selOverlay.getBoundingClientRect().width));
    const dash = 6 * px, lw = 1.4 * px;
    function strokePath(makePath, closed) {
      sodx.save();
      sodx.lineWidth = lw;
      // dark base
      sodx.setLineDash([dash, dash]); sodx.lineDashOffset = -selState.antsOffset * px;
      sodx.strokeStyle = "rgba(0,0,0,0.85)";
      sodx.beginPath(); makePath(sodx); if (closed) sodx.closePath(); sodx.stroke();
      // white ants offset by one dash for the alternating look
      sodx.lineDashOffset = -selState.antsOffset * px + dash;
      sodx.strokeStyle = "rgba(255,255,255,0.95)";
      sodx.beginPath(); makePath(sodx); if (closed) sodx.closePath(); sodx.stroke();
      sodx.restore();
    }

    if (livePath) {
      // Polygon is left "open" (we draw the live segment to the cursor instead);
      // rect / ellipse / lasso show a closed outline while dragging.
      strokePath(livePath, selState.tool !== "polygon");
      return;
    }
    if (!selState.hasSel) return;

    // Committed selection: derive an edge mask = mask minus eroded mask, then
    // stamp it as the ants colour. Works for ALL tools incl. magic wand.
    selStampEdge(dash, lw);
  }

  // Derive the mask boundary as a thin "ring" (mask minus an eroded copy) and
  // stamp it as a monochrome outline. Used for the magic wand and any committed
  // mask whose exact vector path we no longer have. We can't easily run a dash
  // pattern over an arbitrary bitmap edge, so the ants are faked: a dark ring
  // underneath plus a white ring whose alpha shimmers with the dash offset for
  // a subtle moving feel (and a static outline when reduced-motion is on).
  const selEdgeCv = document.createElement("canvas");
  const selEdgeCtx = selEdgeCv.getContext("2d");
  function selStampEdge(dash, lw) {
    const w = selOverlay.width, h = selOverlay.height;
    // Recompute the ring bitmap only when the mask actually changed (cheap to
    // re-stamp each frame, expensive to rebuild every frame).
    if (selState.edgeDirty || selEdgeCv.width !== w || selEdgeCv.height !== h) {
      if (selEdgeCv.width !== w || selEdgeCv.height !== h) { selEdgeCv.width = w; selEdgeCv.height = h; }
      const ex = selEdgeCtx;
      ex.setTransform(1, 0, 0, 1, 0, 0);
      ex.clearRect(0, 0, w, h);
      // ring = mask minus an eroded mask. Approximate erosion by destination-out
      // of the mask shifted in 8 directions, leaving a ~inset-thick outline.
      ex.globalCompositeOperation = "source-over";
      ex.drawImage(selMask, 0, 0);
      ex.globalCompositeOperation = "destination-out";
      const inset = Math.max(1.2, lw * 1.4); // ring thickness in source px
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
        ex.drawImage(selMask, Math.cos(a) * inset, Math.sin(a) * inset);
      }
      ex.globalCompositeOperation = "source-over";
      selState.edgeDirty = false;
    }

    // Dark underlay so the outline reads on light areas.
    sodx.save();
    sodx.globalCompositeOperation = "source-over";
    sodx.globalAlpha = 0.85;
    sodx.drawImage(selEdgeCv, 0, 0);
    // White shimmer on top (alpha animates with the ants offset).
    const shimmer = selReduceMotion ? 0.9 : 0.55 + 0.4 * (0.5 + 0.5 * Math.sin(selState.antsOffset / 12 * Math.PI * 2));
    sodx.globalAlpha = shimmer;
    sodx.globalCompositeOperation = "source-atop";
    sodx.fillStyle = "#fff";
    sodx.fillRect(0, 0, w, h);
    sodx.restore();
  }

  // --- Marching-ants animation -----------------------------------------
  const selReduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function selStartAnts() {
    selStopAnts();
    if (selReduceMotion) { selPaint(); return; } // static dashes only
    const tick = () => {
      selState.antsOffset = (selState.antsOffset + 0.5) % 12;
      selPaint();
      selState.raf = requestAnimationFrame(tick);
    };
    selState.raf = requestAnimationFrame(tick);
  }
  function selStopAnts() { if (selState.raf) cancelAnimationFrame(selState.raf); selState.raf = 0; }

  // --- Pointer interaction ---------------------------------------------
  function selToSource(clientX, clientY) {
    const r = selOverlay.getBoundingClientRect();
    return { x: (clientX - r.left) * (selOverlay.width / r.width), y: (clientY - r.top) * (selOverlay.height / r.height) };
  }
  let selPid = -1;

  selOverlay.addEventListener("pointerdown", (e) => {
    if (mode !== "select") return;
    const p = selToSource(e.clientX, e.clientY);
    const tool = selState.tool;

    if (tool === "wand") { selWandAt(p.x, p.y); return; }

    if (tool === "polygon") {
      // click near the first point closes the polygon
      if (selState.polyPts.length >= 3) {
        const a = selState.polyPts[0];
        const closeDist = 10 * (selOverlay.width / Math.max(1, selOverlay.getBoundingClientRect().width));
        if (Math.hypot(p.x - a.x, p.y - a.y) <= closeDist) { selClosePolygon(); return; }
      }
      selState.polyPts.push(p);
      selState.polyHover = p;
      selPaint();
      return;
    }

    // rect / ellipse / lasso — start a drag
    selPid = e.pointerId;
    selOverlay.setPointerCapture(e.pointerId);
    selState.drawing = true;
    selState.start = p; selState.cur = p;
    selState.lassoPts = [p];
  });

  selOverlay.addEventListener("pointermove", (e) => {
    if (mode !== "select") return;
    const p = selToSource(e.clientX, e.clientY);
    if (selState.tool === "polygon" && selState.polyPts.length) { selState.polyHover = p; selPaint(); return; }
    if (!selState.drawing) return;
    selState.cur = p;
    if (selState.tool === "lasso") {
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of evs) selState.lassoPts.push(selToSource(ev.clientX, ev.clientY));
    }
    selPaint();
  });

  function selEndDrag(e) {
    if (!selState.drawing) return;
    selState.drawing = false;
    try { selOverlay.releasePointerCapture(selPid); } catch (err) {}
    const s = selState;
    if (s.tool === "rect" && s.start && s.cur) {
      const x = Math.min(s.start.x, s.cur.x), y = Math.min(s.start.y, s.cur.y);
      const w = Math.abs(s.cur.x - s.start.x), h = Math.abs(s.cur.y - s.start.y);
      if (w > 1 && h > 1) selMaskFromPath((c) => c.rect(x, y, w, h));
    } else if (s.tool === "ellipse" && s.start && s.cur) {
      const cx = (s.start.x + s.cur.x) / 2, cy = (s.start.y + s.cur.y) / 2;
      const rx = Math.abs(s.cur.x - s.start.x) / 2, ry = Math.abs(s.cur.y - s.start.y) / 2;
      if (rx > 1 && ry > 1) selMaskFromPath((c) => c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2));
    } else if (s.tool === "lasso" && s.lassoPts.length > 2) {
      const pts = s.lassoPts.slice();
      selMaskFromPath((c) => { c.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y); });
    }
    s.start = s.cur = null; s.lassoPts = [];
    selPaint();
  }
  selOverlay.addEventListener("pointerup", selEndDrag);
  selOverlay.addEventListener("pointercancel", selEndDrag);

  // double-click closes a polygon
  selOverlay.addEventListener("dblclick", (e) => {
    if (mode === "select" && selState.tool === "polygon" && selState.polyPts.length >= 3) selClosePolygon();
  });

  function selClosePolygon() {
    const pts = selState.polyPts.slice();
    selState.polyPts = []; selState.polyHover = null;
    if (pts.length >= 3) selMaskFromPath((c) => { c.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y); });
    selPaint();
  }

  // --- Selection bounding box ------------------------------------------
  function selBounds() {
    const w = selMask.width, h = selMask.height;
    const d = smctx.getImageData(0, 0, w, h).data;
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (d[(y * w + x) * 4 + 3] > 0) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return null;
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  }

  // --- Actions ----------------------------------------------------------
  // Apply a composite operation through the (feathered) mask onto a canvas.
  function selApplyMask(canvas, op) {
    const ctx = canvas.getContext("2d");
    const m = selFeatheredMask();
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = op; // destination-out (delete) | destination-in (cut out)
    ctx.drawImage(m, 0, 0);
    ctx.restore();
    ctx.globalCompositeOperation = "source-over";
  }

  function selDoDelete() {
    if (!selState.hasSel) return;
    selApplyMask(src, "destination-out");
    selApplyMask(markup, "destination-out");
    render(); buildFilterTiles(); pushHistory(); G.toast("Deleted selection");
  }
  function selDoCutout() {
    if (!selState.hasSel) return;
    selApplyMask(src, "destination-in");
    selApplyMask(markup, "destination-in");
    render(); buildFilterTiles(); pushHistory(); G.toast("Cut out selection");
  }
  function selDoCropToSelection() {
    if (!selState.hasSel) return;
    const b = selBounds(); if (!b) return;
    const m = selFeatheredMask();
    [src, markup].forEach((cv) => {
      const tmp = document.createElement("canvas"); tmp.width = b.w; tmp.height = b.h;
      const tx = tmp.getContext("2d");
      tx.drawImage(cv, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);       // copy box
      tx.globalCompositeOperation = "destination-in";             // keep only masked area
      tx.drawImage(m, -b.x, -b.y);
      tx.globalCompositeOperation = "source-over";
      cv.width = b.w; cv.height = b.h; cv.getContext("2d").drawImage(tmp, 0, 0);
    });
    selClear();
    selResize();
    sizePreview(); render(); fitDisplay(); buildFilterTiles();
    $("#docName").textContent = src.width + " × " + src.height;
    pushHistory(); G.toast("Cropped to selection");
  }
  function selDoInvert() {
    if (!selState.hasSel) { return; }
    const w = selMask.width, h = selMask.height;
    const tmp = document.createElement("canvas"); tmp.width = w; tmp.height = h;
    const tx = tmp.getContext("2d");
    tx.fillStyle = "#fff"; tx.fillRect(0, 0, w, h);    // full
    tx.globalCompositeOperation = "destination-out";
    tx.drawImage(selMask, 0, 0);                        // minus current
    smctx.setTransform(1, 0, 0, 1, 0, 0);
    smctx.clearRect(0, 0, w, h);
    smctx.drawImage(tmp, 0, 0);
    selState.hasSel = selMaskNotEmpty();
    selState.edgeDirty = true;
    selUpdateButtons(); selPaint(); G.toast("Selection inverted");
  }
  function selDoFill() {
    if (!selState.hasSel) return;
    const m = G.modal(`<h3>Fill selection</h3>
      <label class="field" style="margin:12px 0"><span class="field-label">Color</span><input type="color" id="selFillColor" value="#000000"></label>
      <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="selFillGo">Fill</button></div>`);
    m.el.querySelector("#selFillGo").addEventListener("click", () => {
      const color = m.el.querySelector("#selFillColor").value;
      const mask = selFeatheredMask();
      // paint colour, clipped to the mask, into markup (non-destructive to base)
      const tmp = document.createElement("canvas"); tmp.width = src.width; tmp.height = src.height;
      const tx = tmp.getContext("2d");
      tx.fillStyle = color; tx.fillRect(0, 0, tmp.width, tmp.height);
      tx.globalCompositeOperation = "destination-in";
      tx.drawImage(mask, 0, 0);
      mctx.drawImage(tmp, 0, 0);
      m.close(); render(); pushHistory(); G.toast("Filled selection");
    });
  }
  async function selDoCopy() {
    if (!selState.hasSel) return;
    const b = selBounds(); if (!b) return;
    const m = selFeatheredMask();
    // composite base + markup at full res, then keep only the masked box
    const comp = exportComposite();
    const out = document.createElement("canvas"); out.width = b.w; out.height = b.h;
    const ox = out.getContext("2d");
    ox.drawImage(comp, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
    ox.globalCompositeOperation = "destination-in";
    ox.drawImage(m, -b.x, -b.y);
    ox.globalCompositeOperation = "source-over";
    try {
      const blob = await G.export.canvasToBlob(out, "image/png");
      G.export.download(blob, "glaze-selection.png");
      G.toast("Saved selection PNG");
    } catch (err) { G.toast("Couldn't export selection"); }
  }

  $("#selDelete").addEventListener("click", selDoDelete);
  $("#selCutout").addEventListener("click", selDoCutout);
  $("#selCrop").addEventListener("click", selDoCropToSelection);
  $("#selInvert").addEventListener("click", selDoInvert);
  $("#selFill").addEventListener("click", selDoFill);
  $("#selCopy").addEventListener("click", selDoCopy);
  $("#selDeselect").addEventListener("click", () => { selClear(); G.toast("Deselected"); });
  selUpdateButtons();

  // ============================================================
  //  Modes (rail)
  // ============================================================
  const MODES = [
    { id: "adjust", icon: "sliders", label: "Adjust" },
    { id: "filters", icon: "sparkles", label: "Looks" },
    { id: "select", icon: "marquee", label: "Select" },
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
    // Selection overlay: only interactive (and visible) in Select mode
    selSetActive(id === "select");
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
    selResize(); selClear();   // selection is not part of history; reset it to match new size
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
    if (meta && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? restore(hi + 1) : restore(hi - 1); return; }
    // Selection keyboard shortcuts
    if (mode === "select") {
      if (e.key === "Escape") {
        // cancel an in-progress polygon first, otherwise deselect
        if (selState.polyPts.length || selState.drawing) { selCancelInProgress(); selPaint(); }
        else if (selState.hasSel) { selClear(); }
        e.preventDefault(); return;
      }
      if (e.key === "Enter" && selState.tool === "polygon" && selState.polyPts.length >= 3) { selClosePolygon(); e.preventDefault(); return; }
      if ((e.key === "Delete" || e.key === "Backspace") && selState.hasSel) { selDoDelete(); e.preventDefault(); return; }
    }
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
