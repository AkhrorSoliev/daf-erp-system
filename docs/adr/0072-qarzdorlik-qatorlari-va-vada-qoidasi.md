# ADR-0072 — Qarzdorlik sahifasi qarz bo'linishining qatorlarini ko'rsatadi; to'lov va'dasi ko'pi bilan 7 kunga, oyiga bir marta; «Markaz qoplagani» faqat CEO va filial direktoriga

**Holati:** Qabul qilindi
**Sana:** 2026-10-04
**Bog'liq:** ADR-0037, ADR-0042, ADR-0047, ADR-0058, ADR-0059, ADR-0063, ADR-0064, ADR-0067, `server/src/reports/debt-split.ts` (`debtRows`, `debtTabAmount`), `server/src/payments/debt/`, `server/src/payment-promises/promise-rule.ts`, `docs/superpowers/specs/2026-10-04-b2a-qarzdorlik-design.md`, `docs/superpowers/plans/2026-10-04-b2a-qarzdorlik.md`

## Kontekst

ADR-0059 qarzni ikki raqamga ajratdi, lekin «Qarzdorlik» sahifasining ro'yxati
(`GET /payments/debtors`) o'z ta'rifida qoldi: hamma holat, arxiv ham. Kartalar bir
narsani, ro'yxat boshqasini sanardi va ro'yxat kartalarga qo'shilmasdi. CEO 27.09
va 04.10 da maketni tasdiqladi: sahifa uch bo'lim — «Shu oy», «Eski qarz»,
«O'qimayotganlar»; har bo'lim tugmasida jami, umumiy yig'indi yo'q. 04.10 da CEO
to'lov va'dasini ham chekladi: ko'pi bilan 7 kunga va o'quvchiga oyiga bir marta.
Yakuniy shartnomada (02.10) muddatni uzaytirish bandi yo'q — bu markazning o'z qoidasi.

## Qaror (CEO, 27.09.2026 va 04.10.2026)

1. **Ro'yxat = bo'linishning to'plamlari.** `debt-split.ts` har qarzdor uchun qator
   beradi (`debtRows`) va bitta bo'lim qoidasini (`debtTabAmount`): «Shu oy» —
   o'qiyotgan va `currentMonth > 0`, summasi `currentMonth`; «Eski qarz» — o'qiyotgan
   va `older > 0`, summasi `older`; «O'qimayotganlar» — qolganlar, butun qarz.
   Bo'linishning jamlari (`sumDebtRows`) shu qoida bilan qatorlardan qo'shiladi,
   shuning uchun bo'lim jami doim uning qatorlari yig'indisiga teng. Ikkala qismi
   bor o'quvchi ikkala o'qiyotganlar bo'limida turadi — bir qarzning ikki ko'rinishi.
   - Yangi maydonlar: `studying.currentMonthCount` («Shu oy» bo'limining soni) va
     `notStudying.currentMonth` (o'qimayotganlarning shu oy qismi — «Shu oy»
     bo'limidagi farq qatori).
   - O'qimayotganlar endi `groupBy(['status'])` bilan emas, har o'quvchi alohida
     (holati bilan) o'qiladi: ro'yxatga har birining shu oy qismi kerak. Uch tur
     (ADR-0067, 3-band) o'sha qatorlardan sanaladi, natija o'zgarmaydi.
   - Bu ADR-0059 da o'z ta'rifida qoldirilgan qarzdorlar ro'yxatini Qarzdorlik
     sahifasi uchun almashtiradi: sahifaning ro'yxati (`GET /payments/debt/list`)
     endi bo'linishniki.
   - `GET /payments/debtors` yo'li eski ta'rifida qoladi: joylashtirish paytida eski
     mijoz ishlashi uchun. Yangi mijoz uni o'qimaydi; uning xizmati (`getDebtors`)
     esa bosh sahifaning «Eng katta qarzdorlar» blokini boqishda davom etadi. Yo'lni
     olib tashlash — joylashtirishdan keyingi alohida ish.
2. **Qator ma'lumotlari bitta manbadan.**
   - **To'lov muddati** (faqat «Shu oy») — to'lov xabaridagi sananing o'zi
     (ADR-0042): oyning 2-darsi, o'quvchining shu oydagi birinchi hisobi
     guruhining jonli kalendari bo'yicha (`MonthlyPaymentNoticeService.dueDates` →
     `paymentDueDate`). Oyda ikki darsi bo'lmasa — «—».
   - **Qarz oylari** («Qaysi oylardan», «Eng uzoq qarzdor» saralashi) —
     `DebtAgeService`; «Eski qarz» bo'limida faqat joriy oydan oldingi oylar.
   - **«Va'da»** — ro'yxatda ham, tortmada ham o'quvchining eng oxirgi va'dasi,
     qaysi oyda yozilgan bo'lmasin: ochiq va sanasi kelmagan — «ochiq», BROKEN —
     «buzilgan», qolgani — bo'sh. Va'da formasi «shu oy» holatini alohida o'qiydi
     (3-band, `GET /payment-promises/month`).
   - **Tortmadagi oylar** (`GET /payments/debt/students/:id`) — to'lovlar
     hisobotining o'z FIFO taqsimoti (ADR-0037; `StatementService.build` →
     `drawerMonths`), yangi hisob yo'q. Oy qatorida: hisob, qoldi va to'landi =
     hisob − qoldi — har kredit to'langan sanaladi (ADR-0058 dagi kabi), qator doim
     qo'shiladi. Oy bo'lmagan qarz (masalan, mock to'lovi yoki qaytarib berilgan
     pul) — hisobotdagi nomi bilan alohida qator, faqat «qoldi» bilan. Qatorlarning
     «qoldi»si butun qarzga teng.
   - Filtr, saralash, sahifalash serverda. Excel (`GET /payments/debt/excel`) —
     ochiq bo'lim, joriy filtrlar bilan, hamma sahifa.
   - Uchala yo'l Qarzdorlik sahifasining boshqa o'qishlari kabi CEO, filial
     direktori, administrator va kassirga ochiq (2026-08-12 qarori). Tortma shuning
     uchun to'lovlar hisobotining yo'llarini emas (ular kassirga yopiq), o'z yo'lini
     ishlatadi. Boshqa filialdagi o'quvchining tortmasi — 404; chaqiruvchi o'sha
     filialda ham ishlasa, javobda filial nomi bor (ADR-0063 dagi kabi).
