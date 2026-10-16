# B6 — «Xarajatlar» sahifasi — dizayn

**Sana:** 2026-10-16
**Holati:** CEO tomonidan tasdiqlangan (16.10.2026: yetti qaror — §2)
**Maket:** https://claude.ai/artifact/YA4jhqf4NH8ZrqnBbjB9UL — `v-expenses` bo'limi (CEO 27.09 da tasdiqlagan)

**Tayanadi:** ADR-0038 («Foyda tarkibi» va uning prognozi: `missingRecurringExpenses`), ADR-0058 (oy — Toshkent kalendar oyi), ADR-0067 (B1: «Umumiy ma'lumotlar», «Foyda» kartasi), ADR-0079 / ADR-0087 (imkoniyatlar; avans faqat `salary.pay` bilan), ADR-0082 (avans Ish haqi sahifasida), `docs/branch-decisions.md` D4 (har xarajat bitta filialniki).
**Qaror yozuvi:** yangi ADR — shu PR'da (§7.1). Raqami PR paytidagi keyingi bo'sh raqam (yozilish paytida 0094; `origin/main` dagi `docs/adr/README.md` tekshiriladi). Quyida «yangi ADR».

## 1. Nima uchun

B to'plami Moliya va Hisobotlarni tasdiqlangan maket asosida qayta quradi; 1–5 qismlar tayyor. 6-qism — Moliya → «Xarajatlar» (`/payments/expenses`).

Bugungi sahifa nima beradi va nimasi noto'g'ri:
- Davr — ikki sana (`expenses-filter-bar.tsx`), standart esa brauzer soati bo'yicha joriy oy (`expenses-client.tsx:115-123`, `startOfMonth(new Date())`). Foyda, Ish haqi, To'lovlar — hammasi oy bilan ishlaydi; xarajat sahifasi yagona istisno.
- To'rtta karta (jami, naqd, karta, soni) — o'tgan oy bilan solishtirish yo'q, turkumlar kesimi yo'q, bu raqam foydadagi qaysi qator ekani aytilmagan.
- Mijozda 8 turkumdan faqat 5 tasi bor (`expenses-filter-bar.tsx:13-19`): Jihozlar, Ta'mirlash, Soliqlar na filtrda, na formada (`expense-form-dialog.tsx:152`). Shu sabab soliq «Boshqa»ga yoziladi — `profit-composition.ts:46-48` aynan shuni tan oladi.
- Oyning oxirida keladigan ijara, kommunal va soliq oy o'rtasida yozilmagan bo'ladi, foyda esa haqiqiydan katta ko'rinadi (26.09.2026: sentabr 69.1 mln, ijara, soliq va svet yozilmagan holda — `profit-composition.ts:41-45`). «Foyda» kartasining prognozi buni biladi, xarajat kiritadigan odam esa ko'rmaydi.
- «Kim kiritgan» bo'yicha filtr yo'q; «Boshqa»ga noto'g'ri yozilgan stul, internet yoki tozalovchi oyligi hech qayerda ko'rinmaydi (oylik bu yerga yozilsa, foydadan ikki marta ayiriladi).
- «Xarajat qo'shish», «Tahrirlash», «O'chirish» `expenses.manage` siz ko'ruvchiga ham ko'rinadi va 403 oladi.

Yangi sahifa savolga to'g'ridan-to'g'ri javob beradi: «Shu oy qancha xarajat yozildi, nimaga, kim yozdi va nima hali yozilmagan?» — jami foydadagi «Boshqa xarajatlar» qatorining o'zi.

## 2. CEO qarorlari (16.10.2026)

1. Sahifa `/payments/expenses`, Moliya menyusida, kirish o'zgarmaydi: ko'rish `expenses.view`, yozish `expenses.manage`; avans (`TEACHER_ADVANCE`) bu yerda hech qachon yo'q. Sarlavha «Xarajatlar», oy tanlovi «‹ Oktabr 2026 ›» (`MonthStepper`, `?oy=YYYY-MM`, 2026-05 dan joriy Toshkent oyigacha) — FAQAT oy, sana oralig'i yo'q; «PDF» (o'sha oy, joriy filtrlar bilan); «Xarajat qo'shish».
2. «Bu oy hali yozilmagan» ogohlantirish kartasi (sariq), FAQAT joriy oyda: o'tgan oyda bo'lgan, bu oy yo'q yoki kamroq bo'lgan Ijara (RENT), Kommunal (UTILITIES), Soliq (TAXES; tavsifida /soliq/i bo'lgan OTHER ham) — `profit-composition.ts` dagi `missingRecurringExpenses` / `recurringKeyOf` qoidasining o'zi (Foyda prognozi bilan bir qoida); va bu oy bitta ham xarajat yozilmagan har filial uchun qator. Takrorlanadigan har qatorda «Yozish»: xarajat oynasi shu turkum, yetmayotgan summa (bu oy hech narsa yozilmagan bo'lsa — o'tgan oy summasi; CEO 16.10: «tavsiya bo'yicha») va tavsif bilan to'ldirilib ochiladi. Pastida «Bular yozilmaguncha foyda haqiqiydan katta ko'rinadi.»
3. Oy kartasi: jami, «N ta · naqd X · karta Y», yashil qator «Foydadagi «Boshqa xarajatlar» qatorining o'zi» (shu oy va doiradagi kanonik sof foydaning `operatingExpenses` iga teng, avans kirmaydi; buni test isbotlaydi); turkumlar jadvali — avansdan boshqa 8 turkum (Ijara, Kommunal, Ta'minot, Marketing, Jihozlar, Ta'mirlash, Soliqlar, Boshqa), shu oy (chiziq bilan) va o'tgan oy, «Jami» qatori; turkum bosilsa pastdagi ro'yxat shu turkumga filtrlanadi (`?turkum=`).
4. Filtrlar: tavsif bo'yicha qidiruv, turkum (bir nechta), to'lov turi naqd/karta, «Kim kiritgan» (YANGI server filtri, `createdById`; variantlar — doirada xarajat kiritgan odamlar), «Tozalash»; «Tanlangan: N ta · X so'm» qatori. Jadval: `#`, Sana, Turkum, Tavsif, Summa, To'lov turi, Kim kiritgan, ⋯ (Tahrirlash, Tarix, O'chirish — bor). Mijozga 8 turkumning hammasi qo'shiladi.
5. Maslahat belgilari faqat «Boshqa» (OTHER) qatorlarda, tavsifdagi kalit so'zlar bo'yicha: «Jihozlar turkumi emasmi?», «Kommunal turkumi emasmi?», «Xodimlar oyligida ham bormi?». Ba'zan noto'g'ri maslahat chiqishi qabul qilinadi.
6. Izoh: avanslar Ish haqi → Avanslar'da, xodimlar oyligi Ish haqida; bu yerga yozilmaydi, aks holda foydadan ikki marta ayiriladi.
7. Migratsiya yo'q.

## 3. Sahifa — `/payments/expenses`

### 3.1 Menyu, kirish
- Moliya menyusidagi «Xarajatlar» bandi o'zgarmaydi (`payments-nav.ts:26`, `permission: "expenses.view"` — standart: CEO, filial direktori).
- Filial — tepadagi tanlovdan, bugungidek (`branchId` so'rovda, server `resolveCallerReportBranchIds` bilan doirani hisoblaydi, bo'sh doira — 403 «Bu filial xarajatlarini ko'rish huquqingiz yo'q»). CEO «Barcha filiallar»da — hamma filiallar yig'indisi.
- Yozish tugmalari («Xarajat qo'shish», ogohlantirishdagi «Yozish», ⋯ ichidagi «Tahrirlash» va «O'chirish») `useCan("expenses.manage")` bo'lmasa DOM'da yo'q. «Tarix» `expenses.view` bilan qoladi.

### 3.2 Sarlavha
«Xarajatlar», oy tanlovi «‹ Oktabr 2026 ›» (`MonthStepper`; standart va eng kattasi — joriy Toshkent oyi, eng kichigi `2026-05`), «PDF» (shu oy va joriy filtrlar; ro'yxat bo'sh bo'lsa o'chiq) va «Xarajat qo'shish». Sana oralig'i va «PDF qaysi davr uchun?» oynasi olib tashlanadi.

### 3.3 «Bu oy hali yozilmagan» kartasi
- Faqat joriy Toshkent oyida va qatori bo'lsa chiqadi (sariq `Alert`, sarlavha «Bu oy hali yozilmagan»).
- Takrorlanadigan xarajat qatori (server `missing[]`, §5.2):
  - bu oy hech narsa yozilmagan: «**Ijara** — avgustda 17.8 mln edi»;
  - qisman yozilgan: «**Kommunal** — avgustda 4.7 mln edi, oktabrda hozircha 70 000 so'm».
  - Doirada bir nechta filial bo'lsa nomdan keyin filial: «**Ijara · Namangan** — …».
  - Nomlar: RENT «Ijara», UTILITIES «Kommunal», TAXES «Soliq». Summa — B3 ning `mln()` yordamchisi (`salary/salary-page-model.ts`: 100 000 dan kichigi to'liq «X so'm»). Oy nomi kichik harf bilan + «da».
  - O'ngda «Yozish» (`expenses.manage`): xarajat oynasi turkum = qator kaliti (TAXES → «Soliqlar»), summa = `amount` (qolgani, §4.3), tavsif = «Ijara — oktabr 2026», filial = qatorning filiali, sana = bugun, to'lov turi = naqd bilan to'ldirilib ochiladi. Saqlangach karta qayta o'qiladi va qator o'zi yo'qoladi.
- Bo'sh filial qatori (server `emptyBranches[]`): «**Namangan filiali** — bu oy bitta ham xarajat yozilmagan», tugmasiz.
- Pastida kulrang: «Bular yozilmaguncha foyda haqiqiydan katta ko'rinadi.»

### 3.4 Oy kartasi
- Chapda: «{Oy} xarajatlari», katta jami (`mln`), ostida «N ta · naqd X · karta Y». O'ngda yashil qator (belgi bilan): «Foydadagi «Boshqa xarajatlar» qatorining o'zi».
- Turkumlar jadvali: ustunlar «Turkum», «{Oy}» (chiziq — shu oyning eng katta turkumiga nisbatan, yonida summa yoki kulrang «0»), «{O'tgan oy}» (o'ngga tekislangan). Har doim 8 qator, server yuborgan qat'iy tartibda (§5.2): Ijara, Kommunal, Ta'minot, Marketing, Jihozlar, Ta'mirlash, Soliqlar, Boshqa (CEO qaroridagi tartib; maketdagi summa bo'yicha tartib oydan oyga qatorlarni sakratardi). Oxirida qalin «Jami» (`total` va `lastMonthTotal`).
- Joriy oyda, takrorlanadigan turkum bu oy 0 va o'tgan oy > 0 bo'lsa, summa o'rnida sariq «yozilmagan» pill (server `notRecorded`).
- Qator bosilsa (yoki Enter/Space) `?turkum=` shu bitta turkum bo'ladi; shu turkum yolg'iz tanlangan bo'lsa — tozalanadi. Tanlangan qator ajratib ko'rsatiladi. Ostida kulrang: «Turkumni bosing — pastdagi ro'yxat shu turkumga filtrlanadi.»
- Karta filtrlarga bog'liq emas (qidiruv, turkum, to'lov turi, «Kim kiritgan» uni o'zgartirmaydi) — faqat oy va filial.

### 3.5 Filtrlar
- Qidiruv: placeholder «Tavsif bo'yicha qidirish», 300 ms kechikish — `?q=`.
- Turkum: `MultiSelectCombobox`, «Barcha turkumlar», 8 variant — `?turkum=RENT,TAXES`.
- To'lov turi: `Select`, «Naqd va karta» / «Naqd» / «Karta» — `?usul=naqd|karta` (ikkalasini tanlash hech narsa tanlamaslik bilan bir xil, shuning uchun bitta tanlov — client/CLAUDE.md «Filter Bars»).
- «Kim kiritgan»: `MultiSelectCombobox`, «Kim kiritgan: hammasi», variantlar `month-summary` ning `creators` idan (ism + familiya, avatar bosh harflari) — `?kim=10234,10567`.
- «Tozalash» — biror filtr bo'lsa ko'rinadi; `oy` ni tozalamaydi.
- Ostida: «Tanlangan: **N ta** · **X so'm**» — ro'yxat javobining `total` va `summary.totalAmount` i (filtrlangan butun to'plam, sahifa emas).
- Har qanday filtr o'zgarsa sahifa 1 ga qaytadi; filtrlash serverda.

### 3.6 Jadval
- Ustunlar: `#` (`(sahifa−1)×soni+i+1`, `border-r`) · Sana (`dd.MM.yyyy`) · Turkum (`Badge`) · Tavsif (OTHER qatorda maslahat bo'lsa yonida sariq pill — §4.4) · Summa (o'ngga, qalin, «X so'm») · To'lov turi («Naqd» / «Karta») · Kim kiritgan (ism, ostida kulrang `dd.MM.yyyy, HH:mm`) · ⋯ (`MoreHorizontal` dropdown: Tahrirlash, Tarix, O'chirish — bugungi oynalar).
- Tartib: sana kamayish bo'yicha, keyin `createdAt` va `id` kamayish bo'yicha (bugun faqat sana — bir kunlik qatorlar sahifadan sahifaga sakraydi).
- Sahifalash — loyiha qoidasi: standart 10, «10 / 20 / 30 / 40 / 50» (`?sahifa=`, `?soni=`).
- Pastda kulrang izoh (qaror 6): «Ustozlarga avans — Ish haqi → Avanslar bo'limida. Xodimlar oyligi — Ish haqida; bu yerga yozilmaydi, aks holda foydadan ikki marta ayiriladi.»

### 3.7 Xarajat oynasi
`expense-form-dialog.tsx` o'zgaradi: turkum ro'yxati 8 ta (`EXPENSE_CATEGORY_LABELS`); yangi `preset?: { category, amount, description, branchId }` prop — «Yozish» shu bilan ochadi, `branchId` header tanlovidan ustun. Boshqa hamma narsa bugungidek (filialsiz yangi xarajat — «Avval filialni tanlang — xarajat filialsiz saqlanmaydi»). To'lov turi yorlig'i «Naqt» → «Naqd» (mijozda ham, PDF'da ham).

### 3.8 Bo'sh holat, yuklanish, xato
- Oyda xarajat yo'q: kartada «Bu oyda xarajat yozilmagan», jadvalda «Bu oyda xarajat yozilmagan». Filtr natija bermasa: «Bu tanlovda xarajat yo'q» + «Tozalash».
- Karta, ogohlantirish va jadval — har biri o'z so'rovi, o'z skeleti; javobsiz so'rov hech qachon bo'sh holatni chizmaydi; xato — «Ma'lumotni yuklab bo'lmadi» + «Qayta urinish». Ogohlantirish so'rovi yiqilsa karta chizilmaydi (asosiy ma'lumot emas), oy kartasi xatosi esa ko'rsatiladi.

## 4. Ma'lumot qoidalari

### 4.1 Oy oynasi
- Oy — Toshkent kalendar oyi: `date >= utcMidnightFromDateStr('YYYY-MM-01')` va `date < utcMidnightFromDateStr(keyingi oy 01)` (`Expense.date` — `@db.Date`; server/CLAUDE.md «Day boundaries»: yuqori chegara `lt`). Bitta yordamchi (`expenseMonthWindow`, §5.1) ro'yxat, `month-summary` va PDF uchun.
- `oy` qiymati: `YYYY-MM`; `2026-05` dan kichik — 400 «Xarajatlar may 2026 dan boshlab ko'rsatiladi»; joriy Toshkent oyidan (`tashkentMonthKey(new Date())`) katta — 400 «Kelajak oyni tanlab bo'lmaydi».
- Nega serverda `oy`, mijoz hisoblagan sana emas: oy chegarasini bitta joy biladi (mijozning bugungi `startOfMonth` i brauzer soatida), PDF sarlavhasi oyni nomlaydi, va server kanonik foyda bilan bir oynani ishlatishi testda isbotlanadi (§8). Eski `startDate` / `endDate` DTO'da qoladi (eski mijoz deploy oralig'ida ishlaydi); `oy` bilan birga kelsa — 400 «Oy yoki sana oralig'i — ikkalasi birga emas».

### 4.2 Jami foyda bilan bitta to'plam
Oy kartasining `total` i = shu oy va doiradagi `ReportsService.getMonthlyNetProfit(...).operatingExpenses`. Ikkalasi bir to'plamni o'qiydi: `companyId`, `deletedAt: null`, `category ≠ TEACHER_ADVANCE`, oy oynasi, `branchIdWhere(scope)`. Kanonik tomonda bu `getProfitLoss` ning `expense.groupBy` i (`reports-profit-loss.service.ts:66-67, 160-168`: `date gte/lte` oyning birinchi va oxirgi kuni, avans keyin ajratiladi) va `buildNetProfit` ning `byCategory` yig'indisi (`reports-excel.helpers.ts:208`). Xarajat sahifasi bu raqamni qayta hisoblamaydi deb aytish yetmaydi — §8 dagi tenglik testi chegara kunlari, avans, o'chirilgan va boshqa filial qatorlari bilan isbotlaydi.

### 4.3 «Bu oy hali yozilmagan» (yangi: filial kesimida)
- Qoida o'zgarmaydi: `missingRecurringExpenses(o'tganOy, buOy)` (`profit-composition.ts:91-124`) — o'tgan oy jami − bu oy yozilgani, manfiy emas; RENT, TAXES, UTILITIES tartibida; `recurringKeyOf` OTHER + /soliq/i ni TAXES deb oladi. Ikkinchi qoida yozilmaydi.
- Yangi: funksiya doiradagi **har filial uchun alohida** chaqiriladi (o'tgan oy va bu oy qatorlari `branchId` bo'yicha guruhlanadi). Sabab: «Yozish» bitta filialga bitta xarajat yozadi (D4); ikki filial yig'indisidan chiqqan summa hech bir filialning ijarasi emas, va bir filialning ortiqchasi ikkinchisining yetishmaganini yashirib qo'yardi. Bitta filialli doirada natija Foyda prognozi bilan aynan bir xil; ko'p filialli doirada prognoz (yig'indi bo'yicha) o'zgarmaydi — bu kartaga tegmaydi.
- «Yozish» summasi — `amount` (qolgani). Bu oy hech narsa yozilmagan bo'lsa bu o'tgan oyning summasi; qisman yozilgan bo'lsa — qolgani, aks holda ikki marta yoziladi.
- Bo'sh filial: doiradagi `deletedAt: null`, `status: ACTIVE` filial, shu oy avansdan boshqa bitta ham xarajati yo'q. Bitta filialli doirada ham ko'rsatiladi.
- Hammasi faqat joriy oyda hisoblanadi; o'tgan oy uchun `missing` va `emptyBranches` bo'sh.

### 4.4 Maslahat belgilari (server, pure qoida)
- `expenseHint({ category, description })` → `'SALARY' | 'EQUIPMENT' | 'UTILITIES' | null`, faqat `category === OTHER` da; yangi `server/src/expenses/expense-hints.ts`. Ro'yxat javobining har qatori `hint` maydonini oladi; mijoz uchta qat'iy matnga moslaydi: SALARY «Xodimlar oyligida ham bormi?», EQUIPMENT «Jihozlar turkumi emasmi?», UTILITIES «Kommunal turkumi emasmi?».
- Moslash: kichik-katta harfga qaramay, so'z boshidan (`(^|[^\p{L}])kalit`, `u` bayrog'i bilan) — «stul» «stullar»ni topadi, «pastol»ni emas.
  - SALARY: oylik, maosh, ish haqi, avans, tozalovchi, farrosh, yordamchi, qorovul, oshpaz.
  - EQUIPMENT: stul, stol, kompyuter, noutbuk, printer, mebel, shkaf, doska, proyektor, monitor, konditsioner, televizor, kolonka, mikrofon.
  - UTILITIES: internet, svet, elektr, gaz, suv, issiqlik, isitish, hosting, server, domen, chiqindi.
- Bir nechtasi mos kelsa — bitta: SALARY, keyin EQUIPMENT, keyin UTILITIES (oylikning ikki marta ayirilishi eng qimmat xato).
- Nega serverda: kalit so'zlar bitta joyda va jest bilan tekshiriladi; ro'yxat o'zgarsa faqat server chiqadi; mijozda nusxa va nusxa-solishtirish testi kerak bo'lmaydi. Noto'g'ri maslahat (masalan «Instagram oylik obunasi») qabul qilingan (qaror 5).

### 4.5 «Kim kiritgan»
- Filtr: `createdById` (bir nechta, vergul bilan; `toNumberArray` + `equalsOrIn`, bo'sh — `undefined`).
- Variantlar: shu oy va doirada avansdan boshqa xarajat kiritgan odamlar (`Expense.createdById` distinct, `User` ism-familiyasi), familiya bo'yicha. O'chirilgan yoki nofaol xodim ham — uning xarajati turibdi.

## 5. Server

### 5.1 Umumiy
- Yangi fayllar `server/src/expenses/` da: `expenses-month.ts` (pure: `parseExpenseMonth`, `expenseMonthWindow`, `buildCategoryRows`, `missingByBranch`, `emptyBranches`), `expense-hints.ts` (pure), `expenses-month.service.ts` (`ExpensesMonthService`, yuklovchi). `expenses.service.ts` allaqachon 778 qator — unga faqat kichik o'zgarishlar (§5.3).
- Kirish: `ExpensesController.scope()` (`expenses.controller.ts:41-56`) — bugungidek. Yangi route ham shu orqali.
- Kesh yo'q: oyda bir necha o'nlab xarajat.

### 5.2 `GET /expenses/month-summary?oy=&branchId=`
`@Can('expenses.view')`, `scope(userId, branchId)`. `oy` bo'sh — joriy oy. Javob:
```ts
{
  month: 'YYYY-MM',
  isCurrentMonth: boolean,
  total: number, count: number, cashTotal: number, cardTotal: number,
  lastMonthTotal: number,
  byCategory: Array<{            // 8 qator, qat'iy tartib:
    category: ExpenseCategory,   // RENT, UTILITIES, SUPPLIES, MARKETING,
    amount: number,              // EQUIPMENT, MAINTENANCE, TAXES, OTHER
    count: number,
    lastMonthAmount: number,
    notRecorded: boolean,        // joriy oy, RENT/UTILITIES/TAXES, amount 0, o'tgan oy > 0
  }>,
  missing: Array<{               // joriy oydan boshqa oyda []
    key: 'RENT' | 'UTILITIES' | 'TAXES',
    branchId: number, branchName: string,
    amount: number,              // qolgani — «Yozish» summasi
    lastMonthAmount: number,
    thisMonthAmount: number,     // lastMonthAmount − amount
  }>,
  multiBranch: boolean,          // doirada bir nechta filial — qatorda filial nomi
  emptyBranches: Array<{ id: number, name: string }>,  // joriy oydan boshqa oyda []
  creators: Array<{ id: number, firstName: string, lastName: string }>,
}
```
Ikki so'rov qatori (`findMany`, select: category, description, amount, paymentMethod, date, branchId, createdById) — shu oy va o'tgan oy, ikkalasi §4.2 to'plami; hamma raqam xotirada hisoblanadi; filiallar va `creators` ismlari — bitta-bittadan so'rov. `byCategory` dagi `amount` lar yig'indisi = `total`.

### 5.3 `GET /expenses` va `GET /expenses/pdf` o'zgarishlari
- `ExpenseQueryDto` ga: `oy?: string` (`@Matches(/^\d{4}-\d{2}$/)`), `createdById?: number[]` (`toNumberArray`, `@IsInt({ each: true })`). `buildWhere` (`expenses.service.ts:301-338`) `oy` ni `expenseMonthWindow` bilan, `createdById` ni `equalsOrIn` bilan qo'shadi; §4.1 dagi 400 lar.
- `findAll` (`:353-410`): `orderBy: [{ date: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }]`; har qatorga `hint: expenseHint(row)`. `summary` o'zgarmaydi («Tanlangan» qatori uni o'qiydi). `exportAll` ham shu tartibda.
- PDF (`generateExpensesPdf`, `:483-542`): «Davr» qatori `oy` bo'lsa «Oktabr 2026» (`buildDateRangeLabel` ga oy varianti); filtrlar qatoriga «Kim kiritgan: …» (tanlanganlar ismi); `METHOD_LABELS.CASH` «Naqd». Fayl nomi `xarajatlar-YYYY-MM.pdf` (`oy` bo'lsa; aks holda bugungidek).

### 5.4 Ruxsatlar va qo'riqchilar
- `expenses.view` / `expenses.manage` o'zgarmaydi.
- `route-access.snapshot.json`: `"GET /expenses/month-summary": ["Branch Director", "CEO"]`; `permission-routes.spec.ts` u bilan o'tadi.
- `branch-route-policy.ts`: `GET /expenses/month-summary` — `GET /expenses` turgan `BRANCH_SCOPED_BY_SERVICE` ro'yxatiga.
- `reports-branch-scope-coverage` ruhida: doira bilan `ExpensesMonthService` ning har `expense` so'rovi `branchId` predikatini tashiydi (spec, §8).

### 5.5 Olib tashlanadi
Serverda hech narsa (eski `startDate` / `endDate` qoladi, §4.1). Mijozda — §6.1.

## 6. Mijoz

### 6.1 Fayllar (`client/src/components/payments/expenses/`)
- Yangi: `expenses-url.ts` (URL ↔ filtrlar ↔ server parametrlari, `EXPENSES_SCHEMA`), `expenses-queries.ts` (`EXPENSES_KEYS`, `useExpensesList`, `useExpensesMonthSummary`, `invalidateExpenses`), `expenses-labels.ts` (8 turkum, to'lov turi, maslahat matnlari), `expenses-format.ts` (pure: ogohlantirish qatori matni, `turkum` almashtirish), `expenses-page.tsx`, `expenses-missing-card.tsx`, `expenses-month-card.tsx`, `expenses-filter-bar.tsx`, `expenses-table.tsx`.
- Ko'chadi va o'zgaradi: `expense-form-dialog.tsx` (§3.7) shu papkaga.
- O'chiriladi: `expenses-client.tsx`, `expenses-summary-cards.tsx`, eski `expenses-filter-bar.tsx`, `expenses-pdf-range-dialog.tsx`. `app/(dashboard)/payments/expenses/page.tsx` yangi sahifani chizadi (`<Suspense>` bilan).
- Mijoz hech qanday raqam hisoblamaydi: jami, naqd/karta, turkum summalari, «yozilmagan», qolgan summa — hammasi serverdan. Chiziq uzunligi (eng katta turkumga nisbat) — faqat chizish.

### 6.2 URL kalitlari
`oy`, `q`, `turkum`, `usul` (`naqd|karta`), `kim`, `sahifa`, `soni`. Standart qiymatlar URL'dan tushiriladi (`useUrlFilters`; joriy oy ham). Server parametrlari bugungi nomlarida qoladi — `expenses-url.ts` bitta funksiyada moslaydi: `q → search`, `turkum → category`, `usul → paymentMethod` (`CASH|CARD`), `kim → createdById`, `sahifa/soni → page/pageSize`, `oy → oy` (joriy oy yuborilmaydi). Sabab: DTO ro'yxat, PDF va mavjud spec'lar bilan umumiy, nomini o'zgartirish hech narsa bermaydi. Eski `?startDate=` / `?category=` havolalari e'tiborsiz qoladi (sahifa joriy oyni ochadi).

### 6.3 Yangilash
Har yozuvdan keyin (`create`, `update`, `delete`) `invalidateExpenses`: `["expenses"]` (ro'yxat ham, `month-summary` ham) va `OVERVIEW_QUERY_KEYS` («Foyda» kartasi, «Oylar bo'yicha»). Moliya ma'lumoti — optimistik emas.

### 6.4 Menyu va matnlar
`payments-nav.ts`, `breadcrumb-routes.ts` o'zgarmaydi. Global qidiruvda (`client/src/data/searchable-pages.ts`) xarajatlar bandi yo'q — yangi band: «Xarajatlar», `/payments/expenses`, kalit so'zlar «xarajat», «ijara», «kommunal», «soliq», «chiqim». Hamma matn lotin o'zbekchasida; inglizcha so'z yo'q.

## 7. Hujjatlar

### 7.1 Yangi ADR
Sarlavha: «Xarajatlar sahifasi oy bo'yicha: jami — foydadagi «Boshqa xarajatlar» bilan bitta to'plam; «hali yozilmagan» Foyda prognozi qoidasidan, filial kesimida». Qaror: §4.1–§4.4 — oy serverda (`oy`, may 2026 dan), sana oralig'i yo'q; jami = kanonik `operatingExpenses`, tenglik testi bilan; `missingRecurringExpenses` har filialga alohida, «Yozish» qolganini yozadi; maslahat belgilari serverda, faqat OTHER, so'z boshidan, bitta ustuvorlik tartibi bilan. Taqiqlanadi: xarajat jamisini kanonik to'plamdan boshqacha hisoblash (masalan avans bilan yoki `lte` + vaqt belgisi bilan); ikkinchi «yozilmagan» qoidasi. Muqobillar: ogohlantirish doira yig'indisi bo'yicha (Foyda kartasidagidek) — oddiyroq, lekin «Yozish» qaysi filialga yozishini bilmaydi va filiallar bir-birini yashiradi (tanlanmadi); maslahat mijozda — bitta tarmoq kamroq, lekin kalit so'zlar ikki joyda (tanlanmadi); sana oralig'i qoldirish — CEO tanlamadi. Oqibatlar: may 2026 dan oldingi xarajatlar sahifada ko'rinmaydi; ko'p filialli doirada «yozilmagan» summalari yig'indisi Foyda prognozidagi raqamdan farq qilishi mumkin.

### 7.2 Boshqalar
- `server/CLAUDE.md` «Expenses Module»: endpointlar ro'yxatiga `GET /expenses/pdf` va `GET /expenses/month-summary`; «Roles: CEO, BD …» qatori imkoniyat bilan almashtiriladi (`expenses.view` / `expenses.manage`, avans `salary.pay`, ADR-0087); `oy`, `createdById`, `hint` va jamining kanonik foyda bilan tengligi (yangi ADR).
- `client/CLAUDE.md` «Financial UI» jadvali: `/payments/expenses` qatori yangi fayllar va qoidalar bilan; «Dialog / Modal Scroll Safety» dagi reference `expenses-client.tsx` → `expenses/expense-form-dialog.tsx`.
- Qo'llanma: yangi `client/src/qollanma/kontent/xarajatlar/xarajatlar-sahifasi.mdx` + yangi `client/src/qollanma/sahifalar/xarajatlar.ts` (mavjud `xarajatlar` bo'limi, `bolimlar.ts:26`) va `sahifalar/index.ts` da `...tolovlar` bilan `...hisobotlar` orasiga `...xarajatlar`. Reyestr: `sahifa: "xarajatlar-sahifasi"`, `sarlavha: "Xarajatlar sahifasi"`, `rollar: [1, 2]`, `yollar: ["/payments/expenses"]`, `adr: [yangi, "0038"]`, kalit so'zlar: «xarajat», «xarajat qo'shish», «ijara», «kommunal», «soliq», «turkum», «kim kiritgan», «bu oy hali yozilmagan», «boshqa xarajatlar», «avans», «filial xarajati». Sahifa matni: oy tanlovi, ogohlantirish va «Yozish», oy kartasi va foyda bilan tengligi, filtrlar, maslahat belgilari, avans va oylik nega bu yerga yozilmasligi. Haqiqiy ism va summa yo'q. Skrinshot — `qollanma:skrinshot` kadrlari ro'yxatiga bitta kadr.
- `yangiliklar.ts` (eng tepaga), `rollar: [1, 2]`, `sahifa: { bolim: "xarajatlar", sahifa: "xarajatlar-sahifasi" }`, sarlavha «Xarajatlar sahifasi yangilandi», matn:
  > «Moliya → «Xarajatlar»da endi oy tanlanadi. Tepada oyning jami xarajati va turkumlar bo'yicha shu oy bilan o'tgan oy — jami «Foyda»dagi «Boshqa xarajatlar» bilan bir xil. Joriy oyda o'tgan oy yozilgan ijara, kommunal yoki soliq hali yozilmagan bo'lsa, ogohlantirish chiqadi: «Yozish» xarajat oynasini to'ldirib ochadi. «Kim kiritgan» filtri va Jihozlar, Ta'mirlash, Soliqlar turkumlari qo'shildi.»

## 8. Testlar
- `expenses-month.spec.ts`: `parseExpenseMonth` (format, may 2026 chegarasi, kelajak oy, bo'sh → joriy, 1-sana 00:00–05:00 Toshkent); `expenseMonthWindow` (`lt` keyingi oy); `buildCategoryRows` (8 qator, tartib, `notRecorded` faqat joriy oy va uch turkumda, yig'indi = total); `missingByBranch` (bitta filialda `missingRecurringExpenses` bilan aynan teng; ikki filial — biri ortiq, biri kam: kami ko'rinadi; OTHER + «Soliqlar» TAXES; qisman yozilgan — qolgani); `emptyBranches` (nofaol va o'chirilgan filial yo'q).
- `expense-hints.spec.ts`: har guruhdan kalit so'z; faqat OTHER; so'z boshi («stullar» bor, «pastol» yo'q); katta harf; ustuvorlik (SALARY > EQUIPMENT > UTILITIES); bo'sh tavsif.
- **Tenglik testi** `expenses-month.profit-parity.spec.ts`: xotiradagi qatorlar ustida ishlaydigan kichik soxta Prisma (`expense.groupBy` / `findMany` uchun `companyId`, `deletedAt`, `category` not/in, `branchId` in, `date` gte/lte/lt; `payment.groupBy` va `salaryPayment.findMany` bo'sh), tasodifiy qatorlar — oldingi oyning oxirgi kuni, oyning oxirgi kuni, keyingi oyning 1-kuni, avans, o'chirilgan, boshqa filial, boshqa kompaniya. Har oy va doira (`null`, `[1]`, `[1,2]`) uchun `ExpensesMonthService.monthSummary().total` === `ReportsProfitLossService.getProfitLoss` ning `operatingExpenses.byCategory` yig'indisi (ya'ni `buildNetProfit(...).operatingExpenses`).
- Servis: `month-summary` (o'tgan oyda `missing`/`emptyBranches` bo'sh, `creators`, `multiBranch`); ro'yxat `oy` + `createdById` filtrlari, `oy` + sana — 400, oy chegaralari — 400, tartib, `hint`; PDF — «Davr» oy nomi, «Kim kiritgan» qatori, fayl nomi, «Naqd»; doira bilan har `expense` so'rovi `branchId` tashiydi.
- Controller: `month-summary` uchun `routeAccess` (`expenses.view`) va `defaultRolesOf` (CEO, filial direktori); bo'sh doira — 403; `permission-routes.spec.ts`; `ExpenseQueryDto` uchun body-validation e2e ruhida — noma'lum `oy` formati 400.
- Mijoz (vitest, `.test.ts`): `expenses-url.test.ts` (URL ↔ server parametrlari, standartlar tushirilishi, `turkum` almashtirish); `expenses-labels.test.ts` — turkum kalitlari `server/prisma/schema.prisma` dagi `ExpenseCategory` (avanssiz) bilan bir xil (bugungi 3 ta yo'qolgan turkum xatosi qaytmasin); `expenses-format.test.ts` («avgustda 17.8 mln edi», qisman, filial nomi, «so'm» 100 000 dan kichik); karta, ogohlantirish va jadval statik render (bo'sh, xato, «yozilmagan» pill, maslahat pill, `expenses.manage` siz tugmalar yo'q).

## 9. Deploy tartibi
Migratsiya yo'q, skript yo'q. Avval server: yangi parametrlar va route qo'shimcha, eski mijoz yangi serverda ishlaydi. Keyin sayt: yangi mijoz eski serverda `oy` ga 400 va `month-summary` ga 404 olardi. Deploydan keyin bir marta qo'lda: joriy oy uchun xarajat sahifasidagi jami = «Umumiy ma'lumotlar» → «Foyda» → «Qanday hisoblandi» dagi «Boshqa xarajatlar» (CEO, «Barcha filiallar» va har filial).

## 10. Ma'lum cheklovlar
- May 2026 dan oldingi xarajatlar sahifada va PDF'da yo'q (oy tanlovi pastki chegarasi).
- «Yozilmagan» o'tgan oyga qaraydi: o'tgan oy ham yozilmagan bo'lsa, ogohlantirish yo'q; boshqa turkumga yozilgan ijara (masalan «Boshqa») uni yopmaydi. Oyning 1-kunida hamma filial «bo'sh» qatori va hamma takrorlanadigan qatorlar chiqadi — to'g'ri, lekin shovqinli.
- Ko'p filialli doirada «yozilmagan» qatorlari yig'indisi Foyda prognozidagi `missingExpenses` dan farq qilishi mumkin (u yig'indi bo'yicha, bu filial bo'yicha).
- Avval «Boshqa»ga yozilgan soliq turkumlar jadvalida «Boshqa» qatorida qoladi («Soliqlar»da emas); ogohlantirish uni baribir soliq deb sanaydi. Teskarisi: o'tgan oy soliq «Boshqa»ga tavsifida «soliq» bilan yozilgan bo'lsa, jadvalda «Soliqlar» belgisi chiqmaydi, ogohlantirishda esa «Soliq» qatori chiqadi.
- Maslahat belgilari kalit so'zlarga qaraydi: noto'g'ri maslahat chiqishi ham, kerakli maslahat chiqmasligi ham mumkin; ruscha tavsiflar ro'yxatda yo'q.
- «Kim kiritgan» variantlari — faqat shu oyda kiritganlar.
- «Barcha filiallar»da ro'yxatda filial ustuni yo'q; «Xarajat qo'shish» filialsiz bosilsa bugungidek «Avval filialni tanlang».
- O'tgan oyga yozilgan yoki o'zgartirilgan xarajat «Oylar bo'yicha» jadvalida ertasi kuni ko'rinadi (sof foyda kunlik keshi, `net-profit-cache.ts`; joriy oy jonli).
- Xarajat sanasi kassa harakati sanasi emas (bugungidek: `CashMovement` faqat `createdAt`).
