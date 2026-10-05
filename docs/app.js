// ============================================================
// Phone Numbers — API-driven Mini App (Этап 3)
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
  usedPromos: new Set(),
  lbMode: 'balance',
  bonusTimer: null,
  achLoaded: false
};

const $ = id => document.getElementById(id);
const fmt = n => n.toLocaleString('ru-RU');

function getRarity(key) {
  if (!state.meta) return { name: '—', color: '#8e8e93', desc: '' };
  return state.meta.rarities.find(r => r.key === key) || { name: key, color: '#8e8e93', desc: '' };
}

function getCountry(code) {
  if (!state.meta) return { code, flag: '🌍', name: code, operators: [] };
  return state.meta.countries.find(c => c.code === code) || state.meta.countries[0];
}

// ============================================================
// API
// ============================================================
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
  if (!res.ok) {
    const detail = (data && data.detail) || ('HTTP ' + res.status);
    throw new Error(detail);
  }
  return data;
}

// ============================================================
// AUTH
// ============================================================
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
}

async function loadInventory() {
  try {
    const res = await api('/api/inventory');
    state.inventory = res.items || [];
  } catch (e) { state.inventory = []; }
}

// ============================================================
// TOAST / FIREWORKS / MAINTENANCE
// ============================================================
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
  o.innerHTML =
    '<div style="font-size:80px;margin-bottom:20px;">🛠</div>' +
    '<div style="font-size:24px;font-weight:900;margin-bottom:12px;">Технические работы</div>' +
    '<div style="font-size:15px;color:#6e6e85;font-weight:700;max-width:320px;line-height:1.5;">' + text + '</div>' +
    '<div style="font-size:13px;color:#3a3a4a;margin-top:30px;">Скоро вернёмся 👋</div>';
  document.body.appendChild(o);
}

// ============================================================
// ACHIEVEMENT POPUP
// ============================================================
function showAchievementPopup(ach) {
  $('achName').textContent = ach.name;
  $('achDesc').textContent = ach.desc;
  $('achReward').textContent = '+' + fmt(ach.reward) + ' ₽';
  $('achModal').classList.add('show');
  fireworks('#ffd60a');
}

function checkNewAchievements(res) {
  if (res && res.new_achievements && res.new_achievements.length) {
    res.new_achievements.forEach((a, i) => {
      setTimeout(() => showAchievementPopup(a), i * 800);
    });
  }
}

// ============================================================
// UI UPDATE
// ============================================================
function updateUI() {
  const balEl = $('balance'); if (balEl) balEl.textContent = fmt(state.balance) + ' ₽';
  const spinsEl = $('spinCount'); if (spinsEl) spinsEl.textContent = fmt(state.spinsTotal);
  const tabInv = $('tabInvCount'); if (tabInv) tabInv.textContent = state.inventory.length;
  updateSpinButtons();
  updateSellAllButton();
  updateSelectionBar();
}

function updateSpinButtons() {
  if (!state.meta) return;
  const cost = state.meta.spin_costs[state.minRarity] || 350;
  const p1 = $('spinBtnPrice'); if (p1) p1.textContent = fmt(cost) + ' ₽';
  const p5 = $('spinBtn5Price'); if (p5) p5.textContent = fmt(cost * 5) + ' ₽';
}

function updateSellAllButton() {
  const total = state.inventory.reduce((s, i) => s + i.price, 0);
  const priceEl = $('sellAllPrice'); if (priceEl) priceEl.textContent = fmt(total) + ' ₽';
  const btn = $('sellAllBtn'); const lbl = $('sellAllLabel');
  if (!btn) return;
  if (state.inventory.length === 0) {
    btn.disabled = true;
    if (lbl) lbl.textContent = 'Всё сразу';
  } else {
    btn.disabled = false;
    if (lbl) lbl.textContent = '💵 Всё (' + state.inventory.length + ')';
  }
}

function updateSelectionBar() {
  const alive = new Set(state.inventory.map(i => i.id));
  for (const id of Array.from(state.selected)) if (!alive.has(id)) state.selected.delete(id);

  const bar = $('invSelectionBar');
  const btn = $('sellSelectedBtn');
  const count = state.selected.size;

  if (count === 0) {
    if (bar) bar.classList.remove('visible');
    if (btn) btn.disabled = true;
    const p = $('sellSelectedPrice'); if (p) p.textContent = '0 ₽';
    const l = $('sellSelectedLabel'); if (l) l.textContent = '💵 Продать выбранные';
  } else {
    if (bar) bar.classList.add('visible');
    let sum = 0;
    state.inventory.forEach(i => { if (state.selected.has(i.id)) sum += i.price; });
    const c = $('invSelCount'); if (c) c.textContent = 'Выбрано: ' + count;
    const s = $('invSelSum'); if (s) s.textContent = fmt(sum) + ' ₽';
    if (btn) btn.disabled = false;
    const p = $('sellSelectedPrice'); if (p) p.textContent = fmt(sum) + ' ₽';
    const l = $('sellSelectedLabel'); if (l) l.textContent = '💵 Продать (' + count + ')';
  }
}

