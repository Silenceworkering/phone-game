// ============ РЕДКОСТИ ============
export const RARITIES = {
  common:    { key:'common',    name:'Обычный',     color:'#8e8e93', weight:50, basePrice:80,     desc:'Обычный номер. Начало коллекции.' },
  rare:      { key:'rare',      name:'Редкий',      color:'#34c759', weight:25, basePrice:800,    desc:'Редкий номер! Уже интересно.' },
  epic:      { key:'epic',      name:'Эпический',   color:'#0a84ff', weight:14, basePrice:3500,   desc:'Эпический номер! Впечатляет.' },
  mythic:    { key:'mythic',    name:'Мифический',  color:'#bf5af2', weight:7,  basePrice:12000,  desc:'Мифический номер! Таких единицы.' },
  legendary: { key:'legendary', name:'Легендарный', color:'#ff9f0a', weight:3,  basePrice:45000,  desc:'ЛЕГЕНДАРНЫЙ! Невероятная удача!' },
  secret:    { key:'secret',    name:'СЕКРЕТНЫЙ',   color:'#ff375f', weight:1,  basePrice:250000, desc:'🤫 СЕКРЕТ! Ты нашёл невозможное...' }
};

export const RARITY_ORDER = ['common','rare','epic','mythic','legendary','secret'];

// Стоимость крутки в зависимости от минимальной редкости
export const SPIN_COSTS = {
  common:    500,
  rare:      2000,
  epic:      8000,
  mythic:    30000,
  legendary: 120000
};

// Доступные варианты "минимальная редкость" (для UI)
export const RARITY_FILTERS = ['common','rare','epic','mythic','legendary'];

