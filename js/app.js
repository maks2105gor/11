import {
  MODES, LAYOUTS, CHAOS_LEVELS, levels, isValidLevel, levelLabel, isExpert, needsUnderline, createGame, tap, currentTarget, elapsed, shuffle,
  pause, resume, formatTime, formatClock,
  CHALLENGES, timeLeft, expire, newBoard, score, rating, addResult, summarize, recordKey, resultKey,
} from './logic.js';
import { generateChaos } from './chaos.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ---------- Storage ----------
const STORE_KEY = 'amazing-table:v1';
const DEFAULT_SETTINGS = {
  showTarget: true,
  markFound: true,
  shuffleOnHit: false,
  focusDot: false,
  countdown: true,
  sound: true,
  vibrate: true,
};
const DEFAULT_BOARD = { mode: 'numbers', layout: 'chaos', level: 30 };

// Russian plural: plural(5, 'число', 'числа', 'чисел') -> 'чисел'.
function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
const numbersWord = (n) => `${n} ${plural(n, 'число', 'числа', 'чисел')}`;

function load() {
  let data = {};
  try {
    data = JSON.parse(localStorage.getItem(STORE_KEY)) || {};
  } catch { /* storage unavailable or corrupted */ }
  const board = data.layout
    ? { mode: data.mode, layout: data.layout, level: data.level }
    : { ...DEFAULT_BOARD, mode: data.mode || DEFAULT_BOARD.mode }; // saves from before layouts existed
  return {
    ...(isValidLevel(board.mode, board.layout, board.level) ? board : DEFAULT_BOARD),
    challenge: CHALLENGES[data.challenge] ? data.challenge : 'all',
    settings: { ...DEFAULT_SETTINGS, ...data.settings },
    stats: data.stats || { best: {}, history: [] },
  };
}

const state = load();

function save() {
  try {
    const { mode, layout, level, challenge, settings, stats } = state;
    localStorage.setItem(STORE_KEY, JSON.stringify({ mode, layout, level, challenge, settings, stats }));
  } catch { /* storage unavailable: play without persistence */ }
}

// ---------- Sound ----------
let audio;
function beep(freq, duration = 0.07, type = 'sine', gain = 0.08) {
  if (!state.settings.sound) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    const osc = audio.createOscillator();
    const g = audio.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duration);
    osc.connect(g).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + duration);
  } catch { /* audio unsupported */ }
}
const sfx = {
  hit: () => beep(660, 0.06),
  miss: () => beep(180, 0.15, 'square', 0.05),
  tick: () => beep(440, 0.1, 'triangle'),
  win: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.14, 'triangle'), i * 110)),
};

// ---------- Screens ----------
let screenStack = ['menu'];
function show(name, push = true) {
  $$('.screen').forEach((s) => s.classList.toggle('active', s.id === `screen-${name}`));
  document.body.classList.toggle('wide', name === 'game' && game?.layout === 'chaos');
  document.body.classList.toggle('in-game', name === 'game');
  if (push) screenStack.push(name);
  window.scrollTo(0, 0);
}
function back() {
  screenStack.pop();
  const prev = screenStack[screenStack.length - 1] || 'menu';
  if (prev === 'menu') renderMenu();
  show(prev, false);
}
$$('[data-back]').forEach((b) => b.addEventListener('click', back));

// ---------- Menu ----------
const MODE_ICONS = {
  numbers: '1 2 3',
  reverse: '3 2 1',
  letters: 'А Б В',
  gorbov: '1 <span class="r">9</span> 2',
};

function chip(html, checked, onClick) {
  const b = document.createElement('button');
  b.className = 'chip';
  b.setAttribute('role', 'radio');
  b.setAttribute('aria-checked', String(checked));
  b.innerHTML = html;
  b.addEventListener('click', onClick);
  return b;
}

// Keeps the chosen level when possible, otherwise picks the closest one.
function fitLevel() {
  if (isValidLevel(state.mode, state.layout, state.level)) return;
  const options = levels(state.mode, state.layout);
  const target = state.layout === 'grid' ? 5 : 30;
  state.level = options.reduce((best, l) => (Math.abs(l - target) < Math.abs(best - target) ? l : best), options[0]);
}