// ============================================================
// SELECTORS
// ============================================================
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
      document.querySelectorAll('.country-chip').forEach(n => n.classList.remove('active'));
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

// ============================================================
// REELS
// ============================================================
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
  const reels = $('reels');
  reels.innerHTML = '';
  reels.style.transition = 'none';
  reels.style.transform = 'translateY(0)';
  strip.forEach(p => reels.appendChild(makeReelRow(p)));

  const rowHeight = 64;
  const paddingTop = 8;
  const windowH = $('rouletteWindow').clientHeight;
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
      if (dist < 0.5) {
        row.classList.add('center');
        row.style.color = row.dataset.color;
        row.style.textShadow = '0 0 18px ' + row.dataset.color;
      } else {
        row.classList.remove('center');
        row.style.color = '';
        row.style.textShadow = '';
      }
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

// ============================================================
// SPIN 1
// ============================================================
async function spinOne() {
  if (state.spinning) return;
  const cost = state.meta.spin_costs[state.minRarity] || 350;
  if (state.balance < cost) { showToast('❌ Недостаточно средств', '#ff375f'); return; }

  state.spinning = true;
  state.balance -= cost;
  updateUI();
  $('spinBtn').disabled = true;
  $('spinBtn5').disabled = true;
  $('resultCard').classList.remove('show');
  $('rouletteWindow').className = 'roulette-window';

  try {
    const res = await api('/api/spin', {
      method: 'POST',
      body: JSON.stringify({ country: state.country, operator: state.operatorCode, min_rarity: state.minRarity })
    });
    state.balance = res.balance;
    state.spinsTotal = res.spins_total;
    updateUI();

    const finalPhone = res.phone;
    const totalItems = 40;
    const centerIndex = totalItems - 3;
    const strip = buildAnimationStrip(finalPhone, centerIndex, totalItems);
    animateReels(strip, centerIndex, 3800, () => {
      finishSpinSingle(finalPhone);
      checkNewAchievements(res);
    });
  } catch (e) {
    state.balance += cost;
    updateUI();
    showToast('❌ ' + e.message, '#ff375f');
    state.spinning = false;
    $('spinBtn').disabled = false;
    $('spinBtn5').disabled = false;
    renderStaticReels();
  }
}

function finishSpinSingle(phone) {
  const r = getRarity(phone.rarity);
  $('resultRarity').style.display = '';
  $('resultFlag').style.display = '';
  $('resultNumber').style.display = '';
  $('resultOperator').style.display = '';
  $('resultPrice').style.display = '';
  $('resultDesc').style.display = '';

  $('rouletteWindow').className = 'roulette-window rarity-' + phone.rarity;
  $('resultRarity').textContent = r.name;
  $('resultRarity').style.color = r.color;
  $('resultRarity').style.textShadow = '0 0 20px ' + r.color;
  $('resultFlag').textContent = phone.country_flag;
  $('resultNumber').textContent = phone.number;
  $('resultNumber').style.color = r.color;
  $('resultNumber').style.textShadow = '0 0 30px ' + r.color;
  $('resultOperator').textContent = phone.country_name + ' · ' + phone.operator_name;
  $('resultPrice').textContent = '💰 ' + fmt(phone.price) + ' ₽';
  $('resultDesc').textContent = r.desc;

  removeMultiList();
  $('resultActions').style.display = 'flex';
  state.pending = { phones: [phone], multi: false };
  $('resultCard').classList.add('show');

  if (phone.rarity === 'legendary' || phone.rarity === 'secret' || phone.rarity === 'mythic') {
    fireworks(r.color);
  }
  state.spinning = false;
  $('spinBtn').disabled = false;
  $('spinBtn5').disabled = false;
}

// ============================================================
// SPIN ×5
// ============================================================
async function spinFive() {
  if (state.spinning) return;
  const cost = (state.meta.spin_costs[state.minRarity] || 350) * 5;
  if (state.balance < cost) { showToast('❌ Недостаточно средств', '#ff375f'); return; }

  state.spinning = true;
  state.balance -= cost;
  updateUI();
  $('spinBtn').disabled = true;
  $('spinBtn5').disabled = true;
  $('resultCard').classList.remove('show');
  $('rouletteWindow').className = 'roulette-window';

  try {
    const res = await api('/api/spin5', {
      method: 'POST',
      body: JSON.stringify({ country: state.country, operator: state.operatorCode, min_rarity: state.minRarity })
    });
    state.balance = res.balance;
    state.spinsTotal = res.spins_total;
    updateUI();

    const phones = res.phones;
    const highlightPhone = phones[phones.length - 1];
    const totalItems = 30;
    const centerIndex = totalItems - 3;
    const strip = buildAnimationStrip(highlightPhone, centerIndex, totalItems);
    animateReels(strip, centerIndex, 2800, () => {
      finishSpinFive(phones, highlightPhone);
      checkNewAchievements(res);
    });
  } catch (e) {
    state.balance += cost;
    updateUI();
    showToast('❌ ' + e.message, '#ff375f');
    state.spinning = false;
    $('spinBtn').disabled = false;
    $('spinBtn5').disabled = false;
    renderStaticReels();
  }
}

