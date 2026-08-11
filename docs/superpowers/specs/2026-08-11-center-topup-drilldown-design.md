# «Qolgan (markaz)» drill-down — kimdan undirish kerak

**Sana:** 2026-08-11
**Holat:** tasdiqlangan, ishga tayyor

## Muammo

`/payments/salary?month=2026-07` sahifasidagi «Markaz qo'shimchasi — undirish holati» kartasi
uchta raqam ko'rsatadi: *Jami qo'shdi* (X) / *Undirildi* (Y) / ***Qolgan (markaz)* (Z)**.

Z — markaz ustozlarga to'lab bergan, lekin o'quvchilardan hali qaytmagan pul. Karta bu
summani ko'rsatadi, ammo **kimdan undirish kerakligini aytmaydi**. CEO uchun bu raqam
harakatga aylanmaydi: pulni qaytarish uchun aynan qaysi o'quvchilar ro'yxati kerak.

## Prod ma'lumoti (iyul 2026, tekshirilgan)

| Ko'rsatkich | Qiymat |
|---|---|
| Jami qo'shdi (X) | 15 513 272 |
| Undirildi (Y) | 4 525 987 |
| **Qolgan (markaz) (Z)** | **10 987 285** (622 dars) |
| O'quvchilar soni | **157** |
| Shu darslar uchun o'quvchilar qarzi | **21 234 015** |
| Faol emas (muzlatilgan/chetlatilgan/arxiv) | **43** |

Ikkita xulosa dizaynni belgilaydi:

1. **Ikki xil summa bor.** Markaz ustozga dars narxining ulushini (masalan 30%) to'lagan;
   o'quvchi esa darsning **to'liq** narxidan qarzdor. 10.99 mln markazning xarajati,
   21.23 mln — undirilishi kerak bo'lgan pul. Bittasini ko'rsatib, ikkinchisini yashirish
   noto'g'ri javob beradi.
2. **43 o'quvchi darsga kelmaydi.** Ular uchun retroaktiv billing hech qachon ishlamaydi —
   pul faqat qo'lda undiriladi. Bu ro'yxatda alohida ko'rinishi shart.

## Yechim

### Backend

**`GET /salary/monthly/center-topup?month=YYYY-MM&branchId=…`**
`@Roles('CEO', 'Branch Director', 'Administrator')` — kartani ko'radiganlar bilan bir xil.

Yangi fayl `server/src/salary/salary-center-topup.service.ts`. `SalaryMonthlyService.getMonthly`
allaqachon 600+ qator — unga qo'shilmaydi.

**Load-bearing qaror:** xizmat `resolveMonthlyScope` ni ishlatadi va o'qituvchilar to'plamini
`getMonthly` bilan **aynan bir xil** filial qamrovida quradi. Shu sababli dialogdagi «Markaz
to'lagan» jamisi kartadagi `totals.centerStillFronted` ga so'mma-so'm teng bo'ladi. Ikkinchi
marta qamrov mantig'ini yozish — bu ikki yuza bir-biriga zid raqam ko'rsatishining yagona yo'li.

So'rov: `SalaryAccrual` — `isCenterTopUp: true`, `reversedAt: null`, davr `OR` (carry-over bilan,
`getMonthly` dagidek) → `studentId` bo'yicha guruhlash.

