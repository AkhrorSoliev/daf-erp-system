# Yangi filialni ishga tushirish yo'li — xarita va tur

**Sana:** 2026-09-24 · **Holat:** dizayn tasdiqlandi, amalga oshirilmagan
**Bog'liq:** [branch-decisions.md](../../branch-decisions.md) (D1, D6) ·
[Namangan reset](2026-08-19-namangan-branch-reset-design.md) (§8 «Qayta ochish») ·
[ADR-0002](../../adr/0002-filial-qamrovi-fail-closed.md) ·
[ADR-0003](../../adr/0003-route-siyosati-manifest.md) ·
[ADR-0012](../../adr/0012-bosh-sahifa-qayta-hisoblamaydi.md) ·
[ADR-0022](../../adr/0022-bir-odam-har-rolga-alohida-hisob.md)

> **Asos:** kod manzillari `origin/main` (2026-09-24) bo'yicha tekshirilgan.
> Ish `origin/main` dan ochilgan yangi branch'da qilinadi — `feat/sozlamalar-sabablar`
> undan 606 commit orqada.

---

## 1. Muammo

Yangi filial filial direktoriga topshirilganda direktor nimadan boshlashni
bilmaydi. Buning to'rtta aniq sababi bor:

1. **Bo'sh filialda bosh sahifa jim.** Hamma raqam 0, «e'tibor» blokida yashil
   belgi va «Bugun e'tibor talab qiladigan narsa yo'q»
   ([home-attention-list.tsx](../../../client/src/components/dashboard/home-attention-list.tsx)).
   Bo'sh filialda tizim «hammasi joyida» deydi.
2. **Sozlash tartibi faqat hujjatda yozilgan.** Namangan hujjatining §8 bandi:
   «xodim → xona → kurs → guruh → o'quvchi». Kodda esa bundan qattiqroq talab
   bor: stavkasiz ustozni guruhga biriktirib bo'lmaydi (`assertTeachersHaveRate`,
   [groups-write.service.ts](../../../server/src/groups/groups-write.service.ts)).
3. **Guruh formasi boshi berk.** Kurs majburiy, lekin ro'yxat bo'sh bo'lsa forma
   hech narsa demaydi
   ([group-course-select.tsx](../../../client/src/components/groups/group-course-select.tsx));
   xona va ustoz ro'yxatlari «Hozircha … yo'q» deydi, lekin qayerga borishni aytmaydi.
4. **Direktor bitta joyda CEO'ni kutadi.** Ustoz stavkasini faqat CEO qo'ya oladi
   ([salary.controller.ts](../../../server/src/salary/salary.controller.ts) —
   «write = CEO-only»). Direktor «birinchi guruh» qadamida to'xtaydi.
   [role-access.md](../../role-access.md) esa «direktor qo'ya oladi» deydi —
   hujjat kod bilan zid.

Yechimning yarmi allaqachon bor: `GET /branches/:id/readiness`
([branches.service.ts](../../../server/src/branches/branches.service.ts) `getReadiness`)
kassa, ish vaqti, kurs, xona, administrator va stavkasiz ustozlarni tekshiradi.
Lekin klient uni hech qayerda chaqirmaydi, va unda xato bor: filialda ustoz
umuman bo'lmasa `teacherRates` «bajarildi» deydi.

## 2. Maqsad va muvaffaqiyat mezoni

**Maqsad:** direktor bo'sh filialni hech kimdan «endi nima qilaman?» deb
so'ramasdan birinchi to'lovgacha olib chiqadi.

Mezon:

