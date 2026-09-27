# ADR-0038 — Foyda tarkibi: dars qaysi hisob bilan yechilgan bo'lsa, o'sha narxda; xodim bitta filialda sanaladi

**Holati:** Qabul qilindi
**Sana:** 2026-09-27
**Bog'liq:** `server/src/reports/reports-profit-composition.service.ts`, `server/src/common/finance/monthly-per-lesson.ts` (`resolveHeldLessonPrice`), `server/src/salary/salary-monthly-staff.service.ts` (`staffBranchBasis`), ADR-0006, ADR-0037

## Kontekst

CEO Foyda kartasi bosilganda «Tushum tarkibi» kabi tushuntirish so'radi:
sof foyda nimadan chiqdi va oy oxiriga qancha qoladi. Oynani prod'dagi
sentabr ma'lumotida (26.09.2026) tekshirganda uch muammo chiqdi.

1. **Sentabr darslari eski narxda sanalardi.** Oylik to'lovga o'tish
   (26.09) sentabrning 12 talik yechimlarini bekor qilib, oylik hisob yozdi.
   Lekin darslarning nol summali `LESSON_CONSUMPTION` belgilari qoldi.
   `getRecognizedRevenue` avval shu belgini o'qirdi va 3 778 darsni eski
   12 talik narxda sanardi. O'sha darslar uchun ustoz haqi esa yangi oylik
   narxda qayta hisoblangan edi. Farq: kompaniya bo'yicha +2 112 978
   (Namangan +2,8 mln, Farg'ona −0,7 mln).
2. **Bitta administrator ikki filialda sanalardi.** Xodimlar ro'yxati
   filialga «biriktirilgan» (`UserBranch`) bo'yicha olinadi. Farg'ona
   xodimi Namanganga ham biriktirilgani uchun uning 3 000 000 oyligi
   Namangan kartasida ham ayirilardi. Natija: ikki filial foydasi
   qo'shilganda umumiy raqamdan 3 mln kam chiqardi.
3. **Oy o'rtasidagi foyda aldaydi.** 26 sentabrda karta 69,1 mln
   ko'rsatdi. Ijara, soliq va svet esa oyning oxirgi kunlarida yoziladi.
   Iyulda ham shunday bo'lgan: 26 iyulda 43,9 mln, oy 18,5 mln bilan
   yopilgan.

## Qaror

1. **Dars o'zini yechgan hisob narxida sanaladi** (`resolveHeldLessonPrice`).
   Tartib:
   - shu kunni qoplagan (`coveredDates − frozenOutDates`) oylik hisob bo'lsa,
     uning muzlatilgan narxi;
   - aks holda `LESSON_CONSUMPTION` narxi;
   - aks holda oylik hisob narxi (u sanani qoplamagan bo'lsa ham).

   `getRecognizedRevenue` va «Oy oxiriga kutilyapti» (`reports-expectation`)
   shu BITTA funksiyadan o'qiydi.
2. **Foyda hisobida xodim bitta filialga tegishli:** `mainBranch`, u bo'lmasa
   biriktirilgan eng kichik filial (`staffBranchBasis: 'home'`). Bu qoida
   foydani yig'adigan joylarga qo'llanadi: Foyda kartasi, uning tarkibi,
   Excel «Sof foyda». Oyliklar sahifasi avvalgidek hamma biriktirilgan
   xodimni ko'rsatadi, chunki u «bu filialda kim ishlaydi» degan savolga
   javob beradi.
3. **Oy tugamagan bo'lsa, oyna oy oxirini taxmin qiladi.** Taxmin shunday
   yig'iladi:
   - joriy foyda;
   - qolgan darslar: «Oy oxiriga kutilyapti» (`getMonthlyExpectation`) minus
     hozirgacha tan olingan darslar. U bekor qilingan va ko'chirilgan
     darslarni, bayramlarni biladi, shuning uchun ikki prognoz bir-biriga
     zid chiqmaydi. Qoldiq umumiy summadan olinadi, shuning uchun kun
     davomida belgilangan dars kunlik keshda ikki marta sanalmaydi;
   - minus shu darslarga ustoz haqi, oyning hozirgi ulushida;
   - minus o'tgan oyda bo'lib, bu oy hali yozilmagan doimiy xarajatlar:
     ijara, kommunal, soliq. «Boshqa» turida yozilgan «Soliqlar» ham soliq
     sanaladi, chunki markaz uni o'sha yerga yozadi.

   Taxmin «≈» bilan ko'rsatiladi va karta raqamini o'zgartirmaydi.
4. **Tarkib kartaning o'z hisobidan olinadi.** Tarkib alohida qayta
   hisoblanmaydi: `assembleMonthlyNetProfit` qaytargan qatorlardan
   yig'iladi, ular Foyda kartasi hisoblanadigan qatorlarning o'zi. Qo'shimcha
   so'rovlar faqat tushuntiradi (xarajat yozuvlari, qolgan darslar, qarz
   bilan ketganlar), raqamni o'zgartirmaydi.

## Oqibatlar

- Sentabr 2026 foydasi 69 108 500 dan 67 010 289 ga tushdi. Iyun, iyul va
  avgust o'zgarmadi (prod'da tekshirildi: 4 781 229 / 18 544 732 /
  13 611 708), chunki u oylarda oylik hisob yo'q.
- Farg'ona + Namangan = kompaniya (48 298 686 + 18 711 603 = 67 010 289).
- Trend grafigi va «Oy oxiriga kutilyapti» keshlarining kaliti `v2` ga
  o'tdi, aks holda ular yarim tungacha eski formulani ko'rsatib turardi.
- Bir oyda guruhdan chiqib qayta qo'shilgan o'quvchining ikkala oylik
  hisobi ham hisobga olinadi (`earlierCharges`): ikkala davrdagi darslar
  ham oylik narxda sanaladi.
- Taxmin o'tgan oyning doimiy xarajatlariga tayanadi. O'tgan oy g'ayrioddiy
  bo'lsa (masalan, avgustda svet uch marta to'langan), taxmin ham shunga
  ergashadi. Oynada summaning qaysi oydan olingani yozib qo'yilgan.
- «Qarz bilan ketgan o'quvchilar» faqat hech bir guruhda o'qimayotgan
  qarzdorlarni sanaydi. Boshqa guruhga o'tgan o'quvchining qarzi odatdagi
  tartibda undiriladi.
