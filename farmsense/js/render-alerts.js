// ====================================================================
// FARMSENSE · Daily Overview tab (ภาพรวมรายวัน)
//
// One card per house, everything about that house in one place — so the
// operator scans cards top-to-bottom instead of cross-referencing four
// separate tables. Cards are sorted: ALERT → WATCH → OK.
//
//   - Headline banner ............... how the farm is doing overall today
//   - KPI strip ..................... 4 numbers summarising the day
//   - Priority cards ................ houses with ALERT or WATCH
//   - OK cards ...................... houses that look fine (compact view)
//   - Age-banded disease reference .. checklist by current age band
// ====================================================================

const RISK_PILL  = { OK: 'ok', WATCH: 'light', ALERT: 'crit' };
const RISK_LABEL = { OK: 'ปกติ', WATCH: 'เฝ้าระวัง', ALERT: 'เกินเกณฑ์' };
const DISEASE_RISK_CLS = { high: 'crit', med: 'high', low: 'watch' };
const DISEASE_RISK_LBL = { high: 'เสี่ยงสูง', med: 'ปานกลาง', low: 'ต่ำ' };

// Combine the cumulative + daily statuses into one overall ranking for
// the card. ALERT beats WATCH beats OK; daily beats cumulative when
// they tie (today's spike is more urgent than a slow drift).
function overallStatus(d, c) {
  const rank = { ALERT: 2, WATCH: 1, OK: 0 };
  const ds = d ? d.status : 'OK';
  const cs = c ? c.status : 'OK';
  return rank[ds] >= rank[cs] ? ds : cs;
}

function renderAlerts(farmKeys) {
  const allHouses = [];
  for (const fk of farmKeys) {
    for (const h of STATE.farms[fk].houses) {
      allHouses.push({ ...h, farmKey: fk, farmName: STATE.farms[fk].name });
    }
  }

  renderDailyBanner(allHouses, farmKeys);
  renderAlertsKpi(allHouses, farmKeys);
  renderHouseCards(allHouses, farmKeys);
  renderDiseaseWatch(allHouses, farmKeys);

  // Tab badge = UNIQUE house count over alert threshold (don't double
  // count a house that trips both daily AND cumulative).
  const counts = countAlerts(farmKeys);
  const badge = document.getElementById('cnt-alerts');
  if (badge) {
    badge.textContent = counts.alertHouses > 0 ? counts.alertHouses : '';
  }
}

// ---------- Headline banner (one line, big text) ----------
function renderDailyBanner(allHouses, farmKeys) {
  const host = document.getElementById('daily-banner');
  if (!host) return;

  const states = allHouses.map(h => {
    const d = mortalityDailyAlert(h);
    const c = mortalityCumulativeAlert(h);
    return overallStatus(d, c);
  });
  const alerts = states.filter(s => s === 'ALERT').length;
  const watches = states.filter(s => s === 'WATCH').length;

  let cls, icon, msg;
  if (alerts > 0) {
    cls = 'banner-bad'; icon = '🚨';
    msg = `<b>${alerts} เล้าทะลุเกณฑ์</b> ต้องเข้าตรวจสอบทันที` +
          (watches > 0 ? ` · เฝ้าระวังอีก ${watches} เล้า` : '');
  } else if (watches > 0) {
    cls = 'banner-warn'; icon = '⚠️';
    msg = `<b>${watches} เล้าเฝ้าระวัง</b> ใกล้ทะลุเกณฑ์ — ติดตามใกล้ชิด`;
  } else {
    cls = 'banner-good'; icon = '✓';
    msg = `<b>ทุกเล้าอยู่ในเกณฑ์ปกติ</b> ${allHouses.length} เล้า`;
  }

  host.innerHTML = `
    <div class="daily-banner ${cls}">
      <div class="db-icon">${icon}</div>
      <div class="db-msg">${msg}</div>
    </div>`;
}

