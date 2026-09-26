# To'lovlar hisoboti: o'quvchining barcha to'lovlari va ular qayerga ketgani

**Sana:** 2026-09-26
**Holat:** Dizayn ma'qullangan (2026-09-26). CEO PDF'ning 8 misolini (v3) va uch
joyning maketini (admin tabi, o'quvchi portali, Telegram bot) ko'rib «Hammasi
yaxshi» dedi.
**Bog'liq:** ADR-0004 (ledger'ga langarlangan balans), ADR-0006 (oylik yagona
manbasi), `server/src/common/finance/ledger-replay.ts`, PR #571 (bir guruhga
qayta qo'shilganda dars ikki marta olinmaydi). Pul qoidalari uchun yangi ADR
yoziladi (pastda «Pul qoidalari»).

## Muammo

«Pulim qayerga ketdi?» degan savolga hozir hech bir joy to'liq javob bermaydi.

- **Admin, o'quvchi profili → «To'lovlar» tabi.** Faqat oxirgi 20 yozuv
  ko'rinadi, sahifalash yo'q. «Qarz tushuntirishi» kartasi qarzni 12 talik
  usulda sanaydi («N ta darsga keldi → …»). Sentabrdan beri oylik to'lov
  qatorlarini to'g'ri o'qiy olmaydi: `MONTHLY_PERIOD` qatorida `coverage`
  yo'q, u «hali o'tilmagan darslar» bo'lib chiqadi.
- **O'quvchi portali.** Balans va xom «Balans tarixi» bor, xolos. Hisobotni
  yuklab olib bo'lmaydi.
- **Telegram bot.** Menyuda «💳 To'lovlar» tugmasi bor, lekin u faqat «Bu
  funksiya tez kunda ishga tushadi!» deydi.
- **Oylik to'lovga o'tish (26.09) tushuntirilmagan.** O'quvchi sentabr summasi
  nega avgustnikidan farq qilishini hech qayerda ko'rmaydi.

## Maqsad

Bitta hisobot, bitta manba — uch joyda:

| Joy | Kim | Nima |
|---|---|---|
| Admin: o'quvchi profili → «To'lovlar» | CEO, filial direktori, administrator (hozirgidek), faqat o'z filiali | Hisobot ekranda va «PDF yuklab olish» |
| O'quvchi portali → «To'lovlar» | O'quvchining o'zi | «To'lovlar hisoboti — PDF yuklab olish» kartasi |
| Telegram bot → «💳 To'lovlar» | Telegram'i o'quvchiga ulangan odam | Qisqa javob va PDF fayl |

Ekrandagi hisobot va PDF bitta server modelidan quriladi. Raqamlar bir-biridan
farq qila olmaydi.

## Hisobot tarkibi (CEO ma'qullagan, v3)

Tepadan pastga:

1. **Sarlavha.** «To'lovlar hisoboti», o'quvchi (ism, ID, guruh, kurs, oylik narx,
   chegirma bo'lsa chegirmali narx), «DD.MM.YYYY holatiga».
2. **Javob qutisi.**
   - Qarz bo'lsa (qizil): «Qarzingiz: X so'm». Ostida qaysi oydan: «sentabr
     darslari uchun A · iyuldan qolgan B».
   - Ortiqcha bo'lsa (yashil): «Qarzingiz yo'q. Hisobingizda X so'm ortiqcha pul
     bor. U oktabr to'loviga o'tadi.»
   - Nol bo'lsa: «Qarzingiz yo'q. Hisobingiz nolda: qarz ham, ortiqcha pul ham
     yo'q.»
3. **Bitta tenglama.** «To'lagansiz P + [boshqa kirimlar] − o'qigan darslaringiz
   L − [boshqa chiqimlar] = ±B». Har bir had pastda topiladigan jami.
4. **«Oylar bo'yicha» jadval.** Ustunlar: Oy · Darslar · Darslar narxi ·
   To'langan · Oy oxirida.
   - Paket davri bo'lsa, jadval ustida bitta qator: «Sentabrgacha pul 12
     darslik paket uchun to'lanardi. Jadvalda esa har dars o'tilgan oyiga
     yozilgan, shuning uchun bir oyda 12 tadan ko'p yoki kam dars bo'lishi
     mumkin.» Paket hajmi kursdan olinadi (12, 19, 20).
   - «Darslar» ustunida «13 ta · 4 kelmagan». Kelmagan = sababsiz qoldirilgan
     dars, u ham hisoblanadi.
   - Oy qatori ostidagi kulrang izohlar: oylik to'lov («13 dars × 34 615»,
     «19-sentabrdan, 12 darsdan 5 tasi»), boshqa guruhdagi eski usuldagi dars,
     uzrli dars krediti, bir necha guruh, to'lov bo'lmagan pul (chegirma, qarz
     kechirildi, naqd qaytarildi), darsga qo'shib yuborilgan ichki yozuv
     («19.08: guruhdan chiqqanda paketdagi o'tilmagan 3 dars puli qaytarildi»).
   - Aprel: «tizimga qadar to'langan». Darsi yo'q oraliq oy: «hisoblangan dars
     yo'q».
   - **Keskin farq.** Oxirgi oy oldingi darsli oydan kamida 50 000 so'm va 20%
     farq qilsa, qator sariq bo'ladi. Ostida sabab yoziladi: dars soni, 1 dars
     narxi, guruhga kirish yoki chiqish (sanasi bilan, uzilish bo'lsa «… dan beri
     darsda bo'lmagan»), to'lov turining o'zgarishi.
5. **To'lov turi o'zgargan oy bo'limi** (masalan, «Sentabrdan oylik to'lov»):
   yangi qoida bir jumlada; «eski usulda yechilgan X qaytarildi, o'rniga Y
   yozildi (N dars)»; ikki marta olinmagan paket darsi; boshqa guruhdagi eski
   usuldagi dars.
6. **«To'lovlaringiz qayerga ketdi».** Har to'lov (va kredit) → qaysi oy darslari
   va qancha. Ortig'i «hisobingizda (keyingi oy to'loviga)».
