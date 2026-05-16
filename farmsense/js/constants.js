// ====================================================================
// FARMSENSE · Constants
// ====================================================================

const ROSS308 = {
  1: {bw:0.044, daily:13, cum:0.013, fcr:0.30, adg:30},
  7: {bw:0.192, daily:35, cum:0.154, fcr:0.80, adg:25},
  14:{bw:0.491, daily:67, cum:0.488, fcr:1.00, adg:56},
  21:{bw:0.943, daily:113, cum:1.130, fcr:1.20, adg:70},
  28:{bw:1.542, daily:159, cum:2.080, fcr:1.35, adg:80},
  30:{bw:1.738, daily:167, cum:2.407, fcr:1.39, adg:85},
  31:{bw:1.843, daily:171, cum:2.576, fcr:1.40, adg:89},
  32:{bw:1.953, daily:178, cum:2.755, fcr:1.41, adg:90},
  33:{bw:2.066, daily:181, cum:2.937, fcr:1.42, adg:92},
  34:{bw:2.181, daily:183, cum:3.120, fcr:1.43, adg:93},
  35:{bw:2.270, daily:187, cum:3.315, fcr:1.46, adg:89},
  36:{bw:2.380, daily:189, cum:3.504, fcr:1.47, adg:90},
  37:{bw:2.488, daily:190, cum:3.694, fcr:1.48, adg:91},
  38:{bw:2.599, daily:191, cum:3.885, fcr:1.50, adg:92},
  39:{bw:2.710, daily:192, cum:4.077, fcr:1.52, adg:92},
  40:{bw:2.814, daily:193, cum:4.270, fcr:1.53, adg:92},
  41:{bw:2.914, daily:194, cum:4.464, fcr:1.55, adg:91},
  42:{bw:3.000, daily:195, cum:4.659, fcr:1.56, adg:89},
};

const ENV_TABLE = [
  {ageMin:1,  ageMax:7,  label:'1–7 วัน',  set:30, range:'30–32', rh:'60–70', wind:'0.1–0.3', windMin:0.1, windMax:0.3, eff:'≈ ambient',           warn:'หนาว: กระจุกตัว · ร้อน: หอบ-กางปีก'},
  {ageMin:8,  ageMax:14, label:'8–14 วัน', set:27, range:'26–28', rh:'60–70', wind:'0.3–0.5', windMin:0.3, windMax:0.5, eff:'≈ ambient -1',        warn:'litter ชื้น/เหลว = ไข้/coccidiosis'},
  {ageMin:15, ageMax:21, label:'15–21 วัน',set:24, range:'22–25', rh:'60–70', wind:'0.5–1.5', windMin:0.5, windMax:1.5, eff:'ambient -2',          warn:'เริ่มใช้ตัวระบาย · แยกตัวออกจากศูนย์กลาง'},
  {ageMin:22, ageMax:28, label:'22–28 วัน',set:22, range:'20–23', rh:'55–70', wind:'1.5–2.0', windMin:1.5, windMax:2.0, eff:'ambient -4',          warn:'น้ำเพิ่ม 50%/สัปดาห์ · panting = ร้อน'},
  {ageMin:29, ageMax:32, label:'29–32 วัน',set:21, range:'19–22', rh:'55–65', wind:'2.0–2.5', windMin:2.0, windMax:2.5, eff:'ambient -7',          warn:'ammonia ขึ้นเร็ว · ต้องเร่ง min ventilation'},
  {ageMin:33, ageMax:38, label:'33–38 วัน',set:20, range:'18–21', rh:'55–65', wind:'2.5–3.0', windMin:2.5, windMax:3.0, eff:'ambient -10',         warn:'sudden death + ascites · ระวัง heat wave'},
  {ageMin:39, ageMax:50, label:'39+ วัน',  set:19, range:'18–21', rh:'55–65', wind:'2.5–3.0', windMin:2.5, windMax:3.0, eff:'ambient -10 ถึง -12', warn:'metabolic stress สูงสุด · พิจารณาจับ'},
];

