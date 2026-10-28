# 0137. Guruh almashganda o'tkazish kuni bir marta hisoblanadi

- Holati: Qabul qilindi
- Sana: 2026-10-28
- Bog'liq: [0043](0043-shartnoma-6-2-40-foizdan-keyin-pul-qaytmaydi.md) (ketish va qaytarish qoidasi), [0062](0062-oylik-yozilish-sikl-emas-oy.md) (oylik hisob), `server/src/billing/monthly-charge.service.ts` (`datesPaidByOtherCharges`, `reverseChargeForDeparture`)

## Kontekst

O'quvchi bir vaqtda bitta guruhda bo'ladi. 28.10.2026 da #11398 #005 dan #045 ga o'tkazildi (ikkala guruh dushanba, chorshanba, juma o'qiydi, faqat soati boshqa). Balansi +36 538 dan −32 693 ga tushdi: oktyabrda 5 dars kuni bor edi (21, 23, 26, 28, 30), 6 dars hisoblandi.

Sabab ikki qoidaning uchrashuvi:

- Guruhdan chiqqan kunning o'zi eski guruhda hisoblangan bo'lib qoladi: `reverseChargeForDeparture` faqat `d > ketgan kun` ni qaytaradi.
- Yangi guruhning hisobi qo'shilgan kundan, shu kunni qo'shib boshlanadi.

Bir xil guruhga qaytganda ikki marta hisobdan himoya bor edi (`datesPaidByOtherCharges`, `groupId` bo'yicha). Boshqa guruhga o'tishda himoya yo'q edi, shuning uchun o'sha kun ikkala guruhda hisoblandi. Prodda 28.10 holatiga o'xshash 21 o'quvchi topildi: 17 tasida bitta kun (har biri 31–37 ming so'm), 4 tasida oyning bir necha kuni (alohida sabab, quyida).

## Qaror

1. **Dars kuni bir marta hisoblanadi.** `datesPaidByOtherCharges` endi o'quvchining **boshqa guruhdagi, tark etilgan** (`ACTIVE` emas) yozilishining o'sha oy hisobini ham o'qiydi va uning ketgan kunigacha (Toshkent kuni, shu kun ham) qoplangan, qaytarilmagan kunlarini yangi hisobdan chiqaradi. Eski guruh ketgan kunini saqlaydi (0043 va `reverseChargeForDeparture` qoidasi o'zgarmaydi), yangi guruh o'sha kunni olmaydi.
2. **Faqat ketgan kungacha.** 6.2 bo'yicha pul qaytmaganda eski hisob keyingi kunlarni ham qoplagan holda qoladi. Ular bu o'quvchining yangi guruh darslari emas, ularni chiqarib tashlasak yangi guruh bepul bo'lib qolardi.
3. **Bitta joy.** `planChargeAmounts` ham haqiqiy yozuvni (`createChargeForEnrollment`), ham oldindan ko'rishni (`previewChargeForNewEnrollment`) hisoblaydi, shuning uchun ikkalasi bir xil bo'ladi.

## Ko'rib chiqilgan muqobillar

- **Eski guruhdan o'sha kunni qaytarish** — `reverseChargeForDeparture` ning chegarasini o'zgartirish ketish, muzlatish va o'tkazishning hammasiga tegadi, davomat bilan bog'liq 0043 va sinov darsi (3.5) hisoblariga ta'sir qiladi. Rad etildi: xavf katta, natija bir xil (kun bir marta to'lanadi).
- **Yangi guruhdan keyingi darsdan boshlash (`startDate` ni siljitish)** — o'quvchi o'sha kuni yangi guruhga kelsa ham dars hisoblanmasdi. Rad etildi: `fromDate` boshqa joylarda ham o'qiladi.

## Oqibatlari

- Bugundan boshlab guruh almashtirish (va bir kunda chiqarib boshqa guruhga qo'shish) kunni ikki marta hisoblamaydi.
- **Eski ma'lumot o'zi tuzalmaydi.** Allaqachon yozilgan ortiqcha hisoblar (17 o'quvchi, ~0,58 mln so'm) alohida tuzatiladi, CEO tasdig'i bilan.
- **Ochiq savol.** 4 o'quvchida oyning bir necha kuni ikki guruhda hisoblangan (jami ~0,61 mln so'm): #11160, #10783, #11225, #10152. Bu ketish qoidasi bo'yicha (pul qaytmagan) bo'lishi mumkin va shu qarorga kirmaydi. Alohida ko'rib chiqiladi.
- Bir kunda ikki guruh darsiga kelgan o'quvchi bo'lmaydi: o'quvchi bir vaqtda bitta guruhda (biznes qoidasi).
