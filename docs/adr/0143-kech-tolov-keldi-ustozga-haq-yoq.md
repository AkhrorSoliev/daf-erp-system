# 0143. Kech to'lov: to'lov yetgan davomatsiz darslar «Keldi», ustozga haq yozilmaydi

- Holati: Qabul qilindi
- Sana: 2026-10-31
- Bog'liq: [0047](0047-davomat-oynasi-va-tolovsiz-oquvchi.md) (darsga qo'yish), [0064](0064-darsga-kirish-uchun-oy-tolovining-eng-kam-qismi.md) (50%), [0062](0062-oylik-yozilish-sikl-emas-oy.md) (oylik hisob), [0054](0054-davomat-olinmagan-dars-ustoz-haqisiz.md) (ustoz haqi qulfi), [0142](0142-davomat-olib-bolmagan-darslar-pauza-va-qaytish.md) (davomat olib bo'lmagan darslar), shartnoma 3.2. Spec: `docs/superpowers/specs/2026-10-31-kech-tolov-keldi-design.md`.

## Kontekst

To'lamagan o'quvchini oyning 2-darsidan davomatga qo'yib bo'lmaydi (ADR-0047), shuning uchun u o'sha darslarda qator qoldirmaydi. Keyin to'lasa ham qatorlar yo'qligicha qolardi: profilda bu kunlar binafsha yoki bo'sh turardi, garchi o'quvchi ularning pulini to'lagan bo'lsa ham. Har yangi to'lov avval eski qarzni yopgani uchun bu takrorlanaverardi.

31.10.2026 holatiga prodda 183 o'quvchi kech to'lagan, 439 ta darsga to'lovi yetgan, lekin davomat qatori yo'q edi (`scripts/audit-late-payers.ts`). Misol #10882: 26.10 dagi to'lov 05–14.10 dagi 5 darsni qoplaydi.

ADR-0142 pauzada bu darslar pulini hisobdan chiqarar edi. CEO 31.10 da buni rad etdi: shartnoma 3.2 ga ko'ra davomat olib bo'lmagan dars ham to'lanadi. Prodda bu yo'l hech qachon ishlamagan (`BARRED_LESSONS` yozuvi 0 ta, avto-pauza o'chiq).

## Qaror

1. **Davomat olib bo'lmagan dars ham to'lanadi.** Hech bir dars hisobdan chiqarilmaydi. To'lov turi va kim kiritgani farq qilmaydi.
2. **To'lov yetgan dars «Keldi».** `LessonBillingService.processRetroactiveBillingForStudent` (hamma to'lov yo'li: naqd, Payme, Click, biriktirilgan) boshida `markPaidBarredLessons` (`billing/paid-barred-lessons.ts`) to'lovning o'z Serializable tranzaksiyasida ishlaydi. U faol oylik yozilishlarda o'quvchi davomatga qo'yilmagan kunlarni topadi va `forLessons` hukmi yangi balans bilan `PAID` bo'lgan har kunga `PRESENT` qatori yozadi: izohi «To'lov keyin keldi — ustozga haq yozilmaydi», `teacherPayWaived: true`. Pul yurmaydi: oyning puli oylik hisobda allaqachon yozilgan.
3. **Qaysi kun «qo'yilmagan» edi.** Qo'lda olingan davomat (MANUAL) hammani belgilaydi, kim qolsa u blok edi (`leftOutAfterEnd` qoidasi): o'quvchi davomat olingan paytda guruhda bo'lgan, qatori yo'q, oylik hisob kunni qoplaydi va kun hisobdan chiqarilmagan. Faqat QR bilan olingan davomat buni isbotlamaydi va olinmaydi. Bugungi dars faqat tugaganidan keyin olinadi. Qoida o'chiq bo'lsa (`payment.admissionRuleEnabled`) hukm yo'q, hech narsa belgilanmaydi.
4. **Ustozga haq yo'q.** `Attendance.teacherPayWaived` (migratsiya `20261031100000_attendance_teacher_pay_waived`). Ikki qulf, ADR-0054 qulflari yonida: `SalaryAccrualService.createAccrual` (har haq yozish yo'li shu yerdan o'tadi) va `sweepGapLessons` (attendance elementida majburiy maydon; markaz qoplashi, oylik sahifa va cron). Admin keyin belgini o'zgartirsa ham haq yozilmaydi.
5. **Faqat faol yozilish.** Guruhdan ketgan o'quvchi qarzini to'lasa, bu darsga kelish emas, darslari belgilanmaydi.
6. **ADR-0142 dan olib tashlandi:** pauzada hisobdan chiqarish (`BarredLessonsChargeService`), qaytish oynasi (`GET/POST /students/:id/barred-lessons[/restore]`), profildagi «hisobdan chiqarilgan» halqasi va `absence.barred.restoreDialog` katagi. Binafsha nuqta, 1–2-dars xabarlari va avto-pauza qoladi.
7. **O'tganlar.** `scripts/backfill-late-payer-attendance.ts` xuddi shu funksiyani chaqiradi: quruq ishga tushirish (read-only), keyin `--apply --expect=<N>`, avval `--student=10882`.
8. **Davomat formasi.** O'qituvchi «sizga ish haqi yozilmaydi» ogohlantirishini avvaldan ko'radi. Admin matniga «Hozir to'lamasa, keyingi to'lov bu darsni yopadi, lekin ustozga haq yozilmaydi» qo'shildi.

## Oqibatlar

- Kech to'lagan o'quvchining bu darslari davomat foiziga va «N/M keldi» ga kiradi (CEO: to'lagan o'quvchi kelgan hisoblanadi).
- Balans, qarz va daromad o'zgarmaydi; markaz bu darslar pulini to'liq oladi.
- Har to'lov bir necha qo'shimcha o'qish qiladi (yozilishlar, davomat, hukm); faqat faol oylik yozilishi bor o'quvchida.
- Faqat QR bilan olingan darsda blok bo'lgan o'quvchi belgilanmaydi (ma'lum chegara).
