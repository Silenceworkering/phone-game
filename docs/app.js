// ============================================================
// Phone Numbers — Часть 1/3
// ============================================================

const API_BASE = 'https://phone-game.onrender.com';
const TOKEN_KEY = 'pn_user_token';
const SOUND_KEY = 'pn_sound_enabled';

const state = {
  token: localStorage.getItem(TOKEN_KEY) || '',
  user: null,
  meta: null,
  balance: 0,
  spinsTotal: 0,
  inventory: [],
  selected: new Set(),
  invFilter: 'all',
  country: 'RU',
  operatorCode: null,
  minRarity: 'common',
  spinning: false,
  pending: null,
  multiSelected: new Set(),
  multiPhones: [],
  multiAutoSaveDone: false,
  usedPromos: new Set(),
  lbMode: 'balance',
  bonusTimer: null,
  luckInfo: null,
  boostTimers: {},
  marketTab: 'all',
  soundEnabled: localStorage.getItem(SOUND_KEY) !== '0'
};

const $ = id => document.getElementById(id);
const fmt = n => Math.round(n).toLocaleString('ru-RU');

// ============ SOUNDS ============
let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) { return null; }
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playTone(freq, duration, type, volume) {
  if (!state.soundEnabled) return;
  const ctx = getAudioCtx(); if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume || 0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) {}
}

function playSound(name) {
  if (!state.soundEnabled) return;
  switch (name) {
    case 'spin':
      for (let i = 0; i < 15; i++) setTimeout(() => playTone(400 + Math.random() * 300, 0.05, 'square', 0.05), i * 180);
      break;
    case 'common': playTone(300, 0.15, 'sine', 0.1); break;
    case 'rare':
      playTone(500, 0.12, 'triangle', 0.12);
      setTimeout(() => playTone(650, 0.15, 'triangle', 0.12), 100);
      break;
    case 'epic':
      playTone(500, 0.1, 'triangle', 0.13);
      setTimeout(() => playTone(700, 0.1, 'triangle', 0.13), 80);
      setTimeout(() => playTone(900, 0.2, 'triangle', 0.15), 160);
      break;
    case 'mythic':
      playTone(600, 0.1, 'sawtooth', 0.12);
      setTimeout(() => playTone(800, 0.1, 'sawtooth', 0.12), 80);
      setTimeout(() => playTone(1000, 0.1, 'sawtooth', 0.13), 160);
      setTimeout(() => playTone(1200, 0.3, 'sawtooth', 0.15), 240);
      break;
    case 'legendary':
      playTone(600, 0.15, 'sine', 0.15);
      setTimeout(() => playTone(800, 0.15, 'sine', 0.15), 120);
      setTimeout(() => playTone(1000, 0.15, 'sine', 0.15), 240);
      setTimeout(() => playTone(1300, 0.5, 'sine', 0.18), 360);
      break;
    case 'secret':
      for (let i = 0; i < 8; i++) setTimeout(() => playTone(500 + i * 150, 0.15, 'sine', 0.15), i * 80);
      setTimeout(() => playTone(1800, 0.8, 'sine', 0.2), 700);
      break;
    case 'sell':
      playTone(800, 0.08, 'sine', 0.15);
      setTimeout(() => playTone(1000, 0.08, 'sine', 0.15), 60);
      setTimeout(() => playTone(1200, 0.15, 'sine', 0.15), 120);
      break;
    case 'buy':
      playTone(400, 0.1, 'sine', 0.12);
      setTimeout(() => playTone(600, 0.15, 'sine', 0.15), 80);
      break;
    case 'ach':
      playTone(700, 0.15, 'sine', 0.15);
      setTimeout(() => playTone(900, 0.15, 'sine', 0.15), 150);
      setTimeout(() => playTone(1100, 0.4, 'sine', 0.18), 300);
      break;
    case 'error': playTone(200, 0.3, 'sawtooth', 0.1); break;
    case 'click': playTone(600, 0.04, 'square', 0.06); break;
    case 'open': playTone(500, 0.08, 'sine', 0.08); break;
  }
}

function vibrate(type) {
  if (!state.soundEnabled) return;
  try {
    const tg = window.Telegram && window.Telegram.WebApp;
    if (!tg || !tg.HapticFeedback) return;
    if (type === 'light') tg.HapticFeedback.impactOccurred('light');
    else if (type === 'medium') tg.HapticFeedback.impactOccurred('medium');
    else if (type === 'heavy') tg.HapticFeedback.impactOccurred('heavy');
    else if (type === 'success') tg.HapticFeedback.notificationOccurred('success');
    else if (type === 'error') tg.HapticFeedback.notificationOccurred('error');
    else if (type === 'warning') tg.HapticFeedback.notificationOccurred('warning');
  } catch (e) {}
}

function vibrateByRarity(rarity) {
  if (rarity === 'common') return;
  if (rarity === 'rare') vibrate('light');
  else if (rarity === 'epic') vibrate('medium');
  else if (rarity === 'mythic') vibrate('heavy');
  else if (rarity === 'legendary') {
    vibrate('success');
    setTimeout(() => vibrate('heavy'), 200);
  } else if (rarity === 'secret') {
    vibrate('success');
    setTimeout(() => vibrate('heavy'), 200);
    setTimeout(() => vibrate('heavy'), 400);
    setTimeout(() => vibrate('heavy'), 600);
  }
}

// ============ HELPERS ============
function getRarity(key) {
  if (!state.meta) return { name: '—', color: '#8e8e93', desc: '' };
  return state.meta.rarities.find(r => r.key === key) || { name: key, color: '#8e8e93', desc: '' };
}

function getCountry(code) {
  if (!state.meta) return { code: code, flag: '🌍', name: code, operators: [] };
  return state.meta.countries.find(c => c.code === code) || state.meta.countries[0];
}

async function api(path, options) {
  options = options || {};
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
  if (options.headers) Object.assign(headers, options.headers);
  const res = await fetch(API_BASE + path, Object.assign({}, options, { headers: headers }));
  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    state.token = '';
  }
  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }
  if (!res.ok) throw new Error((data && data.detail) || ('HTTP ' + res.status));
  return data;
}

