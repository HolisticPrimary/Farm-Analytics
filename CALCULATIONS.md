# คู่มือการคำนวณ — FarmSense

เอกสารนี้สรุปทุกการคำนวณในแต่ละแท็บของ FarmSense — สูตร, ที่มาของข้อมูล, เกณฑ์ตัดสิน,
และไฟล์โค้ดที่เกี่ยวข้อง สำหรับใช้รีวิวความถูกต้อง / เป็น reference ของสัตวบาล

> ทุกสูตรในเอกสารนี้ผ่าน cross-check อิสระ 772 จุดใน [`farmsense/verify.js`](farmsense/verify.js)
> (รันด้วย `npm run verify`) — เลขคำนวณตรง ทั้งหมด

---

## หลักการทั่วไป

### อ่านตรงจากไฟล์ vs คำนวณเอง

ระบบ **อ่านค่าจาก Excel ตรงๆ** ในกรณีต่อไปนี้ (ไม่คำนวณซ้ำ):

| ฟิลด์ในระบบ | คอลัมน์ในไฟล์ Excel |
|---|---|
| `qty_in` | ยอดไก่ลง |
| `qty_rem` | ยอดไก่คงเหลือ |
| `death_day` | ตายต่อวัน |
| `death_cum` | ตายสะสม |
| `pct_cum` | %ตายสะสม |
| `density` | ตัว/ตร.ม. |
| `feed_day` | อาหาร (kg) |
| `feed_loaded_pct` | % อาหารลงสะสม |
| `feed_pct` | % อาหารที่กินสะสม |
| `water` | น้ำ (ลิตร) |
| `wt_age` | น.น. ตามอายุ |
| `m_died`, `m_culled` | ไก่ตายเช้า / ไก่คัดเช้า |
| `e_died`, `e_culled` | ไก่ตายเย็น / ไก่คัดเย็น |
| `source` | ที่มา |
| `age` | อายุ |

ค่าที่ระบบ **คำนวณเอง** (จากค่าดิบข้างบน) — รายละเอียดในแต่ละแท็บด้านล่าง

> `verify.js` ตรวจสอบความสอดคล้องว่า `death_cum ÷ qty_in × 100` = `pct_cum` ที่ฟาร์มกรอกในไฟล์
> (ทุกเล้าผ่าน — ข้อมูลต้นทางสอดคล้องกัน)

### หน่วย

| ตัวแปร | หน่วย |
|---|---|
| น้ำหนักไก่ (`wt_age`, `wt_actual`, BW) | กิโลกรัม (kg) |
| อาหารต่อวัน (`feed_day`) | กิโลกรัม/วัน (รวมทั้งเล้า) |
| อาหารต่อตัว (`feedPerBird`) | กรัม/ตัว/วัน |
| น้ำ (`water`) | ลิตร/วัน |
| อุณหภูมิ | องศาเซลเซียส (°C) |
| ความเร็วลม | FPM (ฟุต/นาที) หรือ m/s — `1 m/s ≈ 196.85 FPM` |
| ราคา | บาท |

---

## §01 แท็บ "ภาพรวม"

### KPI รวม (4 การ์ดด้านบน)

```
ไก่คงเหลือรวม   = Σ qty_rem            (ทุกเล้าทุกฟาร์ม)
ตายสะสมรวม      = Σ death_cum
ยอดลงรวม        = Σ qty_in
%ตายเฉลี่ย      = ตายสะสมรวม ÷ ยอดลงรวม × 100
ตายวันนี้รวม    = Σ death_day
อัตราตายวันนี้  = ตายวันนี้รวม ÷ ยอดลงรวม × 100
เล้าวิกฤต        = นับเล้าที่ pct_cum ≥ 4%
```

เกณฑ์เปลี่ยนสีตัวเลข delta:
- %ตายเฉลี่ย > 2% = แดง (มาตรฐานไก่เนื้อ < 2%)
- อัตราตายวันนี้ > 0.06% = แดง
- เล้าวิกฤต > 0 = แดง

