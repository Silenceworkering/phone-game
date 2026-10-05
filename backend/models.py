from sqlalchemy import Column, Integer, String, BigInteger, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.orm import declarative_base
from datetime import datetime

Base = declarative_base()


class User(Base):
    """Игрок."""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    telegram_id = Column(BigInteger, unique=True, nullable=False, index=True)
    username = Column(String(64), default="")
    first_name = Column(String(128), default="")
    last_name = Column(String(128), default="")
    photo_url = Column(String(512), default="")

    balance = Column(Integer, default=10000)
    spins_total = Column(Integer, default=0)
    is_banned = Column(Boolean, default=False)

    is_admin = Column(Boolean, default=False)
    is_owner = Column(Boolean, default=False)

    created_at = Column(DateTime, default=datetime.utcnow)
    last_seen = Column(DateTime, default=datetime.utcnow)


class Admin(Base):
    """Логины/пароли для админки."""
    __tablename__ = "admins"

    id = Column(Integer, primary_key=True)
    login = Column(String(64), unique=True, nullable=False, index=True)
    password_hash = Column(String(256), nullable=False)
    role = Column(String(32), default="moderator")
    created_by = Column(BigInteger, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    is_active = Column(Boolean, default=True)


class Promocode(Base):
    """Промокоды."""
    __tablename__ = "promocodes"

    id = Column(Integer, primary_key=True)
    code = Column(String(32), unique=True, nullable=False, index=True)
    amount = Column(Integer, default=0)
    reusable = Column(Boolean, default=False)
    max_uses = Column(Integer, default=0)
    uses = Column(Integer, default=0)
    expires_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class PromoUse(Base):
    """Кто и когда использовал промокод."""
    __tablename__ = "promo_uses"

    id = Column(Integer, primary_key=True)
    promocode_id = Column(Integer, ForeignKey("promocodes.id"))
    telegram_id = Column(BigInteger, nullable=False)
    used_at = Column(DateTime, default=datetime.utcnow)


class Setting(Base):
    """Настройки игры."""
    __tablename__ = "settings"

    key = Column(String(64), primary_key=True)
    value = Column(Text, default="")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class SpinLog(Base):
    """Лог круток."""
    __tablename__ = "spin_log"

    id = Column(Integer, primary_key=True)
    telegram_id = Column(BigInteger, nullable=False, index=True)
    rarity = Column(String(32))
    number = Column(String(64))
    price = Column(Integer, default=0)
    cost = Column(Integer, default=0)
    country_code = Column(String(8))
    operator_code = Column(String(16))
    created_at = Column(DateTime, default=datetime.utcnow)
