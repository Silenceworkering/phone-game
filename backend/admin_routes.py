from fastapi import APIRouter, Depends, HTTPException, Body
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta
from typing import Optional, List
import json
import asyncio

from .auth import (
    hash_password,
    verify_password,
    create_token,
    get_current_admin,
)
from .database import get_db, get_setting, set_setting
from .models import User, Admin, Promocode, SpinLog, PromoUse, Inventory
from .config import settings

router = APIRouter(prefix="/admin", tags=["admin"])


# ============================================================
# АВТОРИЗАЦИЯ
# ============================================================
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
    return {"token": token, "admin": {"login": admin.login, "role": admin.role}}


@router.get("/api/me")
def admin_me(admin: Admin = Depends(get_current_admin)):
    return {"login": admin.login, "role": admin.role}


# ============================================================
# СТАТИСТИКА
# ============================================================
@router.get("/api/stats")
def stats(admin: Admin = Depends(get_current_admin), db: Session = Depends(get_db)):
    users_count = db.query(func.count(User.id)).scalar() or 0
    spins_count = db.query(func.count(SpinLog.id)).scalar() or 0
    total_balance = db.query(func.sum(User.balance)).scalar() or 0
    inv_count = db.query(func.count(Inventory.id)).scalar() or 0
    return {
        "users_count": users_count,
        "spins_count": spins_count,
        "total_balance": total_balance,
        "inventory_count": inv_count,
        "maintenance": get_setting(db, "maintenance", "0") == "1",
    }


# ============================================================
# ИГРОКИ
# ============================================================
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
                "is_owner": u.is_owner,
                "created_at": u.created_at.isoformat() if u.created_at else None,
                "last_seen": u.last_seen.isoformat() if u.last_seen else None,
            }
            for u in users
        ],
    }


@router.post("/api/users/{user_id}/balance")
def set_balance(user_id: int, payload: dict = Body(...), admin: Admin = Depends(get_current_admin), db: Session = Depends(get_db)):
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
def ban_user(user_id: int, payload: dict = Body(...), admin: Admin = Depends(get_current_admin), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    user.is_banned = bool(payload.get("banned", True))
    db.commit()
    return {"success": True, "is_banned": user.is_banned}


# ============================================================
# ВЫДАЧА НОМЕРА ИГРОКУ
# ============================================================
@router.post("/api/users/{user_id}/give-phone")
def give_phone(user_id: int, payload: dict = Body(...), admin: Admin = Depends(get_current_admin), db: Session = Depends(get_db)):
    """Выдать конкретному игроку номер, который напишет админ."""
    from . import game_data as gd

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    number = (payload.get("number") or "").strip()
    rarity = (payload.get("rarity") or "common").lower()
    country_code = (payload.get("country") or "RU").upper()
    notify = bool(payload.get("notify", True))

    if not number:
        raise HTTPException(status_code=400, detail="Введите номер")
    if rarity not in gd.RARITIES:
        raise HTTPException(status_code=400, detail="Неверная редкость")

    # Извлекаем красоту из номера (серия — берём первые 3 цифры префикса, если формат известен)
    # Просто считаем красоту без серии
    beauty = gd.calculate_beauty(number, "")
    price = gd.calc_price(rarity, beauty["total"])

    # Определяем страну/флаг/оператор
    country = gd.get_country(country_code)
    if not country:
        country = gd.COUNTRIES[0]
    # Ищем оператора по префиксу номера (приблизительно)
    op = {"name": "—", "code": "—"}
    for o in country["operators"]:
        for p in o["prefixes"]:
            if p in number:
                op = o
                break
        if op["code"] != "—":
            break

    item = Inventory(
        telegram_id=user.telegram_id,
        number=number,
        rarity=rarity,
        price=price,
        multiplier=beauty["total"],
        beauty_json=json.dumps(beauty["components"], ensure_ascii=False),
        country_code=country["code"],
        country_flag=country["flag"],
        country_name=country["name"],
        operator_code=op["code"],
        operator_name=op["name"],
        is_gifted=True,
    )
    db.add(item)
    db.commit()

    # Уведомление через бота
    if notify:
        try:
            from .bot import bot
            if bot:
                asyncio.create_task(bot.send_message(
                    user.telegram_id,
                    f"🎁 <b>Тебе выдан номер!</b>\n\n{number}\nРедкость: {gd.RARITIES[rarity]['name']}\nЦена: {price:,} ₽".replace(",", " "),
                    parse_mode="HTML"
                ))
        except Exception as e:
            print(f"Notify error: {e}")

    return {"success": True, "number": number, "rarity": rarity, "price": price, "id": item.id}


# ============================================================
# ВЫДАЧА ДЕНЕГ ПО USERNAME
# ============================================================
@router.post("/api/give-money-by-username")
def give_money_by_username(payload: dict = Body(...), admin: Admin = Depends(get_current_admin), db: Session = Depends(get_db)):
    username = (payload.get("username") or "").strip().lstrip("@")
    amount = int(payload.get("amount") or 0)
    notify = bool(payload.get("notify", True))

    if not username:
        raise HTTPException(status_code=400, detail="Введите @username")
    if amount == 0:
        raise HTTPException(status_code=400, detail="Введите сумму")

    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="Игрок не найден")

    user.balance += amount
    db.commit()

    if notify:
        try:
            from .bot import bot
            if bot and amount > 0:
                asyncio.create_task(bot.send_message(
                    user.telegram_id,
                    f"💸 <b>Тебе начислено {amount:,} ₽!</b>".replace(",", " "),
                    parse_mode="HTML"
                ))
        except Exception:
            pass

    return {"success": True, "balance": user.balance}


