# Filial #2 (Namangan) — bajarish rejasi

**Sana:** 2026-07-29
**Asos:** [branch-decisions.md](branch-decisions.md) (D1–D8 qarorlari) + [branch-readiness-issues.md](branch-readiness-issues.md) (106 muammo auditi)
**Bu hujjat** auditdagi umumiy batch tartibini **almashtiradi** — u qarorlar qabul qilinishidan oldin yozilgan edi.

---

## Qarorlar rejani nimadan xalos qildi

| Qaror | Nimani olib tashladi |
|---|---|
| **D6** (ustoz bitta filialda) | `SalaryPayment` ni filiallarga bo'lish — rejadagi eng og'ir migratsiya. Endi kerak emas: ustozning butun oyligi bitta filial xarajati. Ustozning filiallararo ikki karra bron bo'lishi ham (P102) qoidaviy ravishda yopiladi |
| **D5 + D7** (o'quvchi bitta filialda, ko'chirish kerak emas) | Filiallararo billing qoidasi, balans/qarz/prepaid ko'chirish mantig'i, `move-branch` endpointi. P5, P6, P14, P15, P46, P49 — hammasi **soddalashadi yoki yo'qoladi** |
| **D4** (umumiy xarajat yo'q) | Hisobotlardagi «Markaz» qatori. P41, P43, P44 ning yechimi o'zgardi: endi `branchId=null` yozuvni **ko'rsatish** emas, **umuman mavjud bo'lmasligi** kerak |
| **D8** (qo'lda bo'lish) | Xarajatni avtomatik taqsimlash mexanizmi. Tizim faqat filialni majburiy qiladi |

**Yangi qat'iy invariant:** `Σ(filiallar) == jami`, qoldiqsiz. Bu avtomatik testga aylanadi.

---

## Batch 0 — Namangan bazasini tayyorlash

**Kodsiz. Bularsiz birinchi o'quvchi kiritilishi bilan qaytarib bo'lmaydigan yo'qotish boshlanadi.**

| # | Ish | Holat | Izoh |
|---|---|---|---|
| 0.1 | Namangan **CASH + BANK** kassasi | ✅ **bajarildi** (2026-07-29) | `scripts/backfill-cash-accounts.ts` — 2 ta hisob yaratildi |
| 0.2 | Namangan **kurs** va **xona** | ⏳ CEO panelda yaratadi | Kurssiz guruh ochilmaydi, xonasiz guruh jadvalda chizilmaydi (P94) |
| 0.3 | Namangan **ish vaqti** | ✅ allaqachon to'ldirilgan | PRODda 08:00–22:00 (P95 ning PROD alomati mavjud emas; kod nuqsoni alohida) |
| 0.4 | `mainBranch` NULL xodimlar | ✅ **bajarildi** | `scripts/backfill-user-mainbranch.ts` — #10737→1, **#10768 (Namangan direktori)→2**; 4 ta CEO ataylab tegilmadi |
| 0.5 | Telegram guruhiga filial | ✅ **bajarildi** | `scripts/set-tg-group-branch.ts` — «Moliya-DaF Fergana»→1 |
| 0.6 | Namangan ustozlariga **stavka** | ⏳ ustoz qo'shilgach | Birinchi darsdan **oldin**, `effectiveFrom` = ish boshlagan sana (P25) |

**Tekshirish:** `railway run npx ts-node scripts/audit-branch-batch0.ts` (yangi, read-only).

### Bajarish paytida auditga kiritilgan tuzatishlar

| P | Audit da'vosi | PROD haqiqati (2026-07-29) |
|---|---|---|
| P95 | filial #2 da ish vaqti NULL | **Noto'g'ri** — 08:00–22:00 belgilangan. Kod nuqsoni (`create` yozmaydi) tekshirilishi kerak, lekin PRODda alomat yo'q |
| P71 | 3 ta APPROVED TG guruhi, hammasi filialsiz | **Aniqlashtirildi** — 3 tadan 2 tasi arxivlangan, broadcast `deletedAt: null` bilan filtrlaydi. Haqiqiy ochiqlik 1 ta guruh edi, u yopildi |
| P25 | stavkasiz ustoz bor | **Aniqlashtirildi** — bu test akkaunt (#10001, guruh #035, jadval 22:54–23:59, test o'quvchilar). Haqiqiy operatsion xavf emas |
| P96/P24 | 6 xodimda `mainBranch` NULL | **Aniqlashtirildi** — 4 tasi CEO (ataylab). Haqiqiy tuzatish 2 ta, jumladan Namangan direktori fail-open holatda edi |

### D5/D6 uchun yaxshi xabar

PROD hozir invariantlarni **allaqachon qanoatlantiradi**: ikki filialli o'quvchi 0 ta, ikki filialli xodim 0 ta, filialsiz o'quvchi 0 ta. Ya'ni Batch 1 dagi `@@unique([studentId])` migratsiyasi hech qanday ma'lumotni buzmasdan qo'yiladi.

---

## Batch 1 — Invariantlarni majburiy qilish + yozish tomonini yopish

**Kod. Bitta kichik migratsiya. Namangan'ga o'quvchi qo'shishdan oldin.**

### 1a. "Bitta o'quvchi = bitta filial" (D5)
- **Pre-flight:** PRODda ikki filialli o'quvchi bor-yo'qligini tekshirish (kutilgan natija: 0 ta).
- `StudentBranch` ga `@@unique([studentId])` — hozir `@@id([studentId, branchId])` N ta qatorga yo'l qo'yadi.
- `enrollToGroup`: guruh filiali ≠ o'quvchi filiali → **400**. O'quvchida filial yo'q bo'lsa — guruh filialini yozib qo'yadi. ([student-enrollment.service.ts:46](../server/src/students/student-enrollment.service.ts#L46)) → P2
- `branchIds` validatsiyasi create/update da: filial mavjudmi, kompaniyaga tegishlimi, bo'sh massiv taqiqlanadi. Pul harakati boshlangach filial qotadi. → P3
- Lid konvertatsiyasida filial **majburiy**. → P4
- Telegram ro'yxatdan o'tishda tanlangan guruh havoladagi filialga tegishli bo'lishi shart.

### 1b. "Bitta ustoz = bitta filial" (D6)
- `UserBranch` bitta qatorga cheklanadi — **servis darajasida** (CEO uchun istisno: CEO barcha filiallarga kiradi, bu ataylab). DB unique qo'yilmaydi, chunki CEO uchun istisno kerak.
- Guruhga ustoz biriktirishda: ustoz filiali ≠ guruh filiali → **400**. Bu bir vaqtda P102 (filiallararo ikki karra bron) ni ham yopadi.
- `mainBranch` yagona filial tanlanganda avtomatik to'ldiriladi (4 ta yaratish yo'lida ham). → P96

### 1c. Guruh filiali qotadi
- `UpdateGroupDto` dan `branchId` olib tashlanadi; klient uni faqat yaratishda yuboradi. → **P1**
- Kurs/xona/ustoz ro'yxatlari `group.branchId` dan yuklanadi, header'dan emas.

### 1d. Har bir pul yozuvi filial bilan yoziladi
`SALARY_ACCRUAL`, `SALARY_PAYMENT`, `REFUND`, `ADJUSTMENT`, `DISCOUNT_ADJUSTMENT`, `MOCK_EXAM_FEE`, `INITIAL_BALANCE`, `BALANCE_WITHDRAWAL` — hammasi o'quvchi/guruh filialidan oladi. → P10, P11, P12
- `recordRefund` / `recordSalaryPayment` `branchId` parametrini qabul qiladi va kassa chiqimiga uzatadi.
- Qo'lda to'lovda filial **o'quvchidan** olinadi; UI'dagi tanlov faqat tekshiruv uchun, mos kelmasa ogohlantirish. → P13
- `resolveStudentBranchId` deterministik va **fail-closed** (null qaytarmaydi). → P14
- Retroaktiv billing to'lov filiali bilan cheklanadi + nomuvofiqlikda Alert. → P5
- `recordOutflow` kassa topilmasa **jimgina null qaytarmaydi** — xato ko'taradi. → P21

**Tekshirish:** deploydan 1 kun keyin `branchId = null` yangi tranzaksiya **0** ta.

---

## Batch 2 — Eski ma'lumotni to'ldirish (backfill)

**Namangan real ma'lumot olishidan OLDIN.** Hozir noaniq qator 0 ta; Namanganda dars paydo bo'lgach aniqlik yo'qoladi.

- `scripts/backfill-transaction-branch.ts` (yozilishi kerak) — 8 738 ta filialsiz tranzaksiya, 99.9% deterministik tiklanadi:
  1. `attendanceId` → `Attendance.groupId` → `Group.branchId` (8 497 ta)
  2. `studentId` → o'quvchining filiali (230 ta)
  3. Qolgan 11 ta — qo'lda, filial 1 ga
- `SalaryAccrual.branchId` ni `Group.branchId` dan to'ldirish (100% aniq).
- **Umumiy kassadagi tarixni filial 1 ga o'tkazish**: 4 ta refund (−1 107 000 so'm) va 2 ta oylik to'lovi hozir `branchId=null` kassadan chiqqan.
- Har bir qadamdan oldin `(id, branchId)` juftligi zaxiraga olinadi; avval `--dry-run`.

