// ====================================================================
// FARMSENSE · Render functions (Overview, Mortality, Feed, FCR, Env)
// ====================================================================

// Sort state (per tab)
let mortSort = { col: 'pct', dir: 'desc' };
let feedSort = { col: 'dev', dir: 'asc' };

// ========== MAIN RENDER ==========

function renderDashboard() {
  const dash = document.getElementById('dashboard');
  const farmKeys = Object.keys(STATE.farms);

  if (farmKeys.length === 0) {
    dash.classList.remove('active');
    return;
  }
  dash.classList.add('active');

  // Sort farms by avg mortality (best first)
  farmKeys.sort((a, b) => {
    const ma = farmAvgMortality(STATE.farms[a]);
    const mb = farmAvgMortality(STATE.farms[b]);
    return ma - mb;
  });

  renderOverview(farmKeys);
  renderRiskBoard(farmKeys);
  renderMortality(farmKeys);
  renderFeed(farmKeys);
  renderFCR(farmKeys);
  renderEnv(farmKeys);
  renderHealth(farmKeys);
}

// ========== RISK BOARD · "เล้าที่ต้องดูวันนี้" ==========
// Synthesises every per-house signal into one ranked priority list.

function renderRiskBoard(farmKeys) {
  const scored = [];
  for (const fk of farmKeys) {
    const farm = STATE.farms[fk];
    for (const h of farm.houses) {
      scored.push({ h, r: houseRiskScore(h, farm.houses), farmKey: fk, farmName: farm.name });
    }
  }

  // vaccine callout — houses due today / tomorrow, regardless of risk level
  const vacDue = scored.filter(s => s.r.vaccine &&
    (s.r.vaccine.phase === 'today' || s.r.vaccine.phase === 'tomorrow'));
  let vacHtml = '';
  if (vacDue.length) {
    const items = vacDue.map(s => {
      const when = s.r.vaccine.phase === 'today' ? 'วันนี้' : 'พรุ่งนี้';
      return `<b>${escapeHtml(s.farmName.replace('ฟาร์ม',''))} เล้า ${s.h.house}</b> (${when} · อายุ ${s.r.vaccine.age})`;
    }).join(' · ');
    vacHtml = `<div class="insight" style="border-left-color:var(--purple); background:rgba(107,78,168,0.07)">💉 <b>กำหนดทำวัคซีน:</b> ${items}</div>`;
  }

  const risky = scored.filter(s => s.r.level !== 'OK').sort((a, b) => b.r.score - a.r.score);
  const board = document.getElementById('risk-board');

  if (risky.length === 0) {
    board.innerHTML = vacHtml +
      `<div class="insight good">✓ ทุกเล้าอยู่ในเกณฑ์ปกติ — ไม่มีเล้าที่ต้องเฝ้าระวังเป็นพิเศษวันนี้</div>`;
    return;
  }

  const LEVEL_PILL = { CRITICAL: 'crit', HIGH: 'high', WATCH: 'watch' };
  const LEVEL_LABEL = { CRITICAL: 'วิกฤต', HIGH: 'เสี่ยงสูง', WATCH: 'เฝ้าระวัง' };

  const rows = risky.map((s, i) => {
    const { h, r } = s;
    const fc = getFarmClass(s.farmKey, farmKeys);
    const rowCls = r.level === 'CRITICAL' ? 'crit' : r.level === 'HIGH' ? 'high' : '';
    const reasonsHtml = r.reasons.map(x => `• ${escapeHtml(x.reason)}`).join('<br>');
    const vacTag = r.vaccineNote
      ? `<div style="font-size:11px; color:var(--purple); margin-top:3px">💉 ${escapeHtml(r.vaccineNote)}</div>` : '';
    return `<tr class="${rowCls}">
      <td><b>${i+1}</b></td>
      <td><span class="pill ${fc}">${escapeHtml(s.farmName.replace('ฟาร์ม',''))}</span> <b>${h.house}</b></td>
      <td class="mono">${h.age != null ? h.age : '–'}</td>
      <td class="mono"><b style="font-size:16px">${r.score}</b></td>
      <td><span class="pill ${LEVEL_PILL[r.level]}">${LEVEL_LABEL[r.level]}</span></td>
      <td style="font-size:12px; line-height:1.55">${reasonsHtml}${vacTag}</td>
    </tr>`;
  }).join('');

  board.innerHTML = vacHtml + `
    <p class="lede" style="margin-bottom:12px">${risky.length} เล้าต้องเฝ้าระวัง — เรียงตามคะแนนความเสี่ยงรวม (สังเคราะห์จากทุกสัญญาณ) · คะแนนสูง = ด่วนกว่า</p>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>อันดับ</th><th>ฟาร์ม/เล้า</th><th>อายุ</th>
          <th>คะแนน</th><th>ระดับ</th><th>เหตุผล &amp; สิ่งที่ต้องเช็ค</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// ========== OVERVIEW TAB ==========

function renderOverview(farmKeys) {
  let totalIn = 0, totalDead = 0, totalRem = 0, totalDeadToday = 0, totalHouses = 0, criticalHouses = 0;

  for (const fk of farmKeys) {
    const farm = STATE.farms[fk];
    for (const h of farm.houses) {
      totalIn += h.qty_in || 0;
      totalDead += h.death_cum || 0;
      totalRem += h.qty_rem || 0;
      totalDeadToday += h.death_day || 0;
      totalHouses++;
      if ((h.pct_cum || 0) >= 4) criticalHouses++;
    }
  }

  const avgPct = totalIn > 0 ? (totalDead / totalIn) * 100 : 0;
  const dailyRate = totalIn > 0 ? (totalDeadToday / totalIn) * 100 : 0;

  const kpiHtml = `
    <div class="stat">
      <div class="lab">ไก่คงเหลือรวม</div>
      <div class="val">${fmtNum(totalRem)}</div>
      <div class="delta">จาก ${fmtNum(totalIn)} ที่ลง</div>
    </div>
    <div class="stat">
      <div class="lab">ตายสะสมรวม</div>
      <div class="val">${fmtNum(totalDead)}</div>
      <div class="delta ${avgPct > 2 ? 'warn' : 'good'}">${fmtPct(avgPct)} (มาตรฐาน &lt; 2%)</div>
    </div>
    <div class="stat">
      <div class="lab">ตายวันนี้</div>
      <div class="val">${fmtNum(totalDeadToday)}</div>
      <div class="delta ${dailyRate > 0.06 ? 'warn' : 'good'}">${dailyRate.toFixed(3)}%/วัน</div>
    </div>
    <div class="stat">
      <div class="lab">เล้าวิกฤต</div>
      <div class="val">${criticalHouses}</div>
      <div class="delta ${criticalHouses > 0 ? 'warn' : 'good'}">%ตาย &gt; 4%</div>
    </div>
  `;
  document.getElementById('kpi-row').innerHTML = kpiHtml;

  document.getElementById('overview-lede').innerHTML =
    `วันนี้มีข้อมูล <b>${farmKeys.length} ฟาร์ม</b> · <b>${totalHouses} เล้า</b> · ไก่ <b>${fmtNum(totalIn)} ตัว</b> — เลื่อนแท็บเพื่อ drill down รายเล้า`;

  // Farm cards
  const farmsHtml = farmKeys.map((fk, idx) => {
    const farm = STATE.farms[fk];
    const pct = farmAvgMortality(farm);
    const farmIn = farm.houses.reduce((s,h) => s + (h.qty_in||0), 0);
    const farmRem = farm.houses.reduce((s,h) => s + (h.qty_rem||0), 0);
    const farmDeadToday = farm.houses.reduce((s,h) => s + (h.death_day||0), 0);
    const ageMin = Math.min(...farm.houses.map(h => h.age).filter(a => a));
    const ageMax = Math.max(...farm.houses.map(h => h.age).filter(a => a));
    const pctCls = pct < 2 ? 'green' : pct < 3 ? 'amber' : 'red';
    const rank = RANK_CLASS[idx];

    return `
      <div class="farm-card ${rank}">
        <div class="rank">№ 0${idx+1}${idx===0 ? ' · BEST' : (pct >= 3 ? ' · CRITICAL' : '')}</div>
        <h3>${escapeHtml(farm.name)}</h3>
        <div class="roundlab">${farm.round ? 'รุ่นที่ '+farm.round+' · ' : ''}${ageMin === ageMax ? 'อายุ '+ageMin : 'อายุ '+ageMin+'–'+ageMax} วัน · ${farm.houses.length} เล้า</div>
        <div class="stats">
          <div class="cell"><div class="k">ยอดลง</div><div class="v">${fmtNum(farmIn)}</div></div>
          <div class="cell"><div class="k">คงเหลือ</div><div class="v">${fmtNum(farmRem)}</div></div>
          <div class="cell"><div class="k">%ตายสะสม</div><div class="v ${pctCls}">${fmtPct(pct)}</div></div>
          <div class="cell"><div class="k">ตายวันนี้</div><div class="v">${fmtNum(farmDeadToday)}</div></div>
        </div>
        <div class="bar"><i style="width:${Math.min(100, pct*20)}%"></i></div>
      </div>
    `;
  }).join('');
  document.getElementById('farms-grid').innerHTML = farmsHtml;

  // Heatmap
  const hmHtml = farmKeys.map(fk => {
    const farm = STATE.farms[fk];
    const farmIn = farm.houses.reduce((s,h) => s + (h.qty_in||0), 0);
    const farmDead = farm.houses.reduce((s,h) => s + (h.death_cum||0), 0);
    const avg = farmIn > 0 ? (farmDead/farmIn*100).toFixed(2) : '0';
    const cellsHtml = farm.houses.map(h => `
      <div class="heat-cell ${classifyMortality(h.pct_cum||0)}" title="${escapeHtml(h.source)} · ${(h.density||0).toFixed(1)} ตัว/ตร.ม. · ${fmtNum(h.death_cum)} ตัว">
        <div class="h">เล้า ${h.house}</div>
        <div class="p">${fmtPct(h.pct_cum||0)}</div>
        <div class="d">${fmtNum(h.death_cum)} / ${((h.qty_in||0)/1000).toFixed(1)}k</div>
      </div>
    `).join('');
    return `
      <div style="margin-bottom: 20px">
        <h4 style="font-family:'Bai Jamjuree',sans-serif; font-size:15px; font-weight:600; margin-bottom:10px; display:flex; align-items:baseline; gap:10px">
          ${escapeHtml(farm.name)}
          <small style="font-size:11px; color:var(--ink-mute); font-weight:400; letter-spacing:0.05em">${farm.houses.length} เล้า · เฉลี่ย ${avg}%</small>
        </h4>
        <div class="heat-grid">${cellsHtml}</div>
      </div>
    `;
  }).join('');
  const legendHtml = `
    <div class="heat-legend">
      <span>%ตายสะสม:</span>
      <div class="sw" style="background:#ecf3e1"></div><span>&lt; 1.5%</span>
      <div class="sw" style="background:#f5edd5"></div><span>1.5-2.5%</span>
      <div class="sw" style="background:#f3d5c6"></div><span>2.5-3.3%</span>
      <div class="sw" style="background:#e8b4b8"></div><span>3.3-4%</span>
      <div class="sw" style="background:#d49097"></div><span>≥ 4% วิกฤต</span>
    </div>
  `;
  document.getElementById('heatmap-container').innerHTML = `<div class="card">${hmHtml}${legendHtml}</div>`;

  document.getElementById('cnt-overview').textContent = farmKeys.length;
}

// ========== MORTALITY TAB ==========

function renderMortality(farmKeys) {
  const allHouses = [];
  for (const fk of farmKeys) {
    for (const h of STATE.farms[fk].houses) {
      allHouses.push({ ...h, farmKey: fk, farmName: STATE.farms[fk].name });
    }
  }

  // Source pattern
  const srcGroups = {};
  for (const h of allHouses) {
    const cnt = (h.source || '').split(',').filter(s => s.trim()).length;
    const cat = cnt === 0 ? 'unknown' : cnt === 1 ? 'แหล่งเดียว' : cnt + ' แหล่งผสม';
    if (!srcGroups[cat]) srcGroups[cat] = { in: 0, dead: 0, count: 0 };
    srcGroups[cat].in += h.qty_in || 0;
    srcGroups[cat].dead += h.death_cum || 0;
    srcGroups[cat].count++;
  }

  const srcRows = Object.entries(srcGroups)
    .filter(([, v]) => v.in > 0)
    .map(([k, v]) => ({ cat: k, rate: v.dead/v.in*100, count: v.count }))
    .sort((a,b) => a.rate - b.rate);

  if (srcRows.length > 0) {
    const maxRate = Math.max(...srcRows.map(r => r.rate));
    const srcBars = srcRows.map(r => {
      const cls = r.rate < 2.5 ? 'g' : r.rate < 3.3 ? 'w' : 'b';
      return `<div class="bar-row ${cls}">
        <div class="lab">${escapeHtml(r.cat)} (${r.count} เล้า)</div>
        <div class="bar"><i style="width:${(r.rate/maxRate*100).toFixed(0)}%"></i></div>
        <div class="val">${r.rate.toFixed(2)}%</div>
      </div>`;
    }).join('');
    document.getElementById('pattern-source').innerHTML = `
      <h5 style="font-family:'Bai Jamjuree',sans-serif; font-size:13px; font-weight:600; margin:12px 0 8px">จำนวนแหล่งที่มาลูกไก่ → %ตายสะสม</h5>
      ${srcBars}
    `;
  } else {
    document.getElementById('pattern-source').innerHTML = '';
  }

  // Density correlation
  const densHouses = allHouses.filter(h => h.density && h.pct_cum != null);
  if (densHouses.length > 2) {
    const buckets = [
      { lab: '≤ 11.0 ตัว/ตร.ม.', test: d => d <= 11.0, total: 0, dead: 0, count: 0 },
      { lab: '11.0–11.5 ตัว/ตร.ม.', test: d => d > 11.0 && d <= 11.5, total: 0, dead: 0, count: 0 },
      { lab: '> 11.5 ตัว/ตร.ม.', test: d => d > 11.5, total: 0, dead: 0, count: 0 },
    ];
    for (const h of densHouses) {
      for (const b of buckets) {
        if (b.test(h.density)) {
          b.total += h.qty_in || 0;
          b.dead += h.death_cum || 0;
          b.count++;
          break;
        }
      }
    }
    const filtered = buckets.filter(b => b.count > 0).map(b => ({...b, rate: b.dead/b.total*100}));
    if (filtered.length > 0) {
      const maxR = Math.max(...filtered.map(b => b.rate));
      const densBars = filtered.map(b => {
        const cls = b.rate < 2.5 ? 'g' : b.rate < 3.3 ? 'w' : 'b';
        return `<div class="bar-row ${cls}">
          <div class="lab">${b.lab} (${b.count} เล้า)</div>
          <div class="bar"><i style="width:${(b.rate/maxR*100).toFixed(0)}%"></i></div>
          <div class="val">${b.rate.toFixed(2)}%</div>
        </div>`;
      }).join('');
      document.getElementById('pattern-density').innerHTML = `
        <h5 style="font-family:'Bai Jamjuree',sans-serif; font-size:13px; font-weight:600; margin:18px 0 8px">ความหนาแน่น → %ตายสะสม</h5>
        ${densBars}
      `;
    }
  } else {
    document.getElementById('pattern-density').innerHTML = '';
  }

  // Sort houses
  const sorted = [...allHouses].sort((a, b) => {
    let va, vb;
    if (mortSort.col === 'pct') { va = a.pct_cum||0; vb = b.pct_cum||0; }
    else if (mortSort.col === 'age') { va = a.age||0; vb = b.age||0; }
    else if (mortSort.col === 'density') { va = a.density||0; vb = b.density||0; }
    else if (mortSort.col === 'death_day') { va = a.death_day||0; vb = b.death_day||0; }
    else if (mortSort.col === 'farm') { va = a.farmName||''; vb = b.farmName||''; return mortSort.dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va); }
    else { va = 0; vb = 0; }
    return mortSort.dir === 'asc' ? va - vb : vb - va;
  });

  document.querySelectorAll('#mort-table thead th.sortable').forEach(th => {
    th.classList.remove('sorted-asc','sorted-desc');
    if (th.dataset.sort === mortSort.col) {
      th.classList.add(mortSort.dir === 'asc' ? 'sorted-asc' : 'sorted-desc');
    }
  });

  const rowsHtml = sorted.map((h, i) => {
    const diag = diagnoseHouse(h);
    const fc = getFarmClass(h.farmKey, farmKeys);
    const rowCls = diag.priority === 'CRITICAL' ? 'crit' : diag.priority === 'HIGH' ? 'high' : '';
    const causesHtml = diag.causes.map(c => `• ${escapeHtml(c)}`).join('<br>');
    const solsHtml = diag.solutions.map((s, j) => `<b>${j+1}.</b> ${escapeHtml(s)}`).join('<br>');
    const srcShort = h.source.length > 35 ? h.source.substring(0, 33) + '…' : h.source;
    return `
      <tr class="${rowCls}">
        <td><b>${i+1}</b></td>
        <td><span class="pill ${fc}">${escapeHtml(h.farmName.replace('ฟาร์ม',''))}</span> <b>${h.house}</b></td>
        <td class="mono">${h.age_raw != null ? escapeHtml(String(h.age_raw)) : '–'}</td>
        <td class="pct ${pctClass(h.pct_cum||0)}">${fmtPct(h.pct_cum||0)}</td>
        <td class="mono">${h.death_day != null ? h.death_day : '–'}</td>
        <td class="mono">${(h.density||0).toFixed(2)}</td>
        <td>
          <span class="pill ${diag.priority.toLowerCase()}">${diag.priority}</span>
          <div style="font-size:11px; color:var(--ink-soft); margin-top:4px; line-height:1.5">${causesHtml}<br><span style="color:var(--ink-mute); font-size:10px">ที่มา: ${escapeHtml(srcShort)}</span></div>
        </td>
        <td style="font-size:12px; line-height:1.5">${solsHtml}</td>
      </tr>
    `;
  }).join('');
  document.getElementById('mort-tbody').innerHTML = rowsHtml;
  document.getElementById('cnt-mortality').textContent = allHouses.length;
}

// ========== FEED TAB ==========

function renderFeed(farmKeys) {
  const allHouses = [];
  for (const fk of farmKeys) {
    for (const h of STATE.farms[fk].houses) {
      const analysis = analyzeFeed(h);
      if (analysis) {
        allHouses.push({ ...h, ...analysis, farmKey: fk, farmName: STATE.farms[fk].name });
      }
    }
  }

  const counts = { OK: 0, LIGHT: 0, LOW: 0, CRITICAL: 0, OVERFEED: 0 };
  allHouses.forEach(h => counts[h.status]++);

  const feedKpi = `
    <div class="stat">
      <div class="lab">ปกติ (OK)</div>
      <div class="val" style="color:var(--green)">${counts.OK}</div>
      <div class="delta">±5%</div>
    </div>
    <div class="stat">
      <div class="lab">LIGHT</div>
      <div class="val" style="color:var(--amber-soft)">${counts.LIGHT}</div>
      <div class="delta">-5 ถึง -10%</div>
    </div>
    <div class="stat">
      <div class="lab">LOW</div>
      <div class="val" style="color:#c87f60">${counts.LOW}</div>
      <div class="delta">-10 ถึง -20%</div>
    </div>
    <div class="stat">
      <div class="lab">CRITICAL</div>
      <div class="val" style="color:var(--red)">${counts.CRITICAL}</div>
      <div class="delta warn">น้อย &gt; 20% · เสี่ยง!</div>
    </div>
    <div class="stat">
      <div class="lab">OVERFEED</div>
      <div class="val" style="color:var(--purple)">${counts.OVERFEED}</div>
      <div class="delta">มากกว่า +5%</div>
    </div>
  `;
  document.getElementById('feed-kpi').innerHTML = feedKpi;

  const sorted = [...allHouses].sort((a, b) => {
    let va, vb;
    if (feedSort.col === 'dev') { va = a.dev; vb = b.dev; }
    else if (feedSort.col === 'age') { va = a.age; vb = b.age; }
    else if (feedSort.col === 'qty') { va = a.qty_rem||0; vb = b.qty_rem||0; }
    else if (feedSort.col === 'farm') { va = a.farmName||''; vb = b.farmName||''; return feedSort.dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va); }
    else { va = 0; vb = 0; }
    return feedSort.dir === 'asc' ? va - vb : vb - va;
  });

  document.querySelectorAll('#feed-table thead th.sortable').forEach(th => {
    th.classList.remove('sorted-asc','sorted-desc');
    if (th.dataset.sort === feedSort.col) {
      th.classList.add(feedSort.dir === 'asc' ? 'sorted-asc' : 'sorted-desc');
    }
  });

  const ADVICE = {
    OK: 'ปกติ · กินตามเกณฑ์ฟาร์ม',
    LIGHT: 'controlled feed · ตรวจน.น.รายสัปดาห์',
    LOW: 'พิจารณาเพิ่ม 10-15% หาก น.น.ต่ำกว่าเกณฑ์',
    CRITICAL: 'ตรวจสุขภาพ! ไก่อาจป่วย · เช็คน้ำ-แสง-อุณหภูมิ',
    OVERFEED: 'เช็คการสิ้นเปลือง + recheck สูตร'
  };

  const STATUS_PILL = { OK:'ok', LIGHT:'light', LOW:'low', CRITICAL:'cf', OVERFEED:'over' };
  const STATUS_LABEL = { OK:'OK', LIGHT:'LIGHT', LOW:'LOW', CRITICAL:'CRITICAL', OVERFEED:'OVER' };

  const rowsHtml = sorted.map((h, i) => {
    const fc = getFarmClass(h.farmKey, farmKeys);
    const rowCls = h.status === 'CRITICAL' ? 'crit' : h.status === 'LOW' ? 'high' : '';
    const devCls = h.dev > 5 ? 'pct-c' : h.dev < -15 ? 'pct-c' : h.dev < -5 ? 'pct-w' : 'pct-o';
    const devSign = h.dev >= 0 ? '+' : '';
    const rossSign = h.rossDev != null && h.rossDev >= 0 ? '+' : '';
    return `
      <tr class="${rowCls}">
        <td><b>${i+1}</b></td>
        <td><span class="pill ${fc}">${escapeHtml(h.farmName.replace('ฟาร์ม',''))}</span> <b>${h.house}</b></td>
        <td class="mono">${h.age}</td>
        <td class="mono">${fmtNum(h.qty_rem)}</td>
        <td class="mono">${fmtNum(h.feed_day)}</td>
        <td class="mono">${h.feedPerBird.toFixed(1)}</td>
        <td class="mono">${h.stdFeed}<br><small style="color:var(--ink-mute)">Ross ${h.rossFeed != null ? h.rossFeed : '–'}</small></td>
        <td class="pct ${devCls}">${devSign}${h.dev.toFixed(1)}%<br><small style="color:var(--ink-mute)">${h.rossDev != null ? rossSign + h.rossDev.toFixed(1) + '%' : ''}</small></td>
        <td><span class="pill ${STATUS_PILL[h.status]}">${STATUS_LABEL[h.status]}</span></td>
        <td style="font-size:11px; color:var(--ink-soft)">${ADVICE[h.status]}</td>
      </tr>
    `;
  }).join('');
  document.getElementById('feed-tbody').innerHTML = rowsHtml ||
    `<tr><td colspan="10" style="text-align:center; padding:24px; color:var(--ink-mute)">
      ไม่มีข้อมูลอาหารที่คำนวณได้ — ไฟล์ Excel อาจไม่มีคอลัมน์ "อาหาร/วัน", "อายุ", หรือ "ยอดไก่คงเหลือ" ครบ
     </td></tr>`;
  document.getElementById('cnt-feed').textContent = allHouses.length;
}

// ========== FCR TAB ==========

function renderFCR(farmKeys) {
  const prices = STATE.prices;

  const beAt27 = breakevenFCR(2.7, prices);
  const beAt28 = breakevenFCR(2.8, prices);
  const typicalProfit = profitCalc(2.7, 1.55, prices);

  document.getElementById('fcr-kpi').innerHTML = `
    <div class="stat">
      <div class="lab">Break-even FCR @ 2.7 kg</div>
      <div class="val" style="color:${beAt27 < 1.65 ? 'var(--red)' : 'var(--amber)'}">${beAt27.toFixed(2)}</div>
      <div class="delta ${beAt27 < 1.65 ? 'warn' : ''}">ถ้า FCR &gt; ${beAt27.toFixed(2)} = ขาดทุน</div>
    </div>
    <div class="stat">
      <div class="lab">Break-even FCR @ 2.8 kg</div>
      <div class="val" style="color:var(--amber)">${beAt28.toFixed(2)}</div>
      <div class="delta">รุ่น Yungruay/Heavy</div>
    </div>
    <div class="stat">
      <div class="lab">กำไร @ 2.7kg + FCR 1.55</div>
      <div class="val" style="color:${typicalProfit > 8 ? 'var(--green)' : typicalProfit > 0 ? 'var(--amber)' : 'var(--red)'}">${typicalProfit > 0 ? '+' : ''}${typicalProfit.toFixed(1)} บ.</div>
      <div class="delta">ต่อตัว · standard scenario</div>
    </div>
    <div class="stat">
      <div class="lab">Total Revenue Potential</div>
      <div class="val">${fmtNum(farmKeys.reduce((s, fk) => s + STATE.farms[fk].houses.reduce((a, h) => a + (h.qty_rem||0)*2.7*prices.sale, 0), 0))}</div>
      <div class="delta">บาท · ถ้าทุกตัวขายได้ 2.7kg</div>
    </div>
  `;

  // Sensitivity matrix
  const FCRs = [1.40, 1.50, 1.55, 1.60, 1.65, 1.70, 1.75, 1.80, 1.85];
  const wts = [2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 3.0];

  let sensHeader = '<thead><tr><th>FCR ↓ / น.น. →</th>' + wts.map(w => `<th>${w} kg</th>`).join('') + '</tr></thead>';
  let sensBody = '<tbody>';
  for (const fcr of FCRs) {
    sensBody += `<tr><td><b>FCR ${fcr.toFixed(2)}</b></td>`;
    for (const wt of wts) {
      const p = profitCalc(wt, fcr, prices);
      let cls = 'p-loss';
      if (p >= 15) cls = 'p-good';
      else if (p >= 5) cls = 'p-ok';
      else if (p >= 0) cls = 'p-bad';
      const txt = p >= 0 ? '+' + p.toFixed(1) : p.toFixed(1);
      sensBody += `<td class="sens-cell ${cls}">${txt}</td>`;
    }
    sensBody += '</tr>';
  }
  sensBody += '</tbody>';
  document.getElementById('sens-table').innerHTML = sensHeader + sensBody;

  // Ross 308 table
  const rossRows = [7, 14, 21, 28, 32, 35, 38, 40, 42].map(age => {
    const r = ROSS308[age];
    return `<tr class="std"><td><b>${age}</b></td><td>${r.bw.toFixed(3)}</td><td>${r.daily}</td><td>${r.cum.toFixed(3)}</td><td><b>${r.fcr.toFixed(2)}</b></td><td>${r.adg}</td></tr>`;
  }).join('');
  document.getElementById('ross-tbody').innerHTML = rossRows;

  // Per-farm profit
  const farmProfit = farmKeys.map(fk => {
    const farm = STATE.farms[fk];
    const avgAge = farmAvgAge(farm);
    const farmRem = farm.houses.reduce((s,h) => s + (h.qty_rem||0), 0);
    const std = rossLookup(Math.round(avgAge));
    const stdWt = mixedBwLookup(Math.round(avgAge)) || (std ? std.bw : 2.7);
    const stdFCR = std ? std.fcr : 1.55;
    const farmWts = farm.houses.map(h => h.wt_actual).filter(w => w);
    const avgWt = farmWts.length > 0 ? farmWts.reduce((s,w)=>s+w,0)/farmWts.length : stdWt;
    const estFCR = stdFCR + 0.10;

    const profitPerBird = profitCalc(avgWt, estFCR, prices);
    const totalProfit = profitPerBird * farmRem;

    return { name: farm.name, age: avgAge.toFixed(1), wt: avgWt, fcr: estFCR, perBird: profitPerBird, total: totalProfit, qty: farmRem };
  });

  const profitHtml = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>ฟาร์ม</th><th>เฉลี่ยอายุ</th><th>น.น.ใช้คำนวณ</th><th>FCR estimate</th><th>คงเหลือ</th><th>กำไร/ตัว</th><th>กำไรประมาณรวม</th></tr>
        </thead>
        <tbody>
          ${farmProfit.map(f => {
            const pCls = f.perBird > 8 ? 'pct-o' : f.perBird > 0 ? 'pct-w' : 'pct-c';
            return `<tr>
              <td><b>${escapeHtml(f.name)}</b></td>
              <td class="mono">${f.age} วัน</td>
              <td class="mono">${f.wt.toFixed(2)} kg</td>
              <td class="mono">${f.fcr.toFixed(2)}</td>
              <td class="mono">${fmtNum(f.qty)}</td>
              <td class="pct ${pCls}">${f.perBird > 0 ? '+' : ''}${f.perBird.toFixed(1)} บ.</td>
              <td class="pct ${pCls}"><b>${f.total > 0 ? '+' : ''}${fmtNum(f.total, 0)} บาท</b></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    <div class="insight">⚡ <b>หมายเหตุ:</b> ตัวเลข FCR estimate = Ross 308 + 0.10 (ตามสภาพไทย) · ใช้ทำ scenario planning เท่านั้น · ของจริงต้องวัดหลังจับ</div>
  `;
  document.getElementById('farm-profit').innerHTML = profitHtml;
}

// ========== ENVIRONMENT TAB ==========

const FPM_PER_MS = 196.85; // 1 m/s ≈ 196.85 feet per minute

function fpmLabel(age) {
  const r = farmFpmLookup(age);
  if (!r) return '–';
  return r[0] === r[1] ? `${r[0]}` : `${r[0]}–${r[1]}`;
}

function renderEnv(farmKeys) {
  // 5A · per-day farm standard curve (temp + airspeed + cooling-pad pump)
  let curveRows = '';
  for (let d = 1; d <= 42; d++) {
    const t = FARM_TEMP[d], fpm = FARM_FPM[d], pump = FARM_PUMP[d];
    const msLo = (fpm[0] / FPM_PER_MS).toFixed(1);
    const msHi = (fpm[1] / FPM_PER_MS).toFixed(1);
    curveRows += `<tr>
      <td><b>${d}</b></td>
      <td class="mono"><b>${t}</b></td>
      <td class="mono">${fpm[0] === fpm[1] ? fpm[0] : fpm[0] + '–' + fpm[1]}</td>
      <td class="mono" style="color:var(--ink-mute)">${msLo === msHi ? msLo : msLo + '–' + msHi}</td>
      <td class="mono">${pump}</td>
    </tr>`;
  }
  document.getElementById('farm-temp-tbody').innerHTML = curveRows;

  // 5B · warning signs by age band (Ross 308 domain knowledge — secondary)
  document.getElementById('env-tbody').innerHTML = ENV_TABLE.map(t => `
    <tr>
      <td><b>${t.label}</b></td>
      <td style="font-size:12px; color:var(--ink-soft)">${escapeHtml(t.warn)}</td>
    </tr>
  `).join('');

  // 5D · per-farm recommendation keyed to each farm's average age
  const farmRecs = farmKeys.map(fk => {
    const farm = STATE.farms[fk];
    const ageInt = Math.round(farmAvgAge(farm));
    const tgt = farmTempLookup(ageInt);
    const fpm = farmFpmLookup(ageInt);
    const pump = farmPumpLookup(ageInt);
    const band = ENV_TABLE.find(t => ageInt >= t.ageMin && ageInt <= t.ageMax) || ENV_TABLE[ENV_TABLE.length-1];
    return `
      <div style="padding:14px; margin-bottom:10px; background:var(--cream); border:1px solid var(--rule); border-left:3px solid var(--gold)">
        <h5 style="font-family:'Bai Jamjuree',sans-serif; font-size:15px; font-weight:600; margin-bottom:6px">${escapeHtml(farm.name)} · เฉลี่ยอายุ ${ageInt} วัน</h5>
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:10px; margin-top:8px">
          <div><div style="font-size:10px; color:var(--ink-mute); letter-spacing:0.08em; text-transform:uppercase">อุณหภูมิเป้า</div><div style="font-family:'Bai Jamjuree',sans-serif; font-size:18px; font-weight:600">${tgt}°C</div></div>
          <div><div style="font-size:10px; color:var(--ink-mute); letter-spacing:0.08em; text-transform:uppercase">ความเร็วลม</div><div style="font-family:'Bai Jamjuree',sans-serif; font-size:18px; font-weight:600">${fpm[0] === fpm[1] ? fpm[0] : fpm[0] + '–' + fpm[1]} FPM</div></div>
          <div><div style="font-size:10px; color:var(--ink-mute); letter-spacing:0.08em; text-transform:uppercase">ปั๊มแพดเปิดที่</div><div style="font-family:'Bai Jamjuree',sans-serif; font-size:18px; font-weight:600">${pump}°C</div></div>
          <div><div style="font-size:10px; color:var(--ink-mute); letter-spacing:0.08em; text-transform:uppercase">ความชื้นเป้า</div><div style="font-family:'Bai Jamjuree',sans-serif; font-size:18px; font-weight:600">50–70%</div></div>
        </div>
        <div style="margin-top:10px; padding:8px 10px; background:var(--paper); font-size:12px; color:var(--ink-soft); border-left:2px solid var(--red)">
          ⚠ <b>สังเกตอาการ:</b> ${escapeHtml(band.warn)}
        </div>
      </div>
    `;
  }).join('');
  document.getElementById('farm-env-recos').innerHTML = farmRecs;

  // 5E · other reference standards (water flow, light program)
  const waterRows = WATER_FLOW_STD.map(w =>
    `<tr><td><b>${w.ageMin === 28 ? '28 วันขึ้นไป' : w.ageMin + '–' + w.ageMax + ' วัน'}</b></td>
     <td class="mono">${w.cc} ซีซี/นาที</td></tr>`).join('');
  const lightRows = LIGHT_PROGRAM.map(l =>
    `<tr><td><b>${l.ageMin === 29 ? '29 วัน–จับ' : l.ageMin + '–' + l.ageMax + ' วัน'}</b></td>
     <td>${escapeHtml(l.light)}</td><td class="mono">${l.feedRounds} รอบ/วัน</td></tr>`).join('');
  document.getElementById('env-reference').innerHTML = `
    <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:16px">
      <div>
        <div style="font-size:12px; color:var(--ink-mute); letter-spacing:0.06em; text-transform:uppercase; margin-bottom:6px">อัตราการไหลของน้ำ/หัวนิปเปิ้ล</div>
        <div class="table-wrap"><table><thead><tr><th>ช่วงอายุ</th><th>อัตราไหล</th></tr></thead><tbody>${waterRows}</tbody></table></div>
      </div>
      <div>
        <div style="font-size:12px; color:var(--ink-mute); letter-spacing:0.06em; text-transform:uppercase; margin-bottom:6px">โปรแกรมแสง &amp; รอบเดินอาหาร</div>
        <div class="table-wrap"><table><thead><tr><th>ช่วงอายุ</th><th>แสง</th><th>เดินอาหาร</th></tr></thead><tbody>${lightRows}</tbody></table></div>
      </div>
    </div>`;

  updateWindCalc();
}

function updateWindCalc() {
  const age = parseInt(document.getElementById('age-slider').value);
  const ambient = parseFloat(document.getElementById('ambient-temp').value) || 30;
  document.getElementById('age-display').textContent = age + ' วัน';

  const targetSet = farmTempLookup(age);   // farm's per-day temperature target
  const fpmTarget = farmFpmLookup(age);

  const windSpeeds = [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5];
  const effTemps = windSpeeds.map(w => windChill(ambient, w));

  let optimalWind = 0;
  for (const w of windSpeeds) {
    if (windChill(ambient, w) <= targetSet + 1) { optimalWind = w; break; }
  }
  if (optimalWind === 0 && windChill(ambient, windSpeeds[windSpeeds.length-1]) > targetSet + 1) {
    optimalWind = windSpeeds[windSpeeds.length-1];
  }
  const optimalFpm = Math.round(optimalWind * FPM_PER_MS);

  const recHtml = `
    <div style="margin-top:14px; padding:14px; background:var(--cream); border:1px solid var(--rule)">
      <div style="font-size:12px; color:var(--ink-mute); letter-spacing:0.08em; text-transform:uppercase; margin-bottom:6px">คำแนะนำ · เกณฑ์ฟาร์ม วันที่ ${age}</div>
      <div style="font-family:'Bai Jamjuree',sans-serif; font-size:24px; font-weight:600; margin-bottom:8px">
        อุณหภูมิเป้า: <span style="color:var(--green)">${targetSet}°C</span> · แรงลมที่ต้องใช้: <span style="color:var(--gold)">${optimalWind} m/s</span> <span style="font-size:14px; color:var(--ink-mute)">(~${optimalFpm} FPM)</span>
      </div>
      <div style="font-size:13px; color:var(--ink-soft)">หากไก่อายุ <b>${age} วัน</b> และอุณหภูมิห้อง <b>${ambient}°C</b> ต้องเปิดเครื่องระบายให้ได้แรงลม &gt;= ${optimalWind} m/s เพื่อให้ไก่รู้สึก ≈ ${targetSet}°C ตามเกณฑ์ฟาร์ม · เกณฑ์ลมรายวัน: <b>${fpmTarget[0] === fpmTarget[1] ? fpmTarget[0] : fpmTarget[0] + '–' + fpmTarget[1]} FPM</b></div>
    </div>

    <div style="margin-top:12px">
      <div style="font-size:12px; color:var(--ink-mute); letter-spacing:0.08em; text-transform:uppercase; margin-bottom:6px">Wind Chill Table · ที่ ${ambient}°C (เขียว = ถึงอุณหภูมิเป้า ${targetSet}°C)</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>แรงลม (m/s)</th>${windSpeeds.map(w => `<th>${w}</th>`).join('')}</tr></thead>
          <tbody>
            <tr>
              <td><b>Effective temp (°C)</b></td>
              ${effTemps.map(et => {
                let cls = 'p-loss';
                if (et <= targetSet + 1) cls = 'p-good';
                else if (et - targetSet < 3) cls = 'p-ok';
                else if (et - targetSet < 6) cls = 'p-bad';
                return `<td class="sens-cell ${cls}">${et.toFixed(1)}</td>`;
              }).join('')}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
  document.getElementById('wind-recommendation').innerHTML = recHtml;
}