Qator: o'quvchi (id, ism, balans, holat, telefon) · darslar soni · `Σ amount` (markaz to'lagan) ·
`Σ perLessonCost` (o'quvchi qarzi) · guruh(lar) · ustoz(lar) · birinchi/oxirgi dars sanasi.

Jami: `centerPaid`, `studentOwed`, `lessonCount`, `studentCount`, `inactiveStudentCount`.

Marshrut `server/src/common/auth/branch-route-policy.ts` dagi `BRANCH_SCOPED_BY_PAYROLL`
blokiga qo'shiladi — aks holda manifest testi build'ni yiqitadi.

### Frontend

Kartadagi «Qolgan (markaz)» raqami tugmaga aylanadi →
`client/src/components/payments/salary-center-topup-dialog.tsx`.

- **Sarlavha:** ikkita raqam yonma-yon — *Markaz to'lagan* / *O'quvchilardan olinishi kerak*,
  ostida bir qatorlik izoh nega farq qilishi haqida.
- **Ogohlantirish:** «N ta o'quvchi faol emas — ulardan avtomatik undirilmaydi».
- **Filtr:** holat select (Barcha holatlar / Faol / Muzlatilgan / Chetlatilgan / Arxiv).
- **Jadval:** `#` · O'quvchi (ism + ID, profilga havola) · Guruh · Darslar · Markaz to'lagan ·
  Qarz (shu darslar) · Joriy balans · Holat. Markaz to'lagani bo'yicha kamayish tartibida.
- Sahifalash 10/20/30/40/50 (loyiha qoidasi), oy o'zgarganda page→1, footer'da JAMI.

### Cron bayrog'i (oldindan-qadam)

Sahifani real prod ma'lumoti bilan lokalda ko'rish uchun lokal server prod bazasiga ulanadi.
Hozir `app.module.ts` `ScheduleModule.forRoot()` ni shartsiz ro'yxatdan o'tkazadi — ya'ni lokal
server prod bazasiga **yozadi**: har 30 daqiqada real ustoz/adminlarga davomat eslatmasi
yuboriladi, 23:40 da kunlik surat yoziladi, 02:00 da oylik hisoblanadi.

Shuning uchun `ScheduleModule.forRoot()` `CRONS_ENABLED` env bayrog'i ortiga olinadi.
**Standart — yoqilgan** (`CRONS_ENABLED` o'rnatilmagan bo'lsa cron'lar ishlaydi), ya'ni prod
o'zgarmaydi. Lokalda `CRONS_ENABLED=false` bilan o'chiriladi.

## Qurish jarayonida topilgan nuqson (2026-08-11)

Drill-down ro'yxati ochilishi bilan ma'lum bo'ldiki, **`isCenterTopUp` bayrog'i o'quvchi
to'laganda hamma holatda ham o'chmaydi**, ya'ni «Qolgan (markaz)» oshirib ko'rsatiladi.

Sabab: bayroq faqat **retroaktiv billing** ilgari yozilmagan darsni keyin yozganda o'chadi.
Lekin qarzdorning darsi odatda **o'sha zahoti** yoziladi (balans shunchaki manfiyga ketadi) —
shuning uchun o'quvchi keyin to'laganda retroaktiv billing uchun yozadigan narsa qolmaydi va
bayroq abadiy `true` bo'lib qoladi.

Dalil (prod, iyul 2026):
- markaz qoplagan **622 darsning 622 tasida** ham `LESSON_CONSUMPTION` bor — hammasi o'quvchiga
  allaqachon yozilgan;
- #10210 Muhsinjon Alamjonov 05.08 da 490 000 to'lagan, balansi 6 — lekin hali ro'yxatda.

Joriy balans kesimida:

| | O'quvchi | Markaz ulushi | O'quvchi qarzi |
|---|---|---|---|
| Qarzi yo'q | 6 | 531 276 | 986 835 |
| Qisman qaytgan | 34 | 2 800 138 | 5 370 963 |
| **Qarzdor** | **117** | **7 655 871** | **14 876 217** |

**Qaror (CEO, 2026-08-11): ledgerga tegilmaydi, buzuqlik ochiq ko'rsatiladi.** Dialogga
«Pul qaytdimi?» ustuni + filtri qo'shildi, javob **joriy balansdan** olinadi (ledgerning
«bu odam bizga qarzdormi» degan o'z javobi). Balans butun o'quvchi bo'yicha, oy bo'yicha emas —
shuning uchun yorliq «Qarzi yo'q», «Iyul uchun to'landi» emas: balansni ma'lum bir oyning
darslariga taqsimlab bo'lmaydi, taqsimlagandek ko'rsatish yolg'on aniqlik bo'lardi.
Karta raqami o'zgarmaydi; dialog sarlavhasida «shundan qaytgan» ogohlantirishi chiqadi.

Tuzatilmagan, alohida ish sifatida qoladi: bayroqni qaytarish mexanizmi va allaqachon
to'lagan qatorlar bo'yicha bir martalik tozalash.

### Ikkinchi, kichikroq nomuvofiqlik

#10210 uchun «Qarz (shu darslar)» 541 671 (13 × 41 667) deydi, lekin ledger o'sha 13 dars uchun
aslida 458 331 yechgan (10 tasi 33 333 dan, 3 tasi 41 667 dan). O'quvchi #027 (400 000 lik kurs)
dan #041 (500 000 lik) ga o'tgan; billing eski tsikl narxida davom etgan, top-up accrual esa
yangi guruh narxini muhrlagan. Hozircha tuzatilmadi.

## Qamrovdan tashqarida

- «Jami qo'shdi» va «Undirildi» raqamlari uchun drill-down — hozircha yo'q. Harakat talab
  qiladigan yagona raqam «Qolgan».
- Excel eksport / alohida sahifa — agar dialog kam bo'lsa, keyingi relizda.
- To'lov va'dasi yaratish tugmasi — mavjud `/outreach` oqimida bor, bu yerda takrorlanmaydi.

## Testlar

- `salary-center-topup.service.spec.ts` — guruhlash, filial qamrovi, carry-over `OR`,
  jami `centerPaid` ning `getMonthly.totals.centerStillFronted` ga tengligi.
- `salary.controller.spec.ts` — yangi endpoint uchun `@Roles` metadata + `RolesGuard` testi.
- `branch-route-policy.spec.ts` — manifest to'liqligi (mavjud test avtomatik qamrab oladi).
- `npm test` (server) + `npm run build` (client).
- Yakuniy tekshiruv: lokal server prod bazasida (`CRONS_ENABLED=false`),
  `/payments/salary?month=2026-07` — dialog 157 o'quvchi va 10 987 285 / 21 234 015 ko'rsatishi kerak.
