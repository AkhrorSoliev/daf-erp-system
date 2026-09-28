# ADR-0046 — «Berilmadi», kechikish daqiqasi, sinov darsi (3.5) va qarzdorning 1-darsga kelmagani

**Holati:** Qabul qilindi
**Sana:** 2026-09-27
**Bog'liq:** ADR-0045 (davomat oynasi va darsga qo'yish — uning 2-bosqichi); shartnomaning 3.2 va 3.5-bandlari; ADR-0044 (ketish tartiblari); `server/src/salary/shared/missed-lessons.ts`, `server/src/salary/salary-missed-lessons.service.ts`, `server/src/billing/month-plan.ts`, `server/src/attendance/shared/lesson-window.ts` (`minutesLate`, `lateArrival`), `server/src/billing/departure-policy.ts`, `server/src/billing/lesson-billing.service.ts`, `server/src/billing/lesson-admission.ts`, `server/src/billing/lesson-admission.service.ts`, `server/src/salary/shared/gap-sweep.ts`

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
   yoki chetlatilsa va u barcha guruhlarda ko'pi bilan 1 ta darsga kelgan
   bo'lsa («Keldi»/«Kechikdi»; «Kelmadi» sanalmaydi — CEO, 28.09.2026),
   qaysi tartib tanlanganidan qat'i nazar oyning to'liq puli qaytadi va
   qarzi 0 bo'ladi. Ustozga ham o'sha oyning shu guruhdagi darslari uchun haq
   yozilmaydi: yozilgan haq qaytarib olinadi, faqat oylik hisob-kitobida
   allaqachon to'langani qoladi. Markaz ham qoplamaydi — o'quvchi yangi
   o'quvchi chegarasidan (4 dars) o'tmagan, shuning uchun markaz qo'shimchasi
   uni olmaydi. Admin chiqarmaguncha o'quvchi qarzdor bo'lib turadi.
   Muzlatish, guruh almashtirish va markaz yopishlari tartib bermaydi, ularga
   bu qoida qo'llanmaydi. Pul qatori: «Sinov darsi (3.5): oyning puli to'liq
   qaytarildi — X so'm».
4. **Qarzdorning 1-darsga kelmagani.** 01.10.2026 dan oylik kursda
   o'quvchining oydagi shu guruhdagi birinchi darsida (darsni hisoblagan
   oylik hisobning o'z sanalari bo'yicha, 3.2-band qoidasi) «Kelmadi» bo'lsa
   va to'lovi bu darsga yetmasa, ustozga haq yozilmaydi. «Yetadi» —
   `balans + heldAfter(kun) ≥ 0`, dars oyidan boshlab barcha CHARGED hisoblar
   bo'yicha (`firstLessonCoverage`): pul eng eski hisobni birinchi yopadi,
   shuning uchun keyingi oyning hisobi yozilgani oktabrni allaqachon yopgan
   to'lovni yashirmaydi. To'lov kelganda `processRetroactiveBillingForStudent`
   (`accrueDeferredFirstLessons`) o'quvchining barcha oylik guruhlaridagi —
   ketgan guruhlari ham — haqi yo'q shunday «Kelmadi» darslarini topib,
   endi yetsa, darsni hisoblagan yozilish bo'yicha haqni yozadi;
   `createAccrual` takrorga chidamli, yopilgan oy haqini joriy oyga
   o'tkazadi. «Kelmadi» ↔ «Keldi» tuzatishi haqni mos ravishda qaytaradi
   yoki yozadi. Markaz bunday darsni hech qachon oldindan to'lamaydi: oylik
   hisobotning prognozi ham, oylik cron'ining markaz qo'shimchasi va BR-09b
   qo'shimcha tsikli ham uni o'tkazib yuboradi (`awaitsStudentPayment`).

**Taqiqlanadi:**
- «Berilmadi» ni jadvalga saqlash yoki uni ekranda qayta hisoblash;
- kechikish daqiqasini mijozda hisoblash;
- sinov darsini `policyRelease` dan boshqa joyda hal qilish;
- qarzdorning 1-darsi haqini `firstLessonCoverage` / `awaitsStudentPayment`
  dan boshqa joyda hal qilish.

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
- «Berilmadi» guruhning hozirgi ustozlari (`GroupTeacher`) bo'yicha
  hisoblanadi: oy o'rtasida ustoz almashsa, oldingi berilmagan darslar yangi
  ustozda ko'rinadi (oylik hisobot ham ustozni shunday aniqlaydi).
- Qarzdor 1-darsga kelmagan bo'lsa, ustoz haqi o'quvchi to'lagunicha oylik
  hisobotda ham ko'rinmaydi.
- Dars oxiridagi xabarga summa, talaba kartasi va davomat hisobotiga daqiqa
  hali qo'shilmagan.
