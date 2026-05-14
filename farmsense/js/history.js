// ====================================================================
// FARMSENSE · History store
//   Persists uploaded farm snapshots so rounds can be compared over time.
//   100% client-side — nothing leaves the machine.
//
//   Backend: localStorage, with an in-memory fallback. IndexedDB was
//   dropped on purpose — it is blocked when the file is opened via
//   file:// in Chrome or inside sandboxed preview panels, which are the
//   app's normal "double-click to open" use cases. localStorage works in
//   those contexts; when even it is blocked the store degrades to memory
//   (works for the session, just not persistent) instead of erroring.
// ====================================================================

const HISTORY_LS_KEY = 'farmsense.history';

let _historyMode = null;   // 'local' | 'memory'  (detected once)
let _memStore = {};        // in-memory fallback

function _detectMode() {
  if (_historyMode) return _historyMode;
  try {
    const probe = '__fs_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    _historyMode = 'local';
  } catch (e) {
    _historyMode = 'memory';
  }
  return _historyMode;
}

// 'local' = persists in this browser · 'memory' = this session only
function historyMode() { return _detectMode(); }

function _readAll() {
  if (_detectMode() === 'local') {
    try { return JSON.parse(localStorage.getItem(HISTORY_LS_KEY)) || {}; }
    catch (e) { return {}; }
  }
  return _memStore;
}

function _writeAll(obj) {
  if (_detectMode() === 'memory') { _memStore = obj; return true; }
  try {
    localStorage.setItem(HISTORY_LS_KEY, JSON.stringify(obj));
    return true;
  } catch (e) {
    // quota exceeded — drop the oldest snapshots and retry
    let entries = Object.values(obj).sort((a, b) => a.savedAt.localeCompare(b.savedAt));
    while (entries.length > 1) {
      entries = entries.slice(1);
      const pruned = {};
      entries.forEach(s => { pruned[s.key] = s; });
      try { localStorage.setItem(HISTORY_LS_KEY, JSON.stringify(pruned)); return true; }
      catch (e2) { /* keep pruning */ }
    }
    return false;
  }
}

// One snapshot = one uploaded face sheet. Re-uploading the same file on the
// same date overwrites, so the same snapshot is never duplicated.
function snapshotFrom(farmData) {
  const day = farmData.date || new Date().toISOString().slice(0, 10);
  return {
    key: farmData.filename + '|' + day,
    savedAt: new Date().toISOString(),
    farmName: farmData.name,
    round: farmData.round,
    date: farmData.date,
    filename: farmData.filename,
    signature: farmData.signature,
    colMap: farmData.colMap,
    houses: farmData.houses,
  };
}

// Async interface kept so callers don't care about the backend.
async function saveSnapshot(farmData) {
  const snap = snapshotFrom(farmData);
  const all = _readAll();
  all[snap.key] = snap;
  if (!_writeAll(all)) throw new Error('บันทึกประวัติไม่สำเร็จ (พื้นที่เก็บเต็ม)');
  return snap.key;
}

async function listSnapshots() {
  return Object.values(_readAll());
}

async function getSnapshot(key) {
  return _readAll()[key] || null;
}

async function deleteSnapshot(key) {
  const all = _readAll();
  delete all[key];
  _writeAll(all);
}

async function clearAllSnapshots() {
  _writeAll({});
}
