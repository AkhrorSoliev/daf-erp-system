# ADR-0115 — DaF kunlik maqsad: asl tanlov; nishon: bir marta, qaytarib olinmaydi

**Holati:** Qabul qilindi
**Sana:** 2026-10-18
**Bog'liq:** `docs/superpowers/specs/2026-10-18-musobaqa-s2-shaxsiy-osish-design.md`, ADR-0114, `server/src/daf/nishon/nishon-berish.ts`, `server/src/daf/uebung/punkte.ts`, `server/src/daf/fortschritt/fortschritt.service.ts`

## Kontekst

S2 o'quvchiga ikki narsa beradi: o'zi tanlaydigan kunlik maqsad (40 / 80 / 160 ball) va uzoq muddatli nishonlar (seriya va o'rganilgan so'zlar). ADR-0114 ball va seriyani urinishlardan qayta quriladigan hosila jadvalga (`DafStudentDay`) qo'ydi; maqsad va nishon esa qayta qurib bo'lmaydigan ikki narsani saqlaydi. Musobaqa tizimi jazosiz bo'lishi kerak (06.09 dizayni): nishon olingach, seriya uzilsa ham, so'z kuchsizlansa ham qoladi.

## Qaror

1. **`DafStudentSetting` — asl yozuv, hosila emas.** `DafStudentDay` urinishlardan qayta quriladi (ADR-0114), o'quvchining tanlovini esa hech narsadan chiqarib bo'lmaydi. Bir o'quvchiga bitta qator (`studentId` — kalit). Qator yo'q = `ORTA`; birinchi marta hech narsa so'ralmaydi. Yozuv faqat `PATCH student-portal/lernen/maqsad` da `upsert` (kalit `studentId`, parallel ikki bosish xavfsiz). Tarix saqlanmaydi: almashtirish darrov kuchga kiradi.
2. **Maqsad ballari kodda** (`uebung/punkte.ts`, `MAQSAD_BALL`: 40 / 80 / 160), bazada faqat kalit. O'zgartirish deploy bilan; mijoz oynachasidagi raqamlar test bilan shu faylga bog'langan.
3. **`bosh` qoidasi.** Bugun qiladigan mashq qolmagan o'quvchi (muddati kelgan so'z yo'q **va** ochiq, tugatilmagan dars yo'q) uchun maqsad «bajarildi» sanaladi, halqada «Bugun mashq qolmadi» turadi: ball topish mumkin bo'lmagan o'quvchi ayb bo'lmagan narsa uchun yutqazmaydi. Dars hali bor bo'lsa (yangi so'z ball beradi) bu holat yo'q — yangi o'quvchi mashq qilmasdan «bajarildi» ko'rmaydi. `bosh` holatda `yangiBajarildi` yolg'on.
4. **`DafStudentBadge` — bir marta beriladi, hech qachon olib qo'yilmaydi.** Jadvalda faqat katalog kaliti (`@@unique([studentId, key])`), bekor qilish ustuni yo'q. Katalog kodda (`nishon/nishon-katalogi.ts`) — S3 yangi turlarni migratsiyasiz qo'shadi.
5. **Bitta yozuvchi — `grantBadges`.** `INSERT … ON CONFLICT ("studentId","key") DO NOTHING RETURNING key`: qaytgan kalitlar aynan shu chaqiruv yozganlari, ikki parallel seans bitta nishonni ikki marta «yangi» demaydi. Berish holatdan (shartdan) hisoblanadi, hodisadan emas, shuning uchun idempotent. `nishon-berish.single-source.spec.ts` boshqa joydagi yozuvni yiqitadi; bir martalik skript ham shu funksiya orqali yozadi.
6. **Nishon faqat seans oxirida, `seansNatijasi` ichida** (xavfsiz o'ram `seansNatijasiXavfsiz` ichida) beriladi; xato bo'lsa `yangiNishonlar: []`, `natija` va seans saqlanadi. O'tkazib yuborilgan nishon keyingi seansda SHART bo'yicha (holatdan) qaytadan beriladi. `GET nishonlar` va `GET fortschritt` hech narsa yozmaydi.
7. **`fortschritt` ga qo'shimcha so'rov yo'q:** bugungi ball va maqsad darajasi mavjud `oquvchi-raqamlari` so'roviga CTE sifatida qo'shildi; «ochiq dars bor» faqat `faelligeWoerter == 0` bo'lganda o'qiladi.
8. **Mavjud o'quvchilar:** `scripts/daf-badges-backfill.ts` (standart dry run, keyin `--apply --expect=<N>`; keyingi yurish hech narsa qo'shmaydi). Seriya nishonlari uchun eng uzun tarixiy ketma-ketlik (`DafStudentDay` dan; uzilgan seriya ham nishon bergan), `earnedAt` = N-kunga birinchi yetilgan kun; so'z nishonlari skript vaqti bilan (aniq sana noma'lum). Prod'da 516 faol o'quvchidan 102 tasi mashq qilgan, 8+ kunlik seriya — 4 ta.
9. **Marshrutlar SELF** (`branch-route-policy.ts`): `GET lernen/nishonlar` va `PATCH lernen/maqsad` `fortschritt` bilan bir sabab — o'quvchi faqat o'zini o'qiydi va o'zgartiradi, filial savoli yo'q.