// ====================================================================
// FARM STANDARD — the farm's own per-day criteria (from เกณฑ์.xlsx).
// This is the PRIMARY benchmark; Ross 308 (ROSS308) is kept as a
// secondary reference.
// ====================================================================

// Target house temperature (°C) by day of age — sheet "การระบายอากาศ+แพด".
const FARM_TEMP = {
  1:33, 2:32.7, 3:32.4, 4:32.1, 5:31.8, 6:31.5, 7:31.2, 8:30.9, 9:30.6, 10:30.3,
  11:30, 12:29.7, 13:29.4, 14:29.1, 15:28.8, 16:28.5, 17:28.2, 18:27.9, 19:27.6, 20:27.3,
  21:27, 22:26.7, 23:26.4, 24:26.1, 25:25.8, 26:25.5, 27:25.2, 28:24.9, 29:24.6, 30:24.3,
  31:24, 32:23.7, 33:23.4, 34:23.1, 35:22.8, 36:22.5, 37:22.2, 38:21.9, 39:21.6, 40:21.3,
  41:21, 42:19.7,
};

// Cooling-pad pump trigger temperature (°C) by day of age.
const FARM_PUMP = {
  1:36, 2:36, 3:35, 4:35.5, 5:35, 6:35, 7:34, 8:34, 9:34, 10:34,
  11:34, 12:32, 13:32, 14:32.5, 15:31, 16:31, 17:31, 18:31, 19:31, 20:31,
  21:31, 22:30.5, 23:30.5, 24:30.5, 25:30.5, 26:30.5, 27:30.5, 28:30.5, 29:30, 30:30,
  31:30, 32:30, 33:30, 34:30, 35:30, 36:29.5, 37:29.5, 38:29.5, 39:29.5, 40:29.5,
  41:29.5, 42:29.5,
};

// Target air-speed band (feet per minute) by day of age. [lo, hi].
const FARM_FPM = {
  1:[0,0], 2:[0,150], 3:[0,150], 4:[0,150], 5:[0,150], 6:[0,150],
  7:[50,150], 8:[50,150], 9:[50,150],
  10:[150,200], 11:[150,200], 12:[150,200], 13:[150,200],
  14:[200,250], 15:[200,250], 16:[200,250],
  17:[150,300], 18:[150,300], 19:[150,300], 20:[150,300],
  21:[300,400], 22:[300,400], 23:[300,400],
  24:[400,500], 25:[400,500], 26:[400,500],
  27:[500,600], 28:[500,600], 29:[500,600], 30:[500,600], 31:[500,600],
  32:[500,600], 33:[500,600], 34:[500,600],
  35:[600,650], 36:[600,650], 37:[600,650], 38:[600,650], 39:[600,650],
  40:[600,650], 41:[600,650], 42:[600,650],
};

// Target feed intake (grams/bird/day) by day of age — sheet
// "โปรแกรมการเดินอาหาร+แสง". This is the farm's controlled-feed program.
const FARM_FEED = {
  0:0, 1:14, 2:18, 3:21, 4:24, 5:27, 6:31, 7:34, 8:38, 9:42, 10:47,
  11:51, 12:56, 13:61, 14:66, 15:71, 16:76, 17:82, 18:87, 19:93, 20:98,
  21:104, 22:109, 23:115, 24:120, 25:125, 26:130, 27:135, 28:140, 29:145, 30:150,
  31:154, 32:159, 33:163, 34:167, 35:171, 36:175, 37:178, 38:182, 39:185, 40:188,
  41:192, 42:194, 43:197, 44:200, 45:202,
};

// Nipple water-flow rate standard (cc/min) by age band — sheet "อัตราการไหลของน้ำ".
const WATER_FLOW_STD = [
  {ageMin:0,  ageMax:6,  cc:40},
  {ageMin:7,  ageMax:13, cc:50},
  {ageMin:14, ageMax:20, cc:60},
  {ageMin:21, ageMax:27, cc:80},
  {ageMin:28, ageMax:99, cc:100},
];

