from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from datetime import datetime, timedelta
from typing import Optional
import json

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
    }


@router.post("/promo/activate")
def activate_promo(payload: dict, user: Optional[User] = Depends(get_current_user_optional), db: Session = Depends(get_db)):
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
        used = db.query(PromoUse).filter(PromoUse.promocode_id == promo.id, PromoUse.telegram_id == user.telegram_id).first()
        if used:
            raise HTTPException(status_code=400, detail="Вы уже использовали этот промокод")
    user.balance += promo.amount
    promo.uses += 1
    db.add(PromoUse(promocode_id=promo.id, telegram_id=user.telegram_id))
    db.commit()
    return {"success": True, "amount": promo.amount, "balance": user.balance}


@router.post("/daily-bonus")
def daily_bonus(user: Optional[User] = Depends(get_current_user_optional), db: Session = Depends(get_db)):
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
            raise HTTPException(status_code=400, detail=f"Приходи через {h}ч {m}м {s}с")
    user.balance += bonus
    user.last_bonus_at = now
    db.commit()
    return {"success": True, "amount": bonus, "balance": user.balance}


@router.get("/daily-bonus/status")
def daily_bonus_status(user: Optional[User] = Depends(get_current_user_optional), db: Session = Depends(get_db)):
    if not user:
        raise HTTPException(status_code=401, detail="Not authorized")
    bonus = int(get_setting(db, "daily_bonus", "5000"))
    if not user.last_bonus_at:
        return {"available": True, "bonus": bonus, "seconds_left": 0}
    elapsed = datetime.utcnow() - user.last_bonus_at
    if elapsed >= timedelta(hours=24):
        return {"available": True, "bonus": bonus, "seconds_left": 0}
    remaining = timedelta(hours=24) - elapsed
    return {"available": False, "bonus": bonus, "seconds_left": int(remaining.total_seconds())}


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


@router.post("/spin")
def spin(payload: dict, user: Optional[User] = Depends(get_current_user_optional), db: Session = Depends(get_db)):
    if not user: raise HTTPException(status_code=401, detail="Not authorized")
    _check_maintenance(db)
    country_code = (payload.get("country") or "RU").upper()
    operator_code = payload.get("operator") or None
    min_rarity = payload.get("min_rarity") or "common"
    if min_rarity not in gd.RARITY_FILTERS: min_rarity = "common"
    cost = gd.SPIN_COSTS[min_rarity]
    if user.balance < cost: raise HTTPException(status_code=400, detail="Недостаточно средств")
    user.balance -= cost
    rarity = gd.pick_rarity(min_rarity)
    phone = gd.generate_phone(rarity, country_code, operator_code)
    price = gd.calc_price(rarity)
    db.add(SpinLog(telegram_id=user.telegram_id, rarity=rarity, number=phone["number"], price=price, cost=cost, country_code=phone["country_code"], operator_code=phone["operator_code"]))
    user.spins_total += 1
    db.flush()
    new_ach = _check_achievements(db, user)
    db.commit()
    return {
        "phone": {"number": phone["number"], "rarity": rarity, "price": price, "country_code": phone["country_code"], "country_flag": phone["country_flag"], "country_name": phone["country_name"], "operator_code": phone["operator_code"], "operator_name": phone["operator_name"]},
        "cost": cost, "balance": user.balance, "spins_total": user.spins_total, "new_achievements": new_ach,
    }


@router.post("/spin5")
def spin5(payload: dict, user: Optional[User] = Depends(get_current_user_optional), db: Session = Depends(get_db)):
    if not user: raise HTTPException(status_code=401, detail="Not authorized")
    _check_maintenance(db)
    country_code = (payload.get("country") or "RU").upper()
    operator_code = payload.get("operator") or None
    min_rarity = payload.get("min_rarity") or "common"
    if min_rarity not in gd.RARITY_FILTERS: min_rarity = "common"
    single_cost = gd.SPIN_COSTS[min_rarity]
    total_cost = single_cost * 5
    if user.balance < total_cost: raise HTTPException(status_code=400, detail="Недостаточно средств")
    user.balance -= total_cost
    phones = []
    for i in range(5):
        rarity = gd.pick_rarity(min_rarity)
        phone = gd.generate_phone(rarity, country_code, operator_code)
        price = gd.calc_price(rarity)
        phones.append({"number": phone["number"], "rarity": rarity, "price": price, "country_code": phone["country_code"], "country_flag": phone["country_flag"], "country_name": phone["country_name"], "operator_code": phone["operator_code"], "operator_name": phone["operator_name"]})
        db.add(SpinLog(telegram_id=user.telegram_id, rarity=rarity, number=phone["number"], price=price, cost=single_cost, country_code=phone["country_code"], operator_code=phone["operator_code"], is_multi=True))
    user.spins_total += 5
    db.flush()
    new_ach = _check_achievements(db, user)
    db.commit()
    return {"phones": phones, "cost": total_cost, "balance": user.balance, "spins_total": user.spins_total, "new_achievements": new_ach}


