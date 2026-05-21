# Lidlar bo'limi — qayta qurish rejasi

> Holat: **Faza 0 boshlandi** · Reja tasdiqlangan sana: 2026-05-21
> Bu hujjat — Lidlar (Leads) bo'limini noldan qayta qurish bo'yicha asosiy reja.

## 1. Kontekst va hozirgi holat

- `/leads` sahifasi hozir bo'sh placeholder; eski mock fayllar o'chirilgan.
- `Lead` modeli Prisma'da allaqachon mavjud (`server/prisma/schema.prisma`), lekin juda sodda:
  `firstName`, `lastName`, `phone`, `gender`, `telegram`, `parentPhone`, `parentName`,
  `statusEnum` (`NEW/CONTACTED/TRIAL/CONVERTED/LOST/ARCHIVED`), soft-delete maydonlari.
  **Column, section, manba, tartib (order) yo'q.**
- `leads` NestJS moduli **yo'q** — CRUD API umuman mavjud emas. `Lead` faqat `archive`,
  `reports` (`getLeadAnalytics`) va `status-transitions` da ishlatiladi.
- Qayta ishlatiladigan tayyor infratuzilma:
  - `EntityHistory` — `Lead` entityType allaqachon qo'llab-quvvatlanadi → "Tarix" tabi tekin.
  - `Comments` moduli — polimorf `entityType`/`entityId` → lid izohlari tekin.
  - `Archive` tizimi — `ArchiveEntityType.LEADS` allaqachon bor → soft-delete + arxiv tekin.
- Frontend: `@dnd-kit/core` + `@dnd-kit/sortable` allaqachon o'rnatilgan.

## 2. Tasdiqlangan qarorlar

1. **Kompaniya bo'yicha yagona board** — `Lead`/`LeadColumn`/`LeadSection`/`LeadSource`
   ga `branchId` qo'shilmaydi. Hozirgi schema-global holatga mos, migratsiya minimal.
2. **Lid → o'quvchi konvertatsiyasi — eng oxirgi faza (Faza 6).**
3. **Faqat qo'lda qo'shish** — Telegram avtomatik intake bu rejaga kirmaydi.

## 3. Ma'lumotlar modeli

```
LeadColumn   id, name, order, isSystem, systemKey?("NEW"|"CONTACTED"), soft-delete
   └─ LeadSection   id, name, columnId, order, soft-delete
         └─ Lead    + sectionId, order, sourceId   (mavjud maydonlar saqlanadi)

LeadSource   id, name, isActive, order, soft-delete   (boshqariladigan ro'yxat)
```

- **Column → Section → Lead** — uch qatlamli ierarxiya. Lidning columni section orqali
  aniqlanadi (`Lead.section.column`).
- 2 ta **fixed column** seed qilinadi: *"Yangi Lidlar"* (`systemKey:"NEW"`, `isSystem:true`)
  va *"Aloqaga chiqilgan Lidlar"* (`systemKey:"CONTACTED"`). Ularni o'chirib / nomini
  o'zgartirib / ko'chirib bo'lmaydi.
- **Custom columnlar** — yaratish / nomlash / o'chirish / tartiblash mumkin.
- `LeadSource` — `student-exit-reasons` namunasidagi boshqariladigan reference ro'yxat
  (Sozlamalarda CRUD).
- `Lead.sectionId` DB darajasida nullable (mavjud qatorlar uchun migratsiya xavfsiz);
  ilova qatlami uni doim to'ldiradi.

### Kelajak uchun eslatma

Agar haqiqiy ko'p-kompaniyali izolyatsiya kerak bo'lsa, `companyId` ni to'rttala modelga
(`Lead` ham) bitta migratsiyada qo'shish mumkin. Hozir `Lead` `companyId` saqlamaydi —
yangi modellar ham shu holatga mos qilingan.

## 4. Asosiy texnik qarorlar

| Mavzu | Qaror |
|---|---|
| `statusEnum` vs columnlar | `statusEnum` hisobotlar uchun saqlanadi (funnel/konversiya `reports`'da). Board — vizual ish oqimi qatlami. Lid fixed columnga tushganda `statusEnum` avtomatik sinxronlanadi (`NEW`/`CONTACTED`); custom columnlar `statusEnum`'ga tegmaydi. `TRIAL/CONVERTED/LOST` faqat aniq amallar bilan o'rnatiladi. |
| Section o'chirish | Faqat bo'sh section o'chiriladi — avval lidlar ko'chiriladi. AlertDialog buni tushuntiradi. |
| Column o'chirish | Faqat bo'sh custom column (sectionsiz). Fixed columnlar hech qachon o'chmaydi. |
| Lid o'chirish | Soft-delete → arxiv (hard delete yo'q). |
| Tarix / Izohlar | Yangi jadval yaratilmaydi — `EntityHistory` + `Comments` qayta ishlatiladi. |
| Tartib (`order`) | Butun son; section/column ichida ko'chirishda tranzaksiya ichida qayta raqamlanadi. |
| Nom unikal cheklovi | Phase 0'da DB unique constraint qo'yilmaydi; takrorlanishni service qatlami (faqat `deletedAt: null` qatorlar orasida) tekshiradi. |