async function authenticate() {
  const tg = window.Telegram && window.Telegram.WebApp;
  if (!tg || !tg.initData) throw new Error('Открой игру через бота');
  let refCode = null;
  try {
    const urlParams = new URLSearchParams(window.location.search);
    refCode = urlParams.get('start');
    if (!refCode && tg.initDataUnsafe && tg.initDataUnsafe.start_param) {
      refCode = tg.initDataUnsafe.start_param;
    }
  } catch (e) {}
  const body = { init_data: tg.initData };
  if (refCode && refCode.indexOf('ref_') === 0) body.ref_code = refCode;
  const res = await fetch(API_BASE + '/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error('Auth failed');
  const data = await res.json();
  state.token = data.token;
  state.user = data.user;
  state.balance = data.user.balance;
  state.spinsTotal = data.user.spins_total || 0;
  localStorage.setItem(TOKEN_KEY, state.token);
}

async function loadMeta() {
  const res = await fetch(API_BASE + '/api/status', { cache: 'no-store' });
  if (!res.ok) throw new Error('Не удалось загрузить данные игры');
  state.meta = await res.json();
  if (state.meta.maintenance) {
    showMaintenance(state.meta.maintenance_text || 'Технические работы');
    return false;
  }
  return true;
}

async function loadProfile() {
  const me = await api('/api/me');
  state.user = me;
  state.balance = me.balance;
  state.spinsTotal = me.spins_total || 0;
  if (me.luck) state.luckInfo = me.luck;
}

async function loadInventory() {
  try {
    const res = await api('/api/inventory');
    state.inventory = res.items || [];
  } catch (e) { state.inventory = []; }
}

let toastTimer = null;
function showToast(text, color) {
  const t = $('toast'); if (!t) return;
  t.textContent = text;
  t.style.color = color || '#fff';
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

function fireworks(color) {
  const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
  const layer = $('fireworks'); if (!layer) return;
  for (let i = 0; i < 30; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.left = cx + 'px'; p.style.top = cy + 'px';
    p.style.background = color; p.style.boxShadow = '0 0 10px ' + color;
    const angle = (Math.PI * 2 * i) / 30 + Math.random() * 0.3;
    const dist = 100 + Math.random() * 220;
    p.style.setProperty('--tx', Math.cos(angle) * dist + 'px');
    p.style.setProperty('--ty', Math.sin(angle) * dist + 'px');
    layer.appendChild(p);
    setTimeout(() => p.remove(), 1300);
  }
}

function showMaintenance(text) {
  if ($('maintOverlay')) return;
  const o = document.createElement('div');
  o.id = 'maintOverlay';
  o.style.cssText = 'position:fixed;inset:0;z-index:99999;background:linear-gradient(160deg,#14141f,#0b0b12);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:30px;color:#fff;';
  o.innerHTML = '<div style="font-size:80px;margin-bottom:20px;">🛠</div><div style="font-size:24px;font-weight:900;margin-bottom:12px;">Технические работы</div><div style="font-size:15px;color:#6e6e85;font-weight:700;max-width:320px;line-height:1.5;">' + text + '</div>';
  document.body.appendChild(o);
}

function showAchievementPopup(ach) {
  playSound('ach');
  vibrate('success');
  const n = $('achName'); if (n) n.textContent = ach.name;
  const d = $('achDesc'); if (d) d.textContent = ach.desc;
  const r = $('achReward'); if (r) r.textContent = '+' + fmt(ach.reward) + ' ₽';
  const m = $('achModal'); if (m) m.classList.add('show');
  fireworks('#ffd60a');
}

function checkNewAchievements(res) {
  if (res && res.new_achievements && res.new_achievements.length) {
    res.new_achievements.forEach((a, i) => setTimeout(() => showAchievementPopup(a), i * 800));
  }
}

function updateUI() {
  const b = $('balance'); if (b) b.textContent = fmt(state.balance) + ' ₽';
  const s = $('spinCount'); if (s) s.textContent = fmt(state.spinsTotal);
  const t = $('tabInvCount'); if (t) t.textContent = state.inventory.length;
  const smi = $('smiInvCount'); if (smi) smi.textContent = state.inventory.length;
  updateSpinButtons();
  updateSelectionBar();
  updateLuckPill();
  updateBoosts();
}

function updateSpinButtons() {
  if (!state.meta) return;
  let cost = state.meta.spin_costs[state.minRarity] || 500;
  if (state.meta.boost_discount && state.meta.boost_discount.active) cost = Math.floor(cost * 0.5);
  if (state.meta.boost_golden && state.meta.boost_golden.active) cost = Math.floor(cost * 0.5);
  const p1 = $('spinBtnPrice'); if (p1) p1.textContent = fmt(cost) + ' ₽';
  const p5 = $('spinBtn5Price'); if (p5) p5.textContent = fmt(cost * 5) + ' ₽';
}

function updateSelectionBar() {
  const alive = new Set(state.inventory.map(i => i.id));
  for (const id of Array.from(state.selected)) if (!alive.has(id)) state.selected.delete(id);
  const bar = $('invSelectionBar');
  const actions = $('invActions');
  const count = state.selected.size;
  if (count === 0) {
    if (bar) bar.classList.remove('visible');
    if (actions) actions.style.display = 'none';
  } else {
    if (bar) bar.classList.add('visible');
    if (actions) actions.style.display = 'block';
    let sum = 0;
    state.inventory.forEach(i => { if (state.selected.has(i.id)) sum += i.price; });
    const c = $('invSelCount'); if (c) c.textContent = 'Выбрано: ' + count;
    const s = $('invSelSum'); if (s) s.textContent = fmt(sum) + ' ₽';
  }
}

function updateLuckPill() {
  const pill = $('luckPill');
  const mult = $('luckMult');
  const prog = $('luckProgress');
  if (!pill || !state.luckInfo) return;
  const info = state.luckInfo;
  mult.textContent = '×' + info.next_mult;
  prog.textContent = info.progress + '/100';
  if (info.left <= 5) pill.classList.add('almost');
  else pill.classList.remove('almost');
}

function openLuckModal() {
  if (!state.luckInfo) return;
  playSound('click');
  const info = state.luckInfo;
  const m = $('luckModal'); if (m) m.classList.add('show');
  const nx = $('luckModalNext'); if (nx) nx.textContent = 'Следующая удача ×' + info.next_mult;
  const fill = $('luckModalFill'); if (fill) fill.style.width = info.progress + '%';
  const left = $('luckModalLeft'); if (left) left.textContent = 'Осталось: ' + info.left + ' круток';
  const pr = $('luckModalProgress'); if (pr) pr.textContent = info.progress + '/100';
  const sup = $('luckModalSuper'); if (sup) sup.textContent = 'До супер-удачи ×25: ' + info.super_left + ' круток';
}

function updateBoosts() {
  const row = $('boostsRow');
  if (!row || !state.meta) return;
  const boosts = [
    { key: 'boost_golden', el: 'boostGolden', timer: 'boostGoldenTimer' },
    { key: 'boost_double', el: 'boostDouble', timer: 'boostDoubleTimer' },
    { key: 'boost_discount', el: 'boostDiscount', timer: 'boostDiscountTimer' }
  ];
  let anyActive = false;
  boosts.forEach(b => {
    const info = state.meta[b.key];
    const el = $(b.el);
    if (info && info.active) {
      anyActive = true;
      if (el) el.style.display = 'inline-block';
      startBoostTimer(b.key, info.seconds_left, b.timer);
    } else {
      if (el) el.style.display = 'none';
    }
  });
  row.style.display = anyActive ? 'flex' : 'none';
}

function startBoostTimer(key, secondsLeft, timerElId) {
  if (state.boostTimers[key]) return;
  let left = secondsLeft;
  const el = $(timerElId);
  function tick() {
    if (left <= 0) {
      clearInterval(state.boostTimers[key]);
      delete state.boostTimers[key];
      setTimeout(() => refreshStatus(), 500);
      return;
    }
    const m = Math.floor(left / 60);
    const s = left % 60;
    if (el) el.textContent = m + ':' + (s < 10 ? '0' : '') + s;
    left--;
  }
  tick();
  state.boostTimers[key] = setInterval(tick, 1000);
}

async function refreshStatus() {
  try {
    const res = await fetch(API_BASE + '/api/status', { cache: 'no-store' });
    if (res.ok) {
      state.meta = await res.json();
      updateSpinButtons();
      updateBoosts();
    }
  } catch (e) {}
}

// ============ SIDE MENU ============
function openSideMenu() {
  playSound('open');
  const menu = $('sideMenu');
  const bg = $('sideMenuBackdrop');
  if (menu) menu.classList.add('open');
  if (bg) bg.classList.add('show');
}

function closeSideMenu() {
  const menu = $('sideMenu');
  const bg = $('sideMenuBackdrop');
  if (menu) menu.classList.remove('open');
  if (bg) bg.classList.remove('show');
}

function setupSideMenu() {
  const burger = $('burgerBtn');
  const close = $('sideMenuClose');
  const bg = $('sideMenuBackdrop');
  if (burger) burger.addEventListener('click', openSideMenu);
  if (close) close.addEventListener('click', closeSideMenu);
  if (bg) bg.addEventListener('click', closeSideMenu);
  document.querySelectorAll('.side-menu-item').forEach(item => {
    item.addEventListener('click', () => {
      const page = item.dataset.page;
      closeSideMenu();
      switchPage(page);
    });
  });
  const soundBtn = $('soundToggle');
  if (soundBtn) soundBtn.addEventListener('click', toggleSound);
}

function toggleSound() {
  state.soundEnabled = !state.soundEnabled;
  localStorage.setItem(SOUND_KEY, state.soundEnabled ? '1' : '0');
  const icon = $('soundIcon');
  const text = $('soundText');
  if (icon) icon.textContent = state.soundEnabled ? '🔊' : '🔇';
  if (text) text.textContent = state.soundEnabled ? 'Звук вкл' : 'Звук выкл';
  if (state.soundEnabled) playSound('click');
}

// ============ PAGE SWITCHING ============
function switchPage(pageName) {
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('active', t.dataset.page === pageName);
  });
  document.querySelectorAll('.side-menu-item').forEach(t => {
    t.classList.toggle('active', t.dataset.page === pageName);
  });
  document.querySelectorAll('.page').forEach(p => {
    p.classList.toggle('active', p.id === 'page-' + pageName);
  });

  const controlsSpin = $('controls');
  if (controlsSpin) {
    if (pageName === 'roulette') controlsSpin.style.display = 'flex';
    else controlsSpin.style.display = 'none';
  }

  if (pageName === 'inventory') renderInventory();
  if (pageName === 'countries') renderCountries();
  if (pageName === 'craft') loadCraft();
  if (pageName === 'top') loadLeaderboard();
  if (pageName === 'profile') { loadTrades(); loadAchievements(); }
  if (pageName === 'quests') loadQuests();
  if (pageName === 'market') loadMarket();
  if (pageName === 'dice') loadDice();
  if (pageName === 'referral') loadReferral();
}

