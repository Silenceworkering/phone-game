import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .database import init_db, SessionLocal
from .models import Admin
from .auth import hash_password
from .game_routes import router as game_router
from .admin_routes import router as admin_router


# ============ LIFESPAN ============
@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    print("✅ БД инициализирована")

    db = SessionLocal()
    try:
        owner_login = "owner"
        owner = db.query(Admin).filter(Admin.login == owner_login).first()
        if not owner:
            owner = Admin(
                login=owner_login,
                password_hash=hash_password("owner123"),
                role="owner",
            )
            db.add(owner)
            db.commit()
            print(f"👑 Создан владелец: {owner_login} / owner123")
    finally:
        db.close()

    bot_task = None
    if settings.BOT_TOKEN:
        from .bot import run_bot
        bot_task = asyncio.create_task(run_bot())
        print("🤖 Запуск бота...")

    yield

    if bot_task:
        bot_task.cancel()
        try:
            await bot_task
        except asyncio.CancelledError:
            pass


app = FastAPI(title="Phone Numbers API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(game_router)
app.include_router(admin_router)


# ============ ROOT (GET + HEAD для UptimeRobot) ============
@app.get("/")
@app.head("/")
def root():
    return {"status": "ok", "service": "Phone Numbers API"}


# ============ HEALTH (GET + HEAD) ============
@app.get("/health")
@app.head("/health")
def health():
    return {"ok": True}


# ============ ADMIN UI ============
ADMIN_DIR = Path(__file__).resolve().parent.parent / "admin"

@app.get("/admin", response_class=HTMLResponse)
def admin_page():
    index = ADMIN_DIR / "index.html"
    if index.exists():
        return FileResponse(index)
    return HTMLResponse("<h1>Админка не найдена</h1>")

if ADMIN_DIR.exists():
    app.mount("/admin/static", StaticFiles(directory=str(ADMIN_DIR)), name="admin-static")
