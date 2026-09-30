# Davomati olinmagan dars — «Dars bo'ldimi?» savoli

**Sana:** 2026-09-29
**Holati:** Qabul qilindi — ADR-0054 (2026-09-30); amalga oshirishdagi farqlar 12-bo'limda
**Bog'liq:** ADR-0054 (shu dizayn qarori), ADR-0053 (bekor qilingan dars puli darhol qaytadi), ADR-0025 (Telegram
yig'ma xabar), PR #608 (ustoz faqat dars kuni davomat kiritadi), ADR-0047–0049 (ochiq PR #595,
#596, #598 — 12-bo'lim)

## 1. Muammo

Oylik to'lov modelida o'quvchi oyning barcha darslari uchun oldindan to'laydi.
Davomat pulga tegmaydi — u faqat ikki narsani hal qiladi: ustozga haq yoziladimi
va uzrli dars keyingi oyga kredit bo'ladimi (`lesson-billing.service.ts`,
`processMonthlyAttendance`).

Davomat umuman olinmagan darsda hozir:

- o'quvchi puli markazda qoladi, lekin dars **markaz tushumiga kirmaydi** —
  Foyda kartasi tushumni davomatdan o'qiydi (`valueHeldLessons`), shuning uchun
  foyda kam ko'rinadi;
- ustozga haq yozilmaydi, lekin davomatni keyin istalgan kun administrator
  kiritsa, haq yoziladi — «davomatni o'z vaqtida olmaslik» hech narsaga
  olib kelmaydi;
- dars aslida bo'lmagan bo'lsa, pul hech qachon qaytmaydi, agar kimdir darsni
  qo'lda bekor qilmasa. 29.09 dagi tekshiruvda shunday kunlar topilgan, ko'pi
  hali hal qilinmagan;
- tizim «dars bo'lmadi» bilan «davomat unutildi»ni ajrata olmaydi (ADR-0053).

**Hajm (ishchi baza, sentabr 01–28):** davomati bor darslarning oz qismida
davomat dars kunidan keyin kiritilgan. Bular va izsiz kunlar yangi jarayonga
tushadi. Faol guruhlarning hammasi oylik; yakshanba darsi yo'q; har filialda
kamida bitta faol administrator bor.

## 2. CEO qarorlari (29.09.2026)

| #   | Savol                   | Qaror                                                                                                                                         |
| --- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Qayerda so'raladi       | Tizimda: «Topshiriqlar» va «Jadval». Telegram faqat xabar beradi                                                                              |
| Q2  | «Bo'ldi» bosilsa        | Administrator kim kelgan-kelmaganini kiritadi. O'quvchi puli markazda, ustozga bu dars uchun haq **yozilmaydi**, uning ulushi markazda qoladi |
| Q3  | «Bo'lmadi» bosilsa      | Sabab so'raladi, dars bekor qilinadi (pul qaytadi), Telegram guruhiga **darhol** xabar                                                        |
| Q4  | Dars tugagach davomat   | **Yangi** davomatni oddiy yo'l bilan hech kim kiritolmaydi — faqat «Bo'ldi» orqali (Q2). Olingan davomatni administrator / direktor / CEO keyin tuzata oladi |
| Q5  | Javob bo'lmasa          | Tizim taxmin qilmaydi. Ertasi kun eslatma, 1 kundan ortiq javobsizlar CEO ko'radigan joyda                                                    |
| Q6  | Kim javob beradi        | Administrator, filial direktori, CEO                                                                                                          |
| Q7  | Topshiriq kimga         | Filialning barcha administratorlariga. Birinchi o'zgartirgan admin oladi, boshqalardan olib tashlanadi                                        |
| Q8  | Davomat oynasi          | Hamma rol uchun bir xil: faqat bugun, darsdan 10 daqiqa oldin — dars tugaguncha                                                               |
| Q9  | Ustoz aybdor bo'lmasa   | Faqat **CEO** «Bo'ldi» da «Ustoz aybdor emas, haq yozilsin» belgisini sabab bilan qo'ya oladi. Filial direktori — yo'q                          |
| Q10 | Dars keyin o'tiladi     | «Bo'lmadi» da ikki tanlov: «Bekor qilish» (pul qaytadi) yoki «Boshqa kunga ko'chirish» (pul qaytmaydi)                                        |
| Q11 | Eski izsiz kunlar       | Qoidadan oldingi kunlar: «Bo'ldi» bo'lsa ustoz haq oladi                                                                                      |

## 3. Jarayon

### 3.1 Davomat oynasi

- **Yangi** davomat (shu dars uchun hali hech qanday davomat yozuvi yo'q) — har qanday rol
  uchun faqat bugungi Toshkent sanasida, `lessonStartTime − 10 daqiqa` dan
  `lessonEndTime` gacha. Tugash vaqti **kirmaydi**: 17:30 da tugaydigan darsga
  17:29:59 gacha. Ko'chirilgan darsda ko'chirishning o'z vaqti.
- **Tuzatish** (davomat yozuvlari bor) — CEO, filial direktori, administrator istalgan
  vaqt, lekin `validateLessonDate` orqali: guruh `ACTIVE` bo'lishi, kun bayram
  yoki boshqa kunga ko'chirilgan bo'lmasligi shart. Ustoz tuzata olmaydi
  (mavjud qoida).
- QR sessiya boshlash va har bir QR skanerlash — yangi davomat bilan bir xil
  oyna (bitta qorovul, `assertAttendanceWindowOpen`); savol ochilgach
  skanerlash rad etiladi. Ma'lum cheklov: sessiya dars tugashida tugaydi, lekin
  oxirgi QR kodi yana 50 soniyagacha (`TOKEN_TTL`) amal qiladi. Sessiya
  tugagan bo'lsa, skanerlash vaqtni tekshirmaydi, faqat savol bor-yo'qligini
  tekshiradi. Savol esa keyingi :00 yoki :30 yurishida ochiladi (17:45 da
  tugagan dars — 18:00 da). Shuning uchun dars tugagach, shu 50 soniya ichidagi
  skanerlash darsning birinchi davomat yozuvini yozishi mumkin; keyin yurish
  davomatni ko'rib savol ochmaydi va ustoz haq oladi. Bu ish buni tuzatmaydi.
- Oldindan belgilash (`PlannedAbsence`) o'zgarmaydi: admin kelajakdagi kunga
  ham belgilay oladi. Shuning uchun oyna umumiy `validateLessonDate` ga emas,
  davomat saqlash, QR boshlash va QR skanerlash yo'llariga qo'yiladi. PR #608 dagi «ustoz
  faqat bugun» tekshiruvi `validateLessonDate` da qoladi.
- Dars tugagandan keyin yangi davomat kiritishning **yagona** yo'li — 3.4 dagi
  «Bo'ldi» (yuqoridagi QR cheklovidan tashqari).
- **Poyga:** davomat saqlash va `UnmarkedLesson` yaratish ikkalasi ham
  `Serializable` tranzaksiyada, har biri ikkinchisini tekshiradi (saqlash —
  `UnmarkedLesson` yozuvi bormi, yaratish — davomat bormi). Bir dars bir vaqtda ham davomatli,
  ham «olinmagan» bo'lib qolmaydi. Bu kafolat qo'lda saqlash va «Bo'ldi»
  uchun. QR skanerlash savolni o'z tranzaksiyasidan oldin tekshiradi: skaner
  dars tugashidan oldingi soniyada tekshiruvdan o'tib, yurish savolni
  ochgandan keyin yozsa, kunda ham davomat, ham `PENDING` savol bo'lib qolishi
  mumkin (juda tor oraliq; ustoz haqi baribir yozilmaydi — `createAccrual`
  qulfi). Bunday savol darsni bekor qilish yoki boshqa kunga ko'chirish bilan
  yopiladi; «Bo'ldi» esa 400 «Bu dars uchun davomat allaqachon olingan» oladi.

### 3.2 Dars tugaganda

Faol (`ACTIVE`, o'chirilmagan) guruhning davomat olinmagan, bekor qilinmagan,
boshqa kunga ko'chirilmagan, bayram bo'lmagan har bir tugagan darsi uchun:

1. `UnmarkedLesson` yozuvi (holati `PENDING`) yaratiladi.
2. Tizim topshirig'i yaratiladi (3.6).
3. Filial administratorlariga (hozirgi `ATTENDANCE_MISSING_ADMIN` kanallari)
   yangi matn: «Davomat olinmadi. Tizimda topshiriq ochildi: dars bo'ldimi?»
   + `/tasks` havolasi.
4. Ustozga yangi matnlar (eskisi «administrator bilan bog'lanib tiklang»
   derdi — endi noto'g'ri):
   - dars tugashiga 30 daqiqa qolganda: «Davomat dars tugaguncha olinmasa,
     bu dars uchun haq yozilmaydi»;
   - dars tugaganda: «Davomat dars vaqtida olinmadi — bu dars uchun haq
     yozilmaydi. Dars bo'lgan-bo'lmaganini administrator belgilaydi».

Dars tugashidagi savol (`sweepEndedLessons`) ko'chirilgan (`LessonReschedule`,
yangi vaqti bilan), bekor qilingan va filial bayrami kunlarini hisobga oladi.
Dars boshlanishi va tugashiga 30 daqiqa qolgandagi eslatmalar esa hanuz
guruhning o'z hafta kuni va vaqti bo'yicha ketadi: bekor qilingan yoki boshqa
kunga ko'chirilgan kunda ham «haq yozilmaydi» ogohlantirishi boradi,
ko'chirilgan (qo'shimcha) darsga esa bormaydi — bu ish buni tuzatmaydi.
Ikkalasini eslatma yurishi yuboradi (dushanba–shanba, 07:00–22:30, har :00
va :30 da), shuning uchun −30 ogohlantirishi faqat dars tugashi :00 yoki :30
ga to'g'ri kelsa va guruhning dars vaqtlari kiritilgan bo'lsa boradi. Aks
holda (masalan, 17:45 da tugaydigan dars, vaqtsiz guruh, yakshanbadagi dars)
ogohlantirish bormaydi, lekin yurish savolni ochganda ustozga haq baribir
yozilmaydi — bu ish buni ham o'zgartirmaydi.

