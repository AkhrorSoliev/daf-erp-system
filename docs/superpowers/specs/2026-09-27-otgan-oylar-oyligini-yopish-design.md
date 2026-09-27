# O'tgan oylar oyligini «berildi» deb yopish (may–avgust 2026)

Sana: 27.09.2026. Holat: CEO tasdiqladi («ha», 27.09).

## 1. Nega

May–avgust oyliklari markazda haqiqatda berilgan, lekin tizimda ularning
`SalaryPayment` qatorlari `CALCULATED`/`APPROVED` holatida qolgan. «Oylik
berilganini tasdiqlash» tugmasi (2026-08-06 dizayni) 07.08 dan saytda turibdi,
lekin bosilmagan: u har oy uchun qaysi hisobdan qancha chiqqanini aniq so'raydi,
CEO da esa aniq naqd/karta bo'linishi yo'q.

Prod raqamlari va odamlar bo'yicha ro'yxat repodan tashqarida saqlangan. Bu
hujjat faqat qarorlar va o'zgarishlar.

## 2. CEO qarorlari (27.09)

1. Ustozlarga oylikning bir qismi kartaga o'tkazilgan, qancha ekani noma'lum.
   O'tgan oylar uchun **har bir ustozning oyligi 50% naqd, 50% karta**
   (oy jamidan emas, har ustozga alohida). Toq so'm naqd qismga qo'shiladi.
2. **Ustoz bo'lmagan xodimlar doim naqd** olgan.
3. Berilgan kunlar esda yo'q. Qoida: **har oyning oyligi keyingi oyning
   10-sanasida berilgan** (bitta xodimning may oyligi 8–9 iyunda berilgani
   dalil).
4. Sentabr oyligidan boshlab CEO har bir odam uchun berilgan sanani va
   naqd/kartani o'zi kiritadi — alohida ish, tizim buni qo'llashi shart.
