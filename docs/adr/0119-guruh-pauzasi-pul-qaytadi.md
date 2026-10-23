# ADR-0119 — Guruh pauzasi markaz qarori: o'tmagan darslar puli qaytadi, guruh qaytganda hisob qaytish kunidan boshlanadi

**Holati:** Qabul qilindi
**Sana:** 2026-10-23
**Bog'liq:** ADR-0025, ADR-0041, ADR-0043, ADR-0053, ADR-0054, ADR-0058, ADR-0063, ADR-0068, ADR-0077, ADR-0099, ADR-0118; shartnoma 3.4, 4.1, 6.2; `server/src/groups/groups-status.service.ts`, `server/src/common/status/status-cascade.service.ts`, `server/src/billing/charge-start-date.ts`, `server/src/billing/month-plan.ts`, `server/src/billing/departure-policy.ts`

## Kontekst

Oylik kursda oy hisobi oy boshida, guruh jadvalidagi hamma dars uchun oldindan yoziladi (shartnoma 3.4). Guruh PAUSED qilinganda hozir quyidagilar bo'ladi:

- Faqat holat o'zgaradi. `cascadeGroupStatusChange` pulga faqat CANCELLED va COMPLETED da tegadi; PAUSED da hech narsa qilmaydi.
- Davomat olinmaydi, «Dars bo'ldimi?» savoli ham ochilmaydi: ADR-0054 savolni faqat ACTIVE guruhlar uchun ochadi.
- Yozilgan oy hisobi pauza kunlarini ichida saqlab qoladi. Ular bo'yicha hech kim qaror qilmaydi, pul qaytmaydi.

Prod'dagi skan (22.10.2026): PAUSED uchta guruh (#020, #071, #016) o'tmagan dars kunlari uchun pul olgan. #071 05.10 da pauzaga qo'yilgan, 8 ta o'tmagan dars, 5 o'quvchi, 1 245 640 so'm. Bu summa 22.10 da `scripts/cancel-unheld-lessons.ts` bilan qo'lda qaytarildi.

Yonaki oqibatlar:

- **6.2 ulushi pauza kunlarini «o'tgan» deb sanaydi.** Pauza paytida guruhdan chiqqan o'quvchining ulushi rejadagi sanalardan hisoblanadi, o'tmagan pauza kunlari ham «o'tgan» bo'lib qoladi. 40% dan oshsa, oy puli ushlab qolinadi. #11204 da 450 000 so'm shu sababdan qolgan.
- **Qaytishda hisob oy boshidan yoziladi.** ADR-0118 bo'yicha guruh qayta ochilganda `chargeActivatedGroup` hisobi yo'q yozilishlarga joriy oy hisobini yozadi. Boshlanish kuni `chargeStartDate` dan olinadi (yozilish boshlangan kun, guruh boshlangan kun, yozilishning muzlatishdan qaytishi). Guruhning qaytgan kuni u yerda yo'q: oy boshidan pauzadagi guruh 15-sanada ochilsa, 1–14-sana darslari ham hisoblanadi. 04:00 qorovul (`createChargesForPeriod`) ham shu funksiyani ishlatadi.
- **Filial pauzasi `StatusHistory` yozmaydi.** Filial INACTIVE bo'lganda `StatusCascadeService` uning guruhlarini PAUSED qiladi, lekin faqat `EntityHistory` qatori qoladi (ADR-0099). Pauzaning qachon boshlangani va tugagani bitta joyda yozilmaydi.

**CEO qarori (23.10.2026).** Guruh pauzasini markaz qiladi, o'quvchi emas. Shuning uchun:

1. O'tmagan darslar puli o'quvchiga qaytadi, admin har safar alohida tanlamaydi.
2. Pauza paytida o'quvchi boshqa guruhga o'tishi, o'qishni tugatishi yoki pulini qaytarib olishi mumkin. Bunga uning haqqi bor: guruhni u to'xtatmagan.
3. Guruh istalgan payt pauzaga tushishi va istalgan payt qaytishi mumkin, pul hisobi har holatda to'g'ri bo'lishi kerak.
4. Guruh qaytganda o'quvchilarga xabar boradi.

O'quvchining o'z muzlatishi (shartnoma 5.3, `FROZEN`) bu ADR'ga kirmaydi.

## Qaror

