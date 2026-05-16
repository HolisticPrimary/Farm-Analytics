// ====================================================================
// FARMSENSE · Per-house analysis tab (วิเคราะห์เล้า)
//
// Each chart answers ONE question and stamps an at-a-glance verdict
// (✓ ปกติ / ⚠ เฝ้าระวัง / 🚨 ผิดปกติ) so the operator never has to
// decode an axis to know whether to act:
//
//   1. ตายรายวัน           — ตายมากเกินไปไหม?
//   2. เช้า vs เย็น        — กระจุกตอนไหน? (heat / cold pattern)
//   3. อุณหภูมิ            — Hi เกินเป้ากี่องศา?
//   4. น้ำหนัก             — โตตามเกณฑ์ไหม?
//   5. อาหาร              — กินตามเกณฑ์ไหม?
//   6. น้ำ : อาหาร         — ดื่มน้ำปกติไหม?
//
// All charts are pure inline SVG (no external libs). Color semantics:
// green = good, amber = watch, red = bad, neutral = grey.
// ====================================================================

let analysisSelection = null;  // { farmKey, houseNum }

function analysisListHouses() {
  const items = [];
  for (const fk of Object.keys(STATE.farms)) {
    const farm = STATE.farms[fk];
    for (const h of farm.houses) {
      if (h.dailyHistory && h.dailyHistory.length > 0) {
        items.push({ farmKey: fk, farmName: farm.name, house: h });
      }
    }
  }
  return items;
}

function renderAnalysis(farmKeys) {
  const houses = analysisListHouses();
  const pickHost = document.getElementById('analysis-house-picker');
  const contentHost = document.getElementById('analysis-content');
  if (!pickHost || !contentHost) return;

  const badge = document.getElementById('cnt-analysis');
  if (badge) badge.textContent = houses.length > 0 ? houses.length : '';

  if (houses.length === 0) {
    pickHost.innerHTML = `<div class="insight">⚠ ไม่พบชีท <b>H 1...H N</b> ในไฟล์ที่อัปโหลด — แท็บนี้ต้องการรายวันจากชีทเล้า</div>`;
    contentHost.innerHTML = '';
    return;
  }

  if (!analysisSelection ||
      !houses.find(x => x.farmKey === analysisSelection.farmKey &&
                        Number(x.house.house) === analysisSelection.houseNum)) {
    analysisSelection = { farmKey: houses[0].farmKey, houseNum: Number(houses[0].house.house) };
  }

  const byFarm = {};
  for (const x of houses) (byFarm[x.farmKey] = byFarm[x.farmKey] || []).push(x);

  pickHost.innerHTML = Object.entries(byFarm).map(([fk, list]) => {
    const farmShort = escapeHtml(list[0].farmName.replace('ฟาร์ม',''));
    const pills = list.map(x => {
      const n = Number(x.house.house);
      const active = (analysisSelection.farmKey === fk && analysisSelection.houseNum === n);
      const age = x.house.age != null ? `· ${x.house.age}d` : '';
      const days = x.house.dailyHistory.length;
      return `<button class="ana-pill ${active ? 'active' : ''}"
                 data-farm="${fk}" data-house="${n}">
        เล้า ${escapeHtml(String(x.house.house))} <small>${age} · ${days} วัน</small>
      </button>`;
    }).join('');
    return `<div class="ana-farm-group">
      <div class="ana-farm-label"><span class="pill ${getFarmClass(fk, Object.keys(STATE.farms))}">${farmShort}</span></div>
      <div class="ana-pills">${pills}</div>
    </div>`;
  }).join('');

  pickHost.querySelectorAll('.ana-pill').forEach(btn => {
    btn.onclick = () => {
      analysisSelection = {
        farmKey: btn.dataset.farm,
        houseNum: parseInt(btn.dataset.house, 10),
      };
      renderAnalysis(farmKeys);
    };
  });

  const sel = houses.find(x =>
    x.farmKey === analysisSelection.farmKey &&
    Number(x.house.house) === analysisSelection.houseNum);
  if (!sel) { contentHost.innerHTML = ''; return; }
  contentHost.innerHTML = buildAnalysisContent(sel);
}

// ====================================================================
// SVG toolkit — minimal helpers, intentional whitespace.
// ====================================================================

const ANA_W = 620, ANA_H = 200, ANA_M = { l: 42, r: 14, t: 14, b: 26 };
const COL = {
  navy: '#16284a', blue: '#2b7fd4', bluesoft: '#5b9fe0', blueLight: '#cfe0f5', blueBg: '#eaf2fb',
  red: '#d62828', redSoft: '#e85d5d', redBg: '#fdecec',
  green: '#2e7d4f', greenSoft: '#4fa873', greenBg: '#e8f5ed',
  amber: '#c8860b', amberSoft: '#e3a92e', amberBg: '#fbf1da',
  ink: '#1a2233', inkSoft: '#46526b', inkMute: '#8a94a8',
  grid: '#eef2f7', neutralBar: '#cbd5e1',
};

function plotArea() {
  return { x0: ANA_M.l, x1: ANA_W - ANA_M.r, y0: ANA_M.t, y1: ANA_H - ANA_M.b };
}

