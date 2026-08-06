# «Oylik berilganini tasdiqlash» — dizayn

**Sana:** 2026-08-06
**Holat:** tasdiqlangan, implementatsiya kutilmoqda

## 1. Muammo

Iyun va iyul oyliklari markazda **haqiqatda berilgan** — tizim hisoblagan raqamlarning aynan o'zi. Lekin `SalaryPayment` qatorlari `CALCULATED` holatida qolib ketgan, chunki hech kim breakdown oynasidagi «Tasdiqlash → To'lash» zanjirini bosmagan.

Prod holati (2026-08-06):

| Davr | Qatorlar | Holat | Jami |
|---|---|---|---|
| Iyun (01.06–30.06) | 16 | 15 CALCULATED + 1 APPROVED | 50 387 430 |
| Iyul (01.07–31.07) | 10 | 10 CALCULATED | 80 083 715 |
| **Jami** | **26** | | **130 471 145** |

Ledgerda `SALARY_PAYMENT` turidagi bor-yo'g'i 2 ta qator bor (bitta test to'lovi va uning bekori, yig'indisi 0) — ya'ni **hech qachon hech kimning oyligi tizimda to'langan deb yozilmagan**.

Uch oqibat:

1. **Ustoz balanslari sun'iy o'sgan.** `User.balance` faqat hisoblanganda ko'tariladi va faqat `PAID` bo'lganda tushadi. Hozir ustozlarda jami ~169 mln so'm qoldiq turibdi — bu qarz emas, yozilmagan to'lov.
2. **Kassa balansi haqiqatdan yuqori.** 130 mln so'm haqiqatda chiqib ketgan, kassa jurnalida esa yo'q.
3. **Hisobotlarda «to'langan oylik» = 0.** `/overview` dagi «Ustoz oyliklari — to'langan», Excel «Oyliklar» varag'i va Foyda-zarar hisoboti `status: PAID` + `paidAt` bo'yicha filtrlaydi.

## 2. Yechim — bir oyni bir amalda yopadigan tugma

`/payments/salary` sahifasida tanlangan oy uchun **«Oylik berilganini tasdiqlash»** tugmasi. Bir martalik skript emas, doimiy imkoniyat: iyun/iyulni hozir yopadi va kelajakda ham har oy shu yo'l bilan yopiladi, amal auditda ko'rinadi.

### 2.1 Endpoint

`POST /salary/payments/settle-month` — `@Roles('CEO')`.

