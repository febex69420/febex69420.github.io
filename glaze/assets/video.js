/* ============================================================
   Glaze · Video editor
   Trim, recolour, transform, speed, mute. Export WebM/MP4 instantly
   via MediaRecorder, frame sequences, or load the optional ffmpeg
   power engine for MP4 / GIF / MOV. All on-device.
   ============================================================ */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const G = window.Glaze;

  const stage = $("#stage"), drop = $("#drop"), video = $("#video"), transport = $("#transport");
  const vwrap = $("#vwrap");
  const track = $("#track"), sel = $("#sel"), playhead = $("#playhead"), hIn = $("#hIn"), hOut = $("#hOut");

  const st = { dur: 0, in: 0, out: 0, speed: 1, mute: false, rot: 0, flipH: false, flipV: false,
    // Lumetri Color
    brightness: 0, contrast: 0, saturation: 0,
    exposure: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0,
    temperature: 0, tint: 0, vibrance: 0, sharpen: 0,
    // Motion / Transform
    scale: 100, posX: 0, posY: 0, rotFine: 0, opacity: 100,
    // Crop (fractions of source: left/top/right/bottom inset)
    crop: { l: 0, t: 0, r: 0, b: 0 },
    // Fade (seconds)
    fadeIn: 0, fadeOut: 0,
    // Title
    title: "", titleAlign: "center", titleColor: "#ffffff", titleBar: true,
    titleSize: 6, titleX: 50, titleY: 84,
    // Audio
    volume: 100, aFadeIn: 0, aFadeOut: 0,
    // Reverse
    reverse: false };
  let file = null, loaded = false;

  // helper: build a slider field into a wrapper. opts: {k,label,min,max,def,step,unit,fmt}
  function slider(wrap, o) {
    const l = document.createElement("label"); l.className = "field";
    const unit = o.unit || "";
    l.innerHTML = `<span class="field-label">${o.label} <span class="val"><span id="v-${o.k}">${o.def}</span>${unit}</span></span>` +
      `<input type="range" id="s-${o.k}" min="${o.min}" max="${o.max}" step="${o.step || 1}" value="${o.def}">`;
    wrap.appendChild(l);
    const inp = l.querySelector("input"), out = l.querySelector("#v-" + o.k);
    inp.addEventListener("input", () => {
      st[o.k] = +inp.value;
      out.textContent = o.fmt ? o.fmt(+inp.value) : inp.value;
      if (o.on) o.on(+inp.value);
      applyPreview();
    });
    return { reset: () => { st[o.k] = o.def; inp.value = o.def; out.textContent = o.fmt ? o.fmt(o.def) : o.def; } };
  }

  // ---- Lumetri Color ----
  const ADJ = [
    { k: "exposure", label: "Exposure" },
    { k: "contrast", label: "Contrast" },
    { k: "highlights", label: "Highlights" },
    { k: "shadows", label: "Shadows" },
    { k: "whites", label: "Whites" },
    { k: "blacks", label: "Blacks" },
    { k: "temperature", label: "Temperature" },
    { k: "tint", label: "Tint" },
    { k: "saturation", label: "Saturation" },
    { k: "vibrance", label: "Vibrance" },
    { k: "brightness", label: "Brightness" },
    { k: "sharpen", label: "Sharpen", min: 0, max: 100 },
  ];
  const adjWrap = $("#adjustControls");
  const adjReset = [];
  ADJ.forEach((a) => adjReset.push(slider(adjWrap, { k: a.k, label: a.label, min: a.min ?? -100, max: a.max ?? 100, def: 0 })));
  $("#resetAdjust").addEventListener("click", () => { adjReset.forEach((r) => r.reset()); applyPreview(); });

  // brightness/contrast/saturate/hue go into the live CSS filter (preview + canvas)
  function filterStr() {
    const bri = 1 + (st.brightness + st.exposure) / 100;
    const con = 1 + st.contrast / 100;
    const sat = Math.max(0, 1 + st.saturation / 100);
    // tint approximates a green<->magenta hue shift for live feedback
    const hue = (st.tint || 0) * 0.4;
    return `brightness(${Math.max(0, bri).toFixed(3)}) contrast(${Math.max(0, con).toFixed(3)}) saturate(${sat.toFixed(3)}) hue-rotate(${hue.toFixed(1)}deg)`;
  }
  // does any effect need a per-pixel pass (export-only, not CSS-filterable)?
  function needsPixelPass() {
    return st.exposure || st.highlights || st.shadows || st.whites || st.blacks ||
      st.temperature || st.tint || st.vibrance || st.sharpen;
  }

  function applyPreview() {
    video.style.filter = filterStr();
    const sx = (st.flipH ? -1 : 1) * (st.scale / 100);
    const sy = (st.flipV ? -1 : 1) * (st.scale / 100);
    video.style.transform =
      `translate(${st.posX}px, ${st.posY}px) rotate(${st.rot + st.rotFine}deg) scale(${sx}, ${sy})`;
    video.style.opacity = (st.opacity / 100).toFixed(3);
    layoutCrop();
  }

  // ---- Motion / Transform ----
  $("#rotR").innerHTML = G.icon("rotate");
  $("#flipH").innerHTML = G.icon("flipH");
  $("#flipV").innerHTML = G.icon("flipV");
  $("#rotR").addEventListener("click", () => { st.rot = (st.rot + 90) % 360; applyPreview(); layoutTrack(); });
  $("#flipH").addEventListener("click", () => { st.flipH = !st.flipH; applyPreview(); });
  $("#flipV").addEventListener("click", () => { st.flipV = !st.flipV; applyPreview(); });

  const motionWrap = $("#motionControls");
  const mScale = slider(motionWrap, { k: "scale", label: "Scale", min: 10, max: 400, def: 100, unit: "%" });
  const mPosX = slider(motionWrap, { k: "posX", label: "Position X", min: -500, max: 500, def: 0, unit: "px" });
  const mPosY = slider(motionWrap, { k: "posY", label: "Position Y", min: -500, max: 500, def: 0, unit: "px" });
  const mRotF = slider(motionWrap, { k: "rotFine", label: "Rotation", min: -180, max: 180, def: 0, unit: "°" });
  $("#resetMotion").addEventListener("click", () => {
    mScale.reset(); mPosX.reset(); mPosY.reset(); mRotF.reset();
    st.rot = 0; st.flipH = false; st.flipV = false;
    applyPreview(); layoutTrack();
  });

  // ---- Opacity ----
  const opWrap = $("#opacityControls");
  const mOpacity = slider(opWrap, { k: "opacity", label: "Opacity", min: 0, max: 100, def: 100, unit: "%" });

  // ---- Crop (UI fields; overlay handled below) ----
  const cropWrap = $("#cropControls");
  const cropFields = {};
  [["l", "Left"], ["t", "Top"], ["r", "Right"], ["b", "Bottom"]].forEach(([k, label]) => {
    const l = document.createElement("label"); l.className = "field";
    l.innerHTML = `<span class="field-label">${label} <span class="val"><span id="v-crop-${k}">0</span>%</span></span>` +
      `<input type="range" id="s-crop-${k}" min="0" max="95" step="1" value="0">`;
    cropWrap.appendChild(l);
    const inp = l.querySelector("input"), out = l.querySelector("#v-crop-" + k);
    cropFields[k] = { inp, out };
    inp.addEventListener("input", () => {
      let v = +inp.value / 100;
      // keep opposite edges from crossing (min 5% remaining)
      const opp = (k === "l") ? "r" : (k === "r") ? "l" : (k === "t") ? "b" : "t";
      if (v + st.crop[opp] > 0.95) { v = 0.95 - st.crop[opp]; inp.value = Math.round(v * 100); }
      st.crop[k] = v; out.textContent = Math.round(v * 100);
      layoutCrop(); layoutTrack();
    });
  });
  function syncCropFields() {
    ["l", "t", "r", "b"].forEach((k) => { cropFields[k].inp.value = Math.round(st.crop[k] * 100); cropFields[k].out.textContent = Math.round(st.crop[k] * 100); });
  }
  $("#cropChk").addEventListener("change", (e) => { $("#cropOverlay").classList.toggle("on", e.target.checked); layoutCrop(); });
  $("#resetCrop").addEventListener("click", () => { st.crop = { l: 0, t: 0, r: 0, b: 0 }; syncCropFields(); layoutCrop(); layoutTrack(); });

  // ---- Fade (Dip to Black) ----
  const fadeWrap = $("#fadeControls");
  const fadeMax = () => Math.max(0.5, (st.out - st.in));
  const fFmt = (v) => v.toFixed(1) + "s";
  const fIn = slider(fadeWrap, { k: "fadeIn", label: "Fade in", min: 0, max: 10, def: 0, step: 0.1, fmt: fFmt });
  const fOut = slider(fadeWrap, { k: "fadeOut", label: "Fade out", min: 0, max: 10, def: 0, step: 0.1, fmt: fFmt });

  // ---- Title / Text ----
  const titleWrap = $("#titleControls");
  const tSize = slider(titleWrap, { k: "titleSize", label: "Font size", min: 2, max: 20, def: 6, unit: "%" });
  const tX = slider(titleWrap, { k: "titleX", label: "Position X", min: 0, max: 100, def: 50, unit: "%" });
  const tY = slider(titleWrap, { k: "titleY", label: "Position Y", min: 0, max: 100, def: 84, unit: "%" });
  $("#titleText").addEventListener("input", (e) => { st.title = e.target.value; });
  $("#titleColor").addEventListener("input", (e) => { st.titleColor = e.target.value; });
  $("#titleBar").addEventListener("change", (e) => { st.titleBar = e.target.checked; });
  $("#titleAlign").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    $("#titleAlign").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", "false"));
    b.setAttribute("aria-pressed", "true"); st.titleAlign = b.dataset.al;
  }));

  // ---- Audio ----
  $("#muteBtn").innerHTML = G.icon("sound");
  function setMute(m) { st.mute = m; video.muted = m; $("#muteChk").checked = m; $("#muteBtn").innerHTML = G.icon(m ? "mute" : "sound"); }
  $("#muteBtn").addEventListener("click", () => setMute(!st.mute));
  $("#muteChk").addEventListener("change", (e) => setMute(e.target.checked));
  const audioWrap = $("#audioControls");
  slider(audioWrap, { k: "volume", label: "Volume", min: 0, max: 200, def: 100, unit: "%", on: () => { video.volume = Math.min(1, st.volume / 100); } });
  slider(audioWrap, { k: "aFadeIn", label: "Audio fade in", min: 0, max: 10, def: 0, step: 0.1, fmt: fFmt });
  slider(audioWrap, { k: "aFadeOut", label: "Audio fade out", min: 0, max: 10, def: 0, step: 0.1, fmt: fFmt });

  // ---- Speed / Reverse ----
  $("#speed").addEventListener("change", (e) => { st.speed = +e.target.value; video.playbackRate = st.speed; });
  $("#revChk").addEventListener("change", (e) => { st.reverse = e.target.checked; });

  // ---- Collapsible group headers ----
  const GICONS = { motion: "move", crop: "crop", opacity: "eye", color: "palette", fade: "contrast", title: "type", audio: "sound", speed: "gauge" };
  document.querySelectorAll(".group").forEach((g) => {
    const key = g.dataset.group, head = g.querySelector(".grp-head"), ghi = g.querySelector(".ghi");
    if (ghi && GICONS[key]) ghi.innerHTML = G.icon(GICONS[key], 16);
    const toggle = () => { const c = g.getAttribute("data-collapsed") === "true"; g.setAttribute("data-collapsed", c ? "false" : "true"); head.setAttribute("aria-expanded", c ? "true" : "false"); };
    head.addEventListener("click", toggle);
    head.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
  });

  // ============================================================
  //  Crop overlay (draggable box over the live preview)
  // ============================================================
  const cropOverlay = $("#cropOverlay"), cropBox = $("#cropBox");
  // The overlay tracks the *displayed* (untransformed) video rect inside #vwrap.
  function videoDisplayRect() {
    // #vwrap shrink-wraps the video; overlay is inset:0 over it. Crop is in
    // source fractions, so the box maps directly onto the displayed video box.
    return { w: vwrap.clientWidth, h: vwrap.clientHeight };
  }
  function layoutCrop() {
    if (!cropOverlay.classList.contains("on")) return;
    const r = videoDisplayRect();
    if (!r.w || !r.h) return;
    cropBox.style.left = (st.crop.l * 100) + "%";
    cropBox.style.top = (st.crop.t * 100) + "%";
    cropBox.style.width = ((1 - st.crop.l - st.crop.r) * 100) + "%";
    cropBox.style.height = ((1 - st.crop.t - st.crop.b) * 100) + "%";
  }
  let cropDrag = null;
  function cropPointerDown(edge, e) {
    e.preventDefault(); e.stopPropagation();
    const r = vwrap.getBoundingClientRect();
    cropDrag = { edge, w: r.width, h: r.height, sx: e.clientX, sy: e.clientY, start: { ...st.crop } };
    cropOverlay.setPointerCapture ? null : null;
    window.addEventListener("pointermove", cropPointerMove);
    window.addEventListener("pointerup", cropPointerUp);
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function cropPointerMove(e) {
    if (!cropDrag) return;
    const dx = (e.clientX - cropDrag.sx) / cropDrag.w;
    const dy = (e.clientY - cropDrag.sy) / cropDrag.h;
    const s = cropDrag.start, c = st.crop, edge = cropDrag.edge;
    if (edge === "move") {
      const wkeep = 1 - s.l - s.r, hkeep = 1 - s.t - s.b;
      c.l = clamp(s.l + dx, 0, 1 - wkeep); c.r = 1 - wkeep - c.l;
      c.t = clamp(s.t + dy, 0, 1 - hkeep); c.b = 1 - hkeep - c.t;
    } else {
      if (edge.includes("w")) c.l = clamp(s.l + dx, 0, 1 - s.r - 0.05);
      if (edge.includes("e")) c.r = clamp(s.r - dx, 0, 1 - s.l - 0.05);
      if (edge.includes("n")) c.t = clamp(s.t + dy, 0, 1 - s.b - 0.05);
      if (edge.includes("s")) c.b = clamp(s.b - dy, 0, 1 - s.t - 0.05);
    }
    syncCropFields(); layoutCrop(); layoutTrack();
  }
  function cropPointerUp() {
    cropDrag = null;
    window.removeEventListener("pointermove", cropPointerMove);
    window.removeEventListener("pointerup", cropPointerUp);
  }
  cropBox.addEventListener("pointerdown", (e) => cropPointerDown("move", e));
  cropOverlay.querySelectorAll(".crop-h").forEach((h) => h.addEventListener("pointerdown", (e) => cropPointerDown(h.dataset.edge, e)));
  window.addEventListener("resize", () => { applyPreview(); });

  // ============================================================
  //  Load
  // ============================================================
  async function openVideo() { const f = await G.pickFile("video/*"); if (f) loadFile(f); }
  function loadFile(f) {
    if (!f || !f.type.startsWith("video/")) { G.toast("Please choose a video file"); return; }
    file = f;
    video.src = URL.createObjectURL(f);
    video.load();
  }
  $("#openBtn").addEventListener("click", openVideo);
  $("#chooseBtn").addEventListener("click", openVideo);
  ["dragenter", "dragover"].forEach((ev) => document.addEventListener(ev, (e) => { e.preventDefault(); document.body.classList.add("drag-over"); }));
  ["dragleave", "drop"].forEach((ev) => document.addEventListener(ev, (e) => { e.preventDefault(); if (ev === "drop") document.body.classList.remove("drag-over"); }));
  document.addEventListener("drop", (e) => { const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) loadFile(f); });

  video.addEventListener("loadedmetadata", () => {
    st.dur = video.duration || 0; st.in = 0; st.out = st.dur;
    loaded = true;
    drop.classList.add("hidden"); vwrap.style.display = "inline-block"; transport.classList.remove("hidden");
    $("#exportBtn").disabled = false;
    $("#docName").textContent = video.videoWidth + " × " + video.videoHeight + " · " + fmt(st.dur);
    video.volume = Math.min(1, st.volume / 100);
    applyPreview(); layoutTrack(); updateTime(); layoutCrop();
  });
  video.addEventListener("error", () => { if (file) G.toast("This video format can't be decoded by your browser"); });

  // ============================================================
  //  Timeline
  // ============================================================
  function pct(t) { return st.dur ? (t / st.dur) * 100 : 0; }
  function layoutTrack() {
    hIn.style.left = pct(st.in) + "%";
    hOut.style.left = pct(st.out) + "%";
    sel.style.left = pct(st.in) + "%";
    sel.style.width = (pct(st.out) - pct(st.in)) + "%";
  }
  function updateTime() {
    playhead.style.left = pct(video.currentTime) + "%";
    $("#curTime").textContent = fmt(video.currentTime);
    $("#selDur").textContent = fmt((st.out - st.in) / st.speed) + " clip";
  }
  function trackTime(clientX) {
    const r = track.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * st.dur;
  }

  let dragH = null;
  function startHandle(which, e) { dragH = which; e.stopPropagation(); track.setPointerCapture(e.pointerId); }
  hIn.addEventListener("pointerdown", (e) => startHandle("in", e));
  hOut.addEventListener("pointerdown", (e) => startHandle("out", e));
  track.addEventListener("pointerdown", (e) => { if (dragH) return; const t = trackTime(e.clientX); seekTo(t); });
  track.addEventListener("pointermove", (e) => {
    if (!dragH) return;
    const t = trackTime(e.clientX);
    if (dragH === "in") st.in = Math.min(t, st.out - 0.05);
    else st.out = Math.max(t, st.in + 0.05);
    layoutTrack(); updateTime();
    seekTo(dragH === "in" ? st.in : st.out);
  });
  track.addEventListener("pointerup", () => { dragH = null; });

  function seekTo(t) { video.currentTime = Math.max(0, Math.min(st.dur, t)); }

  // ---- Playback ----
  $("#playBtn").innerHTML = G.icon("play");
  function setPlayIcon() { $("#playBtn").innerHTML = G.icon(video.paused ? "play" : "pause"); }
  $("#playBtn").addEventListener("click", () => {
    if (video.paused) { if (video.currentTime < st.in || video.currentTime >= st.out) video.currentTime = st.in; video.play(); }
    else video.pause();
  });
  video.addEventListener("play", setPlayIcon);
  video.addEventListener("pause", setPlayIcon);
  video.addEventListener("timeupdate", () => { if (!exporting && video.currentTime >= st.out) { video.currentTime = st.in; } });
  function tick() { updateTime(); requestAnimationFrame(tick); }
  tick();

  function fmt(t) { if (!isFinite(t)) return "0:00"; const m = Math.floor(t / 60), s = Math.floor(t % 60); return m + ":" + String(s).padStart(2, "0"); }

  // ============================================================
  //  Frame drawing
  // ============================================================
  // Output dimensions = cropped source size, after 90° rotation swap.
  // sw/sh = source sub-rect (crop) in source pixels; sx/sy = its top-left.
  function outDims() {
    const vw = video.videoWidth || 0, vh = video.videoHeight || 0;
    const sx = Math.round(st.crop.l * vw), sy = Math.round(st.crop.t * vh);
    const sw = Math.max(1, Math.round((1 - st.crop.l - st.crop.r) * vw));
    const sh = Math.max(1, Math.round((1 - st.crop.t - st.crop.b) * vh));
    const swap = (st.rot % 180) !== 0;
    return { w: swap ? sh : sw, h: swap ? sw : sh, sx, sy, sw, sh };
  }

  function drawFrame(ctx, d) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, d.w, d.h);
    // Black backdrop (so position offsets / opacity reveal black, like Premiere)
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, d.w, d.h);

    ctx.save();
    ctx.filter = filterStr();
    ctx.globalAlpha = Math.max(0, Math.min(1, st.opacity / 100));
    // Center, apply position offset (scaled to output), rotate (90° + fine), flip, scale (zoom)
    const offScale = d.w / (vwrap.clientWidth || d.w);
    ctx.translate(d.w / 2 + st.posX * offScale, d.h / 2 + st.posY * offScale);
    ctx.rotate((st.rot + st.rotFine) * Math.PI / 180);
    ctx.scale((st.flipH ? -1 : 1) * (st.scale / 100), (st.flipV ? -1 : 1) * (st.scale / 100));
    // Draw the cropped sub-rect of the source into the (un-rotated) crop box.
    const dw = (st.rot % 180) ? d.h : d.w, dh = (st.rot % 180) ? d.w : d.h;
    ctx.drawImage(video, d.sx, d.sy, d.sw, d.sh, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();

    // ---- Per-pixel Lumetri pass (export-grade tone/colour) ----
    if (needsPixelPass()) { try { pixelPass(ctx, d); } catch (e) {} }

    // ---- Fade in / out (Dip to Black) ----
    const fa = fadeAlpha(video.currentTime);
    if (fa > 0) { ctx.globalAlpha = fa; ctx.fillStyle = "#000"; ctx.fillRect(0, 0, d.w, d.h); ctx.globalAlpha = 1; }

    // ---- Title / text overlay ----
    if (st.title) drawTitle(ctx, d);

    ctx.restore();
  }

  // Returns black-overlay alpha [0..1] for the current time within the clip.
  function fadeAlpha(t) {
    let a = 0;
    if (st.fadeIn > 0 && t < st.in + st.fadeIn) a = Math.max(a, 1 - (t - st.in) / st.fadeIn);
    if (st.fadeOut > 0 && t > st.out - st.fadeOut) a = Math.max(a, 1 - (st.out - t) / st.fadeOut);
    return Math.max(0, Math.min(1, a));
  }

  function drawTitle(ctx, d) {
    const px = Math.round(d.h * (st.titleSize / 100));
    if (px < 4) return;
    ctx.save();
    ctx.font = `600 ${px}px -apple-system, "SF Pro Text", "Segoe UI", system-ui, sans-serif`;
    ctx.textBaseline = "middle";
    ctx.textAlign = st.titleAlign;
    const x = d.w * (st.titleX / 100);
    const y = d.h * (st.titleY / 100);
    if (st.titleBar) {
      const m = ctx.measureText(st.title);
      const padX = px * 0.5, padY = px * 0.35;
      let bx;
      if (st.titleAlign === "left") bx = x - padX;
      else if (st.titleAlign === "right") bx = x - m.width - padX;
      else bx = x - m.width / 2 - padX;
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(bx, y - px / 2 - padY, m.width + padX * 2, px + padY * 2);
    }
    ctx.fillStyle = st.titleColor;
    ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = px * 0.12;
    ctx.fillText(st.title, x, y);
    ctx.restore();
  }

  // Per-pixel colour pass: exposure/highlights/shadows/whites/blacks, temp/tint,
  // vibrance, sharpen. Applied on top of the CSS-filter (brightness/contrast/sat/hue)
  // already baked by drawImage. Kept O(pixels); used on export + (light) preview.
  function pixelPass(ctx, d) {
    const img = ctx.getImageData(0, 0, d.w, d.h);
    const a = img.data;
    const exposure = st.exposure / 100, hi = st.highlights / 100, sh = st.shadows / 100;
    const wh = st.whites / 100, bl = st.blacks / 100;
    const temp = st.temperature / 100, tint = st.tint / 100, vib = st.vibrance / 100;
    for (let i = 0; i < a.length; i += 4) {
      let r = a[i], g = a[i + 1], b = a[i + 2];
      // exposure (multiplicative)
      if (exposure) { const m = 1 + exposure; r *= m; g *= m; b *= m; }
      // temperature (warm +R/-B), tint (+magenta R&B / -green G)
      if (temp) { r += temp * 40; b -= temp * 40; }
      if (tint) { r += tint * 18; b += tint * 18; g -= tint * 18; }
      // luma-weighted tone controls
      const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      if (hi) { const w = l * l; const add = hi * 70 * w; r += add; g += add; b += add; }
      if (sh) { const w = (1 - l) * (1 - l); const add = sh * 70 * w; r += add; g += add; b += add; }
      if (wh) { const w = Math.max(0, l - 0.5) * 2; const add = wh * 60 * w; r += add; g += add; b += add; }
      if (bl) { const w = Math.max(0, 0.5 - l) * 2; const add = bl * 60 * w; r += add; g += add; b += add; }
      // vibrance: boost saturation more for less-saturated pixels
      if (vib) {
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        const sat = mx === 0 ? 0 : (mx - mn) / mx;
        const amt = vib * (1 - sat);
        const avg = (r + g + b) / 3;
        r += (r - avg) * amt; g += (g - avg) * amt; b += (b - avg) * amt;
      }
      a[i] = r < 0 ? 0 : r > 255 ? 255 : r;
      a[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
      a[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
    }
    ctx.putImageData(img, 0, 0);
    if (st.sharpen) sharpenPass(ctx, d, img, st.sharpen / 100);
  }

  // Simple unsharp-ish 3x3 convolution; amount 0..1.
  function sharpenPass(ctx, d, srcImg, amount) {
    const src = srcImg.data, w = d.w, h = d.h;
    const out = ctx.createImageData(w, h), o = out.data;
    const k = amount; // center weight 1 + 4k, neighbours -k
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
          o[idx] = src[idx]; o[idx + 1] = src[idx + 1]; o[idx + 2] = src[idx + 2]; o[idx + 3] = src[idx + 3];
          continue;
        }
        for (let c = 0; c < 3; c++) {
          const center = src[idx + c];
          const sum = (1 + 4 * k) * center
            - k * src[idx - 4 + c] - k * src[idx + 4 + c]
            - k * src[idx - w * 4 + c] - k * src[idx + w * 4 + c];
          o[idx + c] = sum < 0 ? 0 : sum > 255 ? 255 : sum;
        }
        o[idx + 3] = src[idx + 3];
      }
    }
    ctx.putImageData(out, 0, 0);
  }

  // ============================================================
  //  Export
  // ============================================================
  let exporting = false;
  $("#panelToggle").innerHTML = G.icon("sliders");
  $("#panelToggle").addEventListener("click", () => $("#panel").classList.toggle("open"));
  $("#sheetHandle").addEventListener("click", () => $("#panel").classList.remove("open"));

  $("#exportBtn").addEventListener("click", () => {
    if (!loaded) return;
    const html = `
      <h3>Export video</h3>
      <p class="muted" style="margin:6px 0 14px">Rendered on your device. The trimmed clip is <b>${fmt((st.out - st.in) / st.speed)}</b>.</p>
      <div class="segmented" id="exTab" style="margin-bottom:16px">
        <button data-tab="light" aria-pressed="true">Instant</button>
        <button data-tab="power" aria-pressed="false">Power (MP4 / GIF)</button>
      </div>
      <div id="tab-light">
        <span class="field-label" style="display:block;margin-bottom:8px">What to export</span>
        <div class="chips" id="liteFmt" style="margin-bottom:14px">
          <button class="chip" data-fmt="video" aria-pressed="true">Trimmed video</button>
          <button class="chip" data-fmt="frames">Frame sequence (.zip)</button>
          <button class="chip" data-fmt="frame">Current frame (.png)</button>
        </div>
        <label class="field" id="fpsField" style="margin-bottom:6px"><span class="field-label">Frame rate <span class="val"><span id="fpsV">30</span> fps</span></span><input type="range" id="fps" min="6" max="60" value="30"></label>
        <p class="muted" style="font-size:var(--fs-13);margin-top:10px">Instant export records in real time using built-in browser tools — works on every device. Format is chosen automatically (WebM, or MP4 on Safari).</p>
      </div>
      <div id="tab-power" style="display:none">
        <span class="field-label" style="display:block;margin-bottom:8px">Format</span>
        <div class="chips" id="powFmt" style="margin-bottom:14px">
          <button class="chip" data-fmt="mp4" aria-pressed="true">MP4</button>
          <button class="chip" data-fmt="gif">GIF</button>
          <button class="chip" data-fmt="mov">MOV</button>
          <button class="chip" data-fmt="webm">WebM</button>
        </div>
        <p class="muted" style="font-size:var(--fs-13)">Power export loads a video engine (~25&nbsp;MB) from a public CDN the first time you use it, then converts entirely on-device. Best on desktop and newer phones.</p>
      </div>
      <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="exGo">Export</button></div>`;
    const m = G.modal(html);
    let tab = "light", liteFmt = "video", powFmt = "mp4";
    m.el.querySelectorAll("#exTab button").forEach((b) => b.addEventListener("click", () => {
      m.el.querySelectorAll("#exTab button").forEach((x) => x.setAttribute("aria-pressed", "false"));
      b.setAttribute("aria-pressed", "true"); tab = b.dataset.tab;
      m.el.querySelector("#tab-light").style.display = tab === "light" ? "" : "none";
      m.el.querySelector("#tab-power").style.display = tab === "power" ? "" : "none";
    }));
    m.el.querySelectorAll("#liteFmt .chip").forEach((c) => c.addEventListener("click", () => { m.el.querySelectorAll("#liteFmt .chip").forEach((x) => x.setAttribute("aria-pressed", "false")); c.setAttribute("aria-pressed", "true"); liteFmt = c.dataset.fmt; }));
    m.el.querySelectorAll("#powFmt .chip").forEach((c) => c.addEventListener("click", () => { m.el.querySelectorAll("#powFmt .chip").forEach((x) => x.setAttribute("aria-pressed", "false")); c.setAttribute("aria-pressed", "true"); powFmt = c.dataset.fmt; }));
    m.el.querySelector("#fps").addEventListener("input", (e) => m.el.querySelector("#fpsV").textContent = e.target.value);
    m.el.querySelector("#exGo").addEventListener("click", () => {
      const fps = +m.el.querySelector("#fps").value;
      m.close();
      if (tab === "light") {
        if (liteFmt === "frame") exportFrame();
        else if (liteFmt === "frames") exportFrames(fps);
        else if (st.reverse) exportRecordingReverse(fps);
        else exportRecording(fps);
      } else exportPower(powFmt);
    });
  });

  // ---- Current frame ----
  function exportFrame() {
    const d = outDims(); const c = document.createElement("canvas"); c.width = d.w; c.height = d.h;
    drawFrame(c.getContext("2d"), d);
    c.toBlob((b) => { G.export.download(b, "glaze-frame.png"); G.toast("Frame saved"); }, "image/png");
  }

  // ---- Frame sequence ----
  async function exportFrames(fps) {
    const d = outDims(); const c = document.createElement("canvas"); c.width = d.w; c.height = d.h; const ctx = c.getContext("2d");
    const total = st.out - st.in; const count = Math.min(Math.ceil(total * Math.min(fps, 15)), 150);
    const prog = progressModal("Capturing frames");
    video.pause();
    const files = [];
    for (let i = 0; i < count; i++) {
      if (prog.cancelled) { prog.close(); return; }
      const frac = st.reverse ? (count - 1 - i) / count : i / count;
      const t = st.in + total * frac;
      await seekP(t);
      drawFrame(ctx, d);
      const blob = await new Promise((r) => c.toBlob(r, "image/png"));
      files.push({ name: "frame_" + String(i).padStart(4, "0") + ".png", data: new Uint8Array(await blob.arrayBuffer()) });
      prog.set((i + 1) / count);
    }
    prog.close();
    G.export.download(G.export.zip(files), "glaze-frames.zip");
    G.toast(count + " frames saved");
  }
  function seekP(t) { return new Promise((res) => { const on = () => { video.removeEventListener("seeked", on); res(); }; video.addEventListener("seeked", on); video.currentTime = t; }); }

  // ---- Real-time recording (WebM/MP4) ----
  async function exportRecording(fps) {
    const types = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"];
    const mime = types.find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t));
    if (!mime) { G.toast("Recording isn't supported here — try frame sequence"); return; }
    const ext = mime.indexOf("mp4") >= 0 ? "mp4" : "webm";
    const d = outDims(); const c = document.createElement("canvas"); c.width = d.w; c.height = d.h; const ctx = c.getContext("2d");
    if (!c.captureStream) { G.toast("Recording isn't supported here — try frame sequence"); return; }

    await seekP(st.in);
    let stream;
    try { stream = c.captureStream(fps); } catch (e) { G.toast("Recording isn't supported here — try frame sequence"); return; }
    if (!st.mute) {
      try {
        const vs = video.captureStream ? video.captureStream() : (video.mozCaptureStream ? video.mozCaptureStream() : null);
        const a = vs && vs.getAudioTracks && vs.getAudioTracks()[0];
        if (a) stream.addTrack(a);
      } catch (e) {}
    }
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

    exporting = true;
    const prog = progressModal("Recording clip", true);
    video.playbackRate = st.speed; video.muted = st.mute;
    const total = st.out - st.in;

    let stopped = false;
    function finish() {
      if (stopped) return; stopped = true;
      try { rec.stop(); } catch (e) {}
      video.pause(); exporting = false;
    }
    rec.onstop = () => {
      prog.close();
      G.export.download(new Blob(chunks, { type: mime }), "glaze-video." + ext);
      G.toast("Saved glaze-video." + ext);
      setMute(st.mute);
    };
    prog.onCancel = () => { finish(); prog.close(); exporting = false; };

    rec.start(200);
    try { await video.play(); }
    catch (e) { finish(); prog.close(); exporting = false; G.toast("Tap play once, then export"); return; }
    function step() {
      if (stopped) return;
      drawFrame(ctx, d);
      prog.set(Math.min(1, (video.currentTime - st.in) / total));
      if (video.currentTime >= st.out - 0.02 || video.ended) { finish(); return; }
      if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(step);
      else requestAnimationFrame(step);
    }
    if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(step); else requestAnimationFrame(step);
  }

  // ---- Power export (ffmpeg.wasm) ----
  async function exportPower(fmt) {
    if (!file) return;
    const prog = progressModal("Loading video engine…");
    try {
      const mod = await import("./assets/video-power.js");
      const params = {
        in: st.in, out: st.out, speed: st.speed, mute: st.mute,
        rot: st.rot, rotFine: st.rotFine, flipH: st.flipH, flipV: st.flipV,
        scale: st.scale, posX: st.posX, posY: st.posY, opacity: st.opacity,
        crop: { ...st.crop },
        brightness: st.brightness, contrast: st.contrast, saturation: st.saturation,
        exposure: st.exposure, temperature: st.temperature, tint: st.tint,
        fadeIn: st.fadeIn, fadeOut: st.fadeOut,
        volume: st.volume, aFadeIn: st.aFadeIn, aFadeOut: st.aFadeOut,
        reverse: st.reverse, hasTitle: !!st.title,
        fmt,
      };
      prog.label("Converting on your device…");
      const blob = await mod.convert(file, params, (p) => prog.set(p));
      prog.close();
      G.export.download(blob, "glaze-video." + fmt);
      if (st.title) G.toast("Saved — note: titles are baked only in Instant export");
      else G.toast("Saved glaze-video." + fmt);
    } catch (e) {
      prog.close();
      console.error(e);
      G.toast("Power engine unavailable — use Instant export instead");
    }
  }

  // ---- Progress modal ----
  function progressModal(label, cancelable) {
    const m = G.modal(`<h3 id="pgL">${label}</h3>
      <div style="height:8px;border-radius:4px;background:var(--fill-soft-2);overflow:hidden;margin:18px 0 6px"><div id="pgBar" style="height:100%;width:0;background:var(--ink);transition:width .15s"></div></div>
      <div class="muted tabnum" id="pgPct" style="font-size:var(--fs-13)">0%</div>
      ${cancelable ? '<div class="modal-actions"><button class="btn" id="pgCancel">Cancel</button></div>' : ""}`, { dismissible: false });
    const bar = m.el.querySelector("#pgBar"), pct = m.el.querySelector("#pgPct");
    const api = {
      cancelled: false, onCancel: null,
      set: (v) => { const p = Math.round(Math.max(0, Math.min(1, v)) * 100); bar.style.width = p + "%"; pct.textContent = p + "%"; },
      label: (t) => m.el.querySelector("#pgL").textContent = t,
      close: () => m.close(),
    };
    if (cancelable) m.el.querySelector("#pgCancel").addEventListener("click", () => { api.cancelled = true; if (api.onCancel) api.onCancel(); });
    return api;
  }

  // boot
  setMute(false);
})();
