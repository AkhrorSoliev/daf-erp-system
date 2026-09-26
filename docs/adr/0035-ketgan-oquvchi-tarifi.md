# ADR-0035 — O'quvchi to'xtagan kuni ketgan sanaladi; guruhsiz qolganda 21, muzlatilganda 60 kun kutiladi

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
  yoki o'chirilishi) va muzlatish — qaytish muddati ichida faol yozuv
  qaytmasa, to'xtagan kuni ketgan; qaytsa, ketish bo'lmagan. Muddat ikkita
  (`DEPARTURE_GRACE_DAYS`): guruhdan chiqish yoki guruhning o'chirilishi —
  **21 kun**, muzlatish — **60 kun**.
  Asos — 2026-09-25 dagi prod o'lchovi, kamida 61 kun oldingi to'xtashlar
  bo'yicha. Guruhdan chiqarilib qaytganlarda p90 — 18,2 kun, qaytganlarning
  91,1% i 21 kun ichida qaytgan. Muzlatilib qaytganlarda p90 — 48,4 kun,
  94% i 60 kun ichida qaytgan. Bu dizayndagi 90% qoidasi; ikkala qiymatni
  CEO tasdiqlagan.
- Qaytishgacha bo'lgan to'xtashlar — bitta epizod; sanasi — birinchi to'xtash.
  Epizod tasdiqlanguncha undagi eng og'ir kutadigan to'xtashning muddati
  kutiladi (guruhdan chiqqan o'quvchi shu orada muzlatilsa — 60 kun); muddat
  birinchi to'xtashdan hisoblanadi. Epizod muddat tugaganda yoki
  chetlatilganda — qaysi biri oldin bo'lsa — tasdiqlanadi va tasdiqlangan
  bo'lib qoladi.
- Hech qachon faol yozuvi bo'lmagan o'quvchi ketmaydi: uning status
  o'zgarishlari birinchi guruhga qo'shilgan paytdan keyingina sanaladi.
- Bitiruv (`COMPLETED`, `GRADUATED`) va `TRANSFERRED` — ketish emas.
- Arxivlash — ketish emas: arxiv faqat xato yoki takror yozuv uchun, haqiqatan
  ketgan o'quvchi «Chetlatildi» bo'ladi. Hozirgi statusi `ARCHIVED` bo'lgan
  o'quvchi o'chirilgan karta kabi hech bir songa kirmaydi. `StatusHistory`
  dagi arxivlash o'tishi to'xtash emas, shuning uchun arxivdan tiklangan
  o'quvchida darhol ketish yo'q; arxivlash yopgan guruh yozuvi odatdagi 21
  kunlik qoidadan o'tadi.
- Guruh o'chirilganda (`deletedAt`) uning yozuvlari ochiq qoladi; yuklovchi
  ularni o'chirilgan paytda yopilgan deb o'qiydi. O'shanda `ACTIVE` yoki
  `FROZEN` bo'lgan yozuv shu yerda tugaydi (odatdagi 21 kunlik `LEFT_GROUP`),
  undan keyin yozilgan hech narsa guruhda bo'lish sanalmaydi. Davr boshida
  guruhda bo'lganlar ham shu qoida bilan sanaladi.
- Holat jurnali (`EnrollmentStateLog`) paydo bo'lishidan oldin (2026-04-26
  gacha) ochilgan yozuvlarning jurnali yopilish yoki muzlatishdan boshlanadi:
  ochilishdagi `ACTIVE` qatori yozilmagan (2026-09-25 o'lchovi: 369 ta
  yozuv). Yuklovchi bunday yozuvga yetishmayotgan `ACTIVE` qatorini yozuv
  yaratilgan paytga (`createdAt`) qo'shadi — aks holda o'quvchi hech qachon
  guruhda bo'lmagandek o'qilib, ketishi yo'qolardi. Birinchi qatori aynan
  yaratilgan paytda bo'lgan yozuvga hech narsa qo'shilmaydi.
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
- **Ikkala to'xtashga bitta muddat (21 kun)** — muzlatilib qaytganlarning
  faqat 71,6% i 21 kun ichida qaytgan; qolganlari ketgan bo'lib sanalardi.
- **`StudentDeparture` jadvali + cron** — migratsiya, eski ma'lumotni to'ldirish
  va 5 dan ortiq yozish joyi; bittasi unutilsa son jimgina kamayadi.

## Oqibatlari

**Yutuq:** bir oy — bir son (sahifa va karta); qaytish muddati ichidagilar
«kutilmoqda» — qo'ng'iroq qilinadigan ro'yxat.

**Narx:** muzlatish 60 kun kutilgani uchun oy natijasi 60 kundan keyingina
yakunlanadi: dinamikada joriy oydan tashqari oxirgi ikki oy ham dastlabki
ko'rinadi.
Muzlatilgan o'quvchini to'g'ridan-to'g'ri chetlatish (`FROZEN → EXPELLED`)
2026-09-25 da CEO qarori bilan ruxsat etildi (PR #564). Muzlatish bilan
chetlatish orasida qaytish bo'lmagani uchun bu bitta ketish — muzlatilgan
oyda sanaladi. Bungacha o'quvchi avval faollashtirilardi, shuning uchun
muzlatish muddatidan (60 kun) uzun muzlatishdan keyingi chetlatish ikki
marta sanalardi. Prodda bunday holat bo'lmagan (2026-09-26: 10 ta
«faollashtirib chetlatish» holatida eng uzun muzlatish 17,9 kun).
«O'quvchilar oqimi» (Excel «Xulosa» va «O'quvchilar» varaqlari ham) va
Telegram 21:00 **ataylab** o'zgartirilmadi: ular boshqa savolga javob beradi
(status o'tishlari; bugungi xom hodisalar). Oqim diagrammasining «Batafsil»
havolasi boshqa son ko'rsatadigan sahifaga olib boradi.

**Endi taqiqlangan:** «ketgan» sonini `departure-episodes.ts` va
`departures.loader.ts` dan tashqarida hisoblash.
