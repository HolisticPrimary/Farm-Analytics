/**
 * FarmSense → Google Sheets sync
 *
 * วิธีใช้:
 * 1. เปิด Google Sheet ใหม่
 * 2. เมนู: Extensions → Apps Script
 * 3. ลบโค้ดเดิม → paste โค้ดทั้งหมดนี้
 * 4. Save (Ctrl+S / Cmd+S)
 * 5. Deploy → New deployment → Type: Web app
 *      - Description: FarmSense Sync
 *      - Execute as: Me
 *      - Who has access: Anyone
 *    → Deploy → Authorize → Copy "Web app URL"
 * 6. นำ URL ไปวางในแท็บ "ตั้งค่า" ของ FarmSense
 *
 * หมายเหตุ: "Anyone" หมายถึง "ใครก็ตามที่มี URL นี้" — URL ยาวและสุ่ม
 * ปลอดภัยพอสำหรับฟาร์มทั่วไป ถ้าต้องการความปลอดภัยเพิ่ม ใส่ SECRET ด้านล่าง
 * แล้วแก้ FarmSense ให้ส่ง header เดียวกัน
 */

// ตั้ง SECRET เพื่อกันคนสุ่ม POST (ถ้าไม่ต้องการให้ปล่อยเป็น '')
const SECRET = '';

const HEADER = [
  'uploadedAt','farm','round','date','house','age',
  'qty_in','qty_rem','death_day','death_cum',
  'pct_cum','pct_daily','feed_day','water','wt_age',
  'water_feed_ratio','cull_morning','cull_evening',
  'died_morning','died_evening'
];

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents || '{}');
    if (SECRET && data.secret !== SECRET) {
      return jsonOut({ ok: false, error: 'invalid secret' });
    }
    const rows = Array.isArray(data.rows) ? data.rows : [];
    const sheet = SpreadsheetApp.getActiveSheet();

    // Add header on first run.
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADER);
      sheet.getRange(1, 1, 1, HEADER.length).setFontWeight('bold').setBackground('#1f4e79').setFontColor('#fff');
      sheet.setFrozenRows(1);
    }

    // Append every row in one batch for speed.
    if (rows.length > 0) {
      const matrix = rows.map(r => HEADER.map(k => r[k] != null ? r[k] : ''));
      sheet.getRange(sheet.getLastRow() + 1, 1, matrix.length, HEADER.length).setValues(matrix);
    }

    return jsonOut({ ok: true, rowsAdded: rows.length, totalRows: sheet.getLastRow() - 1 });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

function doGet() {
  return jsonOut({ ok: true, service: 'FarmSense → Sheets', deployedAt: new Date().toISOString() });
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
