"""
Игровые данные: редкости, страны, операторы.
Один источник правды — всё на сервере.
"""
import random
from typing import Optional, Dict, Any


# ============ РЕДКОСТИ ============
# Веса уменьшены для редких редкостей — теперь их сложнее выбить
RARITIES = {
    "common": {
        "key": "common",
        "name": "Обычный",
        "color": "#8e8e93",
        "weight": 68,          # было 55 — стало легче выбить обычные
        "base_price": 250,     # было 350 — цена номера снижена
        "desc": "Обычный номер. Начало коллекции.",
    },
    "rare": {
        "key": "rare",
        "name": "Редкий",
        "color": "#34c759",
        "weight": 20,          # было 26
        "base_price": 1100,
        "desc": "Редкий номер! Уже интересно.",
    },
    "epic": {
        "key": "epic",
        "name": "Эпический",
        "color": "#bf5af2",
        "weight": 8.5,         # было 13
        "base_price": 3200,
        "desc": "Эпический номер! Впечатляет.",
    },
    "mythic": {
        "key": "mythic",
        "name": "Мифический",
        "color": "#ff375f",
        "weight": 2.8,         # было 5
        "base_price": 22000,
        "desc": "Мифический номер! Таких единицы.",
    },
    "legendary": {
        "key": "legendary",
        "name": "Легендарный",
        "color": "#ffd60a",
        "weight": 0.6,         # было 1
        "base_price": 75000,
        "desc": "ЛЕГЕНДАРНЫЙ! Невероятная удача!",
    },
    "secret": {
        "key": "secret",
        "name": "СЕКРЕТНЫЙ",
        "color": "#00e5ff",
        "weight": 0.1,         # было 0.15 — вообще редкость
        "base_price": 450000,
        "desc": "🤫 СЕКРЕТ! Ты нашёл невозможное...",
    },
}

RARITY_ORDER = ["common", "rare", "epic", "mythic", "legendary", "secret"]
RARITY_FILTERS = ["common", "rare", "epic", "mythic", "legendary"]

# Цены крутки увеличены
SPIN_COSTS = {
    "common": 500,        # было 350
    "rare": 1800,         # было 1250
    "epic": 5500,         # было 3500
    "mythic": 35000,      # было 25000
    "legendary": 110000,  # было 80000
}