> 📁 [`renderOverview` ใน `js/render.js`](farmsense/js/render.js)

### §01·a "เล้าที่ต้องดูวันนี้" (Risk Board)

**คะแนนความเสี่ยงรวม** ของแต่ละเล้า สังเคราะห์จากทุกสัญญาณ:

| เงื่อนไข | คะแนน |
|---|---|
| `pct_cum ≥ 4%` | **+40** |
| `pct_cum ≥ 3.3%` | +25 |
| `pct_cum ≥ 2.5%` | +12 |
| `death_day > 150` | +25 |
| `death_day > 100` | +12 |
| feed status = CRITICAL | **+30** |
| feed status = LOW | +15 |
| feed status = OVERFEED | +5 |
| น้ำ:อาหาร LOW (<1.5) | +20 |
| น้ำ:อาหาร HIGH (>2.4) | +15 |
| รูปแบบตาย HEAT (เย็นหนัก) | +12 |
| รูปแบบตาย NIGHT (เช้าหนัก) | +8 |
| น้ำหนัก < Ross −10% | +15 |
| น้ำหนัก < Ross −5% | +8 |
| density > 11.7 | +8 |
| **peer outlier** (ตายสูงกว่าเล้าพี่น้อง ≥1.4 เท่า AND เกิน +1%) | +15 |
| **ปรับลด:** เพิ่งทำวัคซีน + mortality bump (death_day > 50 หรือ pct ≥ 2.5) | **−8** |

ระดับความเสี่ยง:

| คะแนน | ระดับ |
|---|---|
| ≥ 50 | **วิกฤต** (CRITICAL) |
| 25–49 | **เสี่ยงสูง** (HIGH) |
| 10–24 | **เฝ้าระวัง** (WATCH) |
| < 10 | ปกติ (OK) — ไม่แสดงในตาราง |

> น้ำหนักของแต่ละกฎเป็น "ดุลพินิจ" — ควรให้สัตวบาลปรับ
> 📁 [`houseRiskScore` ใน `js/analyzers.js`](farmsense/js/analyzers.js)

### §01·b เปรียบเทียบฟาร์ม

```
%ตายเฉลี่ยฟาร์ม  = Σ death_cum (ในฟาร์ม) ÷ Σ qty_in (ในฟาร์ม) × 100
อายุเฉลี่ย       = mean(house.age)
```

สีแถบ: < 2% เขียว · < 3% เหลือง · ≥ 3% แดง  
ความยาวแถบ: `min(100, pct × 20)` %

### §01·c Heatmap ทุกเล้า

แต่ละช่อง = หนึ่งเล้า แสดง `pct_cum` (อ่านจาก Excel)  
จัดกลุ่มสี (`classifyMortality`):

| %ตายสะสม | กลุ่ม | สี |
|---|---|---|
| < 1.5% | l1 | เขียว — ดี |
| 1.5–2.5% | l2 | เหลือง-เขียวอ่อน — เริ่มสูงเล็กน้อย |
| 2.5–3.3% | l3 | เหลือง — เฝ้าระวัง |
| 3.3–4% | l4 | ส้ม |
| ≥ 4% | l5 | แดง — วิกฤต |

---

## §02 แท็บ "ตาย & วิธีแก้"

### diagnoseHouse(house) — วินิจฉัยรายเล้า

**Priority** ตาม `pct_cum`:
- ≥ 4% → CRITICAL
- ≥ 3.3% → HIGH
- อื่นๆ → WATCH

**Causes** (สาเหตุที่ระบบเดา):
- มีคำว่า "ซันฟู้ด" ใน `source` → "ลูกไก่ซันฟู้ด — ตรวจสอบ supplier"
- จำนวนแหล่ง (นับ `source.split(',')`) ≥ 4 → "multi-source N แหล่ง"
- `density > 11.7` → "density สูง"
- `death_day > 100` → "ตายวันนี้สูงผิดปกติ"
- `death_day > 150` → "สงสัย incident (ไฟตก/heat shock)"
- ถ้าไม่มี cause และ `pct_cum > 2.5` → "ใกล้วันจับ — metabolic stress"

