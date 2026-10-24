# ADR-0120 — O'quvchi portalida til: qurilmada saqlanadi

**Holati:** Qabul qilindi
**Sana:** 2026-10-24
**Bog'liq:** ADR-0102, ADR-0106, ADR-0110, `client/src/app/(student-portal)/portal/layout.tsx`, `client/src/components/student-portal/lumio/language-picker.tsx`, `client/src/app/(auth)/login/page.tsx`, `docs/superpowers/plans/2026-10-24-oquvchi-portali-tarjimasi.md`

## Kontekst

ADR-0102 xodimlar kabineti uchun tilni ikki joyda saqlaydi: qurilmada (`daf-locale` cookie) va akkauntda (`User.uiLocale`, `PATCH /users/ui-locale`); `LocaleSync` akkaunt tilini qurilmadan ustun qo'yadi. O'quvchi portali (`student.dafzentrum.uz`, `/portal/*`) va o'quvchining kirish sahifasi shu paytgacha faqat o'zbekcha edi: o'quvchi xostida `I18nProvider` yo'q edi. Endi portal ham besh tilda (`uz`, `uz-Cyrl`, `ru`, `de`, `en`) ko'rinadi.

`PATCH /users/ui-locale` — xodimlar yo'li (`@AnyStaff()`), o'quvchida akkaunt tili ustuni ham, uni o'qiydigan joy ham yo'q. Portal esa nemis tili kursini o'rgatadi: nemischa so'zlar, gaplar, javob variantlari, maslahatlar, transkriptlar va `titleUz` — bu kurs kontenti, interfeys matni emas.

## Qaror

1. **Til faqat qurilmada:** portal layout'i (server) `daf-locale` cookie'ni o'qib, faqat tilni `I18nProvider` ga beradi (ADR-0110 dagidek, lug'at alohida chunk). Serverda yangi maydon ham, migratsiya ham yo'q.
2. **Har tanlov `pickPortalLocale` orqali `setLocale(next, { save: false })`**: cookie yoziladi, akkauntga hech narsa yuborilmaydi. Portalda `LocaleSync` o'rnatilmaydi.
3. **Tanlagich — Lumio `LanguagePicker`:** Sozlamalarda qatorli radio guruh (`variant="list"`, strelkalar bilan yuriladi, faqat tanlangan til Tab to'xtash joyi), o'quvchi kirish sahifasida esa kichik oddiy `<select>` (`variant="compact"`, telefonda tizimning o'z ro'yxati ochiladi). Har til nomi o'z tilida va o'z `lang` atributi bilan.
4. **O'quv kontenti — ma'lumot:** nemischa mashq elementlari, variantlar, javoblar, maslahatlar, transkriptlar, `titleUz` va dars/unit nomlari `t()` dan o'tkazilmaydi (`uz-Cyrl` da `t()` o'ziga kelganini transliteratsiya qiladi). Faqat kodda yozilgan interfeys matnlari tarjima qilinadi; server yuborgan matn ham tarjima qilinmaydi (ADR-0102).

## Taqiqlanadi

- Portaldan `PATCH /users/ui-locale` ni chaqirish.
- Mashq yoki kontent ma'lumotini (`titleUz`, nemischa elementlar, server matnlari) `t()` ga berish.
- Portalda `LocaleSync` ni o'rnatish.

## Muqobillar

- **O'quvchiga ham akkaunt tili (server maydoni + migratsiya):** til telefondan kompyuterga o'tganda ham saqlanardi, lekin o'quvchi yo'li, migratsiya va sinxronlash qoidasi kerak bo'ladi. Keyinga qoldirildi: hozir o'quvchilar asosan bitta qurilmadan (telefon yoki Telegram Mini App) kiradi.

## Oqibatlar

- Til qurilmaga bog'liq: boshqa qurilmada yoki brauzerda o'quvchi o'zbekchadan boshlaydi va tilni qayta tanlaydi.
- `/portal/*` endi har so'rovda render qilinadi (async layout cookie'ni o'qiydi): statik yoki ISR sahifa yo'q. `staleTimes` qo'shilmadi — client router keshi standart holicha qoladi.
- Rus lug'ati yuklanadi: `ru.ts` ≈495 KB xom (portalning ulushi ≈380 kalit). Bitta xeshli chunk keshlanadi (ADR-0110); route bo'yicha alohida lug'at — ADR-0110 da keyinga qoldirilgan muqobil, chunk o'sgani uchun qayta ko'riladi.
- Nemischa tarjima rasmiy «Sie» bilan yozilgan; «du» ga o'tish — CEO qarori.
- Ochiq qolgan, CEO hal qiladigan: rus tilida «Sababli» (По уважительной причине) uzun, «Пришли/Не пришли/Опоздали» xodimlar sahifalari bilan umumiy kalitlar. `OvozTugmasi` endi admin media sahifalarida ham tarjima qilinadi (zararsiz); `uhr.tsx` ning standart aria matni admin media sahifalarida o'zbekcha qoladi.
