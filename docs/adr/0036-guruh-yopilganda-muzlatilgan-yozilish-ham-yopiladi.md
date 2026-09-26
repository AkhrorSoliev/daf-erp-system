# ADR-0036 — Guruh yopilganda muzlatilgan yozilish ham yopiladi; tugallangan guruhda u DROPPED bo'ladi

**Holati:** Qabul qilindi
**Sana:** 2026-09-26
**Bog'liq:** `server/src/common/status/status-cascade.service.ts`, `server/src/common/status/status-transitions.ts`, `server/scripts/repair-closed-group-enrollments.ts`, guruhni o'chirish tuzatishi (`StatusCascadeService.cascadeGroupDeletion`)

## Kontekst

Guruh `CANCELLED` yoki `COMPLETED` bo'lganda `StatusCascadeService.cascade`
faqat `ACTIVE` yozilishlarni yopardi. Filial yopilganda (`CLOSED`/`ARCHIVED`)
va kurs arxivlanganda ham shunday edi: guruhlar `CANCELLED` bo'lardi, lekin
faqat `ACTIVE` yozilishlar tushib qolardi. `FROZEN` yozilish yopilgan guruhda
abadiy `FROZEN` qolardi. Shuning uchun `Enrollment` va `EnrollmentStateLog`
ni o'qiydigan har bir joy — faollik hisoboti, o'quvchi profilidagi guruhlar,
ustozlar to'lovi hisoboti — o'quvchini hali o'sha guruhda deb ko'rardi.
O'quvchi muzlatishdan qaytganda ham bu yozilish ochilmaydi: qaytarish faqat
`ACTIVE` guruhdagi yozilishni ochadi.

Prod (2026-09-25, faqat o'qildi): 3 ta yopilgan guruhda 19 ta `FROZEN`
yozilish — 2 ta to'xtatilgan guruhda 14 ta, 1 ta tugallangan guruhda 5 ta.
Hammasi guruh yopilishidan oldin muzlatilgan. 18 o'quvchi `FROZEN`, 1 tasi
`ACTIVE`, hech birining boshqa faol guruhi yo'q. Hech birida oldindan to'langan
dars yoki oylik hisob yo'q. O'chirilmagan guruhlar orasida filial yoki kurs
kaskadi yopgan guruh yo'q (uchala filial faol).

Guruhni o'chirish shu kunning o'zida xuddi shunday tuzatildi: uning `ACTIVE`
va `FROZEN` yozilishlari `DROPPED` bo'ladi.

## Qaror

1. **Guruh `CANCELLED` bo'lganda, filial `CLOSED` yoki `ARCHIVED` bo'lganda va
   kurs `ARCHIVED` bo'lganda** tegishli guruhlarning `ACTIVE` va `FROZEN`
   yozilishlari `DROPPED` bo'ladi.
2. **Guruh `COMPLETED` bo'lganda** `ACTIVE` yozilish `COMPLETED` bo'ladi,
   `FROZEN` yozilish esa **`DROPPED`**: guruh tugaganda muzlatilgan o'quvchi
   uni tugatmagan. Avtomatik bitiruv faqat `COMPLETED` yozilishlarni o'qiydi,
   shuning uchun muzlatilgan o'quvchi bu yo'l bilan `GRADUATED` bo'lmaydi.
3. Har bir yopilgan yozilish tarixga yoziladi. Chiqarilish — o'quvchi va guruh
   tarixiga (`removeFromGroup()` yozadigan yozuvlar). Tugallash — faqat
   o'quvchi tarixiga, `statusEnum` kaliti bilan, `status` bilan emas:
   `entity.status.changed` tinglovchilari `status` ni o'quvchining o'z holati
   deb o'qiydi va tizim izohi hamda Telegram xabari yozib yuboradi.
4. Pul odatiy yopish qoidasi bilan yuradi: qolgan oldindan to'langan darslar va
   oyning qolgan qismi balansga qaytadi. Muzlatish buni allaqachon qilgani
   uchun odatda hech narsa qaytmaydi.
5. Eski qatorlar bir martalik skript bilan tuzatiladi: `DROPPED`, guruh
   holati o'zgargan paytga (undan keyin o'zgargan qator — o'sha o'zgarish
   paytiga), guruhni yopgan xodim nomidan. Puli bor qatorga tegilmaydi. Avval
   bazaga yozmasdan sinov; yozish — tuzatish saytga chiqqandan keyin, CEO
   ruxsati bilan.