# ============================================================
# ВЫДАЧА НОМЕРА ПО USERNAME
# ============================================================
@router.post("/api/give-phone-by-username")
def give_phone_by_username(payload: dict = Body(...), admin: Admin = Depends(get_current_admin), db: Session = Depends(get_db)):
    from . import game_data as gd

    username = (payload.get("username") or "").strip().lstrip("@")
    number = (payload.get("number") or "").strip()
    rarity = (payload.get("rarity") or "common").lower()
    country_code = (payload.get("country") or "RU").upper()
    notify = bool(payload.get("notify", True))

    if not username:
        raise HTTPException(status_code=400, detail="Введите @username")
    if not number:
        raise HTTPException(status_code=400, detail="Введите номер")
    if rarity not in gd.RARITIES:
        raise HTTPException(status_code=400, detail="Неверная редкость")

    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="Игрок не найден")

    beauty = gd.calculate_beauty(number, "")
    price = gd.calc_price(rarity, beauty["total"])

    country = gd.get_country(country_code) or gd.COUNTRIES[0]
    op = {"name": "—", "code": "—"}
    for o in country["operators"]:
        for p in o["prefixes"]:
            if p in number:
                op = o
                break
        if op["code"] != "—":
            break

    item = Inventory(
        telegram_id=user.telegram_id,
        number=number,
        rarity=rarity,
        price=price,
        multiplier=beauty["total"],
        beauty_json=json.dumps(beauty["components"], ensure_ascii=False),
        country_code=country["code"],
        country_flag=country["flag"],
        country_name=country["name"],
        operator_code=op["code"],
        operator_name=op["name"],
        is_gifted=True,
    )
    db.add(item)
    db.commit()

    if notify:
        try:
            from .bot import bot
            if bot:
                asyncio.create_task(bot.send_message(
                    user.telegram_id,
                    f"🎁 <b>Тебе выдан номер!</b>\n\n{number}\nРедкость: {gd.RARITIES[rarity]['name']}",
                    parse_mode="HTML"
                ))
        except Exception:
            pass

    return {"success": True, "number": number, "price": price, "user_balance": user.balance}


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
    query = db.query(SpinLog, User).outerjoin(User, User.telegram_id == SpinLog.telegram_id)
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
                "id": s.id, "telegram_id": s.telegram_id,
                "first_name": u.first_name if u else "",
                "username": u.username if u else "",
                "rarity": s.rarity, "number": s.number,
                "price": s.price, "cost": s.cost,
                "multiplier": s.multiplier or 1.0,
                "country_code": s.country_code, "operator_code": s.operator_code,
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
def broadcast_info(admin: Admin = Depends(get_current_admin), db: Session = Depends(get_db)):
    count = db.query(func.count(User.id)).filter(User.is_banned == False).scalar() or 0
    return {"users_count": count}


