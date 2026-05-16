// ====================================================================
// FARMSENSE · Exports (JSON / CSV / Word / PDF)
//
// All downloads route through downloadFile() which is hardened for:
//  - Firefox (anchor must be in DOM before .click())
//  - file:// origins (fallback to data: URI in a new tab)
//  - permission errors (helpful Thai alert instead of silent failure)
// ====================================================================

function downloadFile(filename, content, mime) {
  let url = null;
  let a = null;
  try {
    const blob = new Blob([content], { type: mime });
    url = URL.createObjectURL(blob);
    a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);  // Firefox needs the node in the DOM
    a.click();
    setTimeout(() => {
      try { if (a && a.parentNode) a.parentNode.removeChild(a); } catch (_) {}
      try { if (url) URL.revokeObjectURL(url); } catch (_) {}
    }, 2000);
    return true;
  } catch (err) {
    // Fallback path — open as a new tab with the content so the user
    // can save manually (Ctrl/Cmd+S). Works on stricter file:// setups
    // where Blob downloads are blocked.
    try {
      const isText = mime.startsWith('text/') || mime === 'application/json'
        || mime === 'application/msword';
      let href;
      if (isText) {
        href = 'data:' + mime + ';charset=utf-8,' + encodeURIComponent(content);
      } else {
        href = 'data:' + mime + ';base64,' + btoa(unescape(encodeURIComponent(content)));
      }
      const win = window.open(href, '_blank');
      if (!win) throw new Error('popup blocked');
      alert('เปิดข้อมูลในแท็บใหม่แล้ว — กด Ctrl/Cmd+S เพื่อบันทึกเป็น "' + filename + '"');
      return true;
    } catch (err2) {
      alert(
        'Export ไม่สำเร็จ\n\n' +
        'เหตุผล: ' + (err.message || err) + '\n' +
        'Fallback: ' + (err2.message || err2) + '\n\n' +
        'วิธีแก้:\n' +
        '1. ใช้ Chrome / Edge เปิดเว็บ (ไม่ใช่ Safari Private)\n' +
        '2. ถ้าเปิดไฟล์โดยตรง (file://) ให้ไปเปิดที่ลิงก์ GitHub Pages แทน\n' +
        '3. ลองปิด pop-up blocker ของเบราว์เซอร์'
      );
      return false;
    }
  }
}

function _dateStr() { return new Date().toISOString().split('T')[0]; }

function exportJSON() {
  const farms = {};
  for (const [k, f] of Object.entries(STATE.farms)) {
    // Strip parsing-only fields so the JSON is a clean analysis snapshot.
    const { rows, headerIdx, headerLabels, ...clean } = f;
    farms[k] = clean;
  }
  const out = {
    generated: new Date().toISOString(),
    prices: STATE.prices,
    farms,
  };
  downloadFile('farmsense-' + _dateStr() + '.json',
    JSON.stringify(out, null, 2), 'application/json');
}

function exportMortalityCSV() {
  let csv = 'Farm,House,Age,Source,Density,QtyIn,QtyRemaining,DeathDay,DeathCum,PctDeathCum,Priority\n';
  for (const fk of Object.keys(STATE.farms)) {
    const farm = STATE.farms[fk];
    for (const h of farm.houses) {
      const diag = diagnoseHouse(h);
      csv += `"${farm.name}","${h.house}",${h.age||''},"${h.source||''}",${h.density||''},${h.qty_in||''},${h.qty_rem||''},${h.death_day||''},${h.death_cum||''},${h.pct_cum||''},${diag.priority}\n`;
    }
  }
  // UTF-8 BOM keeps Excel happy with Thai characters.
  downloadFile('mortality-' + _dateStr() + '.csv', '﻿' + csv, 'text/csv;charset=utf-8');
}

function exportFeedCSV() {
  let csv = 'Farm,House,Age,QtyRem,FeedKgDay,GBirdDay,StdGBirdDay,DeviationPct,Status\n';
  for (const fk of Object.keys(STATE.farms)) {
    const farm = STATE.farms[fk];
    for (const h of farm.houses) {
      const a = analyzeFeed(h);
      if (a) {
        csv += `"${farm.name}","${h.house}",${h.age},${h.qty_rem||''},${h.feed_day||''},${a.feedPerBird.toFixed(2)},${a.stdFeed},${a.dev.toFixed(2)},${a.status}\n`;
      }
    }
  }
  downloadFile('feed-' + _dateStr() + '.csv', '﻿' + csv, 'text/csv;charset=utf-8');
}

