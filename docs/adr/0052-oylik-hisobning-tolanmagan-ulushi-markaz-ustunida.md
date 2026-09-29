# ADR-0052 — Oylik hisobning to'lanmagan ulushi «Markaz qo'shdi» ustunida ko'rinadi

**Holati:** Qabul qilindi
**Sana:** 2026-09-29
**Bog'liq:** `server/src/salary/shared/unpaid-monthly-share.ts`, `server/src/common/finance/debt-origin.ts` (`leftById`), `server/src/salary/salary-monthly.service.ts` (`centerUnpaidShare`), `client/src/components/payments/salary-monthly-view.tsx`, ADR-0006, ADR-0051

## Kontekst

Oylik jadvali ustoz haqini kim to'laganiga qarab ikki ustunga bo'ladi:
«O'quvchilar to'lagan» va «Markaz qo'shdi». 12 talik paket modelida qarzdor
o'quvchining darsiga ustoz haqi yozilmasdi, oy oxirida uni markaz to'lardi va
jadvalda «Markaz qo'shdi» ustunida ko'rinardi: iyulda 15,5 mln, avgustda
10,7 mln so'm.

Oylik to'lov modelida (sentabr 2026 dan) oy boshida har bir yozilishga oyning
hisobi yoziladi. Bu o'quvchi pul to'lay oladimi-yo'qmi, farqi yo'q: to'lamasa,
balansi minusga tushadi. Tizim hisob yozilgan darsni "o'quvchi qopladi" deb
qabul qiladi (`accrueMonthlySalary`: `centerFunded: !charge`), shuning uchun
qarzdorning darsi ham «O'quvchilar to'lagan» ustuniga tushdi. Sentabrda
«Markaz qo'shdi» 79 800 so'm ko'rindi. Aslida markaz o'z pulidan bergan haq
14–15 mln so'm edi. CEO buni oldingi oylardan jiddiy farq sifatida payqadi.

Ustoz oladigan pul bunga bog'liq emas: iyuldan beri ustozga to'liq haq
to'lanadi (`fullDeserved`). Muammo faqat ko'rinishda edi: markaz qancha pulni
o'zidan berayotgani jadvalda ko'rinmay qolgan.

## Qaror

1. Oylik hisob bilan qoplangan har bir dars haqi (`deductionTransactionId` —
   `EnrollmentMonthlyCharge.transactionId`) hisobning hali to'lanmagan ulushi
   bo'yicha ikkiga bo'linadi. Ulush `to'lanmagan qoldiq / hisob summasi`, 1 dan
   oshmaydi. Shu ulush «O'quvchilar to'lagan» dan «Markaz qo'shdi» ga o'tadi.
2. To'lanmagan qoldiq qarzdorlik sahifasidagi qoida bilan olinadi. To'lovlar
   eng eski qarzni birinchi yopadi (`replayDebtOrigin`). Unga `leftById`
   qo'shildi: har bir hisob yozuvining bugun qolgan to'lanmagan qismi. Qarz
   taqsimoti uchun ikkinchi mexanizm yozilmadi.
3. Ko'rsatkich jonli: o'quvchi pul to'lagan sari markaz ulushi kamayadi.
   `centerUnpaidShare` (qator va jami) uni alohida ko'rsatadi.
4. `fullDeserved`, `netToPay`, oylik cron va ledger o'zgarmaydi. Bu faqat ikki
   ustun orasidagi bo'linish. Paket to'lovi bilan qoplangan dars (o'quvchi pulni
   oldindan qo'ygan) va markaz qo'shimchasi yozuvlari (`wasCenterTopUp`)
   tegilmaydi.
5. Markaz qo'shimchasining X/Y/Z hayot sikli (`centerAdvanced` /
   `centerStillFronted`) avvalgidek bayroqlardan hisoblanadi. Yangi ulush unga
   kirmaydi.

## Oqibatlar

- Sentabr (prod, 29.09.2026): «O'quvchilar to'lagan» 85 321 435 dan
  70 741 254 ga tushdi. «Markaz qo'shdi» 3 084 962 dan 17 665 143 ga chiqdi,
  shundan to'lanmagan ulush 14 580 181. To'liq ishlangan (88 406 397) va
  to'lanishi kerak (73 376 397) o'zgarmadi. Avgust ham o'zgarmadi.
- Jadval, profil kartalari, lehrer portali, Telegram 21:00 hisoboti va Excel
  «Oyliklar» varag'i bitta `getMonthly` dan o'qiydi, shuning uchun hammasi bir
  xil raqam ko'rsatadi.
- Iyuldan boshlab foyda va oylik bazasi `fullDeserved` ni ishlatadi, shuning
  uchun sof foyda o'zgarmaydi.
- Hisobot qarzdor o'quvchilarning ledger qatorlarini qo'shimcha o'qiydi. Bu
  faqat oylik hisobli oylarda va faqat bugun qarzdor bo'lganlar uchun bo'ladi.

## Ko'rib chiqilgan va rad etilgan

- **O'quvchining butun qarzini joriy oyga yozish** (`min(qarz, oylik hisob)`)
  — sodda, lekin eski paket qarzlarini ham sentabrga tashlaydi. Sentabrda bu
  ≈1 mln so'm ortiqcha ko'rsatardi va qarzdorlik sahifasi bilan zid bo'lardi.
- **Ustun nomini «O'quvchilarga hisoblangan» ga o'zgartirish** — to'g'ri
  bo'lardi, lekin markaz qancha pulni o'zidan berayotgani savoliga javob
  bermasdi. Aynan shu savol berilgan edi.
- **Oy yopilganda ulushni muzlatish (paket modelidagi `wasCenterTopUp` kabi)**
  — alohida jadval yoki bayroq kerak bo'ladi. CEO jonli ko'rinishni tanladi:
  o'quvchi to'lagan sari kamaysin.
