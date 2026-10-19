# ADR-0117 — DaF Telegram eslatmasi va dushanba xulosasi: «darhol» ro'yxatida, uzilgan chat o'tkaziladi, oldindan egallanadigan jurnal, o'chirgich

**Holati:** Qabul qilindi
**Sana:** 2026-10-19
**Bog'liq:** `docs/superpowers/specs/2026-10-19-musobaqa-s4-telegram-design.md`, ADR-0025, ADR-0066, ADR-0114, ADR-0115, ADR-0116, `server/src/daf/eslatma/`

## Kontekst

Prodda mashq qilgan 102 o'quvchidan 64 tasi faqat bir kun mashq qilgan: asosiy muammo — qaytib kelmaslik. CEO (2026-10-19): faol o'quvchiga kechki eslatma kuniga ko'pi bilan bitta (19:30), haftada 4 tagacha; dushanba 09:00 hafta xulosasi; o'quvchi ikki joydan o'chira oladi; matnlar avval CEO Telegram'ida ko'riladi. ADR-0025 bo'yicha Telegram xabari 20:00 xulosasini kutadi, agar u «darhol» ro'yxatida bo'lmasa; ADR-0066 oddiy xabarni uzilgan chatga ham yuborishni to'xtatmaydi.

## Qaror

1. **«Darhol» ro'yxatiga qo'shildi** (ADR-0025): kechki eslatma (19:30, dushanba–shanba, yakshanba va umumiy bayram kunida yo'q) va dushanba xulosasi (09:00, tayyor bo'lmasa 10:00–18:00 har soat; bayramda ham) o'z cronlari bilan ketadi, 20:00 xulosasiga tushmaydi. Sabab: eslatma faqat 19:30 yoki 09:00 da foydali, 20:00 xulosasida kech. Yuborish faqat `SmsService.sendToStudent(…, 'AUTO', …)` orqali (audit `SmsMessage` va «SMS» tabi); `sendToStudent` ga ixtiyoriy `replyMarkup` qo'shildi; `direct-send.guard.spec.ts` o'zgarmadi — yangi to'g'ridan-to'g'ri `.sendMessage(` chaqiruvchi yo'q.
2. **Uzilgan chat o'tkaziladi** — ADR-0066 dan istisno. ADR-0066 marklangan chatga yuborishni to'xtatmaydi: blokdan chiqarish yangilanishi yo'qolsa ham keyingi yetib borgan xabar belgini oladi. Eslatma muhim emas: uzilgan chatga har kecha 403 berishdan foyda yo'q. Narxi: yangilanishi yo'qolgan o'quvchi boshqa xabar (chek, qarz) yetib borib belgi olinguncha eslatma olmaydi. Auditoriya `telegramDisconnectedAt IS NULL` bilan so'raladi.
3. **Kimga** (spec §1.1 va §2), sof funksiyalarda (`eslatma-qoidalari.ts`) va har biriga BITTA SQL'da (`eslatma-auditoriya.ts`); yuklama skripti (`daf-yuklama-s4-paritet.ts`) ikkalasini brute force bilan solishtiradi.
   - **Kechki:** o'chirilmagan, botga ulangan, chati uzilmagan, eslatmalari yoqilgan o'quvchi; oxirgi 14 kunda (bugundan tashqari) kunlik qatori bor; **bugun** hech qanday qator yo'q (nol ballik urinish ham mashq); kecha **kechki** (`EVENING`) eslatma olmagan — faqat `EVENING` qatorlari sanaladi; oxirgi 7 kunda 4 tadan kam `SENT`; bugun dushanba xulosasi (`WEEKLY`) olmagan. Yakshanba va umumiy bayram kunida kechki yo'q.
   - **Dushanba xulosasi:** o'tgan haftada kamida 1 ball topgan, ulangan, uzilmagan, yoqilgan o'quvchi; bayram dushanbasida ham yuboriladi (xulosa qo'ng'iroq emas); o'tgan hafta hisoblanmagan xona qolmagan bo'lishi kerak, aks holda 10:00–18:00 har soat qayta uriniladi, 18:00 gacha tayyor bo'lmasa shu hafta o'tkazib yuboriladi.
   - `FAILED` qatorlar «kecha olgan», «7 kunda 4 ta» va «bugun xulosa olgan» shartlariga sanalmaydi; lekin shu tur va shu kun uchun egallangan qator (holati qanday bo'lmasin) qayta yuborishni to'xtatadi.
4. **Jurnal yuborishdan OLDIN egallanadi:** `DafReminderLog` (`@@unique([studentId, kind, sentOn])`, `sentOn` — Toshkent kuni), `INSERT … ON CONFLICT DO NOTHING RETURNING id`; qatorni yaratgan chaqiruv yuboradi, ikkinchi nusxa hech narsa qilmaydi. Qator `FAILED` bilan boshlanadi va `SENT` ga faqat `sendToStudent` qaytargan `SmsMessage` holati `SENT` bo'lsa yangilanadi; `FAILED` o'sha kuni qayta urinilmaydi. Yagona yozuvchi `eslatma-jurnali.ts` (qorovul spec `src/` va `scripts/` dagi `.ts` fayllarni tekshiradi; lokal `daf-yuklama-s4-tiklash.sql` uning ko'rmaydigan istisnosi). 90 kundan eski qatorlar kechki cron oxirida faqat `on` rejimida o'chiriladi.
5. **O'chirish ikki joydan:** `DafStudentSetting.remindersEnabled` (standart `true`), bitta o'chirish ikkala xabarni to'xtatadi. Yagona yozuvchi `eslatmalarniSaqla` (`eslatma-sozlama.ts`) — ilovadagi `PATCH /student-portal/lernen/eslatmalar` ham, xabar tagidagi `dr:off:<studentId>` tugmasi ham shuni chaqiradi. Qorovul faqat yozuvlarni tekshiradi (o'qishlarni emas).
6. **Tugma xavfsizligi:** `dr:off:<studentId>` faqat bosgan chat shu o'quvchining `telegramChatId` siga teng bo'lsa ishlaydi; ota-ona chatida bir bola o'chirsa boshqalari qoladi.
7. **Modul joyi:** alohida `EslatmaModule` (`daf/eslatma/`), `DafModule` ichida emas: yuborish `SmsModule` (u `TelegramModule` ni oladi) orqali, `DafModule` esa `AppActivityModule` ga import qilingan — o'quv bo'limi Telegram zanjiriga bog'lanmaydi. Bir tomonlama: bu modulni faqat `AppModule` import qiladi.
8. **`fortschritt`** javobiga `eslatmalar` (sozlama qatori yo'q = yoqilgan) va `telegramUlangan` qo'shildi — qo'shimcha so'rovsiz, mavjud `sozlama` CTE ga bitta ustun va `Student` PK bo'yicha bitta qatorli `ulanish` CTE bilan.
9. **O'chirgich `DAF_ESLATMALAR`** = `off` (standart) | `log` | `on`, har yurishda o'qiladi (boshqa qiymat = `off`). Tezlik: ketma-ket, ≈ 60 ms oraliq; bitta o'quvchining xatosi qolganlarini to'xtatmaydi.

## Ko'rib chiqilgan muqobillar

- **20:00 xulosasiga qo'shish** — eslatma o'quvchi hali mashq qila oladigan vaqtda kelishi kerak; xulosa boshqa xabarlar bilan aralashadi. Rad.
- **Uzilgan chatga ham yuborish (ADR-0066 kabi)** — har kecha yuzlab 403; ma'nosi yo'q. Rad.
- **Yuborgandan keyin jurnalga yozish** — cronning ikki nusxasi ikki marta yuboradi. Rad.
- **`DafModule` ichiga qo'yish** — Telegram zanjiri o'quv bo'limiga ham bog'lanadi. Rad: alohida modul.
- **O'quvchi vaqtni o'zi tanlashi, ota-onaga alohida xabar, ilova push'i** — S4 dan tashqarida (spec §10).

## Oqibatlari

- **Deploy tartibi:** migratsiya `20261019100000_daf_reminders` → kod (`DAF_ESLATMALAR` qo'yilmagan = `off`) → Railway'da `DAF_ESLATMALAR=log` bir kun (logda «Eslatma (log): kompaniya …, kechki auditoriya N» — son real ko'rinishini tekshirish) → CEO sinov nusxasini (`scripts/daf-eslatma-sinov.ts --user=<CEO id> --send`) ko'rib uch matnni tasdiqlaydi → `on`. Sinov nusxasini yuborish qo'lda qadam, kod uni o'zi bajarmaydi.
- **Yuklama natijalari** (spec §12; 12 000 o'quvchi, soxta bot, ikki o'lchov: yengil va og'ir yuk): kechki auditoriya (3 518 o'quvchi) p95 **231 / 290 ms**, dushanba auditoriyasi (4 372) **42 / 51 ms** (chegara 2 000); to'liq yurish — kechki 13 636 / 10 775 ms, dushanba 16 883 / 12 090 ms, 60 ms pauza bilan prod hisobi **≈ 225 s** va **≈ 279 s** (haqiqiy Telegram javobi o'lchanmagan, qo'shiladi); 50 parallel yurishda har o'quvchiga aynan bitta xabar, xato 0; `fortschritt` p95 S4 aralashida **83 / 101 ms**, S1–S3 aralashida **107 / 120 ms** (yengil / og'ir yuk; chegara 200, S3 da 138), auditoriya brute force bilan farq 0.
- **Ma'lum cheklovlar (qabul qilingan):**
  1. **Har eslatma bitta `SmsMessage` va bitta `EntityHistory` qatori yozadi** (2 000 o'quvchida ko'pi bilan ≈ 43 000 / oy har biri: haftada 4 kechki + 1 xulosa). Xodimlar ularni o'quvchi kartasining «Tarix» va «SMS» tablarida ko'radi; tozalash yo'q.
  2. **Telegram 429** yuborishni shu o'quvchi uchun `FAILED` qiladi va o'sha kuni qayta urinilmaydi; keyingi o'quvchilar ham 429 olsa, auditoriyaning qolgani kun uchun `FAILED` bo'ladi. Kutib qayta urinish yo'q.
  3. **Xato yo'lida ham pauza:** `sendToStudent` Telegram xatolarini o'zi ushlaydi va faqat bazaga yozish xatosida istisno tashlaydi; egallangan har o'quvchidan keyin 60 ms pauza `finally` da, xato bo'lsa ham (egallanmagan qatordan keyin pauza yo'q). Natijani jurnalga yozish xatosi logga yoziladi va siklni to'xtatmaydi.
  4. **Seriya skani butun tarixni o'qiydi:** 2 yillik tarixli nusxada to'liq hisob 800 ms, 60 kunlik oyna va zaxira bilan 408 ms (spec §12, `psql` o'lchovi; chegara 2 000 ms). 60 kunlik oyna bilan natija bir xil (isbotlangan, 3 518 qatorda farq 0), lekin qo'llanmadi; auditoriya p95 si prodda 1 000 ms dan oshsa yoki tarix 2 yildan oshsa qo'llanadi.
  5. **`log` rejimida** tayyor dushanba haftasi 09:00–18:00 har soat bitta log qatori beradi (jurnal yozilmagani uchun qayta urinish to'xtamaydi).
  6. **`guruhlar` (S3)** load average ≥ 8 (10 yadroda) bo'lganda 200 ms chegarasi oldidagi zaxirasini yo'qotadi — S4 ma'lumotisiz nazoratda ham 164–216 ms. S4 regressiyasi emas, S4 da kod o'zgarmaydi. Keyingi qadam: ishga tushgandan keyin prodda `GET guruhlar` p95 sini kuzatish.
  7. **CEO sinov nusxasi qo'lda qadam:** `daf-eslatma-sinov.ts --send` ni odam yurgizadi; `on` ga o'tish shu tasdiqqa bog'liq.
