const API_BASE = window.location.origin;
const TOKEN_KEY = 'pn_admin_token';

let token = localStorage.getItem(TOKEN_KEY) || '';
let currentAdmin = null;


async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = 'Bearer ' + token;

  const res = await fetch(API_BASE + path, { ...options, headers });
  if (!res.ok) {
    const text = await res.text();
    let detail = '';
    try { detail = JSON.parse(text).detail; } catch { detail = text; }
    if (res.status === 401 && path !== '/admin/api/login') {
      logout();
      throw new Error('Unauthorized');
    }
    throw new Error(detail || 'HTTP ' + res.status);
  }
  return res.json();
}


let toastTimer = null;
function toast(text, type = '') {
  const t = document.getElementById('toast');
  t.textContent = text;
  t.className = 'toast show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}


async function login() {
  const loginVal = document.getElementById('login-input').value.trim();
  const passVal = document.getElementById('password-input').value;
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';

  if (!loginVal || !passVal) { errEl.textContent = 'Заполните оба поля'; return; }

  try {
    const res = await fetch(API_BASE + '/admin/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: loginVal, password: passVal }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Ошибка входа');
    token = data.token;
    currentAdmin = data.admin;
    localStorage.setItem(TOKEN_KEY, token);
    showPanel();
  } catch (e) {
    errEl.textContent = e.message;
  }
}

function logout() {
  token = '';
  currentAdmin = null;
  localStorage.removeItem(TOKEN_KEY);
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('panel-screen').classList.add('hidden');
  document.getElementById('password-input').value = '';
}

async function checkAuth() {
  if (!token) return false;
  try {
    currentAdmin = await api('/admin/api/me');
    return true;
  } catch { return false; }
}

function showPanel() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('panel-screen').classList.remove('hidden');
  document.getElementById('admin-login').textContent = '👤 ' + currentAdmin.login + ' (' + currentAdmin.role + ')';
  loadDashboard();
}


function setupTabs() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.tab').forEach(t => t.classList.toggle('hidden', t.id !== 'tab-' + tab));
      if (tab === 'dashboard') loadDashboard();
      if (tab === 'users') loadUsers();
      if (tab === 'promos') loadPromos();
      if (tab === 'admins') loadAdmins();
      if (tab === 'settings') loadSettings();
      if (tab === 'maintenance') loadMaintenance();
    });
  });
}


async function loadDashboard() {
  try {
    const s = await api('/admin/api/stats');
    document.getElementById('stat-users').textContent = s.users_count;
    document.getElementById('stat-spins').textContent = s.spins_count;
    document.getElementById('stat-balance').textContent = s.total_balance.toLocaleString('ru-RU') + ' ₽';
    document.getElementById('stat-maint').textContent = s.maintenance ? 'ВКЛ' : 'выкл';
    document.getElementById('stat-maint').style.color = s.maintenance ? '#ff375f' : '#34c759';
  } catch (e) { toast(e.message, 'error'); }
}


async function loadUsers() {
  const q = document.getElementById('user-search').value.trim();
  try {
    const data = await api('/admin/api/users?q=' + encodeURIComponent(q));
    const wrap = document.getElementById('users-list');
    if (!data.users.length) {
      wrap.innerHTML = '<div style="padding:30px;text-align:center;color:#6e6e85;">Нет игроков</div>';
      return;
    }
    wrap.innerHTML = '';
    data.users.forEach(u => {
      const el = document.createElement('div');
      el.className = 'list-item';
      el.innerHTML =
        '<div class="list-item-info">' +
          '<div class="list-item-title">' + (u.first_name || '—') + ' ' + (u.last_name || '') +
            (u.is_owner ? ' 👑' : '') + (u.is_banned ? ' 🚫' : '') + '</div>' +
          '<div class="list-item-sub">@' + (u.username || '—') + ' · ID: ' + u.telegram_id +
            ' · Баланс: ' + u.balance.toLocaleString('ru-RU') + ' ₽ · Круток: ' + u.spins_total + '</div>' +
        '</div>' +
        '<div class="list-item-actions">' +
          '<button class="primary" data-act="balance" data-id="' + u.id + '" data-bal="' + u.balance + '">💰 Баланс</button>' +
          '<button class="' + (u.is_banned ? '' : 'danger') + '" data-act="ban" data-id="' + u.id + '" data-ban="' + (u.is_banned ? '0' : '1') + '">' + (u.is_banned ? '✅ Разблок' : '🚫 Бан') + '</button>' +
        '</div>';
      wrap.appendChild(el);
    });

    wrap.querySelectorAll('button[data-act="balance"]').forEach(b => {
      b.addEventListener('click', async () => {
        const val = prompt('Новый баланс:', b.dataset.bal);
        if (val === null) return;
        const amount = parseInt(val, 10);
        if (isNaN(amount)) { toast('Некорректное число', 'error'); return; }
        await api('/admin/api/users/' + b.dataset.id + '/balance', {
          method: 'POST',
          body: JSON.stringify({ amount }),
        });
        toast('Баланс обновлён', 'success');
        loadUsers();
      });
    });

    wrap.querySelectorAll('button[data-act="ban"]').forEach(b => {
      b.addEventListener('click', async () => {
        const banned = b.dataset.ban === '1';
        await api('/admin/api/users/' + b.dataset.id + '/ban', {
          method: 'POST',
          body: JSON.stringify({ banned }),
        });
        toast(banned ? 'Забанен' : 'Разбанен', 'success');
        loadUsers();
      });
    });
  } catch (e) { toast(e.message, 'error'); }
}


