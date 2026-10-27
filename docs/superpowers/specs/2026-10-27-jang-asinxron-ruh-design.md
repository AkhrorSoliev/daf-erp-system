# Jang (1-qism): asinxron «ruh» raqib va Dafi bot

**Sana:** 2026-10-27
**Bog'liq:** [Musobaqa tizimi S1–S5](2026-10-18-musobaqa-s1-poydevor-design.md),
[A1 mashq tizimi](2026-08-28-daf-a1-mashq-tizimi-design.md),
[O'quvchilar chati](2026-10-25-oquvchilar-chati-design.md) (jang u yerda qamrovdan chiqarilgan)

## 1. Maqsad

O'quvchilar o'rtasida qisqa bellashuv («jang») qo'shish. Uch rejim rejalashtirilgan,
ular bitta poydevorda ketma-ket quriladi:

| Bosqich | Rejim | Holat |
| --- | --- | --- |
| **1 (shu spec)** | AI ga qarshi: asinxron «ruh» + Dafi bot | loyihalandi |
| 2 | 1-1 duel (jonli) | alohida spec |
| 3 | Guruh-guruhga | alohida spec |

Shu spec faqat 1-bosqichni qamrab oladi.

### 1.1 Nega «ruh» (asinxron)

Prodda 516 faol o'quvchi, kuniga mashq qiladigani 30–50 kishi. Bir vaqtda onlayn
juft topish ehtimoli past. Shuning uchun raqib — boshqa o'quvchining **avvalgi jangida
berilgan javoblari**. Mos ruh topilmasa — **Dafi bot**. Ommaviy o'yinlarda (Super Auto Pets
va boshqalar) ham odam kam bo'lganda shu usul qo'llanadi.

## 2. Qarorlar (CEO, 27.10)