@router.get("/inventory")
def get_inventory(user: Optional[User] = Depends(get_current_user_optional), db: Session = Depends(get_db)):
    if not user: raise HTTPException(status_code=401, detail="Not authorized")
    items = db.query(Inventory).filter(Inventory.telegram_id == user.telegram_id).order_by(desc(Inventory.created_at)).all()
    return {"items": [{"id": it.id, "number": it.number, "rarity": it.rarity, "price": it.price, "country_code": it.country_code, "country_flag": it.country_flag, "country_name": it.country_name, "operator_code": it.operator_code, "operator_name": it.operator_name, "created_at": it.created_at.isoformat() if it.created_at else None} for it in items], "total": len(items)}


@router.post("/inventory/keep")
def keep_phone(payload: dict, user: Optional[User] = Depends(get_current_user_optional), db: Session = Depends(get_db)):
    if not user: raise HTTPException(status_code=401, detail="Not authorized")
    phones = payload.get("phones") or []
    if not isinstance(phones, list) or not phones: raise HTTPException(status_code=400, detail="phones required")
    added = 0
    for p in phones:
        if not p.get("number") or not p.get("rarity"): continue
        db.add(Inventory(telegram_id=user.telegram_id, number=str(p["number"]), rarity=str(p["rarity"]), price=int(p.get("price") or 0), country_code=str(p.get("country_code") or ""), country_flag=str(p.get("country_flag") or ""), country_name=str(p.get("country_name") or ""), operator_code=str(p.get("operator_code") or ""), operator_name=str(p.get("operator_name") or "")))
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
    db.commit()
    return {"success": True, "sold": len(items), "total": total, "balance": user.balance, "new_achievements": new_ach}


@router.post("/inventory/sell-all")
def sell_all(user: Optional[User] = Depends(get_current_user_optional), db: Session = Depends(get_db)):
    if not user: raise HTTPException(status_code=401, detail="Not authorized")
    items = db.query(Inventory).filter(Inventory.telegram_id == user.telegram_id).all()
    if not items: return {"success": True, "sold": 0, "total": 0, "balance": user.balance, "new_achievements": []}
    total = sum(it.price for it in items)
    for it in items: db.delete(it)
    user.balance += total
    db.flush()
    new_ach = _check_achievements(db, user)
    db.commit()
    return {"success": True, "sold": len(items), "total": total, "balance": user.balance, "new_achievements": new_ach}


@router.post("/sell-immediate")
def sell_immediate(payload: dict, user: Optional[User] = Depends(get_current_user_optional), db: Session = Depends(get_db)):
    if not user: raise HTTPException(status_code=401, detail="Not authorized")
    phones = payload.get("phones") or []
    if not isinstance(phones, list) or not phones: raise HTTPException(status_code=400, detail="phones required")
    total = sum(int(p.get("price") or 0) for p in phones)
    user.balance += total
    db.flush()
    new_ach = _check_achievements(db, user)
    db.commit()
    return {"success": True, "sold": len(phones), "total": total, "balance": user.balance, "new_achievements": new_ach}


@router.get("/achievements")
def list_achievements(user: Optional[User] = Depends(get_current_user_optional), db: Session = Depends(get_db)):
    if not user: raise HTTPException(status_code=401, detail="Not authorized")
    got = {a.code: a.got_at for a in db.query(Achievement).filter(Achievement.telegram_id == user.telegram_id).all()}
    return {"all": [{"code": k, "name": v["name"], "desc": v["desc"], "reward": v["reward"], "unlocked": k in got, "got_at": got[k].isoformat() if k in got else None} for k, v in gd.ACHIEVEMENTS.items()], "total_unlocked": len(got), "total": len(gd.ACHIEVEMENTS)}