function finishSpinFive(phones, highlightPhone) {
  const order = {};
  state.meta.rarity_order.forEach((k, i) => { order[k] = i; });
  const sorted = phones.slice().sort((a, b) => order[b.rarity] - order[a.rarity]);
  const topRarity = sorted[0].rarity;

  $('rouletteWindow').className = 'roulette-window rarity-' + highlightPhone.rarity;

  $('resultRarity').style.display = 'none';
  $('resultFlag').style.display = 'none';
  $('resultNumber').style.display = 'none';
  $('resultOperator').style.display = 'none';
  $('resultPrice').style.display = 'none';
  $('resultDesc').style.display = 'none';
  $('resultActions').style.display = 'none';

  state.multiSelected.clear();
  phones.forEach((p, i) => { p._idx = i; state.multiSelected.add(i); });

  state.pending = { phones, multi: true };
  renderMultiListSelectable(sorted, highlightPhone);

  if (topRarity === 'legendary' || topRarity === 'secret' || topRarity === 'mythic') {
    fireworks(getRarity(topRarity).color);
  }
  state.spinning = false;
  $('spinBtn').disabled = false;
  $('spinBtn5').disabled = false;
  $('resultCard').classList.add('show');
}

// ============================================================
// MULTI LIST
// ============================================================
function removeMultiList() {
  const el = document.getElementById('multiListWrap');
  if (el) el.remove();
  const btns = document.getElementById('multiActions');
  if (btns) btns.remove();
}

function renderMultiListSelectable(sortedPhones, highlightPhone) {
  removeMultiList();

  const wrap = document.createElement('div');
  wrap.id = 'multiListWrap';
  wrap.className = 'multi-list';

  const head = document.createElement('div');
  head.id = 'multiHead';
  head.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:rgba(10,132,255,.15);border:1px solid rgba(10,132,255,.4);border-radius:10px;flex-shrink:0;';
  head.innerHTML =
    '<span id="multiHeadCount" style="font-size:11px;font-weight:800;color:#fff;">Выбрано</span>' +
    '<span id="multiHeadSum" style="font-size:12px;font-weight:900;color:#ffd60a;">0 ₽</span>';
  wrap.appendChild(head);

  sortedPhones.forEach((p, index) => {
    if (p._idx === undefined) p._idx = index;
    const r = getRarity(p.rarity);
    const isHl = highlightPhone && p.number === highlightPhone.number && p.rarity === highlightPhone.rarity;
    const isSel = state.multiSelected.has(p._idx);

    const item = document.createElement('div');
    item.className = 'multi-item rarity-' + p.rarity + (isHl ? ' is-highlight' : '');
    item.style.cursor = 'pointer';

    const check = document.createElement('div');
    check.style.cssText = 'width:18px;height:18px;border-radius:50%;border:2px solid ' + (isSel ? '#0a84ff' : 'rgba(255,255,255,.4)') + ';background:' + (isSel ? '#0a84ff' : 'rgba(0,0,0,.4)') + ';display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:11px;font-weight:900;color:' + (isSel ? '#fff' : 'transparent') + ';line-height:1;';
    check.textContent = '✓';
    item.appendChild(check);

    const flag = document.createElement('span');
    flag.className = 'mi-flag';
    flag.textContent = p.country_flag || '🌍';
    item.appendChild(flag);

    const info = document.createElement('div');
    info.className = 'mi-info';

    const num = document.createElement('div');
    num.className = 'mi-num';
    num.textContent = p.number;
    info.appendChild(num);

    const meta = document.createElement('div');
    meta.className = 'mi-meta';
    meta.style.color = r.color;
    meta.textContent = r.name + (isHl ? ' · ⭐' : '');
    info.appendChild(meta);
    item.appendChild(info);

    const price = document.createElement('div');
    price.className = 'mi-price';
    price.textContent = fmt(p.price) + ' ₽';
    item.appendChild(price);

    item.addEventListener('click', () => {
      if (state.multiSelected.has(p._idx)) state.multiSelected.delete(p._idx);
      else state.multiSelected.add(p._idx);
      renderMultiListSelectable(sortedPhones, highlightPhone);
    });
    wrap.appendChild(item);
  });

  $('resultCard').appendChild(wrap);
  updateMultiHead();

  const actions = document.createElement('div');
  actions.id = 'multiActions';
  actions.className = 'result-actions';
  actions.style.marginTop = '8px';

  const btnKeep = document.createElement('button');
  btnKeep.className = 'result-btn keep';
  btnKeep.type = 'button';
  btnKeep.id = 'multiKeep';
  btnKeep.textContent = '📦 Оставить';
  btnKeep.addEventListener('click', handleMultiKeep);

  const btnSell = document.createElement('button');
  btnSell.className = 'result-btn sell';
  btnSell.type = 'button';
  btnSell.id = 'multiSellSel';
  btnSell.textContent = '💵 Продать';
  btnSell.addEventListener('click', handleMultiSellSelected);

  const btnSellAll = document.createElement('button');
  btnSellAll.className = 'result-btn sell';
  btnSellAll.type = 'button';
  btnSellAll.textContent = '💵 Всё';
  btnSellAll.style.background = 'linear-gradient(135deg,#ff375f,#bf5af2)';
  btnSellAll.addEventListener('click', handleMultiSellAll);

  actions.appendChild(btnKeep);
  actions.appendChild(btnSell);
  actions.appendChild(btnSellAll);
  $('resultCard').appendChild(actions);

  updateMultiButtons();
}