function makeScales(days, yMin, yMax) {
  const a = plotArea();
  const dayMin = days[0], dayMax = days[days.length - 1];
  const span = Math.max(1, dayMax - dayMin);
  return {
    px: d => a.x0 + ((d - dayMin) / span) * (a.x1 - a.x0),
    py: v => v == null ? null : a.y1 - ((v - yMin) / (yMax - yMin)) * (a.y1 - a.y0),
    dayMin, dayMax, yMin, yMax, area: a,
  };
}

function pickXTicks(days) {
  if (days.length === 0) return [];
  const first = days[0], last = days[days.length - 1];
  if (last - first <= 7) return days.filter((_, i, arr) => i === 0 || i === arr.length - 1 || i % Math.ceil(arr.length / 5) === 0);
  return [first, Math.round((first + last) / 4), Math.round((first + last) / 2), Math.round((first + last) * 3 / 4), last];
}

function svgFrame(title, body, opts = {}) {
  const status = opts.status || 'neutral';
  const badge  = opts.badge  || '';
  const headlineHtml = opts.headline ? `
    <div class="ana-headline">
      <div class="ana-headline-big">${opts.headline}</div>
      ${opts.subtitle ? `<div class="ana-headline-sub">${opts.subtitle}</div>` : ''}
    </div>` : '';
  return `
    <div class="ana-card status-${status}">
      <div class="ana-card-head">
        <h4>${title}</h4>
        ${badge ? `<span class="ana-badge status-${status}">${badge}</span>` : ''}
      </div>
      ${headlineHtml}
      <svg viewBox="0 0 ${ANA_W} ${ANA_H}" preserveAspectRatio="xMidYMid meet"
           class="ana-svg" role="img" aria-label="${escapeHtml(typeof title === 'string' ? title : '')}">
        ${body}
      </svg>
      ${opts.takeaway ? `<div class="ana-takeaway">💡 ${opts.takeaway}</div>` : ''}
    </div>`;
}

function drawAxes(scales, yTicks, xTicks) {
  const grid = yTicks.map(v => {
    const y = scales.py(v);
    return `<line x1="${scales.area.x0}" x2="${scales.area.x1}" y1="${y}" y2="${y}"
                  stroke="${COL.grid}" stroke-width="1"/>
            <text x="${scales.area.x0 - 6}" y="${y + 3}" text-anchor="end"
                  font-family="JetBrains Mono, monospace" font-size="9" fill="${COL.inkMute}">${v}</text>`;
  }).join('');
  const xax = xTicks.map(d => {
    const x = scales.px(d);
    return `<text x="${x}" y="${scales.area.y1 + 12}" text-anchor="middle"
                  font-family="JetBrains Mono, monospace" font-size="9" fill="${COL.inkMute}">${d}</text>`;
  }).join('');
  return grid + xax;
}

function linePath(points, scales) {
  let path = ''; let pen = 'M';
  for (const [x, y] of points) {
    if (y == null) { pen = 'M'; continue; }
    const py = scales.py(y);
    if (py == null) { pen = 'M'; continue; }
    path += `${pen}${scales.px(x).toFixed(2)},${py.toFixed(2)} `;
    pen = 'L';
  }
  return path.trim();
}

// ====================================================================
// Chart 1 · ตายรายวัน — focus on daily bars colored by alert level
// ====================================================================
function chartMortality(daily) {
  const days = daily.map(d => d.day);
  const losses = daily.map(d => d.total_loss || 0);
  const last = daily[daily.length - 1];
  // Compute cumulative loss + initial stock for headline
  const cumTotal = losses.reduce((s, v) => s + v, 0);
  const initRem = (last.qty_rem || 0) + cumTotal;
  const cumPct = initRem ? (cumTotal / initRem) * 100 : 0;
  const lastDailyPct = last.qty_rem ? (last.total_loss / last.qty_rem) * 100 : 0;

  // Status from cumulative %
  let status, badge;
  if (cumPct >= 3)         { status = 'bad';  badge = '🚨 เกิน 3%'; }
  else if (cumPct >= 2.5)  { status = 'warn'; badge = '⚠ ใกล้เกณฑ์'; }
  else                     { status = 'good'; badge = '✓ ปกติ'; }

  // Find top spike day
  const avg = losses.reduce((s,v)=>s+v,0) / Math.max(1, losses.length);
  let spike = null;
  daily.forEach(d => {
    if ((d.total_loss||0) >= 30 && (d.total_loss||0) >= avg * 2 &&
        (!spike || (d.total_loss||0) > (spike.total_loss||0))) spike = d;
  });

  const maxLoss = Math.max(10, ...losses);
  const scales = makeScales(days, 0, maxLoss * 1.20);
  const w = Math.max(4, (scales.area.x1 - scales.area.x0) / daily.length * 0.78);
  const bars = daily.map(d => {
    const v = d.total_loss || 0;
    const x = scales.px(d.day);
    const y = scales.py(v);
    const h = scales.area.y1 - y;
    const pct = d.qty_rem ? v / d.qty_rem : 0;
    let fill;
    if (pct >= MORTALITY_THRESHOLDS.dailyPct)        fill = COL.red;
    else if (pct >= MORTALITY_THRESHOLDS.warnDailyPct) fill = COL.amber;
    else                                              fill = COL.greenSoft;
    return `<rect x="${x - w/2}" y="${y}" width="${w}" height="${h}" fill="${fill}" rx="1.5" opacity="0.92"/>`;
  }).join('');

  // Annotate top spike
  let annotation = '';
  if (spike) {
    const x = scales.px(spike.day);
    const y = scales.py(spike.total_loss);
    annotation = `
      <text x="${x}" y="${y - 6}" text-anchor="middle"
            font-family="JetBrains Mono, monospace" font-size="11" font-weight="700" fill="${COL.red}">
        ${spike.total_loss}
      </text>`;
  }

  const yTicks = niceTicks(0, scales.yMax, 3);
  const axes = drawAxes(scales, yTicks, pickXTicks(days));

  const takeaway = spike
    ? `วัน spike สูงสุด: <b>Day ${spike.day}</b> สูญเสีย ${spike.total_loss} ตัว (${(spike.total_loss/avg).toFixed(1)}× เฉลี่ย)`
    : `ไม่มี spike ผิดปกติ — สูญเสียกระจายสม่ำเสมอ เฉลี่ย ${avg.toFixed(0)} ตัว/วัน`;

  return svgFrame('📉 ตายรายวัน', `${axes}${bars}${annotation}`, {
    status, badge,
    headline: `${cumPct.toFixed(2)}<small>% สะสม</small> · <span class="num-secondary">${last.total_loss || 0} ตัว</span><small> วันล่าสุด</small>`,
    subtitle: `แท่งสีตามเกณฑ์รายวัน · 🟢&lt;0.07% · 🟡 0.07-0.10% · 🔴≥0.10%`,
    takeaway,
  });
}