`UnmarkedLesson` yozuvlari dushanba–shanba 07:00–22:30 oralig'ida har :00 va
:30 dagi yurishda bugun tugagan, davomati ham, savol yozuvi ham yo'q barcha
darslar uchun yaratiladi (o'tkazib yuborilgan
yurishni keyingisi to'ldiradi), shuningdek har kuni (yakshanba ham) 23:00 da
kunning qolgan darslari uchun. Yakshanbaga ko'chirilgan dars faqat 23:00 da
so'raladi.

### 3.3 Qayerda javob beriladi

- **Topshiriqlar** — topshiriq kartasida xuddi shu «Bo'ldi» / «Bo'lmadi»
  tugmalari bor: Jadvalga o'tmasdan, joyida javob beriladi.
- **Jadval** — ro'yxat ko'rinishida javobi kutilayotgan dars yonida ochiq turadigan
  oyna: «✅ Bo'ldi» / «❌ Bo'lmadi». Setka ko'rinishida dars kartasida doim
  ko'rinib turadigan «Dars bo'ldimi?» belgisi bor, u bosilganda shu tugmalar
  ochiladi. Sana tanlagich bilan o'tgan kunlar ham. Jadval faqat guruhning
  odatdagi hafta kunidagi darslarini ko'rsatadi: boshqa kunga ko'chirilgan
  (qo'shimcha) dars va keyin yopilgan guruh darsi u yerda chiqmaydi, istalgan
  filial bayrami kuni jadval bo'sh. Bunday savolga «Topshiriqlar» yoki guruh
  sahifasidan javob beriladi.
- **Guruh sahifasi, Davomat bo'limi** — ko'rinayotgan oyning «Davomat olinmagan
  darslar» ro'yxatida (ko'pi bilan 5 ta) va bugungi dars kartasida xuddi shu
  ikki tugma. O'sha kunning formasi ochilsa, u qulflangan va shu joylarga
  yo'naltiruvchi yozuv chiqadi.
- Topshiriq boshqa admin tomonidan olingan bo'lsa, qolgan adminlar «\<Ism
  Familiya> javob bermoqda» yozuvini ko'radi, tugmalar o'chiq. Direktor va CEO
  baribir javob bera oladi.
- Guruh sahifasidagi oddiy bekor qilish / ko'chirish topshiriqni kim olganini
  tekshirmaydi.

### 3.4 «Bo'ldi»

1. O'quvchilar ro'yxati ochiladi. Ro'yxat — **o'sha kuni guruhda bo'lgan**
   o'quvchilar (a'zolik oynasi qoidasi, `getLessonSequence` dagidek; farqi:
   holati o'zgargan sanasi yo'q yopiq yozilish ro'yxatga kirmaydi —
   `attendance/shared/roster-on-date.ts`), hozir faol bo'lganlar emas. Shunda keyin guruhdan chiqqan o'quvchi ham, oxirgi
   darsdan keyin yopilgan guruh ham to'g'ri belgilanadi. Guruh holati:
   o'chirilmagan bo'lsa bo'ldi (`ACTIVE` shart emas). Hamma belgilanishi shart.
2. Faqat CEO uchun formada belgi: «Ustoz aybdor emas, haq yozilsin» + majburiy
   sabab (masalan, akkaunt hali ochilmagan, server ishlamagan). Server CEO
   bo'lmagan chaqiruvchidan bu belgini 403 bilan rad etadi (rol bazadan
   o'qiladi, tokendan emas — ADR-0028). Server sababning boshi va oxiridagi
   bo'sh joylarni olib tashlaydi: faqat bo'sh joydan iborat sabab 400
   «Sababini yozing» bilan rad etiladi. Belgi bilan saqlansa
   `teacherPayExempt = true` va ustoz odatdagidek haq oladi.
3. Saqlashda, bitta `Serializable` tranzaksiyada:
   - `UnmarkedLesson` → `HELD`, `decidedById`, `decidedAt`;
   - davomat odatdagi to'lov hisobi yo'lidan yoziladi, **ustoz haqi yozilmaydi**
     (istisno belgisi bo'lmasa; 5-bo'lim);
   - sababli belgilanganlarga keyingi oy krediti odatdagidek;
   - oldindan belgilangan kelmasliklar odatdagidek iste'mol qilinadi;
   - guruhdan keyin chiqib ketgan o'quvchi (yozilishi endi `ACTIVE` emas)
     ro'yxatda bor, lekin paketli (oylik bo'lmagan) kursda undan pul olinmaydi va
     uning uchun jonli ustoz haqi ham yozilmaydi (istisno darsda oylik kunidagi
     markaz qo'shimchasi — `sweepGapLessons` — uni baribir to'laydi; hozir faol
     paketli guruh yo'q): yozilishni yopishda dars pullari
     allaqachon qaytgan, to'lov hisobi esa chiqib ketgan o'quvchidan butun sikl pulini
     olib, uni yopiq yozilishda qoldirardi. Oylik kursda hisob odatdagidek
     (oylik davomat balansga tegmaydi);
   - topshiriq yopiladi (3.6).

   Tranzaksiya yakunlangandan keyin: guruh davomati tarixi
   «DAVOMAT_KECH_KIRITILDI» (kim, qachon, ustoz haqi yozildimi va qaysi
   istisno bilan).
4. `attendance.completed` **yuborilmaydi** — u ustozga «Davomat qabul qilindi.
   Rahmat!» deydi. O'rniga ustozga (istisno bo'lmasa): «\<Guruh>, \<sana>:
   davomat dars vaqtida olinmagani uchun bu dars haqi yozilmadi».
   Tizim bildirishnomasi va telefon bildirishnomasi darhol, Telegram 20:00
   yig'mada.
