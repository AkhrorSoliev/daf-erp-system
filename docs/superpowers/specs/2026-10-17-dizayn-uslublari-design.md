# Admin va o'qituvchi paneli: dizayn uslublari (rang va shrift to'plamlari)

Sana: 17.10.2026. Holat: dizayn tasdiqlandi (CEO: «ha davom et»; to'plamlar «A», saqlash
joyi «B — akkauntda»; beshta uslub namunada ko'rildi va «yetarli» deyildi).
Bu **4 bo'lakli ishning 2-bo'lagi**. 1-bo'lak ([foydalanuvchi menyusi](2026-10-17-admin-foydalanuvchi-menyusi-design.md))
shu branchda tayyor; bu bo'lak uning menyusiga «Dizayn uslubi» bandini qo'shadi, shuning
uchun ikkalasi bitta PR bo'lib chiqadi. 3-bo'lak (tillar) va 4-bo'lak (tarjima) alohida.

## Muammo

16.10 da panel o'z dizayniga o'tdi («ledger»: logotipning to'q ko'ki, IBM Plex Sans). CEO
endi har bir xodim o'ziga yoqqan rang va shriftni tanlay olishini xohlaydi, odatdagi
«dizayn» bo'limidagi kabi bir nechta tayyor variant. Erkin tanlov (rang alohida, shrift
alohida) rad etildi: yomon ko'rinadigan juftlik chiqib qoladi va har birini tekshirib bo'lmaydi.

## Yechim

### 1. Beshta uslub

Har uslub — tayyor «rang + shrift» juftligi, yorug' va qorong'i rejimda alohida.

