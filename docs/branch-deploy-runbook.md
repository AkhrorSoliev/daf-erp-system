# Filial izolyatsiyasi — PRODga chiqarish tartibi

**Sana:** 2026-08-06 · **Qamrov:** Faza 0–7 (filial scope arxitekturasi)

Bu relis **bog'langan**: migratsiyasiz kod ishlamaydi, kodsiz migratsiya foydasiz,
frontend `X-Branch-Id` yuboradi va backend uni kutadi. Uchalasi birga chiqadi.

---

## 0. Nima uchun tartib muhim (o'qing, o'tkazib yubormang)

Ikkita migratsiya bor va ular **kod deploy'ining ikki tomonida** turishi kerak:

| Migratsiya | Nima qiladi | Qachon |
|---|---|---|
| `20260805120000_branch_tenancy_leads_holidays_mock` | `companyId`/`branchId` ustunlarini qo'shadi, **`DEFAULT 1001` bilan** | Kod deploy'idan **OLDIN** |
| `20260806120000_drop_company_defaults_and_branch_sequence` | O'sha defaultni **olib tashlaydi** + `Branch` ketma-ketligi | Kod deploy'idan **KEYIN** |

**Nega shunday:**

- Birinchisi **oldin** bo'lishi shart, chunki yangi kod bu ustunlarni o'qiydi. Bo'lmasa
  lidlar doskasi, bayramlar va mock ishtirokchilari darhol 500 qaytaradi.
- Ikkinchisi **keyin** bo'lishi shart. Ustunlar `NOT NULL`, va **eski kod** `companyId`
  ni yozmaydi — u bu ustunlar haqida bilmaydi. Agar defaultni kod chiqishidan oldin
  olib tashlasangiz, o'sha oraliqda **lid yaratish `NOT NULL` xatosi bilan buziladi**.
  Default esa aynan shu oraliqni yopib turadi.

Ya'ni: **migratsiya-1 → kod → migratsiya-2.**

---

## 1. Deploy oldidan — ishchi daraxt

Ishchi daraxtda **faqat shu ishning** o'zgarishlari qoldi:

- **108 ta o'zgartirilgan** fayl (filial scope arxitekturasi)
- **24 ta yangi** fayl (guard, helperlar, testlar, 2 migratsiya, hujjatlar)
- **28 ta eski diagnostika skripti** `server/scripts/` da — loyiha egasiniki,
  bir martalik PROD tekshiruvlari. Ular ilovaga import qilinmaydi va
  `tsconfig.build.json` dan chiqarilgan, ya'ni build'ga ta'sir qilmaydi

Boshqa ishning kodi (`daily-snapshot`, `expectation-history`) **allaqachon `main` da**
va uning migratsiyasi PRODda qo'llangan — ular bu relisga tabiiy ravishda kiradi va
alohida e'tibor talab qilmaydi.

⚠️ `railway up` git'ni emas, **diskdagi papkani** yuboradi; Vercel ham git bilan
bog'lanmagan. Shuning uchun deploy **toza worktree'dan** qilinadi:

```bash
git checkout -b feat/branch-isolation
git add -A && git commit          # PR → main
git worktree add /tmp/deploy origin/main
cd /tmp/deploy/server && railway up
```

Toza worktree yuqoridagi 28 ta kuzatilmagan skriptni ham olib qolmaydi.

## 2. Preflight — faqat o'qish, PRODda

```bash
cd server
railway run npx ts-node scripts/check-branch-deploy-preflight.ts
```

Kutilgan natija (2026-08-06 o'lchovi):

| Tekshiruv | Kutilgan |
|---|---|
| Tenancy ustunlari mavjudmi | **YO'Q** (migratsiya hali qo'llanmagan) |
| Filialsiz faol **xodim** (Student emas) | Faqat **3 ta CEO** — CEO barcha filialni qamraydi, xavf yo'q |
| `CashAccount` partial unique indeks | **BOR** |
| Aktiv dublikat kassa | **0** |
| `MAX(Branch.id)` | **2** (Farg'ona=1, Namangan=2) |
| `Payment`/`Transaction` da `branchId IS NULL` | **0** |
| `CashMovement` da `branchId IS NULL` | **6** — Batch 3 ataylab qoldirgan, tegilmaydi |
| Tasdiqlangan TG guruh | **1 ta, `branchId=1`** |

Agar biror qiymat farq qilsa — **to'xtang** va sababini aniqlang.

---

## 3. Chiqarish ketma-ketligi

### 3.1 Migratsiya-1 (ustunlarni qo'shish)

Loyiha `migrate dev` ni ishlatmaydi (u bu yerda buzuq) — `db execute` + `resolve`:

```bash
cd server
railway run npx prisma db execute \
  --file prisma/migrations/20260805120000_branch_tenancy_leads_holidays_mock/migration.sql
railway run npx prisma migrate resolve \
  --applied 20260805120000_branch_tenancy_leads_holidays_mock
```

Migratsiya o'z ichida himoyaga ega: bittadan ko'p kompaniya topilsa **to'xtaydi**,
`Company` bo'sh bo'lsa ham to'xtaydi. Mavjud lidlar eng kichik filialga (Farg'ona)
biriktiriladi; bayramlar **ataylab** tegilmaydi (null = kompaniya bayrami).

