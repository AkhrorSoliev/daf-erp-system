# B to'plami, 7d-qism: «Bot hisoboti»

**Sana:** 2026-10-17
**Maket:** https://claude.ai/artifact/YA4jhqf4NH8ZrqnBbjB9UL (`v-bot`; CEO tasdiqlagan, 17.10 qarorlari bilan to'ldirildi)
**ADR:** 0104 (shu PR'da; PR ochishdan oldin `docs/adr/README.md` tekshiriladi, raqam band bo'lsa keyingisi olinadi)
**Bog'liq:** ADR-0103 (7c, "bitta ma'lumot to'plami" qoidasi), ADR-0067 (hisobotlar bazasi 2026-05), `docs/superpowers/specs/2026-10-17-b7c-davomat-design.md`

7-qism to'rt hisobotdan iborat. Bu hujjat oxirgisi. 7a, 7b, 7c saytda. Bu qismda sahifaning ko'rinishi deyarli o'zgarmaydi: **hisob tuzatiladi.**

## 1. Maqsad

Sahifa bitta savolga javob beradi: **botning kanalga a'zolik talabi nechta odamni kanalga olib keldi.** Hozirgi hisob (`TelegramChannelGateStatsService.getSummary`) har raqamni o'z hodisasi sanasi bilan sanaydi: to'xtatilganlar `blockedAt`, a'zo bo'lganlar `joinedAt`, chiqib ketganlar `leftAt` tanlangan oyda bo'lsa. Natijada:

- Avgustda to'xtatilib, sentabrda a'zo bo'lgan odam sentabrning "a'zo bo'ldi"siga qo'shiladi, "to'xtatdi"siga qo'shilmaydi. Foiz = a'zo bo'ldi ÷ to'xtatdi 100% dan oshib ketishi mumkin.
- "Keyin chiqib ketdi" ham shu sababli aralashadi: oyda `leftAt` bor odam boshqa oyda to'xtatilgan bo'lishi mumkin, uch raqam bir-biriga bog'lanmaydi.
- Ro'yxat oy filtrini umuman olmaydi: tepada sentabr, pastda butun davr.

## 2. CEO qarorlari

Maketdan: sahifa bitta **kohort**ni ko'rsatadi: tanlangan oyda bot to'xtatgan odamlar. Hamma raqam shu odamlar bo'yicha. Pastdagi ro'yxat ham shu oyga filtrlanadi.

