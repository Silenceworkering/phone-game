// ============================================================
// Phone Numbers — Финальная версия (переводы + обмены)
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
  bonusTimer: null
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

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
  if (options.headers) Object.assign(headers, options.headers);
  const res = await fetch(API_BASE + path, { ...options, headers });
  if (res.status === 401) { localStorage.removeItem(TOKEN_KEY); state.token = ''; }
  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }
  if (!res.ok) throw new Error((data && data.detail) || ('HTTP ' + res.status));
  return data;
}

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
  if (state.meta.maintenance) { showMaintenance(state.meta.maintenance_text || 'Технические работы'); return false; }
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
