// ====================================================================
// FARMSENSE · Exports (JSON, CSV download)
// ====================================================================

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

function exportJSON() {
  // Strip the internal parsing artifacts (raw rows / header index / labels)
  // so the export stays a clean analysis snapshot.
  const farms = {};
  for (const [k, f] of Object.entries(STATE.farms)) {
    const { rows, headerIdx, headerLabels, ...clean } = f;
    farms[k] = clean;
  }
  const out = {
    generated: new Date().toISOString(),
    prices: STATE.prices,
    farms,
  };
  downloadFile('farmsense-' + new Date().toISOString().split('T')[0] + '.json',
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
  downloadFile('mortality-' + new Date().toISOString().split('T')[0] + '.csv', '﻿' + csv, 'text/csv;charset=utf-8');
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
  downloadFile('feed-' + new Date().toISOString().split('T')[0] + '.csv', '﻿' + csv, 'text/csv;charset=utf-8');
}
