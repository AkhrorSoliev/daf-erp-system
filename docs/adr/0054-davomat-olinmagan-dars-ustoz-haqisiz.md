# ADR-0054 — Dars tugaguncha davomat olinmasa, ustozga o'sha dars uchun haq yozilmaydi

**Holati:** Qabul qilindi
**Sana:** 2026-09-30
**Bog'liq:** spec `docs/superpowers/specs/2026-09-29-davomat-olinmagan-dars-design.md`, `server/src/unmarked-lessons/`, `server/src/attendance/shared/attendance-window.ts`, `server/src/salary/salary-accrual.service.ts` (`createAccrual`), `server/src/salary/shared/gap-sweep.ts` (`forfeitedLessons`), ADR-0025, ADR-0053

## Kontekst

Oylik to'lovda o'quvchi oyning darslari uchun oldindan to'laydi; davomat faqat
ustoz haqini va uzrli dars kreditini hal qiladi. Davomat olinmagan dars markaz
tushumiga kirmasdi, ustozga esa davomat istalgan kuni keyin kiritilsa haq
yozilardi — o'z vaqtida olmaslik hech narsaga olib kelmasdi. Dars aslida
bo'lmagan bo'lsa, pul qo'lda bekor qilinmaguncha qaytmasdi (ADR-0053). Tizim
«dars bo'lmadi» bilan «davomat unutildi»ni ajrata olmaydi.

## Qaror

1. Yangi davomat (shu dars uchun hali yozuv yo'q) faqat dars kuni,
   boshlanishidan 10 daqiqa oldindan tugashigacha kiritiladi — hamma rol
   uchun, CEO ham; tugash daqiqasi kirmaydi. Qo'lda saqlash, QR sessiya
   boshlash va QR skanerlash bitta qorovuldan o'tadi. Olingan davomatni
   administrator keyin ham tuzata oladi.
2. Dars tugab davomat bo'lmasa (dars bekor qilinmagan, ko'chirilmagan, bayram
   emas), `UnmarkedLesson` yozuvi va filial administratorlariga tizim
   topshirig'i ochiladi: «Dars bo'ldimi?». Birinchi o'zgartirgan yoki javob
   bergan administrator topshiriqni oladi. Bayram kunlari hamma joyda filial
   bo'yicha hisoblanadi: tekshiruvda, eslatmada, tugash sanog'ida, guruh
   kalendarida. Topshiriq muddati — keyingi ish kuni 10:00; yakshanba va
   filialning bayramlari o'tkazib yuboriladi (qayta ochilganiniki ham).
3. «Bo'ldi» — davomat kech kiritiladi, dars markaz tushumiga kiradi, ustozga
   **haq yozilmaydi**. Qulf ikki joyda: `createAccrual` (har bir yozuv) va
   `sweepGapLessons`ning majburiy `forfeitedLessons` kirishi (oylik hisobi,
   markaz qo'shimchasi, «Qolgan (markaz)»). Ro'yxat — o'sha kuni guruhda
   bo'lgan o'quvchilar. Undan keyin guruhdan chiqqan o'quvchidan paketli
   (oylik bo'lmagan) kursda pul olinmaydi va uning uchun ustoz haqi ham
   yozilmaydi — chiqishda dars pullari allaqachon qaytgan; oylik kursda hisob
   odatdagidek.
4. Faqat CEO «Ustoz aybdor emas» deb belgilay oladi (sabab bilan) — dars
   odatdagidek haq beradi. Qoidadan oldingi izsiz kunlar ham istisno (haq
   yoziladigan) bo'lib ochiladi.
5. «Bo'lmadi» — bekor qilish (pul darhol qaytadi, ADR-0053) yoki keyinroq
   o'tiladigan qo'shimcha darsga ko'chirish (yangi dars hali boshlanmagan
   bo'lishi shart; pul qaytmaydi). Telegram guruhiga **darhol** xabar boradi
   (ko'rinish qoidasi 20:00 guruh yig'masiniki — `isVisibleToGroup`) — ADR-0025
   dagi darhol yuboriladiganlar ro'yxatiga qo'shimcha. ADR-0025 tahrirlanmaydi;
   qo'shimcha shu yerda qayd etiladi.
6. Javob bo'lmasa, tizim taxmin qilmaydi: ertasi ish kuni 09:00 da eslatma,
   21:00 hisobotida 1 kundan ortiq javobsizlar soni. Bu «Javobsiz darslar»
   qatori hisobotning «Diqqat» qismida chiqadi, shuning uchun kun svetoforini
   🟡 qiladi.

## Oqibatlar

- Ustoz davomatni dars ichida olishga majbur: dars oxirigacha 30 daqiqa
  qolganda «olinmasa haq yozilmaydi» ogohlantirishi boradi; «Bo'ldi» dan keyin
  unga «bu dars haqi yozilmadi» xabari yetadi (Telegramda 20:00 yig'mada).
- Bekor qilish yoki ko'chirish qaysi sahifadan qilinmasin, savolga javob
  bo'ladi va guruhga xabar ketadi. Bekor qilish yoki ko'chirish o'chirilsa,
  savol qayta ochiladi. Bekor qilish yoki ko'chirish dars tugashidan oldin
  qilingan bo'lsa (savol hech ochilmagan), keyin asl dars tugagach o'chirilsa
  va davomat ham, savol ham yo'q bo'lsa, savol birinchi marta ochiladi va
  **istisno** bo'ladi: ustoz bekor qilingan yoki ko'chirilgan darsga davomat
  kirita olmagan edi. Ko'chirishni o'chirganda kun bayram bo'lmasligi va hali
  bekor qilinmagan bo'lishi ham shart («Dars oldindan ko'chirilgan edi»).
- Yangi ustoz akkauntsiz dars o'tgan yoki server ishlamagan holatlar faqat CEO
  istisnosi bilan to'lanadi.
- Javob kechiksa va oy yopilsa, o'sha dars uchun haq yozilmaydi; tushum esa
  dars kuniga (o'tgan oyga) yoziladi, shuning uchun o'tgan oyning Foyda kartasi
  keyin o'zgarishi mumkin.

## Ko'rib chiqilgan va rad etilgan

- **«Davomatsiz o'tdi» yozuvi** (kim kelgani yozilmasdan) — statistika, uzrli
  kredit va kelmaganlar sanog'i buzilardi; CEO «kim keldi»ni ham kiritishni
  talab qildi.
- **Telegramda javob tugmalari** — davomat ro'yxatini Telegramda to'ldirib
  bo'lmaydi; guruh tugmasini kim bosgani ishonchli emas, tugma esa pul qaytaradi.
- **Javobsiz darsni tizim o'zi hal qilsin** — ADR-0053 dagi sabab: tizim
  taxmin qilmaydi.
