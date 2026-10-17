# ADR-0105: Bot hisoboti — tanlangan oyda to'xtatilgan odamlar kohorti

**Holati:** Qabul qilindi
**Sana:** 2026-10-17
**Bog'liq:** spec `docs/superpowers/specs/2026-10-17-b7d-bot-hisoboti-design.md`, ADR-0103 (7c, bitta ma'lumot to'plami), ADR-0067 (hisobotlar bazasi 2026-05)

## Kontekst

`/reports/bot` botning kanalga a'zolik talabi nechta odamni kanalga olib kelganini ko'rsatadi. Eski hisob (`TelegramChannelGateStatsService.getSummary`) har raqamni o'z hodisasi sanasi bo'yicha sanardi: to'xtatilganlar `blockedAt`, a'zo bo'lganlar `joinedAt`, chiqib ketganlar `leftAt` tanlangan oyda bo'lsa. Avgustda to'xtatilib sentabrda a'zo bo'lgan odam sentabrning «a'zo bo'ldi»siga qo'shilar, «to'xtatdi»siga qo'shilmasdi, shuning uchun foiz 100% dan oshishi mumkin edi. Pastdagi ro'yxat oy filtrini umuman olmasdi.

## Qaror

1. **Kohort** — `blockedAt` tanlangan Toshkent oyida (`tashkentMonthRangeUtc`, yuqori chegara eksklyuziv) bo'lgan qatorlar. `blockedAt` bo'sh qatorlar (to'siqsiz, o'zi kelganlar) kohortga kirmaydi.
2. **Uch raqam faqat kohort bo'yicha:** «Bot to'xtatdi» = kohort soni; «Shulardan a'zo bo'ldi» = kohortdan to'xtatilgandan keyin a'zo bo'lganlar (hozirgacha, oy oxirigacha emas); «Keyin chiqib ketdi» = a'zo bo'lganlardan chiqib ketganlar. Foiz = a'zo bo'ldi ÷ to'xtatdi, qurilmaning o'zidan 100% dan oshmaydi.
3. **Qator holati bitta funksiyadan** (`classifyGateRow`, `server/src/telegram/gate-cohort.ts`): `waiting` | `joined` | `left`. `joinedAt` — birinchi a'zolik sanasi; `recordJoined` qaytib kirganda uni o'zgartirmaydi, faqat `leftAt`ni tozalaydi. Shuning uchun botga yozishdan oldin kanal a'zosi bo'lib, chiqib ketgan, keyin to'xtatilgan odam (`joinedAt < blockedAt`) `leftAt` bo'yicha hal qilinadi: `leftAt` yo'q — qaytgan (`joined`), bor — hali tashqarida (`waiting`).
4. **Bugungi holat** (`waiting`, kanal a'zolari) oyga bog'liq emas: to'xtatilgan va hozir kanalda bo'lmagan hamma qatorlar, va Telegram'dan jonli son.
5. **Ro'yxat ham kohort:** karta soni = ro'yxat `total`; har qatorning `state`i serverdan, mijoz holatni o'zi chiqarmaydi.
6. **Davr:** `?month=YYYY-MM`, bo'sh = joriy oy, 2026-05 dan oldin va kelajak 400. «Butun davr» yo'q: kohortda u ma'nosiz.
7. **Olib tashlandi:** «o'zi qo'shilgan» (`organicJoins`) va «hozir ham a'zo» (`stillMemberViaGate`). Yo'llar (`/telegram/channel-report/summary|list`), ruxsat (`reports.students`) va yozuv metodlari (`recordBlocked`, `recordJoined`, `recordLeft`) o'zgarmadi. Migratsiya va skript yo'q.

## Ko'rib chiqilgan muqobillar

- **Eski hisobni tuzatish (har raqam o'z sanasi bilan, foizni cheklash)** — raqamlar bir-biriga bog'lanmay qoladi; foizni 100 ga qirqish xatoni yashiradi. Rad.
- **«A'zo bo'ldi» faqat oy ichida** — `joinedAt` faqat birinchi sana, qayta kirishlarning sanasi saqlanmaydi; oy ichidagi a'zolikni to'g'ri sanab bo'lmaydi. Rad.
- **`joinedAt >= blockedAt`ni qat'iy shart qilish** — botga yozishdan oldin a'zo bo'lib, keyin qaytgan odamni yo'qotadi. Rad.

## Oqibatlari

- Oy raqami keyinroq o'sishi mumkin: avgustda to'xtatilgan odam sentabrda a'zo bo'lsa, avgust hisoboti o'zgaradi (kohortning hozirgacha natijasi).
- Har so'rovda `blockedAt` bor hamma qatorlar bir marta o'qiladi va xotirada sanaladi (kanalda ming-ikki ming qator). Jadval o'ssa SQL `groupBy` (`// ponytail:`).

## Ma'lum cheklovlar

- «Oy ichida nechta odam a'zo bo'ldi» degan savolga bu hisobot javob bermaydi.
- Gate yoqilishidan oldingi odamlar hisobda yo'q: ma'lumot yig'ish boshlanganidan keyingi oylar to'liq.
- Kanal a'zolari soni Telegram'dan jonli; javob bermasa «—».
- `joinedAt` faqat birinchi sana bo'lgani uchun a'zo bo'lib, chiqib ketgan, to'xtatilgan, qaytib kirgan va yana chiqib ketgan odam (`joinedAt < blockedAt`, `leftAt` to'xtatishdan keyin) `waiting` deb sanaladi: «a'zo bo'ldi» va «chiqib ketdi» bu holatda kam sanalishi mumkin.
