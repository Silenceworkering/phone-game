from fastapi import APIRouter, Depends, HTTPException, Body
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime
from typing import Optional, List
import asyncio

from .auth import (
    hash_password,
    verify_password,
    create_token,
    get_current_admin,
)
from .database import get_db, get_setting, set_setting
from .models import User, Admin, Promocode, SpinLog, PromoUse
from .config import settings

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/api/login")
def admin_login(payload: dict, db: Session = Depends(get_db)):
    login = (payload.get("login") or "").strip()
    password = payload.get("password") or ""

    admin = db.query(Admin).filter(Admin.login == login).first()
    if not admin or not admin.is_active:
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")

    if not verify_password(password, admin.password_hash):
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")

    token = create_token({"type": "admin", "admin_id": admin.id, "role": admin.role})
    return {
        "token": token,
        "admin": {"login": admin.login, "role": admin.role},
    }


@router.get("/api/me")
def admin_me(admin: Admin = Depends(get_current_admin)):
    return {"login": admin.login, "role": admin.role}


@router.get("/api/users")
def list_users(
    q: str = "",
    limit: int = 100,
    offset: int = 0,
    admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    query = db.query(User)
    if q:
        like = f"%{q}%"
        query = query.filter(
            (User.username.ilike(like))
            | (User.first_name.ilike(like))
            | (User.last_name.ilike(like))
        )
    total = query.count()
    users = query.order_by(User.created_at.desc()).offset(offset).limit(limit).all()

    return {
        "total": total,
        "users": [
            {
                "id": u.id,
                "telegram_id": u.telegram_id,
                "first_name": u.first_name,
                "last_name": u.last_name,
                "username": u.username,
                "balance": u.balance,
                "spins_total": u.spins_total,
                "is_banned": u.is_banned,
                "is_admin": u.is_admin,
                "is_owner": u.is_owner,
                "created_at": u.created_at.isoformat() if u.created_at else None,
                "last_seen": u.last_seen.isoformat() if u.last_seen else None,
            }
            for u in users
        ],
    }


@router.post("/api/users/{user_id}/balance")
def set_balance(
    user_id: int,
    payload: dict = Body(...),
    admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    amount = payload.get("amount")
    if amount is None:
        raise HTTPException(status_code=400, detail="amount required")

    user.balance = int(amount)
    db.commit()
    return {"success": True, "balance": user.balance}


@router.post("/api/users/{user_id}/ban")
def ban_user(
    user_id: int,
    payload: dict = Body(...),
    admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    user.is_banned = bool(payload.get("banned", True))
    db.commit()
    return {"success": True, "is_banned": user.is_banned}


@router.get("/api/admins")
def list_admins(admin: Admin = Depends(get_current_admin), db: Session = Depends(get_db)):
    admins = db.query(Admin).order_by(Admin.created_at.desc()).all()
    return [
        {
            "id": a.id,
            "login": a.login,
            "role": a.role,
            "is_active": a.is_active,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in admins
    ]


@router.post("/api/admins")
def create_admin(
    payload: dict = Body(...),
    admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    if admin.role != "owner":
        raise HTTPException(status_code=403, detail="Только владелец может создавать админов")

    login = (payload.get("login") or "").strip()
    password = payload.get("password") or ""
    role = payload.get("role", "moderator")

    if not login or not password:
        raise HTTPException(status_code=400, detail="Логин и пароль обязательны")

    if db.query(Admin).filter(Admin.login == login).first():
        raise HTTPException(status_code=400, detail="Логин занят")

    new_admin = Admin(
        login=login,
        password_hash=hash_password(password),
        role=role,
    )
    db.add(new_admin)
    db.commit()
    return {"success": True, "id": new_admin.id}


@router.delete("/api/admins/{admin_id}")
def delete_admin(
    admin_id: int,
    admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    if admin.role != "owner":
        raise HTTPException(status_code=403, detail="Только владелец")

    a = db.query(Admin).filter(Admin.id == admin_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Не найден")

    db.delete(a)
    db.commit()
    return {"success": True}


@router.get("/api/promos")
def list_promos(admin: Admin = Depends(get_current_admin), db: Session = Depends(get_db)):
    promos = db.query(Promocode).order_by(Promocode.created_at.desc()).all()
    return [
        {
            "id": p.id,
            "code": p.code,
            "amount": p.amount,
            "reusable": p.reusable,
            "max_uses": p.max_uses,
            "uses": p.uses,
            "is_active": p.is_active,
            "expires_at": p.expires_at.isoformat() if p.expires_at else None,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        }
        for p in promos
    ]


@router.post("/api/promos")
def create_promo(
    payload: dict = Body(...),
    admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    code = (payload.get("code") or "").strip().upper()
    amount = int(payload.get("amount", 0))
    reusable = bool(payload.get("reusable", False))
    max_uses = int(payload.get("max_uses", 0))
    expires_at_str = payload.get("expires_at")

    if not code:
        raise HTTPException(status_code=400, detail="Код обязателен")

    if db.query(Promocode).filter(Promocode.code == code).first():
        raise HTTPException(status_code=400, detail="Такой код уже есть")

    expires_at = None
    if expires_at_str:
        try:
            expires_at = datetime.fromisoformat(expires_at_str)
        except Exception:
            pass

    promo = Promocode(
        code=code,
        amount=amount,
        reusable=reusable,
        max_uses=max_uses,
        expires_at=expires_at,
    )
    db.add(promo)
    db.commit()
    return {"success": True, "id": promo.id}


@router.delete("/api/promos/{promo_id}")
def delete_promo(
    promo_id: int,
    admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    p = db.query(Promocode).filter(Promocode.id == promo_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Не найден")
    db.delete(p)
    db.commit()
    return {"success": True}


@router.post("/api/promos/{promo_id}/toggle")
def toggle_promo(
    promo_id: int,
    admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    p = db.query(Promocode).filter(Promocode.id == promo_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Не найден")
    p.is_active = not p.is_active
    db.commit()
    return {"success": True, "is_active": p.is_active}


@router.get("/api/settings")
def get_all_settings(admin: Admin = Depends(get_current_admin), db: Session = Depends(get_db)):
    from .models import Setting
    rows = db.query(Setting).all()
    return {r.key: r.value for r in rows}


@router.post("/api/settings")
def update_settings(
    payload: dict = Body(...),
    admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    for k, v in payload.items():
        set_setting(db, str(k), str(v))
    return {"success": True}


@router.post("/api/maintenance")
def set_maintenance(
    payload: dict = Body(...),
    admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    enabled = bool(payload.get("enabled", False))
    text = payload.get("text", "Технические работы")
    set_setting(db, "maintenance", "1" if enabled else "0")
    set_setting(db, "maintenance_text", text)
    return {"success": True, "maintenance": enabled}


@router.get("/api/stats")
def stats(admin: Admin = Depends(get_current_admin), db: Session = Depends(get_db)):
    users_count = db.query(func.count(User.id)).scalar() or 0
    spins_count = db.query(func.count(SpinLog.id)).scalar() or 0
    total_balance = db.query(func.sum(User.balance)).scalar() or 0
    return {
        "users_count": users_count,
        "spins_count": spins_count,
        "total_balance": total_balance,
        "maintenance": get_setting(db, "maintenance", "0") == "1",
    }


# ============================================================
# ЛОГИ КРУТОК
# ============================================================
@router.get("/api/spins")
def list_spins(
    q: str = "",
    rarity: str = "",
    limit: int = 100,
    offset: int = 0,
    admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Список круток с фильтрами."""
    query = db.query(SpinLog, User).outerjoin(
        User, User.telegram_id == SpinLog.telegram_id
    )

    if rarity:
        query = query.filter(SpinLog.rarity == rarity)

    if q:
        like = f"%{q}%"
        query = query.filter(
            (SpinLog.number.ilike(like))
            | (User.first_name.ilike(like))
            | (User.username.ilike(like))
        )

    total = query.count()
    rows = query.order_by(SpinLog.created_at.desc()).offset(offset).limit(limit).all()

    return {
        "total": total,
        "spins": [
            {
                "id": s.id,
                "telegram_id": s.telegram_id,
                "first_name": u.first_name if u else "",
                "username": u.username if u else "",
                "rarity": s.rarity,
                "number": s.number,
                "price": s.price,
                "cost": s.cost,
                "country_code": s.country_code,
                "operator_code": s.operator_code,
                "is_multi": s.is_multi,
                "created_at": s.created_at.isoformat() if s.created_at else None,
            }
            for s, u in rows
        ],
    }


# ============================================================
# РАССЫЛКА
# ============================================================
@router.get("/api/broadcast/info")
def broadcast_info(
    admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    count = db.query(func.count(User.id)).filter(User.is_banned == False).scalar() or 0
    return {"users_count": count}


@router.post("/api/broadcast")
async def broadcast(
    payload: dict = Body(...),
    admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Отправка сообщения всем незабаненным игрокам через бота."""
    text = (payload.get("text") or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Текст пустой")
    if len(text) > 4000:
        raise HTTPException(status_code=400, detail="Слишком длинное сообщение")

    from .bot import bot
    if not bot:
        raise HTTPException(status_code=500, detail="BOT_TOKEN не задан")

    users = db.query(User).filter(User.is_banned == False).all()

    sent = 0
    failed = 0
    for u in users:
        try:
            await bot.send_message(u.telegram_id, text, parse_mode="HTML")
            sent += 1
        except Exception as e:
            failed += 1
            # Если юзер заблокировал бота — не падаем
        # Небольшая задержка чтобы не превысить лимиты Telegram
        await asyncio.sleep(0.05)

    return {"success": True, "sent": sent, "failed": failed}
