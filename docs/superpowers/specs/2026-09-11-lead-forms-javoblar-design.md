# Formalar: kim ro'yxatdan o'tganini ko'rish

**Sana:** 11.09.2026
**Holati:** dizayn tasdiqlangan, amalga oshirilmagan
**Shox:** `feat/lid-forma-javoblar`

## Muammo

`/leads/forms` sahifasida forma yaratiladi, havolasi Instagram/Telegram'ga joylanadi, har bir
javob avtomatik lid bo'lib doskaga tushadi. Lekin:

1. **Kim ro'yxatdan o'tgani hech qayerda ko'rinmaydi.** `GET /custom-forms/:id` oxirgi 10 ta
   javobni lid ismi bilan qaytaradi (`custom-forms.service.ts:120`), lekin bu ma'lumotni hech
   bir frontend ishlatmaydi.
2. **Ro'yxat jadval emas** (`forms-list-client.tsx` — `<ul>`): ustun sarlavhasi, `#`, sana,
   natija yo'q.
3. **«N ta javob» samarani ko'rsatmaydi.** Formadan kelganlarning qanchasi o'quvchi bo'ldi,
   qanchasiga hali qo'ng'iroq qilinmadi, qanchasi yo'qotildi — ko'rinmaydi.
4. **Formaga «kirish» = uni tahrirlash.** Nomni bosish darhol builder'ni ochadi.
5. **Yo'qotilgan lid arxivda** (`deletedAt`); `GET /leads/:id` uni ochmaydi, doska ham,
   `/leads` ro'yxati ham ko'rsatmaydi. Shuning uchun `/leads?form=X` filtri voronkani
   buzardi — javoblar alohida ko'rinishni talab qiladi.

### Prod raqamlari (11.09.2026)

| Forma | Javob | Natija |
| --- | --- | --- |
| Ro'yxatdan o'tish (Instagram Istoriya) | 45 | NEW 17 · CONVERTED 6 · LOST 22; 28 tasiga qo'ng'iroq qilingan |
| Vorbereitung | 10 | NEW 10 |
| B1 Intensiv | 4 | LOST 4 |
| Kurslarimizga ro'yhatdan o'ting | 1 | LOST 1 |
| Qolgan 3 ta forma | 0 | — |

7 ta faol forma, 20 ta arxivlangan. Hamma formada hozircha faqat 3 ta maydon bor (ism,
familiya, telefon), lekin builder qo'shimcha maydonga ruxsat beradi.

## Dizayn qanday tanlandi

Uch variant solishtirildi: ro'yxat ichida yoyish, yon panel (Sheet), alohida forma sahifasi.
Alohida sahifa tanlandi (havola bilan ulashiladi, filtr va sahifalash uchun joy bor, ko'rish
tahrirlashdan ajraladi). Keyin `frontend-design` + `impeccable critique` bilan mustaqil ko'rik
o'tkazildi (21/40). Undan chiqqan asosiy tuzatishlar shu spec'ga kiritilgan:

