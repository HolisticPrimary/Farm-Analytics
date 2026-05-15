// ====================================================================
// FARMSENSE · Google Sheets sync + chart embed
//
// One-time setup by the user:
//   1. Create a Google Sheet
//   2. Tools → Apps Script → paste the template from
//      docs/apps-script-template.gs (also shown in the Settings tab)
//   3. Deploy as Web App (Execute as: me, Access: anyone) → copy URL
//   4. Insert chart in the sheet → Publish → copy the published URL
//   5. Paste both URLs into FarmSense Settings tab
//
// After setup, every upload silently POSTs one row per house to the
// Apps Script Web App, which appends the rows to the sheet. The chart
// in the sheet (and its embed iframe inside FarmSense) update in real
// time.
// ====================================================================

const SHEETS_LS_KEYS = {
  webhookUrl: 'farmsense.sheetsWebhook',
  chartUrl:   'farmsense.sheetsChart',
  lastSyncAt: 'farmsense.sheetsLastSync',
  lastSyncOk: 'farmsense.sheetsLastSyncOk',
};

function getSheetsConfig() {
  try {
    return {
      webhookUrl: localStorage.getItem(SHEETS_LS_KEYS.webhookUrl) || '',
      chartUrl:   localStorage.getItem(SHEETS_LS_KEYS.chartUrl)   || '',
      lastSyncAt: localStorage.getItem(SHEETS_LS_KEYS.lastSyncAt) || '',
      lastSyncOk: localStorage.getItem(SHEETS_LS_KEYS.lastSyncOk) === '1',
    };
  } catch (e) {
    return { webhookUrl: '', chartUrl: '', lastSyncAt: '', lastSyncOk: false };
  }
}

function saveSheetsConfig(patch) {
  try {
    if (patch.webhookUrl != null) localStorage.setItem(SHEETS_LS_KEYS.webhookUrl, patch.webhookUrl);
    if (patch.chartUrl   != null) localStorage.setItem(SHEETS_LS_KEYS.chartUrl,   patch.chartUrl);
    if (patch.lastSyncAt != null) localStorage.setItem(SHEETS_LS_KEYS.lastSyncAt, patch.lastSyncAt);
    if (patch.lastSyncOk != null) localStorage.setItem(SHEETS_LS_KEYS.lastSyncOk, patch.lastSyncOk ? '1' : '0');
  } catch (e) { /* ignore — sandboxed contexts */ }
}

// Build one flat row per house. The schema must match the column order
// the Apps Script writes — keep them in sync if you change either side.
function buildSheetsRows(farmData) {
  const rows = [];
  const uploadedAt = new Date().toISOString();
  const date = farmData.date || uploadedAt.slice(0, 10);
  for (const h of farmData.houses) {
    const wf = waterFeedRatio(h);
    const pctDaily = (h.death_day != null && h.qty_rem)
      ? (h.death_day / h.qty_rem) * 100
      : null;
    rows.push({
      uploadedAt,
      farm:  farmData.name || '',
      round: farmData.round != null ? farmData.round : '',
      date,
      house: h.house != null ? String(h.house) : '',
      age:   h.age,
      qty_in:  h.qty_in,
      qty_rem: h.qty_rem,
      death_day: h.death_day,
      death_cum: h.death_cum,
      pct_cum:   h.pct_cum,
      pct_daily: pctDaily != null ? Number(pctDaily.toFixed(4)) : null,
      feed_day:  h.feed_day,
      water:     h.water,
      wt_age:    h.wt_age,
      water_feed_ratio: wf ? Number(wf.ratio.toFixed(2)) : null,
      cull_morning: h.m_culled,
      cull_evening: h.e_culled,
      died_morning: h.m_died,
      died_evening: h.e_died,
    });
  }
  return rows;
}

// Send rows to the Apps Script Web App.
//   - Uses `text/plain` to avoid the CORS preflight that Apps Script
//     can't answer (the preflight returns 403 from script.google.com).
//   - `mode: 'cors'` is fine for the simple POST itself — Apps Script
//     returns CORS headers when deployed as "Anyone".
//   - Returns { ok, rowCount } so the UI can show a tiny toast.
async function syncToSheets(farmData) {
  const { webhookUrl } = getSheetsConfig();
  if (!webhookUrl) return { ok: false, skipped: true, reason: 'no-url' };
  const rows = buildSheetsRows(farmData);
  if (rows.length === 0) return { ok: false, skipped: true, reason: 'no-rows' };
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ rows }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    saveSheetsConfig({ lastSyncAt: new Date().toISOString(), lastSyncOk: true });
    return { ok: true, rowCount: rows.length };
  } catch (e) {
    saveSheetsConfig({ lastSyncAt: new Date().toISOString(), lastSyncOk: false });
    console.warn('Sheets sync failed:', e.message);
    return { ok: false, error: e.message, rowCount: rows.length };
  }
}

