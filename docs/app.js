// ============================================================
// Phone Numbers — Финальная версия (множители + удача + обмены)
// ============================================================

const API_BASE = 'https://phone-game.onrender.com';
const TOKEN_KEY = 'pn_user_token';

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
  usedPromos: new Set(),
  lbMode: 'balance',
  bonusTimer: null,
  luckInfo: null,
  boostTimers: {}
};

const $ = id => document.getElementById(id);
const fmt = n => Math.round(n).toLocaleString('ru-RU');

function getRarity(key) {
  if (!state.meta) return { name: '—', color: '#8e8e93', desc: '' };
  return state.meta.rarities.find(r => r.key === key) || { name: key, color: '#8e8e93', desc: '' };
}
function getCountry(code) {
  if (!state.meta) return { code, flag: '🌍', name: code, operators: [] };
  return state.meta.countries.find(c => c.code === code) || state.meta.countries[0];
}

// ============ API ============
async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
  if (options.headers) Object.assign(headers, options.headers);
  const res = await fetch(API_BASE + path, { ...options, headers });
  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    state.token = '';
  }
  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }
  if (!res.ok) throw new Error((data && data.detail) || ('HTTP ' + res.status));
  return data;
}

// ============ AUTH ============
async function authenticate() {
  const tg = window.Telegram && window.Telegram.WebApp;
  if (!tg || !tg.initData) throw new Error('Открой игру через бота');
  const res = await fetch(API_BASE + '/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ init_data: tg.initData })
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

// ============ TOAST / FIREWORKS / MAINTENANCE ============
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
  o.style.cssText = 'position:fixed;inset:0;z-index:99999;background:linear-gradient(160deg,#14141f,#0b0b12);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:30px;color:#fff;font-family:-apple-system,BlinkMacSystemFont,sans-serif;';
  o.innerHTML = '<div style="font-size:80px;margin-bottom:20px;">🛠</div><div style="font-size:24px;font-weight:900;margin-bottom:12px;">Технические работы</div><div style="font-size:15px;color:#6e6e85;font-weight:700;max-width:320px;line-height:1.5;">' + text + '</div>';
  document.body.appendChild(o);
}

function showAchievementPopup(ach) {
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

// ============ UI UPDATE ============
function updateUI() {
  const b = $('balance'); if (b) b.textContent = fmt(state.balance) + ' ₽';
  const s = $('spinCount'); if (s) s.textContent = fmt(state.spinsTotal);
  const t = $('tabInvCount'); if (t) t.textContent = state.inventory.length;
  updateSpinButtons();
  updateSelectionBar();
  updateLuckPill();
  updateBoosts();
}

function updateSpinButtons() {
  if (!state.meta) return;
  let cost = state.meta.spin_costs[state.minRarity] || 500;
  // Учитываем скидку
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

// ============ LUCK PILL ============
function updateLuckPill() {
  const pill = $('luckPill');
  const mult = $('luckMult');
  const prog = $('luckProgress');
  if (!pill || !state.luckInfo) return;
  const info = state.luckInfo;
  mult.textContent = '×' + info.next_mult;
  prog.textContent = info.progress + '/100';
  if (info.next_mult === 25 && info.left <= 5) {
    pill.classList.add('almost');
  } else if (info.left <= 5) {
    pill.classList.add('almost');
  } else {
    pill.classList.remove('almost');
  }
}

function openLuckModal() {
  if (!state.luckInfo) return;
  const info = state.luckInfo;
  const m = $('luckModal'); if (m) m.classList.add('show');
  const nx = $('luckModalNext'); if (nx) nx.textContent = 'Следующая удача ×' + info.next_mult;
  const fill = $('luckModalFill'); if (fill) fill.style.width = info.progress + '%';
  const left = $('luckModalLeft'); if (left) left.textContent = 'Осталось: ' + info.left + ' круток';
  const pr = $('luckModalProgress'); if (pr) pr.textContent = info.progress + '/100';
  const sup = $('luckModalSuper'); if (sup) sup.textContent = 'До супер-удачи ×25: ' + info.super_left + ' круток';
}

// ============ BOOSTS ============
function updateBoosts() {
  const row = $('boostsRow');
  if (!row || !state.meta) return;
  const boosts = [
    { key: 'boost_golden', el: 'boostGolden', timer: 'boostGoldenTimer', color: '#ffd60a' },
    { key: 'boost_double', el: 'boostDouble', timer: 'boostDoubleTimer', color: '#0a84ff' },
    { key: 'boost_discount', el: 'boostDiscount', timer: 'boostDiscountTimer', color: '#34c759' },
  ];
  let anyActive = false;
  boosts.forEach(b => {
    const info = state.meta[b.key];
    const el = $(b.el);
    if (info && info.active) {
      anyActive = true;
      if (el) el.style.display = 'inline-block';
      // Стартуем таймер
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
      // Обновить статус
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

// ============ SELECTORS ============
function renderCountrySelector() {
  const wrap = $('countrySelector'); if (!wrap || !state.meta) return;
  wrap.innerHTML = '';
  state.meta.countries.forEach(c => {
    const el = document.createElement('div');
    el.className = 'country-chip' + (c.code === state.country ? ' active' : '');
    el.innerHTML = '<span class="cf">' + c.flag + '</span><span class="cn">' + c.name + '</span>';
    el.addEventListener('click', () => {
      if (state.spinning) return;
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
      state.operatorCode = op.code;
      renderOperatorSelector();
      renderStaticReels();
    });
    wrap.appendChild(el);
  });
}

// ============ REELS ============
function randomDigit() { return String(Math.floor(Math.random() * 10)); }

function fakePhone(country) {
  const code = country.code;
  const d = randomDigit;
  if (code === 'RU') return '+7 (9' + d() + d() + ') ' + d() + d() + d() + '-' + d() + d() + '-' + d() + d();
  if (code === 'US') return '+1 (2' + d() + d() + ') ' + d() + d() + d() + '-' + d() + d() + d() + d();
  if (code === 'GB') return '+44 7' + d() + d() + d() + ' ' + d() + d() + d() + ' ' + d() + d() + d();
  if (code === 'DE') return '+49 15' + d() + ' ' + d() + d() + d() + d() + d() + d() + d();
  if (code === 'FR') return '+33 6 ' + d() + d() + ' ' + d() + d() + ' ' + d() + d() + ' ' + d() + d();
  if (code === 'JP') return '+81 90-' + d() + d() + d() + d() + '-' + d() + d() + d() + d();
  if (code === 'KR') return '+82 10-' + d() + d() + d() + d() + '-' + d() + d() + d() + d();
  if (code === 'CN') return '+86 13' + d() + ' ' + d() + d() + d() + d() + ' ' + d() + d() + d() + d();
  if (code === 'AE') return '+971 5' + d() + ' ' + d() + d() + d() + ' ' + d() + d() + d() + d();
  if (code === 'BR') return '+55 (11) 9' + d() + d() + d() + d() + '-' + d() + d() + d() + d();
  return '+00 ' + d() + d() + d() + d() + d() + d() + d() + d();
}

function makeReelRow(phone) {
  const row = document.createElement('div');
  row.className = 'reel-row';
  const r = getRarity(phone.rarity || 'common');
  const flag = document.createElement('span'); flag.className = 'flag'; flag.textContent = phone.country_flag || '🌍';
  const text = document.createElement('span'); text.textContent = phone.number;
  const op = document.createElement('span'); op.className = 'op'; op.textContent = phone.operator_code || '';
  row.appendChild(flag); row.appendChild(text); row.appendChild(op);
  row.dataset.color = r.color;
  return row;
}

function renderStaticReels() {
  const reels = $('reels'); if (!reels) return;
  reels.innerHTML = '';
  reels.style.transition = 'none';
  reels.style.transform = 'translateY(0)';
  const country = getCountry(state.country);
  for (let i = 0; i < 5; i++) {
    const fake = { number: fakePhone(country), country_flag: country.flag, operator_code: '', rarity: 'common' };
    const row = makeReelRow(fake);
    row.style.color = '#3a3a52';
    reels.appendChild(row);
  }
  const rows = reels.children;
  if (rows[2]) { rows[2].classList.add('center'); rows[2].style.color = '#6a6a80'; }
}

function animateReels(strip, highlightIndex, duration, onDone) {
  const reels = $('reels'); if (!reels) return;
  reels.innerHTML = '';
  reels.style.transition = 'none';
  reels.style.transform = 'translateY(0)';
  strip.forEach(p => reels.appendChild(makeReelRow(p)));
  const rowHeight = 44;
  const paddingTop = 5;
  const windowEl = $('rouletteWindow'); if (!windowEl) return;
  const windowH = windowEl.clientHeight;
  const centerOffset = windowH / 2 - rowHeight / 2 - paddingTop;
  const startY = centerOffset;
  const endY = centerOffset - highlightIndex * rowHeight;
  reels.style.transform = 'translateY(' + startY + 'px)';
  const rows = reels.children;
  const startTime = performance.now();
  const easeOutQuint = t => 1 - Math.pow(1 - t, 5);
  function frame(now) {
    const t = Math.min((now - startTime) / duration, 1);
    const eased = easeOutQuint(t);
    const y = startY + (endY - startY) * eased;
    reels.style.transform = 'translateY(' + y + 'px)';
    const centerFloat = (centerOffset - y) / rowHeight;
    for (let i = 0; i < rows.length; i++) {
      const dist = Math.abs(i - centerFloat);
      const row = rows[i];
      if (dist < 0.5) { row.classList.add('center'); row.style.color = row.dataset.color; row.style.textShadow = '0 0 18px ' + row.dataset.color; }
      else { row.classList.remove('center'); row.style.color = ''; row.style.textShadow = ''; }
    }
    if (t < 1) requestAnimationFrame(frame);
    else onDone();
  }
  requestAnimationFrame(frame);
}

function buildAnimationStrip(finalPhone, highlightIndex, totalItems) {
  const country = getCountry(state.country);
  const strip = [];
  for (let i = 0; i < totalItems; i++) {
    if (i === highlightIndex) strip.push({ ...finalPhone, _real: true });
    else strip.push({ number: fakePhone(country), country_flag: country.flag, operator_code: '', rarity: 'common', _real: false });
  }
  return strip;
}

// ============ АНИМАЦИЯ ПЕРЕБОРА ЦИФР В ПЛАШКЕ ============
function scrambleNumber(container, finalNumber, duration = 1500) {
  return new Promise(resolve => {
    const chars = '0123456789';
    const startTime = performance.now();
    function frame(now) {
      const t = Math.min((now - startTime) / duration, 1);
      let out = '';
      for (let i = 0; i < finalNumber.length; i++) {
        const c = finalNumber[i];
        if (c >= '0' && c <= '9') {
          if (t > 0.7 && Math.random() < (t - 0.7) / 0.3) {
            out += c;
          } else {
            out += chars[Math.floor(Math.random() * 10)];
          }
        } else {
          out += c;
        }
      }
      container.textContent = out;
      if (t < 1) requestAnimationFrame(frame);
      else { container.textContent = finalNumber; resolve(); }
    }
    requestAnimationFrame(frame);
  });
}

// ============ SPIN 1 ============
async function spinOne() {
  if (state.spinning) return;
  let cost = state.meta.spin_costs[state.minRarity] || 500;
  if (state.meta.boost_discount && state.meta.boost_discount.active) cost = Math.floor(cost * 0.5);
  if (state.meta.boost_golden && state.meta.boost_golden.active) cost = Math.floor(cost * 0.5);
  if (state.balance < cost) { showToast('❌ Недостаточно средств', '#ff375f'); return; }

  state.spinning = true;
  state.balance -= cost;
  updateUI();
  const sb = $('spinBtn'); if (sb) sb.disabled = true;
  const sb5 = $('spinBtn5'); if (sb5) sb5.disabled = true;
  const ro = $('resultOverlay'); if (ro) ro.classList.remove('show');
  const mo = $('multiOverlay'); if (mo) mo.classList.remove('show');

  try {
    const res = await api('/api/spin', { method: 'POST', body: JSON.stringify({ country: state.country, operator: state.operatorCode, min_rarity: state.minRarity }) });
    state.balance = res.balance;
    state.spinsTotal = res.spins_total;
    if (res.luck_info) state.luckInfo = res.luck_info;
    updateUI();

    const phone = res.phone;
    const totalItems = 50;
    const centerIndex = totalItems - 5;
    const strip = buildAnimationStrip(phone, centerIndex, totalItems);

    // Показываем рулетку
    animateReels(strip, centerIndex, 2800, () => {
      // После рулетки — показываем плашку с перебором
      finishSpinSingle(phone);
      checkNewAchievements(res);
    });
  } catch (e) {
    state.balance += cost;
    updateUI();
    showToast('❌ ' + e.message, '#ff375f');
    state.spinning = false;
    if (sb) sb.disabled = false;
    if (sb5) sb5.disabled = false;
    renderStaticReels();
  }
}

async function finishSpinSingle(phone) {
  const r = getRarity(phone.rarity);

  // Показываем overlay
  const ro = $('resultOverlay'); if (ro) ro.classList.add('show');

  // Редкость в шапке
  const rr = $('resultRarity');
  if (rr) {
    rr.textContent = r.name;
    rr.style.color = r.color;
    rr.style.textShadow = '0 0 16px ' + r.color;
  }

  // Плашка номера с перебором
  const numEl = $('phoneNumber');
  if (numEl) {
    numEl.style.color = r.color;
    numEl.style.textShadow = '0 0 12px ' + r.color;
    scrambleNumber(numEl, phone.number, 1500);
  }

  const fEl = $('phoneFlag'); if (fEl) fEl.textContent = phone.country_flag;
  const oEl = $('resultOperator'); if (oEl) oEl.textContent = phone.country_name + ' · ' + phone.operator_name;

  // Разбивка множителей
  const bl = $('beautyList');
  if (bl) {
    bl.innerHTML = '';
    const comps = phone.components || [];
    if (!comps.length) {
      bl.innerHTML = '<div class="beauty-list-empty">Обычное сочетание</div>';
    } else {
      comps.forEach(c => {
        const row = document.createElement('div');
        row.className = 'beauty-row';
        row.innerHTML = '<span class="name">' + c.name + '</span><span class="mult">×' + c.mult + '</span>';
        bl.appendChild(row);
      });
    }
  }

  // Итоговый множитель
  const rt = $('resultTotal');
  if (rt) {
    const totalMult = phone.multiplier || 1;
    if (totalMult > 1) {
      rt.textContent = '💰 Итог: ×' + totalMult;
      rt.style.display = '';
    } else {
      rt.style.display = 'none';
    }
  }

  const rpf = $('resultPriceFinal');
  if (rpf) rpf.textContent = fmt(phone.price) + ' ₽';

  state.pending = { phones: [phone], multi: false };
  state.spinning = false;
  if (sb) sb.disabled = false;
  if (sb5) sb5.disabled = false;

  if (phone.rarity === 'legendary' || phone.rarity === 'secret' || phone.rarity === 'mythic') {
    fireworks(r.color);
  }
}

// ============ SPIN ×5 ============
async function spinFive() {
  if (state.spinning) return;
  let cost = state.meta.spin_costs[state.minRarity] || 500;
  if (state.meta.boost_discount && state.meta.boost_discount.active) cost = Math.floor(cost * 0.5);
  if (state.meta.boost_golden && state.meta.boost_golden.active) cost = Math.floor(cost * 0.5);
  cost = cost * 5;
  if (state.balance < cost) { showToast('❌ Недостаточно средств', '#ff375f'); return; }

  state.spinning = true;
  state.balance -= cost;
  updateUI();
  const sb = $('spinBtn'); if (sb) sb.disabled = true;
  const sb5 = $('spinBtn5'); if (sb5) sb5.disabled = true;
  const ro = $('resultOverlay'); if (ro) ro.classList.remove('show');
  const mo = $('multiOverlay'); if (mo) mo.classList.remove('show');

  try {
    const res = await api('/api/spin5', { method: 'POST', body: JSON.stringify({ country: state.country, operator: state.operatorCode, min_rarity: state.minRarity }) });
    state.balance = res.balance;
    state.spinsTotal = res.spins_total;
    if (res.luck_info) state.luckInfo = res.luck_info;
    updateUI();

    const phones = res.phones;
    const highlightPhone = phones[phones.length - 1];
    const totalItems = 40;
    const centerIndex = totalItems - 5;
    const strip = buildAnimationStrip(highlightPhone, centerIndex, totalItems);

    animateReels(strip, centerIndex, 2800, () => {
      finishSpinFive(phones);
      checkNewAchievements(res);
    });
  } catch (e) {
    state.balance += cost;
    updateUI();
    showToast('❌ ' + e.message, '#ff375f');
    state.spinning = false;
    if (sb) sb.disabled = false;
    if (sb5) sb5.disabled = false;
    renderStaticReels();
  }
}

function finishSpinFive(phones) {
  state.multiPhones = phones;
  state.multiSelected = new Set(phones.map((_, i) => i));

  // Сортируем по редкости (сначала лучшие)
  const order = {};
  state.meta.rarity_order.forEach((k, i) => { order[k] = i; });
  const sorted = phones.slice().sort((a, b) => order[b.rarity] - order[a.rarity]);
  // Но нам нужны индексы оригинала — оставим как есть, просто отрисуем по порядку
  renderMultiList(phones);

  const mo = $('multiOverlay'); if (mo) mo.classList.add('show');

  const total = phones.reduce((s, p) => s + p.price, 0);
  const msub = $('multiSubtitle'); if (msub) msub.textContent = 'Всего: ' + fmt(total) + ' ₽';

  state.spinning = false;
  const sb = $('spinBtn'); if (sb) sb.disabled = false;
  const sb5 = $('spinBtn5'); if (sb5) sb5.disabled = false;

  // Фейерверк если есть топ
  const topRarity = sorted[0].rarity;
  if (topRarity === 'legendary' || topRarity === 'secret' || topRarity === 'mythic') {
    fireworks(getRarity(topRarity).color);
  }
}

function renderMultiList(phones) {
  const wrap = $('multiList'); if (!wrap) return;
  wrap.innerHTML = '';
  phones.forEach((p, i) => {
    const r = getRarity(p.rarity);
    const isSel = state.multiSelected.has(i);
    const card = document.createElement('div');
    card.className = 'multi-card rarity-' + p.rarity + (isSel ? ' selected' : '');
    card.dataset.idx = i;

    let beautyHtml = '';
    if (p.components && p.components.length) {
      beautyHtml = '<div class="multi-beauty-mini">✨ ' + p.components.map(c => c.name + ' ×' + c.mult).join(' · ') + '</div>';
    }

    card.innerHTML =
      '<div class="multi-check">✓</div>' +
      '<div class="multi-card-body">' +
        '<div class="multi-flag-row">' +
          '<span class="mflag">' + p.country_flag + '</span>' +
          '<span class="mrarity" style="background:' + r.color + '"><span class="mrarity-text">' + r.name + '</span></span>' +
        '</div>' +
        '<div class="multi-number">' + p.number + '</div>' +
        beautyHtml +
        '<div class="multi-price">' + fmt(p.price) + ' ₽</div>' +
      '</div>';

    card.addEventListener('click', () => {
      if (state.multiSelected.has(i)) state.multiSelected.delete(i);
      else state.multiSelected.add(i);
      card.classList.toggle('selected', state.multiSelected.has(i));
    });

    wrap.appendChild(card);
  });
}

async function handleMultiKeep() {
  const toKeep = state.multiPhones.filter((_, i) => state.multiSelected.has(i));
  if (!toKeep.length) { showToast('❌ Ничего не выбрано', '#ff375f'); return; }
  try {
    const res = await api('/api/inventory/keep', { method: 'POST', body: JSON.stringify({ phones: toKeep }) });
    showToast('📦 +' + toKeep.length + ' в инвентарь', '#0a84ff');
    checkNewAchievements(res);
    await loadInventory();
    updateUI();
    closeMultiOverlay();
  } catch (e) { showToast('❌ ' + e.message, '#ff375f'); }
}

async function handleMultiSell() {
  const toSell = state.multiPhones.filter((_, i) => state.multiSelected.has(i));
  if (!toSell.length) { showToast('❌ Ничего не выбрано', '#ff375f'); return; }
  try {
    const res = await api('/api/sell-immediate', { method: 'POST', body: JSON.stringify({ phones: toSell }) });
    state.balance = res.balance;
    updateUI();
    showToast('💵 +' + fmt(res.total) + ' ₽', '#34c759');
    checkNewAchievements(res);
    closeMultiOverlay();
  } catch (e) { showToast('❌ ' + e.message, '#ff375f'); }
}

function closeMultiOverlay() {
  const mo = $('multiOverlay'); if (mo) mo.classList.remove('show');
  state.multiPhones = [];
  state.multiSelected.clear();
  renderStaticReels();
}

// ============ SINGLE RESULT ACTIONS ============
async function handleKeepAll() {
  if (!state.pending) return;
  const phones = state.pending.phones;
  try {
    const res = await api('/api/inventory/keep', { method: 'POST', body: JSON.stringify({ phones }) });
    showToast('📦 +' + phones.length + ' в инвентарь', '#0a84ff');
    checkNewAchievements(res);
    await loadInventory();
    updateUI();
    closeResult();
  } catch (e) { showToast('❌ ' + e.message, '#ff375f'); }
}

async function handleSellAll() {
  if (!state.pending) return;
  const phones = state.pending.phones;
  try {
    const res = await api('/api/sell-immediate', { method: 'POST', body: JSON.stringify({ phones }) });
    state.balance = res.balance;
    updateUI();
    showToast('💵 +' + fmt(res.total) + ' ₽', '#34c759');
    checkNewAchievements(res);
    closeResult();
  } catch (e) { showToast('❌ ' + e.message, '#ff375f'); }
}

function closeResult() {
  state.pending = null;
  const ro = $('resultOverlay'); if (ro) ro.classList.remove('show');
  renderStaticReels();
}

// ============ RARITY OPTIONS ============
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
      state.minRarity = key;
      document.querySelectorAll('.rarity-opt').forEach(n => n.classList.remove('active'));
      el.classList.add('active');
      updateSpinButtons();
    });
    wrap.appendChild(el);
  });
}

// ============ INVENTORY ============
function renderInventoryFilters() {
  const wrap = $('invFilters'); if (!wrap || !state.meta) return;
  wrap.innerHTML = '';
  const counts = { all: state.inventory.length };
  state.meta.rarity_order.forEach(k => { counts[k] = state.inventory.filter(i => i.rarity === k).length; });
  const filters = [{ key: 'all', name: 'Все' }].concat(state.meta.rarity_order.map(k => ({ key: k, name: getRarity(k).name })));
  filters.forEach(f => {
    const el = document.createElement('div');
    el.className = 'filter-chip' + (state.invFilter === f.key ? ' active' : '');
    el.textContent = f.name + ' (' + (counts[f.key] || 0) + ')';
    el.addEventListener('click', () => { state.invFilter = f.key; renderInventoryFilters(); renderInventory(); });
    wrap.appendChild(el);
  });
}

function renderInventory() {
  renderInventoryFilters();
  updateSelectionBar();
  const grid = $('invGrid'); if (!grid) return;
  grid.innerHTML = '';
  const items = state.invFilter === 'all' ? state.inventory : state.inventory.filter(i => i.rarity === state.invFilter);
  if (items.length === 0) {
    grid.innerHTML = '<div class="empty-state"><div class="icon">📭</div><div class="title">Пусто</div><div class="text">Крути рулетку, чтобы получить номера</div></div>';
    return;
  }
  items.forEach(item => {
    const r = getRarity(item.rarity);
    const isSel = state.selected.has(item.id);
    const card = document.createElement('div');
    card.className = 'inv-card rarity-' + item.rarity + (isSel ? ' selected' : '');
    card.dataset.id = item.id;

    let multTag = '';
    if (item.multiplier && item.multiplier > 1) {
      multTag = '<div class="inv-multiplier-tag">✨ ×' + item.multiplier + '</div>';
    }

    card.innerHTML =
      '<div class="glow"></div>' +
      '<div class="inv-card-check">✓</div>' +
      '<div class="inv-card-head">' +
        '<span class="inv-flag">' + item.country_flag + '</span>' +
        '<span class="inv-rarity-badge">' + r.name + '</span>' +
      '</div>' +
      '<div class="inv-number">' + item.number + '</div>' +
      multTag +
      '<div class="inv-op">' + item.operator_name + '</div>' +
      '<div class="inv-price"><span>' + fmt(item.price) + ' ₽</span><span class="sell-hint">' + (isSel ? '✓ выбран' : 'выбрать') + '</span></div>';

    card.addEventListener('click', () => toggleSelect(item.id));
    grid.appendChild(card);
  });
}

function toggleSelect(id) {
  if (state.selected.has(id)) state.selected.delete(id);
  else state.selected.add(id);
  renderInventory();
}

function clearSelection() { state.selected.clear(); renderInventory(); }

async function sellSelectedFromInventory() {
  if (state.selected.size === 0) return;
  const ids = Array.from(state.selected);
  try {
    const res = await api('/api/inventory/sell', { method: 'POST', body: JSON.stringify({ ids }) });
    state.balance = res.balance;
    state.selected.clear();
    showToast('💵 Продано ' + res.sold + ' за ' + fmt(res.total) + ' ₽', '#34c759');
    checkNewAchievements(res);
    await loadInventory();
    updateUI();
    renderInventory();
  } catch (e) { showToast('❌ ' + e.message, '#ff375f'); }
}

// ============ COUNTRIES ============
function renderCountries() {
  const list = $('countryList'); if (!list || !state.meta) return;
  list.innerHTML = '';
  state.meta.countries.forEach(c => {
    const totalCount = state.inventory.filter(i => i.country_code === c.code).length;
    const item = document.createElement('div');
    item.className = 'country-item';
    const head = document.createElement('div');
    head.className = 'country-item-head';
    head.innerHTML = '<div class="country-flag">' + c.flag + '</div><div class="country-info"><div class="country-name">' + c.name + ' <span class="country-code">' + c.dial + '</span></div></div><div class="country-stats"><div class="num">' + totalCount + '</div><div class="lbl">номеров</div></div>';
    item.appendChild(head);
    const opsWrap = document.createElement('div');
    opsWrap.className = 'op-list';
    (c.operators || []).forEach(op => {
      const count = state.inventory.filter(i => i.country_code === c.code && i.operator_code === op.code).length;
      const chip = document.createElement('div');
      chip.className = 'op-chip' + (count > 0 ? ' has-numbers' : '');
      chip.innerHTML = '<span class="op-name">' + op.name + '</span><span class="op-badge">' + count + '</span>';
      opsWrap.appendChild(chip);
    });
    item.appendChild(opsWrap);
    list.appendChild(item);
  });
}

// ============ CRAFT ============
async function loadCraft() {
  const list = $('craftList'); if (!list) return;
  list.innerHTML = '<div style="padding:30px;text-align:center;color:#6e6e85;">Загрузка...</div>';
  try {
    const data = await api('/api/craft');
    list.innerHTML = '';
    data.rules.forEach(r => {
      const item = document.createElement('div');
      item.className = 'craft-item' + (r.can_craft ? ' can' : '');
      const enough = r.have >= r.need;
      item.innerHTML = '<div class="craft-counts"><span class="craft-badge ' + (enough ? 'ok' : 'no') + '">' + r.have + '/' + r.need + '</span><span class="arrow">→</span><span class="craft-badge ok" style="background:' + r.to_color + '20;color:' + r.to_color + ';">1</span></div><div class="craft-body"><div class="craft-title" style="color:' + r.to_color + '">' + r.to_name + '</div><div class="craft-sub">из ' + r.need + ' × ' + r.from_name + '</div></div><div class="craft-cost">' + fmt(r.cost) + ' ₽</div>';
      if (r.can_craft) item.addEventListener('click', () => openCraftModal(r));
      list.appendChild(item);
    });
  } catch (e) { list.innerHTML = '<div style="padding:30px;text-align:center;color:#ff375f;">' + e.message + '</div>'; }
}

let craftTarget = null;
function openCraftModal(rule) {
  craftTarget = rule;
  const cr = $('craftRarity'); if (cr) { cr.textContent = rule.to_name; cr.style.color = rule.to_color; }
  const cres = $('craftResult'); if (cres) cres.textContent = 'Обменять ' + rule.need + ' × ' + rule.from_name + ' на 1 × ' + rule.to_name;
  const cc = $('craftCost'); if (cc) cc.textContent = fmt(rule.cost) + ' ₽';
  const m = $('craftModal'); if (m) m.classList.add('show');
}

async function confirmCraft() {
  if (!craftTarget) return;
  try {
    const res = await api('/api/craft', { method: 'POST', body: JSON.stringify({ from_rarity: craftTarget.from_rarity }) });
    state.balance = res.balance;
    updateUI();
    const m = $('craftModal'); if (m) m.classList.remove('show');
    craftTarget = null;
    showToast('⚗️ Скрафчен: ' + res.new_phone.number, res.new_phone.rarity === 'secret' ? '#00e5ff' : '#ffd60a');
    fireworks(getRarity(res.new_phone.rarity).color);
    checkNewAchievements(res);
    await loadInventory();
    loadCraft();
    renderInventory();
  } catch (e) { showToast('❌ ' + e.message, '#ff375f'); }
}

// ============ LEADERBOARD ============
async function loadLeaderboard() {
  const list = $('lbList'); if (!list) return;
  list.innerHTML = '<div style="padding:30px;text-align:center;color:#6e6e85;">Загрузка...</div>';
  try {
    const path = state.lbMode === 'balance' ? '/api/leaderboard' : '/api/leaderboard/spins';
    const data = await api(path);
    const arr = data.balance || data.spins || [];
    if (!arr.length) { list.innerHTML = '<div style="padding:30px;text-align:center;color:#6e6e85;">Пока никого</div>'; return; }
    list.innerHTML = '';
    const myId = state.user ? state.user.telegram_id : null;
    arr.forEach((u, i) => {
      const rank = i + 1;
      const rc = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
      const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '#' + rank;
      const value = state.lbMode === 'balance' ? fmt(u.balance) + ' ₽' : fmt(u.spins) + ' 🎰';
      const el = document.createElement('div');
      el.className = 'lb-item' + (u.tg_id === myId ? ' me' : '');
      el.innerHTML = '<div class="lb-rank ' + rc + '">' + medal + '</div><div class="lb-name">' + (u.is_owner ? '👑 ' : '') + (u.name || 'Игрок') + '</div><div class="lb-value">' + value + '</div>';
      list.appendChild(el);
    });
  } catch (e) { list.innerHTML = '<div style="padding:30px;text-align:center;color:#ff375f;">' + e.message + '</div>'; }
}

// ============ BONUS ============
async function loadBonus() {
  try {
    const data = await api('/api/daily-bonus/status');
    const card = $('bonusCard');
    const sub = $('bonusSub');
    const btn = $('bonusBtn');
    if (!card || !sub || !btn) return;
    if (data.available) {
      card.classList.add('ready');
      sub.textContent = 'Доступен: +' + fmt(data.bonus) + ' ₽';
      btn.disabled = false;
      btn.textContent = 'Забрать';
      clearInterval(state.bonusTimer);
    } else {
      card.classList.remove('ready');
      btn.disabled = true;
      btn.textContent = 'Ждать';
      startBonusTimer(data.seconds_left);
    }
  } catch (e) {}
}

function startBonusTimer(secondsLeft) {
  clearInterval(state.bonusTimer);
  let left = secondsLeft;
  const sub = $('bonusSub');
  function tick() {
    if (left <= 0) { clearInterval(state.bonusTimer); loadBonus(); return; }
    const h = Math.floor(left / 3600);
    const m = Math.floor((left % 3600) / 60);
    const s = left % 60;
    if (sub) sub.textContent = 'Через ' + h + 'ч ' + m + 'м ' + s + 'с';
    left--;
  }
  tick();
  state.bonusTimer = setInterval(tick, 1000);
}

async function claimBonus() {
  const btn = $('bonusBtn'); if (btn) btn.disabled = true;
  try {
    const res = await api('/api/daily-bonus', { method: 'POST' });
    state.balance = res.balance;
    updateUI();
    showToast('🎁 +' + fmt(res.amount) + ' ₽', '#34c759');
    fireworks('#34c759');
    loadBonus();
  } catch (e) { showToast('❌ ' + e.message, '#ff375f'); loadBonus(); }
}

// ============ ACHIEVEMENTS ============
async function loadAchievements() {
  const list = $('achList'); if (!list) return;
  list.innerHTML = '<div style="padding:20px;text-align:center;color:#6e6e85;">Загрузка...</div>';
  try {
    const data = await api('/api/achievements');
    const cnt = $('achCount'); if (cnt) cnt.textContent = data.total_unlocked + '/' + data.total;
    list.innerHTML = '';
    data.all.forEach(a => {
      const el = document.createElement('div');
      el.className = 'ach-item' + (a.unlocked ? ' unlocked' : '');
      const iconMatch = a.name.match(/^(\S+)/);
      const icon = iconMatch ? iconMatch[1] : '🏅';
      const nameOnly = a.name.replace(/^\S+\s*/, '');
      el.innerHTML = '<div class="ach-icon">' + icon + '</div><div class="ach-body"><div class="ach-name">' + (nameOnly || a.name) + '</div><div class="ach-desc">' + a.desc + '</div></div><div class="ach-reward">+' + fmt(a.reward) + ' ₽</div><div class="ach-check">✓</div>';
      list.appendChild(el);
    });
  } catch (e) { list.innerHTML = '<div style="padding:20px;text-align:center;color:#ff375f;">' + e.message + '</div>'; }
}

// ============ MONEY ============
let moneyState = { target: null };

function openMoneyModal() {
  const m = $('moneyModal'); if (m) m.classList.add('show');
  moneyState.target = null;
  const info = $('moneyFoundInfo'); if (info) { info.classList.remove('show'); info.textContent = ''; }
  const as = $('moneyAmountSection'); if (as) as.style.display = 'none';
  const sb = $('moneySend'); if (sb) sb.style.display = 'none';
  const un = $('moneyUsername'); if (un) un.value = '';
  const am = $('moneyAmount'); if (am) am.value = '';
  const mm = $('moneyMessage'); if (mm) mm.value = '';
  const mb = $('moneyMyBal'); if (mb) mb.textContent = fmt(state.balance) + ' ₽';
}

function closeMoneyModal() { const m = $('moneyModal'); if (m) m.classList.remove('show'); }

async function findMoneyUser() {
  const un = $('moneyUsername');
  const username = (un ? un.value : '').trim().replace(/^@/, '');
  if (!username) { showToast('❌ Введи @username', '#ff375f'); return; }
  const info = $('moneyFoundInfo');
  try {
    const res = await api('/api/trade/find', { method: 'POST', body: JSON.stringify({ username }) });
    moneyState.target = res.user;
    info.textContent = '✅ Найден: ' + (res.user.first_name || res.user.username);
    info.classList.add('show');
    const as = $('moneyAmountSection'); if (as) as.style.display = 'block';
    const sb = $('moneySend'); if (sb) sb.style.display = 'flex';
    const mb = $('moneyMyBal'); if (mb) mb.textContent = fmt(state.balance) + ' ₽';
  } catch (e) {
    info.textContent = '❌ ' + e.message;
    info.classList.remove('show');
    const as = $('moneyAmountSection'); if (as) as.style.display = 'none';
    const sb = $('moneySend'); if (sb) sb.style.display = 'none';
  }
}

function sendMoneyConfirm() {
  if (!moneyState.target) { showToast('❌ Сначала найди игрока', '#ff375f'); return; }
  const am = $('moneyAmount');
  const amount = parseInt((am ? am.value : '') || '0', 10) || 0;
  if (amount <= 0) { showToast('❌ Введи сумму', '#ff375f'); return; }
  if (amount > state.balance) { showToast('❌ У тебя недостаточно денег', '#ff375f'); return; }
  const mi = $('confirmIcon'); if (mi) mi.textContent = '💸';
  const text = 'Перевести ' + fmt(amount) + ' ₽ игроку @' + moneyState.target.username + ' (' + (moneyState.target.first_name || '') + ')?';
  const ct = $('tradeConfirmText'); if (ct) ct.textContent = text;
  const cm = $('tradeConfirmModal'); if (cm) cm.classList.add('show');
  window._confirmAction = doSendMoney;
}

async function doSendMoney() {
  const am = $('moneyAmount');
  const amount = parseInt((am ? am.value : '') || '0', 10) || 0;
  const msgEl = $('moneyMessage');
  const message = (msgEl ? msgEl.value : '').trim();
  try {
    await api('/api/trade/create', {
      method: 'POST',
      body: JSON.stringify({ to_username: moneyState.target.username, from_items: [], to_items: [], from_money: amount, to_money: 0, message: message })
    });
    const cm = $('tradeConfirmModal'); if (cm) cm.classList.remove('show');
    closeMoneyModal();
    showToast('✅ Отправлено!', '#34c759');
    await loadProfile();
    updateUI();
  } catch (e) { showToast('❌ ' + e.message, '#ff375f'); }
}

// ============ TRADES ============
let tradeState = { targetUser: null, targetItems: [], mySelected: new Set(), hisSelected: new Set(), currentTab: 'incoming' };

function openTradeModal() {
  const m = $('tradeModal'); if (m) m.classList.add('show');
  tradeState.targetUser = null;
  tradeState.targetItems = [];
  tradeState.mySelected.clear();
  tradeState.hisSelected.clear();
  const info = $('tradeFoundInfo'); if (info) { info.classList.remove('show'); info.textContent = ''; }
  ['tradeMySection','tradeHisSection','tradeMsgSection'].forEach(id => { const el = $(id); if (el) el.style.display = 'none'; });
  const sendBtn = $('tradeSend'); if (sendBtn) sendBtn.style.display = 'none';
  const un = $('tradeUsername'); if (un) un.value = '';
  const mm = $('tradeMyMoney'); if (mm) mm.value = '';
  const hm = $('tradeHisMoney'); if (hm) hm.value = '';
  const msg = $('tradeMessage'); if (msg) msg.value = '';
}

function closeTradeModal() { const m = $('tradeModal'); if (m) m.classList.remove('show'); }

async function findTradeUser() {
  const un = $('tradeUsername');
  const username = (un ? un.value : '').trim().replace(/^@/, '');
  if (!username) { showToast('❌ Введи @username', '#ff375f'); return; }
  const info = $('tradeFoundInfo');
  try {
    const res = await api('/api/trade/find', { method: 'POST', body: JSON.stringify({ username }) });
    tradeState.targetUser = res.user;
    tradeState.targetItems = res.items || [];
    info.textContent = '✅ Найден: ' + (res.user.first_name || res.user.username);
    info.classList.add('show');
    const mySec = $('tradeMySection'); if (mySec) mySec.style.display = 'block';
    const hisSec = $('tradeHisSection'); if (hisSec) hisSec.style.display = 'block';
    const msgSec = $('tradeMsgSection'); if (msgSec) msgSec.style.display = 'block';
    const sendBtn = $('tradeSend'); if (sendBtn) sendBtn.style.display = 'flex';
    renderTradeMyItems();
    renderTradeHisItems();
  } catch (e) {
    info.textContent = '❌ ' + e.message;
    info.classList.remove('show');
    ['tradeMySection','tradeHisSection','tradeMsgSection'].forEach(id => { const el = $(id); if (el) el.style.display = 'none'; });
    const sendBtn = $('tradeSend'); if (sendBtn) sendBtn.style.display = 'none';
  }
}

function renderTradeMyItems() {
  const wrap = $('tradeMyItems'); if (!wrap) return;
  wrap.innerHTML = '';
  if (!state.inventory.length) { wrap.innerHTML = '<div style="text-align:center;color:#6e6e85;font-size:11px;padding:10px;">У тебя нет номеров</div>'; return; }
  state.inventory.slice(0, 30).forEach(item => {
    const r = getRarity(item.rarity);
    const isSel = tradeState.mySelected.has(item.id);
    const el = document.createElement('div');
    el.className = 'trade-item-row' + (isSel ? ' selected' : '');
    el.innerHTML = '<span class="ti-flag">' + item.country_flag + '</span><div class="ti-info"><div class="ti-num">' + item.number + '</div><div class="ti-meta" style="color:' + r.color + '">' + r.name + '</div></div><div class="ti-price">' + fmt(item.price) + ' ₽</div><div class="ti-check"></div>';
    el.addEventListener('click', () => {
      if (tradeState.mySelected.has(item.id)) tradeState.mySelected.delete(item.id);
      else tradeState.mySelected.add(item.id);
      renderTradeMyItems();
    });
    wrap.appendChild(el);
  });
}

function renderTradeHisItems() {
  const wrap = $('tradeHisItems'); if (!wrap) return;
  wrap.innerHTML = '';
  if (!tradeState.targetItems.length) { wrap.innerHTML = '<div style="text-align:center;color:#6e6e85;font-size:11px;padding:10px;">У него нет номеров</div>'; return; }
  tradeState.targetItems.forEach(item => {
    const r = getRarity(item.rarity);
    const isSel = tradeState.hisSelected.has(item.id);
    const el = document.createElement('div');
    el.className = 'trade-item-row' + (isSel ? ' selected' : '');
    el.innerHTML = '<span class="ti-flag">' + item.country_flag + '</span><div class="ti-info"><div class="ti-num">' + item.number + '</div><div class="ti-meta" style="color:' + r.color + '">' + r.name + '</div></div><div class="ti-price">' + fmt(item.price) + ' ₽</div><div class="ti-check"></div>';
    el.addEventListener('click', () => {
      if (tradeState.hisSelected.has(item.id)) tradeState.hisSelected.delete(item.id);
      else tradeState.hisSelected.add(item.id);
      renderTradeHisItems();
    });
    wrap.appendChild(el);
  });
}

function sendTradeConfirm() {
  if (!tradeState.targetUser) { showToast('❌ Сначала найди игрока', '#ff375f'); return; }
  const mm = $('tradeMyMoney'); const myMoney = parseInt((mm ? mm.value : '') || '0', 10) || 0;
  const hm = $('tradeHisMoney'); const hisMoney = parseInt((hm ? hm.value : '') || '0', 10) || 0;
  if (myMoney < 0 || hisMoney < 0) { showToast('❌ Деньги не могут быть отрицательными', '#ff375f'); return; }
  if (myMoney > state.balance) { showToast('❌ У тебя недостаточно денег', '#ff375f'); return; }
  if (tradeState.mySelected.size === 0 && tradeState.hisSelected.size === 0 && myMoney === 0 && hisMoney === 0) { showToast('❌ Добавь номера или деньги', '#ff375f'); return; }
  const mi = $('confirmIcon'); if (mi) mi.textContent = '⚠️';
  const text = 'Обмен игроку @' + tradeState.targetUser.username + ':\n📤 ' + tradeState.mySelected.size + ' номеров' + (myMoney > 0 ? ' + ' + fmt(myMoney) + ' ₽' : '') + '\n📥 ' + tradeState.hisSelected.size + ' номеров' + (hisMoney > 0 ? ' + ' + fmt(hisMoney) + ' ₽' : '');
  const tt = $('tradeConfirmText'); if (tt) tt.textContent = text;
  const cm = $('tradeConfirmModal'); if (cm) cm.classList.add('show');
  window._confirmAction = doSendTrade;
}

async function doSendTrade() {
  const mm = $('tradeMyMoney'); const myMoney = parseInt((mm ? mm.value : '') || '0', 10) || 0;
  const hm = $('tradeHisMoney'); const hisMoney = parseInt((hm ? hm.value : '') || '0', 10) || 0;
  const msgEl = $('tradeMessage'); const message = (msgEl ? msgEl.value : '').trim();
  try {
    await api('/api/trade/create', { method: 'POST', body: JSON.stringify({ to_username: tradeState.targetUser.username, from_items: Array.from(tradeState.mySelected), to_items: Array.from(tradeState.hisSelected), from_money: myMoney, to_money: hisMoney, message: message }) });
    const cm = $('tradeConfirmModal'); if (cm) cm.classList.remove('show');
    closeTradeModal();
    showToast('✅ Обмен отправлен!', '#34c759');
    loadTrades();
  } catch (e) { showToast('❌ ' + e.message, '#ff375f'); }
}

async function loadTrades() {
  const list = $('tradesList'); if (!list) return;
  list.innerHTML = '<div style="padding:20px;text-align:center;color:#6e6e85;font-size:12px;">Загрузка...</div>';
  try {
    if (tradeState.currentTab === 'incoming') {
      const data = await api('/api/trade/incoming');
      const cnt = $('tradeInCount'); if (cnt) cnt.textContent = data.trades.length;
      if (!data.trades.length) { list.innerHTML = '<div style="padding:20px;text-align:center;color:#6e6e85;font-size:12px;">Нет входящих</div>'; return; }
      list.innerHTML = '';
      data.trades.forEach(t => {
        const el = document.createElement('div');
        el.className = 'trade-item';
        let html = '<div class="trade-head">📥 От: <b>' + t.from_name + '</b> (@' + t.from_username + ')</div>';
        if (t.message) html += '<div style="font-size:11px;color:#6e6e85;font-style:italic;margin-bottom:6px;">"' + t.message + '"</div>';
        html += '<div style="font-size:11px;margin-bottom:6px;font-weight:800;">📤 Он отдаёт:</div>';
        if (t.from_items.length) {
          html += '<div style="display:flex;flex-direction:column;gap:4px;margin-bottom:8px;">';
          t.from_items.forEach(i => { html += '<div style="font-family:monospace;font-size:11px;padding:4px 8px;background:rgba(255,255,255,.04);border-radius:6px;">' + i.country_flag + ' ' + i.number + ' · ' + fmt(i.price) + ' ₽</div>'; });
          html += '</div>';
        }
        if (t.from_money > 0) html += '<div style="font-size:12px;font-weight:900;color:#ffd60a;margin-bottom:8px;">💰 + ' + fmt(t.from_money) + ' ₽</div>';
        html += '<div style="font-size:11px;margin-bottom:6px;font-weight:800;">📥 Хочет от тебя:</div>';
        if (t.to_items.length) {
          html += '<div style="display:flex;flex-direction:column;gap:4px;margin-bottom:8px;">';
          t.to_items.forEach(i => { html += '<div style="font-family:monospace;font-size:11px;padding:4px 8px;background:rgba(255,255,255,.04);border-radius:6px;">' + i.country_flag + ' ' + i.number + ' · ' + fmt(i.price) + ' ₽</div>'; });
          html += '</div>';
        }
        if (t.to_money > 0) html += '<div style="font-size:12px;font-weight:900;color:#ffd60a;margin-bottom:8px;">💰 + ' + fmt(t.to_money) + ' ₽</div>';
        html += '<div class="trade-actions"><button class="trade-btn accept" data-id="' + t.id + '" data-act="accept">✅ Принять</button><button class="trade-btn decline" data-id="' + t.id + '" data-act="decline">❌ Отклонить</button></div>';
        el.innerHTML = html;
        list.appendChild(el);
      });
      list.querySelectorAll('button[data-act]').forEach(b => {
        b.addEventListener('click', async () => {
          try {
            await api('/api/trade/' + b.dataset.id + '/respond', { method: 'POST', body: JSON.stringify({ action: b.dataset.act }) });
            showToast(b.dataset.act === 'accept' ? '✅ Принят' : '❌ Отклонён', '#34c759');
            await loadInventory();
            await loadProfile();
            updateUI();
            renderInventory();
            loadTrades();
          } catch (e) { showToast('❌ ' + e.message, '#ff375f'); }
        });
      });
    } else {
      const data = await api('/api/trade/outgoing');
      if (!data.trades.length) { list.innerHTML = '<div style="padding:20px;text-align:center;color:#6e6e85;font-size:12px;">Нет исходящих</div>'; return; }
      list.innerHTML = '';
      data.trades.forEach(t => {
        const el = document.createElement('div');
        el.className = 'trade-item';
        el.innerHTML = '<div class="trade-head">📤 Кому: <b>' + t.to_name + '</b> (@' + t.to_username + ')</div><div style="font-size:11px;color:#6e6e85;">Ожидает...</div>';
        list.appendChild(el);
      });
    }
  } catch (e) { list.innerHTML = '<div style="padding:20px;text-align:center;color:#ff375f;font-size:12px;">' + e.message + '</div>'; }
}

function setupTradeTabs() {
  document.querySelectorAll('.trade-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      tradeState.currentTab = btn.dataset.trade;
      document.querySelectorAll('.trade-tab').forEach(b => b.classList.toggle('active', b === btn));
      loadTrades();
    });
  });
}

