# ADR-0035 — O'quvchi to'xtagan kuni ketgan sanaladi; guruhsizlik va pauzada N kun kutiladi

**Holati:** Qabul qilindi
**Sana:** 2026-09-25
**Bog'liq:** ADR-0002, ADR-0005, `server/src/students/shared/departure-episodes.ts`, `server/src/reports/shared/departures.loader.ts`, `docs/superpowers/specs/2026-09-25-ketgan-oquvchi-tarifi-design.md`

## Kontekst

«Ketgan» to'rt joyda to'rt xil sanalardi: hisobot sahifasi — hozir guruhsiz
hamma (hech qachon guruhga qo'shilmaganlar, muzlatilganlar va `PROSPECT` ham);
bosh sahifa kartasi va Excel «KPI paneli» — chetlatilganlar + `DROPPED`
qatorlar (iyul 2026: 158, haqiqatda 117 — audit H30); «O'quvchilar oqimi» —
status o'tishlari, bitiruvchilar ham; Telegram 21:00 — bugungi `DROPPED`.
Sahifaning «Ketish koeffitsienti» butun tarixdagi to'plamni joriy o'quvchilarga
bo'lardi va vaqt o'tgan sari faqat o'sardi.

## Qaror

- Chetlatish (`ACTIVE → EXPELLED`) va faol yoki muzlatilgan o'quvchini
  arxivlash — **o'sha kuni** ketgan.
- Oxirgi faol yozuvning yopilishi (guruhdan chiqarish, guruh bekor qilinishi)
  va muzlatish — **N kun ichida** faol yozuv qaytmasa, to'xtagan kuni ketgan;
  qaytsa, ketish bo'lmagan. **N = 14 kun.** Asos — prod o'lchovi (2026-05-21,
  oxirgi 6 oy): 97 ta guruhdan chiqarish yozuvining 41 tasida o'sha o'quvchiga
  ±14 kun ichida yangi guruh yozuvi ochilgan — admin o'quvchini guruhdan
  chiqarib, boshqasiga qo'shgan, o'quvchi ketmagan. Muzlatishdan qaytish
  muddati alohida o'lchanmagan.
- Qaytishgacha bo'lgan to'xtashlar — bitta epizod; sanasi — birinchi to'xtash.
- Bitiruv (`COMPLETED`, `GRADUATED`) va `TRANSFERRED` — ketish emas.
- Qoida faqat `departure-episodes.ts` da yashaydi. Hisobot sahifasi, bosh
  sahifa kartasi va Excel «KPI paneli» uni `loadDepartures` orqali o'qiydi.

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

**Yutuq:** bir oy — bir son (sahifa, karta, Excel); N ichidagilar
«kutilmoqda» — qo'ng'iroq qilinadigan ro'yxat.

**Narx:** oxirgi N kun dastlabki — oy natijasi N kun kechikib yakunlanadi.
«O'quvchilar oqimi» va Telegram 21:00 **ataylab** o'zgartirilmadi: ular
boshqa savolga javob beradi (status o'tishlari; bugungi xom hodisalar).
Oqim diagrammasining «Batafsil» havolasi boshqa son ko'rsatadigan sahifaga
olib boradi.

**Endi taqiqlangan:** «ketgan» sonini `departure-episodes.ts` dan
boshqa joyda hisoblash.