function updateMultiHead() {
  const head = document.getElementById('multiHeadCount');
  const sumEl = document.getElementById('multiHeadSum');
  if (!head || !sumEl || !state.pending) return;
  let sum = 0, count = 0;
  state.pending.phones.forEach(p => {
    if (state.multiSelected.has(p._idx)) { sum += p.price; count++; }
  });
  head.textContent = 'Выбрано: ' + count + '/' + state.pending.phones.length;
  sumEl.textContent = fmt(sum) + ' ₽';
}

function updateMultiButtons() {
  const keep = document.getElementById('multiKeep');
  const sellSel = document.getElementById('multiSellSel');
  if (!keep || !sellSel) return;
  const count = state.multiSelected.size;
  if (count === 0) {
    keep.disabled = true; keep.style.opacity = '0.4';
    sellSel.disabled = true; sellSel.style.opacity = '0.4';
    keep.textContent = '📦 Оставить';
    sellSel.textContent = '💵 Продать';
  } else {
    keep.disabled = false; keep.style.opacity = '1';
    sellSel.disabled = false; sellSel.style.opacity = '1';
    keep.textContent = '📦 Оставить (' + count + ')';
    sellSel.textContent = '💵 Продать (' + count + ')';
  }
}

// ============================================================
// MULTI ACTIONS
// ============================================================
async function handleMultiKeep() {
  if (!state.pending || !state.pending.multi) return;
  const toKeep = state.pending.phones.filter(p => state.multiSelected.has(p._idx));
  if (!toKeep.length) return;
  try {
    const res = await api('/api/inventory/keep', { method: 'POST', body: JSON.stringify({ phones: toKeep }) });
    showToast('📦 +' + toKeep.length + ' в инвентарь', '#0a84ff');
    checkNewAchievements(res);
    state.pending.phones = state.pending.phones.filter(p => !state.multiSelected.has(p._idx));
    state.pending.phones.forEach((p, i) => { p._idx = i; });
    state.multiSelected.clear();
    state.pending.phones.forEach(p => state.multiSelected.add(p._idx));
    await loadInventory();
    updateUI();
    if (state.pending.phones.length === 0) closeResult();
    else {
      const order = {};
      state.meta.rarity_order.forEach((k, i) => { order[k] = i; });
      const sorted = state.pending.phones.slice().sort((a, b) => order[b.rarity] - order[a.rarity]);
      renderMultiListSelectable(sorted, null);
    }
  } catch (e) { showToast('❌ ' + e.message, '#ff375f'); }
}

async function handleMultiSellSelected() {
  if (!state.pending || !state.pending.multi) return;
  const toSell = state.pending.phones.filter(p => state.multiSelected.has(p._idx));
  if (!toSell.length) return;
  try {
    const res = await api('/api/sell-immediate', { method: 'POST', body: JSON.stringify({ phones: toSell }) });
    state.balance = res.balance;
    updateUI();
    showToast('💵 +' + fmt(res.total) + ' ₽ (' + toSell.length + ')', '#34c759');
    checkNewAchievements(res);
    state.pending.phones = state.pending.phones.filter(p => !state.multiSelected.has(p._idx));
    state.pending.phones.forEach((p, i) => { p._idx = i; });
    state.multiSelected.clear();
    state.pending.phones.forEach(p => state.multiSelected.add(p._idx));
    if (state.pending.phones.length === 0) closeResult();
    else {
      const order = {};
      state.meta.rarity_order.forEach((k, i) => { order[k] = i; });
      const sorted = state.pending.phones.slice().sort((a, b) => order[b.rarity] - order[a.rarity]);
      renderMultiListSelectable(sorted, null);
    }
  } catch (e) { showToast('❌ ' + e.message, '#ff375f'); }
}

