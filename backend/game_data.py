"""
Игровые данные: редкости, страны, операторы, красота номеров.
СБАЛАНСИРОВАННАЯ ЭКОНОМИКА + штрафы на топовые редкости.
"""
import random
from typing import Optional, Dict, Any, List, Tuple


# ============ РЕДКОСТИ ============
RARITIES = {
    "common":    {"key": "common",    "name": "Обычный",     "color": "#8e8e93", "weight": 70,   "base_price": 60,     "desc": "Обычный номер."},
    "rare":      {"key": "rare",      "name": "Редкий",      "color": "#34c759", "weight": 20,   "base_price": 350,    "desc": "Редкий номер!"},
    "epic":      {"key": "epic",      "name": "Эпический",   "color": "#bf5af2", "weight": 7,    "base_price": 1400,   "desc": "Эпический номер!"},
    "mythic":    {"key": "mythic",    "name": "Мифический",  "color": "#ff375f", "weight": 2.3,  "base_price": 7000,   "desc": "Мифический номер!"},
    "legendary": {"key": "legendary", "name": "Легендарный", "color": "#ffd60a", "weight": 0.6,  "base_price": 35000,  "desc": "ЛЕГЕНДАРНЫЙ!"},
    "secret":    {"key": "secret",    "name": "СЕКРЕТНЫЙ",   "color": "#00e5ff", "weight": 0.1,  "base_price": 200000, "desc": "🤫 СЕКРЕТ..."},
}

RARITY_ORDER = ["common", "rare", "epic", "mythic", "legendary", "secret"]
RARITY_FILTERS = ["common", "rare", "epic", "mythic"]

SPIN_COSTS = {
    "common": 500,
    "rare": 2000,
    "epic": 7000,
    "mythic": 25000,
}


# ============ СТРАНЫ ============
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


# ============ ВСПОМОГАТЕЛЬНЫЕ ============
def _digits_of(number: str) -> str:
    return "".join(c for c in number if c.isdigit())


def _max_repeat(d: str) -> int:
    if not d: return 0
    best = 1; cur = 1
    for i in range(1, len(d)):
        if d[i] == d[i - 1]:
            cur += 1
            if cur > best: best = cur
        else: cur = 1
    return best


def _max_same_digit(d: str) -> int:
    if not d: return 0
    counts = {}
    for c in d: counts[c] = counts.get(c, 0) + 1
    return max(counts.values())


def _is_palindrome(d: str) -> bool: return d == d[::-1]
def _is_mirror_6(d: str) -> bool: return len(d) == 6 and d[:3] == d[3:][::-1]

def _is_ascending(d: str) -> bool:
    if len(d) < 3: return False
    for i in range(1, len(d)):
        if int(d[i]) != int(d[i - 1]) + 1: return False
    return True

def _is_descending(d: str) -> bool:
    if len(d) < 3: return False
    for i in range(1, len(d)):
        if int(d[i]) != int(d[i - 1]) - 1: return False
    return True

def _all_even(d: str) -> bool: return len(d) > 0 and all(int(c) % 2 == 0 for c in d)
def _all_odd(d: str) -> bool: return len(d) > 0 and all(int(c) % 2 == 1 for c in d)

