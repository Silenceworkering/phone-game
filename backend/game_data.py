"""
Игровые данные: редкости, страны, операторы.
Один источник правды — всё на сервере.
"""
import random
from typing import Optional, Dict, Any


# ============ РЕДКОСТИ ============
RARITIES = {
    "common": {
        "key": "common",
        "name": "Обычный",
        "color": "#8e8e93",
        "weight": 55,
        "base_price": 350,
        "desc": "Обычный номер. Начало коллекции.",
    },
    "rare": {
        "key": "rare",
        "name": "Редкий",
        "color": "#34c759",
        "weight": 26,
        "base_price": 1250,
        "desc": "Редкий номер! Уже интересно.",
    },
    "epic": {
        "key": "epic",
        "name": "Эпический",
        "color": "#bf5af2",
        "weight": 13,
        "base_price": 3500,
        "desc": "Эпический номер! Впечатляет.",
    },
    "mythic": {
        "key": "mythic",
        "name": "Мифический",
        "color": "#ff375f",
        "weight": 5,
        "base_price": 25000,
        "desc": "Мифический номер! Таких единицы.",
    },
    "legendary": {
        "key": "legendary",
        "name": "Легендарный",
        "color": "#ffd60a",
        "weight": 1,
        "base_price": 80000,
        "desc": "ЛЕГЕНДАРНЫЙ! Невероятная удача!",
    },
    "secret": {
        "key": "secret",
        "name": "СЕКРЕТНЫЙ",
        "color": "#00e5ff",
        "weight": 0.15,
        "base_price": 500000,
        "desc": "🤫 СЕКРЕТ! Ты нашёл невозможное...",
    },
}

RARITY_ORDER = ["common", "rare", "epic", "mythic", "legendary", "secret"]
RARITY_FILTERS = ["common", "rare", "epic", "mythic", "legendary"]

# Стоимость крутки в зависимости от выбранной минимальной редкости
SPIN_COSTS = {
    "common": 350,
    "rare": 1250,
    "epic": 3500,
    "mythic": 25000,
    "legendary": 80000,
}


# ============ СТРАНЫ И ОПЕРАТОРЫ ============
COUNTRIES = [
    {
        "code": "RU",
        "flag": "🇷🇺",
        "name": "Россия",
        "dial": "+7",
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
    """Форматирует номер в зависимости от страны."""
    d = lambda: str(random.randint(0, 9))
    code = country["code"]

    if code == "RU":
        return f"+7 ({prefix}) {d()}{d()}{d()}-{d()}{d()}-{d()}{d()}"
    if code == "US":
        return f"+1 ({prefix}) {d()}{d()}{d()}-{d()}{d()}{d()}{d()}"
    if code == "GB":
        return f"+44 {prefix} {d()}{d()}{d()} {d()}{d()}{d()}"
    if code == "DE":
        return f"+49 {prefix} {d()}{d()}{d()}{d()}{d()}{d()}{d()}"
    if code == "FR":
        return f"+33 {prefix} {d()}{d()} {d()}{d()} {d()}{d()} {d()}{d()}"
    if code == "JP":
        return f"+81 {prefix}-{d()}{d()}{d()}{d()}-{d()}{d()}{d()}{d()}"
    if code == "KR":
        return f"+82 {prefix}-{d()}{d()}{d()}{d()}-{d()}{d()}{d()}{d()}"
    if code == "CN":
        return f"+86 {prefix} {d()}{d()}{d()}{d()} {d()}{d()}{d()}{d()}"
    if code == "AE":
        return f"+971 {prefix} {d()}{d()}{d()} {d()}{d()}{d()}{d()}"
    if code == "BR":
        return f"+55 ({prefix}) 9{d()}{d()}{d()}{d()}-{d()}{d()}{d()}{d()}"
    return f"+{prefix} {d()}{d()}{d()}{d()}{d()}{d()}"


def get_country(code: str) -> Optional[dict]:
    for c in COUNTRIES:
        if c["code"] == code:
            return c
    return COUNTRIES[0] if COUNTRIES else None


def pick_rarity(min_rarity: str = "common") -> str:
    """
    Выбирает редкость с учётом минимальной.
    Если min_rarity='rare' — common не выпадет никогда.
    Если min_rarity='common' — могут выпасть все, включая secret.
    """
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
    """Любая редкость (для фоновых номеров в ленте)."""
    return pick_rarity("common")


def generate_phone(rarity: str, country_code: str, operator_code: Optional[str] = None) -> Dict[str, Any]:
    """
    Генерирует номер.
    - rarity: 'common', 'rare', ...
    - country_code: 'RU', 'US', ...
    - operator_code: если None — любой оператор страны
    """
    country = get_country(country_code)
    if not country:
        country = COUNTRIES[0]

    # Выбор оператора
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
    """Считает цену номера с отклонением ±25%."""
    base = RARITIES[rarity]["base_price"]
    variance = 0.75 + random.random() * 0.5  # 0.75 .. 1.25
    return int(round(base * variance / 10) * 10)


def get_full_rarity_list():
    """Возвращает список редкостей для фронта (без весов и цен)."""
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
    """Возвращает страны с операторами (без шаблонов генерации)."""
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
    """Стоимости крутки по редкостям."""
    return dict(SPIN_COSTS)