5. Dars `valueHeldLessons` orqali markaz tushumiga kiradi (davomat yozuvlari bor).

### 3.5 «Bo'lmadi»

Oynada sabab (majburiy; server uni 3.4 dagidek tekshiradi — faqat bo'sh
joydan iborat sabab 400 «Sababini yozing») va ikki tanlov.

**A. «Bekor qilish» — pul qaytadi.**

1. Mavjud `LessonCancellationsService.create` — o'sha kunni qamragan barcha
   oylik hisoblar pulni darhol qaytaradi (ADR-0053).
2. Bekor qilish tranzaksiyasi ichida: shu kun uchun `UnmarkedLesson` bo'lsa →
   `NOT_HELD`, `cancellationId`; topshiriq yopiladi. Qaysi yo'ldan bekor
   qilinishidan qat'i nazar (guruh sahifasi, skript, shu oyna).
3. Ustoz va o'quvchilar odatdagi bekor qilish xabarini oladi.

**B. «Boshqa kunga ko'chirish» — qo'shimcha dars, pul qaytmaydi.**

1. Yangi sana va vaqt (xona faqat API orqali, ixtiyoriy — oynada
   tanlanmaydi). Yangi dars boshlanishi hozirdan
   **keyin** bo'lishi shart — aks holda uning davomatini ham hech kim
   ololmaydi va u ham «olinmagan» bo'lib qoladi.
