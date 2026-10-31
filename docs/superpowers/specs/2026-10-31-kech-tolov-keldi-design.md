# Kech to'lov: to'lov yetgan davomatsiz darslar «Keldi», ustozga haq yo'q

Sana: 2026-10-31. Holati: loyiha, CEO ko'rigini kutadi.
Bog'liq: ADR-0047 (darsga qo'yish), ADR-0064 (50%), ADR-0062 (oylik hisob), ADR-0142 (davomat olib bo'lmagan darslar), ADR-0054 (ustoz haqi qulfi), shartnoma 3.2.

## 1. Muammo

To'lamagan o'quvchini oyning 2-darsidan davomatga qo'yib bo'lmaydi (ADR-0047). Uning shu darslarda davomat qatori bo'lmaydi. O'quvchi keyin to'lov qilsa ham, qatorlar yo'q qoladi:

- Profilda bu kunlar binafsha («To'lov yo'q») bo'lib qoladi yoki umuman ko'rinmaydi, garchi o'quvchi ularning pulini to'lagan bo'lsa ham.
- Har yangi to'lov kelganda yana shu takrorlanadi: qarz doim eski darslarni yopadi, yangi darsga yetmaydi, o'quvchi davomatga tushmaydi.

Prod hisoboti (31.10, faqat o'qish, `scripts/audit-late-payers.ts`): 183 o'quvchi kech to'lagan, 439 ta darsga to'lovi yetgan, lekin davomat qatori yo'q. Misol #10882: oktabrda faqat 02.10 da davomatda, 26.10 dagi to'lov 05–14.10 dagi 5 darsni qoplaydi, 16.10 dan keyingi darslar qarz (−233 330).

## 2. Qoidalar (CEO, 31.10.2026)

1. **Davomat olib bo'lmagan dars ham to'lanadi.** Online yoki naqd, admin kiritadimi yoki o'quvchi o'zi to'laydimi, farqi yo'q. Shartnoma 3.2 shuni aytadi. Hech qanday dars hisobdan chiqarilmaydi.
2. **To'lov yetgan dars «Keldi» bo'ladi.** To'lov kelganda, eski qarz avval yopiladi (ADR-0047 tartibi). To'lov yetgan har bir davomatsiz o'tgan dars avtomatik «Keldi» deb yoziladi.
3. **Bu darslar uchun ustozga haq yozilmaydi.** Pul to'liq markazga qoladi. Markaz ham haqni qoplamaydi.
4. **Avtomatik pauza hozircha o'chiq.** Kod qoladi, sozlama o'chiq (CEO 31.10 da o'chirgan).

## 3. Nima quriladi

### 3.1 «Davomatsiz dars» ta'rifi (o'zgarmaydi)

`barredLessonDays` (ADR-0142) bilan bir xil: oylik hisob shu kunni qoplaydi, kun hisobdan chiqarilmagan, ustoz shu kuni guruhga davomat olgan, o'quvchida shu kunga qator yo'q, kun 01.10.2026 dan keyin. Yangi ta'rif yozilmaydi.

### 3.2 To'lov kelganda «Keldi» yozish

`LessonBillingService.processRetroactiveBillingForStudent` hamma to'lovda ishlaydi: naqd (`POST /payments`), Payme, Click va biriktirilgan to'lov (`createFromExternal`). Shu metod boshiga yangi bosqich qo'shiladi: `markPaidBarredLessons(tx, studentId, companyId, performedById)`. U to'lovning o'z Serializable tranzaksiyasida ishlaydi.

1. O'quvchining FAOL oylik yozilishlari uchun davomatsiz kunlarni topadi (3.1). Faqat qo'lda olingan davomat (MANUAL) hisobga olinadi va o'quvchi davomat olingan paytda guruhda bo'lgan bo'lishi kerak: shunda u o'sha paytda blok bo'lgani aniq (`leftOutAfterEnd` qoidasi). Faqat tugagan darslar olinadi: bugungi dars `effectiveLessonTimes` bo'yicha tugagan bo'lsa olinadi, aks holda yo'q.
2. Har kun uchun `LessonAdmissionService.forLessons(..., tx)` hukmini o'qiydi. Bu yangi balansni ko'radi. Hukm «qo'yiladi» bo'lsa, kunning puli yetgan.
3. Puli yetgan har kun uchun `Attendance` qatori yoziladi:
   - `status: PRESENT`, `markedMethod: MANUAL`, `markedById` = to'lovni kiritgan xodim (Payme/Click uchun `null`);
   - `note: "To'lov keyin keldi — ustozga haq yozilmaydi"`;
   - `teacherPayWaived: true` (yangi ustun, 3.3).
4. `bill()` CHAQIRILMAYDI. Oylik kursda davomat balansni o'zgartirmaydi, oyning puli oylik hisobda allaqachon yozilgan.
5. Guruh davomati tarixiga (`GroupAttendance`) har guruh uchun bitta yozuv: `DAVOMAT_KECH_TOLOV`, o'quvchi, sanalar, «ustozga haq: yozilmaydi».
6. O'quvchiga xabar yuborilmaydi (`attendance.student.recorded` chiqarilmaydi).

Faqat FAOL yozilishlar olinadi. Guruhdan ketgan o'quvchi qarzini to'lasa, bu darsga kelganini anglatmaydi. Shuning uchun uning darslari belgilanmaydi.

### 3.3 Ustoz haqi qulfi (migratsiya)

`Attendance.teacherPayWaived Boolean @default(false)`. Migratsiya `ADD COLUMN IF NOT EXISTS`, eski qatorlar `false`.

Ikki qulf, ADR-0054 qulflari bilan yonma-yon:

- `SalaryAccrualService.createAccrual`: `attendanceId` qatori `teacherPayWaived` bo'lsa, `null` qaytaradi. Hamma haq yozish yo'li shu yerdan o'tadi: jonli davomat, kechiktirilgan haq, o'rinbosar ustoz, markaz qoplashi. Admin keyin bu qatorni «Kelmadi» yoki «Kech» ga o'zgartirsa ham haq yozilmaydi.
- `sweepGapLessons`: `attendances[]` elementiga majburiy `teacherPayWaived: boolean` maydoni qo'shiladi va bunday dars o'tkazib yuboriladi. Uchala chaqiruvchi (`salary-monthly`, `salary-calculation`, `salary-center-topup`) maydonni tanlashga majbur bo'ladi. Aks holda oylik sahifasi markaz haqni qoplashini ko'rsatadi, cron esa yozmaydi.

«Sababli» ga o'zgartirilsa, qator oddiy «Sababli» bo'lib ishlaydi (oylik krediti). Bayroq qoladi, haq baribir yozilmaydi.

### 3.4 Davomat formasidagi ogohlantirish

O'qituvchi bu matnni allaqachon ko'radi: «Agar u darsda o'tirsa va keyinroq to'lov qilsa ham, bu dars uchun sizga ish haqi yozilmaydi» (`attendance-admission.ts`). Admin hozir faqat to'lov taklifini ko'radi. Admin matniga bitta jumla qo'shiladi: «Hozir to'lamasa, keyingi to'lov bu darsni yopadi, lekin ustozga haq yozilmaydi.» Yangi komponent kerak emas.

### 3.5 ADR-0142 dagi «hisobdan chiqarish» olib tashlanadi

Bu 1-qoidaga zid. Prodda hech qachon ishlamagan: `BARRED_LESSONS` yozuvi 0 ta. Shuning uchun olib tashlanadi:

- avto-pauza cronidagi `barredCharge.release(...)` chaqiruvi;
- `BarredLessonsChargeService` (`release`, `restore`, `releasedDays`, `outstandingForStudent`) va spec;
- `GET/POST /students/:id/barred-lessons[/restore]` va route-manifest qatorlari;
- client: `restore-barred-lessons-dialog.tsx`, `student-barred-lessons-prompt.tsx`, profildagi «hisobdan chiqarilgan» halqasi;
- `absence.barred.restoreDialog` katagi (sozlama sahifasi va server kaliti).

Qolganlari qoladi: binafsha nuqta, 1–2-dars xabarlari, avto-pauza (o'chiq).

### 3.6 O'tganlarni tuzatish (bir martalik skript)

`scripts/backfill-late-payer-attendance.ts` 3.2 dagi `markPaidBarredLessons` funksiyasini chaqiradi. Ikkinchi qoida yozilmaydi.

- Standart rejim — quruq ishga tushirish: o'quvchi, guruh va kunlar ro'yxatini chiqaradi, hech narsa yozmaydi.
- `--apply --expect=N`: N quruq ishga tushirish ko'rsatgan darslar soni. Yangi hisob farq qilsa, yozmasdan to'xtaydi.
- Har o'quvchi o'z tranzaksiyasida yoziladi. Biri yiqilsa log qilinadi, qolganlari davom etadi.
- Avval faqat #10882 (`--student=10882`), keyin CEO ro'yxatni ko'rib chiqqach, hammasi.

Kutilgan natija (31.10 holati): 183 o'quvchi, 439 dars. Hech kimning balansi va qarzi o'zgarmaydi. #10882: 05, 07, 09, 12 va 14.10 «Keldi», qarz −233 330 qoladi.

## 4. Nima o'zgarmaydi

- Balans, qarz, oylik hisob: hech bir so'm siljimaydi.
- Darsga qo'yish qoidasi (ADR-0047, ADR-0064).
- To'lov qilmagan o'quvchilar: binafsha nuqta qoladi.
- Daromad hisoboti: «Keldi» qatori o'tgan darsni ko'rsatadi, daromad avvalgidek oylik hisobdan.

Ta'sir: bu darslar «Keldi» sifatida davomat foiziga va «N/M keldi» ga kiradi. CEO qarori shu: to'lagan o'quvchi kelgan deb hisoblanadi.

## 5. Sinov

- Unit: `markPaidBarredLessons` — to'lov yetgan kunlar «Keldi» bo'ladi, yetmaganlar qolmaydi, tugamagan bugungi dars olinmaydi, qayta chaqirish hech narsa qo'shmaydi.
- Unit: `createAccrual` `teacherPayWaived` qatorga `null`; `sweepGapLessons` bunday darsni o'tkazib yuboradi.
- Throwaway bazada (AppModule bilan): #10882 ga o'xshash o'quvchi, 26.10 to'lovi, natija 5 «Keldi», 0 `SalaryAccrual`, balans o'zgarmagan; keyin oylik cron ham haq yozmaydi.
- Prodga chiqqach: skript quruq ishga tushiriladi, CEO ro'yxatni ko'radi, keyin `--apply`.

## 6. ADR

Yangi ADR-0143 shu PR'da. ADR-0142 ning «pauzada hisobdan chiqarish» va «qaytish oynasi» qismlari almashtiriladi.