- «Qo'ng'iroq qilindi» belgisi jadvalning o'zida (drawer orqali emas).
- Builder tab emas, alohida sahifa (tahrirlash — rejim, ko'rinish emas).
- Holat bir marta ko'rsatiladi (bosqich chiplari), «Lid holati» ustuni yo'q.
- Yo'qotilgan qatorda «Tiklash» amali.
- Chap chetdagi rangli chiziq ishlatilmaydi (impeccable taqiqi).
- Telefonda kartochka ko'rinishi.

## Yo'nalishlar

| Yo'l | Nima |
| --- | --- |
| `/leads/forms` | Formalar jadvali |
| `/leads/forms/[id]` | **Javoblar sahifasi** (yangi) |
| `/leads/forms/[id]/tahrirlash` | Builder (hozirgi `/leads/forms/[id]` dan ko'chadi) |
| `/leads/forms/new` | Builder (o'zgarishsiz) |

- Builder saqlagach: tahrirlashda → `/leads/forms/[id]`; yaratishda → yangi formaning
  `/leads/forms/[id]` sahifasi (bo'sh holat «havolani ulashing» ni ko'rsatadi).
- Builder'dagi «Orqaga»: tahrirlashda javoblar sahifasiga, yaratishda ro'yxatga.
- Eski `/leads/forms/[id]` havolalari endi javoblarni ochadi — bu kutilgan xatti-harakat.
- `breadcrumb-routes.ts` ga `tahrirlash` → «Tahrirlash»; javoblar sahifasi
  `useBreadcrumbName` bilan forma nomini qo'yadi.

## Bosqich — yagona ta'rif

Har bir javob aynan bitta bosqichga tushadi. Bosqichlar yig'indisi har doim jami javobga
teng. Ustuvorlik yuqoridan pastga, birinchi mos kelgani yutadi:

| Bosqich | Kalit | Shart |
| --- | --- | --- |
| O'quvchi bo'ldi | `converted` | `lead.statusEnum = CONVERTED` |
| Yo'qotildi | `lost` | lid yo'q (`leadId = null`) YOKI `statusEnum ∈ {LOST, ARCHIVED}` YOKI `lead.deletedAt ≠ null` |
| Aloqada | `contacted` | `calledAt ≠ null` YOKI `statusEnum ∈ {TRIAL, CONTACTED}` |
| Qo'ng'iroq kutmoqda | `awaiting` | qolgan hammasi (amalda: `NEW`, `calledAt = null`, arxivda emas) |

- `leadId = null` faqat CEO lidni arxivdan butunlay o'chirganda bo'ladi (optional FK
  `SetNull`). Bunday javob «Yo'qotildi» ga tushadi; ism va telefon formaga yozilgan
  javobdan (`submitted`) olinadi, ostida «Lid o'chirilgan» yoziladi.
- **Bir manba:** bosqich serverda bitta toza funksiyada hisoblanadi
  (`submissionStage(lead)`), filtr uchun esa unga mos Prisma `where` quruvchi bor
  (`stageWhere(stage)`). Ikkalasi bir-biriga zid ketmasligini test barcha kombinatsiyalar
  (statusEnum × deletedAt × calledAt × lid bor/yo'q) bo'yicha tekshiradi.
- Client bosqichni o'zi hisoblamaydi — serverdan tayyor keladi.

## Backend

Barcha route'lar mavjud `CustomFormsController` da, `@Roles('CEO', 'Branch Director',
'Administrator')`, `@BranchScope()` bilan. Filial qamrovi `findOne` dagi bilan bir xil
zanjir: forma → bo'lim → ustun → filial (`branchIdWhere(scope)`). `@BranchScope()` bor
route'larni route siyosati manifesti avtomatik tan oladi.

### `GET /custom-forms` — ro'yxatga qo'shiladi

Har bir formaga: `lastSubmittedAt` (`_max.submittedAt`), `convertedCount`,
`awaitingCallCount`. Uchala son ro'yxatdagi forma id'lari bo'yicha `groupBy` bilan
olinadi (har biri bitta so'rov, formalar soniga bog'liq emas).

### `GET /custom-forms/:id` — soddalashadi

`submissions` (oxirgi 10 ta) olib tashlanadi. Uni hech kim ishlatmaydi, javoblar endi
alohida endpoint'da.

### `GET /custom-forms/:id/submissions` — yangi

So'rov parametrlari:

| Param | Ma'no |
| --- | --- |
| `page`, `pageSize` | standart, 10 dan |
| `stage` | `awaiting` / `contacted` / `converted` / `lost` — bitta qiymat (bosqichlar bir-birini qoplamaydi, ko'p tanlash ma'nosiz) |
| `source` | vergul bilan manba id'lari; `none` = manbasi yo'q |
| `search` | ism, familiya yoki telefon (raqamlar bo'yicha) |
| `startDate`, `endDate` | `yyyy-MM-dd`, Toshkent kuni bo'yicha `submittedAt` |

Javob:

```ts
{
  data: SubmissionRow[];
  total: number; page: number; pageSize: number;
  counts: {
    stages: { awaiting: number; contacted: number; converted: number; lost: number };
    sources: { id: string | null; name: string | null; count: number }[];
  };
  fields: FormField[];          // formaning JORIY maydonlari (mapsTo'siz)
  legacyFields: { id: string; label: string }[]; // javoblarda bor, lekin formadan o'chirilgan maydonlar
}

SubmissionRow = {
  id: string;
  submittedAt: string;
  data: Record<string, string | number | boolean>;
  stage: 'awaiting' | 'contacted' | 'converted' | 'lost';
  isRepeat: boolean;
  submitted: { firstName: string; lastName: string; phone: string }; // formaga yozilgani (mapsTo bo'yicha)
  lead: {
    id: string; firstName: string; lastName: string; phone: string;
    statusEnum: LeadStatus; archived: boolean;
    calledAt: string | null; calledBy: { id: number; firstName: string; lastName: string } | null;
    convertedStudentId: number | null;
    lostReason: string | null;   // faqat stage = lost bo'lsa; CONVERTED sentinel hech qachon chiqmaydi
    source: { id: string; name: string } | null;
  } | null;
}
```

- **Sanoqlar filtrlarga bog'liq emas** — `counts` doim butun forma bo'yicha. Loyiha qoidasi:
  variant yonidagi son boshqa filtr tanlanganda o'zgarmaydi.
- **Tartib:** `submittedAt DESC`.
- **`legacyFields`:** o'chirilgan maydonning eski javoblari yo'qolmasin. Nomi uchun
  `CustomForm.fields` da endi yo'q, shuning uchun label sifatida «O'chirilgan maydon» va
  maydon id'si beriladi.
- **`isRepeat`:** shu telefon (lidning `phone`) boshqa, **oldinroq yaratilgan** lidda `phone`
  yoki `extraPhone` sifatida bor (kompaniya bo'yicha, arxivdagilar ham). Sahifadagi
  telefonlar bo'yicha bitta `findMany`, qolgani xotirada. Lid yaratish mantig'i o'zgarmaydi.
- `lostReason` — `Lead.lostReason`, bo'lmasa `statusChangeReason` (CONVERTED sentinel'dan
  tashqari).

### `GET /custom-forms/:id/submissions/export` — yangi

Xuddi shu filtrlar, sahifalashsiz, eng ko'pi 5000 qator, xuddi shu `SubmissionRow` shakli.
CSV'ni client quradi (UTF-8 BOM, Excel ochadi). Ustunlar: Ism · Familiya · Telefon · Manba ·
Yuborildi · Bosqich · Qo'ng'iroq qilingan sana · qo'shimcha maydonlar.

### Mavjud endpoint'lar qayta ishlatiladi

- `PATCH /leads/:id/called` (`{ called: boolean }`) — jadvaldagi «Telefon qildim» va uni
  bekor qilish.
- `POST /leads/:id/restore` — yo'qotilgan lidni tiklash (arxiv sahifasidagi dialog bilan).

Sxema, migratsiya, ADR kerak emas.

## Frontend

### 1. Formalar ro'yxati (`/leads/forms`)

| # | Forma | Javoblar | Qo'ng'iroq kutmoqda | Oxirgi javob | Havola | ⋯ |
| --- | --- | --- | --- | --- | --- | --- |

- **Forma:** nom (qalin) + «Faol emas» belgisi; ostida kulrang «ustun → bo'lim».
- **Javoblar:** jami; ostida «N tasi o'quvchi bo'ldi» (0 bo'lsa yozilmaydi).
- **Qo'ng'iroq kutmoqda:** `awaitingCallCount`. `> 0` bo'lsa sariq va bosiladigan —
  `/leads/forms/[id]?stage=awaiting` ga olib boradi. `0` bo'lsa kulrang «—».
- **Oxirgi javob:** `dd.MM.yyyy`, javob bo'lmasa «Hali yo'q».
- **Havola:** mavjud `CopyFormLinkButton`.
- **⋯:** Javoblar · Tahrirlash · O'chirish (mavjud AlertDialog).
- Qatorni bosish → `/leads/forms/[id]`. Havola, ⋯ va sariq son bosilganda qator bosilishi
  ishlamaydi (`stopPropagation`).
- `#` ustuni `border-r`; sahifalash 10/20/30/40/50 (loyiha qoidasi — doim ko'rsatiladi).
- **`< sm`:** har forma ikki qatorli kartochka: nom + belgi / «45 javob · 3 kutmoqda ·
  10.09.2026», o'ngda Havola va ⋯.
- Skeleton qatorlar; bo'sh holat hozirgidek («Birinchi formani yaratish»).

### 2. Javoblar sahifasi (`/leads/forms/[id]`)

```
← Formalar   Ro'yxatdan o'tish  [Faol]        [Havola] [CSV] [Tahrirlash]

Manba:  Instagram 30 · Telegram 12 · Belgilanmagan 3
[Qo'ng'iroq kutmoqda 17] [Aloqada 0] [O'quvchi bo'ldi 6] [Yo'qotildi 22]
Ism yoki telefon...   [Sana oralig'i]

# │ Ism familiya              │ Telefon      │ Manba     │ Yuborildi    │ Qo'ng'iroq        │ ⋯
1 │ Ali Valiyev  [Takroriy]   │ +998 90 ...  │ Instagram │ Bugun, 14:05 │ [Telefon qildim]  │ ⋯
2 │ Olim Karimov              │ +998 93 ...  │ Instagram │ 09.09, 11:20 │ ✓ 09.09 · Aziza   │ ⋯
  │   O'quvchi bo'ldi → #10412
3 │ Nodira Qodirova           │ +998 91 ...  │ Telegram  │ 08.09, 09:02 │ ✓ 08.09           │ ⋯
  │   Yo'qotildi: «qimmat»
```

**Sarlavha:** «← Formalar», forma nomi, Faol/Faol emas belgisi; o'ngda Havola, CSV,
Tahrirlash (`/leads/forms/[id]/tahrirlash`).

**Manba taqsimoti:** `counts.sources` dan, soni bo'yicha kamayib. Har biri bosiladigan — ko'p
tanlanadigan manba filtri (`?source=`). Tanlanganlari ajralib turadi. Manba bitta bo'lsa ham
ko'rsatiladi (qayerdan kelgani — javob).

**Bosqich chiplari:** 4 ta, har doim shu tartibda, sonlari bilan (0 bo'lsa ham ko'rinadi,
lekin xira). Bittasi tanlanadi, qayta bosilsa tanlov bekor bo'ladi (`?stage=`). Bu yagona
holat filtri. Tooltip har birining ma'nosini bir jumlada aytadi.

**Qidiruv va sana:** `Ism yoki telefon...` (debounce 300 ms), sana oralig'i — ikkita
`DatePicker`, loyihadagi juftlik qoidasi bilan (`minDate`/`maxDate`/`defaultMonth`).

Barcha filtrlar URL'da (`useUrlFilters`): `stage`, `source`, `search`, `startDate`,
`endDate`, `page`, `pageSize`. Default qiymatlar URL'dan tushiriladi, filtr o'zgarsa
`page = 1`.

**Jadval:**

- **# ** — `(page − 1) × pageSize + i + 1`, `border-r`.
- **Ism familiya** — `stage = awaiting` bo'lsa qalin va qatorning foni sal ochroq
  (`bg-amber-50/40 dark:bg-amber-950/20`). `isRepeat` → kichik «Takroriy» belgisi, tooltip:
  «Bu telefon avval ham lid bo'lgan». Ostida ikkinchi qator (kerak bo'lsa):
  - `converted` → «O'quvchi bo'ldi →» + `#<id>` havolasi `/students/profile/<id>`
  - `lost` → «Yo'qotildi: <sabab>» (sabab yo'q bo'lsa faqat «Yo'qotildi»; lid yo'q bo'lsa
    «Lid o'chirilgan»)
- **Telefon** — `+998 XX XXX XX XX`, `tel:+998…` havolasi.
- **Manba** — nom yoki «—».
- **Yuborildi** — bugun bo'lsa «Bugun, HH:mm», kecha «Kecha, HH:mm», aks holda
  `dd.MM.yyyy, HH:mm`. Tooltip'da to'liq `dd.MM.yyyy, HH:mm:ss`.
- **Qo'ng'iroq** —
  - `calledAt = null` va lid arxivda emas → «Telefon qildim» tugmasi (outline, kichik);
  - `calledAt ≠ null` → «✓ dd.MM · Ism» + kichik «×» (belgini olib tashlash);
  - lid yo'q yoki arxivda → «—».
- **Qo'shimcha maydonlar** — `fields` va `legacyFields` bo'yicha dinamik ustunlar; checkbox
  «Ha»/«Yo'q», select/radio variant **label**i bilan.
- **⋯** — oddiy lid: «Lidni ochish»; arxivdagi lid: «Tiklash»; `converted`: qo'shimcha
  «O'quvchi profili»; lid yo'q: menyu ko'rsatilmaydi.

**«Telefon qildim» xatti-harakati:**

- Bosilgan zahoti optimistik: katak «✓ hozir · Men» ga o'tadi, `counts.stages` qayta
  hisoblanadi (awaiting −1, contacted +1).
- Toast: «Qo'ng'iroq belgilandi» + «Bekor qilish» tugmasi (5 soniya) → `called: false`.
- Xato bo'lsa holat qaytadi, `getErrorMessage` bilan toast.
- `stage = awaiting` filtri yoqilgan bo'lsa qator ro'yxatdan **darhol yo'qolmaydi** — keyingi
  yuklashgacha «bajarildi» ko'rinishida qoladi (qatorlar ish paytida sakramasin).
- Qatordagi tugma bosilganda qator bosilishi ishlamaydi.

**Lid kartasi:** «Lidni ochish» mavjud `LeadDetailDrawer` ni shu sahifada ochadi (u
`useLeadsUi` store orqali boshqariladi). Drawer ochadigan dialoglar (tahrirlash, ko'chirish,
o'chirish, o'quvchiga aylantirish) ham shu sahifaga o'rnatiladi. Drawer yopilganda yoki
lid o'zgarganda javoblar qayta yuklanadi.

**Tiklash:** arxiv sahifasidagi mavjud tiklash dialogi qayta ishlatiladi; muvaffaqiyatli
bo'lsa qayta yuklanadi.

**Sahifalash:** 10/20/30/40/50, jami va sahifa raqami.

**`< sm`:** jadval o'rniga kartochkalar: 1-qator — ism (+ belgilar), o'ngda ⋯;
2-qator — telefon (`tel:`), manba, vaqt; 3-qator — ikkinchi qator matni va «Telefon qildim».
Qidiruv qoladi; sana oralig'i va manba bitta «Filtr» tugmasi (Popover) ichida. Bosqich
chiplari gorizontal suriladi.

**Holatlar:**

- Yuklanmoqda: sarlavha + chiplar + 5 skeleton qator.
- Forma topilmadi / ruxsat yo'q: toast va `/leads/forms` ga qaytish (hozirgi builder kabi).
- Formada umuman javob yo'q: «Hali hech kim ro'yxatdan o'tmadi. Havolani ulashing» +
  Havola tugmasi; chiplar va filtrlar ko'rsatilmaydi.
- `stage = awaiting` tanlangan, lekin 0: «Hammaga qo'ng'iroq qilindi».
- Boshqa filtrlar natija bermadi: «Tanlangan filtrlar bo'yicha javob yo'q» + «Filtrlarni
  tozalash».

**CSV:** tugma bosilganda `…/export` joriy filtrlar bilan chaqiriladi, client BOM'li CSV
quradi, fayl nomi `<forma-nomi>-javoblar-<yyyy-MM-dd>.csv`. Yuklanayotganda tugmada
`Loader2`.

### 3. Tahrirlash (`/leads/forms/[id]/tahrirlash`)

Hozirgi `FormBuilderClient` o'zgarishsiz, faqat navigatsiya: saqlagach va «Orqaga»
yuqoridagi «Yo'nalishlar» bo'limidagidek.

## Fayllar (taxminiy)

Server:
- `custom-forms/custom-form-submissions.service.ts` — ro'yxat, sanoqlar, export (yangi)
- `custom-forms/submission-stage.ts` — `submissionStage` + `stageWhere` (yangi)
- `custom-forms/dto/submission-query.dto.ts` (yangi)
- `custom-forms.controller.ts`, `custom-forms.service.ts` (list sanoqlari, findOne)

Client:
- `app/(dashboard)/leads/forms/[id]/page.tsx` → javoblar; `[id]/tahrirlash/page.tsx` → builder
- `components/forms/responses/*` — sahifa, sarlavha, manba/bosqich filtrlari, jadval,
  mobil kartochka, qo'ng'iroq katagi, CSV
- `components/forms/forms-list-client.tsx` — jadval + mobil kartochka
- `hooks/use-custom-forms.ts` — turlar
- `lib/breadcrumb-routes.ts`

Yangi fayllar 500 qatordan oshmaydi.

## Testlar

- `submission-stage.spec.ts` — barcha kombinatsiyalar: `submissionStage` va `stageWhere`
  mos keladi; yig'indi = jami.
- `custom-form-submissions.service.spec.ts` — filial qamrovi (boshqa filial formasi → 404),
  filtrlar, sanoqlar filtrga bog'liq emas, `isRepeat` (`phone` va `extraPhone`, faqat
  oldinroq yaratilgan), `legacyFields`, `leadId = null`, CONVERTED sentinel sabab
  sifatida chiqmasligi.
- `custom-forms.service.spec.ts` — list sanoqlari, `findOne` endi `submissions` qaytarmaydi.
- `custom-forms.controller.spec.ts` — yangi route'lar rol metadata'si.
- Client vitest — Yuborildi vaqt formati (Bugun/Kecha/sana), CSV qurish (BOM, qochirish).
- `npm test` + `npm run typecheck` (server), `npm run build` + `npm test` + `npx eslint src`
  (client).
- Prod nusxasida emas, dev bazada brauzerda: ro'yxat → javoblar → «Telefon qildim» →
  bekor qilish → tiklash → CSV → tahrirlash → saqlash → javoblarga qaytish; 400px kenglik.

## Doiradan tashqarida

- Arxivlangan 20 ta formaning javoblari.
- Jonli (avtomatik) yangilanish, klaviatura yorliqlari, ommaviy belgilash.
- Dublikat telefon bo'yicha lid yaratishni to'xtatish (faqat belgi ko'rsatiladi).
- Formalarni bir-biri bilan taqqoslash grafiklari.
