# 0135. Bekor qilingan darsni bir qadamda boshqa kunga ko'chirish

- Holati: Qabul qilindi
- Sana: 2026-10-27
- Bog'liq: [0053](0053-bekor-qilingan-dars-puli-darhol-qaytadi.md) (bekor qilishda pul qaytadi), [0063](0063-bekor-qilishni-ochirish-pulni-qaytarib-oladi.md) (o'chirishda pul qayta yechiladi), [0054](0054-davomat-olinmagan-dars-ustoz-haqisiz.md) («Dars bo'ldimi?»), `server/src/lesson-cancellations/`, `server/src/lesson-reschedules/`

## Kontekst

24.10.2026 da #056 guruhining darsi «Ustoz uzoqga ketgan» deb bekor qilindi; ustoz keyin o'sha darsni boshqa kuni o'tib bermoqchi bo'ldi. Mavjud yo'l uch bosqichli edi: bekor qilishni o'chirish (faqat CEO/Filial direktori), dars «Dars bo'ldimi?» savoliga qaytishini kutish, savolga «Bo'lmadi → Boshqa kunga ko'chirish» deb javob berish. Bosqichlar orasida xato bo'lsa dars na bekor, na ko'chirilgan holda qolardi, Administrator esa birinchi bosqichni umuman bajara olmasdi. Ko'chirishni bekor qilingan sanada to'g'ridan-to'g'ri yaratish esa kod tomonidan to'silmaydi, lekin pulni ikki marta hisoblash xavfi bor (CLAUDE.md: ma'lum nuqson).

## Qaror

1. **Bitta amal, bitta tranzaksiya.** `POST /lesson-cancellations/:id/reschedule` (`LessonCancellationsService.rescheduleInstead`) bitta Serializable tranzaksiyada: (a) bekor qilishni qaytarib oladi — aynan `remove()` ning ishi (`removeWithin`): berilgan oylik pul o'quvchilardan qayta yechiladi (ADR-0063), dars vaqti o'tgan bo'lsa «Dars bo'ldimi?» savoli qayta ochiladi; (b) darsni ko'chiradi (`LessonReschedulesService.createWithin`, oddiy ko'chirish bilan bir xil tekshiruvlar: yangi sana asl sanadan keyin, xona bo'sh, yangi sana bekor qilingan kun emas) va bu savolga «Bo'lmadi → ko'chirildi» deb javob beradi. Biror qadam rad etilsa hammasi qaytadi.
2. **Pul.** Ko'chirishning o'zi pul yurgizmaydi (ADR-0054). Sof natija: bekor qilishda qaytgan pul qayta yechiladi, dars yangi kunda o'tadi va o'sha kunning davomati odatdagidek hisoblanadi. Hech bir o'quvchi darsni ikki marta to'lamaydi, hech kim darsni bepul olmaydi.
3. **Voqealar tranzaksiyadan keyin.** Guruhga «dars ko'chirildi» xabari (`lesson-reschedule.created`, javob berilgan savol bo'lsa `unmarked-lesson.not-held`) commitdan keyin yuboriladi (`announceCreated`). «Dars bekor qilindi» xabari yuborilmaydi: bekor qilish qaytarib olindi.
4. **Ruxsat — `lessons.change`** (CEO, Filial direktori, Administrator), `lessons.change-delete` emas. Foydalanuvchi uchun bu «ko'chirish»; qaytib yechiladigan pul bekor qilish bergan pulning o'zi, dars esa yangi kunda o'tadi. Guruh filiali tekshiruvi (`assertCallerMayTouchGroup`) ikkala bosqichda ham qoladi. Oddiy «Bekor qilishni o'chirish» CEO/Filial direktorida qoldi.
5. **Interfeys.** «Dars o'zgarishlari» jadvalidagi bekor qilingan darsning ⋯ menyusida «Boshqa kunga ko'chirish» bandi; mavjud ko'chirish oynasi shu qatorning sanasi qotirilgan holda ochiladi.

## Ko'rib chiqilgan muqobillar

- **Ko'chirishni bekor qilingan sanada to'g'ridan-to'g'ri yaratish** — pul allaqachon qaytgan, yangi kunga yana hisoblanishi aniq emas; «Dars bo'ldimi?» ikki qatori bo'lib qolishi mumkin.
- **Ikki alohida so'rov (o'chirish, keyin ko'chirish) mijozdan** — orada xato bo'lsa dars holatsiz qoladi; Administratorga o'chirish ruxsati kerak bo'ladi.
- **Administratorga `lessons.change-delete` berish** — bu butun «o'chirish» ruxsatini ochadi (o'rinbosar, ko'chirish, bekor qilishni o'chirish); kerakli narsa faqat bitta amal.

## Oqibatlari

- Administrator ustoz o'tib bermoqchi bo'lgan bekor qilingan darsni bitta tugma bilan ko'chira oladi.
- `LessonReschedulesService.createInTransaction` ikkiga bo'lindi: `createWithin(tx, …)` (jami ish) va tranzaksiya o'rami; `create()` xulqi o'zgarmadi.
- Ketma-ket tezkor ikki bosish: ikkinchi so'rov bekor qilishni topolmaydi (404) yoki Serializable to'qnashuvda 409 oladi.
- Administrator endi o'quvchilardan qayta pul yechadigan amalni (faqat shu yo'l bilan) bajara oladi; tarixda `LessonCancellation` DELETE va `DARS_KOCHIRILDI` yozuvlari bir foydalanuvchi nomidan paydo bo'ladi.