def _is_repeating_pair(d: str) -> bool:
    if len(d) < 4 or len(d) % 2 != 0: return False
    pair = d[:2]
    return d == pair * (len(d) // 2)

def _is_even_pairs(d: str) -> bool:
    if len(d) < 4 or len(d) % 2 != 0: return False
    for i in range(0, len(d), 2):
        if d[i] != d[i + 1]: return False
    return True

def _is_round(d: str) -> bool: return d.endswith("0000") or d.endswith("000")


# ============ ПРАВИЛА КРАСОТЫ ============
BEAUTY_DIGIT_RULES = [
    (lambda d: d == "777777", "Все семёрки", 150),
    (lambda d: len(d) == 7 and len(set(d)) == 1 and d[0] == "7", "Семь семёрок", 180),
    (lambda d: len(set(d)) == 1 and len(d) == 6, "Шесть одинаковых", 90),
    (lambda d: _max_repeat(d) == 5, "Пять подряд", 45),
    (lambda d: _max_same_digit(d) == 5, "Пять одинаковых", 30),
    (lambda d: _max_repeat(d) == 4, "Четыре подряд", 20),
    (lambda d: _max_same_digit(d) == 4, "Четыре одинаковых", 15),
    (lambda d: _max_repeat(d) == 3, "Три подряд", 6),
    (lambda d: _max_same_digit(d) == 3, "Три одинаковых", 5),
    (lambda d: _is_palindrome(d) and len(d) == 7, "Полное зеркало", 25),
    (lambda d: _is_mirror_6(d), "Симметрия", 18),
    (lambda d: len(d) == 6 and _is_palindrome(d), "Зеркало", 12),
    (lambda d: _is_ascending(d), "По возрастанию", 7),
    (lambda d: _is_descending(d), "По убыванию", 7),
    (lambda d: _is_repeating_pair(d), "Повтор пары", 6),
    (lambda d: _is_even_pairs(d), "Ровные пары", 2.5),
    (lambda d: _is_round(d), "Круглое", 2.5),
    (lambda d: _all_even(d), "Все чётные", 2),
    (lambda d: _all_odd(d), "Все нечётные", 2),
]


BEAUTY_PREFIX_RULES = {
    "777": ("Три семёрки", 20),
    "999": ("Три девятки", 15),
    "888": ("Три восьмёрки", 10),
    "666": ("Три шестёрки", 8),
    "000": ("Три нуля", 6),
    "007": ("Агент 007", 8),
    "404": ("Ошибка 404", 4),
    "808": ("Бит 808", 5),
    "111": ("Три единицы", 5),
    "555": ("Три пятёрки", 4),
    "333": ("Три тройки", 4),
    "222": ("Три двойки", 3),
    "444": ("Три четвёрки", 3),
    "123": ("Порядок 123", 3),
    "321": ("Обратный 321", 3),
    "101": ("Двоичный", 2.5),
    "202": ("Палиндром", 2.5),
    "303": ("Палиндром", 2.5),
    "505": ("Пятый", 2.5),
    "707": ("Семёрка", 2.5),
}


BEAUTY_SPECIAL_RULES = [
    (lambda d: "314159" in d, "Пи-номер", 25),
    (lambda d: "161803" in d, "Золотое сечение", 15),
    (lambda d: "2000" in d or "2024" in d or "2025" in d, "Миллениум", 3),
]


# ============ ФОРМАТИРОВАНИЕ ============
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
        if c["code"] == code: return c
    return COUNTRIES[0] if COUNTRIES else None


# ============ РЕДКОСТЬ ============
def pick_rarity(min_rarity: str = "common", luck_mult: float = 1.0) -> str:
    """
    Выбирает редкость с учётом:
    - min_rarity: минимальная редкость (common/rare/epic/mythic)
    - luck_mult: множитель удачи (×5 / ×25)
    - ШТРАФЫ на legendary/secret — при высоких мин. редкостях они выпадают реже
    """
    if min_rarity not in RARITY_ORDER:
        min_rarity = "common"
    min_idx = RARITY_ORDER.index(min_rarity)
    pool = RARITY_ORDER[min_idx:]

    # Штрафы: при mythic → legendary/secret почти не выпадают
    penalties = {
        "common":    {"legendary": 1.0,  "secret": 1.0},
        "rare":      {"legendary": 1.0,  "secret": 1.0},
        "epic":      {"legendary": 0.7,  "secret": 0.5},
        "mythic":    {"legendary": 0.15, "secret": 0.08},
    }
    penalty = penalties.get(min_rarity, {"legendary": 1.0, "secret": 1.0})

    weights = []
    for k in pool:
        w = RARITIES[k]["weight"]
        if luck_mult > 1.0 and k != "common":
            w *= luck_mult
        if k in penalty:
            w *= penalty[k]
        weights.append(w)

    total = sum(weights)
    roll = random.uniform(0, total)
    for k, w in zip(pool, weights):
        roll -= w
        if roll <= 0:
            return k
    return pool[0]


def pick_rarity_any() -> str:
    return pick_rarity("common")


def generate_phone(rarity: str, country_code: str, operator_code: Optional[str] = None) -> Dict[str, Any]:
    country = get_country(country_code) or COUNTRIES[0]
    ops = country["operators"]
    if operator_code:
        op = next((o for o in ops if o["code"] == operator_code), None) or random.choice(ops)
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
        "beauty_prefix": prefix,
    }