3. **Va'da qoidasi.** Qoida bitta faylda (`promise-rule.ts`).
   - Va'da sanasi — bugundan bugun + 7 gacha bo'lgan Toshkent kuni.
   - O'quvchiga bir Toshkent oyida bitta va'da: shu oyda yozilgan (`createdAt`)
     va'da bo'lsa, holati qanday bo'lmasin, yangisi yozilmaydi.
   - Shu oyning ochiq va'dasini surish mumkin, lekin yangi sana va'da yozilgan kun
     + 7 dan oshmaydi; o'sha kun o'tgach, va'dani surib bo'lmaydi.
   - Qoida har yozuvga qo'llanadi: tortmadagi «Va'da yozish» (`POST /payment-promises`
     — faqat oyning birinchi va'dasini yozadi; ixtiyoriy «Summa» — `promisedAmount`),
     qo'ng'iroq natijasi («To'laydi» + sana) va qisman to'lov (qolgani uchun sana).
     Oxirgi ikkisi shu oyning ochiq va'dasini suradi yoki oyning birinchi va'dasini
     yozadi.
   - To'lov (`POST /payments`) va qo'ng'iroq (`POST /call-logs`) va'dani o'z
     yozuvidan OLDIN tekshiradi (`assertPromiseAllowed`): noto'g'ri va'da — 400, hech
     narsa yozilmaydi; to'lov hech qachon va'da sababli yarim qolmaydi.
   - O'tgan oydan qolgan ochiq va'da shu oyning birinchi va'dasi yozilganda bekor
     qilinadi (CANCELLED, o'quvchi tarixiga yoziladi): o'quvchida ochiq va'da bitta —
     unikal indeks. Shu oyning ochiq va'dasi esa bekor qilinmaydi: ikki yozuv bir
     vaqtda kelsa, ikkinchisi indeksga uriladi va 400 oladi.
   - `GET /payment-promises/month?studentId=` — shu oyning va'dasi (holati qanday
     bo'lmasin) va ruxsat etilgan kunlar: yangi va'da uchun (oyda va'da bo'lsa —
     yo'q) va ochiq va'dani surish uchun (oraliq bo'sh bo'lsa — yo'q; teskari
     oraliq qaytmaydi).
   - Va'da darsga kiritmaydi (ADR-0047, ADR-0064) — o'zgarmaydi.
4. **«Markaz qoplagani» Ish haqi sahifasiga ko'chdi.** Qarzdorlik sahifasidagi tab
   Ish haqi sahifasining uchinchi tabi bo'ladi (`/payments/salary?tab=markaz`). Ish
   haqi sahifasi faqat CEO va filial direktoriga ochiq, shuning uchun
   `GET /salary/monthly/center-topup` endi `@Roles('CEO', 'Branch Director')`.
   Administrator va kassir bu ro'yxatni ko'rmaydi (CEO 04.10 da xabardor qilindi).
   Raqamlar o'zgarmaydi — faqat kim ko'rishi.

**Taqiqlanadi:**
- bo'lim jamini yoki sonini `debtTabAmount` dan boshqa qoida bilan hisoblash —
  mijozda ham;
- va'dani `promise-rule.ts` dan o'tkazmay yozish yoki to'lov va qo'ng'iroqda uni
  o'z yozuvidan keyin tekshirish.

## Ko'rib chiqilgan muqobillar

- **Ro'yxatni eski `GET /payments/debtors` ustida qoldirish** — jami va qatorlar ikki
  manbadan kelardi, ular yana ajrab ketardi.
- **Ochiq va'dani istalgancha surish** — har kuni surib qoida aylanib o'tilardi;
  chegara shuning uchun va'da yozilgan kundan sanaladi.
- **O'tgan oyning ochiq va'dasini yangilash** — `createdAt` o'tgan oyda qolgani uchun
  har tahrir yangi 7 kun berardi.

## Oqibatlari

**Yutuq:** sahifadagi uch jami, Moliya bloki, bosh sahifa va Telegram bir funksiyadan
keladi; mavjud raqamlar o'zgarmaydi. ADR-0059 dagi «ro'yxat kartalar bilan mos
tushmaydi» holati yo'qoldi: bo'lim jami — uning qatorlari yig'indisi.

**Narx:**
- Ro'yxat endi arxivdagi kartalarni va «Faol / Muzlatilgan / …» holat filtrini
  ko'rsatmaydi; holatni bo'lim va «guruhsiz / muzlatilgan / ketgan» belgisi aytadi.
- Ikkala qismi bor o'quvchi ikki bo'limda ko'rinadi: bo'limlar sonini qo'shib
  qarzdorlar sonini olib bo'lmaydi.
- Mijoz va'da oynalarida sanani bugun + 7 bilan cheklaydi va shu oy va'da bo'lsa,
  yangisini so'ramaydi (`GET /payment-promises/month`). Shunday bo'lsa ham qisman
  to'lovga qoidaga zid sana berilsa, to'lov ham yozilmaydi (400) — sanani tuzatib
  qayta yuborish kerak.
- Administrator va kassir uchun «Markaz qoplagani» yo'q.
