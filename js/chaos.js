// Generator of "chaotic" boards: the field is cut into rectangles, and some of them are
// decorated with ellipses, fans, diamonds, triangles and stripes. Pure geometry, no DOM.
//
// Each cell: { d, evenodd, box: {x, y, w, h}, rot, fill }
//   d        SVG path of the clickable zone
//   evenodd  true when the path has a hole (rectangle minus an ellipse or a fan)
//   box      axis-aligned rectangle inside the zone where the label fits
//   rot      label rotation in degrees (0, 90 or -90)
//   fill     palette index 0..3 (0 is the neutral paper colour)

export const MIN_LABEL = 34; // smallest label box side, in board units
const MIN_SPLIT = 78; // smallest rectangle side produced by the cutting step

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f = (n) => Math.round(n * 10) / 10;
const rectPath = ({ x, y, w, h }) => `M${f(x)} ${f(y)}H${f(x + w)}V${f(y + h)}H${f(x)}Z`;
const polyPath = (pts) => `M${pts.map(([a, b]) => `${f(a)} ${f(b)}`).join('L')}Z`;
const ellipsePath = (cx, cy, rx, ry) =>
  `M${f(cx - rx)} ${f(cy)}A${f(rx)} ${f(ry)} 0 1 0 ${f(cx + rx)} ${f(cy)}` +
  `A${f(rx)} ${f(ry)} 0 1 0 ${f(cx - rx)} ${f(cy)}Z`;

const fits = (box) => box.w >= MIN_LABEL && box.h >= MIN_LABEL;
const cell = (d, box, extra = {}) => ({ d, box, evenodd: false, rot: 0, ...extra });

// ---------- Templates: each turns one rectangle into several cells, or returns null ----------

function plain(r, rnd) {
  const box = { x: r.x, y: r.y, w: r.w, h: r.h };
  let rot = 0;
  if (r.h > r.w * 1.6 && rnd() < 0.45) rot = rnd() < 0.5 ? 90 : -90;
  return [cell(rectPath(r), box, { rot })];
}

function stripes(r, rnd) {
  const vertical = rnd() < 0.5; // vertical stripes sit side by side
  const len = vertical ? r.w : r.h;
  const maxK = Math.min(5, Math.floor(len / (MIN_LABEL * 1.3)));
  if (maxK < 2) return null;
  const k = 2 + Math.floor(rnd() * (maxK - 1));
  const out = [];
  for (let i = 0; i < k; i++) {
    const s = vertical
      ? { x: r.x + (r.w * i) / k, y: r.y, w: r.w / k, h: r.h }
      : { x: r.x, y: r.y + (r.h * i) / k, w: r.w, h: r.h / k };
    out.push(cell(rectPath(s), { ...s }, { rot: vertical && s.h > s.w * 1.8 && rnd() < 0.5 ? 90 : 0 }));
  }
  return out.every((c) => fits(c.box)) ? out : null;
}

function diagonal(r, rnd) {
  const { x, y, w, h } = r;
  const boxes = [
    { x, y, w: w / 2, h: h / 2 },
    { x: x + w / 2, y: y + h / 2, w: w / 2, h: h / 2 },
  ];
  if (!boxes.every(fits)) return null;
  if (rnd() < 0.5) {
    return [
      cell(polyPath([[x, y], [x + w, y], [x, y + h]]), boxes[0]),
      cell(polyPath([[x + w, y], [x + w, y + h], [x, y + h]]), boxes[1]),
    ];
  }
  // The other diagonal: corners top-right and bottom-left.
  return [
    cell(polyPath([[x, y], [x + w, y], [x + w, y + h]]), { x: x + w / 2, y, w: w / 2, h: h / 2 }),
    cell(polyPath([[x, y], [x + w, y + h], [x, y + h]]), { x, y: y + h / 2, w: w / 2, h: h / 2 }),
  ];
}

