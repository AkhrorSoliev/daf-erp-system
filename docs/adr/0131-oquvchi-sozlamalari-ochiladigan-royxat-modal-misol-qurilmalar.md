# ADR-0131 — O'quvchi sozlamalari: ochiladigan ro'yxat, misolli modallar, qurilmalar sahifasi

**Holati:** Qabul qilindi
**Sana:** 2026-10-26
**Bog'liq:** ADR-0125 (Ta'lim ko'rinishi), ADR-0113 (faol seanslar), ADR-0120 (portal tili), ADR-0030 (boshqa qurilmalardan chiqish)

## Kontekst

`/portal/settings` da til besh qatorli ochiq ro'yxat edi, mavzu uch bo'lakli tugma, «Ta'lim ko'rinishi», «Ovozlar» va «Kam harakat» esa o'quvchiga tanlasa nima bo'lishini ko'rsatmasdi. «Boshqa qurilmalardan chiqish» bitta tugma edi: o'quvchi qaysi qurilmalardan kirilganini ko'rmasdi. Kirill tillarida (rus, o'zbek kirili) sarlavhalar oddiy ko'rinardi. CEO (26.10.2026) shularni tuzatishni so'radi.

## Qaror

1. **Til va Mavzu — loyihaning o'z `Select` i** (`lumio/select-field.tsx`, Radix): sahifada bitta qator, ro'yxat bosilganda ochiladi. Brauzerning o'z `<select>` i ishlatilmaydi. Ro'yxat `<body>` ga chiqadi, shuning uchun `lumio` klassi `SelectContent` ning o'ziga qo'yiladi. Til hamon faqat qurilmada (ADR-0120).
2. **«Ta'lim ko'rinishi» — modal.** Hamma ko'rinish ro'yxatda turadi; tayyor bo'lmaganlari xira, bosilmaydi va «Tez orada» belgisi bor. **Bu ADR-0125 ning «sozlamada faqat tayyor ko'rinishlar taklif qilinadi» qoidasini almashtiradi**: tayyor bo'lmagan ko'rinish endi ko'rinadi, lekin tanlab bo'lmaydi. Tanlangan ko'rinish tagida haqiqiy qismlarda chiziladi: yo'l tugunlari (bajarilgan, hozirgi, yopiq) va natija ekrani (Dafi, «Dars tugadi!»), ya'ni `temaTop(id)` ning o'z komponentlari.
3. **«Kam harakat» — modal, ikki oyna.** «Oddiy» va «Kam harakat» yonma-yon: bir xil to'g'ri javob lahzasi (haqiqiy Dafi, konfeti). Oynani bosish tanlaydi. Telefon sozlamasida kam harakat yoqilgan bo'lsa, modal buni aytadi (tizim sozlamasini bekor qilib bo'lmaydi, ADR-0125). `Dafi` ga `kam` xususiyati qo'shildi: faqat ko'rinish uchun, o'quvchining tanlovini o'zgartirmaydi.
4. **«Ovozlar» — oddiy o'chirgich qatori**, tushuntirish matnisiz va «tinglab ko'rish» tugmasisiz.
5. **«Ulangan qurilmalar» — alohida sahifa** `/portal/settings/devices`. Server tayyor edi: `GET /users/sessions` va `DELETE /users/sessions/:sid` `@AnyUser()` (ADR-0113). Sahifa ro'yxatni ko'rsatadi (qurilma nomi, IP, oxirgi faollik, «Joriy qurilma»), har bir boshqa qurilmani chiqarish va «Boshqa qurilmalardan chiqish» (ADR-0030, o'sha tasdiq oynasi). Ro'yxat `loadState` + `LoadFailed` qoidasiga amal qiladi: javob bo'lmasa bo'sh holat chizilmaydi.
6. **Kirill sarlavhalari — Rubik.** Baloo 2 da kirill harflari yo'q, `next/font` esa undan keyin Arial asosidagi zaxira shrift qo'yadi va kirillni shu ushlab oladi. `html:lang(ru)` va `html:lang(uz-Cyrl)` da `.lumio` / `.form-theme` ichidagi sarlavhalar `--font-display-cyr` (Rubik 600/700/800, `cyrillic` + `cyrillic-ext`) bilan chiziladi. Oddiy matn Nunito (`cyrillic-ext` bilan: Қ, Ғ, Ҳ).
7. **Umumiy `DialogContent` ning yopish tugmasi matni** (`sr-only`) tarjima qilinadi (`t("Yopish")`), avval faqat inglizcha «Close» edi.

## Rad etilgan yo'llar

- **Til uchun ro'yxat ochiq qolishi:** besh qator sahifani cho'zadi, qolgan sozlamalar pastga tushib ketadi.
- **Brauzerning o'z `<select>` i:** CEO loyiha tizimidagi ro'yxatni xohladi; ko'rinishi har brauzerda har xil.
- **Ta'lim ko'rinishini ro'yxat ichida inline ko'rsatish:** misollar sahifani uzaytiradi; modal ularni tanlov bilan bir joyda ushlab turadi.
- **Qurilmalarni xodim komponenti bilan chizish** (`ActiveSessions`): u shadcn ko'rinishida va xodim paketini portalga olib kirardi; model (`sessions-model.ts`) va so'rovlar umumiy qoladi, faqat chizish Lumio'da.
- **Kirill uchun Baloo 2 ning o'zi:** unda kirill harflari yo'q.

## Oqibatlar

- Yangi ko'rinish tayyor bo'lganda faqat `lernen-temalar.ts` dagi `tayyor` bayrog'i va reyestr o'zgaradi: modal uni o'zi tanlanadigan qiladi va misollarni chizadi.
- `lumio/select-field.tsx` portalning boshqa joylarida ham ishlatilishi mumkin; yangi ochiladigan ro'yxat uchun brauzer `<select>` i emas, shu komponent olinadi.
- `lernen-korinish-tanlash.test.ts` ro'yxat qatorlarini tekshiradi; modal ichi ochiq holatda brauzerda tekshirilgan, statik markupda ko'rinmaydi (Radix portal).
- Yangi matnlar `STRICT_FILES` ga qo'shilgan fayllarda: ru/de/en tarjimasi majburiy.