## Ko'rib chiqilgan muqobillar

- **Nishonni har o'qishda holatdan hisoblash (jadvalsiz)** — uzilgan seriya nishonni «olib qo'yardi»; qoidaga qarshi. Rad.
- **Nishonni hodisadan (`recordAttempt` ichida) berish** — har javobda qo'shimcha yozuv va tranzaksiya; bitta yozuvchi qoidasi buziladi. Rad.
- **Maqsad ballarini bazada saqlash** — har o'zgarish uchun migratsiya yoki sozlama sahifasi kerak; CEO qiymatlarni kod bilan o'zgartirishga rozi. Rad.
- **Sozlamani `Promise.all` ichida alohida `findUnique`** (spec §1.3 dagi dastlabki variant) — 50 parallel o'quvchida har so'rovga pool'dan yana bir ulanish (prod'da 10 ta) va navbatga yana bir joy; S1 da `uebersicht` p95 chegaraga yaqin edi. Bitta SQL ichidagi CTE tanlandi.
- **Maqsadni ham `DafStudentDay` kabi hosila qilish** — tanlovni urinishlardan chiqarib bo'lmaydi, qayta qurish yo'li yo'q. Rad.
- **Maqsad tarixi va maqsad ketma-ketligi nishonlari** — bu bosqichda yo'q (spec §4).

## Oqibatlari

- Nishonni qo'lda olib tashlash uchun kod yo'q — xato berilgan nishon faqat ongli migratsiya bilan o'chiriladi (bitta yozuvchi qoidasi uni ham taqiqlaydi; yangi ADR kerak). `DafStudentSetting` zaxira nusxasiz qayta tiklanmaydi: o'quvchi tanlovi yo'qolsa, hamma `ORTA` ga qaytadi.
- **Yuklama raqamlari** (spec §8; 12 000 o'quvchi, ≈1,47 mln urinish, 608 500 `DafLexemeState`, 16 808 `DafStudentBadge`, 50 parallel o'quvchi, Prisma pool 10 ulanish; ikki o'lchov: bo'sh va band mashina): `uebersicht` p95 171 / 186 ms (chegara 200), `seansNatijasi` p95 109 / 174 ms (chegara 300), `nishonlar` p95 16 / 16 ms. Eng yomon yo'llar: muddati kelgan so'z yo'q va hamma dars tugatilgan o'quvchining `uebersicht` i p95 102 / 134 ms; hamma nishon yangi bo'lib yoziladigan `seansNatijasi` p95 153 / 164 ms (nishon `INSERT` i p95 ga ≈33–42 ms qo'shadi, o'quvchida bir marta; konfliktli yo'l ≈5–7 ms). Bir o'quvchiga 50 parallel `grantBadges`: 10 nishon, takror 0. `DafAttempt` bo'ylab `Seq Scan` yo'q. Moslik tekshiruvi (244 o'quvchi): 0 farq.
- **Deploy tartibi:** migratsiya `20261018220000_daf_goal_and_badges` (ikki jadval) → kod → `scripts/daf-badges-backfill.ts` dry run → `--apply --expect=<N>`. Skriptning faqat o'qiydigan ulanishi (`default_transaction_read_only`) lokal bazada sinalgan; prod'da shu ulanish ishlashini dry run o'zi tekshiradi (ishlamasa skript to'xtaydi, hech narsa yozmaydi). Kod chiqqach, backfill'gacha o'quvchilar nishonni mavjud holat bo'yicha seans oxirida baribir oladi (holatdan beriladi); skript faqat mashq qilmay turgan o'quvchilarning eski yutuqlarini qoplaydi.
- Maqsad ballari yoki katalog chegaralari o'zgarsa deploy kerak; yangi nishon turi qo'shilsa migratsiya kerak emas, mavjud o'quvchilar uchun skript qayta yuritiladi (`ON CONFLICT` takror bermaydi).