def calculate_beauty(number: str, beauty_prefix: str) -> Dict[str, Any]:
    digits = _digits_of(number)
    components: List[Dict[str, Any]] = []
    for condition, name, mult in BEAUTY_DIGIT_RULES:
        try:
            if condition(digits):
                components.append({"name": name, "mult": mult})
                break
        except Exception: pass
    if beauty_prefix in BEAUTY_PREFIX_RULES:
        name, mult = BEAUTY_PREFIX_RULES[beauty_prefix]
        components.append({"name": name, "mult": mult})
    for condition, name, mult in BEAUTY_SPECIAL_RULES:
        try:
            if condition(digits):
                components.append({"name": name, "mult": mult})
                break
        except Exception: pass
    total = sum(c["mult"] for c in components) if components else 1
    if total < 1: total = 1
    return {"total": total, "components": components}


def calc_price(rarity: str, beauty_total: float = 1.0) -> int:
    base = RARITIES[rarity]["base_price"]
    variance = 0.85 + random.random() * 0.3
    final = base * variance * beauty_total
    return int(round(final / 5) * 5)


def get_full_rarity_list():
    return [{"key": k, "name": RARITIES[k]["name"], "color": RARITIES[k]["color"], "desc": RARITIES[k]["desc"]} for k in RARITY_ORDER]


def get_countries_for_frontend():
    return [{"code": c["code"], "flag": c["flag"], "name": c["name"], "dial": c["dial"],
             "operators": [{"name": o["name"], "code": o["code"]} for o in c["operators"]]} for c in COUNTRIES]


def get_spin_costs(): return dict(SPIN_COSTS)


# ============ ДОСТИЖЕНИЯ ============
ACHIEVEMENTS = {
    "first_spin":       {"name": "🎰 Первый спин",         "desc": "Прокрутил первый раз",           "reward": 300},
    "spins_10":         {"name": "🎯 10 спинов",           "desc": "Прокрутил 10 раз",               "reward": 800},
    "spins_100":        {"name": "🔥 100 спинов",          "desc": "Прокрутил 100 раз",              "reward": 5000},
    "spins_1000":       {"name": "💫 1000 спинов",         "desc": "Прокрутил 1000 раз",             "reward": 25000},
    "first_rare":       {"name": "🌿 Редкий номер",        "desc": "Первый редкий номер",            "reward": 300},
    "first_epic":       {"name": "💜 Эпический номер",     "desc": "Первый эпический номер",         "reward": 1500},
    "first_mythic":     {"name": "🔥 Мифический номер",    "desc": "Первый мифический номер",        "reward": 8000},
    "first_legendary":  {"name": "👑 Легендарный номер",   "desc": "Первый легендарный номер",       "reward": 40000},
    "first_secret":     {"name": "🤫 Секретный номер",     "desc": "Первый секретный номер",         "reward": 200000},
    "inv_10":           {"name": "📦 10 в коллекции",      "desc": "10 номеров в инвентаре",         "reward": 800},
    "inv_50":           {"name": "📦 50 в коллекции",      "desc": "50 номеров в инвентаре",         "reward": 4000},
    "inv_100":          {"name": "📦 100 в коллекции",     "desc": "100 номеров в инвентаре",        "reward": 15000},
    "balance_100k":     {"name": "💰 100k",                "desc": "Баланс 100 000 ₽",               "reward": 10000},
    "balance_1m":       {"name": "💎 Миллионер",           "desc": "Баланс 1 000 000 ₽",             "reward": 100000},
    "all_countries":    {"name": "🌍 Все страны",          "desc": "Номера всех 10 стран",           "reward": 30000},
}


# ============ КРАФТ ============
CRAFT_RULES = {
    "common":    {"need": 5, "cost": 500,   "produces": "rare"},
    "rare":      {"need": 5, "cost": 2500,  "produces": "epic"},
    "epic":      {"need": 5, "cost": 8000,  "produces": "mythic"},
    "mythic":    {"need": 5, "cost": 35000, "produces": "legendary"},
    "legendary": {"need": 3, "cost": 120000,"produces": "secret"},
}
