# ADR-0046 — «Berilmadi», kechikish daqiqasi, sinov darsi (3.5) va qarzdorning 1-darsga kelmagani

**Holati:** Qabul qilindi
**Sana:** 2026-09-28
**Bog'liq:** ADR-0045 (davomat oynasi va darsga qo'yish — uning 2-bosqichi); shartnomaning 3.2 va 3.5-bandlari; ADR-0044 (ketish tartiblari); `server/src/salary/shared/missed-lessons.ts`, `server/src/salary/salary-missed-lessons.service.ts`, `server/src/billing/month-plan.ts`, `server/src/attendance/shared/lesson-window.ts` (`minutesLate`, `lateArrival`), `server/src/billing/departure-policy.ts`, `server/src/billing/lesson-billing.service.ts`, `server/src/billing/lesson-admission.ts`

## Kontekst

ADR-0045 davomatni dars tugashi bilan yopdi va to'lovsiz o'quvchini 2-darsdan
to'xtatdi. To'rtta narsa keyingi bosqichga qoldirilgan edi:

1. Davomat olinmagan dars uchun ustoz haq olmaydi, lekin buni hech qayerda
   ko'rmaydi: dars yo'q, pul ham yo'q, sabab yozilmagan.
2. Administrator ustoz saqlagandan keyin kelgan o'quvchini «Keldi» qiladi —
   kechikkani va necha daqiqa kechikkani yo'qoladi.
3. Shartnoma 3.5: birinchi marta kelgan o'quvchi birinchi darsdan keyin
   ketsa, hech narsa to'lamaydi. Hozir oyning to'liq puli yechiladi va
   ketishda faqat o'tilmagan darslar qaytadi.
4. Oyning 1-darsini markaz ustozga qoplaydi — ADR-0045 buni «faqat o'quvchi
   kelgan bo'lsa» deb qo'ygan edi, kod esa kelmagan (ABSENT) qarzdor uchun ham
   haq yozardi.

## Qaror

1. **«Berilmadi» — o'qishda hisoblanadi, saqlanmaydi.** Jadval ham, cron ham
   yo'q. Ustozning guruhlari (`GroupTeacher`) bo'yicha oyning rejalangan
   darslari (`resolveMonthPlan` + `lessonDatesInMonth`, guruhning boshlanish
   va tugash sanasi ichida) olinadi; 01.10.2026 dan boshlab, bugundan oldingi
   kunlar. Shu kun uchun guruhda birorta ham davomat qatori bo'lmasa — dars
   berilmagan. O'rinbosar (`LessonTeacherOverride`) bu ustozsiz berilgan dars
   hisobga olinmaydi. Summa: oylik hisobi (CHARGED) shu kunni qoplagan,
   muzlatib chiqarilmagan va oldindan «Sababli» belgilanmagan har o'quvchi
   uchun ustoz ulushi (`perLessonAccrual`, stavka avval guruhniki, keyin
   umumiy). Hech kim to'lamagan dars ro'yxatga chiqmaydi. Natija
   `getMonthlyForUser` javobida `missedLessons` sifatida keladi va ustozning
   oylik panelida ko'rsatiladi.
2. **Kechikish daqiqasi.** `Attendance.lateMinutes` (bo'sh bo'lishi mumkin).
   Dars davomati allaqachon olingan bo'lsa, saqlovchi faqat ustoz bo'lmasa va
   o'quvchi darsda bo'lmagan holatdan «Keldi» yoki «Kechikdi» ga o'tsa — qator
   «Kechikdi» bo'ladi va daqiqa darsning haqiqiy boshlanishidan hisoblanadi
   (faqat > 0 bo'lsa). «Kechikdi» saqlansa daqiqa qoladi, boshqa holatga
   o'tsa o'chadi. `allowClosedLesson` bilan ishlaydigan tuzatish dasturi
   daqiqa yozmaydi. Ro'yxat va nuqtalar javobida bor; ekranda
   «N daqiqa kechikdi».
3. **Sinov darsi (3.5).** 01.10.2026 dan boshlab o'quvchi guruhdan chiqarilsa
   yoki chetlatilsa va uning barcha guruhlardagi hisoblanadigan davomati
   (Keldi/Kechikdi/Kelmadi) 1 tadan oshmasa — qaysi tartib tanlanganidan
   qat'i nazar oyning to'liq puli qaytadi (sifat shikoyati yo'li). Muzlatish,
   guruh almashtirish va markaz yopishlari tartib bermaydi, ularga bu qoida
   qo'llanmaydi. Ustoz haqi tegilmaydi — markaz to'laydi. Pul qatori:
   «Sinov darsi (3.5): oyning puli to'liq qaytarildi — X so'm».
4. **Qarzdorning 1-darsga kelmagani.** 01.10.2026 dan oyning shu guruhdagi
   birinchi darsida «Kelmadi» bo'lgan va to'lovi bu darsga yetmagan
   (`balans + heldAfter(kun) < 0`, `lessonAdmission` ning `covered` belgisi)
   o'quvchi uchun ustozga haq yozilmaydi. To'lov kelganda
   `processRetroactiveBillingForStudent` oylik yozilishlar uchun shunday
   darslarni (haqi yo'q «Kelmadi», endi `covered`) topib haqni yozadi;
   `createAccrual` takrorga chidamli, yopilgan oy haqini joriy oyga o'tkazadi.
   «Kelmadi» ↔ «Keldi» tuzatishi haqni mos ravishda qaytaradi yoki yozadi.

**Taqiqlanadi:**
- «Berilmadi» ni jadvalga saqlash yoki uni ekranda qayta hisoblash;
- kechikish daqiqasini mijozda hisoblash;
- sinov darsini `policyRelease` dan boshqa joyda hal qilish;
- qarzdorning 1-darsi haqini `lessonAdmission` ni chetlab o'tib hal qilish.

## Ko'rib chiqilgan muqobillar

- **«Berilmadi» ni kechasi yozib qo'yish** (dizayn hujjatida shunday edi).
  Ikkinchi nusxa bo'lardi: kalendar va davomat allaqachon saqlangan, yozuv
  ular bilan kelishmay qolishi mumkin.
- **Kechikishni har saqlashda qayta hisoblash.** Administrator keyinroq
  tuzatsa, daqiqa o'zgarib ketardi — birinchi yozilgan daqiqa saqlanadi.
- **Sinov darsini muzlatish va almashtirishga ham qo'llash.** O'quvchi
  ketmayapti: almashtirishda yangi guruh puli yechiladi, muzlatishda
  qaytganda oy qayta hisoblanadi.

## Oqibatlari

**Yutuq:** ustoz nima uchun haq olmaganini ko'radi; kechikish statistikasi
yig'iladi; sinov darsi shartnomaga mos; markaz kelmagan qarzdor uchun ustozga
pul bermaydi.

**Narx:**
- «Berilmadi» har ochilishda bir necha so'rov qiladi (bitta ustoz, bitta oy).
- Muzlatilgan yoki ketgan o'quvchi keyin to'lasa, 1-darsga kelmagan kuni
  uchun ustoz haqi avtomatik yozilmaydi (faqat faol yozilishlar ko'riladi).
- Dars oxiridagi xabarga summa, talaba kartasi va davomat hisobotiga daqiqa
  hali qo'shilmagan.