# ============ СТРАНЫ И ОПЕРАТОРЫ ============
COUNTRIES = [
    {
        "code": "RU", "flag": "🇷🇺", "name": "Россия", "dial": "+7",
        "operators": [
            {"name": "МТС", "code": "MTS", "prefixes": ["910", "911", "912", "913", "914", "915", "916", "917", "918", "919"]},
            {"name": "МегаФон", "code": "MGF", "prefixes": ["920", "921", "922", "923", "924", "925", "926", "927", "928", "929"]},
            {"name": "Билайн", "code": "BEEL", "prefixes": ["903", "905", "906", "909", "960", "961", "962", "963", "964", "965"]},
            {"name": "Т2", "code": "T2", "prefixes": ["900", "901", "902", "904", "908", "950", "951", "952", "953", "958"]},
            {"name": "Yota", "code": "YOTA", "prefixes": ["999", "998"]},
        ],
    },
    {
        "code": "US", "flag": "🇺🇸", "name": "США", "dial": "+1",
        "operators": [
            {"name": "AT&T", "code": "ATT", "prefixes": ["212", "213", "310", "415", "646", "917"]},
            {"name": "Verizon", "code": "VZ", "prefixes": ["201", "202", "305", "312", "702", "786"]},
            {"name": "T-Mobile", "code": "TMO", "prefixes": ["206", "214", "404", "469", "617", "818"]},
            {"name": "Sprint", "code": "SPR", "prefixes": ["312", "510", "703", "904"]},
        ],
    },
    {
        "code": "GB", "flag": "🇬🇧", "name": "Великобритания", "dial": "+44",
        "operators": [
            {"name": "EE", "code": "EE", "prefixes": ["7700", "7701", "7702"]},
            {"name": "O2", "code": "O2", "prefixes": ["7704", "7705", "7706"]},
            {"name": "Vodafone", "code": "VOD", "prefixes": ["7708", "7709", "7710"]},
            {"name": "Three", "code": "THR", "prefixes": ["7712", "7713", "7714"]},
        ],
    },
    {
        "code": "DE", "flag": "🇩🇪", "name": "Германия", "dial": "+49",
        "operators": [
            {"name": "Telekom", "code": "DT", "prefixes": ["151", "160", "170", "171"]},
            {"name": "Vodafone", "code": "VF", "prefixes": ["152", "162", "172", "173"]},
            {"name": "O2", "code": "O2", "prefixes": ["153", "163", "174", "175"]},
            {"name": "1&1", "code": "1N1", "prefixes": ["154", "164", "176", "177"]},
        ],
    },
    {
        "code": "FR", "flag": "🇫🇷", "name": "Франция", "dial": "+33",
        "operators": [
            {"name": "Orange", "code": "ORG", "prefixes": ["6", "7"]},
            {"name": "SFR", "code": "SFR", "prefixes": ["6", "7"]},
            {"name": "Bouygues", "code": "BYG", "prefixes": ["6", "7"]},
            {"name": "Free", "code": "FRE", "prefixes": ["6", "7"]},
        ],
    },
    {
        "code": "JP", "flag": "🇯🇵", "name": "Япония", "dial": "+81",
        "operators": [
            {"name": "NTT Docomo", "code": "DCM", "prefixes": ["90", "80", "70"]},
            {"name": "au", "code": "AU", "prefixes": ["90", "80", "70"]},
            {"name": "SoftBank", "code": "SB", "prefixes": ["90", "80", "70"]},
            {"name": "Rakuten", "code": "RKT", "prefixes": ["90", "80", "70"]},
        ],
    },
    {
        "code": "KR", "flag": "🇰🇷", "name": "Южная Корея", "dial": "+82",
        "operators": [
            {"name": "SK Telecom", "code": "SKT", "prefixes": ["10", "11"]},
            {"name": "KT", "code": "KT", "prefixes": ["10", "11"]},
            {"name": "LG U+", "code": "LGU", "prefixes": ["10", "11"]},
        ],
    },
    {
        "code": "CN", "flag": "🇨🇳", "name": "Китай", "dial": "+86",
        "operators": [
            {"name": "China Mobile", "code": "CM", "prefixes": ["138", "139", "150", "151", "152"]},
            {"name": "China Unicom", "code": "CU", "prefixes": ["130", "131", "132", "155", "156"]},
            {"name": "China Telecom", "code": "CT", "prefixes": ["133", "153", "180", "181", "189"]},
        ],
    },
    {
        "code": "AE", "flag": "🇦🇪", "name": "ОАЭ", "dial": "+971",
        "operators": [
            {"name": "Etisalat", "code": "ETS", "prefixes": ["50", "56", "54"]},
            {"name": "du", "code": "DU", "prefixes": ["55", "52", "58"]},
        ],
    },
    {
        "code": "BR", "flag": "🇧🇷", "name": "Бразилия", "dial": "+55",
        "operators": [
            {"name": "Vivo", "code": "VIVO", "prefixes": ["11", "21", "31", "41", "51"]},
            {"name": "Claro", "code": "CLR", "prefixes": ["11", "21", "31", "41", "51"]},
            {"name": "TIM", "code": "TIM", "prefixes": ["11", "21", "31", "41", "51"]},
        ],
    },
]


# ============ ГЕНЕРАЦИЯ НОМЕРОВ ============
def _format_phone(country: dict, prefix: str) -> str:
    d = lambda: str(random.randint(0, 9))
    code = country["code"]
    if code == "RU": return f"+7 ({prefix}) {d()}{d()}{d()}-{d()}{d()}-{d()}{d()}"
    if code == "US": return f"+1 ({prefix}) {d()}{d()}{d()}-{d()}{d()}{d()}{d()}"
    if code == "GB": return f"+44 {prefix} {d()}{d()}{d()} {d()}{d()}{d()}"
    if code == "DE": return f"+49 {prefix} {d()}{d()}{d()}{d()}{d()}{d()}{d()}"
    if code == "FR": return f"+33 {prefix} {d()}{d()} {d()}{d()} {d()}{d()} {d()}{d()}"
    if code == "JP": return f"+81 {prefix}-{d()}{d()}{d()}{d()}-{d()}{d()}{d()}{d()}"
    if code == "KR": return f"+82 {prefix}-{d()}{d()}{d()}{d()}-{d()}{d()}{d()}{d()}"
    if code == "CN": return f"+86 {prefix} {d()}{d()}{d()}{d()} {d()}{d()}{d()}{d()}"
    if code == "AE": return f"+971 {prefix} {d()}{d()}{d()} {d()}{d()}{d()}{d()}"
    if code == "BR": return f"+55 ({prefix}) 9{d()}{d()}{d()}{d()}-{d()}{d()}{d()}{d()}"
    return f"+{prefix} {d()}{d()}{d()}{d()}{d()}{d()}"


def get_country(code: str) -> Optional[dict]:
    for c in COUNTRIES:
        if c["code"] == code:
            return c
    return COUNTRIES[0] if COUNTRIES else None


