# Admin Clarity Plan — Adminlar uchun tushunarsizliklarni bartaraf etish

**Tasdiqlangan:** 2026-05-29
**Maqsad:** ERP'da admin tomonida 3 ta tushunarsiz vaziyatni hal qilish.

---

## 3 ta muammo

### 🔴 Muammo 1 — "Pul qaysi darslar uchun yechildi?" ko'rinmaydi
Admin `−287 500 so'm` deduction ko'radi, lekin qaysi darslarni qoplagani, qisman yoki to'liqligi tushunarsiz.

### 🟡 Muammo 2 — "O'chirish" vs "Status o'zgartirish" farqi noaniq
Adminlar qaysi tugmani bosishni bilmaydi. Semantik chalkashlik.

### 🟢 Muammo 3 — Sikl o'rtasida qo'shilgan o'quvchi to'lovi
Hozirgi tizim: har o'quvchi o'zining shaxsiy 12 darslik prepaid'ini sotib oladi (guruh siklidan mustaqil). Lekin admin guruhga qarab boshqacha o'ylaydi.

---

## YECHIM — bajariladigan tartib

```
1️⃣  Muammo 2 (1 kun)   — eng tez, UI matnlari
2️⃣  Muammo 1 (3-4 kun) — metadata + UI ko'rinish
3️⃣  Muammo 3 (1 hafta) — qisman to'lov sehrgari
```

---

## Muammo 2 — Yechim (1 kun)

### 2.1 Hujjat: status vs delete (biznes qoidasi)

| Vaziyat | Qaysi tugma |
|---|---|
| O'quvchi qaytib kelmaydi | Status → **Chetlatildi** (EXPELLED) |
| O'quvchi vaqtincha to'xtadi | Status → **Muzlatildi** (FROZEN) |
| Faqat bitta guruhdan ketdi | **Guruhdan chiqarish** |
| Ro'yxatdan butunlay olib tashlash | **O'chirish** (arxiv) |

### 2.2 "Guruhdan chiqarish" sabablari (dropdown)
- 📚 O'qishni tashladi (`DROPPED_OUT`)
- 🔄 Boshqa guruhga ko'chdi (`MOVED_TO_GROUP`)
- 🏢 Filial almashdi (`CHANGED_BRANCH`)
- ✅ Kursni tugatdi (`COMPLETED_COURSE`)
- ❓ Boshqa sabab — matn maydoni (`OTHER`)