function renderMenu() {
  $('#layout-list').replaceChildren(...Object.entries(LAYOUTS).map(([key, layout]) =>
    chip(`<span class="ico">${key === 'chaos' ? '17 · 4 · 62' : '3 × 3'}</span>${layout.title}`, key === state.layout, () => {
      state.layout = key;
      fitLevel();
      save();
      renderMenu();
    })));
  $('#layout-hint').textContent = LAYOUTS[state.layout].hint;

  $('#mode-list').replaceChildren(...Object.entries(MODES).map(([key, mode]) =>
    chip(`<span class="ico">${MODE_ICONS[key]}</span>${mode.title}`, key === state.mode, () => {
      state.mode = key;
      fitLevel();
      save();
      renderMenu();
    })));
  $('#mode-hint').textContent = MODES[state.mode].hint;

  $('#level-title').textContent = state.layout === 'grid' ? 'Размер таблицы' : 'Количество клеток';
  $('#size-list').replaceChildren(...levels(state.mode, state.layout).map((level) =>
    chip(state.layout === 'grid'
      ? levelLabel('grid', level)
      : `<span class="ico">${CHAOS_LEVELS[level].cells}</span>${CHAOS_LEVELS[level].title}`,
    level === state.level, () => {
      state.level = level;
      save();
      renderMenu();
    })));

  $('#challenge-list').replaceChildren(...Object.entries(CHALLENGES).map(([key, ch]) =>
    chip(`<span class="ico"><svg class="icon" aria-hidden="true"><use href="#i-${key === 'minute' ? 'clock' : 'flag'}"/></svg></span>${ch.short}`,
      key === state.challenge, () => {
        state.challenge = key;
        save();
        renderMenu();
      })));
  $('#challenge-hint').textContent = CHALLENGES[state.challenge].hint;

  const best = state.stats.best[recordKey(state.mode, state.layout, state.level, state.challenge)];
  $('#best-line').innerHTML = !best
    ? 'рекорда пока нет'
    : state.challenge === 'minute'
      ? `Рекорд: <b>${numbersWord(best.score)}</b>`
      : `Рекорд: <b>${formatTime(best.time)} с</b>`;
}

// ---------- Board rendering ----------
let game = null;
let zones = null; // chaotic board geometry, one entry per cell
let timerId = null;
let countdownTimers = [];

const wrap = $('#board-wrap');
const grid = $('#board');
const svg = $('#chaos');
const SVG_NS = 'http://www.w3.org/2000/svg';

const LABEL_FONT = '"Oswald", "Arial Narrow", "Roboto Condensed", sans-serif';
const measureCtx = document.createElement('canvas').getContext('2d');

function fontReady() {
  if (!document.fonts?.load) return Promise.resolve();
  const load = document.fonts.load(`600 100px ${LABEL_FONT}`, '0123456789АБВ').catch(() => {});
  return Promise.race([load, new Promise((r) => setTimeout(r, 1500))]);
}

// Fits a label into its box at any angle: stretched tall or wide within limits, like
// hand-painted signs. Underlined labels reserve room for the bar under the digits.
const UNDERLINE_GAP = 10;
const UNDERLINE_SIZE = 11;
function labelTransform(box, angle, label, underline) {
  measureCtx.font = `600 100px ${LABEL_FONT}`;
  const m = measureCtx.measureText(label);
  const left = m.actualBoundingBoxLeft;
  const right = m.actualBoundingBoxRight;
  const ascent = m.actualBoundingBoxAscent;
  const descent = m.actualBoundingBoxDescent + (underline ? UNDERLINE_GAP + UNDERLINE_SIZE : 0);
  const gw = Math.max(1, left + right);
  const gh = Math.max(1, ascent + descent);
  const pad = Math.min(0.16, 10 / Math.min(box.w, box.h) + 0.08);
  const aw = box.w * (1 - 2 * pad);
  const ah = box.h * (1 - 2 * pad);

  // Stretch ratio from the orientation the label mostly follows, then one scale that keeps
  // the rotated bounding box inside the available area.
  const sideways = Math.abs(Math.sin((angle * Math.PI) / 180)) > 0.7;
  const [along, across] = sideways ? [ah, aw] : [aw, ah];
  const k = Math.min(2.4, Math.max(0.8, (across / gh) / (along / gw)));
  const c = Math.abs(Math.cos((angle * Math.PI) / 180));
  const sn = Math.abs(Math.sin((angle * Math.PI) / 180));
  const sx = Math.min(aw / (c * gw + sn * gh * k), ah / (sn * gw + c * gh * k));
  const sy = sx * k;

  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const r = (n) => Math.round(n * 1000) / 1000;
  return {
    transform: `translate(${r(cx)} ${r(cy)}) rotate(${r(angle)}) scale(${r(sx)} ${r(sy)}) ` +
      `translate(${r(-(right - left) / 2)} ${r((ascent - descent) / 2)})`,
    underline: underline && { x: -left, y: m.actualBoundingBoxDescent + UNDERLINE_GAP, w: gw },
  };
}