**Solutions** ผูกกับ causes — เช่น ถ้ามี "ซันฟู้ด" → "necropsy 5 ตัว + ส่งแลป"

### Pattern Analysis

**จำนวนแหล่งลูกไก่ → %ตาย**: กลุ่มเล้าตาม `source` (1 = แหล่งเดียว, ≥2 = ผสม)
```
%ตายของกลุ่ม = Σ death_cum (ในกลุ่ม) ÷ Σ qty_in (ในกลุ่ม) × 100
```

**ความหนาแน่น → %ตาย**: 3 ช่วง — ≤11.0 / 11.0–11.5 / >11.5 ตัว/ตร.ม.
```
%ตายของช่วง = Σ death_cum ÷ Σ qty_in × 100
```

> 📁 [`diagnoseHouse` ใน `js/analyzers.js`](farmsense/js/analyzers.js) · [`renderMortality` ใน `js/render.js`](farmsense/js/render.js)

---

## §03 แท็บ "อาหาร vs เกณฑ์ฟาร์ม"

### analyzeFeed(house)

**ขั้น 1 — กินจริงต่อตัว:**
```
feedPerBird (g/ตัว/วัน) = feed_day (kg) × 1000 ÷ qty_rem
```

**ขั้น 2 — เทียบกับเกณฑ์ฟาร์ม** (PRIMARY):
```
stdFeed = FARM_FEED[age]                ← ตารางเกณฑ์ของฟาร์มเอง
dev (%) = (feedPerBird − stdFeed) ÷ stdFeed × 100
```

**สถานะ** จาก `dev`:

| dev | สถานะ | ความหมาย |
|---|---|---|
| > +5% | **OVERFEED** | กินเกินเกณฑ์ — เช็คการสิ้นเปลือง |
| −5% ถึง +5% | **OK** | ปกติ กินตามเกณฑ์ฟาร์ม |
| −10% ถึง −5% | LIGHT | กินน้อยเล็กน้อย — ตรวจน.น. รายสัปดาห์ |
| −20% ถึง −10% | LOW | กินน้อย — พิจารณาเพิ่ม 10–15% |
| < −20% | **CRITICAL** | กินน้อยมาก — ไก่อาจป่วย เช็คน้ำ/แสง/อุณหภูมิ |

> 📁 [`analyzeFeed`, `feedStatus`, `farmFeedLookup` ใน `js/analyzers.js`](farmsense/js/analyzers.js)

---

## §04 แท็บ "FCR & กำไร"

### กำไรต่อตัว (profitCalc)

```
profit = wt × pSale − pChick − (wt × FCR × pFeed) − pOpex
```

| ตัวแปร | ความหมาย | ค่า default |
|---|---|---|
| `wt` | น้ำหนักจับ (kg/ตัว) | — |
| `FCR` | อัตราแลกเนื้อ | — |
| `pSale` | ราคาขาย Live (บาท/kg) | 42 |
| `pChick` | ราคาลูกไก่ (บาท/ตัว) | 18 |
| `pFeed` | ราคาอาหาร PPF (บาท/kg) | 19 |
| `pOpex` | ค่าจัดการ (บาท/ตัว/รุ่น) | 4 |

### Break-even FCR

FCR ที่ทำให้กำไร = 0:
```
breakevenFCR = (wt × pSale − pChick − pOpex) ÷ (wt × pFeed)
```
ถ้า FCR จริง > breakeven → ขาดทุน

### 4A · Sensitivity Matrix

ตาราง 9×7 = `profitCalc(wt, fcr, prices)` สำหรับ
- FCR ∈ {1.40, 1.50, 1.55, 1.60, 1.65, 1.70, 1.75, 1.80, 1.85}
- wt ∈ {2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 3.0} kg

สีตามกำไร:

| กำไร/ตัว | สี |
|---|---|
| ≥ 15 บาท | เขียวเข้ม (กำไรดี) |
| 5–15 | เหลือง (พอใช้) |
| 0–5 | แดงอ่อน (ใกล้ break-even) |
| < 0 | แดงทึบ (ขาดทุน) |

