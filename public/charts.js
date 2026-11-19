// Tiny dependency-free SVG charts with hover tooltips (single series, one y-axis).
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
};

function niceTicks(min, max, count = 4) {
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return ticks;
}

const fmtDate = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

function makeTip(container) {
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.hidden = true;
  container.appendChild(tip);
  return tip;
}

// points: [{ x: Date, y: number, tip: string }]
// opts.trend: optional second series drawn as the line; `points` then show as soft dots.
export function lineChart(container, points, { unit = '', height = 200, zeroBased = false, trend = null } = {}) {
  container.innerHTML = '';
  container.classList.add('chart');
  if (!points.length) { container.innerHTML = '<div class="empty">No data yet</div>'; return; }
  const W = Math.max(320, container.clientWidth || 600);
  const H = height;
  const m = { t: 12, r: 14, b: 26, l: 40 };
  const xs = points.map((p) => +p.x);
  const ys = [...points, ...(trend || [])].map((p) => p.y);
  let x0 = Math.min(...xs), x1 = Math.max(...xs);
  if (x0 === x1) { x0 -= 86400000 * 3; x1 += 86400000 * 3; }
  const ticks = niceTicks(zeroBased ? 0 : Math.min(...ys), Math.max(...ys));
  const y0 = ticks[0], y1 = ticks[ticks.length - 1];
  const sx = (v) => m.l + ((v - x0) / (x1 - x0)) * (W - m.l - m.r);
  const sy = (v) => H - m.b - ((v - y0) / (y1 - y0 || 1)) * (H - m.t - m.b);

  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Line chart, ${points.length} points` }, container);
  const grid = el('g', { class: 'grid axis' }, svg);
  for (const t of ticks) {
    el('line', { x1: m.l, x2: W - m.r, y1: sy(t), y2: sy(t) }, grid);
    el('text', { x: m.l - 6, y: sy(t) + 4, 'text-anchor': 'end' }, grid).textContent = `${t}`;
  }
  const xa = el('g', { class: 'axis' }, svg);
  const nX = Math.min(4, points.length);
  for (let i = 0; i < nX; i++) {
    const v = x0 + ((x1 - x0) * i) / Math.max(1, nX - 1);
    el('text', { x: sx(v), y: H - 6, 'text-anchor': i === 0 ? 'start' : i === nX - 1 ? 'end' : 'middle' }, xa).textContent = fmtDate(new Date(v));
  }
  if (trend?.length) {
    for (const p of points) el('circle', { class: 'dot soft', cx: sx(+p.x), cy: sy(p.y), r: 4 }, svg);
    el('path', { class: 'trend', d: trend.map((p, i) => `${i ? 'L' : 'M'}${sx(+p.x)},${sy(p.y)}`).join('') }, svg);
  } else {
    el('path', { class: 'line', d: points.map((p, i) => `${i ? 'L' : 'M'}${sx(+p.x)},${sy(p.y)}`).join('') }, svg);
    if (points.length <= 40) for (const p of points) el('circle', { class: 'dot', cx: sx(+p.x), cy: sy(p.y), r: 4 }, svg);
  }

  const cross = el('line', { class: 'cross', y1: m.t, y2: H - m.b, visibility: 'hidden' }, svg);
  const focus = el('circle', { class: 'dot', r: 6, visibility: 'hidden' }, svg);
  const tip = makeTip(container);
  const hit = el('rect', { x: m.l, y: 0, width: W - m.l - m.r, height: H, fill: 'transparent' }, svg);
  const show = (evt) => {
    const rect = svg.getBoundingClientRect();
    const px = ((evt.clientX - rect.left) / rect.width) * W;
    let best = points[0];
    for (const p of points) if (Math.abs(sx(+p.x) - px) < Math.abs(sx(+best.x) - px)) best = p;
    const cx = sx(+best.x), cy = sy(best.y);
    cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
    focus.setAttribute('cx', cx); focus.setAttribute('cy', cy); focus.setAttribute('visibility', 'visible');
    tip.hidden = false;
    tip.textContent = best.tip || `${fmtDate(best.x)}: ${best.y}${unit}`;
    tip.style.left = `${(cx / W) * rect.width}px`;
    tip.style.top = `${(cy / H) * rect.height}px`;
  };
  const hide = () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); focus.setAttribute('visibility', 'hidden'); };
  hit.addEventListener('pointermove', show);
  hit.addEventListener('pointerdown', show);
  hit.addEventListener('pointerleave', hide);
}

// bars: [{ label: string, value: number, tip: string, dim?: boolean }]
export function barChart(container, bars, { height = 180 } = {}) {
  container.innerHTML = '';
  container.classList.add('chart');
  if (!bars.length || bars.every((b) => !b.value)) { container.innerHTML = '<div class="empty">No data yet</div>'; return; }
  const W = Math.max(320, container.clientWidth || 600);
  const H = height;
  const m = { t: 12, r: 8, b: 26, l: 48 };
  const ticks = niceTicks(0, Math.max(...bars.map((b) => b.value)));
  const yMax = ticks[ticks.length - 1];
  const sy = (v) => H - m.b - (v / yMax) * (H - m.t - m.b);
  const slot = (W - m.l - m.r) / bars.length;
  const bw = Math.min(36, slot * 0.7);
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Bar chart, ${bars.length} bars` }, container);
  const grid = el('g', { class: 'grid axis' }, svg);
  const short = (v) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : `${v}`);
  for (const t of ticks) {
    el('line', { x1: m.l, x2: W - m.r, y1: sy(t), y2: sy(t) }, grid);
    el('text', { x: m.l - 6, y: sy(t) + 4, 'text-anchor': 'end' }, grid).textContent = short(t);
  }
  const tip = makeTip(container);
  bars.forEach((b, i) => {
    const cx = m.l + slot * i + slot / 2;
    const top = sy(b.value);
    const h = Math.max(0, H - m.b - top);
    const r = Math.min(4, bw / 2, h);
    const x = cx - bw / 2, y = top, base = H - m.b;
    // Rounded top corners, square at the baseline.
    const d = h > 0 ? `M${x},${base}V${y + r}Q${x},${y} ${x + r},${y}H${x + bw - r}Q${x + bw},${y} ${x + bw},${y + r}V${base}Z` : '';
    if (d) el('path', { class: `bar${b.dim ? ' dim' : ''}`, d }, svg);
    const every = Math.ceil(44 / slot); // keep labels from colliding on narrow screens
    if ((bars.length - 1 - i) % every === 0) el('text', { x: cx, y: H - 6, 'text-anchor': 'middle', class: 'axis' }, svg).textContent = b.label;
    const hit = el('rect', { x: m.l + slot * i, y: m.t, width: slot, height: H - m.t - m.b, fill: 'transparent' }, svg);
    const show = () => {
      const rect = svg.getBoundingClientRect();
      tip.hidden = false;
      tip.textContent = b.tip;
      tip.style.left = `${(cx / W) * rect.width}px`;
      tip.style.top = `${(top / H) * rect.height}px`;
    };
    hit.addEventListener('pointerenter', show);
    hit.addEventListener('pointerdown', show);
    hit.addEventListener('pointerleave', () => { tip.hidden = true; });
  });
  el('line', { class: 'baseline', x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b }, svg);
}