7. **Izoh.** «Oy oxirida», «Kelmagan», FIFO tartibi, «Savol bo'lsa, filial
   administratoriga murojaat qiling.»

## Pul qoidalari (yangi ADR shular haqida)

Hisobot «o'quvchi qancha to'ladi va qancha dars oldi» ko'rinishida quriladi.
Ledger qatorlari bittama-bitta ko'rsatilmaydi.

1. **Dars narxi dars o'tilgan oyga yoziladi.**
   - Paket yechimlari `splitLessonSlices` bilan darslarga bo'linadi va har bo'lak
     o'z darsi o'tilgan kunning oyiga tushadi (FIFO qamrovi,
     `computeDeductionCoverage`).
   - Oylik hisob (`MONTHLY_PERIOD`) o'z davriga tushadi, darslari
     `EnrollmentMonthlyCharge.coveredDates − frozenOutDates`.
   - Sanasi yo'q bo'laklar — oldindan to'langan, hali o'tilmagan darslar.
2. **Faqat bitta darsning yechimini bekor qiladigan ichki yozuv darsga qo'shib
   yuboriladi.** U darslar soni va narxidan ayiriladi va shu oyning izohida
   oddiy so'z bilan aytiladi. Bunday yozuvlar:
   - paketdagi ishlatilmagan darslar puli qaytishi (guruhdan chiqish, guruh
     almashish, muzlatish);
   - aprel cutover qaytarmasi («tizimga qadar to'langan»);
   - `overcharge-monthly-carried-in` (oylik hisob yana qamragan eski dars,
     PR #571 dagi qayta qo'shilish holati ham);
   - oylik hisobdan ketganda qaytgan darslar (`reverseChargeForDeparture`);
   - migratsiya bekor qilgan yechim.
3. **Boshqa har qanday kirim yoki chiqim sanali alohida qator bo'lib, balansni
   o'zgartiradi:** chegirma (qayta hisob), qarz kechirildi, naqd qaytarildi, mock
   imtihon, balansdan olindi, boshlang'ich balans va boshqa tuzatishlar. Ular
   yashirilmaydi: jadvalda o'z oyida, tenglamada o'z hadi bilan turadi.
4. **Tenglik — so'mma-so'm:** to'lovlar + kirimlar − chiqimlar − darslar −
   oldindan to'langan (hali o'tilmagan) darslar = `Student.balance`.
5. **Taqsimot FIFO.** To'lov va kreditlar sana tartibida eng eski to'lanmagan
   darsga yoziladi. Chiqimlar o'z sanasida navbatga turadi.
6. **«Qarzingiz»ning bo'linishi** («sentabr uchun A · iyuldan qolgan B»)
   FIFO'dan keyin to'lanmay qolgan qismlardan olinadi.

**Tenglik buzilsa.** Foydalanuvchiga xato chiqmaydi. Farq «Tushuntirilmagan
farq» qatori bo'lib qo'shiladi, shunda javob qutisi baribir haqiqiy balansni
ko'rsatadi. Adminga qizil ogohlantirish chiqadi va serverga xato yoziladi.
Maqsad — nol holat. Ishga tushirishdan oldin hisobot prodda hamma o'quvchi
bo'yicha quriladi (faqat o'qish) va har bir mos kelmaslik ko'rib chiqiladi.

