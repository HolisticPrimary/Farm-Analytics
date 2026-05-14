// ====================================================================
// FARMSENSE · History & Trend tab
//   Lists saved snapshots, plots per-farm trend across rounds, and
//   computes mortality velocity (Δ%ตาย ÷ Δอายุ) between snapshots.
// ====================================================================

// Per-snapshot summary metrics computed from its stored houses.
function snapshotMetrics(snap) {
  const houses = snap.houses || [];
  const farm = { houses };
  const avgMort = farmAvgMortality(farm);
  const avgAge = farmAvgAge(farm);
  let risk = 0;
  for (const h of houses) {
    const r = houseRiskScore(h, houses);
    if (r.level === 'CRITICAL' || r.level === 'HIGH') risk++;
  }
  return { avgMort, avgAge, risk, houseCount: houses.length };
}

async function renderHistory() {
  const root = document.getElementById('history-board');
  if (!root) return;

  const mode = historyMode();
  const modeNote = mode === 'memory'
    ? '<div class="insight warn">⚠ <b>โหมดเก็บชั่วคราว</b> — เบราว์เซอร์ในบริบทนี้ไม่อนุญาตให้บันทึกถาวร (เช่น preview panel หรือ sandbox) ประวัติจะหายเมื่อปิดหน้า · เปิด <b>farmsense.html</b> ตรงๆ ในเบราว์เซอร์เพื่อเก็บถาวร</div>'
    : '';

  let snaps;
  try {
    snaps = await listSnapshots();
  } catch (e) {
    root.innerHTML = `<div class="insight warn">⚠ เปิดประวัติไม่ได้: ${escapeHtml(e.message)}</div>`;
    return;
  }

  if (!snaps.length) {
    root.innerHTML = modeNote +
      `<div class="insight">ยังไม่มีประวัติ — ทุกครั้งที่อัปโหลดไฟล์ ระบบจะบันทึก snapshot ไว้ที่นี่อัตโนมัติ (เก็บในเบราว์เซอร์ ไม่ส่งออกที่ไหน)</div>`;
    return;
  }

  // group by farm; within a farm, order by saved time (≈ chronological upload)
  const byFarm = {};
  for (const s of snaps) {
    (byFarm[s.farmName] = byFarm[s.farmName] || []).push(s);
  }
  for (const k of Object.keys(byFarm)) {
    byFarm[k].sort((a, b) => a.savedAt.localeCompare(b.savedAt));
  }

  const farmBlocks = Object.entries(byFarm).map(([farmName, list]) => {
    const rows = list.map((s, i) => {
      const m = snapshotMetrics(s);
      // mortality velocity vs the previous snapshot of the same round
      let vel = '';
      if (i > 0) {
        const prev = list[i - 1];
        const pm = snapshotMetrics(prev);
        const dAge = m.avgAge - pm.avgAge;
        if (prev.round === s.round && dAge > 0.3) {
          const v = (m.avgMort - pm.avgMort) / dAge;
          const cls = v > 0.25 ? 'pct-c' : v > 0.12 ? 'pct-w' : 'pct-o';
          vel = `<span class="pct ${cls}">${v >= 0 ? '+' : ''}${v.toFixed(2)}%/วัน</span>`;
        } else {
          vel = '<span style="color:var(--ink-mute)">—</span>';
        }
      } else {
        vel = '<span style="color:var(--ink-mute)">—</span>';
      }
      const mortCls = m.avgMort < 2 ? 'pct-o' : m.avgMort < 3 ? 'pct-w' : 'pct-c';
      return `<tr>
        <td>${escapeHtml(s.date || s.savedAt.slice(0, 10))}</td>
        <td class="mono">${s.round != null ? 'รุ่น ' + s.round : '–'}</td>
        <td class="mono">${m.avgAge.toFixed(1)}</td>
        <td class="mono">${m.houseCount}</td>
        <td class="pct ${mortCls}">${m.avgMort.toFixed(2)}%</td>
        <td>${vel}</td>
        <td class="mono ${m.risk > 0 ? 'pct-c' : 'pct-o'}">${m.risk}</td>
        <td style="white-space:nowrap">
          <button class="map-btn ghost hist-load" data-key="${escapeHtml(s.key)}">โหลด</button>
          <button class="map-btn hist-del" data-key="${escapeHtml(s.key)}">ลบ</button>
        </td>
      </tr>`;
    }).join('');
    return `
      <div class="card">
        <h4>${escapeHtml(farmName)} <span style="font-size:11px; color:var(--ink-mute); font-weight:400">· ${list.length} snapshot</span></h4>
        <div class="card-sub">ความเร็วการตาย = Δ%ตายสะสม ÷ Δอายุเฉลี่ย (เทียบเฉพาะ snapshot รุ่นเดียวกัน) · เขียว &lt;0.12 · เหลือง &lt;0.25 · แดง = ตายเร่งขึ้น</div>
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>วันที่</th><th>รุ่น</th><th>อายุเฉลี่ย</th><th>เล้า</th>
              <th>%ตายเฉลี่ย</th><th>ความเร็วการตาย</th><th>เล้าเสี่ยง</th><th></th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
  }).join('');

  const storeLabel = mode === 'memory'
    ? 'เก็บชั่วคราว (session นี้)'
    : 'เก็บถาวรในเบราว์เซอร์นี้';
  root.innerHTML = modeNote + `
    <div class="insight">📁 ${snaps.length} snapshot จาก ${Object.keys(byFarm).length} ฟาร์ม · ${storeLabel}
      <button class="map-btn ghost hist-clear" style="margin-left:auto">ล้างประวัติทั้งหมด</button>
    </div>
    ${farmBlocks}`;

  // wire buttons
  root.querySelectorAll('.hist-load').forEach(b =>
    b.onclick = () => loadSnapshotToDashboard(b.dataset.key));
  root.querySelectorAll('.hist-del').forEach(b =>
    b.onclick = async () => {
      if (!confirm('ลบ snapshot นี้ออกจากประวัติ?')) return;
      await deleteSnapshot(b.dataset.key);
      renderHistory();
    });
  const clearBtn = root.querySelector('.hist-clear');
  if (clearBtn) clearBtn.onclick = async () => {
    if (!confirm('ล้างประวัติทั้งหมด? ไม่สามารถกู้คืนได้')) return;
    await clearAllSnapshots();
    renderHistory();
  };
}
