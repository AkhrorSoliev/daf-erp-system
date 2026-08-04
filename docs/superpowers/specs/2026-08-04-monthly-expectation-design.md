# «Oy oxiriga kutilyapti» — prognozni almashtirish (audit P5)

**Sana:** 2026-08-04
**Audit havolasi:** `docs/report-consistency-audit.md`, H2 / P5
**Holat:** dizayn tasdiqlangan, reja yozilmagan

---

## 1. Muammo

Hozirgi «Oylik prognoz» ikki jihatdan yaroqsiz.

**Noto'g'ri hisoblanadi.** `lessonsPerMonth = exactDays.length × 4` — har oy to'rt hafta deb olinadi. Besh haftalik oyda reja 8–13% kam chiqadi (iyul: kalendar bo'yicha 454 dars, kod 400). Bayramlar, bekor qilingan darslar, guruh boshi/oxiri va o'quvchining o'rtada qo'shilishi umuman hisobga olinmaydi.

**Beqaror.** Prognoz hech qayerda saqlanmaydi — har so'rovda o'sha soniyadagi `ACTIVE` enrollmentlardan qaytadan hisoblanadi. Kimdir qo'shilsa yoki ketsa, butun oyga qayta yoziladi: 25-avgustda ketgan o'quvchi go'yo hech qachon o'qimagandek raqamdan chiqib ketadi. Iyulda maxraj kamida 282 marta siljigan (150 qo'shilgan + 132 ketgan).

Natijada iyun va iyul **ikkalasi ham 115%** yig'im ko'rsatgan — maxraj har oy o'zgarmas 148.8 mln bo'lgani uchun ko'rsatkich oylarni umuman ajratmagan. (Foizning o'zi 2026-08-04 da P3 bilan tuzatildi; bu ish maxrajning qolgan qismini — prognozning o'zini — almashtiradi.)

Kod uch joyda takrorlangan:

| Fayl | Nimani boshqaradi |
|---|---|
| `reports-financial.service.ts:284` | `/overview` «Prognoz (bashorat)» + Excel |
| `telegram-group-daily-report.service.ts:647` | Telegram «Oylik prognoz (taxminiy reja)» |
| `salary-overview.service.ts:334` | `expectedMonthly` — ekranda ko'rinmaydi, ⚙ Sozlamalardagi ustozlar ro'yxatining tartibini belgilaydi |

---

## 2. Yechim

Prognoz o'chiriladi. O'rniga **«Oy oxiriga kutilyapti»** — dars qiymati asosidagi ko'rsatkich:

```
o'tilgan va qoplangan darslar qiymati       (LESSON_CONSUMPTION bor)
+ qolgan rejalangan darslar qiymati          (LESSON_CONSUMPTION yo'q)
= Kutilayotgan
```

### Nima uchun dars qiymati, kassa emas

Ikkala qism ham **ma'lum faktlardan** hisoblanadi: guruh jadvali, bayramlar, o'quvchilar ro'yxati, narx. Ichida hech qanday xatti-harakat taxmini yo'q.

Kassa bashorati esa «odatda 82% to'lanadi» degan koeffitsiyentni talab qilardi. O'sha koeffitsiyent atigi ikkita oydan olingan (iyun 81%, iyul 82%) va ichida uch xil mustaqil narsa aralashgan: oldindan to'lash odati, qarzdorlik, yangi o'quvchilarning to'liq tsikl to'lashi.

Qo'shimcha sabablar:

- **Xato chiqsa sababi ko'rinadi.** Dars qiymati adashsa — «12 o'quvchi ketdi», «bayram qo'shildi» deb qismlarga ajratish mumkin. Kassa adashsa — faqat «kam to'ladilar» deyish mumkin.
- **Boshqa raqamlar bilan bir zanjirda.** «Sof foyda» = dars tushumi − ustoz oyligi; ustoz oyligi har o'tilgan darsga bog'langan; yig'im foizining maxraji ham dars qiymati. Kassa asosidagi bashorat bu zanjirning hech bir bo'g'iniga ulanmaydi.
- **Oldindan to'lov oyni buzmaydi.** 28-avgustda 30 o'quvchi sentabr tsiklini to'lasa, kassa keskin ko'tariladi va avgust ajoyib oy bo'lib ko'rinadi — aslida pul sentabrniki. Dars qiymati esa o'zgarmaydi, chunki avgustda yangi dars o'tilmadi.
- **Eski xatoni teskari tomondan qaytarmaslik.** 115% muammosining ildizi kassa raqamini dars-shaklidagi maxrajga bo'lish edi. Bashoratni kassa-shaklga o'tkazsak, xuddi shu chalkashlik boshqa tomondan qaytadi.

Kassa yo'qolmaydi — u «Tushum (haqiqiy)» va «Yig'im %» orqali ko'rinadi. Faqat **bashorat qilinmaydi**.

### Chegara — `LESSON_CONSUMPTION`, davomat emas

O'tilgan va qolgan qismlar orasidagi chegara **to'lov yozuvi** bo'yicha o'tadi, davomat yozuvi bo'yicha emas:

| Holat | Qayerga tushadi |
|---|---|
| Davomat bor + tirik `LESSON_CONSUMPTION` bor | **O'tilgan** |
| Davomat bor, `LESSON_CONSUMPTION` yo'q (qarzdor) | **Qolgan** |
| Davomat yo'q, jadval bo'yicha dars kuni | **Qolgan** |
| Bayram / bekor qilingan dars / guruh hayot siklidan tashqari | **Hech qayerda** |

Nega davomat emas: davomat olingan, lekin o'quvchi qarzdor bo'lsa, pul hali kelmagan. Uni «o'tilgan» deb sanasak, u ikkala tarafdan ham tushib qolardi — chunki «o'tilgan» qiymati `getRecognizedRevenue` dan olinadi, u esa faqat qoplangan darslarni sanaydi.

Bu chegara bilan oyning har bir rejalangan dars-o'rni **aynan bir marta** sanaladi. O'quvchi to'laganda dars «qolgan» dan «o'tilgan» ga ko'chadi — **yig'indi o'zgarmaydi**.

Amaliy holat (2026-08-04 da prodda o'lchangan): iyun/iyul/avgustda qoplanmagan bitta ham dars yo'q. Ya'ni bu chegara bugun hech narsani o'zgartirmaydi — kelajakda teshik ochilmasligini kafolatlaydi.

### Sana chegarasi yo'q

«Bugungacha» / «bugundan keyin» degan sana bo'linishi ishlatilmaydi. Shu tufayli:

- soat 10:00 da qaralsa, bugungi darslar hali «qolgan» tarafda; 21:00 da — «o'tilgan» tarafda
- o'tgan haftada kiritilmay qolgan davomat «qolgan» tarafda turadi va kiritilgach o'z-o'zidan ko'chadi

O'qituvchi davomatni kech kiritgani uchun raqam sakramaydi.

---

## 3. Arxitektura

### Yangi servis

`server/src/reports/reports-expectation.service.ts` — mavjud nomlash naqshiga mos (`reports-financial`, `reports-overview`, `reports-payments`).

```
getMonthlyExpectation(companyId, { month, branchIds }) → {
  month: string,
  heldValue: number,
  remainingValue: number,
  expectedValue: number,
  heldLessons: number,
  remainingLessons: number,
}
```

Nima uchun alohida servis, `getIncomeMonthAttribution` ichida emas: u yerda og'ir ledger qayta o'ynatish bor, faqat bashorat kerak bo'lgan chaqiruvchi uni bekorga to'lardi.

### Hisoblash

`heldValue` — mavjud `ReportsFinancialService.getRecognizedRevenue(companyId, { start, end, branchIds })`. U 2026-08-04 da filial qamroviga moslandi (H33), shuning uchun filial kesimi tayyor.

`remainingValue` — ommaviy, guruh boshiga alohida so'rovsiz:

1. Qamrovdagi aktiv guruhlar: `exactDays`, `startDate`, `endDate`, `scheduleSnapshots`, `course { price, lessonPaymentCount }`, aktiv enrollmentlar (`student.discountPercent`), aktiv `contracts`
2. Oyning bayramlari — bitta `HolidaysService.buildHolidayDateSet(monthStart, monthEnd)`
3. Oyning davomatlari + ularning tirik `LESSON_CONSUMPTION` yozuvlari
4. Oyning `LessonCancellation` yozuvlari
5. Har guruh uchun xotirada kalendar bo'ylab yurish. Dars kunlari `buildScheduleDayResolver(group.scheduleSnapshots, group.exactDays)` orqali aniqlanadi — jadval o'zgargan bo'lsa tarixiy jadval qo'llanadi

Hajm: ~200 guruh × ~12 qolgan sana × ~15 o'quvchi ≈ 36 000 element xotirada.

**Ro'yxat (kim sanaladi) sanaga qarab ikki xil olinadi:**

- **Davomat bor sanalar** — ro'yxat davomat qatorlarining o'zidan. Tirik `LESSON_CONSUMPTION` bor qatorlar `heldValue` da (`getRecognizedRevenue` orqali), qolganlari ro'yxat narxi bo'yicha `remainingValue` ga qo'shiladi.
- **Davomat yo'q sanalar** — ro'yxat **bugungi aktiv enrollmentlardan**. Kelajakdagi ketish/qo'shilish modellashtirilmaydi: «odatda 5% ketadi» kabi tuzatma **kiritilmaydi**, chunki u xato chiqqanda sababini ajratib bo'lmaydigan yashirin taxmin bo'lardi. Ro'yxat o'zgarsa, ertangi hisob uni o'zi aks ettiradi.

**O'tib ketgan, lekin davomati kiritilmagan sanalar `remainingValue` da qoladi.** Sabab: o'qituvchi davomatni kech kiritishi odatiy hol (buning uchun alohida eslatma cron bor), va uni chiqarib tashlasak raqam ma'lumot kiritish kechikishidan sakrardi. Haqiqatan o'tmagan dars esa `LessonCancellation` orqali yoziladi va allaqachon chiqarib tashlanadi.

**`remainingLessons` va `heldLessons` birligi — o'quvchi-dars** (guruh × sana × o'quvchi), guruh-dars emas. Ya'ni 15 o'quvchili guruhning bitta darsi 15 birlik. Qiymat bilan bir birlikda bo'lishi uchun shunday.

### Narxlash

Bir dars narxi zanjiri: aktiv `Contract.totalAmount / lessonPaymentCount` → `Course.price / lessonPaymentCount × (100 − Student.discountPercent) / 100` → `Course.price / lessonPaymentCount`.

Bu zanjir hozir `reports-financial.service.ts` va `telegram-group-daily-report.service.ts` da **nusxalangan**. Ikkala nusxa ham o'chadi; o'rniga `server/src/common/finance/` da bitta sof yordamchi.

### O'chiriladigan kod

- `reports-financial.service.ts` dagi `recognizedRevenueForecast` walk va `expectedIncome`
- `telegram-group-daily-report.service.ts` dagi `computeMonthlyForecast`
- `salary-overview.service.ts:334` dagi `computeExpectedMonthly` — u faqat ⚙ Sozlamalardagi ustozlar ro'yxatining tartibini belgilaydi va ekranda ko'rinmaydi. Tartiblash kaliti aktiv o'quvchilar soniga o'tkaziladi; tartib uchun pul raqami kerak emas.

---

## 4. Ko'rinadigan joylar

Hamma joyda eski prognoz qatori **almashtiriladi**, yangi qator qo'shilmaydi.

**Telegram 21:00** — «Oy boshidan» bloki:

```
• Tushum (haqiqiy): ...
• Xarajat: ...
• Sof foyda: ...
• Shu oyning darslari: ...
• Shundan yig'ildi: ... (N%)
• Oy oxiriga kutilyapti: ...        ← eski «Oylik prognoz (taxminiy reja)» o'rnida
```

**`/payments/overview`** — «Tushum ko'rsatkichlari» kartasidagi «Prognoz (bashorat)» qatori. Tooltip ham yangilanadi (hozirgisi «barcha aktiv o'quvchi to'liq oy dars olsa kutiladigan summa» deydi — bu aynan tuzatilayotgan noto'g'ri ta'rif).