// On the expert level found cells are not marked, so the player cannot skip them at a glance.
function marksFound() {
  return state.settings.markFound && !isExpert(game.layout, game.level);
}

function renderGrid() {
  grid.style.setProperty('--n', game.level);
  wrap.style.setProperty('--ar', 1);
  grid.innerHTML = '';
  game.board.forEach((item, i) => {
    const b = document.createElement('button');
    b.className = `cell f${game.fills[i]}`;
    b.type = 'button';
    b.dataset.id = item.id;
    b.textContent = item.label;
    if (item.color === 'red') b.classList.add('red');
    if (item.id < game.next && marksFound()) b.classList.add('found');
    b.setAttribute('aria-label', ariaLabel(item));
    grid.append(b);
  });
}

function ariaLabel(item) {
  return `${item.color === 'red' ? 'красная ' : item.color === 'black' ? 'чёрная ' : ''}${item.label}`;
}

function renderChaos() {
  const [, , W, H] = svg.getAttribute('viewBox').split(' ').map(Number);
  wrap.style.setProperty('--ar', W / H);
  const frag = document.createDocumentFragment();
  const labels = new Set(game.sequence.map((it) => it.label));
  zones.forEach((z, i) => {
    const item = game.board[i];
    // Keep pink and apricot away from red labels on the red-black board.
    const fill = game.mode === 'gorbov' && (z.fill === 1 || z.fill === 3) ? 0 : z.fill;
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', `zone f${fill}${item.color === 'red' ? ' red' : ''}` +
      `${item.id < game.next && marksFound() ? ' found' : ''}`);
    g.dataset.id = item.id;
    g.setAttribute('role', 'button');
    g.setAttribute('tabindex', '0');
    g.setAttribute('aria-label', ariaLabel(item));
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', z.d);
    if (z.evenodd) path.setAttribute('fill-rule', 'evenodd');
    const fit = labelTransform(z.box, z.angle, item.label, needsUnderline(item.label, labels));
    const label = document.createElementNS(SVG_NS, 'g');
    label.setAttribute('class', 'label');
    label.setAttribute('transform', fit.transform);
    const text = document.createElementNS(SVG_NS, 'text');
    text.textContent = item.label;
    label.append(text);
    if (fit.underline) {
      const bar = document.createElementNS(SVG_NS, 'rect');
      bar.setAttribute('x', fit.underline.x);
      bar.setAttribute('y', fit.underline.y);
      bar.setAttribute('width', fit.underline.w);
      bar.setAttribute('height', UNDERLINE_SIZE);
      label.append(bar);
    }
    g.append(path, label);
    frag.append(g);
  });
  svg.replaceChildren(frag);
}

function renderBoard() {
  if (game.layout === 'chaos') renderChaos();
  else renderGrid();
}

function renderHud() {
  const target = currentTarget(game);
  const el = $('#hud-target');
  el.textContent = target ? target.label : '';
  el.classList.toggle('red', target?.color === 'red');
  el.classList.toggle('hidden', !state.settings.showTarget);
  // In the minute challenge the second tile counts collected numbers instead of mistakes.
  const timed = game.timeLimit !== null;
  $('#hud-miss-label').textContent = timed ? 'Собрано' : 'Ошибки';
  $('#hud-miss').textContent = timed ? score(game) : game.mistakes;
  $('#progress-bar').style.width = `${(game.next / game.sequence.length) * 100}%`;
}

function tickTimer() {
  if (game.timeLimit === null) {
    $('#hud-time').textContent = formatClock(elapsed(game));
    return;
  }
  // Minute challenge: the timer counts down; the last ten seconds pulse.
  const left = timeLeft(game);
  $('#hud-time').textContent = formatClock(Math.ceil(left / 1000) * 1000);
  $('#btn-pause').classList.toggle('hurry', game.startedAt !== null && left <= 10000);
  if (expire(game)) finishGame();
}

// ---------- Chaotic board geometry ----------
// Every board has the same area in board units, so cells keep their size while the
// field takes the shape of the free space: wide on a landscape phone, tall upright.
const FIELD_AREA = 1600 * 900;

