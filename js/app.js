import {
  MODES, createGame, tap, currentTarget, elapsed, shuffle,
  formatTime, rating, addResult, summarize, recordKey, isValidSize,
} from './logic.js';

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

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORE_KEY)) || {};
    return {
      mode: data.mode || 'numbers',
      size: data.size || 5,
      settings: { ...DEFAULT_SETTINGS, ...data.settings },
      stats: data.stats || { best: {}, history: [] },
    };
  } catch {
    return { mode: 'numbers', size: 5, settings: { ...DEFAULT_SETTINGS }, stats: { best: {}, history: [] } };
  }
}

const state = load();
if (!isValidSize(state.mode, state.size)) { state.mode = 'numbers'; state.size = 5; }

function save() {
  try {
    const { mode, size, settings, stats } = state;
    localStorage.setItem(STORE_KEY, JSON.stringify({ mode, size, settings, stats }));
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

function renderMenu() {
  const modeList = $('#mode-list');
  modeList.innerHTML = '';
  for (const [key, mode] of Object.entries(MODES)) {
    const b = document.createElement('button');
    b.className = 'chip';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(key === state.mode));
    b.innerHTML = `<span class="ico">${MODE_ICONS[key]}</span>${mode.title}`;
    b.addEventListener('click', () => {
      state.mode = key;
      if (!isValidSize(key, state.size)) state.size = MODES[key].sizes.includes(5) ? 5 : MODES[key].sizes[0];
      save();
      renderMenu();
    });
    modeList.append(b);
  }
  $('#mode-hint').textContent = MODES[state.mode].hint;

  const sizeList = $('#size-list');
  sizeList.innerHTML = '';
  for (const size of MODES[state.mode].sizes) {
    const b = document.createElement('button');
    b.className = 'chip';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(size === state.size));
    b.textContent = `${size}×${size}`;
    b.addEventListener('click', () => {
      state.size = size;
      save();
      renderMenu();
    });
    sizeList.append(b);
  }

  const best = state.stats.best[recordKey(state.mode, state.size)];
  $('#best-line').innerHTML = best
    ? `Рекорд: <b>${formatTime(best.time)} с</b>`
    : 'Рекорда пока нет — самое время его поставить';
}

// ---------- Game ----------
let game = null;
let timerId = null;
let countdownTimers = [];

const board = $('#board');

function targetText(cell) {
  return cell ? cell.label : '';
}

function renderHud() {
  const target = currentTarget(game);
  const el = $('#hud-target');
  el.textContent = targetText(target);
  el.classList.toggle('red', target?.color === 'red');
  el.classList.toggle('hidden', !state.settings.showTarget);
  $('#hud-miss').textContent = game.mistakes;
  $('#progress-bar').style.width = `${(game.next / game.sequence.length) * 100}%`;
}

function renderBoard() {
  board.style.setProperty('--n', game.size);
  board.innerHTML = '';
  for (const cell of game.board) {
    const b = document.createElement('button');
    b.className = 'cell';
    b.type = 'button';
    b.dataset.id = cell.id;
    b.textContent = cell.label;
    if (cell.color === 'red') b.classList.add('red');
    if (cell.id < game.next && state.settings.markFound) b.classList.add('found');
    b.setAttribute('aria-label', `${cell.color === 'red' ? 'красная ' : cell.color === 'black' ? 'чёрная ' : ''}${cell.label}`);
    board.append(b);
  }
}

function tickTimer() {
  $('#hud-time').textContent = formatTime(elapsed(game));
}

function startGame() {
  stopGame();
  game = createGame(state.mode, state.size);
  renderBoard();
  renderHud();
  $('#hud-time').textContent = '0.00';
  $('#focus-dot').classList.toggle('on', state.settings.focusDot);
  $('#game-hint').textContent = MODES[state.mode].hint.replace('N', game.sequence.length);
  show('game');

  if (state.settings.countdown) {
    board.classList.add('locked');
    const cd = $('#countdown');
    cd.classList.add('on');
    [3, 2, 1].forEach((n, i) => {
      countdownTimers.push(setTimeout(() => { cd.innerHTML = `<span>${n}</span>`; sfx.tick(); }, i * 700));
    });
    countdownTimers.push(setTimeout(() => {
      cd.classList.remove('on');
      cd.innerHTML = '';
      board.classList.remove('locked');
      beginTiming();
    }, 2100));
  } else {
    board.classList.remove('locked');
  }
}