// ============ PROMO ============
function togglePromoBar() {
  const bar = $('promoBar'); if (!bar) return;
  bar.classList.toggle('open');
  if (bar.classList.contains('open')) setTimeout(() => { const i = $('promoInput'); if (i) i.focus(); }, 100);
}

async function activatePromo() {
  const input = $('promoInput'); if (!input) return;
  const code = input.value.trim().toUpperCase();
  if (!code) { showToast('❌ Введите код', '#ff375f'); return; }
  if (state.usedPromos.has(code)) { showToast('⚠️ Уже использован', '#ffd60a'); input.value = ''; return; }
  try {
    const res = await api('/api/promo/activate', { method: 'POST', body: JSON.stringify({ code }) });
    state.usedPromos.add(code);
    state.balance = res.balance;
    const bal = $('balance'); if (bal) { bal.classList.add('flash'); setTimeout(() => bal.classList.remove('flash'), 700); }
    fireworks('#34c759');
    showToast('🎉 Промокод: +' + fmt(res.amount) + ' ₽', '#34c759');
    input.value = '';
    updateUI();
    setTimeout(() => { const b = $('promoBar'); if (b) b.classList.remove('open'); }, 1000);
  } catch (e) { showToast('❌ ' + e.message, '#ff375f'); input.value = ''; }
}