def pick_rarity(min_rarity: str = "common") -> str:
    if min_rarity not in RARITY_ORDER:
        min_rarity = "common"
    min_idx = RARITY_ORDER.index(min_rarity)
    pool = RARITY_ORDER[min_idx:]
    total = sum(RARITIES[k]["weight"] for k in pool)
    roll = random.uniform(0, total)
    for k in pool:
        roll -= RARITIES[k]["weight"]
        if roll <= 0:
            return k
    return pool[0]


def pick_rarity_any() -> str:
    return pick_rarity("common")


def generate_phone(rarity: str, country_code: str, operator_code: Optional[str] = None) -> Dict[str, Any]:
    country = get_country(country_code)
    if not country:
        country = COUNTRIES[0]
    ops = country["operators"]
    if operator_code:
        op = next((o for o in ops if o["code"] == operator_code), None)
        if not op:
            op = random.choice(ops)
    else:
        op = random.choice(ops)
    prefix = random.choice(op["prefixes"])
    number = _format_phone(country, prefix)
    return {
        "rarity": rarity,
        "country_code": country["code"],
        "country_flag": country["flag"],
        "country_name": country["name"],
        "operator_code": op["code"],
        "operator_name": op["name"],
        "number": number,
    }


def calc_price(rarity: str) -> int:
    base = RARITIES[rarity]["base_price"]
    variance = 0.75 + random.random() * 0.5
    return int(round(base * variance / 10) * 10)


def get_full_rarity_list():
    return [
        {
            "key": k,
            "name": RARITIES[k]["name"],
            "color": RARITIES[k]["color"],
            "desc": RARITIES[k]["desc"],
        }
        for k in RARITY_ORDER
    ]


def get_countries_for_frontend():
    return [
        {
            "code": c["code"],
            "flag": c["flag"],
            "name": c["name"],
            "dial": c["dial"],
            "operators": [
                {"name": o["name"], "code": o["code"]}
                for o in c["operators"]
            ],
        }
        for c in COUNTRIES
    ]


def get_spin_costs():
    return dict(SPIN_COSTS)


# ============ ДОСТИЖЕНИЯ ============
ACHIEVEMENTS = {
    "first_spin":       {"name": "🎰 Первый спин",         "desc": "Прокрутил первый раз",           "reward": 500},
    "spins_10":         {"name": "🎯 10 спинов",           "desc": "Прокрутил 10 раз",               "reward": 1000},
    "spins_100":        {"name": "🔥 100 спинов",          "desc": "Прокрутил 100 раз",              "reward": 5000},
    "spins_1000":       {"name": "💫 1000 спинов",         "desc": "Прокрутил 1000 раз",             "reward": 25000},
    "first_rare":       {"name": "🌿 Редкий номер",        "desc": "Первый редкий номер",            "reward": 500},
    "first_epic":       {"name": "💜 Эпический номер",     "desc": "Первый эпический номер",         "reward": 2000},
    "first_mythic":     {"name": "🔥 Мифический номер",    "desc": "Первый мифический номер",        "reward": 10000},
    "first_legendary":  {"name": "👑 Легендарный номер",   "desc": "Первый легендарный номер",       "reward": 50000},
    "first_secret":     {"name": "🤫 Секретный номер",     "desc": "Первый секретный номер",         "reward": 250000},
    "inv_10":           {"name": "📦 10 в коллекции",      "desc": "10 номеров в инвентаре",         "reward": 1000},
    "inv_50":           {"name": "📦 50 в коллекции",      "desc": "50 номеров в инвентаре",         "reward": 5000},
    "inv_100":          {"name": "📦 100 в коллекции",     "desc": "100 номеров в инвентаре",        "reward": 20000},
    "balance_100k":     {"name": "💰 100k",                "desc": "Баланс 100 000 ₽",               "reward": 10000},
    "balance_1m":       {"name": "💎 Миллионер",           "desc": "Баланс 1 000 000 ₽",             "reward": 100000},
    "all_countries":    {"name": "🌍 Все страны",          "desc": "Номера всех 10 стран",           "reward": 50000},
}


# ============ КРАФТ ============
CRAFT_RULES = {
    "common":    {"need": 5,  "cost": 800,    "produces": "rare"},
    "rare":      {"need": 5,  "cost": 3000,   "produces": "epic"},
    "epic":      {"need": 5,  "cost": 8000,   "produces": "mythic"},
    "mythic":    {"need": 5,  "cost": 50000,  "produces": "legendary"},
    "legendary": {"need": 3,  "cost": 200000, "produces": "secret"},
}