### 4C · กำไรประมาณการรายฟาร์ม

```
avgAge       = mean(house.age)
std          = ROSS308 row ใกล้สุดของ avgAge
stdWt        = std.bw              ← น้ำหนัก standard ตามอายุ
stdFCR       = std.fcr             ← FCR standard
wts          = [wt_actual ของทุกเล้าที่ไม่ null]
avgWt        = mean(wts)  ถ้ามีข้อมูล / stdWt ถ้าไม่มี
estFCR       = stdFCR + 0.10      ← ปรับให้สมจริงตามสภาพไทย
profitPerBird = profitCalc(avgWt, estFCR, prices)
totalProfit   = profitPerBird × Σ qty_rem ของฟาร์ม
```

> เป็น **estimate** เท่านั้น — ของจริงต้องวัดหลังจับ
> 📁 [`profitCalc`, `breakevenFCR` ใน `js/analyzers.js`](farmsense/js/analyzers.js) · [`renderFCR` ใน `js/render.js`](farmsense/js/render.js)

---

## §05 แท็บ "อุณหภูมิ & ลม"

### 5A · เกณฑ์อุณหภูมิ + ความเร็วลม รายวัน

ตาราง 42 บรรทัด (วัน 1–42) แสดง:
- **อุณหภูมิเป้า** = `FARM_TEMP[day]` (ลด ~0.3°C/วัน จาก 33° → 19.7°)
- **ความเร็วลม FPM** = `FARM_FPM[day]` (เป็นช่วง [lo, hi])
- **m/s** = FPM ÷ 196.85
- **ปั๊มแพดเปิดที่** = `FARM_PUMP[day]`

ค่าทั้งหมดดึงตรงจาก `เกณฑ์.xlsx` sheet "การระบายอากาศ+แพด" — **เกณฑ์ของฟาร์มเอง**

### 5C · Wind Chill Calculator

ผู้ใช้ใส่: `age` (วัน) + `ambient` (อุณหภูมิห้องปัจจุบัน °C)

ระบบคำนวณ:
```
target = FARM_TEMP[age]            ← อุณหภูมิที่ไก่ควรรู้สึก

สำหรับ wind ∈ {0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5} m/s:
    effectiveTemp(wind) = ambient − (wind × 3.4)
    (ค่าคงที่ 3.4 = สูตร wind-chill อย่างง่ายในเล้าไก่ จากงานวิจัย broiler)

optimalWind = wind ตัวแรกที่ effectiveTemp ≤ target + 1
              (ถ้าทุก wind ยังเกิน → ใช้ 3.5 m/s)
```

แสดงตารางเทียบ effectiveTemp ของแต่ละ wind พร้อมสี (เขียว = ถึงเป้า)

### 5D · คำแนะนำรายฟาร์ม

ตามอายุเฉลี่ยของฟาร์ม:
```
ageInt        = round(mean(house.age))
อุณหภูมิเป้า = FARM_TEMP[ageInt]
ความเร็วลม   = FARM_FPM[ageInt]
ปั๊มแพดเปิด  = FARM_PUMP[ageInt]
ความชื้นเป้า = 50–70%             ← ค่าคงที่จากเกณฑ์
```

> 📁 [`windChill` ใน `js/analyzers.js`](farmsense/js/analyzers.js) · [`renderEnv`, `updateWindCalc` ใน `js/render.js`](farmsense/js/render.js)

---

## §07 แท็บ "สุขภาพ & เติบโต"

### 7A · น้ำ:อาหาร (waterFeedRatio)

```
ratio = water (ลิตร/วัน) ÷ feed_day (kg/วัน)
```

