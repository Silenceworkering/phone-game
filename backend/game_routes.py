from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc, func, and_
from datetime import datetime, timedelta, date
from typing import Optional
import json
import random

from .auth import (
    verify_telegram_init_data,
    get_or_create_user,
    create_token,
    get_current_user_optional,
)
from .database import get_db, get_setting
from .models import (
    User, Promocode, PromoUse, Inventory, SpinLog, Achievement,
    Trade, Quest, MarketListing, DiceGame, ReferralReward,
)
from .config import settings
from . import game_data as gd

router = APIRouter(prefix="/api", tags=["game"])


# ============================================================
# УДАЧА
# ============================================================
def get_luck_multiplier(spins_total: int) -> int:
    n = spins_total
    if n > 0 and n % 1000 == 0: return 25
    if n > 0 and n % 100 == 0: return 5
    return 1


def get_luck_info(spins_total: int) -> dict:
    progress = spins_total % 100
    if progress == 0 and spins_total > 0: progress = 100
    next_at = ((spins_total // 100) + 1) * 100
    next_mult = 25 if next_at % 1000 == 0 else 5
    left = next_at - spins_total
    super_at = ((spins_total // 1000) + 1) * 1000
    super_left = super_at - spins_total
    return {
        "progress": progress, "next_at": next_at,
        "next_mult": next_mult, "left": left,
        "super_left": super_left,
    }


# ============================================================
# АВТОРИЗАЦИЯ
# ============================================================
@router.post("/auth")
def auth_telegram(payload: dict, db: Session = Depends(get_db)):
    init_data = payload.get("init_data", "")
    ref_code = payload.get("ref_code")  # строка вида "ref_123456789"

    if not init_data:
        raise HTTPException(status_code=400, detail="init_data required")

    if not settings.BOT_TOKEN:
        tg_data = {"id": 123456789, "first_name": "Dev", "username": "dev"}
    else:
        tg_data = verify_telegram_init_data(init_data)
        if not tg_data:
            raise HTTPException(status_code=401, detail="Invalid init_data")

    # Проверяем, новый ли это игрок
    existing = db.query(User).filter(User.telegram_id == tg_data["id"]).first()
    is_new = existing is None

    user = get_or_create_user(db, tg_data)
    if user.is_banned:
        raise HTTPException(status_code=403, detail="Аккаунт заблокирован")

    # Реферальная система — только для новых
    if is_new and ref_code and ref_code.startswith("ref_"):
        try:
            referrer_tg = int(ref_code.replace("ref_", ""))
            if referrer_tg != user.telegram_id:
                referrer = db.query(User).filter(User.telegram_id == referrer_tg).first()
                if referrer and not referrer.is_banned:
                    # Начисляем
                    REWARD_REFERRER = 50000
                    REWARD_REFERRED = 30000
                    referrer.balance += REWARD_REFERRER
                    user.balance += REWARD_REFERRED
                    user.referrer_id = referrer_tg
                    user.ref_bonus_claimed = True
                    db.add(ReferralReward(
                        referrer_id=referrer_tg,
                        referred_id=user.telegram_id,
                        reward_referrer=REWARD_REFERRER,
                        reward_referred=REWARD_REFERRED,
                    ))
                    db.commit()
        except Exception as e:
            print(f"Referral error: {e}")

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
def me(user: Optional[User] = Depends(get_current_user_optional), db: Session = Depends(get_db)):
    if not user:
        raise HTTPException(status_code=401, detail="Not authorized")
    # Считаем рефералов
    refs_count = db.query(func.count(ReferralReward.id)).filter(
        ReferralReward.referrer_id == user.telegram_id
    ).scalar() or 0
    return {
        "telegram_id": user.telegram_id,
        "first_name": user.first_name,
        "username": user.username,
        "balance": user.balance,
        "spins_total": user.spins_total,
        "is_owner": user.is_owner,
        "is_admin": user.is_admin,
        "luck": get_luck_info(user.spins_total),
        "refs_count": refs_count,
    }


# ============================================================
# СТАТУС
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
        "achievements": [{"code": k, **v} for k, v in gd.ACHIEVEMENTS.items()],
        "boost_golden": get_boost_info(db, "boost_golden"),
        "boost_double": get_boost_info(db, "boost_double"),
        "boost_discount": get_boost_info(db, "boost_discount"),
    }


# ============================================================
# БУСТЫ
# ============================================================
def get_boost_info(db: Session, key: str) -> dict:
    val = get_setting(db, key, "")
    if not val:
        return {"active": False, "seconds_left": 0}
    try:
        end_ts = int(val)
        now_ts = int(datetime.utcnow().timestamp())
        left = end_ts - now_ts
        if left <= 0: return {"active": False, "seconds_left": 0}
        return {"active": True, "seconds_left": left}
    except Exception:
        return {"active": False, "seconds_left": 0}


def get_active_boost_mult(db: Session) -> tuple:
    luck = 1.0
    price = 1.0
    golden = get_boost_info(db, "boost_golden")
    double = get_boost_info(db, "boost_double")
    discount = get_boost_info(db, "boost_discount")
    if golden["active"]: luck *= 2; price *= 0.5
    if double["active"]: luck *= 2
    if discount["active"]: price *= 0.5
    return (luck, price)


# ============================================================
# ПРОМОКОДЫ
# ============================================================
@router.post("/promo/activate")
def activate_promo(payload: dict, user: Optional[User] = Depends(get_current_user_optional), db: Session = Depends(get_db)):
    if not user: raise HTTPException(status_code=401, detail="Not authorized")
    code = (payload.get("code") or "").strip().upper()
    if not code: raise HTTPException(status_code=400, detail="Введите код")
    promo = db.query(Promocode).filter(Promocode.code == code).first()
    if not promo or not promo.is_active:
        raise HTTPException(status_code=404, detail="Промокод не найден")
    if promo.expires_at and promo.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Срок действия истёк")
    if promo.max_uses > 0 and promo.uses >= promo.max_uses:
        raise HTTPException(status_code=400, detail="Лимит использований исчерпан")
    if not promo.reusable:
        used = db.query(PromoUse).filter(PromoUse.promocode_id == promo.id, PromoUse.telegram_id == user.telegram_id).first()
        if used: raise HTTPException(status_code=400, detail="Вы уже использовали этот промокод")
    user.balance += promo.amount
    promo.uses += 1
    db.add(PromoUse(promocode_id=promo.id, telegram_id=user.telegram_id))
    db.commit()
    return {"success": True, "amount": promo.amount, "balance": user.balance}


# ============================================================
# БОНУС
# ============================================================
@router.post("/daily-bonus")
def daily_bonus(user: Optional[User] = Depends(get_current_user_optional), db: Session = Depends(get_db)):
    if not user: raise HTTPException(status_code=401, detail="Not authorized")
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
            raise HTTPException(status_code=400, detail=f"Приходи через {h}ч {m}м {s}с")
    user.balance += bonus
    user.last_bonus_at = now
    db.commit()
    return {"success": True, "amount": bonus, "balance": user.balance}


@router.get("/daily-bonus/status")
def daily_bonus_status(user: Optional[User] = Depends(get_current_user_optional), db: Session = Depends(get_db)):
    if not user: raise HTTPException(status_code=401, detail="Not authorized")
    bonus = int(get_setting(db, "daily_bonus", "5000"))
    if not user.last_bonus_at:
        return {"available": True, "bonus": bonus, "seconds_left": 0}
    elapsed = datetime.utcnow() - user.last_bonus_at
    if elapsed >= timedelta(hours=24):
        return {"available": True, "bonus": bonus, "seconds_left": 0}
    remaining = timedelta(hours=24) - elapsed
    return {"available": False, "bonus": bonus, "seconds_left": int(remaining.total_seconds())}


# ============================================================
# КРУТКИ
# ============================================================
def _check_maintenance(db):
    if get_setting(db, "maintenance", "0") == "1":
        raise HTTPException(status_code=423, detail=get_setting(db, "maintenance_text", "Технические работы"))


def _check_achievements(db, user):
    new_achievements = []
    existing = {a.code for a in db.query(Achievement).filter(Achievement.telegram_id == user.telegram_id).all()}

    def grant(code):
        if code in existing: return
        info = gd.ACHIEVEMENTS.get(code)
        if not info: return
        user.balance += info["reward"]
        db.add(Achievement(telegram_id=user.telegram_id, code=code))
        existing.add(code)
        new_achievements.append({"code": code, "name": info["name"], "desc": info["desc"], "reward": info["reward"]})

    if user.spins_total >= 1: grant("first_spin")
    if user.spins_total >= 10: grant("spins_10")
    if user.spins_total >= 100: grant("spins_100")
    if user.spins_total >= 1000: grant("spins_1000")

    rarities = {row[0] for row in db.query(SpinLog.rarity).filter(SpinLog.telegram_id == user.telegram_id).distinct().all()}
    if "rare" in rarities: grant("first_rare")
    if "epic" in rarities: grant("first_epic")
    if "mythic" in rarities: grant("first_mythic")
    if "legendary" in rarities: grant("first_legendary")
    if "secret" in rarities: grant("first_secret")

    inv_count = db.query(Inventory).filter(Inventory.telegram_id == user.telegram_id).count()
    if inv_count >= 10: grant("inv_10")
    if inv_count >= 50: grant("inv_50")
    if inv_count >= 100: grant("inv_100")

    if user.balance >= 100000: grant("balance_100k")
    if user.balance >= 1000000: grant("balance_1m")

    countries = {row[0] for row in db.query(Inventory.country_code).filter(Inventory.telegram_id == user.telegram_id).distinct().all()}
    all_codes = {c["code"] for c in gd.COUNTRIES}
    if all_codes.issubset(countries): grant("all_countries")

    return new_achievements


def _is_vip_number(number: str, multiplier: float) -> bool:
    """VIP-номер: множитель ≥ 50 или содержит '777'/'999' """
    if multiplier >= 50: return True
    digits = "".join(c for c in number if c.isdigit())
    if "777" in digits or "999" in digits or "888" in digits: return True
    return False


def _update_quests(db, user, action_type: str, amount: int = 1):
    """Обновляет прогресс ежедневных квестов."""
    today = date.today().isoformat()
    quests = db.query(Quest).filter(
        Quest.telegram_id == user.telegram_id,
        Quest.date == today,
    ).all()

    # Автосоздание квестов на сегодня при первой активности
    if not quests:
        quests = _create_daily_quests(db, user, today)

    for q in quests:
        if q.quest_type == action_type and not q.claimed:
            q.progress = min(q.progress + amount, q.target)
    db.commit()


def _create_daily_quests(db, user, today: str):
    """Создаёт 3 квеста на сегодня."""
    templates = [
        {"type": "spins_5", "target": 5, "reward": 1000},
        {"type": "sells_3", "target": 3, "reward": 500},
        {"type": "crafts_1", "target": 1, "reward": 2000},
    ]
    quests = []
    for t in templates:
        q = Quest(
            telegram_id=user.telegram_id,
            date=today,
            quest_type=t["type"],
            progress=0,
            target=t["target"],
            reward=t["reward"],
        )
        db.add(q)
        quests.append(q)
    db.commit()
    return quests


@router.post("/spin")
def spin(payload: dict, user: Optional[User] = Depends(get_current_user_optional), db: Session = Depends(get_db)):
    if not user: raise HTTPException(status_code=401, detail="Not authorized")
    _check_maintenance(db)

    country_code = (payload.get("country") or "RU").upper()
    operator_code = payload.get("operator") or None
    min_rarity = payload.get("min_rarity") or "common"
    if min_rarity not in gd.RARITY_FILTERS: min_rarity = "common"

    luck_luck, price_mult = get_active_boost_mult(db)
    cost = int(gd.SPIN_COSTS[min_rarity] * price_mult)
    if user.balance < cost: raise HTTPException(status_code=400, detail="Недостаточно средств")

    user.balance -= cost
    spins_new = user.spins_total + 1
    luck_mult = get_luck_multiplier(spins_new)
    total_luck = luck_luck * luck_mult
    rarity = gd.pick_rarity(min_rarity, luck_mult=total_luck)
    phone = gd.generate_phone(rarity, country_code, operator_code)
    beauty = gd.calculate_beauty(phone["number"], phone["beauty_prefix"])
    price = int(gd.calc_price(rarity, beauty["total"]) * price_mult)

    db.add(SpinLog(
        telegram_id=user.telegram_id, rarity=rarity, number=phone["number"],
        price=price, cost=cost, country_code=phone["country_code"],
        operator_code=phone["operator_code"], multiplier=beauty["total"],
        beauty_json=json.dumps(beauty["components"], ensure_ascii=False),
    ))
    user.spins_total = spins_new
    db.flush()
    new_ach = _check_achievements(db, user)
    _update_quests(db, user, "spins_5", 1)
    db.commit()

    return {
        "phone": {
            "number": phone["number"], "rarity": rarity, "price": price,
            "country_code": phone["country_code"], "country_flag": phone["country_flag"],
            "country_name": phone["country_name"], "operator_code": phone["operator_code"],
            "operator_name": phone["operator_name"],
            "multiplier": beauty["total"], "components": beauty["components"],
            "is_vip": _is_vip_number(phone["number"], beauty["total"]),
        },
        "cost": cost, "balance": user.balance, "spins_total": user.spins_total,
        "luck_mult": luck_mult, "luck_info": get_luck_info(user.spins_total),
        "new_achievements": new_ach,
    }


@router.post("/spin5")
def spin5(payload: dict, user: Optional[User] = Depends(get_current_user_optional), db: Session = Depends(get_db)):
    if not user: raise HTTPException(status_code=401, detail="Not authorized")
    _check_maintenance(db)

    country_code = (payload.get("country") or "RU").upper()
    operator_code = payload.get("operator") or None
    min_rarity = payload.get("min_rarity") or "common"
    if min_rarity not in gd.RARITY_FILTERS: min_rarity = "common"

    luck_luck, price_mult = get_active_boost_mult(db)
    single_cost = int(gd.SPIN_COSTS[min_rarity] * price_mult)
    total_cost = single_cost * 5
    if user.balance < total_cost: raise HTTPException(status_code=400, detail="Недостаточно средств")

    user.balance -= total_cost
    phones = []
    for i in range(5):
        spins_new = user.spins_total + 1
        luck_mult = get_luck_multiplier(spins_new)
        total_luck = luck_luck * luck_mult
        rarity = gd.pick_rarity(min_rarity, luck_mult=total_luck)
        phone = gd.generate_phone(rarity, country_code, operator_code)
        beauty = gd.calculate_beauty(phone["number"], phone["beauty_prefix"])
        price = int(gd.calc_price(rarity, beauty["total"]) * price_mult)

        phones.append({
            "number": phone["number"], "rarity": rarity, "price": price,
            "country_code": phone["country_code"], "country_flag": phone["country_flag"],
            "country_name": phone["country_name"], "operator_code": phone["operator_code"],
            "operator_name": phone["operator_name"],
            "multiplier": beauty["total"], "components": beauty["components"],
            "is_vip": _is_vip_number(phone["number"], beauty["total"]),
        })

        db.add(SpinLog(
            telegram_id=user.telegram_id, rarity=rarity, number=phone["number"],
            price=price, cost=single_cost, country_code=phone["country_code"],
            operator_code=phone["operator_code"], multiplier=beauty["total"],
            beauty_json=json.dumps(beauty["components"], ensure_ascii=False),
            is_multi=True,
        ))
        user.spins_total = spins_new

    db.flush()
    new_ach = _check_achievements(db, user)
    _update_quests(db, user, "spins_5", 5)
    db.commit()

    return {
        "phones": phones, "cost": total_cost, "balance": user.balance,
        "spins_total": user.spins_total,
        "luck_info": get_luck_info(user.spins_total),
        "new_achievements": new_ach,
    }


# ============================================================
# ИНВЕНТАРЬ
# ============================================================
@router.get("/inventory")
def get_inventory(user: Optional[User] = Depends(get_current_user_optional), db: Session = Depends(get_db)):
    if not user: raise HTTPException(status_code=401, detail="Not authorized")
    items = db.query(Inventory).filter(Inventory.telegram_id == user.telegram_id).order_by(desc(Inventory.created_at)).all()
    result = []
    for it in items:
        try: components = json.loads(it.beauty_json) if it.beauty_json else []
        except Exception: components = []
        result.append({
            "id": it.id, "number": it.number, "rarity": it.rarity, "price": it.price,
            "multiplier": it.multiplier or 1.0, "components": components,
            "country_code": it.country_code, "country_flag": it.country_flag,
            "country_name": it.country_name, "operator_code": it.operator_code,
            "operator_name": it.operator_name, "is_gifted": bool(it.is_gifted),
            "is_vip": bool(it.is_vip),
            "created_at": it.created_at.isoformat() if it.created_at else None,
        })
    return {"items": result, "total": len(result)}


@router.post("/inventory/keep")
def keep_phone(payload: dict, user: Optional[User] = Depends(get_current_user_optional), db: Session = Depends(get_db)):
    if not user: raise HTTPException(status_code=401, detail="Not authorized")
    phones = payload.get("phones") or []
    if not isinstance(phones, list) or not phones: raise HTTPException(status_code=400, detail="phones required")
    added = 0
    for p in phones:
        if not p.get("number") or not p.get("rarity"): continue
        components = p.get("components") or []
        db.add(Inventory(
            telegram_id=user.telegram_id, number=str(p["number"]),
            rarity=str(p["rarity"]), price=int(p.get("price") or 0),
            multiplier=float(p.get("multiplier") or 1.0),
            beauty_json=json.dumps(components, ensure_ascii=False),
            country_code=str(p.get("country_code") or ""),
            country_flag=str(p.get("country_flag") or ""),
            country_name=str(p.get("country_name") or ""),
            operator_code=str(p.get("operator_code") or ""),
            operator_name=str(p.get("operator_name") or ""),
            is_vip=bool(p.get("is_vip", False)),
        ))
        added += 1
    db.flush()
    new_ach = _check_achievements(db, user)
    db.commit()
    return {"success": True, "added": added, "new_achievements": new_ach}


@router.post("/inventory/sell")
def sell_phones(payload: dict, user: Optional[User] = Depends(get_current_user_optional), db: Session = Depends(get_db)):
    if not user: raise HTTPException(status_code=401, detail="Not authorized")
    ids = payload.get("ids") or []
    if not isinstance(ids, list) or not ids: raise HTTPException(status_code=400, detail="ids required")
    items = db.query(Inventory).filter(Inventory.telegram_id == user.telegram_id, Inventory.id.in_(ids)).all()
    if not items: raise HTTPException(status_code=404, detail="Номера не найдены")
    total = sum(it.price for it in items)
    for it in items: db.delete(it)
    user.balance += total
    db.flush()
    new_ach = _check_achievements(db, user)
    _update_quests(db, user, "sells_3", len(items))
    db.commit()
    return {"success": True, "sold": len(items), "total": total, "balance": user.balance, "new_achievements": new_ach}


@router.post("/inventory/sell-all")
def sell_all(user: Optional[User] = Depends(get_current_user_optional), db: Session = Depends(get_db)):
    if not user: raise HTTPException(status_code=401, detail="Not authorized")
    items = db.query(Inventory).filter(Inventory.telegram_id == user.telegram_id).all()
    if not items: return {"success": True, "sold": 0, "total": 0, "balance": user.balance, "new_achievements": []}
    total = sum(it.price for it in items)
    count = len(items)
    for it in items: db.delete(it)
    user.balance += total
    db.flush()
    new_ach = _check_achievements(db, user)
    _update_quests(db, user, "sells_3", count)
    db.commit()
    return {"success": True, "sold": count, "total": total, "balance": user.balance, "new_achievements": new_ach}


@router.post("/sell-immediate")
def sell_immediate(payload: dict, user: Optional[User] = Depends(get_current_user_optional), db: Session = Depends(get_db)):
    if not user: raise HTTPException(status_code=401, detail="Not authorized")
    phones = payload.get("phones") or []
    if not isinstance(phones, list) or not phones: raise HTTPException(status_code=400, detail="phones required")
    total = sum(int(p.get("price") or 0) for p in phones)
    user.balance += total
    db.flush()
    new_ach = _check_achievements(db, user)
    _update_quests(db, user, "sells_3", len(phones))
    db.commit()
    return {"success": True, "sold": len(phones), "total": total, "balance": user.balance, "new_achievements": new_ach}


# ============================================================
# ДОСТИЖЕНИЯ
# ============================================================
@router.get("/achievements")
def list_achievements(user: Optional[User] = Depends(get_current_user_optional), db: Session = Depends(get_db)):
    if not user: raise HTTPException(status_code=401, detail="Not authorized")
    got = {a.code: a.got_at for a in db.query(Achievement).filter(Achievement.telegram_id == user.telegram_id).all()}
    return {
        "all": [{"code": k, "name": v["name"], "desc": v["desc"], "reward": v["reward"],
                 "unlocked": k in got, "got_at": got[k].isoformat() if k in got else None}
                for k, v in gd.ACHIEVEMENTS.items()],
        "total_unlocked": len(got), "total": len(gd.ACHIEVEMENTS),
    }


# ============================================================
# КРАФТ
# ============================================================
@router.get("/craft")
def craft_info(user: Optional[User] = Depends(get_current_user_optional), db: Session = Depends(get_db)):
    if not user: raise HTTPException(status_code=401, detail="Not authorized")
    rows = db.query(Inventory.rarity, func.count(Inventory.id)).filter(Inventory.telegram_id == user.telegram_id).group_by(Inventory.rarity).all()
    counts = {r: c for r, c in rows}
    result = []
    for from_rarity, rule in gd.CRAFT_RULES.items():
        have = counts.get(from_rarity, 0)
        result.append({
            "from_rarity": from_rarity, "from_name": gd.RARITIES[from_rarity]["name"],
            "from_color": gd.RARITIES[from_rarity]["color"],
            "to_rarity": rule["produces"], "to_name": gd.RARITIES[rule["produces"]]["name"],
            "to_color": gd.RARITIES[rule["produces"]]["color"],
            "need": rule["need"], "cost": rule["cost"], "have": have,
            "can_craft": have >= rule["need"] and user.balance >= rule["cost"],
        })
    return {"rules": result, "balance": user.balance}


@router.post("/craft")
def craft(payload: dict, user: Optional[User] = Depends(get_current_user_optional), db: Session = Depends(get_db)):
    if not user: raise HTTPException(status_code=401, detail="Not authorized")
    from_rarity = payload.get("from_rarity")
    if from_rarity not in gd.CRAFT_RULES: raise HTTPException(status_code=400, detail="Неверная редкость")
    rule = gd.CRAFT_RULES[from_rarity]
    items = db.query(Inventory).filter(
        Inventory.telegram_id == user.telegram_id,
        Inventory.rarity == from_rarity,
    ).order_by(Inventory.id).limit(rule["need"]).all()
    if len(items) < rule["need"]: raise HTTPException(status_code=400, detail=f"Нужно {rule['need']} номеров, есть {len(items)}")
    if user.balance < rule["cost"]: raise HTTPException(status_code=400, detail="Недостаточно средств для крафта")
    user.balance -= rule["cost"]
    for it in items: db.delete(it)
    new_rarity = rule["produces"]
    phone = gd.generate_phone(new_rarity, "RU", None)
    beauty = gd.calculate_beauty(phone["number"], phone["beauty_prefix"])
    price = gd.calc_price(new_rarity, beauty["total"])
    db.add(Inventory(
        telegram_id=user.telegram_id, number=phone["number"], rarity=new_rarity,
        price=price, multiplier=beauty["total"],
        beauty_json=json.dumps(beauty["components"], ensure_ascii=False),
        country_code=phone["country_code"], country_flag=phone["country_flag"],
        country_name=phone["country_name"], operator_code=phone["operator_code"],
        operator_name=phone["operator_name"],
        is_vip=_is_vip_number(phone["number"], beauty["total"]),
    ))
    db.flush()
    new_ach = _check_achievements(db, user)
    _update_quests(db, user, "crafts_1", 1)
    db.commit()
    return {
        "success": True,
        "new_phone": {
            "number": phone["number"], "rarity": new_rarity, "price": price,
            "multiplier": beauty["total"], "components": beauty["components"],
            "country_code": phone["country_code"], "country_flag": phone["country_flag"],
            "country_name": phone["country_name"], "operator_code": phone["operator_code"],
            "operator_name": phone["operator_name"],
            "is_vip": _is_vip_number(phone["number"], beauty["total"]),
        },
        "balance": user.balance, "new_achievements": new_ach,
    }


# ============================================================
# КВЕСТЫ
# ============================================================
@router.get("/quests")
def get_quests(user: Optional[User] = Depends(get_current_user_optional), db: Session = Depends(get_db)):
    if not user: raise HTTPException(status_code=401, detail="Not authorized")
    today = date.today().isoformat()
    quests = db.query(Quest).filter(
        Quest.telegram_id == user.telegram_id,
        Quest.date == today,
    ).all()
    if not quests:
        quests = _create_daily_quests(db, user, today)

    names = {
        "spins_5": {"name": "🎰 Прокрути 5 номеров", "desc": "Сделай 5 круток"},
        "sells_3": {"name": "💵 Продай 3 номера", "desc": "Продай любые 3 номера"},
        "crafts_1": {"name": "⚗️ Скрафти 1 номер", "desc": "Объедини 5 номеров в 1"},
    }

    result = []
    for q in quests:
        n = names.get(q.quest_type, {"name": q.quest_type, "desc": ""})
        result.append({
            "id": q.id,
            "type": q.quest_type,
            "name": n["name"],
            "desc": n["desc"],
            "progress": q.progress,
            "target": q.target,
            "reward": q.reward,
            "claimed": q.claimed,
            "can_claim": q.progress >= q.target and not q.claimed,
        })
    return {"quests": result, "date": today}


@router.post("/quests/{quest_id}/claim")
def claim_quest(quest_id: int, user: Optional[User] = Depends(get_current_user_optional), db: Session = Depends(get_db)):
    if not user: raise HTTPException(status_code=401, detail="Not authorized")
    q = db.query(Quest).filter(Quest.id == quest_id, Quest.telegram_id == user.telegram_id).first()
    if not q: raise HTTPException(status_code=404, detail="Квест не найден")
    if q.claimed: raise HTTPException(status_code=400, detail="Уже получен")
    if q.progress < q.target: raise HTTPException(status_code=400, detail="Не выполнен")
    q.claimed = True
    user.balance += q.reward
    db.commit()
    return {"success": True, "reward": q.reward, "balance": user.balance}


# ============================================================
# РЫНОК
# ============================================================
@router.get("/market")
def list_market(limit: int = 50, offset: int = 0, db: Session = Depends(get_db)):
    listings = db.query(MarketListing).filter(
        MarketListing.status == "active"
    ).order_by(desc(MarketListing.created_at)).offset(offset).limit(limit).all()
    result = []
    for l in listings:
        seller = db.query(User).filter(User.telegram_id == l.seller_id).first()
        result.append({
            "id": l.id, "number": l.number, "rarity": l.rarity,
            "multiplier": l.multiplier or 1.0,
            "country_flag": l.country_flag, "country_name": l.country_name,
            "operator_name": l.operator_name,
            "price": l.price,
            "seller_name": seller.first_name if seller else "Игрок",
            "seller_username": seller.username if seller else "",
            "created_at": l.created_at.isoformat() if l.created_at else None,
        })
    return {"listings": result, "total": len(result)}


@router.post("/market/list")
def list_on_market(payload: dict, user: Optional[User] = Depends(get_current_user_optional), db: Session = Depends(get_db)):
    if not user: raise HTTPException(status_code=401, detail="Not authorized")
    inv_id = payload.get("inv_id")
    price = int(payload.get("price") or 0)
    if not inv_id: raise HTTPException(status_code=400, detail="inv_id required")
    if price < 10: raise HTTPException(status_code=400, detail="Цена минимум 10 ₽")

    item = db.query(Inventory).filter(Inventory.id == inv_id, Inventory.telegram_id == user.telegram_id).first()
    if not item: raise HTTPException(status_code=404, detail="Номер не найден")

    # Уже выставлен?
    existing = db.query(MarketListing).filter(
        MarketListing.inv_id == inv_id,
        MarketListing.status == "active",
    ).first()
    if existing: raise HTTPException(status_code=400, detail="Уже выставлен")

    listing = MarketListing(
        seller_id=user.telegram_id, inv_id=inv_id,
        number=item.number, rarity=item.rarity, multiplier=item.multiplier,
        country_flag=item.country_flag, country_name=item.country_name,
        operator_name=item.operator_name, price=price,
    )
    db.add(listing)
    # Удаляем из инвентаря
    db.delete(item)
    db.commit()
    return {"success": True, "listing_id": listing.id}


@router.post("/market/buy/{listing_id}")
def buy_from_market(listing_id: int, user: Optional[User] = Depends(get_current_user_optional), db: Session = Depends(get_db)):
    if not user: raise HTTPException(status_code=401, detail="Not authorized")
    l = db.query(MarketListing).filter(MarketListing.id == listing_id, MarketListing.status == "active").first()
    if not l: raise HTTPException(status_code=404, detail="Объявление не найдено")
    if l.seller_id == user.telegram_id: raise HTTPException(status_code=400, detail="Нельзя купить свой номер")
    if user.balance < l.price: raise HTTPException(status_code=400, detail="Недостаточно средств")

    seller = db.query(User).filter(User.telegram_id == l.seller_id).first()
    if not seller: raise HTTPException(status_code=400, detail="Продавец не найден")

    # Комиссия 5%
    commission = int(l.price * 0.05)
    seller_gets = l.price - commission

    user.balance -= l.price
    seller.balance += seller_gets

    # Передаём номер покупателю
    db.add(Inventory(
        telegram_id=user.telegram_id, number=l.number, rarity=l.rarity,
        price=l.price, multiplier=l.multiplier or 1.0,
        country_code="", country_flag=l.country_flag,
        country_name=l.country_name, operator_code="",
        operator_name=l.operator_name,
        is_vip=_is_vip_number(l.number, l.multiplier or 1.0),
    ))
    l.status = "sold"
    l.buyer_id = user.telegram_id
    l.sold_at = datetime.utcnow()
    db.commit()
    return {"success": True, "balance": user.balance}


@router.post("/market/cancel/{listing_id}")
def cancel_listing(listing_id: int, user: Optional[User] = Depends(get_current_user_optional), db: Session = Depends(get_db)):
    if not user: raise HTTPException(status_code=401, detail="Not authorized")
    l = db.query(MarketListing).filter(MarketListing.id == listing_id, MarketListing.seller_id == user.telegram_id, MarketListing.status == "active").first()
    if not l: raise HTTPException(status_code=404, detail="Не найдено")

    # Возвращаем в инвентарь
    db.add(Inventory(
        telegram_id=user.telegram_id, number=l.number, rarity=l.rarity,
        price=l.price, multiplier=l.multiplier or 1.0,
        country_flag=l.country_flag, country_name=l.country_name,
        operator_name=l.operator_name,
        is_vip=_is_vip_number(l.number, l.multiplier or 1.0),
    ))
    l.status = "cancelled"
    db.commit()
    return {"success": True}


@router.get("/market/my")
def my_listings(user: Optional[User] = Depends(get_current_user_optional), db: Session = Depends(get_db)):
    if not user: raise HTTPException(status_code=401, detail="Not authorized")
    listings = db.query(MarketListing).filter(
        MarketListing.seller_id == user.telegram_id,
        MarketListing.status == "active",
    ).order_by(desc(MarketListing.created_at)).all()
    return {"listings": [{
        "id": l.id, "number": l.number, "rarity": l.rarity,
        "price": l.price, "country_flag": l.country_flag,
    } for l in listings]}


# ============================================================
# КОСТИ
# ============================================================
@router.get("/dice")
def list_dice(limit: int = 20, db: Session = Depends(get_db)):
    games = db.query(DiceGame).filter(DiceGame.status == "open").order_by(desc(DiceGame.created_at)).limit(limit).all()
    return {"games": [{
        "id": g.id, "creator_id": g.creator_id,
        "creator_name": g.creator_name, "bet": g.bet,
        "created_at": g.created_at.isoformat() if g.created_at else None,
    } for g in games]}


@router.post("/dice/create")
def create_dice(payload: dict, user: Optional[User] = Depends(get_current_user_optional), db: Session = Depends(get_db)):
    if not user: raise HTTPException(status_code=401, detail="Not authorized")
    bet = int(payload.get("bet") or 0)
    if bet < 100: raise HTTPException(status_code=400, detail="Минимальная ставка 100 ₽")
    if bet > user.balance: raise HTTPException(status_code=400, detail="Недостаточно средств")

    user.balance -= bet
    game = DiceGame(
        creator_id=user.telegram_id,
        creator_name=user.first_name or user.username or "Игрок",
        bet=bet,
    )
    db.add(game)
    db.commit()
    return {"success": True, "game_id": game.id, "balance": user.balance}


@router.post("/dice/join/{game_id}")
def join_dice(game_id: int, user: Optional[User] = Depends(get_current_user_optional), db: Session = Depends(get_db)):
    if not user: raise HTTPException(status_code=401, detail="Not authorized")
    g = db.query(DiceGame).filter(DiceGame.id == game_id, DiceGame.status == "open").first()
    if not g: raise HTTPException(status_code=404, detail="Игра не найдена")
    if g.creator_id == user.telegram_id: raise HTTPException(status_code=400, detail="Нельзя играть с собой")
    if user.balance < g.bet: raise HTTPException(status_code=400, detail="Недостаточно средств")

    user.balance -= g.bet
    d1 = random.randint(1, 6)
    d2 = random.randint(1, 6)
    g.opponent_id = user.telegram_id
    g.opponent_name = user.first_name or user.username or "Игрок"
    g.dice1 = d1
    g.dice2 = d2
    g.status = "finished"
    g.finished_at = datetime.utcnow()

    creator = db.query(User).filter(User.telegram_id == g.creator_id).first()

    if d1 > d2:
        # Победил создатель
        creator.balance += g.bet * 2
        g.winner_id = creator.telegram_id
        result = "creator"
    elif d2 > d1:
        # Победил присоединившийся
        user.balance += g.bet * 2
        g.winner_id = user.telegram_id
        result = "opponent"
    else:
        # Ничья — возврат
        creator.balance += g.bet
        user.balance += g.bet
        g.winner_id = None
        result = "draw"

    db.commit()
    return {
        "success": True, "result": result,
        "dice_creator": d1, "dice_opponent": d2,
        "balance": user.balance,
        "bet": g.bet,
    }


@router.post("/dice/cancel/{game_id}")
def cancel_dice(game_id: int, user: Optional[User] = Depends(get_current_user_optional), db: Session = Depends(get_db)):
    if not user: raise HTTPException(status_code=401, detail="Not authorized")
    g = db.query(DiceGame).filter(DiceGame.id == game_id, DiceGame.creator_id == user.telegram_id, DiceGame.status == "open").first()
    if not g: raise HTTPException(status_code=404, detail="Не найдена")
    user.balance += g.bet
    g.status = "cancelled"
    db.commit()
    return {"success": True, "balance": user.balance}


# ============================================================
# РЕФЕРАЛКА
# ============================================================
@router.get("/referrals")
def get_referrals(user: Optional[User] = Depends(get_current_user_optional), db: Session = Depends(get_db)):
    if not user: raise HTTPException(status_code=401, detail="Not authorized")
    rewards = db.query(ReferralReward).filter(ReferralReward.referrer_id == user.telegram_id).order_by(desc(ReferralReward.created_at)).limit(30).all()
    total_earned = sum(r.reward_referrer for r in rewards)
    return {
        "link": f"https://t.me/{(settings.WEBAPP_URL or '').split('/')[-1] or 'bot'}?start=ref_{user.telegram_id}",
        "count": len(rewards),
        "total_earned": total_earned,
        "rewards": [{
            "referred_id": r.referred_id,
            "reward": r.reward_referrer,
            "date": r.created_at.isoformat() if r.created_at else None,
        } for r in rewards],
    }


# ============================================================
# ЛИДЕРБОРД
# ============================================================
@router.get("/leaderboard")
def leaderboard(db: Session = Depends(get_db)):
    users = db.query(User).filter(User.is_banned == False).order_by(desc(User.balance)).limit(50).all()
    return {"balance": [{"tg_id": u.telegram_id, "name": u.first_name or u.username or "Игрок", "balance": u.balance, "spins": u.spins_total, "is_owner": u.is_owner} for u in users]}


@router.get("/leaderboard/spins")
def leaderboard_spins(db: Session = Depends(get_db)):
    users = db.query(User).filter(User.is_banned == False).order_by(desc(User.spins_total)).limit(50).all()
    return {"spins": [{"tg_id": u.telegram_id, "name": u.first_name or u.username or "Игрок", "balance": u.balance, "spins": u.spins_total, "is_owner": u.is_owner} for u in users]}


# ============================================================
# ОБМЕНЫ
# ============================================================
@router.post("/trade/find")
def trade_find(payload: dict, user: Optional[User] = Depends(get_current_user_optional), db: Session = Depends(get_db)):
    if not user: raise HTTPException(status_code=401, detail="Not authorized")
    username = (payload.get("username") or "").strip().lstrip("@")
    if not username: raise HTTPException(status_code=400, detail="Введите @username")
    target = db.query(User).filter(User.username == username).first()
    if not target: raise HTTPException(status_code=404, detail="Игрок не найден")
    if target.telegram_id == user.telegram_id: raise HTTPException(status_code=400, detail="Нельзя обменять с самим собой")
    if target.is_banned: raise HTTPException(status_code=400, detail="Игрок заблокирован")
    target_items = db.query(Inventory).filter(Inventory.telegram_id == target.telegram_id).order_by(desc(Inventory.created_at)).limit(30).all()
    return {
        "user": {"telegram_id": target.telegram_id, "first_name": target.first_name, "username": target.username},
        "items": [{"id": it.id, "number": it.number, "rarity": it.rarity, "price": it.price,
                   "multiplier": it.multiplier or 1.0, "country_flag": it.country_flag,
                   "operator_name": it.operator_name} for it in target_items],
    }


@router.post("/trade/create")
def trade_create(payload: dict, user: Optional[User] = Depends(get_current_user_optional), db: Session = Depends(get_db)):
    if not user: raise HTTPException(status_code=401, detail="Not authorized")
    to_username = (payload.get("to_username") or "").strip().lstrip("@")
    if not to_username: raise HTTPException(status_code=400, detail="Введите получателя")
    target = db.query(User).filter(User.username == to_username).first()
    if not target: raise HTTPException(status_code=404, detail="Игрок не найден")
    if target.telegram_id == user.telegram_id: raise HTTPException(status_code=400, detail="Нельзя обменять с самим собой")

    from_items = payload.get("from_items") or []
    to_items = payload.get("to_items") or []
    from_money = int(payload.get("from_money") or 0)
    to_money = int(payload.get("to_money") or 0)
    message = (payload.get("message") or "")[:256]

    if not from_items and not to_items and not from_money and not to_money:
        raise HTTPException(status_code=400, detail="Добавь номера или деньги")
    if from_items:
        my_owned = db.query(Inventory).filter(Inventory.telegram_id == user.telegram_id, Inventory.id.in_(from_items)).count()
        if my_owned != len(from_items): raise HTTPException(status_code=400, detail="Один из твоих номеров не найден")
    if to_items:
        his_owned = db.query(Inventory).filter(Inventory.telegram_id == target.telegram_id, Inventory.id.in_(to_items)).count()
        if his_owned != len(to_items): raise HTTPException(status_code=400, detail="Один из его номеров не найден")
    if from_money > user.balance: raise HTTPException(status_code=400, detail="Недостаточно денег")

    trade = Trade(
        from_tg_id=user.telegram_id, to_tg_id=target.telegram_id,
        from_items=json.dumps(from_items), to_items=json.dumps(to_items),
        from_money=from_money, to_money=to_money, message=message,
    )
    db.add(trade)
    db.commit()

    # Уведомление получателю
    try:
        from .bot import bot
        import asyncio
        if bot:
            text = f"🔄 <b>Новый обмен от {user.first_name or user.username}!</b>\n\nОткрой игру, чтобы посмотреть."
            asyncio.create_task(bot.send_message(target.telegram_id, text, parse_mode="HTML"))
    except Exception as e:
        print(f"Notify error: {e}")

    return {"success": True, "trade_id": trade.id}


@router.get("/trade/incoming")
def trade_incoming(user: Optional[User] = Depends(get_current_user_optional), db: Session = Depends(get_db)):
    if not user: raise HTTPException(status_code=401, detail="Not authorized")
    trades = db.query(Trade).filter(Trade.to_tg_id == user.telegram_id, Trade.status == "pending").order_by(desc(Trade.created_at)).all()
    result = []
    for t in trades:
        from_user = db.query(User).filter(User.telegram_id == t.from_tg_id).first()
        from_ids = json.loads(t.from_items or "[]")
        to_ids = json.loads(t.to_items or "[]")
        from_items = db.query(Inventory).filter(Inventory.id.in_(from_ids)).all() if from_ids else []
        to_items = db.query(Inventory).filter(Inventory.id.in_(to_ids)).all() if to_ids else []
        result.append({
            "id": t.id, "from_name": from_user.first_name if from_user else "Игрок",
            "from_username": from_user.username if from_user else "",
            "from_items": [{"number": it.number, "rarity": it.rarity, "price": it.price, "country_flag": it.country_flag} for it in from_items],
            "to_items": [{"number": it.number, "rarity": it.rarity, "price": it.price, "country_flag": it.country_flag} for it in to_items],
            "from_money": t.from_money, "to_money": t.to_money,
            "message": t.message, "created_at": t.created_at.isoformat(),
        })
    return {"trades": result}


@router.get("/trade/outgoing")
def trade_outgoing(user: Optional[User] = Depends(get_current_user_optional), db: Session = Depends(get_db)):
    if not user: raise HTTPException(status_code=401, detail="Not authorized")
    trades = db.query(Trade).filter(Trade.from_tg_id == user.telegram_id, Trade.status == "pending").order_by(desc(Trade.created_at)).all()
    result = []
    for t in trades:
        to_user = db.query(User).filter(User.telegram_id == t.to_tg_id).first()
        result.append({
            "id": t.id, "to_name": to_user.first_name if to_user else "Игрок",
            "to_username": to_user.username if to_user else "",
            "from_money": t.from_money, "to_money": t.to_money,
        })
    return {"trades": result}


@router.post("/trade/{trade_id}/respond")
def trade_respond(trade_id: int, payload: dict, user: Optional[User] = Depends(get_current_user_optional), db: Session = Depends(get_db)):
    if not user: raise HTTPException(status_code=401, detail="Not authorized")
    action = payload.get("action")
    if action not in ("accept", "decline"):
        raise HTTPException(status_code=400, detail="action must be accept or decline")
    trade = db.query(Trade).filter(Trade.id == trade_id, Trade.to_tg_id == user.telegram_id, Trade.status == "pending").first()
    if not trade: raise HTTPException(status_code=404, detail="Обмен не найден")

    if action == "decline":
        trade.status = "declined"
        trade.resolved_at = datetime.utcnow()
        db.commit()
        return {"success": True, "status": "declined"}

    from_user = db.query(User).filter(User.telegram_id == trade.from_tg_id).first()
    if not from_user: raise HTTPException(status_code=400, detail="Отправитель не найден")

    from_ids = json.loads(trade.from_items or "[]")
    to_ids = json.loads(trade.to_items or "[]")
    from_items = db.query(Inventory).filter(Inventory.id.in_(from_ids)).all() if from_ids else []
    to_items = db.query(Inventory).filter(Inventory.id.in_(to_ids)).all() if to_ids else []

    if len(from_items) != len(from_ids): raise HTTPException(status_code=400, detail="Один из номеров отправителя уже продан")
    if len(to_items) != len(to_ids): raise HTTPException(status_code=400, detail="Один из твоих номеров уже продан")
    if trade.from_money > from_user.balance: raise HTTPException(status_code=400, detail="У отправителя недостаточно денег")
    if trade.to_money > user.balance: raise HTTPException(status_code=400, detail="У тебя недостаточно денег")

    for it in from_items: it.telegram_id = user.telegram_id
    for it in to_items: it.telegram_id = from_user.telegram_id
    if trade.from_money > 0:
        from_user.balance -= trade.from_money
        user.balance += trade.from_money
    if trade.to_money > 0:
        user.balance -= trade.to_money
        from_user.balance += trade.to_money

    trade.status = "accepted"
    trade.resolved_at = datetime.utcnow()
    db.commit()
    return {"success": True, "status": "accepted"}


@router.get("/stats")
def user_stats(user: Optional[User] = Depends(get_current_user_optional), db: Session = Depends(get_db)):
    if not user: raise HTTPException(status_code=401, detail="Not authorized")
    inv_count = db.query(Inventory).filter(Inventory.telegram_id == user.telegram_id).count()
    return {"balance": user.balance, "spins_total": user.spins_total, "inventory_count": inv_count}