1. **Pauza davri bitta jadvalda.** Yangi `GroupPause` jadvali: `groupId`, `startedAt`, `plannedResumeOn` (`@db.Date`, bo'sh = noma'lum), `resumeOn` (`@db.Date`, qaytishda to'ladi), `endedAt`, `reason`, `startedById`, `endedById`, `source` (`MANUAL` | `BRANCH`). Qator guruh PAUSED bo'lganda yoziladi va qaytishda yopiladi. Har ikki yo'lda: `GroupsStatusService.changeStatus` va filial pauzasi kaskadi (`StatusCascadeService`). Ikkalasi ham guruh holati o'zgarishi bilan bir tranzaksiyada. Ochiq qator bir guruhda bittadan oshmaydi (qisman unique indeks `WHERE "endedAt" IS NULL`).

1a. **Pauzaga qo'yish oynasi qaytish sanasini so'raydi.** Admin sabab bilan birga «Darslar qachondan qayta boshlanadi?» savoliga javob beradi: sana tanlaydi yoki «Hozircha noma'lum» ni belgilaydi. Bu ikkisidan biri majburiy. Sana bugundan keyin bo'lishi kerak. Tanlangan sana `plannedResumeOn` ga yoziladi va o'quvchiga boradigan xabarda aytiladi (7-band). Guruh pauzada ekan, admin sanani o'zgartira oladi yoki keyinroq kirita oladi; har o'zgarishda o'quvchilarga yangi sana bilan xabar boradi.

1b. **Pauzadan chiqarish oynasi sanani tasdiqlatadi.**
   - `plannedResumeOn` bor bo'lsa: «Guruh 05.11 dan qayta boshlanadimi?» Admin tasdiqlaydi yoki boshqa sana tanlaydi.
   - Sana yo'q bo'lsa: admin avval sanani tanlaydi, keyin pauzadan chiqaradi.

   Tanlangan sana (`resumeOn`) bugun yoki undan keyin bo'ladi. Bugun bo'lsa, guruh darhol ACTIVE bo'ladi. Keyingi sana bo'lsa, guruh o'sha kungacha PAUSED qoladi (o'sha kunlar ham pauza kuni, 2-band ularni ham qaytaradi) va o'sha kuni 00:05 da avtomatik ACTIVE bo'ladi. Bu avtomatik ochilish `GroupsStatusService` orqali o'tadi, shuning uchun ADR-0118 dagi hisob yozish ham ishlaydi.

1c. **Rejalangan sana kelib, guruh hamon pauzada bo'lsa.** `plannedResumeOn` kuni ertalab guruh hamon PAUSED va qaytish sanasi tanlanmagan bo'lsa, filial administratoriga bitta topshiriq ochiladi: «#071 bugun qayta boshlanishi rejalangan edi — guruhni oching yoki sanani o'zgartiring.» Topshiriq guruh ochilganda yoki sana o'zgarganda o'zi yopiladi. Guruh o'zidan-o'zi ochilmaydi: o'qituvchi va xona tayyor ekanini admin biladi.

2. **O'tmagan pauza darsi har kecha avtomatik bekor qilinadi.** Kechki qadam (23:00, `closeDay` bilan bir vaqtda, yakshanba ham) ochiq pauzalarni oladi. Shu kuni tugagan har dars uchun `LessonCancellationsService.create` ni chaqiradi; bu ADR-0053 yo'li: dars puli shu kuni balansga qaytadi, kun `frozenOutDates` ga qo'shiladi. Dars kuni shartlari:
   - jadval bo'yicha dars kuni (`endedLessonsOn`: ko'chirishlar, bekor qilishlar, filial bayramlari bilan);
   - dars tugaydigan vaqtda guruh pauzada (`GroupPause` oralig'ida);
   - o'sha kunga davomat yozilmagan (pauzadan oldin o'tgan dars bekor qilinmaydi).

   Sabab matni: «Guruh pauzada — dars o'tmadi». Telegram guruhiga xabar ketmaydi. Bekor qilish allaqachon bor kun o'tkazib yuboriladi, shuning uchun qadam takrorlansa ham pul ikki marta qaytmaydi. Kechagi qadam o'tkazib yuborilsa (server o'chgan), keyingi kecha ochiq pauzaning hamma o'tgan kunlarini oladi. Admin hech narsa bosmaydi. Pauza ekanligi aniq bo'lgani uchun pul darsning o'z kechasida qaytadi, kelajakdagi kunlar oldindan qaytarilmaydi: guruh ertaga qaytsa, ularni qayta hisoblash shart bo'lmaydi.