**Excel** — xuddi shu almashtirish.

**Telegram `rm:cfin`** — `telegram-group-report-menu.service.ts:294` dagi «Kutilgan (prognoz)».

Ikkita bir-biriga o'xshash raqam saqlanmaydi — bu aynan davolanayotgan kasallik.

---

## 5. Kunlik surat

`DailyFinancialSnapshot` ga uchta ustun: `expectedValue`, `lessonsHeldValue`, `collectedForMonth`.

Foiz **saqlanmaydi** — u shu ikkitasidan chiqadi. Saqlansa, komponentlari bilan zid bo'lib qolishi mumkin.

### Filial kesimi

Yangi ustun `branchId Int?` — `NULL` = kompaniya bo'yicha umumiy qator.

Postgres UNIQUE ichida NULL larni bir-biridan farqli deb hisoblaydi, shuning uchun `@@unique([companyId, branchId, date])` kompaniya qatorining takrorlanishini to'xtatmaydi. Ikkinchi qo'riqchi sifatida **qisman unikal indeks** kerak:

```sql
CREATE UNIQUE INDEX daily_snapshot_company_row_unique
  ON "DailyFinancialSnapshot" ("companyId", "date")
  WHERE "branchId" IS NULL;
```

Loyihada qisman unikal indeks naqshi allaqachon ishlatilgan (`tx_consumption_per_attendance_unique`, `tx_initial_balance_per_student_unique`).

