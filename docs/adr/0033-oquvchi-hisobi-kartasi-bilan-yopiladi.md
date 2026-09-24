# ADR-0033 — O'quvchining kirish hisobi kartasi bilan birga yopiladi va qaytadi

**Holati:** Qabul qilindi
**Sana:** 2026-09-24
**Bog'liq:** ADR-0022 (bir odam — har rolga alohida hisob), ADR-0032 (kirish raqami kartaga ergashadi), PR #516 (`userArchiveData`), `server/src/common/auth/student-account.ts`, `server/src/students/students-write.service.ts`, `server/src/archive/archive-restore.service.ts`, `server/src/auth/auth.service.ts`, `server/scripts/repair-archived-student-accounts.ts`

## Kontekst

O'quvchining ikkita yozuvi bor: karta (`Student`) va kirish hisobi (`User`,
yagona roli Student, `Student.userId` orqali bog'langan). Kirishning uchala
yo'li — parol, «Telegram orqali kirish» va SMS orqali tiklash — hisobni
`login`/`phone` bo'yicha topadi va kartaga qaramaydi. Tirik hisoblarning
`login` qiymati bazada unique (`User_login_key ... WHERE "deletedAt" IS NULL`).

Kartani arxivlash (`DELETE /students/:id`) faqat kartani yopardi. Hisob
`ACTIVE` qolib, o'quvchining raqamini band qilib turardi. Prod (2026-09-24, faqat
o'qildi):

- faqat arxiv kartaga bog'langan tirik hisob — 33 ta, har oy o'rtacha 6 ta
  qo'shiladi;
- arxivlashning eng ko'p sababi — «o'zi qayta ro'yxatdan o'tadi», «2 ta profil».
  O'sha odamning yangi kartasi eski hisob band qilgan raqamga to'qnashadi:
  2 o'quvchida kirish nomi bo'sh qoldi va Telegram orqali kirish rad etiladi,
  3 o'quvchida hisob umuman ochilmagan;
- arxivdagi o'quvchi kirsa, tokenida karta bo'lmaydi va har sahifada «internetni
  tekshiring» chiqadi;
- arxivdan tiklash faqat kartani qaytarardi va raqam to'qnashuvini tekshirmasdi.

Chetlatilgan, muzlatilgan va bitirgan o'quvchining kartasi tirik qoladi. Karta
ochish va tahrirlash tirik kartalar orasida raqamni takrorlatmaydi, shuning
uchun bu to'qnashuv faqat arxivda paydo bo'ladi.

## Qaror

1. **Karta arxivlanganda uning hisobi o'sha tranzaksiyada arxivlanadi** —
   xodim arxividagi maydonlarning o'zi bilan (`userArchiveData`): `ARCHIVED`,
   `isActive: false`, `deletedAt`. Raqam bo'shaydi. Kartaning tarixida «Kirish
   hisobi: Ochiq → Yopildi» yoziladi.
2. **Faqat yagona roli Student bo'lgan hisob** (`STUDENT_ONLY_ACCOUNT`) yopiladi.
   Xodim roli ham bor hisobga tegilmaydi.
3. **Karta arxivdan qaytarilganda hisob ham qaytadi.** `phone` kartadagi
   raqamga teng bo'ladi. `login` ham shu raqamga teng bo'ladi, agar u boshqa
   tirik hisobning kirish nomi bo'lmasa, aks holda `null` (ADR-0022). Parol
   o'zgarmaydi. Kartadagi raqam boshqa tirik kartada bo'lsa, qaytarish hech
   narsa yozilmasdan rad etiladi.
4. **Chetlatish, muzlatish va bitirish hisobga tegmaydi** (CEO qarori): bu
   o'quvchilar saytda qarzini ko'radi va to'laydi.
5. **Arxivning «Ustozlar / Xodimlar» bo'limi o'quvchi hisobini ko'rsatmaydi,
   qaytarmaydi va o'chirmaydi.** U kartasi bilan birga turadi.
6. **Kartasi tirik bo'lmagan o'quvchi hisobi bilan kirib bo'lmaydi** (kirish,
   `refresh`, ilova sessiyasi): 401 «Hisobingiz yopilgan».
7. **Mavjud qatorlar bir martalik skript bilan tuzatiladi:** ochiq qolgan
   hisoblar yopiladi, bo'sh kirish nomlari karta raqamini oladi, hisobsiz tirik
   kartalarga hisob ochiladi. Avval bazaga yozmasdan sinab ko'riladi, yozish
   CEO ruxsati bilan bo'ladi.

**Taqiqlanadi:**
- o'quvchi kartasini `StudentsWriteService.delete` dan boshqa joyda arxivlash,
  agar o'sha joy hisobni ham xuddi shunday yopmasa. Hozir batch bilan
  arxivlaydigan kod yo'q; qo'shilsa, hisobni ham yopishi va qaytarishi shart;
- o'quvchi hisobini kartasiz qaytarish.

## Ko'rib chiqilgan muqobillar

**Hisobni faqat status bilan yopish (`deletedAt` siz).** Rad etildi: kirish nomi
band bo'lib qolaveradi. Xuddi shu to'qnashuv davom etadi, yangi karta bo'sh
kirish nomi bilan ochiladi. `server/CLAUDE.md` ham arxivda uchala maydonni
talab qiladi.

**Chetlatish va bitirishda ham yopish.** CEO rad etdi. Chetlatilgan 156
o'quvchidan 99 tasi qarzdor, qarz saytda to'lanadi. Ularning kartasi tirik,
to'qnashuv esa yo'q.

**Hisob ochiq bo'lsa, kartani arxivlashni rad etish.** Rad etildi: admin
hisoblarni ko'rmaydi va yopa olmaydi.

**Hisobni butunlay o'chirish.** Rad etildi: tarix va davomat yozuvlari hisobga
ishora qiladi. Karta tiklansa, hisob ham kerak bo'ladi.

**Qaytarishda raqam band bo'lsa, kartani hisobsiz qaytarish.** Rad etildi:
bitta raqamda ikkita tirik o'quvchi bo'lib qoladi. Bunga karta ochishda ham,
tahrirlashda ham yo'l qo'yilmaydi.

## Oqibatlari

**Yutuq:**
- Qayta ro'yxatdan o'tgan o'quvchi o'z raqamini kirish nomi sifatida oladi.
  Parol bilan ham, Telegram bilan ham kiradi.
- Arxivdagi o'quvchi kira olmaydi.
- Kartani qaytarish uning hisobini ham qaytaradi.

**Narx:**
- Arxivlashdan oldin berilgan access token 1 soatgacha ishlaydi. Lekin undagi
  karta arxivda, portal uni ko'rsatmaydi. `refresh` darhol rad etiladi.
- Hisobsiz arxiv kartasi qaytarilsa, hisob ochilmaydi.
- Butunlay o'chirilgan kartaning yopiq hisob qatori qoladi.

**Bu qaror yopmaydi:** sinov imtihoni ishtirokchisini o'quvchiga aylantirish
hisob ochmaydi. Bu alohida ish.
