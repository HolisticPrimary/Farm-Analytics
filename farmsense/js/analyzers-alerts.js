// ====================================================================
// FARMSENSE · Alert analyzers (mortality thresholds, cull AM/PM,
// investigation card lookups, disease watch).
//
// All four modules operate on a parsed house record (h) — the same
// shape produced by parser.js. They never mutate inputs; each returns
// a small result object the renderer can map straight onto the DOM.
// ====================================================================

// ---------- 1. Daily mortality alert ----------
// Compares today's death rate (death_day / qty_rem) to the configured
// red/yellow thresholds. status is one of:
//   'OK'     · below the warn band
//   'WATCH'  · between warn and red
//   'ALERT'  · ≥ red threshold
// `pct` is returned as a fraction (e.g. 0.0012 = 0.12 %).
function mortalityDailyAlert(h, thresholds) {
  const t = thresholds || MORTALITY_THRESHOLDS;
  if (h.death_day == null || h.qty_rem == null || h.qty_rem <= 0) return null;
  const pct = h.death_day / h.qty_rem;
  let status = 'OK';
  if (pct >= t.dailyPct)          status = 'ALERT';
  else if (pct >= t.warnDailyPct) status = 'WATCH';
  return {
    pct,
    deaths: h.death_day,
    base: h.qty_rem,
    threshold: t.dailyPct,
    warnThreshold: t.warnDailyPct,
    status,
  };
}

// ---------- 2. Cumulative mortality alert ----------
// pct_cum is already expressed as a percentage (e.g. 2.59 means 2.59 %),
// so compare against the THRESHOLDS that are also stored as percentages.
function mortalityCumulativeAlert(h, thresholds) {
  const t = thresholds || MORTALITY_THRESHOLDS;
  if (h.pct_cum == null) return null;
  const pct = h.pct_cum;
  let status = 'OK';
  if (pct >= t.cumulativePct)          status = 'ALERT';
  else if (pct >= t.warnCumulativePct) status = 'WATCH';
  // proportion of the red ceiling used (for the progress bar)
  const fillPct = Math.min(100, (pct / t.cumulativePct) * 100);
  return {
    pct,
    threshold: t.cumulativePct,
    warnThreshold: t.warnCumulativePct,
    status,
    fillPct,
  };
}

// ---------- 3. Cull AM/PM breakdown ----------
// Splits today's culls into morning vs evening + cull-of-loss share.
// Returns null when the parser couldn't extract any AM/PM sub-field.
function cullAmPmBreakdown(h) {
  const parts = [h.m_died, h.m_culled, h.e_died, h.e_culled];
  if (parts.every(v => v == null)) return null;
  const md = h.m_died   || 0;
  const mc = h.m_culled || 0;
  const ed = h.e_died   || 0;
  const ec = h.e_culled || 0;
  const cullTotal = mc + ec;
  const lossTotal = md + mc + ed + ec;
  const amCullPct = cullTotal > 0 ? (mc / cullTotal) * 100 : 0;
  const pmCullPct = cullTotal > 0 ? (ec / cullTotal) * 100 : 0;
  const cullOfLossPct = lossTotal > 0 ? (cullTotal / lossTotal) * 100 : 0;
  // Pattern signal — reuse the HEAT/NIGHT/EVEN convention from
  // mortalityBreakdown() so the rest of the dashboard reads the same.
  let pattern = 'EVEN';
  if (ec > mc * 1.5)      pattern = 'HEAT';   // evening cull-heavy
  else if (mc > ec * 1.5) pattern = 'NIGHT';  // morning cull-heavy
  return {
    amCull: mc, pmCull: ec,
    amDied: md, pmDied: ed,
    cullTotal, lossTotal,
    amCullPct, pmCullPct,
    cullOfLossPct,
    pattern,
  };
}

// ---------- 4. Investigation card (env target lookup) ----------
// When a mortality alert fires, the operator needs a quick checklist:
// "what *should* the wind/temperature be for a chicken this age?".
// We don't have actual measured env values in the parsed data model —
// this returns the TARGETS so the operator can read them, walk into
// the house, and compare against what their sensors read.
function investigateEnv(h) {
  if (h.age == null) return null;
  const tempTarget = farmTempLookup(h.age);
  const pumpTrigger = farmPumpLookup(h.age);
  const fpmBand = farmFpmLookup(h.age);
  const envBand = ENV_TABLE.find(e => h.age >= e.ageMin && h.age <= e.ageMax) || null;
  return {
    age: h.age,
    tempTarget,
    pumpTrigger,
    fpmBand,                          // [lo, hi] feet/min
    fpmMs: fpmBand ? [(fpmBand[0]/197).toFixed(2), (fpmBand[1]/197).toFixed(2)] : null,
    rhTarget: envBand ? envBand.rh : null,
    warn: envBand ? envBand.warn : null,
  };
}

// ---------- 5. Convenience: count alerts farm-wide ----------
// Used by the Overview alert card, the tab badge, and the daily KPIs.
//
// `dailyAlert` / `cumAlert` are kind-specific counts — a house can be
// counted in BOTH if it trips both thresholds. `alertHouses` /
// `watchHouses` are UNIQUE-house counts based on the worst status the
// house holds across daily & cumulative — use these when the KPI is
// "เล้าที่ทะลุเกณฑ์" so the same house isn't double-counted.
function countAlerts(farmKeys, thresholds) {
  const t = thresholds || MORTALITY_THRESHOLDS;
  let dailyAlert = 0, dailyWatch = 0, cumAlert = 0, cumWatch = 0;
  let alertHouses = 0, watchHouses = 0;
  for (const fk of farmKeys) {
    const farm = STATE.farms[fk];
    for (const h of farm.houses) {
      const d = mortalityDailyAlert(h, t);
      const c = mortalityCumulativeAlert(h, t);
      if (d) {
        if (d.status === 'ALERT') dailyAlert++;
        else if (d.status === 'WATCH') dailyWatch++;
      }
      if (c) {
        if (c.status === 'ALERT') cumAlert++;
        else if (c.status === 'WATCH') cumWatch++;
      }
      // Worst-of-both for the unique-house counters.
      const ds = d ? d.status : 'OK';
      const cs = c ? c.status : 'OK';
      const worst = (ds === 'ALERT' || cs === 'ALERT') ? 'ALERT'
                  : (ds === 'WATCH' || cs === 'WATCH') ? 'WATCH' : 'OK';
      if (worst === 'ALERT') alertHouses++;
      else if (worst === 'WATCH') watchHouses++;
    }
  }
  return { dailyAlert, dailyWatch, cumAlert, cumWatch, alertHouses, watchHouses };
}
