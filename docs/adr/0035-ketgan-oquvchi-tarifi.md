# ADR-0035 — O'quvchi to'xtagan kuni ketgan sanaladi; guruhsizlik va pauzada N kun kutiladi

**Holati:** Qabul qilindi
**Sana:** 2026-09-25
**Bog'liq:** ADR-0002, ADR-0005, `server/src/students/shared/departure-episodes.ts`, `server/src/reports/shared/departures.loader.ts`, `docs/superpowers/specs/2026-09-25-ketgan-oquvchi-tarifi-design.md`

## Kontekst

«Ketgan» to'rt joyda to'rt xil sanalardi: hisobot sahifasi — hozir guruhsiz
hamma (hech qachon guruhga qo'shilmaganlar, muzlatilganlar va `PROSPECT` ham);
bosh sahifa kartasi — chetlatilganlar + `DROPPED` qatorlar (iyul 2026: 158,
haqiqatda 117 — audit H30); «O'quvchilar oqimi» va Excel faylidagi «Xulosa»,
«O'quvchilar» varaqlari — status o'tishlari, bitiruvchilar ham; Telegram
21:00 — bugungi `DROPPED`.
Sahifaning «Ketish koeffitsienti» butun tarixdagi to'plamni joriy o'quvchilarga
bo'lardi va vaqt o'tgan sari faqat o'sardi.

## Qaror

- Chetlatish — **o'sha kuni** ketgan, o'quvchi qaysi statusdan chetlatilgan
  bo'lsa ham.
- Oxirgi faol yozuvning yopilishi (guruhdan chiqarish, guruh bekor qilinishi
  yoki o'chirilishi) va muzlatish — **N kun ichida** faol yozuv qaytmasa,
  to'xtagan kuni ketgan; qaytsa, ketish bo'lmagan. **N = 14 kun, vaqtincha.**
  Ishora — prod o'lchovi (2026-05-21, oxirgi 6 oy): 97 ta guruhdan chiqarish
  yozuvining 41 tasida o'sha o'quvchiga ±14 kun ichida yangi guruh yozuvi
  ochilgan — admin o'quvchini boshqa guruhga o'tkazgan, o'quvchi ketmagan.
  Bu faqat ishora: o'lchov chiqarishdan oldin ochilgan yozuvlarni ham sanaydi
  va dizayndagi 90-persentil qoidasi emas. N prod probe'i bilan tasdiqlanadi;
  muzlatishdan qaytish muddati alohida o'lchanmagan.
- Qaytishgacha bo'lgan to'xtashlar — bitta epizod; sanasi — birinchi to'xtash.
- Hech qachon faol yozuvi bo'lmagan o'quvchi ketmaydi: uning status
  o'zgarishlari birinchi guruhga qo'shilgan paytdan keyingina sanaladi.
- Bitiruv (`COMPLETED`, `GRADUATED`) va `TRANSFERRED` — ketish emas.
- Arxivlash — ketish emas: arxiv faqat xato yoki takror yozuv uchun, haqiqatan
  ketgan o'quvchi «Chetlatildi» bo'ladi. Hozirgi statusi `ARCHIVED` bo'lgan
  o'quvchi o'chirilgan karta kabi hech bir songa kirmaydi. `StatusHistory`
  dagi arxivlash o'tishi to'xtash emas, shuning uchun arxivdan tiklangan
  o'quvchida darhol ketish yo'q; arxivlash yopgan guruh yozuvi odatdagi N
  kunlik qoidadan o'tadi.
- Guruh o'chirilganda (`deletedAt`) uning yozuvlari ochiq qoladi; yuklovchi
  ularni o'chirilgan paytda yopilgan deb o'qiydi. O'shanda `ACTIVE` yoki
  `FROZEN` bo'lgan yozuv shu yerda tugaydi (odatdagi N kunlik `LEFT_GROUP`),
  undan keyin yozilgan hech narsa guruhda bo'lish sanalmaydi. Davr boshida
  guruhda bo'lganlar ham shu qoida bilan sanaladi.
- Ta'rif `departure-episodes.ts` da; qaysi yozuv to'xtash yoki qaytish
  ekanini `departures.loader.ts` hal qiladi. Ketishlarni `loadDepartures`
  orqali ikki joy o'qiydi: hisobot sahifasi va bosh sahifa kartasi. Excel
  faylidagi «ketgan» soni («Xulosa» va «O'quvchilar» varaqlaridagi «Yangi X
  ta − ketgan Y ta») «O'quvchilar oqimi» ma'nosida qoladi; `kpiSheet` («KPI
  paneli») 2026-08-07 dan beri faylga kirmaydi. Ketganlar hisobotini Excel'ga
  chiqarish — keyingi bosqich ishi.

Taqiqlanadi:
- «Ketgan»ni boshqa joyda `DROPPED` qatorlari yoki `EXPELLED` statusidan
  sanash — H30 aynan shunday paydo bo'lgan.

## Ko'rib chiqilgan muqobillar

- **Faqat status** — guruhdan chiqarilib faol qolganlar hech qachon sanalmaydi.
- **Har qanday `DROPPED`** — guruh almashtirish ham ketish bo'lib qoladi.
- **Muzlatilgan kuni darhol** — qisqa pauzalar churn'ni sun'iy oshiradi.
- **`StudentDeparture` jadvali + cron** — migratsiya, eski ma'lumotni to'ldirish
  va 5 dan ortiq yozish joyi; bittasi unutilsa son jimgina kamayadi.

## Oqibatlari

**Yutuq:** bir oy — bir son (sahifa va karta); N ichidagilar «kutilmoqda» —
qo'ng'iroq qilinadigan ro'yxat.

**Narx:** oxirgi N kun dastlabki — oy natijasi N kun kechikib yakunlanadi.
Status o'tishlarida `FROZEN` dan faqat `ACTIVE` yoki `ARCHIVED` ga o'tiladi:
muzlatilgan o'quvchi chetlatishdan oldin faollashtiriladi. Shuning uchun N
dan uzun muzlatishdan keyingi chetlatish ikki marta sanaladi — muzlatilgan
oyda va chetlatilgan oyda.
«O'quvchilar oqimi» (Excel «Xulosa» va «O'quvchilar» varaqlari ham) va
Telegram 21:00 **ataylab** o'zgartirilmadi: ular boshqa savolga javob beradi
(status o'tishlari; bugungi xom hodisalar). Oqim diagrammasining «Batafsil»
havolasi boshqa son ko'rsatadigan sahifaga olib boradi.

**Endi taqiqlangan:** «ketgan» sonini `departure-episodes.ts` va
`departures.loader.ts` dan tashqarida hisoblash.