**Taqiqlanadi:**
- guruh, filial yoki kursni yopadigan yangi yo'lda yozilishlarning faqat
  `ACTIVE` larini yopish;
- tugallangan guruhdagi muzlatilgan yozilishni `COMPLETED` qilish yoki uni
  bitiruvga qo'shish.

## Ko'rib chiqilgan muqobillar

- **Tugallangan guruhda `FROZEN` → `COMPLETED`, bitiruvsiz yoki bitiruv
  bilan.** Muzlatilgan o'quvchini kursni tugatgan qilib ko'rsatadi.
  `status-transitions.ts` yozilish uchun `FROZEN → COMPLETED` ga, o'quvchi
  uchun `FROZEN → GRADUATED` ga ruxsat bermaydi. Prodda bitiruv 0 kishiga
  tegardi — farq faqat ma'noda edi, ma'no esa «tugatmagan».
- **Yozilishni `FROZEN` qoldirib, o'qiydigan joylarda yopilgan guruhni
  hisobga olish.** Har bir o'qiydigan joy buni eslab qolishi kerak; bittasi
  unutsa, son jimgina noto'g'ri chiqadi.
- **Faqat guruh kaskadini tuzatish, filial va kursni keyinga qoldirish.** Xato
  bir xil, tuzatish bir qator. Birinchi filial yopilishi undagi har bir
  muzlatilgan o'quvchini xuddi shunday tashlab ketardi.

## Oqibatlari

**Yutuq:** yopilgan guruhda ochiq yozilish qolmaydi; yozilishni o'qiydigan har
bir joy guruh yopilganini ko'radi; ustozlar to'lovi hisoboti yopilgan guruhning
o'quvchilarini sanamaydi.

**Narx:**
- Guruh yopilgan kuni uning muzlatilgan o'quvchilari 21:00 Telegram
  hisobotidagi «ketgan» soniga kiradi (u o'sha kungi `DROPPED` larni sanaydi),
  faol o'quvchilari hozir kirgani kabi.
- «Pauzadagilar» ro'yxati bunday o'quvchi uchun guruhni ko'rsatmaydi — uning
  qaytadigan guruhi yo'q.
- Ustoz almashgandan keyin 5 dars ichida ketganlar
  (`reports-teacher-changes.service.ts`, `reports-departed-students.service.ts`)
  yozilishning hozirgi `status` va `statusChangedAt` ini o'qiydi. Muzlatilgan
  yozilish keyinroq yopilsa, o'quvchi o'sha oynadan chiqib ketadi; oynadan
  oldin muzlatilgan, guruhi esa oyna ichida yopilgan o'quvchi oynaga kirib
  qoladi. Prod (2026-09-25): hamma vaqtda 16 ta ustoz almashuvi bor; tuzatiladigan
  19 qator ham, faol guruhlardagi 96 ta muzlatilgan yozilish ham hozir birorta
  oynada sanalmaydi, ya'ni bugungi sonlar o'zgarmaydi. Bu ikki joyni
  `EnrollmentStateLog` dan o'qishga (qaytishgacha bo'lgan birinchi to'xtash)
  o'tkazish — alohida ish.
- «Ketgan o'quvchilar» sahifasidagi «Ketish dinamikasi»
  (`departed-students-dataset.ts`) ketgan sanani oxirgi yozilishning
  `statusChangedAt` idan oladi: muzlatilgan o'quvchi muzlatilgan oyidan guruhi
  yopilgan oyga ko'chadi (tuzatish skripti 19 qatorga ham shunday qiladi).
- Guruh holatini o'zgartirish hali bitta tranzaksiya emas: kaskad o'rtasida
  xato bo'lsa, guruh yopilib, yozilishlar ochiq qolishi mumkin. Bu alohida ish.
