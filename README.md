# Phone Numbers — Telegram Mini App

Игра-рулетка телефонных номеров с админ-панелью.

## Что в первой итерации

- ✅ FastAPI backend с SQLite
- ✅ Авторизация через Telegram initData
- ✅ Админка с логином/паролем
- ✅ Промокоды (создание/удаление/вкл-выкл)
- ✅ Создание админов (только владелец)
- ✅ Техперерыв (вкл/выкл)
- ✅ Бот с `/start`, `/admin`, `/pause`, `/resume`
- ⏳ Игровая логика на сервере (следующая итерация)

## Быстрый старт (локально)

### 1. Установи Python 3.11+
Скачать: https://www.python.org/downloads/

### 2. Создай виртуальное окружение
```bash
python -m venv venv
```

Windows:
```bash
venv\Scripts\activate
```

Mac/Linux:
```bash
source venv/bin/activate
```

### 3. Установи зависимости
```bash
pip install -r backend/requirements.txt
```

### 4. Создай `.env`
Скопируй `.env.example` в `.env` и заполни:
- `BOT_TOKEN` — токен бота от [@BotFather](https://t.me/BotFather)
- `OWNER_TELEGRAM_ID` — свой ID от [@userinfobot](https://t.me/userinfobot)
- `JWT_SECRET` — любая длинная случайная строка

### 5. Запусти сервер
```bash
uvicorn backend.main:app --reload
```

Открой:
- http://localhost:8000 — API работает?
- http://localhost:8000/docs — Swagger
- http://localhost:8000/admin — Админка
  - **Логин:** `owner`
  - **Пароль:** `owner123`
  - ⚠️ **СРАЗУ поменяй пароль** после первого входа!

## Деплой на Render

### 1. Залей проект на GitHub
Уже сделано.

### 2. Render.com
1. Войди на https://render.com через GitHub
2. **New +** → **Web Service**
3. Выбери репозиторий `phone-game`
4. Настройки:
   - **Name:** `phone-game-api`
   - **Runtime:** Python 3
   - **Build Command:** `pip install -r backend/requirements.txt`
   - **Start Command:** `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
   - **Plan:** Free

5. **Environment Variables:**
   - `BOT_TOKEN` — токен
   - `BOT_USERNAME` — имя бота без @ (для реферальных ссылок)
   - `OWNER_TELEGRAM_ID` — твой ID
   - `WEBAPP_URL` — URL фронта (GitHub Pages)
   - `ADMIN_URL` — `https://твой-сервис.onrender.com/admin`
   - `JWT_SECRET` — случайная строка
   - `DATABASE_URL` — `sqlite:///./phone_game.db`
   - `PYTHON_VERSION` — `3.11.0`

6. **Create Web Service**

### 3. GitHub Pages для фронта
1. **Settings** → **Pages**
2. Source: `Deploy from a branch`
3. Branch: `main`, папка: `/docs`
4. Сохрани — получишь URL `https://твой-ник.github.io/phone-game/`

Перед публикацией укажи точный HTTPS-адрес своего Render Web Service в
`docs/config.js`. Адрес должен открывать `/health` и возвращать
`{"ok":true}`. После изменений в `docs` обнови страницу Mini App.

### 4. Настрой бота
- В [@BotFather](https://t.me/BotFather): `/mybots` → бот → **Bot Settings** → **Menu Button**
- URL = адрес фронта с GitHub Pages

## API

### Игровые
- `POST /api/auth` — вход через Telegram
- `GET /api/me` — данные игрока
- `GET /api/status` — статус техперерыва
- `POST /api/promo/activate` — активация промокода

### Админские (Bearer-токен)
- `POST /admin/api/login` — вход
- `GET /admin/api/users` — игроки
- `POST /admin/api/users/{id}/balance` — баланс
- `POST /admin/api/users/{id}/ban` — бан
- `GET/POST/DELETE /admin/api/admins` — админы
- `GET/POST/DELETE /admin/api/promos` — промокоды
- `GET/POST /admin/api/settings` — настройки
- `POST /admin/api/maintenance` — техперерыв
- `GET /admin/api/stats` — статистика

## Безопасность

- ⚠️ Пароль `owner123` **смени сразу** после первого входа
- `JWT_SECRET` в Render генерируется автоматически
- CORS в `main.py` сейчас `*` — сузь до своего домена после деплоя
- `BOT_TOKEN` никогда не коммить в Git (он в `.gitignore`)

## Следующие итерации

- [ ] Перенести игровую логику на сервер (крутки, продажи, инвентарь)
- [ ] Переписать фронт под API
- [ ] Anti-fraud (rate limit)
- [ ] Логи круток в админке
- [ ] Платежи через Telegram Stars