// ====================================================================
// Chart 2 · เช้า vs เย็น — pattern recognition
// ====================================================================
function chartAmPm(daily) {
  const days = daily.map(d => d.day);
  const am = daily.map(d => (d.m_died||0) + (d.m_culled||0));
  const pm = daily.map(d => (d.e_died||0) + (d.e_culled||0));
  const amTotal = am.reduce((s,v)=>s+v,0);
  const pmTotal = pm.reduce((s,v)=>s+v,0);
  const total = amTotal + pmTotal;

  if (total === 0) {
    return svgFrame('🌅 เช้า vs เย็น',
      `<text x="${ANA_W/2}" y="${ANA_H/2}" text-anchor="middle" fill="${COL.inkMute}"
             font-family="IBM Plex Sans Thai">ไม่มีข้อมูลการสูญเสียในช่วงนี้</text>`,
      { status: 'neutral', badge: '–', headline: '0 ตัว', subtitle: 'ไม่พบบันทึกตาย/คัด' });
  }

  const pmShare = pmTotal / total * 100;
  let status, badge, pattern, takeaway;
  if (pmTotal > amTotal * 1.5) {
    status = 'warn'; badge = '⚠ เย็นหนัก'; pattern = 'HEAT';
    takeaway = `เย็น <b>${pmShare.toFixed(0)}%</b> ของทั้งหมด — สงสัย <b>heat stress</b> · เช็คอุณหภูมิ+ลมช่วงบ่าย`;
  } else if (amTotal > pmTotal * 1.5) {
    status = 'warn'; badge = '⚠ เช้าหนัก'; pattern = 'NIGHT';
    takeaway = `เช้า <b>${(100-pmShare).toFixed(0)}%</b> ของทั้งหมด — สงสัย<b>หนาว/ปัญหากลางคืน</b> · เช็คอุณหภูมิตอนเช้า`;
  } else {
    status = 'good'; badge = '✓ สม่ำเสมอ'; pattern = 'EVEN';
    takeaway = `สัดส่วนเช้า:เย็น = ${(100-pmShare).toFixed(0)}:${pmShare.toFixed(0)} — สมดุล ไม่บ่งชี้ปัญหาเฉพาะช่วง`;
  }

  const maxV = Math.max(5, ...am, ...pm);
  const scales = makeScales(days, 0, maxV * 1.15);
  const w = Math.max(3, (scales.area.x1 - scales.area.x0) / daily.length * 0.36);

  // Paired bars: AM (blue) on the left of day, PM (amber) on the right
  const bars = daily.map((d,i) => {
    const x = scales.px(d.day);
    const yAm = scales.py(am[i]);
    const yPm = scales.py(pm[i]);
    return `
      <rect x="${x - w}" y="${yAm}" width="${w-0.5}" height="${scales.area.y1 - yAm}"
            fill="${COL.bluesoft}" rx="1"/>
      <rect x="${x + 0.5}" y="${yPm}" width="${w-0.5}" height="${scales.area.y1 - yPm}"
            fill="${COL.amberSoft}" rx="1"/>`;
  }).join('');

  const yTicks = niceTicks(0, scales.yMax, 3);
  const axes = drawAxes(scales, yTicks, pickXTicks(days));

  return svgFrame('🌅 เช้า vs เย็น', `${axes}${bars}`, {
    status, badge,
    headline: `<span style="color:${COL.bluesoft}">${amTotal}</span><small> เช้า</small> · <span style="color:${COL.amber}">${pmTotal}</small><small> เย็น</small>`,
    subtitle: `สัดส่วน <b>${(100-pmShare).toFixed(0)}% : ${pmShare.toFixed(0)}%</b> รวม ${total} ตัว`,
    takeaway,
  });
}

