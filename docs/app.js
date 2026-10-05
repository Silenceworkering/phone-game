import { RARITIES, RARITY_ORDER, SPIN_COSTS, RARITY_FILTERS, COUNTRIES } from './data.js';

// ============ ПРОМОКОДЫ ============
const PROMOCODES = {
  START: { type: 'money', amount: 5000,  label: '+5 000 ₽' },
  LUCKY: { type: 'money', amount: 10000, label: '+10 000 ₽' },
  PHONE: { type: 'money', amount: 25000, label: '+25 000 ₽' }
};

// ============ STATE ============
const state = {
  balance: 10000,
  collection: [],
  selected: new Set(),
  spinCount: 0,
  minRarity: 'common',
  invFilter: 'all',
  country: 'RU',
  operatorCode: null,
  spinning: false,
  pending: null,
  pendingSell: null,
  usedPromos: new Set(),
  multiSelected: new Set() // выбор в результате ×5
};

// ============ HELPERS ============
const $ = id => document.getElementById(id);
const fmt = n => n.toLocaleString('ru-RU');

function getCountry(code) {
  return COUNTRIES.find(c => c.code === code) || COUNTRIES[0];
}

function getOperatorsPool() {
  const country = getCountry(state.country);
  if (state.operatorCode === null) return country.operators;
  const one = country.operators.find(o => o.code === state.operatorCode);
  return one ? [one] : country.operators;
}

function pickRarity() {
  const minIdx = RARITY_ORDER.indexOf(state.minRarity);
  const pool = RARITY_ORDER.slice(minIdx);
  const total = pool.reduce((s, k) => s + RARITIES[k].weight, 0);
  let roll = Math.random() * total;
  for (const k of pool) {
    roll -= RARITIES[k].weight;
    if (roll <= 0) return k;
  }
  return pool[0];
}

function pickRarityAny() {
  const total = RARITY_ORDER.reduce((s, k) => s + RARITIES[k].weight, 0);
  let roll = Math.random() * total;
  for (const k of RARITY_ORDER) {
    roll -= RARITIES[k].weight;
    if (roll <= 0) return k;
  }
  return 'common';
}

function generatePhone(rarity, countryCode, operatorCode) {
  const country = getCountry(countryCode || state.country);
  let op;
  if (operatorCode !== undefined && operatorCode !== null) {
    op = country.operators.find(o => o.code === operatorCode);
  } else if (operatorCode === undefined) {
    const pool = getOperatorsPool();
    op = pool[Math.floor(Math.random() * pool.length)];
  }
  if (!op) op = country.operators[Math.floor(Math.random() * country.operators.length)];

  const prefix = op.prefixes[Math.floor(Math.random() * op.prefixes.length)];
  const number = country.format(prefix);
  return {
    id: 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9),
    country: country, operator: op, number: number, rarity: rarity
  };
}

function phonePrice(rarity) {
  const base = RARITIES[rarity].basePrice;
  const variance = 0.75 + Math.random() * 0.5;
  return Math.round(base * variance / 10) * 10;
}