Mavjud ustunlar (`totalDebt`, `debtorCount`, `activeStudents`, `mtdIncome`) ham filial kesimida hisoblanadi — yarim filialli surat eng yomon variant bo'lardi.

**Sabab:** surat — orqaga tiklab bo'lmaydigan yagona narsa. Boshqa hamma raqamni keyin qayta hisoblash mumkin, buni yo'q. Bugun filial qatorlari hech qayerda o'qilmaydi (tarix ekrani yo'q), lekin Namangan ishga tushganda tarix tayyor bo'ladi.

**Narxi:** har filial faqat o'z qatorlarini o'qiydi, ya'ni umumiy ish ko'paymaydi. Bugungi holatda kechasiga ~12 soniya (2 filial + kompaniya).

### Yozilish yo'li Telegramdan ajratiladi

Hozir `persistSnapshot` faqat Telegram xabari **muvaffaqiyatli yuborilgandan keyin** chaqiriladi, kunlik cron esa yakshanba va bayramlarda umuman ishlamaydi. Ya'ni o'sha kunlari surat yo'q — va agar oyning oxirgi kuni yakshanbaga tushsa, «oy yopilish raqami» yo'qoladi.

Surat o'z cronidan **har kuni** yoziladi, Telegramdan mustaqil. Telegram yo'li endi surat yozmaydi.