// ====================================================================
// Word report — generated as Office-flavoured HTML saved with a .doc
// extension. Word opens it like a native document; tables, headings,
// and colours all carry over. No external libs required.
// ====================================================================

function _esc(v) {
  if (v == null) return '';
  return String(v).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}
function _num(v, d = 0) {
  if (v == null) return '–';
  return Number(v).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
}
function _pct(v, d = 2) { return v == null ? '–' : v.toFixed(d) + '%'; }

// Build the body HTML used by both Word and Print exports.
function buildReportBody() {
  const farmKeys = Object.keys(STATE.farms);
  if (farmKeys.length === 0) {
    return '<p style="color:#888">ยังไม่มีข้อมูล — อัปโหลดใบหน้าเล้าก่อน</p>';
  }

  const dateThai = new Date().toLocaleDateString('th-TH', { year:'numeric', month:'long', day:'numeric' });

  // ---------- Farm-wide KPIs ----------
  let totalIn = 0, totalDead = 0, totalRem = 0, totalDeadToday = 0, totalHouses = 0, criticalHouses = 0;
  for (const fk of farmKeys) {
    for (const h of STATE.farms[fk].houses) {
      totalIn += h.qty_in || 0;
      totalDead += h.death_cum || 0;
      totalRem += h.qty_rem || 0;
      totalDeadToday += h.death_day || 0;
      totalHouses++;
      if ((h.pct_cum || 0) >= 4) criticalHouses++;
    }
  }
  const avgPct = totalIn > 0 ? (totalDead / totalIn) * 100 : 0;
  const dailyRate = totalRem > 0 ? (totalDeadToday / totalRem) * 100 : 0;

  let html = `
    <h1 style="font-size:22pt; color:#16284a; margin-bottom:2pt;">รายงานวิเคราะห์ฟาร์มไก่ · FarmSense</h1>
    <p style="font-size:11pt; color:#666; margin-top:0;">วันที่รายงาน: ${_esc(dateThai)}</p>
    <hr style="border:none; border-top:2px solid #16284a; margin:12pt 0;">

    <h2 style="font-size:16pt; color:#16284a;">§ 1 ภาพรวม</h2>
    <table style="width:100%; border-collapse:collapse; margin-bottom:12pt;">
      <tr>
        <td style="border:1px solid #ccc; padding:8pt; width:25%;">
          <div style="font-size:9pt; color:#888;">ไก่คงเหลือรวม</div>
          <div style="font-size:18pt; font-weight:bold; color:#16284a;">${_num(totalRem)}</div>
          <div style="font-size:9pt; color:#888;">จาก ${_num(totalIn)} ที่ลง</div>
        </td>
        <td style="border:1px solid #ccc; padding:8pt; width:25%;">
          <div style="font-size:9pt; color:#888;">ตายสะสมรวม</div>
          <div style="font-size:18pt; font-weight:bold; color:${avgPct > 2 ? '#c8860b' : '#2e7d4f'};">${_num(totalDead)}</div>
          <div style="font-size:9pt; color:#888;">${_pct(avgPct)} (เกณฑ์ &lt; 3%)</div>
        </td>
        <td style="border:1px solid #ccc; padding:8pt; width:25%;">
          <div style="font-size:9pt; color:#888;">ตายวันนี้</div>
          <div style="font-size:18pt; font-weight:bold;">${_num(totalDeadToday)}</div>
          <div style="font-size:9pt; color:${dailyRate >= 0.1 ? '#d62828' : '#888'};">${dailyRate.toFixed(3)}%/วัน · เกณฑ์ 0.10%</div>
        </td>
        <td style="border:1px solid #ccc; padding:8pt; width:25%;">
          <div style="font-size:9pt; color:#888;">เล้าที่ %ตายสะสม &gt; 4%</div>
          <div style="font-size:18pt; font-weight:bold; color:${criticalHouses > 0 ? '#d62828' : '#2e7d4f'};">${criticalHouses}</div>
          <div style="font-size:9pt; color:#888;">จาก ${totalHouses} เล้า · ${farmKeys.length} ฟาร์ม</div>
        </td>
      </tr>
    </table>`;

  // ---------- Risk Board ----------
  const scored = [];
  for (const fk of farmKeys) {
    const farm = STATE.farms[fk];
    for (const h of farm.houses) {
      scored.push({ h, r: houseRiskScore(h, farm.houses), farmName: farm.name });
    }
  }
  const risky = scored.filter(s => s.r.level !== 'OK').sort((a, b) => b.r.score - a.r.score);
  const LEVEL_LBL = { CRITICAL: 'วิกฤต', HIGH: 'เสี่ยงสูง', WATCH: 'เฝ้าระวัง' };
  const LEVEL_COLOR = { CRITICAL: '#d62828', HIGH: '#c8860b', WATCH: '#2e7d4f' };
  html += `<h2 style="font-size:16pt; color:#16284a; page-break-before:auto;">§ 2 เล้าที่ต้องดูวันนี้</h2>`;
  if (risky.length === 0) {
    html += `<p style="color:#2e7d4f;">✓ ทุกเล้าอยู่ในเกณฑ์ปกติ</p>`;
  } else {
    html += `
      <table style="width:100%; border-collapse:collapse; margin-bottom:12pt; font-size:10pt;">
        <thead>
          <tr style="background:#16284a; color:#fff;">
            <th style="border:1px solid #ccc; padding:6pt;">อันดับ</th>
            <th style="border:1px solid #ccc; padding:6pt;">ฟาร์ม/เล้า</th>
            <th style="border:1px solid #ccc; padding:6pt;">อายุ</th>
            <th style="border:1px solid #ccc; padding:6pt;">ระดับ</th>
            <th style="border:1px solid #ccc; padding:6pt;">เหตุผล &amp; สิ่งที่ต้องเช็ค</th>
          </tr>
        </thead>
        <tbody>`;
    risky.forEach((s, i) => {
      const reasons = s.r.reasons.map(x => '• ' + _esc(x.reason)).join('<br>');
      html += `
        <tr>
          <td style="border:1px solid #ccc; padding:6pt; text-align:center;">${i+1}</td>
          <td style="border:1px solid #ccc; padding:6pt;">${_esc(s.farmName.replace('ฟาร์ม',''))} · เล้า ${_esc(String(s.h.house))}</td>
          <td style="border:1px solid #ccc; padding:6pt; text-align:center;">${s.h.age != null ? s.h.age : '–'}</td>
          <td style="border:1px solid #ccc; padding:6pt; color:${LEVEL_COLOR[s.r.level]}; font-weight:bold;">${LEVEL_LBL[s.r.level]}</td>
          <td style="border:1px solid #ccc; padding:6pt;">${reasons}</td>
        </tr>`;
    });
    html += `</tbody></table>`;
  }

  // ---------- Per-farm summary ----------
  html += `<h2 style="font-size:16pt; color:#16284a;">§ 3 สรุปต่อเล้า</h2>`;
  for (const fk of farmKeys) {
    const farm = STATE.farms[fk];
    html += `
      <h3 style="font-size:13pt; color:#1f4e79; margin-top:14pt;">${_esc(farm.name)}${farm.round ? ' · รุ่น ' + farm.round : ''}</h3>
      <table style="width:100%; border-collapse:collapse; margin-bottom:10pt; font-size:10pt;">
        <thead>
          <tr style="background:#16284a; color:#fff;">
            <th style="border:1px solid #ccc; padding:5pt;">เล้า</th>
            <th style="border:1px solid #ccc; padding:5pt;">อายุ</th>
            <th style="border:1px solid #ccc; padding:5pt;">ที่มา</th>
            <th style="border:1px solid #ccc; padding:5pt;">ยอดลง</th>
            <th style="border:1px solid #ccc; padding:5pt;">คงเหลือ</th>
            <th style="border:1px solid #ccc; padding:5pt;">ตายวันนี้</th>
            <th style="border:1px solid #ccc; padding:5pt;">ตายสะสม</th>
            <th style="border:1px solid #ccc; padding:5pt;">%ตายสะสม</th>
            <th style="border:1px solid #ccc; padding:5pt;">น.น. (kg)</th>
          </tr>
        </thead>
        <tbody>`;
    for (const h of farm.houses) {
      const pct = h.pct_cum || 0;
      const pctColor = pct >= 3 ? '#d62828' : pct >= 2.5 ? '#c8860b' : '#2e7d4f';
      html += `
        <tr>
          <td style="border:1px solid #ccc; padding:5pt; text-align:center;">${_esc(String(h.house))}</td>
          <td style="border:1px solid #ccc; padding:5pt; text-align:center;">${h.age != null ? h.age : '–'}</td>
          <td style="border:1px solid #ccc; padding:5pt; font-size:9pt;">${_esc(h.source || '–')}</td>
          <td style="border:1px solid #ccc; padding:5pt; text-align:right;">${_num(h.qty_in)}</td>
          <td style="border:1px solid #ccc; padding:5pt; text-align:right;">${_num(h.qty_rem)}</td>
          <td style="border:1px solid #ccc; padding:5pt; text-align:right;">${_num(h.death_day)}</td>
          <td style="border:1px solid #ccc; padding:5pt; text-align:right;">${_num(h.death_cum)}</td>
          <td style="border:1px solid #ccc; padding:5pt; text-align:right; color:${pctColor}; font-weight:bold;">${_pct(pct)}</td>
          <td style="border:1px solid #ccc; padding:5pt; text-align:right;">${h.wt_age != null ? h.wt_age.toFixed(3) : '–'}</td>
        </tr>`;
    }
    html += `</tbody></table>`;
  }

  // ---------- AM/PM cull pattern ----------
  html += `<h2 style="font-size:16pt; color:#16284a; page-break-before:auto;">§ 4 รูปแบบ ตาย/คัด เช้า·เย็น</h2>`;
  html += `
    <table style="width:100%; border-collapse:collapse; margin-bottom:12pt; font-size:10pt;">
      <thead>
        <tr style="background:#16284a; color:#fff;">
          <th style="border:1px solid #ccc; padding:5pt;">ฟาร์ม/เล้า</th>
          <th style="border:1px solid #ccc; padding:5pt;">ตายจริง</th>
          <th style="border:1px solid #ccc; padding:5pt;">คัด</th>
          <th style="border:1px solid #ccc; padding:5pt;">เช้า</th>
          <th style="border:1px solid #ccc; padding:5pt;">เย็น</th>
          <th style="border:1px solid #ccc; padding:5pt;">รูปแบบ</th>
        </tr>
      </thead>
      <tbody>`;
  for (const fk of farmKeys) {
    const farm = STATE.farms[fk];
    for (const h of farm.houses) {
      const b = mortalityBreakdown(h);
      if (!b) continue;
      const patternLbl = b.pattern === 'HEAT' ? 'เย็นหนัก · heat stress'
                       : b.pattern === 'NIGHT' ? 'เช้าหนัก · หนาว/กลางคืน' : 'สม่ำเสมอ';
      const patternColor = b.pattern === 'HEAT' ? '#d62828'
                         : b.pattern === 'NIGHT' ? '#c8860b' : '#2e7d4f';
      html += `
        <tr>
          <td style="border:1px solid #ccc; padding:5pt;">${_esc(farm.name.replace('ฟาร์ม',''))} · เล้า ${_esc(String(h.house))}</td>
          <td style="border:1px solid #ccc; padding:5pt; text-align:right; color:#d62828;">${_num(b.died)}</td>
          <td style="border:1px solid #ccc; padding:5pt; text-align:right; color:#2e7d4f;">${_num(b.culled)}</td>
          <td style="border:1px solid #ccc; padding:5pt; text-align:right;">${_num(b.morning)}</td>
          <td style="border:1px solid #ccc; padding:5pt; text-align:right;">${_num(b.evening)}</td>
          <td style="border:1px solid #ccc; padding:5pt; color:${patternColor}; font-weight:bold;">${patternLbl}</td>
        </tr>`;
    }
  }
  html += `</tbody></table>`;

  // ---------- Weekly weight + ADG + FCR ----------
  html += `<h2 style="font-size:16pt; color:#16284a; page-break-before:auto;">§ 5 น้ำหนัก · ADG · FCR รายสัปดาห์ (เทียบ Ross 308)</h2>`;
  let hasAny = false;
  for (const fk of farmKeys) {
    const farm = STATE.farms[fk];
    for (const h of farm.houses) {
      const w = weeklyWeightAnalysis(h);
      if (!w) continue;
      hasAny = true;
      const overallLbl = w.overall === 'BAD' ? '🚨 ต่ำกว่าเกณฑ์'
                       : w.overall === 'WARN' ? '⚠ ต้องเฝ้าระวัง' : '✓ ตามเกณฑ์';
      const overallColor = w.overall === 'BAD' ? '#d62828'
                         : w.overall === 'WARN' ? '#c8860b' : '#2e7d4f';
      html += `
        <h3 style="font-size:12pt; color:#1f4e79; margin-top:12pt;">
          ${_esc(farm.name.replace('ฟาร์ม',''))} · เล้า ${_esc(String(h.house))}
          <span style="font-size:10pt; font-weight:normal; color:#888;">· อายุ ${h.age != null ? h.age : '–'} วัน · แรกเข้า ${(w.initial*1000).toFixed(0)} ก.
          · <span style="color:${overallColor}; font-weight:bold;">${overallLbl}</span></span>
        </h3>
        <table style="width:100%; border-collapse:collapse; margin-bottom:10pt; font-size:10pt;">
          <thead>
            <tr style="background:#eef2f7; color:#16284a;">
              <th style="border:1px solid #ccc; padding:5pt;">วันที่ชั่ง</th>
              <th style="border:1px solid #ccc; padding:5pt;">น.น. (kg)</th>
              <th style="border:1px solid #ccc; padding:5pt;">× แรกเข้า</th>
              <th style="border:1px solid #ccc; padding:5pt;">ADG จริง (g/วัน)</th>
              <th style="border:1px solid #ccc; padding:5pt;">ADG Ross</th>
              <th style="border:1px solid #ccc; padding:5pt;">Δ ADG</th>
              <th style="border:1px solid #ccc; padding:5pt;">FCR จริง</th>
              <th style="border:1px solid #ccc; padding:5pt;">FCR Ross</th>
              <th style="border:1px solid #ccc; padding:5pt;">Δ FCR</th>
            </tr>
          </thead>
          <tbody>`;
      w.rows.forEach(r => {
        const adgColor = r.adgStatus === 'SLOW' ? '#d62828' : r.adgStatus === 'FAST' ? '#2e7d4f' : '#16284a';
        const fcrColor = r.fcrStatus === 'POOR' ? '#d62828' : r.fcrStatus === 'GREAT' ? '#2e7d4f' : '#16284a';
        const ratioColor = r.ratioVsInitial < 4.5 ? '#d62828' : '#2e7d4f';
        html += `
          <tr>
            <td style="border:1px solid #ccc; padding:5pt; font-weight:bold;">Day ${r.day}</td>
            <td style="border:1px solid #ccc; padding:5pt; text-align:right;">${r.weight.toFixed(3)}</td>
            <td style="border:1px solid #ccc; padding:5pt; text-align:right; color:${ratioColor};">${r.ratioVsInitial.toFixed(1)}×</td>
            <td style="border:1px solid #ccc; padding:5pt; text-align:right; color:${adgColor}; font-weight:bold;">${r.adgActual.toFixed(0)}</td>
            <td style="border:1px solid #ccc; padding:5pt; text-align:right;">${r.adgRoss != null ? r.adgRoss.toFixed(0) : '–'}</td>
            <td style="border:1px solid #ccc; padding:5pt; text-align:right;">${r.adgDiffPct != null ? (r.adgDiffPct >= 0 ? '+' : '') + r.adgDiffPct.toFixed(0) + '%' : '–'}</td>
            <td style="border:1px solid #ccc; padding:5pt; text-align:right; color:${fcrColor}; font-weight:bold;">${r.fcrActual != null ? r.fcrActual.toFixed(2) : '–'}</td>
            <td style="border:1px solid #ccc; padding:5pt; text-align:right;">${r.fcrRoss != null ? r.fcrRoss.toFixed(2) : '–'}</td>
            <td style="border:1px solid #ccc; padding:5pt; text-align:right;">${r.fcrDiffPct != null ? (r.fcrDiffPct >= 0 ? '+' : '') + r.fcrDiffPct.toFixed(0) + '%' : '–'}</td>
          </tr>`;
      });
      html += `</tbody></table>`;
    }
  }
  if (!hasAny) {
    html += `<p style="color:#888;">ไม่มีข้อมูลการชั่งน้ำหนักรายสัปดาห์ในไฟล์</p>`;
  }

  html += `
    <hr style="margin-top:20pt; border:none; border-top:1px solid #ccc;">
    <p style="font-size:9pt; color:#888; text-align:center;">
      FarmSense · ระบบวิเคราะห์ฟาร์มไก่ · รายงานสร้างเมื่อ ${_esc(new Date().toLocaleString('th-TH'))}
    </p>`;

  return html;
}