// ============ RENDER SELECTORS ============
function renderCountrySelector() {
  const wrap = $('countrySelector'); if (!wrap || !state.meta) return;
  wrap.innerHTML = '';
  state.meta.countries.forEach(c => {
    const el = document.createElement('div');
    el.className = 'country-chip' + (c.code === state.country ? ' active' : '');
    el.innerHTML = '<span class="cf">' + c.flag + '</span><span class="cn">' + c.name + '</span>';
    el.addEventListener('click', () => {
      if (state.spinning) return;
      playSound('click');
      state.country = c.code;
      state.operatorCode = null;
      document.querySelectorAll('#countrySelector .country-chip').forEach(n => n.classList.remove('active'));
      el.classList.add('active');
      renderOperatorSelector();
      renderStaticReels();
    });
    wrap.appendChild(el);
  });
}

function renderOperatorSelector() {
  const wrap = $('operatorSelector'); if (!wrap || !state.meta) return;
  wrap.innerHTML = '';
  const country = getCountry(state.country);
  const anyEl = document.createElement('div');
  anyEl.className = 'country-chip op-chip-mini' + (state.operatorCode === null ? ' active' : '');
  anyEl.innerHTML = '<span class="cf">🎲</span><span class="cn">Любой</span>';
  anyEl.addEventListener('click', () => {
    if (state.spinning) return;
    playSound('click');
    state.operatorCode = null;
    renderOperatorSelector();
    renderStaticReels();
  });
  wrap.appendChild(anyEl);
  (country.operators || []).forEach(op => {
    const el = document.createElement('div');
    el.className = 'country-chip op-chip-mini' + (state.operatorCode === op.code ? ' active' : '');
    el.innerHTML = '<span class="cn">' + op.name + '</span>';
    el.addEventListener('click', () => {
      if (state.spinning) return;
      playSound('click');
      state.operatorCode = op.code;
      renderOperatorSelector();
      renderStaticReels();
    });
    wrap.appendChild(el);
  });
}

