import asyncio
from aiogram import Bot, Dispatcher, F
from aiogram.filters import Command, CommandObject
from aiogram.types import (
    Message,
    WebAppInfo,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
)

from .config import settings
from .database import SessionLocal, init_db, set_setting, get_setting
from .models import User

bot = Bot(token=settings.BOT_TOKEN) if settings.BOT_TOKEN else None
dp = Dispatcher()


@dp.message(Command("start"))
async def cmd_start(message: Message, command: CommandObject = None):
    # Разбор реферального кода
    ref_code = None
    if command and command.args:
        args = command.args.strip()
        if args.startswith("ref_"):
            ref_code = args

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.telegram_id == message.from_user.id).first()
        if user:
            # Обновляем данные
            user.username = message.from_user.username or user.username
            user.first_name = message.from_user.first_name or user.first_name
            user.last_name = message.from_user.last_name or user.last_name
            db.commit()
    finally:
        db.close()

    # Формируем URL Mini App
    webapp_url = settings.WEBAPP_URL
    if ref_code:
        sep = "&" if "?" in webapp_url else "?"
        webapp_url = f"{webapp_url}{sep}start={ref_code}"

    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🎰 Открыть игру", web_app=WebAppInfo(url=webapp_url))]
    ])

    text = "Привет! 🎰\n\n"
    if ref_code:
        text += "🎁 <b>Ты пришёл по приглашению друга!</b>\n"
        text += "Тебе начислено <b>30 000 ₽</b> на старт.\n\n"
    text += (
        "Это игра «Номера» — крути рулетку, собирай красивые номера со всего мира, "
        "обменивайся с друзьями и сколачивай состояние.\n\n"
        "🍀 Каждая 100-я крутка — удача ×5\n"
        "💎 Каждая 1000-я — супер-удача ×25\n\n"
        "Нажми кнопку ниже 👇"
    )

    await message.answer(text, reply_markup=kb, parse_mode="HTML")


@dp.message(Command("help"))
async def cmd_help(message: Message):
    await message.answer(
        "🎰 <b>Номера</b>\n\n"
        "• /start — начать игру\n"
        "• /help — помощь\n"
        "• /invite — ссылка для друзей\n"
        "• /top — топ игроков\n\n"
        "<b>Для админов:</b>\n"
        "• /admin — ссылка на панель\n"
        "• /pause — включить техперерыв\n"
        "• /resume — выключить техперерыв\n"
        "• /golden — Золотая лихорадка (15 мин)\n"
        "• /double — Двойной шанс (30 мин)\n"
        "• /discount — Скидка 50% (30 мин)",
        parse_mode="HTML",
    )


def is_owner(telegram_id: int) -> bool:
    return telegram_id == settings.OWNER_TELEGRAM_ID


@dp.message(Command("invite"))
async def cmd_invite(message: Message):
    """Личная реферальная ссылка."""
    # Получаем username бота
    if bot:
        try:
            me = await bot.get_me()
            bot_username = me.username
        except Exception:
            bot_username = "your_bot"
    else:
        bot_username = "your_bot"

    ref_link = f"https://t.me/{bot_username}?start=ref_{message.from_user.id}"

    await message.answer(
        f"🎁 <b>Приглашай друзей и получай бонусы!</b>\n\n"
        f"За каждого друга, который зайдёт по твоей ссылке:\n"
        f"👤 Ты получаешь: <b>+50 000 ₽</b>\n"
        f"🎁 Друг получает: <b>+30 000 ₽</b>\n\n"
        f"Твоя ссылка:\n"
        f"<code>{ref_link}</code>\n\n"
        f"Скопируй и отправь другу 👆",
        parse_mode="HTML",
    )


@dp.message(Command("top"))
async def cmd_top(message: Message):
    """Топ-10 игроков."""
    db = SessionLocal()
    try:
        users = db.query(User).filter(User.is_banned == False).order_by(User.balance.desc()).limit(10).all()
    finally:
        db.close()

    if not users:
        await message.answer("Пока никого нет в топе.")
        return

    lines = ["🏆 <b>Топ игроков по балансу:</b>\n"]
    for i, u in enumerate(users, 1):
        medal = "🥇" if i == 1 else "🥈" if i == 2 else "🥉" if i == 3 else f"{i}."
        name = u.first_name or u.username or "Игрок"
        owner = " 👑" if u.is_owner else ""
        lines.append(f"{medal} {name}{owner} — {u.balance:,} ₽".replace(",", " "))

    lines.append("\nОткрой игру, чтобы увидеть полный топ 👇")

    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🎰 Открыть игру", web_app=WebAppInfo(url=settings.WEBAPP_URL))]
    ])

    await message.answer("\n".join(lines), reply_markup=kb, parse_mode="HTML")


