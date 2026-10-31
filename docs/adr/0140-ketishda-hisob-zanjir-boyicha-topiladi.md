# 0140. Ketishda oy hisobi yozilishlar zanjiri bo'yicha topiladi

- Holati: Qabul qilindi
- Sana: 2026-10-30
- Bog'liq: [0043](0043-shartnoma-6-2-40-foizdan-keyin-pul-qaytmaydi.md) (ketish qoidasi), [0062](0062-oylik-yozilish-sikl-emas-oy.md) (oylik hisob), [0137](0137-guruh-almashganda-kun-bir-marta-hisoblanadi.md) (guruh almashganda kun bir marta), `server/src/billing/monthly-charge.service.ts` (`loadDepartureInput`, `datesPaidByOtherCharges`, `reverseChargeForDeparture`)

## Kontekst

O'quvchi bir guruhdan oy o'rtasida chiqarilib, shu oyning o'zida yana o'sha guruhga qo'shilsa, yangi yozilish uchun oylik hisob (`EnrollmentMonthlyCharge`) yozilmaydi: kunlarini oldingi yozilishning hisobi hali ushlab turibdi (`datesPaidByOtherCharges`, ADR-0062). Pul oldingi yozilishning hisobida qoladi.

Keyin yangi yozilish ketsa (o'tkazish, chiqarish, chetlatish, muzlatish, guruh yopilishi), `loadDepartureInput` hisobni faqat shu yozilishning `enrollmentId` si bilan qidirardi. Topilmasdi, `null` qaytardi, hech narsa qaytmasdi va xato ham chiqmasdi. #11323 shu sababdan −62 857 ga tushdi: 31.10 kunining 32 143 so'mi qaytmadi.

`loadDepartureInput` ketishning hamma yo'li va ikkala dialog ko'rsatkichi uchun umumiy, shuning uchun xato hammasida bor edi: dialog ham «qaytadi: 0» deb ko'rsatardi.

Prodda 01.09–30.10 oralig'ida 4 o'quvchi shu holatda (#11323, #10353, #11159, #10214), jami taxminan 408 000 so'm.

## Qaror

1. **Hisob zanjir bo'yicha topiladi.** O'z hisobi yo'q bo'lsa, `loadDepartureInput` shu o'quvchining, shu guruhning, shu oyning **oldinroq yaratilgan** yozilishlari orasidan `CHARGED` hisobni qidiradi va ketish kunidan keyin hali qoplangan (`coveredDates` minus `frozenOutDates`, `d > ketgan kun`) kuni borini oladi. Eng eskisi tanlanadi.
2. **Hisob egasi ledger'da ko'rinadi.** Qaytarish yozuvi (`monthly-release`) metadatasida `enrollmentId` ketayotgan yozilish bo'lib qoladi, hisob boshqa yozilishniki bo'lsa `chargeEnrollmentId` qo'shiladi. Hisobning o'zi (`charge.id`) egasi ustida o'zgaradi.
3. **Qoida o'zgarmaydi.** Ketgan kunning o'zi iste'mol qilingan hisoblanadi (`d <= ketgan kun` qoladi), siyosat (`policyRelease`, 6.2) egasining kunlari bo'yicha hisoblanadi. O'z hisobi bor yozilish avvalgidek ishlaydi, boshqa qidiruv yuborilmaydi.
4. **Bitta joy.** Tuzatish `loadDepartureInput` da, shuning uchun qaytarish, o'tkazish dialogi, chiqarish dialogi va cascade (muzlatish, chetlatish, guruh yopilishi) birdan to'g'ri bo'ladi.

## Ko'rib chiqilgan muqobillar

- **Qayta qo'shilganda yangi yozilishga o'z hisobini yozish** — `datesPaidByOtherCharges` ning maqsadiga (kun bir marta to'lanadi) zid, eski hisobni qayta yozishni talab qiladi. Rad etildi.
- **Har bir chaqiruvchida alohida qidirish** — beshta joy, bittasi unutilsa xato qaytadi. Rad etildi.

## Oqibatlari

- Bugundan boshlab qayta qo'shilgan yozilish ketganda o'tmagan kunlar puli qaytadi (yoki 6.2 bo'yicha ushlanadi) va dialoglar to'g'ri summani ko'rsatadi.
- **Eski ma'lumot o'zi tuzalmaydi.** 4 o'quvchining qaytmagan puli alohida skript bilan tuzatiladi (dry-run bilan, CEO tasdig'idan keyin).
- **Guruh almashtirishda ortiqcha pul yozilishi** (admin «Chiqarish» va «Qo'shish» ni ishlatgan) kod xatosi emas: 6.2 bo'yicha eski guruh puli ushlangan. Buning uchun chiqarish dialogi ogohlantiradi, hisob qoidasi o'zgarmaydi.
- Ketish kuni ikki marta hisoblanishi ADR-0137 bilan yopilgan, bu qaror unga tegmaydi.