// Export as Word — uses Microsoft's "HTML in .doc" trick. Word reads
// it as a native document; the document.xml + style.css ride along
// inside the file. Page size A4, Sarabun-friendly font stack.
function exportWordReport() {
  const body = buildReportBody();
  const doc = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:w="urn:schemas-microsoft-com:office:word"
xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>FarmSense Report</title>
<!--[if gte mso 9]>
<xml>
  <w:WordDocument>
    <w:View>Print</w:View>
    <w:Zoom>100</w:Zoom>
    <w:DoNotOptimizeForBrowser/>
  </w:WordDocument>
</xml>
<![endif]-->
<style>
@page Section1 { size: 21.0cm 29.7cm; margin: 2.0cm 1.5cm 2.0cm 1.5cm; mso-page-orientation: portrait; }
div.Section1 { page: Section1; }
body { font-family: "TH Sarabun New", "Sarabun", "Tahoma", sans-serif; font-size: 12pt; color: #1a2233; }
h1, h2, h3 { font-family: "TH Sarabun New", "Sarabun", "Tahoma", sans-serif; }
table { border-collapse: collapse; }
</style>
</head>
<body>
<div class="Section1">
${body}
</div>
</body>
</html>`;
  downloadFile('farmsense-report-' + _dateStr() + '.doc', doc, 'application/msword');
}

// PDF export — opens the report in a fresh popup window styled for
// print, then triggers the browser's print dialog. The user picks
// "Save as PDF" as the destination. We use a separate window so the
// main app keeps its loaded state and doesn't need a reload.
function exportPdfReport() {
  if (Object.keys(STATE.farms).length === 0) {
    alert('ยังไม่มีข้อมูล — อัปโหลดใบหน้าเล้าก่อน');
    return;
  }
  const win = window.open('', '_blank', 'width=900,height=1200');
  if (!win) {
    alert('เปิด print preview ไม่ได้ — โปรดอนุญาต pop-up สำหรับเว็บนี้');
    return;
  }
  const body = buildReportBody();
  // The popup gets its own minimal stylesheet so it prints cleanly
  // regardless of how the main app is loaded (file:// or hosted).
  const printDoc = `<!DOCTYPE html>
<html lang="th"><head>
<meta charset="utf-8">
<title>FarmSense Report</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4 portrait; margin: 18mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Sarabun', 'TH Sarabun New', 'Tahoma', sans-serif;
         font-size: 11pt; color: #1a2233; margin: 0; padding: 0; line-height: 1.5; }
  h1 { font-size: 22pt; color: #16284a; margin: 0 0 4pt; }
  h2 { font-size: 15pt; color: #16284a; margin: 16pt 0 6pt; page-break-after: avoid; }
  h3 { font-size: 12pt; color: #1f4e79; margin: 10pt 0 4pt; page-break-after: avoid; }
  table { width: 100%; border-collapse: collapse; page-break-inside: avoid; }
  th, td { border: 1px solid #ccc; padding: 4pt 6pt; text-align: left; vertical-align: top; }
  th { background: #16284a; color: #fff; font-weight: 600; }
  tr { page-break-inside: avoid; }
  hr { border: none; border-top: 1px solid #ccc; margin: 10pt 0; }
  @media print {
    .no-print { display: none !important; }
  }
  .no-print {
    position: fixed; top: 12px; right: 12px;
    background: #16284a; color: #fff; padding: 8px 14px;
    border-radius: 999px; font-size: 12pt; cursor: pointer;
    border: 0; box-shadow: 0 4px 12px rgba(0,0,0,.25);
  }
</style>
</head><body>
<button class="no-print" onclick="window.print()">🖨 พิมพ์ / Save as PDF</button>
${body}
<script>
  // Wait for fonts to load so PDF picks up Sarabun rather than fallback.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => setTimeout(() => window.print(), 400));
  } else {
    setTimeout(() => window.print(), 800);
  }
</script>
</body></html>`;
  win.document.open();
  win.document.write(printDoc);
  win.document.close();
}
