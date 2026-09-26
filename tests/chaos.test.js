import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateChaos, mulberry32, MIN_LABEL } from '../js/chaos.js';

const FIELDS = [[1600, 900], [900, 1500]];
const COUNTS = [25, 30, 60, 90, 120];

test('boards have exactly n cells with sane label boxes', () => {
  for (const [W, H] of FIELDS) {
    for (const n of COUNTS) {
      for (let seed = 1; seed <= 60; seed++) {
        const cells = generateChaos(n, W, H, mulberry32(seed * 7919 + n));
        assert.equal(cells.length, n, `${W}x${H} n=${n} seed=${seed}`);
        for (const c of cells) {
          const b = c.box;
          assert.ok(b.w >= MIN_LABEL - 1e-9 && b.h >= MIN_LABEL - 1e-9, `label too small: ${JSON.stringify(b)}`);
          assert.ok(b.x >= -0.01 && b.y >= -0.01 && b.x + b.w <= W + 0.01 && b.y + b.h <= H + 0.01, 'label out of field');
          assert.ok(c.d.startsWith('M') && !c.d.includes('NaN'));
          assert.ok([0, 1, 2, 3].includes(c.fill));
          assert.ok([0, 90, -90].includes(c.rot));
        }
        // Label boxes never overlap, so every number is readable.
        for (let i = 0; i < cells.length; i++) {
          for (let j = i + 1; j < cells.length; j++) {
            const a = cells[i].box;
            const b = cells[j].box;
            const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
            const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
            assert.ok(ox <= 0.5 || oy <= 0.5, `overlap ${JSON.stringify(a)} ${JSON.stringify(b)}`);
          }
        }
      }
    }
  }
});

test('generation is deterministic for a given seed', () => {
  const a = generateChaos(60, 1600, 900, mulberry32(42));
  const b = generateChaos(60, 1600, 900, mulberry32(42));
  assert.deepEqual(a, b);
});

test('boards use the decorative shapes, not only rectangles', () => {
  const shapes = new Set();
  for (let seed = 1; seed <= 30; seed++) {
    for (const c of generateChaos(90, 1600, 900, mulberry32(seed))) {
      if (c.d.includes('A')) shapes.add('curve');
      else if (!/^M[\d. ]+H[\d.]+V[\d.]+H[\d.]+Z$/.test(c.d)) shapes.add('polygon');
      else shapes.add('rect');
    }
  }
  assert.deepEqual([...shapes].sort(), ['curve', 'polygon', 'rect']);
});
