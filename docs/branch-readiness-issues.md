# Ikkinchi filial (Namangan #2) — yakuniy muammolar ro'yxati

**Sana:** 2026-07-29 · **Manba:** 12 ta parallel audit (252 tasdiqlangan topilma), takrorlar birlashtirildi
**Mavjud reja:** [docs/branch-finance-split-plan.md](docs/branch-finance-split-plan.md) — moliya yozuv/o'qish bo'shliqlari. Quyidagi ro'yxat uni **tasdiqlaydi va kengaytiradi**; rejada allaqachon bor bandlar «(rejada bor)» deb belgilangan.

---

## Xulosa

| Mavzu | Muammolar | Bloker |
|---|---|---|
| 1. Ma'lumot izolyatsiyasi va kanonik filial manbai | P1–P9 | P1, P2 |
| 2. Pul yozuvlari (yozish tomoni) | P10–P19 | P10, P11, P12 |
| 3. Kassa | P20–P23 | P20 |
| 4. Oylik | P24–P36 | P24, P25, P26 |
| 5. Hisobot va Excel | P37–P50 | — |
| 6. Auth / RBAC | P51–P61 | P51, P52 |
| 7. UI / klient | P62–P70 | — |
| 8. Telegram | P71–P80 | P71 |
| 9. Cron va rejali ishlar | P81–P85 | — |
| 10. Lidlar, mock imtihonlar, tashqi kanallar | P86–P92 | — |
| 11. Namangan'ni ishga tushirish sozlamalari | P93–P99 | P93, P94, P95 |
| 12. Sxema yaxlitligi va texnik qarz | P100–P106 | — |