| id (`uiSkin`) | Nomi | Asosiy rang (yorug') | Rang tusi (hue) | Shrift |
| --- | --- | --- | --- | --- |
| `daftar` | Daftar (hozirgi, boshlang'ich) | `#1b2d4e` to'q ko'k | 262 | IBM Plex Sans |
| `ormon` | O'rmon | `#1f4d3a` chuqur yashil | 165 | Rubik |
| `gilos` | Gilos | `#6b2233` to'q bordo | 10 | Montserrat |
| `grafit` | Grafit | `#2f3640` kulrang | 255 (chroma ×0,4) | Roboto Condensed |
| `qum` | Qum | `#6b4a1e` iliq jigarrang | 70 | Ubuntu |

Hamma shriftda lotin, lotin kengaytma (o'zbek `ʻ`) va **kirill** harflari bor (3-bo'lak uchun
shart). Serif yo'q: CEO «AI sayt» ko'rinishini xohlamagan.

**Qoidalar:**
- **Faqat asosiy tokenlar almashadi.** Holat ranglari (`--success`, `--warning`, `--info`,
  `--destructive`) va `--chart-2..5` uslubga qaramay bir xil: ularga ma'no yuklangan. `--chart-1`
  asosiy rangni kuzatadi.
- **Neytral rang asosiy rangning tusiga moslanadi**, xuddi Daftar'dagidek: har tokenning L va C
  qiymati Daftar'nikidek, faqat tus (hue) uslubniki bilan almashadi. Asosiy rangning o'zi
  jadvaldagi `#`-qiymatning OKLCH ko'rinishi (qorong'i rejimda och tus, Daftar'dagi
  `--primary: oklch(0.82 0.06 255)` kabi: L 0,82, C jadvaldagi rangning C si, tus o'sha).
  Grafit'da barcha C qiymatlar 0,4 ga ko'paytiriladi (deyarli neytral).
- Almashadigan tokenlar: `--background`, `--foreground`, `--card(-foreground)`,
  `--popover(-foreground)`, `--primary(-foreground)`, `--secondary(-foreground)`, `--muted(-foreground)`,
  `--accent(-foreground)`, `--border`, `--input`, `--ring`, `--chart-1`, va barcha `--sidebar*`.

### 2. Fayllar (klient)

- **`src/app/skins.css`** (yangi) — `layout.tsx` da `globals.css` dan keyin import qilinadi.
  Har uslub uchun ikki blok, tartib muhim: avval `:root[data-skin="ormon"] { … }`, keyin
  `.dark[data-skin="ormon"] { … }`. Ikkalasining o'ziga xosligi teng, qorong'i blok keyin
  yozilgani uchun yutadi; ikkalasi ham `globals.css` dagi `:root` va `.dark` dan kuchli.
  `daftar` uchun blok yo'q: atribut yo'q yoki `daftar` bo'lsa hozirgi tokenlar ishlaydi.
  **Nega alohida fayl:** `feat/kirish-logotip-varaqlari` branchi `globals.css` ni katta
  o'zgartiryapti (eski `.daftar` mavzusi o'chadi). Alohida fayl merge to'qnashuvini yo'qotadi.
- **Shrift o'zgaruvchisi:** `globals.css` dagi `@theme inline` `--font-sans/--font-heading/--font-mono`
  qiymatini `var(--font-plex)` ko'rinishida **to'g'ridan-to'g'ri o'rniga qo'yadi** (`inline`),
  shuning uchun `--font-sans` ni qayta yozish ish bermaydi. Uslub `--font-plex` ning o'zini
  qayta yozadi: `:root[data-skin="ormon"] { --font-plex: var(--font-rubik); }`. Brauzerda
  hisoblangan `font-family` bilan tekshiriladi (qo'lda).
- **`src/app/layout.tsx`:** `next/font/google` dan `Rubik`, `Montserrat`, `Roboto_Condensed`,
  `Ubuntu`: `subsets: ["latin", "latin-ext", "cyrillic"]`, `display: "swap"`, **`preload: false`**
  (`variable: "--font-rubik"` va hokazo), og'irliklar 400/500/600 (Ubuntu'da 600 yo'q: 400/500/700,
  `font-semibold` 700 ga tushadi). `preload: false` va `unicode-range` tufayli brauzer faqat
  tanlangan uslubning shriftini yuklaydi, Daftar foydalanuvchisiga hech narsa qo'shilmaydi.
  Yangi shriftlarning `.variable` sinflari `<html>` ga qo'shiladi.
- **`src/lib/ui-skins.ts`** (yangi) — yagona ro'yxat: `UI_SKINS = [{ id, label, swatch, font }]`,
  `DEFAULT_SKIN = "daftar"`, `isUiSkin(v)`, `skinOrDefault(v)`. Menyu, sinxronlash va testlar
  shu ro'yxatni o'qiydi. Server ro'yxati uning nusxasi (4-band), test ikkalasini solishtiradi.

### 3. Server

- **Prisma:** `User.uiSkin String?` (null = `daftar`). Migratsiya faqat `ADD COLUMN IF NOT EXISTS`,
  qo'shimcha, ma'lumotga tegmaydi. Dev bazada `migrate dev` ishlamaydi: loyiha tartibi
  (`prisma migrate diff` → `db execute` → `migrate resolve --applied`).
- **`PATCH /users/ui-skin`** (`UsersController`, `@AnyStaff()`): `UpdateUiSkinDto { skin }`,
  `@IsIn(UI_SKIN_IDS)`. Faqat o'zining qatorini yozadi (`@CurrentUser('id')`); boshqa odamning
  uslubini o'zgartiradigan yo'l yo'q. Javob `{ uiSkin }`. `UpdateProfileDto` ga tegilmaydi
  (ADR-0031: profil eshigi faqat ism va rasm). O'quvchi tokeni `@AnyStaff()` da 403.
- **`AuthService.formatUser`** `uiSkin` ni qaytaradi (kirish, `refresh`, Telegram, Mini App —
  hammasi shu funksiya orqali). `UI_SKIN_IDS` ro'yxati `common/ui-skins.ts` da, kamida bitta joyda.
- **Marshrut manifesti:** yangi marshrut `route-access.snapshot.json` va `branch-route-policy.ts`
  ga (`SELF`: faqat o'ziga tegishli) qo'shiladi, `permission-routes.spec.ts` shuni talab qiladi.
  Tarixga (`EntityHistory`) yozilmaydi: bu shaxsiy sozlama, audit uchun shovqin.
- **ADR-0097** (ma'lumot modeli o'zgaradi): `User.uiSkin` shaxsiy sozlama, akkauntda saqlanadi,
  tarix yozilmaydi, kirmagan odamga ko'rsatilmaydi. Raqam `main` dagi oxirgisidan keyingisi
  bo'lishi kerak (PR oldidan `docs/adr/README.md` tekshiriladi, to'qnashsa `git mv`).

### 4. Klientda qo'llash

- **`AuthUser.uiSkin?: string | null`** (`hooks/use-auth.ts`); eski cookie'da yo'q bo'lishi mumkin.
- **`SkinSync`** (`components/providers/skin-sync.tsx`, `AuthProvider` ichida): `user.uiSkin`
  o'zgarganda `document.documentElement.dataset.skin` ni yozadi (`skinOrDefault`), `localStorage["daf-skin"]`
  ga nusxa saqlaydi; foydalanuvchi chiqqanda (user yo'q) atributni va nusxani olib tashlaydi.
- **Chaqnashsiz boshlash:** `<head>` da qisqa inline skript (`next-themes` kabi): `token` cookie
  bor bo'lsa `localStorage["daf-skin"]` ni o'qib `data-skin` ni sahifa chizilishidan oldin qo'yadi.
  Cookie yo'q (kirmagan) bo'lsa hech narsa qilmaydi, shuning uchun login doim Daftar. Yangi
  qurilmada nusxa yo'q: birinchi kirishda foydalanuvchi ma'lumoti kelgach qo'llanadi.
  `suppressHydrationWarning` `<html>` da allaqachon bor.
- **Tanlash:** `useUiSkin()` (`hooks/use-ui-skin.ts`): `setSkin(id)` — darrov qo'llaydi
  (optimistik), `PATCH /users/ui-skin`, muvaffaqiyatda `user` store va cookie'ni yangilaydi
  (`setAuth` ni qayta chaqirmaydi, tokenlarga tegmaydi), xatoda eski uslubga qaytaradi va
  `toast.error(getErrorMessage(…, "Dizayn uslubini saqlab bo'lmadi"))`. Ikki bosish ketma-ket:
  oxirgisi yutadi (so'rov kelmagan holatda oldingisi bekor emas, lekin oxirgi javob
  `user.uiSkin` ni belgilaydi).

### 5. Menyu

`HeaderUserMenu` (1-bo'lak): «Ko'rinish» dan keyin yangi `DropdownMenuSub` **«Dizayn uslubi»**
(ikonka `Swatches` yoki `Palette` dan boshqasi; `Palette` allaqachon «Ko'rinish» da, shuning
uchun `Brush`). Ichida `DropdownMenuRadioGroup`, besh qator: rang nuqtasi (`swatch`), nomi,
joriysiga belgi. Qiymat `user.uiSkin ?? DEFAULT_SKIN`. «Ko'rinish» (yorug'/qorong'i) o'zgarmaydi.
Telefonda ham shu menyu (1-bo'lak: user yuqori panelda hamma kenglikda).

### 6. Chegaralar

- Faqat admin va o'qituvchi portali. `.lumio` (o'quvchi portali) o'z blokida tokenlarni
  qayta yozadi va ildizdagi `data-skin` dan ustun, o'zgarmaydi; ommaviy forma (`.form-theme`)
  ham shunday. O'quvchi kirganda `uiSkin` yo'q va `SkinSync` atribut qo'ymaydi (o'quvchi
  tokenida `uiSkin` maydoni kelsa ham — `null`).
- **Login** (`feat/kirish-logotip-varaqlari` bilan): xodimlar kirishi panelning o'z
  tokenlarida chiziladi, kirishdan oldin `data-skin` yo'q, shuning uchun doim Daftar. Kirgach
  uslub qo'llanadi. Bu ikki ish bir-biriga bog'liq emas: shu bo'lak `globals.css` ga tegmaydi.
  Login muqovasi `--primary` dan foydalansa, uslub qo'llangandan keyingina ranggi o'zgaradi;
  kirishdan oldin o'zgarmaydi.
- Xodim Mini App kabineti (`/tg`, `admin.`/`lehrer.`) kirgach shu cookie'dan uslubni oladi,
  qo'shimcha ish kerak emas.
- Diagramma palitrasi (`chart-palette.ts`), holat ranglari, PDF/Excel/Telegram matnlari
  uslubga bog'liq emas.
- Markaz yoki filial bo'yicha umumiy uslub yo'q; har kim o'zinikini tanlaydi.

## Chekka holatlar

- `uiSkin` noma'lum qiymat (eski/yangi klient farqi): `skinOrDefault` → Daftar, xato yo'q.
- Server `PATCH` xatosi (offline, 401): uslub eskisiga qaytadi, toast; 401 ni axios umumiy
  oqimi hal qiladi.
- Shrift yuklanmadi (tarmoq): `font-display: swap`, zaxira shrift; uslub ranglari baribir qo'llanadi.
- Qorong'i rejim va uslub mustaqil: `next-themes` `.dark` ni boshqaradi, uslub `data-skin` ni.
- Boshqa qurilmada o'zgartirilgan uslub: shu qurilmada keyingi token yangilanishida
  (`/auth/refresh`, soatiga) yoki qayta kirishda keladi. Darrov sinxronlash yo'q (SSE yo'q).
- `localStorage` o'chirilgan (shaxsiy rejim): nusxa yo'q, birinchi chizishda Daftar, so'ng
  `SkinSync` qo'llaydi — qisqa chaqnash, buzilish emas.

## Test

- `skins.test.ts` (`staff-theme.test.ts` uslubida, `skins.css` ni o'qiydi): har uslub × yorug' va
  qorong'i uchun matn kontrasti (`--foreground`, `--muted-foreground` fon va kartada ≥ 4,5;
  `--primary-foreground` asosiy rangda ≥ 4,5; `--sidebar-foreground` yon menyuda ≥ 4,5);
  har uslubning ikkala bloki mavjud va qorong'i blok yorug'idan keyin turadi; holat tokenlari
  uslub blokida yo'q (bir xil qoladi).
- `ui-skins.test.ts`: ro'yxat besh uslub, `daftar` boshlang'ich, `skinOrDefault`; klient va server
  ro'yxati bir xil (server `common/ui-skins.ts` ni fayl sifatida o'qiydi, `permission-keys.test.ts` kabi).