// ====================================================================
// Chart 3 · อุณหภูมิ — show DEVIATION from farm target, not absolute °C
// ====================================================================
function chartTemperature(daily) {
  const days = daily.map(d => d.day);
  // Deviation series: Hi-target  (positive = hot),  target-Lo (positive = cold)
  const dvHi = daily.map(d => {
    if (d.temp_hi == null) return null;
    const t = farmTempLookup(d.day);
    return t != null ? d.temp_hi - t : null;
  });
  const dvLo = daily.map(d => {
    if (d.temp_lo == null) return null;
    const t = farmTempLookup(d.day);
    return t != null ? d.temp_lo - t : null;
  });
  const filtered = [...dvHi, ...dvLo].filter(v => v != null);
  if (filtered.length === 0) {
    return svgFrame('🌡️ อุณหภูมิเทียบเป้า',
      `<text x="${ANA_W/2}" y="${ANA_H/2}" text-anchor="middle" fill="${COL.inkMute}"
             font-family="IBM Plex Sans Thai">ไม่มีบันทึกอุณหภูมิ</text>`,
      { status: 'neutral', badge: '–', headline: '–' });
  }

  const hot = dvHi.filter(v => v != null && v > 2).length;
  const cold = dvLo.filter(v => v != null && v < -2).length;
  const hiAvg = dvHi.filter(v => v != null).reduce((s,v)=>s+v,0) / Math.max(1, dvHi.filter(v=>v!=null).length);
  const loAvg = dvLo.filter(v => v != null).reduce((s,v)=>s+v,0) / Math.max(1, dvLo.filter(v=>v!=null).length);

  let status, badge, takeaway;
  if (hot >= daily.length * 0.5) {
    status = 'bad'; badge = '🚨 ร้อน ' + hot + ' วัน';
    takeaway = `Hi เกินเป้าเฉลี่ย <b>+${hiAvg.toFixed(1)}°C</b> · เพิ่ม FPM + cooling pad`;
  } else if (hot >= daily.length * 0.3 || cold >= daily.length * 0.3) {
    status = 'warn'; badge = `⚠ เกิน ${hot+cold} วัน`;
    takeaway = `เกินเป้า ${hot} วัน · ต่ำกว่าเป้า ${cold} วัน · ปรับ ventilation`;
  } else {
    status = 'good'; badge = '✓ คุมได้';
    takeaway = `อุณหภูมิคุมได้ตามเป้าฟาร์ม — Hi เฉลี่ย +${hiAvg.toFixed(1)}°C`;
  }

  // Symmetric y-axis around 0
  const extreme = Math.max(2, ...filtered.map(Math.abs));
  const yMax = Math.ceil(extreme + 0.5);
  const scales = makeScales(days, -yMax, yMax);

  // Safe band ±2°C
  const safeTop = scales.py(2);
  const safeBot = scales.py(-2);
  const safe = `<rect x="${scales.area.x0}" y="${safeTop}" width="${scales.area.x1 - scales.area.x0}"
                       height="${safeBot - safeTop}" fill="${COL.greenBg}" opacity="0.6"/>`;
  // Zero line (target)
  const zeroLine = `<line x1="${scales.area.x0}" x2="${scales.area.x1}"
                          y1="${scales.py(0)}" y2="${scales.py(0)}"
                          stroke="${COL.green}" stroke-width="1.5"/>`;

  const hiLine = linePath(daily.map((d,i) => [d.day, dvHi[i]]), scales);
  const loLine = linePath(daily.map((d,i) => [d.day, dvLo[i]]), scales);

  const yTicks = [-yMax, -2, 0, 2, yMax].filter((v,i,a) => a.indexOf(v) === i);
  const axes = drawAxes(scales, yTicks, pickXTicks(days));

  return svgFrame('🌡️ อุณหภูมิเทียบเป้า', `${safe}${axes}${zeroLine}
    <path d="${hiLine}" fill="none" stroke="${COL.red}" stroke-width="2"/>
    <path d="${loLine}" fill="none" stroke="${COL.blue}" stroke-width="2"/>`, {
    status, badge,
    headline: `Hi เฉลี่ย <span style="color:${COL.red}">+${hiAvg.toFixed(1)}°C</span> · Lo เฉลี่ย <span style="color:${COL.blue}">${loAvg >= 0 ? '+' : ''}${loAvg.toFixed(1)}°C</span>`,
    subtitle: `แถบเขียว = ภายในเกณฑ์ ±2°C · เส้นแดง = Hi · เส้นน้ำเงิน = Lo`,
    takeaway,
  });
}

