# Xodim profili (Mini App) — uchta tuzatish

**Sana:** 17.10.2026 · **Holat:** CEO tasdiqladi (suhbatda, skrinshotlar bilan) · **ADR:** kerak emas (ma'lumot modeli, pul, filial qoidasi va tashqi xizmat o'zgarmaydi).

## Muammo

Ustoz yoki admin Telegramdagi «💼 Kabinet» tugmasi orqali kirganda `/profile` ochiladi — bu oddiy kompyuter sahifasining telefondagi ko'rinishi. Yangi `main` bo'yicha telefon enida (390 px) tekshirilganda uchta nuqson qoldi:

1. **Rol inglizcha.** Kartochkada va foydalanuvchi menyusida «Teacher», «Administrator», «Cashier» (bazadagi nom). Loyiha qoidasi: ekranda inglizcha so'z yo'q.
2. **Bo'sh blok.** Direktor (CEO)ning oyligi yo'q, shuning uchun kartochkada ma'nosiz «To'lanishi kerak —» chiqadi.
3. **Ortiqcha tanlagich.** Ustoz faqat bitta filialda ishlaydi (`docs/branch-decisions.md`, D6), lekin yon panelda (telefonda) va yuqori panelda (planshet/kompyuterda) filial tanlagichi turadi.

Avval ko'rilgan boshqa nuqsonlar yangi `main`da allaqachon tuzatilgan: «Chiqish» yuqori o'ngdagi rasm menyusida bor, kassirga `/salary/me/monthly` ochiq (`@AnyStaff`).

## Qaror

| # | O'zgarish | Qayerda |
|---|---|---|
| 1 | Rol nomi o'zbekcha: Direktor · Filial direktori · Administrator · O'qituvchi · Kassir (mavjud `roleLabel`) | profil kartochkasi (telefon va kompyuter), foydalanuvchi menyusidagi yorliq |
| 2 | Faqat «Direktor» roli bor odamga «To'lanishi kerak» bloki chizilmaydi | `profile-roles.ts` → `hasOwnSalary` |
| 3 | Filial tanlagichi faqat tanlov bo'lganda chiziladi: CEO doim, boshqalar — ikki va undan ko'p filialda | `lib/branch-header.ts` → `showBranchSwitcher` |

**CEO uchun nom:** loyihadagi ro'yxat (`roleLabel`) CEO'ni «Direktor» deydi; shuni qoldirdik.

## Chegaralar

- Profil birinchi ekran bo'lib qoladi («Bugun» ekrani kerak emas — CEO tanlovi).
- Server o'zgarmaydi: `@Roles`/`@Can` va filial qoidalari avvalgidek. Tanlagichni yashirish xavfsizlik chorasi emas, faqat qulaylik.
- Bitta filialli admin va filial direktori ham tanlagichni ko'rmaydi (tanlashga hech narsa yo'q). Filial nomi profilda («Batafsil ma'lumotlar») qoladi.
- Filial tanlagichi komponenti yashirinda ham ishlaydi: u filialni do'konga yozadi, shuning uchun har so'rovdagi `X-Branch-Id` o'zgarmaydi (`resolveStoredBranch` bitta filialni tanlaydi).

## Tekshiruv

- `profile-roles.test.ts`: barcha rollar o'zbekcha, inglizcha nom chiqmaydi; faqat Direktor roli bo'lsa oylik bloki yo'q, Direktor+ustoz bo'lsa bor.
- `branch-header.test.ts`: `showBranchSwitcher` — 0 va 1 filialda yashirin, 2 da ko'rinadi, CEO'da doim ko'rinadi; yashirin foydalanuvchi o'z filialida qoladi.
- Qo'llanma testlari (`reyestr`), `eslint`, `tsc`, `npm run build`.
- Telefon enida skrinshotlar: ustoz (profil, rasm menyusi, yon panel), CEO (bloksiz profil), admin.
- Telegram ichida (test bot) — ngrok va bot tokeni bilan, alohida ruxsat bilan; to'liq kirish yo'li (bot menyusi → `/tg` → profil) faqat `lehrer.`/`admin.` manzillarda sinaladi.

## Ommaga ko'rinadigan o'zgarish

Qo'llanma: `boshlash/interfeys.mdx` (filial va telefon bo'limlari) va `yangiliklar.ts`dagi bitta yozuv.