// Light + feed-round program by age band — sheet "โปรแกรมการเดินอาหาร+แสง".
const LIGHT_PROGRAM = [
  {ageMin:0,  ageMax:7,  light:'24 ชม.',            hours:24, feedRounds:3},
  {ageMin:8,  ageMax:15, light:'เปิด 18 ชม · ปิด 6 ชม',  hours:18, feedRounds:3},
  {ageMin:16, ageMax:28, light:'เปิด 18 ชม · ปิด 6 ชม',  hours:18, feedRounds:4},
  {ageMin:29, ageMax:99, light:'เปิด 16 ชม · ปิด 8 ชม',  hours:16, feedRounds:5},
];

// Vaccination ages (days) — sheets "อายุ 7-14 วัน" / "อายุ 15-28 วัน".
const VACCINE_AGES = [10, 14, 18];

// ====================================================================
// MORTALITY ALERT THRESHOLDS
// dailyPct       — daily death rate ceiling (death_day / qty_rem).
// warnDailyPct   — yellow band: ≥ warnDailyPct AND < dailyPct.
// cumulativePct  — cumulative death-rate ceiling (pct_cum, expressed as a
//                  number not a fraction — pct_cum is already %, so 3 = 3%).
// warnCumulativePct — yellow band: ≥ warn AND < red.
// Tune in this single place; render-alerts.js + analyzers-alerts.js read it.
// ====================================================================
const MORTALITY_THRESHOLDS = {
  dailyPct: 0.001,        // 0.1 %  red
  warnDailyPct: 0.0007,   // 0.07 % yellow
  cumulativePct: 3.0,     // 3 %    red
  warnCumulativePct: 2.5, // 2.5 %  yellow
};

