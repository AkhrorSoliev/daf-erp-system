# Lidlar arxivi (`/leads/archive`) — yaxshilash

**Sana:** 2026-10-18
**Holat:** loyiha (CEO ko'rigi kutadi)
**ADR:** kerak emas (ma'lumot modeli, pul, filial qoidasi o'zgarmaydi; faqat o'qish API'si va ekran).
**Bog'liq:** `project_leads_archive_redesign` (2026-06-27, 2 ustunli arxiv), ADR-0093 (lid egasi), `client/CLAUDE.md` (jadval, sahifalash, URL filtr, ruxsat qoidalari)

## 1. Maqsad

Arxiv sahifasi ishlaydi, lekin loyiha qoidalariga zid va arxiv o'sgani sari noqulay bo'ladi. Bu ishda to'rt qoida buzilishi tuzatiladi va foydalanuvchi uchun uchta qulaylik qo'shiladi. Lid yoki bo'limni tiklash qoidalari (server tomonda `restoreLead`, `restoreSection`) **o'zgarmaydi**.

## 2. Hozirgi holat (o'qib chiqilgan)

- Server `GET /leads/archive` hamma arxivlangan lid va bo'limni bir javobda, limitsiz qaytaradi (`leads-archive.service.ts:44`).
- Klient (`leads-archive.tsx`, 570 qator) ikki jadvalni yonma-yon chizadi. Sahifalash, qidiruv, filtr yo'q.
- «Tiklash» tugmasi `useCan` bilan tekshirilmaydi; server esa `leads.manage` talab qiladi.
- Yuklash xatosida massivlar bo'sh qoladi va «Arxivda lid yo'q» chiqadi.
- Har tiklashdan keyin `fetchData()` ikkala jadvalni skeletonga qaytaradi va `/leads/board`ni qayta so'raydi.
- Lidni tiklash dialogi bo'sh ochiladi; bo'lim dialogi esa asl ustunni oldindan tanlaydi.
- `RestoreLeadDialog` ikkinchi joyda ham ishlatiladi (forma javoblari sahifasi, `form-responses-client.tsx`); uning ishlashi buzilmasligi kerak.
- `LeadsArchive` yana `settings/archive?type=leads` ichida ko'rsatiladi (`onBack` bilan).

## 3. Qaror: nima qilinadi

Quyidagi bandlar bitta PR'da, bu tartibda.

### 3.1 Qoida buzilishlarini tuzatish
1. **Server tomonda sahifalash** (10–50, default 10) va klientda sahifa o'lchami tanlagichi.
2. **«Tiklash» faqat `leads.manage` borlarga ko'rinadi.** Yo'q bo'lsa amallar ustuni butunlay yo'q.
3. **Yuklash xatosi aniq ko'rinadi:** «Arxivni yuklab bo'lmadi» + «Qayta urinish». Bo'sh holat faqat javob kelgandan keyin chiqadi.
4. **Tiklashdan keyin qator mahalliy ro'yxatdan olinadi** (qayta yuklash yo'q, skeleton yo'q), sanagichlar kamayadi. `/leads/board` faqat tiklash dialogi birinchi marta ochilganda yuklanadi.

### 3.2 Qulaylik
5. **Qidiruv va filtr**, hammasi URL'da:
   - qidiruv (`q`): lidlarda ism, familiya, telefon (qo'shimcha telefon ham), yo'qotilish sababi; bo'limlarda nom. Bo'sh joy bilan ajratilgan so'zlar **hammasi** mos kelishi kerak.
   - «Kim tomonidan» (`kim`, ko'p tanlov): faqat shu filialda arxivlagan xodimlar ro'yxati.
   - Sana oralig'i (`dan`, `gacha`, Toshkent kuni, arxivlangan sana bo'yicha), ikkala DatePicker juft bog'langan.
   - Filtr o'zgarganda sahifa 1 ga qaytadi. «Tozalash» tugmasi filtr bor paytda ko'rinadi.
6. **Ikki tab:** «Lidlar (N)» | «Bo'limlar (M)», URL'da `tab` (`lidlar` default, URL'dan tushiriladi; ikkinchisi `bolimlar`). Faqat ochiq tabning ma'lumoti yuklanadi. Tab sanagichlari filtrsiz umumiy son.
7. **«Sana» ustuni** (`dd.MM.yyyy, HH:mm`, Toshkent vaqti) «Kim tomonidan» yonida; maslahat oynasi (tooltip) kerak emas.

### 3.3 Tiklash dialogi
8. **Lidni tiklash dialogi asl joyni oldindan tanlaydi**, agar asl ustun va bo'lim hozir jonli bo'lsa. Aks holda dialogda «Asl joyi «{Ustun} · {Bo'lim}» arxivda yoki o'chirilgan — yangi joy tanlang» yozuvi chiqadi.
9. **Dialog tiklash nimani o'zgartirishini aytadi.** Matnni server beradi (`notes[]`), klient faqat chizadi:
   - yo'qotilgan lid (`statusEnum = LOST`, sotilmagan): «Yo'qotilgan lid «Yangi» bosqichiga qaytadi, yo'qotilish sababi o'chadi.»
   - egasi bor, sotilmagan lid: «Lidning mas'uli bo'shaydi: u umumiy havzaga qaytadi.» (ADR-0093)
   - sotilgan (`convertedStudentId` bor) lidda hech qanday izoh yo'q: holati va egasi saqlanadi.

### 3.4 Qilinmaydi (ongli ravishda)
- Ko'plab (bulk) tiklash, arxivni avtomatik tozalash, lid filialini ustun sifatida ko'rsatish. Zarurat chiqsa alohida ish.
- Saralash tartibini tanlash: doim arxivlangan sana kamayish bo'yicha.
- Tiklash qoidalarining o'zgarishi, yangi ruxsat kaliti, migratsiya, skript.
- Tarjima (`t()`): lidlar sahifalari hali tarjima qilinmagan.

## 4. Server

`LeadsArchiveService` hozir 441 qator; yangi o'qish mantiqi 500 qatordan oshirmaslik uchun **yangi fayllarga** olinadi, `getArchive` va uning yordamchisi (`archivedLeadCountsForSections`) eski fayldan ko'chiriladi. Tiklash metodlari joyida qoladi.

Yangi fayllar (`server/src/leads/archive/`):
- `restore-notes.ts` — sof `restoreNotes({ statusEnum, convertedStudentId, ownerId }): string[]` (3.3 qoidasi; `leads-archive.service.ts`dagi `restoredStatus` va `restore-release.ts` bilan bir xil shart).
- `archive-filter.ts` — sof: `searchTokens`, `archivedLeadFilter(q)`, `archivedSectionFilter(q)`. Kompaniya va filial qamrovini qo'shmaydi (servis qo'shadi).
- `leads-archive-read.service.ts` — `LeadsArchiveReadService`: `getSummary`, `listLeads`, `listSections`.
- DTO: `server/src/leads/dto/leads-archive-query.dto.ts` (`PaginationDto` dan; `search` ≤ 100 belgi, `deletedById` vergulli ro'yxat, `startDate`/`endDate` `YYYY-MM-DD` va kalendarda mavjud kun, bo'lmasa 400).

Yo'llar (`LeadsController`, `GET /leads/archive` o'rniga; hammasi `@Can('leads.view')` + `@BranchScope()`, `:id` yo'lidan oldin e'lon qilinadi):

| Yo'l | Javob |
| --- | --- |
| `GET /leads/archive/summary` | `{ leads, sections, archivers: [{ id, name }] }` — filtrsiz sonlar; `archivers` — shu qamrovda arxivlagan (lid yoki bo'lim) xodimlar, ism bo'yicha |
| `GET /leads/archive/leads` | `{ data, total, page, pageSize }`; qator: `id, firstName, lastName, phone, lostReason, deletedAt, deletedBy, section{ id, name, column{ id, name } \| null } \| null, notes[]` |
| `GET /leads/archive/sections` | `{ data, total, page, pageSize }`; qator: `id, name, deletedAt, deletedBy, column{ id, name } \| null, leadCount` |

Qoidalar:
- Qamrov o'zgarmaydi: `companyId` + `leadBranchWhere(scope)` (lidlar), `column: branchIdWhere(scope)` (bo'limlar). Bo'sh qamrov hech narsa qaytaradi (mavjud `fail-closed` qoidasi).
- Tartib: `deletedAt desc, id desc` (barqaror sahifalash).
- Sana filtri `tashkentRangeFilter(startDate, endDate)` bilan, `deletedAt` ustuniga (timestamp, yuqori chegara eksklyuziv).
- Arxivlangan bo'lim/ustun lidning asl joyini ko'rsatishda filtrlanmaydi (hozirgi qoida).
- `GET /leads/archive` (eski, limitsiz) **o'chiriladi**. Uni faqat shu klient chaqirardi; server va klient birga chiqadi. `route-access.snapshot.json`da qator almashtiriladi (kirish huquqi o'sha: Administrator, Branch Director, CEO).

## 5. Klient

`client/src/components/leads/archive/` (yangi papka); `leads-archive.tsx` joyida qoladi va faqat qobiq bo'ladi (`/leads/archive` sahifasi va `settings/archive` importlari o'zgarmaydi).

