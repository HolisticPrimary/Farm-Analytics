// ====================================================================
// FARMSENSE · Analyzers (diagnose, feed, profit, env)
// ====================================================================

// Wind chill calculation: simplified for poultry house
function windChill(ambient, windMs) {
  if (windMs < 0.1) return ambient;
  return ambient - (windMs * 3.4);
}

function diagnoseHouse(h) {
  const pct = h.pct_cum || 0;
  const src = h.source || '';
  const srcCount = src.split(',').filter(s => s.trim()).length;
  const density = h.density || 0;
  const dailyDeath = h.death_day || 0;

  const causes = [];
  const solutions = [];

  if (src.includes('ซันฟู้ด') || src.includes('Sunfood')) causes.push('ลูกไก่ซันฟู้ด (ตรวจสอบ supplier)');
  if (srcCount >= 4) causes.push('multi-source ' + srcCount + ' แหล่ง');
  if (density > 11.7) causes.push('density สูง (' + density.toFixed(1) + ')');
  if (dailyDeath > 100) causes.push('ตายวันนี้สูงผิดปกติ');
  if (dailyDeath > 150) causes.push('สงสัย incident (ไฟตก/heat shock)');

  let priority = 'WATCH';
  if (pct >= 4) priority = 'CRITICAL';
  else if (pct >= 3.3) priority = 'HIGH';

  if (causes.find(c => c.includes('ซันฟู้ด'))) {
    solutions.push('necropsy 5 ตัว + ส่งตัวอย่างเข้าแลป');
    solutions.push('ระงับ shipment ลูกไก่ shipment ถัดไป');
  }
  if (causes.find(c => c.includes('multi-source'))) {
    solutions.push('แยก dose ยาหากต่างอายุ + monitor weight uniformity');
  }
  if (causes.find(c => c.includes('density'))) {
    solutions.push('เพิ่มเครื่องระบาย + พิจารณาเร่งจับ 1-2 วัน');
  }
  if (causes.find(c => c.includes('incident'))) {
    solutions.push('ตรวจ power log + การให้น้ำ-อาหาร 24 ชม.ก่อน');
  }
  if (pct >= 4.5) {
    solutions.push('โทร vet วันนี้ + เร่งจับถ้าน.น.ถึง target');
  }

  if (causes.length === 0) {
    if (pct > 2.5) causes.push('ใกล้วันจับ - metabolic stress');
    else causes.push('ปกติ');
  }
  if (solutions.length === 0) {
    if (pct > 2.5) solutions.push('monitor temp + air flow ทุก 2 ชม.');
    else solutions.push('ดำเนินการตาม SOP ปกติ');
  }

  return { causes, solutions, priority };
}

function rossLookup(age) {
  if (age == null) return null;
  const exact = ROSS308[age];
  if (exact) return exact;
  const ages = Object.keys(ROSS308).map(Number).sort((a,b)=>a-b);
  let nearest = ages[0];
  for (const a of ages) {
    if (Math.abs(a - age) < Math.abs(nearest - age)) nearest = a;
  }
  return ROSS308[nearest];
}

// Look up a per-day farm-standard table (FARM_TEMP / FARM_FEED / etc).
// Clamps to the table's range; ages outside fall to the nearest day.
function farmDayLookup(table, age) {
  if (age == null) return null;
  if (table[age] != null) return table[age];
  const days = Object.keys(table).map(Number);
  const lo = Math.min(...days), hi = Math.max(...days);
  if (age <= lo) return table[lo];
  if (age >= hi) return table[hi];
  let nearest = lo, best = Infinity;
  for (const d of days) {
    const diff = Math.abs(d - age);
    if (diff < best) { best = diff; nearest = d; }
  }
  return table[nearest];
}
function farmFeedLookup(age) { return farmDayLookup(FARM_FEED, age); }
function farmTempLookup(age) { return farmDayLookup(FARM_TEMP, age); }
function farmPumpLookup(age) { return farmDayLookup(FARM_PUMP, age); }
function farmFpmLookup(age)  { return farmDayLookup(FARM_FPM, age); }
function mixedBwLookup(age)  { return farmDayLookup(MIXED_BW, age); }