**Tekshirish:** `audit-branch-isolation.ts` + `audit-finance-reconciliation.ts` (A–H invariantlari buzilmasin).

---

## Batch 3 — Xarajat va kassada filial majburiy (D4)

**Migratsiya.**

- `Expense.branchId`: `Int?` → **NOT NULL** + Branch ga FK + indeks. DTO majburiy, servis tekshiradi.
- **`ExpensesService.buildWhere` filialni WHERE ga qo'shadi** — hozir filtr qabul qilinadi, lekin ishlatilmaydi; PDF sarlavhasida filial nomi turadi, ichida esa kompaniya xarajatlari. → **P42**
- Xarajat formasi: filial maydoni majburiy, yaratishda ham, tahrirlashda ham. D8 bo'yicha umumiy xarajat ikki qator qilib kiritiladi.
- `CashAccount.branchId`: `Int?` → **NOT NULL** + FK + `@@unique([companyId, branchId, type])` (P23).
- `resolveAccountId` dagi **kompaniya kassasiga tushish zaxirasi o'chiriladi** — kassa yo'q bo'lsa qattiq xato. → P20
- Filialsiz kassa yaratish taqiqlanadi; `backfill-cash-accounts.ts` endi umumiy kassa yaratmaydi.
- **Filial go-live darvozasi:** kassasi tayyor bo'lmagan filialga moliyaviy yozuv yozilmaydi.