**Tekshiruv:** preflight'ni qayta yurgizing — tenancy ustunlari endi **BOR** bo'lishi kerak,
`companyId IS NULL` esa hamma jadvalda **0**.

Bu nuqtada eski kod hamon ishlayapti va buzilmaydi (default uni qutqaradi).

### 3.2 Backend

```bash
cd server
railway up
```

**Tekshiruv (deploy'dan keyin darhol):**
- `/leads/board` ochiladi
- `/payments` ro'yxati ochiladi
- Bitta to'lov yozib ko'ring — muvaffaqiyatli bo'lishi kerak
- Filialni almashtiring → ro'yxatlar o'zgarishi kerak

### 3.3 Frontend

```bash
cd client && vercel --prod
```

Toza `origin/main` worktree'dan chiqaring (Vercel git bilan bog'lanmagan).

**Tekshiruv:** filial almashtirilganda raqamlar **darhol** o'zgarishi kerak (eski kesh
tozalanadi), va CEO'da «Barcha filiallar» varianti ko'rinishi kerak.

### 3.4 Migratsiya-2 (defaultni olib tashlash + ketma-ketlik)

**Faqat backend muvaffaqiyatli chiqqanidan keyin.**

```bash
cd server
railway run npx prisma db execute \
  --file prisma/migrations/20260806120000_drop_company_defaults_and_branch_sequence/migration.sql
railway run npx prisma migrate resolve \
  --applied 20260806120000_drop_company_defaults_and_branch_sequence
```

Bu migratsiya ham o'zini himoya qiladi: `companyId IS NULL` qator topilsa yoki
`Branch` ketma-ketligi mavjud id bilan to'qnashsa — **to'xtaydi**.

---

## 4. Deploy'dan keyin nima o'zgaradi (kutilgan xulq)

| Nima | Ilgari | Endi |
|---|---|---|
| Filialga bog'langan xodim boshqa filial to'lovlarini ko'radi | ha | **yo'q** |
| Namangan kassiri Farg'ona o'quvchisiga to'lov yozadi | ha | **403** |
| CEO filialni almashtirsa oylik raqamlari | o'zgarmasdi | **o'zgaradi** |
| Filial almashtirilganda eski raqamlar ekranda | qolardi | **tozalanadi** |
| Filialsiz TG guruh barcha filial hodisasini oladi | ha | **yo'q** |
| CEO uchun «Barcha filiallar» | yo'q edi | **bor, default** |
| TG guruhini filialsiz tasdiqlash | mumkin edi | **mumkin emas** |

**CEO uchun eslatma:** siz endi default «Barcha filiallar» ko'rinishida bo'lasiz.
Ilgari tizim jimgina Farg'onani ko'rsatardi — bu ham noto'g'ri edi, shunchaki bilinmasdi.

---

## 5. Orqaga qaytarish

| Qadam | Qaytarish |
|---|---|
| Migratsiya-2 | `ALTER TABLE … ALTER COLUMN "companyId" SET DEFAULT 1001;` × 8 va `ALTER TABLE "Branch" ALTER COLUMN "id" DROP DEFAULT;` |
| Backend | Railway'da oldingi deploy'ga qaytarish |
| Frontend | `vercel rollback` |
| Migratsiya-1 | **Oson emas.** Ustunlarni tashlash ma'lumot yo'qotadi. Amalda kerak emas: eski kod bu ustunlarni bilmaydi, ular shunchaki bo'sh turadi |

**Muhim cheklov:** `Branch` ketma-ketligi bergan id'lar qaytarilmaydi. Yangi filial
yaratilgan bo'lsa, u qoladi — bu qabul qilinadi, chunki filial kamdan-kam yaratiladi.

---

## 6. Bu relisga KIRMAYDIGAN narsalar

Quyidagilar ataylab qoldirildi va **migratsiya talab qilmaydi** — keyingi relislarda
bittalab chiqariladi:

- `/salary/overview` filial tanlovi (`/salary/monthly` tuzatilgan)
- Route manifesti va qamrov testi
- Mock imtihonlarning `list`/`board`/`findOne` o'qish yo'llari
- `lead-analytics` scope'i
- 138 ta eski spec `tsc` xatosi (`docs/branch-tsc-known-issues.md` da ro'yxatlangan)
- `Payment`/`Transaction`/`CashMovement.branchId` ni `NOT NULL` qilish
  (PRODda `Payment`/`Transaction` da 0 ta null, lekin `CashMovement` da 6 tasi **ataylab**)