// Three-zone feed status — "กินมาก / กินปกติ / กินน้อย".
// The earlier 5-zone scheme (CRITICAL/LOW/LIGHT/OK/OVERFEED) was too
// granular for the daily decision: operators wanted a single trinary
// readout. Tolerance band kept at ±5%.
function feedStatus(dev) {
  if (dev > 5)   return 'HIGH';     // กินมาก
  if (dev < -5)  return 'LOW';      // กินน้อย
  return 'NORMAL';                  // กินปกติ
}

// Compares actual g/bird/day against the FARM's own feed program (primary).
// Ross 308 intake is carried along as a secondary reference only.
function analyzeFeed(h) {
  if (!h.age || !h.feed_day || !h.qty_rem || h.feed_day === 0) return null;
  const feedPerBird = (h.feed_day * 1000) / h.qty_rem; // g/bird/day actual
  const stdFeed = farmFeedLookup(h.age);               // PRIMARY: farm program
  if (stdFeed == null || stdFeed === 0) return null;
  const dev = ((feedPerBird - stdFeed) / stdFeed) * 100;
  // SECONDARY reference: Ross 308 intake
  const ross = rossLookup(h.age);
  const rossFeed = ross ? ross.daily : null;
  const rossDev = rossFeed ? ((feedPerBird - rossFeed) / rossFeed) * 100 : null;
  return {
    feedPerBird, stdFeed, dev, status: feedStatus(dev), age: h.age,
    rossFeed, rossDev,
  };
}

function profitCalc(wt, fcr, prices) {
  return wt * prices.sale - prices.chick - (wt * fcr * prices.feed) - prices.opex;
}

function breakevenFCR(wt, prices) {
  return (wt * prices.sale - prices.chick - prices.opex) / (wt * prices.feed);
}

function classifyMortality(p) {
  if (p < 1.5) return 'l1';
  if (p < 2.5) return 'l2';
  if (p < 3.3) return 'l3';
  if (p < 4) return 'l4';
  return 'l5';
}

function farmAvgMortality(farm) {
  const totalIn = farm.houses.reduce((s, h) => s + (h.qty_in || 0), 0);
  const totalDead = farm.houses.reduce((s, h) => s + (h.death_cum || 0), 0);
  return totalIn > 0 ? (totalDead / totalIn) * 100 : 0;
}

function farmAvgAge(farm) {
  const ages = farm.houses.map(h => h.age).filter(a => a != null);
  return ages.length > 0 ? ages.reduce((s,a)=>s+a,0) / ages.length : 0;
}

// ========== GROUP A · health & growth analyzers ==========

// Water-to-feed ratio (liters water : kg feed). Broiler norm ≈ 1.5–2.4.
// The earliest daily health signal: a sudden rise means heat stress or
// scouring, a drop means birds aren't drinking (illness / equipment fault).
function waterFeedRatio(h) {
  if (!h.water || !h.feed_day || h.feed_day === 0) return null;
  const ratio = h.water / h.feed_day;
  let status, advice;
  if (ratio < 0.5 || ratio > 6) {
    status = 'BADDATA';
    advice = 'ค่าน้ำผิดปกติมาก — ตรวจสอบหน่วยข้อมูล (ลิตร?)';
  } else if (ratio < 1.5) {
    status = 'LOW';
    advice = 'ไก่ดื่มน้ำน้อย — เช็คหัวน้ำ/แรงดัน/อุณหภูมิ ไก่อาจเริ่มป่วย';
  } else if (ratio > 2.4) {
    status = 'HIGH';
    advice = 'น้ำสูงผิดปกติ — เช็ค heat stress / ท้องเสีย / น้ำรั่ว';
  } else {
    status = 'OK';
    advice = 'อยู่ในเกณฑ์ปกติ';
  }
  return { ratio, status, advice };
}