| Fayl | Vazifasi |
| --- | --- |
| `archive-url.ts` (+ test) | `LEADS_ARCHIVE_SCHEMA` (`tab`, `q`, `kim`, `dan`, `gacha`, `sahifa`, `soni`), `archiveParams`, `hasArchiveFilter`, kun ↔ Date |
| `archive-format.ts` (+ test) | `archiveDate(iso)` — Toshkent vaqtida `dd.MM.yyyy, HH:mm` |
| `archive-cache.ts` (+ test) | sof: qatorni olib tashlash va sanagichni kamaytirish |
| `archive-types.ts`, `archive-queries.ts` | turlar; React Query hook'lari (`summary`, `leads`, `sections`, `board columns`) |
| `archive-filter-bar.tsx` | qidiruv (`UrlSearchBox`), «Kim tomonidan» (`MultiSelectCombobox`), sana juftligi, tozalash |
| `archived-leads-table.tsx`, `archived-sections-table.tsx` | jadval + `PaymentsPager` (10–50), skeleton, xato, bo'sh holat |
| `restore-section-dialog.tsx` | hozirgi bo'lim dialogi (faylga ko'chiriladi, mantiq o'zgarmaydi) |
| `restore-lead-model.ts` (+ test) | sof: asl joyni oldindan tanlash va ogohlantirish |