3. **Pauza paytida guruhdan chiqqan o'quvchi to'liq pulini oladi.** O'quvchi chiqarilsa yoki chetlatilsa va o'sha kuni guruhi pauzada bo'lsa, `reverseChargeForDeparture` siyosatni `CENTER_INITIATIVE` ga majburan o'tkazadi: shartnoma 6.2 dagi 40% qoidasi ishlamaydi, oyning o'tmagan hamma darsi qaytadi. Boshqa guruhga o'tkazish allaqachon `CENTER_INITIATIVE` (ADR-0043). Sinov darsi qoidasi (3.5) o'z joyida qoladi, chunki u o'quvchiga yanada foydali. Bu bilan qolgan balans `«Qaytariladigan pul»` sahifasida ko'rinadi va odatdagi so'rov tartibida (ADR-0077) qaytariladi.

4. **6.2 ulushi pauza kunlarini sanamaydi.** `policyRelease` ketgan kungacha o'tilgan darslarni sanaganda `GroupPause` oralig'idagi kunlar «o'tgan» hisobidan chiqariladi. Bu guruh qaytgandan keyin chiqqan o'quvchiga tegishli: oyning pauza kunlari uning ulushini oshirmaydi.

5. **Guruh qaytganda hisob qaytish kunidan boshlanadi.** `chargeStartDate` ga yana bitta chegara qo'shiladi: guruhning oxirgi yopilgan `GroupPause.resumeOn` kuni (1b-band). Qaytish kunining o'zi hisobga kiradi, chunki o'sha kuni dars o'tadi (yozilishning muzlatishdan qaytishidan farqi shu: u yerda qaytish kuni bepul). `chargeActivatedGroup`, oy boshi cron'i va 04:00 qorovul hammasi shu funksiyadan o'tadi. Oy hisobi allaqachon yozilgan oyda hech narsa qayta yozilmaydi: hisob pauzadan keyingi kunlarni allaqachon qoplaydi, pauza kunlari esa 2-band bilan qaytgan.

6. **Guruh pauzadan to'g'ridan-to'g'ri yopilsa.** PAUSED → CANCELLED o'tishi mavjud qoidadan o'tadi (ADR-0036): yozilishlar DROPPED, oyning qolgan darslari puli qaytadi. 2-band o'tgan kunlarni allaqachon qaytargan, shuning uchun hech narsa ikki marta qaytmaydi. Ochiq `GroupPause` qatori yopilish kuni bilan yopiladi.