@router.get("/craft")
def craft_info(user: Optional[User] = Depends(get_current_user_optional), db: Session = Depends(get_db)):
    if not user: raise HTTPException(status_code=401, detail="Not authorized")
    rows = db.query(Inventory.rarity, func.count(Inventory.id)).filter(Inventory.telegram_id == user.telegram_id).group_by(Inventory.rarity).all()
    counts = {r: c for r, c in rows}
    result = []
    for from_rarity, rule in gd.CRAFT_RULES.items():
        have = counts.get(from_rarity, 0)
        result.append({"from_rarity": from_rarity, "from_name": gd.RARITIES[from_rarity]["name"], "from_color": gd.RARITIES[from_rarity]["color"], "to_rarity": rule["produces"], "to_name": gd.RARITIES[rule["produces"]]["name"], "to_color": gd.RARITIES[rule["produces"]]["color"], "need": rule["need"], "cost": rule["cost"], "have": have, "can_craft": have >= rule["need"] and user.balance >= rule["cost"]})
    return {"rules": result, "balance": user.balance}


@router.post("/craft")
def craft(payload: dict, user: Optional[User] = Depends(get_current_user_optional), db: Session = Depends(get_db)):
    if not user: raise HTTPException(status_code=401, detail="Not authorized")
    from_rarity = payload.get("from_rarity")
    if from_rarity not in gd.CRAFT_RULES: raise HTTPException(status_code=400, detail="Неверная редкость")
    rule = gd.CRAFT_RULES[from_rarity]
    items = db.query(Inventory).filter(Inventory.telegram_id == user.telegram_id, Inventory.rarity == from_rarity).order_by(Inventory.id).limit(rule["need"]).all()
    if len(items) < rule["need"]: raise HTTPException(status_code=400, detail=f"Нужно {rule['need']} номеров, есть {len(items)}")
    if user.balance < rule["cost"]: raise HTTPException(status_code=400, detail="Недостаточно средств для крафта")
    user.balance -= rule["cost"]
    for it in items: db.delete(it)
    new_rarity = rule["produces"]
    phone = gd.generate_phone(new_rarity, "RU", None)
    price = gd.calc_price(new_rarity)
    db.add(Inventory(telegram_id=user.telegram_id, number=phone["number"], rarity=new_rarity, price=price, country_code=phone["country_code"], country_flag=phone["country_flag"], country_name=phone["country_name"], operator_code=phone["operator_code"], operator_name=phone["operator_name"]))
    db.flush()
    new_ach = _check_achievements(db, user)
    db.commit()
    return {"success": True, "new_phone": {"number": phone["number"], "rarity": new_rarity, "price": price, "country_code": phone["country_code"], "country_flag": phone["country_flag"], "country_name": phone["country_name"], "operator_code": phone["operator_code"], "operator_name": phone["operator_name"]}, "balance": user.balance, "new_achievements": new_ach}


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
        "items": [{"id": it.id, "number": it.number, "rarity": it.rarity, "price": it.price, "country_flag": it.country_flag, "operator_name": it.operator_name} for it in target_items],
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
        from_tg_id=user.telegram_id,
        to_tg_id=target.telegram_id,
        from_items=json.dumps(from_items),
        to_items=json.dumps(to_items),
        from_money=from_money,
        to_money=to_money,
        message=message,
    )
    db.add(trade)
    db.commit()
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
            "id": t.id,
            "from_name": from_user.first_name if from_user else "Игрок",
            "from_username": from_user.username if from_user else "",
            "from_items": [{"number": it.number, "rarity": it.rarity, "price": it.price, "country_flag": it.country_flag} for it in from_items],
            "to_items": [{"number": it.number, "rarity": it.rarity, "price": it.price, "country_flag": it.country_flag} for it in to_items],
            "from_money": t.from_money,
            "to_money": t.to_money,
            "message": t.message,
            "created_at": t.created_at.isoformat(),
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
            "id": t.id,
            "to_name": to_user.first_name if to_user else "Игрок",
            "to_username": to_user.username if to_user else "",
            "from_money": t.from_money,
            "to_money": t.to_money,
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
