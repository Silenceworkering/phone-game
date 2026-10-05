from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    BOT_TOKEN: str = ""
    OWNER_TELEGRAM_ID: int = 0
    WEBAPP_URL: str = "https://example.github.io/phone-game/"

    JWT_SECRET: str = "change-me-to-random-string"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_HOURS: int = 24

    DATABASE_URL: str = "sqlite:///./phone_game.db"

    BASE_URL: str = "http://localhost:8000"
    ADMIN_URL: str = "http://localhost:8000/admin"

    START_BALANCE: int = 15000

    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
