# ADR-0091 — Dars bahosi: faqat CEO ko'radi, Telegram'da darhol so'raladi

**Holati:** Qabul qilindi
**Sana:** 2026-10-13
**Bog'liq:** ADR-0025, ADR-0054, ADR-0066, ADR-0078, ADR-0087, `server/src/lesson-ratings/`, `client/src/components/reports/lesson-ratings/`, `docs/superpowers/specs/2026-10-13-dars-baholari-design.md`

## Kontekst

Dars sifati faqat shikoyat yoki o'quvchi ketganda ma'lum bo'lardi.

## Qaror

1. Dars tugaganidan 10 daqiqa – 3 soat ichida, davomatda PRESENT/LATE turgan, Telegram chati ishlaydigan o'quvchiga bot 1–5 tugmali xabar yuboradi. Qaysi dars — «Dars bo'ldimi?» qoidasi (`loadEndedLessonsToday` → `endedLessonsOn`).
2. Bitta dars, bitta o'quvchi — bitta `LessonRating` qatori; qator xabardan oldin yoziladi (unique kalit takror yuborishni to'xtatadi). Telegram rad etsa — FAILED, qayta urinilmaydi. Xabar yetgach `messageId` yoziladi; yozuv yiqilsa qator `messageId`siz qoladi va baho baribir qabul qilinadi, hisobotda esa «yetkazilmagan» sanaladi. Yuborish o'quvchi bo'yicha ajratilgan: bittasining xatosi boshqalarni to'xtatmaydi.
3. Baho 48 soat ichida, bir marta; 1–3 da «Nima yoqmadi?» (force_reply), izoh bir marta, 500 belgigacha.
4. Dars ustozlari yuborilgan paytda muzlatiladi (o'rinbosar hisobga olinadi).
5. Baholarni faqat CEO ko'radi — `@CeoOnly()`, imkoniyat emas: hech kimga berib bo'lmaydi. `GET /lesson-ratings/teachers/:id` ustozni chaqiruvchining kompaniyasi (`companyId`) ichidan qidiradi: boshqa kompaniya ustozining id'si 404 beradi.
6. ADR-0025 ro'yxatiga qo'shimcha: baho xabari darhol yuboriladi (20:00 yig'masiga emas); cron 22:50 da tugaydi.
7. Yoqish — kompaniya darajasidagi `lessonRating.enabled`, boshlang'ich qiymat o'chiq.

## Oqibatlar

- Eslatma yo'q: javob ulushi past bo'lishi mumkin; sahifa uni ko'rsatadi.
- Rad etilgan chatga (ADR-0066) so'rov yuborilmaydi.
- Ikki ustozli dars ikkala ustozga ham sanaladi; ustozlar yig'indisi jami bilan teng emas.