---

## Batch 4 — Ustoz onboarding (D1)

- Imzosiz `teacher_<branchId>` deep-link **olib tashlanadi**, o'rniga imzolangan xodim-havolasi ishlatiladi. Hozir havoladagi raqamni qo'lda o'zgartirib istalgan filialga ro'yxatdan o'tish mumkin. → P76
- Havoladagi filial `/start` da tekshiriladi: kompaniya, `deletedAt`, `status`.
- Xodim-havolasidagi **rol ko'tarish teshigi** yopiladi (havola orqali CEO roli olish mumkin).
- `POST /teachers`: filial **majburiy** va validatsiyalanadi (hozir ixtiyoriy, boshqa kompaniya filiali ham qabul qilinadi). → P60
- Ustoz qo'shish formasida filial **ochiq maydon**, header switcher'dan jimgina olinmaydi.
- **Stavka darvozasi:** guruhga ustoz biriktirishda unga guruh boshlanish sanasiga amal qiladigan stavka bo'lmasa — **400**. → P25
- «Stavkasiz ustoz» hisobotda ko'rinadi: `noConfigUnits` javobga chiqadi, accrual o'tkazib yuborilganda log + Alert.
- Har filial uchun havola generatsiya qiluvchi UI.

---

## Batch 5 — Oylikni filialga bog'lash

- `SalaryAccrual.branchId` — yangi ustun, **yozish paytida qotadi** (nullable → backfill → NOT NULL). Jonli `group.branchId` join **ishlatilmaydi**: guruh keyin ko'chsa o'tgan oylik tarixini qayta yozib yuborardi.
- `WithdrawalsService` ham accrual yozadi — u ham filial bosadi.
- Payroll o'qishlari **accrual filiali** bo'yicha kesiladi, xodimning `mainBranch` i bo'yicha emas. → P27, P28, P30
- `resolveMonthlyScope` va `batchPay` **fail-CLOSED** bo'ladi: `mainBranch` NULL bo'lsa hech narsa ko'rinmaydi/to'lanmaydi (hozir hammasi ko'rinadi). → **P24**
- `payPayment` da filial tekshiruvi. → P31
- Oylik to'lovining barcha accruallari bitta filialdan ekanini tasdiqlovchi qorovul (D6 buzilganini ushlaydi).
- **FIXED_MONTHLY** xodimlar (admin, kassir, farrosh) — `mainBranch` filialiga yoziladi, u majburiy bo'ladi. → P34
- **Markaz qo'shimchasi** (top-up): har bir gap-accrual **dars filialiga** yoziladi va u filialning xarajati bo'ladi. Filial uchun boshlanish sanasi — `Branch` ga ochilish sanasi maydoni qo'shiladi. → P26
- Avans (`TEACHER_ADVANCE`) filiali = ustoz filiali; netlash faqat shu filial ichida. → P33

---

## Batch 6 — Hisobot va foyda

- «Foyda» kartasi va Excel «Sof foyda»: oylik oyog'i filialga kesiladi. → **P37**
- `getProfitLoss`: `paidSalaries` filial bo'yicha (kod izohida kompaniya bo'yicha ekani tan olingan). → P49
- `financial-overview`: oylik, qarz, qarzdorlar soni, faol o'quvchilar bloklari filialni biladi. → P38
- `financial-trend`: `salaryAgg`, `newStudents`, `payerCount`. → P39
- Excel: «Oyliklar», «Tekshiruv», «Oylik qarzdorlik», «Filial kesimida» varaqlari filialni hurmat qiladi; «Filial kesimida» ga ustoz oyligi qo'shiladi.
- **`Σ(filiallar) == jami`** — «Tekshiruv» varag'iga qator + avtomatik test. D4 bo'yicha qoldiq **aniq 0** bo'lishi shart.
- Qaytarishlar, `income-month-attribution`, `debt-history`, ketganlar hisoboti. → P45–P48