function renderRarityOptions() {
  const wrap = $('rarityOptions'); if (!wrap || !state.meta) return;
  wrap.innerHTML = '';
  state.meta.rarity_filters.forEach(key => {
    const r = getRarity(key);
    const cost = state.meta.spin_costs[key];
    const el = document.createElement('div');
    el.className = 'rarity-opt' + (key === state.minRarity ? ' active' : '');
    el.style.color = r.color;
    el.innerHTML = '<span class="dot"></span><span class="name">' + r.name + '</span><span class="price">' + fmt(cost) + '</span>';
    el.addEventListener('click', () => {
      if (state.spinning) return;
      playSound('click');
      state.minRarity = key;
      document.querySelectorAll('.rarity-opt').forEach(n => n.classList.remove('active'));
      el.classList.add('active');
      updateSpinButtons();
    });
    wrap.appendChild(el);
  });
}
// ============================================================
// Phone Numbers — Часть 2/3
// ============================================================

// ============ REELS (БАРАБАНЫ) ============
function buildReelStrip(reel, finalPhone) {
  const digits = finalPhone ? finalPhone.replace(/\D/g, '') : null;
  const cells = [];
  const count = 12;
  for (let i = 0; i < count; i++) {
    if (i === count - 1 && digits) {
      cells.push(digits[reel] || '0');
    } else {
      cells.push(String(Math.floor(Math.random() * 10)));
    }
  }
  return cells;
}

function renderStaticReels() {
  const reels = document.querySelectorAll('.reel');
  if (!reels.length) return;
  reels.forEach((reelEl, idx) => {
    const strip = reelEl.querySelector('.reel-strip');
    if (!strip) return;
    strip.innerHTML = '';
    const cells = buildReelStrip(idx, null);
    cells.forEach(d => {
      const c = document.createElement('div');
      c.className = 'reel-cell';
      c.textContent = d;
      strip.appendChild(c);
    });
    strip.style.transform = 'translateY(0)';
  });
}

function animateReels(finalPhone, onDone) {
  const reels = document.querySelectorAll('.reel');
  if (!reels.length) { onDone && onDone(); return; }

  const digits = finalPhone.replace(/\D/g, '');
  const CELL_H = 90;
  let finished = 0;

  reels.forEach((reelEl, idx) => {
    const strip = reelEl.querySelector('.reel-strip');
    if (!strip) return;

    strip.innerHTML = '';
    const cells = buildReelStrip(idx, finalPhone);
    cells.forEach(d => {
      const c = document.createElement('div');
      c.className = 'reel-cell';
      c.textContent = d;
      strip.appendChild(c);
    });

    const totalH = (cells.length - 1) * CELL_H;
    const duration = 900 + idx * 220;
    const delay = idx * 120;

    strip.style.transition = 'none';
    strip.style.transform = 'translateY(0)';

    setTimeout(() => {
      strip.style.transition = 'transform ' + duration + 'ms cubic-bezier(0.15, 0.85, 0.25, 1)';
      strip.style.transform = 'translateY(-' + totalH + 'px)';
    }, 30 + delay);

    setTimeout(() => {
      const cell = strip.querySelectorAll('.reel-cell')[cells.length - 1];
      if (cell) cell.classList.add('landed');
      finished++;
      if (finished === reels.length) onDone && onDone();
    }, duration + delay + 80);
  });
}

// ============ SPIN LOGIC ============
async function doSpin(multi) {
  if (state.spinning) return;
  if (!state.meta) return;

  const count = multi || 1;
  let cost = state.meta.spin_costs[state.minRarity] || 500;
  if (state.meta.boost_discount && state.meta.boost_discount.active) cost = Math.floor(cost * 0.5);
  if (state.meta.boost_golden && state.meta.boost_golden.active) cost = Math.floor(cost * 0.5);
  const totalCost = cost * count;

  if (state.balance < totalCost) {
    showToast('Недостаточно средств', '#ff453a');
    playSound('error');
    vibrate('error');
    return;
  }

  state.spinning = true;
  setSpinButtonsDisabled(true);
  playSound('spin');
  vibrate('light');

  const body = {
    rarity: state.minRarity,
    country: state.country,
    operator_code: state.operatorCode,
    count: count
  };

  try {
    if (count === 1) {
      // Одиночный спин: сначала анимация, потом результат
      const res = await api('/api/spin', {
        method: 'POST',
        body: JSON.stringify(body)
      });

      const phone = res.item ? res.item.phone : '0000000000';
      state.balance = res.balance !== undefined ? res.balance : state.balance;
      state.spinsTotal = res.spins_total !== undefined ? res.spins_total : state.spinsTotal;
      updateUI();

      animateReels(phone, () => {
        handleSpinResult(res);
      });
    } else {
      // Мультиспин: без анимации барабанов, сразу список
      const res = await api('/api/spin', {
        method: 'POST',
        body: JSON.stringify(body)
      });

      state.balance = res.balance !== undefined ? res.balance : state.balance;
      state.spinsTotal = res.spins_total !== undefined ? res.spins_total : state.spinsTotal;
      updateUI();

      handleMultiSpinResult(res);
    }
  } catch (e) {
    showToast(e.message || 'Ошибка спина', '#ff453a');
    playSound('error');
    vibrate('error');
    state.spinning = false;
    setSpinButtonsDisabled(false);
  }
}

function setSpinButtonsDisabled(disabled) {
  const b1 = $('spinBtn');
  const b5 = $('spinBtn5');
  if (b1) b1.disabled = disabled;
  if (b5) b5.disabled = disabled;
  const c = $('controls');
  if (c) c.classList.toggle('spinning', disabled);
}

function handleSpinResult(res) {
  state.spinning = false;
  setSpinButtonsDisabled(false);

  const item = res.item;
  if (!item) {
    showToast('Пустой результат', '#ff453a');
    return;
  }

  state.inventory.unshift(item);
  updateUI();

  const rarity = getRarity(item.rarity);
  playSound(item.rarity);
  vibrateByRarity(item.rarity);

  if (item.rarity === 'legendary' || item.rarity === 'secret') {
    fireworks(rarity.color);
  }

  showResultCard(item, rarity);
  checkNewAchievements(res);
  if (res.luck) { state.luckInfo = res.luck; updateLuckPill(); }
  refreshStatus();
}

