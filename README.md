# FarmSense · ระบบวิเคราะห์ฟาร์มไก่

เครื่องมือวิเคราะห์ฟาร์มไก่เนื้อแบบครบวงจร ทำงาน **100% ในเบราว์เซอร์** —
อัปโหลดไฟล์ "ใบหน้าเล้า" (Excel) แล้ววิเคราะห์ได้ทันที ไม่ส่งข้อมูลออกที่ใด

A fully client-side broiler-farm analytics tool. Upload the daily Excel
"face sheet" and it computes everything in the browser — no server, no upload.

**🌐 ใช้งานจริง / Live:** https://holisticprimary.github.io/Farm-Analytics/

**📖 คู่มือผู้ใช้ (PDF):** [FarmSense-คู่มือผู้ใช้.pdf](FarmSense-คู่มือผู้ใช้.pdf) — สำหรับสัตวบาล/ผู้จัดการฟาร์ม · เข้าใจง่าย พร้อมตัวอย่างจริง

**🔧 คู่มือการคำนวณ (เทคนิค):** [CALCULATIONS.md](CALCULATIONS.md) — สูตรทุกแท็บ + ที่มาข้อมูล + เกณฑ์ตัดสิน (ใช้รีวิวความถูกต้อง)

## คุณสมบัติ

| แท็บ | วิเคราะห์ |
|---|---|
| ภาพรวม | KPI รวม + **คะแนนความเสี่ยงรายเล้า** (สังเคราะห์ทุกสัญญาณ) + เปรียบเทียบฟาร์ม + Heatmap |
| ตาย & วิธีแก้ | วินิจฉัยสาเหตุการตายรายเล้า + Pattern analysis |
| อาหาร vs เกณฑ์ฟาร์ม | เทียบ g/ตัว/วัน กับเกณฑ์อาหารของฟาร์ม (Ross 308 เป็นตัวเทียบรอง) |
| FCR & กำไร | Break-even FCR + sensitivity matrix + กำไรรายฟาร์ม |
| อุณหภูมิ & ลม | เกณฑ์อุณหภูมิ/ความเร็วลมรายวัน + Wind chill calculator |
| สุขภาพ & เติบโต | น้ำ:อาหาร · แยกตาย/คัด · เช้า/เย็น · น้ำหนัก vs Ross · อาหารหก |
| ประวัติ & แนวโน้ม | เก็บ snapshot ในเบราว์เซอร์ · เทียบรอบต่อรอบ · ความเร็วการตาย |
| Export | JSON / CSV / พิมพ์ PDF |

- รองรับ template ใบหน้าเล้าหลายแบบ + UI ปรับการ map คอลัมน์เองได้ (จำต่อ template)
- เกณฑ์มาตรฐานดึงจากไฟล์เกณฑ์ของฟาร์ม (อุณหภูมิ/อาหาร/แสง/น้ำ รายวัน)

## โครงสร้าง

```
farmsense/
├── index.html          โครงหน้าเว็บ (โหลด css/js แยกไฟล์)
├── css/styles.css
├── js/                 constants · parser · analyzers · schema-map ·
│                       history · render* · exports · main
├── assets/logo.png
├── build.sh            รวมทุกไฟล์เป็น farmsense.html (single-file)
├── test-parse.js       ทดสอบ parser + analyzers กับไฟล์จริง
└── verify.js           คำนวณอิสระแล้วเทียบกับโปรแกรม (cross-check)

farmsense.html          ← ไฟล์เดียวพร้อมใช้ (เปิดด้วยเบราว์เซอร์ได้เลย)
```

## ใช้งาน

เปิด `farmsense.html` ด้วยเบราว์เซอร์ — แค่นั้น

## พัฒนา

```bash
cd farmsense
bash build.sh                       # รวมเป็น ../farmsense.html
npm install && npm test             # ทดสอบ parser/analyzers
npm run verify                      # คำนวณอิสระเทียบกับโปรแกรม
```

> หมายเหตุ: ไฟล์ข้อมูลฟาร์มจริง (`.xlsx`) ไม่ได้รวมอยู่ใน repo นี้