---

## Batch 7 — Huquqlar (RBAC)

- JWT ga `branchIds` + `mainBranch`; bitta `BranchScopeGuard` / `resolveBranchScope(user, requestedBranchId)`. `branch_id` faqat **torroq** filtr bo'ladi, kengaytiruvchi emas. → P53
- **IDOR yopiladi:** filial statusini o'zgartirish (P51 — boshqa filialni yopish mumkin), `PATCH /users/:id` (begona xodim paroli), guruh/xona/kurs/xarajat id bo'yicha yozish. → P52
- Rolsiz endpointlarga `@Roles`: `/students` (P55 — to'liq PII), `/branches`, `/rooms`, `/courses`, `/dashboard/today-schedule` (P56).
- Davomat yozish/o'qishda filial tekshiruvi. → P54
- Kassa endpointlari (transfer, reconcile, movements). → P22
- `Administrator` rolini filialga cheklash — CEO javobiga bog'liq (Savol 1).

---

## Batch 8 — Interfeys

- Dialoglar filialni **kontekstdan** oladi, header'dan emas. → P62
- To'lov dialogida o'quvchi qidiruvi filial bo'yicha; hidratsiyagacha yuborish bloklanadi. → P62, P64
- Guruhga qo'shish dialogi guruhlarni **o'quvchi filialidan** ko'rsatadi.
- CEO uchun «Barcha filiallar» varianti; default = `mainBranch`. → P63
- Oylik sahifasiga filial filtri; o'quvchi profili va ro'yxatida filial ko'rinadi. → P69
- Filial tanlovi URLda. → P67

---

## Batch 9 — Telegram va cron

- Guruh tasdiqlashda filial tanlanadi; `branchId=null` guruh qolmaydi. → **P71**
- Hisobot menyusi (`rm:*`) guruh filiali bo'yicha beradi. → P72
- 21:00 hisoboti filial kesimida; `DailyFinancialSnapshot` ga `branchId`; kesh kaliti `companyId + branchId`. → P73
- Admin bot buyruqlari filialni hisobga oladi. → P74
- Cron ishlari: guruh statusi, davomat eskalatsiyasi, to'lov va'dasi. → P81–P85

---

## Batch 10 — Lidlar, mock, sxema tozalash

- `Lead` ga `companyId` + `branchId` (hozir ikkalasi ham yo'q). → P86, P87
- Ommaviy formaga filial. → P88
- Mock imtihonga `companyId` + `branchId`; mock puli ledgerga yoziladi. → P89–P91
- `Holiday` ga `companyId` + `branchId` (hozir bayram butun BAZA bo'yicha global). → P100
- Moliyaviy `branchId` ustunlariga FK (backfilldan keyin). → P105
- Guruh raqami prefiksi, `Course.branchId` null holati, portal kontaktlari. → P103, P104, P92

---

## Ogohlantirishlar

1. **Namangan birinchi oyda zarar ko'rsatadi.** D4 bo'yicha markaz qo'shimchasi dars filialining xarajati bo'ladi; birinchi oyda deyarli hamma dars qoplanmagan bo'ladi. Bu raqam **haqiqat** — yashirilmasligi kerak.
2. **Gateway komissiyasi va SMS xarajati hozir hech qayerda `Expense` sifatida yozilmaydi.** Ya'ni filial foydasi shu miqdorga optimistik chiqadi (Savol 4).
3. **Click/Payme bitta merchant hisobi** — kitobda ajratish to'g'ri ishlaydi, lekin bank tomonida pul bitta hisobga tushadi.
4. **`branchId` ustunlari hozir FK emas** — mavjud bo'lmagan filial raqamini yozib qo'yish mumkin va u abadiy qoladi. Batch 10 da tuzatiladi.
5. **`Administrator` roli hozir ataylab kompaniya darajasida** (`scoped = !CEO && !Administrator` naqshi bir necha modulda takrorlangan). D4 bilan bu ziddiyatda.