// ====================================================================
// Chart 4 · น้ำหนัก vs (น้ำหนักแรกเข้า × 4.5)
// Plots the actual weight line against a horizontal floor at 4.5×
// initial. Every weighing point is judged against that one floor; the
// status badge fires the moment any reading dips below it.
// ====================================================================
function chartWeight(daily, h) {
  const days = daily.map(d => d.day);
  const actuals = daily.map(d => d.weight);
  const haveWt = actuals.filter(v => v != null && v > 0);
  if (haveWt.length === 0) {
    return svgFrame('⚖️ น้ำหนัก vs เกณฑ์ 4.5×',
      `<text x="${ANA_W/2}" y="${ANA_H/2}" text-anchor="middle" fill="${COL.inkMute}"
             font-family="IBM Plex Sans Thai">ยังไม่มีการชั่งน้ำหนัก</text>`,
      { status: 'neutral', badge: '–', headline: '–' });
  }

  // Find latest weighing.
  let lastWt = null, lastWtDay = null;
  for (let i = daily.length - 1; i >= 0; i--) {
    if (daily[i].weight != null && daily[i].weight > 0) {
      lastWt = daily[i].weight; lastWtDay = daily[i].day; break;
    }
  }

  // Initial weight + threshold (fallback 40 g if file didn't carry it).
  const initial = (h && h.wt_initial && h.wt_initial > 0) ? h.wt_initial : 0.040;
  const threshold = initial * 4.5;
  const ratio = lastWt / initial;
  const everBelow = daily.some(d =>
    d.weight != null && d.weight > 0 && d.weight < threshold);

  let status, badge, takeaway;
  if (lastWt < threshold) {
    status = 'bad';
    badge = `🚨 ต่ำกว่า 4.5× (${ratio.toFixed(1)}×)`;
    takeaway = `Day ${lastWtDay}: น้ำหนัก <b>${lastWt.toFixed(2)} กก.</b> = ${ratio.toFixed(1)}× แรกเข้า (${(initial*1000).toFixed(0)} กรัม) — ต่ำกว่าเกณฑ์ 4.5× ต้องเช็คอาหาร/สุขภาพ`;
  } else if (everBelow) {
    status = 'warn';
    badge = `⚠ เคยต่ำ · ตอนนี้ ${ratio.toFixed(1)}×`;
    takeaway = `Day ${lastWtDay}: น้ำหนัก ${lastWt.toFixed(2)} กก. = ${ratio.toFixed(1)}× — ปัจจุบันผ่าน แต่เคยต่ำกว่า 4.5× ในรุ่นนี้`;
  } else {
    status = 'good';
    badge = `✓ ${ratio.toFixed(1)}× ของแรกเข้า`;
    takeaway = `Day ${lastWtDay}: น้ำหนัก <b>${lastWt.toFixed(2)} กก.</b> = ${ratio.toFixed(1)}× แรกเข้า · ผ่านเกณฑ์ 4.5× ตลอดรุ่น`;
  }

  const yMax = Math.max(...haveWt, threshold) * 1.10;
  const scales = makeScales(days, 0, yMax);
  const actLine = linePath(daily.map(d => [d.day, d.weight]), scales);

  // Horizontal threshold line
  const tY = scales.py(threshold);
  const thresholdLine = `
    <line x1="${scales.area.x0}" x2="${scales.area.x1}" y1="${tY}" y2="${tY}"
          stroke="${COL.red}" stroke-dasharray="5 4" stroke-width="1.6"/>
    <text x="${scales.area.x1 - 4}" y="${tY - 5}" text-anchor="end"
          font-family="IBM Plex Sans Thai, sans-serif" font-size="10"
          font-weight="600" fill="${COL.red}">เกณฑ์ 4.5× = ${threshold.toFixed(2)} กก.</text>`;

  // Per-weighing markers (red if below threshold, green if above)
  const markers = daily.map(d => {
    if (d.weight == null || d.weight <= 0) return '';
    const c = d.weight < threshold ? COL.red : COL.green;
    return `<circle cx="${scales.px(d.day)}" cy="${scales.py(d.weight)}" r="4" fill="${c}"/>`;
  }).join('');

  // Halo on the latest measurement.
  const halo = lastWtDay != null
    ? `<circle cx="${scales.px(lastWtDay)}" cy="${scales.py(lastWt)}" r="11" fill="${lastWt < threshold ? COL.red : COL.green}" opacity="0.18"/>`
    : '';

  const yTicks = niceTicks(0, yMax, 3);
  const axes = drawAxes(scales, yTicks, pickXTicks(days));

  return svgFrame('⚖️ น้ำหนัก vs เกณฑ์ 4.5×', `${axes}${thresholdLine}
    <path d="${actLine}" fill="none" stroke="${COL.blue}" stroke-width="2.4"/>
    ${halo}${markers}`, {
    status, badge,
    headline: `${lastWt.toFixed(2)}<small> กก.</small> · <span class="num-secondary">${ratio.toFixed(1)}×</span><small> ของแรกเข้า</small>`,
    subtitle: `น้ำหนักแรกเข้า ${(initial*1000).toFixed(0)} กรัม · เกณฑ์ขั้นต่ำ ${threshold.toFixed(2)} กก. ทุกครั้งที่ชั่ง`,
    takeaway,
  });
}

