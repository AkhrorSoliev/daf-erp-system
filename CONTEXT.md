# CONTEXT — domen lug'ati

Bu fayl **atamalarni ta'riflaydi**, amaliyotni emas. Har bir yozuv: nom →
bir-ikki jumla → kanonik fayl. Ta'rif bilan kod o'rtasida ziddiyat bo'lsa,
**kod haqiqat** — bu faylni tuzating.

Nima uchun kerak: bu yerda domen tili boy va aniq (`prepaid batch`,
`gap sweep`, `markaz qoplagani`, `carry-over`, `filial shifti`), lekin
ta'riflar ikkita 1000+ qatorli `CLAUDE.md` ichida tarqoq edi va ba'zilari
eskirgan edi. Eskirgan ta'rif shunchaki foydasiz emas — u **noto'g'ri kod
yozdiradi**: «ABSENT hisoblanmaydi» degan bitta jadval bir o'quvchi bo'yicha
haqiqiy tekshiruvga sabab bo'ldi.

Vazifalar taqsimoti:

| Fayl | Nima uchun |
|---|---|
| `CONTEXT.md` (bu fayl) | **Nima** — atamalar ma'nosi |
| `server/CLAUDE.md`, `client/CLAUDE.md` | **Qanday** — amaliyot, konvensiya, tartib |
| `docs/adr/` | **Nega** — qabul qilingan qarorlar va ularning sababi |

⚠️ belgisi — **qimmatga tushgan ta'rif**: ilgari noto'g'ri tushunilgan va
prod'da pul yoki vaqt yo'qotishga sabab bo'lgan.

---

## Ijara va qamrov (multi-tenancy)

**Company** — ijarachi (tenant). Hozir prod'da bitta: `#1001 DaF Sprachzentrum`.
Deyarli har bir jadvalda `companyId` bor; uni unutish — boshqa ijarachining
ma'lumotini ko'rsatish demakdir.
`prisma/schema.prisma`