# ============================================================
# АДМИНСКИЕ КОМАНДЫ
# ============================================================
@dp.message(Command("admin"))
async def cmd_admin(message: Message):
    if not is_owner(message.from_user.id):
        await message.answer("⛔ Только для владельца")
        return
    await message.answer(f"🔧 <b>Панель управления</b>\n\n{settings.ADMIN_URL}", parse_mode="HTML")


@dp.message(Command("pause"))
async def cmd_pause(message: Message):
    if not is_owner(message.from_user.id):
        await message.answer("⛔ Только для владельца")
        return
    db = SessionLocal()
    try:
        set_setting(db, "maintenance", "1")
        set_setting(db, "maintenance_text", "Технические работы")
    finally:
        db.close()
    await message.answer("🛑 Техперерыв включён")


@dp.message(Command("resume"))
async def cmd_resume(message: Message):
    if not is_owner(message.from_user.id):
        await message.answer("⛔ Только для владельца")
        return
    db = SessionLocal()
    try:
        set_setting(db, "maintenance", "0")
    finally:
        db.close()
    await message.answer("✅ Техперерыв выключен")


@dp.message(Command("golden"))
async def cmd_golden(message: Message):
    if not is_owner(message.from_user.id): return
    from datetime import datetime
    db = SessionLocal()
    try:
        end_ts = int(datetime.utcnow().timestamp()) + 15 * 60
        set_setting(db, "boost_golden", str(end_ts))
    finally:
        db.close()
    await message.answer("🎰 Золотая лихорадка включена на 15 минут!")


@dp.message(Command("double"))
async def cmd_double(message: Message):
    if not is_owner(message.from_user.id): return
    from datetime import datetime
    db = SessionLocal()
    try:
        end_ts = int(datetime.utcnow().timestamp()) + 30 * 60
        set_setting(db, "boost_double", str(end_ts))
    finally:
        db.close()
    await message.answer("💎 Двойной шанс включён на 30 минут!")


@dp.message(Command("discount"))
async def cmd_discount(message: Message):
    if not is_owner(message.from_user.id): return
    from datetime import datetime
    db = SessionLocal()
    try:
        end_ts = int(datetime.utcnow().timestamp()) + 30 * 60
        set_setting(db, "boost_discount", str(end_ts))
    finally:
        db.close()
    await message.answer("💰 Скидка 50% включена на 30 минут!")


# ============================================================
# ФОНОВЫЕ УВЕДОМЛЕНИЯ
# ============================================================
async def notify_user(telegram_id: int, text: str):
    """Отправить сообщение игроку (если бот доступен)."""
    if not bot: return
    try:
        await bot.send_message(telegram_id, text, parse_mode="HTML")
    except Exception as e:
        print(f"Notify error to {telegram_id}: {e}")


async def notify_referral(referrer_tg: int, referred_name: str, amount: int):
    """Уведомить пригласившего о новом реферале."""
    await notify_user(
        referrer_tg,
        f"🎉 <b>Новый реферал!</b>\n\n"
        f"👤 <b>{referred_name}</b> зашёл по твоей ссылке.\n"
        f"💰 Тебе начислено: <b>+{amount:,} ₽</b>".replace(",", " ")
    )


async def notify_trade(to_tg_id: int, from_name: str):
    """Уведомить о новом обмене."""
    await notify_user(
        to_tg_id,
        f"🔄 <b>Новое предложение обмена!</b>\n\n"
        f"👤 От: <b>{from_name}</b>\n\n"
        f"Открой игру, чтобы посмотреть предложение 🎰"
    )


async def notify_quest_done(telegram_id: int, quest_name: str, reward: int):
    """Уведомить о выполненном квесте."""
    await notify_user(
        telegram_id,
        f"✅ <b>Квест выполнен!</b>\n\n"
        f"{quest_name}\n"
        f"💰 Награда: <b>+{reward:,} ₽</b>\n\n"
        f"Забери в игре 👇".replace(",", " ")
    )


async def notify_leaderboard_win(telegram_id: int, place: int, reward: int):
    """Уведомить о победе в лидерборде."""
    medal = "🥇" if place == 1 else "🥈" if place == 2 else "🥉"
    await notify_user(
        telegram_id,
        f"{medal} <b>Ты в топ-{place}!</b>\n\n"
        f"💰 Награда: <b>+{reward:,} ₽</b>".replace(",", " ")
    )


async def broadcast_to_all(text: str) -> tuple:
    """Рассылка всем незабаненным игрокам. Возвращает (sent, failed)."""
    if not bot: return (0, 0)
    db = SessionLocal()
    try:
        users = db.query(User).filter(User.is_banned == False).all()
    finally:
        db.close()

    sent = 0
    failed = 0
    for u in users:
        try:
            await bot.send_message(u.telegram_id, text, parse_mode="HTML")
            sent += 1
        except Exception:
            failed += 1
        await asyncio.sleep(0.05)
    return (sent, failed)


async def run_bot():
    if not bot:
        print("⚠️ BOT_TOKEN не задан — бот не запущен")
        return
    print("🤖 Бот запущен")
    await dp.start_polling(bot)
