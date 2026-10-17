# ADR-0104 — Hujjatni bekor qilish: qator qoladi, raqam qayta berilmaydi, sabab majburiy

**Holati:** Qabul qilindi
**Sana:** 2026-10-17
**Bog'liq:** ADR-0100 (qatnashganlik hujjati; bekor qilish yo'lini ochiq qoldirgan, shu ADR uni to'ldiradi), ADR-0028 (huquq bazadan o'qiladi), ADR-0079 (imkoniyat, rol emas), `server/src/participation-certificates/`

## Kontekst

ADR-0100 hujjatni muhrlab, uning `revokedAt` va `revokedReason` ustunlarini va ochiq QR sahifadagi «bekor qilingan» holatini tayyorlab qo'ygan, lekin yozadigan yo'l va xodimning tugmasi yo'q edi. Hujjat xato o'quvchiga yoki xato darajaga berilsa, uni olib tashlashning yo'li bo'lmadi. CEO qarori (2026-10-17): xato berilgan hujjat bekor qilinadi, o'chirilmaydi.

## Qaror

1. **Yumshoq bekor qilish.** Qator o'chmaydi; `revokedAt` va `revokedReason` bir marta yoziladi. Raqam band qoladi va hech qachon qayta berilmaydi. Muhrlangan `snapshot` va uning raqamlari qayta hisoblanmaydi va o'zgarmaydi.
2. **Kim.** Hujjatni bergan kishilar: `students.manage` (standart: Administrator, filial direktori, CEO). Yangi imkoniyat kaliti yo'q. Yo'l: `POST /participation-certificates/:id/revoke`, tanasi `{ reason }`. Hujjat o'quvchisining filiali `assertCallerMayTouchStudent` bilan tekshiriladi, sarlavhadagi filial o'qilmaydi.
3. **Sabab majburiy**: kesilgan matn 3–500 belgi. Javob yangilangan `IssuedView` (xodim ko'rinishi: `revokedAt`, `revokedReason` bilan).
4. **Bir tranzaksiya.** Shartli yangilash (`where: { id, companyId, revokedAt: null }`) va o'quvchi tarixiga `QATNASHISH_HUJJATI_BEKOR_QILINDI` (raqam, daraja, sabab) bitta Serializable tranzaksiyada yoziladi: tarix yozuvi yiqilsa, bekor qilish ham ortga qaytadi. Allaqachon bekor qilingan hujjat ham, bir vaqtda ikki marta bosish ham 409.
5. **Bekor qilingan hujjatning PDF'i berilmaydi** (409), xodimga ham. QR sahifa «bekor qilingan» deydi; ochiq javob sababni, filialni, tug'ilgan sanani va foizlarni ko'rsatmaydi. Sabab faqat xodim ko'rinishida.
6. **Qayta berish oddiy berish**: bekor qilingandan keyin shu daraja uchun hujjat yangi raqam bilan beriladi. «Hujjat allaqachon berilgan, yana bittasini berasizmi?» tasdig'i faqat bekor qilinmagan hujjatlarni sanaydi.
7. Qoida o'zgarmaydi: kim hujjat olishini hamon `participation-rules.ts` hal qiladi; bekor qilish uni chaqirmaydi.

## Ko'rib chiqilgan muqobillar

- Qatorni o'chirish: raqam bo'shab qolardi, QR sahifa «topilmadi» deb yuborardi, bir marta berilgan hujjat izsiz yo'qolardi.
- Bekor qilishni faqat CEO ga berish: hujjatni administrator beradi, xatoni ham shu kuni tuzata olishi kerak; sabab va tarix qaydi javobgarlikni saqlaydi.
- Sababsiz bekor qilish: keyin «nega?» degan savolga javob bo'lmay qolardi.

## Oqibatlari

Yutuq: xato hujjat izsiz o'chmaydi, tarix va QR sahifa bir narsani aytadi, raqamlar qayta ishlatilmaydi. Narx: qaytarib bo'lmaydi (bekor qilingan hujjat tiklanmaydi, o'rniga yangisi beriladi); bekor qilingan qatorlar ro'yxatda qoladi.