| ratio | สถานะ | ความหมาย |
|---|---|---|
| < 0.5 หรือ > 6 | **BADDATA** | ค่าผิดปกติมาก — ตรวจสอบหน่วยข้อมูล |
| 0.5–1.5 | LOW | ไก่ดื่มน้ำน้อย — เช็คหัวน้ำ/แรงดัน/อุณหภูมิ ไก่อาจป่วย |
| **1.5–2.4** | **OK** | ปกติ (มาตรฐาน broiler) |
| 2.4–6 | HIGH | น้ำสูงผิดปกติ — heat stress / ท้องเสีย / น้ำรั่ว |

### 7B · ตาย vs คัด + เช้า/เย็น (mortalityBreakdown)

```
ตายจริง (died)    = m_died + e_died        ← ความสูญเสียคุมไม่ได้
คัด (culled)      = m_culled + e_culled    ← การจัดการเชิงรุก (ดี)
total             = died + culled
cullRate (%)      = culled ÷ total × 100

เช้า (morning)    = m_died + m_culled
เย็น (evening)    = e_died + e_culled
```

**รูปแบบ (pattern):**

| เงื่อนไข | pattern | ความหมาย |
|---|---|---|
| evening > morning × 1.5 | **HEAT** | ตายเย็นหนัก → heat stress |
| morning > evening × 1.5 | **NIGHT** | ตายเช้าหนัก → หนาว/ปัญหากลางคืน |
| อื่นๆ | EVEN | สม่ำเสมอ |

**Reconciliation** (verify.js ตรวจทุกเล้า):
```
died + culled ≈ death_day              ← ต้องเท่ากับ "ตายต่อวัน" ในไฟล์
```
ที่ผ่านมาตรงทุกเล้าทุกไฟล์

### 7C · น้ำหนัก vs เกณฑ์คละเพศ (weightVsStandard)

```
stdBw  = MIXED_BW[age]               ← น้ำหนักมาตรฐาน "คละเพศ" รายวัน
                                       (จากชีท "คละเพศ" ของฟาร์ม · อายุ 1–50 วัน)
devPct = (wt_age − stdBw) ÷ stdBw × 100
```

| devPct | สถานะ |
|---|---|
| < −5% | **BEHIND** (โตช้า) |
| −5% ถึง +5% | **ON** (ตามเกณฑ์) |
| > +5% | **AHEAD** (โตเร็ว) |

### 7D · อาหารหก/สูญเปล่า (feedWaste)

```
gapPct = feed_loaded_pct − feed_pct        ← %อาหารที่ลงเล้า − %อาหารที่กิน
```

| gapPct | สถานะ |
|---|---|
| ≤ 0.5% | **OK** |
| 0.5–1.0% | WATCH (เฝ้าระวัง) |
| > 1.0% | **HIGH** (หกเยอะ — เช็คราง/การจัดการอาหาร) |

> 📁 [`waterFeedRatio`, `mortalityBreakdown`, `weightVsStandard`, `feedWaste` ใน `js/analyzers.js`](farmsense/js/analyzers.js)

---

## §08 แท็บ "ประวัติ & แนวโน้ม"

### snapshotMetrics(snapshot)

ทุกครั้งที่อัปโหลด → save snapshot ใน localStorage (key = `ชื่อไฟล์|วันที่`)  
แต่ละ snapshot คำนวณ:
```
avgMort = farmAvgMortality                     (Σ death_cum ÷ Σ qty_in × 100)
avgAge  = mean(house.age)
risk    = นับเล้าที่ houseRiskScore.level ∈ {CRITICAL, HIGH}
houseCount = จำนวนเล้าใน snapshot
```

### ความเร็วการตาย (mortality velocity)

ระหว่าง 2 snapshot ที่ติดกัน **ของฟาร์ม + รุ่นเดียวกัน**:
```
dAge     = m_current.avgAge − m_previous.avgAge
velocity = (m_current.avgMort − m_previous.avgMort) ÷ dAge      [%/วัน]
```

ถ้า `dAge ≤ 0.3` หรือคนละรุ่น → แสดง "—" (เทียบไม่ได้)

| velocity | สี |
|---|---|
| > 0.25 %/วัน | **แดง** — ตายเร่งขึ้น |
| 0.12–0.25 | เหลือง — เฝ้าระวัง |
| ≤ 0.12 | เขียว — สงบ |

