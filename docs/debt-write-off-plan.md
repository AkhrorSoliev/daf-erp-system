# Yo'qolgan o'quvchi qarzini hisobdan chiqarish — reja

> Holat: **Tasdiqlangan, amalga oshirish kutilmoqda** · Reja sanasi: 2026-05-26
> Bu hujjat — "joriy siklda umuman kelmagan o'quvchining qarzini hisobdan chiqarish"
> funksiyasini amalga oshirish bo'yicha asosiy reja.

## 1. Kontekst

Hozirgi muammo:
- "Yo'qolgan" o'quvchilar (guruhga qo'shilgan, lekin biror marta ham kelmagan) kupincha minus balans
  bilan tizimda qoladi. Sabab: ABSENT belgilangan, lekin sababli (EXCUSED) emas.
- Bu qarzlar **statistikada qarzdor sifatida ko'rinadi**, bu esa noto'g'ri — chunki o'quvchi
  na xizmat olgan, na pul to'lashga qaytadi.
- `removeFromGroup` faqat `prepaidLessonsRemaining` ni balansga qaytaradi
  ([enrollment-billing.service.ts:74-129](../server/src/billing/enrollment-billing.service.ts#L74-L129)),
  qarz esa qoldiriladi.
- Hozir `POST /transactions/adjustment` orqali qo'lda hisobdan chiqarsa bo'ladi, lekin bu
  texnik yo'l — adminlar uchun emas. Bunday holatlar **ko'p**, har birini API orqali qilish realistik emas.

Asosiy biznes qoidasi: agar o'quvchi **joriy sikl**da bir martagina kelmagan bo'lsa, **shu sikldan
yig'ilgan qarz** hisobdan chiqarilishi mumkin. Avvalgi sikllar qarzi (xizmat olgan, to'lamagan) — qoladi.

## 2. Tasdiqlangan qarorlar

1. **Sikl ta'rifi**: `Course.lessonPaymentCount` (default 12) — bitta to'lov sikli shuncha darsdan iborat.
   Sikl 1 = enrolldagi birinchi N dars, Sikl 2 = keyingi N dars, va h.k.
   Joriy sikl = oxirgi yozilgan davomat tushgan sikl.
2. **Hisobdan chiqarish sharti** (uchchasi ham bajariladi):
   - `Student.balance < 0` (qarz mavjud)
   - Joriy siklda PRESENT/LATE davomat soni = **0**
   - Joriy siklda ABSENT davomatlar mavjud (ya'ni qarz aynan shu sikldan kelyapti)
3. **Hisobdan chiqarish summasi**:
   `writeOff = min(currentCycleAbsentCount × perLessonCost, |balance|)`
   — joriy sikl ABSENT lariga teng nazariy qarz, lekin haqiqiy balansdan ko'p emas.
4. **Ruxsat**: CEO, Branch Director, Administrator (Cashier va Teacher YO'Q).
5. **Yangi `TransactionType`**: `DEBT_WRITE_OFF` (oddiy `ADJUSTMENT` dan ajratish uchun).
6. **Ikkita kirish nuqtasi**:
   - **a)** "Guruhdan chiqarish" modali ichida — ACTIVE enrollment uchun (shartlar bajarilganda
     maxsus blok paydo bo'ladi).
   - **b)** O'quvchi profilida — allaqachon DROPPED bo'lgan o'quvchilar uchun alohida tugma.
7. **Avtomatik tekshirish**: tugma/checkbox **faqat shartlar bajarilsa** ko'rinadi. Admin
   "noto'g'ri kechirib yubora olmaydi" — chunki tugma ko'rinmaydi.
8. **Oylik limit yo'q** (hozircha). Audit jurnali va CEO ga KPI ko'rsatuvi orqali nazorat qilinadi.
9. **Cashier hozircha bu funksiyadan butunlay chetda** — bu rol moliyaviy adjustmentlarni qila olmaydi.

## 3. Ma'lumotlar modeli o'zgarishlari

### 3.1. Yangi enum qiymati

```prisma
enum TransactionType {
  // ... mavjud qiymatlar ...
  DEBT_WRITE_OFF   // YANGI: "yo'qolgan o'quvchi qarzini hisobdan chiqarish"
}
```

### 3.2. Migratsiya

- `prisma db diff` orqali SQL generatsiya qilinadi (bizda `prisma migrate dev` buzuq — memory).
- `psql` orqali to'g'ridan-to'g'ri qo'llaniladi:
  ```sql
  ALTER TYPE "TransactionType" ADD VALUE 'DEBT_WRITE_OFF';
  ```
- `prisma migrate resolve --applied` bilan tarixga yozish.

### 3.3. `Transaction.metadata` ichida saqlanadigan ma'lumot

`DEBT_WRITE_OFF` turidagi tranzaksiya `metadata` JSON ichida quyidagi maydonlarni saqlaydi:

```json
{
  "reason": "Yo'qolgan o'quvchi — joriy siklda biror dars qatnashmagan",
  "enrollmentId": 12345,
  "groupId": 67,
  "cycleNumber": 2,
  "cycleAbsentCount": 9,
  "perLessonCost": 50000,
  "theoreticalCycleDebt": 450000,
  "actualWriteOff": 450000,
  "previousBalance": -800000,
  "newBalance": -350000,
  "adminNote": "..."
}
```

Bu — audit uchun. Sudga (ehtimol kelajakda) yoki revisya uchun har bir hisobdan chiqarishni qayta tiklash mumkin.

## 4. Backend o'zgarishlari

### 4.1. Yangi servis: `DebtWriteOffService`

Joyi: `server/src/billing/debt-write-off.service.ts`

#### Asosiy metodlar

**`computeEligibility(enrollmentId)`** — har bir kirish nuqtasi avval shu metodni chaqiradi:

```typescript
interface DebtWriteOffEligibility {
  eligible: boolean;
  reason?: 'NO_DEBT' | 'STUDENT_ATTENDED' | 'NO_ABSENT_IN_CYCLE' | 'NO_ATTENDANCE_RECORDS';
  details: {
    studentId: number;
    currentBalance: number;
    cycleNumber: number;
    cycleStartIndex: number;       // 1-based, joriy sikldagi 1-darsning umumiy raqami
    cyclePresentCount: number;
    cycleLateCount: number;
    cycleAbsentCount: number;
    cycleExcusedCount: number;
    perLessonCost: number;
    theoreticalCycleDebt: number;
    suggestedWriteOff: number;     // min(theoreticalCycleDebt, |balance|)
  };
}
```

**`executeWriteOff(enrollmentId, userId, dto)`** — to'liq atomik:

```typescript
// dto: { reason: string, confirmAmount: number }
// `Serializable` $transaction ichida:
// 1. computeEligibility() qayta tekshiriladi (race-condition himoyasi)
// 2. confirmAmount === suggestedWriteOff ekanligi tekshiriladi
// 3. Student.balance ni `+confirmAmount` ga yangilanadi (minus tomonga yaqinlashadi)
// 4. Transaction yoziladi: type=DEBT_WRITE_OFF, amount=+confirmAmount, balanceBefore/After
// 5. EntityHistoryService.recordUpdate() chaqiriladi (Student)
// 6. Yangilangan Student qaytariladi
```

#### Sikl hisoblash algoritmi (`computeCurrentCycle`)

```typescript
private async computeCurrentCycle(enrollment): Promise<{
  cycleNumber: number;
  cycleStartIndex: number;
  attendances: Attendance[];  // joriy sikldagi davomatlar (status bo'yicha ajratilmagan)
}> {
  const N = enrollment.group.course.lessonPaymentCount ?? 12;

  // Bu (studentId, groupId) uchun barcha davomatlar
  // EXCUSED dan tashqari (EXCUSED sikl ichidagi kunlar — lekin "lesson" sifatida sanaladi)
  // QAROR: EXCUSED ham sikl progressini ilgari suradi (ABSENT bilan birga)
  // Lekin write-off uchun faqat ABSENT count olinadi.
  const records = await prisma.attendance.findMany({
    where: {
      studentId: enrollment.studentId,
      groupId: enrollment.groupId,
      // EXCUSED kiritamiz — chunki lesson o'tgan, faqat sababli kelmagan
    },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
  });

  if (records.length === 0) {
    return { cycleNumber: 1, cycleStartIndex: 1, attendances: [] };
  }

  const cycleNumber = Math.ceil(records.length / N);
  const cycleStartIndex = (cycleNumber - 1) * N + 1;
  const attendances = records.slice(cycleStartIndex - 1);

  return { cycleNumber, cycleStartIndex, attendances };
}
```

> **Eslatma**: sikl tahlilida `LessonCancellation` (cancelled lessons) bilan bog'liq davomatlar hisobga olinmaydi
> (chunki `LessonCancellation` o'sha sanadagi davomatni `EXCUSED` ga aylantiradi). Bu sikl progressini
> sun'iy ilgariga "siljitishi" mumkin. Sabab: bekor qilingan dars "talaba kelmaganini" ko'rsatmaydi.
> Ehtimol `cancellationId IS NOT NULL` bo'lgan EXCUSED larni siklga sanamaslik kerak — bu hisoblashda nuqta sifatida qayd etiladi.

#### `perLessonCost` aniqlash

```typescript
private async computePerLessonCost(enrollment): Promise<number> {
  // 1. Avvalo: oxirgi reversedAt=null LESSON_DEDUCTION.metadata.perLessonCost
  const lastDeduction = await prisma.transaction.findFirst({
    where: {
      type: 'LESSON_DEDUCTION',
      reversedAt: null,
      // enrollmentId yoki studentId + relatedGroupId orqali bog'lash
    },
    orderBy: { createdAt: 'desc' },
  });
  const fromMetadata = lastDeduction?.metadata?.perLessonCost;
  if (fromMetadata) return fromMetadata;

  // 2. Aks holda: kurs narxidan hisoblanadi
  return Math.round(enrollment.group.course.price / (enrollment.group.course.lessonPaymentCount ?? 12));
}
```

Bu — mavjud `enrollment-billing.service.ts:38-65` ichidagi `computePerLessonCost` metodiga mos.
Imkon bo'lsa, mavjud helper qayta ishlatiladi (DRY).

### 4.2. Yangi endpointlar

#### A. ACTIVE enrollment — `removeFromGroup` ni kengaytirish

Mavjud endpoint: `DELETE /students/:id/enroll/:enrollmentId` (controller: [students.controller.ts:139-156](../server/src/students/students.controller.ts#L139-L156))

DTO ni kengaytiramiz:

```typescript
// server/src/students/dto/remove-from-group.dto.ts
export class RemoveFromGroupDto {
  // ... mavjud maydonlar (reason, reasonText, etc.) ...

  // YANGI maydonlar:
  @IsOptional()
  @IsBoolean()
  writeOffCycleDebt?: boolean;     // ON bo'lsa, hisobdan chiqarish bajariladi

  @ValidateIf((o) => o.writeOffCycleDebt === true)
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  writeOffReason?: string;          // izoh majburiy
}
```

`StudentEnrollmentService.removeFromGroup()` ichida (
[student-enrollment.service.ts:382-386](../server/src/students/student-enrollment.service.ts#L382-L386)):

```typescript
await prisma.$transaction(async (tx) => {
  // ... mavjud: refundPrepaidToBalance ...

  if (dto.writeOffCycleDebt) {
    const eligibility = await debtWriteOffService.computeEligibility(enrollmentId, tx);
    if (!eligibility.eligible) {
      throw new BadRequestException(
        `Joriy siklda yo'qolgan o'quvchi sharti bajarilmadi: ${eligibility.reason}`,
      );
    }
    await debtWriteOffService.executeWriteOff(
      enrollmentId,
      userId,
      { reason: dto.writeOffReason!, confirmAmount: eligibility.details.suggestedWriteOff },
      tx,
    );
  }

  // ... mavjud: enrollment DROPPED ...
}, { isolationLevel: 'Serializable', maxWait: 10000, timeout: 15000 });
```

Eligibility avval frontend tomonidan ko'rsatish uchun, keyin server tomonidan qayta tekshirish uchun chaqiriladi.

#### B. ACTIVE enrollment — eligibility check endpoint (modalda ko'rsatish uchun)

```
GET /students/:studentId/enrollments/:enrollmentId/debt-write-off-eligibility
Roles: CEO, Branch Director, Administrator
Returns: DebtWriteOffEligibility (yuqoridagi shape)
```

Bu — frontend modal ochilganda chaqiriladi, blokni ko'rsatish/yashirish uchun.

#### C. DROPPED enrollment — mustaqil endpoint

```
POST /students/:studentId/enrollments/:enrollmentId/write-off-cycle-debt
Body: { reason: string, confirmAmount: number }
Roles: CEO, Branch Director, Administrator
```

Bu endpoint:
- Faqat status DROPPED yoki FROZEN bo'lgan enrollment uchun ishlaydi
- ACTIVE bo'lsa — 400, "ACTIVE bo'lgan enrollmentni 'Guruhdan chiqarish' modali orqali bajaring"
- `DebtWriteOffService.executeWriteOff()` chaqiriladi
- `enrollment.status` o'zgarmaydi (allaqachon DROPPED)

#### D. Eligibility — DROPPED enrollment uchun

```
GET /students/:studentId/enrollments/:enrollmentId/debt-write-off-eligibility
```

Bu endpoint A va C uchun bir xil — enrollment statusi bilan farqlanmaydi.

### 4.3. Audit jurnali endpointlari (yangi sahifa uchun)

```
GET /transactions/debt-write-offs?branchId=&from=&to=&page=&pageSize=
Roles: CEO, Branch Director
Filter: type=DEBT_WRITE_OFF, reversedAt=null
Returns: paginated list with related student + performer info
```

Branch Director — faqat o'z filiali. CEO — kompaniya bo'yicha.

### 4.4. KPI

Dashboard yoki moliyaviy hisobotda:

```
GET /reports/debt-write-offs-summary?branchId=&from=&to=
Returns: { totalAmount, count, byBranch?, byPerformer? }
```

`reports-financial.service.ts` ichiga qo'shiladi. CEO ko'radi, BD o'z filialida.

## 5. Frontend o'zgarishlari

### 5.1. "Guruhdan chiqarish" modali

Fayl: [student-remove-from-group-dialog.tsx](../client/src/components/students/student-remove-from-group-dialog.tsx)

#### Mavjud holat
Hozir: sabab dropdown + textarea + Confirm tugmasi.

#### Yangi qo'shimcha

Modal ochilganda eligibility tekshiriladi:

```tsx
const { data: eligibility } = useQuery({
  queryKey: ['debt-write-off-eligibility', studentId, enrollmentId],
  queryFn: () => api.getDebtWriteOffEligibility(studentId, enrollmentId),
  enabled: open,  // modal ochiq bo'lsa
});
```

Eligibility bajarilsa, modal ichida quyidagi blok ko'rinadi (sabab tanlangandan keyin):

```
┌─ ⚠️ Joriy siklda yo'qolgan o'quvchi ────────────┐
│                                                   │
│ Sikl tahlili (Sikl #2, 12 darslik):              │
│   • Qatnashgan (PRESENT/LATE):  0 dars            │
│   • Kelmagan (ABSENT):          9 dars            │
│   • Sababli (EXCUSED):          0 dars            │
│   • Joriy balans:               -450 000 so'm     │
│                                                   │
│ Hisobdan chiqariladigan summa:  450 000 so'm     │
│ (9 dars × 50 000 so'm = 450 000 so'm)            │
│                                                   │
│ ☐ Joriy sikl qarzini hisobdan chiqarish          │
│                                                   │
│ Izoh (majburiy):                                  │
│ ┌─────────────────────────────────────────────┐  │
│ │                                              │  │
│ └─────────────────────────────────────────────┘  │
│                                                   │
└───────────────────────────────────────────────────┘
```

Eligibility bajarilmasa — blok umuman ko'rinmaydi.

Confirm tugmasi bosilganda DTO da `writeOffCycleDebt: true, writeOffReason: "..."`
yuboriladi.

### 5.2. Profil sahifasi — DROPPED uchun yangi tugma

Fayl: `client/src/components/students/student-profile-card.tsx` (yoki yaqin)

Logika:
- Har bir enrollment uchun (DROPPED yoki FROZEN, balansda qarz bo'lsa) — eligibility chaqiriladi
- Eligibility bajarilsa — qaytarilgan enrollment ro'yxati ichida **"Qarzni hisobdan chiqarish"** tugmasi ko'rinadi
- Tugma bosilganda — alohida modal ochiladi (xuddi shu blok kabi)
- Tasdiqlanganda — `POST /students/:sid/enrollments/:eid/write-off-cycle-debt` chaqiriladi

Bu joyni qayerga qo'yish optimal:
- "Profilning Guruhlar" tabidagi har bir DROPPED qatorda — eng yaxshi joy
- Yoki o'quvchining bosh kartasida "Amal qilish" menyusi ostida

### 5.3. Audit jurnali sahifasi

Yangi sahifa: `client/src/app/(admin)/finance/debt-write-offs/page.tsx`

Mavjud "Tranzaksiyalar" sahifasi shabloniga asoslangan. Filter: sana oralig'i, branch (CEO), admin
(performer). Har bir qatorda: o'quvchi (link), summa, sabab, kim, qachon.

Yon menyu: "Moliya" bo'limining "Tranzaksiyalar" osti — yoki alohida "Hisobdan chiqarishlar" qatori.

### 5.4. KPI

Dashboard sahifasiga yoki moliyaviy hisobotga yangi karta:

```
"Bu oyda hisobdan chiqarilgan qarz"
  → 12,500,000 so'm
  → 23 ta operatsiya
  → [Batafsil →]
```

CEO va BD ko'radi.

## 6. RBAC sinov ro'yxati

| Endpoint | CEO | BD | Admin | Cashier | Teacher |
|---|:---:|:--:|:-----:|:-------:|:-------:|
| `GET /...eligibility` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `DELETE /students/:id/enroll/:eid` (with `writeOffCycleDebt=true`) | ✅ | ✅ | ✅ | ❌ | ❌ |
| `POST /...write-off-cycle-debt` (DROPPED) | ✅ | ✅ | ✅ | ❌ | ❌ |
| `GET /transactions/debt-write-offs` | ✅ | ✅ (o'z filial) | ❌ | ❌ | ❌ |
| `GET /reports/debt-write-offs-summary` | ✅ | ✅ (o'z filial) | ❌ | ❌ | ❌ |

BD scope: `WHERE branchId IN <user.branchIds>` xizmat darajasida qo'llanadi
([CLAUDE.md] dagi pattern bo'yicha).

## 7. Audit & EntityHistory

- Har bir `DEBT_WRITE_OFF` Transaction o'zi audit izi (append-only ledger printsipiga muvofiq)
- Qo'shimcha ravishda **Student** entity history ga `recordUpdate()` yoziladi:
  - oldStudent: `{ balance: -800000 }`
  - newStudent: `{ balance: -350000 }`
  - changedById: write-off bajargan admin
- **Group** entity history ga ham `recordUpdate()` yoziladi (Cross-entity history mandatory rule):
  - `QARZ_HISOBDAN_CHIQARILDI` event (yangi action type — agar mavjud bo'lmasa, qo'shiladi)
  - relatedEntityId: studentId

## 8. Reversibility (qayta tiklash)

Append-only ledger qoidasiga muvofiq:
- `DEBT_WRITE_OFF` ham `reverseTransaction()` orqali bekor qilinishi mumkin
- Faqat CEO ruxsati (`POST /transactions/:id/reverse` mavjud, lekin hozir bu type uchun
  aniq cheklov yo'q — CEO-only ekanligini tekshirish kerak)
- Bekor qilinganda: inverse Transaction yoziladi, `reversedAt` o'rnatiladi, `Student.balance` qaytariladi

Frontendda audit jurnali sahifasida har bir qatorda CEO uchun "Bekor qilish" tugmasi.

## 9. Migratsiya va eski ma'lumotlar

- Yangi `DEBT_WRITE_OFF` enum qiymati qo'shilishi — non-breaking (mavjud rowlarga ta'sir qilmaydi).
- Eski DROPPED qarzdorlar — adminlar profil sahifasi orqali har birini ko'rib chiqib hisobdan chiqaradilar
  (ommaviy script YO'Q — qaror tasdiqlangan).
- Backfill script kerak emas.

## 10. Test rejasi

CLAUDE.md ga muvofiq, **testlar majburiy**.

### 10.1. Backend unit testlar

| Test fayl | Tekshirilayotgan |
|---|---|
| `debt-write-off.service.spec.ts` | Eligibility hisoblash (5+ stsenariy: kelmagan/qatnashgan/EXCUSED only/oldingi sikl/joriy sikl), perLessonCost manbai, summa hisoblash |
| `debt-write-off.service.spec.ts` | executeWriteOff atomic, race-condition (eligibility tekshirish ichida), balans yangilanishi, EntityHistory record |
| `student-enrollment.service.spec.ts` | `removeFromGroup` kengaytmasi — write-off + DROPPED birgalikda atomik |

### 10.2. Backend controller guard testlari (majburiy)

| Test fayl | Tekshirilayotgan |
|---|---|
| `students.controller.spec.ts` | Yangi DTO maydonlari, role guard CEO/BD/Admin allow, Cashier/Teacher deny |
| `transactions.controller.spec.ts` | `debt-write-offs` endpoint role guard |
| `reports.controller.spec.ts` | `debt-write-offs-summary` endpoint role guard |

### 10.3. Integration test stsenariylar

1. Yo'qolgan o'quvchi (12 ABSENT) → chiqarish modali → checkbox + izoh → balans 0 ga keladi, status DROPPED
2. 6 PRESENT + 6 ABSENT (Sikl 1) → blok ko'rinmaydi (qatnashgan)
3. Sikl 1 to'liq qatnashgan, Sikl 2 da 5 ABSENT → blok ko'rinadi, faqat Sikl 2 qarzi hisoblanadi
4. Allaqachon DROPPED, qarz qolgan → profil tugmasi → modal → write-off, balans yangilanadi
5. Cashier roli → 403 Forbidden
6. BD boshqa filialdagi o'quvchini hisobdan chiqarmoqchi → 403 Forbidden
7. CEO `DEBT_WRITE_OFF` ni reverse qiladi → balans qarzga qaytadi, jurnalda ko'rinadi

## 11. Amalga oshirish bosqichlari

### Faza 1 — Backend skeleti (kunlar: 1-2)
- Schema migratsiya (enum qo'shish)
- `DebtWriteOffService` (computeEligibility + computeCurrentCycle + computePerLessonCost)
- Unit testlar (eligibility yolg'iz)

### Faza 2 — Backend integratsiya (kunlar: 2-3)
- `removeFromGroup` ga writeOff qo'shish
- DROPPED uchun mustaqil endpoint
- Eligibility endpoint
- Audit jurnali endpoint
- Barcha controller guard testlar

### Faza 3 — Frontend chiqarish modali (kunlar: 1-2)
- Eligibility query
- Modal ichidagi yangi blok (qatnashish tahlili + checkbox + izoh)
- Confirm flow

### Faza 4 — Frontend profil tugmasi (kun: 1)
- DROPPED enrollment qatoriga tugma
- Alohida write-off modali

### Faza 5 — Audit jurnali sahifasi (kun: 1)
- Yangi sahifa va sidebar link
- Filterlar (sana, filial, performer)
- CEO uchun reverse tugmasi

### Faza 6 — KPI va hisobotlar (kun: 1)
- Dashboard yoki Moliyaviy hisobotda yangi karta

### Faza 7 — QA va deploy (kun: 1)
- To'liq integration testlar
- Manual QA: 3 ta stsenariy (kelmagan, qatnashgan, allaqachon DROPPED)
- Staging deploy, production deploy

Jami: ~7-10 ish kuni.

## 12. Ochiq qarorlar va xavflar

### Qaror talab qiladigan masalalar

1. **EXCUSED sikl progressini ilgariga olib boradimi?**
   Hozirgi taklif: **HA** (lesson o'tgan, faqat sababli kelmagan). Bu — admin va o'qituvchining
   tasdig'ini talab qilishi mumkin.
   Muqobil: yo'q — sikl faqat **bilingual** (PRESENT/LATE/ABSENT) davomatlardan iborat.

2. **`LessonCancellation` orqali EXCUSED qilingan davomatlar sikl progressiga sanaydimi?**
   Taklif: **YO'Q** — bekor qilingan dars o'tmagan, ham o'quvchi, ham o'qituvchi aybdor emas.
   Texnik: `attendance.cancellationId IS NULL` filtri qo'shiladi.

3. **Sikl 1 hali tugamagan bo'lsa nima qilamiz?**
   Misol: o'quvchi 4 ta ABSENT bilan yo'qolgan, jami 4 ta davomat. Cycle 1 da 4/12 dars.
   Taklif: **bajariladi** — joriy sikl 4 dars, hammasi ABSENT, write-off = 4 × perLessonCost.
   Ya'ni sikl to'liq bo'lishi shart emas.

4. **`DEBT_WRITE_OFF` ni reverse qila olishi — faqat CEO?**
   Hozirgi `POST /transactions/:id/reverse` ruxsatlari tekshirilishi kerak.

5. **`Group` entity history ga yangi action `QARZ_HISOBDAN_CHIQARILDI` qo'shilishi**
   Mavjud action tiplari ro'yxatiga qarab tasdiqlanadi.

### Texnik xavflar

- **Sikl chegarasi noaniqligi**: agar `Course.lessonPaymentCount` o'quvchining enroll vaqtida o'zgargan bo'lsa,
  eski darslar hisoblashda nomuvofiqlik tug'dirishi mumkin. Hozircha "joriy qiymatga ishonamiz" — agar
  muammo paydo bo'lsa, `EnrollmentStateLog` orqali enrolling vaqtdagi qiymat aniqlanadi.
- **Race condition**: bir vaqtda ikki admin write-off bosishi mumkin. `Serializable` tx va
  `computeEligibility` ni tx ichida qayta tekshirish bilan himoyalangan.
- **`perLessonCost` o'zgarishi**: kurs narxi tushgan bo'lsa, eski `LESSON_DEDUCTION.metadata` dan olinadi.
  Metadata bo'lmasa — fallback joriy narxga (kichik xato bo'lishi mumkin, lekin maqbul).

## 13. Linklar

- Asosiy mavzu: [Yo'qolgan o'quvchi qarzini hisobdan chiqarish konferensiya yozishi]
- Tegishli memory: `project_departed_students_semantics.md`
- Tegishli memory: `project_dashboard_prognoz_semantics.md`
- Asosiy fayllar:
  - [server/prisma/schema.prisma](../server/prisma/schema.prisma) — TransactionType enum (179-193)
  - [server/src/billing/enrollment-billing.service.ts](../server/src/billing/enrollment-billing.service.ts)
  - [server/src/billing/lesson-billing.service.ts](../server/src/billing/lesson-billing.service.ts)
  - [server/src/students/student-enrollment.service.ts](../server/src/students/student-enrollment.service.ts)
  - [server/src/transactions/transactions.controller.ts](../server/src/transactions/transactions.controller.ts)
  - [client/src/components/students/student-remove-from-group-dialog.tsx](../client/src/components/students/student-remove-from-group-dialog.tsx)
