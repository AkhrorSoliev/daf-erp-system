# O'quvchi portali: planshet va kompyuter ko'rinishi

Sana: 30.09.2026. Holat: dizayn tasdiqlandi — maketlardan C varianti tanlandi,
yon menyu va Davomat maketi ham tasdiqlandi («Ha, tasdiqlayman»).
Tarmoq: `fix/portal-planshet-desktop`.

## Muammo

26.09 da veb portal 375 / 768 / 1024 / 1440 kengliklarda ko'rildi. Telefon
ko'rinishi yaxshi, planshet va kompyuter alohida ishlanmagan:

1. **Planshetda (768px) yon menyu faqat belgilardan iborat.** Menyu 72px, nomlar
   faqat `title` tooltip'da. Barmoq bilan bosiladigan planshetda tooltip hech
   qachon chiqmaydi — o'quvchi belgining nima ekanini bilmaydi.
2. **Asosiy va Jadval kompyuterda (1440px) yarmi bo'sh.** Ro'yxatlar
   `lg:grid-cols-2`, lekin odatiy o'quvchida 1 guruh va kuniga 1 dars bor: bitta
   karta chap yarmida, o'ng yarmi bo'sh. Balans va Davomat kartasi esa 980px ga
   cho'zilgan. Bu audit U2 (`docs/student-portal-ux-audit.md`).
3. **Davomat 1440px da qatorlari 916px.** Sana bir chetda, holat belgisi
   boshqa chetda — ko'z qatorni kuzatolmaydi. FAQ va Biz haqimizda ham shunday
   cho'zilgan (U2 ro'yxatida bor).
4. **Ta'lim bo'limi internet uzilganini xato deb ko'rsatadi.** Internet yo'q
   paytda React Query so'rovni pauzaga qo'yadi (`isLoading` ham, `isError` ham
   emas). Ta'lim ekranlari `isError || !data` bilan qaror qiladi, shuning uchun
   «…yuklab bo'lmadi» va foydasiz «Qayta urinish» chiqadi. Portalning qolgan
   qismi 26.09 dan (#563) `loadState` + `LoadFailed` qoidasida: «Internet
   aloqasi yo'q», tugmasiz. Xuddi shu shakl to'rt komponentda, besh joyda bor:
   `lernen-levels-page.tsx`, `lernen-unit-page.tsx`, `lernen-lesson-page.tsx`,
   `reyting/reyting-ekrani.tsx` (`ReytingJadvali` va `DarajamTab`).

To'lovlar sahifasi (tez summalar) #579 bilan tuzatilgan va saytda — bu ishga
kirmaydi.

## Yechim

### 1. Yon menyu: belgi ostida nomi

`lumio/side-rail.tsx`, faqat yig'ilgan (72px) holat:

- Har menyu qatori: belgi (20px), ostida nomi — `text-[11px]`, `leading-tight`,
  bir qator, `max-w-full truncate` (himoya). Qator `flex-col`, `gap-1`,
  `px-1 py-2`. Eng uzun nom «Sozlamalar» ~56px, 72px ichiga sig'adi.
- Profil rasmi ostida «Profil» yozuvi.
- Menyu qatorlaridagi `title` olib tashlanadi — nom endi ko'rinib turadi.
  Profil havolasining `title={fullName}` qoladi (sichqonchada to'liq ism).
- Kengaytirish tugmasi o'zgarmaydi (`aria-label` bor, «Kengaytirish» 72px ga
  sig'maydi).
- **Kenglik o'zgarmaydi:** `RAIL_WIDTH` / `CONTENT_INSET` / `PLAYER_INSET`
  (`lib/sidebar-store.ts`) tegilmaydi. Sahifa torlashmaydi, radio pleyeri va
  dars paneli joyida qoladi.
- Menyu qatori kichik komponentga ajratiladi (`RailNavItem`,
  `{ item, active, collapsed }`) — shunda yig'ilgan holatni test to'g'ridan-
  to'g'ri chiza oladi (zustand statik render'da faqat boshlang'ich holatni
  beradi).
- Keng (240px) holat o'zgarmaydi.

### 2. Asosiy: kompyuterda 2×2 (≥1024px)

`student-home-page.tsx`. To'rt blok bitta `grid gap-4 lg:grid-cols-2` ichida:

| | 1-ustun | 2-ustun |
|---|---|---|
| 1-qator | Balans | Davomat |
| 2-qator | Bugungi darslar | Guruhlarim |

- Har blokning joyi qat'iy (`lg:col-start-* lg:row-start-*`). Davomat
  (`attendance/stats`) kechroq kelsa yoki umuman kelmasa, uning katagi bo'sh
  turadi — boshqa bloklar surilmaydi, sahifa sakramaydi.
- 1-qatordagi ikki blok bir xil balandlikda (katak cho'ziladi, ichidagi karta
  `lg:h-full`).
- Ichki ro'yxatlar (bugungi darslar, guruhlar) bitta ustun: `lg:grid-cols-2`
  olib tashlanadi — yarim kenglikdagi ustunda ikki karta yonma-yon sig'maydi.
- DOM tartibi o'zgarmaydi: Balans, Davomat, Bugungi darslar, Guruhlarim.
  1024px dan kichikda — hozirgidek bitta ustun, oraliq ham o'sha (`gap-4`).

### 3. Tor ustun: 600px, ekran o'rtasida

`lumio/screen.tsx` — `narrow` endi o'rtaga ham qo'yadi:
`md:max-w-[600px] md:mx-auto`. Bitta qoida, bitta joyda.

`narrow` ga o'tadiganlar:

- Jadval (`student-schedule-view.tsx`) — uchala `Screen` (yuklanish, xato,
  asosiy), shunda sarlavha holatlar orasida sakramaydi. Kun ichidagi
  `lg:grid-cols-2` olib tashlanadi.
- Davomat (`student-attendance-history.tsx`).
- FAQ (`student-faq-page.tsx`) va Biz haqimizda (`student-about-page.tsx`).

Allaqachon `narrow` bo'lganlar o'rtaga o'tadi (hozir chapga yopishgan):
Sozlamalar, Profil, Ta'lim bo'limi, dars va reyting sahifalari. Darsdagi mashq
ekrani (`seans-ekrani.tsx`) o'z ustunini allaqachon o'rtaga qo'yadi
(`mx-auto max-w-2xl`) — endi hammasi bir xil.

Keng qoladi: To'lovlar (2 ustun), Radio (stansiyalar to'ri), Ko'proq.

### 4. Ta'lim: `loadState` + `LoadFailed`

Besh joy #563 qoidasiga o'tadi (`lib/load-state.ts`, `load-failed.tsx`):

```tsx
const query = useLernenLevels();
const state = loadState(query);
// state === "loading" → skelet
// !query.data        → <LoadFailed query={query} />   (offline yoki failed)
// keyin              → bo'sh holat / ma'lumot
```

- `loading` tekshirilgandan keyin `!data` faqat `offline` yoki `failed`
  bo'ladi — TypeScript ham `data` ni toraytiradi.
- Internet yo'q: «Internet aloqasi yo'q», tugmasiz. Xato: «Ma'lumotni yuklab
  bo'lmadi» + «Qayta urinish». Bo'lim va dars sahifalarida hozir retry tugmasi
  yo'q edi — endi bor.
- `ReytingXatosi` ishlatilmay qoladi — o'chiriladi.
- `YolTepasi` o'zgarmaydi: pauza holatida u allaqachon hech narsa chizmaydi.

## Chegaralar (bu ishga kirmaydi)

- Keng yon menyu planshetda sahifani toraytiradi (768 − 240). Bu o'quvchining
  o'z tanlovi; belgi ostida nom chiqqach, planshetda kengaytirishga ehtiyoj
  qolmaydi. O'zgarmaydi.
- Darsdagi mashq ekranining (`seans-ekrani.tsx`) internet uzilgandagi holati —
  alohida oqim, alohida ish.
- Jadvaldagi bekor qilingan/ko'chirilgan darslar (audit S1), bo'sh kunlar (S2).
- Telefon ko'rinishi (<768px) — o'zgarmaydi. Native ilova — telefon uchun, bu
  ish unga tegishli emas (parity qoidasi kenglik tartibiga taalluqli emas).

## Boshqa ish bilan kesishuv

Ochiq PR #609 (dars pastki paneli yon menyu ostida qolmasin) `sidebar-store.ts`
izohini va `client/CLAUDE.md` ning yon menyu bo'limini o'zgartiradi. Bu ish
`sidebar-store.ts` ga tegmaydi. `client/CLAUDE.md` da matn to'qnashuvi bo'lishi
mumkin — qaysi biri keyin birlashsa, o'sha `main` bilan yangilanadi va qo'lda
hal qilinadi.

## Tekshiruv

Avtomatik testlar (vitest, `client/`):

- `student-portal-load-states.test.ts` — Ta'lim ekranlari qo'shiladi: xato,
  internet yo'q, yangilash xatosi (ma'lumot joyida qoladi), bo'sh javob.
  Eski kodda «internet yo'q» holati yiqilishi kerak.
