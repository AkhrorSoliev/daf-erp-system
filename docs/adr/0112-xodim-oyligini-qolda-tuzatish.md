# ADR-0112 — Xodim oyligini qo'lda to'g'rilash

**Holati:** Qabul qilindi
**Sana:** 2026-10-18
**Bog'liq:** ADR-0006, ADR-0034, ADR-0079, ADR-0082, `server/src/salary/shared/staff-monthly-amount.ts`, `server/src/salary/shared/advance-settle.ts`, `server/src/salary/staff-salary-adjustment.service.ts`, `docs/superpowers/specs/2026-10-18-xodim-oyligini-qolda-tuzatish-design.md`

## Kontekst

Ustoz bo'lmagan xodimning (administrator, kassir, direktor) oyligi `FIXED_MONTHLY` stavkadan kalendar kunlariga proporsional hisoblanadi (`prorateFixedMonthly`). Oy o'rtasida kelgan yoki ketgan xodim uchun kelishilgan summa ko'pincha butun kunlarga to'g'ri kelmaydi: 3 000 000 stavka, 11.09 dan ishlagan xodimga kelishilgan sentabr oyligi 2 076 000, formula esa 2 000 000 beradi. Qo'lda to'g'rilashning yagona yo'li — oylik yozuvini skript bilan o'zgartirish (hisobotlar baribir formulani ko'rsatadi, filial hisoboti «ishlagan − avans ga mos emas» deb ogohlantiradi) yoki stavka tarixiga hech kim kelishmagan soxta stavka yozish (2026 yil iyul).

## Qaror (CEO, 18.10.2026)

1. Tizim oyni o'zi hisoblab taklif qiladi; CEO shu oy uchun o'z summasini kiritishi mumkin. Stavka va uning tarixi o'zgarmaydi.
2. Tuzatish alohida yozuv: `StaffSalaryAdjustment` (kompaniya, xodim, `YYYY-MM`, summa, tizim hisobi, sabab, kim). Bitta xodim, bitta oy — bitta yozuv.
3. Xodimning oy oyligi bitta funksiyadan chiqadi: `resolveStaffMonthly` = tuzatish bo'lsa o'sha, bo'lmasa `prorateFixedMonthly`. Uni faqat oylik cron'i va xodimlar hisoboti (`SalaryStaffMonthlyService`) chaqiradi; `staff-monthly-amount.single-source.spec.ts` boshqa chaqiruvni build'da to'xtatadi. Foyda, Excel, Telegram va filial PDF hisoboti shu hisobotdan o'qiydi.
4. Faqat CEO (`salary.adjust`, `allowedRoles: []`): xodim oyligi CEO'niki (ADR-0034). Xodim filiali baribir tekshiriladi.
5. Sabab majburiy (3–300 belgi). Har o'zgarish va qaytarish `User` tarixiga yoziladi (`OYLIK_TUZATILDI`, `OYLIK_HISOBGA_QAYTARILDI`), tranzaksiya bilan birga.
6. Oyning oylik yozuvi allaqachon bo'lsa (`CALCULATED`), tuzatish uni shu tranzaksiyada qayta hisoblaydi: yangi summa − ushlangan avanslar; endi sig'adigan avanslar ADR-0082 yurishi bilan ushlanadi (`settlePendingAdvances`, cron'dan ajratib olingan). Ushlangan avans o'zi ochilmaydi: yangi summa ushlanganidan kam bo'lsa — 400. `APPROVED`/`PAID` yozuvda — 409.
7. Tuzatish `YYYY-MM` 2026-05 dan joriy oygacha. Ustozlar (hisoblangan haq) bu qarorga kirmaydi.

## Oqibatlar

- Yangi jadval (qo'shimcha migratsiya; jadvalni bo'shatish formulaga qaytaradi).
- `prorateFixedMonthly` endi to'g'ridan-to'g'ri chaqirilmaydi; yangi hisob qoidasi kerak bo'lsa, `resolveStaffMonthly` o'zgaradi.
- Stavka versiyasi o'zgarsa, mavjud tuzatish o'zgarmaydi (u ongli qaror); «Hisobga qaytarish» formulaga qaytaradi.

## Ko'rib chiqilgan va rad etilgan

- **Soxta stavka versiyasi** (oyga 3 114 000 yozib 2 076 000 chiqarish): stavka tarixini buzadi, CEO «fixed doim qolishi kerak» dedi.
- **Faqat oylik yozuvini o'zgartirish:** hisobotlar va filial PDF formulani ko'rsatishda davom etadi.
- **Ish kunlari bo'yicha hisob qoidasi:** butun kompaniya qoidasi, alohida qaror; istisnolar uchun tuzatish baribir kerak.
