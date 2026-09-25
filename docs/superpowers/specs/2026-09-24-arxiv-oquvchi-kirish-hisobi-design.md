# O'quvchi kartasi arxivlanganda kirish hisobi ham yopiladi

**Sana:** 2026-09-24
**Holat:** Dizayn ma'qullangan (CEO, 2026-09-24)
**ADR:** [0033](../../adr/0033-oquvchi-hisobi-kartasi-bilan-yopiladi.md)
**Bog'liq:** ADR-0022 (bir odam — har rolga alohida hisob), ADR-0032 (kirish raqami
kartaga ergashadi), PR #516 (xodim arxivlanganda `ARCHIVED`)

## Muammo

O'quvchining ikkita yozuvi bor: karta (`Student`) va kirish hisobi (`User`, rol
Student = 6, `Student.userId` orqali bog'langan).

- `DELETE /students/:id` (`StudentsWriteService.delete`) faqat kartani arxivlaydi:
  `deletedAt`, `status: ARCHIVED`. Hisobga tegmaydi, `StatusCascadeService` ham
  tegmaydi. Hisob `ACTIVE` va tirik qoladi.
- Kirishning uchala yo'li — parol (`validateUser`), «Telegram orqali kirish»
  (`findAccountsByIdentifier`) va SMS orqali tiklash (`resolveByPhone`) — hisobni
  `User.login` / `User.phone` bo'yicha topadi. Faqat `deletedAt: null` va status
  `ACTIVE`/`INACTIVE` tekshiriladi, kartaga qaralmaydi.
- `User.login` tirik qatorlar orasida unique (`User_login_key ... WHERE "deletedAt"
  IS NULL`). Arxiv kartasining tirik hisobi o'quvchi raqamini band qilib turadi.