**Ma'lum holat: ikki o'quvchi.** Paket darslari puli qo'lda yozilgan tuzatish
bilan qaytarilgan, lekin tuzatish «qaytarish» deb belgilanmagan. Ledger replay u
darslarni keyingi oyning darslariga bog'lab qo'yadi va sentabrda dars soni
guruh rejasidan ko'p chiqadi. Pul to'g'ri, faqat ko'rinish noto'g'ri. Tuzatish:
o'sha tuzatish yozuvlariga `metadata.kind = 'prepaid-release'` qo'yiladi
(bir martalik skript, CEO ruxsati bilan).

**Yangi yozuvlar belgi bilan yoziladi.** Kelajakda matnni tahlil qilish kerak
bo'lmasligi uchun:
- `reverseChargeForDeparture`: `metadata.kind = 'monthly-release'`, `enrollmentId`,
  `period`, `lessons`, `dates`;
- paket qaytarishlari: `metadata.kind = 'prepaid-release'`, `enrollmentId`,
  `lessons`.

Eski yozuvlar uchun hozirgi izoh matni bo'yicha tanib olish zaxira yo'l bo'lib
qoladi.

## To'lov turi: oylik yoki 12 talik (CEO talabi, 26.09)

Tizim sozlamadan yana 12 talikka qaytarilsa, hisobot ham shunga moslashishi
kerak. Shuning uchun:

- **Matnlar qattiq yozilmaydi.** Har oy o'zining haqiqiy yechimlaridan
  aniqlanadi: paket bo'laklari bo'lsa «paket», oylik hisob bo'lsa «oylik
  to'lov». Bir oyda ikkalasi ham bo'lishi mumkin.
- **«…dan oylik to'lov» bo'limi umumiy.** U to'lov turi o'zgargan har oy uchun
  quriladi. Yo'nalishi ikki xil bo'lishi mumkin: «X oyidan oylik to'lovga
  o'tildi» yoki «X oyidan 12 talik paketga qaytildi».