// ============ TABS ============
function setupTabs() {
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.page;
      tabs.forEach(t => t.classList.toggle('active', t === tab));
      document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + target));
      const controlsSpin = $('controls');
      if (target === 'roulette') { if (controlsSpin) controlsSpin.style.display = 'flex'; }
      else { if (controlsSpin) controlsSpin.style.display = 'none'; }
      if (target === 'inventory') renderInventory();
      if (target === 'countries') renderCountries();
      if (target === 'craft') loadCraft();
      if (target === 'top') loadLeaderboard();
      if (target === 'profile') { loadTrades(); loadAchievements(); }
    });
  });
  document.querySelectorAll('.lb-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      state.lbMode = btn.dataset.lb;
      document.querySelectorAll('.lb-tab').forEach(b => b.classList.toggle('active', b === btn));
      loadLeaderboard();
    });
  });
}

// ============ INIT ============
async function init() {
  try {
    const ok = await loadMeta();
    if (!ok) return;
    if (!state.token) await authenticate();
    else { try { await loadProfile(); } catch (e) { await authenticate(); } }
    await loadInventory();

    renderCountrySelector();
    renderOperatorSelector();
    renderRarityOptions();
    renderStaticReels();
    renderInventory();
    updateUI();
    setupTabs();
    setupTradeTabs();
    loadBonus();

    // SPIN
    const spinBtn = $('spinBtn'); if (spinBtn) spinBtn.addEventListener('click', spinOne);
    const spinBtn5 = $('spinBtn5'); if (spinBtn5) spinBtn5.addEventListener('click', spinFive);

    // SINGLE RESULT
    const btnKeep = $('btnKeep'); if (btnKeep) btnKeep.addEventListener('click', handleKeepAll);
    const btnSellNow = $('btnSellNow'); if (btnSellNow) btnSellNow.addEventListener('click', handleSellAll);

    // MULTI RESULT
    const mk = $('multiKeepBtn'); if (mk) mk.addEventListener('click', handleMultiKeep);
    const ms = $('multiSellBtn'); if (ms) ms.addEventListener('click', handleMultiSell);

    // INVENTORY
    const invSelClear = $('invSelClear'); if (invSelClear) invSelClear.addEventListener('click', clearSelection);
    const invSellBtn = $('invSellBtn'); if (invSellBtn) invSellBtn.addEventListener('click', sellSelectedFromInventory);

    // LUCK PILL
    const luckPill = $('luckPill'); if (luckPill) luckPill.addEventListener('click', openLuckModal);
    const luckOk = $('luckOkBtn'); if (luckOk) luckOk.addEventListener('click', () => { const m = $('luckModal'); if (m) m.classList.remove('show'); });

    // CRAFT
    const craftCancel = $('craftCancel'); if (craftCancel) craftCancel.addEventListener('click', () => { const m = $('craftModal'); if (m) m.classList.remove('show'); craftTarget = null; });
    const craftConfirm = $('craftConfirm'); if (craftConfirm) craftConfirm.addEventListener('click', confirmCraft);
    const craftModal = $('craftModal'); if (craftModal) craftModal.addEventListener('click', e => { if (e.target === craftModal) { craftModal.classList.remove('show'); craftTarget = null; } });

    // ACH
    const achOk = $('achOk'); if (achOk) achOk.addEventListener('click', () => { const m = $('achModal'); if (m) m.classList.remove('show'); });
    const bonusBtn = $('bonusBtn'); if (bonusBtn) bonusBtn.addEventListener('click', claimBonus);

    // PROMO
    const promoHead = $('promoBarHead'); if (promoHead) promoHead.addEventListener('click', togglePromoBar);
    const promoBtn = $('promoBtn'); if (promoBtn) promoBtn.addEventListener('click', activatePromo);
    const promoInput = $('promoInput');
    if (promoInput) promoInput.addEventListener('keydown', e => { if (e.key === 'Enter') activatePromo(); });

    // MONEY
    const openMoneyBtn = $('openMoneyBtn'); if (openMoneyBtn) openMoneyBtn.addEventListener('click', openMoneyModal);
    const moneyCancel = $('moneyCancel'); if (moneyCancel) moneyCancel.addEventListener('click', closeMoneyModal);
    const moneyFindBtn = $('moneyFindBtn'); if (moneyFindBtn) moneyFindBtn.addEventListener('click', findMoneyUser);
    const moneySend = $('moneySend'); if (moneySend) moneySend.addEventListener('click', sendMoneyConfirm);
    document.querySelectorAll('.money-quick-btn').forEach(b => {
      b.addEventListener('click', () => { const am = $('moneyAmount'); if (am) am.value = b.dataset.amt; });
    });

    // TRADE
    const openTradeBtn = $('openTradeBtn'); if (openTradeBtn) openTradeBtn.addEventListener('click', openTradeModal);
    const tradeCancel = $('tradeCancel'); if (tradeCancel) tradeCancel.addEventListener('click', closeTradeModal);
    const tradeFindBtn = $('tradeFindBtn'); if (tradeFindBtn) tradeFindBtn.addEventListener('click', findTradeUser);
    const tradeSend = $('tradeSend'); if (tradeSend) tradeSend.addEventListener('click', sendTradeConfirm);

    // CONFIRM
    const tradeConfirmCancel = $('tradeConfirmCancel');
    if (tradeConfirmCancel) tradeConfirmCancel.addEventListener('click', () => { const m = $('tradeConfirmModal'); if (m) m.classList.remove('show'); });
    const tradeConfirmOk = $('tradeConfirmOk');
    if (tradeConfirmOk) tradeConfirmOk.addEventListener('click', () => {
      if (typeof window._confirmAction === 'function') {
        window._confirmAction();
        window._confirmAction = null;
      }
    });

    // SELL MODAL (индивидуальная продажа из инвентаря)
    const modalCancel = $('modalCancel'); if (modalCancel) modalCancel.addEventListener('click', closeSellModal);
    const modalSell = $('modalSell'); if (modalSell) modalSell.addEventListener('click', confirmSell);
    const sellModal = $('sellModal'); if (sellModal) sellModal.addEventListener('click', e => { if (e.target === sellModal) closeSellModal(); });

    // Периодическое обновление статуса (бусты)
    setInterval(refreshStatus, 60000);

    console.log('✅ App initialized (множители + удача)');
  } catch (e) {
    console.error('❌ Init error:', e);
    if (typeof showToast === 'function') showToast('Ошибка: ' + e.message, '#ff375f');
  }
}

// ============ SELL MODAL (заглушка, если понадобится) ============
let sellTarget = null;
function closeSellModal() { const m = $('sellModal'); if (m) m.classList.remove('show'); sellTarget = null; }
async function confirmSell() { closeSellModal(); }

async function boot() {
  try {
    const res = await fetch(API_BASE + '/api/status', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data.maintenance) {
        showMaintenance(data.maintenance_text || 'Технические работы');
        return;
      }
    }
  } catch (e) { console.log('Status check failed:', e); }
  await init();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