function handleMultiSpinResult(res) {
  state.spinning = false;
  setSpinButtonsDisabled(false);

  const items = res.items || [];
  if (!items.length) {
    showToast('Пустой результат', '#ff453a');
    return;
  }

  items.forEach(it => state.inventory.unshift(it));
  updateUI();

  const best = items.reduce((a, b) => {
    const order = ['common', 'rare', 'epic', 'mythic', 'legendary', 'secret'];
    return order.indexOf(b.rarity) > order.indexOf(a.rarity) ? b : a;
  }, items[0]);

  playSound(best.rarity);
  vibrateByRarity(best.rarity);
  if (best.rarity === 'legendary' || best.rarity === 'secret') {
    fireworks(getRarity(best.rarity).color);
  }

  showMultiResultCard(items);
  checkNewAchievements(res);
  if (res.luck) { state.luckInfo = res.luck; updateLuckPill(); }
  refreshStatus();
}

// ============ RESULT CARDS ============
function showResultCard(item, rarity) {
  const m = $('resultModal');
  if (!m) return;

  const phoneEl = $('resultPhone');
  const rarityEl = $('resultRarity');
  const countryEl = $('resultCountry');
  const opEl = $('resultOperator');
  const priceEl = $('resultPrice');
  const glowEl = $('resultGlow');

  if (phoneEl) phoneEl.textContent = formatPhone(item.phone);
  if (rarityEl) {
    rarityEl.textContent = rarity.name;
    rarityEl.style.color = rarity.color;
  }
  if (countryEl) {
    const c = getCountry(item.country);
    countryEl.textContent = c.flag + ' ' + c.name;
  }
  if (opEl) opEl.textContent = item.operator_name || '—';
  if (priceEl) priceEl.textContent = fmt(item.price) + ' ₽';
  if (glowEl) {
    glowEl.style.background = 'radial-gradient(circle, ' + rarity.color + '55 0%, transparent 70%)';
  }

  m.classList.add('show');
  m.dataset.itemId = item.id;
}

function showMultiResultCard(items) {
  const m = $('multiResultModal');
  if (!m) return;

  const list = $('multiResultList');
  if (list) {
    list.innerHTML = '';
    items.forEach(it => {
      const r = getRarity(it.rarity);
      const row = document.createElement('div');
      row.className = 'multi-result-row';
      row.innerHTML =
        '<span class="mr-phone" style="color:' + r.color + '">' + formatPhone(it.phone) + '</span>' +
        '<span class="mr-rarity" style="color:' + r.color + '">' + r.name + '</span>' +
        '<span class="mr-price">' + fmt(it.price) + ' ₽</span>';
      list.appendChild(row);
    });
  }

  let total = 0;
  items.forEach(it => total += it.price);
  const sumEl = $('multiResultSum');
  if (sumEl) sumEl.textContent = fmt(total) + ' ₽';

  m.classList.add('show');
}

function closeResultModal() {
  const m = $('resultModal');
  if (m) m.classList.remove('show');
}

function closeMultiResultModal() {
  const m = $('multiResultModal');
  if (m) m.classList.remove('show');
  state.multiPhones = [];
}
// ============ PHONE FORMAT ============
function formatPhone(raw) {
  if (!raw) return '—';
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 11) {
    return '+' + digits[0] + ' (' + digits.slice(1, 4) + ') ' + digits.slice(4, 7) + '-' + digits.slice(7, 9) + '-' + digits.slice(9, 11);
  }
  if (digits.length === 10) {
    return '+7 (' + digits.slice(0, 3) + ') ' + digits.slice(3, 6) + '-' + digits.slice(6, 8) + '-' + digits.slice(8, 10);
  }
  return '+' + digits;
}

// ============ INVENTORY RENDER ============
function renderInventory() {
  const wrap = $('invList');
  if (!wrap) return;
  wrap.innerHTML = '';

  let items = state.inventory.slice();
  if (state.invFilter !== 'all') {
    items = items.filter(i => i.rarity === state.invFilter);
  }

  if (!items.length) {
    wrap.innerHTML = '<div class="empty-state">Пока пусто. Крути рулетку!</div>';
    updateSelectionBar();
    return;
  }

  items.forEach(it => {
    const r = getRarity(it.rarity);
    const card = document.createElement('div');
    card.className = 'inv-card' + (state.selected.has(it.id) ? ' selected' : '');
    card.dataset.id = it.id;
    card.style.borderColor = r.color + '66';
    card.innerHTML =
      '<div class="inv-glow" style="background:radial-gradient(circle,' + r.color + '44 0%,transparent 70%)"></div>' +
      '<div class="inv-phone">' + formatPhone(it.phone) + '</div>' +
      '<div class="inv-rarity" style="color:' + r.color + '">' + r.name + '</div>' +
      '<div class="inv-meta">' + (getCountry(it.country).flag) + ' ' + (it.operator_name || '') + '</div>' +
      '<div class="inv-price">' + fmt(it.price) + ' ₽</div>' +
      '<div class="inv-check">✓</div>';

    card.addEventListener('click', (e) => {
      if (e.shiftKey || state.selected.size > 0) {
        toggleSelect(it.id);
      } else {
        openItemModal(it);
      }
    });
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      toggleSelect(it.id);
    });

    wrap.appendChild(card);
  });

  updateSelectionBar();
}

function toggleSelect(id) {
  if (state.selected.has(id)) state.selected.delete(id);
  else state.selected.add(id);
  playSound('click');
  renderInventory();
}

function clearSelection() {
  state.selected.clear();
  renderInventory();
}

function selectAllVisible() {
  state.inventory.forEach(i => {
    if (state.invFilter === 'all' || i.rarity === state.invFilter) {
      state.selected.add(i.id);
    }
  });
  renderInventory();
}

// ============ FILTERS ============
function setupInvFilters() {
  document.querySelectorAll('#invFilters .inv-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      playSound('click');
      state.invFilter = btn.dataset.rarity || 'all';
      document.querySelectorAll('#invFilters .inv-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderInventory();
    });
  });
}

