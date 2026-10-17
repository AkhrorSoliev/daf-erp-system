# ADR-0106 — Kirish sahifasida til tanlash

**Holati:** Qabul qilindi
**Sana:** 2026-10-17
**Bog'liq:** ADR-0102, `client/src/app/(auth)/staff-sign-in-shell.tsx`, `client/src/i18n/sign-in-locale.ts`, `client/src/components/auth/staff-greeting.tsx`, `client/src/components/auth/language-menu.tsx`, `docs/superpowers/specs/2026-10-17-kirish-sahifasi-tili-design.md`

## Kontekst

ADR-0102 panel qobig'ini besh tilga o'tkazdi, lekin kirish sahifasini keyinga qoldirdi: u `feat/kirish-logotip-varaqlari` ishida qayta yozilayotgan edi. Endi yangi kirish sahifasi `main` da. Xodim panelga kirmasdan oldin tilni tanlay olmaydi, kirgach esa salom va kabinet qaysi tilda ochilishi aniq emas edi. CEO qarori (2026-10-17): asosiy til profilda saqlangani; loginda rus tanlab kirgan odamning profili o'zbekcha bo'lsa, profil tili yutadi; profil til tanlamagan bo'lsa, loginda tanlangani profilga saqlanadi.

## Qaror

1. **Til tugmasi faqat xodimlar kirish sahifasida** (`/login`, `admin.` va `lehrer.` xostlari). O'quvchi kirish sahifasida, Telegram callback sahifasida va Mini App kirish yo'lida tugma yo'q. Tugma `LanguageMenu`, u mavzu tugmasining yonida turadi; ro'yxat `LanguageRadioGroup`, uni foydalanuvchi menyusidagi «Til» ham ishlatadi.
2. **`StaffSignInShell` ADR-0102 dagi usulni takrorlaydi.** U `async`: serverda `daf-locale` cookie'ni o'qiydi (`currentLocale()`), lug'atni yuklaydi (`loadDictionary`) va bolalarini `I18nProvider` ga o'raydi; `<html lang>` ni `languageBootScript` bilan qo'yadi. Shu qobiqni uchala sahifa ishlatadi (`/login`, Telegram callback, `/tg`), shuning uchun uchalasi ham tilni oladi, lekin tugmani (`languageMenu` prop) faqat `/login` so'raydi. Sarlavha («Boshqaruv», «O'qituvchi») `lib/portal.ts` da `msg(…)` bilan o'ralgan, `SignInHeading` uni `t()` bilan chizadi.
3. **Kirishda profil tili yutadi.** Salom ko'rsatiladigan joyda `useGreeting().greet` salomdan oldin `adoptAccountLocale(user.uiLocale, …)` ni kutadi: profil tili bor va sahifa tilidan farq qilsa, `setLocale(til, { save: false })` sahifani shu tilga o'tkazadi (cookie ham yangilanadi, serverga hech narsa yuborilmaydi). Shundan keyin salom ko'rsatiladi va kabinet ochiladi, shuning uchun salom ham, kabinet ham birinchi chizishdayoq profil tilida. `greet` parol shakli, Telegram callback va Mini App uchun umumiy, shuning uchun qoida uchala yo'lda bir xil. `login-form` `greet` ni kutadi: profil tili yuklanguncha shakl o'chiq turadi va ikkinchi marta yuborilmaydi.
4. **Profil til tanlamagan bo'lsa (`uiLocale` = null) sahifa tili qoladi.** Kabinetdagi `LocaleSync` uni profilga bir marta saqlaydi (ADR-0102, o'zgarmagan). Til lug'ati yuklanmasa sahifa o'zgarmaydi va kirish davom etadi (`adoptAccountLocale` xatodan yiqilmaydi).
5. **Matnlar ADR-0102 usulida:** `t()` / `msg()` bilan o'ralgan, fayllar `STRICT_FILES` ga qo'shilgan, tarjimalar `ru`, `de`, `en` lug'atlarida. Kirish shakli, parolni tiklash oynasi (3 qadam), pastki qator, «Telegram orqali kirish» tugmasi, mavzu tugmasining maslahatlari va salom tarjima qilingan. O'quvchi portali bilan umumiy fayllar (`forgot-password-*`, `login-footer`, `theme-toggle`, `telegram-login-button`) o'quvchi portalida o'zbekcha lotin qoladi, chunki u `I18nProvider` dan tashqarida va `useT()` standart (o'zbekcha) kontekstni oladi.

## Taqiqlanadi

- Kirish sahifasida tilni serverga (akkauntga) saqlash. U yerda hech kim kirmagan, shuning uchun tanlov faqat `daf-locale` cookie'ga yoziladi; `PATCH /users/ui-locale` ketmaydi.
- Serverdan kelgan xato matnini mijozda tarjima qilish (ADR-0102 dagi qoida shu yerda ham amal qiladi).
- Kirishda profil tilini sahifa tili bilan ustidan yozish: kirgan odamda akkaunt yutadi.

## Muqobillar

- **Har til uchun alohida manzil** (`/ru/login`): tanlanmadi, sabab ADR-0102 dagi bilan bir xil (til manzilda emas, cookie va akkauntda).
- **Til tugmasini hamma sahifaga qo'yish** (o'quvchi kirishi, Telegram callback, Mini App): tanlanmadi. Foydalanuvchi menyusida tugma allaqachon bor; o'quvchi portali va Mini App matnlari hali tarjima qilinmagan, tugma hech narsani o'zgartirmasdi.

## Oqibatlar

- **Faqat klient chiqariladi:** migratsiya va server o'zgarishi yo'q, chiqarish tartibi cheklovi yo'q.
- Umumiy kompyuterda oldingi odam tanlagan til keyingi odamning kirish sahifasida turadi (cookie qurilmada qoladi). Keyingi odamning profili til tanlagan bo'lsa u yutadi, tanlamagan bo'lsa qurilma tili profilga saqlanadi; CEO bu xavfni qabul qildi.
- Salom tilga o'tishi uchun lug'at yuklanishi kerak (kichik chunk). Bu paytda shakl «band» turadi; lug'at yuklanmasa salom sahifa tilida chiqadi.
- **Hali o'zbekcha:** o'quvchi kirish sahifasi, Telegram callback sahifasining o'z matnlari va Mini App xabarlari (`mini-app-notices.tsx`). Callback va `/tg` tilni oladi (qobiq orqali), lekin ichki matnlari tarjima qilinmagan.
- `STRICT_FILES` o'ralmagan matnni ko'rmaydi: kirish sahifasi besh tilda brauzerda ko'z bilan tekshiriladi. Rus va nemis matnlar uzunroq, ayniqsa tor ekranda tekshiriladi.
