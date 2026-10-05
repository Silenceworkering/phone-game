// ============================================================
// Phone Numbers — API-driven Mini App
// ============================================================

const API_BASE = 'https://phone-game.onrender.com';
const TOKEN_KEY = 'pn_user_token';

// ============================================================
// STATE
// ============================================================
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
  usedPromos: new Set()
};

// ============================================================
// HELPERS
// ============================================================
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
// API CLIENT
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
  if (!tg || !tg.initData) {
    throw new Error('Открой игру через бота');
  }

  const res = await fetch(API_BASE + '/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ init_data: tg.initData })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Auth failed');
  }

  const data = await res.json();
  state.token = data.token;
  state.user = data.user;
  state.balance = data.user.balance;
  state.spinsTotal = data.user.spins_total || 0;
  localStorage.setItem(TOKEN_KEY, state.token);
}

// ============================================================
// LOAD META
// ============================================================
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

// ============================================================
// LOAD PROFILE + INVENTORY
// ============================================================
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
  } catch (e) {
    console.error('Inventory load failed:', e);
    state.inventory = [];
  }
}

// ============================================================
// TOAST
// ============================================================
let toastTimer = null;
function showToast(text, color) {
  const t = $('toast');
  if (!t) return;
  t.textContent = text;
  t.style.color = color || '#fff';
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

// ============================================================
// FIREWORKS
// ============================================================
function fireworks(color) {
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  const layer = $('fireworks');
  if (!layer) return;
  for (let i = 0; i < 30; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.left = cx + 'px';
    p.style.top = cy + 'px';
    p.style.background = color;
    p.style.boxShadow = '0 0 10px ' + color;
    const angle = (Math.PI * 2 * i) / 30 + Math.random() * 0.3;
    const dist = 100 + Math.random() * 220;
    p.style.setProperty('--tx', Math.cos(angle) * dist + 'px');
    p.style.setProperty('--ty', Math.sin(angle) * dist + 'px');
    layer.appendChild(p);
    setTimeout(() => p.remove(), 1300);
  }
}

// ============================================================
// MAINTENANCE
// ============================================================
function showMaintenance(text) {
  if ($('maintOverlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'maintOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:linear-gradient(160deg,#14141f,#0b0b12);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:30px;color:#fff;font-family:-apple-system,BlinkMacSystemFont,sans-serif;';
  overlay.innerHTML =
    '<div style="font-size:80px;margin-bottom:20px;">🛠</div>' +
    '<div style="font-size:24px;font-weight:900;margin-bottom:12px;">Технические работы</div>' +
    '<div style="font-size:15px;color:#6e6e85;font-weight:700;max-width:320px;line-height:1.5;">' + text + '</div>' +
    '<div style="font-size:13px;color:#3a3a4a;margin-top:30px;">Скоро вернёмся 👋</div>';
  document.body.appendChild(overlay);
}

// ============================================================
// UI UPDATE
// ============================================================
function updateUI() {
  const balEl = $('balance');
  if (balEl) balEl.textContent = fmt(state.balance) + ' ₽';

  const spinsEl = $('spinCount');
  if (spinsEl) spinsEl.textContent = fmt(state.spinsTotal);

  const colEl = $('collectionCount');
  if (colEl) colEl.textContent = state.inventory.length;

  const tabInv = $('tabInvCount');
  if (tabInv) tabInv.textContent = state.inventory.length;

  updateSpinButtons();
  updateSellAllButton();
  updateSelectionBar();
}

function updateSpinButtons() {
  if (!state.meta) return;
  const cost = state.meta.spin_costs[state.minRarity] || 350;
  const p1 = $('spinBtnPrice');
  const p5 = $('spinBtn5Price');
  if (p1) p1.textContent = fmt(cost) + ' ₽';
  if (p5) p5.textContent = fmt(cost * 5) + ' ₽';
}

function updateSellAllButton() {
  const total = state.inventory.reduce((s, i) => s + i.price, 0);
  const priceEl = $('sellAllPrice');
  if (priceEl) priceEl.textContent = fmt(total) + ' ₽';

  const btn = $('sellAllBtn');
  const lbl = $('sellAllLabel');
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
  for (const id of Array.from(state.selected)) {
    if (!alive.has(id)) state.selected.delete(id);
  }

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
// COUNTRY / OPERATOR SELECTORS
// ============================================================
function renderCountrySelector() {
  const wrap = $('countrySelector');
  if (!wrap || !state.meta) return;
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
  const wrap = $('operatorSelector');
  if (!wrap || !state.meta) return;
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
// REELS (анимация)
// ============================================================
function randomDigit() { return String(Math.floor(Math.random() * 10)); }

function fakePhone(country) {
  const code = country.code;
  const d = randomDigit;
  let number = '';
  if (code === 'RU') number = '+7 (9' + d() + d() + ') ' + d() + d() + d() + '-' + d() + d() + '-' + d() + d();
  else if (code === 'US') number = '+1 (2' + d() + d() + ') ' + d() + d() + d() + '-' + d() + d() + d() + d();
  else if (code === 'GB') number = '+44 7' + d() + d() + d() + ' ' + d() + d() + d() + ' ' + d() + d() + d();
  else if (code === 'DE') number = '+49 15' + d() + ' ' + d() + d() + d() + d() + d() + d() + d();
  else if (code === 'FR') number = '+33 6 ' + d() + d() + ' ' + d() + d() + ' ' + d() + d() + ' ' + d() + d();
  else if (code === 'JP') number = '+81 90-' + d() + d() + d() + d() + '-' + d() + d() + d() + d();
  else if (code === 'KR') number = '+82 10-' + d() + d() + d() + d() + '-' + d() + d() + d() + d();
  else if (code === 'CN') number = '+86 13' + d() + ' ' + d() + d() + d() + d() + ' ' + d() + d() + d() + d();
  else if (code === 'AE') number = '+971 5' + d() + ' ' + d() + d() + d() + ' ' + d() + d() + d() + d();
  else if (code === 'BR') number = '+55 (11) 9' + d() + d() + d() + d() + '-' + d() + d() + d() + d();
  else number = '+00 ' + d() + d() + d() + d() + d() + d() + d() + d();
  return number;
}

function makeReelRow(phone, real = false) {
  const row = document.createElement('div');
  row.className = 'reel-row';
  const r = getRarity(phone.rarity || 'common');

  const flag = document.createElement('span');
  flag.className = 'flag';
  flag.textContent = phone.country_flag || '🌍';

  const text = document.createElement('span');
  text.textContent = phone.number;

  const op = document.createElement('span');
  op.className = 'op';
  op.textContent = phone.operator_code || '';

  row.appendChild(flag);
  row.appendChild(text);
  row.appendChild(op);
  row.dataset.color = r.color;
  row.dataset.real = real ? '1' : '0';
  return row;
}

function renderStaticReels() {
  const reels = $('reels');
  if (!reels) return;
  reels.innerHTML = '';
  reels.style.transition = 'none';
  reels.style.transform = 'translateY(0)';

  const country = getCountry(state.country);
  for (let i = 0; i < 5; i++) {
    const fake = {
      number: fakePhone(country),
      country_flag: country.flag,
      operator_code: '',
      rarity: 'common'
    };
    const row = makeReelRow(fake, false);
    row.style.color = '#3a3a52';
    reels.appendChild(row);
  }
  const rows = reels.children;
  if (rows[2]) {
    rows[2].classList.add('center');
    rows[2].style.color = '#6a6a80';
  }
}

function buildAnimationStrip(finalPhone, highlightIndex, totalItems) {
  const country = getCountry(state.country);
  const strip = [];
  for (let i = 0; i < totalItems; i++) {
    if (i === highlightIndex) {
      strip.push({ ...finalPhone, _real: true });
    } else {
      strip.push({
        number: fakePhone(country),
        country_flag: country.flag,
        operator_code: '',
        rarity: 'common',
        _real: false
      });
    }
  }
  return strip;
}

function animateReels(strip, highlightIndex, duration, onDone) {
  const reels = $('reels');
  reels.innerHTML = '';
  reels.style.transition = 'none';
  reels.style.transform = 'translateY(0)';

  strip.forEach(p => reels.appendChild(makeReelRow(p, p._real)));

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

// ============================================================
// SPIN 1
// ============================================================
async function spinOne() {
  if (state.spinning) return;
  const cost = state.meta.spin_costs[state.minRarity] || 350;
  if (state.balance < cost) {
    showToast('❌ Недостаточно средств', '#ff375f');
    return;
  }

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
      body: JSON.stringify({
        country: state.country,
        operator: state.operatorCode,
        min_rarity: state.minRarity
      })
    });

    state.balance = res.balance;
    state.spinsTotal = res.spins_total;
    updateUI();

    const finalPhone = res.phone;
    const totalItems = 40;
    const centerIndex = totalItems - 3;
    const strip = buildAnimationStrip(finalPhone, centerIndex, totalItems);

    animateReels(strip, centerIndex, 3800, () => finishSpinSingle(finalPhone));
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

  if (phone.rarity === 'legendary' || phone.rarity === 'secret') {
    fireworks(r.color);
  } else if (phone.rarity === 'mythic') {
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
  if (state.balance < cost) {
    showToast('❌ Недостаточно средств', '#ff375f');
    return;
  }

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
      body: JSON.stringify({
        country: state.country,
        operator: state.operatorCode,
        min_rarity: state.minRarity
      })
    });

    state.balance = res.balance;
    state.spinsTotal = res.spins_total;
    updateUI();

    const phones = res.phones;
    const highlightPhone = phones[phones.length - 1];

    const totalItems = 30;
    const centerIndex = totalItems - 3;
    const strip = buildAnimationStrip(highlightPhone, centerIndex, totalItems);

    animateReels(strip, centerIndex, 2800, () => finishSpinFive(phones, highlightPhone));
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
  const hlRarity = getRarity(highlightPhone.rarity);

  $('rouletteWindow').className = 'roulette-window rarity-' + highlightPhone.rarity;

  $('resultRarity').textContent = 'Результат ×5';
  $('resultRarity').style.color = hlRarity.color;
  $('resultRarity').style.textShadow = '0 0 20px ' + hlRarity.color;

  $('resultFlag').textContent = '🎁';
  $('resultNumber').textContent = '';
  $('resultOperator').textContent = '';
  $('resultPrice').textContent = '';

  const totalSum = phones.reduce((s, p) => s + p.price, 0);
  $('resultDesc').textContent = 'Все 5: ' + fmt(totalSum) + ' ₽';

  $('resultActions').style.display = 'none';

  state.multiSelected.clear();
  phones.forEach((p, i) => {
    p._idx = i;
    state.multiSelected.add(i);
  });

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
// MULTI-RESULT LIST (×5)
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
  wrap.style.maxHeight = '260px';

  const head = document.createElement('div');
  head.id = 'multiHead';
  head.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:rgba(10,132,255,.12);border:1.5px solid rgba(10,132,255,.4);border-radius:12px;margin-bottom:6px;flex-shrink:0;';
  head.innerHTML =
    '<span id="multiHeadCount" style="font-size:12px;font-weight:800;color:#fff;">Выбрано</span>' +
    '<span id="multiHeadSum" style="font-size:13px;font-weight:900;color:#ffd60a;">0 ₽</span>';
  wrap.appendChild(head);

  sortedPhones.forEach((p, index) => {
    if (p._idx === undefined) p._idx = index;

    const r = getRarity(p.rarity);
    const isHl = highlightPhone && p.number === highlightPhone.number && p.rarity === highlightPhone.rarity;
    const isSel = state.multiSelected.has(p._idx);

    const item = document.createElement('div');
    item.className = 'multi-item rarity-' + p.rarity + (isHl ? ' is-highlight' : '');
    item.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 12px;cursor:pointer;';
    item.innerHTML =
      '<div style="width:22px;height:22px;border-radius:50%;border:2px solid ' + (isSel ? '#0a84ff' : 'rgba(255,255,255,.3)') + ';background:' + (isSel ? '#0a84ff' : 'rgba(0,0,0,.3)') + ';display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:13px;font-weight:900;color:' + (isSel ? '#fff' : 'transparent') + ';">✓</div>' +
      '<span class="mi-flag" style="font-size:22px;flex-shrink:0;">' + (p.country_flag || '🌍') + '</span>' +
      '<div class="mi-info" style="flex:1;min-width:0;">' +
        '<div class="mi-num" style="font-family:monospace;font-size:13px;font-weight:800;color:#fff;margin-bottom:2px;word-break:break-all;">' + p.number + '</div>' +
        '<div class="mi-meta" style="font-size:10px;color:' + r.color + ';font-weight:700;">' + r.name + ' · ' + p.operator_name + (isHl ? ' · ⭐' : '') + '</div>' +
      '</div>' +
      '<div class="mi-price" style="font-size:12px;font-weight:900;color:#ffd60a;flex-shrink:0;">' + fmt(p.price) + ' ₽</div>';

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
  actions.style.cssText = 'display:flex;flex-direction:column;gap:8px;width:100%;max-width:340px;margin-top:10px;';

  const btnKeep = document.createElement('button');
  btnKeep.className = 'result-btn keep';
  btnKeep.type = 'button';
  btnKeep.id = 'multiKeep';
  btnKeep.textContent = '📦 Выбранные в инвентарь';
  btnKeep.addEventListener('click', handleMultiKeep);

  const btnSell = document.createElement('button');
  btnSell.className = 'result-btn sell';
  btnSell.type = 'button';
  btnSell.id = 'multiSellSel';
  btnSell.textContent = '💵 Продать выбранные';
  btnSell.addEventListener('click', handleMultiSellSelected);

  const btnSellAll = document.createElement('button');
  btnSellAll.className = 'result-btn sell';
  btnSellAll.type = 'button';
  btnSellAll.textContent = '💵 Продать всё';
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
  head.textContent = 'Выбрано: ' + count + ' / ' + state.pending.phones.length;
  sumEl.textContent = fmt(sum) + ' ₽';
}

function updateMultiButtons() {
  const keep = document.getElementById('multiKeep');
  const sellSel = document.getElementById('multiSellSel');
  if (!keep || !sellSel) return;

  const count = state.multiSelected.size;
  if (count === 0) {
    keep.disabled = true;
    keep.style.opacity = '0.4';
    sellSel.disabled = true;
    sellSel.style.opacity = '0.4';
    keep.textContent = '📦 Выбранные в инвентарь';
    sellSel.textContent = '💵 Продать выбранные';
  } else {
    keep.disabled = false;
    keep.style.opacity = '1';
    sellSel.disabled = false;
    sellSel.style.opacity = '1';
    keep.textContent = '📦 Выбранные в инвентарь (' + count + ')';
    sellSel.textContent = '💵 Продать выбранные (' + count + ')';
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
    await api('/api/inventory/keep', {
      method: 'POST',
      body: JSON.stringify({ phones: toKeep })
    });

    showToast('📦 +' + toKeep.length + ' в инвентарь', '#0a84ff');

    state.pending.phones = state.pending.phones.filter(p => !state.multiSelected.has(p._idx));
    state.pending.phones.forEach((p, i) => { p._idx = i; });
    state.multiSelected.clear();
    state.pending.phones.forEach(p => state.multiSelected.add(p._idx));

    await loadInventory();
    updateUI();

    if (state.pending.phones.length === 0) {
      closeResult();
    } else {
      const order = {};
      state.meta.rarity_order.forEach((k, i) => { order[k] = i; });
      const sorted = state.pending.phones.slice().sort((a, b) => order[b.rarity] - order[a.rarity]);
      renderMultiListSelectable(sorted, null);
    }
  } catch (e) {
    showToast('❌ ' + e.message, '#ff375f');
  }
}

async function handleMultiSellSelected() {
  if (!state.pending || !state.pending.multi) return;
  const toSell = state.pending.phones.filter(p => state.multiSelected.has(p._idx));
  if (!toSell.length) return;

  try {
    const res = await api('/api/sell-immediate', {
      method: 'POST',
      body: JSON.stringify({ phones: toSell })
    });

    state.balance = res.balance;
    updateUI();
    showToast('💵 +' + fmt(res.total) + ' ₽ (' + toSell.length + ')', '#34c759');

    state.pending.phones = state.pending.phones.filter(p => !state.multiSelected.has(p._idx));
    state.pending.phones.forEach((p, i) => { p._idx = i; });
    state.multiSelected.clear();
    state.pending.phones.forEach(p => state.multiSelected.add(p._idx));

    if (state.pending.phones.length === 0) {
      closeResult();
    } else {
      const order = {};
      state.meta.rarity_order.forEach((k, i) => { order[k] = i; });
      const sorted = state.pending.phones.slice().sort((a, b) => order[b.rarity] - order[a.rarity]);
      renderMultiListSelectable(sorted, null);
    }
  } catch (e) {
    showToast('❌ ' + e.message, '#ff375f');
  }
}

async function handleMultiSellAll() {
  if (!state.pending || !state.pending.multi) return;
  const phones = state.pending.phones;

  try {
    const res = await api('/api/sell-immediate', {
      method: 'POST',
      body: JSON.stringify({ phones })
    });

    state.balance = res.balance;
    updateUI();
    showToast('💵 +' + fmt(res.total) + ' ₽ (' + phones.length + ')', '#34c759');
    state.multiSelected.clear();
    closeResult();
  } catch (e) {
    showToast('❌ ' + e.message, '#ff375f');
  }
}

// ============================================================
// SINGLE RESULT ACTIONS
// ============================================================
async function handleKeepAll() {
  if (!state.pending) return;
  const phones = state.pending.phones;
  try {
    await api('/api/inventory/keep', {
      method: 'POST',
      body: JSON.stringify({ phones })
    });
    showToast('📦 +' + phones.length + ' в инвентарь', '#0a84ff');
    await loadInventory();
    updateUI();
    closeResult();
  } catch (e) {
    showToast('❌ ' + e.message, '#ff375f');
  }
}

async function handleSellAll() {
  if (!state.pending) return;
  const phones = state.pending.phones;
  try {
    const res = await api('/api/sell-immediate', {
      method: 'POST',
      body: JSON.stringify({ phones })
    });
    state.balance = res.balance;
    updateUI();
    showToast('💵 +' + fmt(res.total) + ' ₽', '#34c759');
    closeResult();
  } catch (e) {
    showToast('❌ ' + e.message, '#ff375f');
  }
}

function closeResult() {
  state.pending = null;
  state.multiSelected.clear();
  $('resultCard').classList.remove('show');
  removeMultiList();
  renderStaticReels();
}

// ============================================================
// RARITY OPTIONS
// ============================================================
function renderRarityOptions() {
  const wrap = $('rarityOptions');
  if (!wrap || !state.meta) return;
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
  const wrap = $('invFilters');
  if (!wrap || !state.meta) return;
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

  const grid = $('invGrid');
  if (!grid) return;
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

// ============================================================
// SELL
// ============================================================
async function sellSelectedFromInventory() {
  if (state.selected.size === 0) return;
  const ids = Array.from(state.selected);
  try {
    const res = await api('/api/inventory/sell', {
      method: 'POST',
      body: JSON.stringify({ ids })
    });
    state.balance = res.balance;
    state.selected.clear();
    showToast('💵 Продано ' + res.sold + ' за ' + fmt(res.total) + ' ₽', '#34c759');
    await loadInventory();
    updateUI();
    renderInventory();
  } catch (e) {
    showToast('❌ ' + e.message, '#ff375f');
  }
}

async function sellAllFromInventory() {
  if (state.inventory.length === 0) return;
  try {
    const res = await api('/api/inventory/sell-all', { method: 'POST' });
    state.balance = res.balance;
    state.selected.clear();
    showToast('💵 Продано ' + res.sold + ' за ' + fmt(res.total) + ' ₽', '#34c759');
    await loadInventory();
    updateUI();
    renderInventory();
  } catch (e) {
    showToast('❌ ' + e.message, '#ff375f');
  }
}

// ============================================================
// PROMO
// ============================================================
function togglePromoBar() {
  const bar = $('promoBar');
  if (!bar) return;
  bar.classList.toggle('open');
  if (bar.classList.contains('open')) {
    setTimeout(() => { const i = $('promoInput'); if (i) i.focus(); }, 100);
  }
}

async function activatePromo() {
  const input = $('promoInput');
  if (!input) return;
  const code = input.value.trim().toUpperCase();

  if (!code) { showToast('❌ Введите код', '#ff375f'); return; }

  if (state.usedPromos.has(code)) {
    showToast('⚠️ Уже использован', '#ffd60a');
    input.value = '';
    return;
  }

  try {
    const res = await api('/api/promo/activate', {
      method: 'POST',
      body: JSON.stringify({ code })
    });

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
      } else if (target === 'countries' || target === 'market') {
        if (controlsSpin) controlsSpin.style.display = 'none';
        if (controlsInv) controlsInv.style.display = 'none';
      } else {
        if (controlsSpin) controlsSpin.style.display = 'flex';
        if (controlsInv) controlsInv.style.display = 'none';
      }
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
      try {
        await loadProfile();
      } catch (e) {
        await authenticate();
      }
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

    const promoHead = $('promoBarHead');
    if (promoHead) promoHead.addEventListener('click', togglePromoBar);
    const promoBtn = $('promoBtn');
    if (promoBtn) promoBtn.addEventListener('click', activatePromo);
    const promoInput = $('promoInput');
    if (promoInput) {
      promoInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') activatePromo();
      });
    }

    console.log('✅ App initialized (API mode)');
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
  } catch (e) {
    console.log('Status check failed:', e);
  }
  await init();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
