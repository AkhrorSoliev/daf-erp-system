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
   bergan administrator topshiriqni oladi. Bu ish tegadigan joylarda bayram
   kunlari filial bo'yicha hisoblanadi: tekshiruvda, davomat eslatmasida, tugash sanog'ida,
   guruh kalendarida. Topshiriq muddati — keyingi ish kuni 10:00; yakshanba va
   filialning bayramlari o'tkazib yuboriladi (qayta ochilganiniki ham).
3. «Bo'ldi» — davomat kech kiritiladi, dars markaz tushumiga kiradi, ustozga
   **haq yozilmaydi**. Qulf ikki joyda: `createAccrual` (har bir yozuv) va
   `sweepGapLessons`ning majburiy `forfeitedLessons` kirishi (oylik hisobi,
   markaz qo'shimchasi, «Qolgan (markaz)»). Ro'yxat — o'sha kuni guruhda
   bo'lgan o'quvchilar. Undan keyin guruhdan chiqqan o'quvchidan paketli
   (oylik bo'lmagan) kursda pul olinmaydi — chiqishda dars pullari allaqachon
   qaytgan — shuning uchun uning uchun jonli ustoz haqi ham yozilmaydi. Istisno
   darsda esa oylik kunidagi markaz qo'shimchasi (`sweepGapLessons`) bu darsni
   baribir to'laydi (hozir faol paketli guruh yo'q). Oylik kursda hisob
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
   🟡 qiladi. 09:00 eslatmani umumiy topshiriq eslatmasi (`TaskReminderService`)
   yuboradi. U istalgan filial bayramida to'xtaydi, muddat esa faqat o'z
   filiali bayramini o'tkazadi: muddati boshqa filialning bayramiga to'g'ri
   kelgan topshiriqqa 09:00 eslatma bormaydi (ma'lum cheklov).

## Oqibatlar

- Ustoz davomatni dars ichida olishga majbur: dars oxirigacha 30 daqiqa
  qolganda «olinmasa haq yozilmaydi» ogohlantirishi boradi; «Bo'ldi» dan keyin
  unga «bu dars haqi yozilmadi» xabari yetadi (Telegramda 20:00 yig'mada).
- Bekor qilish yoki ko'chirish qaysi sahifadan qilinmasin, savolga javob
  bo'ladi va guruhga xabar ketadi. Savol ochilayotganda yoki «Bo'ldi»
  bosilganda dars shu orada bekor qilingan yoki boshqa kunga ko'chirilgan
  bo'lsa, savol ochilmaydi, «Bo'ldi» esa rad etiladi — aks holda uzrli
  o'quvchiga pul ikki marta qaytardi yoki bekor qilingan dars uchun pul
  olinardi.
- Bekor qilish yoki ko'chirish o'chirilsa, savol qayta ochiladi. Kunda
  davomat bo'lsa (masalan, «Bo'ldi» dan keyin bekor qilingan dars), yozuv
  o'zgarmaydi; ko'chirilgan qo'shimcha darsda davomat olingan bo'lsa, asl kun
  qayta so'ralmaydi — aks holda bitta dars ikki marta hisoblanardi.
- Savol hech ochilmagan bo'lsa-yu, asl dars tugagach bekor qilish yoki
  ko'chirish o'chirilsa va davomat ham, savol ham yo'q bo'lsa, savol birinchi
  marta ochiladi. U faqat bekor qilish yoki ko'chirish dars tugashidan
  **oldin** qilingan bo'lsa **istisno** bo'ladi: ustoz bekor qilingan yoki
  ko'chirilgan darsga davomat kirita olmagan edi. Dars tugagandan keyin
  qilingan bo'lsa, oddiy (haq yozilmaydigan) savol ochiladi — aks holda dars
  tugagach bekor qilib, keyin o'chirish ustozga faqat CEO bera oladigan haqni
  berardi (CEO qarori, 2026-09-30). Ko'chirishdagi istisnoning sababi: «Dars
  oldindan ko'chirilgan edi». Ko'chirish o'chirilganda asl kun bayram bo'lsa
  yoki hali ham bekor qilingan bo'lsa, savol umuman ochilmaydi.
- Ikki o'zgarish bir vaqtda to'qnashsa (masalan, dars tugashi tekshiruvi va
  davomat saqlash, yoki ikki kishi bitta darsni bekor qilsa), yutqazgan so'rov
  409 «Bir vaqtda boshqa o'zgarish bo'ldi — qayta urinib ko'ring» oladi; tizim
  o'zi qayta urinmaydi.
- Yangi ustoz akkauntsiz dars o'tgan yoki dars paytida server ishlamagan
  holatlar faqat CEO istisnosi bilan to'lanadi. Server yarim soatlik
  yurishlarni ham, 23:00 yurishini ham o'tkazib yuborgan kun esa umuman
  so'ralmaydi; uni `scripts/open-unmarked-lessons.ts` tiklaydi va savolni
  istisno (haq yoziladigan) qilib ochadi.
- Oddiy (istisno bo'lmagan) savolga javob qachon berilmasin, ustozga haq
  yozilmaydi. Istisno savol (qoidadan oldingi kun, dars tugashidan oldin
  qilingan bekor qilish yoki ko'chirish o'chirilgani uchun ochilgan savol, CEO
  istisnosi) o'sha oyning oyligi hisoblangandan keyin «Bo'ldi» deb javob olsa,
  haq ochiq oyga «Oldingi oydan» bo'lib yoziladi (`createAccrual`,
  `creditPeriodDate`). Tushum har ikki holda dars kuniga (o'tgan oyga)
  yoziladi, shuning uchun o'tgan oyning Foyda kartasi keyin o'zgarishi mumkin.

## Ko'rib chiqilgan va rad etilgan

- **«Davomatsiz o'tdi» yozuvi** (kim kelgani yozilmasdan) — statistika, uzrli
  kredit va kelmaganlar sanog'i buzilardi; CEO «kim keldi»ni ham kiritishni
  talab qildi.
- **Telegramda javob tugmalari** — davomat ro'yxatini Telegramda to'ldirib
  bo'lmaydi; guruh tugmasini kim bosgani ishonchli emas, tugma esa pul qaytaradi.
- **Javobsiz darsni tizim o'zi hal qilsin** — ADR-0053 dagi sabab: tizim
  taxmin qilmaydi.