Nima uchun faqat CEO: bu qaytarilmaydigan, oy bo'yicha ommaviy amal. Filial direktori avvalgidek breakdown oynasidan bitta-bitta to'lay oladi (`POST /salary/payments/:id/pay` — o'zgarmaydi).

So'rov tanasi:

```jsonc
{
  "month": "2026-07",
  "paidAt": "2026-08-05",
  "accounts": [{ "branchId": 1, "cashAccountId": "..." }],
  "confirmAmount": 80083715,
  "note": "Iyul oyligi naqd berilgan"   // ixtiyoriy
}
```

### 2.2 Ish tartibi — avval hammasini tekshir, keyin yoz

1. **Oy → davr:** `resolveMonthlyScope` orqali (aynan `/salary/monthly` jadvali ishlatadigan helper). Shuning uchun tugma jadval ko'rsatgan qatorlarni oladi — ikkisi hech qachon ajralib qolmaydi.
2. **Nomzod qatorlar:** o'sha davrdagi `CALCULATED` va `APPROVED` `SalaryPayment` lar. `PAID` va `CANCELLED` chetda qoladi — shuning uchun amal **idempotent**: takror ishga tushirilsa hech narsa qilmaydi.
3. **Summa nazorati:** nomzodlar yig'indisi `confirmAmount` ga teng bo'lmasa → `400`. Bu optimistik qulf: dialog ochilgandan keyin ro'yxat o'zgargan bo'lsa (cron qo'shimcha qator yozgan, boshqa admin bittasini to'lagan), amal bajarilmaydi va foydalanuvchi oynani yangilashi so'raladi.
4. **Oldindan tekshiruv (hech narsa yozilmasdan):**
   - har bir to'lov oluvchining filiali aniqmi (`mainBranch` / `UserBranch`);
   - o'sha filial uchun `accounts` da kassa hisobi berilganmi;
   - hisob shu kompaniyaniki, faol, o'chirilmagan va aynan o'sha filialga tegishlimi;
   - `paidAt` kelajakda emas va davr boshidan oldin emas;
   - holat o'tishi haqiqiy (`assertValidTransition`).

   **Bironta ham xato bo'lsa — hech narsa yozilmaydi**, xato ustozlar nomi bilan `400` qaytariladi. Bu `batchPay` ning har qator uchun `try/catch` shaklidan ataylab farq qiladi: bu yerda pul qaytarib bo'lmaydigan tarzda harakat qiladi, shuning uchun yarim bajarilgan holat kerak emas.
5. **Yozish:** har bir to'lov o'z `Serializable` tranzaksiyasida:
   - `CALCULATED → APPROVED → PAID` (holat mashinasi buzilmaydi, `SALARY_PAYMENT_TRANSITIONS` o'zgarmaydi);
   - `recordSalaryPayment(...)` → ledger qatori + `User.balance` kamayishi + kassa chiqimi;
   - `SalaryPayment`: `status = PAID`, `paidAt` = tanlangan sana, `paidById`, `note` ga marker.

**Audit izi.** `SalaryPayment.note` ga aniq matn yoziladi: `Tashqarida berilgan oylik tasdiqlandi (<sana>)` va foydalanuvchi izohi berilgan bo'lsa u ham qo'shiladi. Ledger qatorining `description` i esa oddiy `Oylik to'landi` emas, `Oylik to'landi (tashqarida berilgani tasdiqlandi)` bo'ladi — shunda ikki yildan keyin ham bu qator nima ekani ledgerning o'zidan ko'rinadi. `performedById` / `paidById` kim bosganini saqlaydi.

Javob: `{ month, paidAt, count, total, results[] }`.

### 2.3 `recordSalaryPayment` ga kichik qo'shimcha

Hozir kassa hisobini `resolveAccountId` o'zi tanlaydi — filialning **eng eski `CASH`** hisobini. Prodda bu «Asosiy kassa» (balansi 0), «Farg'ona filiali kassa» (96 130 000) emas. Ya'ni hech narsa qilinmasa 130 mln noto'g'ri hisobdan chiqib, u −130 mln ga tushardi.

Shuning uchun `recordSalaryPayment` ga ixtiyoriy `cashAccountId` parametri qo'shiladi va `recordOutflow` ga uzatiladi. `recordOutflow` bu parametrni allaqachon qabul qiladi (`explicitId`) — faqat uzatilmayapti. Boshqa chaqiruvchilar uchun xatti-harakat o'zgarmaydi.

### 2.4 Kassa — filial bo'yicha ro'yxat, bitta emas

Har filial o'z oyligini o'z kassasidan to'laydi (D4 — «har filial o'z xarajatini ko'taradi»). Shuning uchun so'rov bitta `cashAccountId` emas, **filial → hisob juftliklari ro'yxatini** oladi va server hisobning filiali to'lov oluvchining filialiga mos kelishini tekshiradi. Hozir barcha ustozlar 1-filialda, shuning uchun amalda bitta select ko'rinadi — lekin Namangan ishga tushganda kod tayyor bo'ladi.

## 3. Frontend

`/payments/salary` sahifasida, oy tanlagich yonida tugma: **«Oylik berilganini tasdiqlash (10 ta)»**. Faqat CEO ga va faqat tanlangan oyda to'lanmagan qator bo'lsa ko'rinadi.

Yangi komponent: `client/src/components/payments/salary-settle-month-dialog.tsx`.

- **Ogohlantirish (destructive):** *bu amal qaytarilmaydi; tizim 80 083 715 so'mni kassadan chiqim qiladi va 10 ta ustoz balansidan ayiradi.*
- **To'liq ro'yxat:** ustoz · filial · summa, pastida JAMI.
- **Sana:** `DatePicker`, default bugun, `maxDate` = bugun, `minDate` = davr boshi.
- **Kassa:** har filial uchun bitta select — hisob nomi + hozirgi balans, tagida *«keyin: X so'm»*. Balans minusga tushsa amber ogohlantirish chiqadi, lekin **to'smaydi** (pul haqiqatda chiqib ketgan; to'sish faktni yashirish bo'lardi).
- **Tasdiq:** jami summani raqamlab yozish. Tugma faqat aynan `80083715` yozilganda ochiladi. Kod emas, summa — chunki tekshirilishi kerak bo'lgan raqam aynan shu, va uni yozish uchun o'qishga majbur bo'lasiz.
- Dialog loyihaning standart skeletiga amal qiladi: `DialogContent flex max-h-[90dvh] flex-col overflow-hidden p-0` → header `border-b` → **yagona** scroll qiluvchi tana → footer `border-t`.

Muvaffaqiyatdan keyin: toast + `salary-monthly` / `financial-overview` / `cash-accounts` querylarini invalidatsiya.

### 3.1 Ataylab qilingan chekinish

Loyiha qoidasi: *har bir jadval, dialog ichidagisi ham, 10 qatordan sahifalanadi.* Bu dialogda **sahifalash bo'lmaydi** — barcha qatorlar (iyunda 16 ta) scroll bilan ko'rinadi. Sabab: tasdiqlash oynasi siz tasdiqlayotgan narsani to'liq ko'rsatishi kerak; qatorlarning bir qismini 2-sahifaga yashirish oynaning butun maqsadiga qarshi ishlaydi.

## 4. Oqibatlar — bilib qo'yish kerak

- **Foyda ikki marta kamaymaydi.** «Sof foyda» *deserved* (hisoblangan) oylikni ayiradi, `paidAt` ni emas — foyda raqami o'zgarmaydi. O'zgaradigani faqat kassa asosidagi ko'rsatkichlar: `/overview` dagi «Ustoz oyliklari — to'langan», Excel «Oyliklar» varag'i va Foyda-zarar hisoboti. Pul siz tanlagan sana tushgan oyga yoziladi.
- **Iyun/iyul yopilgan davrga aylanadi.** Shundan keyin qarzdor o'quvchi iyun/iyul darsini to'lasa, ustozning hisobi `creditPeriodDate` orqali joriy oyga (avgustga) o'tadi va «Oldingi oydan» yorlig'i bilan ko'rinadi. Bu loyihaning mavjud, to'g'ri xatti-harakati — yo'qotish yo'q.
- **Iyun oyida 6 ta ustozda ikkitadan qator bor** (masalan Gulnozaxon: 4 466 790 va 200 004) — qayta hisoblash va kechikkan to'lov qoldiqlari. Ikkalasi ham ro'yxatda ko'rinadi va ikkalasi ham yopiladi.
- **Kassa balansi tushadi.** Farg'ona kassasi 96 130 000, banki 51 008 316. 130 471 145 so'mni qanday taqsimlash CEO ning qaroriga qoladi (ikki oy — ikki dialog, har birida o'z hisobi).

## 5. Testlar

**Servis (`salary-settle-month.service.spec.ts`):**
- summa mos kelmasa `400` va hech narsa yozilmaydi;
- `PAID`/`CANCELLED` qatorlar nomzodlar ro'yxatiga tushmaydi (idempotentlik);
- filiali yo'q ustoz bo'lsa butun amal to'xtaydi, yarim yozilmaydi;
- boshqa filialning kassa hisobi berilsa rad etiladi;
- kelajakdagi `paidAt` rad etiladi;
- muvaffaqiyatli yo'lda `recordSalaryPayment` tanlangan `cashAccountId` bilan chaqiriladi va `paidAt` tanlangan sana bo'ladi.

**Controller (`salary.controller.spec.ts` ga qo'shimcha):** endpointda `@Roles('CEO')` borligi va Branch Director/Administrator rad etilishi.

**Mavjud testlar:** `recordSalaryPayment` ga ixtiyoriy parametr qo'shilgani uchun `transactions-write.service.spec.ts` buzilmasligi kerak — parametr berilmasa eski yo'l saqlanadi.

## 6. Hujjat

- `server/CLAUDE.md` — Salary Module bo'limiga yangi endpoint va «tashqarida berilgan oylikni tasdiqlash» oqimi;
- `client/CLAUDE.md` — Financial UI / Salary bo'limiga tugma va dialog, hamda sahifalashdan chekinish sababi.