function fieldSize() {
  const cs = getComputedStyle(wrap);
  const chrome = parseFloat(cs.getPropertyValue('--chrome')) || 0;
  const side = parseFloat(cs.getPropertyValue('--side')) || 0;
  const w = Math.max(200, $('#screen-game').clientWidth - side);
  const h = Math.max(150, window.innerHeight - chrome);
  const ar = Math.min(2.2, Math.max(0.5, w / h));
  const W = Math.round(Math.sqrt(FIELD_AREA * ar));
  return [W, Math.round(FIELD_AREA / W)];
}

function buildChaos() {
  const [W, H] = fieldSize();
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  zones = generateChaos(game.sequence.length, W, H);
  const expert = isExpert(game.layout, game.level);
  for (const z of zones) {
    z.angle = z.rot;
    if (expert) {
      // Tilt every label a little and turn more of them sideways.
      if (!z.rot && Math.random() < 0.3) z.angle = Math.random() < 0.5 ? 90 : -90;
      z.angle += (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 22);
    }
  }
}

// When the phone is turned, the board is rebuilt for the new shape. Progress, time and
// mistakes stay; found numbers stay marked.
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (!game || game.layout !== 'chaos' || game.finishedAt !== null) return;
    if (!$('#screen-game').classList.contains('active')) return;
    const [W, H] = fieldSize();
    const [, , cw, ch] = svg.getAttribute('viewBox').split(' ').map(Number);
    if (Math.abs(Math.log((W / H) / (cw / ch))) < 0.15) return;
    buildChaos();
    renderBoard();
  }, 250);
});

// Grid cells get poster colours by position; red labels keep to paper and mint.
function refillGridColours() {
  game.fills = game.board.map(() => {
    const f = Math.random() < 0.65 ? 0 : 1 + Math.floor(Math.random() * 3);
    return game.mode === 'gorbov' && f !== 2 ? 0 : f;
  });
}

// ---------- Game flow ----------
async function startGame() {
  stopGame();
  game = createGame(state.mode, state.layout, state.level, Math.random, state.challenge);
  const chaos = game.layout === 'chaos';
  // Grid cells get poster colours by position; red labels keep to paper and mint.
  refillGridColours();
  grid.hidden = chaos;
  svg.toggleAttribute('hidden', !chaos); // SVG elements have no .hidden property
  svg.replaceChildren();
  show('game'); // the board is sized from the visible screen
  if (chaos) {
    buildChaos();
    await fontReady();
  }
  renderBoard();
  renderHud();
  setPaused(false);
  $('#hud-time').textContent = formatClock(0);
  $('#focus-dot').classList.toggle('on', state.settings.focusDot);
  $('#game-hint').textContent = MODES[state.mode].hint.replace('N', game.sequence.length);

  if (state.settings.countdown) {
    wrap.classList.add('locked');
    const cd = $('#countdown');
    cd.classList.add('on');
    [3, 2, 1].forEach((n, i) => {
      countdownTimers.push(setTimeout(() => { cd.innerHTML = `<span>${n}</span>`; sfx.tick(); }, i * 700));
    });
    countdownTimers.push(setTimeout(() => {
      cd.classList.remove('on');
      cd.innerHTML = '';
      wrap.classList.remove('locked');
      // With a countdown the clock starts as soon as the table is revealed.
      if (game.startedAt === null) game.startedAt = Date.now();
      ensureTimer();
    }, 2100));
  } else {
    wrap.classList.remove('locked');
  }
}

function ensureTimer() {
  if (!timerId) timerId = setInterval(tickTimer, 47);
}

function stopGame() {
  clearInterval(timerId);
  timerId = null;
  countdownTimers.forEach(clearTimeout);
  countdownTimers = [];
  $('#countdown').classList.remove('on');
  wrap.classList.remove('locked');
}

function setPaused(on) {
  $('#paused').hidden = !on;
  $('#pause-icon use').setAttribute('href', on ? '#i-play' : '#i-pause');
  $('#btn-pause').setAttribute('aria-label', on ? 'Продолжить' : 'Пауза');
}

function togglePause() {
  if (!game) return;
  if (game.pausedAt !== null) {
    resume(game);
    setPaused(false);
  } else if (pause(game)) {
    setPaused(true);
    tickTimer();
  }
}
$('#btn-pause').addEventListener('click', togglePause);
$('#paused').addEventListener('click', togglePause);

function flash(el, cls) {
  el.classList.remove(cls);
  void el.getBoundingClientRect(); // restart animation
  el.classList.add(cls);
}

