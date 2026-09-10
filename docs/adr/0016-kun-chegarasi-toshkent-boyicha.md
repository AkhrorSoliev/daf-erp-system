# ADR-0016 — Kun chegarasi Toshkent bo'yicha, ustun tipiga qarab

**Holati:** Qabul qilindi
**Sana:** 2026-09-10
**Bog'liq:** ADR-0003 (route siyosati manifesti), ADR-0006 (oylik yagona manba), ADR-0015 (faol o'quvchi manifesti), `server/src/common/date/tashkent.ts`

## Kontekst

O'quvchi #10652 Click orqali 50 000 so'm to'ladi. Chekda: **06.08.2026, 00:18:46**.
Bazada: `2026-08-05T19:18:44Z`. Ikkalasi ham to'g'ri — markaz Toshkentda
(UTC+5), baza esa UTC saqlaydi.

Lekin `/reports/student-payments?startDate=2026-08-05&endDate=2026-08-05`
filtri o'sha to'lovni **05.08** da ko'rsatdi, jadvalning sana ustuni esa o'sha
qatorda **06.08** deb yozdi — chunki ustun brauzerning Toshkent soatida
chiziladi. Bitta qator, ikkita sana.

Sabab bir qatorlik edi:

```ts
where.createdAt.gte = new Date(params.startDate); // 00:00 UTC = 05:00 Toshkent
const end = new Date(params.endDate);
end.setHours(23, 59, 59, 999); // jarayon vaqt mintaqasida
```

`new Date('2026-08-05')` — bu 00:00 **UTC**. Ya'ni «05.08» filtri amalda
05.08 soat 05:00 dan 06.08 soat 04:59 gacha ishlagan. Ikki tomonlama xato:
kechqurun 19:00 dan keyingi to'lov oldingi kunga tushadi, ertalab 05:00
gacha bo'lgani esa o'z kunida umuman ko'rinmaydi. `setHours` esa jarayonning
vaqt mintaqasida ishlaydi — bir xil kod UTC konteynerda, Toshkent serverida va
dasturchining noutbukida uch xil javob beradi.

Naqsh nusxalanib ketgan edi. Qidiruv 20 dan ortiq faylni topdi: to'lovlar,
tranzaksiyalar, kassa harakatlari, lidlar, ketgan o'quvchilar, o'qituvchi
almashuvi, moliyaviy hisobotlar, Telegram kanal sanagichi.

Bu ADR-0006 dagi darsning aynan takrori. O'sha yerda oylik davri chegarasi
Toshkentga surilgan **timestamp** bilan `@db.Date` ustunga solishtirilgan edi;
Postgres timestamp'ni UTC kalendar sanasiga kesadi, natijada oyning oxirgi
kuni **ikkala** davrga tushib, iyul oyligini 1 819 343 so'mga shishirgan.

## Qaror

**Kun chegarasi bitta modulda — `server/src/common/date/tashkent.ts`.**
U ikki xil chegarani ATAYIN ajratadi, chunki to'g'ri javobni ustun tipi
belgilaydi:

| Ustun tipi  | Misol                                                               | Yordamchi                                                        |
| ----------- | ------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `timestamp` | `Payment.createdAt`, `Enrollment.statusChangedAt`, `Lead.createdAt` | `tashkentRangeUtc`, `tashkentRangeFilter`, `tashkentDayStartUtc` |
| `@db.Date`  | `Attendance.date`, `Expense.date`, `SalaryAccrual.lessonDate`       | `utcMidnightFromDateStr`                                         |

Yuqori chegara har doim **chegaradan tashqari** (`lt`), `lte` emas: qo'shni
kunlar orasida na bo'shliq, na ustma-ustlik qoladi.

`attendance/shared/date-utils.ts` endi shu moduldan re-eksport qiladi — eski
import yo'llari ishlayveradi, lekin ortida bitta amal turadi.

**Qorovul.** `common/date/tashkent.single-source.spec.ts` manbani skanerlab,
to'rtta naqshni taqiqlaydi va build'ni yiqitadi:

1. `setHours(23, 59, 59, ...)` — jarayon vaqt mintaqasini o'qiydi;
2. `'T23:59:59.999Z'` literali — Toshkentda ertangi kun soat 04:59;
3. sana-satr maydonidan to'g'ridan-to'g'ri `new Date(query.startDate)`;
4. bitta filtrda `gte: p.start` bilan `lte: p.endDate` aralashmasi — ya'ni
   timestamp chegarasi `@db.Date` ustunga berilishi (ADR-0006 dagi xato).

Qoidalar ishlab chiqarish kodiga tegishli; `.spec.ts` fayllar chetlab
o'tiladi, chunki test kutayotgan chegarani ochiq yozishi mumkin.

## Oqibatlari

**Yaxshi.** Hisobotdagi sana endi chekdagi sana bilan bir xil. Kalendar oyi
bo'yicha filtr oyning oxirgi kechasini keyingi oyga qo'yib yubormaydi.
Testlar UTC va Asia/Tashkent mintaqalarida bir xil o'tadi.

**Narxi.** `resolvePeriod` ning `start` maydoni endi Toshkentga surilgan
nuqta, shuning uchun `@db.Date` ustunlar uchun yangi `startDate` maydoni
qo'shildi — bu ikkitasini almashtirish jimgina noto'g'ri javob beradi, va
aynan shuni 4-qoida ushlaydi.

**Qamrovdan tashqarida.** `America/New_York` da 4 ta test yiqiladi
(telegram-groups digest/broadcast, attendance getStats). Ular bu
o'zgarishdan oldin ham yiqilardi va prod UTC'da yuradi — alohida ish.
