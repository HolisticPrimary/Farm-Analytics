// ====================================================================
// FARMSENSE · Health & Growth tab (Group A analyses)
//   7A water:feed ratio · 7B cull vs died + เช้า/เย็น
//   7C actual weight vs Ross 308 · 7D feed loaded vs eaten
// ====================================================================

const WATER_PILL   = { OK: 'ok', LOW: 'low', HIGH: 'high', BADDATA: 'over' };
const WATER_LABEL  = { OK: 'ปกติ', LOW: 'น้ำน้อย', HIGH: 'น้ำสูง', BADDATA: 'ข้อมูลผิด' };
const PATTERN_PILL  = { EVEN: 'ok', HEAT: 'cf', NIGHT: 'light' };
const PATTERN_LABEL = { EVEN: 'สม่ำเสมอ', HEAT: 'เย็นหนัก · heat stress', NIGHT: 'เช้าหนัก · หนาว/กลางคืน' };
const WEIGHT_PILL   = { ON: 'ok', BEHIND: 'low', AHEAD: 'watch' };
const WEIGHT_LABEL  = { ON: 'ตามเกณฑ์', BEHIND: 'โตช้า', AHEAD: 'โตเร็ว' };
const WASTE_PILL    = { OK: 'ok', WATCH: 'light', HIGH: 'low' };
const WASTE_LABEL   = { OK: 'ปกติ', WATCH: 'เฝ้าระวัง', HIGH: 'หกเยอะ' };

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
  const wf = allHouses.map(h => ({ h, r: waterFeedRatio(h) })).filter(x => x.r);
  const avgWF = wf.length ? wf.reduce((s,x) => s + x.r.ratio, 0) / wf.length : null;
  const wfAbnormal = wf.filter(x => x.r.status !== 'OK').length;

  const bd = allHouses.map(h => ({ h, b: mortalityBreakdown(h) })).filter(x => x.b);
  const avgCull = bd.length ? bd.reduce((s,x) => s + x.b.cullRate, 0) / bd.length : null;

  const wv = allHouses.map(h => ({ h, w: weightVsStandard(h) })).filter(x => x.w);
  const behind = wv.filter(x => x.w.status === 'BEHIND').length;

  document.getElementById('health-kpi').innerHTML = `
    <div class="stat">
      <div class="lab">น้ำ : อาหาร เฉลี่ย</div>
      <div class="val">${avgWF != null ? avgWF.toFixed(2) : '–'}</div>
      <div class="delta">มาตรฐาน 1.5–2.4</div>
    </div>
    <div class="stat">
      <div class="lab">เล้า น้ำ:อาหาร ผิดปกติ</div>
      <div class="val">${wf.length ? wfAbnormal : '–'}</div>
      <div class="delta ${wfAbnormal > 0 ? 'warn' : 'good'}">จาก ${wf.length} เล้าที่มีข้อมูล</div>
    </div>
    <div class="stat">
      <div class="lab">%คัด เฉลี่ย</div>
      <div class="val">${avgCull != null ? avgCull.toFixed(1) + '%' : '–'}</div>
      <div class="delta">ของการสูญเสียทั้งหมด</div>
    </div>
    <div class="stat">
      <div class="lab">เล้าโตช้ากว่าเกณฑ์</div>
      <div class="val">${wv.length ? behind : '–'}</div>
      <div class="delta ${behind > 0 ? 'warn' : 'good'}">น้ำหนัก &lt; เกณฑ์คละเพศ −5%</div>
    </div>
  `;

  // ---------- 7A · water : feed ----------
  const waterRows = wf
    .sort((a,b) => Math.abs(b.r.ratio - 2.0) - Math.abs(a.r.ratio - 2.0))
    .map((x, i) => {
      const { h, r } = x;
      const rowCls = (r.status === 'LOW' || r.status === 'BADDATA') ? 'crit' : r.status === 'HIGH' ? 'high' : '';
      return `<tr class="${rowCls}">
        <td><b>${i+1}</b></td>
        <td>${pill(h)}</td>
        <td class="mono">${h.age != null ? h.age : '–'}</td>
        <td class="mono">${fmtNum(h.water)}</td>
        <td class="mono">${fmtNum(h.feed_day)}</td>
        <td class="pct ${r.status === 'OK' ? 'pct-o' : 'pct-c'}">${r.ratio.toFixed(2)}</td>
        <td><span class="pill ${WATER_PILL[r.status]}">${WATER_LABEL[r.status]}</span></td>
        <td style="font-size:11px; color:var(--ink-soft)">${escapeHtml(r.advice)}</td>
      </tr>`;
    }).join('');
  document.getElementById('water-tbody').innerHTML = waterRows ||
    emptyRow(8, 'ไม่มีข้อมูลน้ำ/อาหาร — ไฟล์ Excel อาจไม่มีคอลัมน์ "น้ำ" หรือ "อาหาร/วัน"');

  // ---------- 7B · cull vs died + morning/evening ----------
  const cullRows = bd
    .sort((a,b) => b.b.died - a.b.died)
    .map((x, i) => {
      const { h, b } = x;
      const rowCls = b.pattern === 'HEAT' ? 'crit' : b.pattern === 'NIGHT' ? 'high' : '';
      return `<tr class="${rowCls}">
        <td><b>${i+1}</b></td>
        <td>${pill(h)}</td>
        <td class="mono pct-c">${fmtNum(b.died)}</td>
        <td class="mono">${fmtNum(b.culled)}</td>
        <td class="pct">${b.cullRate.toFixed(0)}%</td>
        <td class="mono">${fmtNum(b.morning)}</td>
        <td class="mono">${fmtNum(b.evening)}</td>
        <td><span class="pill ${PATTERN_PILL[b.pattern]}">${PATTERN_LABEL[b.pattern]}</span></td>
      </tr>`;
    }).join('');
  document.getElementById('cull-tbody').innerHTML = cullRows ||
    emptyRow(8, 'ไม่มีข้อมูลแยก ตาย/คัด เช้า/เย็น — ไฟล์ Excel อาจไม่มีคอลัมน์ย่อย "ไก่ตาย/ไก่คัด"');

  // ---------- 7C · actual weight vs mixed-sex standard (Ross 308 secondary) ----------
  const weightRows = wv
    .sort((a,b) => a.w.devPct - b.w.devPct)
    .map((x, i) => {
      const { h, w } = x;
      const rowCls = w.status === 'BEHIND' ? 'crit' : '';
      const devCls = w.status === 'BEHIND' ? 'pct-c' : w.status === 'AHEAD' ? 'pct-o' : 'pct-w';
      const sign = w.devPct >= 0 ? '+' : '';
      const rossSign = w.rossDev != null && w.rossDev >= 0 ? '+' : '';
      return `<tr class="${rowCls}">
        <td><b>${i+1}</b></td>
        <td>${pill(h)}</td>
        <td class="mono">${h.age}</td>
        <td class="mono">${w.actual.toFixed(3)}</td>
        <td class="mono">${w.std.toFixed(3)}<br><small style="color:var(--ink-mute)">Ross ${w.rossBw != null ? w.rossBw.toFixed(3) : '–'}</small></td>
        <td class="pct ${devCls}">${sign}${w.devPct.toFixed(1)}%<br><small style="color:var(--ink-mute)">${w.rossDev != null ? rossSign + w.rossDev.toFixed(1) + '%' : ''}</small></td>
        <td><span class="pill ${WEIGHT_PILL[w.status]}">${WEIGHT_LABEL[w.status]}</span></td>
      </tr>`;
    }).join('');
  document.getElementById('weight-tbody').innerHTML = weightRows ||
    emptyRow(7, 'ไม่มีข้อมูลน้ำหนัก — ไฟล์ Excel อาจไม่มีคอลัมน์ "น.น.ตามอายุ" หรือ "อายุ"');

  // ---------- 7D · feed loaded vs eaten ----------
  const waste = allHouses.map(h => ({ h, f: feedWaste(h) })).filter(x => x.f);
  const wasteRows = waste
    .sort((a,b) => b.f.gapPct - a.f.gapPct)
    .map((x, i) => {
      const { h, f } = x;
      const rowCls = f.status === 'HIGH' ? 'crit' : f.status === 'WATCH' ? 'high' : '';
      const gapCls = f.status === 'HIGH' ? 'pct-c' : f.status === 'WATCH' ? 'pct-w' : 'pct-o';
      return `<tr class="${rowCls}">
        <td><b>${i+1}</b></td>
        <td>${pill(h)}</td>
        <td class="mono">${f.loaded.toFixed(2)}%</td>
        <td class="mono">${f.eaten.toFixed(2)}%</td>
        <td class="pct ${gapCls}">${f.gapPct >= 0 ? '+' : ''}${f.gapPct.toFixed(2)}%</td>
        <td><span class="pill ${WASTE_PILL[f.status]}">${WASTE_LABEL[f.status]}</span></td>
      </tr>`;
    }).join('');
  document.getElementById('waste-tbody').innerHTML = wasteRows ||
    emptyRow(6, 'ไม่มีข้อมูลอาหารสะสม — ไฟล์ Excel อาจไม่มีคอลัมน์ "% อาหารลงสะสม" / "% อาหารที่กินสะสม"');

  document.getElementById('cnt-health').textContent = allHouses.length;
}
