# ADR-0111 — DaF kunlik yig'indisi: hosila jadval `DafStudentDay`

**Holati:** Qabul qilindi
**Sana:** 2026-10-18
**Bog'liq:** `docs/superpowers/specs/2026-10-18-musobaqa-s1-poydevor-design.md`, `docs/superpowers/specs/2026-09-06-ball-va-yol-design.md` (§7), `docs/superpowers/specs/2026-08-27-daf-faza-2-design.md` (D4), `server/src/daf/shared/attempt-writer.ts`, `server/src/daf/fortschritt/fortschritt.service.ts`

## Kontekst

`FortschrittService` ikki joyda og'ir ishlardi: seriya uchun o'quvchining butun tarixidagi urinishlarini o'qirdi (faqat sanasi uchun), markaz o'rni uchun esa har so'rovda butun markazning haftalik urinishlarini qayta yig'ardi (`groupBy` + `_sum`). Prod'da hozir ≈ 26 000 urinish va 30–51 haftalik mashq qiluvchi; reklamadan keyin 1 000–5 000 o'quvchi kutiladi, 5 000 da haftasiga ≈ 1 mln qator. Yo'l ekrani har ochilganda va har seansdan keyin shu hisob ishlaydi. Musobaqa tizimining keyingi bosqichlari (S2 kunlik maqsad, S3 liga, S4 Telegram) xuddi shu yig'indilarni yana uch joyda so'raydi.

## Qaror