// Sync every loaded farm at once — used by the "Sync ทั้งหมดอีกครั้ง"
// button so the user can backfill after first configuring the webhook.
async function syncAllFarmsToSheets() {
  const farmKeys = Object.keys(STATE.farms);
  let okCount = 0, failCount = 0, totalRows = 0;
  for (const fk of farmKeys) {
    const farm = STATE.farms[fk];
    const result = await syncToSheets(farm);
    if (result.ok) { okCount++; totalRows += result.rowCount; }
    else if (!result.skipped) failCount++;
  }
  return { okCount, failCount, totalRows };
}

// ---------- Settings UI ----------

function renderSheetsSettings() {
  const cfg = getSheetsConfig();
  const wh = document.getElementById('sheets-webhook-url');
  const ch = document.getElementById('sheets-chart-url');
  if (!wh) return;
  wh.value = cfg.webhookUrl;
  ch.value = cfg.chartUrl;
  updateSheetsSyncStatus();
}

function updateSheetsSyncStatus() {
  const status = document.getElementById('sheets-sync-status');
  if (!status) return;
  const cfg = getSheetsConfig();
  if (!cfg.webhookUrl) {
    status.innerHTML = '<span class="dot mute"></span>ยังไม่ได้ตั้งค่า Web App URL';
    return;
  }
  if (!cfg.lastSyncAt) {
    status.innerHTML = '<span class="dot mute"></span>พร้อมใช้งาน · ยังไม่ได้ sync ครั้งแรก';
    return;
  }
  const when = new Date(cfg.lastSyncAt);
  const timeStr = when.toLocaleString('th-TH', { hour: '2-digit', minute: '2-digit', day:'numeric', month:'short' });
  if (cfg.lastSyncOk) {
    status.innerHTML = `<span class="dot good"></span>Sync ล่าสุดสำเร็จ · ${timeStr}`;
  } else {
    status.innerHTML = `<span class="dot bad"></span>Sync ล่าสุดล้มเหลว · ${timeStr} — ตรวจ URL/Deploy permissions`;
  }
}

// ---------- Chart embed ----------

// Accept either:
//   (a) a bare published URL (e.g. https://docs.google.com/spreadsheets/d/.../pubchart?oid=...&format=interactive)
//   (b) the full <iframe> HTML snippet copied from "Publish to web"
function normalizeChartUrl(input) {
  if (!input) return '';
  const m = input.match(/src="([^"]+)"/);
  return m ? m[1] : input.trim();
}

function renderSheetsChartEmbed() {
  const host = document.getElementById('sheets-chart-embed');
  if (!host) return;
  const { chartUrl } = getSheetsConfig();
  if (!chartUrl) {
    // No real chart configured yet — show an inline demo so the user
    // knows what shape they'll get once Sheets is wired up. The demo is
    // a self-contained SVG so it works offline and never makes network
    // calls; only the COPY (label) reminds them this is a sample.
    host.innerHTML = `
      <div class="card chart-demo-card">
        <h4>📈 ตัวอย่างกราฟแนวโน้ม <span class="demo-pill">DEMO</span></h4>
        <div class="card-sub">นี่คือ <b>ตัวอย่าง</b> รูปแบบที่จะเห็นเมื่อเชื่อม Google Sheets แล้ว — ข้อมูลจะเป็นของฟาร์มจริงและอัปเดตทุกวันที่อัปโหลด</div>
        ${buildDemoTrendChart()}
        <div class="insight" style="margin-top:14px">
          💡 วาง URL กราฟในกล่อง 2️⃣ ด้านบน แล้วกราฟจริงจะมาแทนที่ตรงนี้
        </div>
      </div>`;
    return;
  }
  const src = normalizeChartUrl(chartUrl);
  host.innerHTML = `
    <div class="card">
      <h4>📈 กราฟแนวโน้มจาก Google Sheets <small style="font-size:11px; color:var(--ink-mute); font-weight:400">· อัปเดต real-time</small></h4>
      <div class="card-sub">ข้อมูลที่อัปโหลดจะถูก append เข้า Sheet อัตโนมัติ · ปรับรูปแบบกราฟใน Sheets แล้วที่นี่จะตามไปทันที</div>
      <div class="sheets-embed-wrap">
        <iframe class="sheets-embed" src="${escapeHtml(src)}" frameborder="0"
          allowfullscreen
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"></iframe>
      </div>
    </div>`;
}