**Branch (filial)** — kompaniya ichidagi jismoniy markaz (Farg'ona, Namangan).
Har bir yozuv **aniq bitta** filialga tegishli.
`docs/adr/0001-bir-yozuv-bitta-filial.md`

**Filial shifti (ceiling)** — chaqiruvchi **umuman** ko'ra oladigan filiallar
to'plami. CEO uchun `null` (hammasi), boshqalar uchun `UserBranch` qatorlari.
Tanlov (`X-Branch-Id`) shiftni **kengaytira olmaydi**, faqat toraytiradi.
`common/finance/report-branch-scope.ts`

**ReportBranchIds** — `number[] | null`. `null` = barcha ruxsat etilgan filiallar,
`[]` = **hech narsa** (fail-closed). Bu ikkisini adashtirish — butun kompaniya
moliyasini ochib qo'yish yoki bo'sh ekran ko'rsatish.
`common/finance/report-branch-scope.ts` · `docs/adr/0002-filial-qamrovi-fail-closed.md`

**Route siyosati manifesti** — har bir HTTP route filial siyosati bo'yicha
toifalanishi shart; toifalanmagan route build'ni yiqitadi.
`common/auth/branch-route-policy.ts` · `docs/adr/0003-route-siyosati-manifest.md`

**Filial almashuvi uch qatlamda tozalanadi** — React Query keshi
(`removeQueries`), modul darajasidagi zustand store'lar (`resetBranchScopedStores`),
va sahifa mazmunining remount'i (`BranchScopedMain`). Bittasi yetarli emas.
`client/src/components/providers/branch-query-sync.tsx`

---

## Odamlar

**User** — tizimga kira oladigan yoki oylik oladigan xodim. `Student` bilan
**ID fazosi kesishadi** (836 ta ID ikkala jadvalda ham bor) — bu dizayn bo'yicha
normal, `userId` va `studentId` ni hech qachon aralashtirmang.
`prisma/schema.prisma`

**Lavozim (position) ≠ rol (role)** — `User.position` odamning ishi
(«farrosh»), `Role` esa tizimdagi huquqi. **Rolsiz xodim oylik oladi, lekin
tizimga kira olmaydi.** Ilgari bu ikkisi bir narsa deb qaralardi.
`docs/adr/0007-lavozim-roldan-ajratilgan.md`

**Student** — o'quvchi. `Student.balance` — uning puli (manfiy = qarz).
`prisma/schema.prisma`

**Faol o'quvchi** — statusi `ACTIVE` **va** hozir faol guruhda faol yozuvi bor
o'quvchi. Statusi faol, lekin guruhsiz qolgani — «guruhlashtirilmagan»: u faol
emas, joylashtirilishi kerak. Ikki toifa **bitta** shartning `some` va `none`
ko'rinishi, shuning uchun ular ustma-ust tushmaydi va birgalikda statusi faol
hamma o'quvchini qoplaydi. Ilgari uch xil ta'rif bor edi va 496 ta o'quvchi
ikkala ro'yxatda ham turardi.
`students/shared/active-student-where.ts`

**Lead** — hali o'quvchi bo'lmagan potensial mijoz. Kanban doskasida yuradi;
ustun = filial. O'chirish = `LOST` holatiga o'tkazish + majburiy sabab.
`leads/leads.service.ts`

**Ketish sababi (exit reason)** — o'quvchi guruhdan chiqqanda majburiy
tanlanadigan sabab. Hisobotdagi «ketganlar» **enrollment** larni sanaydi
(guruh bo'yicha), o'quvchilarni emas — bitta o'quvchi ikki guruhdan chiqsa,
ikki marta sanaladi.
`student-exit-reasons/`

---

## O'quv jarayoni

**Group** — bitta kurs bo'yicha bitta jadval bilan o'qiydigan o'quvchilar
to'plami. `endDate` **avtomatik yopilmaydi** — CEO qarori bilan cron o'chirilgan.
`groups/groups.service.ts`

**Enrollment** — o'quvchining **bitta guruhdagi** a'zoligi. Pul hisob-kitobi
shu darajada yuritiladi, o'quvchi darajasida emas.
`prisma/schema.prisma`

**Attendance** — bitta o'quvchining bitta darsdagi holati:
`PRESENT` · `LATE` · `ABSENT` · `EXCUSED`.
`attendance/attendance-save.service.ts`

⚠️ **ABSENT hisoblanadi (billable).** Qoida: «dars o'tilgan bo'lsa — to'langan».
Dars bo'lib o'tganini tasdiqlaydigan **har qanday** holat kvotani sarflaydi,
o'quvchi kelgan-kelmaganidan qat'i nazar. Faqat `EXCUSED` («uzrli sabab —
kechirildi») va bekor qilingan darslar chetlab o'tiladi. Yagona haqiqat —
`BILLABLE` to'plami.
`billing/lesson-billing.service.ts`

**PlannedAbsence** — o'quvchi oldindan aytgan kelmaslik. **Attendance qatori
EMAS** — aks holda bo'lmagan dars uchun pul yechilardi va o'qituvchi qulfi
ishga tushardi. Yon jadval sifatida ishlaydi.
`planned-absences/`

**LessonCancellation / LessonReschedule** — dars bekor qilindi yoki ko'chirildi.
Ikkalasi ham yon jadval: asosiy jadvalga tegmaydi, ustidan qoplama bo'lib turadi.
`lesson-cancellations/` · `lesson-reschedules/`

**Bayram kaskadi (holiday cascade)** — bayram e'lon qilinganda, unga tushgan
darslar guruh oxiriga surib qo'yiladi. Yurish `MAX_WALK_ITERATIONS = 400` bilan
cheklangan; chegaraga yetilsa `endDate` o'zgarmaydi va log yoziladi.
`groups/group-holiday-cascade.service.ts`

---

## Pul: o'quvchi tomoni

**Ledger haqiqati** — o'quvchi balansi **qayta hisoblanmaydi**. Har bir
`Transaction` qatori qulf ostida `balanceBefore` / `balanceAfter` yozadi, va
haqiqat o'sha yerda. PROD auditi 39 516 qatorda bitta ham buzilish topmadi.
`docs/adr/0004-balans-haqiqati-ledgerda.md` · `transactions/transactions-write.service.ts`

**LESSON_DEDUCTION** — pulni **darslar to'plamiga ajratish** qatori: o'quvchi
to'laydi, N ta dars uchun pul zaxiraga olinadi.
`billing/lesson-billing.service.ts`

**LESSON_CONSUMPTION** — o'sha zaxiradan **bitta darsni sarflash** qatori.
Ikkisi boshqa narsa: birinchisi pulni ajratadi, ikkinchisi ishlatadi.
`billing/lesson-billing.service.ts`

**prepaidLessonsRemaining (oldindan to'langan qoldiq)** — o'quvchi to'lagan,
lekin hali o'tilmagan darslar soni. Bu **enrollment** maydonidir.
`prisma/schema.prisma`

⚠️ **«Ishlatilmagan darslar»ni davomatdan qayta hisoblamang.**
`darslar yechimi − PRESENT/LATE davomat` **hech qachon** ortiqcha yechim emas —
u har doim ABSENT darslar + hali zaxiradagi darslardir. 2026-08 da olib
tashlangan versiya shuni «qaytarib» berardi: 281 ta enrollment, 54.9 mln so'm.
`refunds/refunds-eligibility.service.ts`

**Bir dars narxi (per-lesson price)** — uch bosqichli qoida: (1) ACTIVE
`Contract` kelishilgan summasi, (2) kurs narxi × `discountPercent`, (3) yalang'och
kurs narxi. Bo'luvchi — `course.lessonPaymentCount || 12`.
`common/finance/per-lesson-price.ts`

**Pul qaytarish (refund)** — faqat ikki manbadan moliyalanadi: erkin balans va
`prepaidLessonsRemaining`. O'tilgan darsga ketgan pul qaytmaydi. Qaytarish
oldindan to'langan darsni **bekor qiladi**.
`refunds/refunds-create.service.ts`

**«Bu pul ketdi» (payment destination)** — ma'lum bir to'lov qayerga sarflanganini
ko'rsatadi. Ledger'ga **langarlanadi**, qayta qurilmaydi; reversal filtri va
`Math.abs` **taqiqlangan** (zanjirni uzadi).
`common/finance/ledger-replay.ts`

**Qarz (debt)** — manfiy balans. Oylik qarzdorlik hisoboti **roll-forward**
usulida quriladi (oy boshi + yangi qarz − to'langan = oy oxiri), shuning uchun
ustunlar yig'indisi to'g'ri chiqadi.
`reports/reports-debt-history.service.ts`

**To'lov va'dasi (PaymentPromise)** — qarzdor «falon kuni to'layman» deganda
ochiladigan yozuv: `OPEN → KEPT | BROKEN`.
`payment-promises/`

---

## Pul: o'qituvchi tomoni

**SalaryAccrual** — bitta dars uchun bitta o'qituvchiga hisoblangan pul.
Tabiiy kaliti `(userId, studentId, groupId, lessonDate, attendanceId)` — shu
sababli ikki marta to'lash **mumkin emas**.
`salary/salary-accrual.service.ts`

**Deserved (haqli)** — o'qituvchi o'tgan darslari uchun **haqli** bo'lgan summa,
o'quvchi to'lagan-to'lamaganidan qat'i nazar.
`salary/shared/deserved-math.ts`

**Covered (qoplangan)** — o'quvchi to'lovi bilan qoplangan accrual. Qolgani —
**gap** (bo'shliq).
`salary/shared/gap-sweep.ts`

**Gap sweep (bo'shliq supurish)** — qoplanmagan, lekin haqli darslarni topib
chiqadigan yagona funksiya. Uchala chaqiruvchi (oylik hisobot, maosh hisobi,
markaz qoplashi) **shu bitta funksiyani** ishlatadi; nusxa yozish testda
yiqiladi.
`salary/shared/gap-sweep.ts` · `salary/shared/gap-sweep.single-source.spec.ts`

**Markaz qoplagani (center top-up)** — o'quvchi to'lamagan bo'lsa ham, markaz
o'qituvchiga to'laydi (`isCenterTopUp = true`). O'quvchi keyin to'lasa, **o'sha
qator** yangilanadi (`isCenterTopUp → false`), yangisi yaratilmaydi.
`salary/salary-center-topup.service.ts`

**Carry-over (`creditPeriodDate`)** — yopilgan davrga tegishli dars uchun pul
keyin kelsa, accrual **keyingi** davrga o'tkaziladi. Yopilgan davr qayta
ochilmaydi.
`salary/salary-accrual.service.ts`

**Payroll davri va `cycleStartDay`** — oylik davr shu kundan boshlanadi.
Prod'da **1** (kalendar oyi). Kodda sozlamasiz kompaniya uchun fallback **8** —
u prod'ga ham, kalendar oyi bilan ishlaydigan modullarga ham mos kelmaydi;
yangi kompaniyaga sozlama aniq berilishi shart.
`salary/shared/resolve-current-period.ts`

**`getMonthly` — oylikning yagona manbasi.** O'qituvchi oyligini boshqa hech
qayerda hisoblamang.
`docs/adr/0006-oylik-yagona-manba.md` · `salary/salary-monthly.service.ts`

**FIXED_MONTHLY** — darsga emas, oyga bog'langan stavka. Gap sweep uni chetlab
o'tadi: o'tilmagan dars uchun «bo'shliq» tushunchasi unga tegishli emas.
`salary/shared/prorate-fixed-monthly.ts`

**Oyni yopish (settle month)** — tashqarida (naqd) berilgan oylikni tizimda
tasdiqlaydigan CEO amali.
`salary/salary-settle-month.service.ts`

---

## Hisobot

**Hisobot pastki chegarasi** — barcha hisobotlar `Company.systemStartDate` dan
boshlanadi. Undan oldingi ma'lumot muzlatilgan va hisobga olinmaydi.
`docs/adr/0005-hisobot-pastki-chegarasi.md` · `common/finance/system-start-date.ts`

**Recognized revenue (tan olingan tushum)** — shu oyda **o'tilgan** darslarning
puli. Kassa tushumidan farq qiladi: kassa — qachon pul kelgani, recognized —
qachon xizmat ko'rsatilgani.
`reports/reports-financial.service.ts`

**«Prognoz»** — bu **bashorat**, hisoblangan hisob-faktura emas. Uni «qarz» yoki
«to'lanishi kerak» deb o'qish mumkin emas.
`reports/reports-expectation.service.ts`

**«Oy oxiriga kutilyapti» (expectation)** — `expectedValue = heldValue +
remainingValue`. Chegara — **jonli `LESSON_CONSUMPTION` qatori**, davomat qatori
emas: qarzdorning darsi o'tilgan, lekin puli kelmagan, shuning uchun u «qolgan»
tomonda turadi va to'lov kelganda o'zi o'tadi.
`reports/reports-expectation.service.ts`

**«Sof foyda»** — tan olingan tushum − **haqli** (deserved) oylik − xarajat −
qaytarilgan pul. Kassa harakati emas: agar hisob yiqilsa, kartochka
«Kassa harakati» deb **qayta nomlanadi**, jimgina boshqa raqam ko'rsatmaydi.
`reports/reports.controller.ts` · `client/src/components/payments/payments-overview.tsx`

**Yig'im foizi (collection ratio)** — oyning **PLANiga** nisbatan yig'ilgan pul.
Telegram va `/overview` bitta manbadan o'qiydi.
`reports/reports-financial.service.ts`

**DailyFinancialSnapshot** — har kuni 23:40 da olinadigan surat. Tizimda
**qayta tiklab bo'lmaydigan yagona yozuv** — uni o'chiradigan skript prod
qorovuli bilan himoyalangan.
`telegram-groups/daily-snapshot.cron.ts` · `scripts/seed-dummy-snapshots.ts`

---

## Mock imtihonlar

**MockExam** — sinov imtihoni. `companyId` **bor** (uzoq vaqt «bitta ijarachi»
deb noto'g'ri hujjatlashtirilgan edi).
`mock-exams/`

**MockExamParticipant** — ro'yxatdan o'tgan ishtirokchi. `publicId` — `Student`
ketma-ketligidan olingan 5 xonali raqam; to'lov shlyuzlari **shu raqam** bo'yicha
yo'naltiradi. `feeAmount` ro'yxatdan o'tishda qotiriladi (DaF chegirmasi bilan),
shunda summa keyin siljib ketmaydi.
`mock-exams/mock-exam-participants.service.ts`

⚠️ **Mock imtihon to'lovi balansdan yechilmaydi.** Balans — **darslar** uchun
oldindan to'lov. 2026-08 imtihonida 21 o'quvchi ikki marta to'lagan edi.
`telegram/scenes/mock-exam-registration.scene.ts`

---

## Audit va integratsiya

**EntityHistory** — kim, qachon, nimani o'zgartirgani. Chaqiruvchisi yo'q
yozuv (cron, tizim) o'zini **oshkora e'lon qiladi**, odam sifatida
ko'rsatilmaydi.
`docs/adr/0008-royxatdan-otish-aktori-oshkora.md` · `common/entity-history/`

**Reversal marker** — bekor qilingan tranzaksiya **o'chirilmaydi**; unga qarshi
qator yoziladi va ikkalasi ham qoladi. Shuning uchun ledger o'qishda reversal
filtri qo'yish zanjirni uzadi.
`transactions/transactions-write.service.ts`

**Telegram guruh hisoboti** — tasdiqlangan guruh o'z `branchId` si bo'yicha
qamrovga ega. `receivesAllBranches` faqat CEO bera oladi.
`telegram-groups/group-report-scope.ts`

**`X-Branch-Id`** — client yuboradigan filial tanlovi. Sarlavha yo'qligi va
«Barcha filiallar» — bir xil holat: server buni «tanlov yo'q» deb o'qiydi va
chaqiruvchining to'liq shiftiga aylantiradi. **Qamrovni kengaytiradigan qiymat
yo'q**, shuning uchun client uni shartsiz yubora oladi.
`client/src/lib/branch-header.ts`

---

## Bu faylni yangilash

Yangi atama kiritsangiz yoki mavjudining ma'nosini aniqlashtirsangiz — shu
yerga yozing. Ta'rif **kanonik faylga** ishora qilsin: lug'at kodni
almashtirmaydi, unga yo'l ko'rsatadi.
