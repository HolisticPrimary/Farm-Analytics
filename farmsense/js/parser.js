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