1. **`DafStudentDay` — hosila jadval:** o'quvchi × Toshkent kuni × `groupKey` bo'yicha `points` va `attempts` yig'indisi. Asl yozuv `DafAttempt` bo'lib qoladi (ball ham urinishda turadi, `DafAttempt.points`). Jadvalni istalgan payt urinishlardan qayta qurish mumkin.
2. **Faza 2 dizaynining (27.08, D4) «progress jadvali YO'Q» qoidasi buzilmaydi.** 06.09 dizayni uni yangi jadval kerak emas deb takrorlagan edi; endi jadval bor, shuning uchun qoidaning ma'nosi quyida aniqlanadi. O'sha qoida ball *holat* sifatida saqlanmasin, formula o'zgarsa tarix qayta hisoblansin, degani edi. Bu jadval holat emas: yig'indi har doim urinishlardan qayta quriladi. Formula o'zgarsa tartib: urinishlardagi ball → `scripts/rebuild-daf-student-day.ts --apply`.
3. **Bitta yozuvchi — `recordAttempt`** (`daf/shared/attempt-writer.ts`). `DafAttempt` qatori va kunlik qator bitta tranzaksiyada yoziladi; kunni yozuvchi o'zi qo'ygan `createdAt` dan hisoblaydi, shuning uchun ikkalasi bir kunga tushadi. Oshirish Postgres'da: `INSERT … ON CONFLICT ("studentId","day","groupKey") DO UPDATE SET points = points + EXCLUDED.points, attempts = attempts + 1` — parallel javoblar bir-birining yig'indisini yo'qotmaydi (Prisma `upsert` emas: ikki parallel birinchi yozuv `P2002` bilan yiqilishi mumkin). `attempt-writer.single-source.spec.ts` qorovuli (jest) `src/` va `scripts/` da `dafAttempt` yoki `dafStudentDay` ni boshqa joyda yozishga urinishni yiqitadi.
4. **`groupKey` NULL emas:** guruhsiz o'quvchi uchun `''`. Postgres'da NULL kalit `@@unique` ni takrordan to'smaydi (repoda `DailyFinancialSnapshot` bilan bir marta bo'lgan). Kalitda guruh bor, chunki o'quvchi bir kunda guruh almashtirishi mumkin va ball topilgan paytdagi guruhga tegishli.
5. **`FortschrittService` umumiy ball, seriya va ikkala haftalik reytingni faqat shu jadvaldan o'qiydi.** Saralash qoidalari (ball kamayishi, teng bo'lsa `studentId` o'sishi; TOP 50 + o'z qatori) o'zgarmadi; moslik testi eski hisob bilan yangisi bir xilligini tekshiradi.
6. **Seans oxiri natijani serverdan aytadi** (`natija`: seans bali, seriya, `serieYangi`, guruh va markazdagi oldin/hozir o'rin). Xato bo'lsa `null` qaytadi, saqlash yiqilmaydi.
7. **Migratsiyalar:** `20261018200000_daf_student_day` (jadval, indekslar va boshlang'ich to'ldirish — bitta SQL, ichida) va `20261018210000_daf_student_day_covering_index` (qo'lda yozilgan qamrab oluvchi indeks, pastga qarang).
8. **Skriptlar:** `scripts/audit-daf-student-day.ts` (faqat o'qiydi, farq bo'lsa 1 bilan chiqadi) va `scripts/rebuild-daf-student-day.ts` (standart dry run, `--apply` bitta tranzaksiyada qayta quradi). Urinishni o'chirgan yoki qayta yozgan har qanday skript qayta qurishni ham yurgizishi shart.

## Ko'rib chiqilgan muqobillar

- **Hammasini `DafAttempt` dan o'qishda qoldirish, faqat indeks qo'shish** — haftalik yig'indi baribir minglab o'quvchi × yuzlab urinish; S2–S4 da har bosqich shu og'irlikni qaytaradi. Rad.
- **Haftalik reytingni Redis'da saqlash** — ikkinchi manba, urinishlardan siljiydi, qayta qurish yo'li yo'q. Rad.
- **Ballni jadvalda asl yozuv qilish** (urinishdan ajratish) — formula o'zgarsa tarixni tiklab bo'lmaydi; 06.09 qoidasiga qarshi. Rad.
- **`upsert` yoki o'qib-yozish bilan oshirish** — parallel javoblarda yig'indi yo'qoladi yoki `P2002`. Rad.
- **`groupKey` NULL, guruhsizlar uchun alohida jadval** — takror qator xavfi (yuqorida). Rad.
- **Qamrab oluvchi indeksni `schema.prisma` ga yozish** — Prisma `INCLUDE` ni ifodalay olmaydi; keyingi `migrate diff` uni o'chirishga urinardi. Qo'lda yozilgan migratsiya, sxemada (`companyId, day`) indeksi qoladi.

## Oqibatlari

- **Yuklama raqamlari** (spec §10; 12 000 o'quvchi, ≈1,3 mln urinish, ≈253 ming kunlik qator, 50 parallel o'quvchi, band mashina): `uebersicht` p95 193 ms (chegara 200), `reyting zentrum` 91, `reyting gruppe` 30, `recordAttempt` 56, `seansNatijasi` 116 (chegara 300). `DafAttempt` bo'ylab `Seq Scan` yo'q. Bir qatorga 50 parallel yozishda yig'indi yo'qolmadi (farq 0).
- **Qamrab oluvchi indeks.** `uebersicht` p95 chegaraga yaqin edi (193 va 202 ms, 200 ga qarshi). `("companyId","day") INCLUDE ("studentId","points")` `Index Only Scan` beradi va p95 ni 168 ms ga tushiradi; shu uchun alohida migratsiya qo'shildi. Narxi: jadval yozilganda bitta qo'shimcha indeks yangilanadi. Indeks `schema.prisma` da yo'q, shuning uchun keyingi `prisma migrate diff` uni `DROP INDEX` deb ko'rsatadi — bu kutilgan farq, uni migratsiyaga olib kirmang.
- **Siljish xavfi bor va uni qorovullar ushlaydi:** qorovul test (kod ichida), audit skripti (prod'da), qayta qurish skripti (davo). Qorovul ko'rmaydigan joyda (qo'lda SQL) urinishni o'chirish jadvalni siljitadi — shundan keyin qayta qurish majburiy.
- **Deploy tartibi:** migratsiyalar (boshlang'ich to'ldirish ichida) kodsiz oldin ishlaydi, keyin kod chiqadi. Deploydan keyin prod'da `scripts/audit-daf-student-day.ts` bir marta yuritiladi; kutilgan natija — farq 0.
- Ball formulasi o'zgarsa yoki urinish o'chirilsa jadval avtomatik to'g'rilanmaydi: `rebuild-daf-student-day.ts --apply` yuritiladi.
- Yurak, tosh va seriyani pulga sotib olish rad etilgan holicha qoladi (06.09 dizayni §7).
