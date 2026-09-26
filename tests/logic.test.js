import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MODES, LAYOUTS, levels, cellCount, buildSequence, createGame, tap, currentTarget, elapsed,
  formatTime, addResult, summarize, shuffle, isValidLevel, rating, pause, resume, recordKey, resultKey,
  isExpert, levelLabel, needsUnderline,
} from '../js/logic.js';

test('every mode builds a full sequence for every level of every layout', () => {
  for (const mode of Object.keys(MODES)) {
    for (const layout of Object.keys(LAYOUTS)) {
      for (const level of levels(mode, layout)) {
        const game = createGame(mode, layout, level);
        assert.equal(game.sequence.length, cellCount(layout, level), `${mode} ${layout} ${level}`);
        assert.equal(game.board.length, game.sequence.length);
        assert.deepEqual(game.sequence.map((c) => c.id), [...game.sequence.keys()]);
      }
    }
  }
});

test('numbers and reverse order', () => {
  assert.deepEqual(buildSequence('numbers', 9).map((c) => c.label), ['1', '2', '3', '4', '5', '6', '7', '8', '9']);
  assert.deepEqual(buildSequence('reverse', 9).map((c) => c.label), ['9', '8', '7', '6', '5', '4', '3', '2', '1']);
  assert.equal(buildSequence('numbers', 90).at(-1).label, '90');
});

test('letters are unique and alphabetical', () => {
  const labels = buildSequence('letters', 25).map((c) => c.label);
  assert.equal(new Set(labels).size, 25);
  assert.equal(labels[0], 'А');
  assert.throws(() => buildSequence('letters', 40));
});

test('gorbov alternates black ascending with red descending', () => {
  const seq = buildSequence('gorbov', 9);
  assert.deepEqual(
    seq.map((c) => `${c.color[0]}${c.label}`),
    ['b1', 'r4', 'b2', 'r3', 'b3', 'r2', 'b4', 'r1', 'b5'],
  );
  const big = buildSequence('gorbov', 49);
  assert.equal(big.filter((c) => c.color === 'black').length, 25);
  assert.equal(big.filter((c) => c.color === 'red').length, 24);
  assert.equal(new Set(big.map((c) => c.color + c.label)).size, 49);
  assert.equal(new Set(buildSequence('gorbov', 90).map((c) => c.color + c.label)).size, 90);
});

test('rejects unsupported boards', () => {
  assert.equal(isValidLevel('letters', 'grid', 7), false);
  assert.equal(isValidLevel('numbers', 'chaos', 90), true);
  assert.throws(() => createGame('letters', 'grid', 7));
  assert.throws(() => createGame('nope', 'grid', 3));
});

test('shuffle keeps all elements', () => {
  const a = [1, 2, 3, 4, 5, 6];
  assert.deepEqual(shuffle(a).sort(), a);
});

test('tap flow: hits, misses, finish', () => {
  const g = createGame('numbers', 'grid', 3);
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

test('pause stops the clock and blocks taps', () => {
  const g = createGame('numbers', 'chaos', 30);
  assert.equal(pause(g, 0), false); // not started yet
  tap(g, 0, 1000);
  assert.equal(pause(g, 3000), true);
  assert.equal(elapsed(g, 10000), 2000);
  assert.equal(tap(g, 1, 5000), 'ignored');
  assert.equal(resume(g, 8000), true);
  assert.equal(elapsed(g, 9000), 3000);
  assert.equal(tap(g, 1, 9000), 'hit');
});

test('formatTime', () => {
  assert.equal(formatTime(12345), '12.35');
  assert.equal(formatTime(75500), '1:15.50');
  assert.equal(formatTime(61000), '1:01.00');
});

test('rating gets better with speed and is gentler on chaotic boards', () => {
  assert.equal(rating(15000, 25, 0).stars, 5);
  assert.equal(rating(100000, 25, 0).stars, 1);
  assert.ok(rating(90000, 60, 0, 'chaos').stars > rating(90000, 60, 0, 'grid').stars);
});

test('record keys keep the old grid format', () => {
  assert.equal(recordKey('numbers', 'grid', 5), 'numbers-5');
  assert.equal(recordKey('numbers', 'chaos', 90), 'numbers-x90');
  assert.equal(resultKey({ mode: 'numbers', size: 5 }), 'numbers-5');
});

test('addResult tracks records and history', () => {
  let stats = {};
  const r1 = { mode: 'numbers', layout: 'chaos', level: 60, time: 30000, mistakes: 1, date: 1 };
  let res = addResult(stats, r1);
  assert.equal(res.isRecord, true);
  stats = res.stats;
  res = addResult(stats, { ...r1, time: 40000, date: 2 });
  assert.equal(res.isRecord, false);
  stats = res.stats;
  res = addResult(stats, { ...r1, time: 20000, date: 3 });
  assert.equal(res.isRecord, true);
  assert.equal(res.stats.best['numbers-x60'].time, 20000);
  assert.equal(res.stats.history.length, 3);
  const sum = summarize(res.stats.history, 'numbers-x60');
  assert.equal(sum.games, 3);
  assert.equal(sum.average, 30000);
  assert.equal(sum.last, 20000);
  assert.equal(summarize(res.stats.history, 'letters-3'), null);
});

test('expert level has 90 cells and its own records', () => {
  const g = createGame('numbers', 'chaos', 'expert');
  assert.equal(g.sequence.length, 90);
  assert.equal(isExpert('chaos', 'expert'), true);
  assert.equal(isExpert('chaos', 90), false);
  assert.equal(isValidLevel('letters', 'chaos', 'expert'), false);
  assert.equal(levelLabel('chaos', 'expert'), 'Эксперт 90');
  assert.equal(levelLabel('chaos', 90), 'Сложный 90');
  assert.notEqual(recordKey('numbers', 'chaos', 'expert'), recordKey('numbers', 'chaos', 90));
  assert.ok(rating(200000, 90, 0, 'chaos', true).stars >= rating(200000, 90, 0, 'chaos').stars);
});

test('numbers that read as another number upside down are underlined', () => {
  const labels = new Set(Array.from({ length: 90 }, (_, i) => String(i + 1)));
  for (const n of ['6', '9', '18', '81', '19', '61', '68', '89']) {
    assert.equal(needsUnderline(n, labels), true, n);
  }
  for (const n of ['1', '8', '11', '69', '96', '88', '10', '80', '7', '25', '16', '66', '86']) {
    assert.equal(needsUnderline(n, labels), false, n);
  }
  // 16, 66 and 86 would turn into 91, 99 and 98, which are not on a board of 90.
  // 6 has no partner when the board stops at 6.
  assert.equal(needsUnderline('6', new Set(['1', '2', '3', '4', '5', '6'])), false);
  assert.equal(needsUnderline('А', labels), false);
});
