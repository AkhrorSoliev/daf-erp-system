# ADR-0084 — Takrorlanuvchi topshiriq: qoida, birinchi topshiriq darhol, 07:00 dagi yurish

**Holati:** Qabul qilindi
**Sana:** 2026-10-11
**Bog'liq:** ADR-0074 (topshiriq alohida bo'lim, berish zinasi), ADR-0078 (Telegram, tungi tinchlik), dizayn `docs/superpowers/specs/2026-10-07-topshiriqlar-design.md` §3.6, §9.5, §9.6, `server/src/tasks/task-recurrence-rules.ts`, migratsiya `20261011120000_task_recurrence`

## Kontekst

Spec takrorlanishni qoida (`TaskRecurrence`) va 07:00 dagi cron sifatida belgilagan, lekin bir nechta savolni ochiq qoldirgan: birinchi topshiriq qachon chiqadi, ikki server nusxasi bir vaqtda ishlasa nima bo'ladi, «Har biriga alohida» bilan «oxirgisi ochiq» qanday tekshiriladi, muallif ishdan ketsa qoida nima qiladi.

## Qaror

1. Qoida topshiriq berish oynasining «Batafsil» qismidan yaratiladi («Takrorlash»: Har kuni / Har hafta — kunlari / Har oy — 1–28-sana, va vaqti 08:00–22:00). Qoidani berish huquqi — topshiriq berish huquqi bilan bir xil (zina). Takrorlanuvchi topshiriqqa «Muddat» sanasi qo'yilmaydi (vaqtini «Takrorlash» belgilaydi) va u faqat faol xodimga beriladi: aks holda qoida saqlanib, hech qachon topshiriq bermasdi.
2. Qoida bilan birga **birinchi topshiriq darhol** beriladi: vaqti hali o'tmagan birinchi kunga; qoida va birinchi topshiriq bitta tranzaksiyada yoziladi. Keyingilarini har kuni 07:00 (Toshkent) dagi yurish beradi; muddati — o'sha kuni qoidadagi vaqt.
3. Kun yakshanba yoki filial bayramiga tushsa — keyingi ish kuniga suriladi; bitta kunga tushib qolgan ikki kun bitta topshiriq beradi. Yakshanba va bayram ertalabi qoida kutadi.
4. Qoidaning oldingi topshirig'i hali ochiq bo'lsa, yangisi berilmaydi, sana baribir suriladi. «Har biriga alohida» qoidada bu har ijrochi uchun alohida tekshiriladi. Shuning uchun `lastTaskId` ustuni yo'q: topshiriqning o'zi `recurrenceId` ni saqlaydi.
5. Ikki server nusxasi (deploy paytida) bitta qoidadan ikki topshiriq bermaydi: yurish tranzaksiyasining birinchi yozuvi `nextRunDate` ni faqat u o'qilgan qiymatda bo'lsa suradi; ikkinchisi hech narsa topmaydi. Topshiriq yozilmasa (xato), surish ham bekor bo'ladi va ertasi kuni qayta urinadi.
6. Server o'chib qolgan ertalab o'tkazib yuborilgan kun keyingi ertalab bitta topshiriq bilan to'ldiriladi (har o'tgan kun uchun alohida emas).
7. Yurish paytida huquq qoida muallifiniki bo'yicha qayta tekshiriladi: muallif ishdan ketsa yoki bog'langan o'quvchi/guruh/lid/xodim topilmasa — qoida o'zi to'xtaydi; ijrochi ketgan yoki endi berib bo'lmaydigan bo'lsa — u tushib qoladi; hech kim qolmasa — o'sha kun o'tkazib yuboriladi (sana baribir suriladi).
8. Qoidani muallif, o'sha filial direktori yoki CEO boshqaradi, boshqa hamma uchun qoida yo'q (404): «To'xtatish» (qaytariladi — «Davom ettirish»), «O'zgartirish» (jadval va ijrochilar) va «O'chirish» (qoida yo'qoladi, berilgan topshiriqlar qoladi). Yangi jadval yoki «Davom ettirish» ertadan boshlab hisoblanadi; faqat ijrochilar o'zgarsa, keyingi sana o'zgarmaydi. Yangi ijrochi o'zgartirayotgan odamning ham, muallifning ham doirasida bo'lishi kerak. Sarlavha, tavsif, qadamlar, kuzatuvchi, muhimlikni o'zgartirish uchun qoida to'xtatilib, yangisi yaratiladi. Ro'yxatni CEO butun kompaniya bo'yicha, filial direktori o'ziniki va o'z filiallariniki, qolganlar o'zlariniki bo'yicha ko'radi; qoidaning ijrochilari faqat muallif va boshqaruvchiga ko'rsatiladi.
9. Topshiriq oddiy qo'lda berilgan topshiriqdek xabar qiladi (beruvchi — muallif); 07:00 dagi xabar Telegram'ga 08:00 da boradi (tungi tinchlik).

## Ko'rib chiqilgan muqobillar

- `lastTaskId` ustuni (spec matni): «Har biriga alohida» qoidada bitta yurish bir nechta topshiriq beradi — bitta havola yetmaydi.
- `(recurrenceId, kun)` bo'yicha unikal indeks: topshiriqqa yangi ustun va qo'lda yoziladigan indeks kerak bo'lardi; shartli surish shu ishni bitta qatorda qiladi.
- Birinchi topshiriqni cron'ga qoldirish: «Har dushanba» seshanba kuni yaratilsa, bir hafta hech narsa ko'rinmasdi.

## Oqibatlari

- Doska kartasida qoida yoqilgan topshiriqda «Har dushanba» kabi belgi (qoida to'xtatilsa belgi yo'qoladi); varaqda qoida va tugmalar; «Topshiriqlar» sahifasida «Takrorlanuvchi» ro'yxati.
- Yurish bir ertalabda 500 tagacha qoidani o'tadi; qolgani ertasiga (keyin ko'paytiriladi).
- Rasm bilan tasdiqlash qoidaga 3-bosqich (fayllar) bilan qo'shiladi.
