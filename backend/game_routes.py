from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
from datetime import datetime
from typing import Optional, List

from .auth import (
    verify_telegram_init_data,
    get_or_create_user,
    create_token,
    get_current_user_optional,
)
from .database import get_db, get_setting
from .models import User, Promocode, PromoUse, Inventory, SpinLog
from .config import settings
from . import game_data as gd

router = APIRouter(prefix="/api", tags=["game"])


# ============================================================
# АВТОРИЗАЦИЯ
# ============================================================
@router.post("/auth")
def auth_telegram(payload: dict, db: Session = Depends(get_db)):
    """
    Игрок входит через Telegram.
    Принимает { init_data: "..." } от Telegram.WebApp.initData
    """
    init_data = payload.get("init_data", "")
    if not init_data:
        raise HTTPException(status_code=400, detail="init_data required")

    if not settings.BOT_TOKEN:
        # Dev-режим: без токена бота пропускаем заглушку
        tg_data = {"id": 123456789, "first_name": "Dev", "username": "dev"}
    else:
        tg_data = verify_telegram_init_data(init_data)
        if not tg_data:
            raise HTTPException(status_code=401, detail="Invalid init_data")

    user = get_or_create_user(db, tg_data)
    if user.is_banned:
        raise HTTPException(status_code=403, detail="Аккаунт заблокирован")

    token = create_token({"type": "user", "tg_id": user.telegram_id})
    return {
        "token": token,
        "user": {
            "telegram_id": user.telegram_id,
            "first_name": user.first_name,
            "username": user.username,
            "balance": user.balance,
            "spins_total": user.spins_total,
            "is_owner": user.is_owner,
            "is_admin": user.is_admin,
        },
    }


# ============================================================
# ПРОФИЛЬ
# ============================================================
@router.get("/me")
def me(user: Optional[User] = Depends(get_current_user_optional)):
    """Возвращает актуальный профиль игрока."""
    if not user:
        raise HTTPException(status_code=401, detail="Not authorized")
    return {
        "telegram_id": user.telegram_id,
        "first_name": user.first_name,
        "username": user.username,
        "balance": user.balance,
        "spins_total": user.spins_total,
        "is_owner": user.is_owner,
        "is_admin": user.is_admin,
    }


# ============================================================
# СТАТУС ИГРЫ (техперерыв + метаданные)
# ============================================================
@router.get("/status")
def game_status(db: Session = Depends(get_db)):
    """Техперерыв + метаданные игры для фронта."""
    return {
        "maintenance": get_setting(db, "maintenance", "0") == "1",
        "maintenance_text": get_setting(db, "maintenance_text", "Технические работы"),
        "start_balance": settings.START_BALANCE,
        "rarities": gd.get_full_rarity_list(),
        "rarity_order": gd.RARITY_ORDER,
        "rarity_filters": gd.RARITY_FILTERS,
        "spin_costs": gd.get_spin_costs(),
        "countries": gd.get_countries_for_frontend(),
    }


