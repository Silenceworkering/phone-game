from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Telegram
    BOT_TOKEN: str = ""
    OWNER_TELEGRAM_ID: int = 0
    WEBAPP_URL: str = "https://example.github.io/phone-game/"

    # Безопасность
    JWT_SECRET: str = "change-me-to-random-string"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_HOURS: int = 24

    # База
    DATABASE_URL: str = "sqlite:///./phone_game.db"

    # Общие
    BASE_URL: str = "http://localhost:8000"
    ADMIN_URL: str = "http://localhost:8000/admin"

    # Игровое
    START_BALANCE: int = 10000

    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