function handleTap(el) {
  if (!el || !game) return;
  const mistakesBefore = game.mistakes;
  const result = tap(game, Number(el.dataset.id));
  if (result !== 'ignored') ensureTimer();

  // A wrong tap can also be the one that runs the minute out ('timeup').
  if (game.mistakes > mistakesBefore) {
    flash(el, 'miss');
    sfx.miss();
    if (game.timeLimit !== null) flash($('#btn-pause'), 'penalty');
    if (state.settings.vibrate) navigator.vibrate?.(80);
  } else if (result === 'board') {
    // Minute challenge: the board is cleared, a fresh one follows right away.
    sfx.hit();
    newBoard(game);
    if (game.layout === 'chaos') buildChaos();
    else refillGridColours();
    renderBoard();
    flash(wrap, 'refill');
  } else if (result === 'hit' || result === 'done') {
    sfx.hit();
    if (state.settings.shuffleOnHit && result === 'hit') {
      game.board = shuffle(game.board);
      renderBoard();
    } else {
      if (marksFound()) el.classList.add('found');
      flash(el, 'hit');
    }
  }
  renderHud();
  if (result === 'done' || result === 'timeup') finishGame();
}

wrap.addEventListener('pointerdown', (e) => {
  const el = e.target.closest('.cell, .zone');
  if (!el) return;
  e.preventDefault();
  handleTap(el);
});

// Keyboard access: Enter/Space on a focused cell.
wrap.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const el = e.target.closest('.cell, .zone');
  if (!el) return;
  e.preventDefault();
  handleTap(el);
});

function finishGame() {
  stopGame();
  tickTimer();
  sfx.win();
  const timed = game.timeLimit !== null;
  const time = elapsed(game);
  const cells = game.sequence.length;
  const result = {
    mode: game.mode, layout: game.layout, level: game.level, challenge: game.challenge,
    time, mistakes: game.mistakes, date: Date.now(),
  };
  if (timed) result.score = score(game);
  const key = resultKey(result);
  const hadRecord = Boolean(state.stats.best[key]);
  const { stats, isRecord } = addResult(state.stats, result);
  state.stats = stats;
  save();

  const expert = isExpert(game.layout, game.level);
  // A minute is rated like a full game: time per collected number.
  const r = timed
    ? rating(game.timeLimit, Math.max(1, result.score), 0, game.layout, expert)
    : rating(time, cells, game.mistakes, game.layout, expert);
  if (timed && result.score === 0) Object.assign(r, { stars: 1, text: 'Попробуйте ещё раз' });
  $('#result-badge').classList.toggle('on', isRecord && hadRecord);
  $('#result-title').textContent = `${timed ? 'Минута · ' : ''}${MODES[game.mode].title} · ` +
    `${LAYOUTS[game.layout].title} ${levelLabel(game.layout, game.level)}`;
  $('#result-stars').innerHTML = [1, 2, 3, 4, 5]
    .map((i) => `<svg class="star${i <= r.stars ? ' on' : ''}" aria-hidden="true"><use href="#i-star"/></svg>`).join('');
  $('#result-stars').setAttribute('aria-label', `${r.stars} из 5`);
  $('#result-rating').textContent = r.text;
  $('#result-miss').textContent = game.mistakes;
  if (timed) {
    $('#result-main-label').textContent = 'Собрано за минуту';
    $('#result-time').innerHTML =
      `${result.score} <small>${plural(result.score, 'число', 'числа', 'чисел')}</small>`;
    $('#result-per-label').textContent = 'На число';
    $('#result-per').textContent = result.score ? `${(game.timeLimit / 1000 / result.score).toFixed(2)} с` : '—';
    $('#result-best').textContent = numbersWord(stats.best[key].score);
  } else {
    $('#result-main-label').textContent = 'Время';
    $('#result-time').textContent = `${formatTime(time)} с`;
    $('#result-per-label').textContent = 'На клетку';
    $('#result-per').textContent = `${(time / 1000 / cells).toFixed(2)} с`;
    $('#result-best').textContent = `${formatTime(stats.best[key].time)} с`;
  }

  setTimeout(() => {
    screenStack = ['menu', 'result'];
    show('result', false);
  }, 450);
}

function toMenu() {
  stopGame();
  game = null;
  screenStack = ['menu'];
  renderMenu();
  show('menu', false);
}

$('#btn-start').addEventListener('click', () => { screenStack = ['menu']; startGame(); });
$('#btn-again').addEventListener('click', () => { screenStack = ['menu']; startGame(); });
$('#btn-menu').addEventListener('click', toMenu);
$('#btn-quit').addEventListener('click', toMenu);

