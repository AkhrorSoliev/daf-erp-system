# ADR-0033 — Filial direktori o'z filiali ustozlariga stavka qo'yadi

**Holati:** Qabul qilindi
**Sana:** 2026-09-24
**Bog'liq:** ADR-0002, ADR-0022, `server/src/salary/shared/teacher-rate-permission.ts`, `server/src/salary/salary.controller.ts`, spec `docs/superpowers/specs/2026-09-24-filial-ishga-tushirish-yoli-design.md`

## Kontekst

Ustoz stavkasini yozish (`POST /salary/config`, `PATCH /salary/config/:id`)
2026-04 dan beri faqat CEO'da edi. Stavkasiz ustozni guruhga biriktirib
bo'lmaydi (`assertTeachersHaveRate`): stavkasiz o'tilgan dars uchun oylik
umuman yozilmaydi va keyin orqaga tuzatib bo'lmaydi (2026-yil may, ~20 mln
so'm). Natijada yangi filial direktori «birinchi guruh» qadamida to'xtab, CEO
stavka qo'yishini kutardi — ishga tushirish yo'lida CEO'ga bog'liq yagona
qadam shu edi. `docs/role-access.md` esa «direktor stavka qo'ya oladi» deb
yozgan edi — hujjat kod bilan zid edi.

## Qaror

Filial direktori ustoz stavkasini yozadi (`POST /salary/config`), lekin
faqat:

- **o'z filialidagi** (UserBranch ∪ mainBranch) xodimga;
- **«Ustoz roli bor hammaga».** Xodimda `Teacher` roli bo'lishi kifoya —
  administrator yoki kassir bo'lib ham dars beradigan xodim ENDI RUXSAT
  ETILADI (ADR-0022: bir odamning hamma xodim roli bitta hisobda). Faqat
  `CEO` yoki `Branch Director` rolidagi xodim — hatto `Teacher` rolini ham
  tutsa — CEO'da qoladi: ular direktorning tengi yoki ustidagi xodim,
  ularning oyligini direktor belgilamaydi;
- **o'zidan boshqaga**;
- **faqat FAOL xodimga** (`status = ACTIVE` va `isActive`);
- **faqat dars-asosli stavka turiga** — `PERCENTAGE`, `FIXED_PER_STUDENT`.
  `FIXED_MONTHLY` — guruhga bog'liq emas, xodim/direktor oyligi uchun
  ishlatiladi — faqat CEO belgilaydi;
- **`effectiveFrom` joriy ochiq oylik davridan oldin bo'lmasin**
  (`resolveCurrentPeriod`) — orqaga sanani qo'yib, yopilgan davrni «tuzatish»
  yo'q;
- guruhga bog'langan stavkada — guruh ham topilgan, arxivlanmagan va o'z
  filialida bo'lsin.

Chaqiruvchining o'zi HAR safar bazadan qayta tekshiriladi (JWT'dagi rol
eskirgan bo'lishi mumkin — masalan, tushirilgan direktor).

`PERCENTAGE` stavka 100 dan oshsa — HAMMA uchun, CEO ham, rad etiladi (400
`"Foiz 100 dan oshmasligi kerak"`).

**Taqiqlanadi:**

- Direktorga mavjud stavkani tahrirlash yoki o'chirish — `PATCH
  /salary/config/:id` **CEO-only** qoladi. Direktor UI hech qachon PATCH
  yubormaydi (tahrirlar `POST` orqali yangi versiya bo'lib yoziladi); ochiq
  qolgan `PATCH` direktorga yopiq konfigni ochiq versiyasiz qayta
  faollashtirish imkonini berardi — sukut oylik yozilishi.
- Direktorga `POST /salary/config/global`, hisoblash davri, oylikni hisoblash
  va tasdiqlash — CEO'da qoladi.
- Direktor `POST /salary/config` orqali xodimning mavjud FAOL FIXED_MONTHLY
  stavkasini dars-asosli stavkaga almashtira olmaydi — CEO qo'ygan oylikni
  faqat CEO o'zgartiradi.

Mavjud pul qo'riqchilari hamma uchun ishlayveradi: yangi versiya oldingisidan
oldin bo'lmaydi va APPROVED/PAID davrga tushmaydi. Kim o'zgartirgani
`changedById` da.

## Ko'rib chiqilgan muqobillar

**Faqat CEO (avvalgidek).** Rad etildi: yangi filialni ishga tushirish yo'lini
to'sadi.

**Direktor o'z filialining har bir xodimiga.** Rad etildi: xodimlar oyligiga,
jumladan boshqa direktorlar va o'zining oyligiga yo'l ochardi.

**Har o'zgarishda CEO'ga bildirishnoma.** Hozircha qilinmadi: versiya tarixida
kim o'zgartirgani bor, oylikni baribir CEO tasdiqlaydi.

## Oqibatlari

**Yutuq:** direktor yangi filialni CEO'ni kutmasdan ishga tushiradi — bitta
odam ikkinchi rol tutsa ham (masalan, administrator-ustoz).

**Narx:** oylik huquqi kengaydi — direktor ustoz stavkasini yaratadi va
o'zgartiradi (yangi versiya orqali); nazorat — versiya tarixi va CEO tasdig'i.

**Endi taqiqlangan:** direktorning mavjud stavkani `PATCH` orqali tahrirlashi
yoki o'chirishi; direktorning o'ziga, CEO'ga yoki boshqa direktorga (hatto
Ustoz rolini ham tutsa) stavka qo'yishi; 100 dan oshgan foiz stavka.
