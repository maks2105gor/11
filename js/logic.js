// Pure game logic for Schulte tables. No DOM access, so it can be tested in Node.

export const MODES = {
  numbers: { title: 'Числа', hint: 'Найдите числа по порядку от 1 до N', sizes: [3, 4, 5, 6, 7, 8, 9] },
  reverse: { title: 'Обратный счёт', hint: 'Найдите числа от N до 1', sizes: [3, 4, 5, 6, 7, 8, 9] },
  letters: { title: 'Буквы', hint: 'Найдите буквы в алфавитном порядке', sizes: [3, 4, 5] },
  gorbov: {
    title: 'Красно-чёрная',
    hint: 'Чередуйте: чёрные по возрастанию, красные по убыванию',
    sizes: [3, 4, 5, 6, 7],
  },
};

// Without Ё, Й, Ъ, Ь — the letters that are easy to confuse or rarely used.
export const ALPHABET = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЫЭЮЯ';

export function shuffle(array, random = Math.random) {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function isValidSize(mode, size) {
  return Boolean(MODES[mode]) && MODES[mode].sizes.includes(size);
}

// Returns the cells in the order the player must find them.
// Each cell: { id, label, color } where color is 'black' | 'red' | null.
export function buildSequence(mode, size) {
  if (!isValidSize(mode, size)) throw new Error(`Unsupported mode/size: ${mode} ${size}`);
  const n = size * size;
  const make = (label, color = null) => ({ label: String(label), color });
  let seq;

  switch (mode) {
    case 'numbers':
      seq = Array.from({ length: n }, (_, i) => make(i + 1));
      break;
    case 'reverse':
      seq = Array.from({ length: n }, (_, i) => make(n - i));
      break;
    case 'letters':
      seq = Array.from(ALPHABET.slice(0, n), (ch) => make(ch));
      break;
    case 'gorbov': {
      const blacks = Math.ceil(n / 2);
      const reds = Math.floor(n / 2);
      seq = [];
      for (let i = 0; i < blacks; i++) {
        seq.push(make(i + 1, 'black'));
        if (i < reds) seq.push(make(reds - i, 'red'));
      }
      break;
    }
  }
  return seq.map((cell, id) => ({ id, ...cell }));
}

export function createGame(mode, size, random = Math.random) {
  const sequence = buildSequence(mode, size);
  return {
    mode,
    size,
    sequence,
    board: shuffle(sequence, random),
    next: 0,
    mistakes: 0,
    startedAt: null,
    finishedAt: null,
  };
}

// Applies a tap on the cell with the given id. Returns 'hit', 'miss', 'done' or 'ignored'.
export function tap(game, cellId, now = Date.now()) {
  if (game.finishedAt !== null) return 'ignored';
  if (game.startedAt === null) game.startedAt = now;
  if (cellId < game.next) return 'ignored'; // already found
  if (cellId !== game.next) {
    game.mistakes++;
    return 'miss';
  }
  game.next++;
  if (game.next === game.sequence.length) {
    game.finishedAt = now;
    return 'done';
  }
  return 'hit';
}

export function currentTarget(game) {
  return game.sequence[game.next] ?? null;
}

export function elapsed(game, now = Date.now()) {
  if (game.startedAt === null) return 0;
  return (game.finishedAt ?? now) - game.startedAt;
}

export function recordKey(mode, size) {
  return `${mode}-${size}`;
}

export function formatTime(ms) {
  const totalSec = ms / 1000;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec - min * 60;
  const secStr = sec.toFixed(2).padStart(5, '0');
  return min > 0 ? `${min}:${secStr}` : sec.toFixed(2);
}

// Rough attention rating based on seconds per cell; mistakes add a penalty.
export function rating(ms, cells, mistakes) {
  const perCell = ms / 1000 / cells + mistakes * 0.3 / cells;
  if (perCell <= 0.8) return { stars: 5, text: 'Феноменально!' };
  if (perCell <= 1.2) return { stars: 4, text: 'Отличное внимание' };
  if (perCell <= 1.7) return { stars: 3, text: 'Хороший результат' };
  if (perCell <= 2.5) return { stars: 2, text: 'Неплохо, тренируйтесь' };
  return { stars: 1, text: 'Есть куда расти' };
}

// Pure record/history update. Returns { stats, isRecord }.
export function addResult(stats, result, historyLimit = 100) {
  const key = recordKey(result.mode, result.size);
  const prev = stats.best?.[key];
  const isRecord = prev === undefined || result.time < prev.time;
  const best = { ...(stats.best || {}) };
  if (isRecord) best[key] = { time: result.time, mistakes: result.mistakes, date: result.date };
  const history = [result, ...(stats.history || [])].slice(0, historyLimit);
  return { stats: { best, history }, isRecord };
}

export function summarize(history, mode, size) {
  const games = history.filter((r) => r.mode === mode && r.size === size);
  if (!games.length) return null;
  const total = games.reduce((s, r) => s + r.time, 0);
  return {
    games: games.length,
    average: total / games.length,
    last: games[0].time,
  };
}