// ---------- KPI strip ----------
function renderAlertsKpi(allHouses, farmKeys) {
  const totalDeadToday = allHouses.reduce((s, h) => s + (h.death_day || 0), 0);
  const totalRem = allHouses.reduce((s, h) => s + (h.qty_rem || 0), 0);
  const farmDailyPct = totalRem > 0 ? (totalDeadToday / totalRem) * 100 : 0;
  const totalDeadCum = allHouses.reduce((s, h) => s + (h.death_cum || 0), 0);
  const totalIn = allHouses.reduce((s, h) => s + (h.qty_in || 0), 0);
  const farmCumPct = totalIn > 0 ? (totalDeadCum / totalIn) * 100 : 0;

  // Unique-house alert count (worst-of daily/cum). A house tripping both
  // thresholds is counted once, not twice.
  const counts = countAlerts(farmKeys);
  const t = MORTALITY_THRESHOLDS;
  const dailyClass = farmDailyPct >= t.dailyPct*100 ? 'warn'
    : farmDailyPct >= t.warnDailyPct*100 ? 'warn' : 'good';
  const cumClass = farmCumPct >= t.cumulativePct ? 'warn'
    : farmCumPct >= t.warnCumulativePct ? 'warn' : 'good';

  document.getElementById('alerts-kpi').innerHTML = `
    <div class="stat">
      <div class="lab">ตายวันนี้รวม</div>
      <div class="val">${fmtNum(totalDeadToday)}</div>
      <div class="delta ${dailyClass}">${farmDailyPct.toFixed(3)}%/วัน · เกณฑ์ ${(t.dailyPct*100).toFixed(2)}%</div>
    </div>
    <div class="stat">
      <div class="lab">ตายสะสมรวม</div>
      <div class="val">${fmtNum(totalDeadCum)}</div>
      <div class="delta ${cumClass}">${farmCumPct.toFixed(2)}% · เกณฑ์ ${t.cumulativePct.toFixed(1)}%</div>
    </div>
    <div class="stat">
      <div class="lab">เล้าทะลุเกณฑ์</div>
      <div class="val">${counts.alertHouses}</div>
      <div class="delta ${counts.alertHouses > 0 ? 'warn' : 'good'}">จาก ${allHouses.length} เล้า · เฝ้าระวัง ${counts.watchHouses}</div>
    </div>
    <div class="stat">
      <div class="lab">เล้าคงเหลือ</div>
      <div class="val">${fmtNum(totalRem)}</div>
      <div class="delta">จาก ${fmtNum(totalIn)} ลง</div>
    </div>
  `;
}

// ---------- Per-house cards ----------
function renderHouseCards(allHouses, farmKeys) {
  // Annotate every house with daily/cum/cull/env + overall status, so the
  // sort and the card rendering both work off the same precomputed bundle.
  const rows = allHouses.map(h => {
    const daily = mortalityDailyAlert(h);
    const cum   = mortalityCumulativeAlert(h);
    const cull  = cullAmPmBreakdown(h);
    const env   = investigateEnv(h);
    const status = overallStatus(daily, cum);
    return { h, daily, cum, cull, env, status };
  });

  const rank = { ALERT: 2, WATCH: 1, OK: 0 };
  rows.sort((a, b) => {
    if (rank[a.status] !== rank[b.status]) return rank[b.status] - rank[a.status];
    // tie-breaker: higher cumulative % first
    return (b.cum ? b.cum.pct : 0) - (a.cum ? a.cum.pct : 0);
  });

  const priority = rows.filter(r => r.status !== 'OK');
  const ok       = rows.filter(r => r.status === 'OK');

  document.getElementById('cards-priority-count').textContent =
    priority.length > 0 ? `(${priority.length} เล้า)` : '(ไม่มี)';
  document.getElementById('cards-ok-count').textContent =
    ok.length > 0 ? `(${ok.length} เล้า)` : '';

  const pHost = document.getElementById('house-cards-priority');
  const oHost = document.getElementById('house-cards-ok');

  if (priority.length === 0) {
    pHost.innerHTML = `<div class="insight good">✓ ไม่มีเล้าที่ต้องเฝ้าระวังเป็นพิเศษ</div>`;
  } else {
    pHost.innerHTML = priority.map((row, i) => buildHouseCard(row, i, farmKeys, false)).join('');
  }

  oHost.innerHTML = ok.length === 0
    ? '<div class="insight">–</div>'
    : ok.map((row, i) => buildHouseCard(row, i, farmKeys, true)).join('');
}

