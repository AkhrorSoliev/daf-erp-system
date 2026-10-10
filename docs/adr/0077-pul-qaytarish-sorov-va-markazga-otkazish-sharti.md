# ADR-0077 — Pul qaytarish so'rov bilan: balans so'rov kuni so'ralgan summaga kamayadi, pul kassadan «Berildi»da chiqadi, muddat 10 bank kuni; markazga o'tkazish xabardan 10 bank kuni va 30 kun keyin

**Holati:** Qabul qilindi
**Sana:** 2026-10-10
**Bog'liq:** ADR-0025, ADR-0055, ADR-0058, ADR-0059, ADR-0063, ADR-0066, ADR-0067, ADR-0072, `server/src/refunds/`, `server/src/refundable/`, `server/src/balance-notices/`, `server/src/refunds/refund-student-messages.listener.ts`, `server/src/withdrawals/`, `server/src/common/date/bank-days.ts`, `server/prisma/migrations/20261010180000_b2b_refund_request_balance_notice`, `docs/superpowers/specs/2026-10-10-b2b-qaytariladigan-pul-design.md`, `docs/superpowers/plans/2026-10-10-b2b-qaytariladigan-pul.md`

## Kontekst

Pul qaytarish bir bosish edi: `POST /refunds/quick` `Refund` qatorini darhol
`COMPLETED` qilib yozardi, pulni balansdan ham, filial kassasidan ham o'sha soniyada
olardi. Kutish holati yo'q edi, pul o'quvchiga qachon yetgani hech qayerda yozilmasdi,
shartnomadagi «10 bank kuni» muddati tizimda yo'q edi. «Muzlatilganlarning puli»
sahifasi faqat 30 kundan ortiq muzlatilganlarni ko'rsatardi; guruhsiz va ketganlarning
puli hech qaysi sahifada yo'q edi. Markaz hisobiga o'tkazish (ADR-0055) hech qanday
shartsiz ochiq edi.

## Qaror (CEO, 10.10.2026)

1. **Har qaytarish so'rov orqali.** `Refund.status`: `REQUESTED` (so'rov ochiq,
   summa balansdan allaqachon olingan, pul berilmagan) → `COMPLETED` («Berildi») yoki `REJECTED`
   (bekor qilindi). `APPROVED` va `PROCESSING` eski qatorlar uchun enumda qoladi,
   yangisi yozilmaydi. `PATCH /refunds/:id/process` o'chirildi.
