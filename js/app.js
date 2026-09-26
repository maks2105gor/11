import {
  MODES, LAYOUTS, levels, isValidLevel, levelLabel, createGame, tap, currentTarget, elapsed, shuffle,
  pause, resume, formatTime, rating, addResult, summarize, recordKey, resultKey,
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
  theme: 'auto',
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

// ---------- Theme ----------
function applyTheme() {
  const t = state.settings.theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  $$('#theme-seg button').forEach((b) => b.classList.toggle('on', b.dataset.themeValue === t));
}

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
    chip(`<span class="ico">${key === 'chaos' ? '◩ ◔ ▱' : '▦ ▦ ▦'}</span>${layout.title}`, key === state.layout, () => {
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
    chip(levelLabel(state.layout, level), level === state.level, () => {
      state.level = level;
      save();
      renderMenu();
    })));

  const best = state.stats.best[recordKey(state.mode, state.layout, state.level)];
  $('#best-line').innerHTML = best
    ? `Рекорд: <b>${formatTime(best.time)} с</b>`
    : 'Рекорда пока нет — самое время его поставить';
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

// Fits a label into its box: stretched tall or wide within limits, like hand-painted signs.
function labelTransform(box, rot, label) {
  measureCtx.font = `600 100px ${LABEL_FONT}`;
  const m = measureCtx.measureText(label);
  const left = m.actualBoundingBoxLeft;
  const right = m.actualBoundingBoxRight;
  const ascent = m.actualBoundingBoxAscent;
  const descent = m.actualBoundingBoxDescent;
  const gw = Math.max(1, left + right);
  const gh = Math.max(1, ascent + descent);
  const pad = Math.min(0.16, 10 / Math.min(box.w, box.h) + 0.08);
  let aw = box.w * (1 - 2 * pad);
  let ah = box.h * (1 - 2 * pad);
  if (rot) [aw, ah] = [ah, aw];
  let sx = aw / gw;
  let sy = ah / gh;
  if (sy > sx * 2.4) sy = sx * 2.4;
  if (sy < sx * 0.8) sx = sy / 0.8;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const r = (n) => Math.round(n * 1000) / 1000;
  return `translate(${r(cx)} ${r(cy)}) rotate(${rot}) scale(${r(sx)} ${r(sy)}) ` +
    `translate(${r(-(right - left) / 2)} ${r((ascent - descent) / 2)})`;
}

function renderGrid() {
  grid.style.setProperty('--n', game.level);
  wrap.style.setProperty('--ar', 1);
  grid.innerHTML = '';
  for (const item of game.board) {
    const b = document.createElement('button');
    b.className = 'cell';
    b.type = 'button';
    b.dataset.id = item.id;
    b.textContent = item.label;
    if (item.color === 'red') b.classList.add('red');
    if (item.id < game.next && state.settings.markFound) b.classList.add('found');
    b.setAttribute('aria-label', ariaLabel(item));
    grid.append(b);
  }
}

function ariaLabel(item) {
  return `${item.color === 'red' ? 'красная ' : item.color === 'black' ? 'чёрная ' : ''}${item.label}`;
}

function renderChaos() {
  const [, , W, H] = svg.getAttribute('viewBox').split(' ').map(Number);
  wrap.style.setProperty('--ar', W / H);
  const frag = document.createDocumentFragment();
  zones.forEach((z, i) => {
    const item = game.board[i];
    // Keep pink and apricot away from red labels on the red-black board.
    const fill = game.mode === 'gorbov' && (z.fill === 1 || z.fill === 3) ? 0 : z.fill;
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', `zone f${fill}${item.color === 'red' ? ' red' : ''}` +
      `${item.id < game.next && state.settings.markFound ? ' found' : ''}`);
    g.dataset.id = item.id;
    g.setAttribute('role', 'button');
    g.setAttribute('tabindex', '0');
    g.setAttribute('aria-label', ariaLabel(item));
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', z.d);
    if (z.evenodd) path.setAttribute('fill-rule', 'evenodd');
    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('transform', labelTransform(z.box, z.rot, item.label));
    text.textContent = item.label;
    g.append(path, text);
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
  $('#hud-time').textContent = formatTime(elapsed(game));
}

// ---------- Game flow ----------
async function startGame() {
  stopGame();
  game = createGame(state.mode, state.layout, state.level);
  const chaos = game.layout === 'chaos';
  grid.hidden = chaos;
  svg.toggleAttribute('hidden', !chaos); // SVG elements have no .hidden property
  if (chaos) {
    // Landscape field on wide screens, portrait field on phones held upright.
    const landscape = window.innerWidth >= window.innerHeight * 0.9;
    const [W, H] = landscape ? [1600, 900] : [900, 1500];
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    zones = generateChaos(game.sequence.length, W, H);
    await fontReady();
  }
  renderBoard();
  renderHud();
  setPaused(false);
  $('#hud-time').textContent = '0.00';
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
  $('#btn-pause').textContent = on ? '▶' : 'II';
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
      if (state.settings.markFound) el.classList.add('found');
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

  const r = rating(time, cells, game.mistakes, game.layout);
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
    <div><b>${history.length}</b><span>Игр</span></div>
    <div><b>${Object.keys(best).length}</b><span>Рекордов</span></div>
    <div><b>${Math.round(totalTime / 60000)}</b><span>Минут</span></div>`;

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
$$('#theme-seg button').forEach((b) => b.addEventListener('click', () => {
  state.settings.theme = b.dataset.themeValue;
  save();
  applyTheme();
}));

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
applyTheme();
renderMenu();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
