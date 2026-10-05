from datetime import datetime, timedelta
from typing import Optional

from fastapi import Depends, HTTPException, Header, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from passlib.context import CryptContext
from sqlalchemy.orm import Session
from telegram_init_data import parse_init_data

from .config import settings
from .database import get_db
from .models import Admin, User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return pwd_context.verify(plain, hashed)
    except Exception:
        return False


def create_token(payload: dict) -> str:
    data = payload.copy()
    data["exp"] = datetime.utcnow() + timedelta(hours=settings.JWT_EXPIRE_HOURS)
    return jwt.encode(data, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


def verify_telegram_init_data(init_data: str) -> Optional[dict]:
    try:
        parsed = parse_init_data(token=settings.BOT_TOKEN, init_data=init_data)
        if hasattr(parsed, "user") and parsed.user:
            return {
                "id": parsed.user.id,
                "first_name": getattr(parsed.user, "first_name", "") or "",
                "last_name": getattr(parsed.user, "last_name", "") or "",
                "username": getattr(parsed.user, "username", "") or "",
                "photo_url": getattr(parsed.user, "photo_url", "") or "",
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
