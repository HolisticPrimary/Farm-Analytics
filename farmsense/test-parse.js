// ====================================================================
// FarmSense · offline parser/analyzer test harness (Node + SheetJS)
// Loads the real js/*.js source and runs it against the .xlsx files.
// Run:  node test-parse.js
// ====================================================================
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const XLSX = require('xlsx');

// --- load the actual source files into a shared sandbox ---
const sandbox = { XLSX, console, Math, Object, String, Number, Array, JSON,
                  isNaN, parseFloat, parseInt, Date, RegExp };
vm.createContext(sandbox);
for (const f of ['js/constants.js', 'js/ui-helpers.js', 'js/analyzers.js',
                 'js/schema-map.js', 'js/parser.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), sandbox, { filename: f });
}
const { findSheet, findHeaderRow, mapColumns, mapDeathBreakdown, parseRowData,
        extractFarmInfo, diagnoseHouse, analyzeFeed, rossLookup,
        farmAvgMortality, farmAvgAge,
        waterFeedRatio, mortalityBreakdown, weightVsStandard, feedWaste,
        vaccineStatus, peerComparison, houseRiskScore,
        diagnoseMapping } = sandbox;
// FIELD_SPEC is a top-level `const` so it isn't a property of the sandbox
// object — pull it out of the context's lexical scope explicitly.
const FIELD_SPEC = vm.runInContext('FIELD_SPEC', sandbox);

// --- mirror parseExcelFile's body (browser version uses FileReader) ---
function parseWorkbook(buf, filename) {
  const workbook = XLSX.read(buf, { type: 'buffer' });
  const sheetName = findSheet(workbook);
  if (!sheetName) throw new Error('ไม่พบชีท "ประมาณการไก่คงเหลือจับ"');
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: null });
  const headerIdx = findHeaderRow(rows);
  if (headerIdx < 0) throw new Error('ไม่พบ header row');
  const sampleRows = rows.slice(headerIdx + 1, headerIdx + 9);
  const colMap = mapColumns(rows[headerIdx], rows[headerIdx + 1], sampleRows);
  Object.assign(colMap, mapDeathBreakdown(rows[headerIdx], rows[headerIdx + 1]));
  if (colMap.house == null || colMap.qty_in == null) throw new Error('ไม่พบ column สำคัญ');
  let dataStart = headerIdx + 1;
  const peek = (rows[dataStart] || [])[colMap.house];
  if (peek == null || (typeof peek === 'string' && !peek.match(/^\s*\d/))) dataStart++;
  const houses = [];
  for (let i = dataStart; i < rows.length; i++) {
    const row = rows[i] || [];
    const h = row[colMap.house];
    if (h == null || String(h).trim() === '' || String(h).includes('รวม')) {
      if (houses.length > 0) break;
      continue;
    }
    const parsed = parseRowData(row, colMap);
    if (parsed.qty_in != null && parsed.qty_in > 0) houses.push(parsed);
  }
  if (houses.length === 0) throw new Error('ไม่พบข้อมูลเล้า');
  const info = extractFarmInfo(rows, filename);
  return { ...info, houses, colMap };
}

// --- run against every .xlsx in the parent folder ---
const dir = path.join(__dirname, '..');
// Only the daily face-sheet files — skip standards/equipment workbooks.
const files = fs.readdirSync(dir).filter(f => f.endsWith('.xlsx') && f.includes('ใบหน้าเล้า'));
let problems = 0;

