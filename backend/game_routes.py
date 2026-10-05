from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from datetime import datetime, timedelta
from typing import Optional, List

from .auth import (
    verify_telegram_init_data,
    get_or_create_user,
    create_token,
    get_current_user_optional,
)
from .database import get_db, get_setting
from .models import User, Promocode, PromoUse, Inventory, SpinLog, Achievement, Trade
from .config import settings
from . import game_data as gd

router = APIRouter(prefix="/api", tags=["game"])


# ============================================================
# АВТОРИЗАЦИЯ
# ============================================================
@router.post("/auth")
def auth_telegram(payload: dict, db: Session = Depends(get_db)):
    init_data = payload.get("init_data", "")
    if not init_data:
        raise HTTPException(status_code=400, detail="init_data required")

    if not settings.BOT_TOKEN:
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


@router.get("/me")
def me(user: Optional[User] = Depends(get_current_user_optional)):
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
# СТАТУС И МЕТАДАННЫЕ
# ============================================================
@router.get("/status")
def game_status(db: Session = Depends(get_db)):
    return {
        "maintenance": get_setting(db, "maintenance", "0") == "1",
        "maintenance_text": get_setting(db, "maintenance_text", "Технические работы"),
        "start_balance": settings.START_BALANCE,
        "rarities": gd.get_full_rarity_list(),
        "rarity_order": gd.RARITY_ORDER,
        "rarity_filters": gd.RARITY_FILTERS,
        "spin_costs": gd.get_spin_costs(),
        "countries": gd.get_countries_for_frontend(),
        "daily_bonus": int(get_setting(db, "daily_bonus", "5000")),
        "craft_rules": gd.CRAFT_RULES,
        "achievements": [
            {"code": k, **v} for k, v in gd.ACHIEVEMENTS.items()
        ],
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
    return {"success": True, "amount": promo.amount, "balance": user.balance}


# ============================================================
# ЕЖЕДНЕВНЫЙ БОНУС
# ============================================================
@router.post("/daily-bonus")
def daily_bonus(
    user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    if not user:
        raise HTTPException(status_code=401, detail="Not authorized")

    bonus = int(get_setting(db, "daily_bonus", "5000"))
    now = datetime.utcnow()

    if user.last_bonus_at:
        elapsed = now - user.last_bonus_at
        if elapsed < timedelta(hours=24):
            remaining = timedelta(hours=24) - elapsed
            total_sec = int(remaining.total_seconds())
            h = total_sec // 3600
            m = (total_sec % 3600) // 60
            s = total_sec % 60
            raise HTTPException(
                status_code=400,
                detail=f"Приходи через {h}ч {m}м {s}с",
            )

    user.balance += bonus
    user.last_bonus_at = now
    db.commit()

    return {"success": True, "amount": bonus, "balance": user.balance}


@router.get("/daily-bonus/status")
def daily_bonus_status(
    user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    if not user:
        raise HTTPException(status_code=401, detail="Not authorized")

    bonus = int(get_setting(db, "daily_bonus", "5000"))
    if not user.last_bonus_at:
        return {"available": True, "bonus": bonus, "seconds_left": 0}

    elapsed = datetime.utcnow() - user.last_bonus_at
    if elapsed >= timedelta(hours=24):
        return {"available": True, "bonus": bonus, "seconds_left": 0}

    remaining = timedelta(hours=24) - elapsed
    return {
        "available": False,
        "bonus": bonus,
        "seconds_left": int(remaining.total_seconds()),
    }


# ============================================================
# КРУТКА
# ============================================================
def _check_maintenance(db):
    if get_setting(db, "maintenance", "0") == "1":
        raise HTTPException(
            status_code=423,
            detail=get_setting(db, "maintenance_text", "Технические работы"),
        )


def _check_achievements(db, user):
    """Проверяет и выдаёт достижения. Возвращает список новых."""
    new_achievements = []

    existing = {a.code for a in db.query(Achievement).filter(
        Achievement.telegram_id == user.telegram_id
    ).all()}

    def grant(code):
        if code in existing: return
        info = gd.ACHIEVEMENTS.get(code)
        if not info: return
        user.balance += info["reward"]
        db.add(Achievement(telegram_id=user.telegram_id, code=code))
        existing.add(code)
        new_achievements.append({
            "code": code,
            "name": info["name"],
            "desc": info["desc"],
            "reward": info["reward"],
        })

    # Спины
    if user.spins_total >= 1: grant("first_spin")
    if user.spins_total >= 10: grant("spins_10")
    if user.spins_total >= 100: grant("spins_100")
    if user.spins_total >= 1000: grant("spins_1000")

    # Редкости
    rarities = {row[0] for row in db.query(SpinLog.rarity).filter(
        SpinLog.telegram_id == user.telegram_id
    ).distinct().all()}
    if "rare" in rarities: grant("first_rare")
    if "epic" in rarities: grant("first_epic")
    if "mythic" in rarities: grant("first_mythic")
    if "legendary" in rarities: grant("first_legendary")
    if "secret" in rarities: grant("first_secret")

    # Инвентарь
    inv_count = db.query(Inventory).filter(Inventory.telegram_id == user.telegram_id).count()
    if inv_count >= 10: grant("inv_10")
    if inv_count >= 50: grant("inv_50")
    if inv_count >= 100: grant("inv_100")

    # Баланс
    if user.balance >= 100000: grant("balance_100k")
    if user.balance >= 1000000: grant("balance_1m")

    # Все страны
    countries = {row[0] for row in db.query(Inventory.country_code).filter(
        Inventory.telegram_id == user.telegram_id
    ).distinct().all()}
    all_codes = {c["code"] for c in gd.COUNTRIES}
    if all_codes.issubset(countries): grant("all_countries")

    return new_achievements


@router.post("/spin")
def spin(
    payload: dict,
    user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    if not user:
        raise HTTPException(status_code=401, detail="Not authorized")
    _check_maintenance(db)

    country_code = (payload.get("country") or "RU").upper()
    operator_code = payload.get("operator") or None
    min_rarity = payload.get("min_rarity") or "common"
    if min_rarity not in gd.RARITY_FILTERS:
        min_rarity = "common"

    cost = gd.SPIN_COSTS[min_rarity]
    if user.balance < cost:
        raise HTTPException(status_code=400, detail="Недостаточно средств")

    user.balance -= cost
    rarity = gd.pick_rarity(min_rarity)
    phone = gd.generate_phone(rarity, country_code, operator_code)
    price = gd.calc_price(rarity)

    db.add(SpinLog(
        telegram_id=user.telegram_id,
        rarity=rarity,
        number=phone["number"],
        price=price,
        cost=cost,
        country_code=phone["country_code"],
        operator_code=phone["operator_code"],
    ))
    user.spins_total += 1
    db.flush()

    new_ach = _check_achievements(db, user)
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
        "new_achievements": new_ach,
    }


@router.post("/spin5")
def spin5(
    payload: dict,
    user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    if not user:
        raise HTTPException(status_code=401, detail="Not authorized")
    _check_maintenance(db)

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
        db.add(SpinLog(
            telegram_id=user.telegram_id,
            rarity=rarity,
            number=phone["number"],
            price=price,
            cost=single_cost,
            country_code=phone["country_code"],
            operator_code=phone["operator_code"],
            is_multi=True,
        ))
    user.spins_total += 5
    db.flush()

    new_ach = _check_achievements(db, user)
    db.commit()

    return {
        "phones": phones,
        "cost": total_cost,
        "balance": user.balance,
        "spins_total": user.spins_total,
        "new_achievements": new_ach,
    }


# ============================================================
# ИНВЕНТАРЬ
# ============================================================
@router.get("/inventory")
def get_inventory(
    user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    if not user:
        raise HTTPException(status_code=401, detail="Not authorized")
    items = db.query(Inventory).filter(
        Inventory.telegram_id == user.telegram_id
    ).order_by(desc(Inventory.created_at)).all()
    return {
        "items": [
            {
                "id": it.id, "number": it.number, "rarity": it.rarity, "price": it.price,
                "country_code": it.country_code, "country_flag": it.country_flag,
                "country_name": it.country_name, "operator_code": it.operator_code,
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
    if not user:
        raise HTTPException(status_code=401, detail="Not authorized")
    phones = payload.get("phones") or []
    if not isinstance(phones, list) or not phones:
        raise HTTPException(status_code=400, detail="phones required")

    added = 0
    for p in phones:
        if not p.get("number") or not p.get("rarity"): continue
        db.add(Inventory(
            telegram_id=user.telegram_id,
            number=str(p["number"]), rarity=str(p["rarity"]), price=int(p.get("price") or 0),
            country_code=str(p.get("country_code") or ""),
            country_flag=str(p.get("country_flag") or ""),
            country_name=str(p.get("country_name") or ""),
            operator_code=str(p.get("operator_code") or ""),
            operator_name=str(p.get("operator_name") or ""),
        ))
        added += 1
    db.flush()
    new_ach = _check_achievements(db, user)
    db.commit()
    return {"success": True, "added": added, "new_achievements": new_ach}


@router.post("/inventory/sell")
def sell_phones(
    payload: dict,
    user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    if not user:
        raise HTTPException(status_code=401, detail="Not authorized")
    ids = payload.get("ids") or []
    if not isinstance(ids, list) or not ids:
        raise HTTPException(status_code=400, detail="ids required")
    items = db.query(Inventory).filter(
        Inventory.telegram_id == user.telegram_id, Inventory.id.in_(ids)
    ).all()
    if not items:
        raise HTTPException(status_code=404, detail="Номера не найдены")
    total = sum(it.price for it in items)
    for it in items: db.delete(it)
    user.balance += total
    db.flush()
    new_ach = _check_achievements(db, user)
    db.commit()
    return {"success": True, "sold": len(items), "total": total, "balance": user.balance, "new_achievements": new_ach}


@router.post("/inventory/sell-all")
def sell_all(
    user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    if not user:
        raise HTTPException(status_code=401, detail="Not authorized")
    items = db.query(Inventory).filter(Inventory.telegram_id == user.telegram_id).all()
    if not items:
        return {"success": True, "sold": 0, "total": 0, "balance": user.balance, "new_achievements": []}
    total = sum(it.price for it in items)
    for it in items: db.delete(it)
    user.balance += total
    db.flush()
    new_ach = _check_achievements(db, user)
    db.commit()
    return {"success": True, "sold": len(items), "total": total, "balance": user.balance, "new_achievements": new_ach}


@router.post("/sell-immediate")
def sell_immediate(
    payload: dict,
    user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    if not user:
        raise HTTPException(status_code=401, detail="Not authorized")
    phones = payload.get("phones") or []
    if not isinstance(phones, list) or not phones:
        raise HTTPException(status_code=400, detail="phones required")
    total = sum(int(p.get("price") or 0) for p in phones)
    user.balance += total
    db.flush()
    new_ach = _check_achievements(db, user)
    db.commit()
    return {"success": True, "sold": len(phones), "total": total, "balance": user.balance, "new_achievements": new_ach}


# ============================================================
# ДОСТИЖЕНИЯ
# ============================================================
@router.get("/achievements")
def list_achievements(
    user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    if not user:
        raise HTTPException(status_code=401, detail="Not authorized")
    got = {a.code: a.got_at for a in db.query(Achievement).filter(
        Achievement.telegram_id == user.telegram_id
    ).all()}
    return {
        "all": [
            {
                "code": k,
                "name": v["name"],
                "desc": v["desc"],
                "reward": v["reward"],
                "unlocked": k in got,
                "got_at": got[k].isoformat() if k in got else None,
            }
            for k, v in gd.ACHIEVEMENTS.items()
        ],
        "total_unlocked": len(got),
        "total": len(gd.ACHIEVEMENTS),
    }


# ============================================================
# КРАФТ
# ============================================================
@router.get("/craft")
def craft_info(
    user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """Показывает что можно скрафтить."""
    if not user:
        raise HTTPException(status_code=401, detail="Not authorized")

    # Считаем сколько номеров каждой редкости
    rows = db.query(
        Inventory.rarity, func.count(Inventory.id)
    ).filter(Inventory.telegram_id == user.telegram_id).group_by(Inventory.rarity).all()
    counts = {r: c for r, c in rows}

    result = []
    for from_rarity, rule in gd.CRAFT_RULES.items():
        have = counts.get(from_rarity, 0)
        result.append({
            "from_rarity": from_rarity,
            "from_name": gd.RARITIES[from_rarity]["name"],
            "from_color": gd.RARITIES[from_rarity]["color"],
            "to_rarity": rule["produces"],
            "to_name": gd.RARITIES[rule["produces"]]["name"],
            "to_color": gd.RARITIES[rule["produces"]]["color"],
            "need": rule["need"],
            "cost": rule["cost"],
            "have": have,
            "can_craft": have >= rule["need"] and user.balance >= rule["cost"],
        })

    return {"rules": result, "balance": user.balance}


@router.post("/craft")
def craft(
    payload: dict,
    user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    if not user:
        raise HTTPException(status_code=401, detail="Not authorized")

    from_rarity = payload.get("from_rarity")
    if from_rarity not in gd.CRAFT_RULES:
        raise HTTPException(status_code=400, detail="Неверная редкость")

    rule = gd.CRAFT_RULES[from_rarity]
    need = rule["need"]
    cost = rule["cost"]

    items = db.query(Inventory).filter(
        Inventory.telegram_id == user.telegram_id,
        Inventory.rarity == from_rarity,
    ).order_by(Inventory.id).limit(need).all()

    if len(items) < need:
        raise HTTPException(status_code=400, detail=f"Нужно {need} номеров, есть {len(items)}")
    if user.balance < cost:
        raise HTTPException(status_code=400, detail="Недостаточно средств для крафта")

    user.balance -= cost
    for it in items: db.delete(it)

    # Создаём новый номер высшей редкости
    new_rarity = rule["produces"]
    phone = gd.generate_phone(new_rarity, "RU", None)
    price = gd.calc_price(new_rarity)

    new_item = Inventory(
        telegram_id=user.telegram_id,
        number=phone["number"], rarity=new_rarity, price=price,
        country_code=phone["country_code"],
        country_flag=phone["country_flag"],
        country_name=phone["country_name"],
        operator_code=phone["operator_code"],
        operator_name=phone["operator_name"],
    )
    db.add(new_item)
    db.flush()
    new_ach = _check_achievements(db, user)
    db.commit()

    return {
        "success": True,
        "new_phone": {
            "number": phone["number"], "rarity": new_rarity, "price": price,
            "country_code": phone["country_code"], "country_flag": phone["country_flag"],
            "country_name": phone["country_name"], "operator_code": phone["operator_code"],
            "operator_name": phone["operator_name"],
        },
        "balance": user.balance,
        "new_achievements": new_ach,
    }


# ============================================================
# ЛИДЕРБОРД
# ============================================================
@router.get("/leaderboard")
def leaderboard(db: Session = Depends(get_db)):
    """Топ-50 игроков."""
    users = db.query(User).filter(User.is_banned == False).order_by(desc(User.balance)).limit(50).all()
    return {
        "balance": [
            {
                "tg_id": u.telegram_id,
                "name": u.first_name or u.username or "Игрок",
                "balance