Prod (2026-09-24, faqat o'qildi):

- Faqat arxivdagi kartaga bog'langan tirik hisob — 33 ta, hammasi `ACTIVE`.
  Kartasi umuman yo'q o'quvchi hisobi — 0. Xodim roli ham bor o'quvchi hisobi — 0.
- 33 tadan 5 tasi tirik o'quvchi kartasidagi raqamni band qilgan:
  - 2 o'quvchining hisobida kirish nomi bo'sh. «Telegram orqali kirish» ularda
    ikkita hisob topadi va rad etadi.
  - 3 o'quvchining hisobi umuman yo'q: karta ochilganda raqam band edi, hisob
    yaratilmay qolgan (bu `loginForPhone` qo'shilishidan oldin bo'lgan, ADR-0022).
    Ularning raqami bilan parol yo'li eski hisobni topadi.
- Arxivdagi o'quvchi kirsa, tokenida karta raqami (`studentId`) bo'lmaydi. Bosh
  sahifada «Ma'lumotni yuklab bo'lmadi. Internetni tekshiring» chiqadi, profil,
  jadval va to'lovlar ochilmaydi.
- Kartani arxivlashning eng ko'p sababi: «o'zi qayta ro'yxatdan o'tadi» va «2 ta
  profil». Ya'ni o'sha odam yangi karta bilan qaytadi, eski hisob esa uning raqamida
  qoladi. Oyiga o'rtacha 6 ta karta arxivlanadi va har safar hisob ochiq qolgan.
- `ArchiveRestoreService.restore` faqat kartani qaytaradi va raqam to'qnashuvini
  tekshirmaydi: 35 arxiv kartasidan 10 tasining raqami hozir tirik kartada turibdi.
  Tiklash prodda hali bir marta ham ishlatilmagan.
- Hisobi yo'q tirik o'quvchi — 6 ta: 3 tasi yuqoridagi to'qnashuv sababli, 1 tasi
  sinov imtihoni ishtirokchisidan aylantirilgan (bu yo'l hisob ochmaydi), 2 tasining
  sababi aniq emas.

## Qarorlar (CEO, 2026-09-24)

1. **Hisob faqat karta arxivlanganda yopiladi.** Chetlatilgan, muzlatilgan va
   bitirgan o'quvchining hisobi ochiq qoladi: ular saytda qarzini ko'radi va to'laydi
   (chetlatilgan 156 o'quvchidan 99 tasi qarzdor, bittasi chetlatilgandan keyin saytda
   to'lov boshlagan). Ularning kartasi tirik, shu raqamga yangi karta ochib
   bo'lmaydi — to'qnashuv faqat arxivda paydo bo'ladi.
2. **Mavjud 33 hisob yopiladi.**
3. **Hisobi yo'q 6 tirik o'quvchiga hisob ochiladi.**

2 va 3 — bazaga yozish: avval quruq ishga tushiriladi, natija CEO ga ko'rsatiladi,
yozish uning alohida «ha» javobidan keyin.

## Dizayn

### 1. Arxivlash — `StudentsWriteService.delete`

- Karta va hisob **bitta tranzaksiyada** arxivlanadi. «Karta arxivda, hisob ochiq»
  holati aynan shu tuzatayotgan xato.
- Hisobga xodim arxividagi yozuvning o'zi yoziladi: `userArchiveData(deletedById)`
  (`common/status/user-archive.ts`, PR #516 dagi fayl so'zma-so'z — ikki PR toza
  birlashadi). Natija: `ARCHIVED`, `isActive: false`, `deletedAt`, `deletedById`,
  `statusChanged*`.
- `deletedAt` kirish nomini bo'shatadi: qayta ro'yxatdan o'tgan o'quvchi o'z raqamini
  kirish nomi sifatida oladi.
- Faqat **faqat o'quvchi** hisobi yopiladi — rollari aynan {Student}. Xodim roli ham
  bor hisobga tegilmaydi (prodda 0 ta, lekin yopilsa xodim kira olmay qolardi).
  Ta'rif bitta joyda: `common/auth/student-account.ts`.
- Kartaning tarixiga yozuv: «Kirish hisobi: Ochiq → Yopildi» (`kirishHisobi`).
- Ochiq sessiya: `refresh` darhol rad etadi (`deletedAt`). Berilgan access token
  1 soatgacha ishlaydi, lekin undagi `studentId` arxiv kartaniki, portal so'rovlari
  esa arxiv kartani ko'rmaydi. Redis blok kaliti yozilmaydi.

### 2. Tiklash — `ArchiveRestoreService.restore` (o'quvchi kartasi)

- **Yozishdan oldin:** kartadagi raqam boshqa tirik kartada bo'lsa, tiklash 400 bilan
  rad etiladi va o'sha o'quvchi raqami xabarda aytiladi. Qoida karta ochish va
  tahrirlashdagi bilan bir xil: bitta raqamda ikkita tirik o'quvchi bo'lmaydi.
- Karta va hisob bitta tranzaksiyada qaytadi. Hisob: `deletedAt`, `deletedById`,
  `deletionBatchId` → `null`, `ACTIVE`, `isActive: true`, `statusChanged*`
  («Arxivdan tiklandi»), `phone` = kartadagi raqam, `login` = kartadagi raqam, agar
  u boshqa tirik hisobning kirish nomi bo'lmasa; aks holda `null` (ADR-0022,
  ADR-0032).
- Parol o'zgarmaydi: o'quvchi eski paroli bilan kiradi.
- Tarix: «Kirish hisobi: Yopildi → Ochiq», kirish nomi o'zgarsa — «Login» ham.
- Hisobsiz arxiv kartasi tiklansa, hisob ochilmaydi (qamrovdan tashqari).
- Batch yo'li o'zgarmaydi: hech bir kod o'quvchi kartasini `deletionBatchId` bilan
  arxivlamaydi. Kelajakda qo'shilsa, hisobni ham xuddi shunday yopishi va qaytarishi
  shart — ADR shuni talab qiladi.

### 3. Arxiv sahifasi — «Ustozlar / Xodimlar»

`users` turi uchun ro'yxat, sanoq, bitta yozuv, tiklash va butunlay o'chirish faqat
o'quvchi hisoblarini ko'rmaydi. O'quvchi hisobi kartasi bilan birga arxivlanadi va
birga qaytadi, alohida tiklansa kartasiz ochiq hisob qaytib kelardi. Rolsiz xodim
(ADR-0007) va aralash hisob ko'rinishda qoladi.

Kartani butunlay o'chirish hisobni o'chirmaydi: tarix va davomat yozuvlari hisobga
ishora qiladi. Yopiq hisob qatori qoladi va hech qayerda ko'rinmaydi.

### 4. Kirish eshigi — ehtiyot chorasi

`AuthService.login`, `refresh` va ilova sessiyasi (`buildStudentSession`) kartani
bitta yordamchi orqali topadi. Faqat o'quvchi hisobining tirik kartasi bo'lmasa —
401 «Hisobingiz yopilgan. Administrator bilan bog'laning.» Xodim va aralash hisob
o'zgarishsiz. Natijada kartasiz o'quvchi tokeni tuzilishi bo'yicha berilmaydi, hatto
ma'lumot biror yo'l bilan buzilsa ham.

### 5. Klient

- Arxivdan tiklash rad etilsa, server xabari ko'rsatiladi (`getErrorMessage`).
- Tarix yorlig'i: `kirishHisobi` → «Kirish hisobi».

### 6. Bir martalik tuzatish — `scripts/repair-archived-student-accounts.ts`

Mantiq `scripts/lib/archived-student-account-repair.ts` da, testlar bilan. Odatiy
rejim — quruq ishga tushirish, yozish `--apply --ha-men-tasdiqlayman` bilan. Faqat
idlar va sonlar chiqariladi, telefon va parol hech qachon.

1. **Yopish.** Tirik faqat o'quvchi hisobi, kartasi arxivda yoki kartasi yo'q →
   1-banddagi bilan bir xil yozuv. Tarix «Tizim» nomidan.
2. **Kirish nomi.** Tirik karta, tirik hisob, kirish nomi bo'sh, kartadagi raqam
   endi hech kimning kirish nomi emas → kirish nomi = kartadagi raqam. Tarix
   «Login: — → raqam».
3. **Hisob ochish.** Tirik karta, hisobi yo'q → `createStudentUser` bilan bir xil:
   kirish nomi (bo'sh bo'lsa raqam, aks holda `null`), tasodifiy parol, rol Student.
   Parol chiqarilmaydi: o'quvchi uni botdagi «Parolni tiklash» orqali oladi yoki
   admin kartada qo'yadi. Tarix «Kirish hisobi: Yo'q → Ochiq».

Tartib 1 → 2 → 3, chunki 1 raqamlarni bo'shatadi. Har yozuv tranzaksiya ichida
holatni qayta tekshiradi. Rejadan keyin o'zgargan qator o'tkazib yuboriladi, shuning
uchun ikkinchi ishga tushirish faqat qolganini oladi. Tirik karta yopiq hisobga
bog'langan bo'lsa (prodda 0), skript uni ko'rsatadi va tegmaydi.

## Qamrovdan tashqari

- Chetlatish, muzlatish, bitirish — hisobga tegilmaydi (1-qaror).
- Sinov imtihoni ishtirokchisini o'quvchiga aylantirish hisob ochmaydi — alohida ish.
- Hisobsiz arxiv kartasini tiklashda hisob ochish.
- Redis blok kaliti (ADR-0028 uning egasini belgilaydi, bu yerda foydasi 1 soatdan kam).

## Testlar

- `StudentsWriteService.delete`: hisob karta bilan bir tranzaksiyada yopiladi;
  hisobsiz karta; aralash hisobga tegilmaydi; tarix yozuvi.
- `ArchiveRestoreService.restore`: hisob qaytadi (kirish nomi bo'sh / band); raqam
  tirik kartada → rad, hech narsa yozilmaydi; hisobsiz karta.
- Arxiv `users`: faqat o'quvchi hisobi ro'yxat, sanoq, topish, tiklash va o'chirishda
  ko'rinmaydi; rolsiz xodim va aralash hisob ko'rinadi.
- `AuthService`: kartasiz faqat o'quvchi hisobi → 401 (kirish, refresh, ilova);
  xodim va aralash hisob o'zgarishsiz; tirik karta → `studentId`.
- Skript mantiqi: rejalash, qatorni o'tkazib yuborish holatlari, tartib.

## Chiqarish tartibi

Kod → PR → birlashtirish → Railway (server) → Vercel (klient) → quruq ishga
tushirish → CEO «ha» → yozish → mustaqil tekshiruv.

## Ochiq ishlar bilan to'qnashuv

- PR #516: `user-archive.ts` ikkala tomonda bir xil fayl.
- PR #534 (ADR-0032): o'sha servis fayli, boshqa metod — import qatorida konflikt
  bo'lishi mumkin.
- PR #527 (ADR-0028): Redis blok kalitiga tegilmaydi.
