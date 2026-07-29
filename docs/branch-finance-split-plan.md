# Moliyani filiallar bo'yicha ajratish — reja

**Sana:** 2026-07-29
**Holat:** tasdiqlanmagan, CEO qaroriga taqdim etilgan
**Sabab:** #2 "Namangan filali" ochildi. Hozircha bo'sh, lekin unga o'quvchi/ustoz qo'shilishi bilan moliyaviy hisobot ikki filialni aralashtira boshlaydi.

---

## 1. Hozirgi holat — pul qayerda filialga bog'lanadi, qayerda yo'q

### Bog'lanadi (to'g'ri ishlaydi)

| Nima | Qayerda | Izoh |
|---|---|---|
| Click / Payme to'lovi | [click-methods.service.ts:303](../server/src/payment-gateways/click/click-methods.service.ts#L303), [payme-methods.service.ts:337](../server/src/payment-gateways/payme/payme-methods.service.ts#L337) | `resolveStudentBranchId`: aktiv guruh → StudentBranch. Eng to'g'ri mantiq shu yerda |
| Dars uchun pul yechish (LESSON_DEDUCTION / CONSUMPTION) | [lesson-billing.service.ts:198](../server/src/billing/lesson-billing.service.ts#L198) | guruh filialidan olinadi |
| Shartnoma bo'yicha to'lov | [payments-write.service.ts:115](../server/src/payments/payments-write.service.ts#L115) | shartnoma filiali ustun, mos kelmasa xato beradi |
| Xarajat (EXPENSE) | [expenses.service.ts:82](../server/src/expenses/expenses.service.ts#L82) | PRODda 199/199 filialli |
| Kassa harakati | [cash-movements.service.ts:85](../server/src/cash-accounts/cash-movements.service.ts#L85) | avval filial kassasi, topilmasa umumiy kassa |

### Bog'lanmaydi (muammo)

| Nima | Qayerda | PRODdagi iz |
|---|---|---|
| **Ustoz oyligi hisoblanishi** (SALARY_ACCRUAL) | [salary-accrual.service.ts:351](../server/src/salary/salary-accrual.service.ts#L351) — `create` da `branchId` umuman yo'q | **8 506 ta filialsiz qator**, iyulda 4 319 ta yangi |
| **Ustoz oyligi to'lanishi** (SALARY_PAYMENT) | [transactions-write.service.ts:407](../server/src/transactions/transactions-write.service.ts#L407) — `params` da `branchId` yo'q | 2 ta, ikkalasi ham filialsiz |
| **Pul qaytarish** (REFUND) | [transactions-write.service.ts:351](../server/src/transactions/transactions-write.service.ts#L351) — `params` da `branchId` yo'q | 4 ta, **−1 107 000 so'm umumiy kassadan chiqqan** |
| Qo'lda tuzatish (ADJUSTMENT) | [create-adjustment.dto.ts:18](../server/src/transactions/dto/create-adjustment.dto.ts#L18) — ixtiyoriy, klient yubormaydi | 210 ta |
| Chegirma (DISCOUNT_ADJUSTMENT) | [students-write.service.ts](../server/src/students/students-write.service.ts) | 7 ta |
| Mock imtihon to'lovi | mock-exam billing | 5 ta |
| Qo'lda kiritilgan to'lov filiali | [payments-write.service.ts:98](../server/src/payments/payments-write.service.ts#L98) | o'quvchidan emas, **UI da tanlangan filialdan** olinadi |

### Model darajasidagi bo'shliqlar

- `SalaryAccrual` — `branchId` ustuni **yo'q**. Lekin `groupId` NOT NULL, `Group.branchId` ham NOT NULL → filial deterministik tiklanadi.
- `SalaryPayment` — `branchId` ustuni **yo'q**. Payroll arxitektura darajasida "kompaniya darajasida" deb qotirilgan.
- `Refund` — `branchId` ustuni yo'q.
- `DailyFinancialSnapshot` — `branchId` yo'q → filial kesimida qarz ▲/▼ dinamikasi imkonsiz.
- `Lead` — `branchId` yo'q (hatto `companyId` ham yo'q) → lidlar umuman ajratilmaydi.
- `PaymentGatewayConfig` — `@@unique([companyId, provider])` → Click/Payme **merchant hisobi bitta**, ikkala filial puli bir hisobga tushadi.

### Hisobot tomonidagi aralashuv

| Hisobot | Muammo |
|---|---|
| "Foyda" kartasi | filial tushumidan **kompaniya bo'yicha** oylik ayiriladi → filial foydasi soxta |
| Excel: Oyliklar / Tekshiruv / Oylik qarzdorlik varaqlari | filial tanlansa ham kompaniya bo'yicha chiqadi |
| Ustoz oyliklari sahifasi | filial filtri **umuman yo'q**; CEO/Administrator hamma filialni ko'radi |
| P&L (foyda-zarar) | to'langan oylik filialga bo'linmaydi (kod izohida tan olingan) |
| Pul oqimi / Balans | `branchId=null` kassalar filial filtrida **butunlay yo'qoladi** |
| 21:00 Telegram hisoboti | butunlay kompaniya bo'yicha, kodda birorta `branchId` yo'q |
| /reports sahifalari | o'z filial filtri bor, default "Barcha filiallar" — header tanloviga bog'lanmagan |
| Filial bo'yicha filtrlangan har qanday hisobot | 8 738 ta filialsiz qatorni **jimgina tashlab ketadi** |

### UI tomonidagi xavflar

- To'lov dialogida o'quvchi qidiruvi filial bo'yicha filtrlanmaydi ([record-payment-dialog.tsx:190](../client/src/components/payments/record-payment-dialog.tsx#L190)), to'lov esa tanlangan filialga yoziladi → xato filialga yozish oson.
- Filial almashtirgichida **"Barcha filiallar" varianti yo'q** → CEO uchun "jami" ko'rinish mavjud emas.
- Moliyaviy so'rovlar filial hidratsiya bo'lgunicha `branchId`siz ketadi ([payments-overview.tsx:133](../client/src/components/payments/payments-overview.tsx#L133) da `enabled` qorovuli yo'q, dashboard'da bor) → sahifa ochilishida bir lahza "barcha filiallar" ma'lumoti ko'rinadi.
- Balansdan yechish va pul qaytarish mutatsiyalari `branchId` yubormaydi.

---

## 2. Yondashuv variantlari

### (a) Faqat o'qish tomonida filtr qo'shish
Hisobotlarga filial filtri qo'shiladi, yozish tomoni tegilmaydi.
- **Yechadi:** ro'yxatlar ajraladi.
- **Yechmaydi:** oylik, refund, kassa — hech biri. 8 738 filialsiz qator hisobotdan tushib qoladi, ya'ni filial bo'yicha summa jamiga teng bo'lmaydi.
- **Xulosa:** yaramaydi. Raqamlar bir-biriga to'g'ri kelmagani uchun ishonchni yo'qotadi.

### (b) Har bir moliyaviy yozuvga filialni majburiy qilish + mavjudini backfill ✅
Yozish nuqtalarining hammasi `branchId` yozadi, mavjud filialsiz qatorlar bir martalik skript bilan to'ldiriladi, keyin o'qish tomoni filial o'lchovini oladi.
- **Yechadi:** hamma narsani — tushum, oylik, refund, kassa, foyda, Excel, Telegram.
- **Narxi:** ~4-5 bosqich, 2 ta kichik migratsiya, 1 ta backfill skripti.
- **Xavfi:** past — backfill deterministik (pastda o'lchangan).

### (c) To'liq filial-scoped moliya
(b) ning ustiga: har filialga alohida merchant hisob, alohida kassa/bank, alohida P&L va byudjet, markaz xarajatlarini taqsimlash qoidasi.
- **Yechadi:** filiallar deyarli mustaqil biznes birlik sifatida yuritiladi.
- **Narxi:** yuqori, va Click/Payme tomonida shartnoma ishlari kerak.
- **Xulosa:** (b) bajarilgandan keyin, ehtiyoj bo'lsa.

**Tavsiya: (b).** Sabab — muammo o'qishda emas, yozishda. Yozuv filialsiz bo'lsa, uni hisobotda hech qanday filtr bilan tiklab bo'lmaydi.

---

## 3. Backfill o'lchandi: 99.9%

PRODda 2026-07-28 da o'lchangan (`branchId=null` bo'lgan 8 738 tranzaksiya):

| Tur | Jami | Davomat orqali | O'quvchi orqali | Tiklanmaydi |
|---|---|---|---|---|
| SALARY_ACCRUAL | 8 506 | 8 497 | — | 9 |
| ADJUSTMENT | 210 | — | 210 | 0 |
| DISCOUNT_ADJUSTMENT | 7 | — | 7 | 0 |
| MOCK_EXAM_FEE | 5 | — | 5 | 0 |
| PAYMENT | 4 | — | 4 | 0 |
| REFUND | 4 | — | 4 | 0 |
| SALARY_PAYMENT | 2 | — | — | 2 |
| **Jami** | **8 738** | **8 497** | **230** | **11** |

Tiklash qoidalari:
1. `Transaction.attendanceId` → `Attendance.groupId` → `Group.branchId`
2. `Transaction.studentId` → o'quvchining enrollment'lari va `StudentBranch` birlashmasi; **agar natija yagona filial bo'lsa** — o'shani yoz
3. Ikkalasi ham ishlamasa — qo'lda (11 ta)

**Noaniq (ikki filialga da'vogar) qator: 0 ta** — chunki hozir hamma o'quvchi bitta filialda.

> ⚠️ **Shoshilinch:** bu 99.9% raqam faqat hozir shuncha. Namanganda o'quvchi va dars paydo bo'lgach, o'quvchi filialdan filialga o'tsa, 2-qoida noaniqlashadi va eski qatorlarni ishonchli tiklab bo'lmaydi. Backfill Namangan ishga tushishidan **oldin** yuritilishi kerak.

---

## 4. Bosqichlar

### Faza 0 — Shoshilinch (Namangandan oldin, mustaqil deploy)

**0.1 Yozish nuqtalarini tuzatish** (migratsiyasiz, faqat kod):
- [salary-accrual.service.ts:351](../server/src/salary/salary-accrual.service.ts#L351) — `applyAccrualToBalance` ga `branchId` uzatish (accrual'ning `groupId` sidan olinadi). Bu bitta o'zgarish oyiga ~4 300 yangi filialsiz qatorni to'xtatadi.
- Xuddi shu joyda bekor qilish tranzaksiyasi ([:459](../server/src/salary/salary-accrual.service.ts#L459)) ham `branchId` ko'chirsin.
- `recordRefund` va `recordSalaryPayment` ([transactions-write.service.ts:351](../server/src/transactions/transactions-write.service.ts#L351), [:407](../server/src/transactions/transactions-write.service.ts#L407)) — `branchId` parametri qo'shilsin, kassa chiqimiga ham uzatilsin.
- `ADJUSTMENT`, `DISCOUNT_ADJUSTMENT`, `MOCK_EXAM_FEE`, `INITIAL_BALANCE`, `BALANCE_WITHDRAWAL` — hammasi o'quvchidan filial olsin.
- Qo'lda to'lovda ([payments-write.service.ts:98](../server/src/payments/payments-write.service.ts#L98)) UI filiali o'rniga `resolveStudentBranchId` ishlatilsin; UI filiali bilan mos kelmasa — ogohlantirish.

**Tekshirish:** deploydan keyin 1 kun kutib, `branchId=null` yangi tranzaksiya 0 ekanini skript bilan tasdiqlash.

**0.2 Backfill** (yuqoridagi 3 qoida bo'yicha, avval dry-run):
- Skript: `server/scripts/backfill-transaction-branch.ts` (yozilishi kerak)
- Avval `--dry-run` bilan hisobot, keyin qo'llash. Qo'llashdan oldin `Transaction` jadvalining `id, branchId` juftligi zaxiraga olinadi (qaytarish uchun).

**0.3 Namangan uchun bazani tayyorlash** (kodsiz, sozlama):
- Namangan kassa (CASH) va bank hisobi (BANK) ochilsin — bo'lmasa puli umumiy kassaga tushadi.
- Namangan uchun kurslar va xonalar yaratilsin (hozir 0 ta, kurssiz guruh ochilmaydi).
- Namangan uchun Telegram ro'yxatdan o'tish havolalari qaytadan olinsin (havola ichida filial raqami bor).
- Har bir yangi xodimga "asosiy filial" (`mainBranch`) to'g'ri belgilansin.

### Faza 1 — Oylik modelini filialga bog'lash

- Migratsiya: `SalaryAccrual.branchId` (nullable → backfill → NOT NULL), `SalaryPayment.branchId` (nullable qoladi — markaz darajasidagi to'lovlar uchun).
- `resolve-monthly-scope.ts` va `salary-monthly.service.ts` — filial scope'i **faqat ustozlar ro'yxatiga** emas, accrual so'rovlariga ham qo'llansin.
- `/salary/monthly` va `/salary/overview` ga `branchId` query parametri qo'shilsin.
- Branch Director scope'i `mainBranch` null bo'lganda **yopiq** bo'lsin (hozir fail-open).

### Faza 2 — Hisobot va foyda

- `financial-overview` da oylik filial bo'yicha kesilsin → "Foyda" kartasidagi aralash scope yo'qoladi.
- P&L, pul oqimi, balans — `branchId=null` kassalarni "Markaz" deb alohida ko'rsatsin, tashlab yubormasin.
- Excel: "Oyliklar", "Tekshiruv", "Oylik qarzdorlik" varaqlari filialni hurmat qilsin; sarlavhaga tanlangan filial yozilsin.
- Har bir filial bo'yicha summa **jamiga teng bo'lishi** avtomatik testda tekshirilsin (Tekshiruv varag'iga qator qo'shiladi).

### Faza 3 — UI

- Filial almashtirgichiga **"Barcha filiallar"** varianti qo'shilsin (CEO uchun).
- Moliyaviy so'rovlarga `enabled: !!selectedBranch` qorovuli qo'yilsin.
- To'lov dialogida o'quvchi qidiruvi filial bo'yicha filtrlansin; boshqa filial o'quvchisi tanlansa — ochiq ogohlantirish.
- Ustoz oyliklari sahifasiga filial filtri.

### Faza 4 — Telegram

- `DailyFinancialSnapshot` ga `branchId` qo'shilsin.
- 21:00 hisoboti guruh filialiga qarab filial kesimida yuborilsin; umumiy guruhga jami + filiallar bo'yicha bo'linma.
- Kunlik cron keshi `companyId` emas, `companyId + branchId` bo'yicha bo'lsin.

### Faza 5 — Lidlar (ixtiyoriy)

`Lead` modeliga `branchId` qo'shish va doskani filial bo'yicha bo'lish. Moliyaga ta'sir qilmaydi, shuning uchun oxirida.

---

## 5. CEO qaror qilishi kerak bo'lgan savollar

1. **Ikki filialda dars beradigan ustoz.** Oyligi qaysi filialga yoziladi? *Tavsiya:* har bir dars o'z guruhining filialiga — avtomatik va adolatli, qo'shimcha sozlama talab qilmaydi.
2. **Markaz darajasidagi xarajatlar** (reklama, CEO oyligi, umumiy dasturlar). Qaysi filialga? *Variantlar:* (a) "Markaz" deb alohida turadi va filial foydasiga kirmaydi; (b) o'quvchi soniga qarab taqsimlanadi. *Tavsiya:* (a) — sodda va bahssiz.
3. **Click/Payme merchant hisobi.** Bitta hisob qolsinmi, yoki Namanganga alohida kerakmi? Tizim ichida baribir ajraladi; alohida hisob faqat bank tomonida ajratish kerak bo'lsa zarur.
4. **CEO uchun "Barcha filiallar" ko'rinishi** kerakmi, yoki doim bitta filial tanlangan bo'lgani ma'qulmi?
5. **Filialsiz 11 ta qator** qaysi filialga yozilsin? *Tavsiya:* filial 1 (boshqa filial hali mavjud emas edi).

---

## 6. Tekshiruv usuli

Har bosqichdan keyin:
- `server/scripts/audit-branch-isolation.ts` — filial bo'yicha taqsimot va filialsiz qatorlar (mavjud, faqat o'qiydi).
- Yangi tekshiruv: har bir moliyaviy ko'rsatkich uchun `Σ(filiallar) == jami` tengligi.
- `railway run npx ts-node scripts/audit-finance-reconciliation.ts` — mavjud A–H invariantlari buzilmaganini tasdiqlash.