async function loadPromos() {
  try {
    const list = await api('/admin/api/promos');
    const wrap = document.getElementById('promos-list');
    if (!list.length) {
      wrap.innerHTML = '<div style="padding:30px;text-align:center;color:#6e6e85;">Промокодов нет</div>';
      return;
    }
    wrap.innerHTML = '';
    list.forEach(p => {
      const el = document.createElement('div');
      el.className = 'list-item';
      el.innerHTML =
        '<div class="list-item-info">' +
          '<div class="list-item-title" style="font-family:monospace;letter-spacing:2px;">' + p.code + '</div>' +
          '<div class="list-item-sub">' +
            '+ ' + p.amount.toLocaleString('ru-RU') + ' ₽ · ' +
            (p.reusable ? 'многоразовый' : 'одноразовый') +
            ' · использован ' + p.uses + ' раз' +
            (p.max_uses ? ' / ' + p.max_uses : '') +
            ' · ' + (p.is_active ? '✅ активен' : '❌ выключен') +
          '</div>' +
        '</div>' +
        '<div class="list-item-actions">' +
          '<button data-act="toggle" data-id="' + p.id + '">' + (p.is_active ? '⏸ Выкл' : '▶ Вкл') + '</button>' +
          '<button class="danger" data-act="del" data-id="' + p.id + '">🗑 Удалить</button>' +
        '</div>';
      wrap.appendChild(el);
    });

    wrap.querySelectorAll('button[data-act="toggle"]').forEach(b => {
      b.addEventListener('click', async () => {
        await api('/admin/api/promos/' + b.dataset.id + '/toggle', { method: 'POST' });
        loadPromos();
      });
    });
    wrap.querySelectorAll('button[data-act="del"]').forEach(b => {
      b.addEventListener('click', async () => {
        if (!confirm('Удалить промокод?')) return;
        await api('/admin/api/promos/' + b.dataset.id, { method: 'DELETE' });
        toast('Удалён', 'success');
        loadPromos();
      });
    });
  } catch (e) { toast(e.message, 'error'); }
}

async function createPromo() {
  const code = document.getElementById('promo-code').value.trim().toUpperCase();
  const amount = parseInt(document.getElementById('promo-amount').value, 10);
  const reusable = document.getElementById('promo-reusable').checked;
  const maxUses = parseInt(document.getElementById('promo-maxuses').value, 10) || 0;

  if (!code) { toast('Введите код', 'error'); return; }
  if (!amount || amount < 0) { toast('Введите сумму', 'error'); return; }

  try {
    await api('/admin/api/promos', {
      method: 'POST',
      body: JSON.stringify({ code, amount, reusable, max_uses: maxUses }),
    });
    toast('Создан: ' + code, 'success');
    document.getElementById('promo-code').value = '';
    loadPromos();
  } catch (e) { toast(e.message, 'error'); }
}


