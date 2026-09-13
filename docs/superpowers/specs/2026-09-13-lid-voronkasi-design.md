# Lid voronkasi — to'lovgacha bo'lgan yo'l

**Sana:** 13.09.2026
**Holati:** dizayn tasdiqlangan (CEO)
**Bog'liq:** ADR-0017, ADR-0018

## Muammo

Markazga kelgan odam qaysi bosqichda to'xtab qolishi hech qayerda ko'rinmaydi.
`/reports/leads` sahifasi bor, lekin bo'sh. CEO uchun eng muhim savol: odam
**to'lov qilganmi** — guruhga yozilgani yoki darsga kelgani yetarli emas.

## Bosqichlar

To'rt bosqich, har biri bazadagi haqiqiy yozuvga tayanadi (admin tugma bosishiga emas):

| # | Bosqich | Mezon |
|---|---|---|
| 1 | Lid | davrda yaratilgan `Lead` |
| 2 | Guruhga yozildi | lid o'quvchiga aylangan va o'quvchida kamida bitta `Enrollment` bor |
| 3 | Darsga keldi | o'quvchida kamida bitta `PRESENT` yoki `LATE` davomat bor |
| 4 | To'lov qildi | o'quvchida kamida bitta `COMPLETED` `Payment` bor |

**«Aloqa» bosqichi ataylab yo'q.** Prodda o'quvchiga aylangan 53 lidning 36 tasida
(68 %) `calledAt` belgisi yo'q — belgi qo'yilmaydi, ya'ni bosqich soxta qulash
ko'rsatardi.

## Qamrov

**Voronka markazga kelgan HAMMA odamni qamraydi:** doska lidlari, bot va mock
imtihon orqali kelganlar, «O'quvchi qo'shish» orqali qo'shilganlar. ADR-0018 dan
keyin har bir o'quvchi lid yozuvi qoldiradi. Birinchi blok ostida bo'linish:
`doskadan N · to'g'ridan M` (`sectionId` bor / yo'q).

Hisobotlardagi mavjud konversiya foizi (`reports-overview`, voronka samaradorligi)
o'zgarmaydi — u faqat doska lidlarini sanaydi va boshqa savolga javob beradi.

**Kogorta:** davrda YARATILGAN lidlar olinib, oldinga kuzatiladi. Keyingi bosqich
hodisasi davrdan keyin bo'lsa ham sanaladi. Joriy oy tabiiy ravishda pastroq
chiqadi — sahifada izoh.

**Birlik:** bir odam bir marta. Bir o'quvchiga bir nechta lid bog'langan bo'lsa
(telefon bo'yicha ulanish), ular bitta odam sifatida sanaladi. Aylanmagan lid —
o'zi bitta odam.

**Arxivlangan lidlar ham sanaladi.** Yo'qotilgan (LOST) lid voronkadan tushib
qolgan odam — uni chiqarib tashlash birinchi bosqichni kichraytirib, konversiyani
yolg'on oshirardi. Bu `deletedAt: null` qoidasidan ongli istisno.

**Filial:** `leadAttributionWhere` — filiali belgilanmagan (hali aylanmagan
ochiq forma) lidlar filial bo'yicha qaralganda sanalmaydi, CEO umumiy
ko'rinishida sanaladi. Aylangan lidning filiali o'quvchinikiga tenglangan
(ADR-0017, A qarori).

## «Darsga kelyapti, lekin to'lamagan» kartasi

Voronkadan boshqa o'lchov: **bugungi holat**, davrga bog'liq emas. Tirik o'quvchilar
(`studentBranchWhere`), kamida bitta `PRESENT`/`LATE` davomat, birorta ham
`COMPLETED` to'lov yo'q.

**Holat bo'yicha bo'linadi.** Prodda 205 kishidan 93 tasi faol, 51 tasi
muzlatilgan, 61 tasi chetlatilgan. Bo'linmasa raqam «hozir qo'ng'iroq qilinishi
kerak bo'lganlar» deb noto'g'ri o'qiladi. Karta: jami + `faol · muzlatilgan ·
chetlatilgan`. Eski tizimdan boshlang'ich balans bilan kelganlar raqamni buzmaydi
(tekshirildi: 0 ta).

## Sahifa

**`/reports/leads`:**
- sana oralig'i (URL: `startDate`, `endDate`, standart — joriy oy); filial —
  sarlavhadagi filial tanlagichidan;
- chapda voronka: bloklar kengligi songa mutanosib, yonida son, birinchi bosqichga
  nisbatan foiz, oldingi bosqichdan yo'qotish;
- o'ngda to'lamaganlar kartasi;
- bosqich yoki kartaga bosilsa oynada ro'yxat: «Hammasi» / «Keyingi bosqichga
  o'tmaganlar» (`?mode=`), ism, telefon, profil havolasi, 10 qatordan sahifalash.

**Bosh sahifa:** ixcham chiziq — 4 raqam, lid→to'lov foizi, to'lamaganlar (faol)
soni, «Batafsil» → `/reports/leads`. Joriy oy.

## API

`@Roles('CEO', 'Branch Director', 'Administrator')` (reports kontrollerining
umumiy qoidasi), `@BranchScope()`, bo'sh qamrov → 403.

- `GET /reports/lead-funnel?startDate&endDate` →
  `{ period, stages: { lead, enrolled, attended, paid }, leadSplit: { board, direct },
  unpaid: { total, active, frozen, expelled } }`
- `GET /reports/lead-funnel/people?stage&mode&startDate&endDate&page&pageSize` →
  `{ data: [{ key, name, phone, studentId, studentStatus, source, createdAt }], total, page, pageSize }`
  - `stage`: `lead | enrolled | attended | paid | unpaid`
  - `mode`: `all | stuck` (stuck — shu bosqichda, keyingisida yo'q; `paid` va `unpaid` uchun ma'nosiz → `all`)

## Qamrovdan tashqarida

- Voronka bosqichlarini oydan oyga taqqoslash grafigi.
- Manba bo'yicha voronka (Instagram voronkasi vs Telegram) — keyingi qadam bo'lishi mumkin.
- «Aloqa» / «Sinov darsi» bosqichlari.
- Migratsiya — kerak emas.

## Tekshirish

- Kogorta: davrdan tashqarida yaratilgan lid sanalmaydi; aylangan lidning keyingi
  hodisalari davrdan keyin bo'lsa ham sanaladi.
- Bir o'quvchiga ikki lid → bitta odam.
- Arxivlangan LOST lid 1-bosqichda sanaladi.
- Filial qamrovi: begona filial lidi ham, o'quvchisi ham sanalmaydi; bo'sh qamrov 403.
- To'lamaganlar: holat bo'linishi yig'indisi jamiga teng.
- `stuck` rejimi: `attended` da to'lov qilganlar chiqmaydi.