2. **So'rov** (`POST /refunds/quick`, CEO, filial direktori, administrator): bitta
   Serializable tranzaksiyada `Refund` `REQUESTED`, `requestedById`, `dueDate` = bugundan
   keyingi 10-bank kuni; kerak bo'lsa oldindan to'langan darslar bekor qilinadi
   (o'zgarmagan); `REFUND` ledger qatori va balans. **Kassa harakati yozilmaydi**
   (`recordRefund` endi kassaga tegmaydi). So'ralgan summa balansdan so'rov paytidanoq olinadi (butun balans so'ralsa, balans 0) — bu pul darsga,
   yechib olishga yoki boshqa qaytarishga sarflanmaydi. Bir xil (o'quvchi, guruh,
   summa) bo'yicha 60 soniya ichida ochiq yoki berilgan qaytarish bo'lsa, takror so'rov
   rad etiladi.
3. **«Berildi»** (`POST /refunds/:id/hand-over`, kassir ham): o'quvchi filialining
   kassasi tanlanadi, o'sha `REFUND` qatoriga bog'langan `CashMovement` OUTFLOW yoziladi,
   so'rov `COMPLETED`, usul kassa turidan (naqd → `CASH`, bank/karta → `TRANSFER`).
   So'rov allaqachon yopilgan bo'lsa — 409 «So'rov allaqachon yopilgan». Kvitansiya
   faqat shundan keyin ochiladi (kodi birinchi ochilganda beriladi).
4. **Bekor qilish** (`POST /refunds/:id/cancel`, CEO va filial direktori, sabab
   majburiy): faqat `REQUESTED`; `REFUND` qatori va darslarni bekor qilgan
   `ADJUSTMENT` teskari yoziladi, darslar joyiga qaytadi, so'rov `REJECTED`. Juftlik
   hech qaysi oyda sanalmaydi (ADR-0058). `COMPLETED` qaytarishni bekor qilish —
   o'zgarmagan holda CEO'ning `POST /refunds/:id/reverse` (ledger + kassa).
5. **Bank kuni** — dushanba–juma, bayram emas. Bayramlar — markazning `Holiday`
   jadvali (kompaniya bo'yicha yoki o'quvchi filialiniki). Bu bank kalendarining
   o'rnini bosadigan taxmin: ko'chirilgan ish shanbalari modellanmaydi.
6. **Hisobotlar so'rovlarini o'zgartirmaydi.** Ledger o'quvchilari (sof foydaning
   qaytarish qismi, «Foyda tarkibi», to'lovlar hisoboti, Excel, Telegram «Diqqat»,
   o'quvchi hisoboti) qaytarishni **so'rov kuni** ko'radi; kassa va pul oqimi —
   **berilgan kuni**. Orada pul «Kutilayotgan qaytarishlar»da turadi. O'quvchi
   hisobotida qator «pul qaytarish» deb yoziladi (avval «naqd qaytarib berildi»).
7. **Xabar** (`BalanceNotice`, `POST /students/:id/balance-notices`, kassirdan
   tashqari): bot orqali (`BOT`) yoki «Qo'ng'iroq qilib aytildi» (`CALL`). Bot matni —
   CEO tasdiqlagan 2-variant (birinchi, bir abzatsli matn o'sha kuni quruq topildi): Telegram
   HTML, muhim joylar qalin, qatorlar bo'lingan; `balance-notice-text.ts` da, test bilan
   mahkamlangan. «Qaytariladigan pul» panelida shu matn oddiy matn holida ko'rinadi.
   Bot xabari darhol ketadi (`SmsService` orqali, qo'lda SMS kabi) — bu ADR-0025
   ro'yxatiga qo'shimcha. Faqat yetkazilgan xabar yoziladi: bot yuborishi bajarilmasa,
   hech narsa yozilmaydi va xodimga qat'iy matn qaytadi — «Botga xabar yetmadi —
   qo'ng'iroq qiling» (Telegramning o'z sababi faqat SMS jurnalida qoladi). Xabar
   **haqiqiy** — faqat o'quvchining hozirgi holatida berilgan bo'lsa
   (`createdAt ≥ statusChangedAt`).
8. **Markazga o'tkazish sharti:** oxirgi haqiqiy xabar + 10 bank kuni + 30 kalendar
   kun. Ungacha `POST /withdrawals` 400 qaytaradi; shart har yechib olishga,
   profildagi «Yechib olish»ga ham tegishli (ADR-0055: bu pul markazga o'tishi).
   `GET /withdrawals/preview` qulfni oldindan ko'rsatadi (`transfer`).
9. **«Qaytariladigan pul» sahifasi** (`GET /refundable/list|students/:id|excel`,
   kassir ham o'qiydi): o'qimayotganlarning musbat balansi ADR-0067 turlari bilan —
   muzlatilgan, guruhsiz, ketgan; o'qiyotganlar hech qachon chiqmaydi. Uch tur jami
   qo'shiladi (bu markazda turgan pul, qarz emas — ADR-0059 bunga tegmaydi).
   `GET /payments/frozen-balances` o'chirildi. Qaytarishlar tarixi — sahifalangan
   `GET /refunds` (`?status=` ro'yxati, kassir ham o'qiydi).

## O'quvchiga xabarlar (CEO, 10.10.2026)

O'quvchi to'rtta xabar oladi: balans haqidagi xabar (7-band) va qaytarishning uch bosqichi —
so'rov ochildi, pul berildi, so'rov bekor qilindi. Hammasi Telegram HTML: muhim joylar qalin,
qatorlar bo'lingan, «Hurmatli {Ism}!» (ism bo'sh bo'lsa «Assalomu alaykum!»), summa
`formatSum`, muddat va ochilish sanasi «{kun}-{oy}gacha» («Berildi» xabarida berilgan kun dd.MM.yyyy), telefon «+998 XX XXX XX XX». Matnlar spec §5.3–§5.4 da va
testlar bilan mahkamlangan (`balance-notice-text.ts`, `refund-student-text.ts`): so'zma-so'z
o'zgartirilmaydi.

- **Darhol ketadi.** `SmsService.sendToStudent` orqali (turi `AUTO`), 20:00 kunlik navbatga
  tushmaydi — ADR-0025 darhol-ro'yxatiga qo'shimcha, to'lov kvitansiyasi kabi (to'rttasi ham).
- **Qachon.** So'rov ochilganda (`refund.requested`), «Berildi»da (`refund.handed-over`,
  ochiq kvitansiya PDF havolasi bilan), bekor qilinganda (`refund.cancelled`, sababi bilan).
  Hodisa faqat tranzaksiya commit bo'lgandan keyin chiqadi, yuki faqat id'lar; tinglovchi
  (`refund-student-messages.listener.ts`) kerakli ma'lumotni qayta o'qiydi.
- **Kimga.** Telegram bog'langan o'quvchiga; bog'lanmaganga hech narsa ketmaydi. Yuborish
  bajarilmasa, qaytarishga ta'sir qilmaydi — xato logga yoziladi.
- **Telefon.** O'quvchi filialiniki, bo'lmasa kompaniyaniki (balans xabari ham shuni o'qiydi).
  Ikkalasi ham yo'q bo'lsa, qaytarish xabarlarida «📞» qatori tushiriladi: ular axborot;
  balans xabarida esa telefon shart, shuning uchun u telefonsiz yuborilmaydi.

## Ko'rib chiqilgan muqobillar

- **Balansni «Berildi»da kamaytirish.** Rad etildi: kutish paytida pul darsga yoki
  boshqa joyga sarflanib ketardi.
- **Kassani so'rovda yozish.** Rad etildi: kassa qoldig'i hali chiqmagan pulni
  chiqqan deb ko'rsatardi.
- **Alohida bank kalendari.** Hozircha rad etildi: markazning bayram jadvali yetarli
  yaqin; farqi 5-bandda yozilgan.
- **Markazga o'tkazishni faqat ogohlantirish bilan cheklash.** Rad etildi: CEO
  tizim o'zi bloklasin dedi.

## Oqibatlari

- Pul qaytarishning ikki sanasi bor: so'rov (ledger) va berilgan (kassa). Kun
  oxiridagi kassa qoldig'i va ledger bir kunda farq qilishi kutilgan holat.
- `recordRefund` kassaga yozmaydi; kassa harakatini faqat hand-over yozadi. Yangi
  joydan `recordRefund` chaqirilsa, kassa yo'li o'ylanishi kerak.
- Mavjud `COMPLETED` qaytarishlar o'zgarmaydi; tarixda ularning `processedAt`i
  «Berildi» sanasi sifatida chiqadi.
- Xabarsiz o'quvchining pulini markazga o'tkazib bo'lmaydi — yangi tartib profildagi
  «Yechib olish»ni ham to'xtatadi. Xabarni «Qaytariladigan pul» sahifasidagi
  panelda berish mumkin, xabar hali yo'q bo'lsa — «Yechib olish» oynasining o'zida ham.
- Kvitansiya kodi (`Refund.receiptCode`) PDF birinchi ochilganda beriladi (dangasa),
  ya'ni faqat «Berildi»dan keyin; so'rovning o'zida kod yo'q.
- Bot xabari darhol ketadi (ADR-0025 ro'yxatiga qo'shimcha): `SmsService.sendToStudent`
  orqali, xodim tugmani bosgan paytda; kunlik navbatga tushmaydi.

### Ma'lum cheklovlar

- **Bank kalendari taxmin.** Markazning `Holiday` jadvali bank kalendarining
  o'rnida turadi: ko'chirilgan ish shanbalari yo'q. Bayram o'qishida `companyId`
  filtri yo'q (`buildHolidayDateSet` hamma joyda shunday o'qiydi): jadval hozir bitta
  kompaniyaniki.
- **`allowedFrom` har o'qishda qayta hisoblanadi.** Xabar kuni va bugungi `Holiday`
  qatorlaridan; saqlanmaydi. Xabardan keyin bayram o'chirib qo'yilsa, ochilish kuni
  bot matnida va'da qilingan sanadan **oldinroq** bo'lib qolishi mumkin. Aksincha
  (bayram qo'shilsa) kech bo'ladi va qulf va'da qilingan kundan keyin ochiladi.
