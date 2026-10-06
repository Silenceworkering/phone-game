import asyncio
from aiogram import Bot, Dispatcher, F
from aiogram.filters import Command
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
async def cmd_start(message: Message):
    # Регистрируем/обновляем игрока
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.telegram_id == message.from_user.id).first()
        if user:
            user.username = message.from_user.username or user.username
            user.first_name = message.from_user.first_name or user.first_name
            user.last_name = message.from_user.last_name or user.last_name
            db.commit()
    finally:
        db.close()

    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🎰 Открыть игру", web_app=WebAppInfo(url=settings.WEBAPP_URL))]
    ])
    await message.answer(
        "Привет! 🎰\n\n"
        "Это игра «Номера» — крути рулетку, собирай красивые номера со всего мира, "
        "обменивайся с друзьями и сколачивай состояние.\n\n"
        "🎁 Каждую 100-ю крутку — удача ×5\n"
        "💎 Каждую 1000-ю — супер-удача ×25\n\n"
        "Нажми кнопку ниже 👇",
        reply_markup=kb,
    )


@dp.message(Command("help"))
async def cmd_help(message: Message):
    await message.answer(
        "🎰 <b>Номера</b>\n\n"
        "• /start — начать игру\n"
        "• /help — помощь\n\n"
        "<b>Для админов:</b>\n"
        "• /admin — ссылка на панель\n"
        "• /pause — включить техперерыв\n"
        "• /resume — выключить техперерыв\n"
        "• /golden — включить Золотую лихорадку (15 мин)\n"
        "• /double — Двойной шанс (30 мин)\n"
        "• /discount — Скидка 50% (30 мин)",
        parse_mode="HTML",
    )


def is_owner(telegram_id: int) -> bool:
    return telegram_id == settings.OWNER_TELEGRAM_ID


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
    if not is_owner(message.from_user.id):
        return
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
    if not is_owner(message.from_user.id):
        return
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
    if not is_owner(message.from_user.id):
        return
    from datetime import datetime
    db = SessionLocal()
    try:
        end_ts = int(datetime.utcnow().timestamp()) + 30 * 60
        set_setting(db, "boost_discount", str(end_ts))
    finally:
        db.close()
    await message.answer("💰 Скидка 50% включена на 30 минут!")


async def run_bot():
    if not bot:
        print("⚠️ BOT_TOKEN не задан — бот не запущен")
        return
    print("🤖 Бот запущен")
    await dp.start_polling(bot)