function cross(r) {
  const { x, y, w, h } = r;
  const c = [x + w / 2, y + h / 2];
  const cells = [
    cell(polyPath([[x, y], [x + w, y], c]), { x: x + w / 4, y, w: w / 2, h: h / 4 }),
    cell(polyPath([[x + w, y], [x + w, y + h], c]), { x: x + (3 * w) / 4, y: y + h / 4, w: w / 4, h: h / 2 }),
    cell(polyPath([[x, y + h], [x + w, y + h], c]), { x: x + w / 4, y: y + (3 * h) / 4, w: w / 2, h: h / 4 }),
    cell(polyPath([[x, y], [x, y + h], c]), { x, y: y + h / 4, w: w / 4, h: h / 2 }),
  ];
  return cells.every((cl) => fits(cl.box)) ? cells : null;
}

function diamond(r) {
  const { x, y, w, h } = r;
  const t = [x + w / 2, y];
  const rr = [x + w, y + h / 2];
  const b = [x + w / 2, y + h];
  const l = [x, y + h / 2];
  const q = { w: w / 4, h: h / 4 };
  const cells = [
    cell(polyPath([t, rr, b, l]), { x: x + w / 4, y: y + h / 4, w: w / 2, h: h / 2 }),
    cell(polyPath([[x, y], t, l]), { x, y, ...q }),
    cell(polyPath([[x + w, y], rr, t]), { x: x + (3 * w) / 4, y, ...q }),
    cell(polyPath([[x + w, y + h], b, rr]), { x: x + (3 * w) / 4, y: y + (3 * h) / 4, ...q }),
    cell(polyPath([[x, y + h], l, b]), { x, y: y + (3 * h) / 4, ...q }),
  ];
  return cells.every((cl) => fits(cl.box)) ? cells : null;
}

// A pentagon "house" with two triangles above its roof; flipped upside down at random.
function house(r, rnd) {
  const { x, y, w, h } = r;
  const rh = h * (0.28 + rnd() * 0.1);
  const up = rnd() < 0.6;
  const Y = (v) => (up ? y + v : y + h - v); // distance from the roof edge
  const boxY = (v, bh) => (up ? y + v : y + h - v - bh);
  const cells = [
    cell(polyPath([[x, Y(0)], [x + w / 2, Y(0)], [x, Y(rh)]]), { x, y: boxY(0, rh / 2), w: w / 4, h: rh / 2 }),
    cell(polyPath([[x + w / 2, Y(0)], [x + w, Y(0)], [x + w, Y(rh)]]), { x: x + (3 * w) / 4, y: boxY(0, rh / 2), w: w / 4, h: rh / 2 }),
    cell(polyPath([[x, Y(rh)], [x + w / 2, Y(0)], [x + w, Y(rh)], [x + w, Y(h)], [x, Y(h)]]),
      { x, y: boxY(rh, h - rh), w, h: h - rh }),
  ];
  return cells.every((cl) => fits(cl.box)) ? cells : null;
}