**Backend:**
- `Enrollment` model'iga `removalReason` (enum) va `removalNote` (string?) maydonlari qo'shiladi
- `EnrollmentRemovalReason` enum: `DROPPED_OUT | MOVED_TO_GROUP | CHANGED_BRANCH | COMPLETED_COURSE | OTHER`
- `RemoveFromGroupDto` ga `reason` (mandatory) va `note` (optional, OTHER bo'lganda mandatory) qo'shiladi
- `EnrollmentBillingService.removeFromGroup()` ga `reason` o'tkaziladi
- EntityHistory'da sabab ko'rsatiladi

**Frontend:**
- "Guruhdan chiqarish" dialog'ida dropdown qo'shiladi
- OTHER tanlanganda matn maydoni majburiy bo'ladi
- Talaba profilidagi enrollment tarixida sabab ko'rinadi

### 2.3 "O'chirish" tugmasiga aniq ogohlantirish
```
⚠️ Bu o'quvchini ARXIVGA yuboradi:
  • U barcha ro'yxatlardan yo'qoladi (faqat CEO arxivdan ko'radi)
  • Barcha aktiv guruhlardan chiqariladi
  • Oldindan to'langan pul balansga qaytariladi
  • Keyinroq qaytarib tiklash mumkin

Agar o'quvchi shunchaki bitta guruhdan ketsa,
"Guruhdan chiqarish" tugmasidan foydalaning.

Agar o'quvchi o'qishni to'xtatgan bo'lsa,
status'ni "Chetlatildi" ga o'zgartiring.
```

### 2.4 "Faol o'quvchini arxivlash" ekstra confirm
Status `ACTIVE` + so'nggi 30 kun ichida davomat olinayotgan talaba uchun "O'chirish" bosilsa ekstra ogohlantirish.

### 2.5 Status dropdown'iga izoh
Har status tanlovi tagiga 1 qator izoh.

---

## Muammo 1 — Yechim (3-4 kun)

### 1.1 LESSON_DEDUCTION metadata kengaytmasi
`LessonBillingService.bill()` ichida har bir deduction'ga qo'shimcha metadata:
```ts
metadata: {
  perLessonCost,                  // (mavjud)
  lessonsCovered: N,              // YANGI
  isPartialCycle: boolean,        // YANGI
  cycleSequenceNumber: 1|2|3,     // YANGI
  triggerAttendanceId: uuid,      // YANGI
  triggerLessonDate: 'YYYY-MM-DD',// YANGI
}
```

### 1.2 Yangi endpoint: `GET /transactions/deductions/:id/coverage`
Bitta deduction qaysi darslarni qoplaganini qaytaradi:
```json
{
  "deduction": { id, amount, lessonsCovered, isPartialCycle, cycleSequenceNumber },
  "coveredLessons": [
    { attendanceId, date, status, lessonNumberInCycle: 1 },
    ...
  ],
  "firstLessonDate": "2026-05-05",
  "lastLessonDate": "2026-05-13"
}
```

### 1.3 Frontend: kengaytirilgan kartochka
Student profilining "Darslar" tabidagi har bir LESSON_DEDUCTION qatorida:
- `−287 500 so'm · Sikl 1 · 8 dars · QISMAN`
- Ochilganda: qoplagan darslar ro'yxati + sana intervali
- Progress bar: `Sikl 1: 8/20 dars to'langan`

---

## Muammo 3 — Yechim (1 hafta)

### 3.1 "Guruh sikli" virtual overview endpoint
`GET /groups/:id/cycle-overview`:
- Hozirgacha bo'lib o'tgan darslar soni
- Hozirgi sikl raqami va pozitsiyasi (`2/12`)
- Qolgan darslar soni
- Har talabaning shaxsiy prepaid holati

### 3.2 To'lov oynasida real-time hisob (eng muhim)
Admin summa kiritayotganda darhol hisoblanadi:
```
Sikl 1: 10 dars qoldi (345 000 so'm tavsiya)

Summa: [500 000] so'm

  ✅ Bu pul nimaga yetadi:
  • Sikl 1 ning qolgan 10 darsi  (345 000)
  • Sikl 2 dan 4 dars             (138 000)
  • Balansda qoladi               (17 000)
```

### 3.3 Tez tanlash tugmalari
```
Tavsiya:  [Qolgan N dars — X so'm]
Yana:     [+1 sikl — Y so'm]  [+2 sikl — Z so'm]
```

### 3.4 Chegirma maydoni (ixtiyoriy)
Alohida `discount` maydoni — to'lovga emas, ko'rsatma sifatida saqlanadi.

### 3.5 To'lov chekining tushunarli ko'rinishi
To'lovdan keyin: *"500 000 so'm qabul qilindi: Sikl 1 ning 10 darsi + Sikl 2 ning 4 darsi"*

### 3.6 Yangi talaba qo'shish sehrgari
`POST /enrollments`'ga `initialPrepaidLessons?: number` qo'shiladi. Dialog:
```
Guruh #029 sikli: 2-sikl, 10 dars qoldi

To'lov varianti:
  🔵 To'liq 12 darslik sikl uchun     414 000 so'm
  ⚪ Faqat qolgan 10 darsi uchun       345 000 so'm
  ⚪ Boshqa summa: [______]
```

### 3.7 Prognoz formulasini aniqlashtirish
`reports-financial.service.ts`'da kelajakda kutilayotgan to'lov hisobi:
- Hozirgi prepaid + oydagi qolgan darslar × perLessonCost
- Sikl o'rtasida qo'shilgan talabalarni to'g'ri hisoblash

---

## Biznes qarorlari (tasdiqlangan)

- **Q1:** Yangi talaba istalgan summani to'laydi. Tavsiya — qolgan darslar uchun. Ortiqcha pul keyingi siklga o'tadi, hisoboti ko'rsatiladi.
- **Q2:** Guruhdan chiqarishda sabab dropdown'i qo'shiladi (5 ta variant + matn).
- **Q3:** Bajariladigan tartib — Muammo 2 → 1 → 3.

---

## Fayllar (planlangan)

### Muammo 2
**Backend:**
- `prisma/schema.prisma` — `Enrollment.removalReason`, `removalNote` + enum
- `prisma/migrations/<date>_add_enrollment_removal_reason/migration.sql`
- `src/students/dto/remove-from-group.dto.ts` — yangi maydonlar
- `src/students/services/student-enrollment.service.ts` — reason qabul qilish
- `src/enrollments/enrollment-billing.service.ts` — reason saqlash

**Frontend:**
- `client/src/features/student-profile/remove-from-group-dialog.tsx`
- `client/src/features/student-profile/delete-student-dialog.tsx`
- `client/src/features/student-profile/status-dropdown.tsx`

### Muammo 1
**Backend:**
- `src/billing/lesson-billing.service.ts` — metadata kengaytma
- `src/transactions/transactions.controller.ts` — yangi endpoint
- `src/transactions/services/deduction-coverage.service.ts` — yangi service

**Frontend:**
- `client/src/features/student-profile/lessons-tab/deduction-card.tsx`
- `client/src/features/student-profile/lessons-tab/deduction-coverage-modal.tsx`

### Muammo 3
**Backend:**
- `src/groups/group-cycle.service.ts` — yangi
- `src/groups/groups.controller.ts` — yangi endpoint
- `src/students/dto/enroll-to-group.dto.ts` — `initialPrepaidLessons`
- `src/students/services/student-enrollment.service.ts` — partial prepaid

**Frontend:**
- `client/src/features/payments/payment-amount-calculator.tsx`
- `client/src/features/enrollments/add-student-wizard.tsx`
- `client/src/features/groups/cycle-overview-card.tsx`