// Build the HTML for one house card. `compact` lays out the OK list
// (smaller, less detail) — the priority section uses the full view.
function buildHouseCard(row, idx, farmKeys, compact) {
  const { h, daily, cum, cull, env, status } = row;
  const farmClass = getFarmClass(h.farmKey, farmKeys);
  const statusCls = status === 'ALERT' ? 'card-alert' : status === 'WATCH' ? 'card-watch' : 'card-ok';
  const statusLabel = RISK_LABEL[status];
  const statusEmoji = status === 'ALERT' ? '🔴' : status === 'WATCH' ? '🟡' : '🟢';

  // ── Header ──
  const farmShort = escapeHtml(h.farmName.replace('ฟาร์ม',''));
  const header = `
    <div class="hc-head">
      <div class="hc-title">
        <span class="hc-emoji">${statusEmoji}</span>
        <span class="pill ${farmClass}">${farmShort}</span>
        <b>เล้า ${escapeHtml(String(h.house))}</b>
        <span class="hc-age">อายุ ${h.age != null ? h.age : '–'} วัน</span>
      </div>
      <span class="pill ${RISK_PILL[status]}">${statusLabel}</span>
    </div>`;

  if (compact) {
    const cumPct = cum ? cum.pct.toFixed(2) + '%' : '–';
    const dailyPct = daily ? (daily.pct * 100).toFixed(3) + '%' : '–';
    return `<div class="house-card ${statusCls} compact">
      ${header}
      <div class="hc-compact-row">
        <span><span class="lab">สะสม</span> <b>${cumPct}</b></span>
        <span><span class="lab">วันนี้</span> <b>${dailyPct}</b></span>
        <span><span class="lab">ตายวันนี้</span> <b>${fmtNum(h.death_day)}</b></span>
      </div>
    </div>`;
  }

  // ── Two mortality stats side-by-side ──
  const cumPct = cum ? cum.pct : 0;
  const cumFill = cum ? cum.fillPct : 0;
  const cumStatus = cum ? cum.status : 'OK';
  const dailyPct = daily ? daily.pct * 100 : 0;
  const dailyStatus = daily ? daily.status : 'OK';
  const dailyThreshPct = MORTALITY_THRESHOLDS.dailyPct * 100;
  const dailyFill = daily ? Math.min(100, (daily.pct / MORTALITY_THRESHOLDS.dailyPct) * 100) : 0;

  const stats = `
    <div class="hc-stats">
      <div class="hc-stat ${cumStatus.toLowerCase()}">
        <div class="hc-stat-lab">ตายสะสม</div>
        <div class="hc-stat-val">${cumPct.toFixed(2)}<small>%</small></div>
        <div class="hc-stat-bar"><i style="width:${cumFill}%"></i></div>
        <div class="hc-stat-foot">เกณฑ์ ${MORTALITY_THRESHOLDS.cumulativePct.toFixed(1)}% · ตาย ${fmtNum(h.death_cum)}</div>
      </div>
      <div class="hc-stat ${dailyStatus.toLowerCase()}">
        <div class="hc-stat-lab">ตายวันนี้</div>
        <div class="hc-stat-val">${dailyPct.toFixed(3)}<small>%</small></div>
        <div class="hc-stat-bar"><i style="width:${dailyFill}%"></i></div>
        <div class="hc-stat-foot">เกณฑ์ ${dailyThreshPct.toFixed(2)}% · ตาย ${fmtNum(h.death_day)} จาก ${fmtNum(h.qty_rem)}</div>
      </div>
    </div>`;

  // ── Cull AM/PM mini split (only when there are culls) ──
  let cullBlock = '';
  if (cull && cull.cullTotal > 0) {
    const patternLabel = cull.pattern === 'HEAT'
      ? 'คัดเย็นเยอะ → ร้อน/heat stress'
      : cull.pattern === 'NIGHT'
        ? 'คัดเช้าเยอะ → หนาว/ปัญหากลางคืน'
        : 'สม่ำเสมอ';
    const patternCls = cull.pattern === 'HEAT' ? 'cf' : cull.pattern === 'NIGHT' ? 'high' : 'ok';
    cullBlock = `
      <div class="hc-cull">
        <div class="hc-cull-head">
          <span class="lab">การคัด · ${fmtNum(cull.cullTotal)} ตัว</span>
          <span class="pill ${patternCls}">${patternLabel}</span>
        </div>
        <div class="hc-cull-bar">
          <div class="cull-seg am" style="flex-grow:${cull.amCull}"
               title="คัดเช้า ${cull.amCull}">${cull.amCull > 0 ? `เช้า ${cull.amCull} (${cull.amCullPct.toFixed(0)}%)` : ''}</div>
          <div class="cull-seg pm" style="flex-grow:${cull.pmCull}"
               title="คัดเย็น ${cull.pmCull}">${cull.pmCull > 0 ? `เย็น ${cull.pmCull} (${cull.pmCullPct.toFixed(0)}%)` : ''}</div>
        </div>
      </div>`;
  }

  // ── Environment investigation checklist ──
  let envBlock = '';
  if (env) {
    const fpm = env.fpmBand ? `${env.fpmBand[0]}–${env.fpmBand[1]} FPM` : '–';
    const ms  = env.fpmMs ? ` (${env.fpmMs[0]}–${env.fpmMs[1]} m/s)` : '';
    const checklist = [
      { icon: '🌡️', label: 'อุณหภูมิเป้า', val: env.tempTarget != null ? env.tempTarget.toFixed(1) + '°C' : '–' },
      { icon: '🌬️', label: 'แรงลม', val: fpm + ms },
      { icon: '💧', label: 'ความชื้น', val: env.rhTarget || '–' },
      { icon: '🚰', label: 'ปั๊มแพดเปิดที่', val: env.pumpTrigger != null ? env.pumpTrigger.toFixed(1) + '°C' : '–' },
    ];
    const isAlert = status === 'ALERT';
    envBlock = `
      <div class="hc-env ${isAlert ? 'urgent' : ''}">
        <div class="hc-env-head">
          ${isAlert ? '⚠️ <b>ต้องเช็คหน้างาน:</b> ' : '<b>เกณฑ์สภาพแวดล้อมตามอายุ:</b>'}
          เทียบกับค่าจริงในเล้า
        </div>
        <div class="hc-env-grid">
          ${checklist.map(c => `
            <div class="hc-env-item">
              <span class="env-icon">${c.icon}</span>
              <span class="env-lab">${c.label}</span>
              <span class="env-val">${escapeHtml(String(c.val))}</span>
            </div>`).join('')}
        </div>
        ${env.warn ? `<div class="hc-env-warn">💡 ${escapeHtml(env.warn)}</div>` : ''}
      </div>`;
  }

  return `<div class="house-card ${statusCls}">
    ${header}
    ${stats}
    ${cullBlock}
    ${envBlock}
  </div>`;
}

