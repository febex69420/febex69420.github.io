// landing.js — cinematic scroll. A single node grows into a whole brain as the
// user scrolls: nodes fade in, edges draw, clusters bloom, the camera glides.

export function initLanding({ canvas, scenes, onEnter }) {
  const ctx = canvas.getContext('2d');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W, H, DPR = Math.min(devicePixelRatio || 1, 2);

  function resize() {
    W = innerWidth; H = innerHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  resize(); addEventListener('resize', resize);

  // Build a layered brain: a few clusters of nodes that appear in scroll order.
  const COLORS = ['#6ea8ff', '#b388ff', '#5ff0c8', '#ff8bd1', '#ffce6e', '#7be0ff'];
  const N = reduce ? 90 : 260;
  const nodes = [];
  const clusters = 6;
  for (let i = 0; i < N; i++) {
    const c = i % clusters;
    const ca = (c / clusters) * Math.PI * 2;
    const cr = 230 + (c % 2) * 90;
    const cx = Math.cos(ca) * cr, cy = Math.sin(ca) * cr;
    const a = Math.random() * Math.PI * 2, r = Math.random() * 150;
    nodes.push({
      x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r,
      z: Math.random(), color: COLORS[c],
      // appear threshold: distributed so nodes reveal progressively across scroll
      appear: i === 0 ? 0 : 0.08 + Math.pow(i / N, 0.8) * 0.8,
      seed: Math.random() * 1000, cluster: c,
    });
  }
  const edges = [];
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const a = nodes[i], b = nodes[j];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const sameC = a.cluster === b.cluster;
      if ((sameC && d < 150 && Math.random() < 0.5) || (!sameC && d < 90 && Math.random() < 0.05)) {
        edges.push({ a: i, b: j, appear: Math.max(a.appear, b.appear) + 0.02 });
      }
    }
  }

  let progress = 0;          // 0..1 overall scroll
  let target = 0;
  function onScroll() {
    const max = document.body.scrollHeight - innerHeight;
    target = max > 0 ? Math.min(1, scrollY / max) : 0;
    // scene reveal
    scenes.forEach((s) => {
      const r = s.getBoundingClientRect();
      const vis = r.top < innerHeight * 0.7 && r.bottom > innerHeight * 0.3;
      s.classList.toggle('in', vis);
    });
    const hint = document.querySelector('.scroll-hint');
    if (hint) hint.style.opacity = target > 0.05 ? '0' : '0.8';
  }
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  function frame(t) {
    progress += (target - progress) * (reduce ? 1 : 0.07);
    ctx.fillStyle = '#05060c';
    ctx.fillRect(0, 0, W, H);

    // camera: zoom out + drift as the brain grows
    const zoom = 1.5 - progress * 1.0;        // start close on the first node
    const camX = Math.sin(progress * Math.PI) * 60;
    const camY = -progress * 40;
    const cx = W / 2 - camX, cy = H / 2 - camY;
    const proj = (n) => {
      const dz = 0.7 + n.z * 0.6;
      return { x: cx + n.x * zoom * dz, y: cy + n.y * zoom * dz, dz };
    };

    // edges
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = 0.6;
    for (const e of edges) {
      const reveal = (progress - e.appear) / 0.12;
      if (reveal <= 0) continue;
      const a = proj(nodes[e.a]), b = proj(nodes[e.b]);
      ctx.strokeStyle = `rgba(120,160,255,${Math.min(0.35, reveal * 0.22)})`;
      ctx.beginPath(); ctx.moveTo(a.x, a.y);
      // animate the line drawing in
      const k = Math.min(1, reveal);
      ctx.lineTo(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k);
      ctx.stroke();
    }

    // nodes
    for (const n of nodes) {
      const reveal = (progress - n.appear) / 0.06;
      if (reveal <= 0 && n.appear > 0) continue;
      const k = n.appear === 0 ? 1 : Math.min(1, reveal);
      const p = proj(n);
      const pulse = 1 + 0.15 * Math.sin(t * 0.002 + n.seed);
      const baseR = (n.appear === 0 ? 9 : 2.4 + n.z * 2.6) * zoom * p.dz * k * pulse;
      const glow = baseR * 4;
      const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glow);
      grd.addColorStop(0, n.color);
      grd.addColorStop(0.3, n.color + 'aa');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.5 * k * (0.5 + n.z * 0.5);
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(p.x, p.y, glow, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = k;
      ctx.fillStyle = '#eaf0ff';
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.8, baseR * 0.5), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return { enter: onEnter };
}