5. Ketgan ikki xodim sentabr pulini Xarajatlar orqali olgan va boshqa
   olmaydi. Bu pul Ish haqi bo'limiga o'tkaziladi (bajarildi, 6-bo'lim).

## 3. Kassa jurnalidan oldingi oy

Filialning kassa hisoblari 15–16.06.2026 da 0 dan, boshlang'ich qoldiqsiz
ochilgan (`scripts/backfill-cash-accounts.ts`). Undan oldin berilgan pul tizim
kassasidan hech qachon o'tmagan, undan oldingi kirim ham u yerda yo'q.

Shuning uchun **berilgan sanasi filial kassa jurnalining birinchi harakatidan
oldin bo'lgan oy kassa harakatisiz yopiladi**: `SalaryPayment` → `PAID`, ledgerda
`SALARY_PAYMENT` qatori yoziladi (xodim balansi shu ledgerdan yuradi), lekin
`CashMovement` yozilmaydi. Amalda bu may (berilgan sanasi 10.06). Aks holda
tizimdagi bank hisobi manfiyga tushardi, va keyingi solishtiruv farqi «boshlang'ich
qoldiq» emas, yolg'on raqam bo'lardi.

## 4. Nega saytdagi tugma emas

Mavjud `SalarySettleMonthService.settle`:

- har filial uchun hisob summalarini oladi va ularni to'lovlar bo'ylab ketma-ket
  taqsimlaydi (`allocateCashSlices`) — har ustozga 50/50 ham, xodimga faqat
  naqd ham kafolatlanmaydi;
- har to'lovga kassa harakati yozadi — kassa jurnalidan oldingi oyni yopa
  olmaydi.

## 5. Yechim

### 5.1 `recordSalaryPayment({ predatesCashJournal: true })`

Yangi ixtiyoriy bayroq. `true` bo'lsa ledger qatori va `User.balance` o'zgarishi
yoziladi, kassa harakati yozilmaydi. `cashSlices` bilan birga berilsa — xato
(ikkalasi bir-biriga zid). Boshqa chaqiruvchilar uchun hech narsa o'zgarmaydi.

### 5.2 To'lov bo'yicha taqsimot bilan oyni yopish

Yangi `SalarySettleAllocatedService.settle(input, companyId, performedById, { dryRun })`:

- kirish: `month`, `paidAt` («YYYY-MM-DD»), `note?`, va har to'lov uchun reja —
  yoki `slices: { cashAccountId, amount }[]`, yoki `predatesCashJournal: true`;
- tekshiruvlar, hech narsa yozilmasdan:
  - rejadagi to'lovlar oyning to'lanmagan qatorlariga **aynan** teng (ortiqcha
    ham, yetishmaydigan ham yo'q) — optimistik qulf, `confirmAmount` o'rnida;
  - har to'lovda slice'lar yig'indisi to'lov summasiga teng;
  - hisoblar mavjud, faol, shu kompaniyaniki va to'lov oluvchi filialiniki;
  - `paidAt` qoidalari `settle` bilan bir xil (kelajakda emas, davr boshidan
    oldin emas);
  - holat o'tishlari (`CALCULATED → APPROVED → PAID`);
- `dryRun` → reja qaytadi, hech narsa yozilmaydi;
- yozish `settle` bilan **bitta umumiy yozuvchi** orqali: har to'lovga bitta
  Serializable tranzaksiya, qatorni qayta o'qish, `PAID` bo'lsa o'tkazib
  yuborish, izoh va tavsif markeri.

Umumiy qismlar (nomzodlarni yuklash, sana tekshiruvi, yozuvchi, izoh) yangi
`salary-settle-core.ts` ga ko'chadi; `settle` ularni ishlatadi va xatti-harakati
o'zgarmaydi. `salary-settle-month.service.ts` 500 qatordan oshmaydi.

### 5.3 Skript `scripts/settle-past-salary-months.ts`

- Standart — faqat ko'rish: bazaga faqat o'qish rejimida ulanadi
  (`default_transaction_read_only`), `dryRun` bilan chaqiradi. `--apply` yozadi.
- Oylar: 2026-05 … 2026-08. `paidAt` = keyingi oyning 10-sanasi.
- Xodim = global `FIXED_MONTHLY` stavkasi bor va `Teacher` roli yo'q
  (`SalaryStaffMonthlyService` ta'rifi). Qolganlar ustoz.
- Ustoz: naqd = ceil(summa / 2), karta = floor(summa / 2). Xodim: 100% naqd.
- Hisoblar: to'lov oluvchi filialining yagona faol CASH va BANK hisobi. Bittadan
  ko'p yoki kam bo'lsa — to'xtaydi.
- `paidAt` < filial kassa jurnalining birinchi harakati → `predatesCashJournal`.
- Chiqish: har oy jadvali, jami, hisoblar oldin/keyin. Yozilgandan keyin har oy
  qayta o'qib tekshiriladi.

### 5.4 Foyda hisobotida ustoz/xodim ajratish

`ReportsProfitLossService` to'langan oylikni ustoz yoki xodimga **bog'langan
accrual soni** bo'yicha ajratardi. May oyligi Excel'dan kiritilgan, accrual'i
yo'q — u «xodimlar oyligi» bo'lib qolardi. Iyunda xodim stavkalari yo'qligi
uchun kanonik «Sof foyda» `paidAdmin` ga qaytadi va iyun foydasidan ustozlarning
may oyligini ayirardi.

Yangi qoida: to'lov **xodimniki** — accrual'i yo'q, oluvchida global
`FIXED_MONTHLY` stavkasi bor va `Teacher` roli yo'q. Qolgani ustozniki.

## 6. Ketgan xodimlar (bir martalik ma'lumot tuzatish, bajarildi 27.09)

Ikkala xodimning avgust versiyasi `effectiveTo = 01.09.2026 00:00 Toshkent`
bilan yopildi, sentabr uchun [01.09, 01.10) versiya qo'shildi (qiymati =
kelishilgan sentabr puli), 04.09 va 10.09 dagi Xarajatlar yozuvlari shu
xodimning avansiga aylantirildi (`TEACHER_ADVANCE` + `relatedUserId`, ledger
qatori `teacherId`, `EntityHistory` yozuvi). Kassaga tegilmadi. 01.10 dagi
hisoblash: sentabr puli − avans = 0.

## 7. Oqibatlar

- Ish haqi sahifasi: may–avgust «To'langan».
- Kassa asosidagi ko'rsatkichlar (`paidAt` bo'yicha): iyun–sentabr «to'langan
  oylik» oshadi. Hisoblangan oylik asosidagi foyda o'zgarmaydi.
- Kassa harakatlari yozilgan kuni (`createdAt`) bilan turadi. Kassa oqimi
  hisoboti hozir saytga ulanmagan; kelajakdagi oylar bo'yicha kassa ko'rinishi
  `SalaryPayment.paidAt` ni hisobga olishi kerak.
- Xodimning ichki `User.balance` i (saytda ko'rinmaydi) bu ishda tuzatilmaydi —
  4-bosqichda, to'lash yo'li bilan birga.

## 8. Keyingi bosqichlar (alohida hujjatlar)

- 3 — kassani sanash va solishtirish (`POST /cash-accounts/:id/reconcile`).
- 4 — har odamga sana va naqd/karta bilan to'lash oynasi (maket CEO ga oldin
  ko'rsatiladi) va `User.balance` tuzatish.

## 9. Testlar

- `transactions-write.service.spec.ts`: `predatesCashJournal` →
  `recordOutflow` chaqirilmaydi, ledger va balans yoziladi; `cashSlices` bilan
  birga → xato.
- `salary-settle-allocated.service.spec.ts`: to'plam mos kelmasa 400; slice
  yig'indisi noto'g'ri → 400; boshqa filial hisobi → 400; kelajakdagi sana →
  400; `dryRun` hech narsa yozmaydi; muvaffaqiyatli yo'lda har to'lovga o'z
  slice'lari yoki bayrog'i uzatiladi; takroriy chaqiruv `PAID` ni o'tkazib
  yuboradi.
- `salary-settle-month.service.spec.ts`: mavjud testlar o'zgarmay o'tadi.
- `reports-profit-loss.service.spec.ts`: accrual'siz ustoz to'lovi ustoz
  oyligiga, stavkali xodim to'lovi xodim oyligiga tushadi.