# ============================================================
# ПРОМОКОДЫ
# ============================================================
@router.post("/promo/activate")
def activate_promo(
    payload: dict,
    user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    if not user:
        raise HTTPException(status_code=401, detail="Not authorized")

    code = (payload.get("code") or "").strip().upper()
    if not code:
        raise HTTPException(status_code=400, detail="Введите код")

    promo = db.query(Promocode).filter(Promocode.code == code).first()
    if not promo or not promo.is_active:
        raise HTTPException(status_code=404, detail="Промокод не найден")

    if promo.expires_at and promo.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Срок действия истёк")

    if promo.max_uses > 0 and promo.uses >= promo.max_uses:
        raise HTTPException(status_code=400, detail="Лимит использований исчерпан")

    if not promo.reusable:
        used = db.query(PromoUse).filter(
            PromoUse.promocode_id == promo.id,
            PromoUse.telegram_id == user.telegram_id,
        ).first()
        if used:
            raise HTTPException(status_code=400, detail="Вы уже использовали этот промокод")

    user.balance += promo.amount
    promo.uses += 1
    db.add(PromoUse(promocode_id=promo.id, telegram_id=user.telegram_id))
    db.commit()

    return {
        "success": True,
        "amount": promo.amount,
        "balance": user.balance,
    }


# ============================================================
# КРУТКА
# ============================================================
@router.post("/spin")
def spin(
    payload: dict,
    user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """
    Крутка рулетки.
    Принимает: { country, operator (опц.), min_rarity (опц.) }
    Возвращает: { phone, balance, spins_total }
    """
    if not user:
        raise HTTPException(status_code=401, detail="Not authorized")

    # Техперерыв
    if get_setting(db, "maintenance", "0") == "1":
        raise HTTPException(
            status_code=423,
            detail=get_setting(db, "maintenance_text", "Технические работы"),
        )

    country_code = (payload.get("country") or "RU").upper()
    operator_code = payload.get("operator") or None
    min_rarity = payload.get("min_rarity") or "common"

    if min_rarity not in gd.RARITY_FILTERS:
        min_rarity = "common"

    cost = gd.SPIN_COSTS[min_rarity]

    if user.balance < cost:
        raise HTTPException(status_code=400, detail="Недостаточно средств")

    # Списываем
    user.balance -= cost

    # Генерируем
    rarity = gd.pick_rarity(min_rarity)
    phone = gd.generate_phone(rarity, country_code, operator_code)
    price = gd.calc_price(rarity)

    # Логируем
    log = SpinLog(
        telegram_id=user.telegram_id,
        rarity=rarity,
        number=phone["number"],
        price=price,
        cost=cost,
        country_code=phone["country_code"],
        operator_code=phone["operator_code"],
    )
    db.add(log)

    user.spins_total += 1
    db.commit()

    return {
        "phone": {
            "number": phone["number"],
            "rarity": rarity,
            "price": price,
            "country_code": phone["country_code"],
            "country_flag": phone["country_flag"],
            "country_name": phone["country_name"],
            "operator_code": phone["operator_code"],
            "operator_name": phone["operator_name"],
        },
        "cost": cost,
        "balance": user.balance,
        "spins_total": user.spins_total,
    }


# ============================================================
# КРУТКА ×5
# ============================================================
@router.post("/spin5")
def spin5(
    payload: dict,
    user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """
    Крутка ×5. Возвращает 5 номеров.
    """
    if not user:
        raise HTTPException(status_code=401, detail="Not authorized")

    if get_setting(db, "maintenance", "0") == "1":
        raise HTTPException(
            status_code=423,
            detail=get_setting(db, "maintenance_text", "Технические работы"),
        )

    country_code = (payload.get("country") or "RU").upper()
    operator_code = payload.get("operator") or None
    min_rarity = payload.get("min_rarity") or "common"

    if min_rarity not in gd.RARITY_FILTERS:
        min_rarity = "common"

    single_cost = gd.SPIN_COSTS[min_rarity]
    total_cost = single_cost * 5

    if user.balance < total_cost:
        raise HTTPException(status_code=400, detail="Недостаточно средств")

    user.balance -= total_cost

    phones = []
    for i in range(5):
        rarity = gd.pick_rarity(min_rarity)
        phone = gd.generate_phone(rarity, country_code, operator_code)
        price = gd.calc_price(rarity)
        phones.append({
            "number": phone["number"],
            "rarity": rarity,
            "price": price,
            "country_code": phone["country_code"],
            "country_flag": phone["country_flag"],
            "country_name": phone["country_name"],
            "operator_code": phone["operator_code"],
            "operator_name": phone["operator_name"],
        })

        log = SpinLog(
            telegram_id=user.telegram_id,
            rarity=rarity,
            number=phone["number"],
            price=price,
            cost=single_cost,
            country_code=phone["country_code"],
            operator_code=phone["operator_code"],
            is_multi=True,
        )
        db.add(log)

    user.spins_total += 5
    db.commit()

    return {
        "phones": phones,
        "cost": total_cost,
        "balance": user.balance,
        "spins_total": user.spins_total,
    }


# ============================================================
# ИНВЕНТАРЬ
# ============================================================
@router.get("/inventory")
def get_inventory(
    user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """Возвращает инвентарь игрока."""
    if not user:
        raise HTTPException(status_code=401, detail="Not authorized")

    items = db.query(Inventory).filter(
        Inventory.telegram_id == user.telegram_id
    ).order_by(desc(Inventory.created_at)).all()

    return {
        "items": [
            {
                "id": it.id,
                "number": it.number,
                "rarity": it.rarity,
                "price": it.price,
                "country_code": it.country_code,
                "country_flag": it.country_flag,
                "country_name": it.country_name,
                "operator_code": it.operator_code,
                "operator_name": it.operator_name,
                "created_at": it.created_at.isoformat() if it.created_at else None,
            }
            for it in items
        ],
        "total": len(items),
    }


@router.post("/inventory/keep")
def keep_phone(
    payload: dict,
    user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """
    Сохранить номер(а) в инвентарь.
    Принимает: { phones: [ {...}, {...} ] }
    Каждый phone: number, rarity, price, country_code, ...
    """
    if not user:
        raise HTTPException(status_code=401, detail="Not authorized")

    phones = payload.get("phones") or []
    if not isinstance(phones, list) or not phones:
        raise HTTPException(status_code=400, detail="phones required")

    added = 0
    for p in phones:
        # Минимальная валидация
        if not p.get("number") or not p.get("rarity"):
            continue

        item = Inventory(
            telegram_id=user.telegram_id,
            number=str(p["number"]),
            rarity=str(p["rarity"]),
            price=int(p.get("price") or 0),
            country_code=str(p.get("country_code") or ""),
            country_flag=str(p.get("country_flag") or ""),
            country_name=str(p.get("country_name") or ""),
            operator_code=str(p.get("operator_code") or ""),
            operator_name=str(p.get("operator_name") or ""),
        )
        db.add(item)
        added += 1

    db.commit()
    return {"success": True, "added": added}


# ============================================================
# ПРОДАЖА
# ============================================================
@router.post("/inventory/sell")
def sell_phones(
    payload: dict,
    user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """
    Продажа номеров из инвентаря.
    Принимает: { ids: [1, 2, 3] }  — ID номеров для продажи
    Возвращает: { sold, total, balance }
    """
    if not user:
        raise HTTPException(status_code=401, detail="Not authorized")

    ids = payload.get("ids") or []
    if not isinstance(ids, list) or not ids:
        raise HTTPException(status_code=400, detail="ids required")

    items = db.query(Inventory).filter(
        Inventory.telegram_id == user.telegram_id,
        Inventory.id.in_(ids),
    ).all()

    if not items:
        raise HTTPException(status_code=404, detail="Номера не найдены")

    total = sum(it.price for it in items)
    for it in items:
        db.delete(it)

    user.balance += total
    db.commit()

    return {
        "success": True,
        "sold": len(items),
        "total": total,
        "balance": user.balance,
    }


@router.post("/inventory/sell-all")
def sell_all(
    user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """Продать все номера из инвентаря."""
    if not user:
        raise HTTPException(status_code=401, detail="Not authorized")

    items = db.query(Inventory).filter(
        Inventory.telegram_id == user.telegram_id
    ).all()

    if not items:
        return {"success": True, "sold": 0, "total": 0, "balance": user.balance}

    total = sum(it.price for it in items)
    for it in items:
        db.delete(it)

    user.balance += total
    db.commit()

    return {
        "success": True,
        "sold": len(items),
        "total": total,
        "balance": user.balance,
    }


# ============================================================
# ПРОДАЖА СРАЗУ (без сохранения в инвентарь)
# ============================================================
@router.post("/sell-immediate")
def sell_immediate(
    payload: dict,
    user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """
    Продать сразу после крутки (не сохраняя в инвентарь).
    Принимает: { phones: [ {...}, {...} ] }
    """
    if not user:
        raise HTTPException(status_code=401, detail="Not authorized")

    phones = payload.get("phones") or []
    if not isinstance(phones, list) or not phones:
        raise HTTPException(status_code=400, detail="phones required")

    total = sum(int(p.get("price") or 0) for p in phones)
    user.balance += total
    db.commit()

    return {
        "success": True,
        "sold": len(phones),
        "total": total,
        "balance": user.balance,
    }


# ============================================================
# СТАТИСТИКА ИГРОКА
# ============================================================
@router.get("/stats")
def user_stats(
    user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """Статистика игрока."""
    if not user:
        raise HTTPException(status_code=401, detail="Not authorized")

    inv_count = db.query(Inventory).filter(
        Inventory.telegram_id == user.telegram_id
    ).count()

    return {
        "balance": user.balance,
        "spins_total": user.spins_total,
        "inventory_count": inv_count,
    }