2. Mavjud `LessonReschedulesService.create` (sabab bilan); pul hisobi
   o'zgarmaydi. Yangi qoidalar (qaysi sahifadan bo'lmasin): «Bo'ldi» deb javob
   berilgan kunni ko'chirib bo'lmaydi (400 «Bu darsga «Bo'ldi» deb javob
   berilgan — uni ko'chirib bo'lmaydi»); savolga javob bo'lgan
   ko'chirishning sanasi yoki boshlanish vaqti tahrirlansa, yangi dars hali
   boshlanmagan bo'lishi shart (400); qo'shimcha dars o'tgan bo'lsa (yangi
   kunida davomat yoki «Bo'ldi» javobi bor), ko'chirishning sanasini
   o'zgartirib bo'lmaydi (400 «Qo'shimcha dars kunida davomat olingan —
   ko'chirishning sanasini o'zgartirib bo'lmaydi»): yangi sana bitta darsga
   ikkinchi kun berib, uni ikki marta hisoblatardi. Sana o'zgartirilganda eski
   qo'shimcha dars kunining savoli B.5 dagidek yopiladi.
3. Tranzaksiya ichida: `UnmarkedLesson` → `RESCHEDULED`, `rescheduleId`;
   topshiriq yopiladi. Mavjud «ko'chirish» sahifasidan javobi kutilayotgan kun
   ko'chirilsa ham xuddi shunday.
4. Yangi kunda ustoz davomatni odatdagidek oladi va haq oladi (bu boshqa dars).
5. Ko'chirish o'chirilsa — savol yozuvi `PENDING` ga qaytadi, yangi topshiriq;
   kunda davomat bo'lsa, savol yozuvi o'zgarmaydi. Qo'shimcha dars (yangi kunda)
   o'tgan bo'lsa — davomat olingan yoki «Bo'ldi» deb javob berilgan (o'sha kungi
   ro'yxat bo'sh bo'lsa «Bo'ldi» davomat yozmaydi) — asl kun umuman qayta
   so'ralmaydi: aks holda bitta dars ikki marta hisoblanardi.
   Savol yozuvi hech ochilmagan bo'lsa (odatda ko'chirish
   darsdan oldin qilingan bo'ladi), asl dars tugagach o'chirilsa ham savol birinchi marta
   ochiladi, xuddi bekor qilishni o'chirishdagidek: davomat ham, savol yozuvi ham
   yo'q bo'lsa — yangi `PENDING` savol yozuvi. U faqat ko'chirish darsning tugash vaqtidan
   **oldin** yaratilgan bo'lsa (`createdAt`, Toshkent soati) istisno bo'ladi:
   `teacherPayExempt: true`, sabab «Dars oldindan ko'chirilgan edi». Tugash
   vaqtida yoki undan keyin yaratilgan bo'lsa — oddiy savol
   (`teacherPayExempt: false`, sababsiz): ustoz haq olmaydi, faqat CEO istisno
   qila oladi. Asl kun bayram bo'lsa yoki uning bekor qilinishi hali ham
   turgan bo'lsa — hech narsa ochilmaydi.

   **Qo'shimcha dars kunining o'z savoli.** Ko'chirish yangi kunni dars kuniga
   aylantiradi, shuning uchun u kun davomatsiz tugasa, yurish unga ham savol
   ochadi. Ko'chirish o'chirilganda yoki sanasi o'zgartirilganda (B.2),
   qo'shimcha darsning eski kuni o'sha tranzaksiya ichida, ko'chirish
   yozilgandan keyin, yurishning o'z qoidasi bilan qayta tekshiriladi
   (`lessonsOn`: haftalik jadval, amaldagi ko'chirishlar, bekor qilish, filial
   bayrami, guruh sanalari; `unmarked-lessons/make-up-day.ts`). U endi dars
   kuni bo'lmasa, o'sha kundagi javob kutilayotgan savol yopiladi: `NOT_HELD`,
   `cancellationId` va `rescheduleId` bo'sh, `decidedById` — ko'chirishni
   o'chirgan yoki o'zgartirgan kishi; topshiriq ham yopiladi; guruhga xabar
   ketmaydi (hech narsa bekor qilinmagan, dars o'z asl kunida so'raladi);
   `teacherPayExempt` o'zgarmaydi. Aks holda o'sha kunda «Bo'ldi» dars
   bo'lmagan kunga davomat yozar, asl kun esa yana so'ralardi — bitta dars
   ikki marta hisoblanardi. Zaxira qorovul: «Bo'ldi» va «Bo'lmadi →
   Ko'chirish» guruhning dars kuni bo'lmagan kunni (o'sha kuni amalda bo'lgan
   jadvalning hafta kunlarida yo'q va unga amaldagi ko'chirish tushmaydi;
   jadval keyin o'zgargani ahamiyatsiz — `noLessonScheduled`) 400 «Bu kunda
   dars rejalashtirilmagan» bilan rad etadi. Javob kutilayotgan qo'shimcha
   darsga yangi sana berilsa, u hozirdan keyin boshlanishi kerak.

**Ikkala tanlovda ham** Telegram guruhiga **darhol** xabar ketadi — tranzaksiya
yakunlangandan keyin (admin bot,
tasdiqlangan guruhlar, o'sha filialni ko'radiganlar — `isVisibleToGroup`, 20:00
guruh yig'masidagi qoida; pastdagi «Amalga oshirishdagi farqlar»ga qarang):

- A: «❌ Dars bo'lmadi — \<guruh>, \<sana> \<vaqt>. Sabab: … Belgilagan: \<ism>.
  Pul qaytarildi: N o'quvchi, \<summa> so'm» (`released.students`,
  `released.refunded`);
- B: «❌ Dars bo'lmadi — \<guruh>, \<sana> \<vaqt>. Sabab: … Ko'chirildi:
  \<yangi sana> \<vaqt>. Belgilagan: \<ism>».

Faqat `UnmarkedLesson` bor kunlar uchun — darsdan oldin qilingan oddiy bekor
qilish va ko'chirishlar guruhga yuborilmaydi.

**Bekor qilish o'chirilsa** (`DELETE /lesson-cancellations/:id`, CEO / direktor):
   - shu kun uchun `UnmarkedLesson` bo'lsa → `PENDING`, yangi topshiriq. Kunda
     davomat bo'lsa (masalan, «Bo'ldi» dan keyin bekor qilingan dars — sababli
     davomat yozuvlari qoladi), `UnmarkedLesson` yozuvi o'zgarmaydi: aks holda
     «Bo'ldi» hech qachon qabul qilinmasdi;
   - `UnmarkedLesson` yozuvi yo'q, lekin dars allaqachon tugagan va davomat yo'q bo'lsa (dars
     oldindan bekor qilingan, keyin bekor qilish xato deb o'chirildi) →
     yangi `PENDING` savol yozuvi. Bekor qilish darsning tugash vaqtidan **oldin**
     yaratilgan bo'lsa (`createdAt`, Toshkent soati) — `teacherPayExempt: true`,
     sabab «Dars bekor qilingan edi — ustoz davomat kirita olmagan»: ustoz
     bekor qilingan darsga davomat kirita olmagan edi, uni jazolash noto'g'ri.
     Tugash vaqtida yoki undan keyin yaratilgan bo'lsa — oddiy savol
     (`teacherPayExempt: false`): aks holda dars tugagach bekor qilib, keyin
     o'chirish ustozga faqat CEO bera oladigan haqni berardi;
   - pul avtomatik tiklanmaydi (mavjud qoida);
   - **ma'lum cheklov:** bu yo'l, ko'chirishni o'chirishdan (B.5) farqli, kun
     boshqa kunga ko'chirilgan yoki filial bayrami ekanini tekshirmaydi
     (`originalDayIsClosed` ning teskarisi yo'q), ko'chirish yaratish esa
     bekor qilingan asl sanani rad etmaydi. Masalan: D kun bekor qilindi,
     keyin D → D' ko'chirildi, D tugagach bekor qilish o'chirildi — D uchun
     `PENDING` savol (qayta yoki birinchi marta) ochiladi. Unga javob berib
     bo'lmaydi: «Bo'ldi» — 400 «Bu sana boshqa kunga ko'chirilgan», «Bo'lmadi»
     ning ikkala tanlovi ham 400. Savol ko'chirish o'chirilguncha ochiq turadi
     va har kuni 21:00 «Javobsiz darslar» qatorida sanaladi. Bayram kuniga
     ham shu yo'l bilan savol ochilishi mumkin. Bu ish buni tuzatmaydi.

### 3.6 Tizim topshirig'i

- `Comment` (`isTask: true`, `isSystem: true`, `authorId: null`),
  `entityType: 'Group'`, `entityId: groupId`.
- Matn: «\<guruh>, \<dd.MM.yyyy> \<HH:mm–HH:mm>: davomat olinmadi. Dars bo'ldimi?»
- Muddat: keyingi ish kuni (yakshanba va o'z filiali bayrami emas) 10:00
  Toshkent. Mavjud `TaskReminderService` 09:00 da eslatadi. U istalgan
  filialning bayramini tekshiradi, lekin bayram sanalari UTC yarim tunida
  saqlangani va joriy vaqt bilan solishtirilgani uchun 09:00 (04:00 UTC) da
  faqat ko'p kunlik bayramning oxirgi kunidan oldingi kunlarida to'xtaydi. Bir
  kunlik bayramda va ko'p kunlik bayramning oxirgi kunida eslatma baribir
  ketadi (bu ishdan oldingi xatti-harakat). Shuning uchun muddati boshqa
  filialning ko'p kunlik bayramiga (oxirgi kunidan tashqari) to'g'ri kelgan
  topshiriqqa 09:00 eslatma bormaydi (ma'lum cheklov).
- Beriladi: filialning barcha faol administratorlariga (hozirgi eslatma
  oluvchilar). Administrator yo'q bo'lsa — filial direktorlariga, ular ham
  bo'lmasa — CEO larga.
- Umumiy `task.assigned` bildirishnomasi **yuborilmaydi** — 3.2 dagi xabar
  yetarli, aks holda admin bitta dars uchun ikki xabar oladi. Administrator
  yo'q filialda topshiriq direktor / CEO ga tushadi, lekin ularga hech qanday
  xabar bormaydi (3.2 xabari faqat administratorlarga). Ular topshiriqni faqat
  «Topshiriqlar»da va 09:00 eslatmada ko'radi.
- **Olish.** Birinchi bo'lib holatni o'zgartirgan admin («Ko'rdim», kartani
  ustunga surish — mavjud `PATCH :id/assignee-status`) yoki darsga javob
  bergan admin topshiriqni oladi: bitta tranzaksiyada qolgan
  `CommentAssignee` qatorlari o'chiriladi, shart bilan (hali hech kim
  olmagan bo'lsa). Ikki admin aynan bir vaqtda bossa, yutqazgani 409
  «Topshiriq hozirgina o'zgardi. Sahifani yangilang» oladi (12-bo'lim);
  topshiriq olingandan keyin bosgan admin esa 409 «Bu topshiriqni \<ism> oldi»
  oladi.
- Olingan topshiriq faqat oluvchining «Topshiriqlar»ida ko'rinadi. Eslatma
  ham faqat unga.
- `DONE` faqat javob bilan. Tizim topshirig'ini qo'lda `DONE` qilish,
  tahrirlash, o'chirish — 400.
- Direktor yoki CEO javob bersa — topshiriq yopiladi (qolgan qatorlar `DONE`).
- Guruh o'chirilsa — uning `PENDING` topshiriqlari yopiladi (barcha nusxalari
  `DONE`, izohsiz), savol yozuvi `PENDING` holatida qoladi (ustozga haq baribir yo'q).
- «Kim berdi»: `author` bo'sh bo'lsa «Tizim». Muallifga ketadigan xabarlar
  (`task.status.changed`) muallifsiz topshiriqda o'tkazib yuboriladi.

### 3.7 Javobsiz qolsa

- Savol ochiq turadi, istalgan vaqt javob berish mumkin.
- 21:00 kunlik hisobotining «🚩 Diqqat» qismida: «Javobsiz darslar (1 kundan
  ortiq): N ta — «Topshiriqlar»da javob bering» — Telegram guruhi ko'radigan filiallar bo'yicha, o'chirilgan o'quv guruhlarisiz;
  0 bo'lsa chiqmaydi.
- Savolning yoshi `UnmarkedLesson` yozuvi yaratilgan vaqtdan (`createdAt`)
  sanaladi. Qayta ochilgan savol eski yozuvni ishlatadi va `createdAt` ni
  yangilamaydi, shuning uchun u asl ochilgan vaqtidan sanaladi va qayta
  ochilgan kuniyoq bu qatorga tushishi mumkin (ma'lum cheklov).

## 4. Ma'lumot modeli

```prisma
enum UnmarkedLessonStatus {
  PENDING
  HELD
  NOT_HELD
  RESCHEDULED
}

model UnmarkedLesson {
  id               String               @id @default(uuid())
  companyId        Int
  branchId         Int
  groupId          String
  date             DateTime             @db.Date
  lessonStartTime  String
  lessonEndTime    String
  status           UnmarkedLessonStatus @default(PENDING)
  teacherPayExempt Boolean              @default(false)
  exemptReason     String?
  claimedById      Int?                 // topshiriqni olgan administrator (3.6)
  decidedById      Int?
  decidedAt        DateTime?
  cancellationId   String?
  rescheduleId     String?
  taskCommentId    String?              @unique
  createdAt        DateTime             @default(now())
  updatedAt        DateTime             @updatedAt

  @@unique([groupId, date])
  @@index([companyId, status])
}
```

`Comment.authorId` → `Int?` (muallifsiz = tizim).

**Asosiy invariant:** `UnmarkedLesson` yozuvi bor va `teacherPayExempt = false`
bo'lgan `(groupId, date)` darsi uchun ustozga haq hech qachon yozilmaydi —
holatidan va keyingi tuzatishlardan qat'i nazar.

## 5. Ustoz haqi — ikki qulf

Ikki yordamchi (`unmarked-lessons/forfeited-lessons.ts`), bitta qoida (savol
yozuvi bor, `teacherPayExempt = false`): `isLessonPayForfeited(db, groupId, lessonDate)`
— bitta dars uchun; `loadForfeitedLessonKeys(db, { companyId, from, toExclusive })`
→ `Set<"groupId:YYYY-MM-DD">`.

1. **Yozish qulfi — `SalaryAccrualService.createAccrual`**
   (`isLessonPayForfeited`). Ustoz haqining darsga bog'liq har bir yozuvi shu
   yerdan o'tadi: jonli oylik haq, paket `bill()`, kechiktirilgan
   (`settleDeferredAccruals`), oylik kuni «markaz qo'shimchasi». Dars
   qulflangan bo'lsa — yozmaydi. `attendanceId` siz yozuvlar (balansdan
   yechish, `creditTeacher`) `createAccrual` dan o'tmaydi, shuning uchun
   tegilmaydi.
2. **Hisob qulfi — `sweepGapLessons` (`salary/shared/gap-sweep.ts`).** Uchala
   hisob — oylik kuni qo'shimcha, oylik sahifasi, «Qolgan (markaz)» — shu bitta
   funksiyadan o'tadi (`gap-sweep.single-source.spec.ts` buni qo'riqlaydi).
   Unga **majburiy** `forfeitedLessons` kirishi qo'shiladi; majburiy bo'lgani
   uchun yangi chaqiruvchi uni unutolmaydi (TypeScript xatosi).
   Istisno: oylik kunidagi BR-09b qoldiq sikli (o'tgan oylarning haqsiz
   darslari, `salary-calculation.service.ts`) `sweepGapLessons` dan o'tmaydi;
   unga `loadForfeitedLessonKeys` alohida qo'shilgan (yozish qulfi baribir
   qoplaydi).

Birinchisisiz jonli yo'l haq yozadi; ikkinchisisiz oylik sahifasi ustozga
qarzdek ko'rsatadi, oylik kunidagi avtomatik hisob esa (birinchi qulf
tufayli) yozmaydi — sahifa va
to'lov bir-biriga zid bo'lib qoladi.

Tushum tomonida o'zgarish yo'q: «Bo'ldi» davomat yozadi, `valueHeldLessons`
uni o'zi topadi.

## 6. Server o'zgarishlari

| Joy                                                         | O'zgarish                                                                                                        |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `prisma/schema.prisma` + migratsiya                         | `UnmarkedLesson`, `UnmarkedLessonStatus` turi, `Comment.authorId` bo'sh bo'lishi mumkin (`Int?`)                  |
| `attendance/shared/attendance-window.ts` (yangi)            | Yangi davomat oynasi — bitta sof funksiya                                                                        |
| `attendance/shared/attendance-window-guard.ts` (yangi)      | Oyna qorovuli (`assertAttendanceWindowOpen`): qo'lda saqlash, QR boshlash va QR skanerlash                        |
| `attendance-save.service.ts`                                | Yangi davomat → oyna; `UnmarkedLesson` yozuvi bor bo'lsa rad; `saveLate` («Bo'ldi», kech rejim: ro'yxat, `attendance.completed` yo'q) |
| `qr-attendance-session.service.ts`                          | Oyna                                                                                                             |
| `attendance/unmarked-lessons.service.ts` (yangi)            | Yaratish (`openForEndedLessons`), «Bo'lmadi» (`answerNotHeld`)                                                   |
| `unmarked-lessons/lesson-task.ts` (yangi)                   | Tizim topshirig'i: yaratish, olish (`claimSystemTask`), yopish                                                   |
| `unmarked-lessons/unmarked-lesson-info.ts` (yangi)          | Jadval / kalendar `unmarked` maydoni (`loadUnmarkedLessonInfos`)                                                 |
| `attendance.controller.ts`                                  | `POST :groupId/date/:date/late` (`entries`, faqat CEO uchun `teacherPayExempt` + `exemptReason`); `POST :groupId/date/:date/not-held` (`reason`, `action: CANCEL \| RESCHEDULE`, ko'chirishda `newDate`, vaqt, xona). Ikkalasi CEO / direktor / administrator, filial tekshiruvi bilan |
| `attendance-reminder.service.ts`                            | Savol yozuvi + topshiriq; har yarim soatlik yurishda to'ldirish; tugash savoli ko'chirish / bekor qilishni biladi (boshlanish va −30 eslatmalari bilmaydi); yangi admin va ustoz matnlari |
| `attendance-reminder.service.ts` (`closeDay`)               | Har kuni 23:00: kunning qolgan darslari — alohida `*.cron.ts` fayl yo'q, savol yozuvini `attendance/unmarked-lessons.service.ts` ochadi |
| `salary/salary-accrual.service.ts`                          | Yozish qulfi (5.1)                                                                                               |
| `salary/shared/gap-sweep.ts` + 3 chaqiruvchi + BR-09b qoldiq sikli | Hisob qulfi (5.2)                                                                                        |
| `lesson-cancellations.service.ts`                           | Yaratishda `NOT_HELD` + topshiriqni yopish + guruh xabari; o'chirishda 3.5 «Bekor qilish o'chirilsa» |
| `lesson-reschedules.service.ts`                             | Yaratishda `RESCHEDULED` + topshiriqni yopish + guruh xabari; o'chirishda 3.5 B.5 |
| `comments/*`, `notification-events.listener.ts`, `task-reminder.service.ts` | `author` bo'sh (`null`); tizim topshirig'i qoidalari; olish; `task.assigned` yo'q                          |
| `groups-write.service.ts`                                   | Guruh o'chirilsa topshiriqlarni yopish                                                                           |
| `dashboard.service.ts`                                      | Har darsga `unmarked: { id, status, teacherPayExempt, lessonStartTime, lessonEndTime, claimedBy } \| null`         |
| `telegram-groups/*`                                         | «Bo'lmadi» darhol xabari; 21:00 «Diqqat» qatori                                                                  |
| `telegram-digest`                                           | Ustozga «haq yozilmadi» kategoriyasi                                                                             |
| `telegram-groups/telegram-group-unmarked-lesson.listener.ts` | «Bo'lmadi» darhol xabari `sendTelegramText` (ruxsat etilgan `telegram-send.ts`) orqali; ADR-0025 ro'yxatiga qo'shimcha ADR-0054 da yozilgan, ADR-0025 va `direct-send.guard.spec.ts` o'zgarmaydi |
| `scripts/open-unmarked-lessons.ts`                          | Eski izsiz kunlar: avval sinov rejimi (hech narsa yozmaydi), keyin `--apply --expect=<N>` (N — sinov chiqargan son; yangi skan boshqa son bersa hech narsa yozilmaydi). Qamrov: `--from` (standart 2026-09-01) dan bugungacha (bugun kirmaydi), faqat `ACTIVE` guruhlar; noma'lum bayroq rad etiladi. `teacherPayExempt: true`, sabab «Qoida kuchga kirishidan oldingi dars (ADR-0054)» (Q11) |
| `docs/adr/0054-*.md`                                        | Yangi ADR (raqam band bo'lsa birlashtirishdan oldin qayta raqamlanadi)                                           |
| `server/CLAUDE.md`                                          | «Attendance (Davomat)» bo'limi, eslatmalar jadvali                                                               |

## 7. Sayt (`client/`) o'zgarishlari

- `components/attendance/unmarked/` (umumiy to'plam: `unmarked-lesson-prompt.tsx`,
  `late-attendance-dialog.tsx`, `not-held-dialog.tsx`). Jadvalning ro'yxat
  ko'rinishida (`dashboard/dashboard-daily-schedule.tsx`) dars yonida ochiq
  oyna, setka ko'rinishida (`dashboard/dashboard-room-occupancy.tsx`) «Dars
  bo'ldimi?» belgisi — bosilganda shu tugmalar ochiladi (3.3). «Bo'ldi» →
  davomat formasi (kech rejim; CEO ga «Ustoz aybdor emas» belgisi va sabab
  maydoni), «Bo'lmadi» → sabab + «Bekor qilish» / «Boshqa kunga ko'chirish»
  (sana, boshlanish va tugash vaqti) dialogi; xona oynada tanlanmaydi (API
  `newRoomId` ni ixtiyoriy qabul qiladi, oyna uni yubormaydi).
- `components/groups/attendance/*` — guruh sahifasidagi «Davomat» bo'limida xuddi
  shu oyna; kech rejimda ogohlantirish: «Ustozga bu dars uchun haq
  yozilmaydi» — savol allaqachon istisno bo'lsa (`teacherPayExempt`) yoki CEO
  «Ustoz aybdor emas» belgisini qo'ysa, ko'rinmaydi. Oddiy rejimda tugagan dars uchun yangi davomat qulflangan
  (administrator uchun ham), ustoz sahifasida ham.
- `components/tasks/task-card.tsx` — muallif yo'q → «Tizim»; tizim topshirig'ida
  tahrirlash / o'chirish / «Bajarildi» yo'q; kartaning o'zida «Bo'ldi» /
  «Bo'lmadi» tugmalari (`UnmarkedLessonPrompt`, 3.3) bor; «Bajarildi» ustuniga
  surib bo'lmaydi.
- Olishdan keyin ro'yxat yangilanadi.
- `client/` fayllariga `prettier` ishlatilmaydi.

## 8. Chegara holatlar

- **Davomat tugashdan bir soniya oldin saqlandi** — 3.1 poyga qoidasi (QR
  skanerlash uchun tor istisno ham o'sha yerda).
- **Ko'chirilgan dars** — asl kunga savol yozuvi ochilmaydi; yangi kunda
  ko'chirishning vaqti bilan. Ko'chirish asl dars tugagach o'chirilsa — 3.5 B.5.
  Istisno: kun avval bekor qilinib, keyin ko'chirilgan bo'lsa, bekor qilishni
  o'chirish asl kunga savol ochadi (3.5, «Bekor qilish o'chirilsa», ma'lum
  cheklov).
- **Oldindan bekor qilingan dars** — savol yozuvi ochilmaydi (o'chirilsa — 3.5, «Bekor qilish o'chirilsa»).
- **Yarim soatlik yurish o'tkazib yuborilsa** — o'sha kun ichida keyingi
  yurish yoki 23:00 yurishi to'ldiradi. 23:00 ham o'tkazib yuborilsa, o'sha kun
  hech qachon qayta ko'rilmaydi. 22:30 dan keyin tugaydigan darslar, tugash
  vaqti yo'q guruh darslari va yakshanba darslari faqat 23:00 da so'raladi,
  shuning uchun ular uchun 23:00 ning o'zi o'tkazib yuborilsa yetarli (masalan,
  server 23:00 da qayta ishga tushsa). Tiklash — `scripts/open-unmarked-lessons.ts`,
  lekin u savolni istisno (`teacherPayExempt: true`, «Qoida kuchga kirishidan
  oldingi dars») bilan ochadi.
- **«Bo'ldi» noto'g'ri bosilgan** — administrator, direktor yoki CEO darsni
  guruh sahifasidan keyin bekor qila oladi → `NOT_HELD`, pul qaytadi, guruhga
  xabar ketadi (ustoz haqi baribir yozilmaydi).
- **Oxirgi dars davomatsiz, keyin guruh yakunlandi** — savol guruh hali faol
  paytida ochilgan bo'lsa, «Bo'ldi» ishlaydi (javob berishda guruh holati shart
  emas, ro'yxat — o'sha kungi a'zolar). Guruh yopilgandan keyin bu davomatni
  tuzatib bo'lmaydi (400 «Guruh faol emas»). Noto'g'ri «Bo'ldi» faqat darsni
  bekor qilish bilan tuzatiladi.
- **O'quvchi darsdan keyin guruhdan chiqdi** — ro'yxatda bor (o'sha kungi a'zo).
  Paketli kursda undan pul olinmaydi (3.4). Uzrli belgilansa, kredit yopilgan
  yozilishning keyingi oyiga tushadi va ishlatilmaydi — ADR-0053 dagi ma'lum
  cheklov, bu ish uni kengaytirmaydi.
- **Ustozni almashtirish (`LessonTeacherOverride`)** — invariant darsga
  bog'langan; «haq yozilmadi» xabari o'sha kungi ustozlarga.
- **Topshiriq egasi ishdan ketsa** — direktor / CEO Jadval yoki guruh
  sahifasidan javob beradi.
- **Javob kechiksa va oy yopilsa** — oylik oyning 1-kuni 02:00 da hisoblanadi.
  Oddiy (istisno bo'lmagan) savolga javob qachon berilmasin, ustozga haq
  yozilmaydi. Istisno savol (qoidadan oldingi kun, dars tugashidan oldin
  qilingan bekor qilish yoki ko'chirish o'chirilgani uchun ochilgan savol, CEO
  istisnosi) o'sha oyning oyligi hisoblangandan keyin «Bo'ldi» deb javob olsa,
  haq ochiq oyga «Oldingi oydan» bo'lib yoziladi (`createAccrual`,
  `creditPeriodDate`). Tushum har ikki holda dars kuniga (o'tgan oyga) kiradi —
  o'tgan oyning Foyda kartasi keyin o'zgarishi mumkin.
- **Paketli kurs** — faol paketli guruh yo'q; yozish qulfi baribir qoplaydi.

## 9. Chiqarish

1. Sayt: Vercel'da yangi nusxa yig'iladi, lekin beshta domen hali unga
   ulanmaydi.
2. Server: 23:00 dan keyin (Toshkent) — `railway up`; server ishga tushganda
   avval `prisma migrate deploy` bajariladi.
3. Railway chiqarish muvaffaqiyatli tugaganini (`SUCCESS`) ko'rsatishi bilan
   beshta domen yangi sayt nusxasiga ulanadi (`vercel alias set`), ochiq admin
   sahifalari yangilanadi. Oraliq bo'lmasligi kerak: eski sayt muallifsiz
   («Tizim») topshiriqda yiqiladi, yangi sayt esa serverning yangi so'rov
   yo'llarini chaqiradi.
4. Skript (ertasi kuni): sinov rejimi (yozmaydi, faqat o'qish ulanishi) → CEO ro'yxatni
   ko'radi → `--apply --expect=<N>` (N — sinov rejimi chiqargan son; yangi skan
   boshqa son bersa hech narsa yozilmaydi). Qamrov: `--from` (standart
   2026-09-01) dan bugungacha, faqat `ACTIVE` guruhlar.

   Chiqarilgan kuni chiqarishdan oldin tugagan darslarni skript olmaydi (faqat
   bugundan oldingi kunlar). Ularni birinchi yurish yoki 23:00 yurishi oddiy,
   haq yozilmaydigan savol sifatida ochadi. Shuning uchun serverni o'sha kungi
   darslar tugagach, 23:00 dan keyin chiqaring va skriptni ertasi kuni ishga
   tushiring. Aks holda bu darslarga CEO «Bo'ldi»da istisno qo'yadi.
5. Birinchi kun: ishchi tizimda birinchi savol yozuvlari, topshiriqlar, Telegram matnlari va
   21:00 qatorini tekshirish.

## 10. Testlar

- Oyna: har rol × (bugun oynada / oynadan oldin / tugash daqiqasida / keyin /
  o'tgan kun / kelajak) × (yangi / tuzatish).
- Poyga: `UnmarkedLesson` yozuvi bor bo'lsa saqlash rad etiladi; davomat bor
  bo'lsa savol yozuvi yaratilmaydi.
- «Bo'ldi»: ro'yxat o'sha kungi a'zolar; ustozga `SalaryAccrual` yo'q; keyin
  `EXCUSED` → `PRESENT` tuzatilsa ham yo'q; sababli kredit yoziladi;
  `attendance.completed` yo'q; yopilgan guruhda ishlaydi.
- Yozish qulfi: `createAccrual` qulflangan darsga yozmaydi
  (`isLessonPayForfeited`). Hisob qulfi: `sweepGapLessons` o'tkazib yuboradi.
- `teacherPayExempt` darsi odatdagidek haq oladi; belgini CEO qo'ya oladi,
  direktor va administrator — 403.
- «Bo'lmadi → Bekor qilish»: bekor qilish + `NOT_HELD` + topshiriq yopildi +
  guruh xabari (tranzaksiya yakunlangandan keyin); oddiy oldindan bekor qilishda guruh xabari
  yo'q.
- «Bo'lmadi → Ko'chirish»: yangi dars boshlanishi o'tgan bo'lsa — 400;
  aks holda ko'chirish + `RESCHEDULED` + topshiriq yopildi + guruh xabari; pul
  qaytmaydi; ko'chirish o'chirilsa — 3.5 B.5.
- Bekor qilish yoki ko'chirish o'chirilsa: 3.5 dagi barcha holatlar — javob
  berilgan savol, davomatli kun, qo'shimcha darsda davomat, birinchi marta
  ochiladigan savol tugashdan oldin (istisno) va keyin (oddiy) yaratilgan
  bekor qilish / ko'chirish bilan.
- To'qnashuv: yutqazgan so'rov 409 (bitta tor istisno — «Bo'ldi» bilan deyarli
  bir vaqtda kelgan «Bo'lmadi → Bekor qilish», 12-bo'lim); dars bekor qilingan yoki ko'chirilgandan
  keyin «Bo'ldi» — 404 «Javob kutilayotgan dars topilmadi» (ikkalasi bir vaqtda
  bo'lsa — 409); javob kutilayotgan savol bekor qilingan yoki boshqa kunga
  ko'chirilgan kunda qolib ketgan bo'lsa — 400 (zaxira qorovul); mavjud
  bo'lmagan sana (`2026-02-30`) — 400.
- Olish: birinchisi oladi, ikkinchisi 409; qolgan qatorlar o'chadi; eslatma
  faqat egasiga.
- Tizim topshirig'ini qo'lda `DONE` / tahrir / o'chirish — 400; `task.assigned`
  yuborilmaydi; muallifsiz topshiriqda `task.status.changed` yiqilmaydi.
- Yurishlar (yarim soatlik va 23:00): bir darsga ikki savol yozuvi yo'q; ko'chirilgan / bekor qilingan / bayram
  kunlari savol yozuvi yo'q; muddat bayram va yakshanbani o'tkazib yuboradi.
- Yangi so'rov yo'llari uchun rol va filial qorovuli testlari.

## 11. Kiritilmagan

- Topshiriqni qaytarish yoki boshqa adminga o'tkazish.
- Telegramda javob berish tugmalari (davomat ro'yxatini Telegramda to'ldirib
  bo'lmaydi; guruh tugmasini kim bosgani ishonchli emas, tugma esa pul qaytaradi).

## 12. Amalga oshirishdagi farqlar (2026-09-30)

Quyidagilar 29.09 da kelishilgan asl dizayndan farq qiladi. Ularning ko'pi
yuqoridagi matnga allaqachon kiritilgan; bu ro'yxat nima va nega o'zgarganini
qayd etadi. Kod va ADR-0054 shuni aytadi.

- **Guruh xabarining ko'rinishi (3.5).** Asl dizayn `reportBranchIdsForGroup` ni
  nomlagan edi; kodda `isVisibleToGroup` (20:00 guruh yig'masining qoidasi).
  Ular faqat filialsiz eski guruhda farq qiladi (`receivesAllBranches: false`,
  filial yo'q): hisobotlar uni kompaniya bo'yicha ko'rsatadi, `isVisibleToGroup`
  esa yopiq qoldiradi. Ataylab shunday: darhol xabar ham yig'ma bilan bir xil
  qoidaga bo'ysunadi.
- **Oldindan ko'chirilgan dars (3.5 B.5, 8).** Ko'chirishni o'chirish ham,
  bekor qilishni o'chirishdagidek, savolni (birinchi marta) ochadi (CEO qarori,
  2026-09-30).
- **Chiqib ketgan o'quvchining puli (3.4).** Kech davomatda paketli kursda undan
  pul olinmaydi va unga jonli ustoz haqi yozilmaydi (istisno darsda oylik
  kunidagi markaz qo'shimchasi uni baribir to'laydi); oylik kursda hisob
  odatdagidek (CEO qarori, 2026-09-30).
- **Bayram filial bo'yicha (3.2).** Tekshiruvda, davomat eslatmasida, tugash sanog'ida va
  guruh kalendarida bayram `findActiveHolidayCovering(sana, filial)` bilan
  hisoblanadi: bir filialning bayrami boshqasining darsini yopmaydi. Jadval,
  QR sessiyadagi dars raqami va 09:00 topshiriq eslatmasi (`TaskReminderService`)
  esa hanuz istalgan filial bayramini hisobga oladi (3.3, 3.6).
- **QR skanerlash (3.1).** Asl dizayn faqat sessiya boshlashni oynaga bog'lagan edi;
  skanerlash ham shu qorovuldan o'tadi va savol ochilgach rad etiladi. Sessiya
  muddati dars tugashigacha, Toshkent soati bilan. Oxirgi QR kodi esa
  sessiyadan keyin 50 soniyagacha amal qiladi va unda vaqt tekshirilmaydi —
  3.1 dagi ma'lum cheklov (dars tugagach birinchi davomat yozuvi yozilishi va
  ustoz haq olishi mumkin).
- **21:00 hisobot (3.7).** «Javobsiz darslar» qatori «Diqqat» belgisi, shuning
  uchun u kun svetoforini 🟡 qiladi.
- **Fayllar va shakllar (4, 6).** Oyna `attendance/shared/attendance-window.ts`
  da; alohida `unmarked-lessons.cron.ts` yo'q — 23:00 yurish
  `AttendanceReminderService.closeDay`, mantiq `server/src/unmarked-lessons/`
  va `UnmarkedLessonsService` da. Jadval va kalendardagi `unmarked` maydoni:
  `{ id, status, teacherPayExempt, lessonStartTime, lessonEndTime, claimedBy }`.
  `GET /attendance/:groupId/date/:date` `effectiveStartTime` /
  `effectiveEndTime` ni ham qaytaradi. `UnmarkedLesson` da `Group` bilan
  bog'lanish va `(branchId, status)` indeksi ham bor.
- **Birinchi marta ochiladigan savolning istisnosi (3.5, 8).** Asl dizayn bekor
  qilish o'chirilganda birinchi marta ochiladigan har bir savolni istisno
  (`teacherPayExempt: true`) qilgan edi; ko'chirishni o'chirishda savol
  ochilishi keyin qo'shildi (yuqoridagi «Oldindan ko'chirilgan dars» bandi). Kodda
  (`unmarked-lessons/unmarked-lesson-transitions.ts`, `openFirstTimeQuestion`)
  u faqat o'chirilgan bekor qilish / ko'chirish darsning tugash vaqtidan
  (Toshkent soati; boshqa ko'chirish kelib tushgan kunda o'sha ko'chirishning
  vaqti) oldin yaratilgan bo'lsa istisno; tugash vaqtida yoki undan keyin
  yaratilgan bo'lsa — oddiy, haq yozilmaydigan savol (CEO qarori,
  2026-09-30). Qayta so'rash kunda davomat bo'lsa o'tkazib yuboriladi;
  ko'chirishning yangi kunida davomat olingan bo'lsa, asl kun qayta
  so'ralmaydi.
- **Bir vaqtdagi o'zgarishlar (3.1, 3.4, 3.5).** Tranzaksiya to'qnashuvida
  (`P2034` yoki Postgres `40P01`) yutqazgan so'rov xom 500 emas, 409 «Bir
  vaqtda boshqa o'zgarish bo'ldi — qayta urinib ko'ring» oladi
  (`common/transaction-conflict.ts`); tizim o'zi qayta urinmaydi. Bu davomat
  saqlash, «Bo'ldi», «Bo'lmadi», bekor qilishni yaratish / o'chirish va
  ko'chirishni yaratish / tahrirlash / o'chirish yo'llarida. Bekor qilish va
  ko'chirishda bir vaqtdagi takroriy bekor qilish yoki ko'chirish (`P2002`) ham
  shu 409. Topshiriqni
  olishning o'zidagi to'qnashuv (3.6) esa 409 «Topshiriq hozirgina o'zgardi.
  Sahifani yangilang».

  Ma'lum cheklov: «Bo'lmadi → Bekor qilish» savol `PENDING` ekanini va
  topshiriqni kim olganini bekor qilish tranzaksiyasidan oldin, uning
  tashqarisida tekshiradi; bekor qilish tranzaksiyasi esa `HELD` savolni ham
  qabul qiladi (8-bo'lim: noto'g'ri «Bo'ldi»ni tuzatish uchun). «Bo'ldi» shu
  ikki orada yakunlansa, «Bo'lmadi» 404 yoki 409 olmaydi: u hozirgina «Bo'ldi»
  deb javob berilgan darsni bekor qiladi — davomat yozuvlari sababliga o'tadi,
  pul qaytadi, savol `NOT_HELD` bo'ladi va guruhga «Dars bo'lmadi» xabari
  ketadi. Juda tor oraliq. «Bo'lmadi → Ko'chirish» da bunday emas: `HELD`
  savolli kunni ko'chirish 400.
- **Bekor qilingan yoki ko'chirilgan kun (3.2, 3.4).** Savol ochilayotganda
  kunning bekor qilinishi va ko'chirilishi o'sha `Serializable` tranzaksiya
  ichida qayta o'qiladi (`lessonDayTakenAway`, `unmarked-lessons/answer-rules.ts`):
  shu orada bekor qilingan yoki boshqa kunga ko'chirilgan dars uchun savol
  ochilmaydi. Savol ochilgandan keyingi bekor qilish yoki ko'chirish uni o'z
  tranzaksiyasida `NOT_HELD` / `RESCHEDULED` qiladi, shuning uchun keyin
  bosilgan «Bo'ldi» 404 «Javob kutilayotgan dars topilmadi» oladi; ikkalasi
  bir vaqtda bo'lsa — 409. «Bo'ldi» dagi `lessonDayTakenAway` tekshiruvi (400
  «Bu dars bekor qilingan — davomat kiritib bo'lmaydi» / «Bu sana boshqa kunga
  ko'chirilgan — davomatni yangi sanada oling») — zaxira qorovul: u faqat javob
  kutilayotgan savol bekor qilingan yoki ko'chirilgan kunda qolib ketgan
  holatda ishlaydi. Aks holda uzrli o'quvchiga pul ikki marta qaytardi yoki
  bekor qilingan dars uchun pul olinardi.
- **Sana tekshiruvi (6).** `POST …/late` va `POST …/not-held` sanani haqiqiy
  kalendar kuni sifatida tekshiradi (`isCalendarDateStr`): `2026-02-30` kabi
  sana martga surilmaydi, 400 «Noto'g'ri sana formati. YYYY-MM-DD formatda
  kiriting» oladi.
- **Qo'shimcha dars kunining savoli (3.5 B.2, B.5).** Asl dizayn ko'chirish
  o'chirilganda yoki sanasi o'zgartirilganda qo'shimcha dars kunining o'z
  savolini ko'zda tutmagan edi: u javob kutib qolardi, unga «Bo'ldi» bosilsa,
  asl kun ham qayta so'ralib, bitta dars ikki marta hisoblanardi. Endi u kun
  dars kuni bo'lmay qolsa, savol `NOT_HELD` bo'lib yopiladi; qo'shimcha dars
  kunidagi «Bo'ldi» javobi davomat kabi hisoblanadi (asl kun qayta
  so'ralmaydi); o'tgan qo'shimcha darsning sanasini o'zgartirish 400; «Bo'ldi»
  dars kuni bo'lmagan kunni 400 bilan rad etadi (yakuniy tuzatish,
  2026-09-30).
- **Bo'sh sabab (3.4, 3.5).** «Bo'lmadi» sababi va CEO istisnosining sababi
  tekshiruvdan oldin qirqiladi (`@Transform`), shuning uchun faqat bo'sh
  joydan iborat sabab 400 «Sababini yozing» oladi. Guruh sahifasidagi oddiy
  bekor qilishning sababi (`CreateLessonCancellationDto.reason`) esa hanuz
  bo'sh joyni qabul qiladi (ma'lum cheklov).
- **Ochiq ADR-0047, 0048, 0049 (PR #595, #596, #598).** Asl dizayn ularni
  tilga olmagan edi: ular alohida ishlab chiqilgan va hali birlashtirilmagan.
  Shu ish birinchi chiqadi, ular keyin uning ustiga birlashtiriladi. CEO
  qarorlari (2026-09-30):
  - yangi davomat oynasi — ADR-0047 dagi qoidaning o'zi;
  - ADR-0047 dagi «dars tugagach hech kim, CEO ham, davomatni kirita olmaydi
    va o'zgartira olmaydi» qoidasini ADR-0054 almashtiradi: olingan davomatni
    CEO, filial direktori va administrator dars tugagach ham tuzata oladi
    (Q4), yangi davomatning yagona yo'li — «Bo'ldi»;
  - ADR-0047 dagi shartnoma 3.2 qoidasi kuchga kirganda «Bo'ldi» ichida ham
    amal qiladi: darsga qo'yilmagan o'quvchini «Keldi» deb belgilab bo'lmaydi;
  - ADR-0048 dagi «Berilmadi» ro'yxatiga «Bo'ldi» orqali haqi yozilmagan
    darslar ham kiradi.
- **Chiqarish tartibi (9).** Asl dizayn serverni birinchi chiqarardi. Yakuniy
  ko'rik (2026-09-30) tartibni o'zgartirdi: sayt Vercel'da oldindan
  yig'iladi, server 23:00 dan keyin chiqadi va Railway `SUCCESS` deyishi
  bilan beshta domen yangi saytga ulanadi — eski sayt muallifsiz topshiriqda
  yiqiladi, yangi sayt esa serverning yangi so'rov yo'llarisiz ishlamaydi.