17.10.2026 (dizayn tasdig'i):
- **«A'zo bo'ldi» hozirgacha sanaladi**, oy oxirigacha emas: avgustda to'xtatilgan odam sentabrda a'zo bo'lsa, u **avgustning** a'zo bo'lganiga qo'shiladi. Avgust raqami keyinroq o'sishi mumkin, 100% dan oshmaydi.
- **Olib tashlanadi:** «o'zi qo'shilgan» (`organicJoins`) va «hozir ham a'zo» (`stillMemberViaGate`) kartalari. Maketda yo'q.
- **«Butun davr» tugmasi olib tashlanadi.** Boshqa 7-qism sahifalaridagidek `MonthStepper`, default joriy Toshkent oyi, eng erta oy 2026-05.

## 3. Hisob qoidalari (hammasi shu yerda)

**Manba — `TelegramChannelGateEvent` qatorlari** (kompaniya bo'yicha, filial yo'q: kanal bitta).

**Kohort:** `blockedAt` tanlangan Toshkent oyida: `tashkentMonthRangeUtc(oy)`, `gte` oy boshi, `lt` keyingi oy boshi (eksklyuziv). `blockedAt` bo'sh qatorlar (to'siqsiz o'zi kelganlar) kohortga kirmaydi.

**Qator holati — bitta sof funksiya `classifyGateRow(row)`** (`blockedAt` bor qator uchun):

| Holat | Qoida | Ma'nosi |
| --- | --- | --- |
| `waiting` | `joinedAt` yo'q, yoki `joinedAt < blockedAt` va `leftAt` bor | to'xtatilgan, kanalda emas |
| `joined` | `joinedAt` bor va `leftAt` yo'q | to'xtatilgandan keyin a'zo bo'ldi (yoki qaytdi), hozir ham a'zo |
| `left` | `joinedAt >= blockedAt` va `leftAt` bor | to'xtatilgandan keyin a'zo bo'ldi, keyin chiqib ketdi |

`joinedAt < blockedAt` holati: odam botga yozmasdan oldin kanal a'zosi edi, chiqib ketdi, keyin bot to'xtatdi (`recordBlocked` `leftAt` yozadi, `blockedAt`ni qo'yadi). Qayta a'zo bo'lsa `recordJoined` `joinedAt`ni **o'zgartirmaydi** (birinchi sana qoladi), faqat `leftAt`ni tozalaydi. Shuning uchun u `leftAt` bo'yicha hal qilinadi: `leftAt` yo'q bo'lsa qaytgan (`joined`), bor bo'lsa hali tashqarida (`waiting`).

**Uch raqam (kohort bo'yicha):**
- `blocked` = kohort soni.
- `joined` = `joined` + `left` soni (to'xtatilgandan keyin a'zo bo'lganlar).
- `left` = `left` soni (a'zo bo'lganlardan chiqib ketganlar).
- `conversionRate` = `blocked > 0 ? round(joined / blocked * 100) : 0`. `joined ≤ blocked` qurilmaning o'zidan, shuning uchun 100% dan oshmaydi.

**Bugungi holat (oyga bog'liq emas, `blockedAt` bor hamma qator):**
- `waiting` = `waiting` holatidagilar soni.
- `channelMembers` = Telegram'dan jonli (`getChannelMemberCount`), o'zgarmaydi.

**Ro'yxat:** kohort qatorlari (shu oy), `blockedAt` kamayish tartibida, har qatorga `state` (`waiting|joined|left`) server bergan holda. Mijoz holatni o'zi hisoblamaydi. Sahifalash 10–50, default 10.

## 4. Server

`TelegramChannelGateStatsService` (`server/src/telegram/telegram-channel-gate-stats.service.ts`, hozir 280 qator; yangi qismni alohida faylga olamiz, 500 qatordan oshirmaymiz):
- Yangi `gate-cohort.ts`: sof `classifyGateRow`, `cohortFigures(rows)` (uch raqam + foiz), `waitingNow(rows)`. Bazaga tegmaydi.
- `getSummary(oy)`: kohort qatorlarini bir marta o'qiydi (`blockedAt` shu oyda; faqat `blockedAt`, `joinedAt`, `leftAt` ustunlari), bugungi `waiting` uchun `blockedAt` bor qatorlarni bir marta o'qiydi, hisobni `gate-cohort.ts`ga topshiradi. Bir oyda yuzlab qator: xotirada hisoblash yetarli (`// ponytail:` bilan, o'sib ketsa SQL `groupBy`).
- `getList({ month, page, pageSize })`: kohort bo'yicha, `state` bilan.
- `recordBlocked`, `recordJoined`, `recordLeft` o'zgarmaydi.

`TelegramChannelReportController` (`GET /telegram/channel-report/summary|list`): `month` (`YYYY-MM`) ikkala so'rovda. Berilmasa joriy Toshkent oyi (`tashkentMonthKey(new Date())`). Noto'g'ri yoki 2026-05 dan oldingi yoki kelajak oy: 400 «Bot hisoboti may 2026 dan boshlanadi» / «Kelajak oyni tanlab bo'lmaydi» (7c'dagi shakl). Ruxsat `reports.students` o'zgarmaydi. Javob: `{ blocked, joined, left, conversionRate, waiting, channelMembers, gateEnabled, channel, month }`; `organicJoins`, `stillMemberViaGate` olib tashlanadi, `joinedViaGate` → `joined`, `leftAfterJoin` → `left`. Migratsiya va skript yo'q.

## 5. Klient

`client/src/components/reports/bot/`: `bot-report-client.tsx` (240 qator) va `bot-report-table.tsx` (194 qator) maket bo'yicha qayta yoziladi; ikkala fayl 300 qatordan oshmaydi.
- Sarlavha «Bot hisoboti» + `MonthStepper` (`?oy=YYYY-MM`, bo'sh = joriy oy; eski `?month=` o'qilmaydi).
- 1-karta «{Oy}da bot to'xtatgan odamlar»: «Bot to'xtatdi», «Shulardan a'zo bo'ldi» (foiz bilan), «Keyin chiqib ketdi», izoh: «Hammasi shu oyda to'xtatilganlar bo'yicha».
- Tinch karta «Bugungi holat»: «Kanal a'zolari», «Hali a'zo bo'lmagan (kutilmoqda)».
- «Kanal a'zoligi tekshiruvi o'chiq» ogohlantirishi (`gateEnabled=false`) qoladi.
- Ro'yxat: `#`, Telegram, «Bot to'xtatdi», «A'zo bo'ldi», «Chiqib ketdi», Holat (server `state`: «Kutilmoqda», «A'zo», «Chiqib ketgan»). Sahifalash 10–50, `PaymentsPager`.
- Holat so'rovsiz bo'sh holat chizilmaydi: yuklanmoqda — skelet, xato — «Qayta urinish».
- Sahifaning `page.tsx` (`Suspense`) o'zgarmaydi. Nav va yo'l nomi o'zgarmaydi.
- Sof formatlash (`bot-report-format.ts`, vitest): «70%», holat yorlig'i, oy sarlavhasi.

## 6. Hujjatlar

ADR-0104 (kohort qoidasi, nega oy-oyma-oy sana emas, `joinedAt` birinchi sana ekani), `docs/adr/README.md` qatori, qo'llanma sahifasi `client/src/qollanma/kontent/hisobotlar/bot-hisoboti.mdx` (yo'q bo'lsa yaratiladi, reyestr bilan) va `yangiliklar.ts` yozuvi, CONTEXT.md'da «bot to'xtatgan kohort» termini, `server/CLAUDE.md` va `client/CLAUDE.md`da qisqa bo'lim. Barcha UI matnlari o'zbekcha lotin; `uzbek-only-texts.test.ts` papkani qamrasin.

## 7. Testlar

- `gate-cohort.spec.ts`: boshqa oyda to'xtatilib shu oyda a'zo bo'lgan odam foizni oshirmaydi; `joined ≤ blocked` har qanday kirishda (xossa testi); `joinedAt < blockedAt` ikki holati (`leftAt` bor/yo'q); chiqib ketgan va qayta kirgan; bo'sh oy 0%; oy chegarasi (Toshkent 00:00, oxirgi kecha keyingi oyga).
- Servis spec: `blockedAt` bo'sh qatorlar kohortga kirmaydi; ro'yxat va kartalar bir xil kohortdan (karta soni = ro'yxat `total`).
- Kontroller spec: marker (`routeAccess`), `month` tekshiruvi, default oy.
- Klient: `bot-report-format.test.ts`, `bot-report-url.test.ts`, `uzbek-only-texts.test.ts` (papka qamrovi). Klient testlari DOM'siz (node); sahifa holatlari (yuklanmoqda, xato, bo'sh oy, kanal tekshiruvi o'chiq) soxta API bilan brauzerda tekshiriladi.

## 8. Cheklovlar

- `joinedAt` — birinchi a'zolik sanasi, qayta kirishlarning sanasi saqlanmaydi (`rejoinCount` faqat soni). Shuning uchun "oy ichida a'zo bo'ldi" degan savolga bu hisobot javob bermaydi; u faqat kohortning hozirgacha natijasini ko'rsatadi.
- Kohort hisobi `blockedAt` birinchi to'siq sanasiga tayanadi (`recordBlocked` uni qayta yozmaydi). Gate yoqilishidan oldingi odamlar yo'q: ma'lumot yig'ish boshlanganidan keyingi oylar to'liq.
- Kanal a'zolari soni Telegram'dan jonli; API javob bermasa «—».
