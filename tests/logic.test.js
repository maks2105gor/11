import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MODES, buildSequence, createGame, tap, currentTarget, elapsed,
  formatTime, addResult, summarize, shuffle, isValidSize, rating,
} from '../js/logic.js';

test('every mode builds a full sequence for every supported size', () => {
  for (const [mode, { sizes }] of Object.entries(MODES)) {
    for (const size of sizes) {
      const seq = buildSequence(mode, size);
      assert.equal(seq.length, size * size, `${mode} ${size}`);
      assert.deepEqual(seq.map((c) => c.id), [...seq.keys()]);
    }
  }
});

test('numbers and reverse order', () => {
  assert.deepEqual(buildSequence('numbers', 3).map((c) => c.label), ['1', '2', '3', '4', '5', '6', '7', '8', '9']);
  assert.deepEqual(buildSequence('reverse', 3).map((c) => c.label), ['9', '8', '7', '6', '5', '4', '3', '2', '1']);
});

test('letters are unique and alphabetical', () => {
  const labels = buildSequence('letters', 5).map((c) => c.label);
  assert.equal(new Set(labels).size, 25);
  assert.equal(labels[0], 'А');
});

test('gorbov alternates black ascending with red descending', () => {
  const seq = buildSequence('gorbov', 3);
  assert.deepEqual(
    seq.map((c) => `${c.color[0]}${c.label}`),
    ['b1', 'r4', 'b2', 'r3', 'b3', 'r2', 'b4', 'r1', 'b5'],
  );
  const big = buildSequence('gorbov', 7);
  assert.equal(big.filter((c) => c.color === 'black').length, 25);
  assert.equal(big.filter((c) => c.color === 'red').length, 24);
  assert.equal(new Set(big.map((c) => c.color + c.label)).size, 49);
});

test('rejects unsupported sizes', () => {
  assert.equal(isValidSize('letters', 7), false);
  assert.throws(() => buildSequence('letters', 7));
  assert.throws(() => buildSequence('nope', 3));
});

test('shuffle keeps all elements', () => {
  const a = [1, 2, 3, 4, 5, 6];
  assert.deepEqual(shuffle(a).sort(), a);
});

test('tap flow: hits, misses, finish', () => {
  const g = createGame('numbers', 3);
  assert.equal(tap(g, 5, 1000), 'miss');
  assert.equal(g.mistakes, 1);
  assert.equal(g.startedAt, 1000);
  for (let i = 0; i < 8; i++) assert.equal(tap(g, i, 1000 + i), 'hit');
  assert.equal(tap(g, 3, 1500), 'ignored');
  assert.equal(currentTarget(g).label, '9');
  assert.equal(tap(g, 8, 4000), 'done');
  assert.equal(elapsed(g, 99999), 3000);
  assert.equal(tap(g, 8, 5000), 'ignored');
  assert.equal(currentTarget(g), null);
});

test('formatTime', () => {
  assert.equal(formatTime(12345), '12.35');
  assert.equal(formatTime(75500), '1:15.50');
  assert.equal(formatTime(61000), '1:01.00');
});

test('rating gets better with speed', () => {
  assert.equal(rating(15000, 25, 0).stars, 5);
  assert.equal(rating(100000, 25, 0).stars, 1);
});

test('addResult tracks records and history', () => {
  let stats = {};
  const r1 = { mode: 'numbers', size: 5, time: 30000, mistakes: 1, date: 1 };
  let res = addResult(stats, r1);
  assert.equal(res.isRecord, true);
  stats = res.stats;
  res = addResult(stats, { ...r1, time: 40000, date: 2 });
  assert.equal(res.isRecord, false);
  stats = res.stats;
  res = addResult(stats, { ...r1, time: 20000, date: 3 });
  assert.equal(res.isRecord, true);
  assert.equal(res.stats.best['numbers-5'].time, 20000);
  assert.equal(res.stats.history.length, 3);
  const sum = summarize(res.stats.history, 'numbers', 5);
  assert.equal(sum.games, 3);
  assert.equal(sum.average, 30000);
  assert.equal(sum.last, 20000);
  assert.equal(summarize(res.stats.history, 'letters', 3), null);
});
