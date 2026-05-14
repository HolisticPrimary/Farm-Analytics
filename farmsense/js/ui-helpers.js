// ====================================================================
// FARMSENSE · UI helpers (formatters, escapers)
// ====================================================================

function fmtNum(n, d=0) {
  if (n == null) return '–';
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
}

function fmtPct(n, d=2) {
  if (n == null) return '–';
  return n.toFixed(d) + '%';
}

function pctClass(p) {
  if (p < 2) return 'pct-o';
  if (p < 3.5) return 'pct-w';
  return 'pct-c';
}

function getFarmClass(farmKey, farmList) {
  const idx = farmList.indexOf(farmKey);
  return FARM_PALETTE[idx % FARM_PALETTE.length];
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