// An ellipse pressed to one side of the rectangle, optionally cut in two halves.
function ellipse(r, rnd, split = false) {
  const wide = r.w >= r.h;
  const along = wide ? r.w : r.h; // the axis the ellipse and the free band share
  const across = wide ? r.h : r.w;
  const frac = 0.55 + rnd() * 0.15;
  const atStart = rnd() < 0.5;
  const ra = (along * frac) / 2; // radius along
  const rc = across * 0.47; // radius across
  const ca = atStart ? ra : along - ra;
  const band = atStart
    ? { a: along * frac, len: along * (1 - frac) }
    : { a: 0, len: along * (1 - frac) };
  // Map (along, across) coordinates back to x/y.
  const X = (a, c) => (wide ? r.x + a : r.x + c);
  const Yc = (a, c) => (wide ? r.y + c : r.y + a);
  const box = (a, c, la, lc) =>
    wide ? { x: r.x + a, y: r.y + c, w: la, h: lc } : { x: r.x + c, y: r.y + a, w: lc, h: la };

  const cx = X(ca, across / 2);
  const cy = Yc(ca, across / 2);
  const rx = wide ? ra : rc;
  const ry = wide ? rc : ra;
  const outer = cell(`${rectPath(r)}${ellipsePath(cx, cy, rx, ry)}`, box(band.a, 0, band.len, across), { evenodd: true });

  if (!split) {
    const k = 0.66; // share of each radius used by the inscribed label box
    const inner = cell(ellipsePath(cx, cy, rx, ry), { x: cx - rx * k, y: cy - ry * k, w: 2 * rx * k, h: 2 * ry * k });
    const cells = [outer, inner];
    return cells.every((cl) => fits(cl.box)) ? cells : null;
  }

  // Halves are split across the long axis of the ellipse.
  const halves = [];
  if (rx >= ry) {
    halves.push(cell(`M${f(cx)} ${f(cy - ry)}A${f(rx)} ${f(ry)} 0 0 0 ${f(cx)} ${f(cy + ry)}Z`,
      { x: cx - rx * 0.75, y: cy - ry * 0.62, w: rx * 0.65, h: ry * 1.24 }));
    halves.push(cell(`M${f(cx)} ${f(cy - ry)}A${f(rx)} ${f(ry)} 0 0 1 ${f(cx)} ${f(cy + ry)}Z`,
      { x: cx + rx * 0.1, y: cy - ry * 0.62, w: rx * 0.65, h: ry * 1.24 }));
  } else {
    halves.push(cell(`M${f(cx - rx)} ${f(cy)}A${f(rx)} ${f(ry)} 0 0 1 ${f(cx + rx)} ${f(cy)}Z`,
      { x: cx - rx * 0.62, y: cy - ry * 0.75, w: rx * 1.24, h: ry * 0.65 }));
    halves.push(cell(`M${f(cx - rx)} ${f(cy)}A${f(rx)} ${f(ry)} 0 0 0 ${f(cx + rx)} ${f(cy)}Z`,
      { x: cx - rx * 0.62, y: cy + ry * 0.1, w: rx * 1.24, h: ry * 0.65 }));
  }
  const cells = [outer, ...halves];
  return cells.every((cl) => fits(cl.box)) ? cells : null;
}

// A half-disc standing on the top or bottom edge, cut into sectors around a small hub.
function fan(r, rnd) {
  const { x, y, w, h } = r;
  const R = Math.min(w * 0.47, h * 0.62);
  const r0 = R * 0.38;
  const k = 3 + Math.floor(rnd() * 3);
  const s = rnd() < 0.6 ? 1 : -1; // 1: stands on the bottom edge, -1: hangs from the top edge
  const cx = x + w / 2;
  const by = s === 1 ? y + h : y;
  const P = (rad, th) => [cx + rad * Math.cos(th), by - s * rad * Math.sin(th)];
  const pt = ([a, b]) => `${f(a)} ${f(b)}`;
  const sw = (flag) => (s === 1 ? flag : 1 - flag);

  const disc = `M${pt(P(R, Math.PI))}A${f(R)} ${f(R)} 0 0 ${sw(1)} ${pt(P(R, 0))}Z`;
  const outerBox = s === 1 ? { x, y, w, h: h - R } : { x, y: y + R, w, h: h - R };
  const cells = [cell(rectPath(r) + disc, outerBox, { evenodd: true })];

  const hubBox = s === 1
    ? { x: cx - r0 * 0.6, y: by - r0 * 0.75, w: r0 * 1.2, h: r0 * 0.6 }
    : { x: cx - r0 * 0.6, y: by + r0 * 0.15, w: r0 * 1.2, h: r0 * 0.6 };
  cells.push(cell(`M${pt(P(r0, Math.PI))}A${f(r0)} ${f(r0)} 0 0 ${sw(1)} ${pt(P(r0, 0))}Z`, hubBox));

  const dt = Math.PI / k;
  const rm = (R + r0) / 2;
  const side = Math.min((R - r0) * 0.6, rm * dt * 0.6);
  for (let i = 0; i < k; i++) {
    const t1 = i * dt;
    const t2 = (i + 1) * dt;
    const d = `M${pt(P(r0, t1))}L${pt(P(R, t1))}A${f(R)} ${f(R)} 0 0 ${sw(0)} ${pt(P(R, t2))}` +
      `L${pt(P(r0, t2))}A${f(r0)} ${f(r0)} 0 0 ${sw(1)} ${pt(P(r0, t1))}Z`;
    const [mx, my] = P(rm, (t1 + t2) / 2);
    cells.push(cell(d, { x: mx - side / 2, y: my - side / 2, w: side, h: side }));
  }
  return cells.every((cl) => fits(cl.box)) ? cells : null;
}

