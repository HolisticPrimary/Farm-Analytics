// ====================================================================
// FARMSENSE · Schema mapping
//   - reports which columns auto-detection found / missed
//   - lets the user manually map columns when a template differs
//   - remembers each template's mapping in localStorage
// ====================================================================

// Fields that power user-facing features (not every parsed field).
// `critical` fields are required just to load the file at all.
const FIELD_SPEC = [
  { field: 'house',           label: 'เล้า',                affects: 'จำเป็น — ทุกแท็บ',          critical: true },
  { field: 'qty_in',          label: 'ยอดไก่ลง',            affects: 'จำเป็น — ทุกแท็บ',          critical: true },
  { field: 'age',             label: 'อายุ',                affects: 'อาหาร, อุณหภูมิ, น้ำหนัก' },
  { field: 'source',          label: 'ที่มาลูกไก่',          affects: 'ตาย (วินิจฉัยสาเหตุ)' },
  { field: 'density',         label: 'ความหนาแน่น (ตัว/ตร.ม.)', affects: 'ตาย (วินิจฉัยสาเหตุ)' },
  { field: 'death_day',       label: 'ตายต่อวัน',           affects: 'ภาพรวม, ตาย' },
  { field: 'death_cum',       label: 'ตายสะสม',             affects: 'ภาพรวม, ตาย' },
  { field: 'pct_cum',         label: '%ตายสะสม',            affects: 'ภาพรวม, ตาย, Heatmap' },
  { field: 'qty_rem',         label: 'ยอดไก่คงเหลือ',        affects: 'อาหาร, FCR, น้ำ:อาหาร' },
  { field: 'feed_day',        label: 'อาหาร/วัน (kg)',      affects: 'อาหาร vs STD, น้ำ:อาหาร' },
  { field: 'water',           label: 'น้ำ (ลิตร)',          affects: 'สุขภาพ (น้ำ:อาหาร)' },
  { field: 'wt_age',          label: 'น.น. ตามอายุ',        affects: 'สุขภาพ (น้ำหนัก vs Ross 308)' },
  { field: 'feed_loaded_pct', label: '% อาหารลงสะสม',       affects: 'สุขภาพ (อาหารหก)' },
  { field: 'feed_pct',        label: '% อาหารที่กินสะสม',   affects: 'สุขภาพ (อาหารหก)' },
  { field: 'm_died',          label: 'ไก่ตาย เช้า',         affects: 'สุขภาพ (ตาย vs คัด)' },
  { field: 'm_culled',        label: 'ไก่คัด เช้า',         affects: 'สุขภาพ (ตาย vs คัด)' },
  { field: 'e_died',          label: 'ไก่ตาย เย็น',         affects: 'สุขภาพ (ตาย vs คัด)' },
  { field: 'e_culled',        label: 'ไก่คัด เย็น',         affects: 'สุขภาพ (ตาย vs คัด)' },
  { field: 'disabled',        label: 'ไก่พิการ',            affects: '(ยังไม่ใช้)' },
  { field: 'wt_target',       label: 'น.น. วันจับ (เป้า)',  affects: 'FCR (อ้างอิง)' },
  { field: 'wt_actual',       label: 'น.น. จับจริง',        affects: 'FCR (กำไรรายฟาร์ม)' },
];

// A template is identified by the exact text of its header row.
function templateSignature(headerRow) {
  return (headerRow || []).map(c => String(c == null ? '' : c).trim()).join('|');
}

// ---------- localStorage persistence ----------
const SCHEMA_STORE_KEY = 'farmsense.schemas';

function loadSchemas() {
  try { return JSON.parse(localStorage.getItem(SCHEMA_STORE_KEY)) || {}; }
  catch (e) { return {}; }
}
function getSchema(signature) {
  return loadSchemas()[signature] || null;
}
function saveSchema(signature, colMap) {
  const all = loadSchemas();
  all[signature] = colMap;
  try { localStorage.setItem(SCHEMA_STORE_KEY, JSON.stringify(all)); } catch (e) {}
}
function clearSchema(signature) {
  const all = loadSchemas();
  delete all[signature];
  try { localStorage.setItem(SCHEMA_STORE_KEY, JSON.stringify(all)); } catch (e) {}
}