// Split the daily loss into culled (a proactive management decision) vs
// died (uncontrolled loss), and read the morning/evening timing pattern.
function mortalityBreakdown(h) {
  const parts = [h.m_died, h.m_culled, h.e_died, h.e_culled];
  if (parts.every(v => v == null)) return null;
  const md = h.m_died || 0, mc = h.m_culled || 0;
  const ed = h.e_died || 0, ec = h.e_culled || 0;
  const died    = md + ed;
  const culled  = mc + ec;
  const total   = died + culled;
  const morning = md + mc;
  const evening = ed + ec;
  const cullRate = total > 0 ? (culled / total) * 100 : 0;
  let pattern;
  if (evening > morning * 1.5)      pattern = 'HEAT';   // afternoon/evening heavy → heat stress
  else if (morning > evening * 1.5) pattern = 'NIGHT';  // morning heavy → cold / overnight problem
  else                              pattern = 'EVEN';
  return { died, culled, total, morning, evening, cullRate, pattern };
}

// Weight check — actual must exceed (initial chick weight × 4.5).
// This replaces the age-banded mixed-sex standard with a simpler
// growth-multiplier rule the farm has standardised on: at any weighing,
// the bird should already weigh at least 4.5× its placement weight.
// Falls back to 0.040 kg (40 g) initial when the file doesn't carry
// "น้ำหนักลูกไก่"/"น.น. แรกเข้า" — that's the industry default.
const WEIGHT_MULT_THRESHOLD = 4.5;
function weightVsStandard(h) {
  if (!h.wt_age) return null;
  const initial = (h.wt_initial && h.wt_initial > 0) ? h.wt_initial : 0.040;
  const threshold = initial * WEIGHT_MULT_THRESHOLD;
  const ratio = h.wt_age / initial;
  const status = h.wt_age >= threshold ? 'ABOVE' : 'BELOW';
  const devPct = ((h.wt_age - threshold) / threshold) * 100;
  return {
    actual: h.wt_age,
    initial,
    threshold,
    ratio,
    devPct,
    status,
    multiplier: WEIGHT_MULT_THRESHOLD,
  };
}

// Feed wastage: cumulative % loaded into the house minus % actually eaten.
// The gap is feed that never reached a bird (spillage, blocked lines, refusal).
function feedWaste(h) {
  if (h.feed_loaded_pct == null || h.feed_pct == null) return null;
  const gapPct = h.feed_loaded_pct - h.feed_pct;
  let status;
  if (gapPct > 1.0)      status = 'HIGH';
  else if (gapPct > 0.5) status = 'WATCH';
  else                   status = 'OK';
  return { loaded: h.feed_loaded_pct, eaten: h.feed_pct, gapPct, status };
}

// ========== SYNTHESIS · risk score, peers, vaccine window ==========

// Where the house's age sits relative to the farm's vaccination schedule.
function vaccineStatus(age) {
  if (age == null) return null;
  for (const vAge of VACCINE_AGES) {
    if (age === vAge)               return { age: vAge, phase: 'today' };
    if (age === vAge - 1)           return { age: vAge, phase: 'tomorrow' };
    if (age > vAge && age <= vAge + 2) return { age: vAge, phase: 'recent' };
  }
  return null;
}

// Compare a house to its peers in the SAME farm at a similar age (±2 days).
// Surfaces the outlier that a farm-wide average would hide.
function peerComparison(h, farmHouses) {
  if (h.age == null || !farmHouses || farmHouses.length < 3) return null;
  const peers = farmHouses.filter(p =>
    p !== h && p.age != null && Math.abs(p.age - h.age) <= 2 && p.pct_cum != null);
  if (peers.length < 2) return null;
  const pcts = peers.map(p => p.pct_cum).sort((a, b) => a - b);
  const peerMedian = pcts[Math.floor(pcts.length / 2)];
  const myPct = h.pct_cum || 0;
  const ratio = peerMedian > 0 ? myPct / peerMedian : (myPct > 0 ? 99 : 1);
  // "outlier" = meaningfully worse than peers, in both absolute and relative terms
  const isOutlier = myPct > peerMedian + 1.0 && ratio >= 1.4;
  return { peerCount: peers.length, peerMedian, myPct, ratio, isOutlier };
}

