# Xodimlar kirish sahifasi: panelga mos «Logotip varaqlari»

Sana: 17.10.2026. Holat: dizayn tasdiqlandi — CEO «1-variant: Logotip varaqlari —
shuni tanlayman» dedi. Tarmoq: `feat/kirish-logotip-varaqlari`.

Bu hujjat 02.10.2026 dagi [«Daftar» dizaynini](2026-10-02-daftar-kirish-sahifasi-design.md)
almashtiradi.

## Muammo

16.10 da admin/o'qituvchi paneli o'z dizayniga o'tdi («ledger»: logotipning to'q
ko'ki, IBM Plex, holat ranglari). 02.10 da qurilgan kirish sahifasi («Daftar») undan
oldin yozilgani uchun uch joyda panelga o'xshamaydi:

1. sarlavha qiyshiq (Fraunces kursiv) — panelda bu shrift yo'q, «AI sayt» bo'lmasin
   deb olib tashlangan edi;
2. rang boshqa: yorqin ko'k (admin) va yashil (o'qituvchi); panelda ikkalasi ham
   logotipning to'q ko'ki;
3. logotip yo'q; panelda bor.

CEO yana: kirish «zerikarli oddiy» bo'lib qolmasin va umuman daftardan uzoqlashsak
bo'ladi.

## Yechim

Sahifa panelning o'z mavzusini (tokenlar, shrift) o'zgarishsiz ishlatadi; yagona
maxsus joy — chap tomondagi **muqova**:

- logotip oq rangda (tungi rejimda panelning yon menyusidagidek `brightness-0 invert`);
- logotipdagi ochilgan kitob varaqlari katta yelpig'ich bo'lib chizilgan (13 chiziq,
  burchakda bitta umurtqadan);
- yorug' rejimda fon `--primary` (logotip ko'ki), tungi rejimda to'q ko'k (`--primary`
  tungi rejimda och tusga o'tadi, oq logotip uchun to'q fon kerak).

Joylashuv: `lg` dan kompyuterda ikki ustun (5fr / 7fr), muqova chapda; telefonda muqova
tepada 8rem li tasma. O'ng tomonda sarlavha («Boshqaruv» / «O'qituvchi») va forma —
panelning o'z `Input`, `Label`, `Button` lari, `h-11`.

Harakat: sahifa ochilganda varaqlar bir marta birin-ketin chizib chiqiladi
(`stroke-dashoffset`, 60ms oraliq, 0.9s); `prefers-reduced-motion` da o'chiq. Boshqa
animatsiya yo'q.

Admin va o'qituvchi sahifasi faqat sarlavhasi bilan farq qiladi — panelning o'zida
ham shunday.

## Qamrov

Qayta quriladi: `/login` (admin., lehrer.), `/auth/telegram/callback` (xodim xostlari),
xodim Mini App kirishi (`/tg`, admin./lehrer.) — hammasi bitta qobiqda
(`StaffSignInShell`). Kirgach salom (`staff-greeting.tsx`) saqlanadi, faqat ko'rinishi
oddiy: rasm/bosh harf, «Xush kelibsiz,» va ism.

Olib tashlanadi: `.daftar*` CSS va `daftar-theme.test.ts`, `DaftarSheet`,
`daftar-field.ts`, `daftarScope()`, Fraunces kursiv shrifti, parol tiklash oynasining
«Daftar» ko'rinishi (oyna 02.10 dan oldingi holatiga qaytadi — u panelning o'z
tokenlarida allaqachon to'g'ri chiqadi).

Tegilmaydi: o'quvchi kirishi (`student.` — Lumio, foto, shisha panel) va o'quvchi
Mini App; kirish mantig'i, API chaqiruvlari, telefon maydoni qoidasi.

Qilinmaydi (so'ralmagan): kun vaqtiga qarab nemischa salom, soat, kun so'zi.

## Tekshirish

- Brauzerda: admin va o'qituvchi × yorug' va tungi × 1440px va 390px; xato holati;
  parol tiklash oynasi; Telegram callback xatosi; Mini App «Telegram ichida ochiladi»
  holati; salom; o'quvchi kirishi va o'quvchi Mini App o'zgarmagani.
- `npx tsc --noEmit`, `npx eslint src`, `npm test`, `npm run build`.
- Saytga chiqarishdan oldin CEO'ga haqiqiy sahifa skrinshoti ko'rsatiladi.
