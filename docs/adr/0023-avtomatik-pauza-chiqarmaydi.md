# ADR-0023 — Avtomatik pauza o'quvchini guruhdan chiqarmaydi

**Holati:** Qabul qilindi
**Sana:** 2026-09-19
**Bog'liq:** ADR-0002 (fail-closed qamrov), ADR-0008 (ro'yxatdan o'tish aktori oshkora), `server/src/absence-pause/`, `server/src/outreach/absence-streak.service.ts`, `server/src/students/students-status.service.ts`

## Kontekst

Kelmagan dars ham **hisoblanadi**: «dars o'tdi = dars to'landi» qoidasi
bo'yicha `ABSENT` ham o'quvchining paketidan dars yechadi va ustozga oylik
yozadi (`billing/lesson-billing.service.ts` dagi `BILLABLE`). O'quvchi
kelishni to'xtatgandan keyin ham bu hisoblagich ishlab turadi: unga qarz
yozilaveradi, balansi yetmasa esa ustoz oyligini **markaz o'z cho'ntagidan**
qoplaydi (`isCenterTopUp` accrual).

Prod o'lchovi, oxirgi 90 kun (2026-06-21 dan, `companyId=1001`):

| Holat | Darslar | Ustoz oyligi | Markaz qoplagani | Qaytmagani |
|---|---:|---:|---:|---:|
| PRESENT | 11 494 | 190 006 956 | 18 499 501 | 4 086 420 |
| **ABSENT** | **2 812** | **43 320 915** | **7 711 338** | **4 294 663** |
| EXCUSED | 197 | 0 | 0 | 0 |

43,3 mln ustoz oyligining ~35,6 mln ini o'quvchilarning o'zi to'lagan.
Markazning haqiqiy zarari 7,7 mln, qaytmagani 4,3 mln — ya'ni muammo
«kelmagan o'quvchi» emas, **«kelmagan va puli yo'q o'quvchi»**.

Chegarani tanlash uchun butun tarix bo'yicha 1 808 ta «ketma-ket qoldirish
orolchasi» o'lchandi — K ta darsni ketma-ket qoldirgandan keyin o'quvchi
qaytib kelganmi:

| Ketma-ket qoldirgan | Qaytib kelgan | Qaytmagan |
|---|---:|---:|
| 2 ta | **66%** | 32% |
| 3 ta | **42%** | 55% |
| 4 ta | **23%** | 77% |

Qo'lda jarayon allaqachon ishlayapti: 90 kunda guruhdan chiqarilgan 564
o'quvchining 91% i 3 ta qoldirgunicha chiqarilgan, va hozirgi eng uzun
holat — atigi 4 ta dars. Ya'ni avtomatika buzilgan narsani tuzatmaydi —
u qo'lda bajarilayotganni kafolatlaydi va dumini ushlaydi.

## Qaror

**1. Harakat — `FROZEN`, `DROPPED` emas.** Ketma-ket chegaradan ko'p
sababsiz dars qoldirgan o'quvchi mavjud o'quvchi darajasidagi **muzlatish**
bilan pauzaga o'tkaziladi. Guruhdan chiqarish qo'lda qoladi.

**2. Yangi tushuncha kiritilmaydi.** Tizimda bitta o'quvchi bir vaqtda
faqat bitta faol yozuvga ega bo'la oladi (`enrollToGroup` mavjud faol
yozuvni ko'chirish deb yopadi; prodda 449 faol o'quvchi = 449 faol yozuv),
shuning uchun yozuv darajasidagi alohida pauza **yozilmaydi**.

**3. Tizim aktori oshkora.** `StudentsStatusService` da
`StatusChangeActor = {kind:'user', id} | {kind:'system'}`. Tizim yo'li
filial tekshiruvini va sabab ro'yxatini chetlab o'tadi, shuning uchun u
**faqat `ACTIVE → FROZEN`** ni biladi — `EXPELLED` yoki `ARCHIVED` hech
qachon avtomatik bo'lmaydi.

