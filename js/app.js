import {
  MODES, LAYOUTS, CHAOS_LEVELS, levels, isValidLevel, levelLabel, isExpert, needsUnderline, createGame, tap, currentTarget, elapsed, shuffle,
  pause, resume, formatTime, formatClock, rating, addResult, summarize, recordKey, resultKey,
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
    settings: { ...DEFAULT_SETTINGS, ...data.settings },
    stats: data.stats || { best: {}, history: [] },
  };
}

const state = load();

function save() {
  try {
    const { mode, layout, level, settings, stats } = state;
    localStorage.setItem(STORE_KEY, JSON.stringify({ mode, layout, level, settings, stats }));
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

  const best = state.stats.best[recordKey(state.mode, state.layout, state.level)];
  $('#best-line').innerHTML = best
    ? `Рекорд: <b>${formatTime(best.time)} с</b>`
    : 'рекорда пока нет';
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
  $('#hud-miss').textContent = game.mistakes;
  $('#progress-bar').style.width = `${(game.next / game.sequence.length) * 100}%`;
}

function tickTimer() {
  $('#hud-time').textContent = formatClock(elapsed(game));
}

// ---------- Game flow ----------
async function startGame() {
  stopGame();
  game = createGame(state.mode, state.layout, state.level);
  const chaos = game.layout === 'chaos';
  // Grid cells get poster colours by position; red labels keep to paper and mint.
  game.fills = game.board.map(() => {
    const f = Math.random() < 0.65 ? 0 : 1 + Math.floor(Math.random() * 3);
    return game.mode === 'gorbov' && f !== 2 ? 0 : f;
  });
  grid.hidden = chaos;
  svg.toggleAttribute('hidden', !chaos); // SVG elements have no .hidden property
  if (chaos) {
    // Landscape field on wide screens, portrait field on phones held upright.
    const landscape = window.innerWidth >= window.innerHeight * 0.9;
    const [W, H] = landscape ? [1600, 900] : [900, 1500];
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
    await fontReady();
  }
  renderBoard();
  renderHud();
  setPaused(false);
  $('#hud-time').textContent = formatClock(0);
  $('#focus-dot').classList.toggle('on', state.settings.focusDot);
  $('#game-hint').textContent = MODES[state.mode].hint.replace('N', game.sequence.length);
  show('game');

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
  $('#pause-icon').textContent = on ? '▶' : 'II';
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
  const result = tap(game, Number(el.dataset.id));
  if (result !== 'ignored') ensureTimer();

  if (result === 'miss') {
    flash(el, 'miss');
    sfx.miss();
    if (state.settings.vibrate) navigator.vibrate?.(80);
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
  if (result === 'done') finishGame();
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
  const time = elapsed(game);
  const cells = game.sequence.length;
  const result = {
    mode: game.mode, layout: game.layout, level: game.level, time, mistakes: game.mistakes, date: Date.now(),
  };
  const key = resultKey(result);
  const hadRecord = Boolean(state.stats.best[key]);
  const { stats, isRecord } = addResult(state.stats, result);
  state.stats = stats;
  save();

  const r = rating(time, cells, game.mistakes, game.layout, isExpert(game.layout, game.level));
  $('#result-badge').classList.toggle('on', isRecord && hadRecord);
  $('#result-title').textContent =
    `${MODES[game.mode].title} · ${LAYOUTS[game.layout].title} ${levelLabel(game.layout, game.level)}`;
  $('#result-stars').innerHTML = [1, 2, 3, 4, 5].map((i) => `<span class="${i <= r.stars ? 'on' : ''}">★</span>`).join('');
  $('#result-time').textContent = `${formatTime(time)} с`;
  $('#result-rating').textContent = r.text;
  $('#result-miss').textContent = game.mistakes;
  $('#result-per').textContent = `${(time / 1000 / cells).toFixed(2)} с`;
  $('#result-best').textContent = `${formatTime(stats.best[key].time)} с`;

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
function recordsTable(layout) {
  const cols = [...new Set(Object.keys(MODES).flatMap((m) => levels(m, layout)))].sort((a, b) => a - b);
  const { best, history } = state.stats;
  let html = `<table class="records"><tr><th>${LAYOUTS[layout].title}</th>` +
    `${cols.map((l) => `<th>${levelLabel(layout, l)}</th>`).join('')}</tr>`;
  for (const [mode, info] of Object.entries(MODES)) {
    html += `<tr><td>${info.title}</td>`;
    for (const level of cols) {
      const key = recordKey(mode, layout, level);
      const rec = best[key];
      if (!isValidLevel(mode, layout, level)) html += '<td class="empty">·</td>';
      else if (!rec) html += '<td class="empty">—</td>';
      else {
        const sum = summarize(history, key);
        const title = sum ? `Игр: ${sum.games}, среднее: ${formatTime(sum.average)} с` : '';
        html += `<td title="${title}">${formatTime(rec.time)}</td>`;
      }
    }
    html += '</tr>';
  }
  return `<div class="table-scroll">${html}</table></div>`;
}

function historyTitle(r) {
  const mode = MODES[r.mode]?.title ?? r.mode;
  if (!r.layout) return `${mode} ${r.size}×${r.size}`;
  return `${mode} · ${LAYOUTS[r.layout].title} ${levelLabel(r.layout, r.level)}`;
}

function renderStats() {
  const { history, best } = state.stats;
  const totalTime = history.reduce((s, r) => s + r.time, 0);
  $('#totals').innerHTML = `
    <div class="tile"><b>${history.length}</b><span>Игр</span></div>
    <div class="tile"><b>${Object.keys(best).length}</b><span>Рекордов</span></div>
    <div class="tile"><b>${Math.round(totalTime / 60000)}</b><span>Минут</span></div>`;

  $('#records').innerHTML = recordsTable('chaos') + recordsTable('grid');

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
      <span class="t">${formatTime(r.time)} с</span>
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