- `student-portal-nav.test.ts` — yig'ilgan yon menyu qatori nomini chizadi
  (`RailNavItem collapsed`). Eski kodda yiqiladi.
- Joylashuv testi (statik render): `Screen narrow` → `md:mx-auto`; Jadval,
  Davomat, FAQ, Biz haqimizda — `narrow`; Asosiy — to'rt katakning joyi.
- `npx tsc --noEmit`, `npx eslint src`, `npm run build`.

Brauzer (soxta API, o'ylab topilgan ma'lumot, headless Chromium):

- Yo'llar: `/portal`, `/portal/schedule`, `/portal/attendance`,
  `/portal/settings`, `/portal/lernen`, `/portal/lernen/reyting`.
- Kengliklar: 375, 768, 1024, 1440. Yon menyu: yig'ilgan, keng. Mavzu: yorug',
  qorong'i.
- Tekshiriladi (geometriya, skrinshot emas): 768 da menyu nomlari ko'rinadi va
  kesilmaydi; 1440 da Asosiy — Balans va Davomat yonma-yon, bir xil
  balandlikda; Jadval/Davomat ustuni ≤600px va chap-o'ng bo'shliq teng;
  375 da hozirgidek bitta ustun; Ta'lim — `offline` hodisasidan keyin
  «Internet aloqasi yo'q».
- CEO ga hozir/keyin skrinshotlari saytga chiqarishdan oldin ko'rsatiladi.

## Hujjatlar

- `client/CLAUDE.md`: yon menyu (72px — belgi + ostida nom), `Screen narrow`
  (o'rtada), Asosiy 2×2 (qat'iy kataklar).
- `docs/student-portal-ux-audit.md`: U2 — «TUZATILDI 30.09», qisqa izoh.

## Saytga chiqarish tartibi

Faqat sayt (client). Server, baza, native ilova tegilmaydi.

1. PR — CEO ko'rib birlashtiradi.
2. `main` dan toza worktree, `vercel --prod`, beshala domen yangi versiyaga
   o'tkaziladi (`admin`, `lehrer`, `student`, `form`, `invoice`).
3. Jonli saytda tekshiruv: `student.dafzentrum.uz` bo'laklarida yangi kod bor.