Yo'l-yo'lakay bu auditdagi **H26** ni yopadi: hozir dushanba kunlari qarz «▲» belgisi uch kunlik o'zgarishni ko'rsatadi, xabarda esa «kechagi kundan» ma'nosi bor.

### Oy yopilishi

Alohida «oyni yopish» vazifasi kerak emas: **oyning oxirgi kunidagi surat — o'sha oyning yopilish raqami.** U bazada qoladi va o'zgarmaydi.

Kechikkan to'lovlar tirik raqamni keyin ham siljitadi (sentabrda to'langan pul avgustdagi darsni qoplaydi → avgustning `lessonsHeldValue` i o'sadi). Bu ziddiyat emas — ikkalasi ham ko'rsatiladi va farqi «yopilgandan keyin qancha undirdik» degan ma'noni beradi. Markazda bu naqsh bor: `/payments/debt-history` oy oxiridagi qarzni muzlatib, undirilganini alohida ustunda ko'rsatadi.

---

## 6. Kesh

**«Kutilayotgan» kunlik keshga o'tadi** — `net-profit-cache.ts` naqshi: kalit `(companyId, branchId, monthKey)`, muddat Toshkent yarim tunigacha, Redis ishlamasa hisoblab beradi (hech qachon xato qaytarmaydi).

Xavfsiz, chunki bu raqam kun ichida deyarli qimirlamaydi: to'lov kelganda dars «qolgan» dan «o'tilgan» ga ko'chadi, **yig'indi o'zgarmaydi**.

**Yig'im foizi keshlanmaydi.** U to'lovga sezgir va darhol o'zgarishi kerak — bir kunga muzlatilsa, kassir 5 mln kiritib raqam qimirlamaganini ko'radi.

---

## 7. Qamrovdan tashqarida

### Muzlatilgan reja jadvali — qilinmaydi

Auditning 3-bo'limida `MonthlyPlanSnapshot` taklif qilingan edi. Rad etildi: reja yozilgan zahoti eskiradi va uning yagona foydasi («oy boshida nima kutgandik») kunlik suratning oyning 1-kunidagi qatoridan bepul olinadi. Alohida jadval, migratsiya va oylik cron ortiqcha.

### Ledger qayta o'ynatish chegarasi — keyinroq, alohida ish

