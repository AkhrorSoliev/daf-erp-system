# ADR-0059 — Qarz ikki alohida raqamda: o'qiyotganlar va o'qimayotganlar qarzi; ikkisi hech qayerda qo'shilmaydi

**Holati:** Qabul qilindi
**Sana:** 2026-10-01
**Bog'liq:** `docs/superpowers/specs/2026-09-27-oylik-tizim-moliya-tuzatishlari-design.md` (A2, 4-band), `docs/superpowers/plans/2026-10-01-a2-2-qarz-ikki-raqam.md`, `server/src/reports/debt-split.ts`, `server/src/students/shared/active-student-where.ts`, `server/src/telegram-groups/daily-snapshot.service.ts`, ADR-0012, ADR-0015, ADR-0058

## Kontekst

«Qarz» — o'quvchining manfiy balansi. Markazga qancha pul qarz ekanini
ko'rsatadigan yuzalar ko'p: Moliya «Qarzdorlik» bloki, Bosh sahifa kartasi,
Qarzdorlik sahifasi kartalari, Aloqa markazi banneri, Telegram 21:00
hisoboti, `/qarzdorlar`, `/stats`, «💰 Moliyaviy xulosa», Excel «Filiallar».
A2 tahlili qarz ko'rsatilgan 27 joyni sanadi va ular uch xil ta'rifda edi:

- **faqat `status: ACTIVE`** — Moliya, Telegram, Excel «Filiallar». Faol guruhi
  yo'q «faol» o'quvchi ham qarzdor bo'lib kirardi: ADR-0015 «faol o'quvchi»
  deydigan to'plamdan boshqa to'plam;