`restore-lead-dialog.tsx` (umumiy dialog) ixtiyoriy `origin`, `notes`, `columnsLoading` oladi; bermasa (forma javoblari sahifasi) avvalgidek bo'sh ochiladi.

Qoidalar:
- Ma'lumot React Query'da; kalitlar `["leads-archive", "summary" | "leads" | "sections", params]`. Tiklash `setQueriesData` bilan qatorni olib tashlaydi va `summary`ni kamaytiradi. Bo'lim lidlari bilan tiklansa, lidlar so'rovi eskirgan deb belgilanadi (keyingi ochilishda qayta yuklanadi). Sahifada oxirgi qator tiklansa va `sahifa > 1` bo'lsa, bir sahifa orqaga.
- Klient hech narsani hisoblamaydi: sanagichlar, `notes`, `leadCount` serverniki.
- Bo'sh holatlar harakatga undaydi: filtr bor bo'lsa «Filtrga mos lid topilmadi — filtrni tozalab ko'ring» + tugma; filtr yo'q bo'lsa «Arxivda lid yo'q — o'chirilgan lidlar shu yerda saqlanadi».
- Ekrandagi hamma matn o'zbekcha lotin; inglizcha so'z yo'q (`uzbek-only-texts.test.ts`).

## 6. Tekshiruv (qabul mezonlari)

- Server: yangi sof modullar va servis uchun Jest; kontroller huquqi `routeAccess()` bilan; `permission-routes.spec`, `route-access.snapshot` yashil; `npm run typecheck`, `npm run build`, `npx eslint`, to'liq `npm test`.
- Klient: Vitest (sof fayllar), `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- Brauzerda (mahalliy baza yoki mock API): tab almashinuvi, URL qayta yuklanganda saqlanishi, qidiruv/filtr/sahifalash, tiklashdan keyin qator darrov yo'qolishi va sanagich kamayishi, yuklash xatosi (server o'chiq), `leads.manage`siz rolda tugma yo'qligi, `settings/archive?type=leads` ichida ishlashi, forma javoblari sahifasidagi tiklash dialogi avvalgidek.
- Qo'llanma: `yangiliklar.ts`ga bitta yozuv (lidlar uchun alohida qo'llanma sahifasi yo'q).

## 7. Xavflar

- Eski klient yangi serverda: `GET /leads/archive` yo'qoladi, eski sahifa 404 oladi. Server va Vercel birga chiqariladi (loyihadagi odatiy tartib); oraliqda sahifa «Arxivni yuklab bo'lmadi» ko'rsatadi, ma'lumot yo'qolmaydi.
- Qidiruv `lostReason` bo'yicha ham `contains` ishlatadi; arxiv kattalashsa indeks kerak bo'lishi mumkin (hozir yuzlab qator, `// ponytail:` izohi bilan).
