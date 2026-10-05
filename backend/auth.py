import hashlib
import hmac
import json
import time
from datetime import datetime, timedelta
from typing import Optional
from urllib.parse import parse_qsl

import bcrypt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from sqlalchemy.orm import Session

from .config import settings
from .database import get_db
from .models import Admin, User

bearer_scheme = HTTPBearer(auto_error=False)


# ============ ПАРОЛИ ============
def hash_password(password: str) -> str:
    # bcrypt ограничен 72 байтами
    pwd_bytes = password.encode("utf-8")[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        pwd_bytes = plain.encode("utf-8")[:72]
        return bcrypt.checkpw(pwd_bytes, hashed.encode("utf-8"))
    except Exception:
        return False


# ============ JWT ============
def create_token(payload: dict) -> str:
    data = payload.copy()
    data["exp"] = datetime.utcnow() + timedelta(hours=settings.JWT_EXPIRE_HOURS)
    return jwt.encode(data, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


# ============ TELEGRAM INIT DATA (своя валидация) ============
def verify_telegram_init_data(init_data: str) -> Optional[dict]:
    """
    Проверка подписи Telegram initData.
    Документация: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
    """
    try:
        # 1. Парсим query-string в список пар
        pairs = parse_qsl(init_data, keep_blank_values=True)
        data = dict(pairs)

        # 2. Достаём hash и удаляем его из данных
        received_hash = data.pop("hash", None)
        if not received_hash:
            return None

        # 3. Сортируем по ключу и собираем data_check_string
        data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(data.items()))

        # 4. Секретный ключ = HMAC-SHA256(bot_token, "WebAppData")
        secret_key = hmac.new(
            b"WebAppData",
            settings.BOT_TOKEN.encode(),
            hashlib.sha256,
        ).digest()

        # 5. Проверяем подпись
        calc_hash = hmac.new(
            secret_key,
            data_check_string.encode(),
            hashlib.sha256,
        ).hexdigest()

        if calc_hash != received_hash:
            print("⚠️ initData hash mismatch")
            return None

        # 6. Проверяем свежесть (не старше 24ч)
        auth_date = int(data.get("auth_date", "0"))
        if auth_date and time.time() - auth_date > 86400:
            print("⚠️ initData expired")
            return None

        # 7. Извлекаем user
        user_json = data.get("user")
        if not user_json:
            return None

        user = json.loads(user_json)
        return {
            "id": user.get("id"),
            "first_name": user.get("first_name", "") or "",
            "last_name": user.get("last_name", "") or "",
            "username": user.get("username", "") or "",
            "photo_url": user.get("photo_url", "") or "",
        }
    except Exception as e:
        print("initData error:", e)
        return None


def get_or_create_user(db: Session, tg_data: dict) -> User:
    user = db.query(User).filter(User.telegram_id == tg_data["id"]).first()
    is_owner = tg_data["id"] == settings.OWNER_TELEGRAM_ID

    if not user:
        user = User(
            telegram_id=tg_data["id"],
            first_name=tg_data.get("first_name", ""),
            last_name=tg_data.get("last_name", ""),
            username=tg_data.get("username", ""),
            photo_url=tg_data.get("photo_url", ""),
            balance=settings.START_BALANCE,
            is_owner=is_owner,
            is_admin=is_owner,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        user.first_name = tg_data.get("first_name", user.first_name)
        user.last_name = tg_data.get("last_name", user.last_name)
        user.username = tg_data.get("username", user.username)
        user.photo_url = tg_data.get("photo_url", user.photo_url)
        user.last_seen = datetime.utcnow()
        if is_owner and not user.is_owner:
            user.is_owner = True
            user.is_admin = True
        db.commit()

    return user


# ============ DEPENDENCIES ============
def get_current_admin(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> Admin:
    if not credentials:
        raise HTTPException(status_code=401, detail="Missing token")

    payload = decode_token(credentials.credentials)
    if payload.get("type") != "admin":
        raise HTTPException(status_code=403, detail="Not an admin token")

    admin = db.query(Admin).filter(Admin.id == payload.get("admin_id")).first()
    if not admin or not admin.is_active:
        raise HTTPException(status_code=403, detail="Admin not found or inactive")

    return admin


def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> Optional[User]:
    if not credentials:
        return None
    try:
        payload = decode_token(credentials.credentials)
        if payload.get("type") != "user":
            return None
        return db.query(User).filter(User.telegram_id == payload.get("tg_id")).first()
    except Exception:
        return None