@router.post("/api/broadcast")
async def broadcast(payload: dict = Body(...), admin: Admin = Depends(get_current_admin), db: Session = Depends(get_db)):
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
        except Exception:
            failed += 1
        await asyncio.sleep(0.05)
    return {"success": True, "sent": sent, "failed": failed}


@router.post("/api/give-money-all")
async def give_money_all(payload: dict = Body(...), admin: Admin = Depends(get_current_admin), db: Session = Depends(get_db)):
    """Выдать всем игрокам по X рублей."""
    amount = int(payload.get("amount") or 0)
    notify = bool(payload.get("notify", True))
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Сумма должна быть > 0")

    users = db.query(User).filter(User.is_banned == False).all()
    for u in users:
        u.balance += amount
    db.commit()

    sent = 0
    if notify:
        try:
            from .bot import bot
            if bot:
                for u in users:
                    try:
                        await bot.send_message(
                            u.telegram_id,
                            f"🎁 <b>Всем по {amount:,} ₽!</b>".replace(",", " "),
                            parse_mode="HTML"
                        )
                        sent += 1
                    except Exception:
                        pass
                    await asyncio.sleep(0.05)
        except Exception:
            pass

    return {"success": True, "users_count": len(users), "notified": sent, "amount": amount}


# ============================================================
# ПРОМОКОДЫ
# ============================================================
@router.get("/api/promos")
def list_promos(admin: Admin = Depends(get_current_admin), db: Session = Depends(get_db)):
    promos = db.query(Promocode).order_by(Promocode.created_at.desc()).all()
    return [
        {
            "id": p.id, "code": p.code, "amount": p.amount,
            "reusable": p.reusable, "max_uses": p.max_uses, "uses": p.uses,
            "is_active": p.is_active,
            "expires_at": p.expires_at.isoformat() if p.expires_at else None,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        }
        for p in promos
    ]


@router.post("/api/promos")
def create_promo(payload: dict = Body(...), admin: Admin = Depends(get_current_admin), db: Session = Depends(get_db)):
    code = (payload.get("code") or "").strip().upper()
    amount = int(payload.get("amount", 0))
    reusable = bool(payload.get("reusable", False))
    max_uses = int(payload.get("max_uses", 0))
    if not code:
        raise HTTPException(status_code=400, detail="Код обязателен")
    if db.query(Promocode).filter(Promocode.code == code).first():
        raise HTTPException(status_code=400, detail="Такой код уже есть")
    promo = Promocode(code=code, amount=amount, reusable=reusable, max_uses=max_uses)
    db.add(promo)
    db.commit()
    return {"success": True, "id": promo.id}