async function handleMultiSellAll() {
  if (!state.pending || !state.pending.multi) return;
  const phones = state.pending.phones;
  try {
    const res = await api('/api/sell-immediate', { method: 'POST', body: JSON.stringify({ phones }) });
    state.balance = res.balance;
    updateUI();
    showToast('💵 +' + fmt(res.total) + ' ₽ (' + phones.length + ')', '#34c759');
    checkNewAchievements(res);
    state.multiSelected.clear();
    closeResult();
  } catch (e) { showToast('❌ ' + e.message, '#ff375f'); }
}

// ============================================================
// SINGLE RESULT
// ============================================================
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
  state.multiSelected.clear();
  $('resultCard').classList.remove('show');
  removeMultiList();
  $('resultRarity').style.display = '';
  $('resultFlag').style.display = '';
  $('resultNumber').style.display = '';
  $('resultOperator').style.display = '';
  $('resultPrice').style.display = '';
  $('resultDesc').style.display = '';
  renderStaticReels();
}

// ============================================================
// RARITY OPTIONS
// ============================================================
function renderRarityOptions() {
  const wrap = $('rarityOptions'); if (!wrap || !state.meta) return;
  wrap.innerHTML = '';
  state.meta.rarity_filters.forEach(key => {
    const r = getRarity(key);
    const cost = state.meta.spin_costs[key];
    const el = document.createElement('div');
    el.className = 'rarity-opt' + (key === state.minRarity ? ' active' : '');
    el.style.color = r.color;
    el.dataset.key = key;
    el.innerHTML =
      '<span class="dot"></span>' +
      '<span class="name">' + r.name + '</span>' +
      '<span class="price">' + fmt(cost) + '</span>';
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

// ============================================================
// INVENTORY
// ============================================================
function renderInventoryFilters() {
  const wrap = $('invFilters'); if (!wrap || !state.meta) return;
  wrap.innerHTML = '';
  const counts = { all: state.inventory.length };
  state.meta.rarity_order.forEach(k => {
    counts[k] = state.inventory.filter(i => i.rarity === k).length;
  });
  const filters = [{ key: 'all', name: 'Все' }].concat(
    state.meta.rarity_order.map(k => ({ key: k, name: getRarity(k).name }))
  );
  filters.forEach(f => {
    const el = document.createElement('div');
    el.className = 'filter-chip' + (state.invFilter === f.key ? ' active' : '');
    el.textContent = f.name + ' (' + (counts[f.key] || 0) + ')';
    el.addEventListener('click', () => {
      state.invFilter = f.key;
      renderInventoryFilters();
      renderInventory();
    });
    wrap.appendChild(el);
  });
}

function renderInventory() {
  renderInventoryFilters();
  updateSellAllButton();
  updateSelectionBar();
  const grid = $('invGrid'); if (!grid) return;
  grid.innerHTML = '';
  const items = state.invFilter === 'all'
    ? state.inventory
    : state.inventory.filter(i => i.rarity === state.invFilter);
  if (items.length === 0) {
    grid.innerHTML =
      '<div class="empty-state">' +
        '<div class="icon">📭</div>' +
        '<div class="title">Пусто</div>' +
        '<div class="text">Крути рулетку, чтобы получить номера</div>' +
      '</div>';
    return;
  }
  items.forEach(item => {
    const r = getRarity(item.rarity);
    const isSel = state.selected.has(item.id);
    const card = document.createElement('div');
    card.className = 'inv-card rarity-' + item.rarity + (isSel ? ' selected' : '');
    card.dataset.id = item.id;
    card.innerHTML =
      '<div class="glow"></div>' +
      '<div class="inv-card-check">✓</div>' +
      '<div class="inv-card-head">' +
        '<span class="inv-flag">' + item.country_flag + '</span>' +
        '<span class="inv-rarity-badge">' + r.name + '</span>' +
      '</div>' +
      '<div class="inv-number">' + item.number + '</div>' +
      '<div class="inv-op">' + item.operator_name + '</div>' +
      '<div class="inv-price">' +
        '<span>' + fmt(item.price) + ' ₽</span>' +
        '<span class="sell-hint">' + (isSel ? '✓ выбран' : 'выбрать') + '</span>' +
      '</div>';
    card.addEventListener('click', () => toggleSelect(item.id));
    grid.appendChild(card);
  });
}

function toggleSelect(id) {
  if (state.selected.has(id)) state.selected.delete(id);
  else state.selected.add(id);
  renderInventory();
}

function clearSelection() {
  state.selected.clear();
  renderInventory();
}

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

async function sellAllFromInventory() {
  if (state.inventory.length === 0) return;
  try {
    const res = await api('/api/inventory/sell-all', { method: 'POST' });
    state.balance = res.balance;
    state.selected.clear();
    showToast('💵 Продано ' + res.sold + ' за ' + fmt(res.total) + ' ₽', '#34c759');
    checkNewAchievements(res);
    await loadInventory();
    updateUI();
    renderInventory();
  } catch (e) { showToast('❌ ' + e.message, '#ff375f'); }
}

// ============================================================
// COUNTRIES
// ============================================================
function renderCountries() {
  const list = $('countryList'); if (!list || !state.meta) return;
  list.innerHTML = '';
  state.meta.countries.forEach(c => {
    const totalCount = state.inventory.filter(i => i.country_code === c.code).length;
    const item = document.createElement('div');
    item.className = 'country-item';
    const head = document.createElement('div');
    head.className = 'country-item-head';
    head.innerHTML =
      '<div class="country-flag">' + c.flag + '</div>' +
      '<div class="country-info">' +
        '<div class="country-name">' + c.name + ' <span class="country-code">' + c.dial + '</span></div>' +
      '</div>' +
      '<div class="country-stats">' +
        '<div class="num">' + totalCount + '</div>' +
        '<div class="lbl">номеров</div>' +
      '</div>';
    item.appendChild(head);

    const opsWrap = document.createElement('div');
    opsWrap.className = 'op-list';
    (c.operators || []).forEach(op => {
      const count = state.inventory.filter(
        i => i.country_code === c.code && i.operator_code === op.code
      ).length;
      const chip = document.createElement('div');
      chip.className = 'op-chip' + (count > 0 ? ' has-numbers' : '');
      chip.innerHTML =
        '<span class="op-name">' + op.name + '</span>' +
        '<span class="op-badge">' + count + '</span>';
      opsWrap.appendChild(chip);
    });
    item.appendChild(opsWrap);
    list.appendChild(item);
  });
}

// ============================================================
// CRAFT
// ============================================================
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
      item.innerHTML =
        '<div class="craft-counts">' +
          '<span class="craft-badge ' + (enough ? 'ok' : 'no') + '">' + r.have + '/' + r.need + '</span>' +
          '<span class="arrow">→</span>' +
          '<span class="craft-badge ok" style="background:' + r.to_color + '20;color:' + r.to_color + ';">1</span>' +
        '</div>' +
        '<div class="craft-body">' +
          '<div class="craft-title" style="color:' + r.to_color + '">' + r.to_name + '</div>' +
          '<div class="craft-sub">из ' + r.need + ' × ' + r.from_name + '</div>' +
        '</div>' +
        '<div class="craft-cost">' + fmt(r.cost) + ' ₽</div>';
      if (r.can_craft) {
        item.addEventListener('click', () => openCraftModal(r));
      }
      list.appendChild(item);
    });
  } catch (e) {
    list.innerHTML = '<div style="padding:30px;text-align:center;color:#ff375f;">' + e.message + '</div>';
  }
}

