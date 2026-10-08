# Lidlar sahifasi — tepadagi statlar

Sana: 2026-10-08. Holat: CEO ko'rinishni ma'qulladi (chatda maket, 5 karta).

## Maqsad

`/leads` ochilganda doska ustida 5 ta raqam turadi. Ular admin uchun ikki
savolga javob beradi: "hozir nima qilishim kerak?" va "oqim qanday ketyapti?".

Voronka (lid → guruh → dars → to'lov) bu yerda takrorlanmaydi: u bosh sahifada
va «Hisobotlar → Lidlar» da bor.

## Ko'rinish

Doska tugmalari qatori bilan filtr qatori orasida bitta qator.

| Guruh | Karta | Asosiy raqam | Ostidagi qator |
| --- | --- | --- | --- |
| Hozir | Doskada | doskadagi lidlar | «ustunlarda kutyapti» |
| Hozir | Qo'ng'iroq qilinmagan (to'q sariq) | qo'ng'iroq belgisiz lidlar | «N tasi 7 kundan ortiq» |
| Davr | Yangi lidlar | davrda doskaga tushgan lidlar | eng ko'p 2 manba: «Tanishlar 70 · Instagram 37» |
| Davr | O'quvchi bo'ldi (yashil) | davrda o'quvchiga aylangan | «guruhga qo'shildi» |
| Davr | Yo'qotildi | davrda yo'qotilgan deb arxivlangan | «arxivga o'tdi» |

«Davr» guruhining o'ng tepasida uchta tugma bor: «Bu hafta», «Shu oy»
(standart) va «O'tgan oy». Tanlov URL'da `?period=week|last-month` bo'lib
saqlanadi. Standart qiymat («Shu oy») URL'ga yozilmaydi.

Raqamlar tepadagi filial tanlovi bo'yicha o'zgaradi. Telefonda kartalar 2
ustunga o'raladi.

Faqat «Qo'ng'iroq qilinmagan» kartasini bosish mumkin. U `?holati=NEW,uncalled`
filtrini qo'yadi: bu mavjud «Yangi + Aloqaga chiqilmagan» ro'yxati, va undagi
qatorlar soni kartadagi raqamga teng. Qolgan kartalarni bosib bo'lmaydi.
Sababi: mavjud ro'yxat filtri ular sanaydigan to'plamni aniq bera olmaydi.
Masalan, sana filtri arxivlangan lidlarni ko'rsatmaydi, «O'quvchiga aylangan»
filtri esa doskaga hech tushmagan bot lidlarini ham oladi.

## Ta'riflar

**Doska lidi** — `sectionId` bo'sh bo'lmagan lid. `/students`, Telegram bot va
mock imtihon orqali o'zi kelgan o'quvchilarning lidi bo'limsiz yoziladi
(`student-lead-origin.service.ts`) va darhol CONVERTED bo'ladi. Ular doskada
bir soniya ham turmaydi. Ular sanalsa, «O'quvchi bo'ldi» soni sun'iy oshadi:
prodda 10.09 dan beri botdan kelgan 126 kishi bor, 126 tasi ham «aylangan».

Filial predikati hamma joyda `leadBranchWhere(scope)` — doska va ro'yxat ham
shuni ishlatadi, shuning uchun raqamlar ular bilan mos keladi.

| Raqam | Predikat |
| --- | --- |
| Doskada | `deletedAt: null`, `sectionId ≠ null`, `statusEnum ≠ CONVERTED`. Bu doskaning ustun sonlari predikatining o'zi: `activeBoardLeadWhere` bitta yordamchi bo'lib chiqariladi, `LeadsBoardService` ham shuni ishlatadi |
| Qo'ng'iroq qilinmagan | Doskada + `calledAt: null` |
| … 7 kundan ortiq | Qo'ng'iroq qilinmagan + `createdAt < hozir − 7 kun` |
| Yangi lidlar | `sectionId ≠ null`, `createdAt` davr ichida. `deletedAt` va bosqichga qaralmaydi: keyin yo'qotilgan lid ham shu davrda kelgan |
| Manbalar | Yangi lidlar `sourceId` bo'yicha guruhlanadi. Eng katta 2 tasi olinadi, manbasiz qator olinmaydi |
| O'quvchi bo'ldi | `sectionId ≠ null`, `statusEnum = CONVERTED`, `statusChangedAt` davr ichida |
| Yo'qotildi | `sectionId ≠ null`, `statusEnum = LOST`, `statusChangedAt` davr ichida. `remove()` LOST ni `statusChangedAt` bilan birga yozadi. Arxivdan qaytarilgan lid LOST emas, shuning uchun u sanalmaydi |

Prodda tekshirildi (08.10): doskadagi aylanmagan lidlarning hammasi `NEW`,
shuning uchun `NEW + uncalled` ro'yxati «Qo'ng'iroq qilinmagan» bilan bir xil
(84 = 84).

**Davr chegaralari** serverda, Toshkent vaqtida hisoblanadi
(`common/date/tashkent`). Yuqori chegara ochiq (`lt`):

- `week` — dushanba 00:00 dan ertangi kun 00:00 gacha.
- `month` — oyning 1-kunidan ertangi kun 00:00 gacha.
- `last-month` — o'tgan oyning 1-kunidan joriy oyning 1-kunigacha.

## Backend

`GET /leads/stats?period=week|month|last-month`. Bu yo'l `LeadsController`
da, `':id'` dan oldin e'lon qilinadi. Ruxsat sinf darajasidagi bilan bir xil:
CEO, Branch Director, Administrator. Filial `@BranchScope()` dan olinadi.
`LeadStatsQueryDto` da `period` ixtiyoriy, `@IsIn`, standarti `month`.

Yangi `LeadsStatsService` (`leads-stats.service.ts`) `LeadsService` ni
kattalashtirmaslik uchun alohida fayl. Ichida 7 ta so'rov `Promise.all` bilan
yuboriladi: 6 ta `count` va manbalar uchun 1 ta `groupBy`. Keyin 2 ta manbaning
nomi bitta `findMany` bilan o'qiladi.

```ts
{
  now: { onBoard: number; uncalled: number; uncalledOverWeek: number };
  flow: {
    created: number;
    topSources: { name: string; count: number }[]; // ko'pi bilan 2 ta
    converted: number;
    lost: number;
  };
}
```

Yozish yo'q, migratsiya yo'q, ADR shart emas.

## Frontend

`components/leads/leads-stats-strip.tsx` faqat ko'rsatadi. So'rovni
`hooks/use-lead-stats.ts` yuboradi. Bu React Query, kaliti
`["leads", "stats", branchId, period, revision]`. Bu yerda `revision` —
`useLeadsBoard` hisoblagichi: lid qo'shilganda, tahrirlanganda (qo'ng'iroq
belgisi va aylantirish ham), ko'chirilganda yoki o'chirilganda u o'zgaradi va
raqamlar qayta o'qiladi.

`leads-board-client.tsx` tugmalar qatori ostida chiziqni chizadi. `period`
`LEAD_FILTER_SCHEMA` ga kirmaydi, shuning uchun u doskani ro'yxatga
almashtirmaydi.

Yuklanayotganda kartalar o'rnida 5 ta `Skeleton` turadi. Xato bo'lsa chiziq
jim yashiriladi: doska raqamsiz ham ishlaydi, xuddi bosh sahifadagi voronka
qatori kabi. Ekrandagi matnlar faqat o'zbekcha, inglizcha so'z yo'q.

## Testlar

- `leads-stats.service.spec.ts`: har bir raqam o'z predikati bilan so'raladi
  (bo'limsiz lid chiqarib tashlangan, filial predikati bor). Uchala davrning
  chegaralari tekshiriladi, shu jumladan oy boshidagi 00:00–05:00 Toshkent
  oralig'i. Manbalar ko'pi bilan 2 ta, manbasiz qator yo'q.
- `leads.controller.spec.ts`: `stats` yo'li rollari va noto'g'ri `period` → 400.
- `leads-board.service.spec.ts`: umumiy yordamchiga o'tgandan keyin ham shu
  natija.
- Klient (vitest, sof funksiyalar): URL ↔ davr o'qilishi va karta havolasi
  (`holati=NEW,uncalled`).
- Brauzerda lokal tekshiruv, so'ng deploydan oldin CEO ga skrinshot.

## Kiritilmadi

- **Foiz** («28 / 120»). Bu ikki raqam har xil kohortalarga tegishli,
  shuning uchun bunday foiz yolg'on chiqadi. Foiz voronka sahifasida bor.
- **Yo'qotish sababi.** Sabab erkin matn: «bog'lana olmadik» va
  «boglana olmadik» alohida sanaladi. Avval sabablar ro'yxati kerak.
- **Ustun bo'yicha sonlar.** Ular ustun sarlavhasida allaqachon bor.
- **«Oraliq» davri.** CEO so'rasa qo'shiladi.

## Yangilanish (08.10, CEO savolidan keyin)

Endi hamma karta bosiladi. Davr kartalari `GET /leads?card=created|converted|lost&period=…`
ro'yxatini ochadi: server kartani sanagan shartning o'zini (`statCardWhere`) ishlatadi,
shuning uchun ro'yxatdagi son kartadagi bilan teng. Arxivdagi lidlar ham chiqadi —
«Yo'qotilgan» / «Arxivda» belgisi bilan, amallarsiz. Karta bosilganda boshqa filtrlar
tozalanadi; «Doskada» doskaga qaytaradi.
