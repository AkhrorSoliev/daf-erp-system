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

---

# 2-relis — filialga bog'langan lid doskasi + mock imtihon scope'i

**Sana:** 2026-08-05 · **Qamrov:** Faza 3c (mock) + Faza 3d (lid doskasi)

## Nima o'zgardi va nega

**Mock imtihon.** `list()`, `board()`, `findOne()` filialni umuman ko'rmasdi, va
`update` / `changeStatus` / `remove` / `regeneratePdf` / `rebroadcast-results`
`where: { id, deletedAt: null }` bilan ishlardi — na kompaniya, na filial. Id uuid
bo'lgani uchun taxmin qilib bo'lmasdi, lekin id sizib chiqsa `changeStatus(ANNOUNCED)`
**boshqa kompaniya ishtirokchilariga Telegram orqali natija PDF'ini tarqatardi**.
Endi hammasi bitta `ensureExamInScope` dan o'tadi. Yaratishda filial **majburiy**.

**Lid doskasi.** Birinchi bosqichda doska tuzilishi kompaniya darajasida qoldirilgan
edi. PROD ma'lumoti bu qarorni rad etdi: bo'limlar «A1 SPSH 15:00 Eldor», «A1 DCHJ
10:00 Saida» deb ataladi — daraja, kunlar, soat va **o'qituvchi**. Bu shakllanayotgan
guruh, va Farg'ona o'qituvchisining 15:00 dars vaqti Namanganda hech nimani
anglatmaydi. Endi filial **ustunda** turadi; bo'limning filiali — ustuniniki, lidniki
— bo'limi ustuniniki.

Yon ta'siri (foydali): ommaviy forma bo'limga yo'naltiradi, ya'ni **formadan kelgan
lid endi filialsiz umumiy havzaga emas, to'g'ridan-to'g'ri o'z filialiga tushadi**.

## Tartib — bitta migratsiya, kod bilan ketma-ket

| Qadam | Nima |
|---|---|
| 0 | PROD ma'lumot tuzatuvi — **allaqachon bajarilgan** (pastga qarang) |
| 1 | `20260807120000_lead_board_per_branch` |
| 2 | Backend (`railway up`) |
| 3 | Frontend (`vercel`) |

**Migratsiya kod'dan OLDIN.** `LeadColumn.branchId` `NOT NULL` va **defaultsiz** —
`@default(1001)` darsidan keyin ataylab shunday. Demak migratsiya bilan backend
orasidagi oraliqda **eski kod ustun yarata olmaydi** (`NOT NULL` xatosi). O'qish
buzilmaydi, faqat yangi ustun yaratish. Bu amal kuniga bir marta ham
bajarilmaydi, oraliq esa bir-ikki daqiqa — shuning uchun ikkalasi **ketma-ket**
bajariladi va oraliqda ustun yaratilmaydi.

### 0-qadam — allaqachon bajarilgan PROD tuzatuvi

```
railway run npx ts-node scripts/assign-mock-exam-branch.ts          # dry run
railway run npx ts-node scripts/assign-mock-exam-branch.ts --apply
```

Natija: «DaF Mock Imtihoni» (01.08.2026, 72 ishtirokchi, ARCHIVED) → Farg'ona.
Bu **kod chiqishidan oldin** qilinishi shart edi: `branchIdWhere` `{ in: [...] }`
ga aylanadi va `NULL` qatorni **ikkala** filial ko'rinishidan ham chiqaradi, ya'ni
imtihon hech qayerda ko'rinmay qolardi. Tekshiruv: filialsiz imtihon **0 ta**.

### 1-qadam — migratsiya

```
cd server
railway run npx prisma db execute \
  --file prisma/migrations/20260807120000_lead_board_per_branch/migration.sql
railway run npx prisma migrate resolve \
  --applied 20260807120000_lead_board_per_branch
```

