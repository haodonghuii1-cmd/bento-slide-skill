/* bento-viz.js — Light/Dark tile art as dense, precise data visualization (SKILL.md §7–9).
   Every `.viz[data-chart]` gets one Canvas2D sized to its exact device-pixel box, so marks are never resampled.
   Marks: thousands of dots/ticks batched into Path2D buckets. Labels in canvas use the page's mono font.
   One rAF loop for all charts; it sleeps when nothing is revealing, easing, or breathing.
   Colors come from CSS tokens (--mark, --accent-rgb, --glow, …), so a data-theme switch is a repaint, not a rebuild.
   No dependencies. Console: bentoViz.stats(), bentoViz.settle(), bentoViz.pause(true|false). */
(() => {
  'use strict';
  const root = document.documentElement;
  const RM = matchMedia('(prefers-reduced-motion: reduce)');
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = (t) => 1 - (1 - t) ** 3;
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  const invEaseInOut = (y) => (y < 0.5 ? Math.cbrt(y / 4) : 1 - Math.cbrt(2 * (1 - y)) / 2);
  const num = (s, d = 0) => (s == null || s === '' || Number.isNaN(+s) ? d : +s);
  const list = (s) => (s ? s.split(',').map(Number) : []);
  const hm = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
  const pad2 = (n) => String(n).padStart(2, '0');
  const fmt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}k` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : `${Math.round(n)}`);
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  // seeded PRNG: posters, QA shots and reloads are identical
  function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  // hourly series (24 values, one per hour) → smooth value at fractional hour t
  const hourAt = (H, t) => {
    const x = t - 0.5, i = Math.floor(x), f = x - i;
    return lerp(H[((i % 24) + 24) % 24], H[(((i + 1) % 24) + 24) % 24], (1 - Math.cos(Math.PI * f)) / 2);
  };

  function palette(el) {
    const cs = getComputedStyle(el), v = (n) => cs.getPropertyValue(n).trim();
    return {
      mark: v('--mark'), accent: v('--accent-rgb'), ink: v('--ink'), muted: v('--muted'),
      chip: v('--chip-bg'), k: num(v('--mark-k'), 1), glow: num(v('--glow'), 0.2), blend: v('--glow-blend') || 'lighter',
      mono: v('--mono') || 'monospace',
    };
  }

  /* ---------- drawing primitives ---------- */
  // Dots: per-dot reveal (o = start, w = duration, both in 0..1 of the chart's reveal), batched by color+alpha.
  function paintDots(c, dots, p, alphaOf) {
    const buckets = new Map();
    for (const d of dots) {
      let e = 1;
      if (p < 1) { const l = (p - d.o) / (d.w || 0.16); if (l <= 0) continue; e = l >= 1 ? 1 : easeOut(l); }
      const a = (alphaOf ? alphaOf(d) : d.a) * e;
      if (a < 0.012) continue;
      const r = d.r * (0.35 + 0.65 * e), key = (d.c === 'a' ? 'a' : 'm') + Math.min(48, Math.round(a * 48));
      let path = buckets.get(key);
      if (!path) buckets.set(key, (path = new Path2D()));
      path.moveTo(d.x + r, d.y);
      path.arc(d.x, d.y, r, 0, TAU);
    }
    const { ctx, pal } = c;
    for (const [key, path] of buckets) {
      const acc = key[0] === 'a', a = (+key.slice(1) / 48) * (acc ? 1 : pal.k);
      ctx.fillStyle = `rgba(${acc ? pal.accent : pal.mark}, ${a.toFixed(3)})`;
      ctx.fill(path);
    }
  }
  // Snap a coordinate so a `lw` CSS-px line lands on whole device pixels (crisp hairlines at any DPR).
  const snap = (c, v, lw = 1) => { const d = c.sx, px = Math.max(1, Math.round(lw * d)); return (Math.round(v * d) + (px % 2 ? 0.5 : 0)) / d; };
  function line(c, x1, y1, x2, y2, a, { lw = 1, rgb, dash } = {}) {
    const { ctx } = c;
    if (x1 === x2) x1 = x2 = snap(c, x1, lw);
    if (y1 === y2) y1 = y2 = snap(c, y1, lw);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.lineWidth = Math.max(1, Math.round(lw * c.sx)) / c.sx;
    ctx.strokeStyle = `rgba(${rgb || c.pal.mark}, ${(a * (rgb ? 1 : c.pal.k)).toFixed(3)})`;
    ctx.setLineDash(dash ? dash.map((v) => v * c.cq) : []);
    ctx.stroke(); ctx.setLineDash([]);
  }
  function text(c, s, x, y, { size = 0.56, align = 'left', base = 'middle', color, a = 1 } = {}) {
    const { ctx } = c;
    ctx.font = `500 ${(size * c.cq).toFixed(2)}px ${c.pal.mono}`;
    ctx.textAlign = align; ctx.textBaseline = base;
    ctx.globalAlpha = a; ctx.fillStyle = color || c.pal.muted;
    ctx.fillText(s, x, y); ctx.globalAlpha = 1;
  }
  // Tooltip chip: centered on x, bottom edge at y, kept inside the canvas.
  function chip(c, s, x, y, a = 1) {
    if (a <= 0.01) return;
    const { ctx, cq } = c, fs = 0.54 * cq;
    ctx.font = `500 ${fs.toFixed(2)}px ${c.pal.mono}`;
    const tw = ctx.measureText(s).width, px = 0.42 * cq, h = fs + 0.56 * cq, w = tw + 2 * px;
    const bx = clamp(x - w / 2, 0.5, c.w - w - 0.5), by = Math.max(0.5, y - h);
    ctx.globalAlpha = a;
    ctx.beginPath(); ctx.roundRect(snap(c, bx), snap(c, by), Math.round(w), Math.round(h), 0.3 * cq);
    ctx.fillStyle = c.pal.chip; ctx.fill();
    ctx.lineWidth = 1 / c.sx * Math.max(1, Math.round(c.sx)); ctx.strokeStyle = `rgba(${c.pal.mark}, .16)`; ctx.stroke();
    ctx.globalAlpha = 1;
    text(c, s, bx + px, by + h / 2 + 0.03 * cq, { size: 0.54, color: c.pal.ink, a });
  }
  // The only glow on the slide: accent-colored, gaussian-ish falloff, no hard edge, never white.
  function glow(c, x, y, r, a) {
    if (a <= 0.004) return;
    const { ctx } = c, A = c.pal.accent, g = ctx.createRadialGradient(x, y, 0, x, y, r);
    [[0, 1], [0.18, 0.78], [0.38, 0.42], [0.58, 0.17], [0.78, 0.04], [1, 0]].forEach(([s, k]) => g.addColorStop(s, `rgba(${A}, ${(a * k).toFixed(4)})`));
    ctx.save(); ctx.globalCompositeOperation = c.pal.blend; ctx.fillStyle = g; ctx.fillRect(x - r, y - r, 2 * r, 2 * r); ctx.restore();
  }

  /* ---------- recipes (SKILL.md §7.4) ---------- */
  const RECIPES = {};

  /* Radial dot clock: 24 h on a dial, one radial column of dots per 10-min bin, 1 dot = data-unit.
     Past = bright, future = faint forecast, anomaly bins = accent dots stacked beyond the envelope with the one glow.
     A hand sweeps from 00 to data-now and dots land as it passes. Hover: highlight the hour wedge, read it out. */
  RECIPES['radial-clock'] = {
    dur: 2600, ambient: true, hover: true,
    layout(c) {
      const d = c.el.dataset, H = list(d.hourly), unit = num(d.unit, 1000), scale = num(d.scale, 1000);
      const N = 144, now = hm(d.now || '24:00') / 10, rnd = rng(num(d.seed, 7));
      const S = Math.min(c.w, c.h) / 2, cx = c.w / 2, cy = c.h / 2;
      const r0 = S * 0.4, rStart = S * 0.485, rMax = S * 0.86, rings = num(d.rings, 17), pitch = (rMax - rStart) / (rings - 1);
      const dr = pitch * 0.25, an = d.anomaly ? { b: Math.floor(hm(d.anomaly) / 10), n: list(d.anomalyDots) } : null;
      const nowFrac = now / N, dots = [];
      let gx = 0, gy = 0, gn = 0, tip = 0, aO = 1;
      for (let b = 0; b < N; b++) {
        const th = -Math.PI / 2 + ((b + 0.5) / N) * TAU, cs = Math.cos(th), sn = Math.sin(th);
        let n = Math.round((hourAt(H, (b + 0.5) / 6) * scale / 6) * (1 + (rnd() - 0.5) * 0.14) / unit);
        const past = b < Math.floor(now), cur = b === Math.floor(now), g = Math.floor(b / 6);
        if (cur) n = Math.max(1, Math.round(n * (now % 1)));
        // the dot lands when the eased hand passes its angle
        const o = past || cur ? invEaseInOut(clamp((b + 0.5) / N / nowFrac)) * 0.6 : 0;
        for (let k = 0; k < n; k++) {
          const r = rStart + k * pitch, tt = n > 1 ? k / (n - 1) : 0;
          if (past || cur) dots.push({ x: cx + cs * r, y: cy + sn * r, r: dr, a: 0.95 - 0.5 * tt ** 1.5, o: o + k * 0.004, w: 0.14, g, c: 'm' });
          else dots.push({ x: cx + cs * r, y: cy + sn * r, r: dr * 0.82, a: 0.17, o: 0.66 + ((b - now) / (N - now)) * 0.14 + k * 0.002, w: 0.2, g, c: 'm' });
        }
        const j = an ? b - an.b + Math.floor(an.n.length / 2) : -1;
        if (an && j >= 0 && j < an.n.length) {
          for (let k = 0; k < an.n[j]; k++) {
            const r = rStart + (n + k) * pitch, x = cx + cs * r, y = cy + sn * r;
            dots.push({ x, y, r: dr * 1.06, a: 1 - 0.32 * (k / an.n[j]), o: o + 0.05 + k * 0.012, w: 0.16, g, c: 'a' });
            gx += x; gy += y; gn++; tip = Math.max(tip, n + k);
          }
          aO = Math.min(aO, o + 0.05);
        }
      }
      const gMax = new Array(24).fill(rStart);
      for (const d of dots) gMax[d.g] = Math.max(gMax[d.g], Math.hypot(d.x - cx, d.y - cy));
      const thA = an ? -Math.PI / 2 + ((an.b + 0.5) / N) * TAU : 0;
      return { S, cx, cy, r0, rStart, rMax, pitch, dots, gMax, H, scale, unit, now, N, an, aO, thA,
        glow: gn ? { x: gx / gn, y: gy / gn } : null, tipR: rStart + tip * pitch, thNow: -Math.PI / 2 + nowFrac * TAU };
    },
    hover(c, m, x, y) {
      const dx = x - m.cx, dy = y - m.cy, rho = Math.hypot(dx, dy);
      if (rho < m.r0 * 0.6 || rho > m.rMax + m.S * 0.08) return null;
      return Math.floor((((Math.atan2(dy, dx) + Math.PI / 2 + TAU) % TAU) / TAU) * 24) % 24;
    },
    readout(c, m, g) {
      const span = `${pad2(g)}–${pad2((g + 1) % 24)} h`, v = fmt(m.H[g] * m.scale);
      if (m.an && Math.floor((m.an.b * 10) / 60) === g) return `${span} · ${v} + ${fmt(m.an.n.reduce((s, n) => s + n, 0) * m.unit)} retried`;
      return g * 6 >= m.now ? `${span} · ${v} forecast` : `${span} · ${v} delivered`;
    },
    draw(c, m, { p, t }) {
      const { ctx, pal } = c, { S, cx, cy, r0 } = m, M = pal.mark, hk = c.hk;
      const fade = easeOut(clamp(p / 0.25));
      // inner disk + fine tick ring
      ctx.globalAlpha = fade;
      const g = ctx.createRadialGradient(cx, cy - r0 * 0.3, 0, cx, cy, r0);
      g.addColorStop(0, `rgba(${M}, ${0.05 * pal.k})`); g.addColorStop(1, `rgba(${M}, ${0.014 * pal.k})`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r0, 0, TAU); ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = `rgba(${M}, ${0.13 * pal.k})`; ctx.stroke();
      for (let q = 0; q < 96; q++) {
        const th = -Math.PI / 2 + (q / 96) * TAU, cs = Math.cos(th), sn = Math.sin(th);
        if (q % 4) { const r = r0 - S * 0.04; ctx.beginPath(); ctx.arc(cx + cs * r, cy + sn * r, 0.035 * c.cq, 0, TAU); ctx.fillStyle = `rgba(${M}, ${0.22 * pal.k})`; ctx.fill(); continue; }
        const major = q % 24 === 0, r1 = r0 - S * (major ? 0.075 : 0.055), r2 = r0 - S * 0.028;
        line(c, cx + cs * r1, cy + sn * r1, cx + cs * r2, cy + sn * r2, major ? 0.55 : 0.26);
      }
      ctx.globalAlpha = 1;
      // hovered hour: a barely-there wedge behind its dots
      for (const [gk, w] of c.hw) {
        if (w * hk < 0.01) continue;
        const a0 = -Math.PI / 2 + (gk / 24) * TAU, a1 = a0 + TAU / 24;
        const ro = m.gMax[gk] + m.pitch * 0.9, wg = ctx.createRadialGradient(cx, cy, r0, cx, cy, ro);
        wg.addColorStop(0, `rgba(${M}, 0)`); wg.addColorStop(0.35, `rgba(${M}, ${(0.04 * w * hk * pal.k).toFixed(3)})`); wg.addColorStop(1, `rgba(${M}, ${(0.015 * w * hk * pal.k).toFixed(3)})`);
        ctx.beginPath(); ctx.arc(cx, cy, ro, a0, a1); ctx.arc(cx, cy, r0 + 2, a1, a0, true); ctx.closePath();
        ctx.fillStyle = wg; ctx.fill();
      }
      // accent glow under the anomaly (fades in with it, breathes ±12% over 9 s)
      if (m.glow) {
        const ga = clamp((p - m.aO) / 0.25) * (RM.matches ? 1 : 1 + 0.12 * Math.sin((t * TAU) / 9));
        const gx = lerp(m.cx, m.glow.x, 1.12), gy = lerp(m.cy, m.glow.y, 1.12);
        glow(c, gx, gy, S * 0.26, pal.glow * ga);
      }
      paintDots(c, m.dots, p, hk < 0.005 ? null : (d) => {
        const w = c.hw.get(d.g) || 0;
        return d.a * (1 - 0.45 * hk * (1 - w)) + (1 - d.a) * 0.35 * hk * w;
      });
      // hand: eased sweep 00 → now
      if (p > 0) {
        const th = lerp(-Math.PI / 2, m.thNow, easeInOut(clamp(p / 0.6))), cs = Math.cos(th), sn = Math.sin(th);
        const r1 = r0 + 1, r2 = m.rMax + S * 0.06;
        line(c, cx + cs * r1, cy + sn * r1, cx + cs * r2, cy + sn * r2, 0.62 * fade);
        ctx.beginPath(); ctx.arc(cx + cs * r2, cy + sn * r2, 0.11 * c.cq, 0, TAU);
        ctx.fillStyle = pal.ink; ctx.globalAlpha = fade; ctx.fill(); ctx.globalAlpha = 1;
      }
      // hour labels + anomaly time
      const lr = m.rMax + S * 0.085;
      [['00', 0], ['06', 1], ['12', 2], ['18', 3]].forEach(([s, i]) => {
        const th = -Math.PI / 2 + (i * TAU) / 4;
        text(c, s, cx + Math.cos(th) * lr, cy + Math.sin(th) * lr, { align: 'center', a: fade });
      });
      if (m.an) {
        const r = m.tipR + S * 0.07, x = cx + Math.cos(m.thA) * r, y = cy + Math.sin(m.thA) * r;
        text(c, c.el.dataset.anomaly, x, y, { align: Math.cos(m.thA) >= 0 ? 'left' : 'right', color: `rgb(${pal.accent})`, a: clamp((p - m.aO - 0.1) / 0.2) });
      }
    },
  };

  /* Dot histogram: a distribution as stacked dot columns on a ticked axis, with p50/p95/p99 markers.
     Data: data-bins (counts, left→right over 0..data-max) or a log-normal from data-median + data-p95. */
  RECIPES['dot-histogram'] = {
    dur: 1500, hover: true,
    layout(c) {
      const d = c.el.dataset, cq = c.cq, max = num(d.max, 400), med = num(d.median, 90), p95 = num(d.p95, 180);
      const sig = Math.log(p95 / med) / 1.645, mu = Math.log(med);
      const pitch = num(d.pitch, 0.31) * cq, axisH = 1.55 * cq, top = 1.35 * cq;
      const cols = Math.floor(c.w / pitch), x0 = (c.w - cols * pitch) / 2, bw = max / cols;
      const rowsMax = Math.floor((c.h - axisH - top) / pitch), base = c.h - axisH;
      const pdf = (x) => (x <= 0 ? 0 : Math.exp(-((Math.log(x) - mu) ** 2) / (2 * sig * sig)) / (x * sig * Math.sqrt(TAU)));
      const raw = d.bins ? list(d.bins) : null;
      const dens = Array.from({ length: cols }, (_, i) => (raw ? raw[Math.floor((i / cols) * raw.length)] : pdf((i + 0.5) * bw)));
      const tot = dens.reduce((s, v) => s + v, 0), peak = Math.max(...dens);
      const p99 = Math.exp(mu + 2.326 * sig), dots = [];
      dens.forEach((v, i) => {
        const n = Math.round((v / peak) * rowsMax * 0.92), x = x0 + (i + 0.5) * pitch, val = (i + 0.5) * bw;
        const a0 = val <= med ? 0.92 : val <= p95 ? 0.6 : val <= p99 ? 0.34 : 0.2;
        for (let k = 0; k < n; k++) dots.push({ x, y: base - 0.5 * cq - k * pitch, r: pitch * 0.25, a: a0 * (1 - 0.22 * (k / Math.max(1, n - 1)) ** 2), o: (i / cols) * 0.55 + k * 0.006, w: 0.2, g: i, c: 'm' });
      });
      return { dots, cols, pitch, x0, base, bw, max, top, dens, tot, rows: dens.map((v) => Math.round((v / peak) * rowsMax * 0.92)),
        marks: [['p50', med], ['p95', p95], ['p99', Math.round(p99)]], xOf: (v) => x0 + (v / bw) * pitch };
    },
    hover(c, m, x, y) {
      const i = Math.floor((x - m.x0) / m.pitch);
      return i >= 0 && i < m.cols && y > m.top * 0.5 && y < m.base + 0.6 * c.cq ? i : null;
    },
    draw(c, m, { p }) {
      const { cq } = c, hk = c.hk, fade = easeOut(clamp(p / 0.3)), mk = clamp((p - 0.55) / 0.3);
      line(c, 0, m.base, c.w, m.base, 0.2 * fade);
      for (let v = 0; v <= m.max; v += 10) {
        const x = m.xOf(v), major = v % 100 === 0;
        line(c, x, m.base + 0.18 * cq, x, m.base + (major ? 0.5 : 0.3) * cq, (major ? 0.4 : 0.16) * fade);
        if (major) text(c, v === m.max ? `${v} ms` : `${v}`, x, m.base + 1.0 * cq, { align: v === 0 ? 'left' : v === m.max ? 'right' : 'center', a: fade });
      }
      m.marks.forEach(([label, v], i) => {
        const x = m.xOf(v), hi = i === 1;
        line(c, x, m.base - 0.15 * cq, x, m.top - 0.1 * cq, (hi ? 0.5 : 0.28) * mk, { dash: [0.12, 0.2] });
        text(c, `${label} ${v}`, x + 0.28 * cq, m.top - 0.55 * cq, { color: hi ? c.pal.ink : c.pal.muted, a: mk * (1 - 0.6 * hk) });
      });
      paintDots(c, m.dots, p, hk < 0.005 ? null : (d) => { const w = c.hw.get(d.g) || 0; return d.a * (1 - 0.4 * hk * (1 - w)) + (1 - d.a) * 0.5 * hk * w; });
      if (c.key != null) {
        const i = c.key, lo = Math.round(i * m.bw), hi = Math.round((i + 1) * m.bw);
        chip(c, `${lo}–${hi} ms · ${((m.dens[i] / m.tot) * 100).toFixed(1)}%`, m.x0 + (i + 0.5) * m.pitch, m.base - 0.5 * cq - m.rows[i] * m.pitch - 0.3 * cq, hk);
      }
    },
  };

  /* Tick gauge: a 240° arc of fine ticks, lit up to the value; majors labelled. The number itself is HTML at the center. */
  RECIPES['tick-gauge'] = {
    dur: 1700,
    layout(c) {
      const d = c.el.dataset, mn = num(d.min, 0), mx = num(d.max, 4), T = num(d.ticks, 121), major = num(d.major, 30);
      const cx = c.w / 2, cy = c.h * num(d.cy, 0.58), R = Math.min(c.w * 0.37, c.h * 0.42);
      const a0 = (150 / 180) * Math.PI, a1 = (390 / 180) * Math.PI;
      const ticks = Array.from({ length: T }, (_, t) => ({ v: mn + ((mx - mn) * t) / (T - 1), th: a0 + ((a1 - a0) * t) / (T - 1), major: t % major === 0, mid: t % (major / 2) === 0, t }));
      return { cx, cy, R, ticks, mn, mx, val: num(d.value, 3), unit: d.unit || '', a0, a1 };
    },
    draw(c, m, { p }) {
      const { ctx, cq, pal } = c, { cx, cy, R } = m, fade = easeOut(clamp(p / 0.3));
      const q = m.mn + (m.val - m.mn) * easeInOut(clamp((p - 0.12) / 0.78));
      for (const k of m.ticks) {
        const lit = k.v <= q + 1e-9, len = R * (k.major ? 0.12 : k.mid ? 0.08 : 0.055), cs = Math.cos(k.th), sn = Math.sin(k.th);
        line(c, cx + cs * (R - len), cy + sn * (R - len), cx + cs * R, cy + sn * R, (lit ? (k.major ? 1 : 0.8) : 0.13) * fade, { lw: k.major ? 1.25 : 1 });
        if (k.t % 3 === 0) {
          const r = R * 0.83; ctx.beginPath(); ctx.arc(cx + cs * r, cy + sn * r, 0.04 * cq, 0, TAU);
          ctx.fillStyle = `rgba(${pal.mark}, ${((lit ? 0.42 : 0.14) * fade * pal.k).toFixed(3)})`; ctx.fill();
        }
        if (k.major) text(c, `${Math.round(k.v)}${m.unit}`, cx + cs * R * 1.12, cy + sn * R * 1.12, { align: 'center', a: fade });
      }
      const th = m.a0 + ((m.a1 - m.a0) * (q - m.mn)) / (m.mx - m.mn), r = R * 0.83;
      ctx.beginPath(); ctx.arc(cx + Math.cos(th) * r, cy + Math.sin(th) * r, 0.12 * cq, 0, TAU);
      ctx.fillStyle = pal.ink; ctx.globalAlpha = fade; ctx.fill(); ctx.globalAlpha = 1;
    },
  };

  /* Dot grid (calendar heatmap): days × hours, dot alpha = volume; one accent cell for the single incident. */
  RECIPES['dot-grid'] = {
    dur: 1800, hover: true,
    layout(c) {
      const d = c.el.dataset, cq = c.cq, cols = num(d.days, 90), rows = 24, H = list(d.hourly), Hmax = Math.max(...H), rnd = rng(num(d.seed, 11));
      const [ic, ir] = list(d.incident), today = new Date(`${d.today || '2026-10-27'}T12:00:00`);
      const labelH = 1.45 * cq, topH = 1.5 * cq, pitch = Math.min(c.w / cols, (c.h - labelH - topH) / rows);
      const x0 = 0, y0 = c.h - labelH - rows * pitch, dots = [], dates = [];
      for (let col = 0; col < cols; col++) {
        const dt = new Date(today); dt.setDate(today.getDate() - (cols - 1 - col)); dates.push(dt);
        const wf = dt.getDay() % 6 === 0 ? 0.74 : 1;
        for (let row = 0; row < rows; row++) {
          const inc = col === ic && row === ir;
          dots.push({ x: x0 + (col + 0.5) * pitch, y: y0 + (row + 0.5) * pitch, r: pitch * (inc ? 0.3 : 0.21),
            a: inc ? 1 : 0.1 + 0.72 * (H[row] / Hmax) * wf * (1 + (rnd() - 0.5) * 0.1), o: (col / cols) * 0.7 + row * 0.003, w: 0.14, g: col, c: inc ? 'a' : 'm' });
        }
      }
      return { dots, dates, cols, rows, pitch, x0, y0, ic, ir, labels: (d.labels || '|').split('|'), incLabel: d.incidentLabel || '', incUptime: d.incidentUptime || '' };
    },
    hover(c, m, x, y) {
      const i = Math.floor((x - m.x0) / m.pitch);
      return i >= 0 && i < m.cols && y > m.y0 - 1.6 * c.cq ? i : null;
    },
    draw(c, m, { p }) {
      const { ctx, cq, pal } = c, hk = c.hk, fade = easeOut(clamp(p / 0.3)), gw = m.cols * m.pitch, yb = m.y0 + m.rows * m.pitch;
      for (let col = m.cols - 1; col >= 0; col -= 7) line(c, m.x0 + (col + 0.5) * m.pitch, yb + 0.2 * cq, m.x0 + (col + 0.5) * m.pitch, yb + 0.4 * cq, 0.3 * fade);
      text(c, m.labels[0], m.x0, yb + 1.0 * cq, { a: fade });
      text(c, m.labels[1], m.x0 + gw, yb + 1.0 * cq, { align: 'right', a: fade });
      // incident: accent dot, hairline ring, leader to its label, tiny glow
      const ix = m.x0 + (m.ic + 0.5) * m.pitch, iy = m.y0 + (m.ir + 0.5) * m.pitch, ia = clamp((p - ((m.ic / m.cols) * 0.7 + 0.12)) / 0.2);
      glow(c, ix, iy, m.pitch * 4.5, pal.glow * 0.7 * ia);
      paintDots(c, m.dots, p, hk < 0.005 ? null : (d) => { const w = c.hw.get(d.g) || 0; return d.a * (1 - 0.35 * hk * (1 - w)) + (1 - d.a) * 0.45 * hk * w; });
      ctx.beginPath(); ctx.arc(ix, iy, m.pitch * 0.85, 0, TAU); ctx.lineWidth = 1; ctx.strokeStyle = `rgba(${pal.accent}, ${(0.6 * ia).toFixed(3)})`; ctx.stroke();
      const la = ia * (1 - hk);
      line(c, ix, iy - m.pitch * 0.85, ix, m.y0 - 0.85 * cq, 0.45 * la, { rgb: pal.accent });
      text(c, m.incLabel, ix + (ix > c.w * 0.6 ? 0.2 : -0.2) * cq, m.y0 - 1.05 * cq, { align: ix > c.w * 0.6 ? 'right' : 'left', color: `rgb(${pal.accent})`, a: la, size: 0.52 });
      if (c.key != null) {
        const dt = m.dates[c.key], s = `${DOW[dt.getDay()]} ${dt.getDate()} ${MON[dt.getMonth()]} · ${c.key === m.ic ? m.incUptime : '100%'}`;
        chip(c, s, m.x0 + (c.key + 0.5) * m.pitch, m.y0 - 0.35 * cq, hk);
      }
    },
  };

  /* Dot area: a time series as dot columns; three grey levels nest inside each column (delivered ⊃ opened ⊃ clicked).
     A crosshair + chip marks one focus column (data-focus), and follows the pointer with damped easing. */
  RECIPES['dot-area'] = {
    dur: 1700, hover: true,
    layout(c) {
      const d = c.el.dataset, cq = c.cq, H = list(d.hourly), dayF = list(d.dayFactor), days = (d.days || 'Mon,Tue,Wed,Thu,Fri,Sat,Sun').split(',');
      const per = 12, cols = days.length * per, rnd = rng(num(d.seed, 5)), axisH = 1.55 * cq, top = 2.1 * cq;
      const px = c.w / cols, py = Math.min(px, 0.36 * cq), rowsMax = Math.floor((c.h - axisH - top) / py), base = c.h - axisH;
      const vals = Array.from({ length: cols }, (_, j) => (H[2 * (j % per)] + H[2 * (j % per) + 1]) * dayF[Math.floor(j / per)] * (1 + (rnd() - 0.5) * 0.08));
      const vmax = Math.max(...vals), dots = [], info = [];
      vals.forEach((v, j) => {
        const b = j % per, n = Math.round((v / vmax) * rowsMax * 0.95), or = 0.41 + 0.05 * Math.cos(((b - 4) / per) * TAU), cr = 0.09 + 0.02 * Math.cos(((b - 5) / per) * TAU);
        const no = Math.round(n * or), nc = Math.round(n * cr), x = (j + 0.5) * px;
        info.push({ n, label: `${days[Math.floor(j / per)]} ${pad2(b * 2)}:00`, open: Math.round(or * 100) });
        for (let k = 0; k < n; k++) dots.push({ x, y: base - 0.5 * cq - k * py, r: Math.min(px, py) * 0.25, a: k < nc ? 0.95 : k < no ? 0.5 : 0.16, o: (j / cols) * 0.6 + k * 0.005, w: 0.2, g: j, c: 'm' });
      });
      const [fd, fb] = list(d.focus || '3,7');
      return { dots, info, cols, per, px, py, rowsMax, base, top, days, focus: fd * per + fb };
    },
    hover(c, m, x, y) { const j = Math.floor(x / m.px); return j >= 0 && j < m.cols && y > m.top * 0.4 ? j : null; },
    draw(c, m, { p, f }) {
      const { cq } = c, fade = easeOut(clamp(p / 0.3)), s = c.state;
      for (const fr of [0.25, 0.5, 0.75, 1]) { const y = m.base - 0.5 * cq - fr * m.rowsMax * 0.95 * m.py; line(c, 0, y, c.w, y, 0.08 * fade, { dash: [0.06, 0.22] }); }
      line(c, 0, m.base, c.w, m.base, 0.2 * fade);
      m.days.forEach((dn, i) => {
        const x = i * m.per * m.px;
        if (i) line(c, x, m.base + 0.18 * cq, x, m.base + 0.48 * cq, 0.3 * fade);
        text(c, dn, x + (m.per * m.px) / 2, m.base + 1.0 * cq, { align: 'center', a: fade });
      });
      // focus column follows the pointer (damped), returns to the story's column on leave
      const target = c.key ?? m.focus;
      s.fx = s.fx == null || RM.matches ? target : lerp(s.fx, target, f);
      c.busy = Math.abs(s.fx - target) > 0.02;
      const fj = Math.round(s.fx), fx = (s.fx + 0.5) * m.px, ca = clamp((p - 0.78) / 0.2);
      paintDots(c, m.dots, p, (d) => (d.g === fj && ca > 0 ? d.a + (1 - d.a) * 0.45 * ca : d.a * (1 - 0.12 * ca)));
      const colTop = m.base - 0.5 * cq - m.info[fj].n * m.py;
      line(c, fx, m.base, fx, colTop - 0.35 * cq, 0.4 * ca, { rgb: undefined });
      chip(c, `${m.info[fj].label} · ${m.info[fj].open}% opened`, fx, colTop - 0.45 * cq, ca);
    },
  };

  /* Sparkline bars: a dozen thin rounded bars, alpha ramps toward "now"; optional single accent bar. */
  RECIPES['spark-bars'] = {
    dur: 1100,
    layout(c) {
      const d = c.el.dataset, v = list(d.values), n = v.length, vmax = Math.max(...v);
      const bw = Math.max(1, Math.round(num(d.bar, 0.15) * c.cq * c.sx)) / c.sx, gap = bw * num(d.gap, 1);
      const x0 = c.w - (n * bw + (n - 1) * gap);
      return { bars: v.map((val, i) => ({ x: Math.round((x0 + i * (bw + gap)) * c.sx) / c.sx, h: Math.max(bw, (val / vmax) * c.h), i })), bw, n, acc: num(d.accentIndex, -1) };
    },
    draw(c, m, { p }) {
      const { ctx, pal } = c;
      for (const b of m.bars) {
        const e = easeOut(clamp((p - (b.i / m.n) * 0.45) / 0.4));
        if (e <= 0) continue;
        const h = Math.max(m.bw, b.h * e), acc = b.i === m.acc;
        ctx.beginPath(); ctx.roundRect(b.x, c.h - h, m.bw, h, m.bw / 2);
        ctx.fillStyle = acc ? `rgba(${pal.accent}, ${e})` : `rgba(${pal.mark}, ${((0.2 + 0.8 * (b.i / (m.n - 1)) ** 1.6) * pal.k * e).toFixed(3)})`;
        ctx.fill();
      }
    },
  };

  /* ---------- chart lifecycle ---------- */
  const stage = document.querySelector('.stage') || root;
  const charts = [], byEl = new Map();
  let raf = 0, paused = false;
  const kick = () => { if (!raf && !paused && !document.hidden) raf = requestAnimationFrame(tick); };

  class Chart {
    constructor(el) {
      this.el = el; this.r = RECIPES[el.dataset.chart];
      this.cv = document.createElement('canvas'); this.cv.className = 'viz__cv'; this.cv.setAttribute('aria-hidden', 'true');
      el.prepend(this.cv); this.ctx = this.cv.getContext('2d');
      this.tile = el.closest('.tile') || el;
      const i = num(getComputedStyle(this.tile).getPropertyValue('--i'), 0);
      this.off = 120 + i * 90 + 280 + num(el.dataset.delay, 0);  // reveal offset, synced to the CSS stagger
      this.t0 = this.off;                                          // performance.now() timeline (first load starts at 0)
      this.dur = this.r.dur || 1600;
      this.ptr = { x: 0, y: 0, in: false }; this.hk = 0; this.hw = new Map(); this.key = null; this.state = {};
      this.frames = 0; this.ms = 0; this.last = 0; this.lastT = 0; this.dirty = true; this.busy = false; this.w = 0;
      this.pal = palette(el);
      this.ro = el.querySelector('[data-readout]') || this.tile.querySelector('[data-readout]');
      this.roDefault = this.ro?.textContent;
      if (this.r.hover) {
        this.tile.addEventListener('pointermove', (e) => { const b = el.getBoundingClientRect(); this.ptr = { x: ((e.clientX - b.left) * this.w) / b.width, y: ((e.clientY - b.top) * this.h) / b.height, in: true }; kick(); });
        this.tile.addEventListener('pointerleave', () => { this.ptr.in = false; kick(); });
      }
    }
    resize(w, h, dev) {
      if (!w || !h) return;
      this.w = w; this.h = h;
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      // exact device-pixel box when the browser reports one that agrees with DPR (emulated DPR can report CSS px)
      const ok = dev && Math.abs(dev[0] / w - dpr) < 0.05 && Math.abs(dev[1] / h - dpr) < 0.05;
      this.cv.width = ok ? dev[0] : Math.round(w * dpr);
      this.cv.height = ok ? dev[1] : Math.round(h * dpr);
      this.sx = this.cv.width / w; this.sy = this.cv.height / h;
      this.cq = stage.clientWidth / 100;
      this.m = this.r.layout(this); this.dirty = true;
    }
    status(now) {
      if (!RM.matches && now < this.t0 + this.dur + 60) return 'anim';
      if (this.busy || Math.abs((this.key != null ? 1 : 0) - this.hk) > 0.003) return 'anim';
      for (const [k, w] of this.hw) if (Math.abs((k === this.key ? 1 : 0) - w) > 0.003) return 'anim';
      if (this.ptr.in && this.r.hover && this.r.hover(this, this.m, this.ptr.x, this.ptr.y) !== this.key) return 'anim';
      return this.r.ambient && !RM.matches ? 'ambient' : 'idle';
    }
    render(now) {
      const t1 = performance.now(), dt = Math.min(0.1, (now - (this.lastT || now)) / 1000); this.lastT = now;
      const f = RM.matches ? 1 : 1 - Math.exp(-dt / 0.14);
      const p = RM.matches ? 1 : clamp((now - this.t0) / this.dur);
      const key = this.ptr.in && this.r.hover ? this.r.hover(this, this.m, this.ptr.x, this.ptr.y) : null;
      if (key !== this.key && this.ro) this.ro.textContent = key == null ? this.roDefault : this.r.readout?.(this, this.m, key) ?? this.roDefault;
      this.key = key;
      this.hk += ((key != null ? 1 : 0) - this.hk) * f;
      if (key != null && !this.hw.has(key)) this.hw.set(key, 0);
      for (const [k, w] of this.hw) { const nw = w + ((k === key ? 1 : 0) - w) * f; if (nw < 0.002 && k !== key) this.hw.delete(k); else this.hw.set(k, nw); }
      const { ctx } = this;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, this.cv.width, this.cv.height);
      ctx.setTransform(this.sx, 0, 0, this.sy, 0, 0);
      this.r.draw(this, this.m, { p, t: now / 1000, f });
      this.frames++; this.ms = lerp(this.ms, performance.now() - t1, 0.2);
    }
  }

  function tick(now) {
    raf = 0;
    let more = false;
    for (const c of charts) {
      if (!c.w) continue;
      const st = c.status(now);
      if (c.dirty || st === 'anim' || (st === 'ambient' && now - c.last > 32)) { c.render(now); c.dirty = false; c.last = now; }
      if (st !== 'idle') more = true;
    }
    if (more) kick();
  }

  function init() {
    let ro;
    const onSize = (entries) => {
      for (const e of entries) {
        const c = byEl.get(e.target), dp = e.devicePixelContentBoxSize?.[0];
        c?.resize(e.contentRect.width, e.contentRect.height, dp && [dp.inlineSize, dp.blockSize]);
      }
      kick();
    };
    try { ro = new ResizeObserver(onSize); } catch { return; }
    document.querySelectorAll('.viz[data-chart]').forEach((el) => {
      if (!RECIPES[el.dataset.chart]) return console.warn(`bento-viz: unknown chart "${el.dataset.chart}"`);
      const c = new Chart(el); charts.push(c); byEl.set(el, c);
      try { ro.observe(el, { box: 'device-pixel-content-box' }); } catch { ro.observe(el); }   // exact device px where supported
      root.dataset.viz = 'on';
    });
    new MutationObserver(() => { charts.forEach((c) => { c.pal = palette(c.el); c.dirty = true; }); kick(); })
      .observe(root, { attributes: true, attributeFilter: ['data-theme', 'data-tone'] });
    addEventListener('visibilitychange', kick);
    RM.addEventListener?.('change', () => { charts.forEach((c) => { c.dirty = true; }); kick(); });
    document.fonts?.addEventListener?.('loadingdone', () => { charts.forEach((c) => { c.dirty = true; }); kick(); });
    kick();
  }

  window.bentoViz = {
    stats: () => charts.map((c) => ({ chart: c.el.dataset.chart, css: [Math.round(c.w), Math.round(c.h)], device: [c.cv.width, c.cv.height], scale: +c.sx.toFixed(3), marks: c.m?.dots?.length ?? c.m?.ticks?.length ?? c.m?.bars?.length, frames: c.frames, ms: +c.ms.toFixed(2) })),
    replay: () => { const now = performance.now(); charts.forEach((c) => { c.t0 = now + c.off; c.dirty = true; }); kick(); },   // rerun the reveal from the start
    settle: () => { charts.forEach((c) => { c.t0 = -1e9; c.dirty = true; }); kick(); },
    pause: (v = true) => { paused = v; if (!v) kick(); },
    // Export hook (export/bento-export.js): redraw every chart, settled and un-hovered, into a fresh offscreen canvas as if
    // the stage were `stageW` CSS px wide at `scale` device px per CSS px, using the CURRENT theme's tokens.
    // Geometry is all in cq units, so a box scales by stageW / stage.clientWidth. Returns Map(.viz element → canvas).
    snapshot: (scale = 2, stageW = 1920) => {
      const out = new Map(), k = stageW / stage.clientWidth;
      for (const c of charts) {
        const b = c.el.getBoundingClientRect(), w = b.width * k, h = b.height * k;
        if (!w || !h) continue;
        const cv = document.createElement('canvas');
        cv.width = Math.round(w * scale); cv.height = Math.round(h * scale);
        const s = Object.assign(Object.create(Chart.prototype), c, {
          cv, ctx: cv.getContext('2d'), w, h, sx: cv.width / w, sy: cv.height / h, cq: stageW / 100,
          pal: palette(c.el), hk: 0, hw: new Map(), key: null, state: {}, ptr: { x: 0, y: 0, in: false },
        });
        s.m = s.r.layout(s);
        s.ctx.setTransform(s.sx, 0, 0, s.sy, 0, 0);
        s.r.draw(s, s.m, { p: 1, t: 0, f: 1 });
        out.set(c.el, cv);
      }
      return out;
    },
    recipes: RECIPES,
  };

  // Canvas text only uses fonts that are already loaded: load the mono face explicitly before the first paint.
  const fontsReady = document.fonts ? Promise.race([document.fonts.load('500 12px BentoMono').then(() => document.fonts.ready), new Promise((r) => setTimeout(r, 800))]) : Promise.resolve();
  fontsReady.then(init, init);
})();