7. **Xabarlar.** Uch xabar darhol ketadi (ADR-0025 ning «darhol» ro'yxatiga qo'shiladi), guruhdagi har bir ACTIVE o'quvchiga `SmsService.sendToStudent` orqali: pauzaga qo'yilganda, qaytish sanasi o'zgarganda va guruh qaytish sanasi tanlanganda (1b). Matnlar pauza sanasi ma'lum yoki noma'lumligiga qarab ikki ko'rinishda. Birinchi dars sanasi va vaqti jadvaldan olinadi: qaytish sanasidan boshlab guruhning birinchi dars kuni (bayram, ko'chirish hisobga olingan). Xabar guruh holati o'zgarishi tranzaksiyasi tugagandan keyin yuboriladi. Telegram'i ulanmagan o'quvchiga xabar ketmaydi. O'qituvchiga xabar yuborilmaydi (CEO, 23.10.2026).

   CEO tasdiqlagan matnlar (23.10.2026). Kodda `groups/group-pause-text.ts` da yoziladi va testda so'zma-so'z qotiriladi. Uslub mavjud xabarlar bilan bir xil: emoji sarlavha qalin, `greetingLine`, sana va guruh nomi `<b>` qalin, telefon filialniki (`loadContactPhone`), telefon bo'lmasa o'sha qator tushib qoladi.

   - Pauza, qaytish sanasi ma'lum:
     ```
     <b>⏸ Darslar vaqtincha to'xtatildi</b>

     Hurmatli {ism}!

     <b>{guruh}</b> guruhi darslari vaqtincha to'xtatildi.
     Darslar <b>{DD.MM}</b> dan qayta boshlanadi.

     To'xtagan kunlardagi darslar puli balansingizga qaytariladi.

     📞 Savollar bo'lsa: {telefon}

     Rahmat!
     ```
   - Pauza, qaytish sanasi noma'lum: ikkinchi qator o'rniga «Qayta boshlanish sanasi aniq bo'lishi bilan sizga xabar beramiz.»
   - Qaytish sanasi keyin belgilandi yoki o'zgardi:
     ```
     <b>📅 Darslar boshlanish sanasi</b>

     Hurmatli {ism}!

     <b>{guruh}</b> guruhi darslari <b>{DD.MM}</b> dan qayta boshlanadi.

     Rahmat!
     ```
   - Guruh pauzadan chiqarildi (qaytish sanasi tanlanganda):
     ```
     <b>▶️ Darslar qayta boshlanmoqda</b>

     Hurmatli {ism}!

     <b>{guruh}</b> guruhi darslari qayta boshlanadi.
     Birinchi dars: <b>{DD.MM}, {hafta kuni}, {HH:MM}</b>.

     Oylik to'lov shu kundan boshlab hisoblanadi.

     Darslarda ko'rishguncha. Rahmat!
     ```

7a. **Pauza darslari guruh tugash sanasini suradi.** 2-band bekor qilgan har pauza darsi uchun `Group.endDate` bir dars kuniga suriladi, bayramdagi kabi (`GroupHolidayCascadeService` yo'li: jadval kunlari bo'yicha oldinga yuriladi, boshqa bayramlar o'tkazib yuboriladi). Surilish `GroupPause` qatoriga yoziladi (`extendedLessons`, `endDateBefore`), shunda guruh pauzadan to'g'ridan-to'g'ri CANCELLED bo'lsa surilish qaytariladi. `endDate` qo'lda o'zgartirilgan bo'lsa, bayram qoidasi kabi qo'lda o'zgarish ustun turadi.

8. **O'tgan pauzalar uchun bir martalik skript.** `scripts/backfill-group-pauses.ts` 2026-09-26 (oylik hisob boshlangan kun) dan beri `StatusHistory` dagi pauzalarni `GroupPause` ga yozadi va 2-banddagi qadamni o'sha kunlar uchun bir marta ishga tushiradi. Odatda dry-run, `--apply --expect=<N>` bilan yozadi. Bekor qilish yozilgan kun o'tkazib yuboriladi (#071 ning 22.10 da bekor qilingan kunlari). Filial kaskadi pauzalari `StatusHistory` da yo'q, ular `EntityHistory` dan topiladi yoki qo'lda ro'yxat bilan beriladi.

## Har xil holatlarda nima bo'ladi

| Holat | Natija |
|---|---|
| Guruh 15.10 da pauza, 22.10 da qaytdi | 15–21.10 o'tmagan darslar har kecha qaytadi. 22.10 dan keyingi darslar oktabr hisobida qoladi, qayta yozish yo'q. |
| Guruh 15.10 da pauza, 05.11 da qaytdi | 15–31.10 darslar har kecha qaytadi. 1.11 da cron noyabr hisobini yozmaydi (guruh PAUSED). 05.11 da guruh ochilganda noyabr hisobi 05.11 dan yoziladi (5-band), noyabr narxi o'sha kundan qolgan darslar bo'yicha. O'quvchiga qaytish xabari boradi. |
| Guruh oy bo'yi pauzada (noyabr), 10.12 da qaytdi | Noyabr hisobi umuman yozilmaydi. Dekabr hisobi 10.12 dan. |
| Pauza bugun 12:00 da, dars 19:00 da | Bugungi dars kechasi qaytadi. |
| Dars o'tdi (davomat bor), keyin pauza | O'tgan dars qaytmaydi. |
| Guruh bir kun pauzada bo'lib, dars boshlanishidan oldin qaytdi | Dars tugaydigan paytda guruh ACTIVE, dars qaytmaydi. |
| Pauza paytida o'quvchi boshqa guruhga o'tdi | Eski guruh hisobidan o'tmagan darslar qaytadi (`CENTER_INITIATIVE`), yangi guruh o'z narxi bilan qolgan darslar uchun. |
| Pauza paytida o'quvchi o'qishni tugatdi | Siyosat majburan `CENTER_INITIATIVE`: oyning o'tmagan hamma darsi qaytadi, 40% qoidasi yo'q. Musbat balans «Qaytariladigan pul» da. |
| Pauzadagi guruhga yangi o'quvchi yozildi | Hisob yozilmaydi (guruh ACTIVE emas). Guruh ochilganda qaytish kunidan yoziladi. |
| Pauza paytida o'quvchi o'zi muzladi | Muzlatish odatdagidek: kelajakdagi kunlar qaytadi; o'tgan pauza kunlari allaqachon qaytgan, ikki marta qaytmaydi (`frozenOutDates`). |
| Filial INACTIVE qilindi | Uning guruhlari PAUSED bo'ladi va hammasiga `GroupPause` (`source: BRANCH`) yoziladi, qolgani yuqoridagidek. |
| LESSON_PACK kurs | Oylik hisob yo'q, qaytaradigan narsa yo'q. Pauza kunlari shunchaki to'lanmaydi. |

## Boshqa joylarga ta'siri (tekshirilgan)

- **To'lov eslatmalari:** oylik hisob xabari va «ertaga 2-dars» eslatmasi faqat ACTIVE guruhlar uchun (`monthly-payment-notice.service.ts`), pauzada eslatma ketmaydi. Qaytishda yangi hisob yozilsa, odatdagi oylik hisob xabari 19:50 da navbatga qo'yiladi.
- **«O'qiyotgan o'quvchi»:** faol o'quvchi faqat ACTIVE guruhdagi o'quvchi (`ACTIVE_ENROLLMENT_WHERE`). Pauza davomida o'quvchi «o'qimayotganlar» ichida ko'rinadi: qarzi «O'qimayotganlar qarzi»ga o'tadi, musbat balansi «Qaytariladigan pul» ga tushadi. Bu mavjud qoida, o'zgarmaydi.
- **O'qituvchi haqi:** pauza kunlari uchun haq yo'q. «Berilmadi» pauza kunlarini allaqachon o'tkazib yuboradi (ADR-0048).
- **Darsga kirish (3.2):** qaytishdan keyingi oyda «2-dars» o'quvchining hisobidagi birinchi qoplangan darsdan sanaladi, ya'ni qaytgandan keyingi 2-dars. Bu mavjud qoida bilan bir xil.

## Ko'rib chiqilgan muqobillar

- **Har o'tib ketgan kun uchun «Dars bo'ldimi?» savoli.** 10 darslik pauza 10 ta javob degani. Rad etildi.
- **Pauza boshida «pul qaytadi / darslar keyin o'tiladi» tanlovi.** Pauza markaz qarori, ko'chirish ham markazning ishi; o'quvchi pulini kutib turmasligi kerak. Rad etildi.
- **Pauzaga qo'yilganda oyning qolgan hamma darsini darhol qaytarish.** Guruh oy ichida qaytsa, qaytarilgan darslarni yana hisoblash kerak bo'ladi: ikki tomonga pul harakati va xato xavfi. Har kecha faqat o'tib ketgan kunni qaytarish sodda. Rad etildi.
- **Pulni qoldirib, guruh tugash sanasini cho'zish.** Oylik tizimda keyingi oy hisobi yana to'liq yoziladi, ya'ni ikki marta to'lov. Rad etildi.

## Oqibatlari

- Adminning qo'shimcha ishi yo'q. U faqat guruhni pauzaga qo'yadi va qaytaradi.
- Kod o'zgaradigan joylar: `groups/groups-status.service.ts`, `common/status/status-cascade.service.ts` (`GroupPause`), kechki qadam (`attendance/attendance-reminder.service.ts` dagi `closeDay` yonida), `billing/charge-start-date.ts`, `billing/monthly-charge.service.ts` (`reverseChargeForDeparture`), `billing/departure-policy.ts`, xabarlar (`SmsService`), client: guruh sahifasida pauza tarixi, qo'llanma sahifasi va `yangiliklar.ts`.
- Migratsiya: `GroupPause` jadvali va qisman unique indeks.
- Doiradan tashqarida: guruhning dars kunlari (`exactDays`) o'zgarganda yozilgan hisobni qayta hisoblash (#020). Bu alohida ADR.

## CEO qarorlari

Hammasi hal qilingan (23.10.2026):

- pauza darslari `endDate` ni suradi (7a);
- qaytish sanasi pauza va qaytish oynalarida so'raladi (1a–1c);
- pauzada dars aslida o'tgan bo'lsa, CEO bekor qilishni o'chirib, davomatni kiritadi (ADR-0063);
- xabar matnlari tasdiqlandi, o'qituvchiga xabar yuborilmaydi (7-band).
