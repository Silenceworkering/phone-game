from sqlalchemy import Column, Integer, String, BigInteger, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.orm import declarative_base
from datetime import datetime

Base = declarative_base()


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    telegram_id = Column(BigInteger, unique=True, nullable=False, index=True)
    username = Column(String(64), default="")
    first_name = Column(String(128), default="")
    last_name = Column(String(128), default="")
    photo_url = Column(String(512), default="")
    balance = Column(Integer, default=15000)
    spins_total = Column(Integer, default=0)
    is_banned = Column(Boolean, default=False)
    is_admin = Column(Boolean, default=False)
    is_owner = Column(Boolean, default=False)
    last_bonus_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_seen = Column(DateTime, default=datetime.utcnow)


class Admin(Base):
    __tablename__ = "admins"
    id = Column(Integer, primary_key=True)
    login = Column(String(64), unique=True, nullable=False, index=True)
    password_hash = Column(String(256), nullable=False)
    role = Column(String(32), default="moderator")
    created_by = Column(BigInteger, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    is_active = Column(Boolean, default=True)


class Promocode(Base):
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
    __tablename__ = "promo_uses"
    id = Column(Integer, primary_key=True)
    promocode_id = Column(Integer, ForeignKey("promocodes.id"))
    telegram_id = Column(BigInteger, nullable=False)
    used_at = Column(DateTime, default=datetime.utcnow)


class Setting(Base):
    __tablename__ = "settings"
    key = Column(String(64), primary_key=True)
    value = Column(Text, default="")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class SpinLog(Base):
    __tablename__ = "spin_log"
    id = Column(Integer, primary_key=True)
    telegram_id = Column(BigInteger, nullable=False, index=True)
    rarity = Column(String(32))
    number = Column(String(64))
    price = Column(Integer, default=0)
    cost = Column(Integer, default=0)
    country_code = Column(String(8))
    operator_code = Column(String(16))
    is_multi = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class Inventory(Base):
    __tablename__ = "inventory"
    id = Column(Integer, primary_key=True)
    telegram_id = Column(BigInteger, nullable=False, index=True)
    number = Column(String(64), nullable=False)
    rarity = Column(String(32), nullable=False, index=True)
    price = Column(Integer, default=0)
    country_code = Column(String(8))
    country_flag = Column(String(16))
    country_name = Column(String(64))
    operator_code = Column(String(16))
    operator_name = Column(String(64))
    created_at = Column(DateTime, default=datetime.utcnow)


class Achievement(Base):
    __tablename__ = "achievements"
    id = Column(Integer, primary_key=True)
    telegram_id = Column(BigInteger, nullable=False, index=True)
    code = Column(String(64), nullable=False, index=True)
    got_at = Column(DateTime, default=datetime.utcnow)


class Trade(Base):
    __tablename__ = "trades"
    id = Column(Integer, primary_key=True)
    from_tg_id = Column(BigInteger, nullable=False, index=True)
    to_tg_id = Column(BigInteger, nullable=False, index=True)
    from_inv_id = Column(Integer, nullable=False)
    to_inv_id = Column(Integer, nullable=False)
    status = Column(String(16), default="pending")
    created_at = Column(DateTime, default=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)
