# ADR-0054 — Dars tugaguncha davomat olinmasa, ustozga o'sha dars uchun haq yozilmaydi

**Holati:** Qabul qilindi
**Sana:** 2026-09-30
**Bog'liq:** dizayn hujjati `docs/superpowers/specs/2026-09-29-davomat-olinmagan-dars-design.md`, `server/src/unmarked-lessons/`, `server/src/attendance/shared/attendance-window.ts`, `server/src/salary/salary-accrual.service.ts` (`createAccrual`), `server/src/salary/shared/gap-sweep.ts` (`forfeitedLessons`), ADR-0025, ADR-0053, ADR-0047–0049 (hali birlashtirilmagan)

## Kontekst

Oylik to'lovda o'quvchi oyning darslari uchun oldindan to'laydi; davomat faqat
ustoz haqini va uzrli dars kreditini hal qiladi. Davomat olinmagan dars markaz
tushumiga kirmasdi, ustozga esa davomat istalgan kuni keyin kiritilsa haq
yozilardi — o'z vaqtida olmaslik hech narsaga olib kelmasdi. Dars aslida
bo'lmagan bo'lsa, pul qo'lda bekor qilinmaguncha qaytmasdi (ADR-0053). Tizim
«dars bo'lmadi» bilan «davomat unutildi»ni ajrata olmasdi.

## Qaror

1. Yangi davomat (shu dars uchun hali davomat yozuvi yo'q) faqat dars kuni,
   boshlanishidan 10 daqiqa oldindan tugashigacha kiritiladi — hamma rol
   uchun, CEO ham; tugash daqiqasi kirmaydi. Qo'lda saqlash, QR sessiya
   boshlash va QR skanerlash bitta qorovuldan o'tadi (ma'lum cheklov: oxirgi
   QR kodi sessiyadan keyin 50 soniyagacha amal qiladi va unda vaqt
   tekshirilmaydi — dizayn hujjati, 3.1). Olingan davomatni administrator,
   filial direktori va CEO keyin ham tuzata oladi.
