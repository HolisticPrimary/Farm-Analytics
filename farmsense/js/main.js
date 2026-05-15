// ====================================================================
// FARMSENSE · Main (upload, tab switching, event wiring, init)
// ====================================================================

// ========== UPLOAD HANDLING ==========

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const fileList = document.getElementById('fileList');
const alertBox = document.getElementById('uploadAlert');

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  handleFiles(e.dataTransfer.files);
});
fileInput.addEventListener('change', e => handleFiles(e.target.files));

// farmKey -> { item, diag } DOM references, so the mapping modal can refresh
// a file's diagnostic line after the user re-maps columns.
const fileItems = {};

// Build the column-coverage diagnostic line shown under a parsed file.
function updateFileDiag(farmKey) {
  const refs = fileItems[farmKey];
  const farm = STATE.farms[farmKey];
  if (!refs || !farm) return;
  const { diag } = refs;
  const { mapped, missingImportant } = diagnoseMapping(farm.colMap);

  // Snapshots loaded from history have no raw rows — the mapping modal can't run.
  if (farm.fromHistory) {
    diag.className = 'file-diag';
    diag.innerHTML = `<span>📁 โหลดจากประวัติ · ${mapped.length}/${FIELD_SPEC.length} คอลัมน์ · ${farm.houses.length} เล้า</span>`;
    return;
  }

  const savedTag = farm.usedSavedSchema
    ? '<span class="diag-saved">● ใช้ map ที่บันทึกไว้</span>' : '';

  if (missingImportant.length === 0) {
    diag.className = 'file-diag ok';
    diag.innerHTML = `
      <span>✓ พบคอลัมน์ครบ ${mapped.length}/${FIELD_SPEC.length} · ${farm.houses.length} เล้าที่มีไก่</span>
      ${savedTag}
      <button class="map-btn ghost" data-key="${farmKey}">⚙ ปรับ map</button>`;
  } else {
    const names = missingImportant.map(s => s.label).join(', ');
    diag.className = 'file-diag warn';
    diag.innerHTML = `
      <span>⚠ ไม่พบ ${missingImportant.length} คอลัมน์: <b>${escapeHtml(names)}</b> — แท็บที่เกี่ยวข้องจะไม่แสดงผล</span>
      ${savedTag}
      <button class="map-btn" data-key="${farmKey}">⚙ ปรับการ map คอลัมน์</button>`;
  }
  diag.querySelector('.map-btn').onclick = () => openMappingModal(farmKey);
}

// Mount a parsed/loaded farm as a file-item card. Shared by upload + history-load.
// `existingItem` lets the upload path reuse its loading placeholder element.
function mountFarm(farmKey, farmData, metaText, existingItem) {
  STATE.farms[farmKey] = farmData;
  const item = existingItem || document.createElement('div');
  item.className = 'file-item';
  item.innerHTML = `
    <div class="file-row">
      <div style="color:var(--green); font-weight:600; font-family:'Bai Jamjuree',sans-serif">✓</div>
      <div class="fname">${escapeHtml(farmData.name)}</div>
      <div class="meta">${escapeHtml(metaText)}</div>
      <button class="x" data-key="${farmKey}">×</button>
    </div>
    <div class="file-diag"></div>`;
  if (!existingItem) fileList.appendChild(item);
  fileItems[farmKey] = { item, diag: item.querySelector('.file-diag') };
  item.querySelector('.x').onclick = () => {
    delete STATE.farms[farmKey];
    delete fileItems[farmKey];
    item.remove();
    renderDashboard();
  };
  updateFileDiag(farmKey);
}

// Load a saved snapshot back into the live dashboard (read-only — no raw rows).
async function loadSnapshotToDashboard(key) {
  let snap;
  try { snap = await getSnapshot(key); }
  catch (e) { alert('โหลด snapshot ไม่สำเร็จ: ' + e.message); return; }
  if (!snap) return;
  const farmKey = snap.filename.replace(/\.xlsx?$/i, '').replace(/[^a-z0-9ก-๙]/gi, '_') + '__hist';
  const farmData = {
    name: snap.farmName, round: snap.round, date: snap.date,
    filename: snap.filename, signature: snap.signature, colMap: snap.colMap,
    houses: snap.houses, fromHistory: true,
  };
  mountFarm(farmKey, farmData,
    `${snap.houses.length} เล้า · 📁 จากประวัติ${snap.round != null ? ' · รุ่น ' + snap.round : ''}`);
  renderDashboard();
}

