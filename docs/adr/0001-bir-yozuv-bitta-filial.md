# ADR-0001 — Har bir yozuv aniq bitta filialga tegishli

**Holati:** Qabul qilindi
**Sana:** 2026-07-29
**Bog'liq:** [docs/branch-decisions.md](../branch-decisions.md) (D1–D8, CEO qarorlari), ADR-0002, ADR-0003

## Kontekst

Filial #2 «Namangan filiali» ishga tushirilayotgan edi. Tizim bir filialga mo'ljallab qurilgan: o'quvchi, ustoz, xarajat, kassa — hammasi kompaniya darajasida edi.

Ikki filialga o'tishda asosiy savol: **nima ajratiladi, nima umumiy qoladi?** Agar biror narsa umumiy qolsa, «Namangan filiali qancha foyda keltirdi?» degan savolga hech qachon aniq javob bo'lmaydi — har safar taqsimlash koeffitsiyenti haqida bahs chiqadi.

## Qaror

Har bir yozuv — o'quvchi, ustoz, guruh, to'lov, xarajat, oylik — **aniq bitta filialga** tegishli. Kompaniya darajasidagi («markaz») pul yozuvi tushunchasi mavjud emas.

Bundan kelib chiqadigan qoidalar:

- **Filiallararo pul yo'q.** Bir filialda to'langan pul boshqa filialning qarzini yopmaydi, darsini qoplamaydi, kitobiga tushmaydi
- **Oylik darsning ortidan yuradi.** Ustoz haqi dars o'tilgan guruhning filialiga yoziladi
- **O'quvchi bir vaqtda bitta filialda.** Ustoz ham bitta filialda
- **Umumiy xarajat yo'q.** Ikki filialga tegishli xarajat (masalan reklama) **ikki alohida qator** bo'lib kiritiladi, nisbatni CEO qo'lda belgilaydi
- Har bir filial foydasi: `o'z tushumi − o'z xarajati − o'z oyligi`

**Yagona istisno — CEO.** CEO barcha filiallarni ko'radi. `branchIds` shuning uchun ataylab ixtiyoriy.

## Ko'rib chiqilgan muqobillar

**Umumiy xarajatni avtomatik taqsimlash** (o'quvchi soni yoki tushum nisbatida). Rad etildi: koeffitsiyent tanlovi har oy bahsga aylanadi va hisobotni auditga yaroqsiz qiladi. CEO qo'lda ikki qator kiritgani — kamroq kod, ko'proq aniqlik.

**Ustoz bir nechta filialda dars berishi.** Rad etildi. Bu `SalaryPayment` ni filiallar orasida bo'lishni talab qilardi — rejadagi eng og'ir texnik ish. «Ustoz bitta filialda» qoidasi bu ishni **butunlay olib tashladi**.

**O'quvchini filialdan filialga ko'chirish oqimi.** Hozircha qurilmaydi. Tizim faqat «bitta o'quvchi = bitta filial» qoidasini majburiy qiladi; ko'chirish kerak bo'lsa alohida ish sifatida qilinadi. Shu sababli balans/qarz/oldindan to'langan darslar ko'chishi bo'yicha qoida yozish shart emas.

## Oqibatlari

**Yutuq:** har bir filialning P&L'i o'z-o'zidan yig'iladi, taqsimlash koeffitsiyentisiz. Oylikni filiallar orasida bo'lish kodi umuman yozilmadi.

**Narx:** ko'chirish oqimi yo'q — o'quvchi filial almashtirsa qo'lda aralashuv kerak. Umumiy xarajat ikki marta kiritiladi.

**Endi taqiqlangan:** filialsiz pul yozuvi yaratish. Filial noma'lum bo'lsa — ADR-0002 ga qarang, u hech narsa emas, hammasi emas.
