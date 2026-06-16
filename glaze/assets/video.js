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
  const track = $("#track"), sel = $("#sel"), playhead = $("#playhead"), hIn = $("#hIn"), hOut = $("#hOut");

  const st = { dur: 0, in: 0, out: 0, speed: 1, mute: false, rot: 0, flipH: false, flipV: false,
    brightness: 0, contrast: 0, saturation: 0 };
  let file = null, loaded = false;

  // ---- Adjustments ----
  const ADJ = [
    { k: "brightness", label: "Brightness" },
    { k: "contrast", label: "Contrast" },
    { k: "saturation", label: "Saturation" },
  ];
  const adjWrap = $("#adjustControls");
  ADJ.forEach((a) => {
    const l = document.createElement("label"); l.className = "field";
    l.innerHTML = `<span class="field-label">${a.label} <span class="val"><span id="v-${a.k}">0</span></span></span><input type="range" id="s-${a.k}" min="-100" max="100" value="0">`;
    adjWrap.appendChild(l);
    const inp = l.querySelector("input");
    inp.addEventListener("input", () => { st[a.k] = +inp.value; $("#v-" + a.k).textContent = inp.value; applyPreview(); });
  });
  $("#resetAdjust").addEventListener("click", () => { ADJ.forEach((a) => { st[a.k] = 0; $("#s-" + a.k).value = 0; $("#v-" + a.k).textContent = "0"; }); applyPreview(); });

  function filterStr() {
    return `brightness(${(1 + st.brightness / 100).toFixed(3)}) contrast(${(1 + st.contrast / 100).toFixed(3)}) saturate(${Math.max(0, 1 + st.saturation / 100).toFixed(3)})`;
  }
  function applyPreview() {
    video.style.filter = filterStr();
    video.style.transform = `rotate(${st.rot}deg) scale(${st.flipH ? -1 : 1}, ${st.flipV ? -1 : 1})`;
  }

  // ---- Transform ----
  $("#rotR").innerHTML = G.icon("rotate");
  $("#flipH").innerHTML = G.icon("flipH");
  $("#flipV").innerHTML = G.icon("flipV");
  $("#rotR").addEventListener("click", () => { st.rot = (st.rot + 90) % 360; applyPreview(); });
  $("#flipH").addEventListener("click", () => { st.flipH = !st.flipH; applyPreview(); });
  $("#flipV").addEventListener("click", () => { st.flipV = !st.flipV; applyPreview(); });

  // ---- Audio ----
  $("#muteBtn").innerHTML = G.icon("sound");
  function setMute(m) { st.mute = m; video.muted = m; $("#muteChk").checked = m; $("#muteBtn").innerHTML = G.icon(m ? "mute" : "sound"); }
  $("#muteBtn").addEventListener("click", () => setMute(!st.mute));
  $("#muteChk").addEventListener("change", (e) => setMute(e.target.checked));

  // ---- Speed ----
  $("#speed").addEventListener("change", (e) => { st.speed = +e.target.value; video.playbackRate = st.speed; });

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
    drop.classList.add("hidden"); video.style.display = "block"; transport.classList.remove("hidden");
    $("#exportBtn").disabled = false;
    $("#docName").textContent = video.videoWidth + " × " + video.videoHeight + " · " + fmt(st.dur);
    applyPreview(); layoutTrack(); updateTime();
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
  function outDims() {
    const vw = video.videoWidth, vh = video.videoHeight;
    return (st.rot % 180) ? { w: vh, h: vw, vw, vh } : { w: vw, h: vh, vw, vh };
  }
  function drawFrame(ctx, d) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, d.w, d.h);
    ctx.filter = filterStr();
    ctx.translate(d.w / 2, d.h / 2);
    ctx.rotate(st.rot * Math.PI / 180);
    ctx.scale(st.flipH ? -1 : 1, st.flipV ? -1 : 1);
    ctx.drawImage(video, -d.vw / 2, -d.vh / 2, d.vw, d.vh);
    ctx.restore();
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
      const t = st.in + (total * i) / count;
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
        rot: st.rot, flipH: st.flipH, flipV: st.flipV,
        brightness: st.brightness, contrast: st.contrast, saturation: st.saturation,
        fmt,
      };
      prog.label("Converting on your device…");
      const blob = await mod.convert(file, params, (p) => prog.set(p));
      prog.close();
      G.export.download(blob, "glaze-video." + fmt);
      G.toast("Saved glaze-video." + fmt);
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