// Build an inline SVG line-chart that mirrors the shape a real Sheets
// chart would have once the operator uploads data daily over a round.
// Pure SVG (no external libs) so it works in any context.
function buildDemoTrendChart() {
  // Plot geometry
  const W = 760, H = 360;
  const M = { l: 56, r: 24, t: 18, b: 44 };
  const px = d => M.l + (d / 42) * (W - M.l - M.r);
  const py = v => H - M.b - (v / 6) * (H - M.t - M.b);

  // Four representative houses pulled from the four real farm files —
  // each ends at the snapshot's actual %สูญเสียสะสม, with a smooth
  // back-projection that matches the typical broiler-mortality curve
  // (steep day 1-7, flat day 8-21, gentle creep day 22-finish).
  const series = [
    { name: 'ฟาร์มพีพีฟู้ด · เล้า 2',   color: '#1f6ec0', currentDay: 33, currentPct: 2.59 },
    { name: 'ฟาร์มยิ่งรวย · เล้า 11',  color: '#d62828', currentDay: 38, currentPct: 5.08 },
    { name: 'ฟาร์มขวัญใจ · เล้า 11',   color: '#2e7d4f', currentDay: 41, currentPct: 3.06 },
    { name: 'ฟาร์มพุ่มวงศ์ · เล้า 10',  color: '#c8860b', currentDay: 34, currentPct: 3.59 },
  ];

  // Generate a curve from day 0..currentDay that ends at currentPct.
  // Front-load 60% of the loss in days 1-7 (brooding stress), then
  // grow gently linearly to the final figure.
  function curve(s) {
    const pts = [];
    const earlyEnd = 7, earlyShare = 0.6;
    const earlyPct = s.currentPct * earlyShare;
    for (let d = 0; d <= s.currentDay; d++) {
      let pct;
      if (d <= earlyEnd) {
        // S-curve in the first week (slow→fast→slow)
        const t = d / earlyEnd;
        const sCurve = t * t * (3 - 2 * t);  // smoothstep
        pct = earlyPct * sCurve;
      } else {
        const t = (d - earlyEnd) / (s.currentDay - earlyEnd);
        pct = earlyPct + (s.currentPct - earlyPct) * t;
      }
      pts.push([d, pct]);
    }
    return pts;
  }

  function pathFromPoints(pts) {
    return pts.map((p, i) => (i === 0 ? 'M' : 'L') + px(p[0]) + ',' + py(p[1])).join(' ');
  }

  // Axes — Y gridlines + threshold band
  const yTicks = [0, 1, 2, 3, 4, 5, 6];
  const yGrid = yTicks.map(v => `
    <line x1="${M.l}" x2="${W - M.r}" y1="${py(v)}" y2="${py(v)}"
          stroke="${v === 3 ? '#d62828' : '#e4e9f0'}"
          stroke-dasharray="${v === 3 ? '4 4' : '0'}" stroke-width="1"/>
    <text x="${M.l - 8}" y="${py(v) + 4}" text-anchor="end"
          font-family="JetBrains Mono, monospace" font-size="10" fill="#8a94a8">${v}%</text>`).join('');
  const xTicks = [0, 7, 14, 21, 28, 35, 42];
  const xGrid = xTicks.map(d => `
    <line x1="${px(d)}" x2="${px(d)}" y1="${py(0)}" y2="${py(0)+4}" stroke="#8a94a8"/>
    <text x="${px(d)}" y="${py(0)+18}" text-anchor="middle"
          font-family="JetBrains Mono, monospace" font-size="10" fill="#8a94a8">${d}</text>`).join('');

  // Threshold-band label
  const thresholdLabel = `
    <text x="${W - M.r - 4}" y="${py(3) - 6}" text-anchor="end"
          font-family="IBM Plex Sans Thai, sans-serif" font-size="10"
          font-weight="600" fill="#d62828">เกณฑ์ 3%</text>`;

  // Series paths + end-point markers
  const seriesSvg = series.map(s => {
    const pts = curve(s);
    const path = pathFromPoints(pts);
    const last = pts[pts.length - 1];
    return `
      <path d="${path}" fill="none" stroke="${s.color}" stroke-width="2.2"
            stroke-linejoin="round" stroke-linecap="round" opacity="0.95"/>
      <circle cx="${px(last[0])}" cy="${py(last[1])}" r="4" fill="${s.color}"/>
      <circle cx="${px(last[0])}" cy="${py(last[1])}" r="7" fill="${s.color}" opacity="0.18"/>`;
  }).join('');

  // Legend
  const legend = series.map(s => `
    <span class="legend-item">
      <span class="legend-swatch" style="background:${s.color}"></span>
      ${s.name} <small>· ปัจจุบัน ${s.currentPct.toFixed(2)}% (อายุ ${s.currentDay} วัน)</small>
    </span>`).join('');

  return `
    <div class="chart-demo-wrap">
      <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"
           preserveAspectRatio="xMidYMid meet" class="chart-demo-svg" role="img"
           aria-label="ตัวอย่างกราฟ %ตายสะสมตามอายุไก่">
        ${yGrid}
        ${xGrid}
        ${thresholdLabel}
        <text x="${M.l - 36}" y="${M.t + 4}" font-family="IBM Plex Sans Thai, sans-serif"
              font-size="11" font-weight="600" fill="#46526b" transform="rotate(-90 ${M.l - 36} ${M.t + 4})">
          %ตายสะสม
        </text>
        <text x="${W/2}" y="${H - 6}" text-anchor="middle"
              font-family="IBM Plex Sans Thai, sans-serif" font-size="11" fill="#46526b">
          อายุไก่ (วัน)
        </text>
        ${seriesSvg}
      </svg>
      <div class="chart-demo-legend">${legend}</div>
    </div>`;
}