> 📁 [`snapshotMetrics`, `renderHistory` ใน `js/render-history.js`](farmsense/js/render-history.js)

---

## §08 แท็บ "Export"

| ปุ่ม | ทำอะไร |
|---|---|
| 🖨 พิมพ์ / Save as PDF | `window.print()` + print CSS ที่ซ่อน topbar/tabs/footer |
| ⬇ JSON ทั้งหมด | dump `STATE.farms` (ลบ `rows`/`headerIdx`/`headerLabels` ออก) + `STATE.prices` |
| ⬇ Mortality CSV | หนึ่งบรรทัด/เล้า: Farm, House, Age, Source, Density, QtyIn, QtyRem, DeathDay, DeathCum, PctDeathCum, Priority |
| ⬇ Feed CSV | หนึ่งบรรทัด/เล้า (เฉพาะที่ analyzeFeed ทำงานได้): Farm, House, Age, QtyRem, FeedKgDay, GBirdDay, StdGBirdDay, DeviationPct, Status |

---

## peerComparison — เทียบเล้าพี่น้อง

ใช้ในการให้คะแนน Risk Board (§01·a):
```
peers = เล้าในฟาร์มเดียวกัน, อายุห่างไม่เกิน 2 วัน, มี pct_cum, ไม่นับตัวเอง
ต้องมี peers ≥ 2 เล้า มิฉะนั้นข้าม

peerMedian = ค่ากลาง(peers.pct_cum)
ratio      = my.pct_cum ÷ peerMedian
isOutlier  = (my.pct_cum > peerMedian + 1.0) AND (ratio ≥ 1.4)
```
ถ้าเป็น outlier → คะแนนเสี่ยง +15 พร้อมเหตุผล "ตายสูงกว่าเล้าพี่น้อง N เท่า"

---

## vaccineStatus — หน้าต่างวัคซีน

อายุวัคซีน = `[10, 14, 18]` วัน (จากไฟล์เกณฑ์)

| `age` เทียบกับวัคซีน | phase | การใช้ |
|---|---|---|
| `age == v` | **today** | แสดง callout "วันนี้ทำวัคซีน" |
| `age == v − 1` | **tomorrow** | แสดง callout "พรุ่งนี้ทำวัคซีน" |
| `v < age ≤ v + 2` | **recent** | ปรับลดคะแนนเสี่ยง −8 ถ้ามี mortality bump |

---

## ภาคผนวก — เกณฑ์มาตรฐาน

### FARM_TEMP — อุณหภูมิเป้ารายวัน (°C)
```
วัน  1: 33.0      วัน 22: 26.7
วัน  7: 31.2      วัน 28: 24.9
วัน 14: 29.1      วัน 35: 22.8
วัน 21: 27.0      วัน 42: 19.7
(ลด ~0.3°C/วัน — ค่าครบทุกวันใน constants.js)
```

### FARM_FEED — เกณฑ์อาหาร (g/ตัว/วัน)
```
วัน  0:   0       วัน 28: 140
วัน  7:  34       วัน 35: 171
วัน 14:  66       วัน 42: 194
วัน 21: 104       วัน 45: 202
```
> เกณฑ์ controlled-feed ของฟาร์มเอง — ต่ำกว่า Ross 308 ในช่วงกลาง  
> นี่คือเหตุผลที่ก่อนหน้าระบบขึ้น LIGHT/LOW เยอะตอนเทียบกับ Ross — ตอนนี้เทียบกับเกณฑ์ฟาร์มเป็นหลักแล้ว

### MIXED_BW — น้ำหนัก standard "คละเพศ" รายวัน (kg) — PRIMARY
```
วัน  1: 0.062     วัน 14: 0.533     วัน 28: 1.616     วัน 42: 2.998
วัน  7: 0.213     วัน 21: 1.012     วัน 35: 2.296     วัน 50: 3.776
```
(จากชีท "คละเพศ" ของฟาร์มเอง · ครอบคลุมอายุ 1–50 วัน · ใช้เป็นมาตรฐานเทียบน้ำหนัก)