// ====================================================================
// Chart 5 · อาหาร — show deviation% from farm target (clearer than abs g)
// ====================================================================
function chartFeed(daily) {
  const days = daily.map(d => d.day);
  const devs = daily.map(d => {
    if (d.feed_used == null || !d.qty_rem || d.qty_rem === 0) return null;
    const g = (d.feed_used * 1000) / d.qty_rem;
    const std = farmFeedLookup(d.day);
    if (!std || std === 0) return null;
    return ((g - std) / std) * 100;
  });
  const have = devs.filter(v => v != null);
  if (have.length === 0) {
    return svgFrame('🌾 อาหาร vs เกณฑ์',
      `<text x="${ANA_W/2}" y="${ANA_H/2}" text-anchor="middle" fill="${COL.inkMute}"
             font-family="IBM Plex Sans Thai">ไม่มีข้อมูลอาหารใช้จริง</text>`,
      { status: 'neutral', badge: '–', headline: '–' });
  }
  const avgDev = have.reduce((s,v)=>s+v,0) / have.length;
  const lowDays = devs.filter(v => v != null && v < -10).length;
  let status, badge, takeaway;
  if (lowDays >= 3)             { status = 'bad';  badge = `🚨 ขาด ${lowDays} วัน`; }
  else if (lowDays >= 1)         { status = 'warn'; badge = `⚠ ขาด ${lowDays} วัน`; }
  else if (avgDev > 8)           { status = 'warn'; badge = '⚠ กินเกิน'; }
  else                           { status = 'good'; badge = '✓ พอดี'; }
  const lastDev = (() => {
    for (let i = daily.length - 1; i >= 0; i--) if (devs[i] != null) return devs[i];
    return null;
  })();
  takeaway = lowDays > 0
    ? `${lowDays} วันที่กินน้อยกว่าเกณฑ์ &gt;10% — เสี่ยงป่วย/น้ำหนักไม่ขึ้น`
    : avgDev > 8
      ? `กินเกินเกณฑ์เฉลี่ย +${avgDev.toFixed(0)}% — ตรวจน้ำหนัก, อาจให้อาหารฟุ่มเฟือย`
      : `กินตามเกณฑ์ฟาร์มตลอด · เฉลี่ย ${avgDev >= 0 ? '+' : ''}${avgDev.toFixed(0)}%`;

  // Symmetric y axis around 0, range −25 to +25 unless data exceeds
  const yMax = Math.max(15, ...have.map(Math.abs)) + 5;
  const scales = makeScales(days, -yMax, yMax);

  // Tolerance band ±5%
  const top = scales.py(5), bot = scales.py(-5);
  const safe = `<rect x="${scales.area.x0}" y="${top}" width="${scales.area.x1-scales.area.x0}"
                       height="${bot-top}" fill="${COL.greenBg}" opacity="0.6"/>`;
  // Zero line
  const zero = `<line x1="${scales.area.x0}" x2="${scales.area.x1}"
                       y1="${scales.py(0)}" y2="${scales.py(0)}"
                       stroke="${COL.green}" stroke-width="1.5"/>`;
  // Bars from zero line, colored by zone
  const w = Math.max(3, (scales.area.x1 - scales.area.x0) / daily.length * 0.75);
  const bars = daily.map((d,i) => {
    const v = devs[i]; if (v == null) return '';
    const x = scales.px(d.day);
    const y0 = scales.py(0);
    const y1 = scales.py(v);
    let fill;
    if (v < -10) fill = COL.red;
    else if (v < -5) fill = COL.amber;
    else if (v > 8) fill = COL.amberSoft;
    else fill = COL.greenSoft;
    return `<rect x="${x - w/2}" y="${Math.min(y0,y1)}" width="${w}" height="${Math.abs(y1-y0)}" fill="${fill}" opacity="0.85" rx="1"/>`;
  }).join('');

  const yTicks = [-yMax, -10, -5, 0, 5, 10, yMax].filter((v,i,a) => a.indexOf(v)===i && v >= -yMax && v <= yMax);
  const axes = drawAxes(scales, yTicks, pickXTicks(days));

  return svgFrame('🌾 อาหาร vs เกณฑ์ฟาร์ม', `${safe}${axes}${zero}${bars}`, {
    status, badge,
    headline: lastDev != null
      ? `${lastDev >= 0 ? '+' : ''}${lastDev.toFixed(0)}<small>% เทียบเป้า</small>`
      : '–',
    subtitle: `แถบเขียว = ±5% (พอดี) · แดง = &lt;−10% เสี่ยงป่วย · เหลือง = ขาด−5 ถึง−10%`,
    takeaway,
  });
}