let craftTarget = null;
function openCraftModal(rule) {
  craftTarget = rule;
  $('craftRarity').textContent = rule.to_name;
  $('craftRarity').style.color = rule.to_color;
  $('craftResult').textContent = 'Обменять ' + rule.need + ' × ' + rule.from_name + ' на 1 × ' + rule.to_name;
  $('craftCost').textContent = fmt(rule.cost) + ' ₽';
  $('craftModal').classList.add('show');
}

async function confirmCraft() {
  if (!craftTarget) return;
  try {
    const res = await api('/api/craft', {
      method: 'POST',
      body: JSON.stringify({ from_rarity: craftTarget.from_rarity })
    });
    state.balance = res.balance;
    updateUI();
    $('craftModal').classList.remove('show');
    craftTarget = null;
    showToast('⚗️ Скрафчен: ' + res.new_phone.number, res.new_phone.rarity === 'secret' ? '#00e5ff' : '#ffd60a');
    fireworks(getRarity(res.new_phone.rarity).color);
    checkNewAchievements(res);
    await loadInventory();
    loadCraft();
    renderInventory();
  } catch (e) {
    showToast('❌ ' + e.message, '#ff375f');
  }
}

// ============================================================
// LEADERBOARD
// ============================================================
async function loadLeaderboard() {
  const list = $('lbList'); if (!list) return;
  list.innerHTML = '<div style="padding:30px;text-align:center;color:#6e6e85;">Загрузка...</div>';
  try {
    const path = state.lbMode === 'balance' ? '/api/leaderboard' : '/api/leaderboard/spins';
    const data = await api(path);
    const arr = data.balance || data.spins || [];
    if (!arr.length) {
      list.innerHTML = '<div style="padding:30px;text-align:center;color:#6e6e85;">Пока никого</div>';
      return;
    }
    list.innerHTML = '';
    const myId = state.user ? state.user.telegram_id : null;
    arr.forEach((u, i) => {
      const rank = i + 1;
      const rankClass = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
      const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '#' + rank;
      const value = state.lbMode === 'balance'
        ? fmt(u.balance) + ' ₽'
        : fmt(u.spins) + ' 🎰';
      const el = document.createElement('div');
      el.className = 'lb-item' + (u.tg_id === myId ? ' me' : '');
      el.innerHTML =
        '<div class="lb-rank ' + rankClass + '">' + medal + '</div>' +
        '<div class="lb-name">' + (u.is_owner ? '👑 ' : '') + (u.name || 'Игрок') + '</div>' +
        '<div class="lb-value">' + value + '</div>';
      list.appendChild(el);
    });
  } catch (e) {
    list.innerHTML = '<div style="padding:30px;text-align:center;color:#ff375f;">' + e.message + '</div>';
  }
}

