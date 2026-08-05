# USTOZ OYLIGI DRIFTI — YAKUNIY HISOBOT
**Sana:** 2026-08-01 · **Baza:** prod (companyId=1001, read-only) · **Manba:** 6 mustaqil lens + skeptik tekshiruv

---

## 1. XULOSA — bu xato yana qaytaradimi?

**HA, qaytaradi — lekin bitta emas, ikkita alohida sinf sifatida, va ularning og'irligi juda farq qiladi.** Asosiy sabab hali ham ochiq: `SalaryPayment.amount` — muzlatilgan surat, unga bog'langan accrual to'plamini o'zgartiradigan **hech bir yo'l** to'lovni qayta hisoblamaydi (`recomputePaymentAmount` degan funksiya kod bazasida umuman yo'q), va qayta hisoblashning yagona yo'li (`calculateMonthlySalaries`) faqat **o'sha davrda bog'lanmagan accruali bor** ustozni ko'radi (`salary-calculation.service.ts:126-153`) — ya'ni drift o'z-o'zidan tuzalishi kafolatlanmagan, u tasodifiy. Iyuldagi **+12 501** (#10007) aynan shu mexanizmning jonli, yangi isboti: to'lov 31.07 21:03 da yozilgan, keyin 3 ta markaz-qo'shimchasi accruali undirilganda `amount` 20 834 → 16 667 ga qayta yozilgan, to'lov esa tegilmagan. Ammo **miqyos kichik**: butun bazada drift atigi 2 ta qatorda, |29 168| so'm, net −4 166 so'm; prodda **birorta oylik PAID emas** (35 CALCULATED = 187 584 461, 1 APPROVED = 66 665, PAID = 0), ya'ni bugungi kunda bu kassadan ketgan pul emas, hisobot/reja xatosi. Takrorlanish chastotasi ham dastlab o'ylanganidan past: qayta yozish faqat **narx bazasi farq qilganda** drift beradi (gap sweep jonli `course.price` ni, kech to'lov esa `LESSON_DEDUCTION` metadatasidagi muzlatilgan narxni oladi) — 872 ta undirilmagan top-up accrualdan faqat 22–28 tasida narx farqli, kutilayotgan qo'shimcha drift ≈ **92–117 ming so'm**, «15 371 602» EMAS. **Eng katta amaliy xavf esa drift emas**: (a) iyun davridagi 6 ta dublikat juftlikda UI **kichik** to'lovni tasdiqlaydi/to'laydi va **39 189 212 so'm** katta qatorlar interfeys orqali umuman erishib bo'lmaydigan holatda; (b) May davrini qayta hisoblash #10003 ning to'lovini **3 483 299 → 33 334** ga tushiradi (−3 449 965); (c) prodda hali undirilmagan **650 000** so'mlik avans strukturaviy jihatdan undirilmaydi.

---

## 2. YOPILGAN YO'LLAR (dalili bilan)

| # | Yo'l | Nima yopdi | Dalil |
|---|---|---|---|
| Y1 | Yopilgan davrga accrual sizishi | `salary-accrual.service.ts:120-175` — CALCULATED ham «yopiq» sanaladi (commit aa3c20a, 2026-07-07 deploy) | Iyun davriga sizgan 323 ta accrual (5 680 481), **oxirgisi 2026-07-07T12:00**, undan keyin bittasi ham yo'q. Bugun `creditPeriodDate` qo'yilgan 409 ta accrual bor (iyulga 408 ta / 6 961 706) |
| Y2 | Yangi dublikat to'lov qatori | `salary-calculation.service.ts:162-195` merge-idempotency (bace605, 2026-07-05) + Serializable tx | Iyul davri (31.07 21:03 cron): aynan 10 qator / 10 ustoz, dublikat 0. ⚠️ **Lekin:** mavjud davr uchun merge yo'li prodda hali **bir marta ham ishlamagan** (07.07 dan keyin hech qanday re-run bo'lmagan) — kodda yopiq, prodda sinalmagan |
| Y3 | `PRESENT↔ABSENT` flip-flop accrualni bekor qilishi | `lesson-billing.service.ts:19-24` — `BILLABLE = {PRESENT, LATE, ABSENT}`, reversal faqat `billable→non-billable` da | 711 ta bekor qilingan accrualning 16 tasi «attendance status changed», hammasi →EXCUSED. Prodda flip-flop reversal 0 ta |
| Y4 | 187,58 mln CALCULATED zaxirani «bir tugmada» to'lash | `common/finance/status-transitions.ts:43-46` — `CALCULATED: [APPROVED, CANCELLED]`, ya'ni CALCULATED→PAID **taqiqlangan**; `PAID: []` qayta to'lashni bloklaydi | `batchPay` ni `statuses:[CALCULATED]` bilan chaqirsangiz ham 35 qator `FAILED` qaytaradi. Clientda «Hammasini to'lash» tugmasi ham, bulk-approve endpointi ham yo'q |
| Y5 | «To'lov qatorisiz ustoz» carry-over teshigi (amaliy) | 2026-07 dan Faza 0 top-up har bir qoplanmagan billable darsga accrual yozadi → darsi bor ustozda to'lov qatori doim paydo bo'ladi | Iyulda accruali bor 10 ustozning **hammasida** to'lov qatori bor. Qatorsiz 6 ustozda (#10001, #10772, #10774–#10777) config=0, versiya=0, accrual=0 → `createAccrual` `findActiveVersion` da null qaytaradi |
| Y6 | 694 ta bekor qilingan May accrualining «tirilishi» | BR-09b backlog `a.date >= topUpEraStartDate() = 2026-07-01` | 13 038 226 so'mlik may partiyasi gap sweep uchun yetib bo'lmas holatda; prodda tirilish hodisasi **0 ta** |
| Y7 | Cron ikki replikada ikki marta ishlashi | `railway status`: `numReplicas: 1`, yagona region | — |
| Y8 | UI'dan tasodifan May ni qayta hisoblash | Clientda `POST /salary/calculate` chaqiruvi **umuman yo'q** (grep 0) | Faqat qo'lda API yoki `scripts/calculate-may.ts --apply` |

---

## 3. OCHIQ YO'LLAR (jiddiylik bo'yicha)

| # | Mexanizm (fayl:qator) | Qachon otadi | Xavf ostidagi pul | Prod holati |
|---|---|---|---|---|
| **O1** | **UI kichik to'lovni tasdiqlaydi.** `salary-monthly.service.ts:373-387` — `amount` QO'SHILADI, lekin `id`/`status` har iteratsiyada qayta yoziladi (`orderBy createdAt asc` → oxirgisi g'olib); `salary-monthly-view.tsx:311` → `salary-breakdown-drawer.tsx:153,156` aynan shu id ga approve/pay yuboradi | CEO iyun qatorini bosib «Tasdiqlash/To'lash» bosgan zahoti | **39 189 212** (6 ta katta qator UI orqali erishib bo'lmas holatga tushadi; drawer orqali faqat 764 743 to'lanadi) | Faol, har kuni bosilishi mumkin. 0 ta PAID — hali otmagan |
| **O2** | **May qayta hisoblash to'lovni vayron qiladi.** `salary-calculation.service.ts:196-238` — `gross` bog'langan accruallardan AVTORITAR qayta yoziladi; May 10 ta to'lovda accrual 0 ta (Excel backfill), guard faqat APPROVED/PAID uchun (:167-176) | `POST /salary/calculate?asOfDate=2026-05-*` yoki `scripts/calculate-may.ts --apply` | **−3 449 965** darhol (#10003: 3 483 299 → 33 334); nazariy tepa chegara ≈ **−38 668 475** (agar 694 bekor accrual tiriltirilsa) | Bitta buyruq bilan otadi. Clientda tugma yo'q |
| **O3** | **Upsert bog'langan accrual `amount` ini qayta yozadi.** `salary-accrual.service.ts:231-284` — `update` branchida `salaryPaymentId` ham, to'lov statusi ham tekshirilmaydi; `reversedAt` ham NULL ga tushadi. Ildiz: `computeGapAccruals` jonli `course.price/lpc`, `settleDeferredAccruals` esa muzlatilgan `md.perLessonCost` | Kurs/guruh narxi o'zgargan guruhda qarzdor o'quvchi to'laganda (prod misoli: 21.07 da #041 va #016 «Standart» 400 000 → «Standart B2» 500 000) | Yuz bergan: **+12 501**. Kutilayotgan: **≈92–117 ming** (872 undirilmagandan 22–28 tasi narxi farqli). ⚠️ «15 371 602» — bu top-up bazasi, drift emas | Faol. APPROVED/PAID to'lovga ham tegadi (guard yo'q) |
| **O4** | **Qayta hisoblash driftni tuzatmaydi.** `salary-calculation.service.ts:126-153` — `byUser` faqat `salaryPaymentId: null` accruallardan quriladi | Ustozda o'sha davrda yangi bog'lanmagan accrual bo'lmasa | Driftning **abadiy qolishi** (#10007 ning +12 501 i shunday: uning yetim accruallari 01.08 sanali → avgustga tushadi, iyul hech qachon qayta hisoblanmaydi) | Faol, hozir aynan shu holat |
| **O5** | **Undirilmaydigan avans.** `salary-calculation.service.ts:380-418` faqat SalaryPayment yaratilganda chaqiriladi; `expenses.service.ts:55-70` TEACHER_ADVANCE da salary config talab qilmaydi; `buildWhere:142-147` uni xarajat ro'yxatidan chiqarib tashlaydi | Accruali ham, FIXED_MONTHLY configi ham yo'q xodimga avans berilganda (prodda barcha 10 ta non-teaching xodim shunday) | **650 000** (#10653, Administrator) — hech qaysi ekranda ko'rinmaydi, foyda shu summaga doimiy oshiq | Yuz bergan, hozir ham osilib turibdi |
| **O6** | **FIXED_MONTHLY + accrual kolliziyasi.** `salary-accrual.service.ts:186-207` — `findActiveVersion` `salaryType` ni filtrlamaydi, FM oyligini `amount = FM/lessonPaymentCount` qilib **har dars, har o'quvchi** uchun yozadi; `salary-calculation.service.ts:302-311` `if (existing) continue` | FM configli xodim dars bera boshlasa (`assertTeachersHaveRate` FM ni «stavka bor» deb sanaydi, to'smaydi) | Bitta xodim / bitta guruh / bitta oy uchun **+33…+55 mln ORTIQCHA** (5 mln FM, lpc 12–20, ~133 davomat) | Latent: prodda FIXED_MONTHLY config **0 ta** |
| **O7** | **`reverseAccrualForAttendance` to'lovni ko'rmaydi.** `salary-accrual.service.ts:390-436` — `salaryPaymentId` na o'qiladi, na tozalanadi; yopiq davr gate'i yo'q | Yopilgan davrda dars →EXCUSED qilinsa yoki dars bekor qilinsa | Hozir **0** (yagona holat — #10010, 20 000 — allaqachon o'z-o'zidan tuzalgan, diff=0). APPROVED/PAID da chegaralanmagan | Latent. Prodda PAID 0, APPROVED 1 (66 665) |
| **O8** | **`reverseLessonDeduction` servisni chetlab o'tadi.** `lesson-billing.service.ts:778-797` — `tx.salaryAccrual.update` to'g'ridan-to'g'ri: balans mirror'i yo'q, gate yo'q, to'lov qayta hisoblanmaydi | `POST /billing/lesson-deduction/:id/reverse` (CEO/BD) qo'lda chaqirilsa | Hozir **0** (prodda iz 0 ta, frontendda chaqiruvchi UI yo'q). Bitta chaqiruv butun prepaid partiyaga tegadi | Latent |
| **O9** | **Carry-over gate to'lov qatoriga tayanadi.** `salary-accrual.service.ts:120-139` | Davr uchun ustozda to'lov qatori HALI/UMUMAN yo'q bo'lsa | Hozir **0** (Y5 tufayli). Prod misoli 33 334 — sabab boshqa (quyida) | Y5 tufayli tor |
| **O10** | **`salary.pending` reversed accruallarni qo'shadi.** `reports-financial.service.ts:302-306` — `reversedAt: null` filtri YO'Q; `reports-balance-sheet.service.ts:79-86` esa BOR | Har safar hisobot API si chaqirilganda | **13 333 929** soxta majburiyat (710 accrual). Balans varag'i bilan zid | Faol, lekin **hech bir UI/Excel/Telegram render qilmaydi** (dormant) |
| **O11** | **Hisobot bazalari ziddiyati.** Karta = `payment.amount` (`salary-monthly.service.ts:473-475`), Foyda = accrual (`reports-excel.helpers.ts:143-149`) — bitta javobda | Har oy | **May: 57 146 647**(!) farq, iyun 16 667, iyul 12 501+gap. Tooltip esa «aynan bir xil asosda» deb va'da beradi | Faol |
| **O12** | **Excel «Oyliklar» qo'shilmaydi.** `reports-excel.detail-sheets.ts:118-162` accrual + to'lov ustunlari aralash; Tekshiruv varag'i (`:632-657`) `kvRow` ishlatadi, MOS/XATO emas; «Sof foyda footing» tavtologiya | Har qanday drift/backfill oyida | Iyun 16 667, May 57 146 647 — varaqda hech qanday belgi yo'q | Faol |
| **O13** | **Payslip qo'shilmaydi.** `salary-breakdown.service.ts:65-76` — `grossTotal = payment.amount + avans`, satrlar esa accrualdan | Drift bo'lgan har qanday to'lovda | 16 667 / 12 501 — lekin lehrer portal bu endpointni **chaqirmaydi**, admin drawer'da satrlar JAMI qatori yo'q | Faol, ammo ko'rinmaydi |
| **O14** | **Cron catch-up yo'q + cycleStartDay cutover.** `salary-cron.service.ts:30-67` qat'iy `getUTCDate() === cycleStartDay`, `catch` faqat log; `salary-period-settings.service.ts:68-83` | 1-kuni 02:00 da deploy/restart; yoki CEO hisoblash kunini o'zgartirsa | Bir davr **kechikishi** (iyul narxida 80 083 715); cutover'da 7–27 kunlik oyna (≈2,58 mln/kun) — hammasi `asOfDate` bilan qaytariladi | Iyunda haqiqatan otmagan (sozlama orqaga sanalgan); 01.07 va 01.08 da cron normal ishlagan |
| **O15** | Boshqa qattiqlashtirishlar: `applyAccrualToBalance` summani solishtirmaydi (`:335-344`); `withdrawals.service.ts:194-209` gate/mirror'siz `create`; CANCELLED `salary-calculation.service.ts:162` da filtrlanmaydi; FIXED_MONTHLY mavjudlik tekshiruvi tx dan **tashqarida** (`:302`, TOCTOU); `findFirst` da `orderBy` yo'q; `applyPendingAdvances` da sana chegarasi yo'q; `break` vs `continue` (`:401-405`) | — | Hammasida hozir **0 so'm** | Latent |

**Alohida qayd (yangi, topilmalar ichida yo'q edi):** `PRESENT → EXCUSED → PRESENT` qilingan dars **hech qachon qayta billanmaydi** — `bill()` ning idempotentlik tekshiruvi (`lesson-billing.service.ts:395-403`) tirik kompensatsion `LESSON_CONSUMPTION` qatorini «allaqachon billangan» deb sanaydi, prepaid esa reversal paytida +1 qaytarilgan → tekin dars. Prodda 186/186 attendance'da shu naqsh bor, lekin qayta PRESENT qilingan holat hali 0 ta. Buni alohida tekshirish kerak.

---

## 4. HOZIRGI ZARAR — prodda o'lchangan aniq raqamlar

### 4.1 To'lov ↔ accrual drifti (butun baza: 2 qator, |29 168|, net −4 166)

| Davr | Ustoz | To'lov ID | amount | Σ tirik bog'langan accrual | Yopilgan avans | Kutilgan | Drift |
|---|---|---|---|---|---|---|---|
| Iyun (periodStart 2026-05-31T19:00Z) | #10005 | 2da870a1… | 4 466 790 | 6 183 457 (371 ta) | 1 700 000 | 4 483 457 | **−16 667** |
| Iyul (periodStart 2026-06-30T19:00Z) | #10007 | 58e1dd66… | 9 779 382 | 10 316 881 (611 ta) | 550 000 | 9 766 881 | **+12 501** |

**+12 501 ning ildizi to'liq isbotlangan:** st#10707, guruh #041, darslar 16/18/21.07 — 31.07 21:01 da top-up sifatida 20 834 (plc 41 667) yozilgan, to'lov 21:03 da shu summani olgan, keyin undirishda 16 667 (plc 33 333) ga qayta yozilgan. 3 × 4 167 = 12 501. Ularning `SALARY_ACCRUAL` tranzaksiyalari hamon **20 834** → #10007 ning `User.balance` i ham 12 501 ga eskirgan (17 300 355 vs Σ tirik accrual 17 287 854).

### 4.2 Dublikat to'lov qatorlari (iyun, 6 ustoz)

| Ustoz | Katta qator (30.06 21:00) | Kichik qator (01.07 05:37) | Jami |
|---|---|---|---|
| #10010 | 17 692 100 (1220 accr) | 41 400 (2) | 17 733 500 |
| #10008 | 6 833 489 (467) | 133 336 (8) | 6 966 825 |
| #10003 | 6 233 458 (374) | 166 670 (10) | 6 400 128 |
| #10005 | 4 466 790 (371) | 200 004 (12) | 4 666 794 |
| #10006 | 3 350 127 (381) | 116 669 (7) | 3 466 796 |
| #10014 | 613 248 (256) | 106 664 (8) | 719 912 |
| **JAMI** | **39 189 212** | **764 743** | **39 953 955** |

Pul jihatidan zarar **0** (accruallar bo'lingan, hisobotlar qo'shadi), lekin **UI faqat kichik qatorga yozadi**.

### 4.3 Qolgan o'lchangan qoldiqlar

- **33 334** — #10003 ning 2 ta May accruali (04.05 va 06.05, o'quvchi #10455), `salaryPaymentId=null`, `reversedAt=null`, `creditPeriodDate=null`. Hech qachon avtomatik to'lanmaydi. **Sabab:** accruallar 26.06 04:55 da yaratilgan, May to'lov qatorlari esa 29.06 07:15 da (Excel backfill, 10/10 to'lovda linkedAccruals=0) — ya'ni carry-over gate emas, backfill artefakti.
- **650 000** — #10653 (Administrator) ga berilgan 2 ta TEACHER_ADVANCE (16.07: 600 000, 27.07: 50 000). Config 0, accrual 0, SalaryPayment 0 → undirilmaydi va hech qaysi ekranda ko'rinmaydi. (Uchinchi ochiq avans — #10014, 160 000, 01.08 — normal, 31.08 da yopiladi.)
- **13 038 226 / 694 qator** — «May Excel rebuild» skriptlari (29.06) originallarni `reversedAt` bilan belgilab, qatorma-qator qarshi yozuv o'rniga ustoz kesimida 9 ta yig'ma manfiy tranzaksiya yozgan (`reversedTransactionId`, `attendanceId`, `branchId` = NULL). **Balans to'g'ri** (10 ustozdan 8 tasida `User.balance = Σ tirik accrual`), audit zanjiri uzilgan.
- **13 333 929** — `/reports/financial-overview` dagi `salary.pending` da soxta majburiyat (Balans varag'ida 410 839).
- **15 371 602 / 872 accrual** — hali undirilmagan markaz qo'shimchasi (9 ustoz: 10010 – 4 875 600; 10008 – 2 500 053; 10006 – 1 750 035; 10007 – 1 562 538; 10005 – 1 500 030; 10003 – 1 216 691; 10014 – 933 310; 10002 – 833 350; 10473 – 199 995). Bu **drift emas**, ekspozitsiya bazasi.
- **57 179 981** — May davridagi 10 ta accrualsiz Excel-backfill to'lovi (CALCULATED, `note = "May 2026 — Excel asosida…"`).
- **Umumiy holat:** 36 ta SalaryPayment — 35 CALCULATED (187 584 461) + 1 APPROVED (66 665) + **0 PAID**. Real ustoz naqdi TEACHER_ADVANCE orqali chiqadi (85 tirik qator, 32 907 000; 82 tasi yopilgan).

### 4.4 ⚠️ OCHIQ ZIDDIYAT — #10005 ning −16 667 i (hal qilinmagan)

Ikki mustaqil lens bir-biriga zid xulosaga keldi, **ikkalasi ham arifmetik jihatdan aniq mos keladi**:

- **Versiya A (qo'lda skript):** `scripts/finalize-june-salary-display.ts:95` CEO jadvalidan `PAID_NET[10005] = 4 666 794` ni yozgan; 4 666 794 − 200 004 (ikkinchi qator) = 4 466 790. PAID_NET prodagi joriy per-ustoz jamiga **10/10 aniq** mos; 22.07 15:02 da aynan 9 ta qator (PAID_NET dagi 10 tadan 10505 dan boshqasi, u allaqachon teng edi) yangilangan, ikkilamchi qatorlar tegilmagan.
- **Versiya B (snapshot drift):** bitta 16 667 lik carry-over accrual (lessonDate 2026-05-02, `creditPeriodDate` 2026-05-31, createdAt 2026-06-13) to'lovga bog'langan, lekin summaga kirmagan: 6 183 457 − 16 667 − 1 700 000 = 4 466 790.

**Muvozanatlashtiruvchi fakt:** o'sha accrualda `salaryConfigVersionId = NULL` va unga tegishli `SALARY_ACCRUAL` tranzaksiya **umuman yo'q** — bazadagi 9 254 tirik accrual ichida yagona shunday qator. `createAccrual` doim `version.id` va mirror tranzaksiya yozadi. Demak u **qo'lda/skript bilan** yaratilgan va (ehtimol `reconcile-june-salary-apply.ts` bilan) to'lovga keyin bog'langan.

**Amaliy xulosa:** iyun −16 667 — deyarli aniq **qo'lda aralashuv artefakti** (skript amount ni yozgan + skript accrualni bog'lagan), tirik kod yo'li emas. Iyul +12 501 esa **100% tirik kod yo'li**. Shuning uchun tuzatish rejasi ikkalasini alohida ko'rib chiqadi: iyunni «CEO raqamini saqlash» sifatida, iyulni «bug» sifatida.

---

## 5. TUZATISH REJASI

### F1 — `createAccrual` upsert'ini bog'langan accrualdan himoyalash *(KICHIK, 1 fayl)*
- **Fayl:** `server/src/salary/salary-accrual.service.ts:231-284`
- **O'zgarish:** `update` branchida `amount`/`perLessonCost` ni faqat `salaryPaymentId === null` bo'lganda yozish. Bog'langan bo'lsa: CALCULATED → `recomputeSalaryPaymentAmount` (F2) chaqirish; APPROVED/PAID → summani muzlatib qoldirish va farqni joriy ochiq davrga alohida tuzatuv accruali qilib yozish. Shu bilan birga `reversedAt/reversedById/reversalReason` ni **jimgina tozalamaslik** (centerFunded yo'lda umuman tegmaslik) va `isCenterTopUp` ni ko'r-ko'rona `false` qilmaslik.
- **Test:** unit — (a) bog'langan CALCULATED to'lovli accrualni undirish → to'lov qayta hisoblanadi; (b) APPROVED to'lovli accrual → `amount` o'zgarmaydi, tuzatuv accruali yoziladi; (c) **BR-13 regressiyasi** (`salary-accrual.service.spec.ts:169` — undirishda ustoz balansiga yangi kredit YOZILMAYDI) o'tishi shart.
- **Xavf:** BR-13 guard'ini buzib qo'yish (ikki marta balans krediti). Test bilan qoplang.

### F2 — Yagona `recomputeSalaryPaymentAmount(paymentId, tx)` helperi *(KICHIK)*
- **Fayl:** `server/src/salary/salary-calculation.service.ts:196-238` dan ajratib chiqarish; chaqiruvchilar: F1, `reverseAccrualForAttendance`, `reverseLessonDeduction` (F5), yangi endpoint (F3).
- **Formula:** `amount = Σ(linked accrual WHERE reversedAt IS NULL) − Σ(settled TEACHER_ADVANCE)`; **faqat** `status === CALCULATED` va `manualBasis !== true` bo'lganda yozadi.
- **Test:** helper spec + mavjud `salary-calculation.service.spec.ts:405/433` (MERGE/SKIP) regressiyasi.

### F3 — Qayta hisoblashni **xavfsiz** va **shartsiz** qilish *(KATTA — bu asosiy tuzatish)*
- **Fayllar:** `server/prisma/schema.prisma` (SalaryPayment ga `manualBasis Boolean @default(false)`), `salary-calculation.service.ts:126-176`, `salary.controller.ts`.
- **O'zgarish:**
  1. Migratsiya: `manualBasis` ustuni; May ning 10 ta backfill qatorini va iyunning CEO qo'lda muzlatgan 10 ta qatorini `true` qilish.
  2. `:162` `findFirst` ga `status: { not: CANCELLED }` + `orderBy: { createdAt: 'asc' }`.
  3. Sikl kalitini `union(byUser.keys(), o'sha davrdagi CALCULATED to'lovlar userId lari)` ga o'zgartirish — shunda drift **yangi accrualga bog'liq bo'lmay** tuzaladi.
  4. `manualBasis = true` bo'lgan har qanday qatorni `amount` yozishdan **butunlay chetlatish** (bu O2 ni yopadi).
  5. `:302-311` FIXED_MONTHLY mavjudlik tekshiruvini tranzaksiya ICHIGA kiritish (TOCTOU).
- **Test:** integratsiya — May uchun `calculate` chaqirilganda hech bir qator o'zgarmaydi; iyul uchun chaqirilganda #10007 avtomatik 9 766 881 ga tushadi.
- **Xavf:** `manualBasis` ni noto'g'ri joyga qo'yish → qonuniy qatorlar qayta hisoblanmay qoladi. Migratsiyani aniq ro'yxat bilan bajaring, `note` bo'yicha emas.

### F4 — Dublikat to'lov qatorlari (**ikki bosqichli**) *(KATTA)*
- **Bosqich 1 (ma'lumot, darhol):** iyundagi 6 juftlikni birlashtirish — kichik qatorning accruallarini katta qatorga ko'chirish, `amount` ni jami bilan yozish (⚠️ CEO ning `PAID_NET` raqamlarini saqlash: 10005 → 4 666 794, 10003 → 6 400 128, 10006 → 3 466 796, 10008 → 6 966 825, 10010 → 17 733 500, 10014 → 719 912), kichik qatorni o'chirish (CANCELLED **emas** — CANCELLED semantikasi kodda yo'q, `salary-calculation.service.ts:162` uni «ochiq qoralama» deb oladi).
- **Bosqich 2 (kod):** `@@unique([userId, companyId, periodStart, periodEnd])` migratsiyasi + `findFirst` → `findUnique`.
- **Qo'shimcha (himoya):** `salary-monthly.service.ts:373-387` `payments: {id, amount, status}[]` + `paymentIds` qaytarsin, `status` = **eng past bosqich** (CALCULATED < APPROVED < PAID); drawer barcha id lar bo'yicha ishlasin. Xuddi shu naqshni `salary-payment.service.ts:110-128` va `salary-monthly-staff.service.ts:162-182` da ham.
- **Test:** e2e — dublikatli davr uchun drawer katta to'lovni ochadi va `pay` ikkala qatorni ham qamraydi.
- **Xavf:** unique indeks migratsiyasi tozalanmagan bazada yiqiladi — tartib qat'iy: avval birlashtirish, keyin indeks.

### F5 — Bekor qilish yo'llarini bitta servisga yig'ish *(O'RTA)*
- **Fayllar:** `lesson-billing.service.ts:778-797` → `SalaryAccrualService.reverseAccrualsByDeduction(...)`; `salary-accrual.service.ts:390-436` ga `salaryPaymentId` + status gate.
- **O'zgarish:** har uchala amal (mirror tranzaksiya + `User.balance`, gate, `recomputePaymentAmount`) bitta joyda. APPROVED/PAID da jimgina o'tib ketmasdan aniq xato tashlash yoki kompensatsion accrual.
- **Yon ish:** `enrollment-billing.service.ts:152-153` va `:255-259` dagi **yolg'on izohlarni** ("the accrual service is the closed-period gate … it throws") o'chirish — bunday gate mavjud emas.

### F6 — Hisobot bazasi ziddiyatlari *(O'RTA, kichik diff)*
- `reports-financial.service.ts:302-306` ga `reversedAt: null` + filial doirasi (⚠️ `salaryPaid` (`:300-301`) ham filialsiz — **ikkalasini birga**, aks holda yangi assimetriya). Umumiy helper: `unpaidAccrualWhere(companyId, branchIds)`.
- `getMonthly` javobiga `driftVsPayment = base − advances − Σpayment.amount`; ≠0 bo'lsa /payments/salary da ogohlantirish rozetkasi.
- Excel «Oyliklar» ga «Hisoblangan − Avans» va «Farq» ustunlari; «Tekshiruv» varag'ida `kvRow` → **haqiqiy** `checkRow` (istisnolar: `manualBasis`, `Math.max(0, …)` poli, accrualsiz FIXED_MONTHLY).
- `payments-overview.tsx:392-397` tooltipini to'g'rilash (hozir «Foyda kartasi bilan aynan bir xil asosda» deb **yolg'on** va'da beradi).

### F7 — FIXED_MONTHLY portlashini oldini olish *(O'RTA, 3 qator + 1 migratsiya)*
1. `salary-accrual.service.ts:193` dan keyin: `if (version.salaryType === 'FIXED_MONTHLY') return null;` — bu **eng arzon va eng zarur** qadam (`shared/deserved-math.ts:40` bilan xulqni tenglashtiradi).
2. `groups-write.service.ts:208-231` `assertTeachersHaveRate` FM ni «stavka» deb sanamasin.
3. `SalaryPayment.kind` (yoki `fixedMonthlyBase` ustuni) + `:302-311` tekshiruvini shunga toraytirish.
- **Test:** FM configli xodim dars berganda accrual **yozilmaydi**, oyligi esa alohida qator sifatida to'liq qo'shiladi.

### F8 — Avans nazorati *(O'RTA)*
- `expenses.service.ts:55-70`: TEACHER_ADVANCE uchun aktiv `EmployeeSalaryConfig` talab qilish (yoki hech bo'lmasa ogohlantirish + majburiy izoh).
- `/payments/salary` ga kompaniya darajasidagi «Undirilmagan avans» ko'rsatkichi (mavjud `SalarySummaryService.advancesPending` ni ishlatib, configsiz xodimlarni ham qamrab).
- `salary-calculation.service.ts:401-405`: `break` → `continue`; `Expense.settledAmount` bilan qisman yopish (past ustuvorlik).
- `applyPendingAdvances` where'iga `date: { lt: periodEndDateExclusive }` (⚠️ `createdAt` emas — prodda orqaga sanalgan avanslar bor: `date=2026-07-03`, `createdAt=2026-07-25`).

### F9 — Carry-over gate'ini davr chegarasiga ko'chirish *(O'RTA)*
- `salary-accrual.service.ts:120-175`: yopiqlikni `resolveCurrentPeriod(lessonDate)` orqali aniqlash — dars davri joriy ochiq davrdan oldin bo'lsa, to'lov qatori bor-yo'qligidan qat'i nazar carry-over. `:152-168` «ikkala davr ham yopiq» tarmog'ida `return null` o'rniga keyingi **ochiq** davrga yozish. ⚠️ Taklif qilingan «`periodStart = current.periodStart` aniq tenglik» varianti **noto'g'ri** — cycleStartDay o'zgarganda haqiqiy yopiq oynani ko'rmay qoladi.

### F10 — Qattiqlashtirish paketi *(KICHIK, bitta PR)*
`applyAccrualToBalance` ga delta-tuzatish (`amount: { gt: 0 }` + farq bo'lsa kompensatsion tx); `coveredKey` ga bekor qilingan accruallarni ham qo'shish (gap sweep tiriltirmasin); `withdrawals.service.ts:194-209` → `createManualAccrual` (carry-over + mirror + top-up davrida ikki marta to'lash ogohlantirishi); cron catch-up («oxirgi settle qilingan davrdan hozirgacha yetishmayotgan davrni topib settle qil» + CEO ga alert); cycleStartDay cutover'da eski jadval bo'yicha oxirgi davrni majburan settle qilish; `create` da orqaga sanalgan `effectiveFrom` ni taqiqlash; **narx manbasini birlashtirish** (gap sweep ham, kech to'lov yo'li ham LESSON_DEDUCTION metadatasidagi muzlatilgan `perLessonCost` ni ishlatsin — bu O3 ning ildizini yopadi).

---

## 6. DARHOL BAJARILADIGAN (bir martalik)

### 6.1 «Qayta hisoblash xavfsizmi?» — ANIQ JAVOB

| Davr | Xavfsizmi? | Nima bo'ladi |
|---|---|---|
| **May (2026-04-30T19:00Z)** | ❌ **YO'Q — qat'iy taqiqlanadi** | #10003 ning to'lovi 3 483 299 → **33 334** (−3 449 965). Qolgan 9 ta to'lov tegilmaydi (ularda bog'lanmagan accrual yo'q), lekin 694 ta bekor accrual biror yo'l bilan tiriltirilsa tepa chegara ≈ **−38 668 475**. `scripts/calculate-may.ts --apply` ni ishlatmang. |
| **Iyun (2026-05-31T19:00Z)** | ⚠️ **SHARTLI** | Davrda bog'lanmagan accrual **0 ta** → sikl umuman aylanmaydi, hech narsa o'zgarmaydi. Lekin F3 dan keyin (shartsiz recompute) u CEO ning qo'lda muzlatgan raqamlarini bosib ketadi (#10005: 4 666 794 → 4 683 461). Shuning uchun F3 `manualBasis` bilan birga chiqishi **shart**. |
| **Iyul (2026-06-30T19:00Z)** | ⚠️ **FOYDASIZ** | Hozirgi kod bilan #10007 ning +12 501 i **tuzalmaydi**: uning yagona bog'lanmagan accruallari 01.08 sanali (avgust davri), demak `byUser` iyul uchun bo'sh. Tuzatish faqat maqsadli skript yoki F3 dan keyin mumkin. |
| **Avgust (joriy)** | ✅ Normal | Ochiq davr, 23 ta bog'lanmagan accrual (410 839) — kutilgan holat. |

### 6.2 Tartib bo'yicha bajariladigan ishlar

1. **MUZLATISH (bugun):** iyun qatorlarini drawer orqali **tasdiqlamang/to'lamang** — 39 189 212 so'mlik katta qatorlar erishib bo'lmas holatga tushadi. F4-Bosqich-1 tugagunicha.
2. **Iyun dublikatlarini birlashtirish** (yuqoridagi `PAID_NET` raqamlarini saqlagan holda).
3. **#10007 iyul to'lovini tuzatish:** `amount` 9 779 382 → 9 766 881; shu bilan birga 3 ta accrual (st#10707, 16/18/21.07) ning `SALARY_ACCRUAL` tranzaksiyalari 20 834 → 16 667 (yoki −4 167 lik kompensatsion qator) va `User.balance` −12 501. **Ikkalasini birga** qiling, aks holda ledger yana ajraladi.
4. **#10003 ning 33 334 so'mi — CEO qarori kerak:** (a) `creditPeriodDate` ni joriy davrga ko'chirish (to'lash), yoki (b) qolgan 694 ta May accruali kabi `reversedAt` qo'yish (May Excel varag'i 04.05/06.05 darslarini allaqachon qamragan bo'lsa). May Excel varag'ini tekshirib hal qiling. **May ni qayta hisoblab hal qilmang.**
5. **#10653 ning 650 000 so'mi — CEO qarori kerak:** yo unga aktiv `EmployeeSalaryConfig` berib payroll orqali undirish, yo rasmiy xarajat sifatida yopish. Hozir u foydani doimiy 650 000 ga oshiq ko'rsatadi.
6. **`scripts/finalize-june-salary-display.ts` va `scripts/calculate-may.ts` ni «xavfli» deb belgilash** (fayl boshiga ogohlantirish + `--apply` ni CEO tasdig'isiz ishlatmaslik).

---

## 7. NAZORAT — avtomatik ushlash

`server/scripts/audit-finance-reconciliation.ts` ga yangi **«I»** bo'limi (⚠️ «G» band — u TO'LOV↔LEDGER uchun ishlatilgan). Har bir tekshiruv: kunlik cron + CI.

| ID | Invariant | Bugungi natija | Daraja |
|---|---|---|---|
| **I1** | Har bir non-CANCELLED `SalaryPayment` uchun `amount === Σ(linked accrual WHERE reversedAt IS NULL) − Σ(settled TEACHER_ADVANCE)`. **Istisnolar:** `manualBasis=true` (May backfill, iyun CEO raqamlari), FIXED_MONTHLY (accrual=0) | 2 ta buzilish: −16 667, +12 501 | CRITICAL |
| **I2** | Har bir tirik accrual uchun `Σ(tirik SALARY_ACCRUAL tx: attendanceId+teacherId) === accrual.amount` | 4 ta buzilish (3 tasi 20 834 vs 16 667; 1 tasida tx umuman yo'q) | CRITICAL |
| **I3** | `(userId, companyId, periodStart, periodEnd)` bo'yicha >1 non-CANCELLED to'lov yo'q | 6 ta juftlik | HIGH (unique indeksgacha) |
| **I4** | Joriy ochiq davrdan **oldingi** davrda `salaryPaymentId IS NULL AND reversedAt IS NULL` accrual yo'q (yetim detektori) | 33 334 (#10003) | HIGH |
| **I5** | `settledBySalaryPaymentId IS NULL` avans egasida aktiv `EmployeeSalaryConfig` bor | 650 000 (#10653) | HIGH |
| **I6** | `reports-financial.salary.pending === reports-balance-sheet.salariesPayable` (bitta helper) | 13 333 929 farq | MEDIUM |
| **I7** | `getMonthly` qatori: `driftVsPayment = base − advances − Σpayment.amount === 0` (UI rozetkasi + Excel «Tekshiruv» da MOS/XATO) | iyun 16 667, iyul 12 501, may 57 146 647 | MEDIUM |
| **I8** | Cron settle'dan keyin: (a) yopilgan davrda accruali bor har bir ustozda to'lov qatori bor; (b) yopilgan davr umuman to'lovsiz qolmagan (o'tkazib yuborilgan cron detektori) | Hozir toza | MEDIUM |
| **I9** | Bekor qilingan har bir `SALARY_ACCRUAL` tranzaksiyasida `reversedTransactionId` bor (audit zanjiri) | 694 ta buzilish (13 038 226) — balans to'g'ri | LOW |
| **I10** | Ommaviy tuzatish skriptlari uchun qoida: `SalaryAccrual`/ledger'ga to'g'ridan-to'g'ri yozish taqiqlanadi, faqat `SalaryAccrualService` metodlari | — | Jarayon qoidasi |

**Qo'shimcha kuzatuv maydoni:** `SalaryAccrual` da `updatedAt` ustuni **yo'q** — shuning uchun driftning qaysi mutatsiyadan kelganini keyinchalik aniqlab bo'lmaydi. `updatedAt` + `SalaryPayment` uchun `EntityHistory` (hozir kuzatiladigan entity emas) qo'shilsa, keyingi tergovlar bir necha soat emas, bir necha daqiqa oladi.

---

## OCHIQ SAVOLLAR / ZIDDIYATLAR (yashirilmagan)

1. **#10005 ning −16 667 i:** qo'lda skript (`finalize-june-salary-display.ts`) yoki snapshot drift — ikkala versiya ham arifmetik jihatdan aniq mos. Kuchli dalil skript foydasiga (PAID_NET 10/10 mos, faqat primary qatorlar yangilangan), lekin bog'langan accrualda `salaryConfigVersionId=NULL` va mirror tranzaksiya yo'qligi ham qo'lda aralashuvni ko'rsatadi. **Har ikki holatda ham tuzatish bir xil: `manualBasis` + I1 invarianti.**
2. **O3 ning ekspozitsiyasi:** ikki lens 22 ta (≈91 674) va 28 ta (≈116 676) narxi farqli accrual sanadi. Aniq raqam F1 dan oldin bir marta o'lchansin.
3. **Merge-idempotency:** kodda bor va unit-test bilan qoplangan, **lekin prodda mavjud davr uchun bir marta ham ishlamagan** — «prodda tasdiqlangan» deb hisoblamang.
4. **BR-09b backlog sana chegarasi** (`a.date < ${periodStart}`): Postgres timestamp'ni `date` ga kesadi, ya'ni chegara **bir kunga tor** — pul yo'qotmaydi, faqat davrning oxirgi kunidagi darslarni bir sikl kechiktiradi. H3 (+1,82 mln) chegara xatosining **teskarisi**, uni H3 bilan chalkashtirmang.
5. **`PRESENT→EXCUSED→PRESENT` tekin dars** (3-bo'lim oxiridagi qayd) — alohida tekshirilishi kerak, hozirgi hisobot doirasidan tashqarida.