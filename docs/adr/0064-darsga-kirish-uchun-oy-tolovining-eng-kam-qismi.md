# ADR-0064 — Darsga kirish uchun oy to'lovining kamida 50% i; to'langan darslar tugashidan oldin eslatma

**Holati:** Qabul qilindi
**Sana:** 2026-10-02
**Bog'liq:** ADR-0047 (qisman to'lov qoidasini to'ldiradi), ADR-0042 (eslatmalarni to'ldiradi), ADR-0025, ADR-0048, `server/src/billing/lesson-admission.ts` (`heldForAdmission`, `leastDue`, `MIN_SHARE_START_DAY`), `server/src/billing/monthly-payment-notice.service.ts` (`queuePaidThroughReminders`), `server/src/telegram-digest/monthly-payment-text.ts`

## Kontekst

02.10.2026 da shartnoma matni o'zgardi:

- **3.2:** har oy to'lovining kamida 50 foizi shu oyning 2-darsigacha, qolgan
  qismi to'langan darslar tugaguniga qadar to'lanadi. 2-darsdan boshlab
  o'quvchi kamida 50 foiz to'langandan keyin darsga qo'yiladi va faqat to'lovi
  yetgan darslarga qatnashadi. Oldingi oydan o'tgan pul shu oy to'loviga
  qo'shiladi. Oyning 1-darsi to'lovsiz qoladi.
- **3.7 (yangi):** oy to'lovi qisman to'langan bo'lsa, markaz to'langan darslar
  tugashidan 3 kalendar kun oldin boshlab qolgan qismini eslatadi.

Tizim esa boshqacha ishlardi:

- ADR-0047 da eng kam ulush yo'q edi. Bitta dars pulini to'lagan o'quvchi shu
  darsga kirardi.
- ADR-0042 da ikkita xabar bor edi: oy hisobi va 2-dars eslatmasi. To'langan
  darslar tugashidan oldingi eslatma yo'q edi.

## Qaror

### 1. Kamida 50%

2-darsdan boshlab D kunidagi darsga qo'yilish uchun ikki shart kerak: to'lov
D gacha bo'lgan darslarga yetadi (ADR-0047) va oy to'lovining eng kam qismi
to'langan. Eski qarz avval yopiladi.

Bir formula ikkalasini beradi. ADR-0047 dagi `heldAfter` o'rniga
`heldForAdmission` ishlaydi: har bir oy hisobidan (charge) uning o'z
2-darsidan boshlab ko'pi bilan `chargedAmount − eng kam qism` «hali ushlab
turilgan» deb sanaladi.

```
balans + keyingi oylar hisobi + Σ hisoblar bo'yicha
    min(heldAfter(hisob, D), chargedAmount − ceil(chargedAmount × foiz / 100))  ≥ 0
```

