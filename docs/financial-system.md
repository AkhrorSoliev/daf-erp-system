# DaF ERP — Moliyaviy Tizim Texnik Hujjati

**Versiya:** 2.0  
**Sana:** 2026-04-16  
**Tizim:** DaF Sprachzentrum ERP  

> ⚠️ **Bu hujjat 2026-aprel holatini tasvirlaydi va ko'p joyda eskirgan.** Hozirgi qoidalar — [`server/CLAUDE.md`](../server/CLAUDE.md) «Financial System» bo'limi, atamalar — [`CONTEXT.md`](../CONTEXT.md), qarorlar — [`docs/adr/`](adr/README.md). Hujjat bilan kod zid kelsa, **kod haqiqat**.
>
> Kodga moslab tuzatilgan joylar: soliq (hisoblanmaydi), pul qaytarish (bir qadam, 50% qoidasi yo'q), oylik davri (prod'da kalendar oyi), ABSENT (hisoblanadi), Payme'da bajarilgan to'lovni bekor qilish, shartnomalar (CRUD moduli olib tashlangan), enum ro'yxatlari. Qolgan bo'limlar tarixiy rasm sifatida qoldirilgan — ularga tayanishdan oldin kodni tekshiring.

---

## 1. Umumiy ko'rinish

Moliyaviy modul quyidagi jarayonlarni boshqaradi:
- O'quvchi to'lovlari (naqd va online)
- Xodimlar oyliklari (o'qituvchi, administrator, kassir, filial direktori)
- Markaz xarajatlari (ijara, kommunal, ta'minot, marketing, ustozga avans, jihozlar, ta'mirlash, soliqlar)
- O'quvchi shartnomasi (model saqlangan, CRUD moduli olib tashlangan — §4.3)
- Pul qaytarish (refund)
- Moliyaviy hisobotlar va KPI lar
- To'lov bekor qilish (reverse) — append-only ledger

### Asosiy tamoyil: Append-only Ledger

Moliyaviy yozuvlar **hech qachon o'chirilmaydi yoki tahrir qilinmaydi**. Xatolik bo'lsa, teskari (reversal) yozuv qo'shiladi — bu `reversedTransactionId` orqali asl yozuvga bog'lanadi.

---

## 2. Ma'lumotlar bazasi arxitekturasi

### 2.1 Moliyaviy Enumlar

| Enum | Qiymatlari | Ishlatilishi |
|------|-----------|--------------|
| `PaymentMethod` | CASH, PAYME, CLICK, UZUM, TRANSFER | To'lov usuli |
| `PaymentStatus` | PENDING, COMPLETED, FAILED, REFUNDED, CANCELLED, **REVERSED** | To'lov holati |
| `PaymentSource` | ADMIN_MANUAL, STUDENT_PORTAL, GATEWAY_WEBHOOK, MANUAL_ATTACH | To'lov manbai |
| `TransactionType` | PAYMENT, LESSON_DEDUCTION, LESSON_CONSUMPTION, INITIAL_BALANCE, REFUND, SALARY_ACCRUAL, SALARY_PAYMENT, EXPENSE, ADJUSTMENT, TAX, BALANCE_WITHDRAWAL, DISCOUNT_ADJUSTMENT, MOCK_EXAM_FEE, DEBT_WRITE_OFF | Tranzaksiya turi |
| `ContractStatus` | DRAFT, ACTIVE, COMPLETED, CANCELLED, REFUNDED | Shartnoma holati |
| `SalaryType` | PERCENTAGE, FIXED_PER_STUDENT, **FIXED_MONTHLY** | Oylik hisoblash turi |
| `SalaryPaymentStatus` | CALCULATED, APPROVED, PAID, CANCELLED | Oylik to'lov holati |
| `RefundStatus` | REQUESTED, APPROVED, PROCESSING, COMPLETED, REJECTED | Refund holati |
| `ExpenseCategory` | RENT, UTILITIES, SUPPLIES, MARKETING, **TEACHER_ADVANCE**, EQUIPMENT, MAINTENANCE, TAXES, OTHER | Xarajat kategoriyasi |

### 2.2 Moliyaviy Modellar

#### Payment — To'lov yozuvi

| Ustun | Turi | Tavsif |
|-------|------|--------|
| id | UUID | Asosiy kalit |
| studentId | Int | O'quvchi FK |
| contractId | UUID? | Shartnoma FK (ixtiyoriy) |
| amount | Int | Summa (so'mda, minimum 1000) |
| method | PaymentMethod | Naqd/Payme/Click/Uzum/O'tkazma |
| status | PaymentStatus | Holat (default: COMPLETED) |
| source | PaymentSource | Manba (default: ADMIN_MANUAL) |
| externalId | String? | Payme/Click tranzaksiya ID |
| providerFee | Int? | Provider xizmat haqqi |
| providerFeePercent | Float? | Provider komissiya foizi |
| receiptNumber | String? | Kvitansiya raqami |
| note | String? | Izoh |
| receivedById | Int? | Qabul qilgan xodim |
| branchId | Int? | Filial |
| companyId | Int | Kompaniya |

**Unique constraint:** `(method, externalId, companyId)` — dublikat tashqi to'lovlarni oldini oladi.

**Muhim qoidalar:**
- `contractId` berilsa, shartnoma shu `studentId` ga tegishli bo'lishi shart (tekshiriladi)
- `branchId` shartnomadan avtomatik olinadi (agar shartnoma berilsa); agar mos kelmasa — xatolik
- REVERSED statusli to'lovlar ro'yxatda ko'rinmaydi (default filter)
- `source` barcha read endpointlarda qaytariladi

#### Transaction — Universal Ledger (Bosh Kitob)

Tizimdagi **har bir pul harakati** shu jadvalga yoziladi. Moliyaviy nazoratning asosi.

| Ustun | Turi | Tavsif |
|-------|------|--------|
| id | UUID | Asosiy kalit |
| type | TransactionType | Operatsiya turi |
| amount | Int | Summa (+kirim, -chiqim) |
| balanceBefore | Int | Operatsiyadan oldingi balans |
| balanceAfter | Int | Operatsiyadan keyingi balans |
| description | String? | Tavsif |
| studentId | Int? | O'quvchi (agar o'quvchi operatsiyasi) |
| teacherId | Int? | Xodim (agar xodim operatsiyasi) |
| paymentId | UUID? | Qaysi to'lovdan |
| attendanceId | UUID? | Qaysi davomatdan yechildi |
| salaryPaymentId | UUID? | Qaysi oylikdan |
| refundId | UUID? | Qaysi refunddan |
| enrollmentId | UUID? | Qaysi enrollment bilan bog'liq |
| contractId | UUID? | Qaysi shartnomadan |
| expenseId | UUID? | Qaysi xarajatdan |
| reversedTransactionId | UUID? | Bekor qilingan asl tranzaksiya |
| performedById | Int? | Kim amalga oshirdi |
| branchId | Int? | Filial |
| companyId | Int | Kompaniya |

**Muhim:** Barcha balans o'zgarishlari `TransactionsService` orqali o'tadi — `SELECT FOR UPDATE` bilan atomik. `Serializable` isolation level. `maxWait: 10000, timeout: 15000` (Neon serverless cold-start uchun).

#### Contract — Shartnoma

> **Model saqlangan, CRUD olib tashlangan.** `src/contracts/` moduli (`/contracts` endpointlari) va `/payments/contracts` sahifasi yo'q. `Contract` modeli va `contractId` bog'lanishlari (billing, payments, refunds, transactions) qolgan, lekin amalda yangi shartnoma yaratilmaydi. Batafsil: `server/CLAUDE.md` → «Contracts».

| Ustun | Turi | Tavsif |
|-------|------|--------|
| contractNumber | String (unique) | Auto-raqam: `DAF-2026-00001` |
| studentId | Int | O'quvchi FK |
| courseId | UUID | Kurs FK |
| groupId | UUID? | Guruh FK |
| branchId | Int | Filial |
| totalAmount | Int | Jami shartnoma summasi |
| paidAmount | Int | To'langan summa (real-time yangilanadi) |
| status | ContractStatus | DRAFT → ACTIVE → COMPLETED/CANCELLED/REFUNDED |

**Status o'tishlari:** `DRAFT → [ACTIVE, CANCELLED]`, `ACTIVE → [COMPLETED, CANCELLED, REFUNDED]`

#### EmployeeSalaryConfig — Xodim oylik sozlamalari

Barcha xodimlar (o'qituvchi, administrator, kassir, filial direktori) uchun oylik turini belgilaydi.

| Ustun | Turi | Tavsif |
|-------|------|--------|
| userId | Int | Xodim FK (oldin `teacherId` edi) |
| groupId | UUID? | null = barcha guruhlar uchun, set = faqat shu guruh uchun |
| salaryType | SalaryType | PERCENTAGE, FIXED_PER_STUDENT yoki FIXED_MONTHLY |
| value | Int | Foiz (masalan 40) yoki summa (masalan 4000000) |
| isActive | Boolean | Faol yoki o'chirilgan |

**Misol:**
- O'qituvchi: `salaryType=PERCENTAGE, value=40` → har darsda har o'quvchidan dars narxining 40%
- Administrator: `salaryType=FIXED_MONTHLY, value=4000000` → oyiga 4,000,000 so'm
- `FIXED_MONTHLY` guruhga bog'lab bo'lmaydi (faqat global)
- Guruh-specific config global dan ustun turadi

#### SalaryAccrual — Darslik oylik yig'ilishi

Faqat PERCENTAGE va FIXED_PER_STUDENT turidagi o'qituvchilar uchun.

| Ustun | Turi | Tavsif |
|-------|------|--------|
| userId | Int | O'qituvchi (oldin `teacherId`) |
| studentId | Int | O'quvchi |
| groupId | UUID | Guruh |
| attendanceId | UUID | Davomat yozuvi |
| lessonDate | Date | Dars sanasi |
| amount | Int | Yig'ilgan summa |
| salaryPaymentId | UUID? | null = hali to'lanmagan, set = oylikka kiritilgan |
| deductionTransactionId | UUID? | Qaysi LESSON_DEDUCTION tranzaksiya qopladi |

**Unique constraint:** `[userId, studentId, groupId, lessonDate]`

**Muhim qoida (B.1 Coverage):** Accrual faqat `deductionTransactionId` mavjud bo'lganda yaratiladi — o'quvchi to'lov qilmagan dars uchun o'qituvchiga oylik yig'ilmaydi.

#### SalaryPayment — Oylik to'lov

| Ustun | Turi | Tavsif |
|-------|------|--------|
| userId | Int | Xodim (oldin `teacherId`) |
| periodStart | DateTime | Hisoblash davri boshi |
| periodEnd | DateTime | Hisoblash davri oxiri (cutoff) |
| amount | Int | To'lanadigan summa: hisoblangan oylik − ushlab qolingan avanslar. Soliq ushlanmaydi |
| status | SalaryPaymentStatus | CALCULATED → APPROVED → PAID |

#### Refund — Pul qaytarish

| Ustun | Turi | Tavsif |
|-------|------|--------|
| studentId | Int | O'quvchi |
| contractId | UUID? | Shartnoma — faqat eski qatorlarda; yangi refund `enrollmentId` ga bog'lanadi |
| requestedAmount | Int | So'ralgan summa |
| approvedAmount | Int? | Tasdiqlangan summa |
| lessonsCompleted | Int | O'tilgan darslar soni |
| totalLessons | Int | Jami darslar |
| deductions | Json? | Tafsilot: consumedFromLedger, lessonsObserved, perLessonCost, previousRefunds, tax, bankFee |
| status | RefundStatus | `REQUESTED` (so'rov) → `COMPLETED` («Berildi») yoki `REJECTED` (bekor qilindi), ADR-0077; `APPROVED`/`PROCESSING` yozilmaydi |
| refundMethod | PaymentMethod? | Qaytarish usuli |

**Hisoblash qoidalari (`quickRefund`, bir qadam):**
- Pul faqat ikki joydan qaytadi: o'quvchining bo'sh balansi va to'langan, lekin hali o'tilmagan darslar (`Enrollment.prepaidLessonsRemaining`). O'tilgan darsga ketgan pul qaytmaydi; **ABSENT ham o'tilgan dars** hisoblanadi.
- `maxRefundable = max(0, balance + prepaidRefundValue(prepaidLessonsRemaining))`. Avval bo'sh balans olinadi, yetmasa eng kam sonli dars bekor qilinadi (`releasePrepaidLessons`: darslar puli `ADJUSTMENT` bilan balansga qaytadi va hisobchi o'sha qadamda kamayadi).
- **«50%+ dars o'tilgan → qaytarish yo'q» qoidasi yo'q.** U sikl hajmiga (`lessonPaymentCount`) bo'linardi, kursga emas, shuning uchun olib tashlangan. Oylik kursdan ketishdagi 40% qoidasi — alohida qaror (ADR-0044).

**Status (ADR-0077):** `quickRefund` so'rov ochadi (`REQUESTED`): balans darhol kamayadi, kassa harakati yo'q, muddat — 10 bank kuni (`dueDate`). «Berildi» (`POST /refunds/:id/hand-over`) kassadan chiqimni yozadi va `COMPLETED` qiladi; `POST /refunds/:id/cancel` (CEO, filial direktori) pul va darslarni qaytarib `REJECTED` qiladi. `PATCH /refunds/:id/process` o'chirilgan.

#### Expense — Xarajatlar

| Ustun | Turi | Tavsif |
|-------|------|--------|
| category | ExpenseCategory | RENT, UTILITIES, SUPPLIES, MARKETING, TEACHER_ADVANCE, EQUIPMENT, MAINTENANCE, TAXES, OTHER |
| amount | Int | Summa |
| description | String | Tavsif |
| date | Date | Sana |
| branchId | Int? | Filial |
| relatedUserId | Int? | TEACHER_ADVANCE uchun: avans oluvchi xodim |
| settledBySalaryPaymentId | UUID? | Avans oylikdan ushlab qolinganida to'ldiriladi |

**TEACHER_ADVANCE xususiyati:** Bu kategoriya avans sifatida beriladi va keyingi oylik hisoblashda xodimning oylik summasidan avtomatik ushlab qolinadi (`salary.service.ts → applyPendingAdvances()`).

#### Soliq — hisoblanmaydi

`CompanyTaxConfig` modeli, `/salary/tax-config` endpointlari va «Soliq stavkasi» oynasi olib tashlangan. Tizim soliqni hisoblamaydi va hech qaysi to'lovdan ushlamaydi. Ehtimoliy ushlanmalar (ustoz oyligidan 12%, markaz tomonidan ustoz oyligiga 12%, markaz oylik tushumidan 4%, Click/Payme/Uzum har to'lovdan 2%) oylik sahifasida faqat ma'lumot uchun statik izoh (`possible-deductions-info.tsx`) — saqlanmaydi, yig'ilmaydi, hech narsadan ayirilmaydi. Markazning o'zi to'lagan soliq — oddiy xarajat (`Expense`), soliq hisobi emas.

---

## 3. Pul oqimi diagrammalari

### 3.1 O'quvchi to'lov → Balans → Dars → Oylik

```
O'quvchi to'lov qiladi (kassaga yoki online)
        │
        ▼
┌─────────────────┐    ┌──────────────────┐
│  Payment record │───►│  Transaction     │
│  amount: 800000 │    │  type: PAYMENT   │
│  method: CASH   │    │  +800,000 so'm   │
│  source: MANUAL │    │  balance: 0→800k │
└─────────────────┘    └──────────────────┘
        │                       │
        ▼                       ▼
  Contract.paidAmount++   Student.balance++
        │
        ▼
  Dars o'tilganda (attendance):
┌──────────────────────────┐    ┌──────────────────┐
│  Transaction              │    │  SalaryAccrual   │
│  type: LESSON_DEDUCTION   │    │  amount: 24,000  │
│  -66,667 so'm             │───►│  (agar coverage  │
│  balance: 800k → 733k     │    │   mavjud bo'lsa) │
└──────────────────────────┘    └──────────────────┘
```

### 3.2 Xodim oyligi sikli

```
Oy davomida:
  ┌─ O'qituvchi (PERCENTAGE/FIXED_PER_STUDENT):
  │   Har darsda → SalaryAccrual yaratiladi
  │   (faqat LESSON_DEDUCTION tranzaksiya mavjud bo'lganda)
  │
  └─ Administrator/Kassir/BD (FIXED_MONTHLY):
      Accrual yaratilmaydi — config.value to'g'ridan-to'g'ri oylik bo'ladi

Davr — kalendar oyi (prod'da cycleStartDay = 1)
Oyning 1-si, 02:00 (Toshkent): cron tugagan oyni yopadi
  ├── O'qituvchilar: unpaid accrual larni yig'adi
  ├── Fixed monthly: config.value dan oylik yaratadi (idempotent)
  ├── Har xodim uchun SalaryPayment yaratadi:
  │   ├── hisoblangan = SUM(accruals) yoki config.value
  │   ├── TEACHER_ADVANCE avanslar ushlab qolinadi
  │   └── amount = hisoblangan − avanslar (soliq ushlanmaydi)
  └── Status: CALCULATED

CEO tasdiqlaydi → APPROVED
CEO/BD to'laydi → PAID
  └── Transaction: SALARY_PAYMENT, User.balance -= amount
```

### 3.3 To'lov bekor qilish (Reverse)

```
CEO "Bekor qilish" bosadi
        │
        ▼
┌───────────────────────────────┐
│  Reverse jarayoni (atomik):   │
│                               │
│  1. Transaction (REVERSAL)    │
│     amount: +500,000          │
│     reversedTransactionId: X  │
│     Student.balance += 500k   │
│                               │
│  2. Payment.status = REVERSED │
│                               │
│  3. Contract.paidAmount--     │
│                               │
│  4. EntityHistory:            │
│     Payment: REVERSED         │
│     Student: TO'LOV_BEKOR     │
└───────────────────────────────┘

Asl Payment yozuvi saqlanadi (audit uchun).
Ledger — haqiqat manbai.
```

### 3.4 Xarajatlar va TEACHER_ADVANCE

```
Xarajat qo'shiladi (POST /expenses):
  ├── Expense row yaratiladi
  ├── Transaction (EXPENSE) yaratiladi
  └── Agar TEACHER_ADVANCE:
      └── relatedUserId belgilanadi

Oylik hisoblashda (calculateMonthlySalaries):
  ├── O'qituvchining unsettled avanslar topiladi
  ├── oylik summasidan ushlab qolinadi (createdAt tartibida)
  ├── expense.settledBySalaryPaymentId = salaryPayment.id
  └── Natija: amount = hisoblangan − avanslar
```

---

## 4. API Endpointlar

### 4.1 Payments — To'lovlar

| Method | Endpoint | Roles | Tavsif |
|--------|----------|-------|--------|
| `POST` | `/api/payments` | CEO, BD, Admin, Cashier | Naqd to'lov qayd qilish |
| `POST` | `/api/payments/attach-external` | CEO, BD, Admin, Cashier | Tashqi to'lov biriktirish |
| `POST` | `/api/payments/:id/reverse` | **CEO** | To'lovni bekor qilish |
| `GET` | `/api/payments` | CEO, BD, Admin, Cashier | To'lovlar ro'yxati (REVERSED default yashirilgan) |
| `GET` | `/api/payments/:id` | CEO, BD, Admin, Cashier | Bitta to'lov detali |
| `GET` | `/api/payments/student/:id` | CEO, BD, Admin, Cashier | O'quvchi to'lov tarixi |
| `GET` | `/api/payments/debtors` | CEO, BD, Admin, Cashier | Balansi minus o'quvchilar |
| `GET` | `/api/payments/debt/list` | CEO, BD, Admin, Cashier | Qarzdorlik bo'limi: qatorlar, bo'lim jamilari, filtr/saralash/sahifa (ADR-0072) |
| `GET` | `/api/payments/debt/students/:id` | CEO, BD, Admin, Cashier | O'quvchi tortmasi: qarz, oylar, oxirgi to'lov, aloqa, va'da |
| `GET` | `/api/payments/debt/excel` | CEO, BD, Admin, Cashier | Ochiq bo'lim Excel'da |
| `GET` | `/api/payment-promises/month` | CEO, BD, Admin, Cashier | Shu oy va'dasi va ruxsat etilgan kunlar |
| `GET` | `/api/payments/pending-students` | CEO, BD, Admin, Cashier | To'lov kutilayotganlar (balance < 0) |

### 4.2 Transactions — Tranzaksiyalar

| Method | Endpoint | Roles | Tavsif |
|--------|----------|-------|--------|
| `GET` | `/api/transactions` | CEO, BD | Barcha tranzaksiyalar |
| `GET` | `/api/transactions/student/:id` | CEO, BD, Admin, Cashier | O'quvchi balans tarixi |
| `GET` | `/api/transactions/teacher/:id` | CEO, BD | Xodim tranzaksiyalari |
| `POST` | `/api/transactions/adjustment` | CEO, BD | Manual balans tuzatish |

### 4.3 Contracts — Shartnomalar

**Olib tashlangan.** `src/contracts/` moduli (`/api/contracts` CRUD endpointlari) va `/payments/contracts` sahifasi yo'q: shartnomalar haqiqiy ish oqimiga ulanmagan edi, sahifa doim bo'sh turardi. `Contract` modeli va `contractId` bog'lanishlari saqlangan — batafsil `server/CLAUDE.md` → «Contracts».

### 4.4 Salary — Xodimlar oyligi

| Method | Endpoint | Roles | Tavsif |
|--------|----------|-------|--------|
| `GET` | `/api/salary/config/:userId` | CEO, BD, Admin | Xodim config |
| `POST` | `/api/salary/config` | CEO, BD (faqat o'z filiali ustoziga, ADR-0034) | Config yaratish/yangilash |
| `POST` | `/api/salary/config/global` | **CEO** | Barchaga joriy qilish (FIXED_MONTHLY uchun emas) |
| `PATCH` | `/api/salary/config/:id` | **CEO** | Config tahrirlash |
| `GET` | `/api/salary/accruals/:userId` | CEO, BD, Admin | Yig'ilgan oylik detali |
| `GET` | `/api/salary/payments` | CEO, BD, Admin | Oylik to'lovlar ro'yxati |
| `POST` | `/api/salary/calculate` | **CEO** | Oylik hisoblash (trigger) |
| `PATCH` | `/api/salary/payments/:id/approve` | **CEO** | Tasdiqlash |
| `POST` | `/api/salary/payments/:id/pay` | CEO, BD | To'lash |
| `POST` | `/api/salary/payments/batch-pay` | CEO, BD | Ko'p oylikni bir martada to'lash |
| `GET` | `/api/teachers/:id/salary-summary` | CEO, BD | Kutilayotgan vs haqiqiy oylik |

### 4.5 Refunds — Pul qaytarish

| Method | Endpoint | Roles | Tavsif |
|--------|----------|-------|--------|
| `GET` | `/api/refunds/preview/:studentId` | CEO, BD, Admin | Qancha qaytarish mumkin (bo'sh balans + o'tilmagan darslar) |
| `POST` | `/api/refunds/quick` | CEO, BD, Admin | So'rov ochish — `REQUESTED`, muddat 10 bank kuni |
| `POST` | `/api/refunds/:id/hand-over` | CEO, BD, Admin, Cashier | «Berildi» — kassadan chiqim, `COMPLETED` |
| `POST` | `/api/refunds/:id/cancel` | CEO, BD | So'rovni bekor qilish — `REJECTED` |
| `GET` | `/api/refunds` | CEO, BD, Admin, Cashier | Tarix (`?status=`, sahifali, filial bo'yicha) |
| `POST` | `/api/refunds/:id/reverse` | **CEO** | Refundni bekor qilish |

### 4.6 Expenses — Xarajatlar

| Method | Endpoint | Roles | Tavsif |
|--------|----------|-------|--------|
| `POST` | `/api/expenses` | CEO, BD | Xarajat qo'shish (Administrator olib tashlangan) |
| `GET` | `/api/expenses` | CEO, BD | Ro'yxat (filial bo'yicha filtrlanadi) |
| `PATCH` | `/api/expenses/:id` | CEO, BD | Tahrirlash (moliyaviy field o'zgartsa → ledger qayta yoziladi) |
| `DELETE` | `/api/expenses/:id` | CEO, BD | O'chirish (soft delete + ledger reversal) |

### 4.7 Reports — Hisobotlar

| Method | Endpoint | Roles | Tavsif |
|--------|----------|-------|--------|
| `GET` | `/api/reports/financial-overview` | CEO, BD | Tushum (usullar, kecha), oy hisoblari, qarz, oylik, foyda |
| `GET` | `/api/reports/financial-trend` | CEO, BD | Oxirgi 6 oy trend |
| `GET` | `/api/reports/marketing` | CEO, BD | Marketing: sarf, yangi o'quvchilar, jalb qilish narxi, o'quvchi qiymati, samara (ADR-0067) |
| `GET` | `/api/reports/kpis` | CEO, BD | Faol o'quvchilar, guruhlar, davomat, lidlar |

**Financial overview formulalari:**
- `Chiqimlar = expenses + salary.paid`
- `Foyda = tushumlar - chiqimlar`

---

## 5. Frontend sahifalar

| Sahifa | Yo'l | Tavsif |
|--------|------|--------|
| Umumiy ma'lumotlar | `/payments/overview` | Oy tanlash, oy to'lovlari, qarz, kassa/oylik/foyda kartalari, oylar jadvali, oxirgi to'lovlar (ADR-0067) |
| Marketing | `/reports/marketing` | Sarf, yangi o'quvchilar, jalb qilish narxi, o'quvchi qiymati, samara, manba bo'yicha |
| Ish haqi | `/payments/salary` | Oylik jadval + "Oylik belgilash" dialog + batch to'lash + CEO uchun "Sozlamalar" dropdown (Xodim stavkalari, Hisoblash davri) |
| Xarajatlar | `/payments/expenses` | Xarajatlar CRUD (branchId bilan) |
| Qarzdorlik | `/payments/debt` | Shu oy · Eski qarz · O'qimayotganlar, o'quvchi tortmasi (ADR-0072) |
| Student profil | "To'lovlar" tab | To'lov tarixi + balans tarixi |
| Teacher profil | "Ish haqi" tab | Kutilayotgan vs haqiqiy oylik, guruhlar bo'yicha |

**Salary config dialog** — CEO "Oylik belgilash" tugmasi orqali:
- Xodim tanlash (barcha rollar)
- O'qituvchi tanlansa → 3 xil tur: Foiz, O'quvchi boshiga, Oylik
- Boshqa xodim tanlansa → faqat Oylik (FIXED_MONTHLY)
- Mavjud config ko'rsatiladi (agar bor bo'lsa)

---

## 6. Xavfsizlik

### 6.1 Race Condition himoyasi
- Barcha balans operatsiyalari `TransactionsService` orqali `SELECT FOR UPDATE` bilan atomik
- `isolationLevel: Serializable` belgilangan
- `maxWait: 10000, timeout: 15000` — Neon serverless cold-start uchun

### 6.2 Validatsiya
- Contract-student ownership: `contractId` aynan shu `studentId` ga tegishli bo'lishi shart
- Branch mosligi: payment `branchId` shartnoma `branchId` ga mos bo'lishi shart
- Dublikat tashqi to'lov: `(method, externalId, companyId)` unique constraint
- Yopilgan oylik davri: kechikkan accrual rad etilmaydi — joriy ochiq davrga o'tkaziladi (`creditPeriodDate`, carry-over)
- Reversal idempotency: allaqachon bekor qilingan tranzaksiyani qayta bekor qilib bo'lmaydi

### 6.3 Role-Based Access

| Feature | CEO | BD | Admin | Cashier | Teacher |
|---------|:---:|:--:|:-----:|:-------:|:-------:|
| To'lov yaratish | ✅ | ✅ | ✅ | ✅ | ❌ |
| To'lov bekor qilish | ✅ | ❌ | ❌ | ❌ | ❌ |
| Oylik belgilash | ✅ | ✅ | ❌ | ❌ | ❌ |
| Oylik hisoblash | ✅ | ❌ | ❌ | ❌ | ❌ |
| Oylik tasdiqlash | ✅ | ❌ | ❌ | ❌ | ❌ |
| Oylik to'lash | ✅ | ✅ | ❌ | ❌ | ❌ |
| Hisoblash davrini boshqarish | ✅ | ❌ | ❌ | ❌ | ❌ |
| Pul qaytarish so'rovi | ✅ | ✅ | ✅ | ❌ | ❌ |
| «Berildi» | ✅ | ✅ | ✅ | ✅ | ❌ |
| So'rovni bekor qilish | ✅ | ✅ | ❌ | ❌ | ❌ |
| Berilgan refundni bekor qilish (reverse) | ✅ | ❌ | ❌ | ❌ | ❌ |
| Xarajat yaratish | ✅ | ✅ | ❌ | ❌ | ❌ |
| Xarajat tahrirlash | ✅ | ✅ | ❌ | ❌ | ❌ |
| Moliyaviy hisobotlar | ✅ | ✅ | ❌ | ❌ | ❌ |

### 6.4 Multi-Tenant
- Barcha modellar `companyId` filter bilan ishlaydi
- `companyId` JWT tokendan olinadi (`@CurrentUser('companyId')`)
- Branch Director faqat o'z filiali ma'lumotlarini ko'radi

---

## 7. Cron Jobs

| Cron | Vaqt | Tavsif |
|------|------|--------|
| Oylik hisoblash | `0 2 * * *` (har kuni 02:00 Toshkent; faqat `cycleStartDay` kuni ishlaydi — prod'da oyning 1-si) | Tugagan davr oyligi avtomatik hisoblanadi |
| Payme timeout | `0 */30 * * * *` (har 30 daqiqa) | 12 soatdan eski Payme pending tranzaksiyalarni bekor qiladi |
| Click timeout | `0 */10 * * * *` (har 10 daqiqa) | 30 daqiqadan eski Click prepared tranzaksiyalarni bekor qiladi |

- Davr `cycleStartDay` kunidan boshlanib, keyingi oyning shu kunidan oldin tugaydi. Prod'da `cycleStartDay = 1`, ya'ni davr — kalendar oyi. Sozlamasi yo'q kompaniya uchun kod 8 ni oladi (`resolve-current-period.ts`) — bu prod'ga mos emas, yangi kompaniyaga sozlama aniq beriladi (`CONTEXT.md`)
- FIXED_MONTHLY xodimlar uchun idempotent — bir davr uchun qayta yaratmaydi
- Soliq hisoblanmaydi (§2.2 «Soliq — hisoblanmaydi»)
- TEACHER_ADVANCE avanslar oylik summasidan ushlab qolinadi

---

## 8. Gateway integratsiya

### 8.1 Payme (Paycom) Merchant API — ✅ Tayyor

**Joylashuv:** `server/src/payment-gateways/payme/`

**Arxitektura:** Paycom JSON-RPC 2.0 so'rovlarni bizning webhook endpointga yuboradi. Biz 6 ta metodni bajaramiz va JSON-RPC javob qaytaramiz.

**Webhook endpoint:** `POST /api/gateways/payme/webhook?companyId=1001` (Public — JWT kerak emas)

**Autentifikatsiya:** `Authorization: Basic base64("Paycom:<MERCHANT_KEY>")` — `crypto.timingSafeEqual()` bilan tekshiriladi.

**Account field:** `student_id` — talaba ID raqami (5 xonali, masalan 10042)

**Summalar:** Paycom **tiyinda** yuboradi (1 so'm = 100 tiyin). `PaymeTransaction` da ikkala qiymat saqlanadi: `amount` (tiyin) va `amountInSom` (so'm).

#### 6 ta RPC metod

| Metod | Vazifasi | Asosiy logika |
|-------|---------|---------------|
| `CheckPerformTransaction` | To'lov mumkinmi? | Talaba mavjud + summa > 0 → `{ allow: true }` |
| `CreateTransaction` | Tranzaksiya yaratish (state=1) | Idempotent (`paymeId` bo'yicha); eski pending bekor qilinadi |
| `PerformTransaction` | To'lovni bajarish (state=2) | `PaymentsService.createFromExternal()` → talaba balansini oshiradi |
| `CancelTransaction` | Bekor qilish | state=1→-1 (moliyaviy o'zgarmaydi). state=2 → avval ERP to'lovi bekor qilinadi (`PaymentsService.reverse`, balansdan qaytarib olinadi), keyingina state=-2. ERP bekor qilishni rad etsa (odatda to'lov puli darslarga sarflangan — §18) → -31007, state=2 qoladi, admin paneldan hal qiladi |
| `CheckTransaction` | Holatni tekshirish | To'liq state qaytaradi |
| `GetStatement` | Vaqt oraligi ro'yxati | Paycom mutanosiblik uchun |

#### Tranzaksiya holatlari

| State | Ma'nosi |
|-------|---------|
| `1` | Yaratildi (kutilmoqda) |
| `2` | Bajarildi (to'lov amalga oshdi) |
| `-1` | Bekor qilindi (to'lov qilinmagan) |
| `-2` | Qaytarildi (to'lov bajarilgandan so'ng bekor) |

#### Xato kodlari

| Kod | Ma'nosi |
|-----|---------|
| `-32504` | Avtorizatsiya xatosi |
| `-32601` | Metod topilmadi |
| `-31001` | Noto'g'ri summa |
| `-31003` | Tranzaksiya topilmadi |
| `-31007` | Bekor qilib bo'lmaydi — bajarilgan to'lovning ERP'dagi bekor qilinishi rad etildi (odatda puli darslarga sarflangani uchun) |
| `-31008` | Amalni bajarib bo'lmaydi |
| `-31050` | Talaba topilmadi |

#### Timeout

- Payme tranzaksiyalar 12 soat ichida bajarilmasa auto-cancel bo'ladi
- `PaymeCronService` har 30 daqiqada `state=1` va `createTime` 12 soatdan eski bo'lgan tranzaksiyalarni `state=-1, reason=4` qiladi

#### Student Portal to'lov oqimi

```
Talaba student portalga kiradi
    ↓
Payme tanlaydi, summani kiritadi, "To'lash" bosadi
    ↓
Frontend: POST /student-portal/payments/init { amount, method: "PAYME" }
    ↓
Backend: Payme checkout URL generatsiya qiladi
    ↓
Frontend: window.location.href = checkoutUrl
    ↓
Talaba Payme sahifasida to'laydi
    ↓
Paycom bizning webhookga JSON-RPC yuboradi:
  CheckPerformTransaction → CreateTransaction → PerformTransaction
    ↓
Talaba balansiga pul tushadi
```

#### Env variables

| Variable | Tavsif |
|----------|--------|
| `PAYME_MERCHANT_ID` | Paycom kassa ID |
| `PAYME_MERCHANT_KEY` | Production kalit |
| `PAYME_MERCHANT_KEY_TEST` | Test/sandbox kalit |

#### Fayllar

| Fayl | Vazifasi |
|------|---------|
| `payme.service.ts` | Dispatcher + Basic Auth (~130 qator) |
| `payme-methods.service.ts` | 6 ta RPC metod (~270 qator) |
| `payme-errors.ts` | Xato kodlari + helper (~95 qator) |
| `payme.types.ts` | TypeScript interfeyslari (~110 qator) |
| `payme-cron.service.ts` | Timeout tozalash (~30 qator) |
| `payme.service.spec.ts` | 20 ta test (auth + dispatch) |
| `payme-methods.service.spec.ts` | 24 ta test (6 metod) |

### 8.2 Click SHOP-API — ✅ Tayyor

**Joylashuv:** `server/src/payment-gateways/click/`

**Arxitektura:** Click ikki bosqichli SHOP-API (Prepare + Complete) orqali ishlaydi. Click bizning webhook endpointga POST so'rov yuboradi, biz MD5 imzo tekshirib javob qaytaramiz.

**Webhook endpoint:** `POST /api/gateways/click/webhook?companyId=1001` (Public — JWT kerak emas)

**Autentifikatsiya:** MD5 hash — `md5(click_trans_id + service_id + SECRET_KEY + merchant_trans_id + [merchant_prepare_id] + amount + action + sign_time)` — `crypto.timingSafeEqual()` bilan tekshiriladi.

**Account field:** `merchant_trans_id` = `studentId` — talaba ID raqami

**Summalar:** Click **so'mda** yuboradi (Payme tiyinda yuboradi). `ClickTransaction` da `amount` (Float, Click formati) va `amountInSom` (Int, ERP uchun) saqlanadi.

#### Ikki bosqichli webhook oqimi

| Bosqich | Action | Vazifasi | Logika |
|---------|--------|---------|--------|
| **Prepare** | `0` | Tasdiqlash va rezerv | Talaba mavjud + summa > 0 → `ClickTransaction` yaratish (status=1) |
| **Complete** | `1` | To'lovni bajarish | `PaymentsService.createFromExternal()` → talaba balansini oshiradi (status=2) |

#### Prepare (action=0) so'rov parametrlari

| # | Parametr | Turi | Tavsif |
|---|----------|------|--------|
| 1 | `click_trans_id` | bigint | Click tizimidagi tranzaksiya ID |
| 2 | `service_id` | int | Xizmat identifikatori |
| 3 | `click_paydoc_id` | bigint | SMS da ko'rinadigan to'lov raqami |
| 4 | `merchant_trans_id` | varchar | Bizning tizimda `studentId` |
| 5 | `amount` | float | To'lov summasi (so'mda) |
| 6 | `action` | int | `0` = Prepare |
| 7 | `error` | int | 0 = muvaffaqiyatli |
| 8 | `sign_time` | varchar | `"YYYY-MM-DD HH:mm:ss"` |
| 9 | `sign_string` | varchar | MD5 hash |

**Prepare javob:** `{ click_trans_id, merchant_trans_id, merchant_prepare_id, error, error_note }`

#### Complete (action=1) so'rov parametrlari

Prepare bilan bir xil + `merchant_prepare_id` (Prepare javobidan olingan UUID).

**Complete javob:** `{ click_trans_id, merchant_trans_id, merchant_confirm_id, error, error_note }`

#### Xato kodlari (biz qaytaramiz)

| Kod | Ma'nosi |
|-----|---------|
| `0` | Muvaffaqiyatli |
| `-1` | Imzo tekshiruvi xato (SIGN CHECK FAILED) |
| `-2` | Noto'g'ri summa |
| `-4` | Allaqachon to'langan |
| `-5` | Foydalanuvchi topilmadi |
| `-6` | Tranzaksiya topilmadi |
| `-9` | Tranzaksiya bekor qilingan |

#### Tranzaksiya holatlari

| Status | Ma'nosi |
|--------|---------|
| `0` | Pending (kutilmoqda) |
| `1` | Prepared (tayyorlangan) |
| `2` | Completed (bajarildi) |
| `-1` | Cancelled (bekor qilindi) |

#### Timeout

- Click tranzaksiyalar 30 daqiqa ichida bajarilmasa auto-cancel bo'ladi
- `ClickCronService` har 10 daqiqada `status=1` va `prepareTime` 30 daqiqadan eski bo'lgan tranzaksiyalarni `status=-1` qiladi

#### Student Portal to'lov oqimi

```
Talaba student portalga kiradi
    ↓
Click tanlaydi, summani kiritadi, "To'lash" bosadi
    ↓
Frontend: POST /student-portal/payments/init { amount, method: "CLICK" }
    ↓
Backend: Click redirect URL generatsiya qiladi:
  https://my.click.uz/services/pay?service_id=X&merchant_id=X&amount=X&transaction_param=studentId&return_url=X
    ↓
Frontend: window.location.href = checkoutUrl
    ↓
Talaba Click sahifasida/ilovasida to'laydi
    ↓
Click bizning webhookga POST yuboradi:
  Prepare (action=0) → Complete (action=1)
    ↓
Talaba balansiga pul tushadi
```

#### Env variables

| Variable | Tavsif |
|----------|--------|
| `CLICK_MERCHANT_ID` | Click merchant ID |
| `CLICK_SERVICE_ID` | Click service ID |
| `CLICK_SECRET_KEY` | MD5 imzo tekshiruvi uchun maxfiy kalit |

#### Fayllar

| Fayl | Vazifasi |
|------|---------|
| `click.service.ts` | Dispatcher + MD5 imzo tekshiruvi (~120 qator) |
| `click-methods.service.ts` | Prepare + Complete logika (~180 qator) |
| `click-errors.ts` | Xato kodlari + helper (~90 qator) |
| `click.types.ts` | TypeScript interfeyslari (~50 qator) |
| `click-cron.service.ts` | Timeout tozalash (~30 qator) |
| `click.service.spec.ts` | 12 ta test (signature + dispatch) |
| `click-methods.service.spec.ts` | 16 ta test (prepare + complete) |

### 8.3 Uzum — ❌ Hali tayyor emas

Skeleton implementatsiya mavjud (`uzum.service.ts`).

### Umumiy infra

- `PaymentGatewayEvent` jadvali — barcha webhook payloadlar log qilinadi (debug/replay uchun)
- `PaymentsService.createFromExternal()` — gateway to'lov yaratish (idempotent: `@@unique([method, externalId, companyId])`)
- Dublikat webhook `P2002` xatosi bilan rad etiladi

---

## 9. Test coverage

| Modul | Fayl | Testlar |
|-------|------|---------|
| Payments | `payments.service.spec.ts` | 29 ta (create, reverse, findAll, branch validation, contract-student check) |
| Payme Dispatcher | `payme.service.spec.ts` | 20 ta (auth, dispatch, event logging) |
| Payme Methods | `payme-methods.service.spec.ts` | 24 ta (6 metod, idempotentlik, timeout, xatolar) |
| Click Dispatcher | `click.service.spec.ts` | 12 ta (MD5 signature, dispatch, event logging) |
| Click Methods | `click-methods.service.spec.ts` | 16 ta (prepare, complete, idempotentlik, xatolar) |
| Salary | Hozircha yo'q | — |
| Transactions | Hozircha yo'q | — |
| Refunds | Hozircha yo'q | — |

---

## 10. Kelajak rejalari

- [x] Payme integratsiya (Merchant API)
- [x] Click integratsiya (SHOP-API)
- [ ] Uzum integratsiya
- [ ] `providerFee` ni P&L hisobotiga kiritish
- [ ] Check/kvitansiya chiqarish tizimi
- [ ] Shartnoma PDF generatsiya
- [ ] Filial bo'yicha alohida balans hisobi
- [x] Salary module test coverage (Faza 2 — 40 yangi test)

---

# v3.0 ADDENDUM — Prepaid Billing Model va boshqa o'zgarishlar (Faza 0–8)

**Versiya:** 3.0
**Sana:** 2026-04-28
**Status:** Production deploy'ga shay (testlar 892/892, frontend build ✓)

Bu bo'lim v2.0 ustiga qurilgan barcha yangi xususiyatlarni hujjatlashtiradi.

## 11. Prepaid Billing Model (yangi yadro)

### 11.1 Eski model vs yangi

**Eski (v2.0):** har attendance'da `cyclesPaid > cyclesDeducted` tekshiriladi va tsikl chegarasida bir to'liq tsikl yechiladi.

**Yangi (v3.0):** har enrollment'da `prepaidLessonsRemaining` hisobchisi bor. Birinchi attended dars'da balans bo'yicha to'liq tsikl yoki qisman yechiladi va prepaid o'rnatiladi. Keyingi har dars uchun prepaid 1 ga kamayadi. 0 ga tushganda yana balans tekshiriladi.

### 11.2 Schema o'zgarishlari

| O'zgarish | Joy |
|---|---|
| `Enrollment.prepaidLessonsRemaining Int @default(0)` | yangi maydon |
| `Transaction.metadata Json?` | LESSON_DEDUCTION/CONSUMPTION metadata |
| `Transaction.reversedAt DateTime?`, `reversedById Int?` | "still active" markeri |
| `TransactionType.LESSON_CONSUMPTION` | har dars uchun audit qator (amount=0) |
| `TransactionType.INITIAL_BALANCE` | eski tizimdan ko'chirish |
| `LessonDeductionMode` enum: `FULL_CYCLE` / `PARTIAL` / `SINGLE_UNCOVERED` | metadata.mode uchun |
| `Attendance.cancellationId String?` | LessonCancellation FK |

Ikkita partial unique index migrationda raw SQL bilan yaratiladi:
- `tx_consumption_per_attendance_unique`: `(attendanceId) WHERE type='LESSON_CONSUMPTION' AND reversedAt IS NULL`
- `tx_initial_balance_per_student_unique`: `(studentId) WHERE type='INITIAL_BALANCE' AND reversedAt IS NULL`

### 11.3 LessonBillingService

`server/src/billing/lesson-billing.service.ts` — yagona pul yechish nuqtasi. Manual va QR attendance ikkalasi shu service'ga delegate qiladi.

**Status transition matritsasi.** ⚠️ **ABSENT hisoblanadi** — «dars o'tdi = dars to'landi»: faqat `EXCUSED` va bekor qilingan dars hisoblanmaydi. Yagona haqiqat — `lesson-billing.service.ts` dagi `BILLABLE` to'plami (PRESENT, LATE, ABSENT).

| Eski | Yangi | Harakat |
|---|---|---|
| (yo'q) | EXCUSED | hech narsa |
| (yo'q) | PRESENT/LATE/ABSENT | **bill** |
| EXC | EXC | hech narsa |
| EXC | PRESENT/LATE/ABSENT | **bill** |
| PRES/LATE/ABS | PRES/LATE/ABS | hech narsa |
| PRES/LATE/ABS | EXC | **reverse** |

**Bill algoritmi:**
1. Idempotency: shu attendance uchun aktiv `LESSON_CONSUMPTION` bormi → bo'lsa qaytib chiqish.
2. Enrollment FOR UPDATE lock.
3. `prepaidLessonsRemaining > 0` → decrement, audit qator.
4. Aks holda balans bo'yicha:
   - `balance ≥ fullCycleCost` → to'liq tsikl yech (FULL_CYCLE), prepaid = lessonPaymentCount.
   - `balance ≥ perLessonCost` → `lessonsAffordable(...)` ta darsga yech (PARTIAL).
   - Yetmasa → `SINGLE_UNCOVERED`: bitta dars narxi baribir yechiladi, balans minusga tushadi (qarz ledger'da qoladi). Ustoz haqi to'lov kelguncha kechiktiriladi (B.1).
5. `LESSON_CONSUMPTION` audit qator (amount=0).
6. Har ustoz uchun `SalaryAccrual` (B.1 gate).

**Reverse algoritmi:**
1. Aktiv consumption topilsa → reverseTransaction (asl `reversedAt` belgilanadi), keyin `prepaidLessonsRemaining +=1`. Dars `SINGLE_UNCOVERED` bilan yechilgan bo'lsa — prepaid emas, o'sha yechim bekor qilinadi (balans qaytadi, qarz yo'qoladi).
2. SalaryAccrual `reversedAt` belgilanadi.
3. Consumption yo'q (qarzdor yo'li paydo bo'lishidan oldingi eski qatorlar) → faqat accrual reverse, prepaid +1 QILMAYDI (bepul dars yo'q).

### 11.4 Atomic transaction guarantee

Har attendance bitta `prisma.$transaction(Serializable, maxWait: 10s, timeout: 15s)` ichida.

### 11.5 Reversal markeri (`Transaction.reversedAt`)

`reverseTransaction()` ikki ish qiladi:
1. Yangi reversal qator yaratadi (asl `reversedTransactionId` orqali).
2. Asl qatorga `reversedAt = now()`, `reversedById` yozadi.

Barcha "still active" filterlar `reversedAt: null` ishlatadi.

## 12. Salary Versioning (`EmployeeSalaryConfigVersion`)

Har salary config yozish yangi version qatori yaratadi (SCD2). Parent `EmployeeSalaryConfig` joriy qiymat ko'zgu sifatida qoladi.

**Validatsiya:**
- `effectiveFrom < latestVersion.effectiveFrom` → 400 (orqaga vaqt yo'q)
- `effectiveFrom` APPROVED/PAID `SalaryPayment` davriga tushsa → 400 (yopiq period)

**Lookup pattern:** ikki query — avval `groupId = X` (per-group), keyin `groupId IS NULL` (global). Postgres NULL ordering kontrakt emas.

### 12.2 FIXED_PER_STUDENT semantikasi (kritik fix)

**Eski (bug):** `value` har dars'da to'liq yoziladi.
**Yangi:** per-tsikl, per-lesson = `Math.round(value / lessonPaymentCount)`.

### 12.3 FIXED_MONTHLY future-dated fix

`salary-calculation.service.ts` joriy davr uchun `EmployeeSalaryConfigVersion` ichidan `effectiveFrom <= periodEnd` bilan o'qiydi.

## 13. Salary Period (`SalaryPeriodSetting`)

Konfigurable cycle start day. Prod'da **1** — davr kalendar oyi. Sozlama yo'q bo'lsa kod 8 ni oladi (fallback, prod'ga mos emas).

**Mid-cycle cutover policy:** agar CEO joriy davr ichida `effectiveFrom` qo'ysa, service avtomatik ravishda eski jadval bo'yicha keyingi davr boshiga ko'chiradi.

**Cron:** `0 2 * * *` (har kuni 02:00 Tashkent). Har company uchun `isCycleStartDayForCompany` tekshiradi.

## 14. Lesson Cancellation (`LessonCancellation`)

Per-group dars bekor qilish (Holiday — company-wide). Partial unique `WHERE deletedAt IS NULL`.

**Atomik cascade:** `LessonCancellationsService.create()`:
1. `LessonCancellation` qator.
2. PRESENT/LATE/ABSENT attendance'larni topish (hisoblanadigan har qanday holat, ABSENT ham).
3. Har biri uchun: status → EXCUSED, `cancellationId` set, billing reverse cascade.
4. Oylik to'lovchilarga o'sha darsning puli darhol balansga qaytadi — davomati belgilanmaganlarga ham (ADR-0053).

**Soft delete:** attendance/billing'ni avtomatik qaytarmaydi.

**Date format:** `T00:00:00.000Z` — attendance bilan bir xil.

**Teacher scope:** `groupId` majburiy, Teacher faqat o'z guruhlari.

## 15. Lesson Trail (`GET /transactions/student/:id/lesson-trail`)

Per-student "har so'm qayerga ketdi?" hisoboti.

## 16. Initial Balance

`POST /students/:id/initial-balance` (CEO-only). Eski tizimdan o'tkazilayotgan o'quvchilar uchun bir martagina kirish.

## 17. Enrollment Lifecycle Prepaid Refund

`EnrollmentBillingService.refundPrepaidToBalance(tx, ...)` — eng oxirgi unreversed `LESSON_DEDUCTION.metadata.perLessonCost` ishlatiladi. Chaqiriladi: removeFromGroup (DROPPED) + Transfer (TRANSFERRED + new enrollment), atomic.

## 18. Payment Reverse Block

`reverse()` agar shu to'lov funded qilgan aktiv `LESSON_CONSUMPTION` bo'lsa 400 qaytaradi.

## 19. CEO-only restriction

| Endpoint | Eski | Yangi |
|---|---|---|
| `POST /salary/config` | CEO + BD | CEO; BD — faqat o'z filiali ustoziga (ADR-0034, 2026-09) |
| `POST /salary/config/global` | CEO + BD | CEO faqat |
| `PATCH /salary/config/:id` | CEO + BD | CEO faqat |
| `POST /salary/period-settings` | yangi | CEO faqat |

## 20. Yangi endpointlar

| Endpoint | Role | Maqsad |
|---|---|---|
| `GET /salary/me/summary` | auth | Ustozning o'z oyligi |
| `GET /salary/me/accruals` | auth | Accruals |
| `GET /salary/me/current-cycle/breakdown` | auth | Joriy davr breakdown |
| `GET /salary/me/payments/:id/breakdown` | auth | Salary payment (faqat o'zi) |
| `GET /salary/payments/:id/breakdown` | CEO/BD | Boshqa ustoz |
| `GET /salary/config-history/:userId` | CEO/BD | Salary config tarix |
| `GET /salary/timeline/:userId` | CEO/BD/Admin | Birlashtirilgan timeline |
| `GET /salary/period-settings` | CEO/BD | Period sozlamalar |
| `POST /salary/period-settings` | CEO | Yangi period |
| `POST /students/:id/initial-balance` | CEO | Boshlang'ich balans |
| `GET /transactions/student/:id/lesson-trail` | CEO/BD/Admin/Cashier | Per-student ledger |
| `POST /lesson-cancellations` | CEO/BD/Admin | Dars bekor qilish |
| `DELETE /lesson-cancellations/:id` | CEO/BD | Soft delete |
| `GET /lesson-cancellations` | hamma | Ro'yxat (Teacher faqat o'z guruhlari) |
| `POST /billing/lesson-deduction/:id/reverse` | CEO/BD | Tsikl batch'ni bekor qilish |

## 21. Frontend yangiliklar

| Joy | Tafsilot |
|---|---|
| `/payments/salary` Sozlamalar dropdown | Xodim stavkalari / Hisoblash davri |
| `/payments/salary` "Davrni yakunlash" tugmasi | Eski "Oylikni hisoblash" — Play ikona |
| Salary breakdown drawer | Salary qatoriga bosish — har dars + CSV export |
| `/profile/salary` (lehrer) | Ustozning o'z oyligi |
| Group "Bekor qilingan" tab | Cancel + reverse cascade |
| Teacher "Taymlayn" tab | Salary + group + profile o'zgarishlari |
| Student "Dars-ma-dars" tab | Ledger trail |
| Student dropdown "Boshlang'ich balans" (CEO) | Initial balance |
| Salary config dialog `effectiveFrom` | Date picker |

## 22. Test coverage

| Spec | Testlar |
|---|---|
| `entity-history.service.spec.ts` | 6 (tx-awareness) |
| `refunds-eligibility.service.spec.ts` | 6 (regression) |
| `resolve-current-period.spec.ts` | 9 (period bounds) |
| `salary-accrual.service.spec.ts` | 12 (versioning + FIXED_PER_STUDENT) |
| `salary.controller.spec.ts` | 19 (role assertion) |
| `lesson-billing.service.spec.ts` | 15 (matrix + scenarios) |
| `enrollment-billing.service.spec.ts` | 5 (prepaid refund) |
| `lesson-cancellations.service.spec.ts` | 7 (cascade) |
| `payments.service.spec.ts` | +1 (reverse-block) |

**Jami yangi:** ~80 test. Backend hozirda 892/892 muvaffaqiyatli o'tadi.

## 23. Migration tartibi

1. `20260427183245_financial_model_v2` — yangi schema.
2. `20260428010035_fix_reversed_filter_and_constraints` — `Transaction.reversedAt`/`reversedById`, partial unique'larni `reversedAt IS NULL` ga, `LessonCancellation` partial unique.

Backfill skriptlari:
- `scripts/backfill-salary-config-versions.ts`
- `scripts/backfill-salary-period-setting.ts`
- `scripts/migrate-cycle-to-prepaid.ts`