function beginTiming() {
  // With countdown the clock starts as soon as the table is revealed.
  if (game.startedAt === null) game.startedAt = Date.now();
  ensureTimer();
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
}

function flash(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth; // restart animation
  el.classList.add(cls);
}

board.addEventListener('pointerdown', (e) => {
  const el = e.target.closest('.cell');
  if (!el || !game) return;
  e.preventDefault();
  const result = tap(game, Number(el.dataset.id));
  ensureTimer();

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
});

// Keyboard access: Enter/Space on a focused cell.
board.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('cell')) {
    e.preventDefault();
    e.target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  }
});

function finishGame() {
  stopGame();
  tickTimer();
  sfx.win();
  const time = elapsed(game);
  const cells = game.sequence.length;
  const result = { mode: game.mode, size: game.size, time, mistakes: game.mistakes, date: Date.now() };
  const hadRecord = Boolean(state.stats.best[recordKey(game.mode, game.size)]);
  const { stats, isRecord } = addResult(state.stats, result);
  state.stats = stats;
  save();

  const r = rating(time, cells, game.mistakes);
  $('#result-badge').classList.toggle('on', isRecord && hadRecord);
  $('#result-title').textContent = `${MODES[game.mode].title}, ${game.size}×${game.size}`;
  $('#result-stars').innerHTML = [1, 2, 3, 4, 5].map((i) => `<span class="${i <= r.stars ? 'on' : ''}">★</span>`).join('');
  $('#result-time').textContent = `${formatTime(time)} с`;
  $('#result-rating').textContent = r.text;
  $('#result-miss').textContent = game.mistakes;
  $('#result-per').textContent = `${(time / 1000 / cells).toFixed(2)} с`;
  $('#result-best').textContent = `${formatTime(stats.best[recordKey(game.mode, game.size)].time)} с`;

  setTimeout(() => {
    screenStack = ['menu', 'result'];
    show('result', false);
  }, 450);
}

$('#btn-start').addEventListener('click', () => { screenStack = ['menu']; startGame(); });
$('#btn-again').addEventListener('click', () => { screenStack = ['menu']; startGame(); });
$('#btn-menu').addEventListener('click', () => { screenStack = ['menu']; renderMenu(); show('menu', false); });
$('#btn-quit').addEventListener('click', () => {
  stopGame();
  game = null;
  screenStack = ['menu'];
  renderMenu();
  show('menu', false);
});

// ---------- Stats ----------
function renderStats() {
  const { history, best } = state.stats;
  const totalTime = history.reduce((s, r) => s + r.time, 0);
  const records = Object.keys(best).length;
  $('#totals').innerHTML = `
    <div><b>${history.length}</b><span>Игр</span></div>
    <div><b>${records}</b><span>Рекордов</span></div>
    <div><b>${Math.round(totalTime / 60000)}</b><span>Минут</span></div>`;

  const allSizes = [...new Set(Object.values(MODES).flatMap((m) => m.sizes))].sort((a, b) => a - b);
  let html = `<tr><th>Режим</th>${allSizes.map((s) => `<th>${s}×${s}</th>`).join('')}</tr>`;
  for (const [key, mode] of Object.entries(MODES)) {
    html += `<tr><td>${mode.title}</td>`;
    for (const size of allSizes) {
      const rec = best[recordKey(key, size)];
      if (!mode.sizes.includes(size)) html += '<td class="empty">·</td>';
      else if (!rec) html += '<td class="empty">—</td>';
      else {
        const sum = summarize(history, key, size);
        const title = sum ? `Игр: ${sum.games}, среднее: ${formatTime(sum.average)} с` : '';
        html += `<td title="${title}">${formatTime(rec.time)}</td>`;
      }
    }
    html += '</tr>';
  }
  $('#records').innerHTML = html;

  const list = $('#history');
  if (!history.length) {
    list.innerHTML = '<li class="empty-note">Сыграйте первую партию</li>';
    return;
  }
  const fmtDate = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  list.innerHTML = history.slice(0, 30).map((r) => `
    <li>
      <span>${MODES[r.mode]?.title ?? r.mode} ${r.size}×${r.size}
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

// Release the audio device while the app is in the background.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && audio?.state === 'running') audio.suspend();
  else if (!document.hidden && audio?.state === 'suspended') audio.resume();
});

// ---------- Init ----------
applyTheme();
renderMenu();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
