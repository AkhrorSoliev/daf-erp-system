# Darslar sikli (Lesson Cycle) modeli

Bu hujjat "sikl" (cycle) tushunchasini, uning qanday hisoblanishini va UI'da
qayerda **sanalar** bilan ko'rsatilishini tushuntiradi. Asosiy chalkashlik —
sikl bilan **kalendar oy** ni aralashtirish (masalan "13 yoki 21 talik sikl")
— shu yerda hal qilinadi.

## Sikl nima?

- **Sikl = N ta dars**, bu yerda `N = Course.lessonPaymentCount`.
  - Standart kurslar: **12**, intensiv kurslar: **20** (default 12).
  - Bu yagona manba — `Course` modelida. **Group darajasida override yo'q**;
    har bir guruh o'z kursining qiymatini oladi.
- To'lov modeli **prepaid (oldindan)**: o'quvchi balansiga pul tushganda,
  billing qatlami bir sikl (yoki qisman) darslarni "sotib oladi" va har bir
  o'tilgan dars shu zaxiradan yechiladi.

## Sikl qachon boshlanadi va tugaydi?

- **Sikl sanasi hech qayerda saqlanmaydi.** U ledger'dan tiklanadi:
  - Sikl **ochiladi**: `LESSON_DEDUCTION` tranzaksiyasi yozilganda
    (`metadata.lessonsCovered = N`).
  - Sikl **to'ladi**: har o'tilgan dars `LESSON_CONSUMPTION` (amount=0,
    `attendanceId` bilan) yozilib, FIFO tarzda deduction "bucket"iga quyiladi.
  - Sikl **boshi/oxiri sanasi** = shu bucketdagi eng erta/eng kech
    `attendance.date`.
- Yagona hisoblovchi: **`server/src/billing/lesson-coverage.helper.ts`**
  (`computeEnrollmentCoverage` / `allocateCoverage`). Tartib `createdAt` ASC
  (retroaktiv billing darsdan keyin yozilishi mumkin), sana esa
  `attendance.date` dan; bekor qilingan (`reversedAt`) qatorlar chiqarib
  tashlanadi. Sikl raqami (`cycleSequenceNumber`) har **enrollment** ichida
  1 dan boshlanadi.

## Sikl ≠ kalendar oy (13/21 chalkashligi)

Sikl — **darslar soni** (12/20), kalendar oy emas. Haftada 3 marta yig'iladigan
guruhda bir oyda ~13 ta dars kuni bo'ladi, 5 haftada ~21 ta. Bu sonlar
**kalendar oy darslari**dir, sikl emas. Shuning uchun:

- Guruh → Davomat ko'rinishidagi oylik darslar soni siklга teng bo'lishi
  shart emas.
- Sikl chegarasi endi UI'da **sanalar bilan** aniq ko'rsatiladi (pastga qarang),
  shunda admin qaysi darslar qaysi siklga/to'lovga tegishli ekanini biladi.

Diagnostika: `server/scripts/audit-lesson-payment-count.ts` (read-only) — har
kursning `lessonPaymentCount` qiymatini chiqaradi, {12,20} dan tashqaridagilarni
OUTLIER deb belgilaydi va namuna guruhda sikl vs kalendar-oy farqini ko'rsatadi.

## Guardrail

- `Course.lessonPaymentCount` endi DTO darajasida `@Min(1) @Max(50)` bilan
  cheklangan (`create/update-course.dto.ts`) — xato 13/21/120 kabi qiymatlar
  sikl o'lchami va per-lesson narxni buzishining oldini oladi.
- Kurs formasi (`edit-course-form.tsx`) `max={50}` va qiymat {12,20} dan boshqa
  bo'lsa yumshoq ogohlantirish ko'rsatadi (bloklamaydi).
- Eslatma: bu faqat **yangi** yozuvlarni himoya qiladi. Mavjud noto'g'ri
  qiymatni faqat `PATCH /courses/:id` orqali tuzating (narx/per-lesson ta'sirini
  hisobga olib). Eski `LESSON_DEDUCTION.metadata.lessonsCovered` o'z capacity'sida
  qoladi → tarixiy sikllar o'zgarmaydi.

## Sikl qayerda SANALAR bilan ko'rsatiladi

- **O'quvchi profili → To'lovlar tab**: `LESSON_DEDUCTION` qatori
  "Sikl darslarga yechildi · {dd.MM} — {dd.MM} ({coveredCount}/{capacity} dars)".
- **O'quvchi profili → Darslar tab** (yangi): har guruh bo'yicha davomat
  (kelgan/kelmagan/kech/sababli) nuqtalari + har sikl sana oralig'i. Endpoint:
  `GET /students/:id/lessons-overview` (`?includeClosed=true` — yopilgan
  guruhlar ham).
- **To'lov qabul qilish oynasi**: kelgusi sikllar "Kelgusi sikl — N dars
  (oldindan)" (raqam bilan, sanasiz — darslar hali o'tilmagan); mavjud qarz esa
  o'tgan darslarning sana oralig'i bilan.
- **Guruh → Davomat → Qarzdorlar**: har qarzdorda "Joriy sikl" ustuni —
  eng so'nggi siklning sana oralig'i va to'langan/jami darslari.