## 5. Fazalar

### Faza 0 — Schema poydevori (faqat backend)
- Prisma: `LeadColumn`, `LeadSection`, `LeadSource` qo'shish; `Lead`'ga `sectionId`,
  `order`, `sourceId`; `User`'ga `deletedBy` back-relationlar.
- Migratsiya + seed: 2 ta fixed column.
- Mavjud `Lead` qatorlari uchun idempotent backfill skripti.
- `npx prisma generate`.
- Tekshiruv: migratsiya toza yuriydi, `npm run build`.

### Faza 1 — Board MVP: ko'rish + section yaratish + lid qo'shish
- Backend: `leads` moduli (`leads-read/write.service.ts`, `leads-board.service.ts`,
  controller) — `GET /api/leads/board`, `GET /api/leads/sections/:id/leads` (lazy),
  `POST /api/leads`, `GET /api/leads/:id`; `POST /api/lead-sections`; `lead-sources`
  seed + `GET`. RBAC `@Roles('CEO','Branch Director','Administrator')`. Har mutatsiya
  `EntityHistoryService`'ga yozadi.
- Frontend: board (2 fixed column), yopiq turuvchi collapsible sectionlar (ochilganda
  lazy-load), bo'sh holat ("Bo'lim yarating" CTA), `create-section-dialog`,
  `add-lead-drawer` (ism/familya, `<PhoneInput>`, manba select, section select),
  `lead-detail-drawer` (Ma'lumot tab). Skeletonlar, optimistik update, toastlar.
- Tekshiruv: service + controller guard testlari, `npm test`, `npm run build`.

### Faza 2 — Columnlar va sectionlarni to'liq boshqarish
- Backend: `lead-columns` CRUD + reorder (fixed himoyasi); `lead-sections`
  rename/delete/reorder; bo'sh-bo'lmaganda o'chirishni bloklash.
- Frontend: custom column yaratish/nomlash/o'chirish, columnlarni tartiblash
  (`manage-columns-dialog`), sectionlarni tartiblash/nomlash/o'chirish. Har column
  tepasida toza UX bilan "+ Bo'lim qo'shish".

### Faza 3 — Tahrirlash va ko'chirish (drag & drop)
- Backend: `PATCH /api/leads/:id` (tahrir), `PATCH /api/leads/:id/move` (section/column
  + reorder, fixed columnda `statusEnum` sync, `status-transitions.ts` Lead xaritasini
  board harakatlariga moslash).
- Frontend: `edit-lead-drawer`; `@dnd-kit` bilan lidni sectionlar/columnlar oralab
  tortish; klaviatura/qulaylik uchun `move-lead-dialog` zaxira varianti.

### Faza 4 — Filterlar
- Backend: `GET /api/leads` filtrlangan/sahifalangan ro'yxat — `search` (ism/telefon),
  `sourceId`, `columnId`, `sectionId`, `status`, `createdAt` oralig'i.
- Frontend: URL'da saqlanadigan filter bar (CLAUDE.md "URL-Persisted Filter State").

### Faza 5 — Tarix, izohlar, arxiv, manba sozlamalari
- Lid detalida Izohlar (`CommentList`/`CommentForm`) va Tarix
  (`EntityHistoryTable entityType="Lead"`) tablari.
- O'chirish → arxiv; arxiv sahifasi lidlarni ko'rsatishini va tiklashda section
  o'chirilgan bo'lsa fixed columnga qaytishini tekshirish.
- Sozlamalarda lid manbalari to'liq boshqaruv UI.

### Faza 6 (yakuniy) — Lidni o'quvchiga aylantirish + hisobotlar
- "O'quvchiga aylantirish" amali — `Lead`'dan `Student` yaratadi, `statusEnum:CONVERTED`,
  bog'lash (`convertedStudentId`).
- `reports/getLeadAnalytics`'ni yangi modelga moslab tekshirish.

## 6. Skill'lar

Yangi skill o'rnatish shart emas — mavjudlari yetarli. Faza bo'yicha:
- Schema/migratsiya: `prisma-cli`, `prisma-database-setup`, `prisma-client-api`
- NestJS modullar: `nestjs-best-practices`
- Board UI / DnD: `frontend-design`, `shadcn`, `vercel-composition-patterns`,
  `web-design-guidelines`, `impeccable`
- React unumdorligi: `vercel-react-best-practices`
- Murakkab TS tiplar: `typescript-expert`
- `@dnd-kit`, `@tanstack/react-query`, `radix-ui` hujjatlari: **context7**.

⚠️ `client/AGENTS.md` — "This is NOT the Next.js you know" (Next.js 16.2, breaking
changes). Har frontend fazasidan oldin `node_modules/next/dist/docs/` o'qish kerak.

## 7. Ochiq savol

4-banddagi "Sabab ham bo'lmasa sababni ham so'rashi kerak" — taxminiy talqin: agar
birorta lid manbasi (`LeadSource`) mavjud bo'lmasa, lid qo'shishdan oldin tizim manba
yaratishni so'raydi. Yakuniy tasdiq kutilmoqda.
