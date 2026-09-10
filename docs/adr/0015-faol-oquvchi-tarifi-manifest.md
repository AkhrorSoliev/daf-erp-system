# ADR-0015 — «Faol o'quvchi» sanog'i manifest bilan majburlanadi

**Holati:** Qabul qilindi
**Sana:** 2026-09-10
**Bog'liq:** ADR-0003 (route siyosati manifesti), ADR-0012 (bosh sahifa qayta hisoblamaydi), `server/src/students/shared/active-student-where.ts`

## Kontekst

2026-09-02 da «faol o'quvchi» ta'rifi bitta faylga yig'ildi:
`activeStudentWhere()` — statusi `ACTIVE` **va** faol guruhda faol yozuvi bor.
Ta'rif `CONTEXT.md` ga ham yozildi.

Yig'ish o'zi yetarli bo'lmadi. `activeStudentWhere()` — oddiy eksport qilingan
funksiya, uni ishlatishga hech narsa majburlamaydi: chaqirmagan kod ham
muvaffaqiyatli kompilyatsiya bo'ladi, testlardan o'tadi, sahifa ochiladi. Faqat
son boshqacha chiqadi — va buni hech kim sezmaydi, chunki solishtirilayotgan
ikki son ikkita boshqa ekranda turadi.

Shu bo'ldi ham. O'sha commitda uchta chaqiruv ko'chirildi, beshtasi eski
shartini yozib qolaverdi. 2026-09-10 dagi prod o'lchovi, Farg'ona filiali —
uchala son ham «Faol o'quvchilar» deb nomlangan:

| Sirt | Son |
|---|---|
| Bosh sahifa KPI | 331 |
| `/students` «Faol» kartochkasi | 486 |
| Telegram kunlik hisoboti, `/stats`, `/oquvchilar` | 490 |

Farq — 155 o'quvchi: statusi faol, lekin hozir hech qaysi faol guruhda
o'qimayapti. Eng ko'zga tashlanadigani `/students` sahifasi edi: kartochka 486
derdi, foydalanuvchi o'sha «Faol» ni bosganda 331 ta qator chiqardi. Bitta
ekran, bitta so'z, ikkita son.

Bu ADR-0003 dagi muammoning aynan o'zi: tip tizimi **unutilgan** chaqiruvni
ko'radi, lekin **umuman qilinmagan** chaqiruvni ko'rmaydi.

## Qaror

**Ta'rif manifest bilan majburlanadi.** `scripts/student-status-inventory.ts`
manbani TypeScript AST orqali o'qib, `prisma.student` ustidagi har bir
`count` / `aggregate` / `groupBy` / `findMany` so'rovini topadi va uning `where`
ining yuqori qavatida faollik da'vo qilinganmi (`status: ACTIVE`,
`isActive: true`) yoki `activeStudentWhere()` yoyilganmi — shuni aniqlaydi.

`active-student-policy.spec.ts` shu ro'yxatni manifestga solishtiradi. Har bir
joy ikki holatdan birida bo'lishi shart:

- ta'rifni yoyadi (`...activeStudentWhere()`), yoki
- `EXEMPTIONS` da **sabab bilan** e'lon qilingan.

Uchinchi holat yo'q. Yangi sanoq qo'shilsa, test yiqiladi.

**Pul o'lchovlari ataylab chetda.** Balans hisobotidagi «Debitorlik»,
`/payments` dagi qarz kartochkasi, filiallar kesimidagi qarz va Telegramdagi
qarz bloklari `status: 'ACTIVE'` bilan qoladi. Sabab: ular bir-biriga tutash
o'lchovlar (`accountsReceivable` bilan bog'langan) va ularni birma-bir
o'zgartirish hisobotni buzadi. Har biri manifestda sababi bilan yozilgan.

**Bitta hal qilinmagan joy oshkora belgilangan.** `/payments` dagi «Aktiv
balans» kartochkasi «Faol o'quvchilar hisobidagi jami pul» deb yozilgan, ya'ni
ta'rifga bo'ysunishi kerakdek ko'rinadi, lekin balans hisobotiga bog'langan.
Alohida tekshiruvsiz tegilmadi va manifestda `HAL QILINMAGAN` deb turibdi.

## Oqibatlari

Yangi «nechta faol o'quvchi» so'rovi yozgan odam testni yiqitadi va ikki yo'ldan
birini tanlashga majbur bo'ladi. Ta'rifni jimgina takrorlab ketib bo'lmaydi.

Qorovul hamma narsani ko'ra olmaydi: shart o'zgaruvchiga bo'lak-bo'lak
yig'ilsa (`where.AND.push({ status: 'ACTIVE' })`), statik tahlil uni o'qiy
olmaydi. Shuning uchun obyekt literali sifatida yozilmagan har bir joy
«o'qilmadi» deb belgilanadi va manifestga tushadi — jimgina o'tkazib
yuborilmaydi. Bu qoplama emas, lekin yashirin chetlanishni ko'rinadigan
qatorga aylantiradi.

`DailyFinancialSnapshot.activeStudents` qatorida bir martalik sakrash bo'ladi:
kechagi surat eski qoida bilan, bugungisi yangisi bilan yozilgan. Hisobotda bu
son kunlik farq sifatida ko'rsatilmaydi (u yerda faqat qarz solishtiriladi),
shuning uchun ekranda hech nima g'alati ko'rinmaydi.
