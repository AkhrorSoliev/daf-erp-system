# 0145. Qat'iy oylikli har bir xodim «Xodimlar oyligi» da — roli qanday bo'lmasin

- Holati: Qabul qilindi
- Sana: 2026-11-03
- Bog'liq: [0112](0112-xodim-oyligini-qolda-tuzatish.md) (xodim oyligini qo'lda tuzatish), `server/src/salary/shared/teacher-roster-where.ts`, `server/src/salary/salary-monthly-staff.service.ts`, `server/src/reports/reports-excel.helpers.ts` (`buildNetProfit`)

## Kontekst

Oylik hisobot (`SalaryMonthlyService.getMonthly`) odamlarni ikki jadvalga ajratadi: ustozlar (dars bo'yicha haq) va xodimlar (qat'iy oylik). Ajratish **rol** bo'yicha edi: «O'qituvchi» roli bor odam faqat ustozlar jadvaliga tushardi, xodimlar so'rovi esa uni `roles: { none: Teacher }` bilan chiqarib tashlardi.

Ahror Soliyev (10001, 1-filial) — qat'iy 6 000 000 so'm oylikli xodim. Unda «O'qituvchi» roli ham bor, lekin u dars o'tmaydi. Oqibat:

- Ustozlar jadvalida uning dars ma'lumoti yo'q, «Jami hisoblangan» — «—» (`fullDeserved: null`), jamiga 0 qo'shiladi.
- Xodimlar jadvaliga u umuman tushmaydi.
- Oylik cron esa uni boshqa xodimlar kabi to'laydi (`SalaryCalculationService`, global FIXED_MONTHLY konfiguratsiyasi roldan qat'i nazar o'qiladi): avgust uchun 6 mln PAID, sentabr va oktyabr uchun 6 mln CALCULATED.

Sof foyda (`buildNetProfit`) ustoz oyligini `totals.fullDeserved` dan, xodimlar oyligini `staffTotals.monthly` dan oladi — ikkalasida ham bu 6 mln yo'q edi. Farg'ona filiali foydasi avgustdan beri har oy 6 mln ortiq ko'rsatilgan (sayt «Foyda» kartasi, Excel, Telegram hisobot).

## Qaror

1. **Ajratish mezoni — rol emas, oylik turi.** Kompaniya bo'yicha (`groupId: null`) oylik turi FIXED_MONTHLY bo'lgan odam xodimlar jadvalida, rolidan qat'i nazar. Ustozlar jadvali bunday odamni chiqarib tashlaydi.
2. **Bitta shart, ikki joy.** `GLOBAL_FIXED_MONTHLY_CONFIG` (`teacher-roster-where.ts`) ikkala tomonda o'qiladi: xodimlar so'rovi uni talab qiladi, `buildTeacherRosterWhere` esa `salaryConfigs: { none: … }` bilan istisno qiladi. Shuning uchun odam aniq bitta jadvalda va bitta jamida turadi.
3. Cron o'zgarmaydi — u allaqachon shu mezon bilan to'laydi. Endi hisobot ham shuni ko'rsatadi.

## Oqibatlar

- Farg'ona sof foydasi (prod, 03.11.2026, `main` kodi): avgust 22 611 708 → 16 611 708, sentabr 33 697 544 → 27 697 544, oktyabr — 6 000 000 ga kamroq.
- `/payments/salary` sahifasida Ahror Soliyev ustozlar jadvalidan «Xodimlar oyligi» ga o'tadi; avanslari va to'lovi ham o'sha qatorda.
- `getMonthlyForUser` o'zgarmaydi: `data[0] ?? staff[0]` — odam qaysi jadvalda bo'lsa, o'sha qator.
- **Ma'lum chegara.** Global FIXED_MONTHLY bilan bir vaqtda guruhga bog'langan foizli/o'quvchi boshiga stavkasi bor ustoz (aralash) ustozlar jadvalidan chiqadi va uning dars hisoblanmalari jamiga kirmaydi. Prod'da bunday odam yo'q (03.11.2026). Cron ham bunday holatni to'g'ri to'lamaydi (bir davrga bitta `SalaryPayment`), shuning uchun aralash oylik umuman qo'llab-quvvatlanmaydi; kerak bo'lsa alohida qaror.
