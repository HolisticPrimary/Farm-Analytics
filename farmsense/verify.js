// ====================================================================
// FarmSense · independent calculation cross-check
//
//   SIDE A (PROGRAM)     — runs the real js/*.js code
//   SIDE B (INDEPENDENT) — re-reads the raw Excel cells and applies the
//                          formulas written fresh here, with column
//                          positions located independently of mapColumns.
//   Then diffs A vs B per house per metric. Any mismatch = a bug.
//
//   Run:  node verify.js
// ====================================================================
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const XLSX = require('xlsx');

// ---------- load SIDE A : the actual program ----------
const sandbox = { XLSX, console, Math, Object, String, Number, Array, JSON,
                  isNaN, parseFloat, parseInt, Date, RegExp };
vm.createContext(sandbox);
for (const f of ['js/constants.js', 'js/ui-helpers.js', 'js/analyzers.js', 'js/parser.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), sandbox, { filename: f });
}
const A = sandbox; // program functions

function programParse(buf, filename) {
  const wb = XLSX.read(buf, { type: 'buffer' });
  const sheetName = A.findSheet(wb);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: null });
  const headerIdx = A.findHeaderRow(rows);
  const sampleRows = rows.slice(headerIdx + 1, headerIdx + 9);
  const colMap = A.mapColumns(rows[headerIdx], rows[headerIdx + 1], sampleRows);
  Object.assign(colMap, A.mapDeathBreakdown(rows[headerIdx], rows[headerIdx + 1]));
  let dataStart = headerIdx + 1;
  const peek = (rows[dataStart] || [])[colMap.house];
  if (peek == null || (typeof peek === 'string' && !peek.match(/^\s*\d/))) dataStart++;
  const houses = [];
  for (let i = dataStart; i < rows.length; i++) {
    const row = rows[i] || [];
    const h = row[colMap.house];
    if (h == null || String(h).trim() === '' || String(h).includes('รวม')) {
      if (houses.length > 0) break; else continue;
    }
    const parsed = A.parseRowData(row, colMap);
    if (parsed.qty_in != null && parsed.qty_in > 0) houses.push(parsed);
  }
  return { rows, headerIdx, colMap, houses };
}

// ---------- SIDE B : independent reference ----------
// Ross 308 standard — published reference data (same source the app cites).
const ROSS = {
  1:{bw:0.044,daily:13}, 7:{bw:0.192,daily:35}, 14:{bw:0.491,daily:67},
  21:{bw:0.943,daily:113}, 28:{bw:1.542,daily:159}, 30:{bw:1.738,daily:167},
  31:{bw:1.843,daily:171}, 32:{bw:1.953,daily:178}, 33:{bw:2.066,daily:181},
  34:{bw:2.181,daily:183}, 35:{bw:2.270,daily:187}, 36:{bw:2.380,daily:189},
  37:{bw:2.488,daily:190}, 38:{bw:2.599,daily:191}, 39:{bw:2.710,daily:192},
  40:{bw:2.814,daily:193}, 41:{bw:2.914,daily:194}, 42:{bw:3.000,daily:195},
};
function rossNearest(age) {
  if (ROSS[age]) return ROSS[age];
  let best = null, bestD = 1e9;
  for (const k of Object.keys(ROSS)) {
    const d = Math.abs(+k - age);
    if (d < bestD) { bestD = d; best = ROSS[k]; }
  }
  return best;
}