- `use-ui-skin.test.ts`: optimistik qo'llash, xatoda qaytarish (axios va document sinab ko'riladi).
- `header-user-menu.test.ts` ga: «Dizayn uslubi» va besh nom chiqadi.
- Server: `users.controller.spec.ts` (`routeAccess` `AnyStaff`), `users.service.spec.ts`
  (faqat o'z qatori yoziladi, noma'lum nom 400), `auth.service.spec.ts` (`formatUser` `uiSkin` qaytaradi),
  `permission-routes.spec.ts` snapshot.
- `npx tsc --noEmit`, `npx eslint src`, `npm test` (klient va server), `npm run build`, `npm run typecheck` (server).
- Brauzerda: beshta uslub × yorug' va qorong'i × 1440 / 768 / 375; hisoblangan `font-family`
  har uslubda to'g'ri; yangilagandan keyin chaqnash yo'q; chiqib-kirgandan keyin login Daftar;
  o'quvchi portali o'zgarmagan.

## Chiqarish tartibi

1. Server: migratsiya prodda qo'lda qo'llanadi (Railway, deploy qo'lda), keyin server deploy.
2. Klient (Vercel). Eski klient yangi maydonni shunchaki ko'rmaydi; yangi klient eski serverda
   `uiSkin` ni olmaydi va Daftar'da qoladi, `PATCH` 404 beradi (toast), buzilish yo'q.
3. `client/CLAUDE.md` ga bo'lim: uslublar, `skins.css`, `--font-plex` qoidasi, yangi uslub qo'shish
   tartibi (ro'yxat → css → test → server ro'yxati). Qo'llanma (`interfeys.mdx`) va
   `yangiliklar.ts` yangilanadi.