// Composite per-house risk score — synthesises every signal the system
// already computes into one ranked number plus the reasons behind it.
// Weights are a starting point and should be reviewed by a poultry vet.
function houseRiskScore(h, farmHouses) {
  const reasons = [];
  let score = 0;
  const add = (pts, reason) => { score += pts; reasons.push({ pts, reason }); };

  const pct = h.pct_cum || 0;
  if (pct >= 4)        add(40, `ตายสะสมวิกฤต ${pct.toFixed(1)}%`);
  else if (pct >= 3.3) add(25, `ตายสะสมสูง ${pct.toFixed(1)}%`);
  else if (pct >= 2.5) add(12, `ตายสะสมเริ่มสูง ${pct.toFixed(1)}%`);

  const dd = h.death_day || 0;
  if (dd > 150)      add(25, `ตายวันนี้สูงผิดปกติ ${dd} ตัว (สงสัย incident)`);
  else if (dd > 100) add(12, `ตายวันนี้สูง ${dd} ตัว`);

  const feed = analyzeFeed(h);
  if (feed) {
    if (feed.status === 'LOW' && feed.dev <= -20)     add(30, `กินน้อยกว่าเกณฑ์ ${feed.dev.toFixed(0)}% (เสี่ยงป่วย)`);
    else if (feed.status === 'LOW' && feed.dev <= -10) add(15, `กินน้อยกว่าเกณฑ์ ${feed.dev.toFixed(0)}%`);
    else if (feed.status === 'LOW')                    add(8,  `กินน้อยกว่าเกณฑ์ ${feed.dev.toFixed(0)}%`);
    else if (feed.status === 'HIGH')                   add(5,  `กินมากกว่าเกณฑ์ +${feed.dev.toFixed(0)}%`);
  }

  const wf = waterFeedRatio(h);
  if (wf) {
    if (wf.status === 'LOW')  add(20, `น้ำ:อาหารต่ำ (${wf.ratio.toFixed(2)}) — ไก่ดื่มน้ำน้อย`);
    if (wf.status === 'HIGH') add(15, `น้ำ:อาหารสูง (${wf.ratio.toFixed(2)}) — heat stress/ท้องเสีย`);
  }

  const bd = mortalityBreakdown(h);
  if (bd) {
    if (bd.pattern === 'HEAT')  add(12, 'ตายกระจุกตอนเย็น — heat stress');
    if (bd.pattern === 'NIGHT') add(8,  'ตายกระจุกตอนเช้า — หนาว/ปัญหากลางคืน');
  }

  const wv = weightVsStandard(h);
  if (wv && wv.status === 'BELOW') {
    // The "× 4.5" rule is a binary trip-wire — if it fires at all, the
    // bird is materially underweight, so the score lift is uniform.
    add(15, `น้ำหนักต่ำกว่าเกณฑ์ ${wv.ratio.toFixed(1)}× (ต่ำกว่า ${WEIGHT_MULT_THRESHOLD}× แรกเข้า)`);
  }

  if ((h.density || 0) > 11.7) add(8, `ความหนาแน่นสูง ${h.density.toFixed(1)} ตัว/ตร.ม.`);

  const peer = peerComparison(h, farmHouses);
  if (peer && peer.isOutlier) {
    add(15, `ตายสูงกว่าเล้าพี่น้องอายุใกล้กัน ${peer.ratio.toFixed(1)} เท่า`);
  }

  // Vaccination context — a recent vaccine can legitimately raise the daily
  // death count, so soften the score (but never erase a genuine problem).
  const vac = vaccineStatus(h.age);
  let vaccineNote = null;
  if (vac) {
    if (vac.phase === 'recent' && (dd > 50 || pct >= 2.5)) {
      score = Math.max(0, score - 8);
      vaccineNote = `เพิ่งทำวัคซีน (อายุ ${vac.age}) — mortality bump อาจปกติ`;
    } else if (vac.phase === 'today')    vaccineNote = `วันนี้ทำวัคซีน (อายุ ${vac.age})`;
    else if (vac.phase === 'tomorrow')   vaccineNote = `พรุ่งนี้ทำวัคซีน (อายุ ${vac.age})`;
    else if (vac.phase === 'recent')     vaccineNote = `เพิ่งทำวัคซีน (อายุ ${vac.age})`;
  }

  let level = 'OK';
  if (score >= 50)      level = 'CRITICAL';
  else if (score >= 25) level = 'HIGH';
  else if (score >= 10) level = 'WATCH';

  reasons.sort((a, b) => b.pts - a.pts);
  return { score, level, reasons, peer, vaccine: vac, vaccineNote };
}