// Farm feed program (g/bird/day) — the PRIMARY standard, from เกณฑ์.xlsx
// sheet "โปรแกรมการเดินอาหาร+แสง". Independent copy of the reference data.
const FARM_FEED_REF = {
  0:0, 1:14, 2:18, 3:21, 4:24, 5:27, 6:31, 7:34, 8:38, 9:42, 10:47,
  11:51, 12:56, 13:61, 14:66, 15:71, 16:76, 17:82, 18:87, 19:93, 20:98,
  21:104, 22:109, 23:115, 24:120, 25:125, 26:130, 27:135, 28:140, 29:145, 30:150,
  31:154, 32:159, 33:163, 34:167, 35:171, 36:175, 37:178, 38:182, 39:185, 40:188,
  41:192, 42:194, 43:197, 44:200, 45:202,
};
function farmFeedNearest(age) {
  if (FARM_FEED_REF[age] != null) return FARM_FEED_REF[age];
  if (age <= 0) return FARM_FEED_REF[0];
  if (age >= 45) return FARM_FEED_REF[45];
  let nearest = 0, bestD = 1e9;
  for (const k of Object.keys(FARM_FEED_REF)) {
    const d = Math.abs(+k - age);
    if (d < bestD) { bestD = d; nearest = +k; }
  }
  return FARM_FEED_REF[nearest];
}
function num(v) {                          // independent numeric parser
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v).replace(/[^\d.\-]/g, ''));
  return isNaN(n) ? null : n;
}
function firstInt(v) {                     // independent age parser ("36/35" -> 36)
  if (v == null) return null;
  if (typeof v === 'number') return Math.floor(v);
  const m = String(v).match(/(\d+)/);
  return m ? +m[1] : null;
}

// ---- independent status classifiers (fresh implementations) ----
function indFeedStatus(dev) {
  if (dev > 5)    return 'OVERFEED';
  if (dev >= -5)  return 'OK';
  if (dev >= -10) return 'LIGHT';
  if (dev >= -20) return 'LOW';
  return 'CRITICAL';
}
function indWaterStatus(ratio) {
  if (ratio < 0.5 || ratio > 6) return 'BADDATA';
  if (ratio < 1.5)              return 'LOW';
  if (ratio > 2.4)              return 'HIGH';
  return 'OK';
}
function indPattern(morning, evening) {
  if (evening > morning * 1.5)      return 'HEAT';
  if (morning > evening * 1.5)      return 'NIGHT';
  return 'EVEN';
}
function indVaccinePhase(age) {
  if (age == null) return null;
  for (const v of [10, 14, 18]) {
    if (age === v)                  return 'today';
    if (age === v - 1)              return 'tomorrow';
    if (age > v && age <= v + 2)    return 'recent';
  }
  return null;
}

// Independent re-implementation of the documented risk-score rules.
// Verifies the PROGRAM applies the rules correctly (the weights themselves
// are a domain judgement, but the arithmetic of applying them is testable).
function indRiskScore(b, indHouses) {
  let score = 0;
  const pct = b.pct_cum || 0;
  if (pct >= 4)        score += 40;
  else if (pct >= 3.3) score += 25;
  else if (pct >= 2.5) score += 12;

  const dd = b.death_day || 0;
  if (dd > 150)      score += 25;
  else if (dd > 100) score += 12;

  if (b.age && b.feed_day && b.qty_rem) {
    const fpb = b.feed_day * 1000 / b.qty_rem;
    const std = farmFeedNearest(b.age);
    if (std) {
      const st = indFeedStatus((fpb - std) / std * 100);
      if (st === 'CRITICAL')      score += 30;
      else if (st === 'LOW')      score += 15;
      else if (st === 'OVERFEED') score += 5;
    }
  }
  if (b.water && b.feed_day) {
    const st = indWaterStatus(b.water / b.feed_day);
    if (st === 'LOW')  score += 20;
    if (st === 'HIGH') score += 15;
  }
  if ([b.m_died, b.m_culled, b.e_died, b.e_culled].some(v => v != null)) {
    const morning = (b.m_died || 0) + (b.m_culled || 0);
    const evening = (b.e_died || 0) + (b.e_culled || 0);
    const pat = indPattern(morning, evening);
    if (pat === 'HEAT')  score += 12;
    if (pat === 'NIGHT') score += 8;
  }
  if (b.age && b.wt_age) {
    const stdBw = rossNearest(b.age).bw;
    const dev = (b.wt_age - stdBw) / stdBw * 100;
    if (dev < -10)     score += 15;
    else if (dev < -5) score += 8;
  }
  if ((b.density || 0) > 11.7) score += 8;

  // peer outlier
  if (b.age != null && indHouses.length >= 3) {
    const peers = indHouses.filter(x => x !== b && x.age != null &&
      Math.abs(x.age - b.age) <= 2 && x.pct_cum != null);
    if (peers.length >= 2) {
      const srt = peers.map(x => x.pct_cum).sort((a, c) => a - c);
      const med = srt[Math.floor(srt.length / 2)];
      const ratio = med > 0 ? pct / med : (pct > 0 ? 99 : 1);
      if (pct > med + 1.0 && ratio >= 1.4) score += 15;
    }
  }
  // vaccine softening
  const vp = indVaccinePhase(b.age);
  if (vp === 'recent' && (dd > 50 || pct >= 2.5)) score = Math.max(0, score - 8);

  let level = 'OK';
  if (score >= 50)      level = 'CRITICAL';
  else if (score >= 25) level = 'HIGH';
  else if (score >= 10) level = 'WATCH';
  return { score, level };
}