- **hamma holat yig'indisi** — Bosh sahifa va Qarzdorlik sahifasi kartalari
  (sahifada ro'yxat filtriga ergashib, standarti «Barcha holatlar»):
  muzlatilgan, chetlatilgan va arxivdagi kartaning qarzi ham «Jami qarz»ga
  tushardi;
- **boshqa qamrovlar** — balans hisobotidagi «Debitorlik», oylik qarzdorlik,
  ketganlar hisoboti va boshqalar, har biri o'z to'plami bilan.

Hech biri qarzni ikki raqamda ko'rsatmasdi, shuning uchun «Jami qarz» ichida
kim borligi ekrandan ko'rinmasdi. CEO (27.09.2026) shuni talab qildi: qarz —
ikki alohida raqam, o'qiyotganlarniki va qolganlarniki; ular hech qayerda
qo'shilmaydi, «o'rtacha qarz» olib tashlanadi (spec A2, 2-bo'lim, 1-qaror).

## Qaror (spec A2 — CEO, 27.09.2026; Qarzdorlik maketi bilan aniqlashtirildi)

1. **Ikki ta'rif, bitta manba.** Yagona manba — `debt-split.ts`
   (`loadDebtSplit` → sof `splitDebt`): `DebtSplit { studying: { total, count,
   currentMonth, older }, notStudying: { total, count } }`. Yuzalarning ko'pi
   uni `ReportsService.getDebtSplit` orqali o'qiydi; `GET /payments/debtors/summary`
   (`payments-debtors.service.ts`) esa `loadDebtSplit` / `splitDebt` ni
   to'g'ridan-to'g'ri chaqiradi. O'qiyotgan qarzdorlarning sharti ham shu
   faylda — `studyingDebtorWhere`; `/qarzdorlar` ro'yxati ham shu bilan
   o'qiladi. ADR-0015 skaneri (`server/scripts/student-status-inventory.ts`)
   bu chaqiruvni ham kanonik deb biladi: ichida `activeStudentWhere()` turadi.
   - **O'qiyotganlar qarzi** — `deletedAt: null`, `balance < 0` va
     `activeStudentWhere()` (ADR-0015 «faol o'quvchi»: statusi ACTIVE va faol
     guruhda faol yozuvi bor). Qarz har o'quvchi uchun ikkiga bo'linadi:
     **shu oy** (🟡) = `min(qarz, o'quvchining shu Toshkent oyidagi CHARGED
     hisoblari yig'indisi)`, **eski qarz** (🔴) = qolgani;
   - **O'qimayotganlar qarzi** — o'sha asos, lekin `activeStudentWhere()` ning
     inkori bilan: guruhsiz, muzlatilgan, ketgan o'quvchilar. Ikki to'plam bitta
     shartning o'zi va inkori, shuning uchun har qarzdor aniq bittasiga tushadi;
   - **arxivdagi karta** (`deletedAt` bor) ikkalasida ham sanalmaydi;
   - filial qamrovi — qarzdorlar ro'yxati ishlatadigan predikat
     (`studentBranchWhere`), bo'sh qamrov nol beradi. Hisoblar filialsiz
     o'qiladi: balans bitta, o'quvchining shu oydagi hisobi qaysi filialda
     yozilgan bo'lmasin «shu oy»ga kiradi;
   - «shu oy» — doim joriy Toshkent oyi: yuzalar `month` bermaydi (`rm:cfin`
     kartasi o'z oyini ochiq beradi, u ham joriy oy). O'tgan oyni berish uning
     hisoblarini bugungi balansga qarshi qo'yadi — bu o'sha oyning bo'linmasi
     emas.

   Mijoz hech qaysi raqamni o'zi hisoblamaydi va qo'shmaydi.
2. **Spec matniga aniqlik.** Spec A2 o'qiyotganlarni `Student.status = ACTIVE`,
   ikkinchi raqamni esa «Ketganlar va muzlatilganlar qarzi» deb yozgan edi.
   CEO tasdiqlagan Qarzdorlik maketi (27.09) buni to'g'riladi: maketning birinchi
   varianti guruhsiz o'quvchilarni o'qiyotgan sanagani uchun «eski qarz»i
   noto'g'ri chiqqan edi. Faol guruhi yo'q «faol» o'quvchi o'qimayapti — u
   «O'qimayotganlar»ga tushadi, ikkinchi raqam ham shuning uchun «O'qimayotganlar
   qarzi» deb ataladi. Bu ADR-0015 ning «Pul o'lchovlari ataylab chetda» bandini
   qarz yuzalari uchun almashtiradi: Moliya «Qarzdorlik» bloki, Telegram qarz
   bloklari va Excel «Filiallar» endi `status: 'ACTIVE'` emas, ta'rifni
   `debt-split.ts` orqali oladi. Balans hisobotidagi «Debitorlik», «Aktiv
   balans» va qarzdorlar ro'yxati ADR-0015 dagi joyida qoladi.
3. **Yuzalar.**
   - **Moliya** (`GET /reports/financial-overview`, faqat CEO va filial
     direktori): `ReportsService` fasadi javobga `debtSplit` qo'shadi.
     `/payments/overview` «Qarzdorlik» bloki: «O'qiyotganlar qarzi X (N ta)»,
     ostida «🟡 shu oy · 🔴 eski qarz», va «O'qimayotganlar qarzi». Blok
     tanlangan davrga bog'liq emas — bugungi holat. `forecast.outstandingReceivable`,
     `forecast.debtorExposure` va overview'ning `debtorCount` olib tashlandi;
     xom `ReportsFinancialService` overview'si qarz raqamini umuman bermaydi.
   - **Bosh sahifa** (`GET /dashboard/summary`): qarz kartasi
     `overview.debtSplit` dan o'qiydi — karta uchun ikkinchi o'qish yo'q
     (ADR-0012). Sahifaning «E'tibor talab qiladi» bloki esa va'dalar sonini
     `getDebtorSummary` dan oladi va u bo'linmani yana bir bor o'qiydi.
   - **Qarzdorlik sahifasi:** `GET /payments/debtors/summary` endi `{ split,
     openPromises, overduePromises }` qaytaradi; `totalDebt`, `debtorCount`,
     `avgDebt` olib tashlandi. Sahifada ikki qarz kartasi, va'da kartasi va
     «Ro'yxat filtrlari bu kartalarga ta'sir qilmaydi» izohi: kartalar butun
     filial qamrovini tasvirlaydi, ro'yxat filtri ularni o'zgartirmaydi.
     Aloqa markazi banneri `split.studying.total` ni ko'rsatadi.
   - **Telegram:** 21:00 hisoboti, `/qarzdorlar`, `/stats` va «💰 Moliyaviy
     xulosa» qarzni bir xil qatorlarda chop etadi: «O'qiyotganlar qarzi» (soni,
     summasi), uning «🟡 shu oy · 🔴 eski qarz» qatori (o'qiyotganlar qarzi
     bo'lmasa chiqmaydi) va «O'qimayotganlar qarzi». Qatorlarni bitta joy quradi
     — `server/src/telegram-groups/utils/debt-split-lines.util.ts`; sarlavha
     va belgini har yuza o'zi qo'yadi. 21:00 hisobotida birinchi qatorga
     kechagi kunga nisbatan ▲/▼ qo'shiladi; `/qarzdorlar` ularning ostida eng
     katta 5 ta o'qiyotgan qarzdorni sanab beradi. ▲/▼ va 🟡
     yorug'ligi qoidasi faqat «O'qiyotganlar qarzi» summasiga qaraydi;
     o'qimayotganlar chop etiladi, xolos.
   - **Kunlik surat:** `DailyFinancialSnapshot.totalDebt` va `debtorCount` endi
     o'qiyotganlarning summasi va sonini saqlaydi (`DailySnapshotService`
     yozadi).
   - **Excel «Filiallar»:** qarz ustuni — «O'qiyotganlar qarzi (hozir)», har
     filialning o'qiyotganlar jami. «Jami» qatori filiallarni qo'shadi: o'quvchi
     aniq bitta filialga tegishli (D5), hech kim ikki marta sanalmaydi.
   - «Jami qarz» va «O'rtacha qarz» bu yuzalarda yo'q.
4. **Yiqilsa, nol chizilmaydi.** Nol «hech kim qarzdor emas» deb o'qiladi,
   shuning uchun `getDebtSplit` xato bersa overview, 21:00 hisoboti va Excel
   eksporti butunlay yiqiladi; «💰 Moliyaviy xulosa» kartasi esa faqat qarz
   qatorlarini tashlab, qolganini yuboradi.
5. **Mijoz serverdan oldin chiqadi.** ADR-0058 dagi deploy tartibi o'zgarmaydi:
   avval mijoz, keyin server. Shuning uchun yangi mijoz ADR-0059 dan oldingi
   server javobiga chidaydi: bo'linma yo'q joyda «0 so'm» emas, «—» chizadi
   yoki qarz qismini umuman chizmaydi (4-band). Moliya «Qarzdorlik» bloki
   ikkala yorliqni qoldirib «—» chizadi, «🟡 shu oy · 🔴 eski qarz»
   qatorisiz (so'rov xato bersa ham shunday); Bosh sahifa kartasi va
   Qarzdorlik sahifasi kartalari ham «—»; Aloqa markazi banneri qarz qismini
   tashlab, faqat va'dalar sonini ko'rsatadi. Server oldin chiqsa, eski mijoz
   yangi javobda eski maydonlarni topmaydi va qarzni «0 so'm» yoki «—» deb
   chizadi — tartib shuning uchun ham shunday.

**Ataylab o'zgarmadi** (o'z ta'rifi bilan qoladi):
- «Oylik qarzdorlik» tabining plitkalari — holatga (status) asoslangan tarix;
  Qarzdorlik sahifasini qayta qurish (B to'plami) uni qayta ishlaydi;
- Bosh sahifadagi «Eng katta qarzdorlar» ro'yxati — Qarzdorlik ro'yxatining
  boshi, havolasi `/payments/debt` ni «Barcha holatlar»da ochadi. U har
  o'quvchining o'z balansini ko'rsatadi: balanslarni qo'shmaydi va
  o'qiyotgan / o'qimayotganga ajratmaydi. Hamma holatni tartiblaydi, shuning
  uchun ro'yxat qoidasi (`debtorWhere`) bo'yicha arxivdagi karta ham chiqishi
  mumkin. Qarzdorlik sahifasini qayta qurish (B to'plami) uni qayta ko'rib
  chiqishi mumkin;
- `/students` sahifasidagi qarzdorlar soni;
- `/payments/pending`;
- guruh davomat paneli;
- ustozlar to'lov hisobotlari;
- ketgan o'quvchilar hisoboti;
- «Foyda tarkibi»dagi «Qarz bilan ketgan o'quvchilar» ogohlantirishi;
- ustoz oyligi sahifasidagi markaz qo'shimchasi (top-up) raqamlari;
- Excel «Oylar», «Balans», «Tekshiruv» va «Qarzdorlar» varaqlari;
- qo'lda ishga tushiriladigan `build-debt-telegram-report` skripti.

**Taqiqlanadi:**
- ikki raqamni qo'shish — «jami qarz», «o'rtacha qarz» yoki boshqa yig'indi
  sifatida, hech qaysi yuzada, mijozda ham;
- bo'linmani (o'qiyotganlar / o'qimayotganlar, shu oy / eski qarz) `debt-split.ts`
  dan boshqa joyda hisoblash, mijozda ham; «o'qiyotgan»ni `status: 'ACTIVE'` yoki
  o'z sharti bilan sanash — ta'rif faqat `activeStudentWhere()`.

## Ko'rib chiqilgan muqobillar

- **O'qiyotganlar = `Student.status = ACTIVE`** (spec A2 dagi dastlabki matn).
  Rad etildi: faol guruhi yo'q «faol» o'quvchi o'qimayapti, uning qarzi «eski
  qarz»ga aralashib uni oshirib ko'rsatadi; «faol o'quvchi» ta'rifi esa ADR-0015
  da bitta.
- **Moliya blokiga tanlangan davrning oyini berish.** Rad etildi: blok bugungi
  holat, iyulning hisoblari bugungi balansga qarshi qo'yilsa, qarz tugagan oy
  bo'yicha bo'linardi.

## Oqibatlari

**Yutuq:** qarz o'zgargan hamma yuzada bir xil ikki raqam; «Jami qarz» ichida kim
borligi ekranning o'zidan ko'rinadi; «o'qiyotgan» deganda hamma joy bitta
ta'rifni (ADR-0015) ishlatadi.

**Narx:**
- Birinchi deployda o'qiyotganlar qarzi eski «Jami qarz»dan past o'qiladi:
  statusi ACTIVE, lekin faol guruhi yo'q o'quvchi (ADR-0015) endi
  «O'qimayotganlar»da. Pul yo'qolmagan — qarz ikkinchi raqamga o'tdi.
- Statusi ARCHIVED, lekin `deletedAt` bo'sh karta «O'qimayotganlar»da sanaladi.
- Oyning hisoblari yozilguncha hamma o'qiyotganlar qarzi «eski qarz» bo'lib
  o'qiladi; hisoblar yozilgach «shu oy» to'ladi.
- «Shu oy» faqat o'qiyotganlarniki; Moliya kartasidagi «Qoldi» (ADR-0058) esa
  oyning barcha hisoblari bo'yicha, o'qimayotgan o'quvchining shu oy hisobi ham
  unga kiradi. Ikkalasi bir qoidadan (`min`), lekin bir to'plamdan emas —
  teng bo'lishi shart emas.
- Qarzdorlik sahifasi kartalari arxivdagi kartalarning qarzini kiritmaydi,
  ro'yxatning standarti «Barcha holatlar» esa kiritadi: ro'yxat kartalar bilan
  mos tushmaydi. Xuddi shu sahifadagi «Oylik qarzdorlik» tabining plitkalari
  esa eski, holatga asoslangan ta'rifda qoladi.
- **Qarz ikki raqam o'rtasida ko'chib turadi — har kuni bo'lishi mumkin.**
  Qarzdorning qarzi bir raqamdan ikkinchisiga o'tadi, masalan: guruhi
  to'xtatilganda yoki tugaganda, guruhi boshlanganda (FORMING→ACTIVE),
  guruhsiz qarzdor faol guruhga joylashtirilganda. Qarz o'zgarmagan, lekin
  21:00 hisobotining ▲/▼ i buni qarzning o'zgarishi deb o'qiydi:
  o'qiyotganlarga o'tgan qarz ▲, chiqqani ▼ bo'lib ko'rinadi. Bir kunda
  o'qiyotganlarga 500 000 yoki undan ko'p ko'chsa, kun yangi qarzsiz ham 🟡
  bo'ladi.
- **Kunlik suratning ma'nosi bir marta o'zgaradi.** ADR-0059 dan oldingi
  qatorlarda `totalDebt` / `debtorCount` — statusi ACTIVE qarzdorlarniki,
  keyingilarida — o'qiyotganlarniki. Qatorlar qayta yozilmaydi: kunlik surat
  qayta qurilmaydi. Bu ikki ustunni 21:00 hisobotining ▲/▼ idan boshqa
  o'qiydigan joy yo'q. Deploydan keyingi birinchi 21:00 hisoboti eski
  ta'rifdagi qator bilan solishtiradi va uning ▼ i qarz kamayganini emas,
  ta'rif o'zgarganini bildiradi — bir kechqurun. Istisno: deploy bilan o'sha
  hisobot orasida 23:40 surati yozilsa (masalan, deploy o'sha kunning 21:00
  hisoboti bilan 23:40 surati orasiga tushsa), saqlangan birinchi qator
  allaqachon yangi ta'rifda va bunday ▼ chiqmaydi. O'qiyotganlar eski
  to'plamning qismi, shuning uchun o'zgarish farqni faqat kamaytiradi: u o'zi
  🟡 ni yoqmaydi, lekin haqiqiy o'sish shu qadar yashirinadi. Buni chetlab
  o'tadigan kod yo'q.
- Excel «Filiallar» varag'ining izohi o'qimayotganlar qarzi ustunga kirmaganini
  aytmaydi — buni faqat ustun sarlavhasi aytadi. Uning «Jami»si to'liq qarzni
  («Qarzdorlar», «Balans» varaqlari) ko'rsatmaydi.
- **Deploy: avval mijoz (yoki birga), keyin server** — ADR-0058 dagi kabi.
