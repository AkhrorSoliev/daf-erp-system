# ADR-0110 — Lug'at sahifaga qo'shilmaydi, alohida keshlanadigan chunk

**Holati:** Qabul qilindi
**Sana:** 2026-10-18
**Bog'liq:** ADR-0102, ADR-0106, `client/src/i18n/dictionary-cache.ts`, `client/src/i18n/context.tsx`, `client/src/app/(dashboard)/layout.tsx`, `client/src/app/(auth)/staff-sign-in-shell.tsx`, `docs/superpowers/plans/2026-10-18-lugat-yuklash.md`

## Kontekst

ADR-0102 va ADR-0106 da layout serverda `loadDictionary(locale)` ni kutib, lug'atni `I18nProvider` ga prop qilib berardi. Client komponentning propi sahifaning RSC payload'iga yoziladi, shuning uchun rus lug'ati (≈94 KB, gzip ≈27 KB) har bir to'liq yuklangan sahifa bilan qayta kelardi va har tarjima qilingan bo'lim bilan o'sib boradi.

## Qaror

1. **Layout faqat tilni beradi** (`<I18nProvider initialLocale={locale}>`); `currentLocale()` va `languageBootScript` o'zgarmagan.
2. **Provider lug'atni `use(getDictionary(locale))` bilan o'qiydi.** `dictionary-cache.ts` har til uchun bitta promise saqlaydi va uni React `use()` tushunadigan tarzda belgilaydi (`status`, `value`/`reason`): bajarilgan promise'ni `use()` kutmasdan qaytaradi. Serverda dinamik `import()` render paytida yechiladi, shuning uchun HTML allaqachon tarjima qilingan; brauzerda o'sha chunk bir marta yuklanadi (nomi xeshli, `Cache-Control: immutable`), hydration uni kutadi.
3. **Yuklash xatosi bir oz vaqt (`RETRY_AFTER_MS`, 3 s) keshda qoladi**, shunda `use()` xatoni error boundary'ga otadi (ildiz `error.tsx`, «Qayta urinish»). Darhol o'chirilsa, React har qayta urinishda yangi yuklash boshlab, cheksiz aylanardi (production build'da chunk 500 qaytarganda ko'rildi). Muddat o'tgach keyingi o'qish qayta yuklaydi.
4. **Til almashtirish (`setLocale`) `loadDictionary` dan foydalanadi** va yuklanganini `rememberDictionary` bilan shu keshga qo'yadi.
5. **`initialDictionary` ixtiyoriy prop bo'lib qoladi** (testlar uchun): berilsa hech narsa yuklanmaydi. O'zbekcha (`uz`) hech qanday chunk yuklamaydi, `uz-Cyrl` faqat kichik tuzatishlar faylini.

## Taqiqlanadi

- Lug'atni prop, kontekst qiymati yoki boshqa yo'l bilan server payload'iga qo'yish.
- Provider'da keshlanmagan promise bilan `use()` chaqirish (har renderda yangi promise — cheksiz kutish).

## Muqobillar

- **Har route guruhi uchun alohida lug'at:** ko'proq kod va umumiy komponentlar uchun qo'shimcha qoida kerak; chunk o'zi katta bo'lguncha keyinga qoldirildi (gzip ≈150 KB atrofida qayta ko'riladi).
- **Lug'atni faqat hydration'dan keyin brauzerda yuklash:** birinchi chizish o'zbekcha bo'lib, keyin tilga sakraydi — tanlanmadi.

## Oqibatlar

- Birinchi tashrifda bitta qo'shimcha so'rov (keshlanadi), keyingi yuklashlarda so'rov yo'q (`transferSize` 0).
- Rus tilidagi har sahifa payload'i ≈27 KB gzip kichraydi; payload hajmi endi tilga bog'liq emas.
- Hydration lug'at chunk'i kelguncha kutadi; server HTML'i shu vaqt tarjima qilingan holda ko'rinadi. Chunk yuklanmasa, ildiz xato sahifasi chiqadi; «Qayta urinish» 3 s dan keyin qayta yuklaydi.
