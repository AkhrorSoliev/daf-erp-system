# Kirish sahifasida til tanlash — dizayn

**Sana:** 2026-10-17 · **Holati:** CEO tasdiqladi (dizayn namunasi va ko'lami, 2026-10-17)
**Asos:** ADR-0102 (interfeys tili), `2026-10-17-tillar-design.md` (kirish sahifasi o'sha ishda keyinga qoldirilgan edi — yangi kirish sahifasi endi `main` da).

## 1. Maqsad

Xodimlar kirish sahifasida (`admin.` va `lehrer.` xostlaridagi `/login`) besh tilning birini tanlash: O'zbekcha, Ўзбекча, Русский, Deutsch, English. Tugma bo'lishi bilan sahifaning o'zi ham tarjima qilinadi — aks holda tugma hech narsani o'zgartirmaydi.

CEO qarorlari (2026-10-17):
- Asosiy til profilda saqlangani. Loginda rus tanlab kirgan odamning profili o'zbekcha bo'lsa — muammo emas, profil tili yutadi.
- Profil hali til tanlamagan bo'lsa, loginda tanlangan til profilga saqlanadi (`LocaleSync`, ADR-0102 — o'zgarmaydi).

## 2. Ko'lam

**Kiradi:** `/login` (xodim shaklida), «Parolni unutdingizmi?» oynasi (3 qadam), «Telegram orqali kirish» tugmasi, xato matnlari (mijozdagi zaxira matnlar), pastki qator («Maxfiylik siyosati», «Yordam», huquqlar qatori), mavzu tugmasining maslahati, kirgandan keyingi «Xush kelibsiz» salomi.

**Kirmaydi:** o'quvchi portalining kirish sahifasi (`student.`), Telegram Mini App'ning ichki xabarlari (`mini-app-notices.tsx`), Telegram callback sahifasining o'z matnlari, serverdan keladigan matnlar (xato xabarlari). `/tg` va callback sahifasi bir xil qobiqdan foydalangani uchun tilni oladi, lekin ularda til tugmasi YO'Q.

## 3. Xatti-harakat

1. **Tugma.** Yuqori panelda, mavzu tugmasining chap yonida: Til belgisi + joriy tilning o'z nomi («O'zbekcha», «Русский» …). Bosilsa besh tilning ro'yxati (radio), har nom o'z tilida, `lang` atributi bilan. Tanlash sahifani qayta yuklamaydi; til `daf-locale` cookie'ga yoziladi (hech kim kirmagan, shuning uchun `PATCH` ketmaydi).
2. **Birinchi chizish.** Qobiq serverda cookie'ni o'qiydi va lug'atni `I18nProvider` ga beradi (dashboard bilan bir xil usul) — qayta yuklaganda sahifa darrov tanlangan tilda chiqadi; `<html lang>` skript bilan qo'yiladi.
3. **Kirish.** Muvaffaqiyatli kirishda javobdagi `user.uiLocale` o'qiladi:
   - profil tili bor va sahifa tilidan farq qilsa — sahifa (salom ham) shu tilga o'tadi, cookie shu tilga yoziladi (`save: false`, qayta saqlanmaydi), keyin kabinet ochiladi, shuning uchun kabinet birinchi chizishdayoq to'g'ri tilda (chaqnash yo'q);
   - profil tili yo'q (`null`) — sahifa tili qoladi; kabinetdagi `LocaleSync` uni profilga bir marta saqlaydi (ADR-0102);
   - til yuklanmasa — sahifa o'zgarmaydi, kirish davom etadi.
4. **Salom** (`useGreeting`) uchala xodim kirish yo'lida (parol, Telegram callback, Mini App) bir xil qoidani ishlatadi, chunki qoida `greet` ichida.

## 4. Texnik dizayn

- `app/(auth)/staff-sign-in-shell.tsx` — `async`: `currentLocale()` + `loadDictionary()`, `<I18nProvider>` + `languageBootScript`; sarlavha serverda `translate(...)` bilan; yangi `languageMenu?: boolean` prop (faqat `/login` beradi) mavzu tugmasi yonida `LanguageMenu` chizadi.
- `components/auth/language-menu.tsx` (yangi, klient): `DropdownMenu` + radio guruh; ro'yxat `components/language-radio-group.tsx` (yangi) da — `HeaderUserMenu` ham shuni ishlatadi (takrorlanmaydi).
- `i18n/sign-in-locale.ts` (yangi, sof): `localeToAdopt(accountLocale, currentLocale)` → `UiLocale | null`; `adoptAccountLocale(...)` — `setLocale(target, { save: false })` ni kutadi, xatodan yiqilmaydi. `useGreeting().greet` kirishdan keyin shuni chaqiradi va keyin salomni ko'rsatadi.
- Matnlar: `t("…")` / `msg("…")`, o'zbekcha lotin matn kalit (ADR-0102). `lib/portal.ts` sarlavhalari (`Boshqaruv`, `O'qituvchi`) `msg`; `ThemeToggle` yorliqlari `msg`; `copyrightLine(year, rights?)` — huquqlar jumlasi `t` bilan beriladi.
- Umumiy fayllar (`forgot-password-*`, `telegram-login-button`, `login-footer`, `theme-toggle`) o'quvchi portalida ham ishlatiladi; u `I18nProvider` dan tashqarida, shuning uchun o'zbekcha chiqadi — o'zgarmaydi.
- `STRICT_FILES` ga yangi tarjima qilingan fayllar qo'shiladi; `ru/de/en` lug'atlariga yangi matnlar (reja bo'yicha ~50 ta), glossariy `2026-10-17-tillar.md` dagi.
- Serverga tegilmaydi (migratsiya yo'q). Faqat klient chiqariladi.

## 5. Xavflar va cheklovlar

- Qobiq `async` bo'ladi — `/tg` va callback allaqachon `headers()` o'qiydi (dinamik), `/login` ham; yangi dinamiklik yo'q.
- Salom tilga o'tishi uchun lug'at yuklanishi kerak (kichik chunk) — kechiksa salom o'zgarmay chiqadi, kirish to'xtamaydi.
- Umumiy kompyuterda oldingi odam tanlagan til keyingi odamning kirish sahifasida turadi; profili til tanlagan bo'lsa u yutadi, tanlamagan bo'lsa qurilma tili profilga saqlanadi (CEO bu xavfni qabul qildi).
- Telegram callback va Mini App ichki matnlari keyingi bosqichda.

## 6. Tekshirish

- Sof funksiya va `greet` oqimi: vitest (node muhiti) — `localeToAdopt` jadvali, `adoptAccountLocale` stub bilan (muvaffaqiyat, yuklanmadi, tarmoq xatosi).
- `LanguageMenu` / `LanguageRadioGroup`: `renderToStaticMarkup` (joriy til nomi, `lang` atributlari).
- `npm run i18n:check`: yangi fayllar `STRICT_FILES` da, lug'atlar kalitlari teng.
- Brauzerda (mock API): besh tilda kirish sahifasi, almashtirish qayta yuklamasdan, qayta yuklash chaqnashsiz, parolni tiklash oynasi, kirishdan keyin profil tili yutishi, o'quvchi kirish sahifasi o'zgarmagani.
- Hujjat: yangi qisqa ADR (0106; raqam PR oldida tekshiriladi), `client/CLAUDE.md` «Languages» bo'limi, qo'llanma `tizimga-kirish` sahifasi, `yangiliklar.ts`.