`getIncomeMonthAttribution` har to'lovchining **butun tarixdagi** tranzaksiyalarini yuklaydi (sana filtri yo'q — FIFO qarz yoshlanishi boshidan boshlanishi kerak). O'lchangan: 400 o'quvchida ~4 soniya.

Tarixni kesish «qayta o'ynatilgan balans = `Student.balance`» invariantini buzadi — har o'quvchi uchun kesish nuqtasidagi **ochilish balansi** mexanizmi kerak bo'ladi. Bu o'z-o'zicha alohida loyiha.

Kodga aniq izoh yoziladi: ~2000 o'quvchidan oshganda ochilish-balans mexanizmi kerak.

### Backfill kerak emas

Yopilgan oy uchun qolgan dars yo'q, ya'ni `Kutilayotgan = haqiqiy`. Iyun va iyul avtomatik to'g'ri chiqadi.

---

## 8. Tekshirish

**Unit testlar** (`reports-expectation.service.spec.ts`):

- kalendar yurishi: 4 haftalik oy vs 5 haftalik oy
- bayram dars kuniga tushsa chiqarib tashlanadi
- `LessonCancellation` chiqarib tashlanadi
- jadval o'zgarish tarixi: `GroupScheduleSnapshot` bor guruhda o'tgan sanalar eski jadval bo'yicha
- guruh hayot sikli: `startDate` dan oldingi va `endDate` dan keyingi sanalar sanalmaydi
- chegara: qoplanmagan davomat «qolgan» tarafda, qoplangani «o'tilgan» tarafda
- filial qamrovi: bo'sh qamrov 0 qaytaradi, `null` qamrov filtrlamaydi
- narxlash zanjiri: shartnoma → chegirma → kurs narxi

**O'z-o'zini tekshirish:** yopilgan oy uchun `expectedValue` **aynan** `heldValue` ga teng bo'lishi shart (`remainingValue = 0`). Iyul va iyunda tekshiriladi.

**Orqaga sinov skripti** (faqat-o'qish): iyulning har kuni uchun «o'sha kuni nima bashorat qilingan bo'lardi» hisoblanadi va haqiqiy 173 783 991 ga qanchalik yaqinlashgani ko'rsatiladi. Bashoratning ishonchliligi raqam bilan o'lchanadi.

**Regressiya qo'riqchisi:** `reports-branch-scope-coverage.spec.ts` — yangi servisning har bir so'rovida filial predikati borligi tekshiriladi (mavjud naqsh).

---

## 9. Migratsiya

Ikkita o'zgarish:

1. `DailyFinancialSnapshot` ga `branchId Int?`, `expectedValue Int?`, `lessonsHeldValue Int?`, `collectedForMonth Int?`
2. Qisman unikal indeks (yuqorida)

Loyihada `prisma migrate dev` ishlamaydi — `diff` + `db execute` + `resolve` naqshi ishlatiladi (`docs/` va oldingi migratsiyalarga qarang).

Mavjud qatorlarda `branchId` `NULL` bo'lib qoladi — ular kompaniya qatorlari, ya'ni ma'no jihatdan to'g'ri. Yangi ustunlar `NULL` — «o'sha kuni hisoblanmagan» degani, bu rost.

---

## 10. Bosqichlarga bo'lish

Ish ikkita mustaqil bo'lakka bo'linadi va ular alohida deploy qilinishi mumkin:

**A — hisob va ko'rsatish.** Yangi servis, narxlash yordamchisi, uchta eski prognoz nusxasini o'chirish, to'rtta yuzada almashtirish, kesh, testlar. Migratsiya talab qilmaydi.

**B — kunlik surat.** Migratsiya (`branchId` + uchta ustun + qisman indeks), suratni Telegramdan ajratish, filial kesimida yozish. H26 shu bo'lakda yopiladi.

A o'z-o'zicha to'liq foydali — «Kutilayotgan» darhol to'g'ri ko'rinadi. B esa tarix to'plashni boshlaydi. A ni oldin chiqarish mantiqan to'g'ri: migratsiyasiz, xavfi kam va natijasi darhol ko'rinadi.

---

## 11. Ochiq savol yo'q

Dizayn tasdiqlangan: dars qiymati asosi, `LESSON_CONSUMPTION` chegarasi, filial kesimidagi kunlik surat, kesh faqat «Kutilayotgan» uchun, muzlatilgan reja va ledger chegarasi qamrovdan tashqarida.