// ============================================================
// DAILY BONUS
// ============================================================
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
  } catch (e) {
    console.error('Bonus load error', e);
  }
}

function startBonusTimer(secondsLeft) {
  clearInterval(state.bonusTimer);
  let left = secondsLeft;
  const sub = $('bonusSub');
  function tick() {
    if (left <= 0) {
      clearInterval(state.bonusTimer);
      loadBonus();
      return;
    }
    const h = Math.floor(left / 3600);
    const m = Math.floor((left % 3600) / 60);
    const s = left % 60;
    sub.textContent = 'Через ' + h + 'ч ' + m + 'м ' + s + 'с';
    left--;
  }
  tick();
  state.bonusTimer = setInterval(tick, 1000);
}

async function claimBonus() {
  const btn = $('bonusBtn');
  btn.disabled = true;
  try {
    const res = await api('/api/daily-bonus', { method: 'POST' });
    state.balance = res.balance;
    updateUI();
    showToast('🎁 +' + fmt(res.amount) + ' ₽', '#34c759');
    fireworks('#34c759');
    loadBonus();
  } catch (e) {
    showToast('❌ ' + e.message, '#ff375f');
    loadBonus();
  }
}

// ============================================================
// ACHIEVEMENTS
// ============================================================
async function loadAchievements() {
  const list = $('achList'); if (!list) return;
  list.innerHTML = '<div style="padding:20px;text-align:center;color:#6e6e85;">Загрузка...</div>';
  try {
    const data = await api('/api/achievements');
    $('achCount').textContent = data.total_unlocked + '/' + data.total;
    list.innerHTML = '';
    data.all.forEach(a => {
      const el = document.createElement('div');
      el.className = 'ach-item' + (a.unlocked ? ' unlocked' : '');
      const iconMatch = a.name.match(/^(\S+)/);
      const icon = iconMatch ? iconMatch[1] : '🏅';
      const nameOnly = a.name.replace(/^\S+\s*/, '');
      el.innerHTML =
        '<div class="ach-icon">' + icon + '</div>' +
        '<div class="ach-body">' +
          '<div class="ach-name">' + (nameOnly || a.name) + '</div>' +
          '<div class="ach-desc">' + a.desc + '</div>' +
        '</div>' +
        '<div class="ach-reward">+' + fmt(a.reward) + ' ₽</div>' +
        '<div class="ach-check">✓</div>';
      list.appendChild(el);
    });
  } catch (e) {
    list.innerHTML = '<div style="padding:20px;text-align:center;color:#ff375f;">' + e.message + '</div>';
  }
}

// ============================================================
// TRADES (входящие)
// ============================================================
async function loadTrades() {
  const section = $('tradesSection'); if (!section) return;
  try {
    const data = await api('/api/trade/incoming');
    if (!data.trades || !data.trades.length) {
      section.style.display = 'none';
      return;
    }
    section.style.display = 'block';
    const list = $('tradesList');
    list.innerHTML = '';
    data.trades.forEach(t => {
      const el = document.createElement('div');
      el.className = 'trade-item';
      el.innerHTML =
        '<div class="trade-head">📥 От: ' + t.from_name + '</div>' +
        '<div class="trade-body">' +
          '<div class="trade-side">' +
            '<div class="trade-num">' + t.from_item.number + '</div>' +
            '<div class="trade-meta" style="color:#6e6e85;">' + t.from_item.rarity + ' · ' + fmt(t.from_item.price) + ' ₽</div>' +
          '</div>' +
          '<div class="trade-arrow">⇄</div>' +
          '<div class="trade-side">' +
            '<div class="trade-num">' + t.to_item.number + '</div>' +
            '<div class="trade-meta" style="color:#6e6e85;">' + t.to_item.rarity + ' · ' + fmt(t.to_item.price) + ' ₽</div>' +
          '</div>' +
        '</div>' +
        '<div class="trade-actions">' +
          '<button class="trade-btn accept" data-id="' + t.id + '" data-act="accept">Принять</button>' +
          '<button class="trade-btn decline" data-id="' + t.id + '" data-act="decline">Отклонить</button>' +
        '</div>';
      list.appendChild(el);
    });
    list.querySelectorAll('button[data-act]').forEach(b => {
      b.addEventListener('click', async () => {
        try {
          await api('/api/trade/' + b.dataset.id + '/respond', {
            method: 'POST',
            body: JSON.stringify({ action: b.dataset.act })
          });
          showToast(b.dataset.act === 'accept' ? '✅ Обмен принят' : '❌ Отклонён', '#34c759');
          await loadInventory();
          updateUI();
          renderInventory();
          loadTrades();
        } catch (e) { showToast('❌ ' + e.message, '#ff375f'); }
      });
    });
  } catch (e) {
    section.style.display = 'none';
  }
}

