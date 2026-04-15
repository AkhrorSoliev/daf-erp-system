# DaF ERP — Moliyaviy Tizim Texnik Hujjati

**Versiya:** 1.0  
**Sana:** 2026-04-14  
**Tizim:** DaF Sprachzentrum ERP  

---

## 1. Umumiy ko'rinish

Moliyaviy modul quyidagi jarayonlarni boshqaradi:
- O'quvchi to'lovlari (naqd va online)
- Ustoz oyliklari (hisoblash, tasdiqlash, to'lash)
- Markaz xarajatlari
- O'quvchi shartnomasi
- Pul qaytarish (refund)
- Moliyaviy hisobotlar

---

## 2. Ma'lumotlar bazasi arxitekturasi

### 2.1 Yangi Enumlar

| Enum | Qiymatlari | Ishlatilishi |
|------|-----------|--------------|
| `PaymentMethod` | CASH, PAYME, CLICK, UZUM, TRANSFER | To'lov usuli |
| `PaymentStatus` | PENDING, COMPLETED, FAILED, REFUNDED, CANCELLED | To'lov holati |
| `TransactionType` | PAYMENT, LESSON_DEDUCTION, REFUND, SALARY_ACCRUAL, SALARY_PAYMENT, EXPENSE, ADJUSTMENT, TAX | Tranzaksiya turi |
| `ContractStatus` | DRAFT, ACTIVE, COMPLETED, CANCELLED, REFUNDED | Shartnoma holati |
| `SalaryType` | PERCENTAGE, FIXED_PER_STUDENT | Oylik hisoblash turi |
| `SalaryPaymentStatus` | CALCULATED, APPROVED, PAID, CANCELLED | Oylik to'lov holati |
| `RefundStatus` | REQUESTED, APPROVED, PROCESSING, COMPLETED, REJECTED | Refund holati |
| `ExpenseCategory` | RENT, UTILITIES, SUPPLIES, MARKETING, OTHER | Xarajat kategoriyasi |

### 2.2 Yangi Modellar

#### Payment — To'lov yozuvi
Har bir pul qabul qilish hodisasi shu jadvalga yoziladi.

| Ustun | Turi | Tavsif |
|-------|------|--------|
| id | UUID | Asosiy kalit |
| studentId | Int | O'quvchi FK |
| contractId | UUID? | Shartnoma FK (ixtiyoriy) |
| amount | Int | Summa (so'mda) |
| method | PaymentMethod | Naqd/Payme/Click/Uzum/O'tkazma |
| status | PaymentStatus | Holat (default: COMPLETED) |
| externalId | String? | Payme/Click tranzaksiya ID |
| providerFee | Int? | Provider xizmat haqqi |
| receiptNumber | String? | Kvitansiya raqami |
| note | String? | Izoh |
| receivedById | Int? | Qabul qilgan xodim |
| branchId | Int? | Filial |
| companyId | Int | Kompaniya |

#### Transaction — Universal Ledger (Bosh Kitob)
Tizimdagi **har bir pul harakati** — kirim, chiqim, yechish, oylik — shu jadvalga yoziladi. Bu moliyaviy nazoratning asosi.

| Ustun | Turi | Tavsif |
|-------|------|--------|
| id | UUID | Asosiy kalit |
| type | TransactionType | Operatsiya turi |
| amount | Int | Summa (+kirim, -chiqim) |
| balanceBefore | Int | Operatsiyadan oldingi balans |
| balanceAfter | Int | Operatsiyadan keyingi balans |
| description | String? | Tavsif |
| studentId | Int? | O'quvchi (agar o'quvchi operatsiyasi) |
| teacherId | Int? | Ustoz (agar ustoz operatsiyasi) |
| paymentId | UUID? | Qaysi to'lovdan |
| attendanceId | UUID? | Qaysi davomatdan yechildi |
| salaryPaymentId | UUID? | Qaysi oylikdan |
| refundId | UUID? | Qaysi refunddan |
| enrollmentId | UUID? | Qaysi enrollment bilan bog'liq |
| performedById | Int? | Kim amalga oshirdi |
| branchId | Int? | Filial |
| companyId | Int | Kompaniya |

**Muhim:** Barcha balans o'zgarishlari `TransactionsService` orqali o'tadi — `SELECT FOR UPDATE` bilan atomik.

#### Contract — Shartnoma
O'quvchi bilan markaz orasidagi shartnoma.

| Ustun | Turi | Tavsif |
|-------|------|--------|
| id | UUID | Asosiy kalit |
| contractNumber | String (unique) | Auto-raqam: `DAF-2026-00001` |
| studentId | Int | O'quvchi FK |
| courseId | UUID | Kurs FK |
| groupId | UUID? | Guruh FK |
| branchId | Int | Filial |
| totalAmount | Int | Jami shartnoma summasi |
| paidAmount | Int | To'langan summa (real-time) |
| status | ContractStatus | DRAFT → ACTIVE → COMPLETED/CANCELLED |

#### TeacherSalaryConfig — Ustoz oylik sozlamalari
Har bir ustoz uchun oylik qanday hisoblanishini belgilaydi.

| Ustun | Turi | Tavsif |
|-------|------|--------|
| teacherId | Int | Ustoz FK |
| groupId | UUID? | null = barcha guruhlar uchun, set = faqat shu guruh uchun |
| salaryType | SalaryType | PERCENTAGE yoki FIXED_PER_STUDENT |
| value | Int | Foiz (masalan 40) yoki summa (masalan 100000) |

**Misol:** `salaryType=PERCENTAGE, value=40` → har darsda har o'quvchidan dars narxining 40% i ustozga yig'iladi.

#### SalaryAccrual — Darslik oylik yig'ilishi
Har darsda, har kelgan o'quvchi uchun ustozning oyligiga mikro-summa qo'shiladi.

| Ustun | Turi | Tavsif |
|-------|------|--------|
| teacherId | Int | Ustoz |
| studentId | Int | O'quvchi |
| groupId | UUID | Guruh |
| attendanceId | UUID | Davomat yozuvi |
| lessonDate | Date | Dars sanasi |
| amount | Int | Yig'ilgan summa |
| salaryPaymentId | UUID? | null = hali to'lanmagan, set = oylikka kiritilgan |

**Unique constraint:** `[teacherId, studentId, groupId, lessonDate]` — bir darsda bir o'quvchi uchun faqat bitta accrual.

#### SalaryPayment — Oylik to'lov
Oylik hisoblash natijasi va to'lov holati.

| Ustun | Turi | Tavsif |
|-------|------|--------|
| teacherId | Int | Ustoz |
| periodStart | DateTime | Hisoblash davri boshi |
| periodEnd | DateTime | Hisoblash davri oxiri (cutoff) |
| grossAmount | Int | Brutto summa |
| taxAmount | Int | Soliq |
| netAmount | Int | Netto (gross - tax) |
| status | SalaryPaymentStatus | CALCULATED → APPROVED → PAID |

#### Refund — Pul qaytarish
O'quvchiga pul qaytarish so'rovi va hisob-kitob.

#### Expense — Xarajatlar
Markaz xarajatlari (ijara, kommunal, ta'minot, marketing, boshqa).

### 2.3 Mavjud modellar o'zgarishlari

| Model | O'zgarish |
|-------|-----------|
| **Course** | `+ lessonPaymentCount Int @default(12)` — to'lov siklidagi darslar soni |
| **Student** | `+ payments[], transactions[], contracts[], refunds[]` relations |
| **User** | `+ teacherSalaryConfigs[], salaryPayments[], salaryAccruals[]` va boshqa relations |

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
└─────────────────┘    │  balance: 0→800k │
                       └──────────────────┘
        │
        ▼
  Guruhga yoziladi (enrollment)
        │
        ▼
┌──────────────────────────┐
│  Transaction              │
│  type: LESSON_DEDUCTION   │
│  -800,000 so'm            │  ← birinchi sikl bittada yechiladi
│  balance: 800k → 0        │
└──────────────────────────┘
        │
        ▼
  Dars 1...12: balans o'zgarmaydi
  Ustoz uchun SalaryAccrual yaratiladi
        │
        ▼
  Dars 13 (yangi sikl): yana -800,000 avtomatik
  Agar balans < 0 → QR davomat BLOKLANADI
```

### 3.2 Ustoz oyligi sikli

```
Oy davomida:
  Har darsda → SalaryAccrual yaratiladi
  (ustoz × o'quvchi × guruh × sana)

Oyning 7-si: CUTOFF (hisoblash to'xtaydi)
Oyning 8-si: Cron avtomatik hisoblaydi
  ├── Barcha unpaid accrual larni yig'adi
  ├── Har ustoz uchun SalaryPayment yaratadi
  │   ├── grossAmount = SUM(accruals)
  │   ├── taxAmount = 0 (hozircha)
  │   └── netAmount = gross - tax
  └── Status: CALCULATED

CEO tasdiqlaydi → APPROVED
CEO/BD to'laydi → PAID
  └── Transaction: SALARY_PAYMENT

8-sanadan keyingi accrual lar → KEYINGI OYGA
```

### 3.3 Refund hisoblash

```
Misol: Kurs 800,000 so'm / 12 dars, o'quvchi 5 darsga qatnashgan

1 dars narxi = 800,000 / 12 = 66,667 so'm
5 dars uchun = 66,667 × 5 = 333,333 so'm

Ushlab qolinadi:
├─ O'tilgan darslar: 333,333 so'm
├─ Soliqlar:         hozircha 0
└─ Bank xizmati:     hozircha 0

Qaytariladigan: 800,000 - 333,333 = 466,667 so'm
Muddat: 15 ish kuni

Qoidalar:
├─ Kurs boshlanmagan → 100%
├─ ≤ 50% o'tilgan → hisob-kitob
├─ > 50% o'tilgan → 0%
└─ Intizom buzilishi → 0%
```

### 3.4 Transaction jadvali — kelajak uchun kengaytirish

```
Transaction jadvalining kuchi:
├── Yangi entity? → polymorphic field qo'shing (investorId?, partnerId?)
├── Yangi operatsiya? → TransactionType enumga qo'shing
├── Yangi to'lov usuli? → PaymentMethod enumga qo'shing
├── Soliq hisobi? → type=TAX bilan alohida yozuv
└── Filial balansi? → branchId bo'yicha SUM()

Hisobot uchun oddiy query:
├── Jami tushum = SUM(amount) WHERE type=PAYMENT
├── Jami xarajat = SUM(amount) WHERE type IN (EXPENSE, SALARY_PAYMENT)
├── Sof foyda = tushum - xarajat
└── Filial bo'yicha = ... WHERE branchId=X
```

---

## 4. API Endpointlar (to'liq)

### 4.1 Payments — To'lovlar

| Method | Endpoint | Roles | Tavsif |
|--------|----------|-------|--------|
| `POST` | `/api/payments` | CEO, BD, Admin, Cashier | Naqd to'lov qayd qilish |
| `GET` | `/api/payments` | CEO, BD, Admin, Cashier | To'lovlar ro'yxati (paginated, filterable) |
| `GET` | `/api/payments/debtors` | CEO, BD, Admin, Cashier | Balansi minus o'quvchilar |
| `GET` | `/api/payments/pending-students` | CEO, BD, Admin, Cashier | To'lov kutilayotganlar |
| `GET` | `/api/payments/:id` | CEO, BD, Admin, Cashier | Bitta to'lov detali |
| `GET` | `/api/payments/student/:id` | CEO, BD, Admin, Cashier | O'quvchi to'lov tarixi |

### 4.2 Transactions — Tranzaksiyalar

| Method | Endpoint | Roles | Tavsif |
|--------|----------|-------|--------|
| `GET` | `/api/transactions` | CEO, BD | Barcha tranzaksiyalar |
| `GET` | `/api/transactions/student/:id` | CEO, BD, Admin, Cashier | O'quvchi balans tarixi |
| `GET` | `/api/transactions/teacher/:id` | CEO, BD | Ustoz tranzaksiyalari |
| `POST` | `/api/transactions/adjustment` | CEO, BD | Manual balans tuzatish |

### 4.3 Contracts — Shartnomalar

| Method | Endpoint | Roles | Tavsif |
|--------|----------|-------|--------|
| `POST` | `/api/contracts` | CEO, BD, Admin | Shartnoma yaratish |
| `GET` | `/api/contracts` | CEO, BD, Admin | Ro'yxat |
| `GET` | `/api/contracts/:id` | CEO, BD, Admin | Detal |
| `PATCH` | `/api/contracts/:id` | CEO, BD, Admin | Yangilash |
| `PATCH` | `/api/contracts/:id/status` | CEO, BD | Status o'zgartirish |
| `GET` | `/api/contracts/student/:id` | CEO, BD, Admin | O'quvchi shartnomalar |

### 4.4 Salary — Ustoz oyligi

| Method | Endpoint | Roles | Tavsif |
|--------|----------|-------|--------|
| `GET` | `/api/salary/config/:teacherId` | CEO, BD | Ustoz config |
| `POST` | `/api/salary/config` | CEO, BD | Config yaratish/yangilash |
| `POST` | `/api/salary/config/global` | CEO, BD | Barchaga joriy qilish |
| `PATCH` | `/api/salary/config/:id` | CEO, BD | Config tahrirlash |
| `GET` | `/api/salary/accruals/:teacherId` | CEO, BD | Yig'ilgan oylik detali |
| `GET` | `/api/salary/payments` | CEO, BD | Oylik to'lovlar ro'yxati |
| `POST` | `/api/salary/calculate` | CEO | Oylik hisoblash (trigger) |
| `PATCH` | `/api/salary/payments/:id/approve` | CEO | Tasdiqlash |
| `POST` | `/api/salary/payments/:id/pay` | CEO, BD | To'lash |
| `GET` | `/api/teachers/:id/salary-summary` | CEO, BD | Kutilayotgan vs haqiqiy oylik |

### 4.5 Refunds — Pul qaytarish

| Method | Endpoint | Roles | Tavsif |
|--------|----------|-------|--------|
| `POST` | `/api/refunds` | CEO, BD, Admin | Refund so'rash |
| `GET` | `/api/refunds` | CEO, BD | Ro'yxat |
| `PATCH` | `/api/refunds/:id/process` | CEO, BD | Tasdiqlash/rad etish/to'lash |

### 4.6 Expenses — Xarajatlar

| Method | Endpoint | Roles | Tavsif |
|--------|----------|-------|--------|
| `POST` | `/api/expenses` | CEO, BD, Admin | Xarajat qo'shish |
| `GET` | `/api/expenses` | CEO, BD, Admin | Ro'yxat |
| `PATCH` | `/api/expenses/:id` | CEO, BD | Tahrirlash |
| `DELETE` | `/api/expenses/:id` | CEO, BD | O'chirish (soft) |

### 4.7 Reports — Hisobotlar

| Method | Endpoint | Roles | Tavsif |
|--------|----------|-------|--------|
| `GET` | `/api/reports/financial-overview` | CEO, BD | Kutilayotgan vs haqiqiy tushum |

### 4.8 Student Portal

| Method | Endpoint | Roles | Tavsif |
|--------|----------|-------|--------|
| `GET` | `/api/student-portal/payments` | Student | O'z to'lov tarixi |

---

## 5. Frontend sahifalar

| Sahifa | Yo'l | Tavsif |
|--------|------|--------|
| Umumiy ma'lumotlar | `/payments/overview` | KPI kartalar, kutilayotgan vs haqiqiy tushum, to'lov usullari, oxirgi to'lovlar, "To'lov qayd qilish" tugma |
| Kutilyotgan to'lovlar | `/payments/pending` | Balansi 0 yoki minus bo'lgan faol o'quvchilar |
| Xarajatlar | `/payments/expenses` | Xarajatlar CRUD (kategoriya, summa, tavsif, sana) |
| Ish haqi | `/payments/salary` | Oylik hisoblash, tasdiqlash, to'lash (faqat CEO/BD) |
| Qarzdorlar | `/payments/debtors` | Balansi minus o'quvchilar ro'yxati |
| Shartnomalar | `/payments/contracts` | Shartnomalar CRUD |
| Student profil | "To'lovlar" tab | To'lov tarixi + balans tarixi (tranzaksiyalar) |
| Teacher profil | "Ish haqi" tab | Kutilayotgan vs haqiqiy oylik, guruhlar bo'yicha breakdown |
| Student Portal | `/portal/payments` | Balans ko'rish + tranzaksiya tarixi |

---

## 6. Xavfsizlik

### 6.1 Race Condition himoyasi
Barcha balans operatsiyalari `TransactionsService` orqali o'tadi.
Har bir metod `prisma.$transaction` ichida `SELECT ... FOR UPDATE` ishlatadi.
`isolationLevel: Serializable` belgilangan.

### 6.2 Role-Based Access
Barcha endpoint larda `@Roles()` decorator va `RolesGuard` mavjud.
Moliyaviy ma'lumotlar faqat CEO (1) va Branch Director (2) ga ko'rinadi.
Kassir (5) faqat to'lov qayd qilish va ko'rish huquqiga ega.

### 6.3 Multi-Tenant
Barcha modellar `companyId` filter bilan ishlaydi.
Query larda `companyId` JWT tokendan olinadi.

---

## 7. Cron Jobs

| Cron | Vaqt | Tavsif |
|------|------|--------|
| Oylik hisoblash | `0 2 8 * *` (8-sana, 02:00 Toshkent) | Barcha ustozlar oyligi avtomatik hisoblanadi |

Cutoff: 7-sanagacha bo'lgan accrual lar joriy oyga kiritiladi.
8-sanadan keyingi accrual lar keyingi oyga o'tadi.

---

## 8. Kelajak rejalari

- [ ] Payme integratsiya (Merchant API)
- [ ] Click integratsiya
- [ ] Uzum integratsiya
- [ ] Soliq konfiguratsiyasi (tax rate per teacher)
- [ ] Check/kvitansiya chiqarish tizimi
- [ ] Shartnoma PDF generatsiya
- [ ] Filial bo'yicha alohida balans hisobi
