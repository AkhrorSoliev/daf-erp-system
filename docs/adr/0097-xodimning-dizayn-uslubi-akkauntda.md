# ADR-0097 — Xodimning dizayn uslubi akkauntda saqlanadi; uslub tokenlarni almashtiradi, holat ranglarini emas

**Holati:** Qabul qilindi
**Sana:** 2026-10-17
**Bog'liq:** ADR-0031, ADR-0079, `server/src/common/ui-skins.ts`, `server/src/users/users.service.ts` (`updateUiSkin`), `client/src/lib/ui-skins.ts`, `client/src/app/skins.css`, `client/src/components/providers/skin-sync.tsx`, `docs/superpowers/specs/2026-10-17-dizayn-uslublari-design.md`, `docs/superpowers/plans/2026-10-17-dizayn-uslublari.md`

## Kontekst

16.10 da admin va o'qituvchi paneli yagona «ledger» dizayniga o'tdi. CEO har bir xodim o'ziga yoqqan rang va shriftni tanlay olishini xohladi. Erkin tanlov (rang alohida, shrift alohida) rad etildi: yomon ko'rinadigan juftlik chiqib qoladi va har birini tekshirib bo'lmaydi. Tanlov brauzerda emas, akkauntda saqlanishi kerak (CEO: boshqa qurilmada ham bir xil).

## Qaror

1. **Besh tayyor uslub**: `daftar` (boshlang'ich), `ormon`, `gilos`, `grafit`, `qum` — har biri rang va shrift juftligi, yorug' va qorong'i rejimda alohida. Ro'yxat serverda (`common/ui-skins.ts`) va klientda (`lib/ui-skins.ts`), test ikkalasini solishtiradi.
2. **`User.uiSkin String?`** (null = `daftar`). Yozish faqat `PATCH /users/ui-skin` (`@AnyStaff()`): chaqiruvchi faqat o'z qatorini yozadi, qiymat `IsIn(UI_SKIN_IDS)`. Profil eshigi (`PATCH /users/profile`) o'zgarmaydi (ADR-0031). `formatUser` `uiSkin` ni qaytaradi, shuning uchun kirish, `refresh` va Mini App javoblarida va `user` cookie'da bor.
3. **Uslub — `<html data-skin>`**. `skins.css` har uslub uchun ikki blok (`:root[data-skin]`, `.dark[data-skin]`) bilan asosiy tokenlarni almashtiradi; shrift uchun `--font-plex` ni qayta yozadi (`@theme inline` qiymatni nusxalaydi, `--font-sans` ni yozish ish bermaydi). **Holat ranglari (`--success`, `--warning`, `--info`, `--destructive`) va `--chart-2..5` uslubga qaramaydi** — ularga ma'no yuklangan.
4. **Chaqnashsiz**: `<head>` dagi qisqa skript `user` cookie'dan uslubni sahifa chizilishidan oldin qo'yadi. Cookie yo'q (kirish sahifasi) — doim Daftar.
5. **Tarixga yozilmaydi** (shaxsiy sozlama, audit uchun shovqin) va hech qanday ruxsat (`@Can`) kerak emas.

## Taqiqlanadi

- Uslub blokiga holat tokenini (`--success`, `--warning`, `--info`, `--destructive`) yoki `--chart-2..5` ni qo'yish.
- Yangi uslubni testsiz qo'shish: `skins.test.ts` har uslubning matn kontrastini (≥ 4,5) yorug' va qorong'i rejimda o'lchaydi.
- Boshqa odamning uslubini yozadigan yo'l ochish.

## Muqobillar

- **Uslub brauzerda (`localStorage`)**: bazaga tegmaydi, lekin har qurilmada qayta tanlash kerak. CEO tanlamadi.
- **Rang va shrift alohida tanlov**: erkinroq, lekin kafolatlab bo'lmaydi. Tanlanmadi.
- **Markaz yoki filial bo'yicha bitta uslub**: har kim o'zini tanlasin deyildi.

## Oqibatlar

- Migratsiya qo'shimcha (`ADD COLUMN IF NOT EXISTS "uiSkin"`), eski klient yangi maydonni ko'rmaydi. Chiqarish tartibi: migratsiya, server, klient.
- Boshqa qurilmada o'zgartirilgan uslub shu qurilmaga keyingi token yangilanishida (soatiga) yoki qayta kirishda keladi.
- Xodimlarning kirish sahifasi ranglari bo'yicha doim Daftar (kirishdan oldin sessiya cookie'si yo'q, atribut qo'yilmaydi). Shrift esa uslubga ergashadi: `setAuth` dan keyingi salomlashuv paytida va Mini App'dan chiqilgach (`clearSession`) xodimlarning `/tg` varag'ida. Bu faqat ko'rinish masalasi.
- O'quvchi portali (`.lumio`) va ommaviy forma (`.form-theme`) `--font-plex` ni qayta yozmaydi, ya'ni ular uslubdan o'zi himoyalanmagan: uslub atributi ularga yetib bormagani uchun xavfsiz. Birinchi sabab: ular boshqa domenlarda (`student.`, `form.`) turadi va admin cookie'si u yerga bormaydi. Ikkinchisi: `PATCH /users/ui-skin` — `@AnyStaff()`, o'quvchi uslub yoza olmaydi.