**4. Kunlik chegara fail-closed.** Bir yurishda pauza nomzodlari
sozlamadagi `dailyCap` dan ko'p bo'lsa — **hech kim** pauza qilinmaydi va
CEO larga xabar ketadi.

**5. Faollashtirish sanoqni noldan boshlaydi.** Sanoq oynasi
`max(enrollment.startDate ?? createdAt, statusChangedAt)` dan boshlanadi.

**6. Sozlama sukut bo'yicha O'CHIQ.** `AbsencePauseSetting.enabled`
migratsiyada `false`; yoqish — CEO ning alohida, ongli qadami.

Taqiqlanadi:

- **Chegara oshganda birinchi N tasini pauza qilish** — qaysi N tasi ekani
  tasodifiy bo'lardi.
- **Avtomatik `DROPPED`** yoki avtomatik qarz kechirish.
- **Sanoqning ikkinchi nusxasi.** `AbsenceStreakService.computeStreaks` —
  yagona ta'rif; `/outreach` ro'yxati ham, cron ham shundan o'qiydi.

## Ko'rib chiqilgan muqobillar

**Chegara 2 ta.** CEO ning dastlabki so'rovi «2 tadan ko'p» edi, ya'ni 3 ta.
2 ta ning o'zida harakat qilish o'lchovga zid: 2 ta qoldirganlarning 66% i
qaytib keladi, ya'ni har uch o'quvchidan ikkitasiga keraksiz teginilardi.

**Avtomatik guruhdan chiqarish.** 3 ta qoldirganlarning 42% i qaytib
keladi. Chiqarish ularni qayta ro'yxatga olishni talab qiladi, muzlatish
esa bir tugma bilan qaytariladi — pul oqimini esa ikkalasi ham bir xil
to'xtatadi.

**Yozuv (enrollment) darajasida yangi pauza.** Dizaynning birinchi
tahririda shu taklif qilingan edi, asosi «ikki guruhda o'qiydigan bola
bitta guruhga kelmasa ikkalasidan ham muzlab qoladi». Kod tekshirilganda
asos noto'g'ri chiqdi — yuqoridagi 2-qarorga qarang.

**Quruq rejim (dry-run) bilan bir hafta.** CEO darrov yoqishni tanladi.
O'rniga uchta himoya qo'yildi: migratsiya o'chiq holda chiqadi, kunlik
chegara fail-closed, va sozlamada o'chirish tugmasi bor. 2026-07-14 da
avtomatik guruh yopishni o'chirish uchun **deploy** kerak bo'lgan edi —
aynan shu takrorlanmasligi kerak.

**Kunlik chegarani ogohlantirishlarga ham qo'llash.** Ogohlantirish hech
narsani buzmaydi va aynan ommaviy kunda ayniqsa kerak, shuning uchun u
chegaraga bog'lanmadi.

## Oqibatlari

**Yutuq:** ketgan o'quvchiga qarz yozilishi va markazning ustoz oyligini
qoplashi to'xtaydi. Butun tarix bo'yicha chegara 3 da 273 ta ortiqcha dars
o'tkazilmagan bo'lardi — ≈3,1 mln ustoz oyligi va ≈8,8 mln o'quvchi
hisobiga yozilgan qarz (taqqos uchun: shu paytgacha jami hisobdan
chiqarilgan qarz 10,9 mln).

**Narx:** 3 ta qoldirganlarning 42% i qaytib keladi, ya'ni haftasiga
≈4 ta faollashtirish — qo'lda ish. «Faol o'quvchi» ko'rsatkichi
pauzadagilar hisobiga tushadi (hozirgi ma'lumotda 5 ta). Pauzadagi
o'quvchining davomatini tuzatib bo'lmaydi — admin avval faollashtiradi.
«Muzlatilgan» ro'yxatida avtomatik va qo'lda muzlatilganlar aralash
turadi; ularni sabab matnining prefiksi ajratadi.

**Endi taqiqlangan:** sanoqning ikkinchi nusxasini yozish; chegara
oshganda qisman pauza qilish; tizim aktoriga `FROZEN` dan boshqa status
o'tkazish huquqini berish.