2. Dars tugab davomat bo'lmasa (dars bekor qilinmagan, ko'chirilmagan, bayram
   emas), `UnmarkedLesson` yozuvi va filial administratorlariga tizim
   topshirig'i ochiladi: «Dars bo'ldimi?». Birinchi o'zgartirgan yoki javob
   bergan administrator topshiriqni oladi. Bayram quyidagi to'rt joyda filial
   bo'yicha hisoblanadi: tekshiruvda, davomat eslatmasida, tugash sanog'ida,
   guruh kalendarida. «Jadval», QR sessiyadagi dars raqami va 09:00 topshiriq
   eslatmasi esa hanuz istalgan filial bayramini hisobga oladi: istalgan
   filial bayrami kuni jadval bo'sh (ma'lum cheklov, dizayn hujjati, 3.3,
   3.6). Topshiriq muddati — keyingi ish kuni 10:00; yakshanba va filialning
   bayramlari o'tkazib yuboriladi (qayta ochilganiniki ham).
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
   🟡 qiladi. Savolning yoshi `UnmarkedLesson` yozuvi yaratilgan vaqtdan
   (`createdAt`) sanaladi: qayta ochilgan savol eski yozuvni ishlatadi, shuning
   uchun asl ochilgan vaqtidan sanaladi va qayta ochilgan kuniyoq bu qatorga
   tushishi mumkin (ma'lum cheklov). 09:00 eslatmani umumiy topshiriq eslatmasi
   (`TaskReminderService`) yuboradi. U istalgan filialning bayramini
   tekshiradi, lekin bayram sanalari UTC yarim tunida saqlangani uchun 09:00 da
   faqat ko'p kunlik bayramning oxirgi kunidan oldingi kunlarida to'xtaydi;
   bir kunlik bayramda va ko'p kunlik bayramning oxirgi kunida eslatma baribir
   ketadi. Muddat esa faqat o'z filiali bayramini o'tkazadi, shuning uchun
   muddati boshqa filialning ko'p kunlik bayramiga (oxirgi kunidan tashqari)
   to'g'ri kelgan topshiriqqa 09:00 eslatma bormaydi (ma'lum cheklov).

## Oqibatlar

- Ustoz davomatni dars ichida olishga majbur: dars oxirigacha 30 daqiqa
  qolganda «olinmasa haq yozilmaydi» ogohlantirishi boradi; «Bo'ldi» dan keyin
  unga «bu dars haqi yozilmadi» xabari yetadi (Telegramda 20:00 yig'mada).
  Boshlanish va −30 eslatmalari guruhning odatdagi hafta kuni va vaqti
  bo'yicha ketadi: 5-banddagi qo'shimcha darsga ogohlantirish bormaydi,
  bekor qilingan yoki boshqa kunga ko'chirilgan kunda esa boradi. −30
  ogohlantirishini eslatma yurishi yuboradi (dushanba–shanba, 07:00–22:30,
  har :00 va :30 da), shuning uchun u faqat dars tugashi :00 yoki :30 ga
  to'g'ri kelsa va guruhning dars vaqtlari kiritilgan bo'lsa boradi. Aks holda
  (masalan, 17:45 da tugaydigan dars, vaqtsiz guruh, yakshanbadagi dars)
  ogohlantirish bormaydi, lekin yurish savolni ochganda ustozga haq baribir
  yozilmaydi. Bu ish bularni o'zgartirmaydi (dizayn hujjati, 3.2).
- Bekor qilish yoki ko'chirish qaysi sahifadan qilinmasin, savolga javob
  bo'ladi va guruhga xabar ketadi. Savol ochilayotganda yoki «Bo'ldi»
  bosilganda dars shu orada bekor qilingan yoki boshqa kunga ko'chirilgan
  bo'lsa, savol ochilmaydi, «Bo'ldi» esa rad etiladi — aks holda uzrli
  o'quvchiga pul ikki marta qaytardi yoki bekor qilingan dars uchun pul
  olinardi.
- Bekor qilish yoki ko'chirish o'chirilsa, savol qayta ochiladi. Kunda
  davomat bo'lsa (masalan, «Bo'ldi» dan keyin bekor qilingan dars), savol
  qayta ochilmaydi (`UnmarkedLesson` yozuvi o'zgarmaydi); ko'chirilgan
  qo'shimcha dars o'tgan bo'lsa (o'sha kunda davomat yoki «Bo'ldi» javobi
  bor), asl kun qayta so'ralmaydi — aks holda bitta dars ikki marta
  hisoblanardi.
- Ko'chirish yangi kunni dars kuniga aylantiradi, shuning uchun u kun
  davomatsiz tugasa, unga ham savol ochiladi. Ko'chirish o'chirilsa yoki
  yangi sanasi o'zgartirilsa va eski qo'shimcha dars kuni endi dars kuni
  bo'lmasa (savolni ochadigan yurishning qoidasi: jadval, ko'chirishlar,
  bekor qilish, filial bayrami, guruh sanalari), o'sha kundagi javob
  kutilayotgan savol yopiladi: holati `NOT_HELD`, bekor qilish yoki
  ko'chirishga bog'lanmaydi, uni va topshiriqni ko'chirishni o'zgartirgan
  kishi yopadi, guruhga xabar ketmaydi. Aks holda unga «Bo'ldi» bosilib, asl
  kun ham qayta so'ralardi — bitta dars ikki marta hisoblanardi. Shu sababli
  o'tgan qo'shimcha darsning (davomat yoki «Bo'ldi» javobi bor) sanasini
  o'zgartirish 400 «Qo'shimcha dars kunida davomat olingan — ko'chirishning
  sanasini o'zgartirib bo'lmaydi» bilan rad etiladi. Javob kutilayotgan
  qo'shimcha darsga yangi sana berilsa, u hozirdan keyin boshlanishi kerak.
  «Bo'ldi» va «Bo'lmadi → Ko'chirish» guruhning dars kuni bo'lmagan kunni
  (o'sha kuni amalda bo'lgan jadvalning hafta kuni emas va unga amaldagi
  ko'chirish tushmaydi; jadval keyin o'zgargani ahamiyatsiz) 400 «Bu kunda
  dars rejalashtirilmagan» bilan rad etadi.
- «Bo'lmadi» sababi va CEO istisnosining sababi majburiy: faqat bo'sh joydan
  iborat sabab 400 «Sababini yozing» bilan rad etiladi.
- Savol hech ochilmagan bo'lsa-yu, asl dars tugagach bekor qilish yoki
  ko'chirish o'chirilsa va davomat ham, savol ham yo'q bo'lsa, savol birinchi
  marta ochiladi. U faqat bekor qilish yoki ko'chirish dars tugashidan
  **oldin** qilingan bo'lsa **istisno** bo'ladi: ustoz bekor qilingan yoki
  ko'chirilgan darsga davomat kirita olmagan edi. Dars tugagandan keyin
  qilingan bo'lsa, oddiy (haq yozilmaydigan) savol ochiladi — aks holda dars
  tugagach bekor qilib, keyin o'chirish ustozga faqat CEO bera oladigan haqni
  berardi (CEO qarori, 2026-09-30). Ko'chirishdagi istisnoning sababi: «Dars
  oldindan ko'chirilgan edi». Ko'chirish o'chirilganda asl kun bayram bo'lsa
  yoki hali ham bekor qilingan bo'lsa, savol umuman ochilmaydi. Bekor qilish
  o'chirilganda esa bunday tekshiruv yo'q: kun shu orada boshqa kunga
  ko'chirilgan yoki bayram bo'lsa ham savol ochiladi, ko'chirilgan kunda esa
  unga javob berib bo'lmaydi (ma'lum cheklov, dizayn hujjati, 3.5).
- Ikki o'zgarish bir vaqtda to'qnashsa (masalan, dars tugashi tekshiruvi va
  davomat saqlash, yoki ikki kishi bitta darsni bekor qilsa), yutqazgan so'rov
  409 «Bir vaqtda boshqa o'zgarish bo'ldi — qayta urinib ko'ring» oladi; tizim
  o'zi qayta urinmaydi. Tor istisnolar (dizayn hujjati, 3.1, 12):
  - «Bo'lmadi» savol kutilayotganini o'z tranzaksiyasidan oldin tekshiradi.
    «Bo'ldi» shu orada yakunlansa, «Bo'lmadi → Bekor qilish» rad etilmay,
    hozirgina javob berilgan darsni bekor qiladi; «Bo'lmadi → Ko'chirish»
    esa 400 «Bu darsga «Bo'ldi» deb javob berilgan — uni ko'chirib
    bo'lmaydi» oladi.
  - QR skanerlash ham savolni o'z tranzaksiyasidan oldin tekshiradi: dars
    tugashidan bir lahza oldin tekshiruvdan o'tgan skaner savolni yurish
    ochgandan keyin yozsa, kunda ham davomat, ham javob kutilayotgan savol
    qoladi. Ustozga haq baribir yozilmaydi; bunday savol darsni bekor
    qilish yoki ko'chirish bilan yopiladi, «Bo'ldi» esa 400 oladi.
- Yangi ustoz akkauntsiz dars o'tgan yoki dars paytida server ishlamagan
  holatlar faqat CEO istisnosi bilan to'lanadi. Server yarim soatlik
  yurishlarni ham, 23:00 yurishini ham o'tkazib yuborgan kun esa umuman
  so'ralmaydi (22:30 dan keyin tugaydigan, tugash vaqti yo'q va yakshanba
  darslari uchun 23:00 ning o'zi o'tkazib yuborilsa yetarli); uni
  `scripts/open-unmarked-lessons.ts` tiklaydi va savolni istisno (haq yoziladigan) qilib ochadi.
