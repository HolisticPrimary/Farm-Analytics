// ====================================================================
// FARMSENSE · Excel parser
// ====================================================================

function findSheet(workbook) {
  for (const name of workbook.SheetNames) {
    for (const kw of SHEET_KEYWORDS) {
      if (name.includes(kw)) return name;
    }
  }
  return null;
}

function rowToText(row) {
  return (row || []).map(c => String(c == null ? '' : c)).join(' | ');
}

function findHeaderRow(rows) {
  // Look for row containing both "เล้า" and ("อายุ" or "ที่มา")
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const txt = rowToText(rows[i]);
    if (txt.includes('เล้า') && (txt.includes('อายุ') || txt.includes('ที่มา'))) {
      return i;
    }
  }
  return -1;
}

// True only for values that are a clean number (or numeric type) — rejects
// text like "PPF" or "552V" so it can't be mistaken for a numeric column.
function looksNumeric(v) {
  if (v == null || v === '') return false;
  if (typeof v === 'number') return true;
  return /^[\d,]+(\.\d+)?$/.test(String(v).trim());
}

function mapColumns(headerRow, nextRow, sampleRows) {
  const colMap = {};
  // Combine header texts (some headers span 2 rows due to merged cells)
  for (let c = 0; c < (headerRow || []).length; c++) {
    const h1 = String(headerRow[c] == null ? '' : headerRow[c]).trim();
    const h2 = nextRow ? String(nextRow[c] == null ? '' : nextRow[c]).trim() : '';
    const combined = (h1 + ' ' + h2).trim();

    for (const [key, keywords] of Object.entries(COL_KEYWORDS)) {
      if (colMap[key] != null) continue;

      const exclude = COL_EXCLUDE[key] || [];
      if (exclude.some(x => combined.includes(x))) continue;

      if (!keywords.some(kw => combined.includes(kw))) continue;

      // Numeric fields: if the column has data but none of it looks numeric,
      // it's the wrong column (e.g. a feed-brand column) — keep looking.
      if (COL_NUMERIC.includes(key) && sampleRows && sampleRows.length) {
        const vals = sampleRows
          .map(r => (r ? r[c] : null))
          .filter(v => v != null && v !== '');
        if (vals.length > 0 && !vals.some(looksNumeric)) continue;
      }

      colMap[key] = c;
    }
  }
  return colMap;
}