### ROSS308 — มาตรฐานสายพันธุ์ (ตัวเทียบรอง)
```
{age: {bw kg, daily g, cum kg, fcr, adg g/วัน}}
วัน  7: bw 0.192 · daily  35 · FCR 0.80
วัน 21: bw 0.943 · daily 113 · FCR 1.20
วัน 28: bw 1.542 · daily 159 · FCR 1.35
วัน 35: bw 2.270 · daily 187 · FCR 1.46
วัน 42: bw 3.000 · daily 195 · FCR 1.56
```

### WATER_FLOW_STD — อัตราน้ำหัวนิปเปิ้ล (cc/นาที)
```
อายุ  0–6 วัน:  40 cc/min
อายุ  7–13:    50
อายุ 14–20:    60
อายุ 21–27:    80
อายุ 28+:     100
```

### LIGHT_PROGRAM — โปรแกรมแสง + รอบเดินอาหาร
```
อายุ  0–7 วัน:  24 ชม.                · เดินอาหาร 3 รอบ/วัน
อายุ  8–15:    เปิด 18 ชม. / ปิด 6 ชม. · 3 รอบ
อายุ 16–28:    เปิด 18 ชม. / ปิด 6 ชม. · 4 รอบ
อายุ 29–จับ:   เปิด 16 ชม. / ปิด 8 ชม. · 5 รอบ
```

### VACCINE_AGES
```
[10, 14, 18] วัน
```

---

## การตรวจสอบความถูกต้อง

ทุกสูตรในเอกสารนี้มีการ cross-check อิสระใน [`farmsense/verify.js`](farmsense/verify.js):
- เขียนโค้ดคำนวณซ้ำ (separate implementation) แล้วเทียบกับผลของโปรแกรมจริง
- ใช้ตารางอ้างอิงคัดลอกแยก (ROSS308, FARM_FEED) ไม่ยืม import จาก analyzers.js
- 772 จุดตรวจกับไฟล์จริง 4 ไฟล์ — **ตรงกัน 100%**

รันเอง:
```bash
cd farmsense
npm install xlsx@0.18.5 --no-save
node verify.js
```

---

## ข้อจำกัด / สิ่งที่ควรรู้

1. **น้ำหนักของแต่ละกฎใน Risk Score** เป็นค่าที่ผมตั้งตามความเหมาะสมโดยทั่วไป —
   สัตวบาลควรรีวิวและปรับ ถ้าระบบควรเข้มขึ้น/ผ่อนลงกับเล้าจริง
2. **เกณฑ์ FARM_TEMP / FARM_FEED / FARM_PUMP / FARM_FPM** ดึงจากไฟล์เกณฑ์ที่ส่งให้  
   ถ้าฟาร์มอื่นใช้เกณฑ์ต่างกัน ต้องอัปเดตค่าใน `farmsense/js/constants.js`
3. **โปรแกรมไม่คำนวณ `pct_cum` ใหม่** — อ่านจาก Excel โดยตรง  
   ถ้าฟาร์มกรอกผิดในไฟล์ ระบบจะแสดงตามที่กรอก (verify.js จะเตือนถ้า `pct_cum ≠ death_cum/qty_in × 100`)
4. **`feedPerBird`** หารด้วย `qty_rem` ปัจจุบัน — สมมุติว่าไก่ทุกตัวที่เหลือกินอาหารเท่ากัน  
   ในทางทฤษฎีอาจใช้ "ค่าเฉลี่ยไก่มีชีวิตระหว่างวัน" จะแม่นกว่า แต่ไฟล์หน้าเล้าไม่มีข้อมูลนั้น
5. **`vaccine recent` ลดคะแนน −8** เพื่อกัน false alarm — แต่ถ้าเล้าตายผิดปกติจริง การลด 8 คะแนนไม่กลบความรุนแรง (เล้า CRITICAL ยังขึ้น CRITICAL)