- Oddiy (istisno bo'lmagan) savolga javob qachon berilmasin, ustozga haq
  yozilmaydi. Istisno savol (qoidadan oldingi kun, dars tugashidan oldin
  qilingan bekor qilish yoki ko'chirish o'chirilgani uchun ochilgan savol, CEO
  istisnosi) o'sha oyning oyligi hisoblangandan keyin «Bo'ldi» deb javob olsa,
  haq ochiq oyga «Oldingi oydan» bo'lib yoziladi (`createAccrual`,
  `creditPeriodDate`). Tushum har ikki holda dars kuniga (o'tgan oyga)
  yoziladi, shuning uchun o'tgan oyning Foyda kartasi keyin o'zgarishi mumkin.

## Ochiq ADR-0047, 0048, 0049 bilan munosabat

ADR-0047, 0048 va 0049 (PR #595, #596, #598) hali birlashtirilmagan; ular shu
ADR dan keyin, uning ustiga birlashtiriladi. CEO qarorlari, 2026-09-30:

- Yangi davomat oynasi — ADR-0047 dagi qoidaning o'zi: dars kuni,
  boshlanishidan oldin tugashigacha, hamma rol uchun, CEO ham.
- ADR-0047 dagi «dars tugagach hech kim, CEO ham, davomatni kirita olmaydi va
  o'zgartira olmaydi» qoidasini shu ADR almashtiradi. CEO 30.09 da tasdiqladi:
  olingan davomatni CEO, filial direktori va administrator dars tugagach ham
  tuzata oladi; dars tugagach yangi davomat kiritishning yagona yo'li —
  «Bo'ldi».
- ADR-0047 dagi shartnoma 3.2 qoidasi (to'lov qilmagan o'quvchi 2-darsdan
  boshlab darsga qo'yilmaydi) kuchga kirganda, «Bo'ldi» ichida ham amal
  qiladi: darsga qo'yilmagan o'quvchini «Keldi» deb belgilab bo'lmaydi.
- ADR-0048 dagi «Berilmadi» ro'yxatiga «Bo'ldi» orqali haqi yozilmagan
  darslar ham kirishi shart: ularda davomat bor, lekin ustozga haq yo'q.

## Ko'rib chiqilgan va rad etilgan

- **«Davomatsiz o'tdi» yozuvi** (kim kelgani yozilmasdan) — statistika, uzrli
  kredit va kelmaganlar sanog'i buzilardi; CEO «kim keldi»ni ham kiritishni
  talab qildi.
- **Telegramda javob tugmalari** — davomat ro'yxatini Telegramda to'ldirib
  bo'lmaydi; guruh tugmasini kim bosgani ishonchli emas, tugma esa pul qaytaradi.
- **Javobsiz darsni tizim o'zi hal qilsin** — ADR-0053 dagi sabab: tizim
  taxmin qilmaydi.
