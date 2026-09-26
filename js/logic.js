// Pure game logic for Schulte tables. No DOM access, so it can be tested in Node.

// sizes: grid side lengths; chaos: keys of CHAOS_LEVELS.
export const MODES = {
  numbers: {
    title: 'Числа', hint: 'Найдите числа по порядку от 1 до N',
    sizes: [3, 4, 5, 6, 7, 8, 9], chaos: [30, 60, 90, 'expert'],
  },
  reverse: {
    title: 'Обратный счёт', hint: 'Найдите числа от N до 1',
    sizes: [3, 4, 5, 6, 7, 8, 9], chaos: [30, 60, 90, 'expert'],
  },
  letters: {
    title: 'Буквы', hint: 'Найдите буквы в алфавитном порядке',
    sizes: [3, 4, 5], chaos: [15, 25],
  },
  gorbov: {
    title: 'Красно-чёрная', hint: 'Чередуйте: чёрные по возрастанию, красные по убыванию',
    sizes: [3, 4, 5, 6, 7], chaos: [30, 60, 90, 'expert'],
  },
};

// Levels of the chaotic board. The expert level has 120 cells,
// but its labels are tilted and found cells are not marked.
export const CHAOS_LEVELS = {
  15: { title: 'Лёгкий', cells: 15 },
  25: { title: 'Сложный', cells: 25 },
  30: { title: 'Лёгкий', cells: 30 },
  60: { title: 'Средний', cells: 60 },
  90: { title: 'Сложный', cells: 90 },
  expert: { title: 'Эксперт', cells: 120, expert: true },
};

export const LAYOUTS = {
  chaos: { title: 'Хаос', hint: 'Клетки всех форм и размеров вперемешку' },
  grid: { title: 'Сетка', hint: 'Классическая таблица Шульте' },
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

export function levels(mode, layout) {
  if (!MODES[mode] || !LAYOUTS[layout]) return [];
  return layout === 'grid' ? MODES[mode].sizes : MODES[mode].chaos;
}

export function isValidLevel(mode, layout, level) {
  return levels(mode, layout).includes(level);
}

export function cellCount(layout, level) {
  return layout === 'grid' ? level * level : CHAOS_LEVELS[level].cells;
}

export function isExpert(layout, level) {
  return layout === 'chaos' && Boolean(CHAOS_LEVELS[level]?.expert);
}

export function levelLabel(layout, level) {
  if (layout === 'grid') return `${level}×${level}`;
  const { title, cells } = CHAOS_LEVELS[level];
  return `${title} ${cells}`;
}

// Labels that turn into another label on the board when read upside down (6 and 9, 68 and 89)
// get underlined, so rotated numbers stay unambiguous.
const FLIP = { 0: '0', 1: '1', 6: '9', 8: '8', 9: '6' };
export function needsUnderline(label, labels) {
  if (!/^\d+$/.test(label) || [...label].some((d) => !(d in FLIP))) return false;
  const flipped = [...label].reverse().map((d) => FLIP[d]).join('');
  return flipped !== label && !flipped.startsWith('0') && labels.has(flipped);
}

// Returns the n cells in the order the player must find them.
// Each cell: { id, label, color } where color is 'black' | 'red' | null.
export function buildSequence(mode, n) {
  if (!MODES[mode] || !Number.isInteger(n) || n < 1) throw new Error(`Unsupported mode/count: ${mode} ${n}`);
  if (mode === 'letters' && n > ALPHABET.length) throw new Error(`Not enough letters for ${n} cells`);
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

export function createGame(mode, layout, level, random = Math.random) {
  if (!isValidLevel(mode, layout, level)) throw new Error(`Unsupported board: ${mode} ${layout} ${level}`);
  const sequence = buildSequence(mode, cellCount(layout, level));
  return {
    mode,
    layout,
    level,
    sequence,
    board: shuffle(sequence, random), // board[i] is the item shown in cell i
    next: 0,
    mistakes: 0,
    startedAt: null,
    finishedAt: null,
    pausedAt: null,
    pausedTotal: 0,
  };
}

export function pause(game, now = Date.now()) {
  if (game.startedAt === null || game.finishedAt !== null || game.pausedAt !== null) return false;
  game.pausedAt = now;
  return true;
}

export function resume(game, now = Date.now()) {
  if (game.pausedAt === null) return false;
  game.pausedTotal += now - game.pausedAt;
  game.pausedAt = null;
  return true;
}

// Applies a tap on the cell with the given id. Returns 'hit', 'miss', 'done' or 'ignored'.
export function tap(game, cellId, now = Date.now()) {
  if (game.finishedAt !== null || game.pausedAt !== null) return 'ignored';
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
  const end = game.finishedAt ?? game.pausedAt ?? now;
  return end - game.startedAt - game.pausedTotal;
}

// Grid keys keep the original "mode-size" format so older records stay valid.
export function recordKey(mode, layout, level) {
  return layout === 'grid' ? `${mode}-${level}` : `${mode}-x${level}`;
}

export function formatTime(ms) {
  const totalSec = ms / 1000;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec - min * 60;
  const secStr = sec.toFixed(2).padStart(5, '0');
  return min > 0 ? `${min}:${secStr}` : sec.toFixed(2);
}

// Game clock as on the board's timer plate: 00:58.
export function formatClock(ms) {
  const sec = Math.floor(ms / 1000);
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}

// Rough attention rating based on seconds per cell; mistakes add a penalty.
// Chaotic boards are much harder to scan, so their thresholds are doubled.
export function rating(ms, cells, mistakes, layout = 'grid', expert = false) {
  const factor = layout === 'chaos' ? (expert ? 2.6 : 2) : 1;
  const perCell = (ms / 1000 / cells + mistakes * 0.3 / cells) / factor;
  if (perCell <= 0.8) return { stars: 5, text: 'Феноменально!' };
  if (perCell <= 1.2) return { stars: 4, text: 'Отличное внимание' };
  if (perCell <= 1.7) return { stars: 3, text: 'Хороший результат' };
  if (perCell <= 2.5) return { stars: 2, text: 'Неплохо, тренируйтесь' };
  return { stars: 1, text: 'Есть куда расти' };
}

// Pure record/history update. Returns { stats, isRecord }.
export function addResult(stats, result, historyLimit = 100) {
  const key = resultKey(result);
  const prev = stats.best?.[key];
  const isRecord = prev === undefined || result.time < prev.time;
  const best = { ...(stats.best || {}) };
  if (isRecord) best[key] = { time: result.time, mistakes: result.mistakes, date: result.date };
  const history = [result, ...(stats.history || [])].slice(0, historyLimit);
  return { stats: { best, history }, isRecord };
}

// Results saved before layouts existed have only mode and size.
export function resultKey(r) {
  return r.layout ? recordKey(r.mode, r.layout, r.level) : recordKey(r.mode, 'grid', r.size);
}

export function summarize(history, key) {
  const games = history.filter((r) => resultKey(r) === key);
  if (!games.length) return null;
  const total = games.reduce((s, r) => s + r.time, 0);
  return {
    games: games.length,
    average: total / games.length,
    last: games[0].time,
  };
}