// ====================================================================
// DISEASE WATCH · likely diseases by chicken age (static reference).
// Used by Module 4 (Disease-by-Age) on the Alerts tab. Sources: standard
// broiler-disease references + vet field notes; treat as guidance, not
// diagnosis. Each entry lists ขอบเขตอายุ, โรคที่น่าจะเกิด, อาการเตือน,
// การป้องกัน/จัดการที่ควรทำเป็นกิจวัตรในช่วงนั้น.
// ====================================================================
const DISEASE_BY_AGE = [
  {
    ageMin: 1, ageMax: 7,
    label: '1–7 วัน · brooding',
    diseases: [
      { name: 'Yolk sac infection / Omphalitis', risk: 'high',
        signs: 'ตายช่วง 1-3 วันแรก · ท้องโต · สะดือไม่ปิด · ลูกไก่ pale อ่อนเพลีย' },
      { name: 'E.coli (early)', risk: 'med',
        signs: 'ตายกระจุก · ขนยุ่ง · กินอาหารน้อย' },
      { name: 'Aspergillosis (เชื้อรา)', risk: 'low',
        signs: 'หอบ · ตาบวม · ตายขึ้นเร็ว ถ้า bedding อับชื้น' },
    ],
    routine: 'ตรวจอุณหภูมิแม่อุ่น · ตรวจคุณภาพลูกไก่จาก hatchery · ตรวจ navel · brooding 32-33°C',
  },
  {
    ageMin: 8, ageMax: 14,
    label: '8–14 วัน · post-brooding',
    diseases: [
      { name: 'Coccidiosis (early)', risk: 'high',
        signs: 'อึเหลว/มีเลือด · ขนยุ่ง · ซึม · ตายเริ่ม Day 10-12' },
      { name: 'CRD / Mycoplasma', risk: 'med',
        signs: 'หายใจมีเสียง · จาม · ตาบวม · ตายแบบเรื้อรัง' },
      { name: 'IB (Infectious Bronchitis)', risk: 'med',
        signs: 'อาการทางเดินหายใจ · น้ำมูก · หอบ' },
    ],
    routine: 'ใช้ยาป้องกัน coccidia ใน feed · ตรวจ litter ไม่เปียก · เริ่มลด temp ตามอายุ',
  },
  {
    ageMin: 15, ageMax: 21,
    label: '15–21 วัน · grower start',
    diseases: [
      { name: 'Coccidiosis (peak)', risk: 'high',
        signs: 'spike mortality Day 18-22 · อึเลือด · pale comb · ตายตอนเช้า' },
      { name: 'IBD / Gumboro', risk: 'high',
        signs: 'ตายเฉียบพลัน · feathers ยุ่ง · ปีกตก · อึขาวเหลว · ตายขึ้นเร็วใน 24-48 ชม.' },
      { name: 'Newcastle (mild form)', risk: 'med',
        signs: 'หายใจลำบาก · ตาแฉะ · เดินเซ' },
    ],
    routine: 'ทำวัคซีน Gumboro/Newcastle ตามตาราง · ติดตาม FCR · ระวังหลังให้วัคซีน mortality bump',
  },
  {
    ageMin: 22, ageMax: 28,
    label: '22–28 วัน · grower',
    diseases: [
      { name: 'Necrotic Enteritis', risk: 'high',
        signs: 'ตายเฉียบพลัน · อึดำเหม็น · ลำไส้บวมเลือด (necropsy)' },
      { name: 'Newcastle', risk: 'med',
        signs: 'อาการประสาท · คอบิด · ตายเป็นกลุ่ม' },
      { name: 'Ascites (น้ำในช่องท้อง)', risk: 'med',
        signs: 'ท้องโต · นั่งหายใจหอบ · ผิวเขียวคล้ำ · เริ่มในไก่ตัวใหญ่' },
    ],
    routine: 'ตรวจคุณภาพอาหารโปรตีนสูง · ระบายอากาศเริ่มเข้มขึ้น · เริ่มเฝ้า panting',
  },
  {
    ageMin: 29, ageMax: 35,
    label: '29–35 วัน · finisher',
    diseases: [
      { name: 'Heat stress', risk: 'high',
        signs: 'หอบกางปีก · ดื่มน้ำเยอะ · ตายตอนเที่ยง-บ่าย · ตัวใหญ่ตายก่อน' },
      { name: 'Sudden Death Syndrome (SDS)', risk: 'high',
        signs: 'ตายฉับพลันท่านอนหงาย · ขาแข็ง · ตัวใหญ่ที่เติบโตเร็ว' },
      { name: 'Ascites (peak)', risk: 'med',
        signs: 'ท้องบวม · ขาเขียว · ตายช่วงเช้ามืด/หลังให้อาหาร' },
    ],
    routine: 'pump cooling pad ทำงานเต็มที่ · ลดอาหารช่วงเที่ยง · เพิ่ม nipple · ตรวจ FPM ตามเกณฑ์',
  },
  {
    ageMin: 36, ageMax: 99,
    label: '36+ วัน · pre-catch',
    diseases: [
      { name: 'Heat stress (รุนแรง)', risk: 'high',
        signs: 'ตายตอนบ่าย · มากในวันร้อนจัด · panting รุนแรง · กินอาหารตก' },
      { name: 'Leg disorders / Lameness', risk: 'med',
        signs: 'ขาเป๋ · เดินไม่ได้ · นั่งมาก · ตัวใหญ่ขาไม่รับ' },
      { name: 'Metabolic exhaustion', risk: 'med',
        signs: 'FCR แย่ลง · น้ำหนักเพิ่มช้า · ตายเฉียบพลันใต้ส่วนแน่น' },
    ],
    routine: 'พิจารณาเร่งจับถ้าน้ำหนักถึง target · ระวัง heat wave · ลดความหนาแน่นถ้าได้',
  },
];

function diseasesByAge(age) {
  if (age == null) return null;
  return DISEASE_BY_AGE.find(d => age >= d.ageMin && age <= d.ageMax) || null;
}

