# DaF ERP — Moliyaviy Tizim Texnik Hujjati

**Versiya:** 2.0  
**Sana:** 2026-04-16  
**Tizim:** DaF Sprachzentrum ERP  

---

## 1. Umumiy ko'rinish

Moliyaviy modul quyidagi jarayonlarni boshqaradi:
- O'quvchi to'lovlari (naqd va online)
- Xodimlar oyliklari (o'qituvchi, administrator, kassir, filial direktori)
- Markaz xarajatlari (ijara, kommunal, ta'minot, marketing, ustozga avans)
- O'quvchi shartnomasi
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
| `TransactionType` | PAYMENT, LESSON_DEDUCTION, REFUND, SALARY_ACCRUAL, SALARY_PAYMENT, EXPENSE, ADJUSTMENT, TAX | Tranzaksiya turi |
| `ContractStatus` | DRAFT, ACTIVE, COMPLETED, CANCELLED, REFUNDED | Shartnoma holati |
| `SalaryType` | PERCENTAGE, FIXED_PER_STUDENT, **FIXED_MONTHLY** | Oylik hisoblash turi |
| `SalaryPaymentStatus` | CALCULATED, APPROVED, PAID, CANCELLED | Oylik to'lov holati |
| `RefundStatus` | REQUESTED, APPROVED, PROCESSING, COMPLETED, REJECTED | Refund holati |
| `ExpenseCategory` | RENT, UTILITIES, SUPPLIES, MARKETING, **TEACHER_ADVANCE**, OTHER | Xarajat kategoriyasi |

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
| grossAmount | Int | Brutto summa |
| taxAmount | Int | Soliq (default: kompaniya stavkasi 12% ASOT) |
| netAmount | Int | Netto (gross - tax - avanslar) |
| status | SalaryPaymentStatus | CALCULATED → APPROVED → PAID |

#### Refund — Pul qaytarish

| Ustun | Turi | Tavsif |
|-------|------|--------|
| studentId | Int | O'quvchi |
| contractId | UUID | Shartnoma |
| requestedAmount | Int | So'ralgan summa |
| approvedAmount | Int? | Tasdiqlangan summa |
| lessonsCompleted | Int | O'tilgan darslar soni |
| totalLessons | Int | Jami darslar |
| deductions | Json? | Tafsilot: consumedFromLedger, lessonsObserved, perLessonCost, previousRefunds, tax, bankFee |
| status | RefundStatus | REQUESTED → APPROVED → COMPLETED |
| refundMethod | PaymentMethod? | Qaytarish usuli |

**Hisoblash qoidalari:**
- Kurs boshlanmagan → 100% qaytarish (oldingi refundlar chegiriladi)
- 50%+ dars o'tilgan → 0% (qaytarish yo'q)
- <50% o'tilgan → `paidAmount - consumedFromLedger - previousRefunds`
- `consumedFromLedger` = LESSON_DEDUCTION tranzaksiyalari yig'indisi (ledger — haqiqat manbai)

**Status o'tishlari:** `REQUESTED → [APPROVED, REJECTED]`, `APPROVED → [PROCESSING, COMPLETED]`

#### Expense — Xarajatlar

| Ustun | Turi | Tavsif |
|-------|------|--------|
| category | ExpenseCategory | RENT, UTILITIES, SUPPLIES, MARKETING, TEACHER_ADVANCE, OTHER |
| amount | Int | Summa |
| description | String | Tavsif |
| date | Date | Sana |
| branchId | Int? | Filial |
| relatedUserId | Int? | TEACHER_ADVANCE uchun: avans oluvchi xodim |
| settledBySalaryPaymentId | UUID? | Avans oylikdan ushlab qolinganida to'ldiriladi |

**TEACHER_ADVANCE xususiyati:** Bu kategoriya avans sifatida beriladi va keyingi oylik hisoblashda xodimning netAmount idan avtomatik ushlab qolinadi (`salary.service.ts → applyPendingAdvances()`).

#### CompanyTaxConfig — Soliq sozlamalari

| Ustun | Turi | Tavsif |
|-------|------|--------|
| companyId | Int (unique) | Kompaniya |
| salaryTaxRate | Float | Oylik solig'i (default: 12% ASOT) |
| refundTaxRate | Float | Refund solig'i (default: 0%) |

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

Oyning 7-si: CUTOFF (hisoblash to'xtaydi)
Oyning 8-si: Cron avtomatik hisoblaydi (02:00 Toshkent)
  ├── O'qituvchilar: unpaid accrual larni yig'adi
  ├── Fixed monthly: config.value dan oylik yaratadi (idempotent)
  ├── Har xodim uchun SalaryPayment yaratadi:
  │   ├── grossAmount = SUM(accruals) yoki config.value
  │   ├── taxAmount = gross × salaryTaxRate / 100
  │   ├── TEACHER_ADVANCE avanslar netAmount dan ushlab qolinadi
  │   └── netAmount = gross - tax - avanslar
  └── Status: CALCULATED

CEO tasdiqlaydi → APPROVED
CEO/BD to'laydi → PAID
  └── Transaction: SALARY_PAYMENT, User.balance -= netAmount
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
  ├── netAmount dan ushlab qolinadi (createdAt tartibida)
  ├── expense.settledBySalaryPaymentId = salaryPayment.id
  └── Natija: netAmount = gross - tax - avanslar
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
| `GET` | `/api/payments/pending-students` | CEO, BD, Admin, Cashier | To'lov kutilayotganlar (balance < 0) |

### 4.2 Transactions — Tranzaksiyalar

| Method | Endpoint | Roles | Tavsif |
|--------|----------|-------|--------|
| `GET` | `/api/transactions` | CEO, BD | Barcha tranzaksiyalar |
| `GET` | `/api/transactions/student/:id` | CEO, BD, Admin, Cashier | O'quvchi balans tarixi |
| `GET` | `/api/transactions/teacher/:id` | CEO, BD | Xodim tranzaksiyalari |
| `POST` | `/api/transactions/adjustment` | CEO, BD | Manual balans tuzatish |

### 4.3 Contracts — Shartnomalar

| Method | Endpoint | Roles | Tavsif |
|--------|----------|-------|--------|
| `POST` | `/api/contracts` | CEO, BD, Admin | Shartnoma yaratish |
| `GET` | `/api/contracts` | CEO, BD, Admin | Ro'yxat |
| `GET` | `/api/contracts/:id` | CEO, BD, Admin | Detal (to'lovlar bilan) |
| `GET` | `/api/contracts/student/:id` | CEO, BD, Admin | O'quvchi shartnomalar |
| `PATCH` | `/api/contracts/:id` | CEO, BD, Admin | Yangilash |
| `PATCH` | `/api/contracts/:id/status` | CEO, BD | Status o'zgartirish |

### 4.4 Salary — Xodimlar oyligi

| Method | Endpoint | Roles | Tavsif |
|--------|----------|-------|--------|
| `GET` | `/api/salary/config/:userId` | CEO, BD | Xodim config |
| `POST` | `/api/salary/config` | CEO, BD | Config yaratish/yangilash |
| `POST` | `/api/salary/config/global` | CEO, BD | Barchaga joriy qilish (FIXED_MONTHLY uchun emas) |
| `PATCH` | `/api/salary/config/:id` | CEO, BD | Config tahrirlash |
| `GET` | `/api/salary/accruals/:userId` | CEO, BD | Yig'ilgan oylik detali |
| `GET` | `/api/salary/payments` | CEO, BD | Oylik to'lovlar ro'yxati |
| `POST` | `/api/salary/calculate` | **CEO** | Oylik hisoblash (trigger) |
| `PATCH` | `/api/salary/payments/:id/approve` | **CEO** | Tasdiqlash |
| `POST` | `/api/salary/payments/:id/pay` | CEO, BD | To'lash |
| `POST` | `/api/salary/payments/batch-pay` | CEO, BD | Ko'p oylikni bir martada to'lash |
| `GET` | `/api/teachers/:id/salary-summary` | CEO, BD | Kutilayotgan vs haqiqiy oylik |

### 4.5 Refunds — Pul qaytarish

| Method | Endpoint | Roles | Tavsif |
|--------|----------|-------|--------|
| `POST` | `/api/refunds` | CEO, BD, Admin | Refund so'rash |
| `GET` | `/api/refunds` | CEO, BD | Ro'yxat |
| `PATCH` | `/api/refunds/:id/process` | CEO, BD | Tasdiqlash/rad etish/to'lash |
| `POST` | `/api/refunds/:id/reverse` | **CEO** | Refundni bekor qilish |

### 4.6 Expenses — Xarajatlar

| Method | Endpoint | Roles | Tavsif |
|--------|----------|-------|--------|
| `POST` | `/api/expenses` | CEO, BD, Admin | Xarajat qo'shish |
| `GET` | `/api/expenses` | CEO, BD, Admin | Ro'yxat (filial bo'yicha filtrlanadi) |
| `PATCH` | `/api/expenses/:id` | CEO, BD | Tahrirlash (moliyaviy field o'zgartsa → ledger qayta yoziladi) |
| `DELETE` | `/api/expenses/:id` | CEO, BD | O'chirish (soft delete + ledger reversal) |

### 4.7 Reports — Hisobotlar

| Method | Endpoint | Roles | Tavsif |
|--------|----------|-------|--------|
| `GET` | `/api/reports/financial-overview` | CEO, BD | Tushum, xarajat, foyda, LTV, CAC, ROI |
| `GET` | `/api/reports/financial-trend` | CEO, BD | Oxirgi 6 oy trend |
| `GET` | `/api/reports/kpis` | CEO, BD | Faol o'quvchilar, guruhlar, davomat, lidlar |

**Financial overview formulalari:**
- `Chiqimlar = expenses + salary.paid`
- `Foyda = tushumlar - chiqimlar`
- `LTV = davrdagi tushum / noyob to'lovchilar soni`
- `CAC = marketing xarajati / yangi o'quvchilar soni`
- `Marketing ROI = (tushum - marketing) / marketing × 100%`

---

## 5. Frontend sahifalar

| Sahifa | Yo'l | Tavsif |
|--------|------|--------|
| Umumiy ma'lumotlar | `/payments/overview` | KPI kartalar, davr tanlash, to'lov usullari, oxirgi to'lovlar |
| Ish haqi | `/payments/salary` | Oylik jadval + "Oylik belgilash" dialog + batch to'lash |
| Xarajatlar | `/payments/expenses` | Xarajatlar CRUD (branchId bilan) |
| Shartnomalar | `/payments/contracts` | Shartnomalar CRUD |
| Qarzdorlar | `/payments/debtors` | Balansi minus o'quvchilar ro'yxati |
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
- Period-closed guard: yopilgan davrdagi accrual rad etiladi
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
| Refund yaratish | ✅ | ✅ | ✅ | ❌ | ❌ |
| Refund bekor qilish | ✅ | ❌ | ❌ | ❌ | ❌ |
| Xarajat yaratish | ✅ | ✅ | ✅ | ❌ | ❌ |
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
| Oylik hisoblash | `0 2 8 * *` (8-sana, 02:00 Toshkent) | Barcha xodimlar oyligi avtomatik hisoblanadi |

- Cutoff: 7-sanagacha bo'lgan accrual lar joriy oyga kiritiladi
- 8-sanadan keyingi accrual lar keyingi oyga o'tadi
- FIXED_MONTHLY xodimlar uchun idempotent — bir davr uchun qayta yaratmaydi
- Soliq `CompanyTaxConfig.salaryTaxRate` bo'yicha hisoblanadi (default 12%)
- TEACHER_ADVANCE avanslar netAmount dan ushlab qolinadi

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
| `CancelTransaction` | Bekor qilish | state=1→-1 (moliyaviy o'zgarmaydi); state=2→xato -31007 |
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
| `-31007` | Bekor qilib bo'lmaydi (bajarilgan) |
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

### 8.2 Click — ❌ Hali tayyor emas

Skeleton implementatsiya mavjud (`click.service.ts`).

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
| Salary | Hozircha yo'q | — |
| Transactions | Hozircha yo'q | — |
| Refunds | Hozircha yo'q | — |

---

## 10. Kelajak rejalari

- [x] Payme integratsiya (Merchant API)
- [ ] Click integratsiya
- [ ] Uzum integratsiya
- [ ] `providerFee` ni P&L hisobotiga kiritish
- [ ] Check/kvitansiya chiqarish tizimi
- [ ] Shartnoma PDF generatsiya
- [ ] Filial bo'yicha alohida balans hisobi
- [ ] Salary module test coverage
