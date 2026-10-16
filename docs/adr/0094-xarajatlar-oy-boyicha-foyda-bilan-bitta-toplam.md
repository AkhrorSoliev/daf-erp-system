# ADR-0094 — Xarajatlar sahifasi oy bo'yicha: jami — foydadagi «Boshqa xarajatlar» bilan bitta to'plam; «hali yozilmagan» Foyda prognozi qoidasidan, filial kesimida

**Holati:** Qabul qilindi
**Sana:** 2026-10-16
**Bog'liq:** ADR-0038, ADR-0058, ADR-0067, ADR-0079, ADR-0082, ADR-0087, `docs/branch-decisions.md` D4, `server/src/expenses/expenses-month.ts`, `server/src/expenses/expenses-month.service.ts`, `server/src/expenses/expense-hints.ts`, `client/src/components/payments/expenses/`, `docs/superpowers/specs/2026-10-16-b6-xarajatlar-design.md`, `docs/superpowers/plans/2026-10-16-b6-xarajatlar.md`

## Kontekst

Moliya → «Xarajatlar» sahifasi ikki sana bilan ishlardi, standart davr esa brauzer soati bo'yicha joriy oy edi; Foyda, Ish haqi va To'lovlar oy bilan ishlaydi. To'rtta karta bu raqam foydadagi qaysi qator ekanini aytmasdi. Mijozda 8 turkumdan 5 tasi bor edi, shuning uchun soliq «Boshqa»ga yozilardi. Oy oxirida keladigan ijara, kommunal va soliq oy o'rtasida yozilmagan bo'ladi va foyda haqiqiydan katta ko'rinadi — «Foyda» kartasining prognozi buni bilardi (ADR-0038), xarajat kiritadigan odam esa ko'rmasdi. «Kim kiritgan» filtri yo'q edi, «Boshqa»ga noto'g'ri yozilgan stul yoki oylik hech qayerda ko'rinmasdi.

## Qaror

1. **Oy serverda.** `GET /expenses`, `/expenses/pdf` va yangi `/expenses/month-summary` `?oy=YYYY-MM` oladi: may 2026 dan joriy Toshkent oyigacha (undan oldin — 400 «Xarajatlar may 2026 dan boshlab ko'rsatiladi», kelajak — 400 «Kelajak oyni tanlab bo'lmaydi»). Oy oynasi bitta yordamchida (`expenseMonthWindow`): `date >= 1-sana`, `date < keyingi oyning 1-sanasi`. `oy` ham, eski `startDate`/`endDate` ham bo'lmasa — joriy oy. Eski sana parametrlari deploy oralig'i uchun qoladi; `oy` bilan birga kelsa — 400 «Oy yoki sana oralig'i — ikkalasi birga emas». Sahifada sana oralig'i yo'q.
2. **Jami — kanonik `operatingExpenses`.** Oy kartasining jami shu oy va doiradagi `ReportsService.getMonthlyNetProfit(...).operatingExpenses` bilan bitta to'plam: `companyId`, `deletedAt: null`, `TEACHER_ADVANCE` emas, oy oynasi, `branchIdWhere(doira)`. Tenglikni `expenses-month.profit-parity.spec.ts` chegara kunlari, avans, o'chirilgan, boshqa filial va boshqa kompaniya qatorlari bilan isbotlaydi.
3. **«Bu oy hali yozilmagan» — Foyda prognozining qoidasi.** `missingRecurringExpenses` (`reports/profit-composition.ts`) doiradagi har filial uchun alohida chaqiriladi (`missingByBranch`): o'tgan oy jami − bu oy yozilgani, manfiy emas; RENT, TAXES, UTILITIES; `recurringKeyOf` tavsifida «soliq» bo'lgan OTHER ni soliq deb oladi. «Yozish» shu qatorning filialiga yetmayotgan summani (`amount`) yozadi — hech narsa yozilmagan bo'lsa o'tgan oy summasi, qisman bo'lsa qolgani (CEO 16.10.2026). Bu oy bitta ham xarajati yo'q ACTIVE filial ham ko'rsatiladi. Hammasi faqat joriy oyda.
4. **Maslahat belgilari serverda.** `expenseHint` (`expense-hints.ts`) faqat OTHER qatorga, tavsifdagi kalit so'z bo'yicha, so'z boshidan, katta-kichik harfga qaramay, bitta belgi: avval «oylik» guruhi, keyin «jihoz», keyin «kommunal». Ro'yxatning har qatori `hint` kodini oladi; matnni mijoz tanlaydi.
5. **«Kim kiritgan».** `?createdById=` (bir nechta); variantlar — shu oy va doirada xarajat kiritgan odamlar, o'chirilgan yoki nofaol xodim ham.

## Taqiqlanadi

- Xarajatlar jamisini kanonik to'plamdan boshqacha hisoblash — masalan avans bilan yoki `lte` + vaqt belgisi bilan.
- Ikkinchi «hali yozilmagan» qoidasini yozish: sahifa ham, Foyda prognozi ham `missingRecurringExpenses` ni chaqiradi.

## Muqobillar

- **Ogohlantirish doira yig'indisi bo'yicha** (Foyda kartasidagidek): oddiyroq, lekin «Yozish» qaysi filialga yozishini bilmaydi va bir filialning ortiqchasi ikkinchisining yetishmaganini yashiradi. Tanlanmadi.
- **Maslahat mijozda:** bitta tarmoq so'rovi kamroq, lekin kalit so'zlar ikki joyda bo'lardi. Tanlanmadi.
- **Sana oralig'ini qoldirish:** CEO tanlamadi.

## Oqibatlar

- May 2026 dan oldingi xarajatlar sahifada va PDF'da ko'rinmaydi (oy tanlovining pastki chegarasi; CEO qabul qilgan).
- Ko'p filialli doirada «yozilmagan» summalari yig'indisi Foyda prognozidagi raqamdan farq qilishi mumkin (u yig'indi bo'yicha, bu filial bo'yicha); bitta filialda ular bir xil.
- Soliq ikki joyda ikki xil sanaladi. Turkumlar jadvalidagi sariq «yozilmagan» belgisi faqat «Soliqlar» (TAXES) turkumiga qaraydi. Ogohlantirish kartasi esa tavsifida «soliq» bo'lgan «Boshqa» qatorlarni ham soliq deb sanaydi. Shuning uchun «Boshqa»ga yozilgan soliq jadvalda «Boshqa» qatorida qoladi. O'tgan oyda «Soliqlar» turkumi bo'lib, bu oy soliq «Boshqa»ga yozilgan bo'lsa, jadval «Soliqlar» qatorida «yozilmagan» belgisini ko'rsatadi, ogohlantirish esa o'sha soliqni yozilgan deb hisoblaydi. Teskarisi ham bor: o'tgan oy soliq «Boshqa»ga tavsifida «soliq» bilan yozilgan bo'lsa, jadvalda «Soliqlar» belgisi chiqmaydi, ogohlantirishda esa «Soliq» qatori chiqadi.
- Maslahat belgilari kalit so'zlarga qaraydi: noto'g'ri maslahat chiqishi ham, kerakli maslahat chiqmasligi ham mumkin (CEO qarori 5 bilan qabul qilingan).
- Server avval, sayt keyin chiqadi: yangi sayt eski serverda `oy` ga 400 va `month-summary` ga 404 olardi.