const TEMPLATES = [
  { weight: 3, make: stripes },
  { weight: 2, make: diagonal },
  { weight: 2, make: (r, rnd) => ellipse(r, rnd, false) },
  { weight: 1, make: (r, rnd) => ellipse(r, rnd, true) },
  { weight: 1, make: house },
  { weight: 1, make: diamond },
  { weight: 1, make: cross },
  { weight: 1.5, make: fan },
];

function pickWeighted(items, weightOf, rnd) {
  const total = items.reduce((s, it) => s + weightOf(it), 0);
  let t = rnd() * total;
  for (const it of items) {
    t -= weightOf(it);
    if (t <= 0) return it;
  }
  return items[items.length - 1];
}

function splitRect(r, rnd) {
  const longIsW = r.w >= r.h;
  const alongW = rnd() < 0.8 ? longIsW : !longIsW;
  const len = alongW ? r.w : r.h;
  if (len < MIN_SPLIT * 2) return null;
  const lo = Math.max(0.3, MIN_SPLIT / len);
  const t = lo + rnd() * (1 - 2 * lo);
  const a = len * t;
  return alongW
    ? [{ x: r.x, y: r.y, w: a, h: r.h }, { x: r.x + a, y: r.y, w: r.w - a, h: r.h }]
    : [{ x: r.x, y: r.y, w: r.w, h: a }, { x: r.x, y: r.y + a, w: r.w, h: r.h - a }];
}

// Splits the largest-ish rectangle that can still be split. Returns false if none can.
function splitOne(rects, rnd) {
  const candidates = rects.filter((r) => Math.max(r.w, r.h) >= MIN_SPLIT * 2);
  if (!candidates.length) return false;
  for (let tries = 0; tries < 8; tries++) {
    const r = pickWeighted(candidates, (c) => c.w * c.h, rnd);
    const parts = splitRect(r, rnd);
    if (parts) {
      rects.splice(rects.indexOf(r), 1, ...parts);
      return true;
    }
  }
  return false;
}

function attempt(n, width, height, rnd) {
  const rects = [{ x: 0, y: 0, w: width, h: height }];
  const firstCut = Math.max(1, Math.round(n * (0.4 + rnd() * 0.12)));
  while (rects.length < firstCut) if (!splitOne(rects, rnd)) return null;

  let budget = n - rects.length;
  const cells = [];
  const plainRects = [];
  for (const r of rects.slice().sort(() => rnd() - 0.5)) {
    let done = false;
    if (budget > 0 && rnd() < 0.7) {
      const pool = TEMPLATES.slice();
      while (pool.length && !done) {
        const t = pickWeighted(pool, (it) => it.weight, rnd);
        pool.splice(pool.indexOf(t), 1);
        const made = t.make(r, rnd);
        if (made && made.length - 1 <= budget) {
          cells.push(...made);
          budget -= made.length - 1;
          done = true;
        }
      }
    }
    if (!done) plainRects.push(r);
  }
  while (budget > 0) {
    if (!splitOne(plainRects, rnd)) return null;
    budget--;
  }
  for (const r of plainRects) {
    if (!fits(r)) return null;
    cells.push(...plain(r, rnd));
  }
  return cells;
}

export function generateChaos(n, width, height, random = Math.random) {
  for (let i = 0; i < 60; i++) {
    const cells = attempt(n, width, height, random);
    if (cells && cells.length === n) {
      // Mostly paper-coloured cells with a few pastel accents.
      for (const c of cells) c.fill = random() < 0.62 ? 0 : 1 + Math.floor(random() * 3);
      return cells;
    }
  }
  throw new Error(`Cannot build a chaotic board with ${n} cells in ${width}x${height}`);
}