// ============ СТРАНЫ И ОПЕРАТОРЫ ============
export const COUNTRIES = [
  {
    code:'RU', flag:'🇷🇺', name:'Россия', dial:'+7',
    operators:[
      { name:'МТС',     code:'MTS',  prefixes:['910','911','912','913','914','915','916','917','918','919'] },
      { name:'МегаФон', code:'MGF',  prefixes:['920','921','922','923','924','925','926','927','928','929'] },
      { name:'Билайн',  code:'BEEL', prefixes:['903','905','906','909','960','961','962','963','964','965'] },
      { name:'Т2',      code:'T2',   prefixes:['900','901','902','904','908','950','951','952','953','958'] },
      { name:'Yota',    code:'YOTA', prefixes:['999','998'] }
    ],
    format: p => { const d=()=>Math.floor(Math.random()*10); return `+7 (${p}) ${d()}${d()}${d()}-${d()}${d()}-${d()}${d()}`; }
  },
  {
    code:'US', flag:'🇺🇸', name:'США', dial:'+1',
    operators:[
      { name:'AT&T',     code:'ATT', prefixes:['212','213','310','415','646','917'] },
      { name:'Verizon',  code:'VZ',  prefixes:['201','202','305','312','702','786'] },
      { name:'T-Mobile', code:'TMO', prefixes:['206','214','404','469','617','818'] },
      { name:'Sprint',   code:'SPR', prefixes:['312','510','703','904'] }
    ],
    format: p => { const d=()=>Math.floor(Math.random()*10); return `+1 (${p}) ${d()}${d()}${d()}-${d()}${d()}${d()}${d()}`; }
  },
  {
    code:'GB', flag:'🇬🇧', name:'Великобритания', dial:'+44',
    operators:[
      { name:'EE',       code:'EE',  prefixes:['7700','7701','7702'] },
      { name:'O2',       code:'O2',  prefixes:['7704','7705','7706'] },
      { name:'Vodafone', code:'VOD', prefixes:['7708','7709','7710'] },
      { name:'Three',    code:'THR', prefixes:['7712','7713','7714'] }
    ],
    format: p => { const d=()=>Math.floor(Math.random()*10); return `+44 ${p} ${d()}${d()}${d()} ${d()}${d()}${d()}`; }
  },
  {
    code:'DE', flag:'🇩🇪', name:'Германия', dial:'+49',
    operators:[
      { name:'Telekom',  code:'DT',  prefixes:['151','160','170','171'] },
      { name:'Vodafone', code:'VF',  prefixes:['152','162','172','173'] },
      { name:'O2',       code:'O2',  prefixes:['153','163','174','175'] },
      { name:'1&1',      code:'1N1', prefixes:['154','164','176','177'] }
    ],
    format: p => { const d=()=>Math.floor(Math.random()*10); return `+49 ${p} ${d()}${d()}${d()}${d()}${d()}${d()}${d()}`; }
  },
  {
    code:'FR', flag:'🇫🇷', name:'Франция', dial:'+33',
    operators:[
      { name:'Orange',   code:'ORG', prefixes:['6','7'] },
      { name:'SFR',      code:'SFR', prefixes:['6','7'] },
      { name:'Bouygues', code:'BYG', prefixes:['6','7'] },
      { name:'Free',     code:'FRE', prefixes:['6','7'] }
    ],
    format: p => { const d=()=>Math.floor(Math.random()*10); return `+33 ${p} ${d()}${d()} ${d()}${d()} ${d()}${d()} ${d()}${d()}`; }
  },
  {
    code:'JP', flag:'🇯🇵', name:'Япония', dial:'+81',
    operators:[
      { name:'NTT Docomo', code:'DCM', prefixes:['90','80','70'] },
      { name:'au',         code:'AU',  prefixes:['90','80','70'] },
      { name:'SoftBank',   code:'SB',  prefixes:['90','80','70'] },
      { name:'Rakuten',    code:'RKT', prefixes:['90','80','70'] }
    ],
    format: p => { const d=()=>Math.floor(Math.random()*10); return `+81 ${p}-${d()}${d()}${d()}${d()}-${d()}${d()}${d()}${d()}`; }
  },
  {
    code:'KR', flag:'🇰🇷', name:'Южная Корея', dial:'+82',
    operators:[
      { name:'SK Telecom', code:'SKT', prefixes:['10','11'] },
      { name:'KT',         code:'KT',  prefixes:['10','11'] },
      { name:'LG U+',      code:'LGU', prefixes:['10','11'] }
    ],
    format: p => { const d=()=>Math.floor(Math.random()*10); return `+82 ${p}-${d()}${d()}${d()}${d()}-${d()}${d()}${d()}${d()}`; }
  },
  {
    code:'CN', flag:'🇨🇳', name:'Китай', dial:'+86',
    operators:[
      { name:'China Mobile',  code:'CM', prefixes:['138','139','150','151','152'] },
      { name:'China Unicom',  code:'CU', prefixes:['130','131','132','155','156'] },
      { name:'China Telecom', code:'CT', prefixes:['133','153','180','181','189'] }
    ],
    format: p => { const d=()=>Math.floor(Math.random()*10); return `+86 ${p} ${d()}${d()}${d()}${d()} ${d()}${d()}${d()}${d()}`; }
  },
  {
    code:'AE', flag:'🇦🇪', name:'ОАЭ', dial:'+971',
    operators:[
      { name:'Etisalat', code:'ETS', prefixes:['50','56','54'] },
      { name:'du',       code:'DU',  prefixes:['55','52','58'] }
    ],
    format: p => { const d=()=>Math.floor(Math.random()*10); return `+971 ${p} ${d()}${d()}${d()} ${d()}${d()}${d()}${d()}`; }
  },
  {
    code:'BR', flag:'🇧🇷', name:'Бразилия', dial:'+55',
    operators:[
      { name:'Vivo',  code:'VIVO', prefixes:['11','21','31','41','51'] },
      { name:'Claro', code:'CLR',  prefixes:['11','21','31','41','51'] },
      { name:'TIM',   code:'TIM',  prefixes:['11','21','31','41','51'] }
    ],
    format: p => { const d=()=>Math.floor(Math.random()*10); return `+55 (${p}) 9${d()}${d()}${d()}${d()}-${d()}${d()}${d()}${d()}`; }
  }
];
