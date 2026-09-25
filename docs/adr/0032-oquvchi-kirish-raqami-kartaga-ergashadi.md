# ADR-0032 — O'quvchining kirish raqami kartadagi raqamga ergashadi

**Holati:** Qabul qilindi
**Sana:** 2026-09-24
**Bog'liq:** ADR-0022 (bir odam — har rolga alohida hisob), ADR-0031 (telefon almashsa, eski raqam kalit bo'lmay qoladi; `planPhoneChange`), `server/src/students/students-write.service.ts`, `server/src/common/auth/phone-account-rules.ts`, `server/scripts/repair-student-sign-in-number.ts`

## Kontekst

O'quvchining ikkita yozuvi bor: xodimlar ko'radigan karta (`Student.phone`)
va kirish hisobi (`User.login`, `User.phone`). Hisob ochilganda ikkalasiga
bitta raqam yoziladi. Kirishning uchala yo'li — parol, «Telegram orqali
kirish» (parolsiz) va SMS orqali parol tiklash — raqamni faqat hisobdan
qidiradi. Botdagi parol tiklash esa kartadan qidiradi va o'quvchiga kartadagi
raqam bilan kirishni aytadi.

`PATCH /students/:id` faqat kartadagi raqamni o'zgartirardi, hisobga
tegmasdi. Natijada o'quvchi kartadagi raqam bilan kira olmasdi, eski raqam
esa hisobni ochishda davom etardi. Eski raqam kimga o'tgan bo'lsa, hisobga
o'sha kira olardi.

Prod (2026-09-24, faqat o'qildi): hisobi bor 1018 tirik o'quvchidan 115
tasining kirish raqami kartadagidan farq qiladi. Hammasida farq xodim raqamni
tahrirlagandan keyin boshlangan (2026-04-27 dan beri, oyiga 25–35 ta). 106
tasida raqam butunlay boshqasiga almashgan, ya'ni bu xato tuzatish emas.
Bittasida eski raqam hozir boshqa o'quvchining kartasida turibdi.

## Qaror

1. **Kartadagi raqam — o'quvchining kirish raqami.** Xodim kartadagi raqamni
   saqlaganda o'sha tranzaksiyaning ichida hisob ham shu raqamga o'tadi:
   `User.phone` kartadagi raqamga teng bo'ladi. `login` eski raqamda
   bo'lsa, yangisiga o'tadi. Yangi raqam boshqa tirik hisobning logini
   bo'lsa, `login` bo'sh qoladi (ADR-0022), kirish esa `phone` orqali
   ishlayveradi. Qarorni xodimlar bilan bitta funksiya qabul qiladi:
   `planPhoneChange(..., { staff: false })` (ADR-0031). `staff: false`
   bo'lishining sababi: o'quvchi hisobi o'sha odamning xodim hisobi bilan
   bitta raqamda turishi mumkin.
2. **Eski raqam o'sha zahoti kalit bo'lmay qoladi.** O'tish davri yo'q.
3. **Hisob kartaning eski qiymati bilan emas, hisobning o'zi bilan
   solishtiriladi.** Forma raqamni har saqlashda yuboradi. Shuning uchun bu
   qoidadan oldin tahrirlangan karta ham keyingi saqlashda tuzaladi.
4. **Hisob o'zgarishi kartaning tarixida «Login: eski → yangi» bo'lib
   ko'rinadi.**
5. **Mavjud qatorlar bir martalik skript bilan xuddi shu funksiya orqali
   tuzatiladi:** `scripts/repair-student-sign-in-number.ts`. Avval bazaga
   yozmaydigan quruq hisob qilinadi, yozish CEO ruxsati bilan bo'ladi.

**Taqiqlanadi:**
- mavjud kartaning raqamini `StudentsWriteService.update` dan boshqa joyda
  yozish yoki hisobni `planPhoneChange` dan o'tkazmasdan yozish. Buni
  `student-phone.single-source.spec.ts` qorovuli ushlaydi;
- eski raqamni «vaqtincha» ikkinchi kalit sifatida qoldirish.

## Ko'rib chiqilgan muqobillar

**Kirish raqamni to'g'ridan-to'g'ri kartadan qidirsin, hisobdagi nusxa
kalit bo'lmasin.** Rad etildi. Uchala kirish yo'li va uchala portal bitta
umumiy qidiruvni ishlatadi. O'quvchi uchun alohida shart qo'shilsa, bu
qidiruv murakkablashadi, xodimlar modeli bilan esa ikki xil qoida paydo
bo'ladi (ADR-0031 da kalit — hisobdagi `login`/`phone`). Nusxani yagona
eshikda birga yozish va buni qorovul bilan himoya qilish bitta model bilan
xuddi shu natijani beradi.

**Eski raqamni bir muddat ishlatib turish.** Rad etildi: xavf aynan eski
raqamda, u boshqa odamga o'tgan bo'lishi mumkin.

**Yangi raqam band bo'lsa, kartani saqlashni rad etish.** Rad etildi.
Raqamni ko'pincha arxivlangan kartaning hisobi band qilib turadi, xodim esa
uni ko'rmaydi va tuzata olmaydi. ADR-0022 bu holatda kirish nomini bo'sh
qoldiradi.

**Yangi raqamga SMS orqali tasdiq.** Rad etildi. Raqamni xodim o'quvchining
o'zidan eshitib yozadi. SMS faqat xato terilgan raqamdan saqlaydi, bu
muammoni esa hal qilmaydi, ustiga Eskizda yangi shablon talab qiladi.

## Oqibatlari

**Yutuq:** o'quvchi uchun bitta raqam bor — kartadagisi. Eski raqam hech
narsani ochmaydi. Bot aytgan raqam saytda ishlaydi.

**Narx:** raqami almashgan o'quvchi keyingi safar yangi raqam bilan kiradi,
paroli o'zgarmaydi. Kartani saqlashda bazadan bitta qo'shimcha o'qish
qilinadi. Yangi raqam arxivlangan kartaning hisobida login bo'lib tursa,
«Telegram orqali kirish» shu raqamda ikkita hisob topadi va rad etadi.
Bunda parol bilan kirish ishlaydi. Tuzatishdan keyin prodda bunday holat
2 ta bo'ladi.

**Bu qaror yopmaydi:** arxivlangan kartaning kirish hisobi ochiq qoladi
(prodda 33 ta, 5 tasi tirik o'quvchi kartasidagi raqamni band qilib turibdi).
Hisobsiz tirik o'quvchilar (prodda 6 ta) ham qoladi. Ikkalasi alohida ish.