// ============ ITEM MODAL ============
function openItemModal(item) {
  playSound('open');
  const m = $('itemModal');
  if (!m) return;
  const r = getRarity(item.rarity);
  const phoneEl = $('itemPhone'); if (phoneEl) { phoneEl.textContent = formatPhone(item.phone); phoneEl.style.color = r.color; }
  const rarityEl = $('itemRarity'); if (rarityEl) { rarityEl.textContent = r.name; rarityEl.style.color = r.color; }
  const descEl = $('itemDesc'); if (descEl) descEl.textContent = r.desc || '';
  const countryEl = $('itemCountry'); if (countryEl) countryEl.textContent = getCountry(item.country).flag + ' ' + getCountry(item.country).name;
  const opEl = $('itemOperator'); if (opEl) opEl.textContent = item.operator_name || '—';
  const priceEl = $('itemPrice'); if (priceEl) priceEl.textContent = fmt(item.price) + ' ₽';
  const idEl = $('itemId'); if (idEl) idEl.textContent = '#' + item.id;
  m.dataset.itemId = item.id;
  m.classList.add('show');
}

function closeItemModal() {
  const m = $('itemModal');
  if (m) m.classList.remove('show');
}

async function sellSelected() {
  if (!state.selected.size) return;
  const ids = Array.from(state.selected);
  try {
    const res = await api('/api/sell', {
      method: 'POST',
      body: JSON.stringify({ ids: ids })
    });
    state.balance = res.balance !== undefined ? res.balance : state.balance + (res.total || 0);
    state.selected.clear();
    await loadInventory();
    updateUI();
    renderInventory();
    playSound('sell');
    vibrate('success');
    showToast('Продано на ' + fmt(res.total || 0) + ' ₽', '#30d158');
    checkNewAchievements(res);
  } catch (e) {
    showToast(e.message || 'Ошибка продажи', '#ff453a');
    playSound('error');
  }
}

async function sellOne(itemId) {
  try {
    const res = await api('/api/sell', {
      method: 'POST',
      body: JSON.stringify({ ids: [itemId] })
    });
    state.balance = res.balance !== undefined ? res.balance : state.balance + (res.total || 0);
    await loadInventory();
    updateUI();
    renderInventory();
    playSound('sell');
    vibrate('success');
    showToast('Продано на ' + fmt(res.total || 0) + ' ₽', '#30d158');
    closeItemModal();
    checkNewAchievements(res);
  } catch (e) {
    showToast(e.message || 'Ошибка продажи', '#ff453a');
    playSound('error');
  }
}

// ============ EVENT BINDINGS (частичные) ============
function setupSpinControls() {
  const b1 = $('spinBtn');
  const b5 = $('spinBtn5');
  if (b1) b1.addEventListener('click', () => doSpin(1));
  if (b5) b5.addEventListener('click', () => doSpin(5));
}

function setupModals() {
  const closeIds = [
    ['resultClose', closeResultModal],
    ['multiResultClose', closeMultiResultModal],
    ['itemClose', closeItemModal]
  ];
  closeIds.forEach(pair => {
    const el = $(pair[0]);
    if (el) el.addEventListener('click', () => { playSound('click'); pair[1](); });
  });

  const sellBtn = $('itemSellBtn');
  if (sellBtn) sellBtn.addEventListener('click', () => {
    const m = $('itemModal');
    if (m && m.dataset.itemId) sellOne(Number(m.dataset.itemId));
  });

  const sellSelBtn = $('invSellSelected');
  if (sellSelBtn) sellSelBtn.addEventListener('click', sellSelected);

  const clearBtn = $('invClearSel');
  if (clearBtn) clearBtn.addEventListener('click', clearSelection);

  const allBtn = $('invSelectAll');
  if (allBtn) allBtn.addEventListener('click', selectAllVisible);
}
// ============================================================
// Phone Numbers — Часть 3/3
// ============================================================

// ============ COUNTRIES ============
function renderCountries() {
  const wrap = $('countriesList');
  if (!wrap || !state.meta) return;
  wrap.innerHTML = '';

  state.meta.countries.forEach(c => {
    const card = document.createElement('div');
    card.className = 'country-card';
    card.innerHTML =
      '<div class="cc-flag">' + c.flag + '</div>' +
      '<div class="cc-name">' + c.name + '</div>' +
      '<div class="cc-code">+' + (c.dial || '') + '</div>' +
      '<div class="cc-ops">' + (c.operators || []).length + ' операторов</div>';
    card.addEventListener('click', () => {
      playSound('click');
      state.country = c.code;
      state.operatorCode = null;
      switchPage('roulette');
      renderCountrySelector();
      renderOperatorSelector();
      renderStaticReels();
    });
    wrap.appendChild(card);
  });
}

// ============ CRAFT ============
async function loadCraft() {
  const wrap = $('craftList');
  if (!wrap) return;
  wrap.innerHTML = '<div class="loading">Загрузка...</div>';
  try {
    const res = await api('/api/craft/recipes');
    renderCraftRecipes(res.recipes || []);
  } catch (e) {
    wrap.innerHTML = '<div class="empty-state">Не удалось загрузить рецепты</div>';
  }
}

function renderCraftRecipes(recipes) {
  const wrap = $('craftList');
  if (!wrap) return;
  wrap.innerHTML = '';

  if (!recipes.length) {
    wrap.innerHTML = '<div class="empty-state">Рецептов пока нет</div>';
    return;
  }

  recipes.forEach(rec => {
    const r = getRarity(rec.result_rarity || 'common');
    const card = document.createElement('div');
    card.className = 'craft-card';
    card.style.borderColor = r.color + '55';

    let ingredientsHtml = '';
    (rec.ingredients || []).forEach(ing => {
      const have = state.inventory.filter(i => i.rarity === ing.rarity).length;
      const ok = have >= ing.count;
      ingredientsHtml +=
        '<div class="craft-ing ' + (ok ? 'ok' : 'no') + '">' +
          '<span>' + getRarity(ing.rarity).name + '</span>' +
          '<span>' + have + '/' + ing.count + '</span>' +
        '</div>';
    });

    card.innerHTML =
      '<div class="craft-title">' + rec.name + '</div>' +
      '<div class="craft-result" style="color:' + r.color + '">→ ' + r.name + '</div>' +
      '<div class="craft-ings">' + ingredientsHtml + '</div>' +
      '<button class="btn-craft" data-id="' + rec.id + '">Крафтить</button>';

    const btn = card.querySelector('.btn-craft');
    btn.addEventListener('click', () => doCraft(rec.id));

    wrap.appendChild(card);
  });
}