async function loadAdmins() {
  try {
    const list = await api('/admin/api/admins');
    const wrap = document.getElementById('admins-list');
    wrap.innerHTML = '';
    list.forEach(a => {
      const el = document.createElement('div');
      el.className = 'list-item';
      el.innerHTML =
        '<div class="list-item-info">' +
          '<div class="list-item-title">' + a.login + ' · ' + a.role + '</div>' +
          '<div class="list-item-sub">' +
            (a.is_active ? '✅ активен' : '❌ отключён') +
            ' · создан ' + (a.created_at ? a.created_at.slice(0, 10) : '—') +
          '</div>' +
        '</div>' +
        '<div class="list-item-actions">' +
          (a.role !== 'owner' ? '<button class="danger" data-act="del" data-id="' + a.id + '">🗑 Удалить</button>' : '') +
        '</div>';
      wrap.appendChild(el);
    });

    wrap.querySelectorAll('button[data-act="del"]').forEach(b => {
      b.addEventListener('click', async () => {
        if (!confirm('Удалить админа?')) return;
        await api('/admin/api/admins/' + b.dataset.id, { method: 'DELETE' });
        toast('Удалён', 'success');
        loadAdmins();
      });
    });
  } catch (e) { toast(e.message, 'error'); }
}

async function createAdmin() {
  const login = document.getElementById('admin-login-new').value.trim();
  const password = document.getElementById('admin-password-new').value;
  const role = document.getElementById('admin-role').value;

  if (!login || !password) { toast('Заполните поля', 'error'); return; }

  try {
    await api('/admin/api/admins', {
      method: 'POST',
      body: JSON.stringify({ login, password, role }),
    });
    toast('Админ создан', 'success');
    document.getElementById('admin-login-new').value = '';
    document.getElementById('admin-password-new').value = '';
    loadAdmins();
  } catch (e) { toast(e.message, 'error'); }
}


async function loadSettings() {
  try {
    const s = await api('/admin/api/settings');
    const wrap = document.getElementById('settings-list');
    wrap.innerHTML = '';
    const keys = Object.keys(s).sort();
    if (!keys.length) {
      wrap.innerHTML = '<div style="padding:30px;text-align:center;color:#6e6e85;">Настроек пока нет</div>';
      return;
    }
    keys.forEach(k => {
      const el = document.createElement('div');
      el.className = 'list-item';
      el.innerHTML =
        '<div class="list-item-info" style="flex:1;">' +
          '<div class="list-item-title" style="font-family:monospace;">' + k + '</div>' +
        '</div>' +
        '<input type="text" value="' + (s[k] || '').replace(/"/g, '&quot;') + '" data-key="' + k + '" style="padding:10px;background:#0d0d14;border:1.5px solid #26263a;border-radius:8px;color:#fff;font-size:13px;width:200px;outline:none;">';
      wrap.appendChild(el);
    });
    wrap.querySelectorAll('input[data-key]').forEach(inp => {
      inp.addEventListener('change', async () => {
        await api('/admin/api/settings', {
          method: 'POST',
          body: JSON.stringify({ [inp.dataset.key]: inp.value }),
        });
        toast('Сохранено', 'success');
      });
    });
  } catch (e) { toast(e.message, 'error'); }
}


async function loadMaintenance() {
  try {
    const s = await api('/admin/api/settings');
    document.getElementById('maint-toggle').checked = s.maintenance === '1';
    document.getElementById('maint-text').value = s.maintenance_text || 'Технические работы';
  } catch (e) { toast(e.message, 'error'); }
}

async function saveMaintenance() {
  const enabled = document.getElementById('maint-toggle').checked;
  const text = document.getElementById('maint-text').value || 'Технические работы';
  try {
    await api('/admin/api/maintenance', {
      method: 'POST',
      body: JSON.stringify({ enabled, text }),
    });
    toast(enabled ? '🛑 Техперерыв включён' : '✅ Выключен', 'success');
  } catch (e) { toast(e.message, 'error'); }
}


async function init() {
  setupTabs();

  document.getElementById('login-btn').addEventListener('click', login);
  document.getElementById('password-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') login();
  });
  document.getElementById('logout-btn').addEventListener('click', logout);

  document.getElementById('user-refresh').addEventListener('click', loadUsers);
  document.getElementById('user-search').addEventListener('input', () => {
    clearTimeout(window._searchTimer);
    window._searchTimer = setTimeout(loadUsers, 400);
  });

  document.getElementById('promo-create').addEventListener('click', createPromo);
  document.getElementById('admin-create').addEventListener('click', createAdmin);
  document.getElementById('maint-save').addEventListener('click', saveMaintenance);

  if (await checkAuth()) {
    showPanel();
  }
}

init();