- Birinchi kirishdayoq direktor qaysi qadamda turganini va qayerni bosishni ko'radi.
- Har bir qadam holati bazadan hisoblanadi, qo'lda belgilanmaydi.
- Yo'lda CEO'ni kutadigan qadam qolmaydi.
- Ishlab turgan filial (Farg'ona) kartani hech qachon ko'rmaydi.

## 3. Qabul qilingan qarorlar

| # | Qaror | Sabab |
|---|---|---|
| Q1 | Foydalanuvchi — filial direktori (rol 2). CEO ham ko'radi, aniq filial tanlaganda | Filial direktorga topshiriladi. Administrator kurs va ustoz qo'sha olmaydi |
| Q2 | Direktor o'z filiali **Ustoz roli bor** har bir xodimiga stavka qo'yadi (ADR-0034) | Aks holda yo'l «Guruh» bekatida CEO'da to'xtaydi |
| Q3 | Ko'rinish: bosh sahifada yo'l xaritasi + sahifada yoritish (tur) | Xarita qayerda ekanini aytadi, tur nimani bosishni ko'rsatadi. Faqat tur bir marta o'tadi va bir necha kunlik sozlashda (ustoz topish vaqt oladi) foydasiz bo'lib qoladi |
| Q4 | Karta `launched` bo'lganda yo'qoladi, «8 bekatning hammasi» bajarilganda emas | Farg'onada stavkasiz test ustoz bor — aks holda ishlab turgan filialda ham karta chiqardi |
| Q5 | Yangi kutubxona qo'shilmaydi | `driver.js` ko'rib chiqildi va rad etildi: qo'shimcha bog'liqlik, shadcn uslubidan chetlanish. Bitta elementni yoritish mavjud Radix Popover bilan yetadi |
| Q6 | CEO'ga stavka bildirishnomasi birinchi versiyada yo'q | Stavka tarixida `changedById` bor, oylikni baribir CEO tasdiqlaydi |
| Q7 | Yozma qo'llanma keyinroq, alohida ish | Hozir ilova ichidagi yo'l kerak |

## 4. Direktor nimani ko'radi

### 4.1 Karta

Bosh sahifaning eng tepasida, moliya kartalaridan oldin: «Filialni ishga
tushirish · 3 / 8». Ostida 8 bekatli xarita, «Keyingi: …» izohi va joriy
bekatning tugmasi, eng pastda «Qo'shimcha» qatori. Katta ekranda xarita
gorizontal, telefonda vertikal ro'yxat. Uslub — bosh sahifadagi boshqa bloklar
bilan bir xil (`rounded-xl border bg-card`, sarlavha `border-b px-4 py-3`).

Bekat holatlari: **bajarildi** (yashil belgi), **joriy** — tartibdagi birinchi
bajarilmagan bekat (ko'k halqa), **navbatda** (kulrang). Tartib tavsiya, qulf
emas: hamma bekat bosiladi (masalan, o'quvchini guruhsiz ham qo'shish mumkin).

### 4.2 Bekatlar

| # | Kalit | Bekat | Bajarildi, qachonki | Sahifa | Yoritiladi (`data-tour`) |
|---|---|---|---|---|---|
| 1 | `workingHours` | Ish vaqti | Filialda boshlanish va tugash vaqti bor | `/settings/branches/:id` | «Tahrirlash» — `branch-edit` |
| 2 | `room` | Xona | Kamida 1 xona | `/settings/rooms?branch=:id` | «Yangi xona» — `room-add` |
| 3 | `course` | Kurs | Kamida 1 kurs | `/settings/courses` | «Yangi kurs» — `course-add` |
| 4 | `teachers` | Ustoz | Kamida 1 faol ustoz | `/teachers` | «Havola olish» — `teacher-invite-link`; u bo'lmasa «Yangi o'qituvchi» — `teacher-add` |
| 5 | `teacherRates` | Stavka | Ustoz bor va hammasida faol stavka bor | `/payments/salary` | «Sozlamalar» — `salary-settings` |
| 6 | `group` | Guruh | Ustozi, dars kunlari, boshlanish vaqti va sanasi bor guruh mavjud | `/groups` | «Yangi guruh» — `group-add` |
| 7 | `enrollment` | O'quvchi | Filial guruhida kamida 1 yozilish (holatidan qat'i nazar) | `/students` | «Yangi o'quvchi» — `student-add` |
| 8 | `payment` | To'lov | Filialda kamida 1 to'lov | `/payments/overview` | «To'lov qayd qilish» — `payment-record` |

«Qo'shimcha» — ixtiyoriy, `launched` ga kirmaydi:

| Kalit | Nima | Sahifa | Yoritiladi |
|---|---|---|---|
| `administrator` | Administrator qo'shish | `/settings/employees` | «Yangi xodim» — `employee-add` |
| `leadSection` | Lid bo'limi (lidlar va onlayn formalar uchun kerak) | `/leads` | bo'lim yaratish tugmasi — `lead-section-add` |
| `telegramGroup` | Telegram hisobot guruhi | `/settings/telegram-groups` | yoritish yo'q — sahifaning o'zida qadamma-qadam yo'riqnoma bor |

Chala bekat ostida server bergan aniq izoh turadi (§5.1).

O'quvchi bekati lid bo'limiga bog'liq emas: `/students` eshigi yozadigan lid
ataylab bo'limsiz (`sectionId: null`) yaratiladi; faqat «Qayerdan bildi?»
manbasi kerak, manbalar esa butun kompaniya uchun umumiy
([student-lead-origin.service.ts](../../../server/src/common/student-origin/student-lead-origin.service.ts)).

### 4.3 Tur

Bekat yoki «Keyingi» tugmasi bosilganda direktor sahifaga o'tadi; ekran
xiralashadi, faqat kerakli tugma yorug' qoladi, yonida sarlavha, bir-ikki jumla
izoh va «Tushundim». Yoritilgan tugmani bosish ham turni yopadi va tugmaning
o'z ishi bajariladi (forma ochiladi). Tur o'zicha ishga tushmaydi — faqat bosilganda.

Tur matnlari (`launch-stations.ts`, rejalashda tahrirlanishi mumkin):

1. «Filial qaysi soatda ochilib yopilishini kiriting. Guruh jadvali shu oraliqda tuziladi.»
2. «Xona qo'shing. Xonasiz guruh kunlik jadvalda ko'rinmaydi.»
3. «Kurs qo'shing: nomi, narxi, to'lov modeli va necha darsga bo'linishi. Guruh ochish uchun kamida bitta kurs kerak.»
4. «Ustozlarga Telegram havolani yuboring — ular o'zi ro'yxatdan o'tadi va shu filialga tushadi. Yoki qo'lda qo'shing.»
5. «Har bir ustozga stavka qo'ying. Stavkasiz ustozni guruhga biriktirib bo'lmaydi.»
6. «Guruh oching: kurs, xona, ustoz, dars kunlari va boshlanish sanasi.»
7. «O'quvchini qo'shing va guruhga yozing.»
8. «Birinchi to'lovni qayd qiling — shundan keyin filial ishga tushgan hisoblanadi.»

### 4.4 Kartaning hayot sikli

```
readiness.launched = false                          → xarita
launched = true, karta avval ko'rilgan,
                 tabrik hali ko'rsatilmagan          → «Filial ishga tushdi» + «Yopish»
qolgan hamma holat                                   → karta yo'q
```

Direktor kartani istalgan payt yig'ib qo'yishi mumkin — sarlavha va hisob
qoladi, xarita yashirinadi.

## 5. Server

### 5.1 `GET /branches/:id/readiness` kengaytmasi

- Rollar va filial qo'riqchisi o'zgarmaydi (`CEO`, `Branch Director`;
  `assertCallerMayTouchBranch`). Route manifestida allaqachon bor.
- Endpointni hozir hech kim chaqirmaydi — javob shaklini o'zgartirish xavfsiz.
- `DashboardSummaryService` ga tegilmaydi (ADR-0012).

Javob:

```ts
type ReadinessKey =
  | 'cashAccount' | 'bankAccount' | 'workingHours' | 'room' | 'course'
  | 'teachers' | 'teacherRates' | 'group' | 'enrollment' | 'payment'
  | 'administrator' | 'leadSection' | 'telegramGroup';

interface ReadinessCheck {
  key: ReadinessKey;
  label: string;      // o'zbekcha
  ok: boolean;
  required: boolean;  // false: administrator, leadSection, telegramGroup
  hint: string;       // holatga qarab o'zgaradi — chala holatni aniq aytadi
  details?: { id: number; name: string }[]; // teacherRates: stavkasiz ustozlar
}

interface BranchReadiness {
  branchId: number;
  branchName: string;
  ready: boolean;     // hamma required tekshiruv ok
  launched: boolean;  // group && enrollment && payment
  checks: ReadinessCheck[];
}
```

Tekshiruvlar (hammasi bitta `Promise.all` da; jadvalda `deletedAt` bo'lsa —
`deletedAt: null`):

| Kalit | O'zgarish | So'rov |
|---|---|---|
| `cashAccount`, `bankAccount` | faqat `isActive: true` kassalar sanaladi (to'lov faqat faol kassaga yoziladi) | mavjud `findMany` + `isActive` |
| `workingHours`, `room`, `course` | yo'q | mavjud |
| `teachers` | yangi | mavjud ustozlar ro'yxatining uzunligi |
| `teacherRates` | `ok = ustozlar ≥ 1 && stavkasizlar = 0` | mavjud |
| `group` | yangi | `group.findFirst`: `branchId`, `teachers: { some: {} }`, `exactDays: { isEmpty: false }`, `lessonStartTime` va `startDate` null emas; izoh uchun `group.count` |
| `enrollment` | yangi | `enrollment.findFirst({ where: { group: { branchId } } })`; izoh uchun filialda o'quvchi bormi |
| `payment` | yangi | `payment.findFirst({ where: { branchId, companyId } })` |
| `administrator` | `required: false` | mavjud |
| `leadSection` | yangi, ixtiyoriy | `leadSection.findFirst` — `column.branchId` bo'yicha |
| `telegramGroup` | yangi, ixtiyoriy | filialga tasdiqlangan Telegram guruh |

«Bormi?» tekshiruvlari `findFirst({ select: { id: true } })` bilan qilinadi —
Farg'onaning katta jadvallari sanalmaydi.

Izohlar (`hint`):

- `teacherRates`: ustoz yo'q → «Avval ustoz qo'shing»; bor →
  «N ta ustozga stavka qo'yilmagan» + `details` (ismlar).
- `group`: guruh yo'q → «Kurs, ustoz va jadval bilan birinchi guruhni oching»;
  bor, lekin to'liq emas → «Guruh bor, lekin ustoz, dars kunlari yoki
  boshlanish sanasi kiritilmagan».
- `enrollment`: o'quvchi yo'q → «O'quvchi qo'shib, guruhga yozing»; bor →
  «O'quvchilar bor, lekin hech biri guruhga yozilmagan».
- `course`: «Kurssiz guruh ochib bolmaydi» dagi tushib qolgan apostrof tuzatiladi.

### 5.2 Direktor o'z filiali ustozlariga stavka qo'yadi

- `POST /salary/config` → `@Roles('CEO', 'Branch Director')`. `PATCH
  /salary/config/:id` — **CEO-only**: direktor UI hech qachon PATCH
  yubormaydi (tahrirlar POST orqali yangi versiya sifatida yoziladi), va
  direktorning `{isActive: true}` yuborishi yopiq konfigni ochiq versiyasiz
  faollashtirib, sukut oylik yozilishiga olib kelishi mumkin edi.
- CEO'da qoladi: `PATCH /salary/config/:id`, `POST /salary/config/global`,
  `/salary/period-settings`, `/salary/calculate`, oylikni tasdiqlash.
- Yangi qo'riqchi `assertCallerMaySetTeacherRate(prisma, callerId, companyId,
  dto, now?)` — faqat CEO bo'lmagan chaqiruvchi uchun ishlaydi. Chaqiruvchi
  bazadan BITTA so'rov bilan o'qiladi (DB rollari CEO bo'lsa — o'tadi;
  DB rollarida Branch Director yo'q bo'lsa — 403, tushirilgan direktorni
  ushlaydi). Tartib bilan (birinchi mos qoida g'olib):
  1. Maqsad — chaqiruvchining o'zi → «O'zingizga stavka qo'ya olmaysiz».
  2. Maqsad chaqiruvchi bilan birorta filialni ham bo'lishmaydi (UserBranch ∪
     mainBranch; bo'sh to'plam — hech narsa, ADR-0002) → «Bu ustoz sizning
     filialingizda emas» (topilmagan maqsad ham xuddi shu javobni oladi — 404
     emas, direktor id borligini bilmasligi kerak).
  3. Maqsadda `Teacher` roli yo'q, yoki `CEO`/`Branch Director` roli bor →
     «Bu xodimning oyligini CEO belgilaydi» («Ustoz roli bor hammaga» qarori:
     administrator yoki kassir bo'lib ham dars beradigan xodim RUXSAT
     ETILADI — ADR-0022 bir odamning hamma xodim rolini bitta hisobga
     qo'yadi).
  4. Maqsad `status !== ACTIVE` yoki `isActive === false` → «Faol bo'lmagan
     xodimga stavka qo'yib bo'lmaydi».
  5. `salaryType === FIXED_MONTHLY` → «Oylik (FIXED_MONTHLY) stavkani faqat
     CEO belgilaydi».
  6. `effectiveFrom` joriy ochiq oylik davridan oldin (`resolveCurrentPeriod`)
     → «Stavka sanasi joriy oylik davridan oldin bo'lishi mumkin emas».
  7. `groupId` berilsa — guruh topilmasin/arxivlangan bo'lsin yoki uning
     filiali chaqiruvchi shiftida bo'lmasin → «Bu guruh sizning filialingizda
     emas».
- `PERCENTAGE` stavka 100 dan katta bo'lsa — HAMMA uchun (CEO ham) 400 «Foiz
  100 dan oshmasligi kerak» (`createConfig`, `updateConfig`,
  `applyGlobalConfig`; bitta ulashilgan yordamchi funksiya).
- Xato turi — `ForbiddenException`/`BadRequestException`, matn o'zbekcha.
- Mavjud pul qo'riqchilari hamma uchun ishlayveradi: yangi versiya oldingisidan
  oldin bo'lmaydi va APPROVED/PAID oylik davriga tushmaydi
  ([salary-config.service.ts](../../../server/src/salary/salary-config.service.ts)
  `upsertNewVersion`). Kim o'zgartirgani `changedById` ga yoziladi.
- Route manifesti: `POST /salary/config` `COMPANY_WIDE` blokidan
  `BRANCH_SCOPED_BY_ENTITY` ga ko'chadi — «filial ustozning o'zidan olinadi,
  chaqiruvchi unga nisbatan tekshiriladi». `PATCH /salary/config/:id`
  `COMPANY_WIDE` blokida qoladi.
- **ADR-0034** — «Filial direktori o'z filiali ustozlariga stavka qo'yadi».
  Kontekst, yuqoridagi qaror, rad etilgan muqobillar: faqat CEO (yangi filial
  yo'lini to'sadi); direktor filialning har bir xodimiga (o'z va boshqa
  direktorlar oyligiga yo'l ochardi).
- Hujjatlar: `docs/role-access.md` dagi «Set salary config» qatori,
  `server/CLAUDE.md` RBAC jadvali, ADR indeksi.

## 6. Klient

### 6.1 Fayllar

| Fayl (`client/src/`) | Vazifa |
|---|---|
| `components/dashboard/launch/launch-stations.ts` | 8 bekat + 3 qo'shimcha: kalit, qisqa nom, tur matni, sahifa (branchId dan), `data-tour` nomzodlari |
| `components/dashboard/launch/resolve-launch-journey.ts` | sof: `readiness` → bekatlar holati, joriy bekat, hisob |
| `components/dashboard/launch/resolve-launch-visibility.ts` | sof: `'hidden' \| 'journey' \| 'celebrate'` |
| `components/dashboard/launch/launch-storage.ts` | `localStorage` o'qish/yozish, `try/catch` bilan |
| `components/dashboard/launch/branch-launch-card.tsx` | karta |
| `hooks/use-branch-readiness.ts` | React Query |
| `hooks/use-spotlight.ts` | zustand store, `registerBranchScopedStore` bilan |
| `components/spotlight/find-spotlight-target.ts` | nomzodlardan birinchi mavjud elementni kutish |
| `components/spotlight/spotlight-host.tsx` | xiralashtirish + Popover |

Joylash: karta — `HomeOverview` ning birinchi bolasi; `SpotlightHost` —
`app/(dashboard)/layout.tsx` da, `<BranchScopedMain>` dan tashqarida (sahifa
almashganda yo'qolmasligi uchun).

### 6.2 Sof funksiyalar

```ts
resolveLaunchVisibility(input: {
  roleIds: number[];
  selectedBranchId: number | null;
  readiness: BranchReadiness | undefined;
  flags: { seen: boolean; celebrated: boolean };
}): 'hidden' | 'journey' | 'celebrate'
```

- rol 1 ham, 2 ham yo'q → `hidden`
- `selectedBranchId === null` (CEO, «Barcha filiallar») → `hidden`
- `readiness` yo'q yoki unda `launched` maydoni yo'q (so'rov yiqilgan / eski
  server) → `hidden`
- `!launched` → `journey`
- `launched && seen && !celebrated` → `celebrate`
- aks holda → `hidden`

```ts
resolveLaunchJourney(checks: ReadinessCheck[]): {
  stations: Array<{
    key: ReadinessKey;
    state: 'done' | 'current' | 'todo';
    hint: string;
    details?: { id: number; name: string }[];
  }>;                        // doim 8 ta, qat'iy tartibda
  extras: Array<{ key: ReadinessKey; ok: boolean; hint: string }>;
  doneCount: number;
  currentKey: ReadinessKey | null;
}
```

Serverda yo'q kalit → bekat `todo`.

### 6.3 So'rov

`useQuery(["branch-readiness", branchId])`. `enabled` — faqat rol 1 yoki 2 va
tanlangan filial bo'lsa: administratorga so'rov ketmaydi, global 403 toast
chiqmaydi. `refetchOnMount: "always"` — direktor bekatni bajarib bosh sahifaga
qaytganda xarita darhol yangilanadi. So'rov `<main>` ichida — filial almashganda
o'zi tozalanadi.

### 6.4 Brauzer xotirasi

Kalitlar: `daf.launch.<userId>.<branchId>.collapsed | seen | celebrated`.
`userId` shart — logout faqat `companyId` va `branchId` ni tozalaydi, aks holda
belgilar shu kompyuterdagi keyingi foydalanuvchiga o'tib ketadi. `seen` karta
`journey` holatida birinchi marta chizilganda yoziladi.

### 6.5 Tur

```ts
interface SpotlightStep {
  route: string;      // faqat shu sahifada qidiriladi
  targets: string[];  // data-tour nomzodlari, tartib bilan
  title: string;
  body: string;
}
```

1. Karta: `start(step)`, keyin `router.push(step.route)`.
2. Host `pathname === step.route` bo'lgandagina qidiradi: `MutationObserver`,
   5 soniyagacha.
3. Topilsa: `scrollIntoView({ block: 'center' })`; element ustida
   `position: fixed` div (6px chekka, `box-shadow: 0 0 0 9999px` qora 50%,
   `pointer-events: none`); unga langarlangan Radix Popover — sarlavha, matn,
   «Tushundim».
4. Yopilish: «Tushundim», Esc, hujjatdagi har qanday `pointerdown` (capture
   bosqichida, `preventDefault` qilinmaydi — bosilgan tugma o'z ishini qiladi),
   sahifa almashishi. O'lcham yoki scroll o'zgarsa joyi qayta hisoblanadi (rAF).
5. 5 soniyada topilmasa — `react-hot-toast` bilan `title` + `body`, keyin `stop()`.

z-index: overlay shadcn drawer/sheet (`z-50`) dan yuqori.

### 6.6 `data-tour` atributlari

`branch-detail-client.tsx` (Tahrirlash), `rooms-settings-client.tsx` (Yangi xona),
`courses-settings-client.tsx` (Yangi kurs), `teachers-client.tsx` (Havola olish,
Yangi o'qituvchi), `salary-monthly-view.tsx` (Sozlamalar), `groups-client.tsx`
(Yangi guruh), `students-client.tsx` (Yangi o'quvchi), `overview-client.tsx`
(To'lov qayd qilish), `employees-settings-client.tsx` (Yangi xodim), lid bo'limi
yaratish tugmasi (`create-section-dialog.tsx` ni ochadigan joy). Barcha fayllar
`client/src/components/` ostida.

### 6.7 Oylik sahifasi

- `salary-monthly-view.tsx`: «Sozlamalar» tugmasi — `isCeo` o'rniga CEO yoki direktor.
- `salary-settings-sheet.tsx`: direktorga faqat «Ustoz stavkalari» bo'limi;
  «Xodimlar stavkalari» va hisoblash davri CEO'da qoladi. Ro'yxat — direktor
  filialidagi, faqat Ustoz roli bor xodimlar.
- `salary-config-row-sheet.tsx`: stavkani o'chirish tugmasi direktordan yashiriladi.
- Ustoz stavkasi haqidagi «CEO belgilaydi» matnlari yangilanadi; xodimlar
  stavkasi haqidagi matn (CEO) o'zgarmaydi.

### 6.8 Guruh formasi

- `group-course-select.tsx`: ro'yxat bo'sh → «Bu filialda hali kurs yo'q.» +
  «Kurs qo'shish» → `/settings/courses` (CEO/direktor); administratorga
  «Kursni direktor qo'shadi».
- `group-room-select.tsx`: «Hozircha xona yo'q» + «Xona qo'shish» →
  `/settings/rooms/:branchId`.
- `group-teacher-select.tsx`: «Hozircha o'qituvchi yo'q» + «Ustoz qo'shish» →
  `/teachers` (CEO/direktor).
- Namuna: `enroll-to-group-dialog.tsx` dagi «sozlamalarda tuzating» havolasi.

## 7. Xatolar

| Holat | Xulq |
|---|---|
| readiness so'rovi yiqildi | karta chizilmaydi, bosh sahifa odatdagidek ishlaydi |
| readiness eski shaklda (`launched` yo'q) | karta chizilmaydi |
| tur elementi 5 soniyada topilmadi | toast bilan tur matni |
| direktor ruxsat etilmagan xodimga stavka qo'ymoqchi | 403 + o'zbekcha matn (§5.2) |
| `localStorage` yo'q yoki taqiqlangan | karta ishlaydi, faqat yig'ish holati eslab qolinmaydi |

## 8. Test

**Server (jest):**

- `getReadiness`: har bir yangi kalitning ikkala holati; ustozsiz filialda
  `teacherRates = false`; guruh to'liqligi to'rt shart bo'yicha alohida; har
  qanday holatdagi yozilish sanaladi; nofaol kassa sanalmaydi; `required`
  bayroqlari; `ready` va `launched`; chala holat izohlari.
- Stavka qo'riqchisi: CEO uchun o'zgarish yo'q; direktor → o'z filialidagi
  ustoz ✓; boshqa filial ustozi ✗; o'zi ✗; ko'p rolli xodim ✗; boshqa filial
  guruhi ✗; boshqa filial config'ini `PATCH` ✗; `isActive: false` ✗;
  `global` faqat CEO.
- Route manifesti testi o'tadi.

**Klient (vitest, render qilinmaydi):**

- `resolveLaunchVisibility` — §6.2 dagi har bir tarmoq, jumladan Farg'ona holati
  (`launched`, karta hech qachon ko'rilmagan → `hidden`).
- `resolveLaunchJourney` — tartib, joriy bekat, hisob, serverda yo'q kalit.
- `launch-storage` — kalitda `userId` va `branchId` bor.
- `find-spotlight-target` — birinchi mavjud nomzod, kechikib paydo bo'lgan
  element, vaqt tugashi (jsdom).
- `branch-scoped-stores.test.ts` o'tadi.

**Qo'lda (brauzerda):**

1. Lokal bazada CEO yangi filial ochadi va unga direktor biriktiradi.
2. Direktor sifatida kirib 8 bekatni bosib chiqiladi: har birida to'g'ri sahifa
   va yoritish; bosh sahifaga qaytganda xarita yangilanadi.
3. Birinchi to'lovdan keyin tabrik chiqadi, «Yopish» bosilgach karta yo'qoladi.
4. CEO Farg'onani tanlasa — karta yo'q; yangi filialni tanlasa — bor.
5. Yangi filial administratori — karta ham, 403 toast ham yo'q.
6. Direktor API orqali boshqa filial ustoziga stavka qo'ymoqchi bo'ladi → 403.
7. Telefon kengligida karta to'g'ri chiziladi.

## 9. Chiqarish

- Migratsiya yo'q, sxema o'zgarmaydi.
- Avval server, keyin klient: klient yangi `launched`/`required` maydonlari
  bo'lmasa kartani yashiradi (§6.2).
- ADR shu ish bilan bitta PR ichida.
- Chiqarilgan kundan hali ishga tushmagan har bir filialning direktori kartani ko'radi.

## 10. Doiradan tashqarida

- Yozma qo'llanma (keyin, alohida ish).
- Administrator va kassir uchun ko'rinish.
- Kundalik ish bo'yicha yo'riqnoma (davomat, qarzdorlar, lidlar).
- CEO'ga stavka bildirishnomasi.
- `Branch.launchedAt` maydoni.
- Bo'sh bosh sahifadagi «hammasi joyida» matnlari.
