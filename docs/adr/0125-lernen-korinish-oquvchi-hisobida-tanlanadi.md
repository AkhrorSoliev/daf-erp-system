# ADR-0125 — Ta'lim ko'rinishini o'quvchi hisobida tanlaydi; temalar faqat ko'rinish qatlami

**Holati:** Qabul qilindi
**Sana:** 2026-10-24
**Bog'liq:** `docs/superpowers/specs/2026-10-24-lernen-dizayn-tanlash-design.md`, `docs/superpowers/plans/2026-10-24-lernen-dizayn-asos.md`, ADR-0101 (xodim skinlari), ADR-0020 (faollik o'lchovi)

## Kontekst

`portal/lernen` (yo'l, unit, mashq, natija) oddiy va jonsiz edi: yo'lning ikki yoni bo'sh, animatsiya va interfeys ovozi yo'q. CEO o'quvchiga o'ziga yoqqan ko'rinishni tanlash imkonini berishni va Duolingo kabi harakat/ovozli, to'liq his beradigan dizaynni istadi (24.10.2026 sessiyasi, mockuplar `docs/superpowers/mockups/2026-10-24-lernen-dizayn/`).

## Qaror

1. **Tanlov hisobda saqlanadi:** `Student.lernenTema` (`String?`, null = `toza`), `PATCH /student-portal/lernen-tema` (`@StudentOnly()`). `User.uiSkin` (xodim skinlari, ADR-0101) bilan aralashtirilmaydi: ro'yxatlar va ustunlar alohida, `server/src/common/lernen-temalar.ts` ↔ `client/src/lib/lernen-temalar.ts` testi bilan bog'langan.
2. **Temalar faqat ko'rinish.** Yo'l tuzilishi, qulf, ball, mashq oqimi (`yol-tuzilishi`, `fortschritt`, `seans-navbat`) hamma temada bir xil; tema `LernenTema` shartnomasi orqali faqat chizadi (`TugunBelgisi`, keyingi bosqichlarda sahna/lavha/mukofot).
3. **Qurilma sozlamalari serverga yozilmaydi:** ovoz (`daf.lernen.ovoz`) va «kam harakat» (`daf.lernen.harakat`) — `localStorage`; hisob tanlovining keshi `daf.lernen.tema`. Tizim `prefers-reduced-motion` ni hech qachon bekor qila olmaymiz (ko'proq harakatga qaytarib bo'lmaydi).
4. **Ovoz tashqi faylsiz:** Web Audio sintezi (marimba/kalimba, arfa — Karplus-Strong, shisha qo'ng'iroq, havo shovqini). Litsenziya va yuklash yo'q; dars audiosi o'ynayotganda effekt chalinmaydi (mukofotdan tashqari).
5. **Animatsiya kutubxonasi — `gsap`, faqat lernen'da lazy** (`import("gsap")` Dafi ichida): asosiy portal paketiga kirmaydi. Dafi — 2D SVG bosh, 5 holat; xato holati yumshoq (jazolamaydi).

## Rad etilgan yo'llar

- **3D ayiqcha kodda** (Three.js, sferalar): CEO «hunuk» dedi; mo'ynali Pixar darajasiga yetmaydi.
- **AI bilan rasmdan 3D model + AI skelet** (Hunyuan 3D, Meshy; ~$1.7 sarflandi): yurish yaxshi, lekin qo'l ko'targanda qo'l yassi tasmaga aylanadi (AI og'irliklari xato), yuz animatsiyasi yo'q, fayl 25 MB. Tuzatish 3D rassomning ishi.
- **Pixar rasm + kodda harakat:** CEO 3D ni istadi; 3D bo'lmagach eng oddiy 2D bosh tanlandi.
- **`User.uiSkin` ni qayta ishlatish:** nomlar to'qnashadi (`ormon`), o'quvchi xodim skiniga kira olmaydi.
- **Tanlovni faqat qurilmada saqlash:** telefon va kompyuterda har xil ko'rinadi.

## Oqibatlar

- Yo'l sahifasi `useLernenTema()` ga bog'liq; profil javobiga `lernenTema` qo'shildi.
- Yangi tema qo'shish: reyestrga bir yozuv + `tayyor: true` + (server ro'yxatida id allaqachon bor) — migratsiya kerak emas.
- Telegram Mini App WebView'da Web Audio jim bo'lishi mumkin: `ovozChal` hech qachon xato bermaydi.
- Keyingi bosqichlar (mashq/natija ekrani, O'rmon, Dengiz, Nemis sayohati) shu shartnomaga qo'shiladi; rassom animatsiyasi (Rive) `Dafi` interfeysini o'zgartirmasdan almashtiriladi.