async function doCraft(recipeId) {
  try {
    const res = await api('/api/craft', {
      method: 'POST',
      body: JSON.stringify({ recipe_id: recipeId })
    });
    playSound('buy');
    vibrate('success');
    showToast('Скрафчено!', '#30d158');
    await loadInventory();
    updateUI();
    loadCraft();
    if (res.item) {
      const r = getRarity(res.item.rarity);
      if (res.item.rarity === 'legendary' || res.item.rarity === 'secret') fireworks(r.color);
    }
    checkNewAchievements(res);
  } catch (e) {
    showToast(e.message || 'Ошибка крафта', '#ff453a');
    playSound('error');
  }
}

// ============ LEADERBOARD ============
async function loadLeaderboard() {
  const wrap = $('lbList');
  if (!wrap) return;
  wrap.innerHTML = '<div class="loading">Загрузка...</div>';
  try {
    const res = await api('/api/leaderboard?mode=' + state.lbMode);
    renderLeaderboard(res.top || [], res.me);
  } catch (e) {
    wrap.innerHTML = '<div class="empty-state">Не удалось загрузить топ</div>';
  }
}

function renderLeaderboard(top, me) {
  const wrap = $('lbList');
  if (!wrap) return;
  wrap.innerHTML = '';

  top.forEach((u, i) => {
    const row = document.createElement('div');
    row.className = 'lb-row' + (u.is_me ? ' me' : '');
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '#' + (i + 1);
    row.innerHTML =
      '<div class="lb-rank">' + medal + '</div>' +
      '<div class="lb-name">' + (u.username || 'Игрок') + '</div>' +
      '<div class="lb-val">' + (state.lbMode === 'balance' ? fmt(u.balance) + ' ₽' : fmt(u.spins_total)) + '</div>';
    wrap.appendChild(row);
  });

  if (me && !top.some(u => u.is_me)) {
    const row = document.createElement('div');
    row.className = 'lb-row me';
    row.innerHTML =
      '<div class="lb-rank">#' + (me.rank || '—') + '</div>' +
      '<div class="lb-name">' + (me.username || 'Ты') + '</div>' +
      '<div class="lb-val">' + (state.lbMode === 'balance' ? fmt(me.balance) + ' ₽' : fmt(me.spins_total)) + '</div>';
    wrap.appendChild(row);
  }
}

function setupLbTabs() {
  document.querySelectorAll('#lbTabs .lb-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      playSound('click');
      state.lbMode = btn.dataset.mode;
      document.querySelectorAll('#lbTabs .lb-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadLeaderboard();
    });
  });
}

// ============ PROFILE / ACHIEVEMENTS / TRADES ============
async function loadAchievements() {
  const wrap = $('achList');
  if (!wrap) return;
  wrap.innerHTML = '<div class="loading">Загрузка...</div>';
  try {
    const res = await api('/api/achievements');
    renderAchievements(res.list || []);
  } catch (e) {
    wrap.innerHTML = '<div class="empty-state">Не удалось загрузить достижения</div>';
  }
}

function renderAchievements(list) {
  const wrap = $('achList');
  if (!wrap) return;
  wrap.innerHTML = '';
  list.forEach(a => {
    const row = document.createElement('div');
    row.className = 'ach-row' + (a.done ? ' done' : '');
    row.innerHTML =
      '<div class="ach-icon">' + (a.done ? '✅' : '🔒') + '</div>' +
      '<div class="ach-info">' +
        '<div class="ach-n">' + a.name + '</div>' +
        '<div class="ach-d">' + a.desc + '</div>' +
      '</div>' +
      '<div class="ach-r">+' + fmt(a.reward) + ' ₽</div>';
    wrap.appendChild(row);
  });
}

async function loadTrades() {
  const wrap = $('tradesList');
  if (!wrap) return;
  try {
    const res = await api('/api/trades');
    renderTrades(res.list || []);
  } catch (e) {
    wrap.innerHTML = '<div class="empty-state">Нет обменов</div>';
  }
}

function renderTrades(list) {
  const wrap = $('tradesList');
  if (!wrap) return;
  wrap.innerHTML = '';
  if (!list.length) {
    wrap.innerHTML = '<div class="empty-state">Обменов пока нет</div>';
    return;
  }
  list.forEach(t => {
    const row = document.createElement('div');
    row.className = 'trade-row';
    row.innerHTML =
      '<div class="trade-from">' + formatPhone(t.from_phone) + '</div>' +
      '<div class="trade-arrow">→</div>' +
      '<div class="trade-to">' + (t.to_username || '—') + '</div>' +
      '<div class="trade-status">' + (t.status || '') + '</div>';
    wrap.appendChild(row);
  });
}

// ============ QUESTS ============
async function loadQuests() {
  const wrap = $('questsList');
  if (!wrap) return;
  wrap.innerHTML = '<div class="loading">Загрузка...</div>';
  try {
    const res = await api('/api/quests');
    renderQuests(res.list || []);
  } catch (e) {
    wrap.innerHTML = '<div class="empty-state">Не удалось загрузить квесты</div>';
  }
}

function renderQuests(list) {
  const wrap = $('questsList');
  if (!wrap) return;
  wrap.innerHTML = '';
  if (!list.length) {
    wrap.innerHTML = '<div class="empty-state">Квестов пока нет</div>';
    return;
  }
  list.forEach(q => {
    const pct = Math.min(100, Math.round((q.progress / q.target) * 100));
    const row = document.createElement('div');
    row.className = 'quest-row' + (q.claimed ? ' claimed' : '');
    row.innerHTML =
      '<div class="quest-n">' + q.name + '</div>' +
      '<div class="quest-d">' + q.desc + '</div>' +
      '<div class="quest-bar"><div class="quest-fill" style="width:' + pct + '%"></div></div>' +
      '<div class="quest-p">' + q.progress + '/' + q.target + '</div>' +
      '<button class="btn-quest" ' + (q.claimed || pct < 100 ? 'disabled' : '') + '>' +
        (q.claimed ? 'Получено' : 'Забрать +' + fmt(q.reward) + ' ₽') +
      '</button>';
    const btn = row.querySelector('.btn-quest');
    if (!q.claimed && pct >= 100) {
      btn.addEventListener('click', () => claimQuest(q.id));
    }
    wrap.appendChild(row);
  });
}

async function claimQuest(id) {
  try {
    const res = await api('/api/quests/claim', {
      method: 'POST',
      body: JSON.stringify({ quest_id: id })
    });
    playSound('ach');
    vibrate('success');
    state.balance = res.balance !== undefined ? res.balance : state.balance + (res.reward || 0);
    updateUI();
    loadQuests();
    checkNewAchievements(res);
  } catch (e) {
    showToast(e.message || 'Ошибка', '#ff453a');
  }
}

