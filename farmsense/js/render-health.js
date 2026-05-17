// ====================================================================
// FARMSENSE · Health & Growth tab (§07)
//   7A cull vs died + เช้า/เย็น  ·  7B actual weight + ADG + FCR vs Ross
//   (water:feed ratio + feed waste live in §03 Feed tab now)
// ====================================================================

const PATTERN_PILL  = { EVEN: 'ok', HEAT: 'cf', NIGHT: 'light' };
const PATTERN_LABEL = { EVEN: 'สม่ำเสมอ', HEAT: 'เย็นหนัก · heat stress', NIGHT: 'เช้าหนัก · หนาว/กลางคืน' };
const WEIGHT_PILL   = { ABOVE: 'ok', BELOW: 'crit' };
const WEIGHT_LABEL  = { ABOVE: 'ผ่านเกณฑ์ ≥4.5×', BELOW: 'ต่ำกว่า 4.5×' };

function emptyRow(cols, msg) {
  return `<tr><td colspan="${cols}" style="text-align:center; padding:24px; color:var(--ink-mute)">${msg}</td></tr>`;
}

function renderHealth(farmKeys) {
  const allHouses = [];
  for (const fk of farmKeys) {
    for (const h of STATE.farms[fk].houses) {
      allHouses.push({ ...h, farmKey: fk, farmName: STATE.farms[fk].name });
    }
  }
  const pill = h => `<span class="pill ${getFarmClass(h.farmKey, farmKeys)}">${escapeHtml(h.farmName.replace('ฟาร์ม',''))}</span> <b>${h.house}</b>`;

  // ---------- KPIs ----------
  const bd = allHouses.map(h => ({ h, b: mortalityBreakdown(h) })).filter(x => x.b);
  const heatHouses = bd.filter(x => x.b.pattern === 'HEAT').length;
  const nightHouses = bd.filter(x => x.b.pattern === 'NIGHT').length;
  const totalCullPattern = bd.length;

  const wv = allHouses.map(h => ({ h, w: weightVsStandard(h) })).filter(x => x.w);
  const behind = wv.filter(x => x.w.status === 'BELOW').length;

  // Use weeklyWeightAnalysis for ADG/FCR overall counts
  const weeklyArr = allHouses.map(h => ({ h, w: weeklyWeightAnalysis(h) })).filter(x => x.w);
  const weeklyWarn = weeklyArr.filter(x => x.w.overall === 'WARN').length;
  const weeklyBad  = weeklyArr.filter(x => x.w.overall === 'BAD').length;

  document.getElementById('health-kpi').innerHTML = `
    <div class="stat">
      <div class="lab">เล้าที่ตายเย็นหนัก</div>
      <div class="val ${heatHouses > 0 ? 'warn' : 'good'}">${heatHouses}</div>
      <div class="delta ${heatHouses > 0 ? 'warn' : 'good'}">heat stress · จาก ${totalCullPattern} เล้า</div>
    </div>
    <div class="stat">
      <div class="lab">เล้าที่ตายเช้าหนัก</div>
      <div class="val ${nightHouses > 0 ? 'warn' : 'good'}">${nightHouses}</div>
      <div class="delta ${nightHouses > 0 ? 'warn' : 'good'}">หนาว/กลางคืน · จาก ${totalCullPattern} เล้า</div>
    </div>
    <div class="stat">
      <div class="lab">เล้าน้ำหนักต่ำกว่าเกณฑ์</div>
      <div class="val ${behind > 0 ? 'warn' : 'good'}">${wv.length ? behind : '–'}</div>
      <div class="delta ${behind > 0 ? 'warn' : 'good'}">น้ำหนัก &lt; 4.5× แรกเข้า</div>
    </div>
    <div class="stat">
      <div class="lab">เล้าโต/FCR ผิดปกติ</div>
      <div class="val ${(weeklyWarn + weeklyBad) > 0 ? 'warn' : 'good'}">${weeklyArr.length ? (weeklyWarn + weeklyBad) : '–'}</div>
      <div class="delta">เทียบ Ross 308 · จาก ${weeklyArr.length} เล้า</div>
    </div>
  `;

  // ---------- 7A · cull vs died + morning/evening — card layout ----------
  // One card per house: big numbers for died/culled, a single segmented
  // bar for AM vs PM, and a pattern badge ties it all together. Sorted
  // worst-first so heat-stress / night-pattern houses surface to the top.
  const PATTERN_RANK = { HEAT: 2, NIGHT: 1, EVEN: 0 };
  const PATTERN_EMOJI = { HEAT: '🔴', NIGHT: '🟡', EVEN: '🟢' };
  const cards = bd
    .sort((a, b) => {
      const dr = (PATTERN_RANK[b.b.pattern] || 0) - (PATTERN_RANK[a.b.pattern] || 0);
      if (dr !== 0) return dr;
      return b.b.died - a.b.died;
    })
    .map(x => {
      const { h, b } = x;
      const patternCls = b.pattern === 'HEAT' ? 'pattern-heat'
                       : b.pattern === 'NIGHT' ? 'pattern-night' : 'pattern-even';
      const badgePill  = b.pattern === 'HEAT' ? 'crit'
                       : b.pattern === 'NIGHT' ? 'light' : 'ok';
      const total = b.morning + b.evening;
      const amPct = total > 0 ? (b.morning / total) * 100 : 0;
      const pmPct = total > 0 ? (b.evening / total) * 100 : 0;
      const farmShort = escapeHtml(h.farmName.replace('ฟาร์ม',''));
      const farmCls = getFarmClass(h.farmKey, farmKeys);
      return `
        <div class="cull-card ${patternCls}">
          <div class="cc-head">
            <div class="cc-title">
              <span class="cc-emoji">${PATTERN_EMOJI[b.pattern]}</span>
              <span class="pill ${farmCls}">${farmShort}</span>
              <b>เล้า ${escapeHtml(String(h.house))}</b>
              ${h.age != null ? `<span class="cc-age">อายุ ${h.age} วัน</span>` : ''}
            </div>
            <span class="pill ${badgePill}">${PATTERN_LABEL[b.pattern]}</span>
          </div>
          <div class="cc-stats">
            <div class="cc-stat died">
              <div class="lab">ตายจริง</div>
              <div class="val">${fmtNum(b.died)}</div>
              <div class="sub">สูญเสียคุมไม่ได้</div>
            </div>
            <div class="cc-stat culled">
              <div class="lab">คัด</div>
              <div class="val">${fmtNum(b.culled)}</div>
              <div class="sub">จัดการเชิงรุก</div>
            </div>
          </div>
          <div class="cc-ampm">
            <div class="cc-ampm-head">
              <span class="lab">รวมสูญเสียวันนี้ · ${fmtNum(total)} ตัว</span>
            </div>
            <div class="cc-ampm-bar">
              <div class="seg am" style="flex-grow:${b.morning}"
                   title="เช้า ${b.morning}">${b.morning > 0 ? `เช้า ${b.morning}` : ''}</div>
              <div class="seg pm" style="flex-grow:${b.evening}"
                   title="เย็น ${b.evening}">${b.evening > 0 ? `เย็น ${b.evening}` : ''}</div>
            </div>
          </div>
        </div>`;
    }).join('');
  document.getElementById('cull-cards').innerHTML = cards ||
    `<div class="insight">ไม่มีข้อมูลแยก ตาย/คัด เช้า/เย็น — ไฟล์ Excel อาจไม่มีคอลัมน์ย่อย "ไก่ตาย/ไก่คัด"</div>`;

  // ---------- 7C · weekly weight / ADG / FCR vs Ross 308 ----------
  // One card per house, sorted by overall status (worst first). Each card
  // contains a small table of weighing days with ADG and FCR compared
  // against the Ross 308 mixed-sex reference, plus the "≥ 4.5×" rule
  // badge in the header.
  const WW_RANK = { BAD: 2, WARN: 1, GOOD: 0 };
  const WW_BADGE = {
    BAD:  { cls: 'crit',  text: '🚨 ต่ำกว่าเกณฑ์' },
    WARN: { cls: 'light', text: '⚠ ต้องเฝ้าระวัง' },
    GOOD: { cls: 'ok',    text: '✓ ตามเกณฑ์' },
  };
  const wkData = allHouses
    .map(h => ({ h, w: weeklyWeightAnalysis(h) }))
    .filter(x => x.w);
  wkData.sort((a, b) => (WW_RANK[b.w.overall] || 0) - (WW_RANK[a.w.overall] || 0));

  const wkCards = wkData.map(({ h, w }) => {
    const farmShort = escapeHtml(h.farmName.replace('ฟาร์ม',''));
    const farmCls = getFarmClass(h.farmKey, farmKeys);
    const cardCls = w.overall === 'BAD' ? 'card-bad'
                  : w.overall === 'WARN' ? 'card-warn' : 'card-good';
    const badge = WW_BADGE[w.overall];
    const rowsHtml = w.rows.map(r => {
      const adgCellCls = r.adgStatus === 'SLOW' ? 'pct-c'
                      : r.adgStatus === 'FAST' ? 'pct-o' : 'pct-w';
      const fcrCellCls = r.fcrStatus === 'POOR'  ? 'pct-c'
                      : r.fcrStatus === 'GREAT' ? 'pct-o' : 'pct-w';
      const adgRossStr = r.adgRoss != null ? r.adgRoss.toFixed(0) : '–';
      const fcrActualStr = r.fcrActual != null ? r.fcrActual.toFixed(2) : '–';
      const fcrRossStr = r.fcrRoss != null ? r.fcrRoss.toFixed(2) : '–';
      const adgDiff = r.adgDiffPct != null
        ? `<small style="color:var(--ink-mute)">(${r.adgDiffPct >= 0 ? '+' : ''}${r.adgDiffPct.toFixed(0)}%)</small>`
        : '';
      const fcrDiff = r.fcrDiffPct != null
        ? `<small style="color:var(--ink-mute)">(${r.fcrDiffPct >= 0 ? '+' : ''}${r.fcrDiffPct.toFixed(0)}%)</small>`
        : '';
      return `<tr>
        <td class="mono"><b>Day ${r.day}</b></td>
        <td class="mono">${r.weight.toFixed(3)}</td>
        <td class="mono ${adgCellCls}"><b>${r.adgActual.toFixed(0)}</b> ${adgDiff}</td>
        <td class="mono">${adgRossStr} g/d</td>
        <td class="mono ${fcrCellCls}"><b>${fcrActualStr}</b> ${fcrDiff}</td>
        <td class="mono">${fcrRossStr}</td>
      </tr>`;
    }).join('');
    return `
      <div class="wk-card ${cardCls}">
        <div class="wk-head">
          <div class="wk-title">
            <span class="pill ${farmCls}">${farmShort}</span>
            <b>เล้า ${escapeHtml(String(h.house))}</b>
            <span class="wk-age">อายุ ${h.age != null ? h.age : '–'} วัน · แรกเข้า ${(w.initial * 1000).toFixed(0)} ก.</span>
          </div>
          <span class="pill ${badge.cls}">${badge.text}</span>
        </div>
        <div class="wk-table-wrap">
          <table class="wk-table">
            <thead><tr>
              <th>วันที่ชั่ง</th>
              <th>น.น.จริง (kg)</th>
              <th>ADG จริง</th>
              <th>ADG Ross</th>
              <th>FCR จริง</th>
              <th>FCR Ross</th>
            </tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      </div>`;
  }).join('');

  document.getElementById('weight-cards').innerHTML = wkCards ||
    `<div class="insight">ไม่มีข้อมูลการชั่งน้ำหนักรายสัปดาห์ — ใบหน้าเล้าต้องมี H 1...H N กรอกน้ำหนัก + FCR</div>`;

  document.getElementById('cnt-health').textContent = allHouses.length;
}