// Mixed-sex broiler body-weight standard (kg) by day of age — from the
// "คละเพศ" reference sheet in the farm's face-sheet file. Used as the
// PRIMARY weight benchmark; Ross 308 BW is kept as a secondary reference.
const MIXED_BW = {
  1:0.062,  2:0.081,  3:0.102,  4:0.125,  5:0.151,  6:0.181,  7:0.213,
  8:0.249,  9:0.288,  10:0.330, 11:0.376, 12:0.425, 13:0.477, 14:0.533,
  15:0.592, 16:0.655, 17:0.720, 18:0.789, 19:0.860, 20:0.935, 21:1.012,
  22:1.092, 23:1.174, 24:1.258, 25:1.345, 26:1.434, 27:1.524, 28:1.616,
  29:1.710, 30:1.805, 31:1.901, 32:1.999, 33:2.097, 34:2.196, 35:2.296,
  36:2.396, 37:2.496, 38:2.597, 39:2.697, 40:2.798, 41:2.898, 42:2.998,
  43:3.097, 44:3.197, 45:3.295, 46:3.393, 47:3.490, 48:3.586, 49:3.681,
  50:3.776,
};

const FARM_PALETTE = ['phiphat','pumwong','yungruay','farm4','farm5','farm6'];
const RANK_CLASS = ['r1','r2','r3','r3','r3','r3'];

const SHEET_KEYWORDS = ['ประมาณการไก่คงเหลือ', 'ประมาณการ', 'คงเหลือ', 'ไก่คงเหลือ'];

const COL_KEYWORDS = {
  house:           ['เล้า'],
  age:             ['อายุ'],
  sex:             ['เพศ'],
  source:          ['ที่มา'],
  qty_in:          ['ยอดไก่ลง', 'ยอดลง'],
  density:         ['ตัว/ตร', 'ตัว/ตรม', 'ตัวต่อตรม'],
  death_day:       ['ตายต่อวัน'],
  death_cum:       ['ตายสะสม'],
  pct_day:         ['%ตาย', 'ร้อยละตาย'],
  pct_cum:         ['%ตายสะสม', 'ร้อยละตายสะสม'],
  disabled:        ['ไก่พิการ', 'พิการ'],
  qty_rem:         ['ยอดไก่คงเหลือ', 'คงเหลือ'],
  feed_loaded_pct: ['อาหารลงสะสม', '%อาหารลง'],
  feed_pct:        ['%อาหารที่กิน', 'อาหารที่กินสะสม', 'อาหารกินสะสม'],
  // 'อาหาร' alone catches templates that label the daily-feed column plainly;
  // COL_EXCLUDE strips the %-feed columns and COL_NUMERIC skips the feed-brand
  // column (text like "PPF") so feed_day lands on the kg/day column.
  feed_day:        ['อาหาร/วัน', 'อาหารต่อวัน', 'อาหาร'],
  water:           ['น้ำ/ลิตร', 'น้ำ-ลิตร', 'น้ำ'],
  wt_age:          ['น.น.ตามอายุ', 'น้ำหนักตามอายุ', 'ตามอายุ'],
  wt_initial:      ['น้ำหนักลูกไก่', 'น.น แรกเข้า', 'น.น.แรกเข้า', 'น้ำหนักแรกเข้า'],
  catch_date:      ['กำหนดจับ'],
  wt_target:       ['น.น.วันจับ', 'น.น.จับ'],
  wt_actual:       ['น.น.จับจริง', 'น้ำหนักจับจริง'],
};

// Negative keywords: a header containing any of these is NOT matched for the field.
const COL_EXCLUDE = {
  feed_day: ['%', 'สะสม'],
  // 'น้ำ' must not grab the body-weight columns ("น้ำหนักลูกไก่", "น้ำหนักตามอายุ").
  water:    ['หนัก', 'น.น'],
};

// Fields whose mapped column must hold numeric data. Used to disambiguate
// columns that share a header (e.g. two columns both labelled "อาหาร" —
// one is the feed brand, the other the kg/day amount).
const COL_NUMERIC = [
  'qty_in', 'density', 'death_day', 'death_cum', 'pct_cum', 'disabled',
  'qty_rem', 'feed_loaded_pct', 'feed_pct', 'feed_day', 'water',
  'wt_age', 'wt_initial', 'wt_actual',
];