// ---------- coverage report ----------
function diagnoseMapping(colMap) {
  const mapped = [], missing = [];
  for (const spec of FIELD_SPEC) {
    (colMap[spec.field] != null ? mapped : missing).push(spec);
  }
  // missing fields that actually break a feature (exclude the "ยังไม่ใช้" one)
  const missingImportant = missing.filter(s => !s.affects.includes('ยังไม่ใช้'));
  return { mapped, missing, missingImportant };
}

// ---------- manual mapping modal ----------
function openMappingModal(farmKey) {
  const farm = STATE.farms[farmKey];
  if (!farm) return;
  if (!farm.rows || !farm.headerLabels) {
    alert('ไฟล์นี้โหลดมาจากประวัติ — ปรับการ map คอลัมน์ไม่ได้\nต้องอัปโหลดไฟล์ Excel ต้นฉบับใหม่');
    return;
  }
  const labels = farm.headerLabels;

  const colOptions = current =>
    `<option value="">— ไม่ระบุ —</option>` +
    labels.map((lab, c) =>
      `<option value="${c}" ${c === current ? 'selected' : ''}>คอลัมน์ ${c} · ${escapeHtml(lab)}</option>`
    ).join('');

  const rows = FIELD_SPEC.map(spec => `
    <div class="map-row${spec.critical ? ' crit' : ''}">
      <div class="map-field">
        <div class="map-label">${escapeHtml(spec.label)}${spec.critical ? ' <span class="map-req">*จำเป็น</span>' : ''}</div>
        <div class="map-affects">${escapeHtml(spec.affects)}</div>
      </div>
      <select class="map-select" data-field="${spec.field}">
        ${colOptions(farm.colMap[spec.field] != null ? farm.colMap[spec.field] : null)}
      </select>
    </div>
  `).join('');

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-panel">
      <div class="modal-head">
        <div>
          <h3>ปรับการ map คอลัมน์</h3>
          <div class="modal-sub">${escapeHtml(farm.name)} · ${escapeHtml(farm.filename)}</div>
        </div>
        <button class="modal-x" title="ปิด">×</button>
      </div>
      <div class="modal-note">
        เลือกว่าแต่ละข้อมูลตรงกับคอลัมน์ไหนในไฟล์ Excel — ระบบจะ <b>จดจำ template นี้ไว้</b>
        ครั้งต่อไปที่อัปโหลดไฟล์หน้าตาแบบเดียวกันจะ map ให้อัตโนมัติ
      </div>
      <div class="modal-body">${rows}</div>
      <div class="modal-foot">
        <button class="modal-btn ghost" data-act="reset">↺ รีเซ็ตเป็นอัตโนมัติ</button>
        <span style="flex:1"></span>
        <button class="modal-btn ghost" data-act="cancel">ยกเลิก</button>
        <button class="modal-btn primary" data-act="save">บันทึก &amp; คำนวณใหม่</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  overlay.querySelector('.modal-x').onclick = close;
  overlay.querySelector('[data-act="cancel"]').onclick = close;

  overlay.querySelector('[data-act="reset"]').onclick = () => {
    clearSchema(farm.signature);
    const fresh = autoDetectColMap(farm.rows, farm.headerIdx);
    applyMapping(farmKey, fresh, false);
    close();
  };

  overlay.querySelector('[data-act="save"]').onclick = () => {
    const newMap = {};
    overlay.querySelectorAll('.map-select').forEach(sel => {
      if (sel.value !== '') newMap[sel.dataset.field] = parseInt(sel.value, 10);
    });
    if (newMap.house == null || newMap.qty_in == null) {
      alert('ต้องเลือกคอลัมน์ "เล้า" และ "ยอดไก่ลง" อย่างน้อย — เป็นข้อมูลที่จำเป็น');
      return;
    }
    applyMapping(farmKey, newMap, true);
    close();
  };
}

// Apply a column map to a farm: rebuild houses, persist (if manual), re-render.
function applyMapping(farmKey, colMap, persist) {
  const farm = STATE.farms[farmKey];
  if (!farm) return;
  farm.colMap = colMap;
  farm.usedSavedSchema = !!persist;
  if (persist) saveSchema(farm.signature, colMap);
  farm.houses = buildHouses(farm.rows, farm.headerIdx, colMap);
  if (typeof updateFileDiag === 'function') updateFileDiag(farmKey);
  renderDashboard();
}