// ====================================================================
// Chart 6 · น้ำ : อาหาร — safe band 1.5-2.4, line over time
// ====================================================================
function chartWaterFeed(daily) {
  const days = daily.map(d => d.day);
  const ratios = daily.map(d => {
    if (!d.water || !d.feed_used || d.feed_used === 0) return null;
    const r = d.water / d.feed_used;
    return (r > 0.3 && r < 6) ? r : null;
  });
  const have = ratios.filter(v => v != null);
  if (have.length === 0) {
    // Tell the operator WHY there's nothing to show — they often have a
    // water column filled with "15" liters that's clearly a typo.
    const rawValues = daily.map(d => d.water).filter(v => v != null);
    const reason = rawValues.length > 0 && rawValues.every(v => v < 50)
      ? 'ค่าน้ำต้นทางต่ำผิดปกติ (เช่น 15 ลิตร/วัน) — น่าจะเป็นข้อมูลผิดหน่วย'
      : 'ไม่มีข้อมูลน้ำหรืออาหาร';
    return svgFrame('💧 น้ำ : อาหาร',
      `<text x="${ANA_W/2}" y="${ANA_H/2}" text-anchor="middle" fill="${COL.inkMute}"
             font-family="IBM Plex Sans Thai">${escapeHtml(reason)}</text>`,
      { status: 'neutral', badge: '–', headline: '–',
        subtitle: 'มาตรฐาน 1.5–2.4 · ต่ำ = ดื่มน้อย · สูง = heat/ท้องเสีย',
        takeaway: 'ตรวจสอบหน่วยข้อมูลน้ำในไฟล์ Excel — ควรเป็นลิตรต่อวันทั้งเล้า' });
  }

  // Latest + average ratio
  let lastR = null;
  for (let i = ratios.length - 1; i >= 0; i--) if (ratios[i] != null) { lastR = ratios[i]; break; }
  const avgR = have.reduce((s,v)=>s+v,0) / have.length;
  const off = ratios.filter(v => v != null && (v < 1.5 || v > 2.4)).length;
  let status, badge, takeaway;
  if (off >= daily.length * 0.4)         { status = 'bad';  badge = `🚨 ออกนอกเกณฑ์ ${off} วัน`; }
  else if (off >= daily.length * 0.2)    { status = 'warn'; badge = `⚠ ออกนอก ${off} วัน`; }
  else                                   { status = 'good'; badge = '✓ ปกติ'; }
  takeaway = lastR == null ? '' :
    lastR < 1.5 ? `ล่าสุด ${lastR.toFixed(2)} — ไก่ดื่มน้อย · เช็คน้ำ/หัวจ่าย/สุขภาพ` :
    lastR > 2.4 ? `ล่าสุด ${lastR.toFixed(2)} — heat stress หรือท้องเสีย · เช็คอุณหภูมิ` :
                  `เฉลี่ย ${avgR.toFixed(2)} อยู่ในเกณฑ์ปกติ 1.5–2.4`;

  const yMin = 0;
  const yMax = Math.max(3.5, ...have) * 1.1;
  const scales = makeScales(days, yMin, yMax);
  const top = scales.py(2.4), bot = scales.py(1.5);
  const band = `<rect x="${scales.area.x0}" y="${top}" width="${scales.area.x1-scales.area.x0}"
                       height="${bot-top}" fill="${COL.greenBg}" opacity="0.7"/>`;
  const line = linePath(days.map((d,i) => [d, ratios[i]]), scales);

  // Off-band markers
  const markers = days.map((d,i) => {
    const r = ratios[i]; if (r == null) return '';
    if (r < 1.5)  return `<circle cx="${scales.px(d)}" cy="${scales.py(r)}" r="3" fill="${COL.red}"/>`;
    if (r > 2.4)  return `<circle cx="${scales.px(d)}" cy="${scales.py(r)}" r="3" fill="${COL.amber}"/>`;
    return '';
  }).join('');

  const yTicks = [0, 1.5, 2.4, Math.round(yMax)].filter((v,i,a) => a.indexOf(v)===i);
  const axes = drawAxes(scales, yTicks, pickXTicks(days));

  return svgFrame('💧 น้ำ : อาหาร', `${band}${axes}
    <path d="${line}" fill="none" stroke="${COL.blue}" stroke-width="2.2"/>
    ${markers}`, {
    status, badge,
    headline: lastR != null ? `${lastR.toFixed(2)}<small> ratio</small>` : '–',
    subtitle: `แถบเขียว = 1.5-2.4 (สุขภาพดี) · จุดแดง=ดื่มน้อย · จุดเหลือง=ดื่มเยอะ`,
    takeaway,
  });
}

// ====================================================================
// Problem detection — surfaces specific days the operator should review.
// ====================================================================
function detectProblems(daily, h) {
  const bullets = [];
  const initial = (h && h.wt_initial && h.wt_initial > 0) ? h.wt_initial : 0.040;
  const wtThreshold = initial * 4.5;
  const losses = daily.map(d => d.total_loss || 0);
  const avg = losses.reduce((s,v)=>s+v,0) / Math.max(1, losses.length);
  // Mortality spikes (3x avg AND ≥30)
  daily.forEach(d => {
    if ((d.total_loss||0) >= 3 * avg && (d.total_loss||0) >= 30) {
      bullets.push(`<b class="bad">Day ${d.day}:</b> สูญเสีย ${d.total_loss} ตัว (${((d.total_loss||0)/avg).toFixed(1)}× เฉลี่ย)`);
    }
  });
  // Daily death rate breaches
  const dailyAlerts = [];
  daily.forEach(d => {
    if (!d.qty_rem || !d.total_loss) return;
    const pct = d.total_loss / d.qty_rem;
    if (pct >= MORTALITY_THRESHOLDS.dailyPct) dailyAlerts.push({ day: d.day, pct });
  });
  if (dailyAlerts.length > 0) {
    const top = dailyAlerts.slice(0, 5).map(a => `Day ${a.day} ${(a.pct*100).toFixed(2)}%`).join(' · ');
    const more = dailyAlerts.length > 5 ? ` +อีก ${dailyAlerts.length - 5}` : '';
    bullets.push(`<b class="bad">วันที่ตายทะลุเกณฑ์ ${MORTALITY_THRESHOLDS.dailyPct*100}%/วัน:</b> ${top}${more}`);
  }
  // Weight below 4.5× initial.
  const behind = [];
  daily.forEach(d => {
    if (d.weight == null || d.weight <= 0) return;
    if (d.weight < wtThreshold) {
      behind.push({ day: d.day, ratio: d.weight / initial });
    }
  });
  if (behind.length > 0) {
    const worst = behind.reduce((a, b) => b.ratio < a.ratio ? b : a);
    bullets.push(`<b class="warn">น้ำหนักต่ำกว่าเกณฑ์ 4.5× ของแรกเข้า:</b> ${behind.length} จุดที่ชั่ง (แย่สุด Day ${worst.day}: ${worst.ratio.toFixed(1)}× แรกเข้า)`);
  }
  // Feed shortfall
  const feedShort = [];
  daily.forEach(d => {
    if (!d.feed_used || !d.qty_rem) return;
    const g = (d.feed_used * 1000) / d.qty_rem;
    const std = farmFeedLookup(d.day);
    if (!std) return;
    const dev = ((g - std) / std) * 100;
    if (dev < -10) feedShort.push({ day: d.day, dev });
  });
  if (feedShort.length > 0) {
    bullets.push(`<b class="warn">วันที่กินอาหารน้อยกว่าเกณฑ์ &gt;10%:</b> ${feedShort.slice(0,6).map(d => 'Day '+d.day).join(', ')}${feedShort.length > 6 ? '...' : ''}`);
  }
  // Temperature consistently over target
  let hotDays = 0;
  daily.forEach(d => {
    const t = farmTempLookup(d.day);
    if (t == null || d.temp_hi == null) return;
    if (d.temp_hi > t + 3) hotDays++;
  });
  if (hotDays > daily.length * 0.5) {
    bullets.push(`<b class="warn">Hi เกินเป้า &gt;3°C ใน ${hotDays}/${daily.length} วัน:</b> ระบบทำความเย็นไม่พอ — เพิ่ม FPM/cooling pad`);
  }
  return bullets;
}