async function handleFiles(files) {
  alertBox.innerHTML = '';
  if (files.length === 0) return;

  for (const file of files) {
    const farmKey = file.name.replace(/\.xlsx?$/i, '').replace(/[^a-z0-9ก-๙]/gi, '_');

    const item = document.createElement('div');
    item.className = 'file-item loading';
    item.innerHTML = `
      <div class="file-row">
        <div class="loader"></div>
        <div class="fname">${escapeHtml(file.name)}</div>
        <div class="meta">${(file.size/1024).toFixed(0)} KB</div>
      </div>`;
    fileList.appendChild(item);

    try {
      const farmData = await parseExcelFile(file);
      mountFarm(farmKey, farmData,
        `${farmData.houses.length} เล้า · ${(file.size/1024).toFixed(0)} KB${farmData.round ? ' · รุ่น ' + farmData.round : ''}`,
        item);
      // auto-save to history (silent — never blocks the upload)
      saveSnapshot(farmData)
        .then(() => renderHistory())
        .catch(e => console.warn('บันทึกประวัติไม่สำเร็จ:', e.message));
      // auto-sync to Google Sheets if configured (silent — never blocks upload)
      if (typeof syncToSheets === 'function') {
        syncToSheets(farmData).then(result => {
          if (typeof updateSheetsSyncStatus === 'function') updateSheetsSyncStatus();
          if (result.ok) console.info(`Sheets sync: +${result.rowCount} rows`);
        });
      }
    } catch (err) {
      item.className = 'file-item error';
      item.innerHTML = `
        <div class="file-row">
          <div style="color:var(--red); font-weight:600">⚠</div>
          <div class="fname">${escapeHtml(file.name)}</div>
          <div class="meta" style="color:var(--red)">${escapeHtml(err.message)}</div>
          <button class="x">×</button>
        </div>`;
      item.querySelector('.x').onclick = () => item.remove();
    }
  }

  renderDashboard();
}

// ========== TABLE SORT HANDLERS ==========

document.querySelectorAll('#mort-table thead th.sortable').forEach(th => {
  th.onclick = () => {
    const col = th.dataset.sort;
    if (mortSort.col === col) mortSort.dir = mortSort.dir === 'asc' ? 'desc' : 'asc';
    else { mortSort.col = col; mortSort.dir = 'desc'; }
    renderMortality(Object.keys(STATE.farms));
  };
});

document.querySelectorAll('#feed-table thead th.sortable').forEach(th => {
  th.onclick = () => {
    const col = th.dataset.sort;
    if (feedSort.col === col) feedSort.dir = feedSort.dir === 'asc' ? 'desc' : 'asc';
    else { feedSort.col = col; feedSort.dir = 'asc'; }
    renderFeed(Object.keys(STATE.farms));
  };
});

// ========== PRICE / ENV INPUT HANDLERS ==========

document.getElementById('age-slider').addEventListener('input', updateWindCalc);
document.getElementById('ambient-temp').addEventListener('input', updateWindCalc);

// ========== TAB SWITCHING ==========

document.querySelectorAll('.tab').forEach(tab => {
  tab.onclick = () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
});

// ========== EXPORT BUTTON BINDINGS ==========

document.getElementById('exp-json').onclick = exportJSON;
document.getElementById('exp-mort-csv').onclick = exportMortalityCSV;
document.getElementById('exp-feed-csv').onclick = exportFeedCSV;

// ========== INIT ==========

document.getElementById('header-date').textContent = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });

// ========== SETTINGS TAB · Google Sheets sync ==========
// Wire up Settings tab inputs + load the Apps Script template into the
// page so the operator can copy it without leaving the app.
(function initSheetsSettings() {
  const wh = document.getElementById('sheets-webhook-url');
  const ch = document.getElementById('sheets-chart-url');
  if (!wh || !ch) return;

  renderSheetsSettings();
  renderSheetsChartEmbed();

  // Load the Apps Script template file (best-effort — fall back to a
  // copyable hint if served from file:// where fetch may not work).
  fetch('docs/apps-script-template.gs')
    .then(r => r.ok ? r.text() : Promise.reject(new Error('HTTP ' + r.status)))
    .then(code => { document.getElementById('apps-script-code').textContent = code; })
    .catch(() => {
      document.getElementById('apps-script-code').textContent =
        '// ไม่สามารถโหลด apps-script-template.gs ได้ — เปิดไฟล์โดยตรงที่:\n' +
        '// farmsense/docs/apps-script-template.gs';
    });

  // Save handler — strips whitespace, persists, and refreshes the
  // status pill + the chart embed so the user sees the change at once.
  document.getElementById('sheets-save-btn').onclick = () => {
    saveSheetsConfig({
      webhookUrl: wh.value.trim(),
      chartUrl: ch.value.trim(),
    });
    updateSheetsSyncStatus();
    renderSheetsChartEmbed();
    flashStatus('✓ บันทึกแล้ว', 'good');
  };

  // Test connection — POSTs a heartbeat row so the user gets a real
  // green/red light, not just a happy "saved" toast.
  document.getElementById('sheets-test-btn').onclick = async () => {
    const url = wh.value.trim();
    if (!url) { flashStatus('⚠ ยังไม่ได้กรอก URL', 'warn'); return; }
    saveSheetsConfig({ webhookUrl: url });
    const probeFarm = {
      name: '__test__', round: null, date: new Date().toISOString().slice(0,10),
      houses: [{ house: 'TEST', age: 0, qty_in: 0, qty_rem: 0,
                 death_day: 0, death_cum: 0, pct_cum: 0 }],
    };
    const res = await syncToSheets(probeFarm);
    if (res.ok) flashStatus(`✓ เชื่อมต่อสำเร็จ (+${res.rowCount} แถวทดสอบ)`, 'good');
    else        flashStatus(`✗ ล้มเหลว: ${res.error || 'unknown'}`, 'bad');
    updateSheetsSyncStatus();
  };

  // Re-sync everything currently loaded — useful after first-time setup.
  document.getElementById('sheets-sync-all-btn').onclick = async () => {
    if (Object.keys(STATE.farms).length === 0) {
      flashStatus('⚠ ยังไม่มีฟาร์มที่โหลด — อัปโหลดไฟล์ก่อน', 'warn');
      return;
    }
    const r = await syncAllFarmsToSheets();
    flashStatus(`Sync เสร็จ · ${r.okCount} ฟาร์ม · +${r.totalRows} แถว · ล้มเหลว ${r.failCount}`,
                r.failCount === 0 ? 'good' : 'warn');
    updateSheetsSyncStatus();
  };

  // Copy-to-clipboard for the Apps Script template.
  document.getElementById('apps-script-copy-btn').onclick = async () => {
    const code = document.getElementById('apps-script-code').textContent;
    try {
      await navigator.clipboard.writeText(code);
      flashStatus('✓ Copy โค้ดเรียบร้อย — paste ใน Apps Script editor ได้เลย', 'good');
    } catch (e) {
      flashStatus('⚠ Copy ไม่สำเร็จ — เลือกข้อความใน <pre> แล้ว Ctrl+C', 'warn');
    }
  };

  function flashStatus(msg, kind) {
    const el = document.getElementById('sheets-sync-status');
    if (!el) return;
    const dot = kind === 'good' ? 'good' : kind === 'bad' ? 'bad' : 'warn';
    el.innerHTML = `<span class="dot ${dot}"></span>${escapeHtml(msg)}`;
    setTimeout(updateSheetsSyncStatus, 4000);
  }
})();

// Inject the configured mortality thresholds into the Alerts-tab lede so
// the displayed numbers always match MORTALITY_THRESHOLDS in constants.js.
{
  const dEl = document.getElementById('al-d-thresh');
  const cEl = document.getElementById('al-c-thresh');
  if (dEl) dEl.textContent = (MORTALITY_THRESHOLDS.dailyPct * 100).toFixed(2) + '%';
  if (cEl) cEl.textContent = MORTALITY_THRESHOLDS.cumulativePct.toFixed(1) + '%';
}

// show any previously-saved history on load
renderHistory();