1. Raqib turlari: **mos ruh** (haqiqiy o'quvchining avvalgi javoblari) yoki **Dafi bot**.
2. Jang savollari **alohida jang bazasi** (mashq bazasidan filtr emas), **unitga bog'liq**.
3. Tur: faqat o'qib tanlash va yozish; eshitish — faqat 1–3 soniyalik audio. `REORDER` va `FREE_WRITE` YO'Q.
4. Jang **liga ballini bermaydi**. Alohida hisob: g'alaba soni, seriya, nishon. Kuniga 5 jangdan ko'p emas.
5. Format: **6 savol, har savolga 10 soniya**. Ko'p to'g'ri javob yutadi; teng bo'lsa umumiy vaqti kam yutadi; yana teng bo'lsa — durang.
6. Raqib o'quvchiga ism va familiya bosh harfi, avatar, daraja, g'alaba soni ko'rinadi («Sevinch T.»). Karta bosilsa — reytingdagi ochiq profil.
7. Bot **ochiq** «Dafi bot» deb ko'rsatiladi. Yasama odam ismi bilan chiqmaydi.
8. Har o'quvchi doim ruh bo'la oladi. «Raqib bo'lishni o'chirish» tugmasi YO'Q (yosh muammo emas — CEO).
9. Birinchi bosqich **web portal**da. Native ilovada mashq qismi umuman yo'q, u keyin.

Rad etilgani: jangga liga balli berish (suiiste'mol: bot bilan oson ball yig'ish); haqiqiy AI (Claude)
raqib (har jang uchun xarajat, javoblar baribir oldindan ma'lum); mashq bazasidan filtr.

## 3. Foydalanuvchi oqimi

1. O'quvchi «Jang» tugmasini bosadi.
2. Server avval **mos ruh jangini** qidiradi. Topilsa, savollar o'sha jangdan olinadi (6 savol). Topilmasa, o'quvchining **o'tgan unitlaridan** 6 ta tasdiqlangan savol tanlanadi va raqib Dafi bot bo'ladi.
3. O'quvchiga raqib kartasi ko'rinadi.
4. 6 savol: har biri 10 soniya. Javob berilgach to'g'ri/xato ko'rinadi, raqibning shu savoldagi natijasi ham.
5. Natija ekrani: g'alaba / mag'lubiyat / durang, ikkala tomon hisobi, vaqt.
6. Javoblar saqlanadi va keyingi o'quvchilar uchun ruh bo'ladi.

## 4. Savol bazasi

**Tuzilma.** Har savol bitta `DafUnit` ga bog'liq. Boshlang'ich hajm: u01–u06, har birida ~35 savol,
jami ~210. Yangi unit chiqsa — unga ham ~35 jang savoli yoziladi (unit qo'shish tartibining bir qismi).

**Turlar** (hammasi avtomatik tekshiriladi, ≤10 soniya):

| Tur | Ulush | Tavsif |
| --- | ---: | --- |
| `CHOOSE` | ~50 % | 3–4 variantdan bittasi |
| `TYPE` | ~35 % | bitta so'z yoki bo'sh joy; harf registri farqsiz |
| `LISTEN` | ~15 % | 1–3 soniyalik audio, so'ng `CHOOSE` |

**Yozish tekshiruvi.** `ä/ö/ü/ß` uchun yumshoq qoida: `ae/oe/ue/ss` ham qabul qilinadi
(telefonda nemischa harf terish qiyin). Boshqa xatoga yon berilmaydi.

**Eshitish.** Mavjud so'z ovozlaridan olinadi. 3 soniyadan uzun audio ishlatilmaydi.
Mavjud ovozlarning uzunligi hali o'lchanmagan — rejada birinchi vazifa.

**Yozilishi.** AI loyiha yozadi, CEO ko'rib chiqadi. Savol `DRAFT` holatida yaratiladi, faqat
`APPROVED` jangga tushadi.

**Tanlash qoidasi.** Faqat o'quvchi o'tgan unitlardan; oxirgi 3 kunda ko'rgani chiqarib tashlanadi
(bo'sh qolsa filtr yumshatiladi); bir jangda turlar aralash.

## 5. Ma'lumotlar

Mavjud jadvallarga (`DafUnit`, `DafExercise`, `DafAttempt`, `DafSession`, `DafLessonProgress`)
tegilmaydi. Uchta yangi jadval (aniq nomlar rejada tasdiqlanadi):

- **`DafBattleQuestion`** — unit, tur, matn, variantlar, to'g'ri javob(lar), audio (ixtiyoriy), holat (`DRAFT`/`APPROVED`).
- **`DafBattle`** — o'quvchi, raqib turi (`GHOST`/`BOT`), ruh bo'lsa manba jang, natija, umumiy vaqt, sana, holat (`OPEN`/`DONE`/`ABANDONED`).
- **`DafBattleAnswer`** — jang, savol, javob, to'g'rimi, vaqt (ms). Tugagan jang javoblari ruhga manba bo'ladi.

Jang hisobi (g'alaba soni, seriya) `DafBattle` dan hosila, alohida yig'indi jadvali dastlab kerak emas.
Nishonlar mavjud nishon tizimiga qo'shiladi (nomlari rejada).

## 6. Server

Yangi modul `server/src/daf/battle/`:

- **`start`** — avval ruh jangini qidiradi, topilmasa savollarni o'zi tanlab botni qo'yadi; `DafBattle` yaratadi. Mijozga to'g'ri javob YUBORILMAYDI.
- **`answer`** — javobni serverda tekshiradi, vaqtni server o'zi o'lchaydi (mijoz vaqtiga ishonilmaydi).
- **`finish`** — natijani hisoblaydi, seriya/nishonni yangilaydi, javoblarni ruh uchun qoldiradi.
- Kunlik chegara (5 jang) serverda, Toshkent kuni bo'yicha.
- 60 soniya javobsiz qolgan `OPEN` jang `ABANDONED` bo'ladi, mag'lubiyat hisoblanmaydi va ruh bo'lmaydi.

**Ruh tanlash.** Shartlar: raqib shu unitlarni o'tgan; oxirgi 10 jangida to'g'ri javob ulushi
o'quvchinikidan ±15 % ichida; bu o'quvchi bilan 7 kundan beri uchrashmagan. Ruh **bitta tugagan jang**:
o'quvchi shu jangning 6 savolini aynan o'sha tartibda oladi (ruh javoblari shu savollarga berilgan).
Jangning barcha savollari o'quvchi o'tgan unitlardan bo'lishi va oxirgi 3 kunda ko'rilmagan bo'lishi shart,
aks holda bu jang tanlanmaydi.

**Dafi bot.** To'g'ri javob ehtimoli o'quvchi darajasiga yaqin (taxminan 60–75 %), javob vaqti
3–9 soniya tasodifiy. Natijasi serverda oldindan hisoblanadi, jang davomida o'zgarmaydi.

**Himoya.** Mavjud o'quvchi portali guard'lari; `branch-route-policy.ts` manifestiga yangi marshrutlar qo'shiladi.

## 7. Mijoz

Web portal `client/src/components/student-portal/lernen/` ichida: jang kirish kartasi,
raqib kartasi, savol ekrani (10 soniya taymer), natija ekrani. Raqib kartasi bosilsa — mavjud
reyting ochiq profili ekrani qayta ishlatiladi. Mobil birinchi. Ekranda inglizcha so'z yo'q, faqat lotin.

## 8. Test va ishga tushirish

**Test.** Server (jest): savol tanlash (yaqinda ko'rilgani chiqmaydi), ruh tanlash, bot, g'olib va
durang, kunlik chegara, yozish tekshiruvi (`ä`/`ae`), tashlab ketilgan jang. Mijoz (vitest):
ekran holatlari, taymer. Yuklama: 500 o'quvchi bir vaqtda `start` — p95 o'lchovi (S1 dagi kabi).
Brauzerda telefon o'lchamida haqiqiy jangni o'ynab skrinshot olinadi.

**Ishga tushirish.**
1. Migratsiya va kod prodga chiqadi, jang yashirin (`DAF_JANG` o'chiq).
2. CEO jang savollarini ko'rib tasdiqlaydi.
3. CEO bir necha jang o'ynab ko'radi.
4. `DAF_JANG` yoqiladi.

## 9. Qamrovdan tashqari

- 1-1 jonli duel (2-bosqich) va guruh-guruhga (3-bosqich).
- Liga balli, native ilova, push xabar, do'stni chaqirish.
- Haqiqiy AI (Claude) raqib.

## 10. Xavflar

- Boshida deyarli barcha raqib Dafi bot bo'ladi; o'ynalgan sari ruhlar botni siqib chiqaradi.
- ~210 savol faol o'quvchiga tez tugashi mumkin; 3 kunlik filtr yumshatiladi, hajm keyin oshiriladi.
- Eshitish savollari faqat 3 soniyadan qisqa audio mavjud bo'lsa chiqadi.
- Ruh egasi bilmasdan boshqalarga raqib bo'ladi (CEO qarori: muammo emas).

## 11. Tashqi tadqiqot (27.10)

Duolingo ligasi tanqididan: ball suiiste'moli (osonlik bilan XP yig'ish) real, Duolingo faqat
shubhali XP ni kuzatib ligadan chiqaradi, aniq kunlik chegara hujjatlashtirilmagan. O'yin dizayni
manbalari: odam kam bo'lganda asinxron «ruh» raqib standart yechim. Kahoot/Quizlet Live/Busuu
tafsilotlari va bot almashtirish soniyasi bo'yicha manba topilmadi.