// ============ MARKET ============
async function loadMarket() {
  const wrap = $('marketList');
  if (!wrap) return;
  wrap.innerHTML = '<div class="loading">Загрузка...</div>';
  try {
    const res = await api('/api/market?tab=' + state.marketTab);
    renderMarket(res.list || []);
  } catch (e) {
    wrap.innerHTML = '<div class="empty-state">Не удалось загрузить рынок</div>';
  }
}

function renderMarket(list) {
  const wrap = $('marketList');
  if (!wrap) return;
  wrap.innerHTML = '';
  if (!list.length) {
    wrap.innerHTML = '<div class="empty-state">Лотов нет</div>';
    return;
  }
  list.forEach(lot => {
    const r = getRarity(lot.rarity);
    const row = document.createElement('div');
    row.className = 'market-row';
    row.style.borderColor = r.color + '55';
    row.innerHTML =
      '<div class="mk-phone" style="color:' + r.color + '">' + formatPhone(lot.phone) + '</div>' +
      '<div class="mk-seller">' + (lot.seller || '—') + '</div>' +
      '<div class="mk-price">' + fmt(lot.price) + ' ₽</div>' +
      '<button class="btn-buy">Купить</button>';
    row.querySelector('.btn-buy').addEventListener('click', () => buyLot(lot.id));
    wrap.appendChild(row);
  });
}

async function buyLot(id) {
  try {
    const res = await api('/api/market/buy', {
      method: 'POST',
      body: JSON.stringify({ lot_id: id })
    });
    playSound('buy');
    vibrate('success');
    state.balance = res.balance !== undefined ? res.balance : state.balance;
    updateUI();
    await loadInventory();
    loadMarket();
    showToast('Куплено!', '#30d158');
    checkNewAchievements(res);
  } catch (e) {
    showToast(e.message || 'Ошибка покупки', '#ff453a');
    playSound('error');
  }
}

function setupMarketTabs() {
  document.querySelectorAll('#marketTabs .mk-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      playSound('click');
      state.marketTab = btn.dataset.tab;
      document.querySelectorAll('#marketTabs .mk-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadMarket();
    });
  });
}

// ============ DICE ============
async function loadDice() {
  const wrap = $('diceWrap');
  if (!wrap) return;
  try {
    const res = await api('/api/dice');
    const info = $('diceInfo');
    if (info) info.textContent = 'Доступно бросков: ' + (res.rolls_left || 0);
  } catch (e) {}
}

async function rollDice() {
  try {
    playSound('spin');
    const res = await api('/api/dice/roll', { method: 'POST', body: '{}' });
    const valEl = $('diceValue');
    if (valEl) {
      let n = 0;
      const target = res.value || 1;
      const iv = setInterval(() => {
        n++;
        valEl.textContent = ['⚀','⚁','⚂','⚃','⚄','⚅'][Math.floor(Math.random() * 6)];
        if (n > 10) {
          clearInterval(iv);
          valEl.textContent = ['⚀','⚁','⚂','⚃','⚄','⚅'][target - 1];
        }
      }, 80);
    }
    if (res.reward) {
      state.balance = res.balance !== undefined ? res.balance : state.balance + res.reward;
      updateUI();
      showToast('+' + fmt(res.reward) + ' ₽', '#30d158');
      playSound('ach');
      vibrate('success');
    }
    loadDice();
  } catch (e) {
    showToast(e.message || 'Ошибка броска', '#ff453a');
    playSound('error');
  }
}

// ============ REFERRAL ============
async function loadReferral() {
  const wrap = $('refWrap');
  if (!wrap) return;
  try {
    const res = await api('/api/referral');
    const linkEl = $('refLink');
    const countEl = $('refCount');
    const earnedEl = $('refEarned');
    if (linkEl) linkEl.value = res.link || '';
    if (countEl) countEl.textContent = res.invited || 0;
    if (earnedEl) earnedEl.textContent = fmt(res.earned || 0) + ' ₽';
  } catch (e) {}
}

function copyRefLink() {
  const el = $('refLink');
  if (!el) return;
  el.select();
  try {
    document.execCommand('copy');
    showToast('Скопировано!', '#30d158');
    playSound('click');
  } catch (e) {}
}

// ============ PROMO ============
async function applyPromo() {
  const el = $('promoInput');
  if (!el) return;
  const code = (el.value || '').trim();
  if (!code) return;
  try {
    const res = await api('/api/promo', {
      method: 'POST',
      body: JSON.stringify({ code: code })
    });
    playSound('ach');
    vibrate('success');
    state.balance = res.balance !== undefined ? res.balance : state.balance + (res.reward || 0);
    updateUI();
    showToast('+' + fmt(res.reward) + ' ₽', '#30d158');
    el.value = '';
    checkNewAchievements(res);
  } catch (e) {
    showToast(e.message || 'Неверный промокод', '#ff453a');
    playSound('error');
  }
}

// ============ NAV TABS ============
function setupTabs() {
  document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => {
      playSound('click');
      switchPage(t.dataset.page);
    });
  });
}

// ============ INIT ============
async function init() {
  try {
    const tg = window.Telegram && window.Telegram.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
    }

    await authenticate();
    const ok = await loadMeta();
    if (!ok) return;

    await loadProfile();
    await loadInventory();

    renderCountrySelector();
    renderOperatorSelector();
    renderRarityOptions();
    renderStaticReels();
    updateUI();

    setupTabs();
    setupSideMenu();
    setupSpinControls();
    setupModals();
    setupInvFilters();
    setupLbTabs();
    setupMarketTabs();

    const rollBtn = $('diceRollBtn');
    if (rollBtn) rollBtn.addEventListener('click', rollDice);

    const promoBtn = $('promoBtn');
    if (promoBtn) promoBtn.addEventListener('click', applyPromo);

    const refCopy = $('refCopyBtn');
    if (refCopy) refCopy.addEventListener('click', copyRefLink);

    const luckPill = $('luckPill');
    if (luckPill) luckPill.addEventListener('click', openLuckModal);

    const luckClose = $('luckClose');
    if (luckClose) luckClose.addEventListener('click', () => {
      const m = $('luckModal');
      if (m) m.classList.remove('show');
    });

    switchPage('roulette');
  } catch (e) {
    console.error(e);
    showToast(e.message || 'Ошибка запуска', '#ff453a');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
