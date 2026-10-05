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
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🎰 Открыть игру", web_app=WebAppInfo(url=settings.WEBAPP_URL))]
    ])
    await message.answer(
        "Привет! 🎰\n\nЭто игра «Номера» — крути рулетку, собирай коллекцию редких номеров со всего мира.\n\nНажми кнопку ниже, чтобы начать 👇",
        reply_markup=kb,
    )


@dp.message(Command("help"))
async def cmd_help(message: Message):
    await message.answer(
        "🎰 <b>Номера</b>\n\n"
        "• /start — начать игру\n"
        "• /help — помощь\n\n"
        "Для админов:\n"
        "• /admin — ссылка на панель\n"
        "• /pause — включить техперерыв\n"
        "• /resume — выключить техперерыв",
        parse_mode="HTML",
    )


def is_owner(telegram_id: int) -> bool:
    return telegram_id == settings.OWNER_TELEGRAM_ID


@dp.message(Command("admin"))
async def cmd_admin(message: Message):
    if not is_owner(message.from_user.id):
        await message.answer("⛔ Команда только для владельца")
        return
    await message.answer(
        f"🔧 <b>Панель управления</b>\n\n{settings.ADMIN_URL}",
        parse_mode="HTML",
    )


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


async def run_bot():
    if not bot:
        print("⚠️ BOT_TOKEN не задан — бот не запущен")
        return
    print("🤖 Бот запущен")
    await dp.start_polling(bot)