Ya'ni har bir hisobdan `max(D gacha bo'lgan darslari, eng kam qismi)` so'raladi.
Eng kam qism `chargedAmount` dan olinadi: chegirma, uzrli dars krediti va oy
o'rtasida kelgandagi qisman hisob allaqachon uning ichida.

Standart kurs (450 000, 13 dars):

| Holat | Natija |
|---|---|
| 0 to'lagan | 2-darsga qo'yilmaydi, 225 000 kerak |
| 100 000 to'lagan | qo'yilmaydi, yana 125 000 kerak |
| 225 000 to'lagan | 6-darsgacha qatnashadi, 7-darsga yana 17 310 kerak |
| O'tgan oydan 242 308 qolgan | 2-darsga qo'yiladi |
| O'tgan oydan 192 308 qolgan | qo'yilmaydi, yana 32 692 kerak |

### 2. Bir nechta guruh: har guruhning o'z 50% i, talablar qo'shiladi

CEO qarori (02.10.2026): 50% har guruh uchun alohida hisoblanadi. Balans
esa o'quvchiniki va guruhlarga bo'linmaydi. Shuning uchun:

- har guruhning eng kam qismi o'sha guruhning 2-darsidan boshlab so'raladi;
- guruhlarning talablari qo'shiladi. Ikkala guruhda 2-dars o'tgan bo'lsa,
  ikkala 50% ham kerak.

Misol: ikki guruh, har biri 450 000. 225 000 to'lagan o'quvchi hech biriga
kirmaydi, 450 000 to'lagani ikkalasiga 6-darsgacha kiradi.

**Oy o'rtasida guruh almashtirgan yoki chiqib qayta qo'shilgan o'quvchi.**
Yopilgan yozilishda shu oyning hisobi qolgan bo'lsa, oy butun deb hukm
qilinadi: eng kam qism yopilgan hisob bilan yangi hisobning yig'indisidan
olinadi (`closedThisMonth`). Yopilgan hisob o'tilgan darslar uchun baribir
to'liq so'raladi. Eng kam qism faqat yangi hisobdan olinsa, oyning uchdan
ikkisini to'lagan o'quvchi ko'chgandan keyin darsdan chetda qolardi.

### 3. Qachondan

01.11.2026 dan boshlab o'tadigan darslar uchun (`MIN_SHARE_START_DAY`).
Oktabr ADR-0047 bo'yicha tugaydi, chunki 30.09 da o'quvchilarga «2-darsgacha
to'lang» degan xabar ketgan.

### 4. Sozlamalar

Ikkalasi kompaniya darajasida, faqat CEO o'zgartiradi:

- `payment.admissionMinPaidPercent` — 0 dan 100 gacha, standart 50.
  0 qo'yilsa ADR-0047 ning o'zi qoladi.
- `payment.paidThroughReminderDays` — 0 dan 10 gacha, standart 3.
  0 qo'yilsa 3.7 eslatmasi yuborilmaydi.

`payment.admissionRuleEnabled` o'chirilsa, hech kim darsdan chetda qolmaydi.
Shunda eng kam qism ham, 3.7 eslatmasi ham ishlamaydi.

### 5. Ekranlar

- Yangi sabab kodi `BELOW_MIN_SHARE`: darslar puli yetadi, lekin eng kam qism
  yetmaydi. Javobda foiz ham keladi (`minPaidPercent`). Darslar puli yetmasa,
  avvalgidek `NOT_PAID`.
- Davomat: «Oy to'lovining 50% i to'lanmagan · darsga qo'yilmaydi» va kerakli
  summa.
- To'lov oynasi: «Bu pul darsga kirish uchun yetmaydi: oy to'lovining kamida
  50% i to'lanishi kerak — yana … so'm» va tezkor summa «Kamida 50%»
  (`monthly.minShareDue`, 1 000 so'mgacha yuqoriga yaxlitlanadi).
- QR skan o'quvchiga eng kam qismni aytadi.

### 6. 3.7 eslatmasi

- **Kimga:** shu oy to'lovidan biror qismini to'lagan va oy ichida to'lovi
  yetmaydigan darsi (N) bor o'quvchiga. N — oyning to'lov yetmaydigan birinchi
  darsi.
- **Qachon:** N dan 3, 2 va 1 kun oldin, 20:00 jamlanmasida. N ni qoplaydigan
  to'lov kelsa, to'xtaydi.
- **Kimga emas:**
  - N bugun yoki o'tgan bo'lsa: o'quvchi allaqachon darsdan chetda;
  - eng kam qism yetmayotgan bo'lsa: bu 2-dars eslatmasining ishi;
  - shu oy uchun hech narsa to'lamagan bo'lsa: unga oy hisobi va 2-dars
    eslatmasi boradi.
- Bir oqshomda bitta eslatma ketadi. 2-dars eslatmasi bilan to'qnashsa,
  2-dars eslatmasi ketadi.
- Ikki guruhli o'quvchiga bitta eslatma, N bo'lgan guruh nomidan.
- Navbatga 19:50 da yoziladi (`MonthlyPaymentNoticeCronService`).
  `payment.monthlyNoticesEnabled` o'chirilsa, bu ham o'chadi.
- Saytga chiqqan kundan ishlaydi, 01.11 ni kutmaydi: oktabrda qisman to'lagan
  o'quvchiga ham foydali.
- Yangi jamlanma toifasi ochilmadi. `PAYMENT_REMINDER` qatori `paidThrough`
  maydoni bilan yoziladi, shuning uchun baza o'zgarmaydi.

### 7. Mavjud xabarlar (01.11 dan)

- **2-dars eslatmasi** faqat ertangi darsga qo'yilmaydigan o'quvchiga ketadi.
  50% va undan ko'p to'lagan o'quvchi uni olmaydi. Darsga qo'yilish
  `LessonAdmissionService.forLesson` dan o'qiladi, ya'ni davomatdagi hukm
  bilan bir xil.
- **Oy hisobi** muddat qatorida eng kam summani aytadi (`leastDue`).

### 8. Matnlar

Uchta matn loyihasini CEO 02.10.2026 da tasdiqladi. Kodda loyihadan uch
farq bor:

- sanalar boshqa xabarlardagidek `KK.OO.YYYY` ko'rinishida;
- 2-dars eslatmasida «Oy uchun jami» o'rniga «Jami to'lash kerak»: summa
  jonli balansdan olinadi va eski qarzni ham o'z ichiga oladi, oy hisobidagi
  qator ham shunday ataladi;
- «Muddat: to'langan darslar tugaguncha» qatori loyihada yo'q edi.

3.7 eslatmasi:

> ⏰ To'lov eslatmasi
> Noyabr oyi uchun to'lovingiz 13.11.2026 dagi darsgacha yetadi.
> Qolgan to'lov: **225 000 so'm**
>
> Darslaringiz uzilib qolmasligi uchun to'lovni 16.11.2026 dagi darsgacha amalga oshirishingizni so'raymiz.

2-dars eslatmasi:

> Ertaga (04.11.2026) noyabrning 2-darsi bo'ladi.
> Darsga kirish uchun kamida: **225 000 so'm**
> Jami to'lash kerak: 450 000 so'm
>
> Shartnomaga ko'ra oylik to'lovning kamida yarmi 2-darsgacha qilinadi. Darslaringiz uzilib qolmasligi uchun to'lovni ertagi darsgacha amalga oshirishingizni so'raymiz.

Foiz 50 dan boshqa bo'lsa, «yarmi» o'rniga «N% i» yoziladi.

Oy hisobi:

> Muddat: **04.11.2026** — oyning 2-darsigacha kamida 225 000 so'm, qolgani — to'langan darslar tugaguncha

O'tgan oydan qolgan pul eng kam qismni qoplasa: «Muddat: to'langan darslar
tugaguncha».

## Ko'rib chiqilgan variantlar

- **50% umumiy oy to'lovidan.** Kodi eng sodda. CEO «har guruh alohida» dedi.
- **Pulni guruhlarga navbat bilan bo'lish** (avval birinchi yozilgan guruh).
  225 000 to'lagan o'quvchi bir guruhga kirardi. Rad etildi: to'lov oynasi,
  davomat va eslatmalarda yangi bo'lish qoidasi kerak bo'lardi, 300 000 dan
  75 000 esa ikkinchi guruhda foydasiz turib qolardi.
- **Kassir to'lovda guruhni tanlaydi.** Har guruhga alohida balans kerak
  bo'ladi. Rad etildi: butun balans tizimini o'zgartiradi.
- **Yangi jamlanma toifasi.** Rad etildi: enum migratsiyasi kerak, foydasi yo'q.

## Oqibatlar

- 01.11 dan bitta-ikkita dars pulini to'lab kirish tugaydi. O'quvchilarga
  yangi tartib haqida oldindan xabar berish alohida ish, bu ADR ga kirmaydi.
- N kuni darsga qo'yilmagan o'quvchiga alohida xabar yuborilmaydi.
- 3.7 eslatmasidagi sanalar 19:50 dagi holat bo'yicha yoziladi. Shu 10 daqiqa
  ichida to'lov kelsa, sanalar eskirgan bo'lishi mumkin. Qolgan summa 20:00 da
  jonli balansdan olinadi, to'liq to'lagan o'quvchiga eslatma ketmaydi.
- Ikki guruhli o'quvchiga oy hisobi faqat birinchi hisob uchun yuboriladi
  (ADR-0042). Shuning uchun undagi «kamida» summasi ikkinchi guruhning to'liq
  hisobini o'z ichiga oladi, ya'ni keragidan ko'p ko'rsatadi. Ma'lum cheklov.
- 01.11 dan 2-dars eslatmasi «ertaga 2-dars» ekanini guruhning jonli
  jadvalidan, darsga qo'yilishni esa hisobdagi kunlardan o'qiydi. Dars
  ertaroq kunga ko'chirilsa, ikkalasi kelishmaydi va o'sha o'quvchilarga
  2-dars eslatmasi ketmaydi (oy hisobi ketgan bo'ladi). Ma'lum cheklov.
- 2-dars eslatmasida «kamida yarmi 2-darsgacha qilinadi» gapi faqat eng kam
  qism yetmaganda yoziladi. Ikki-uch darslik oyda darslar puli yarmidan ko'p
  bo'ladi, shunda faqat summa va iltimos qoladi.
- 3.7 eslatmasi pauzadagi guruhning darsi uchun yuborilmaydi.
- Davomatni saqlashdagi rad matni (`assertAdmitted`) ikkala sabab uchun bir
  xil qoldi: qator ekranda qulflangan, bu matn faqat to'g'ridan API ga
  murojaatda chiqadi.
- O'zgarmaydi: 1-dars to'lovsiz, ustoz haqi, sinov darsi (3.5), qarzdorning
  1-darsi (`firstLessonCoverage`), ketish tartiblari. «Qarzdorlar» dagi «Shu
  oy» ustuni (ADR-0062, `monthReach`) pul faktini ko'rsatadi va eng kam
  qismga qaramaydi.
- Telegramga bog'lanmagan o'quvchi eslatma olmaydi. Shartnomadagi «eslatma
  olinmagani to'lov muddatini o'zgartirmaydi» gapi shu holat uchun.