// slices: [{ label, value, color, display }]. Renders a donut with optional centre text and a legend.
export function donutChart(container, slices, { size = 120, center = '', centerSub = '', legend = true, thickness = 0.17 } = {}) {
  container.innerHTML = '';
  container.classList.add('donut', 'chart');
  const data = slices.filter((s) => s.value > 0);
  const total = data.reduce((a, s) => a + s.value, 0);
  const S = 100, R = 48, r = R * (1 - thickness * 2);
  const svg = el('svg', { viewBox: `0 0 ${S} ${S}`, width: size, height: size, role: 'img',
    'aria-label': data.map((d) => `${d.label} ${Math.round((d.value / total) * 100)}%`).join(', ') }, container);
  svg.style.maxWidth = `${size}px`;
  svg.style.margin = '0 auto';
  const tip = makeTip(container);
  if (!total) {
    el('circle', { cx: 50, cy: 50, r: (R + r) / 2, fill: 'none', stroke: 'var(--fill)', 'stroke-width': R - r }, svg);
  }
  let a0 = -Math.PI / 2;
  const pt = (rad, a) => `${50 + rad * Math.cos(a)},${50 + rad * Math.sin(a)}`;
  for (const d of data) {
    const frac = d.value / total;
    const a1 = a0 + frac * Math.PI * 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const path = frac >= 0.999
      ? `M${pt(R, 0)}A${R},${R} 0 1 1 ${pt(R, Math.PI)}A${R},${R} 0 1 1 ${pt(R, 0)}M${pt(r, 0)}A${r},${r} 0 1 0 ${pt(r, Math.PI)}A${r},${r} 0 1 0 ${pt(r, 0)}Z`
      : `M${pt(R, a0)}A${R},${R} 0 ${large} 1 ${pt(R, a1)}L${pt(r, a1)}A${r},${r} 0 ${large} 0 ${pt(r, a0)}Z`;
    const seg = el('path', { d: path, fill: d.color, stroke: 'var(--surface)', 'stroke-width': 1.2, 'fill-rule': 'evenodd' }, svg);
    const mid = (a0 + a1) / 2;
    const show = () => {
      const rect = svg.getBoundingClientRect();
      const box = container.getBoundingClientRect();
      tip.hidden = false;
      tip.textContent = `${d.label}: ${d.display ?? d.value} (${Math.round(frac * 100)}%)`;
      tip.style.left = `${rect.left - box.left + ((50 + R * 0.8 * Math.cos(mid)) / S) * rect.width}px`;
      tip.style.top = `${rect.top - box.top + ((50 + R * 0.8 * Math.sin(mid)) / S) * rect.height}px`;
    };
    seg.addEventListener('pointerenter', show);
    seg.addEventListener('pointerdown', show);
    seg.addEventListener('pointerleave', () => { tip.hidden = true; });
    a0 = a1;
  }
  if (center) el('text', { x: 50, y: centerSub ? 50 : 56, 'text-anchor': 'middle', class: 'center-big' }, svg).textContent = center;
  if (centerSub) el('text', { x: 50, y: 63, 'text-anchor': 'middle', class: 'center-small' }, svg).textContent = centerSub;
  if (legend && data.length) {
    const lg = document.createElement('div');
    lg.className = 'legend';
    lg.innerHTML = data.map((d) => `<div class="item"><span class="swatch" style="background:${d.color}"></span><span>${d.label}</span><span>${d.display ?? d.value} · ${Math.round((d.value / total) * 100)}%</span></div>`).join('');
    container.appendChild(lg);
  }
}