for (const fn of files) {
  console.log('\n' + '='.repeat(64));
  console.log('FILE:', fn);
  let farm;
  try {
    farm = parseWorkbook(fs.readFileSync(path.join(dir, fn)), fn);
  } catch (e) {
    console.log('  ✗ PARSE FAILED:', e.message);
    problems++;
    continue;
  }
  console.log(`  ✓ parsed: name="${farm.name}" round=${farm.round} houses=${farm.houses.length}`);
  console.log('  colMap:', JSON.stringify(farm.colMap));

  // column-mapping coverage report
  const diag = diagnoseMapping(farm.colMap);
  console.log(`  mapping coverage: ${diag.mapped.length}/${FIELD_SPEC.length} fields`);
  if (diag.missingImportant.length) {
    console.log(`  ⚠ unmapped (feature-affecting): ${diag.missingImportant.map(s => s.label).join(', ')}`);
  } else {
    console.log(`  ✓ all feature-affecting columns mapped`);
  }

  let feedOk = 0, feedNull = 0;
  const cnt = { water: 0, breakdown: 0, weight: 0, waste: 0, risk: 0 };
  for (const h of farm.houses) {
    const miss = [];
    if (h.house == null) miss.push('house');
    if (h.qty_in == null) miss.push('qty_in');
    if (miss.length) { console.log(`  ⚠ house ${h.house}: missing ${miss.join(',')}`); problems++; }

    const guard = (label, fn) => {
      try { return fn(); }
      catch (e) { console.log(`  ✗ ${label} threw for house ${h.house}:`, e.message); problems++; return null; }
    };

    const d = guard('diagnoseHouse', () => diagnoseHouse(h));
    if (d && !d.priority) { console.log(`  ⚠ diagnoseHouse bad output for house ${h.house}`); problems++; }

    const a = guard('analyzeFeed', () => analyzeFeed(h));
    if (a) {
      feedOk++;
      if (!isFinite(a.dev) || !isFinite(a.feedPerBird)) { console.log(`  ⚠ house ${h.house}: feed NaN/Inf`); problems++; }
    } else feedNull++;

    const wf = guard('waterFeedRatio', () => waterFeedRatio(h));
    if (wf) { cnt.water++; if (!isFinite(wf.ratio)) { console.log(`  ⚠ house ${h.house}: waterFeed NaN`); problems++; } }

    const bd = guard('mortalityBreakdown', () => mortalityBreakdown(h));
    if (bd) {
      cnt.breakdown++;
      const sum = bd.died + bd.culled;
      // died+culled should reconcile with the daily-death total when present
      if (h.death_day != null && Math.abs(sum - h.death_day) > 1) {
        console.log(`  ⚠ house ${h.house}: ตาย+คัด=${sum} ≠ ตายต่อวัน=${h.death_day}`); problems++;
      }
    }

    const wv = guard('weightVsStandard', () => weightVsStandard(h));
    if (wv) { cnt.weight++; if (!isFinite(wv.devPct)) { console.log(`  ⚠ house ${h.house}: weight NaN`); problems++; } }

    const fw = guard('feedWaste', () => feedWaste(h));
    if (fw) { cnt.waste++; if (!isFinite(fw.gapPct)) { console.log(`  ⚠ house ${h.house}: feedWaste NaN`); problems++; } }

    guard('vaccineStatus', () => vaccineStatus(h.age));
    guard('peerComparison', () => peerComparison(h, farm.houses));
    const risk = guard('houseRiskScore', () => houseRiskScore(h, farm.houses));
    if (risk) {
      cnt.risk++;
      const lvlOk = (risk.score >= 50 && risk.level === 'CRITICAL') ||
                    (risk.score >= 25 && risk.score < 50 && risk.level === 'HIGH') ||
                    (risk.score >= 10 && risk.score < 25 && risk.level === 'WATCH') ||
                    (risk.score < 10 && risk.level === 'OK');
      if (!isFinite(risk.score) || risk.score < 0) {
        console.log(`  ⚠ house ${h.house}: risk score invalid (${risk.score})`); problems++;
      }
      if (!lvlOk) {
        console.log(`  ⚠ house ${h.house}: risk level "${risk.level}" inconsistent with score ${risk.score}`); problems++;
      }
    }
  }
  console.log(`  feed: ${feedOk} calc / ${feedNull} skip   ·   ` +
    `water:feed ${cnt.water}   ตาย/คัด ${cnt.breakdown}   น้ำหนัก ${cnt.weight}   อาหารหก ${cnt.waste}   risk ${cnt.risk}`);
  const risks = farm.houses.map(h => houseRiskScore(h, farm.houses));
  const byLvl = { CRITICAL:0, HIGH:0, WATCH:0, OK:0 };
  risks.forEach(r => byLvl[r.level]++);
  console.log(`  risk levels: วิกฤต ${byLvl.CRITICAL} · เสี่ยงสูง ${byLvl.HIGH} · เฝ้าระวัง ${byLvl.WATCH} · ปกติ ${byLvl.OK}`);
  console.log(`  mortality avg: ${farmAvgMortality(farm).toFixed(2)}%  ·  avg age: ${farmAvgAge(farm).toFixed(1)} วัน`);

  // sample first 2 houses — show Group-A analyzer output
  farm.houses.slice(0, 2).forEach(h => {
    const wf = waterFeedRatio(h), bd = mortalityBreakdown(h);
    const wv = weightVsStandard(h), fw = feedWaste(h);
    console.log(`    house ${h.house}: age=${h.age} water=${h.water} feed=${h.feed_day} wt=${h.wt_age}`);
    console.log(`      → น้ำ:อาหาร ${wf ? wf.ratio.toFixed(2)+' ['+wf.status+']' : 'SKIP'}` +
      `   ตาย/คัด ${bd ? bd.died+'/'+bd.culled+' ['+bd.pattern+']' : 'SKIP'}` +
      `   น้ำหนัก ${wv ? wv.devPct.toFixed(1)+'% ['+wv.status+']' : 'SKIP'}` +
      `   อาหารหก ${fw ? fw.gapPct.toFixed(2)+'% ['+fw.status+']' : 'SKIP'}`);
  });
}

console.log('\n' + '='.repeat(64));
console.log(problems === 0 ? '✓ ALL CLEAR — no errors' : `✗ ${problems} problem(s) found`);
process.exit(problems === 0 ? 0 : 1);
