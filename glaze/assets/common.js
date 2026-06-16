/* ============================================================
   Glaze — shared runtime
   Theme, icons, toasts, modals, privacy notice, export encoders.
   100% client-side. No cookies, no localStorage, no network beacons.
   ============================================================ */
(function () {
  "use strict";

  const Glaze = (window.Glaze = window.Glaze || {});

  /* ---------------- Icons (Lucide-style, monochrome SVG) ---------------- */
  const ICONS = {
    brush: '<path d="m9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08"/><path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z"/>',
    pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
    eraser: '<path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/>',
    highlighter: '<path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>',
    spray: '<path d="M3 3h.01"/><path d="M7 5h.01"/><path d="M11 7h.01"/><path d="M3 7h.01"/><path d="M7 9h.01"/><path d="M3 11h.01"/><rect width="4" height="4" x="15" y="5"/><path d="M6 9h6a3 3 0 0 1 3 3v8a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1z"/>',
    bucket: '<path d="m19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2a2 2 0 0 0 2.8 0L19 11Z"/><path d="m5 2 5 5"/><path d="M2 13h15"/><path d="M22 20a2 2 0 1 1-4 0c0-1.6 1.7-2.4 2-4 .3 1.6 2 2.4 2 4Z"/>',
    pipette: '<path d="m2 22 1-1h3l9-9"/><path d="M3 21v-3l9-9"/><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z"/>',
    square: '<rect width="18" height="18" x="3" y="3" rx="2"/>',
    circle: '<circle cx="12" cy="12" r="9"/>',
    line: '<path d="M5 19 19 5"/>',
    cube: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
    undo: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    redo: '<path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
    image: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
    video: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18"/><path d="M3 7.5h4"/><path d="M3 12h18"/><path d="M3 16.5h4"/><path d="M17 3v18"/><path d="M17 7.5h4"/><path d="M17 16.5h4"/>',
    palette: '<circle cx="13.5" cy="6.5" r=".7" fill="currentColor" stroke="none"/><circle cx="17.5" cy="10.5" r=".7" fill="currentColor" stroke="none"/><circle cx="8.5" cy="7.5" r=".7" fill="currentColor" stroke="none"/><circle cx="6.5" cy="12.5" r=".7" fill="currentColor" stroke="none"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    crop: '<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/>',
    sliders: '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
    rotate: '<path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>',
    flipH: '<path d="M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3"/><path d="M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3"/><path d="M12 20v2"/><path d="M12 14v2"/><path d="M12 8v2"/><path d="M12 2v2"/>',
    flipV: '<path d="M21 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v3"/><path d="M21 16v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3"/><path d="M4 12H2"/><path d="M10 12H8"/><path d="M16 12h-2"/><path d="M22 12h-2"/>',
    type: '<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" x2="15" y1="20" y2="20"/><line x1="12" x2="12" y1="4" y2="20"/>',
    play: '<polygon points="6 3 20 12 6 21 6 3"/>',
    pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
    scissors: '<circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    minus: '<path d="M5 12h14"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
    home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    move: '<polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" x2="22" y1="12" y2="12"/><line x1="12" x2="12" y1="2" y2="22"/>',
    layers: '<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
    sparkles: '<path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0L14.06 8.5A2 2 0 0 0 15.5 9.94l6.14 1.58a.5.5 0 0 1 0 .96L15.5 14.06a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0z"/>',
    maximize: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
    mute: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/>',
    sound: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
    gauge: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
    grid: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/><path d="M15 3v18"/>',
    contrast: '<circle cx="12" cy="12" r="10"/><path d="M12 18a6 6 0 0 0 0-12v12z"/>',
    star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    arrowRight: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  };

  Glaze.icon = function (name, size) {
    const inner = ICONS[name] || "";
    const s = size || 24;
    return `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
  };

  /* ---------------- Theme (system-driven, session-only toggle) ---------------- */
  // We intentionally do NOT persist the choice — no storage of any kind.
  Glaze.initTheme = function () {
    const btn = document.querySelector("[data-theme-toggle]");
    function current() {
      const set = document.documentElement.getAttribute("data-theme");
      if (set) return set;
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    function render() {
      if (!btn) return;
      const dark = current() === "dark";
      btn.innerHTML = Glaze.icon(dark ? "sun" : "moon");
      btn.setAttribute("aria-label", dark ? "Switch to light appearance" : "Switch to dark appearance");
      btn.title = dark ? "Light appearance" : "Dark appearance";
    }
    if (btn) {
      btn.addEventListener("click", () => {
        document.documentElement.setAttribute("data-theme", current() === "dark" ? "light" : "dark");
        render();
      });
    }
    render();
  };

  /* ---------------- Toast ---------------- */
  let toastWrap;
  Glaze.toast = function (msg, ms) {
    if (!toastWrap) {
      toastWrap = document.createElement("div");
      toastWrap.className = "toast-wrap";
      toastWrap.setAttribute("aria-live", "polite");
      document.body.appendChild(toastWrap);
    }
    const t = document.createElement("div");
    t.className = "toast";
    t.innerHTML = Glaze.icon("check", 18) + "<span></span>";
    t.querySelector("span").textContent = msg;
    toastWrap.appendChild(t);
    setTimeout(() => {
      t.style.transition = "opacity .25s, transform .25s";
      t.style.opacity = "0";
      t.style.transform = "translateY(10px)";
      setTimeout(() => t.remove(), 280);
    }, ms || 2600);
  };

  /* ---------------- Modal ---------------- */
  Glaze.modal = function (html, opts) {
    opts = opts || {};
    const scrim = document.createElement("div");
    scrim.className = "scrim";
    const box = document.createElement("div");
    box.className = "modal glass-strong glass";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.innerHTML = html;
    scrim.appendChild(box);
    document.body.appendChild(scrim);
    function close() {
      scrim.style.transition = "opacity .2s";
      scrim.style.opacity = "0";
      setTimeout(() => scrim.remove(), 200);
      document.removeEventListener("keydown", onKey);
      if (opts.onClose) opts.onClose();
    }
    function onKey(e) { if (e.key === "Escape") close(); }
    scrim.addEventListener("click", (e) => { if (e.target === scrim && opts.dismissible !== false) close(); });
    document.addEventListener("keydown", onKey);
    box.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", close));
    const focusable = box.querySelector("button, a, input, select, textarea");
    if (focusable) focusable.focus();
    return { el: box, close };
  };

  /* ---------------- Privacy notice (auto-dismiss, never stored) ---------------- */
  Glaze.privacyNote = function () {
    const note = document.createElement("div");
    note.className = "privacy-note glass";
    note.setAttribute("role", "status");
    note.innerHTML =
      Glaze.icon("shield", 18) +
      '<span>Everything runs in your browser. No uploads, no cookies, no storage. Your files never leave this device. ' +
      '<a href="privacy.html">How it works</a>.</span>' +
      '<button class="icon-btn x" aria-label="Dismiss">' + Glaze.icon("x", 18) + "</button>";
    document.body.appendChild(note);
    function hide() {
      note.style.transition = "opacity .3s, transform .3s";
      note.style.opacity = "0";
      note.style.transform = "translate(-50%, 14px)";
      setTimeout(() => note.remove(), 320);
    }
    note.querySelector(".x").addEventListener("click", hide);
    setTimeout(hide, 8000);
  };

  /* ---------------- File helpers ---------------- */
  Glaze.pickFile = function (accept) {
    return new Promise((resolve) => {
      const inp = document.createElement("input");
      inp.type = "file";
      inp.accept = accept || "*/*";
      inp.addEventListener("change", () => resolve(inp.files && inp.files[0] ? inp.files[0] : null));
      inp.click();
    });
  };

  Glaze.loadImage = function (src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  };

  Glaze.formatBytes = function (n) {
    if (n < 1024) return n + " B";
    if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
    return (n / 1048576).toFixed(1) + " MB";
  };

  /* ============================================================
     Export encoders — all run locally, output Blobs to download.
     ============================================================ */
  const ex = (Glaze.export = {});

  ex.download = function (blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
  };

  ex.canvasToBlob = function (canvas, type, quality) {
    return new Promise((resolve) => {
      if (canvas.toBlob) canvas.toBlob((b) => resolve(b), type, quality);
      else {
        const data = canvas.toDataURL(type, quality);
        resolve(ex.dataURLToBlob(data));
      }
    });
  };

  ex.dataURLToBlob = function (dataURL) {
    const parts = dataURL.split(",");
    const mime = parts[0].match(/:(.*?);/)[1];
    const bin = atob(parts[1]);
    const len = bin.length;
    const u8 = new Uint8Array(len);
    for (let i = 0; i < len; i++) u8[i] = bin.charCodeAt(i);
    return new Blob([u8], { type: mime });
  };

  // ---- BMP (24-bit, uncompressed) ----
  ex.canvasToBMP = function (canvas) {
    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext("2d");
    const img = ctx.getImageData(0, 0, w, h).data;
    const rowSize = Math.floor((24 * w + 31) / 32) * 4;
    const pixelArraySize = rowSize * h;
    const fileSize = 54 + pixelArraySize;
    const buf = new ArrayBuffer(fileSize);
    const dv = new DataView(buf);
    // BITMAPFILEHEADER
    dv.setUint8(0, 0x42); dv.setUint8(1, 0x4d); // "BM"
    dv.setUint32(2, fileSize, true);
    dv.setUint32(10, 54, true);
    // BITMAPINFOHEADER
    dv.setUint32(14, 40, true);
    dv.setInt32(18, w, true);
    dv.setInt32(22, h, true); // positive = bottom-up
    dv.setUint16(26, 1, true);
    dv.setUint16(28, 24, true);
    dv.setUint32(34, pixelArraySize, true);
    dv.setInt32(38, 2835, true);
    dv.setInt32(42, 2835, true);
    let offset = 54;
    for (let y = h - 1; y >= 0; y--) {
      let rowStart = offset;
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        // blend over white for any alpha (BMP24 has no alpha)
        const a = img[i + 3] / 255;
        const r = Math.round(img[i] * a + 255 * (1 - a));
        const g = Math.round(img[i + 1] * a + 255 * (1 - a));
        const b = Math.round(img[i + 2] * a + 255 * (1 - a));
        dv.setUint8(rowStart, b); dv.setUint8(rowStart + 1, g); dv.setUint8(rowStart + 2, r);
        rowStart += 3;
      }
      offset += rowSize;
    }
    return new Blob([buf], { type: "image/bmp" });
  };

  // ---- SVG wrapper (embeds raster as base64) ----
  ex.canvasToSVG = function (canvas) {
    const w = canvas.width, h = canvas.height;
    const data = canvas.toDataURL("image/png");
    const svg =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ' +
      'width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + " " + h + '">\n' +
      '  <image width="' + w + '" height="' + h + '" xlink:href="' + data + '"/>\n' +
      "</svg>\n";
    return new Blob([svg], { type: "image/svg+xml" });
  };

  // ---- Minimal PDF embedding a JPEG (DCTDecode), single page ----
  ex.canvasToPDF = function (canvas, quality) {
    const w = canvas.width, h = canvas.height;
    const jpegData = ex.dataURLToBlob(canvas.toDataURL("image/jpeg", quality || 0.92));
    return jpegData.arrayBuffer().then((ab) => {
      const jpeg = new Uint8Array(ab);
      const enc = new TextEncoder();
      const chunks = [];
      const offsets = [];
      let length = 0;
      function push(data) {
        const u8 = typeof data === "string" ? enc.encode(data) : data;
        chunks.push(u8); length += u8.length;
      }
      function obj(n, body) { offsets[n] = length; push(n + " 0 obj\n" + body + "\nendobj\n"); }

      push("%PDF-1.4\n%\xFF\xFF\xFF\xFF\n");
      obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
      obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
      obj(3, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + w + " " + h + "] " +
        "/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>");
      // image xobject
      offsets[4] = length;
      push("4 0 obj\n<< /Type /XObject /Subtype /Image /Width " + w + " /Height " + h +
        " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + jpeg.length + " >>\nstream\n");
      push(jpeg);
      push("\nendstream\nendobj\n");
      const content = "q\n" + w + " 0 0 " + h + " 0 0 cm\n/Im0 Do\nQ\n";
      obj(5, "<< /Length " + enc.encode(content).length + " >>\nstream\n" + content + "endstream");

      const xrefPos = length;
      let xref = "xref\n0 6\n0000000000 65535 f \n";
      for (let i = 1; i <= 5; i++) xref += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
      push(xref);
      push("trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n" + xrefPos + "\n%%EOF");
      return new Blob(chunks, { type: "application/pdf" });
    });
  };

  // ---- ZIP (store / no compression) with CRC32 ----
  const crcTable = (function () {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(u8) {
    let c = 0xffffffff;
    for (let i = 0; i < u8.length; i++) c = crcTable[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  // files: [{name, data: Uint8Array}]
  ex.zip = function (files) {
    const enc = new TextEncoder();
    const localParts = [];
    const central = [];
    let offset = 0;
    function u16(n) { return new Uint8Array([n & 255, (n >> 8) & 255]); }
    function u32(n) { return new Uint8Array([n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255]); }
    files.forEach((f) => {
      const nameBytes = enc.encode(f.name);
      const crc = crc32(f.data);
      const size = f.data.length;
      const header = [];
      header.push(u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(size), u32(size), u16(nameBytes.length), u16(0), nameBytes, f.data);
      header.forEach((p) => localParts.push(p));
      const cd = [];
      cd.push(u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(size), u32(size), u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0),
        u32(0), u32(offset), nameBytes);
      central.push({ parts: cd });
      offset += 30 + nameBytes.length + size;
    });
    const centralStart = offset;
    let centralSize = 0;
    const centralParts = [];
    central.forEach((c) => {
      c.parts.forEach((p) => { centralParts.push(p); centralSize += p.length; });
    });
    const end = [u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
      u32(centralSize), u32(centralStart), u16(0)];
    return new Blob([].concat(localParts, centralParts, end), { type: "application/zip" });
  };

  /* ---------------- Lazy script loader (for optional heavy tools) ---------------- */
  const loaded = {};
  Glaze.loadScript = function (src) {
    if (loaded[src]) return loaded[src];
    loaded[src] = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src; s.crossOrigin = "anonymous";
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Failed to load " + src));
      document.head.appendChild(s);
    });
    return loaded[src];
  };

  /* ---------------- Boot ---------------- */
  document.addEventListener("DOMContentLoaded", function () {
    Glaze.initTheme();
    if (!document.body.hasAttribute("data-no-privacy-note")) {
      // delay so it doesn't fight the entrance animation
      setTimeout(Glaze.privacyNote, 1200);
    }
  });
})();