function parseNumeric(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  const s = String(v).replace(/[^\d.\-]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function parseAge(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Math.floor(v);
  const s = String(v).trim();
  const m = s.match(/(\d+)/);
  return m ? parseInt(m[1]) : null;
}

// Maps the daily death/cull detail (เช้า/เย็น × ตาย/คัด). Templates use one
// of two layouts, so handle both:
//
//   Format 1 — merged spanning header "ตายต่อวันเช้า" / "ตายต่อวันเย็น" over
//              two columns, with a sub-header row reading ไก่ตาย | ไก่คัด.
//   Format 2 — four explicit single-row columns
//              ไก่ตายเช้า | ไก่คัดเช้า | ไก่ตายเย็น | ไก่คัดเย็น.
//              ("เข้า" appears as a misspelling of "เช้า" in some files.)
function mapDeathBreakdown(headerRow, subRow) {
  const out = {};
  const txt = c => String((headerRow && headerRow[c]) || '').trim();
  const sub = c => String((subRow && subRow[c]) || '').trim();
  const N = (headerRow || []).length;

  // Format 1: positional pair relative to the merged spanning header.
  const pair = (c, diedKey, culledKey) => {
    if (sub(c).includes('คัด')) { out[culledKey] = c; out[diedKey] = c + 1; }
    else                        { out[diedKey] = c;   out[culledKey] = c + 1; }
  };
  for (let c = 0; c < N; c++) {
    const h = txt(c);
    if (h.includes('ตายต่อวันเช้า')) pair(c, 'm_died', 'm_culled');
    if (h.includes('ตายต่อวันเย็น')) pair(c, 'e_died', 'e_culled');
  }

  // Format 2: four explicitly-named columns. The == null guards mean Format 1
  // wins where both could match, so this never overrides the merged layout.
  for (let c = 0; c < N; c++) {
    const h = txt(c).replace(/\s/g, '');
    const morning = h.includes('เช้า') || h.includes('เข้า');
    const evening = h.includes('เย็น');
    if (!morning && !evening) continue;
    if (h.includes('ตาย')) {
      if (morning && out.m_died == null) out.m_died = c;
      if (evening && out.e_died == null) out.e_died = c;
    } else if (h.includes('คัด')) {
      if (morning && out.m_culled == null) out.m_culled = c;
      if (evening && out.e_culled == null) out.e_culled = c;
    }
  }
  return out;
}

function parseRowData(row, colMap) {
  const num = key => (colMap[key] != null ? parseNumeric(row[colMap[key]]) : null);
  const r = {};
  r.house           = colMap.house  != null ? row[colMap.house] : null;
  r.age             = colMap.age    != null ? parseAge(row[colMap.age]) : null;
  r.age_raw         = colMap.age    != null ? row[colMap.age] : null;
  r.source          = colMap.source != null ? String(row[colMap.source] || '').trim() : '';
  r.qty_in          = num('qty_in');
  r.density         = num('density');
  r.death_day       = num('death_day');
  r.death_cum       = num('death_cum');
  r.pct_cum         = num('pct_cum');
  r.disabled        = num('disabled');
  r.qty_rem         = num('qty_rem');
  r.feed_loaded_pct = num('feed_loaded_pct');
  r.feed_pct        = num('feed_pct');
  r.feed_day        = num('feed_day');
  r.water           = num('water');
  r.wt_age          = num('wt_age');
  // wt_initial can land in either kg (e.g. 0.040) or grams (e.g. 40),
  // depending on the template. Normalise to kg — a chick is never
  // heavier than ~100 g, so anything above 1 must be grams.
  {
    const w0 = num('wt_initial');
    r.wt_initial = (w0 != null && w0 > 1) ? w0 / 1000 : w0;
  }
  r.wt_actual       = num('wt_actual');
  r.wt_target       = colMap.wt_target != null ? row[colMap.wt_target] : null;
  // daily death/cull breakdown (เช้า/เย็น × ตาย/คัด)
  r.m_died          = num('m_died');
  r.m_culled        = num('m_culled');
  r.e_died          = num('e_died');
  r.e_culled        = num('e_culled');

  return r;
}

function extractFarmInfo(rows, filename) {
  let name = filename.replace(/\.xlsx?$/i, '').replace(/[_-]/g, ' ');
  let round = null;
  let date = null;

  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const txt = rowToText(rows[i]);

    const rm = txt.match(/รุ่น(?:ที่)?\s*(\d+)/);
    if (rm && round == null) round = parseInt(rm[1]);

    const dm = txt.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
    if (dm && date == null) date = `${dm[1]}/${dm[2]}/${dm[3]}`;

    const fm = txt.match(/ฟาร์ม\s*([^\s|]+(?:\s+[^\s|]+)*)/);
    if (fm) {
      // Stop the name at "รุ่น", a date, or a wide gap so round/date info
      // doesn't leak into the display name.
      const raw = fm[1].split(/รุ่น|วันที่|\s{2,}/)[0].trim();
      const candidate = 'ฟาร์ม' + raw;
      if (raw && candidate.length < 40) name = candidate;
    }
  }

  return { name, round, date };
}

// Run the full keyword + death-breakdown auto-detection over a sheet.
function autoDetectColMap(rows, headerIdx) {
  const sampleRows = rows.slice(headerIdx + 1, headerIdx + 9);
  const colMap = mapColumns(rows[headerIdx], rows[headerIdx + 1], sampleRows);
  Object.assign(colMap, mapDeathBreakdown(rows[headerIdx], rows[headerIdx + 1]));
  return colMap;
}

// Human-readable label for every column — header text combined with the
// sub-header row. Used by the manual column-mapping UI.
function headerLabelList(rows, headerIdx) {
  const h = rows[headerIdx] || [];
  const sub = rows[headerIdx + 1] || [];
  const out = [];
  for (let c = 0; c < h.length; c++) {
    const h1 = String(h[c] == null ? '' : h[c]).trim();
    const h2 = String(sub[c] == null ? '' : sub[c]).trim();
    out.push((h1 + ' ' + h2).trim() || '(ว่าง)');
  }
  return out;
}

// Turn parsed rows + a column map into the list of house records.
// Pure function — re-runnable when the user changes the column mapping.
function buildHouses(rows, headerIdx, colMap) {
  let dataStart = headerIdx + 1;
  const peekHouse = (rows[dataStart] || [])[colMap.house];
  if (peekHouse == null || (typeof peekHouse === 'string' && !peekHouse.match(/^\s*\d/))) {
    dataStart++;
  }
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
  return houses;
}

// ====================================================================
// Daily history parser — pulls day-by-day metrics out of the H 1..H N
// per-house sheets. All four reference templates share the same column
// layout: B=day, C=date, F=feed used, L/M=temp lo/hi, N=humidity,
// P=water, Q/R=morning died/culled, S/T=evening died/culled,
// U=total death, V=total cull, Z=remaining, AA=weight, AB=FCR.
// Returns { 1: [{day,...}, {day,...}], 2: [...], ... }.
// ====================================================================
function parseHouseDailyHistory(workbook) {
  const histories = {};
  const initialWeights = {};   // houseNum -> kg (from H-sheet header)
  const hSheets = workbook.SheetNames.filter(n => /^\s*H\s*\d+\s*$/i.test(n));
  for (const name of hSheets) {
    const m = name.match(/H\s*(\d+)/i);
    if (!m) continue;
    const houseNum = parseInt(m[1], 10);
    const sheet = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

    // Pull the per-house initial chick weight ("น้ำหนักเฉลี่ยวันแรก", in grams)
    // out of the H-sheet preamble. We scan rows 0–6 because the label position
    // varies slightly between templates. Values are clamped to a sane range so
    // a stray number elsewhere on the line doesn't sneak through.
    for (let r = 0; r < Math.min(7, rows.length); r++) {
      const row = rows[r] || [];
      for (let c = 0; c < row.length; c++) {
        const cell = String(row[c] == null ? '' : row[c]);
        if (cell.includes('น้ำหนักเฉลี่ยวันแรก') || cell.includes('น้ำหนักลูกไก่วันแรก')) {
          for (let cc = c + 1; cc < Math.min(c + 6, row.length); cc++) {
            const v = parseNumeric(row[cc]);
            if (v != null && v > 10 && v < 200) {
              initialWeights[houseNum] = v / 1000;   // grams → kg
              break;
            }
          }
          break;
        }
      }
      if (initialWeights[houseNum] != null) break;
    }

    // Find the header row — first row containing both 'อายุไก่' and 'วันที่'.
    let hidx = -1;
    for (let i = 0; i < Math.min(rows.length, 12); i++) {
      const t = rowToText(rows[i]);
      if (t.includes('อายุไก่') && t.includes('วันที่')) { hidx = i; break; }
    }
    if (hidx < 0) continue;

    // Data rows live below the merged sub-header (skip 2 rows).
    const daily = [];
    for (let r = hidx + 2; r < rows.length; r++) {
      const row = rows[r] || [];
      const day = row[1];
      if (typeof day !== 'number') continue;
      const totalDeath = parseNumeric(row[20]);
      const totalCull  = parseNumeric(row[21]);
      const totalLoss  = parseNumeric(row[22]);
      const remaining  = parseNumeric(row[25]);
      const weight     = parseNumeric(row[26]);
      const fcr        = parseNumeric(row[27]);
      const tempLo     = parseNumeric(row[11]);
      const tempHi     = parseNumeric(row[12]);
      const humidity   = parseNumeric(row[13]);
      const water      = parseNumeric(row[15]);
      const feedUsed   = parseNumeric(row[5]);
      const feedStdG   = parseNumeric(row[7]);
      // A row is "live" only if the operator actually filled in
      // operational data. The template often pre-fills qty_rem via a
      // formula and pre-zeros death/cull, so we look at date + the
      // measured columns (temp, water, weight, feed_used) that have to
      // be typed by hand.
      const hasOperatorData = (row[2] != null && row[2] !== '') ||
        [tempLo, tempHi, water, feedUsed, weight].some(v => v != null && v !== 0);
      if (!hasOperatorData) continue;
      daily.push({
        day: Math.floor(day),
        date: row[2],
        m_died:    parseNumeric(row[16]) || 0,
        m_culled:  parseNumeric(row[17]) || 0,
        e_died:    parseNumeric(row[18]) || 0,
        e_culled:  parseNumeric(row[19]) || 0,
        total_death: totalDeath || 0,
        total_cull:  totalCull  || 0,
        total_loss:  totalLoss  || 0,
        qty_rem:    remaining,
        weight,
        fcr,
        temp_lo:    tempLo,
        temp_hi:    tempHi,
        humidity,
        water,
        feed_used:  feedUsed,
        feed_std_g: feedStdG,
      });
    }
    if (daily.length > 0) histories[houseNum] = daily;
  }
  return { histories, initialWeights };
}

// ====================================================================
// Feed-plan sheet parser ("แผนอาหาร") — pulls per-house cumulative
// loaded feed (kg) and the % of program loaded so far. Templates use
// a two-block layout: delivery log on the left (date · feed code ·
// kg per house) and a summary block on the right with two labelled
// rows "รวม" (total kg per house) and "%" (loaded as % of program).
// Returns { [houseNum]: { totalKg, pct, deliveryCount, lastDeliveryDate } }
// or null when the sheet isn't present (only the PP template carries it).
// ====================================================================
function parseFeedPlanSheet(workbook) {
  const sheetName = workbook.SheetNames.find(n => (n || '').includes('แผนอาหาร'));
  if (!sheetName) return null;
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

  // Find the row labelled "รวม" anywhere in the sheet (column position
  // varies between templates). The header that names each per-house
  // column sits one row above it.
  let totalRow = null, pctRow = null, summaryHdr = null;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || [];
    if (row.some(c => String(c == null ? '' : c).trim() === 'รวม')) {
      totalRow = row;
      summaryHdr = rows[i - 1] || [];
      // "%" row immediately follows
      const next = rows[i + 1] || [];
      if (next.some(c => String(c == null ? '' : c).trim() === '%')) pctRow = next;
      break;
    }
  }
  if (!totalRow || !summaryHdr) return null;

  // Locate per-house columns from the summary header.
  const houseCols = {};
  for (let c = 0; c < summaryHdr.length; c++) {
    const v = String(summaryHdr[c] == null ? '' : summaryHdr[c]);
    const m = v.match(/โรงเรือนที่\s*(\d+)/);
    if (m) houseCols[parseInt(m[1], 10)] = c;
  }

  // Also scan delivery records — every row whose first column looks
  // like a date is a delivery event. Use them to count deliveries +
  // capture the most-recent date per house.
  const deliveriesPerHouse = {};
  const dateRe = /^\d{1,2}\/\d{1,2}\/\d{2,4}/;
  for (const row of rows) {
    const dateStr = String((row || [])[0] == null ? '' : row[0]).trim();
    if (!dateRe.test(dateStr)) continue;
    for (const [hNumStr, col] of Object.entries(houseCols)) {
      const hNum = parseInt(hNumStr, 10);
      // The delivery columns are usually FOUR slots to the left of the
      // summary columns, but layouts vary; safer to scan the row for
      // matching house position via the delivery header at the top.
    }
    // Simpler: just count rows that have at least one non-null amount
    // in any delivery column (cols 3-10, where the per-house deliveries
    // live in PP's template).
  }

  // Build per-house plan from the summary rows.
  const plan = {};
  for (const [hNumStr, col] of Object.entries(houseCols)) {
    const num = parseInt(hNumStr, 10);
    const totalKg = parseNumeric(totalRow[col]);
    const pct = pctRow ? parseNumeric(pctRow[col]) : null;
    if (totalKg == null && pct == null) continue;
    plan[num] = { totalKg, pct };
  }
  return Object.keys(plan).length > 0 ? plan : null;
}

