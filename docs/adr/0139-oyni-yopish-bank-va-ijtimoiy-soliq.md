# ADR-0139 — Oyni yopish: bank xarajati har oy bank hisobiga qo'lda kiritiladi, ijtimoiy soliq bankdan berilgan oylikdan olinadi

**Holati:** Qabul qilindi
**Sana:** 2026-10-28
**Almashtiradi:** ADR-0130 ning bank xarajati (aylanma pog'onalari, `bank.turnoverTiers`) va rasmiy oylik (`User.officialSalary`) qismlarini
**Bog'liq:** ADR-0130, ADR-0094, `server/src/month-close/`, `server/src/tax/tax-costs.ts`, `server/src/tax/tax-costs.service.ts`, `client/src/components/reports/month-close/`, `docs/superpowers/specs/2026-10-28-oyni-yopish-bank-va-ijtimoiy-soliq-design.md`

## Kontekst

ADR-0130 real jarayondan ikki joyda farq qiladi:

1. **Bank xarajati.** ADR-0130 uni aylanma pog'onalari bo'yicha foiz deb hisoblaydi. Aslida bank har oy hisob raqamdan aniq summani yechadi, ma'sul shaxs uni oy oxirida bank ko'chirmasidan kiritadi. Hisoblangan foiz ko'chirmaga mos kelmaydi, bank hisobi qoldig'i ham o'zgarmaydi.
2. **Ijtimoiy soliq.** ADR-0130 uni xodim kartochkasidagi «Rasmiy oylik» maydonidan oladi. Aslida rasmiy oylik — bankdan berilgan oylik; naqd berilganiga soliq olinmaydi. Alohida maydon ikkinchi haqiqat manbai bo'lib, to'lov bilan mos kelmay qoladi.

## Qaror

1. **Bank xarajati har oy oxirida har bir bank hisobi uchun alohida kiritiladi** (`CashAccountType.BANK`). Bitta hisob bo'lsa — bitta maydon. Kiritish joyi — yangi «Oyni yopish» sahifasi (`/reports/oyni-yopish`), ruxsat `settings.tax`.
2. **U oddiy xarajat sifatida yoziladi:** yangi kategoriya `ExpenseCategory.BANK_FEES` («Bank xizmati»), `Expense.cashAccountId` shu bank hisobi; chiqim o'sha hisobdan, filiali — hisobning filiali, sanasi — oyning oxirgi kuni. Shuning uchun hisob qoldig'i bank ko'chirmasiga mos keladi va summa `operatingExpenses` ga o'zi tushadi. Bir oy va bir hisob uchun bitta tirik yozuv bor; `0` ham yozuv (hisob «kiritilgan» bo'ladi). Yozuv faqat `PUT /month-close/:month/bank-fees` orqali yaratiladi; xarajatlar sahifasida `BANK_FEES` ko'rinadi va tahrirlanadi, lekin u yerda yaratilmaydi (aks holda bir oyga ikki yozuv bo'lardi). Joriy (tugamagan) oyga kiritib bo'lmaydi.
3. **Ijtimoiy soliq asosi — bank hisobidan berilgan oylik.** Oy M uchun asos: oyligi M oyga tegishli (`SalaryPayment.periodStart`, Toshkent oyi) bo'lgan, bekor qilinmagan `SALARY_PAYMENT` ning `BANK` hisobidan chiqqan summalari, va o'sha oylikka hisob-kitob qilingan (`settledBySalaryPayment`) `BANK` hisobidan berilgan o'qituvchi avanslari. Korxona solig'i = `round(asos × payroll.employerSocialPercent / 100)` — **markazning qo'shimcha xarajati**, sof foydadan ayriladi; xodimdan ushlanma (`employeeWithholdingPercent`) esa faqat ko'rsatiladi. Hisob jami asosdan bir marta yaxlitlanadi, stavkalar oldingidek `/settings/tax` dan.
4. **Naqd (`CASH`) berilgan oylikka soliq yo'q. `CARD` turidagi hisobdan berilgani ham soliqqa kirmaydi** — tizim uni bank deb bilmaydi.
5. **`User.officialSalary` va bank pog'onalari (`bank.turnoverTiers`, `TaxCosts.bankFees`, «Bank» bo'limi `/settings/tax` da) olib tashlanadi.** Eski `Setting` qatori o'qilmaydi, lekin o'chirilmaydi.
6. **Oyni qulflash yo'q.** O'rniga «Oyni yopish» sahifasida tekshiruv ro'yxati: har bank hisobiga xarajat kiritilganmi, oyliklar berilganmi, stavkalar to'liqmi.
7. **Byudjetga to'langan soliq «Soliqlar» xarajati sifatida qayta kiritilmaydi** (tizim o'zi hisoblaydi, ADR-0130 qoida 14 o'z kuchida). Cheklovi «Oqibatlar» da.

`missingRates` ga yangi kalit `bank.feesEntered` qo'shildi: tugagan oyda doiradagi kamida bitta bank hisobi uchun yozuv bo'lmasa chiqadi (joriy oyda chiqmaydi). `NET_PROFIT_CACHE_VERSION` `v7`.

## Muqobillar

- **Aylanma pog'onalarini saqlab qolish:** bank summasi ko'chirmadan farq qilaveradi, qoldiq mos kelmaydi. Tanlanmadi.
- **Bank xarajatini xarajatlar sahifasida ham yaratish:** bir oyga ikki yozuv, ikki marta ayirish xavfi. Tanlanmadi.
- **Rasmiy oylikni xodim kartochkasida qoldirish:** to'lov bilan mos kelmaydi, ikki manba. Tanlanmadi.
- **Oyni qulflash:** 1-bosqich uchun ortiqcha; tekshiruv ro'yxati yetarli.

## Oqibatlar

- **Byudjetga to'lov qoldiqni o'zgartirmaydi.** Aylanma solig'i va korxona ijtimoiy solig'i hisoblanadi, lekin to'langanda bank hisobi qoldig'idan yechilmaydi (xarajat sifatida kiritilsa — ikki marta sanalardi). Keyingi bosqich: foydaga kirmaydigan, faqat qoldiqni o'zgartiradigan «Soliq to'lovi».
- **`CARD` turidagi hisob soliqqa kirmaydi.** U bankmi yoki shaxsiy karta — tizim bilmaydi. Rasmiy oylik `CARD` hisobdan berilsa, hisob turi `BANK` ga o'zgartirilishi kerak, aks holda ijtimoiy soliq hisoblanmaydi.
- **Oy qulflanmaydi:** yopilgan oyga to'lov yoki xarajat kiritilaversa raqamlar o'zgaradi; sahifadagi tekshiruv faqat ogohlantiradi.
- **Dividend bu qarorga kirmaydi** (ADR-0130 2-bosqichi).
- Tugagan oyda bank xarajati kiritilmaguncha «Hisob to'liq emas» belgisi (`bank.feesEntered`) turadi.
- Oylik hali berilmagan oyda ijtimoiy soliq 0; oylik berilgach qo'shiladi.
- Oktyabr kabi oldin hisoblangan oylarning sof foydasi o'zgaradi: bank xarajati pog'onadan emas, kiritilgan summadan olinadi, ijtimoiy soliq esa faqat bankdan berilgan oylikdan.