Migratsiya o'zi to'xtaydi, agar:
- kompaniya bittadan ko'p bo'lsa (backfill'ni taxmin qilmaydi);
- oxirida biror ustun `branchId IS NULL` bo'lib qolsa;
- biror tirik filialda «Yangi Lidlar» (`systemKey='NEW'`) ustuni bo'lmasa —
  bunday filialning doskasi boshi berk ko'cha bo'lardi (ustunsiz bo'lim bo'lmaydi,
  bo'limsiz lid bo'lmaydi), UI esa birinchi ustunni yaratish yo'lini bermaydi.

PROD kutilgan natijasi (deploy oldidan o'lchangan): 15 ustun (5 tirik) → filial 1;
Namanganga 1 ta «Yangi Lidlar» bootstrap.

### Orqaga qaytarish

```sql
ALTER TABLE "LeadColumn" DROP CONSTRAINT IF EXISTS "LeadColumn_branchId_fkey";
DROP INDEX IF EXISTS "LeadColumn_branchId_idx";
ALTER TABLE "LeadColumn" DROP COLUMN IF EXISTS "branchId";
DELETE FROM "LeadColumn" WHERE "systemKey"='NEW' AND "branchId" <> 1;  -- bootstrap
```

Mock imtihon biriktirishi **qaytarilmaydi** va qaytarilishi shart emas — imtihon
haqiqatan Farg'onada o'tgan, `branchId=1` eski kodda ham to'g'ri o'qiladi.

---

# 3-relis — filial almashganda ma'lumot yangilanmasligi

**Sana:** 2026-08-05 · **Qamrov:** faqat frontend · **Migratsiya:** yo'q

## Nuqson

Farg'onadan Namanganga o'tilganda lidlar doskasi eski ma'lumotni ko'rsatib
turardi; faqat sahifani qo'lda yangilagandan keyin o'zgarardi.

## Sabab — bitta emas, ikkita

`BranchQuerySync` React Query keshini tozalaydi. Lekin **51 fayl** React
Query'dan tashqarida ma'lumot oladi, va ular ikki xil:

| Toifa | Soni | Nega tozalanmagan |
|---|---|---|
| Modul darajasidagi zustand store | **3** | Komponent o'lsa ham, marshrut o'zgarsa ham, kesh tozalansa ham **saqlanib qoladi** |
| Komponent ichidagi `useState` + `useEffect` | **~47** | React Query keshiga umuman qaramaydi |

Zustand toifasi yomonroq edi: `use-mock-exams-board` da `loaded: true`,
`use-leads-board` da esa `loadedSections.has(sectionId)` qorovuli bor — ya'ni
sahifa qaytadan ulansa ham **qayta yuklashdan bosh tortardi**.

## Yechim — uch qatlam

1. **`lib/branch-scoped-stores.ts`** — store'lar o'zini ro'yxatga oladi;
   `BranchQuerySync` filial almashganda hammasini `getInitialState()` ga
   qaytaradi. `getInitialState()` ishlatilgani uchun store'ga yangi maydon
   qo'shilsa ham ro'yxat eskirmaydi.
2. **`BranchScopedMain`** — dashboard `<main>` iga filial `key` i qo'yiladi, ya'ni
   filial almashganda butun sahifa daraxti qaytadan ulanadi va har bir
   `useEffect` yangidan ishlaydi. ~47 ta komponentni ham, kelajakda yoziladigan
   har qanday komponentni ham hech kim eslamasdan qamrab oladi.
3. **`branch-scoped-stores.test.ts`** — `src/hooks` dagi zustand store'larni
   sanab chiqadi va yangi store ro'yxatga qo'shilmagan bo'lsa **yiqiladi**.
   Ertangi store bu nuqsonni jimgina qaytara olmaydi.

## Tartib muhim

`<BranchQuerySync />` `query-provider.tsx` da `{children}` dan **oldin** turishi
shart. React passiv effektlarni render tugash tartibida navbatga qo'yadi, ya'ni
tozalash yangi ulangan sahifaning `fetch` idan **oldin** ishlaydi. Pastga
ko'chirilsa tartib teskari bo'ladi: yangi sahifa `loadingBoard: true` qo'yadi,
keyin reset uni bo'sh va yuklanmayotgan holatga qaytaradi — so'rov hali
ketayotganida «ma'lumot yo'q» ko'rinadi. Ma'lumot oxir-oqibat to'g'ri keladi,
lekin ko'rinishi noto'g'ri bo'ladi.

## Chiqarish

Faqat Vercel (migratsiya ham, backend ham o'zgarmagan):

```bash
git worktree add /tmp/deploy origin/main
cd /tmp/deploy/client && cp -r <asosiy>/client/.vercel .vercel
vercel --prod --yes
# 4 domenni alias qilish: admin / lehrer / student / form
```

**Yon ta'siri (ataylab):** filial almashganda scroll holati, ochiq dialoglar va
komponent ichidagi UI holati tiklanadi. Filial almashtirish — kontekstni
ataylab o'zgartirish, filtr sozlash emas. Filtrlar URL'da saqlangani uchun
omon qoladi.