// ---------- Container ----------
function buildAnalysisContent(sel) {
  const farm = STATE.farms[sel.farmKey];
  const h = sel.house;
  const daily = h.dailyHistory;
  const ageNow = h.age != null ? h.age : daily[daily.length - 1]?.day;

  const last = daily[daily.length - 1];
  const cumLoss = daily.reduce((s, d) => s + (d.total_loss || 0), 0);
  const initRem = (last.qty_rem || 0) + cumLoss;
  const cumPct = initRem ? (cumLoss / initRem) * 100 : 0;
  const cumCls = cumPct >= 3 ? 'bad' : cumPct >= 2.5 ? 'warn' : 'good';
  const todayLoss = last.total_loss || 0;
  const todayPct = last.qty_rem ? (todayLoss / last.qty_rem) * 100 : 0;
  const todayCls = todayPct >= 0.1 ? 'bad' : todayPct >= 0.07 ? 'warn' : 'good';

  const kpi = `
    <div class="ana-kpi">
      <div class="ana-kpi-item">
        <div class="lab">วันที่ปัจจุบัน</div>
        <div class="val">${last.day}</div>
        <div class="sub">${daily.length} วันข้อมูล</div>
      </div>
      <div class="ana-kpi-item">
        <div class="lab">ยอดเริ่ม → คงเหลือ</div>
        <div class="val">${fmtNum(last.qty_rem)}</div>
        <div class="sub">จาก ${fmtNum(initRem)}</div>
      </div>
      <div class="ana-kpi-item">
        <div class="lab">สูญเสียสะสม</div>
        <div class="val ${cumCls}">${cumPct.toFixed(2)}%</div>
        <div class="sub">${fmtNum(cumLoss)} ตัว · เกณฑ์ 3%</div>
      </div>
      <div class="ana-kpi-item">
        <div class="lab">สูญเสียวันล่าสุด</div>
        <div class="val ${todayCls}">${todayPct.toFixed(3)}%</div>
        <div class="sub">${fmtNum(todayLoss)} ตัว · เกณฑ์ 0.10%</div>
      </div>
    </div>`;

  const problems = detectProblems(daily, h);
  const problemsHtml = problems.length === 0
    ? `<div class="insight good">✓ ไม่พบความผิดปกติชัดเจนตลอดรุ่นนี้</div>`
    : `<div class="ana-problems"><h4>⚠ ปัญหาที่ตรวจพบ <small>· ${problems.length} จุด</small></h4>
        <ul>${problems.map(p => `<li>${p}</li>`).join('')}</ul></div>`;

  const charts = `
    <div class="ana-grid">
      ${chartMortality(daily)}
      ${chartAmPm(daily)}
      ${chartTemperature(daily)}
      ${chartWeight(daily, h)}
      ${chartFeed(daily)}
      ${chartWaterFeed(daily)}
    </div>`;

  return `
    <div class="ana-header">
      <h3>${escapeHtml(farm.name)} · เล้า ${escapeHtml(String(h.house))}
        <small>· อายุ ${ageNow} วัน${h.source ? ' · ' + escapeHtml(h.source) : ''}</small></h3>
    </div>
    ${kpi}
    ${problemsHtml}
    ${charts}`;
}

// ---------- Util ----------
function niceTicks(min, max, count) {
  const span = max - min;
  const step0 = span / Math.max(1, count);
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) {
    out.push(Number(v.toFixed(4)));
  }
  return out;
}