// Locate columns independently: scan the header row myself, no mapColumns.
function independentColumns(rows, headerIdx) {
  const hdr = rows[headerIdx].map(c => String(c == null ? '' : c).trim());
  const sub = (rows[headerIdx + 1] || []).map(c => String(c == null ? '' : c).trim());
  const find = pred => { for (let c = 0; c < hdr.length; c++) if (pred(hdr[c], sub[c], c)) return c; return -1; };
  const col = {};
  col.house   = find(h => h === 'เล้า' || h.includes('เล้า'));
  col.age     = find(h => h === 'อายุ');
  col.qty_in  = find(h => h.includes('ยอดไก่ลง'));
  col.density = find(h => h.includes('ตัว/ตร'));
  col.deathDay= find(h => h === 'ตายต่อวัน');
  col.deathCum= find(h => h.includes('ตายสะสม'));
  col.pctCum  = find(h => h.includes('%ตายสะสม'));
  col.qtyRem  = find(h => h.includes('ยอดไก่คงเหลือ'));
  // morning/evening blocks — two independent layouts:
  //  (1) merged spanning header "ตายต่อวันเช้า/เย็น" over two columns
  const mIdx = find(h => h.includes('ตายต่อวันเช้า'));
  const eIdx = find(h => h.includes('ตายต่อวันเย็น'));
  if (mIdx >= 0) { col.mDied = mIdx; col.mCulled = mIdx + 1; }
  if (eIdx >= 0) { col.eDied = eIdx; col.eCulled = eIdx + 1; }
  //  (2) four explicit columns ไก่ตายเช้า/ไก่คัดเช้า/ไก่ตายเย็น/ไก่คัดเย็น
  //      ("เข้า" is a misspelling of "เช้า" seen in some files)
  for (let c = 0; c < hdr.length; c++) {
    const h = hdr[c].replace(/\s/g, '');
    const morning = h.includes('เช้า') || h.includes('เข้า');
    const evening = h.includes('เย็น');
    if (!morning && !evening) continue;
    if (h.includes('ตาย')) {
      if (morning && col.mDied == null) col.mDied = c;
      if (evening && col.eDied == null) col.eDied = c;
    } else if (h.includes('คัด')) {
      if (morning && col.mCulled == null) col.mCulled = c;
      if (evening && col.eCulled == null) col.eCulled = c;
    }
  }
  // two "อาหาร" columns: brand (text) then kg/day (number) — pick the numeric one
  const feedCols = [];
  for (let c = 0; c < hdr.length; c++)
    if ((hdr[c] === 'อาหาร' || hdr[c].includes('อาหาร/วัน')) && !hdr[c].includes('%') && !hdr[c].includes('สะสม'))
      feedCols.push(c);
  col.feedDay = feedCols.find(c => {
    for (let r = headerIdx + 2; r < Math.min(headerIdx + 8, rows.length); r++)
      if (typeof (rows[r] || [])[c] === 'number') return true;
    return false;
  });
  col.feedLoaded = find(h => h.includes('อาหารลงสะสม'));
  col.feedEaten  = find(h => h.includes('อาหารที่กินสะสม'));
  col.water = find(h => (h === 'น้ำ' || h.includes('น้ำ/ลิตร')) && !h.includes('หนัก'));
  col.wtAge = find(h => h.includes('ตามอายุ'));
  return col;
}