**Bloker (birinchi haqiqiy Namangan o'quvchisidan OLDIN):** P1, P2, P10, P11, P12, P20, P24, P25, P26, P51, P52, P71, P93, P94, P95.

---

## 1. Ma'lumot izolyatsiyasi va kanonik filial manbai

### P1 — [BLOKER] Guruhni tahrirlash uni jimgina boshqa filialga ko'chiradi
Klient HAR BIR saqlashda `branchId: selectedBranch?.id` yuboradi (yaratishda emas, doim), backend esa uni tekshiruvsiz `group.update` ga o'tkazadi. Header Namanganda turib Farg'ona guruhini ochib saqlasangiz — guruh, uning o'quvchilari, kelgusi `LESSON_DEDUCTION` va `SalaryAccrual` filiali 2-filialga ko'chadi; xonasi esa eski filialda qoladi. Guruh detali sahifasidan ham (qidiruv, ustoz profili orqali) tushish mumkin.
**Dalil:** [edit-group-form.tsx:198-200](client/src/components/groups/edit-group-form.tsx#L198) · [update-group.dto.ts:26-29](server/src/groups/dto/update-group.dto.ts#L26) · [groups-write.service.ts:239](server/src/groups/groups-write.service.ts#L239) · [groups-write.service.ts:301-309](server/src/groups/groups-write.service.ts#L301) · [group-detail-client.tsx:111](client/src/components/groups/group-detail-client.tsx#L111)
**Yechim:** `UpdateGroupDto` dan `branchId` ni olib tashlash; klient `payload.branchId` ni faqat `isAdd` da yuborsin; kurs/xona/ustoz ro'yxatlari `group.branchId` dan yuklansin. Ko'chirish kerak bo'lsa — alohida `POST /groups/:id/move-branch`.

### P2 — [BLOKER] `enrollToGroup` filial mosligini na tekshiradi, na sinxronlaydi — o'quvchi filiali ikki manbadan chiqadi
`StudentBranch` faqat o'quvchi create/update da yoziladi; guruhga qo'shishda umuman tegilmaydi (faylda `branchId` so'zi yo'q). Natijada: dars puli guruh filialiga, o'quvchi ro'yxati/qarzdorlar/ketganlar statistikasi esa `StudentBranch` ga tayanadi. Bitta o'quvchi bir hisobotda Namangan, boshqasida Farg'ona.
**Dalil:** [student-enrollment.service.ts:46-56](server/src/students/student-enrollment.service.ts#L46) · [students-write.service.ts:117-124](server/src/students/students-write.service.ts#L117) · [students-read.service.ts:74-76](server/src/students/students-read.service.ts#L74) · [payments-debtors.service.ts:61-74](server/src/payments/payments-debtors.service.ts#L61) · [lesson-billing.service.ts:198](server/src/billing/lesson-billing.service.ts#L198) · [payments-write.service.ts:670-696](server/src/payments/payments-write.service.ts#L670)
**Yechim:** `enrollToGroup` tranzaksiyasida guruh filialini `StudentBranch` ga upsert qilish yoki mos kelmasa 400. Uzoq muddatda — yagona kanonik `resolveStudentBranchId` helperi va barcha o'qish yo'llarini o'shanga o'tkazish. **CEO qarori kerak** (kanonik ta'rif).

### P3 — [HIGH] `branchIds` validatsiyasiz qabul qilinadi; filialsiz o'quvchi yaratish mumkin
DTO faqat tur tekshiradi; `create` da massiv to'g'ridan-to'g'ri `createMany` ga, `update` da `deleteMany + createMany` ga tushadi — filial mavjudligi, kompaniyaga tegishliligi va chaqiruvchi huquqi tekshirilmaydi. `branchIds: []` yuborilsa o'quvchi filialsiz qoladi va `branch_id` filtriga hech qachon tushmaydi.
**Dalil:** [create-student.dto.ts:78-84](server/src/students/dto/create-student.dto.ts#L78) · [students-write.service.ts:117-124](server/src/students/students-write.service.ts#L117) · [students-write.service.ts:262-272](server/src/students/students-write.service.ts#L262) · taqqoslash: [users.service.ts:118-131](server/src/users/users.service.ts#L118)

### P4 — [HIGH] Lid → o'quvchi konvertatsiyasida filial ixtiyoriy — StudentBranch'siz o'quvchi tug'iladi
`branchId` `@IsOptional`, guruh tanlanmasa `branchIds: undefined` bo'lib qoladi; dialog «Filialni keyinroq belgilash mumkin» deb ochiq undaydi. Bunday o'quvchi ikkala filial ro'yxatida ham ko'rinmaydi (faqat CEO qidiruvidan topiladi).
**Dalil:** [convert-lead.dto.ts:5-10](server/src/leads/dto/convert-lead.dto.ts#L5) · [leads.service.ts:761](server/src/leads/leads.service.ts#L761) · [leads.service.ts:788](server/src/leads/leads.service.ts#L788) · [convert-lead-dialog.tsx:59](client/src/components/leads/convert-lead-dialog.tsx#L59) · [convert-lead-dialog.tsx:196-198](client/src/components/leads/convert-lead-dialog.tsx#L196)

### P5 — [HIGH] Yagona `Student.balance` + kompaniya bo'yicha retroaktiv billing — pul filiallar orasida oqadi
`processRetroactiveBillingForStudent` o'quvchining BARCHA aktiv enrollmentlarini `createdAt asc` bo'yicha aylanadi: Namangan kassasiga tushgan pul avval Farg'ona qarzli darslarini yopadi va `LESSON_DEDUCTION` Farg'onaga yoziladi. Tushum bir filialda, tan olingan daromad boshqasida.
**Dalil:** [schema.prisma:521](server/prisma/schema.prisma#L521) · [lesson-billing.service.ts:138-152](server/src/billing/lesson-billing.service.ts#L138) · [lesson-billing.service.ts:191-198](server/src/billing/lesson-billing.service.ts#L191)
**CEO qarori kerak.**

### P6 — [MEDIUM] `StudentBranch` ko'p-ko'p va «asosiy filial» yo'q — ikki a'zolikli o'quvchi qarzi ikkala filialda to'liq sanaladi
Hisobotlar `branches: { some: ... }` predikatidan foydalanadi → Σ(filiallar) > jami. Bugun UI ikki a'zolik yaratmaydi (doim bitta elementli massiv), ya'ni bu latent — lekin API/skript orqali ochiladi.
**Dalil:** [schema.prisma:577-583](server/prisma/schema.prisma#L577) · [reports-balance-sheet.service.ts:34-38](server/src/reports/reports-balance-sheet.service.ts#L34) · [reports-payments.service.ts:112-127](server/src/reports/reports-payments.service.ts#L112) · [add-student-dialog.tsx:158](client/src/components/students/add-student-dialog.tsx#L158)

### P7 — [MEDIUM] O'quvchini filialdan filialga ko'chirish oqimi yo'q
`edit-student-form.tsx` da filial maydoni umuman yo'q; ko'chirish faqat `PATCH /students/:id { branchIds }` API orqali, validatsiyasiz. Prepaid qoldiq, ochiq qarz va eski enrollment bilan nima bo'lishi hech qayerda ta'riflanmagan.
**Dalil:** [edit-student-form.tsx](client/src/components/students/edit-student-form.tsx) (392 qator, `branch` bo'yicha 0 moslik) · [students-write.service.ts:262-272](server/src/students/students-write.service.ts#L262)
**CEO qarori kerak** (ko'chirish qoidasi).

### P8 — [MEDIUM] Telefon bo'yicha o'quvchi mosligi global: drawer filialni ko'rsatmaydi, konvertatsiya bir xil raqamni butunlay bloklaydi
`matchedStudent` `{ phone, deletedAt: null }` bo'yicha (hatto `companyId` siz), select'da filial qaytarilmaydi; `samePhone` qorovuli ikkinchi filialdagi haqiqiy yangi odamni ro'yxatga olishni rad etadi.
**Dalil:** [leads.service.ts:248-257](server/src/leads/leads.service.ts#L248) · [leads.service.ts:745-755](server/src/leads/leads.service.ts#L745) · [mock-exam-registration.scene.ts:570-578](server/src/telegram/scenes/mock-exam-registration.scene.ts#L570)

### P9 — [MEDIUM] Telefon/chatId bo'yicha `findFirst` lar deterministik emas (parol tiklash, ilovaga kirish)
`orderBy` yo'q → bir raqam ikki qatorda bo'lsa tasodifiy qator tanlanadi. Mock sahnasi allaqachon `orderBy: { updatedAt: 'desc' }` bilan yamalgan — qolganlari yamalmagan.
**Dalil:** [password-reset-flow.ts:55-73](server/src/telegram/flows/password-reset-flow.ts#L55) · [app-login-otp-flow.ts:24-27](server/src/telegram/flows/app-login-otp-flow.ts#L24) · [student-registration.scene.ts:330-332](server/src/telegram/scenes/student-registration.scene.ts#L330)

---

## 2. Pul yozuvlari (yozish tomoni)

> Bu bo'lim rejaning Faza 0.1 i. **Backfill ma'noli bo'lishi uchun avval shu yopilishi shart** — Namanganda ma'lumot paydo bo'lgach, tiklash qoidasi noaniqlashadi ([plan:110](docs/branch-finance-split-plan.md#L110)).

### P10 — [BLOKER] `SALARY_ACCRUAL` tranzaksiyasi filialsiz yoziladi (oyiga ~4 300 qator) *(rejada bor)*
`SalaryAccrual` modelida `branchId` ustuni yo'q, tranzaksiya create'da ham yozilmaydi. `groupId` NOT NULL bo'lgani uchun filial deterministik tiklanadi — ya'ni tuzatish arzon, lekin bugun har bir filial kesimidagi hisobot bu qatorlarni jimgina tashlab ketadi.
**Dalil:** [salary-accrual.service.ts:351](server/src/salary/salary-accrual.service.ts#L351) · [salary-accrual.service.ts:459](server/src/salary/salary-accrual.service.ts#L459) · [schema.prisma:2100-2178](server/prisma/schema.prisma#L2100) · [attendance-save.service.ts:58-66](server/src/attendance/attendance-save.service.ts#L58)
**Qo'shimcha (rejada yo'q):** `LESSON_DEDUCTION` filiali yozilish paytida **muzlatiladi**, accrual esa guruhdan **jonli** tiklanadi — guruh ko'chsa (P1) tarix ikkiga bo'linadi. Migratsiyada qiymat yozish paytida muzlatilsin.

### P11 — [BLOKER] `recordRefund` va `recordSalaryPayment` `branchId` parametrini umuman olmaydi *(rejada bor)*
Ikkalasi ham kassa chiqimini `branchId` siz chaqiradi → pul HAR DOIM umumiy (branchId=null) kassadan chiqadi. `Refund` modelida `branchId` ustuni ham yo'q, ya'ni hisobotda filtrlash imkoni yo'q.
**Dalil:** [transactions-write.service.ts:351-359](server/src/transactions/transactions-write.service.ts#L351) · [transactions-write.service.ts:387-397](server/src/transactions/transactions-write.service.ts#L387) · [transactions-write.service.ts:407-415](server/src/transactions/transactions-write.service.ts#L407) · [transactions-write.service.ts:447-457](server/src/transactions/transactions-write.service.ts#L447)

### P12 — [BLOKER] Rejada sanab o'tilmagan qo'shimcha filialsiz yozish nuqtalari
Audit reja ro'yxatiga qo'shimcha 5 ta yozish nuqtasini topdi:
| Tur | Fayl:qator | Holat |
|---|---|---|
| `BALANCE_WITHDRAWAL` | [withdrawals.service.ts:155-174](server/src/withdrawals/withdrawals.service.ts#L155) | `teacherGroupId` aniqlangan, lekin `branchId` yozilmaydi |
| `MOCK_EXAM_FEE` | [mock-exam-billing.service.ts:113-127](server/src/mock-exams/mock-exam-billing.service.ts#L113) | `branchId` yo'q |
| Refund ichidagi `ADJUSTMENT` | [refunds-create.service.ts:196-208](server/src/refunds/refunds-create.service.ts#L196) | `createAdjustment` branchId ni qo'llaydi, uzatilmaydi |
| `INITIAL_BALANCE` | [students.controller.ts:305-321](server/src/students/students.controller.ts#L305) | metod qo'llaydi, controller bermaydi |
| `DISCOUNT_ADJUSTMENT` | [students-write.service.ts:418-431](server/src/students/students-write.service.ts#L418) | branchId uzatilmaydi + o'quvchining **barcha filiallardagi** darslarini qayta hisoblaydi |

### P13 — [HIGH] Qo'lda to'lov filiali UI switcher'dan olinadi, hech qanday validatsiyasiz *(rejada bor)*
`dto.branchId` faqat shartnoma bo'lsa tekshiriladi (shartnomalar amalda ishlatilmaydi). Filialning mavjudligi, kompaniyaga tegishliligi, o'quvchining enrollment filialiga mosligi — hech biri tekshirilmaydi. `Payment.branchId`/`Transaction.branchId` FK emas, ya'ni mavjud bo'lmagan raqam ham yoziladi.
**Dalil:** [payments-write.service.ts:98](server/src/payments/payments-write.service.ts#L98) · [create-payment.dto.ts:35-37](server/src/payments/dto/create-payment.dto.ts#L35) · [transactions-write.service.ts:86](server/src/transactions/transactions-write.service.ts#L86)

### P14 — [HIGH] `resolveStudentBranchId` ikki filialli o'quvchida noaniq — gateway tushumi tasodifiy filialga
Eng oxirgi yaratilgan aktiv enrollment guruhining filiali; topilmasa `StudentBranch.findFirst` (orderBy'siz). Click/Payme webhook'lari aynan shuni ishlatadi. **Reja bu funksiyani «to'g'ri ishlaydi» jadvaliga kiritgan — bu endi noto'g'ri, «shartli» ga ko'chirilishi kerak.**
**Dalil:** [payments-write.service.ts:670-696](server/src/payments/payments-write.service.ts#L670) · [click-methods.service.ts:303-320](server/src/payment-gateways/click/click-methods.service.ts#L303) · [payme-methods.service.ts:337-354](server/src/payment-gateways/payme/payme-methods.service.ts#L337) · [plan:15](docs/branch-finance-split-plan.md#L15)
**CEO qarori kerak** (ikki filialli o'quvchi to'lovi qaysi qarzga tushadi).

### P15 — [HIGH] Refund hisobi o'quvchining BARCHA filiallardagi to'lovlarini asos qiladi
`sumPayments(studentId, companyId)` — filial/enrollment cheklovi yo'q; `quickRefund` da `maxRefundable = student.balance + overDeducted` (global balans). Pul esa umumiy kassadan chiqadi (P11).
**Dalil:** [refunds-create.service.ts:56](server/src/refunds/refunds-create.service.ts#L56) · [refunds-create.service.ts:300-310](server/src/refunds/refunds-create.service.ts#L300) · [refunds-create.service.ts:151-158](server/src/refunds/refunds-create.service.ts#L151)

### P16 — [MEDIUM] Kassa hisobi va xarajat yozuvida filial klientdan keladi, chaqiruvchi huquqi tekshirilmaydi
`ExpensesService.create` `dto.branchId` ni umuman validatsiya qilmaydi va uni ham Expense qatoriga, ham ledgerga yozadi. Farg'ona direktori Namangan xarajatini yozishi mumkin.
**Dalil:** [expenses.service.ts:54-101](server/src/expenses/expenses.service.ts#L54) · [cash-accounts.service.ts:59-67](server/src/cash-accounts/cash-accounts.service.ts#L59)

### P17 — [MEDIUM] To'lov va'dasi / qo'ng'iroq yozuvi filiali «oxirgi enrollment» mantig'iga tayanadi va yaratilganda qotadi
Cron eslatma yuborayotganda filialni qayta hisoblamaydi; `branchId` NULL bo'lsa listener filtrni butunlay tushirib, ikkala filial adminlariga yuboradi.
**Dalil:** [payment-promises.service.ts:178-203](server/src/payment-promises/payment-promises.service.ts#L178) · [call-logs.service.ts:190-212](server/src/call-logs/call-logs.service.ts#L190) · [payment-promise-cron.service.ts:64-72](server/src/payment-promises/payment-promise-cron.service.ts#L64) · [notification-events.listener.ts:349-356](server/src/notifications/notification-events.listener.ts#L349)

### P18 — [LOW] Xarajat filialini API orqali o'zgartirish ledger/kassani ko'chirmaydi
`financialFieldChanged` ro'yxatida `branch` yo'q — Expense qatori yangilanadi, `Transaction`/`CashMovement` eski filialda qoladi. UI hozir PATCH da `branchId` yubormaydi (latent), lekin forma kengaytirilsa darhol HIGH bo'ladi.
**Dalil:** [expenses.service.ts:360-383](server/src/expenses/expenses.service.ts#L360) · [expense-form-dialog.tsx:101-114](client/src/components/payments/expense-form-dialog.tsx#L101)

### P19 — [LOW] `PaymentGatewayConfig` `@@unique([companyId, provider])` — Click/Payme merchant hisobi bitta *(rejada bor)*
Tizim ichida ajratiladi; bank tomonida ajratish kerakmi — **CEO qarori**.
**Dalil:** [schema.prisma:2388](server/prisma/schema.prisma#L2388)

---

## 3. Kassa

### P20 — [BLOKER] Namangan kassasi ochilmasa naqd pul umumiy «Asosiy kassa» qoldig'iga qo'shiladi
`resolveAccountId` filial kassasi topilmasa `branchId: null` hisobiga tushadi; harakat qatori esa `branchId=2` bilan teglanadi. Ya'ni **harakat filialda, qoldiq umumiy chelakda** — «Pul oqimi»/«Balans» filial kesimida qoldiq 0, harakat ≠ 0 chiqadi.
**Dalil:** [cash-movements.service.ts:85-125](server/src/cash-accounts/cash-movements.service.ts#L85) · [cash-movements.service.ts:158](server/src/cash-accounts/cash-movements.service.ts#L158) · [reports-cash-flow.service.ts:36-69](server/src/reports/reports-cash-flow.service.ts#L36) · [period-helpers.ts:46-55](server/src/common/finance/period-helpers.ts#L46)
**Yechim:** [backfill-cash-accounts.ts](server/scripts/backfill-cash-accounts.ts) ni yurgizish (idempotent, har filialga CASH+BANK). PROD holati (2026-07-29): filial 1 da CASH+BANK bor, filial 2 da yo'q.

### P21 — [HIGH] Kassa hisobi topilmasa `recordOutflow` jimgina `null` qaytaradi (faqat `logger.warn`)
Ledgerda pul chiqqan, kassada hech narsa yo'q, xato ko'tarilmaydi. Moliyaviy ledger uchun qabul qilib bo'lmas.
**Dalil:** [cash-movements.service.ts:239-245](server/src/cash-accounts/cash-movements.service.ts#L239) · [salary-payment.service.ts:253-268](server/src/salary/salary-payment.service.ts#L253)

### P22 — [HIGH] Kassa endpointlarida filial tekshiruvi yo'q (transfer, reconcile, movements, patch, delete, create)
`findAll` BD scope'ini qo'llaydi, qolgan hammasi faqat `companyId`. Filial direktori boshqa filial kassasidan o'ziga transfer qila oladi va begona kassaga ADJUSTMENT yozadi.
**Dalil:** [cash-accounts.controller.ts:47-91](server/src/cash-accounts/cash-accounts.controller.ts#L47) · [cash-accounts.service.ts:140-146](server/src/cash-accounts/cash-accounts.service.ts#L140) · [cash-accounts.service.ts:243-305](server/src/cash-accounts/cash-accounts.service.ts#L243)

### P23 — [MEDIUM] `CashAccount` da (kompaniya, filial, tur) bo'yicha unique yo'q; `resolveAccountId` eng eskisini oladi
Dublikat kassa ochilsa pul jimgina «eng eski» hisobga tushaveradi.
**Dalil:** [schema.prisma:2416-2434](server/prisma/schema.prisma#L2416) · [cash-movements.service.ts:96-108](server/src/cash-accounts/cash-movements.service.ts#L96)

---

## 4. Oylik

### P24 — [BLOKER] `batchPay` fail-OPEN: `mainBranch` NULL bo'lgan direktor ikkala filialning barcha APPROVED oyliklarini to'laydi
`effectiveBranchId = isCeo ? params.branchId : (caller?.mainBranch ?? undefined)` → `undefined` filtr butunlay tushib qoladi. Xodim formasi bitta filialda `mainBranch` ni majburiy qilmaydi, ya'ni NULL holat real. PRODda 2 ta Administrator'da `mainBranch = null`.
**Dalil:** [salary-payment.service.ts:296-318](server/src/salary/salary-payment.service.ts#L296) · [salary-payment.service.ts:63-72](server/src/salary/salary-payment.service.ts#L63) · [resolve-monthly-scope.ts:94-97](server/src/salary/shared/resolve-monthly-scope.ts#L94) · [edit-employee-form.tsx:196-202](client/src/components/settings/edit-employee-form.tsx#L196) · [users.service.ts:381](server/src/users/users.service.ts#L381) · fail-closed namunasi: [outreach.service.ts:36-40](server/src/outreach/outreach.service.ts#L36)

### P25 — [BLOKER] Stavkasiz ustozning darslari uchun accrual UMUMAN yozilmaydi — jimgina, log'siz
`findActiveVersion` null qaytarsa `return null` (na log, na Alert). Konfiguratsiyani keyin orqaga surish taqiqlangan → o'tgan darslar abadiy 0. Bu aynan 2026-05 dagi ~20 mln so'mlik yo'qotish imzosi. Hisobotda faqat «—» ko'rinadi, `noConfigUnits` javobga chiqmaydi.
**Dalil:** [salary-accrual.service.ts:186-193](server/src/salary/salary-accrual.service.ts#L186) · [salary-calculation.service.ts:681-682](server/src/salary/salary-calculation.service.ts#L681) · [salary-config.service.ts:439-460](server/src/salary/salary-config.service.ts#L439) · [salary-monthly.service.ts:442-455](server/src/salary/salary-monthly.service.ts#L442)
**Yechim (bloker qismi):** Namangan ustozlariga `EmployeeSalaryConfig` + versiya **birinchi darsdan oldin**, `effectiveFrom` = ish boshlagan sana. Kodda: warn + Alert + «stavkasiz ustoz» ro'yxati.

### P26 — [BLOKER] Markaz qo'shimchasi (top-up) kompaniya bo'yicha ishlaydi — filial go-live chegarasi yo'q
`writeCenterTopUpAccruals(companyId, ...)` va gap sweep'ning barcha so'rovlari faqat `companyId`. BR-09b backlog skani `topUpEraStartDate()` = 2026-07-01 dan boshlab **ortga kiritilgan** darslarni ham qamraydi — Namangan onboarding'ida eski (allaqachon to'langan) darslar kiritilsa, ular markaz hisobidan avtomatik moliyalashtiriladi. BR-09 4-dars gate va inactivity cap ta'sirni toraytiradi, lekin bekor qilmaydi.
**Dalil:** [salary-calculation.service.ts:92-93](server/src/salary/salary-calculation.service.ts#L92) · [salary-calculation.service.ts:425-437](server/src/salary/salary-calculation.service.ts#L425) · [salary-calculation.service.ts:700-720](server/src/salary/salary-calculation.service.ts#L700) · [topup.ts:56-64](server/src/salary/shared/topup.ts#L56)
**Yechim:** `Branch.topUpEffectiveFrom` (yoki `openedAt`, P97 bilan bitta maydon) + `preview-topup-run.ts` bilan dry-run. **CEO qarori kerak.**

### P27 — [HIGH] `getMonthly` da filial faqat ustozlar RO'YXATIGA qo'llanadi *(rejada bor, kengaytirildi)*
Filial filtri 98-qatorda tugaydi; accrual, davomat, guruh, `groupTeacher`, override, stavka versiyalari, avans so'rovlarining birortasida filial yo'q. Natija: ikki filialda dars beruvchi ustoz IKKALA filial hisobotida KOMPANIYA summasi bilan chiqadi → Σ(filiallar) > jami; teskarisi ham (2-filialda dars bergan, lekin `UserBranch=[1]` ustoz 2-filialda umuman ko'rinmaydi).
**Dalil:** [salary-monthly.service.ts:98](server/src/salary/salary-monthly.service.ts#L98) · [salary-monthly.service.ts:165-176](server/src/salary/salary-monthly.service.ts#L165) · [salary-monthly.service.ts:190-197](server/src/salary/salary-monthly.service.ts#L190) · [salary-monthly.service.ts:199-214](server/src/salary/salary-monthly.service.ts#L199)

### P28 — [HIGH] Payroll filialni faqat XODIMdan oladi, dars guruhidan hech qachon emas — va ikki xil mexanizm bilan
`getMatrix`/`batchPay` — `user.mainBranch`; `/salary/monthly`, `/salary/overview`, staff — `UserBranch`. Ikkovi ham «dars qaysi filialda o'tdi» degan savolga javob bermaydi. **Muhim:** `SalaryAccrual.groupId` NOT NULL + `Group.branchId` NOT NULL — ya'ni bugun, migratsiyasiz ham `salaryAccrual.findMany({ where: { group: { branchId } } })` yozish mumkin.
**Dalil:** [salary-payment.service.ts:72](server/src/salary/salary-payment.service.ts#L72) · [salary-payment.service.ts:316-318](server/src/salary/salary-payment.service.ts#L316) · [salary-monthly.service.ts:98](server/src/salary/salary-monthly.service.ts#L98) · [schema.prisma:2106-2107](server/prisma/schema.prisma#L2106) · [schema.prisma:1076](server/prisma/schema.prisma#L1076)
**CEO qarori kerak** (rejadagi 1-savol; tavsiya: har dars o'z guruhining filialiga).

### P29 — [HIGH] `applyGlobalConfig` kompaniya bo'yicha bosib ketadi; `@@unique([userId, groupId])` filialga xos global stavkani imkonsiz qiladi
Ustozlar `groupTeacher.findMany({ group: { companyId } })` bilan olinadi (filialsiz), har biriga bir xil stavka yoziladi. Guruhga biriktirilmagan yangi Namangan ustozi esa qamrovga umuman tushmaydi → to'g'ridan-to'g'ri P25 holatiga olib keladi. Endpoint hozir UI dan chaqirilmaydi (`grep "config/global" client/src` → 0).
**Dalil:** [salary-config.service.ts:145-164](server/src/salary/salary-config.service.ts#L145) · [salary-config.service.ts:170-196](server/src/salary/salary-config.service.ts#L170) · [schema.prisma:1926-1945](server/prisma/schema.prisma#L1926) · [salary-config-bulk-dialog.tsx:80-89](client/src/components/payments/salary-config-bulk-dialog.tsx#L80)
**CEO qarori kerak** (filialga xos stavka kerakmi).

### P30 — [HIGH] Oylik o'qish endpointlarining yarmida filial scope umuman yo'q
`findPayments`, `getAccruals`, `getPaymentBreakdown`, `getConfig`, `getHistory`, `getTimeline` — hammasi faqat `companyId`; `getAdvancesForUser` esa scope'ni hisoblab, `branchId` ni tashlab yuboradi. Id bo'yicha boshqa filial ustozining maosh varaqasi to'liq ochiq.
**Dalil:** [salary-payment.service.ts:133-141](server/src/salary/salary-payment.service.ts#L133) · [salary-accrual.service.ts:486-492](server/src/salary/salary-accrual.service.ts#L486) · [salary-breakdown.service.ts:28-42](server/src/salary/salary-breakdown.service.ts#L28) · [salary-monthly.service.ts:549-580](server/src/salary/salary-monthly.service.ts#L549)

### P31 — [HIGH] Yakka oylik to'lovida (`POST /salary/payments/:id/pay`) filial tekshiruvi yo'q
Faqat `{ id, companyId }`. `batchPay` dagi himoya bu yo'lda takrorlanmagan. Yumshatuvchi: faqat APPROVED to'lanadi, approve esa CEO-only; ledgerga filial baribir yozilmaydi.
**Dalil:** [salary-payment.service.ts:241-268](server/src/salary/salary-payment.service.ts#L241) · [salary.controller.ts:318-326](server/src/salary/salary.controller.ts#L318)

### P32 — [MEDIUM] Oylik to'lovi naqd harakati doim markaz kassasidan chiqadi (P11 ning oylik tarmog'i)
Namangan kassasi qoldig'i ustoz oyligini hech qachon ko'rsatmaydi.
**Dalil:** [transactions-write.service.ts:447-457](server/src/transactions/transactions-write.service.ts#L447)

### P33 — [MEDIUM] Avans: dialog barcha filial xodimlarini ko'rsatadi, xarajat esa header filialiga yoziladi; oylikda filialsiz netlanadi
`/users` so'roviga `branch_id` yuborilmaydi; `POST /expenses` ga `branchId: selectedBranch?.id`. `applyPendingAdvances` va oylik avans ustuni `Expense.branchId` ni umuman ko'rmaydi.
**Dalil:** [salary-add-advance-dialog.tsx:69-82](client/src/components/payments/salary-add-advance-dialog.tsx#L69) · [salary-add-advance-dialog.tsx:105](client/src/components/payments/salary-add-advance-dialog.tsx#L105) · [salary-calculation.service.ts:375-390](server/src/salary/salary-calculation.service.ts#L375) · [salary-monthly.service.ts:227-237](server/src/salary/salary-monthly.service.ts#L227)

### P34 — [MEDIUM] Ikki filialda ishlaydigan xodim ikki marta, filialsiz xodim hech qayerda sanalmaydi
`branches: { some: { branchId } }` = «shu filialda ham bor». `FIXED_MONTHLY` sweep esa filialga umuman qaramay hammaga oylik yozadi.
**Dalil:** [salary-monthly.service.ts:98](server/src/salary/salary-monthly.service.ts#L98) · [salary-monthly-staff.service.ts:75-83](server/src/salary/salary-monthly-staff.service.ts#L75) · [salary-calculation.service.ts:259-270](server/src/salary/salary-calculation.service.ts#L259)
**CEO qarori kerak** («Markaz xodimlari» bloki).

### P35 — [MEDIUM] Ustoz profilidagi «kutilayotgan oylik» ikkala filial guruhlarini qo'shadi (so'rovda `companyId` ham yo'q)
`GET /teachers/:id/salary-summary` (CEO/BD) ham shu funksiyani chaqiradi.
**Dalil:** [salary-summary.service.ts:36-37](server/src/salary/salary-summary.service.ts#L36) · [teachers.controller.ts:92-100](server/src/teachers/teachers.controller.ts#L92) · [salary-overview.service.ts:141-152](server/src/salary/salary-overview.service.ts#L141)

### P36 — [LOW] Oylik davri, kalendar va oy chegarasi kompaniya darajasida
`SalaryPeriodSetting` da `branchId` yo'q va `@@unique` ham yo'q; cron faqat kompaniya bo'yicha aylanadi; oy tanlagich chegarasi `Company.systemStartDate` dan — filialning ochilish sanasi tushunchasi yo'q (P97).
**Dalil:** [schema.prisma:1973-1988](server/prisma/schema.prisma#L1973) · [salary-cron.service.ts:29-52](server/src/salary/salary-cron.service.ts#L29) · [resolve-monthly-scope.ts:56-68](server/src/salary/shared/resolve-monthly-scope.ts#L56)
**CEO qarori kerak** (bitta kalendar yetarlimi).

---

## 5. Hisobot va Excel

### P37 — [HIGH] Kanonik «Foyda» kartasi va Excel «Sof foyda»: filial tushumidan KOMPANIYA oyligi + admin oyligi + refund + write-off ayiriladi *(rejada qisman)*
`getMonthlyNetProfit` `branchId` ni tushum/P&L/outflows ga uzatadi, lekin `getSalaryMonthly(companyId, month, performedById)` imzosida `branchId` YO'Q. P&L dagi `paidSalaries` filialsiz (kodda tan olingan), `getPeriodOutflows` da REFUND va DEBT_WRITE_OFF filialsiz — holbuki `DEBT_WRITE_OFF` yozilayotganda `branchId` **oladi** (ma'lumot bor, filtr yo'q). Kartada hech qanday izoh ham yo'q.
**Dalil:** [reports.service.ts:89-91](server/src/reports/reports.service.ts#L89) · [reports.service.ts:126-136](server/src/reports/reports.service.ts#L126) · [reports-profit-loss.service.ts:66-73](server/src/reports/reports-profit-loss.service.ts#L66) · [reports-financial.service.ts:1505-1536](server/src/reports/reports-financial.service.ts#L1505) · [debt-write-off.service.ts:258](server/src/billing/debt-write-off.service.ts#L258) · [reports-excel.helpers.ts:143-155](server/src/reports/reports-excel.helpers.ts#L143)
**CEO qarori kerak** (markaz xarajatlari taqsimlanadimi).

### P38 — [HIGH] `financial-overview`: qarz, qarzdorlar soni, faol o'quvchilar va oylik bloklari filialni bilmaydi
Ayni metodda `newStudents` `branches: { some: { branchId } }` ishlatadi — ya'ni filtr texnik jihatdan mumkin, shunchaki beshta so'rovga qo'llanmagan. Excel «Asosiy xulosa» varag'i shu buzuq qarzni oladi, «Qarzdorlar» varag'i esa boshqa (filialga kesilgan) manbadan — bir faylda ikki xil qarz.
**Dalil:** [reports-financial.service.ts:280-291](server/src/reports/reports-financial.service.ts#L280) · [reports-financial.service.ts:298-307](server/src/reports/reports-financial.service.ts#L298) · [reports-financial.service.ts:356-369](server/src/reports/reports-financial.service.ts#L356) · [reports-financial.service.ts:400-409](server/src/reports/reports-financial.service.ts#L400) · [reports-excel.sheets.ts:109-113](server/src/reports/reports-excel.sheets.ts#L109)

### P39 — [HIGH] Trend/Yillar kesimi: `salaryAgg`, `newStudents` va `payerCount` ga filtr qo'llanmaydi → Chiqim/Foyda/LTV/CAC soxta
`chiqimTotal` ga kompaniya oyligi qo'shiladi; `ltv`/`cac` maxrajlari kompaniya bo'yicha.
**Dalil:** [reports-financial.service.ts:805-825](server/src/reports/reports-financial.service.ts#L805) · [reports-financial.service.ts:860-873](server/src/reports/reports-financial.service.ts#L860) · [reports-financial.service.ts:947-957](server/src/reports/reports-financial.service.ts#L947)

### P40 — [HIGH] Excel: BD ning `branchIds` scope'i faqat bir necha varaqqa yetadi
`scope` faqat P&L, line-item'lar, Balans va Qarzdorlarga uzatiladi; `getFinancialOverview`, `getFinancialTrend`, `getReconciliation`, `getPriorPeriodSummary`, `getPeriodOutflows`, `getRecognizedRevenue` va butun operatsion blok faqat `branchId` ni biladi. Muqovada esa filial nomi turadi → yarmi filial, yarmi kompaniya.
**Dalil:** [reports-excel.service.ts:97-102](server/src/reports/reports-excel.service.ts#L97) · [reports-excel.service.ts:145-184](server/src/reports/reports-excel.service.ts#L145) · [reports.controller.ts:320-338](server/src/reports/reports.controller.ts#L320)

### P41 — [HIGH] Balans: `branchId = null` («markaz») kassalar filial filtrida butunlay tushib qoladi *(rejada bor)*
`branchWhere` hech qachon `IS NULL` ni qamramaydi, pul esa aynan o'sha kassaga tushadi (P20). Aktiv kamayadi → «Aktiv − (Passiv + Kapital)» farqi Tekshiruvda sababsiz katta chiqadi.
**Dalil:** [reports-balance-sheet.service.ts:49-52](server/src/reports/reports-balance-sheet.service.ts#L49) · [period-helpers.ts:46-55](server/src/common/finance/period-helpers.ts#L46)

### P42 — [HIGH] Xarajatlar ro'yxati/kartalari/PDF filial filtrini butunlay e'tiborsiz qoldiradi — PDF sarlavhasida esa filial nomi turadi
`buildWhere()` da `branchId` yo'q, garchi DTO qabul qilsa va klient yuborsa ham. PDF `query.branchId` bo'yicha filial nomini alohida o'qib sarlavhaga yozadi → hujjat noto'g'ri ma'lumot beradi.
**Dalil:** [expenses.service.ts:129-155](server/src/expenses/expenses.service.ts#L129) · [expenses.service.ts:174](server/src/expenses/expenses.service.ts#L174) · [expenses.service.ts:297-332](server/src/expenses/expenses.service.ts#L297) · [expenses-client.tsx:126](client/src/components/payments/expenses-client.tsx#L126)

### P43 — [MEDIUM] «Filial kesimida» varag'i: `branchId = null` qatorlar hech qayerga tushmaydi, «Jami» mos kelmaydi va ustoz oyligi umuman yo'q
`groupBy` natijasi faqat mavjud `Branch.id` larga map qilinadi; varaq faqat kompaniya ko'rinishida chiqadi; kod izohida foyda «salary-EXCLUDED» ekani ochiq yozilgan — ya'ni ikkita filialni yonma-yon solishtiradigan yagona varaqda eng katta xarajat moddasi yo'q.
**Dalil:** [reports-payments.service.ts:69-75](server/src/reports/reports-payments.service.ts#L69) · [reports-payments.service.ts:129-148](server/src/reports/reports-payments.service.ts#L129) · [reports-excel.detail-sheets.ts:565-578](server/src/reports/reports-excel.detail-sheets.ts#L565)

### P44 — [MEDIUM] «Tekshiruv» varag'i filial nomuvofiqligini printsipial ravishda ushlay olmaydi
Tie qatorlarining ikkala tomoni bir manbadan (`Payment`) yoki `getReconciliation` dan (u `branchId` ni umuman qabul qilmaydi).
**Dalil:** [reports-excel.detail-sheets.ts:617-624](server/src/reports/reports-excel.detail-sheets.ts#L617) · [reports-financial.service.ts:1427-1448](server/src/reports/reports-financial.service.ts#L1427)
**Yechim:** «Asosiy xulosa tushumi = To'lovlar jami», «Σ(filiallar) + markaz = jami», «Oyliklar varag'i scope = hisobot scope» qatorlari.

### P45 — [MEDIUM] «Qaytarishlar» summasi/soni filial filtriga bo'ysunmaydi; «Filiallar kesimi» paneli tanlangan filialni e'tiborsiz qoldiradi
`refund.aggregate` va `refund.count` da `branchFilter` yo'q (ildiz sabab: `Refund.branchId` ustuni yo'q — P11). `computeBranchBreakdown` esa `branchFilter` ni umuman olmaydi → Farg'ona tanlansa ham Namangan tushumi ko'rinadi.
**Dalil:** [reports-payments.service.ts:402-409](server/src/reports/reports-payments.service.ts#L402) · [reports-payments.service.ts:214-221](server/src/reports/reports-payments.service.ts#L214) · [reports-payments.service.ts:429-459](server/src/reports/reports-payments.service.ts#L429)

### P46 — [MEDIUM] `income-month-attribution`: FIFO qarz navbati butun ledger bo'yicha, tally esa filial bo'yicha
Kod izohi cheklovni tan oladi. Ikki filialli o'quvchi paydo bo'lishi bilan drill-down kartaga teng bo'lmaydi.
**Dalil:** [reports-financial.service.ts:559-565](server/src/reports/reports-financial.service.ts#L559) · [reports-financial.service.ts:624-640](server/src/reports/reports-financial.service.ts#L624) · [reports-financial.service.ts:686-696](server/src/reports/reports-financial.service.ts#L686)

### P47 — [MEDIUM] Oylik qarzdorlik / undirish (`/payments/debt-history`) butunlay kompaniya bo'yicha
Endpointlar `branchId` ni umuman qabul qilmaydi, detail esa ism/familiya/telefon qaytaradi → BD boshqa filial qarzdorlarini to'liq ko'radi. Kodda va Excel izohida bu **ataylab** yozilgan, ekranda esa izoh yo'q.
**Dalil:** [reports.controller.ts:246-288](server/src/reports/reports.controller.ts#L246) · [reports-financial.service.ts:1299-1311](server/src/reports/reports-financial.service.ts#L1299) · [debt-history-view.tsx:77-84](client/src/components/payments/debt-history-view.tsx#L77)

### P48 — [MEDIUM] Ketganlar hisoboti: filial FILTRI `StudentBranch`, filial DIAGRAMMASI oxirgi guruh filiali bo'yicha
Guruhi bo'lmagan ketganlar diagrammadan jimgina tushadi → jamlar KPI ga teng emas.
**Dalil:** [departed-students-dataset.ts:65-67](server/src/reports/shared/departed-students-dataset.ts#L65) · [departed-students-dataset.ts:133-135](server/src/reports/shared/departed-students-dataset.ts#L133) · [reports-departed-lists.service.ts:294-296](server/src/reports/reports-departed-lists.service.ts#L294)

### P49 — [MEDIUM] Ustoz to'lovlari hisobotida o'quvchining BUTUN qarzi har bir guruhga to'liq yoziladi
Taqsimlash yo'q; guruhlar har xil filialda bo'lsa qarz ikkala filialda to'liq ko'rinadi. `groupTeacher` so'rovida `companyId` ham yo'q.
**Dalil:** [reports-teacher-payments.service.ts:112-120](server/src/reports/reports-teacher-payments.service.ts#L112) · [reports-teacher-payments.service.ts:270-278](server/src/reports/reports-teacher-payments.service.ts#L270) · [reports-teacher-payments.service.ts:172-176](server/src/reports/reports-teacher-payments.service.ts#L172)

### P50 — [LOW] Kichik hisobot nuqsonlari
- Xonalar bandligi: `branchId` berilganda `companyId` sharti tushib qoladi (mudofaa qatlami) — [reports-overview.service.ts:150-154](server/src/reports/reports-overview.service.ts#L150)
- «Pul oqimi» muqova mundarijasida bor, varaq ham, endpoint ham yo'q — [reports-excel.sheets.ts:66](server/src/reports/reports-excel.sheets.ts#L66)
- Markaz faoliyati: ikki filial guruhida o'qiyotgan o'quvchi ikkala filialda sanaladi (ta'rif masalasi) — [reports-center-activity.service.ts:229-233](server/src/reports/reports-center-activity.service.ts#L229)
- Xonalar bandligi: boshqa filial xonasidagi guruh jimgina tashlanadi (P1 ning hosilasi) — [reports-center-activity.service.ts:200-221](server/src/reports/reports-center-activity.service.ts#L200)
- Ustozning «O'quvchilar soni» filialsiz sanaladi, ro'yxat esa filialga kesilgan — [teachers.service.ts:126-139](server/src/teachers/teachers.service.ts#L126), [teachers.service.ts:183-196](server/src/teachers/teachers.service.ts#L183)

---

## 6. Auth / RBAC

### P51 — [BLOKER] IDOR: bir filial direktori ikkinchi filialni tahrirlashi va YOPISHI mumkin
`PATCH /branches/:id/status` `@Roles('CEO','Branch Director')`, servis esa faqat `companyId` ni tekshiradi. CLOSED/ARCHIVED kaskadi: shu filialning barcha guruhlari → CANCELLED, ACTIVE enrollmentlar → DROPPED, xonalar → ARCHIVED. Bitta so'rov bilan 2-filial butunlay to'xtaydi.
**Dalil:** [branches.controller.ts:63-73](server/src/branches/branches.controller.ts#L63) · [branches.service.ts:152-165](server/src/branches/branches.service.ts#L152) · [status-cascade.service.ts:213-283](server/src/common/status/status-cascade.service.ts#L213)

### P52 — [BLOKER] IDOR: id bo'yicha yozish amallarida filial umuman tekshirilmaydi
Guruh, xodim, kurs, xona, xarajat — hammasi faqat `{ id, deletedAt: null, companyId }`. `PATCH /users/:id` shu yo'lda parolni ham qayta yozadi (bir filial admini boshqa filial xodimining parolini almashtira oladi); `DELETE /expenses/:id` mavjud ledger yozuvini reversal qiladi.
**Dalil:** [users.service.ts:421-431](server/src/users/users.service.ts#L421) · [users.service.ts:463-465](server/src/users/users.service.ts#L463) · [groups-write.service.ts:203-206](server/src/groups/groups-write.service.ts#L203) · [rooms.service.ts:211-222](server/src/rooms/rooms.service.ts#L211) · [courses.service.ts:116-127](server/src/courses/courses.service.ts#L116) · [expenses.service.ts:349-358](server/src/expenses/expenses.service.ts#L349)

### P53 — [HIGH] Filial scope'ining uchta zid manbai + JWT'da filial da'vosi yo'q
JWT payload'ida filial yo'q, «joriy filial» klient qo'lida (`localStorage`), server tomonida esa `branch_id` **kengaytiruvchi** query parametri (berilmasa filtr yo'q, allowlist emas). Kod bazasida `UserBranch` scope uchun atigi 3 joyda, `mainBranch` 7 joyda o'qiladi; qolgan hamma modul ikkalasini ham o'qimaydi.
**Dalil:** [jwt.strategy.ts:6-30](server/src/auth/strategies/jwt.strategy.ts#L6) · [auth.service.ts:125](server/src/auth/auth.service.ts#L125) · [use-branch-switcher.ts:31-34](client/src/hooks/use-branch-switcher.ts#L31) · [groups-read.service.ts:26-28](server/src/groups/groups-read.service.ts#L26) · [students-read.service.ts:74-76](server/src/students/students-read.service.ts#L74) · [search.service.ts:133-142](server/src/search/search.service.ts#L133) · [reports.controller.ts:379-389](server/src/reports/reports.controller.ts#L379)
**Yechim:** JWT'ga `branchIds` + `mainBranch`; bitta `BranchScopeGuard`/`resolveBranchScope(user, requestedBranchId)`; `branch_id` faqat torroq filtr bo'lsin.

### P54 — [HIGH] Attendance yozish/o'qishda filial tekshiruvi yo'q — Administrator/BD/CEO cheklanmaydi
`verifyTeacherAccess` faqat sof `Teacher` uchun ishlaydi. Namangan administratori Farg'ona guruhiga davomat saqlab, o'quvchilar balansidan pul yechdirishi va Farg'ona ustoziga accrual yozdirishi mumkin. (`Cashier` bu endpointlarga kira olmaydi.) Butun `server/src` da `@CurrentUser('branches')` **0 marta** ishlatilgan.
**Dalil:** [attendance.controller.ts:35-52](server/src/attendance/attendance.controller.ts#L35) · [attendance-validation.service.ts:47-63](server/src/attendance/attendance-validation.service.ts#L47) · [attendance-save.service.ts:183-194](server/src/attendance/attendance-save.service.ts#L183)

### P55 — [HIGH] `GET /api/students` rol qorovulisiz — istalgan token (Student portali tokeni ham) to'liq PII bazasini oladi
`studentSelect` phone, parentPhone, address, passportSeries, balance qaytaradi. Taqqoslash: `GET /students/:id` da `@Roles` bor. Bu bugun ham kuchda; ikkinchi filial faqat sizadigan yozuvlar sonini oshiradi.
**Dalil:** [students.controller.ts:40-52](server/src/students/students.controller.ts#L40) · [student-select.ts:5-31](server/src/students/shared/student-select.ts#L5) · [app.module.ts:112-118](server/src/app.module.ts#L112)

### P56 — [HIGH] Rolsiz ochiq endpointlar: `/branches`, `/rooms`, `/courses`, `/dashboard/today-schedule`
Hech birida `@Roles` yo'q; `GET /branches` da UserBranch scope'i ham yo'q. Ya'ni Student tokeni ham 2-filial jadvali, xonalari va kurs narxlarini o'qiy oladi. **Nuans:** header switcher non-CEO uchun `user.branches` dan quriladi, ya'ni oqish `/reports/*` filter-bar'lari va boshqa store o'qiydigan joylar orqali chiqadi.
**Dalil:** [branches.controller.ts:24-38](server/src/branches/branches.controller.ts#L24) · [rooms.controller.ts:24-38](server/src/rooms/rooms.controller.ts#L24) · [courses.controller.ts:24-37](server/src/courses/courses.controller.ts#L24) · [dashboard.controller.ts:10-21](server/src/dashboard/dashboard.controller.ts#L10) · [branch-switcher.tsx:27-52](client/src/components/branch-switcher.tsx#L27)

### P57 — [HIGH] Hisobot endpointlarining ~25 tasi BD/Administrator scope'ini umuman qo'llamaydi
`resolveBranchScopeForUser` helper mavjud, lekin butun `ReportsController` da faqat 2 joyda chaqiriladi (`debt-write-offs-summary`, `financial-excel`). Qolganlari `query.branchId` ni so'zsiz qabul qiladi; berilmasa kompaniya bo'yicha. Xuddi shu naqsh `transactions`, `payments`, `refunds`, `withdrawals` read yo'llarida ham.
**Dalil:** [reports.controller.ts:301](server/src/reports/reports.controller.ts#L301) · [reports.controller.ts:320](server/src/reports/reports.controller.ts#L320) · [reports.controller.ts:391-404](server/src/reports/reports.controller.ts#L391) · [payments-read.service.ts:14-29](server/src/payments/payments-read.service.ts#L14) · [transactions-read.service.ts:628-644](server/src/transactions/transactions-read.service.ts#L628) · [refunds-eligibility.service.ts:222-246](server/src/refunds/refunds-eligibility.service.ts#L222) · [withdrawals.controller.ts:15-36](server/src/withdrawals/withdrawals.controller.ts#L15)

### P58 — [HIGH] Operatsion o'qish yo'llarida (students/groups/teachers/rooms/courses/dashboard) server tomonida filial cheklovi yo'q
Namangan BD/Administratori `?branch_id=1` yuborib Farg'ona ma'lumotini to'liq oladi.
**Dalil:** [students-read.service.ts:26-30](server/src/students/students-read.service.ts#L26) · [groups-read.service.ts:21-28](server/src/groups/groups-read.service.ts#L21) · [teachers.service.ts:99-101](server/src/teachers/teachers.service.ts#L99) · [dashboard.service.ts:26](server/src/dashboard/dashboard.service.ts#L26)

### P59 — [HIGH] `Administrator` roli hech qayerda filialga bog'lanmagan — scope helperlarida ataylab CEO bilan bir qatorda
`scoped = !CEO && !Administrator` naqshi oylik, kassa, qarzdorlar, outreach, call-logs da takrorlanadi. Bu **ataylab** yozilgan, lekin CLAUDE.md dagi «Branch Director scope» qoidasi bilan ziddiyatda.
**Dalil:** [resolve-monthly-scope.ts:94-97](server/src/salary/shared/resolve-monthly-scope.ts#L94) · [salary-overview.service.ts:46-49](server/src/salary/salary-overview.service.ts#L46) · [cash-accounts.service.ts:44-48](server/src/cash-accounts/cash-accounts.service.ts#L44) · [outreach.service.ts:30-32](server/src/outreach/outreach.service.ts#L30) · [call-logs.service.ts:175-178](server/src/call-logs/call-logs.service.ts#L175)
**CEO qarori kerak.**

### P60 — [HIGH] `TeachersService` filial qoidalarini butunlay chetlab o'tadi
`create` da `branchId` ixtiyoriy va tekshirilmaydi (`assertRoleAndBranchRules` chaqirilmaydi, boshqa kompaniya filiali ham qabul qilinadi); `UpdateTeacherDto` da `branchId` umuman yo'q → filialni keyin tuzatib bo'lmaydi. Ish-yo'li: Sozlamalar → Xodimlar formasi (`branchIds` + `mainBranch`).
**Dalil:** [create-teacher.dto.ts:37-40](server/src/teachers/dto/create-teacher.dto.ts#L37) · [teachers.service.ts:230-233](server/src/teachers/teachers.service.ts#L230) · [update-teacher.dto.ts](server/src/teachers/dto/update-teacher.dto.ts) · [users.service.ts:105-115](server/src/users/users.service.ts#L105)

### P61 — [MEDIUM] Boshqa RBAC bo'shliqlari
- `payments/transactions/entity-history/comments` — id bo'yicha kompaniya darajasida ochiq — [transactions.controller.ts:27-77](server/src/transactions/transactions.controller.ts#L27), [entity-history.controller.ts:7-29](server/src/common/entity-history/entity-history.controller.ts#L7)
- `User.mainBranch` FK'siz `Int?`; `updateUser` da `mainBranch` shartsiz yoziladi — [schema.prisma:289](server/prisma/schema.prisma#L289), [users.service.ts:456](server/src/users/users.service.ts#L456)
- Redis orqali sessiyani bekor qilish o'lik kod: guard `request.user?.sub` o'qiydi, strategiya `sub` qaytarmaydi → bloklangan xodim tokeni ishlashda davom etadi — [jwt-auth.guard.ts:33-43](server/src/common/guards/jwt-auth.guard.ts#L33)
- `POST /branches` BD ga ham ochiq, id `findFirst orderBy id desc` bilan (companyId'siz, tranzaksiyadan tashqarida) — [branches.service.ts:95-110](server/src/branches/branches.service.ts#L95)
- Nolta `UserBranch`/`mainBranch` foydalanuvchisida xulq uch xil: fail-open (oylik), fail-closed (outreach/kassa/qarzdorlar), scope'siz (qolganlar) — [outreach.service.ts:36-40](server/src/outreach/outreach.service.ts#L36)

---

## 7. UI / klient

### P62 — [HIGH] Dialoglar filialni **kontekstdan emas, header'dan** oladi
| Dialog | Muammo | Dalil |
|---|---|---|
| Guruhga qo'shish | guruhlar o'quvchi filiali emas, header filiali bo'yicha | [enroll-to-group-dialog.tsx:109-127](client/src/components/students/enroll-to-group-dialog.tsx#L109) |
| To'lov yozish | davomat/qarzdorlar kontekstidagi ma'lum filial e'tiborsiz, doim `selectedBranch` | [record-payment-dialog.tsx:254-262](client/src/components/payments/record-payment-dialog.tsx#L254), [attendance-debtors-section.tsx:151-168](client/src/components/groups/attendance/attendance-debtors-section.tsx#L151) |
| O'rinbosar ustoz | `/users?user_type=Teacher` filialsiz, queryKey ham filialsiz; oylik boshqa filial ustoziga ko'chadi | [lesson-changes-tab.tsx:518-527](client/src/components/groups/lesson-changes-tab.tsx#L518) |
| Avans | barcha filial xodimlari, xarajat header filialiga | [salary-add-advance-dialog.tsx:69-105](client/src/components/payments/salary-add-advance-dialog.tsx#L69) |
| Vazifa mas'uli | ikkala filial BD/Administratorlari | [comment-form.tsx:72-89](client/src/components/shared/comment-form.tsx#L72) |
| Mock konvertatsiya | default `branches[0]` = doim Farg'ona | [convert-participant-dialog.tsx:55-60](client/src/components/mock-exams/convert-participant-dialog.tsx#L55) |

### P63 — [MEDIUM] Filial almashtirgichida «Barcha filiallar» varianti yo'q; default `data[0]` (doim Farg'ona) *(rejada bor)*
`mainBranch` klientda filial tanlash uchun hech qayerda ishlatilmaydi; sessiya ichida eski tanlov yangi `user.branches` ga solishtirilmaydi; `api.ts` refresh-fail yo'lida `localStorage.branchId` tozalanmaydi.
**Dalil:** [use-branch-switcher.ts:42-49](client/src/hooks/use-branch-switcher.ts#L42) · [branch-switcher.tsx:41-52](client/src/components/branch-switcher.tsx#L41) · [branches.service.ts:37](server/src/branches/branches.service.ts#L37) · [api.ts:100-107](client/src/lib/api.ts#L100)
**CEO qarori kerak** (rejadagi 4-savol).

### P64 — [MEDIUM] Moliya sahifalari va o'quvchilar ro'yxati filial hidratsiyasidan oldin filialsiz so'rov yuboradi *(rejada bor)*
`enabled` qorovuli yo'q (dashboard/guruhlar/ustozlarda bor) → bir lahza «barcha filiallar» raqami ko'rinadi.
**Dalil:** [payments-overview.tsx:133-142](client/src/components/payments/payments-overview.tsx#L133) · [debtors-client.tsx:108-143](client/src/components/payments/debtors-client.tsx#L108) · [students-client.tsx:85-109](client/src/components/students/students-client.tsx#L85) · namuna: [groups-client.tsx:115-118](client/src/components/groups/groups-client.tsx#L115)

### P65 — [MEDIUM] Excel yuklab olish popover'i o'z filial state'ini «all» bilan boshlaydi — ekrandagi filtrdan mustaqil
Namangan tanlangan holda bosilsa kompaniya fayli tushadi va muqovada «Barcha filiallar» yoziladi.
**Dalil:** [export-options-popover.tsx:54-57](client/src/components/payments/export-options-popover.tsx#L54) · [export-options-popover.tsx:86](client/src/components/payments/export-options-popover.tsx#L86)

### P66 — [MEDIUM] Hisobot filtr-panellarida default «Barcha filiallar», filtr-optionlar esa kompaniya bo'yicha va filialsiz kalit ostida keshlanadi
Ustozlar/kurslar klientda ham filtrlanmaydi → boshqa filial ustozi tanlanib bo'sh hisobot chiqadi.
**Dalil:** [attendance-filter-bar.tsx:77-110](client/src/components/reports/attendance/attendance-filter-bar.tsx#L77) · [reports-student-payments.service.ts:260-276](server/src/reports/reports-student-payments.service.ts#L260) · [student-payments-filter-bar.tsx:69-77](client/src/components/reports/student-payments/student-payments-filter-bar.tsx#L69)

### P67 — [MEDIUM] Filial tanlovi URLda yo'q — ulashilgan havola qabul qiluvchining o'z filialida ochiladi
`client/CLAUDE.md:263` «har bir filtr URLda saqlanishi shart» talabiga zid.
**Dalil:** [use-branch-switcher.ts:32-34](client/src/hooks/use-branch-switcher.ts#L32) · [branch-switcher.tsx:78-84](client/src/components/branch-switcher.tsx#L78)

### P68 — [MEDIUM] `/outreach` da filial filtri ham, «Filial» ustuni ham yo'q
Javobda `branch` maydoni bor, UI da hech qayerda ko'rsatilmaydi; endpointlar `branchId` parametrini umuman qabul qilmaydi.
**Dalil:** [today-absentees-tab.tsx:55-65](client/src/components/outreach/today-absentees-tab.tsx#L55) · [outreach-types.ts:17](client/src/components/outreach/outreach-types.ts#L17) · [outreach.controller.ts:14-56](server/src/outreach/outreach.controller.ts#L14)

### P69 — [MEDIUM] O'quvchi profilida va ro'yxatida filial hech qayerda ko'rsatilmaydi (ustoz profilida ko'rsatiladi)
Xatoni sezish imkoniyati yo'q — P62 dagi dialoglar bilan birga xavfli.
**Dalil:** [student-profile-card.tsx](client/src/components/students/student-profile-card.tsx) (`branch` bo'yicha 0 moslik) · taqqoslash: [teacher-profile-card.tsx:115-124](client/src/components/teachers/teacher-profile-card.tsx#L115)

### P70 — [LOW] Filial yorlig'i yo'q boshqa joylar
- Global qidiruv natijalarida filial ko'rsatilmaydi (CEO ikkala filial natijasini oladi — bu ataylab) — [search-content.service.ts:19-35](server/src/search/search-content.service.ts#L19)
- «Havola olish»/QR tugmalari qaysi filial havolasi ekanini aytmaydi — [students-client.tsx:72-83](client/src/components/students/students-client.tsx#L72), [teachers-client.tsx:158-172](client/src/components/teachers/teachers-client.tsx#L158)
- Refund kvitansiyasida `branchName: null` (to'lov kvitansiyasida filial BOR) — [receipts.service.ts:97](server/src/receipts/receipts.service.ts#L97)
- Kvitansiyada boshqa filial guruhi/ustozi chiqishi mumkin (enrollment `orderBy createdAt desc`, filialsiz) — [receipts.service.ts:141-165](server/src/receipts/receipts.service.ts#L141)
- «Filiallar» sozlamasi BD ga ochiq, «O'chirish» menyu elementi `onClick`siz — [settings-nav.ts:48](client/src/lib/settings-nav.ts#L48), [branch-row-actions.tsx:42-45](client/src/components/settings/branch-row-actions.tsx#L42)

---

## 8. Telegram

### P71 — [BLOKER] Telegram guruhini tasdiqlashda filial tanlanmaydi — hamma guruh «kompaniya bo'yicha» qoladi
Klient `approve` ga bo'sh tana yuboradi (backend DTO `branchId` ni qo'llab-quvvatlaydi). Broadcast `OR: [{ branchId }, { branchId: null }]` bilan ishlagani uchun **null guruh HAR QANDAY filial hodisasini oladi**. PRODda 3 ta APPROVED guruhning hammasi `branchId = null`.
**Dalil:** [telegram-groups-client.tsx:76-78](client/src/components/settings/telegram-groups-client.tsx#L76) · [telegram-groups.service.ts:129-137](server/src/telegram-groups/telegram-groups.service.ts#L129) · [telegram-group-broadcast.service.ts:52-60](server/src/telegram-groups/telegram-group-broadcast.service.ts#L52) · [approve-group.dto.ts:3-8](server/src/telegram-groups/dto/approve-group.dto.ts#L3)
**Interim yo'l:** [approve-tg-group.ts](server/scripts/approve-tg-group.ts) CLI `branchId` ni qabul qiladi — mavjud guruhlarga `branchId=1` bugunoq qo'yish mumkin.

### P72 — [HIGH] Hisobot menyusi (`rm:*`) guruh `branchId` sini o'qiydi, lekin Excel/moliyaviy kartani doim kompaniya bo'yicha beradi
`branchLabel: 'Barcha filiallar'` qotirilgan, `getFinancialOverview(companyId, {})` bo'sh query bilan, `performedById` = kompaniya CEO'si. Guruh chat'i o'zi ACL bo'lgani uchun 2-filial guruhi a'zosi 1-filialning to'liq moliyaviy kitobini yuklab oladi.
**Dalil:** [telegram-group-report-menu.service.ts:439-464](server/src/telegram-groups/telegram-group-report-menu.service.ts#L439) · [telegram-group-report-menu.service.ts:343-356](server/src/telegram-groups/telegram-group-report-menu.service.ts#L343) · [telegram-group-report-menu.service.ts:273-276](server/src/telegram-groups/telegram-group-report-menu.service.ts#L273)

### P73 — [HIGH] 21:00 kunlik hisobot filialni umuman ishlatmaydi va kesh `companyId` bo'yicha *(rejada bor)*
`build(companyId)` yagona parametr; `builtByCompany` keshi bir xil matnni har bir tasdiqlangan guruhga yuboradi; `DailyFinancialSnapshot` da `branchId` yo'q. **Asimmetriya:** 3 soatlik digest cron `branchId: true` ni tanlaydi va `filterForGroup` bilan filtrlaydi — ya'ni bitta guruh kun davomida filial bo'yicha, kechqurun kompaniya bo'yicha ma'lumot oladi. Lidlar esa umuman global sanaladi.
**Dalil:** [telegram-group-daily-cron.service.ts:62-99](server/src/telegram-groups/telegram-group-daily-cron.service.ts#L62) · [telegram-group-daily-report.service.ts:104](server/src/telegram-groups/telegram-group-daily-report.service.ts#L104) · [telegram-group-daily-report.service.ts:165-172](server/src/telegram-groups/telegram-group-daily-report.service.ts#L165) · [schema.prisma:2643-2656](server/prisma/schema.prisma#L2643) · [telegram-group-digest-cron.service.ts:121-131](server/src/telegram-groups/telegram-group-digest-cron.service.ts#L121)

### P74 — [HIGH] Admin bot buyruqlari (`/qarzdorlar`, `/tolovlar`, `/hisobot`, `/oquvchilar`) filialni butunlay e'tiborsiz qoldiradi
Builder tipi `(companyId) => Promise<string>`; servis izohi «optionally branchId — currently unused in the MVP» deydi. `/qarzdorlar` javobida top-5 qarzdorning ism-familiyasi + #ID chiqadi → filial guruhida boshqa filial o'quvchilarining PII si sizadi.
**Dalil:** [telegram-admin-bot-registrar.ts:130](server/src/telegram-groups/telegram-admin-bot-registrar.ts#L130) · [telegram-admin-bot-registrar.ts:146](server/src/telegram-groups/telegram-admin-bot-registrar.ts#L146) · [telegram-group-stats.service.ts:18-19](server/src/telegram-groups/telegram-group-stats.service.ts#L18) · [telegram-group-stats.service.ts:174-212](server/src/telegram-groups/telegram-group-stats.service.ts#L174)

### P75 — [MEDIUM] Broadcast filialni `student.branches[0]` dan (orderBy'siz `take: 1`) oladi, `Payment.branchId` ni e'tiborsiz qoldiradi
Digest esa filial bo'yicha qattiq filtrlaydi → noto'g'ri filial = xabar umuman ko'rinmaydi.
**Dalil:** [telegram-group-broadcast.listener.ts:145-176](server/src/telegram-groups/telegram-group-broadcast.listener.ts#L145) · [telegram-group-broadcast.listener.ts:390-396](server/src/telegram-groups/telegram-group-broadcast.listener.ts#L390) · [payments-write.service.ts:670-696](server/src/payments/payments-write.service.ts#L670)

### P76 — [MEDIUM] `student_<branchId>` / `teacher_<branchId>` deep-link'lari imzosiz va filialni `deletedAt`/`status`siz qidiradi
`employee_` havolasi HMAC bilan imzolangan — standart mavjud, bu ikkisiga qo'llanmagan. Imtiyoz oshishi yo'q, lekin havoladagi raqamni o'zgartirish yoki arxivlangan filialga eski QR ishlashda davom etadi. Havola YARATISHDA esa `deletedAt: null` tekshiriladi (nomuvofiqlik).
**Dalil:** [telegram.service.ts:291-308](server/src/telegram/telegram.service.ts#L291) · [telegram.service.ts:452-476](server/src/telegram/telegram.service.ts#L452) · [telegram.service.ts:318-337](server/src/telegram/telegram.service.ts#L318) · [telegram.service.ts:1151-1157](server/src/telegram/telegram.service.ts#L1151)

### P77 — [MEDIUM] `approve` kelgan `branchId` ni validatsiyasiz yozadi; `select_group_` callback'i filialni qayta tekshirmaydi
Guruhlar ro'yxati filial bo'yicha filtrlanadi, callback esa guruhni `{ id, deletedAt: null }` bilan qayta oladi.
**Dalil:** [telegram-groups.service.ts:106-134](server/src/telegram-groups/telegram-groups.service.ts#L106) · [student-registration.scene.ts:203-217](server/src/telegram/scenes/student-registration.scene.ts#L203) · [student-registration-flow.ts:71-104](server/src/telegram/scenes/student-registration-flow.ts#L71)

### P78 — [MEDIUM] Digest buferi faqat `companyId` bo'yicha — mos guruh bo'lmasa hodisalar drain paytida jimgina yo'qoladi
`LRANGE + DEL` bitta MULTI da; keyin per-guruh filtr, mos kelmasa `continue` (log ham yo'q).
**Dalil:** [telegram-group-digest-buffer.service.ts:58-92](server/src/telegram-groups/telegram-group-digest-buffer.service.ts#L58) · [telegram-group-digest-cron.service.ts:93-104](server/src/telegram-groups/telegram-group-digest-cron.service.ts#L93)

### P79 — [MEDIUM] Bot orqali ro'yxatdan o'tgan o'quvchi `student.created` hodisasini chiqarmaydi
`TelegramModule` da `EventEmitter` umuman yo'q → digestning filial bo'yicha «Yangi o'quvchilar» bloki bo'sh qoladi. Namangan onboarding'i asosan havola orqali ketadi.
**Dalil:** [student-registration-flow.ts:67-140](server/src/telegram/scenes/student-registration-flow.ts#L67) · [telegram.module.ts:13-27](server/src/telegram/telegram.module.ts#L13) · [students-write.service.ts:158-168](server/src/students/students-write.service.ts#L158)

### P80 — [MEDIUM] Kanal gate, xabar matnlari va SMS jurnalida filial o'lchovi yo'q
- Gate bitta global `TELEGRAM_REQUIRED_CHANNEL` env; `TelegramChannelGateEvent` da `branchId` yo'q, `DEFAULT_COMPANY_ID` qotirilgan — [telegram.service.ts:112-118](server/src/telegram/telegram.service.ts#L112), [telegram-channel-gate-stats.service.ts:41-60](server/src/telegram/telegram-channel-gate-stats.service.ts#L41)
- Qarz/to'lov/mock xabarlarida filial nomi, manzili, telefoni yo'q (`Branch.address`/`phone` bazada bor) — [student-debt-notification.listener.ts:85-125](server/src/billing/student-debt-notification.listener.ts#L85), [schema.prisma:410-411](server/prisma/schema.prisma#L410)
- `SmsMessage` da `branchId` yo'q → Eskiz xarajatini filialga taqsimlab bo'lmaydi — [schema.prisma:1577-1592](server/prisma/schema.prisma#L1577)
- E'lon (announce) barcha tasdiqlangan guruhlarga, hatto boshqa kompaniyalarga (ataylab) — [telegram-group-announcement.service.ts:47-56](server/src/telegram-groups/telegram-group-announcement.service.ts#L47)
- Digest to'lovlar bloki filial bo'yicha ajratilmagan (`payment` entry'da `branchName` yo'q) — [telegram-group-digest.service.ts:90-102](server/src/telegram-groups/telegram-group-digest.service.ts#L90)
**CEO qarori kerak** (har filialga alohida kanal/Eskiz nik kerakmi).

---

## 9. Cron va rejali ishlar

### P81 — [MEDIUM] Guruh statusi cron'i INACTIVE filialdagi FORMING guruhlarni avtomatik ACTIVE qiladi
`activateGroups` where'ida filial statusi ham, `companyId` ham yo'q; Branch INACTIVE kaskadi faqat ACTIVE guruhlarni PAUSED qiladi, FORMING larga tegmaydi. CEO Namanganni to'xtatsa, ertasi 00:05 da guruhlar ochilib billing zanjiri ishlay boshlaydi.
**Dalil:** [group-status-cron.service.ts:56-63](server/src/groups/group-status-cron.service.ts#L56) · [status-cascade.service.ts:284-296](server/src/common/status/status-cascade.service.ts#L284)

### P82 — [MEDIUM] Davomat eskalatsiyasi: filialda Administrator bo'lmasa admin ogohlantirishi jimgina tushib qoladi
`admins.length === 0` → log'siz `return`. Ustoz xabarnomalari baribir yuboriladi. PRODda filial #2 da Administrator (#10768) allaqachon bor, ya'ni hozircha faol emas.
**Dalil:** [attendance-reminder.service.ts:361-381](server/src/attendance/attendance-reminder.service.ts#L361)

### P83 — [MEDIUM] To'lov va'dasi cron'i filialni qayta hisoblamaydi (P17 ning cron tarmog'i)
**Dalil:** [payment-promise-cron.service.ts:41-72](server/src/payment-promises/payment-promise-cron.service.ts#L41)

### P84 — [LOW] Davomat eslatma oynasi qotirilgan (07:00–22:30, Du–Sha) va `getScheduleWindow` keshi barcha filiallar bo'yicha global
`Branch.startOfWorkingDay/endOfWorkingDay` mavjud, lekin birorta cron o'qimaydi. Filialga xos emas, lekin global 1 soatlik kesh Namangan birinchi guruhi uchun eslatmani o'tkazib yuborishi mumkin.
**Dalil:** [attendance-reminder.service.ts:82](server/src/attendance/attendance-reminder.service.ts#L82) · [attendance-reminder.service.ts:190-230](server/src/attendance/attendance-reminder.service.ts#L190)

### P85 — [LOW] Mock deadline cron `companyId = 1001` ni qotirib audit qatorini yozadi
**Dalil:** [mock-exam-deadline-cron.service.ts:6-11](server/src/mock-exams/mock-exam-deadline-cron.service.ts#L6) · [mock-exam-deadline-cron.service.ts:75](server/src/mock-exams/mock-exam-deadline-cron.service.ts#L75)

---

## 10. Lidlar, mock imtihonlar, tashqi kanallar

### P86 — [HIGH] Lid modeli butunlay filialsiz VA kompaniyasiz *(rejada Faza 5)*
`Lead`, `LeadColumn`, `LeadSection`, `LeadSource` — to'rttasida ham `branchId` ham, `companyId` ham yo'q. `getBoard()` `where: { deletedAt: null }` — 2-filial direktori 1-filial lidlarini ko'radi, ko'chiradi, o'chiradi. `CustomForm.slug` global unique.
**Dalil:** [schema.prisma:586-704](server/prisma/schema.prisma#L586) · [leads-board.service.ts:16-31](server/src/leads/leads-board.service.ts#L16) · [leads.service.ts:78-115](server/src/leads/leads.service.ts#L78) · [schema.prisma:709-730](server/prisma/schema.prisma#L709)
**CEO qarori kerak** (filial bo'yicha bo'linsinmi).

### P87 — [HIGH] Lid hisoboti so'rovlari na `companyId`, na `branchId` bilan filtrlanadi
`getKpis` dagi ikkala `lead.count` filtrsiz → `leadConversionRate` filial tanlanganda ham kompaniya bo'yicha; `getLeadAnalytics(query)` imzosida `companyId` umuman yo'q → Excel «Lidlar» va «Taqqoslash» bloklari butun baza bo'yicha.
**Dalil:** [reports-overview.service.ts:102-108](server/src/reports/reports-overview.service.ts#L102) · [reports-overview.service.ts:316-354](server/src/reports/reports-overview.service.ts#L316) · [reports-excel.service.ts:205](server/src/reports/reports-excel.service.ts#L205)

### P88 — [MEDIUM] Ommaviy formada filial maydoni yo'q; lid manbasi global find-or-create
Ish-yo'li bor (har filialga alohida `LeadSection` + forma, `?source=` tegini filialga xos nomlash), lekin hisobotda filial kesimi bermaydi.
**Dalil:** [custom-forms.service.ts:265-306](server/src/custom-forms/custom-forms.service.ts#L265) · [custom-forms.service.ts:328-358](server/src/custom-forms/custom-forms.service.ts#L328) · [schema.prisma:717-718](server/prisma/schema.prisma#L717)

### P89 — [HIGH] Mock imtihon modelida na `companyId`, na `branchId` bor
`MockExamSection`, `MockExam`, `MockExamParticipant` — filial o'lchovi yo'q; `botStartPayload` global unique; `revenueSummary()` butun bazadagi `paid: true` ni yig'adi; `update` da `companyId` ham tekshirilmaydi.
**Dalil:** [schema.prisma:786-975](server/prisma/schema.prisma#L786) · [mock-exams.service.ts:57-73](server/src/mock-exams/mock-exams.service.ts#L57) · [mock-exams.service.ts:301-312](server/src/mock-exams/mock-exams.service.ts#L301) · [mock-exams.controller.ts:24-42](server/src/mock-exams/mock-exams.controller.ts#L24)
**CEO qarori kerak.**

### P90 — [MEDIUM] Mock pulida filial o'lchovi umuman yo'q; naqd va gateway to'lovlari **ataylab** ledgerga yozilmaydi
`MOCK_EXAM_FEE` da `branchId` yo'q; `markPaid` va gateway `markCompleted` faqat `paid` bayrog'ini o'zgartiradi (kod izohida bu qaror sifatida yozilgan). Namangan mock daromadini ajratishning yagona manbai — `MockExamParticipant.paid`, unda esa filial yo'q.
**Dalil:** [mock-exam-billing.service.ts:113-127](server/src/mock-exams/mock-exam-billing.service.ts#L113) · [mock-exam-participants.service.ts:428-463](server/src/mock-exams/mock-exam-participants.service.ts#L428) · [mock-exam-gateway-billing.service.ts:221-247](server/src/mock-exams/mock-exam-gateway-billing.service.ts#L221)
**CEO qarori kerak** (mock puli haqiqiy pul oqimida ko'rinsinmi).

### P91 — [MEDIUM] Mock imtihonda joy (filial/xona/manzil) saqlanmaydi va bot tasdiq xabarida yo'q
«💵 Naqd (markazda)» — qaysi markaz ekani aytilmaydi. `Branch.address`/`phone` bazada bor.
**Dalil:** [schema.prisma:807-872](server/prisma/schema.prisma#L807) · [mock-exam-registration.scene.ts:683-726](server/src/telegram/scenes/mock-exam-registration.scene.ts#L683) · [telegram.service.ts:598-601](server/src/telegram/telegram.service.ts#L598)

### P92 — [MEDIUM] O'quvchi portali / mobil ilovada kontaktlar kodga qotirilgan, jadval javobida filial/manzil yo'q
**Dalil:** [student-about-page.tsx:42-65](client/src/components/student-portal/student-about-page.tsx#L42) · [about.tsx:35](student-app/src/app/about.tsx#L35) · [student-portal-read.service.ts:100-160](server/src/students/student-portal-read.service.ts#L100)

---

## 11. Namangan'ni ishga tushirish sozlamalari

### P93 — [BLOKER] Namangan uchun kassa (CASH) va bank (BANK) hisobi ochilmagan *(rejada 0.3)*
PROD (2026-07-29): filial 1 da CASH+BANK bor, filial 2 da yo'q. → P20.
**Vosita:** [backfill-cash-accounts.ts:70-92](server/scripts/backfill-cash-accounts.ts#L70)

### P94 — [BLOKER] Namangan uchun kurs va xona yo'q *(rejada 0.3)*
PROD: `Course` va `Room` groupBy → faqat `branchId=1`. Kurssiz guruh ochilmaydi; xonasiz guruh kunlik jadvalda umuman chizilmaydi (`if (!lesson.roomId) continue`).
**Dalil:** [dashboard-room-occupancy.tsx:183](client/src/components/dashboard/dashboard-room-occupancy.tsx#L183) · [dashboard.service.ts:74-83](server/src/dashboard/dashboard.service.ts#L74)

### P95 — [BLOKER] `BranchesService.create` ish vaqtini yozmaydi — filial #2 PRODda `startOfWorkingDay/endOfWorkingDay = NULL`
DTO qabul qiladi, klient yuboradi, `data` blokiga kirmaydi; sxemada default ham yo'q. Natijada dashboard jadvali va guruh jadval konfliktlari `'08:00'`/`'20:00'` zaxirasiga tushadi (Farg'ona 22:30 gacha ishlaydi — xona bandligi foizi ham buziladi).
**Dalil:** [branches.service.ts:100-107](server/src/branches/branches.service.ts#L100) · [create-branch.dto.ts:25-33](server/src/branches/dto/create-branch.dto.ts#L25) · [schema.prisma:414-415](server/prisma/schema.prisma#L414) · [dashboard.service.ts:60-63](server/src/dashboard/dashboard.service.ts#L60)
**Darhol:** «Tahrirlash» orqali to'ldirish (update yo'li ishlaydi) + kodni tuzatish.

### P96 — [HIGH] Xodim formasi bitta filialda `mainBranch` ni to'ldirmaydi *(rejada 0.3)*
zod faqat >1 filialda majburiy qiladi; `UsersService` yagona filialdan avtomatik hosil qilmaydi. → P24 (fail-open) va outreach/kassa/qarzdorlarda fail-closed. PROD: 23 xodimdan 6 tasida NULL (4 CEO — ataylab, 2 Administrator).
**Dalil:** [edit-employee-form.tsx:196-202](client/src/components/settings/edit-employee-form.tsx#L196) · [users.service.ts:381](server/src/users/users.service.ts#L381)

### P97 — [MEDIUM] `Branch` da «ochilish sanasi» tushunchasi yo'q
`Company.systemStartDate` yagona global chegara → Namangan sentabrda ochilsa ham may-iyul oylari bo'sh qatorlar bilan chiqadi. **Bu maydon P26 (top-up go-live) bilan BITTA maydon bo'lishi kerak** — birga loyihalansin.
**Dalil:** [schema.prisma:1369-1372](server/prisma/schema.prisma#L1369) · [resolve-monthly-scope.ts:56-68](server/src/salary/shared/resolve-monthly-scope.ts#L56) · [schema.prisma:407-439](server/prisma/schema.prisma#L407)

### P98 — [MEDIUM] Filial ochish oqimi bo'sh; kassa uchun klientda birorta sahifa yo'q
`create` faqat `Branch` qatorini yozadi — kassa, xona, kurs, `UserBranch`, TG guruh hosil bo'lmaydi. `grep "cash-accounts" client/src` → 0 natija: `CashAccount` faqat API yoki skript orqali boshqariladi.
**Dalil:** [branches.service.ts:95-113](server/src/branches/branches.service.ts#L95) · [settings-nav.ts:28-56](client/src/lib/settings-nav.ts#L28) · [cash-accounts.controller.ts:20-49](server/src/cash-accounts/cash-accounts.controller.ts#L20)
**Yechim:** Filial detaliga «Ishga tayyorlash» tekshiruv ro'yxati (kassa/bank, ≥1 kurs, ≥1 xona, ≥1 administrator, ≥1 ustoz+stavka, ish vaqti, TG guruh).

### P99 — [MEDIUM] Filial statusi kaskadi to'liq emas; filialni arxivlash yo'li umuman yo'q
CLOSED/ARCHIVED da faqat Group → CANCELLED, Enrollment → DROPPED, Room → ARCHIVED. `Course`, `CashAccount`, `TelegramGroup`, `UserBranch`, `StudentBranch` tegilmaydi. `Branch.deletedAt` ustuni bor, uni belgilaydigan endpoint yo'q (arxiv o'qish/tiklash esa filiallarni qo'llab-quvvatlaydi).
**Dalil:** [status-cascade.service.ts:213-304](server/src/common/status/status-cascade.service.ts#L213) · [branches.controller.ts:20-83](server/src/branches/branches.controller.ts#L20) · [schema.prisma:426-431](server/prisma/schema.prisma#L426) · [archive-delete.service.ts:101](server/src/archive/archive-delete.service.ts#L101)
**CEO qarori kerak.**

---

## 12. Sxema yaxlitligi va texnik qarz

### P100 — [HIGH] `Holiday` modelida na `branchId`, na `companyId` bor — bayram butun BAZA bo'yicha global
Filialga xos yopilishni ifodalab bo'lmaydi; 15 ta chaqiruv nuqtasi (davomat validatsiyasi va statistikasi, dashboard, guruh kaskadi, 21:00 cron, digest, eslatmalar, va'da croni, hisobotlar) filial kontekstini uzatmaydi. `GET /holidays` da `@Roles` ham, `companyId` filtri ham yo'q.
**Dalil:** [schema.prisma:1207-1227](server/prisma/schema.prisma#L1207) · [holidays.service.ts:45-69](server/src/holidays/holidays.service.ts#L45) · [holidays.controller.ts:24-31](server/src/holidays/holidays.controller.ts#L24) · [attendance-validation.service.ts:123-127](server/src/attendance/attendance-validation.service.ts#L123) · [holidays.service.ts:329-341](server/src/holidays/holidays.service.ts#L329)
**Ish-yo'li:** filialga xos yopilishni `LessonCancellation` (guruh darajasi) orqali berish. **CEO qarori kerak.**

### P101 — [HIGH] Guruh yaratish/tahrirlashda kurs, ustoz va filialning o'zi tekshirilmaydi
Kurs `{ id, deletedAt: null }` bilan — na `companyId`, na `branchId` (kompaniyalararo tenancy bo'shlig'i ham); filial `companyId` siz; ustozlar faqat `roles Teacher` bo'yicha. Xona esa TO'G'RI tekshiriladi (`branchId: dto.branchId`) — nomuvofiqlik qasddan emasligini ko'rsatadi. `update` da xona umuman tekshirilmaydi. Narx `group.course.price` dan olingani uchun bu bevosita billingga tegadi.
**Dalil:** [groups-write.service.ts:31-43](server/src/groups/groups-write.service.ts#L31) · [groups-write.service.ts:45-52](server/src/groups/groups-write.service.ts#L45) · [groups-write.service.ts:54-67](server/src/groups/groups-write.service.ts#L54) · [groups-write.service.ts:231-239](server/src/groups/groups-write.service.ts#L231) · [lesson-billing.service.ts:432](server/src/billing/lesson-billing.service.ts#L432)

### P102 — [MEDIUM] Ustozning bandligi faqat bitta filial ichida tekshiriladi — filiallararo ikki karra bron
`getScheduleConflicts` va `getAvailableTeachers` ning band-guruh so'rovi `branchId` bilan cheklangan (ustozlar ro'yxati uchun to'g'ri, bandlik uchun noto'g'ri). Farg'onada 10:00 da darsi bor ustoz Namangan formasida «bo'sh» ko'rinadi. Serverda guruh yaratishda konflikt guardi umuman yo'q.
**Dalil:** [group-schedule.service.ts:36-43](server/src/groups/group-schedule.service.ts#L36) · [group-schedule.service.ts:75-78](server/src/groups/group-schedule.service.ts#L75) · [group-schedule.service.ts:284-292](server/src/groups/group-schedule.service.ts#L284)
**CEO qarori kerak** (ustoz ikkala filialda bir vaqtda ishlashi mumkinmi).

### P103 — [MEDIUM] Guruh raqami filial ichida takrorlanadi (`#001` ikkala filialda) va qidiruvda filial ko'rsatilmaydi
`@@unique([name, branchId])` bilan ataylab moslashtirilgan (loyiha qarori) — nuqson faqat ko'rinish tomonida: qidiruv `sublabel = #groupNumber` beradi, filial yo'q. Filialsiz `/groups` so'rovlari ham bor.
**Dalil:** [next-group-number.ts:20-39](server/src/groups/shared/next-group-number.ts#L20) · [schema.prisma:1123](server/prisma/schema.prisma#L1123) · [search-content.service.ts:19-63](server/src/search/search-content.service.ts#L19) · [students-client.tsx:120](client/src/components/students/students-client.tsx#L120)
**CEO qarori kerak** (nomlash sxemasi).

### P104 — [MEDIUM] `Course.branchId` nullable — null kurs har qanday filial filtridan yo'qoladi
Sxemada `Int?`, DTO da majburiy, `findAll` da `branchId: query.branch_id` → null kurs hech qachon qaytmaydi (unga bog'langan guruhlar esa normal ishlaydi: «ko'rinmas kurs»). Seed kurslarni ataylab global qiladi.
**Dalil:** [schema.prisma:489-490](server/prisma/schema.prisma#L489) · [create-course.dto.ts:46-48](server/src/courses/dto/create-course.dto.ts#L46) · [courses.service.ts:20-25](server/src/courses/courses.service.ts#L20)
**CEO qarori kerak** («umumiy kurs» tushunchasi qolsinmi).

### P105 — [MEDIUM] Moliyaviy `branchId` ustunlari FK EMAS
`Payment`, `Transaction`, `Expense`, `CashMovement`, `Contract`, `PaymentPromise`, `CallLog`, `CashAccount`, `Discount`, `Scholarship`, `Alert` — oddiy `Int?`. Mavjud bo'lmagan yoki begona kompaniya filial raqami yozilsa DB to'xtatmaydi (P13 bilan birga real yo'l). Kesim hisobotlari filiallarni `deletedAt: null` bilan oladi → arxivlangan filial qatorlari jimgina tushadi.
**Dalil:** [schema.prisma:1695-2615](server/prisma/schema.prisma#L1695) (FK'siz skalyarlar) · [schema.prisma:401-1416](server/prisma/schema.prisma#L401) (FK bo'lgan 6 model) · [reports-payments.service.ts:86-89](server/src/reports/reports-payments.service.ts#L86)

### P106 — [LOW] Qolgan sxema/texnik qarz
- `SalaryPayment` da `branchId` ham, DB unique ham yo'q (idempotentlik `findFirst` + Serializable tranzaksiya bilan) — [schema.prisma:2181-2204](server/prisma/schema.prisma#L2181), [salary-calculation.service.ts:151-181](server/src/salary/salary-calculation.service.ts#L151)
- Ishlatilmayotgan moliya stub jadvallari: `Discount`/`Scholarship`/`Alert` da FK'siz `branchId`, `AlertRule`/`InstallmentPlan`/`Installment` da umuman yo'q; `AlertRule` `@@unique([companyId, type])` — filialga xos LOW_CASH chegarasi imkonsiz. Jadvallar bo'sh → migratsiya bepul — [schema.prisma:2489-2600](server/prisma/schema.prisma#L2489)
- Audit/bildirishnoma/izoh/SMS jadvallarida filial ustuni yo'q (kesim imkoniyati yo'q, aralashish emas) — [schema.prisma:1324-1592](server/prisma/schema.prisma#L1324)
- `Room` va `Course` nomlarida filial ichida unique yo'q — [schema.prisma:442-510](server/prisma/schema.prisma#L442)
- `Payment`/`Expense`/`Contract` da `branchId` indeksi yo'q (kompozit `companyId+sana` indeksi bor, hozirgi hajmda muammo emas) — [schema.prisma:1815-1819](server/prisma/schema.prisma#L1815)
- Sabablar ma'lumotnomalari (`EnrollmentTransferReason`, `StudentExitReason`, `GroupTeacherChangeReason`) kompaniya darajasida — hisobot kesimi esa allaqachon filialli — [schema.prisma:1432-1486](server/prisma/schema.prisma#L1432)

---

## CEO/biznes qarorini talab qiladigan savollar

Bular kod muammosi emas — javob berilmaguncha to'g'ri yechimni tanlab bo'lmaydi.

1. **O'quvchi filialining kanonik ta'rifi** (P2, P6, P7): `StudentBranch` a'zoligimi yoki aktiv enrollment guruhining filialimi? Bir o'quvchi bir vaqtda ikki filialda o'qishi mumkinmi?
2. **Bitta balans va filiallararo pul** (P5, P14, P15): Namanganga to'langan pul Farg'ona qarzini yopishi mumkinmi? Yoki har filialga alohida balans?
3. **Ikki filialda dars beruvchi ustoz oyligi** (P28, P29): har dars o'z guruhining filialiga (tavsiya) yoki xodimning asosiy filialiga? Filialga xos stavka kerakmi?
4. **Markaz darajasidagi (branchId=null) pul** (P41, P43, P34): reklama, CEO oyligi, umumiy kassa — alohida «Markaz» qatori bo'lib filial foydasiga kirmasinmi (tavsiya), yoki o'quvchi soniga qarab taqsimlansinmi?
5. **Namangan uchun top-up qachondan** (P26): markaz qo'shimchasi 2-filial darslarini birinchi kundan qoplasinmi? Onboarding'da ortga kiritilgan (allaqachon to'langan) darslar top-up ga kirsinmi?
6. **Administrator roli** (P59): kompaniya darajasida qolsinmi (hozirgi holat) yoki filialga cheklansinmi?
7. **CEO uchun «Barcha filiallar» ko'rinishi** (P63) kerakmi?
8. **Guruh nomlash** (P103): har filialda `#001` mi, `F-001`/`N-001` prefiksmi, yoki kompaniya bo'yicha yagona ketma-ketlikmi?
9. **Filialga xos bayram** (P100) kerakmi, yoki mahalliy yopilishlar `LessonCancellation` orqali beriladimi?
10. **Filial bo'yicha alohida oylik davri** (P36) kerakmi, yoki bitta kalendar?
11. **Lidlar** (P86, P87): filial bo'yicha bo'linsinmi yoki umumiy voronka bo'lib qolsinmi?
12. **Mock imtihonlar** (P89, P90, P91): filialga bog'lansinmi? Mock naqd puli kassaga/ledgerga yozilsinmi?
13. **«Umumiy kurs»** (P104): `Course.branchId = null` tushunchasi qolsinmi, yoki har filialga o'z nusxasi?
14. **Ustoz filiallararo bir vaqtda band bo'la oladimi** (P102) — jadval konflikti kompaniya bo'yicha tekshirilsinmi?
15. **Telegram** (P71, P80): har filialga alohida hisobot guruhi? Alohida kanal-gate? Alohida Eskiz nik/hisob?
16. **O'quvchini filialdan filialga ko'chirish qoidasi** (P7): prepaid qoldiq, ochiq qarz, eski enrollment bilan nima bo'ladi?
17. **Filial yopilganda kaskad qamrovi** (P99): kurs, kassa, TG guruh ham yopilsinmi? Filialni arxivlash kerakmi?
18. **Click/Payme merchant hisobi** (P19): bitta qolsinmi?
19. **Filialsiz 11 ta tranzaksiya** ([plan:106](docs/branch-finance-split-plan.md#L106)) qaysi filialga yozilsin? *Tavsiya: filial 1.*

---

## Tavsiya etilgan tartib (batch'lar)

**Bog'liqlik mantig'i:** yozuv → backfill → Namangan ma'lumoti; kanonik filial ta'rifi → hisobot; oylik modeli → foyda kartasi. Bu tartib buzilsa, keyingi bosqichlar noto'g'ri asosga quriladi.

### Batch 0 — Namangan bazasini tayyorlash (kodsiz, bugun)
P93 (kassa+bank), P94 (kurs+xona), P95 (ish vaqti — hozircha «Tahrirlash» orqali), P96 (`mainBranch` backfill), P25-ning operatsion qismi (har bir Namangan ustoziga stavka + versiya, `effectiveFrom` = ish boshlagan sana), P71-ning interim qismi (`approve-tg-group.ts` bilan mavjud 3 guruhga `branchId=1`), ustozlarni filial #2 ga biriktirish (P60 ish-yo'li orqali).
**Nega birinchi:** bularsiz birinchi o'quvchi kiritilishi bilan pul umumiy kassaga, oylik esa 0 ga tushadi — va bu qaytarilmaydi (stavkani orqaga surish taqiqlangan).

### Batch 1 — Yozish tomonini yopish (kod, migratsiyasiz)
P10 (`SALARY_ACCRUAL`), P11 (`recordRefund`/`recordSalaryPayment` + kassa), P12 (5 ta qo'shimcha nuqta), P13 (qo'lda to'lov: `resolveStudentBranchId` + validatsiya), P21 (kassa NO-OP → xato/Alert).
**Nega ikkinchi:** filialsiz yozilgan qatorni hech qanday hisobot filtri bilan tiklab bo'lmaydi. Bu bitta o'zgarishlar to'plami oyiga ~4 300 yangi filialsiz qatorni to'xtatadi.
**Tekshiruv:** deploydan 1 kun keyin `branchId=null` yangi tranzaksiya = 0.

### Batch 2 — Backfill (Namangan ma'lumot olishidan OLDIN)
`server/scripts/backfill-transaction-branch.ts` (yozilishi kerak), avval `--dry-run`, `Transaction(id, branchId)` zaxirasi bilan. Hozir noaniq qator 0 ta; Namanganda o'quvchi paydo bo'lgach 2-qoida noaniqlashadi.
**Tekshiruv:** [audit-branch-isolation.ts](server/scripts/audit-branch-isolation.ts) + [audit-finance-reconciliation.ts](server/scripts/audit-finance-reconciliation.ts).

### Batch 3 — Ma'lumotni buzadigan yo'llarni yopish (Namangan'ga o'quvchi qo'shishdan oldin)
P1 (guruh `branchId` ko'chishi), P2 (`enrollToGroup` sinxronizatsiyasi/blokirovkasi), P3+P4 (`branchIds` validatsiyasi, filialsiz o'quvchini taqiqlash), P24 (batchPay fail-closed), P51+P52 (IDOR), P101 (kurs/ustoz/xona/filial tekshiruvlari), P26 (top-up go-live chegarasi + `preview-topup-run.ts` dry-run).
**Nega uchinchi:** bulardan har biri **yangi buzuq ma'lumot yaratadi**; ular yopilmasa Batch 2 dagi backfill bir hafta ichida yana eskiradi.

### Batch 4 — Oylik modelini filialga bog'lash (rejaning Faza 1)
Migratsiya: `SalaryAccrual.branchId` (yozish paytida guruhdan **muzlatilgan**, nullable → backfill → NOT NULL), `SalaryPayment.branchId` (nullable). Keyin P27, P28, P30, P31, P32, P33, P34.
**Nega bu yerda:** foyda kartasi (Batch 5) filialga kesilgan oylik raqamisiz to'g'ri chiqmaydi.

### Batch 5 — Hisobot va Excel (rejaning Faza 2)
P37 (`getSalaryMonthly` ga `branchId`), P38, P39, P40, P41 («Markaz» qatori), P42, P43, P45, P46, P47, P48, P49, P50. Yakunida — **avtomatik test: `Σ(filiallar) + markaz == jami`** va P44 dagi yangi Tekshiruv qatorlari.

### Batch 6 — RBAC scope (o'qish oqishlarini yopish)
P53 (JWT claim + `BranchScopeGuard` + yagona `resolveBranchScope`), so'ng uni P54, P55, P56, P57, P58, P22, P30, P61 ga ulash. P59 (Administrator) — CEO javobidan keyin.
**Nega Batch 5 dan keyin:** guard hisobot servislarining imzosini o'zgartiradi; hisobotlar avval scope'ni to'g'ri qabul qiladigan holga keltirilsin, keyin guard majburiy qilinsin.

### Batch 7 — UI (rejaning Faza 3)
P62 (dialoglar kontekstdan filial olsin), P63 («Barcha filiallar» + `mainBranch` default), P64 (`enabled` qorovullari), P65, P66, P67 (URL), P68, P69, P70 (filial yorliqlari).

### Batch 8 — Telegram va cron (rejaning Faza 4)
P71 (approve dialogida filial), P72, P73 (`DailyFinancialSnapshot.branchId` + kesh kaliti), P74, P75, P76, P77, P78, P79, P80; cron tomonidan P81, P82, P83, P84, P85.

### Batch 9 — Lidlar, mock, Holiday, sxema tozalash (rejaning Faza 5+)
P86, P87, P88 (Lead/Column/Section/Source ga `companyId` + `branchId`), P89–P92 (mock + portal), P100 (`Holiday.companyId` + `branchId`), P97 (`Branch.openedAt` — P26 bilan bitta maydon), P99 (kaskad + arxivlash), P102, P103, P104, P105 (FK migratsiyasi — backfilldan keyin), P106.
**Nega oxirida:** moliyaga bevosita ta'sir qilmaydi; P105 (FK) esa Batch 2 backfill tugamaguncha texnik jihatdan qo'yib bo'lmaydi.