// ============ TOAST ============
let toastTimer = null;
function showToast(text, color) {
  const t = $('toast');
  t.textContent = text;
  t.style.color = color || '#fff';
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

// ============ FIREWORKS ============
function fireworks(color) {
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  const layer = $('fireworks');
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

// ============ UI UPDATE ============
function updateUI() {
  $('balance').textContent = fmt(state.balance) + ' ₽';
  $('spinCount').textContent = fmt(state.spinCount);
  $('tabInvCount').textContent = state.collection.length;
  updateSpinButtons();
  updateSellAllButton();
  updateSelectionBar();
}

function updateSpinButtons() {
  const cost = SPIN_COSTS[state.minRarity];
  $('spinBtnPrice').textContent = fmt(cost) + ' ₽';
  $('spinBtn5Price').textContent = fmt(cost * 5) + ' ₽';
}

function updateSellAllButton() {
  const total = state.collection.reduce((s, i) => s + i.price, 0);
  $('sellAllPrice').textContent = fmt(total) + ' ₽';
  const btn = $('sellAllBtn');
  if (state.collection.length === 0) {
    btn.disabled = true;
    $('sellAllLabel').textContent = 'Всё сразу';
  } else {
    btn.disabled = false;
    $('sellAllLabel').textContent = '💵 Всё (' + state.collection.length + ')';
  }
}

function updateSelectionBar() {
  const alive = new Set(state.collection.map(i => i.id));
  for (const id of Array.from(state.selected)) {
    if (!alive.has(id)) state.selected.delete(id);
  }

  const bar = $('invSelectionBar');
  const count = state.selected.size;
  const btn = $('sellSelectedBtn');

  if (count === 0) {
    bar.classList.remove('visible');
    btn.disabled = true;
    $('sellSelectedPrice').textContent = '0 ₽';
    $('sellSelectedLabel').textContent = '💵 Продать выбранные';
  } else {
    bar.classList.add('visible');
    $('invSelCount').textContent = 'Выбрано: ' + count;
    let sum = 0;
    state.collection.forEach(i => {
      if (state.selected.has(i.id)) sum += i.price;
    });
    $('invSelSum').textContent = fmt(sum) + ' ₽';
    btn.disabled = false;
    $('sellSelectedPrice').textContent = fmt(sum) + ' ₽';
    $('sellSelectedLabel').textContent = '💵 Продать (' + count + ')';
  }
}

// ============ PROMO BAR ============
function togglePromoBar() {
  $('promoBar').classList.toggle('open');
  if ($('promoBar').classList.contains('open')) {
    setTimeout(() => $('promoInput').focus(), 100);
  }
}

function activatePromo() {
  const input = $('promoInput');
  const code = input.value.trim().toUpperCase();

  if (!code) {
    showToast('❌ Введите код', '#ff375f');
    return;
  }

  if (state.usedPromos.has(code)) {
    showToast('⚠️ Уже использован', '#ffd60a');
    input.value = '';
    return;
  }

  const promo = PROMOCODES[code];
  if (!promo) {
    showToast('❌ Неверный промокод', '#ff375f');
    input.value = '';
    return;
  }

  state.usedPromos.add(code);

  if (promo.type === 'money') {
    state.balance += promo.amount;
    $('balance').classList.add('flash');
    setTimeout(() => $('balance').classList.remove('flash'), 700);
    fireworks('#34c759');
    showToast('🎉 Промокод: ' + promo.label, '#34c759');
  }

  input.value = '';
  updateUI();

  setTimeout(() => $('promoBar').classList.remove('open'), 1000);
}

// ============ COUNTRY SELECTOR ============
function renderCountrySelector() {
  const wrap = $('countrySelector');
  wrap.innerHTML = '';
  COUNTRIES.forEach(c => {
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

// ============ OPERATOR SELECTOR ============
function renderOperatorSelector() {
  const wrap = $('operatorSelector');
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

  country.operators.forEach(op => {
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
function makeReelRow(phone) {
  const row = document.createElement('div');
  row.className = 'reel-row';
  const r = RARITIES[phone.rarity];

  const flag = document.createElement('span');
  flag.className = 'flag';
  flag.textContent = phone.country.flag;

  const text = document.createElement('span');
  text.textContent = phone.number;

  const op = document.createElement('span');
  op.className = 'op';
  op.textContent = phone.operator.code;

  row.appendChild(flag);
  row.appendChild(text);
  row.appendChild(op);
  row.dataset.color = r.color;
  return row;
}

function renderStaticReels() {
  const reels = $('reels');
  reels.innerHTML = '';
  reels.style.transition = 'none';
  reels.style.transform = 'translateY(0)';
  for (let i = 0; i < 5; i++) {
    const p = generatePhone(pickRarityAny());
    reels.appendChild(makeReelRow(p));
  }
  const rows = reels.children;
  if (rows[2]) {
    rows[2].classList.add('center');
    rows[2].style.color = rows[2].dataset.color;
    rows[2].style.textShadow = '0 0 18px ' + rows[2].dataset.color;
  }
}

// ============ SPIN ============
function spinOne() {
  if (state.spinning) return;
  const cost = SPIN_COSTS[state.minRarity];
  if (state.balance < cost) {
    showToast('❌ Недостаточно средств', '#ff375f');
    return;
  }

  state.spinning = true;
  state.balance -= cost;
  state.spinCount += 1;
  updateUI();
  $('spinBtn').disabled = true;
  $('spinBtn5').disabled = true;
  $('resultCard').classList.remove('show');
  $('rouletteWindow').className = 'roulette-window';

  const finalRarity = pickRarity();
  const finalPhone = generatePhone(finalRarity);
  finalPhone.price = phonePrice(finalRarity);

  const totalItems = 40;
  const centerIndex = totalItems - 3;
  const strip = [];
  for (let i = 0; i < totalItems; i++) {
    if (i === centerIndex) strip.push(finalPhone);
    else strip.push(generatePhone(pickRarityAny()));
  }

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
  const endY = centerOffset - centerIndex * rowHeight;

  reels.style.transform = 'translateY(' + startY + 'px)';

  const rows = reels.children;
  const duration = 3800;
  const startTime = performance.now();

  function easeOutQuint(t) { return 1 - Math.pow(1 - t, 5); }

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
    else finishSpinSingle(finalPhone);
  }
  requestAnimationFrame(frame);
}

function finishSpinSingle(phone) {
  const r = RARITIES[phone.rarity];

  $('rouletteWindow').className = 'roulette-window rarity-' + phone.rarity;

  $('resultRarity').textContent = r.name;
  $('resultRarity').style.color = r.color;
  $('resultRarity').style.textShadow = '0 0 20px ' + r.color;

  $('resultFlag').textContent = phone.country.flag;
  $('resultNumber').textContent = phone.number;
  $('resultNumber').style.color = r.color;
  $('resultNumber').style.textShadow = '0 0 30px ' + r.color;
  $('resultOperator').textContent = phone.country.name + ' · ' + phone.operator.name;
  $('resultPrice').textContent = '💰 ' + fmt(phone.price) + ' ₽';
  $('resultDesc').textContent = r.desc;

  removeMultiList();
  $('resultActions').style.display = 'flex';
  state.pending = { phones: [phone], multi: false };
  $('resultCard').classList.add('show');

  if (phone.rarity === 'legendary' || phone.rarity === 'secret') {
    const bonus = phone.rarity === 'legendary' ? 15000 : 100000;
    state.balance += bonus;
    $('balance').classList.add('flash');
    setTimeout(() => $('balance').classList.remove('flash'), 700);
    fireworks(r.color);
    showToast('🎉 +' + fmt(bonus) + ' ₽ бонус!', r.color);
  } else if (phone.rarity === 'mythic') {
    fireworks(r.color);
  }

  updateUI();
  state.spinning = false;
  $('spinBtn').disabled = false;
  $('spinBtn5').disabled = false;
}

// ============ SPIN x5 ============
function spinFive() {
  if (state.spinning) return;
  const cost = SPIN_COSTS[state.minRarity] * 5;
  if (state.balance < cost) {
    showToast('❌ Недостаточно средств', '#ff375f');
    return;
  }

  state.spinning = true;
  state.balance -= cost;
  state.spinCount += 5;
  updateUI();
  $('spinBtn').disabled = true;
  $('spinBtn5').disabled = true;
  $('resultCard').classList.remove('show');
  $('rouletteWindow').className = 'roulette-window';

  const phones = [];
  for (let i = 0; i < 5; i++) {
    const r = pickRarity();
    const p = generatePhone(r);
    p.price = phonePrice(r);
    phones.push(p);
  }

  const highlightPhone = phones[phones.length - 1];

  const totalItems = 30;
  const centerIndex = totalItems - 3;
  const strip = [];
  for (let i = 0; i < totalItems; i++) {
    if (i === centerIndex) strip.push(highlightPhone);
    else strip.push(generatePhone(pickRarityAny()));
  }

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
  const endY = centerOffset - centerIndex * rowHeight;

  reels.style.transform = 'translateY(' + startY + 'px)';

  const rows = reels.children;
  const duration = 2800;
  const startTime = performance.now();
  function easeOutQuint(t) { return 1 - Math.pow(1 - t, 5); }

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
    else finishSpinFive(phones, highlightPhone);
  }
  requestAnimationFrame(frame);
}

function finishSpinFive(phones, highlightPhone) {
  const order = {};
  RARITY_ORDER.forEach((k, i) => { order[k] = i; });

  const sorted = phones.slice().sort((a, b) => order[b.rarity] - order[a.rarity]);

  const topRarity = sorted[0].rarity;
  const topColor = RARITIES[topRarity].color;

  const hlRarity = RARITIES[highlightPhone.rarity];

  $('rouletteWindow').className = 'roulette-window rarity-' + highlightPhone.rarity;

  $('resultRarity').textContent = hlRarity.name + ' ×5';
  $('resultRarity').style.color = hlRarity.color;
  $('resultRarity').style.textShadow = '0 0 20px ' + hlRarity.color;

  $('resultFlag').textContent = highlightPhone.country.flag;
  $('resultNumber').textContent = highlightPhone.number;
  $('resultNumber').style.color = hlRarity.color;
  $('resultNumber').style.textShadow = '0 0 30px ' + hlRarity.color;
  $('resultOperator').textContent = highlightPhone.country.name + ' · ' + highlightPhone.operator.name;
  $('resultPrice').textContent = '💰 ' + fmt(highlightPhone.price) + ' ₽';

  const totalSum = phones.reduce((s, p) => s + p.price, 0);
  $('resultDesc').textContent = 'Все 5: ' + fmt(totalSum) + ' ₽';

  $('resultActions').style.display = 'none';

  // Сброс выбора и установка всех по умолчанию
  state.multiSelected.clear();
  phones.forEach(p => state.multiSelected.add(p.id));

  state.pending = { phones: phones, multi: true, highlight: highlightPhone };
  renderMultiListSelectable(sorted, highlightPhone);

  if (topRarity === 'legendary' || topRarity === 'secret' || topRarity === 'mythic') {
    fireworks(topColor);
  }

  state.spinning = false;
  $('spinBtn').disabled = false;
  $('spinBtn5').disabled = false;

  $('resultCard').classList.add('show');
  updateUI();
}

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

  // Заголовок с суммой выбранного
  const head = document.createElement('div');
  head.id = 'multiHead';
  head.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:rgba(10,132,255,.12);border:1.5px solid rgba(10,132,255,.4);border-radius:12px;margin-bottom:6px;flex-shrink:0;';
  head.innerHTML =
    '<span id="multiHeadCount" style="font-size:12px;font-weight:800;color:#fff;">Выбрано: 5</span>' +
    '<span id="multiHeadSum" style="font-size:13px;font-weight:900;color:#ffd60a;">0 ₽</span>';
  wrap.appendChild(head);

  sortedPhones.forEach(p => {
    const r = RARITIES[p.rarity];
    const isHl = highlightPhone && p.id === highlightPhone.id;
    const isSel = state.multiSelected.has(p.id);

    const item = document.createElement('div');
    item.className = 'multi-item rarity-' + p.rarity + (isHl ? ' is-highlight' : '');
    item.dataset.id = p.id;
    if (isSel) item.style.boxShadow = (isHl ? '' : '0 0 0 2px #0a84ff, 0 0 18px rgba(10,132,255,.4)');
    item.style.cursor = 'pointer';

    item.innerHTML =
      '<div class="multi-check" style="width:20px;height:20px;border-radius:50%;border:2px solid ' + (isSel ? '#0a84ff' : 'rgba(255,255,255,.3)') + ';background:' + (isSel ? '#0a84ff' : 'rgba(0,0,0,.3)') + ';display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:12px;font-weight:900;color:' + (isSel ? '#fff' : 'transparent') + ';">✓</div>' +
      '<span class="mi-flag">' + p.country.flag + '</span>' +
      '<div class="mi-info">' +
        '<div class="mi-num">' + p.number + '</div>' +
        '<div class="mi-meta" style="color:' + r.color + '">' + r.name + ' · ' + p.operator.name + (isHl ? ' · ⭐' : '') + '</div>' +
      '</div>' +
      '<div class="mi-price">' + fmt(p.price) + ' ₽</div>';

    item.addEventListener('click', () => {
      if (state.multiSelected.has(p.id)) state.multiSelected.delete(p.id);
      else state.multiSelected.add(p.id);
      renderMultiListSelectable(sortedPhones, highlightPhone);
    });

    wrap.appendChild(item);
  });

  $('resultCard').appendChild(wrap);

  // Обновляем суммы в шапке
  updateMultiHead();

  // Кнопки действий
  const actions = document.createElement('div');
  actions.id = 'multiActions';
  actions.style.cssText = 'display:flex;flex-direction:column;gap:8px;width:100%;max-width:340px;margin-top:10px;';

  const btnKeep = document.createElement('button');
  btnKeep.className = 'result-btn keep';
  btnKeep.type = 'button';
  btnKeep.id = 'multiKeep';
  btnKeep.textContent = '📦 Выбранные в инвентарь';
  btnKeep.addEventListener('click', handleMultiKeep);

  const btnSellSel = document.createElement('button');
  btnSellSel.className = 'result-btn sell';
  btnSellSel.type = 'button';
  btnSellSel.id = 'multiSellSel';
  btnSellSel.textContent = '💵 Продать выбранные';
  btnSellSel.addEventListener('click', handleMultiSellSelected);

  const btnSellAll = document.createElement('button');
  btnSellAll.className = 'result-btn sell';
  btnSellAll.type = 'button';
  btnSellAll.id = 'multiSellAll';
  btnSellAll.textContent = '💵 Продать всё';
  btnSellAll.style.background = 'linear-gradient(135deg,#ff375f,#bf5af2)';
  btnSellAll.addEventListener('click', handleMultiSellAll);

  actions.appendChild(btnKeep);
  actions.appendChild(btnSellSel);
  actions.appendChild(btnSellAll);

  $('resultCard').appendChild(actions);

  updateMultiButtons();
}

function updateMultiHead() {
  const head = document.getElementById('multiHeadCount');
  const sumEl = document.getElementById('multiHeadSum');
  if (!head || !sumEl || !state.pending) return;

  let sum = 0;
  let count = 0;
  state.pending.phones.forEach(p => {
    if (state.multiSelected.has(p.id)) {
      sum += p.price;
      count++;
    }
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

// ============ MULTI ACTIONS ============
function handleMultiKeep() {
  if (!state.pending || !state.pending.multi) return;
  const phones = state.pending.phones.filter(p => state.multiSelected.has(p.id));
  if (phones.length === 0) return;

  phones.forEach(p => {
    state.collection.unshift({
      id: p.id,
      number: p.number,
      rarity: p.rarity,
      countryCode: p.country.code,
      countryFlag: p.country.flag,
      countryName: p.country.name,
      operatorName: p.operator.name,
      operatorCode: p.operator.code,
      price: p.price,
      time: Date.now()
    });
  });

  // Удаляем выбранные из pending — они ушли в инвентарь
  state.pending.phones = state.pending.phones.filter(p => !state.multiSelected.has(p.id));
  state.multiSelected.clear();

  showToast('📦 +' + phones.length + ' в инвентарь', '#0a84ff');

  // Если все разобраны — закрываем
  if (state.pending.phones.length === 0) {
    closeResult();
  } else {
    // Иначе — перерисовываем оставшиеся
    const remaining = state.pending.phones.slice().sort((a, b) => {
      const o = {};
      RARITY_ORDER.forEach((k, i) => { o[k] = i; });
      return o[b.rarity] - o[a.rarity];
    });
    remaining.forEach(p => state.multiSelected.add(p.id));
    renderMultiListSelectable(remaining, state.pending.highlight);
  }
  updateUI();
}

function handleMultiSellSelected() {
  if (!state.pending || !state.pending.multi) return;
  const toSell = state.pending.phones.filter(p => state.multiSelected.has(p.id));
  if (toSell.length === 0) return;

  const total = toSell.reduce((s, p) => s + p.price, 0);
  state.balance += total;

  $('balance').classList.add('flash');
  setTimeout(() => $('balance').classList.remove('flash'), 700);

  showToast('💵 +' + fmt(total) + ' ₽ (' + toSell.length + ')', '#34c759');

  // Удаляем проданные
  state.pending.phones = state.pending.phones.filter(p => !state.multiSelected.has(p.id));
  state.multiSelected.clear();

  if (state.pending.phones.length === 0) {
    closeResult();
  } else {
    const remaining = state.pending.phones.slice().sort((a, b) => {
      const o = {};
      RARITY_ORDER.forEach((k, i) => { o[k] = i; });
      return o[b.rarity] - o[a.rarity];
    });
    remaining.forEach(p => state.multiSelected.add(p.id));
    renderMultiListSelectable(remaining, state.pending.highlight);
  }
  updateUI();
}

function handleMultiSellAll() {
  if (!state.pending || !state.pending.multi) return;
  const phones = state.pending.phones;
  const total = phones.reduce((s, p) => s + p.price, 0);
  state.balance += total;

  $('balance').classList.add('flash');
  setTimeout(() => $('balance').classList.remove('flash'), 700);

  showToast('💵 +' + fmt(total) + ' ₽ (' + phones.length + ')', '#34c759');
  state.multiSelected.clear();
  closeResult();
  updateUI();
}

// ============ RESULT ACTIONS ============
function handleKeepAll() {
  if (!state.pending) return;
  const phones = state.pending.phones;

  phones.forEach(p => {
    state.collection.unshift({
      id: p.id,
      number: p.number,
      rarity: p.rarity,
      countryCode: p.country.code,
      countryFlag: p.country.flag,
      countryName: p.country.name,
      operatorName: p.operator.name,
      operatorCode: p.operator.code,
      price: p.price,
      time: Date.now()
    });
  });

  showToast('📦 +' + phones.length + ' в инвентарь', '#0a84ff');
  closeResult();
}

function handleSellAll() {
  if (!state.pending) return;
  const phones = state.pending.phones;
  const total = phones.reduce((s, p) => s + p.price, 0);
  state.balance += total;
  $('balance').classList.add('flash');
  setTimeout(() => $('balance').classList.remove('flash'), 700);
  showToast('💵 +' + fmt(total) + ' ₽', '#34c759');
  closeResult();
}

function closeResult() {
  state.pending = null;
  state.multiSelected.clear();
  $('resultCard').classList.remove('show');
  removeMultiList();
  renderStaticReels();
  updateUI();
  renderInventory();
}

// ============ RARITY OPTIONS ============
function renderRarityOptions() {
  const wrap = $('rarityOptions');
  wrap.innerHTML = '';
  RARITY_FILTERS.forEach(key => {
    const r = RARITIES[key];
    const el = document.createElement('div');
    el.className = 'rarity-opt' + (key === state.minRarity ? ' active' : '');
    el.style.color = r.color;
    el.dataset.key = key;
    el.innerHTML =
      '<span class="dot"></span>' +
      '<span class="name">' + r.name + '</span>' +
      '<span class="price">' + fmt(SPIN_COSTS[key]) + '</span>';
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
  const wrap = $('invFilters');
  wrap.innerHTML = '';
  const counts = { all: state.collection.length };
  RARITY_ORDER.forEach(k => {
    counts[k] = state.collection.filter(i => i.rarity === k).length;
  });

  const filters = [{ key: 'all', name: 'Все' }].concat(
    RARITY_ORDER.map(k => ({ key: k, name: RARITIES[k].name }))
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
  grid.innerHTML = '';

  const items = state.invFilter === 'all'
    ? state.collection
    : state.collection.filter(i => i.rarity === state.invFilter);

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
    const r = RARITIES[item.rarity];
    const isSel = state.selected.has(item.id);
    const card = document.createElement('div');
    card.className = 'inv-card rarity-' + item.rarity + (isSel ? ' selected' : '');
    card.dataset.id = item.id;
    card.innerHTML =
      '<div class="glow"></div>' +
      '<div class="inv-card-check">✓</div>' +
      '<div class="inv-card-head">' +
        '<span class="inv-flag">' + item.countryFlag + '</span>' +
        '<span class="inv-rarity-badge">' + r.name + '</span>' +
      '</div>' +
      '<div class="inv-number">' + item.number + '</div>' +
      '<div class="inv-op">' + item.operatorName + '</div>' +
      '<div class="inv-price">' +
        '<span>' + fmt(item.price) + ' ₽</span>' +
        '<span class="sell-hint">' + (isSel ? '✓ выбран' : 'выбрать') + '</span>' +
      '</div>';

    card.addEventListener('click', () => toggleSelect(item.id));

    let pressTimer = null;
    card.addEventListener('pointerdown', () => {
      pressTimer = setTimeout(() => {
        pressTimer = null;
        openSellModal(item);
      }, 550);
    });
    card.addEventListener('pointerup', () => {
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    });
    card.addEventListener('pointerleave', () => {
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    });

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

// ============ SELL SELECTED / ALL ============
function sellSelectedFromInventory() {
  if (state.selected.size === 0) return;

  let total = 0;
  const toSell = [];
  state.collection.forEach(i => {
    if (state.selected.has(i.id)) {
      total += i.price;
      toSell.push(i);
    }
  });

  $('confirmText').textContent = 'Продать ' + toSell.length + ' выбранных?';
  $('confirmPrice').textContent = fmt(total) + ' ₽';
  $('confirmModal').classList.add('show');

  state.pendingSell = { ids: toSell.map(i => i.id), total: total, count: toSell.length, mode: 'selected' };
}

function sellAllFromInventory() {
  if (state.collection.length === 0) return;
  const total = state.collection.reduce((s, i) => s + i.price, 0);
  $('confirmText').textContent = 'Продать все ' + state.collection.length + ' номеров?';
  $('confirmPrice').textContent = fmt(total) + ' ₽';
  $('confirmModal').classList.add('show');

  state.pendingSell = { ids: null, total: total, count: state.collection.length, mode: 'all' };
}

function confirmSellAll() {
  const p = state.pendingSell;
  if (!p) return;

  if (p.mode === 'all') {
    state.collection = [];
    state.selected.clear();
  } else if (p.mode === 'selected') {
    const idsSet = new Set(p.ids);
    state.collection = state.collection.filter(i => !idsSet.has(i.id));
    p.ids.forEach(id => state.selected.delete(id));
  }

  state.balance += p.total;

  $('balance').classList.add('flash');
  setTimeout(() => $('balance').classList.remove('flash'), 700);

  showToast('💵 Продано ' + p.count + ' за ' + fmt(p.total) + ' ₽', '#34c759');
  $('confirmModal').classList.remove('show');
  state.pendingSell = null;
  updateUI();
  renderInventory();
  renderCountries();
}

// ============ SELL MODAL (single) ============
let sellTarget = null;

function openSellModal(item) {
  sellTarget = item;
  const r = RARITIES[item.rarity];
  $('modalFlag').textContent = item.countryFlag;
  $('modalRarity').textContent = r.name;
  $('modalRarity').style.color = r.color;
  $('modalRarity').style.textShadow = '0 0 16px ' + r.color;
  $('modalNumber').textContent = item.number;
  $('modalOp').textContent = item.countryName + ' · ' + item.operatorName;
  $('modalPrice').textContent = fmt(item.price) + ' ₽';
  $('sellModal').classList.add('show');
}

function closeSellModal() {
  $('sellModal').classList.remove('show');
  sellTarget = null;
}

function confirmSell() {
  if (!sellTarget) return;
  const idx = state.collection.findIndex(i => i.id === sellTarget.id);
  if (idx === -1) { closeSellModal(); return; }

  const price = sellTarget.price;
  const id = sellTarget.id;
  state.collection.splice(idx, 1);
  state.selected.delete(id);
  state.balance += price;

  $('balance').classList.add('flash');
  setTimeout(() => $('balance').classList.remove('flash'), 700);

  showToast('💵 Продано за ' + fmt(price) + ' ₽', '#34c759');
  closeSellModal();
  updateUI();
  renderInventory();
  renderCountries();
}

// ============ COUNTRIES ============
function renderCountries() {
  const list = $('countryList');
  list.innerHTML = '';
  COUNTRIES.forEach(c => {
    const totalCount = state.collection.filter(i => i.countryCode === c.code).length;

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

    c.operators.forEach(op => {
      const count = state.collection.filter(
        i => i.countryCode === c.code && i.operatorCode === op.code
      ).length;

      const chip = document.createElement('div');
      chip.className = 'op-chip' + (count > 0 ? ' has-numbers' : '');
      chip.innerHTML =
        '<span class="op-name">' + op.name + '</span>' +
        '<span class="op-badge">' + count + '</span>';
      chip.addEventListener('click', () => openOperatorModal(c, op));
      opsWrap.appendChild(chip);
    });

    item.appendChild(opsWrap);
    list.appendChild(item);
  });
}

// ============ OPERATOR MODAL ============
let currentOpCountry = null;
let currentOp = null;

function openOperatorModal(country, operator) {
  currentOpCountry = country;
  currentOp = operator;

  $('opFlag').textContent = country.flag;
  $('opName').textContent = operator.name;
  $('opCountry').textContent = country.name + ' · ' + country.dial;

  renderOperatorNumbers();
  $('opModal').classList.add('show');
}

function renderOperatorNumbers() {
  const list = $('opNumbersList');
  list.innerHTML = '';

  const items = state.collection.filter(
    i => i.countryCode === currentOpCountry.code && i.operatorCode === currentOp.code
  );

  if (items.length === 0) {
    list.innerHTML = '<div class="op-empty">Нет номеров этого оператора.<br>Крутите рулетку!</div>';
    $('opTotal').textContent = '0 ₽';
    $('opSellAll').disabled = true;
    $('opSellAll').style.opacity = '0.4';
    return;
  }

  const total = items.reduce((s, i) => s + i.price, 0);
  $('opTotal').textContent = fmt(total) + ' ₽';
  $('opSellAll').disabled = false;
  $('opSellAll').style.opacity = '1';

  items.forEach(item => {
    const r = RARITIES[item.rarity];
    const row = document.createElement('div');
    row.className = 'op-number-row rarity-' + item.rarity;
    row.innerHTML =
      '<div class="onr-info">' +
        '<div class="onr-num">' + item.number + '</div>' +
        '<div class="onr-rarity" style="color:' + r.color + '">' + r.name + '</div>' +
      '</div>' +
      '<div class="onr-price">' + fmt(item.price) + ' ₽</div>' +
      '<button class="onr-sell-btn" type="button">Продать</button>';
    row.querySelector('.onr-sell-btn').addEventListener('click', e => {
      e.stopPropagation();
      sellSingleFromOperator(item.id);
    });
    list.appendChild(row);
  });
}

function sellSingleFromOperator(itemId) {
  const idx = state.collection.findIndex(i => i.id === itemId);
  if (idx === -1) return;
  const item = state.collection[idx];
  state.collection.splice(idx, 1);
  state.selected.delete(itemId);
  state.balance += item.price;

  $('balance').classList.add('flash');
  setTimeout(() => $('balance').classList.remove('flash'), 700);

  showToast('💵 +' + fmt(item.price) + ' ₽', '#34c759');
  updateUI();
  renderOperatorNumbers();
  renderInventory();
  renderCountries();
}

function sellAllFromOperator() {
  const items = state.collection.filter(
    i => i.countryCode === currentOpCountry.code && i.operatorCode === currentOp.code
  );
  if (items.length === 0) return;

  const total = items.reduce((s, i) => s + i.price, 0);
  const count = items.length;

  state.collection = state.collection.filter(
    i => !(i.countryCode === currentOpCountry.code && i.operatorCode === currentOp.code)
  );
  state.balance += total;

  $('balance').classList.add('flash');
  setTimeout(() => $('balance').classList.remove('flash'), 700);

  showToast('💵 ' + count + ' шт. за ' + fmt(total) + ' ₽', '#34c759');
  updateUI();
  renderOperatorNumbers();
  renderInventory();
  renderCountries();
}

function closeOperatorModal() {
  $('opModal').classList.remove('show');
  currentOpCountry = null;
  currentOp = null;
}

// ============ TABS ============
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
        controlsSpin.style.display = 'none';
        controlsInv.style.display = 'flex';
        renderInventory();
      } else if (target === 'countries') {
        controlsSpin.style.display = 'none';
        controlsInv.style.display = 'none';
        renderCountries();
      } else if (target === 'market') {
        controlsSpin.style.display = 'none';
        controlsInv.style.display = 'none';
      } else {
        controlsSpin.style.display = 'flex';
        controlsInv.style.display = 'none';
      }
    });
  });
}

// ============ INIT ============
function init() {
  try {
    renderCountrySelector();
    renderOperatorSelector();
    renderRarityOptions();
    renderStaticReels();
    renderInventory();
    renderCountries();
    updateUI();
    setupTabs();

    $('spinBtn').addEventListener('click', spinOne);
    $('spinBtn5').addEventListener('click', spinFive);
    $('sellAllBtn').addEventListener('click', sellAllFromInventory);
    $('sellSelectedBtn').addEventListener('click', sellSelectedFromInventory);
    $('invSelClear').addEventListener('click', clearSelection);

    $('btnKeep').addEventListener('click', handleKeepAll);
    $('btnSellNow').addEventListener('click', handleSellAll);

    $('modalCancel').addEventListener('click', closeSellModal);
    $('modalSell').addEventListener('click', confirmSell);
    $('sellModal').addEventListener('click', e => {
      if (e.target === $('sellModal')) closeSellModal();
    });

    $('confirmCancel').addEventListener('click', () => {
      $('confirmModal').classList.remove('show');
      state.pendingSell = null;
    });
    $('confirmOk').addEventListener('click', confirmSellAll);
    $('confirmModal').addEventListener('click', e => {
      if (e.target === $('confirmModal')) {
        $('confirmModal').classList.remove('show');
        state.pendingSell = null;
      }
    });

    $('opCancel').addEventListener('click', closeOperatorModal);
    $('opSellAll').addEventListener('click', sellAllFromOperator);
    $('opModal').addEventListener('click', e => {
      if (e.target === $('opModal')) closeOperatorModal();
    });

    $('promoBarHead').addEventListener('click', togglePromoBar);
    $('promoBtn').addEventListener('click', activatePromo);
    $('promoInput').addEventListener('keydown', e => {
      if (e.key === 'Enter') activatePromo();
    });

    if (window.Telegram && window.Telegram.WebApp) {
      const tg = window.Telegram.WebApp;
      try {
        tg.ready();
        tg.expand();
        tg.setHeaderColor('#0b0b12');
        tg.setBackgroundColor('#0b0b12');
      } catch (e) {}
    }

    console.log('✅ App initialized');
  } catch (err) {
    console.error('❌ Init error:', err);
  }
}

// ============ MAINTENANCE CHECK ============
async function checkMaintenance() {
  try {
    const API = 'https://phone-game.onrender.com';
    const res = await fetch(API + '/api/status', { cache: 'no-store' });
    const data = await res.json();
    if (data.maintenance) {
      showMaintenance(data.maintenance_text || 'Технические работы');
      return true;
    }
  } catch (e) {
    console.log('Status check failed:', e);
  }
  return false;
}

function showMaintenance(text) {
  const overlay = document.createElement('div');
  overlay.id = 'maintOverlay';
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 99999;
    background: linear-gradient(160deg, #14141f 0%, #0b0b12 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 30px;
    color: #fff;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
  `;
  overlay.innerHTML = `
    <div style="font-size: 80px; margin-bottom: 20px;">🛠</div>
    <div style="font-size: 24px; font-weight: 900; margin-bottom: 12px;">Технические работы</div>
    <div style="font-size: 15px; color: #6e6e85; font-weight: 700; max-width: 320px; line-height: 1.5;">${text}</div>
    <div style="font-size: 13px; color: #3a3a4a; margin-top: 30px;">Скоро вернёмся 👋</div>
  `;
  document.body.appendChild(overlay);
}

async function boot() {
  const isMaint = await checkMaintenance();
  if (!isMaint) init();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