// ============================================================
// PROMO
// ============================================================
function togglePromoBar() {
  const bar = $('promoBar'); if (!bar) return;
  bar.classList.toggle('open');
  if (bar.classList.contains('open')) {
    setTimeout(() => { const i = $('promoInput'); if (i) i.focus(); }, 100);
  }
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
    $('balance').classList.add('flash');
    setTimeout(() => $('balance').classList.remove('flash'), 700);
    fireworks('#34c759');
    showToast('🎉 Промокод: +' + fmt(res.amount) + ' ₽', '#34c759');
    input.value = '';
    updateUI();
    setTimeout(() => { const b = $('promoBar'); if (b) b.classList.remove('open'); }, 1000);
  } catch (e) {
    showToast('❌ ' + e.message, '#ff375f');
    input.value = '';
  }
}

// ============================================================
// TABS
// ============================================================
function setupTabs() {
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.page;
      tabs.forEach(t => t.classList.toggle('active', t === tab));
      document.querySelectorAll('.page').forEach(p => {
        p.classList.toggle('active', p.id === 'page-' + target);
      });
      const controlsSpin = $('controls');
      const controlsInv = $('controlsInv');
      if (target === 'inventory') {
        if (controlsSpin) controlsSpin.style.display = 'none';
        if (controlsInv) controlsInv.style.display = 'flex';
        renderInventory();
      } else if (target === 'countries') {
        if (controlsSpin) controlsSpin.style.display = 'none';
        if (controlsInv) controlsInv.style.display = 'none';
        renderCountries();
      } else if (target === 'craft') {
        if (controlsSpin) controlsSpin.style.display = 'none';
        if (controlsInv) controlsInv.style.display = 'none';
        loadCraft();
      } else if (target === 'top') {
        if (controlsSpin) controlsSpin.style.display = 'none';
        if (controlsInv) controlsInv.style.display = 'none';
        loadLeaderboard();
      } else if (target === 'profile') {
        if (controlsSpin) controlsSpin.style.display = 'none';
        if (controlsInv) controlsInv.style.display = 'none';
        loadBonus();
        loadTrades();
        loadAchievements();
      } else {
        if (controlsSpin) controlsSpin.style.display = 'flex';
        if (controlsInv) controlsInv.style.display = 'none';
      }
    });
  });

  // Leaderboard subtabs
  document.querySelectorAll('.lb-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      state.lbMode = btn.dataset.lb;
      document.querySelectorAll('.lb-tab').forEach(b => b.classList.toggle('active', b === btn));
      loadLeaderboard();
    });
  });
}

// ============================================================
// INIT
// ============================================================
async function init() {
  try {
    const ok = await loadMeta();
    if (!ok) return;

    if (!state.token) {
      await authenticate();
    } else {
      try { await loadProfile(); }
      catch (e) { await authenticate(); }
    }

    await loadInventory();

    renderCountrySelector();
    renderOperatorSelector();
    renderRarityOptions();
    renderStaticReels();
    renderInventory();
    updateUI();
    setupTabs();

    $('spinBtn').addEventListener('click', spinOne);
    $('spinBtn5').addEventListener('click', spinFive);
    $('sellAllBtn').addEventListener('click', sellAllFromInventory);
    $('sellSelectedBtn').addEventListener('click', sellSelectedFromInventory);
    $('invSelClear').addEventListener('click', clearSelection);
    $('btnKeep').addEventListener('click', handleKeepAll);
    $('btnSellNow').addEventListener('click', handleSellAll);

    $('craftCancel').addEventListener('click', () => { $('craftModal').classList.remove('show'); craftTarget = null; });
    $('craftConfirm').addEventListener('click', confirmCraft);
    $('craftModal').addEventListener('click', e => { if (e.target === $('craftModal')) { $('craftModal').classList.remove('show'); craftTarget = null; } });

    $('achOk').addEventListener('click', () => $('achModal').classList.remove('show'));

    $('bonusBtn').addEventListener('click', claimBonus);

    const promoHead = $('promoBarHead');
    if (promoHead) promoHead.addEventListener('click', togglePromoBar);
    const promoBtn = $('promoBtn');
    if (promoBtn) promoBtn.addEventListener('click', activatePromo);
    const promoInput = $('promoInput');
    if (promoInput) {
      promoInput.addEventListener('keydown', e => { if (e.key === 'Enter') activatePromo(); });
    }

    console.log('✅ App initialized (Этап 3)');
  } catch (e) {
    console.error('❌ Init error:', e);
    showToast('Ошибка: ' + e.message, '#ff375f');
  }
}

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