// ---------- Stats ----------
function recordsTable(layout, challenge = 'all') {
  const cols = [...new Set(Object.keys(MODES).flatMap((m) => levels(m, layout)))].sort((a, b) => a - b);
  const { best, history } = state.stats;
  const minute = challenge === 'minute';
  const title = `${minute ? 'Минута · ' : ''}${LAYOUTS[layout].title}`;
  let html = `<table class="records"><tr><th>${title}</th>` +
    `${cols.map((l) => `<th>${levelLabel(layout, l)}</th>`).join('')}</tr>`;
  for (const [mode, info] of Object.entries(MODES)) {
    html += `<tr><td>${info.title}</td>`;
    for (const level of cols) {
      const key = recordKey(mode, layout, level, challenge);
      const rec = best[key];
      if (!isValidLevel(mode, layout, level)) html += '<td class="empty">·</td>';
      else if (!rec) html += '<td class="empty">—</td>';
      else {
        const sum = summarize(history, key);
        const avg = sum && (minute ? `${sum.average.toFixed(1)} чисел` : `${formatTime(sum.average)} с`);
        const hint = sum ? `Игр: ${sum.games}, среднее: ${avg}` : '';
        html += `<td title="${hint}">${minute ? rec.score : formatTime(rec.time)}</td>`;
      }
    }
    html += '</tr>';
  }
  return `<div class="table-scroll">${html}</table></div>`;
}

function historyTitle(r) {
  const mode = MODES[r.mode]?.title ?? r.mode;
  if (!r.layout) return `${mode} ${r.size}×${r.size}`;
  const prefix = r.challenge === 'minute' ? 'Минута · ' : '';
  return `${prefix}${mode} · ${LAYOUTS[r.layout].title} ${levelLabel(r.layout, r.level)}`;
}

function renderStats() {
  const { history, best } = state.stats;
  const totalTime = history.reduce((s, r) => s + r.time, 0);
  $('#totals').innerHTML = `
    <div class="tile"><b>${history.length}</b><span>Игр</span></div>
    <div class="tile"><b>${Object.keys(best).length}</b><span>Рекордов</span></div>
    <div class="tile"><b>${Math.round(totalTime / 60000)}</b><span>Минут</span></div>`;

  $('#records').innerHTML = recordsTable('chaos') + recordsTable('grid') +
    recordsTable('chaos', 'minute') + recordsTable('grid', 'minute');

  const list = $('#history');
  if (!history.length) {
    list.innerHTML = '<li class="empty-note">Сыграйте первую партию</li>';
    return;
  }
  const fmtDate = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  list.innerHTML = history.slice(0, 30).map((r) => `
    <li>
      <span>${historyTitle(r)}
        <span class="meta">· ${fmtDate.format(r.date)}${r.mistakes ? ` · ошибок: ${r.mistakes}` : ''}</span></span>
      <span class="t">${r.challenge === 'minute' ? numbersWord(r.score) : `${formatTime(r.time)} с`}</span>
    </li>`).join('');
}

$('#btn-stats').addEventListener('click', () => { renderStats(); show('stats'); });

// Two-step confirmation inside the page: the first tap arms the button, the second one resets.
let resetTimer = null;
const resetBtn = $('#btn-reset');
resetBtn.addEventListener('click', () => {
  if (!resetTimer) {
    resetBtn.textContent = 'Нажмите ещё раз, чтобы удалить всё';
    resetTimer = setTimeout(() => {
      resetTimer = null;
      resetBtn.textContent = 'Сбросить статистику';
    }, 3000);
    return;
  }
  clearTimeout(resetTimer);
  resetTimer = null;
  resetBtn.textContent = 'Статистика сброшена';
  state.stats = { best: {}, history: [] };
  save();
  renderStats();
  setTimeout(() => { resetBtn.textContent = 'Сбросить статистику'; }, 1500);
});

// ---------- Settings ----------
$$('[data-setting]').forEach((input) => {
  input.checked = Boolean(state.settings[input.dataset.setting]);
  input.addEventListener('change', () => {
    state.settings[input.dataset.setting] = input.checked;
    save();
  });
});

$('#btn-settings').addEventListener('click', () => show('settings'));
$('#btn-help').addEventListener('click', () => show('help'));

// Pause when the app goes to the background; release the audio device too.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (game && pause(game)) setPaused(true);
    if (audio?.state === 'running') audio.suspend();
  } else if (audio?.state === 'suspended') {
    audio.resume();
  }
});

// ---------- Init ----------
renderMenu();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