async function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = findSheet(workbook);
        if (!sheetName) {
          reject(new Error('ไม่พบชีท "ประมาณการไก่คงเหลือจับ" ในไฟล์'));
          return;
        }
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: null });

        const headerIdx = findHeaderRow(rows);
        if (headerIdx < 0) {
          reject(new Error('ไม่พบ header row · ตรวจสอบ format ของไฟล์'));
          return;
        }

        // A saved manual mapping for this exact template wins over auto-detect.
        const signature = templateSignature(rows[headerIdx]);
        const headerLabels = headerLabelList(rows, headerIdx);
        const saved = (typeof getSchema === 'function') ? getSchema(signature) : null;
        const colMap = saved ? { ...saved } : autoDetectColMap(rows, headerIdx);

        if (colMap.house == null || colMap.qty_in == null) {
          reject(new Error('ไม่พบ column สำคัญ (เล้า/ยอดไก่ลง)'));
          return;
        }

        const houses = buildHouses(rows, headerIdx, colMap);
        if (houses.length === 0) {
          reject(new Error('ไม่พบข้อมูลเล้า — ตรวจสอบ format ของไฟล์'));
          return;
        }

        // Per-house feed-plan totals from "แผนอาหาร" sheet (when present).
        // PP template carries this; other templates fall back to the face
        // sheet's feed_loaded_pct field for the same information.
        const feedPlan = parseFeedPlanSheet(workbook);

        // Attach per-house daily history from H 1..H N sheets when available.
        // Also harvest the initial chick weight ("น้ำหนักเฉลี่ยวันแรก") out of
        // the H-sheet preamble when the face sheet didn't carry the column —
        // four templates ship four slightly different layouts.
        const { histories, initialWeights } = parseHouseDailyHistory(workbook);
        for (const h of houses) {
          const num = Number(h.house);
          let hist = Number.isFinite(num) ? (histories[num] || null) : null;
          // Truncate to current age so formula-filled future rows don't show up.
          if (hist && h.age != null) hist = hist.filter(d => d.day <= h.age);
          h.dailyHistory = hist && hist.length > 0 ? hist : null;
          // Fill in initial weight from H sheet when face sheet lacked it.
          if (h.wt_initial == null && Number.isFinite(num) && initialWeights[num] != null) {
            h.wt_initial = initialWeights[num];
          }
          // Attach feed-plan totals when the sheet provided them.
          if (feedPlan && Number.isFinite(num) && feedPlan[num]) {
            h.feed_plan = feedPlan[num];
          }
        }

        const info = extractFarmInfo(rows, file.name);
        resolve({
          ...info, houses, filename: file.name, sheetName,
          rows, headerIdx, colMap, signature, headerLabels,
          usedSavedSchema: !!saved,
        });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
    reader.readAsArrayBuffer(file);
  });
}