@router.delete("/api/promos/{promo_id}")
def delete_promo(promo_id: int, admin: Admin = Depends(get_current_admin), db: Session = Depends(get_db)):
    p = db.query(Promocode).filter(Promocode.id == promo_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Не найден")
    db.delete(p)
    db.commit()
    return {"success": True}


@router.post("/api/promos/{promo_id}/toggle")
def toggle_promo(promo_id: int, admin: Admin = Depends(get_current_admin), db: Session = Depends(get_db)):
    p = db.query(Promocode).filter(Promocode.id == promo_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Не найден")
    p.is_active = not p.is_active
    db.commit()
    return {"success": True, "is_active": p.is_active}


# ============================================================
# АДМИНЫ
# ============================================================
@router.get("/api/admins")
def list_admins(admin: Admin = Depends(get_current_admin), db: Session = Depends(get_db)):
    admins = db.query(Admin).order_by(Admin.created_at.desc()).all()
    return [
        {
            "id": a.id, "login": a.login, "role": a.role, "is_active": a.is_active,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in admins
    ]


@router.post("/api/admins")
def create_admin(payload: dict = Body(...), admin: Admin = Depends(get_current_admin), db: Session = Depends(get_db)):
    if admin.role != "owner":
        raise HTTPException(status_code=403, detail="Только владелец может создавать админов")
    login = (payload.get("login") or "").strip()
    password = payload.get("password") or ""
    role = payload.get("role", "moderator")
    if not login or not password:
        raise HTTPException(status_code=400, detail="Логин и пароль обязательны")
    if db.query(Admin).filter(Admin.login == login).first():
        raise HTTPException(status_code=400, detail="Логин занят")
    new_admin = Admin(login=login, password_hash=hash_password(password), role=role)
    db.add(new_admin)
    db.commit()
    return {"success": True, "id": new_admin.id}


@router.delete("/api/admins/{admin_id}")
def delete_admin(admin_id: int, admin: Admin = Depends(get_current_admin), db: Session = Depends(get_db)):
    if admin.role != "owner":
        raise HTTPException(status_code=403, detail="Только владелец")
    a = db.query(Admin).filter(Admin.id == admin_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Не найден")
    db.delete(a)
    db.commit()
    return {"success": True}


# ============================================================
# НАСТРОЙКИ
# ============================================================
@router.get("/api/settings")
def get_all_settings(admin: Admin = Depends(get_current_admin), db: Session = Depends(get_db)):
    from .models import Setting
    rows = db.query(Setting).all()
    return {r.key: r.value for r in rows}


@router.post("/api/settings")
def update_settings(payload: dict = Body(...), admin: Admin = Depends(get_current_admin), db: Session = Depends(get_db)):
    for k, v in payload.items():
        set_setting(db, str(k), str(v))
    return {"success": True}


# ============================================================
# ТЕХПЕРЕРЫВ
# ============================================================
@router.post("/api/maintenance")
def set_maintenance(payload: dict = Body(...), admin: Admin = Depends(get_current_admin), db: Session = Depends(get_db)):
    enabled = bool(payload.get("enabled", False))
    text = payload.get("text", "Технические работы")
    set_setting(db, "maintenance", "1" if enabled else "0")
    set_setting(db, "maintenance_text", text)
    return {"success": True, "maintenance": enabled}


# ============================================================
# БУСТЫ
# ============================================================
def _set_boost(db, key: str, seconds: int):
    end_ts = int(datetime.utcnow().timestamp()) + seconds
    set_setting(db, key, str(end_ts))


def _boost_info(db, key: str):
    val = get_setting(db, key, "")
    if not val:
        return {"active": False, "seconds_left": 0}
    try:
        end_ts = int(val)
        now = int(datetime.utcnow().timestamp())
        left = end_ts - now
        if left <= 0:
            return {"active": False, "seconds_left": 0}
        return {"active": True, "seconds_left": left}
    except Exception:
        return {"active": False, "seconds_left": 0}


@router.get("/api/boosts")
def get_boosts(admin: Admin = Depends(get_current_admin), db: Session = Depends(get_db)):
    return {
        "golden": _boost_info(db, "boost_golden"),
        "double": _boost_info(db, "boost_double"),
        "discount": _boost_info(db, "boost_discount"),
    }


@router.post("/api/boosts/start")
def start_boost(payload: dict = Body(...), admin: Admin = Depends(get_current_admin), db: Session = Depends(get_db)):
    boost_type = payload.get("type")
    if boost_type == "golden":
        _set_boost(db, "boost_golden", 15 * 60)
    elif boost_type == "double":
        _set_boost(db, "boost_double", 30 * 60)
    elif boost_type == "discount":
        _set_boost(db, "boost_discount", 30 * 60)
    else:
        raise HTTPException(status_code=400, detail="Неверный тип буста")
    return {"success": True}


@router.post("/api/boosts/stop")
def stop_boost(payload: dict = Body(...), admin: Admin = Depends(get_current_admin), db: Session = Depends(get_db)):
    boost_type = payload.get("type")
    key_map = {"golden": "boost_golden", "double": "boost_double", "discount": "boost_discount"}
    if boost_type not in key_map:
        raise HTTPException(status_code=400, detail="Неверный тип буста")
    set_setting(db, key_map[boost_type], "0")
    return {"success": True}