- **Paket haqidagi qator** («… N darslik paket uchun to'lanardi») faqat paket
  davri bo'lsa chiqadi va o'sha davr oylarini aytadi.
- **Doiradan tashqari:** 12 talikka qaytarishning o'zi (migratsiya) alohida ish.
  Bu hujjat faqat hisobot ikkala holatni ham to'g'ri ko'rsatishini ta'minlaydi.

## Joylar

### Admin: «To'lovlar» tabi

Hozirgi `BalanceSummaryCard` va 20 yozuvli lenta o'rniga:

- **Sarlavha** «To'lovlar hisoboti · DD.MM.YYYY holatiga» va «⬇ PDF yuklab
  olish» tugmasi. PDF blob sifatida olinadi, `expenses` PDF'idagi kabi.
- **Hisobot ekranda:** javob qutisi, tenglama, oylar jadvali, to'lov turi
  bo'limi, «To'lovlar qayerga ketdi». Admin uchun gaplar uchinchi shaxsda:
  «Qarzi: …», «To'lagan …».
- **Oy qatorini bosish** o'sha oyning darslarini ochadi: sana va holat (keldi,
  kelmagan, uzrli, bugun, hali o'tilmagan).
- **To'lov qatorida** hozirgi «Chek» havolasi va «⋯ → Summani to'g'rilash»
  (hozirgi ruxsat qoidasi bilan) qoladi.
- **«Barcha yozuvlar»** (yopiq). Xom ledger jadvali: sana, turi, summa, keyingi
  balans, izoh. Mavjud `GET /transactions/student/:id` sahifalash bilan, «Yana
  ko'rsatish» tugmasi. 20 ta bilan cheklanmaydi.

### O'quvchi portali: `/portal/payments`

«Joriy balans» kartasi ostida yangi Lumio kartasi: «📄 To'lovlar hisoboti — Har
bir to'lovingiz qaysi darslarga ketgani, oyma-oy» va «PDF yuklab olish»
tugmasi (coral). Qolgan kartalar o'zgarmaydi.

### Telegram bot: «💳 To'lovlar» (`menu_payments`)

- **Chat bitta o'quvchiga ulangan.** Qisqa matn (javob qutisining matni) va PDF
  hujjat (`replyWithDocument({ source, filename })`).
- **Chat bir necha o'quvchiga ulangan.** Avval ism tanlanadi (inline tugmalar).
- **Chat ulanmagan.** Bot «📱 Raqamni yuborish» tugmasini chiqaradi. Parolni
  tiklashdagi `contact-ownership` tekshiruvi ishlatiladi: faqat o'z raqamini
  yuborgan odamga hisobot beriladi. Raqam mos kelsa, chat ulanadi
  (`telegramChatId`), parolni tiklashdagi kabi.
- Fayl nomi: `tolovlar-hisoboti-DD-MM-YYYY.pdf`.

## Server

- **Yangi modul `server/src/statements/`:**
  - `StatementService.build(studentId, companyId)` → `StatementModel`. Bu
    `scripts/_statement-model.ts` prototipining toza, testlangan ko'chirmasi;
    ledger replay'ni qayta yozmaydi, `TransactionsReadService`ning qamrovidan
    foydalanadi.
  - `statement-pdf.ts`: pdfmake shabloni (Inter, `renderPdf`), v3 ko'rinishida.
  - `statement-text.ts`: bitta joyda o'zbekcha gaplar (oy nomlari, sabablar,
    bo'lim sarlavhalari). PDF ham, ekran ham, bot ham shundan oladi.
- **Endpointlar:**
  - `GET /students/:id/statement` (JSON) va `GET /students/:id/statement.pdf` —
    `@Roles('CEO', 'Branch Director', 'Administrator')`,
    `assertCallerMayTouchStudent`.
  - `GET /student-portal/statement.pdf` — `@Roles('Student')`, `studentId`
    token'dan, `StudentCardGuard`.
  - Bot servisni to'g'ridan-to'g'ri chaqiradi.
  - Har yangi route `branch-route-policy.ts` manifestida tasniflanadi.
- **`StatementModel` (JSON):**
  - `student`, `asOf`, `balance`;
  - `headline` (turi, summa, to'lanmagan qismlar);
  - `equation` (to'lovlar, kirimlar, chiqimlar, darslar, oldindan to'langan,
    balans, tushuntirilmagan farq);
  - `months[]`: kaliti, darslar, kelmaganlar, narx, to'lov, boshqa qatorlar,
    oxiridagi balans, paket qismlari, oylik qismlar, izohlar, darslar kunma-kun,
    keskin farq va sabablari;
  - `modelChanges[]`: to'lov turi o'zgargan oylar va bo'lim ma'lumoti;
  - `allocations[]`: to'lov yoki kredit, `paymentId`, qayerga, ortig'i.

## Sinov

- **Birlik testlari (`StatementService`):** har bir tasnif (paket, oylik,
  qaytarish, aprel, carried-in, oylikdan ketish, chegirma, qarz kechirish, naqd
  qaytarish, mock), tenglik, FIFO, keskin farq, bir necha guruh, oy o'rtasida
  qo'shilish, 12 talikka qaytish (oylik → paket).
- **Prod bo'yicha quruq yurish (faqat o'qish):** hamma o'quvchi. Natija —
  qanchasi mos keldi va mos kelmaganlar ro'yxati (repoga emas,
  `~/daf-erp-ops/` ga).
- **PDF:** CEO ko'rgan 8 misol yangi shablon bilan qayta chiqariladi va v3 bilan
  ko'z bilan solishtiriladi.
- **Client:** tab JSON'dan to'g'ri chiziladi; oy ochiladi; PDF yuklanadi;
  portal kartasi ishlaydi.
- **Bot:** ulangan, bir nechta o'quvchi, ulanmagan va boshqa odamning raqami
  holatlari.

## Bosqichlar (alohida PR, har deploy CEO ruxsati bilan)

1. **Server:** `StatementService`, ADR, JSON va PDF endpointlar, route
   manifesti, yangi qaytarish yozuvlariga belgi, ikki o'quvchi uchun belgi
   skripti (gitignore, CEO ruxsati bilan).
2. **Admin tabi.**
3. **Portal kartasi.**
4. **Bot.**

## Doiradan tashqari

- **Telefon ilovasi (Expo):** Play Store'ga chiqqanda xuddi shu tugma qo'shiladi.
- **Ota-onalar:** ularning Telegram chati o'quvchiga ulanmagan.
- **12 talikka qaytarish migratsiyasining o'zi.**
- **Adminlarning «chiqarib, o'sha guruhga qayta qo'shish» odati:** alohida
  savol, CEO adminlardan so'raydi.
