// GitHub Pages client for backend/game_routes.py.
const API_BASE = (window.PHONE_GAME_API_BASE || 'https://phone-game.onrender.com').replace(/\/$/, '');
const $ = id => document.getElementById(id);
const money = value => (Number(value) || 0).toLocaleString('ru-RU') + ' ₽';
const state = {
  token: '', meta: null, user: null, inventory: [], selected: new Set(),
  country: 'RU', operator: null, rarity: 'common', filter: 'all',
  pending: [], busy: false, page: 'roulette', marketTab: 'all',
  tradeTab: 'incoming', lbTab: 'balance', craftRule: null,
  marketItem: null, phoneItem: null, tradeUser: null, confirmTradeMoney: null,
  myTradeItems: new Set(), theirTradeItems: new Set(),
  sound: localStorage.getItem('pn_sound_enabled') !== '0'
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
}
function setText(id, value) { if ($(id)) $(id).textContent = String(value); }
function show(id) { $(id)?.classList.add('show'); }
function hide(id) { $(id)?.classList.remove('show'); }
let toastTimer;
function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
}
function errorMessage(error) { toast(error?.message || 'Не удалось выполнить действие'); }
let audioContext;
function playTone(frequency = 600) {
  if (!state.sound) return;
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    audioContext ||= new Audio();
    if (audioContext.state === 'suspended') audioContext.resume();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.08, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.12);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.12);
  } catch { /* Sound is optional on devices without WebAudio. */ }
}
function rarity(key) {
  return state.meta?.rarities?.find(item => item.key === key) ||
    { name: key || 'Обычный', color: '#8e8e93' };
}
function post(path, body = {}) {
  return api(path, { method: 'POST', body: JSON.stringify(body) });
}
async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) headers.Authorization = 'Bearer ' + state.token;
  let response;
  try {
    response = await fetch(API_BASE + path, { ...options, headers });
  } catch {
    throw new Error('Сервер недоступен. Попробуй позже.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof data.detail === 'string' ? data.detail : 'Ошибка HTTP ' + response.status;
    throw new Error(detail);
  }
  return data;
}
async function authenticate() {
  const tg = window.Telegram?.WebApp;
  if (!tg?.initData) throw new Error('Открой игру кнопкой из Telegram-бота');
  const ref = new URLSearchParams(location.search).get('start') || tg.initDataUnsafe?.start_param;
  const response = await post('/api/auth', {
    init_data: tg.initData,
    ...(ref?.startsWith('ref_') ? { ref_code: ref } : {})
  });
  state.token = response.token;
  state.user = response.user;
  updateHeader();
}
function updateHeader() {
  setText('balance', money(state.user?.balance));
  setText('spinCount', (state.user?.spins_total || 0).toLocaleString('ru-RU'));
  setText('smiInvCount', state.inventory.length);
  const luck = state.user?.luck;
  if (luck) {
    setText('luckMult', '×' + luck.next_mult);
    setText('luckProgress', luck.progress + '/100');
    setText('luckModalNext', 'Следующая удача ×' + luck.next_mult);
    setText('luckModalLeft', 'Осталось: ' + luck.left + ' круток');
    setText('luckModalProgress', luck.progress + '/100');
    setText('luckModalSuper', 'До супер-удачи ×25: ' + luck.super_left + ' круток');
    $('luckModalFill').style.width = luck.progress + '%';
  }
}
async function refreshProfile() {
  state.user = await api('/api/me');
  updateHeader();
}
async function refreshInventory() {
  state.inventory = (await api('/api/inventory')).items || [];
  const alive = new Set(state.inventory.map(item => item.id));
  for (const id of state.selected) if (!alive.has(id)) state.selected.delete(id);
  updateHeader();
  renderInventory();
}
function switchPage(page) {
  if (!$('page-' + page)) return;
  state.page = page;
  document.querySelectorAll('.page').forEach(el => el.classList.toggle('active', el.id === 'page-' + page));
  document.querySelectorAll('.side-menu-item').forEach(el =>
    el.classList.toggle('active', el.dataset.page === page));
  $('controls').style.display = page === 'roulette' ? 'flex' : 'none';
  closeMenu();
  const loaders = {
    inventory: refreshInventory, countries: renderCountries, craft: loadCraft,
    top: loadLeaderboard, profile: loadProfilePage, quests: loadQuests,
    market: loadMarket, dice: loadDice, referral: loadReferral
  };
  if (loaders[page]) Promise.resolve(loaders[page]()).catch(errorMessage);
}
function closeMenu() { $('sideMenu').classList.remove('open'); hide('sideMenuBackdrop'); }
function bindNavigation() {
  document.querySelectorAll('.side-menu-item').forEach(el =>
    el.addEventListener('click', () => switchPage(el.dataset.page)));
  $('burgerBtn').addEventListener('click', () => {
    $('sideMenu').classList.add('open'); show('sideMenuBackdrop');
  });
  $('sideMenuClose').addEventListener('click', closeMenu);
  $('sideMenuBackdrop').addEventListener('click', closeMenu);
  $('promoBarHead').addEventListener('click', () => $('promoBar').classList.toggle('open'));
  $('promoBtn').addEventListener('click', applyPromo);
  $('promoInput').addEventListener('keydown', event => {
    if (event.key === 'Enter') applyPromo();
  });
  $('luckPill').addEventListener('click', () => show('luckModal'));
  $('luckOkBtn').addEventListener('click', () => hide('luckModal'));
  $('soundToggle').addEventListener('click', () => {
    state.sound = !state.sound;
    localStorage.setItem('pn_sound_enabled', state.sound ? '1' : '0');
    setText('soundIcon', state.sound ? '🔊' : '🔇');
    setText('soundText', state.sound ? 'Звук вкл' : 'Звук выкл');
  });
  document.querySelectorAll('.modal-backdrop').forEach(el =>
    el.addEventListener('click', event => { if (event.target === el) hide(el.id); }));
}
function renderSelectors() {
  const countries = state.meta?.countries || [];
  $('countrySelector').replaceChildren(...countries.map(country => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'country-chip' + (state.country === country.code ? ' active' : '');
    button.innerHTML = '<span class="cf">' + escapeHtml(country.flag) +
      '</span><span class="cn">' + escapeHtml(country.name) + '</span>';
    button.onclick = () => {
      if (state.busy || state.pending.length) return;
      state.country = country.code; state.operator = null;
      renderSelectors(); renderReels();
    };
    return button;
  }));
  const current = countries.find(country => country.code === state.country) || countries[0];
  const operators = [{ code: null, name: 'Любой' }, ...(current?.operators || [])];
  $('operatorSelector').replaceChildren(...operators.map(operator => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'country-chip op-chip-mini' + (state.operator === operator.code ? ' active' : '');
    button.textContent = operator.name;
    button.onclick = () => {
      if (state.busy || state.pending.length) return;
      state.operator = operator.code; renderSelectors(); renderReels();
    };
    return button;
  }));
  const filters = state.meta?.rarity_filters || ['common'];
  $('rarityOptions').replaceChildren(...filters.map(key => {
    const info = rarity(key);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'rarity-opt' + (key === state.rarity ? ' active' : '');
    button.style.color = info.color;
    button.innerHTML = '<span class="dot"></span><span class="name">' +
      escapeHtml(info.name) + '</span><span class="price">' +
      money(state.meta.spin_costs[key]) + '</span>';
    button.onclick = () => {
      if (state.busy || state.pending.length) return;
      state.rarity = key; renderSelectors(); updateSpinPrices();
    };
    return button;
  }));
  updateSpinPrices();
}
function updateSpinPrices() {
  let factor = 1;
  if (state.meta?.boost_discount?.active) factor *= .5;
  if (state.meta?.boost_golden?.active) factor *= .5;
  const cost = Math.floor((state.meta?.spin_costs?.[state.rarity] || 500) * factor);
  setText('spinBtnPrice', money(cost));
  setText('spinBtn5Price', money(cost * 5));
}
function renderReels(number) {
  const reel = $('reels');
  const country = state.meta?.countries?.find(item => item.code === state.country);
  const flag = country?.flag || '📞';
  const operators = country?.operators || [];
  const operator = operators.find(item => item.code === state.operator) || operators[0];
  reel.innerHTML = Array.from({ length: 5 }, (_, index) =>
    '<div class="reel-row' + (index === 2 ? ' center' : '') + '"><span class="flag">' +
    escapeHtml(flag) + '</span>' + escapeHtml(index === 2 && number ? number : '+7 ••• •••-••-••') +
    '<span class="op">' + escapeHtml(operator?.name || '') + '</span></div>').join('');
}
function previewNumber(number) {
  const digits = (number.match(/\d/g) || []).length;
  let position = 0;
  return number.replace(/\d/g, digit =>
    ++position <= digits - 6 ? digit : String(Math.floor(Math.random() * 10)));
}
async function animateSpinReveal(phone) {
  const reel = $('reels');
  const windowEl = $('rouletteWindow');
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!reel.animate || reducedMotion) {
    renderReels(phone.number);
    windowEl.className = 'roulette-window rarity-' + phone.rarity;
    return;
  }

  const centerIndex = 14;
  reel.innerHTML = Array.from({ length: 17 }, (_, index) => {
    const number = index === centerIndex ? phone.number : previewNumber(phone.number);
    return '<div class="reel-row' + (index === centerIndex ? ' center' : '') +
      '"><span class="flag">' + escapeHtml(phone.country_flag || '📞') +
      '</span>' + escapeHtml(number) + '<span class="op">' +
      escapeHtml(phone.operator_name || '') + '</span></div>';
  }).join('');

  // Каждый ряд имеет высоту 44px; оставляем выигрышный ряд по центру окна.
  const distance = (centerIndex - 2) * 44;
  const animation = reel.animate(
    [{ transform: 'translateY(0)' }, { transform: 'translateY(-' + distance + 'px)' }],
    { duration: 1250, easing: 'cubic-bezier(.12,.72,.18,1)', fill: 'forwards' }
  );
  try { await animation.finished; } catch { /* При отмене всё равно показываем результат. */ }
  animation.cancel();
  renderReels(phone.number);
  windowEl.className = 'roulette-window rarity-' + phone.rarity;
  await new Promise(resolve => setTimeout(resolve, 180));
}
function closeResults() {
  hide('resultOverlay'); hide('multiOverlay');
  state.pending = [];
  $('rouletteWindow').className = 'roulette-window';
  renderReels();
}
function renderSpinResult() {
  const phones = state.pending;
  if (phones.length === 1) {
    const phone = phones[0], info = rarity(phone.rarity);
    setText('resultRarity', info.name);
    $('resultRarity').style.color = info.color;
    setText('phoneFlag', phone.country_flag || '📞');
    setText('phoneNumber', phone.number);
    setText('resultOperator', [phone.country_name, phone.operator_name].filter(Boolean).join(' · '));
    setText('resultTotal', 'Красота ×' + (phone.multiplier || 1));
    setText('resultPriceFinal', money(phone.price));
    $('beautyList').replaceChildren(...(phone.components || []).map(part => {
      const line = document.createElement('div');
      line.className = 'beauty-row';
      line.textContent = typeof part === 'string' ? part : (part.name || part.label || 'Бонус') +
        ': ×' + (part.multiplier || part.value || 1);
      return line;
    }));
    renderReels(phone.number);
    show('resultOverlay');
  } else {
    setText('multiSubtitle', 'Всего: ' + money(phones.reduce((sum, phone) => sum + phone.price, 0)));
    $('multiList').replaceChildren(...phones.map(phone => {
      const card = document.createElement('div');
      card.className = 'multi-card rarity-' + phone.rarity;
      card.innerHTML = '<div class="multi-card-body"><div class="multi-number">' +
        escapeHtml(phone.country_flag || '📞') + ' ' + escapeHtml(phone.number) +
        '</div><div class="multi-price">' + money(phone.price) + '</div></div>';
      return card;
    }));
    show('multiOverlay');
  }
}
async function spin(count) {
  if (state.busy || state.pending.length || !state.user) return;
  state.busy = true;
  $('spinBtn').disabled = $('spinBtn5').disabled = true;
  $('rouletteWindow').className = 'roulette-window spinning';
  playTone(420);
  try {
    const body = { country: state.country, operator: state.operator, min_rarity: state.rarity };
    const result = await post(count === 5 ? '/api/spin5' : '/api/spin', body);
    state.pending = count === 5 ? result.phones || [] : [result.phone].filter(Boolean);
    if (!state.pending.length) throw new Error('Пустой ответ сервера');
    state.user.balance = result.balance;
    state.user.spins_total = result.spins_total;
    state.user.luck = result.luck_info;
    updateHeader();
    const order = state.meta?.rarity_order || [];
    const featured = state.pending.reduce((best, phone) =>
      order.indexOf(phone.rarity) > order.indexOf(best.rarity) ? phone : best);
    await animateSpinReveal(featured);
    renderSpinResult();
    playTone(850);
    notifyAchievements(result.new_achievements);
  } catch (error) { errorMessage(error); }
  finally {
    $('rouletteWindow').classList.remove('spinning');
    state.busy = false;
    $('spinBtn').disabled = $('spinBtn5').disabled = false;
  }
}
async function resolveSpin(keep) {
  if (state.busy || !state.pending.length) return;
  state.busy = true;
  try {
    const phones = state.pending;
    const result = await post(keep ? '/api/inventory/keep' : '/api/sell-immediate', {
      pending_ids: phones.map(phone => phone.pending_id)
    });
    closeResults();
    if (!keep) state.user.balance = result.balance;
    await refreshInventory();
    await refreshProfile();
    playTone(keep ? 700 : 1000);
    toast(keep ? 'Номера в инвентаре' : 'Продано за ' + money(result.total));
    notifyAchievements(result.new_achievements);
  } catch (error) { errorMessage(error); }
  finally { state.busy = false; }
}
async function applyPromo() {
  const input = $('promoInput');
  const code = input.value.trim();
  if (!code) return toast('Введите промокод');
  try {
    const result = await post('/api/promo/activate', { code });
    input.value = '';
    $('promoBar').classList.remove('open');
    state.user.balance = result.balance;
    updateHeader();
    toast('Получено ' + money(result.amount));
  } catch (error) { errorMessage(error); }
}
async function loadBonus() {
  const result = await api('/api/daily-bonus/status');
  $('bonusBtn').disabled = !result.available;
  setText('bonusSub', result.available ? 'Доступно ' + money(result.bonus) :
    'Следующий бонус через ' + Math.ceil(result.seconds_left / 3600) + ' ч');
}
async function claimBonus() {
  try {
    const result = await post('/api/daily-bonus');
    state.user.balance = result.balance;
    updateHeader(); toast('Получено ' + money(result.amount));
    await loadBonus();
  } catch (error) { errorMessage(error); }
}
function notifyAchievements(items) {
  if (!items?.length) return;
  const item = items[0];
  setText('achName', item.name);
  setText('achDesc', item.desc);
  setText('achReward', money(item.reward));
  show('achModal');
}
function renderInventory() {
  const filters = ['all', ...(state.meta?.rarity_order || [])];
  $('invFilters').replaceChildren(...filters.map(key => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'inv-filter' + (key === state.filter ? ' active' : '');
    button.textContent = key === 'all' ? 'Все' : rarity(key).name;
    button.onclick = () => { state.filter = key; renderInventory(); };
    return button;
  }));
  const items = state.inventory.filter(item => state.filter === 'all' || item.rarity === state.filter);
  $('invGrid').replaceChildren(...items.map(item => {
    const card = document.createElement('div');
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.className = 'inv-card rarity-' + item.rarity +
      (state.selected.has(item.id) ? ' selected' : '');
    card.innerHTML = '<div class="inv-card-head"><span class="inv-flag">' +
      escapeHtml(item.country_flag || '📞') + '</span><span class="inv-rarity-badge">' +
      escapeHtml(rarity(item.rarity).name) + '</span></div><div class="inv-number">' +
      escapeHtml(item.number) + '</div><div class="inv-op">' +
      escapeHtml(item.operator_name || '') + '</div><div class="inv-price">' +
      money(item.price) + '</div>';
    card.onclick = () => {
      if (state.selected.has(item.id)) state.selected.delete(item.id);
      else state.selected.add(item.id);
      renderInventory();
    };
    card.onkeydown = event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault(); card.click();
      }
    };
    const details = document.createElement('button');
    details.type = 'button';
    details.className = 'inv-details-btn';
    details.textContent = 'Подробнее';
    details.onclick = event => { event.stopPropagation(); openPhone(item); };
    card.appendChild(details);
    return card;
  }));
  if (!items.length) $('invGrid').innerHTML = '<p class="page-hint">Здесь пока нет номеров</p>';
  const selected = state.inventory.filter(item => state.selected.has(item.id));
  $('invSelectionBar').classList.toggle('visible', selected.length > 0);
  $('invActions').style.display = selected.length ? 'block' : 'none';
  setText('invSelCount', 'Выбрано: ' + selected.length);
  setText('invSelSum', money(selected.reduce((sum, item) => sum + item.price, 0)));
  setText('invSellBtn', '💵 Продать выбранные за ' +
    money(selected.reduce((sum, item) => sum + item.price, 0)));
}
async function sellInventory(ids) {
  if (!ids.length) return;
  try {
    const result = await post('/api/inventory/sell', { ids });
    state.selected.clear();
    state.user.balance = result.balance;
    await refreshInventory();
    updateHeader();
    hide('phoneInfoModal');
    toast('Продано за ' + money(result.total));
    notifyAchievements(result.new_achievements);
  } catch (error) { errorMessage(error); }
}
function openPhone(item) {
  state.phoneItem = item;
  setText('pimFlag', item.country_flag || '📞');
  setText('pimRarity', rarity(item.rarity).name);
  setText('pimNumber', item.number);
  setText('pimOp', item.operator_name || '');
  setText('pimPrice', money(item.price));
  $('pimSell').style.display = item.id ? '' : 'none';
  $('pimListMarket').style.display = item.id ? '' : 'none';
  show('phoneInfoModal');
}
function renderCountries() {
  const countries = state.meta?.countries || [];
  $('countryList').replaceChildren(...countries.map(country => {
    const count = state.inventory.filter(item => item.country_code === country.code).length;
    const card = document.createElement('div');
    card.className = 'country-item';
    card.innerHTML = '<div class="country-item-head"><span class="country-flag">' +
      escapeHtml(country.flag) + '</span><div class="country-info"><div class="country-name">' +
      escapeHtml(country.name) + '</div></div><div class="country-stats">' + count +
      ' номеров</div></div><div class="op-list">' +
      (country.operators || []).map(op => '<span class="op-chip">' +
      escapeHtml(op.name) + '</span>').join('') + '</div>';
    return card;
  }));
}
async function loadCraft() {
  const rules = (await api('/api/craft')).rules || [];
  $('craftList').replaceChildren(...rules.map(rule => {
    const card = document.createElement('div');
    card.className = 'country-item';
    card.innerHTML = '<div class="country-name">' + escapeHtml(rule.from_name) +
      ' → ' + escapeHtml(rule.to_name) + '</div><div class="page-hint">Нужно: ' +
      rule.need + ' · Есть: ' + rule.have + ' · Цена: ' + money(rule.cost) + '</div>';
    const button = document.createElement('button');
    button.className = 'quest-claim-btn';
    button.textContent = 'Скрафтить';
    button.disabled = !rule.can_craft;
    button.onclick = () => {
      state.craftRule = rule;
      setText('craftRarity', rule.to_name);
      setText('craftResult', rule.need + ' × ' + rule.from_name + ' → 1 × ' + rule.to_name);
      setText('craftCost', money(rule.cost));
      show('craftModal');
    };
    card.appendChild(button);
    return card;
  }));
}
async function confirmCraft() {
  if (!state.craftRule) return;
  try {
    const result = await post('/api/craft', { from_rarity: state.craftRule.from_rarity });
    hide('craftModal');
    state.user.balance = result.balance;
    await refreshInventory();
    updateHeader();
    await loadCraft();
    toast('Получен номер ' + result.new_phone.number);
    notifyAchievements(result.new_achievements);
  } catch (error) { errorMessage(error); }
}
async function loadLeaderboard() {
  const path = state.lbTab === 'spins' ? '/api/leaderboard/spins' : '/api/leaderboard';
  const response = await api(path);
  const rows = response[state.lbTab] || [];
  $('lbList').replaceChildren(...rows.map((row, index) => {
    const el = document.createElement('div');
    el.className = 'country-item';
    el.textContent = (index + 1) + '. ' + (row.name || 'Игрок') + ' · ' +
      (state.lbTab === 'spins' ? row.spins + ' круток' : money(row.balance));
    return el;
  }));
  if (!rows.length) $('lbList').textContent = 'Пока нет игроков';
}
async function loadAchievements() {
  const result = await api('/api/achievements');
  setText('achCount', result.total_unlocked + '/' + result.total);
  $('achList').replaceChildren(...(result.all || []).map(item => {
    const el = document.createElement('div');
    el.className = 'country-item';
    el.style.opacity = item.unlocked ? '1' : '.55';
    el.textContent = (item.unlocked ? '🏅 ' : '🔒 ') + item.name +
      ' · ' + money(item.reward);
    return el;
  }));
}
async function loadQuests() {
  const response = await api('/api/quests');
  const quests = response.quests || [];
  setText('smiQuestCount', quests.filter(item => item.can_claim).length);
  $('questsList').replaceChildren(...quests.map(item => {
    const el = document.createElement('div');
    el.className = 'quest-item' + (item.claimed ? ' claimed' : item.can_claim ? ' done' : '');
    el.innerHTML = '<div class="quest-head"><span class="quest-name">' +
      escapeHtml(item.name) + '</span><span class="quest-reward">' +
      money(item.reward) + '</span></div><div class="quest-progress-text">' +
      item.progress + '/' + item.target + '</div>';
    const button = document.createElement('button');
    button.className = 'quest-claim-btn';
    button.textContent = item.claimed ? 'Получено' : 'Забрать';
    button.disabled = !item.can_claim;
    button.onclick = async () => {
      try {
        const result = await post('/api/quests/' + item.id + '/claim');
        state.user.balance = result.balance;
        updateHeader(); await loadQuests();
        toast('Получено ' + money(result.reward));
      } catch (error) { errorMessage(error); }
    };
    el.appendChild(button);
    return el;
  }));
}
async function loadMarket() {
  const path = state.marketTab === 'my' ? '/api/market/my' : '/api/market';
  const response = await api(path);
  const rows = response.listings || [];
  $('marketList').replaceChildren(...rows.map(item => {
    const card = document.createElement('div');
    card.className = 'market-item rarity-' + item.rarity;
    card.innerHTML = '<div class="inv-number">' + escapeHtml(item.country_flag || '📞') +
      ' ' + escapeHtml(item.number) + '</div><div class="inv-op">' +
      escapeHtml(item.seller_name || '') + '</div><div class="inv-price">' +
      money(item.price) + '</div>';
    const button = document.createElement('button');
    button.className = 'quest-claim-btn';
    button.textContent = state.marketTab === 'my' ? 'Снять лот' : 'Купить';
    button.onclick = async () => {
      try {
        const result = await post(state.marketTab === 'my' ?
          '/api/market/cancel/' + item.id : '/api/market/buy/' + item.id);
        if (result.balance !== undefined) state.user.balance = result.balance;
        updateHeader(); await loadMarket(); await refreshInventory();
        toast(state.marketTab === 'my' ? 'Лот снят' : 'Номер куплен');
      } catch (error) { errorMessage(error); }
    };
    card.appendChild(button);
    return card;
  }));
  if (!rows.length) $('marketList').textContent = 'Лотов пока нет';
}
async function confirmMarketList() {
  const item = state.marketItem;
  const price = Number($('marketPriceInput').value);
  if (!item || !Number.isInteger(price) || price < 10) return toast('Укажи цену от 10 ₽');
  try {
    await post('/api/market/list', { inv_id: item.id, price });
    hide('marketListModal'); hide('phoneInfoModal');
    await refreshInventory();
    toast('Лот выставлен');
  } catch (error) { errorMessage(error); }
}
async function loadDice() {
  const rows = (await api('/api/dice')).games || [];
  $('diceList').replaceChildren(...rows.map(item => {
    const card = document.createElement('div');
    card.className = 'country-item';
    card.innerHTML = '<div class="country-name">' + escapeHtml(item.creator_name) +
      '</div><div class="page-hint">Ставка: ' + money(item.bet) + '</div>';
    const button = document.createElement('button');
    button.className = 'quest-claim-btn';
    const mine = item.creator_id === state.user?.telegram_id;
    button.textContent = mine ? 'Отменить' : 'Играть';
    button.onclick = async () => {
      try {
        const result = await post(mine ? '/api/dice/cancel/' + item.id :
          '/api/dice/join/' + item.id);
        state.user.balance = result.balance;
        updateHeader(); await loadDice();
        if (mine) toast('Игра отменена');
        else {
          setText('diceCube1', result.dice_creator);
          setText('diceCube2', result.dice_opponent);
          setText('diceResultText', result.result === 'opponent' ? 'Ты победил!' :
            result.result === 'draw' ? 'Ничья' : 'Победил соперник');
          show('diceResultModal');
        }
      } catch (error) { errorMessage(error); }
    };
    card.appendChild(button);
    return card;
  }));
  if (!rows.length) $('diceList').textContent = 'Открытых игр пока нет';
}
async function createDice() {
  const bet = Number($('diceBetInput').value);
  if (!Number.isInteger(bet) || bet < 100) return toast('Ставка от 100 ₽');
  try {
    const result = await post('/api/dice/create', { bet });
    state.user.balance = result.balance; updateHeader();
    hide('diceCreateModal'); await loadDice();
    toast('Игра создана');
  } catch (error) { errorMessage(error); }
}
async function loadReferral() {
  const result = await api('/api/referrals');
  $('refLinkInput').value = result.link || '';
  setText('refCount', result.count || 0);
  setText('refEarned', money(result.total_earned));
}
async function loadProfilePage() {
  await Promise.all([loadTrades(), loadAchievements()]);
}
async function loadTrades() {
  const incoming = await api('/api/trade/incoming');
  setText('tradeInCount', incoming.trades?.length || 0);
  const response = state.tradeTab === 'incoming' ? incoming : await api('/api/trade/outgoing');
  const rows = response.trades || [];
  $('tradesList').replaceChildren(...rows.map(item => {
    const card = document.createElement('div');
    card.className = 'trade-item';
    card.innerHTML = '<div class="trade-head">' + escapeHtml(state.tradeTab === 'incoming' ?
      item.from_name : item.to_name) + '</div><div>₽ ' +
      money(item.from_money) + ' ↔ ' + money(item.to_money) + '</div>';
    if (state.tradeTab === 'incoming') {
      const actions = document.createElement('div');
      actions.className = 'trade-actions';
      for (const [label, action] of [['Принять', 'accept'], ['Отклонить', 'decline']]) {
        const button = document.createElement('button');
        button.className = 'trade-btn ' + (action === 'accept' ? 'accept' : 'decline');
        button.textContent = label;
        button.onclick = async () => {
          try {
            await post('/api/trade/' + item.id + '/respond', { action });
            await refreshProfile(); await refreshInventory(); await loadTrades();
            toast(action === 'accept' ? 'Обмен принят' : 'Обмен отклонён');
          } catch (error) { errorMessage(error); }
        };
        actions.appendChild(button);
      }
      card.appendChild(actions);
    }
    return card;
  }));
  if (!rows.length) $('tradesList').textContent = 'Заявок пока нет';
}
function tradeItemRow(item, selected) {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'trade-item-row' + (selected.has(item.id) ? ' selected' : '');
  row.innerHTML = '<span class="ti-flag">' + escapeHtml(item.country_flag || '📞') +
    '</span><span class="ti-info"><span class="ti-num">' +
    escapeHtml(item.number) + '</span></span><span class="ti-price">' +
    money(item.price) + '</span>';
  row.onclick = () => {
    if (selected.has(item.id)) selected.delete(item.id);
    else selected.add(item.id);
    row.classList.toggle('selected', selected.has(item.id));
  };
  return row;
}
async function findTradeUser(forMoney) {
  const prefix = forMoney ? 'money' : 'trade';
  const username = $(prefix + 'Username').value.trim();
  if (!username) return toast('Введи @username');
  try {
    const response = await post('/api/trade/find', { username });
    state.tradeUser = response.user;
    state.theirTradeItems.clear(); state.myTradeItems.clear();
    const info = $(prefix + 'FoundInfo');
    info.textContent = 'Найден: ' + (response.user.first_name || response.user.username);
    info.classList.add('show');
    if (forMoney) {
      $('moneyAmountSection').style.display = 'block';
      $('moneySend').style.display = '';
      setText('moneyMyBal', money(state.user.balance));
    } else {
      $('tradeMySection').style.display = '';
      $('tradeHisSection').style.display = '';
      $('tradeMsgSection').style.display = '';
      $('tradeSend').style.display = '';
      $('tradeMyItems').replaceChildren(...state.inventory.map(item =>
        tradeItemRow(item, state.myTradeItems)));
      $('tradeHisItems').replaceChildren(...(response.items || []).map(item =>
        tradeItemRow(item, state.theirTradeItems)));
    }
  } catch (error) { errorMessage(error); }
}
function validAmount(value) {
  const amount = Number(value || 0);
  return Number.isInteger(amount) && amount >= 0 ? amount : null;
}
async function sendTrade(forMoney) {
  if (!state.tradeUser) return toast('Сначала найди игрока');
  const fromMoney = validAmount($(forMoney ? 'moneyAmount' : 'tradeMyMoney').value);
  const toMoney = forMoney ? 0 : validAmount($('tradeHisMoney').value);
  if (fromMoney === null || toMoney === null ||
      fromMoney > state.user.balance ||
      (forMoney && fromMoney === 0)) return toast('Проверь сумму и баланс');
  const body = {
    to_username: state.tradeUser.username,
    from_items: forMoney ? [] : Array.from(state.myTradeItems),
    to_items: forMoney ? [] : Array.from(state.theirTradeItems),
    from_money: fromMoney,
    to_money: toMoney,
    message: $(forMoney ? 'moneyMessage' : 'tradeMessage').value.trim()
  };
  if (!body.from_items.length && !body.to_items.length && !fromMoney && !toMoney)
    return toast('Выбери номера или деньги');
  try {
    await post('/api/trade/create', body);
    hide('tradeConfirmModal');
    hide(forMoney ? 'moneyModal' : 'tradeModal');
    toast('Предложение отправлено. Получатель должен его принять.');
    await loadTrades();
  } catch (error) { errorMessage(error); }
}
function prepareTrade(forMoney) {
  if (!state.tradeUser) return toast('Сначала найди игрока');
  const amount = validAmount($(forMoney ? 'moneyAmount' : 'tradeMyMoney').value);
  if (amount === null || amount > state.user.balance || (forMoney && amount === 0))
    return toast('Проверь сумму и баланс');
  state.confirmTradeMoney = forMoney;
  setText('tradeConfirmText', 'Отправить предложение игроку @' +
    state.tradeUser.username + (amount ? ' на ' + money(amount) : '') + '?');
  show('tradeConfirmModal');
}
function bindActions() {
  $('spinBtn').onclick = () => spin(1);
  $('spinBtn5').onclick = () => spin(5);
  $('btnKeep').onclick = () => resolveSpin(true);
  $('btnSellNow').onclick = () => resolveSpin(false);
  $('multiKeepBtn').onclick = () => resolveSpin(true);
  $('multiSellBtn').onclick = () => resolveSpin(false);
  $('bonusBtn').onclick = claimBonus;
  $('achOk').onclick = () => hide('achModal');
  $('invSelClear').onclick = () => { state.selected.clear(); renderInventory(); };
  $('invSellBtn').onclick = () => sellInventory(Array.from(state.selected));
  $('pimCancel').onclick = () => hide('phoneInfoModal');
  $('pimSell').onclick = () => state.phoneItem && sellInventory([state.phoneItem.id]);
  $('pimListMarket').onclick = () => {
    state.marketItem = state.phoneItem;
    setText('marketListNumber', state.marketItem.number);
    $('marketPriceInput').value = state.marketItem.price;
    show('marketListModal');
  };
  $('marketListCancel').onclick = () => hide('marketListModal');
  $('marketListConfirm').onclick = confirmMarketList;
  document.querySelectorAll('[data-price]').forEach(button =>
    button.addEventListener('click', () => { $('marketPriceInput').value = button.dataset.price; }));
  $('craftCancel').onclick = () => hide('craftModal');
  $('craftConfirm').onclick = confirmCraft;
  document.querySelectorAll('.lb-tab').forEach(button =>
    button.addEventListener('click', () => {
      state.lbTab = button.dataset.lb;
      document.querySelectorAll('.lb-tab').forEach(el =>
        el.classList.toggle('active', el === button));
      loadLeaderboard().catch(errorMessage);
    }));
  document.querySelectorAll('.market-tab').forEach(button =>
    button.addEventListener('click', () => {
      state.marketTab = button.dataset.market;
      document.querySelectorAll('.market-tab').forEach(el =>
        el.classList.toggle('active', el === button));
      loadMarket().catch(errorMessage);
    }));
  document.querySelectorAll('.trade-tab').forEach(button =>
    button.addEventListener('click', () => {
      state.tradeTab = button.dataset.trade;
      document.querySelectorAll('.trade-tab').forEach(el =>
        el.classList.toggle('active', el === button));
      loadTrades().catch(errorMessage);
    }));
  $('diceCreateBtn').onclick = () => show('diceCreateModal');
  $('diceCreateCancel').onclick = () => hide('diceCreateModal');
  $('diceCreateConfirm').onclick = createDice;
  $('diceResultOk').onclick = () => hide('diceResultModal');
  document.querySelectorAll('[data-bet]').forEach(button =>
    button.addEventListener('click', () => { $('diceBetInput').value = button.dataset.bet; }));
  $('refCopyBtn').onclick = async () => {
    const value = $('refLinkInput').value;
    if (!value) return toast('Ссылка ещё не настроена');
    try { await navigator.clipboard.writeText(value); toast('Ссылка скопирована'); }
    catch { $('refLinkInput').select(); document.execCommand('copy'); toast('Ссылка скопирована'); }
  };
  $('openMoneyBtn').onclick = () => {
    state.tradeUser = null;
    $('moneyFoundInfo').classList.remove('show');
    $('moneyAmountSection').style.display = 'none';
    $('moneySend').style.display = 'none';
    show('moneyModal');
  };
  $('openTradeBtn').onclick = () => {
    state.tradeUser = null;
    $('tradeFoundInfo').classList.remove('show');
    for (const id of ['tradeMySection','tradeHisSection','tradeMsgSection','tradeSend'])
      $(id).style.display = 'none';
    show('tradeModal');
  };
  $('moneyCancel').onclick = () => hide('moneyModal');
  $('tradeCancel').onclick = () => hide('tradeModal');
  $('moneyFindBtn').onclick = () => findTradeUser(true);
  $('tradeFindBtn').onclick = () => findTradeUser(false);
  $('moneySend').onclick = () => prepareTrade(true);
  $('tradeSend').onclick = () => prepareTrade(false);
  $('tradeConfirmCancel').onclick = () => hide('tradeConfirmModal');
  $('tradeConfirmOk').onclick = () => sendTrade(state.confirmTradeMoney);
  document.querySelectorAll('[data-amt]').forEach(button =>
    button.addEventListener('click', () => { $('moneyAmount').value = button.dataset.amt; }));
}
async function init() {
  bindNavigation();
  bindActions();
  renderReels();
  window.Telegram?.WebApp?.ready();
  window.Telegram?.WebApp?.expand();
  $('retryBtn').onclick = connect;
  await connect();
}
async function connect() {
  $('retryBtn').disabled = true;
  $('spinBtn').disabled = $('spinBtn5').disabled = true;
  $('bonusBtn').disabled = true;
  $('promoBtn').disabled = true;
  try {
    await authenticate();
    state.meta = await api('/api/status');
    if (state.meta.maintenance) throw new Error(state.meta.maintenance_text || 'Технические работы');
    await Promise.all([refreshProfile(), refreshInventory(), loadBonus()]);
    state.pending = (await api('/api/pending')).phones || [];
    renderSelectors();
    renderCountries();
    updateHeader();
    if (state.pending.length) renderSpinResult();
    $('connectionStatus').hidden = true;
    $('spinBtn').disabled = $('spinBtn5').disabled = false;
    $('promoBtn').disabled = false;
  } catch (error) {
    console.error(error);
    setText('connectionMessage', errorMessageText(error));
    $('connectionStatus').hidden = false;
  } finally {
    $('retryBtn').disabled = false;
  }
}
function errorMessageText(error) { return error?.message || 'Ошибка запуска'; }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