// ---------- Disease watch by age (unchanged behaviour, cleaner copy) ----------
function renderDiseaseWatch(allHouses, farmKeys) {
  const buckets = new Map();
  for (const h of allHouses) {
    const band = diseasesByAge(h.age);
    if (!band) continue;
    const key = `${band.ageMin}-${band.ageMax}`;
    if (!buckets.has(key)) buckets.set(key, { band, houses: [] });
    buckets.get(key).houses.push(h);
  }
  const container = document.getElementById('disease-watch');
  if (buckets.size === 0) {
    container.innerHTML = `<div class="insight">ไม่พบเล้าที่มีข้อมูลอายุ</div>`;
    return;
  }

  const sortedBands = [...buckets.values()].sort((a, b) => a.band.ageMin - b.band.ageMin);

  container.innerHTML = sortedBands.map(({ band, houses }) => {
    const housePills = houses.map(h =>
      `<span class="house-tag"><span class="pill ${getFarmClass(h.farmKey, farmKeys)}">${escapeHtml(h.farmName.replace('ฟาร์ม',''))}</span> <b>${escapeHtml(String(h.house))}</b><span class="age">${h.age}d</span></span>`
    ).join('');
    const diseaseRows = band.diseases.map(d => `
      <div class="disease-row">
        <div class="d-head">
          <span class="pill ${DISEASE_RISK_CLS[d.risk] || 'watch'}">${DISEASE_RISK_LBL[d.risk] || '–'}</span>
          <b>${escapeHtml(d.name)}</b>
        </div>
        <div class="d-signs">${escapeHtml(d.signs)}</div>
      </div>`).join('');

    return `
      <div class="disease-card">
        <div class="disease-head">
          <h4>${escapeHtml(band.label)}</h4>
          <div class="house-tags">${housePills}</div>
        </div>
        <div class="disease-list">${diseaseRows}</div>
        <div class="disease-routine">
          <span class="lab">การจัดการช่วงนี้:</span> ${escapeHtml(band.routine)}
        </div>
      </div>`;
  }).join('');
}

// ---------- Overview alert summary card (compact, single line) ----------
function renderOverviewAlertCard(farmKeys) {
  const host = document.getElementById('overview-alert-card');
  if (!host) return;
  const counts = countAlerts(farmKeys);
  const total = counts.dailyAlert + counts.cumAlert + counts.dailyWatch + counts.cumWatch;
  if (total === 0) {
    host.innerHTML = `<div class="insight good">✓ ไม่มีเล้าทะลุเกณฑ์ตายรายวัน/สะสม</div>`;
    return;
  }

  const parts = [];
  if (counts.cumAlert > 0) parts.push(`<b class="crit">${counts.cumAlert} เล้า</b> ตายสะสมเกิน ${MORTALITY_THRESHOLDS.cumulativePct.toFixed(1)}%`);
  if (counts.dailyAlert > 0) parts.push(`<b class="crit">${counts.dailyAlert} เล้า</b> ตายรายวันเกิน ${(MORTALITY_THRESHOLDS.dailyPct*100).toFixed(2)}%`);
  if (counts.cumWatch > 0) parts.push(`<b class="warn">${counts.cumWatch}</b> เฝ้าระวังตายสะสม`);
  if (counts.dailyWatch > 0) parts.push(`<b class="warn">${counts.dailyWatch}</b> เฝ้าระวังตายรายวัน`);

  const level = (counts.cumAlert + counts.dailyAlert) > 0 ? 'crit' : 'warn';
  host.innerHTML = `
    <div class="alert-card ${level}">
      <div class="ac-icon">🚨</div>
      <div class="ac-body">
        <b>มีเล้าที่ต้องสอบสวน</b> · ${parts.join(' · ')}
        <div class="ac-cta">เปิดแท็บ <b>ภาพรวมรายวัน</b> เพื่อดูเล้าแต่ละหลัง</div>
      </div>
    </div>`;
}