// ---------- compare ----------
const dir = path.join(__dirname, '..');
// Only the daily face-sheet files — skip standards/equipment workbooks.
const files = fs.readdirSync(dir).filter(f => f.endsWith('.xlsx') && f.includes('ใบหน้าเล้า'));
let mismatches = 0, checks = 0;
const EPS = 0.02; // tolerance for floating point / rounding

function cmp(label, house, a, b, eps = EPS) {
  checks++;
  if (a == null && b == null) return;
  if (a == null || b == null) {
    if (a == null && b == null) return;
    // one side null — only a problem if the other has a real value
    if ((a == null) !== (b == null)) {
      console.log(`  ✗ [${house}] ${label}: program=${a} independent=${b}  (one side missing)`);
      mismatches++;
    }
    return;
  }
  if (Math.abs(a - b) > eps) {
    console.log(`  ✗ [${house}] ${label}: program=${a} independent=${b}  Δ=${(a-b).toFixed(4)}`);
    mismatches++;
  }
}

for (const fn of files) {
  console.log('\n' + '='.repeat(70));
  console.log('FILE:', fn);
  const buf = fs.readFileSync(path.join(dir, fn));
  const prog = programParse(buf, fn);
  const col = independentColumns(prog.rows, prog.headerIdx);

  // independent house extraction (own column map, own parsers)
  let dataStart = prog.headerIdx + 1;
  const peek = (prog.rows[dataStart] || [])[col.house];
  if (peek == null || (typeof peek === 'string' && !peek.match(/^\s*\d/))) dataStart++;
  const indHouses = [];
  for (let i = dataStart; i < prog.rows.length; i++) {
    const row = prog.rows[i] || [];
    const hv = row[col.house];
    if (hv == null || String(hv).trim() === '' || String(hv).includes('รวม')) {
      if (indHouses.length > 0) break; else continue;
    }
    const qi = num(row[col.qty_in]);
    if (qi == null || qi <= 0) continue;
    indHouses.push({
      house: hv, age: firstInt(row[col.age]), qty_in: qi,
      density: num(row[col.density]), death_day: num(row[col.deathDay]),
      death_cum: num(row[col.deathCum]), pct_cum: num(row[col.pctCum]),
      qty_rem: num(row[col.qtyRem]),
      m_died: num(row[col.mDied]), m_culled: num(row[col.mCulled]),
      e_died: num(row[col.eDied]), e_culled: num(row[col.eCulled]),
      feed_day: col.feedDay != null ? num(row[col.feedDay]) : null,
      feed_loaded: num(row[col.feedLoaded]), feed_eaten: num(row[col.feedEaten]),
      water: num(row[col.water]), wt_age: num(row[col.wtAge]),
    });
  }

  console.log(`  houses: program=${prog.houses.length}  independent=${indHouses.length}`);
  if (prog.houses.length !== indHouses.length) { console.log('  ✗ house count mismatch!'); mismatches++; }

  const n = Math.min(prog.houses.length, indHouses.length);
  for (let i = 0; i < n; i++) {
    const p = prog.houses[i];   // program parsed
    const b = indHouses[i];     // independent parsed
    const hid = String(b.house);

    // --- 1. raw field parsing ---
    cmp('qty_in', hid, p.qty_in, b.qty_in);
    cmp('qty_rem', hid, p.qty_rem, b.qty_rem);
    cmp('death_cum', hid, p.death_cum, b.death_cum);
    cmp('death_day', hid, p.death_day, b.death_day);
    cmp('age', hid, p.age, b.age);
    cmp('feed_day', hid, p.feed_day, b.feed_day);
    cmp('water', hid, p.water, b.water);
    cmp('wt_age', hid, p.wt_age, b.wt_age);

    // --- 2. derived: feed analysis (PRIMARY = farm program, SECONDARY = Ross) ---
    const pa = A.analyzeFeed(p);
    if (b.age && b.feed_day && b.qty_rem) {
      const fpb = b.feed_day * 1000 / b.qty_rem;
      const farmStd = farmFeedNearest(b.age);
      const dev = (fpb - farmStd) / farmStd * 100;
      const rossStd = rossNearest(b.age).daily;
      const rossDev = (fpb - rossStd) / rossStd * 100;
      cmp('feedPerBird', hid, pa ? pa.feedPerBird : null, fpb, 0.05);
      cmp('feedStd(farm)', hid, pa ? pa.stdFeed : null, farmStd, 0.001);
      cmp('feedDev%',    hid, pa ? pa.dev : null, dev, 0.05);
      cmp('rossDev%',    hid, pa ? pa.rossDev : null, rossDev, 0.05);
    }

    // --- 3. derived: water:feed ratio ---
    const pw = A.waterFeedRatio(p);
    if (b.water && b.feed_day) {
      cmp('waterRatio', hid, pw ? pw.ratio : null, b.water / b.feed_day, 0.005);
    }

    // --- 4. derived: cull/death breakdown ---
    const pbk = A.mortalityBreakdown(p);
    if ([b.m_died, b.m_culled, b.e_died, b.e_culled].some(v => v != null)) {
      const died = (b.m_died||0) + (b.e_died||0);
      const culled = (b.m_culled||0) + (b.e_culled||0);
      cmp('died',   hid, pbk ? pbk.died : null, died);
      cmp('culled', hid, pbk ? pbk.culled : null, culled);
      cmp('cullRate%', hid, pbk ? pbk.cullRate : null,
          (died + culled) > 0 ? culled / (died + culled) * 100 : 0, 0.05);
    }

    // --- 5. derived: weight vs Ross 308 ---
    const pwv = A.weightVsStandard(p);
    if (b.age && b.wt_age) {
      const stdBw = rossNearest(b.age).bw;
      cmp('weightDev%', hid, pwv ? pwv.devPct : null, (b.wt_age - stdBw) / stdBw * 100, 0.05);
    }

    // --- 6. derived: feed waste gap ---
    const pfw = A.feedWaste(p);
    if (b.feed_loaded != null && b.feed_eaten != null) {
      cmp('feedGap%', hid, pfw ? pfw.gapPct : null, b.feed_loaded - b.feed_eaten, 0.005);
    }

    // --- 6b. vaccine window (independent: age vs [10,14,18]) ---
    const VAC = [10, 14, 18];
    let indVacPhase = null;
    if (b.age != null) {
      for (const v of VAC) {
        if (b.age === v)                       { indVacPhase = 'today';    break; }
        if (b.age === v - 1)                   { indVacPhase = 'tomorrow'; break; }
        if (b.age > v && b.age <= v + 2)        { indVacPhase = 'recent';   break; }
      }
    }
    const pVac = A.vaccineStatus(p.age);
    checks++;
    if ((pVac ? pVac.phase : null) !== indVacPhase) {
      console.log(`  ✗ [${hid}] vaccinePhase: program=${pVac ? pVac.phase : null} independent=${indVacPhase}`);
      mismatches++;
    }

    // --- 6c. peer comparison (independent: same-farm ±2 age pct median) ---
    if (b.age != null && indHouses.length >= 3) {
      const peers = indHouses.filter(x => x !== b && x.age != null &&
        Math.abs(x.age - b.age) <= 2 && x.pct_cum != null);
      if (peers.length >= 2) {
        const srt = peers.map(x => x.pct_cum).sort((a, c) => a - c);
        const indMedian = srt[Math.floor(srt.length / 2)];
        const pPeer = A.peerComparison(p, prog.houses);
        cmp('peerMedian', hid, pPeer ? pPeer.peerMedian : null, indMedian, 0.001);
      }
    }

    // --- 6d. composite risk score (independent re-implementation) ---
    const pRisk = A.houseRiskScore(p, prog.houses);
    const bRisk = indRiskScore(b, indHouses);
    cmp('riskScore', hid, pRisk.score, bRisk.score, 0.001);
    checks++;
    if (pRisk.level !== bRisk.level) {
      console.log(`  ✗ [${hid}] riskLevel: program=${pRisk.level} independent=${bRisk.level}`);
      mismatches++;
    }

    // --- 7. cross-check: file's own %ตายสะสม vs death_cum/qty_in ---
    if (b.death_cum != null && b.qty_in) {
      const computed = b.death_cum / b.qty_in * 100;
      // the file stores its own pct_cum; allow wider tolerance (rounding in sheet)
      if (b.pct_cum != null && Math.abs(computed - b.pct_cum) > 0.15) {
        console.log(`  ⚠ [${hid}] sheet %ตายสะสม=${b.pct_cum.toFixed(3)} but death_cum/qty_in=${computed.toFixed(3)}`);
      }
    }
  }

  // --- 8. derived: farm-level totals & profit ---
  const totIn = indHouses.reduce((s,h) => s + (h.qty_in||0), 0);
  const totDead = indHouses.reduce((s,h) => s + (h.death_cum||0), 0);
  const indAvgMort = totIn > 0 ? totDead / totIn * 100 : 0;
  const progAvgMort = A.farmAvgMortality({ houses: prog.houses });
  cmp('farmAvgMortality', 'FARM', progAvgMort, indAvgMort, 0.001);

  // profit formula spot-check (fixed inputs)
  const prices = { sale: 42, chick: 18, feed: 19, opex: 4 };
  const indProfit = 2.7 * prices.sale - prices.chick - (2.7 * 1.55 * prices.feed) - prices.opex;
  cmp('profitCalc(2.7,1.55)', 'FORMULA', A.profitCalc(2.7, 1.55, prices), indProfit, 0.0001);
  const indBE = (2.7 * prices.sale - prices.chick - prices.opex) / (2.7 * prices.feed);
  cmp('breakevenFCR(2.7)', 'FORMULA', A.breakevenFCR(2.7, prices), indBE, 0.0001);

  console.log(`  farm avg mortality: program=${progAvgMort.toFixed(4)}%  independent=${indAvgMort.toFixed(4)}%`);

  // --- readable side-by-side sample (first 3 houses) — รูปแบบ program | independent ---
  console.log('  ── ตัวอย่างเทียบผล (โปรแกรม | คำนวณอิสระ) ──');
  for (let i = 0; i < Math.min(3, n); i++) {
    const p = prog.houses[i], b = indHouses[i];
    const pf = A.analyzeFeed(p);
    const bf = (b.age && b.feed_day && b.qty_rem)
      ? (() => { const fpb = b.feed_day*1000/b.qty_rem, std = farmFeedNearest(b.age);
                 const dev = (fpb-std)/std*100; return { dev, status: indFeedStatus(dev) }; })() : null;
    const pw = A.waterFeedRatio(p);
    const bwr = (b.water && b.feed_day) ? b.water / b.feed_day : null;
    const pRisk = A.houseRiskScore(p, prog.houses);
    const bRisk = indRiskScore(b, indHouses);
    const pPct = (p.pct_cum||0).toFixed(2), bPct = (b.pct_cum||0).toFixed(2);
    console.log(`    เล้า ${String(b.house).padEnd(3)} ` +
      `%ตาย ${pPct}|${bPct}  ` +
      `feed ${pf?pf.status:'—'}|${bf?bf.status:'—'} (${pf?pf.dev.toFixed(1):'—'}|${bf?bf.dev.toFixed(1):'—'}%)  ` +
      `น้ำ:อาหาร ${pw?pw.ratio.toFixed(2):'—'}|${bwr?bwr.toFixed(2):'—'}  ` +
      `risk ${pRisk.score} ${pRisk.level} | ${bRisk.score} ${bRisk.level}`);
  }
}

console.log('\n' + '='.repeat(70));
console.log(`checks run: ${checks}`);
console.log(mismatches === 0
  ? '✓ PERFECT MATCH — program calculations agree with independent computation'
  : `✗ ${mismatches} MISMATCH(ES) FOUND — see above`);
process.exit(mismatches === 0 ? 0 : 1);
