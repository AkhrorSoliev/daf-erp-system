# ADR-0027 — Xodim hisobini faqat undan yuqoridagi rahbar o'zgartiradi

**Holati:** Qabul qilindi
**Sana:** 2026-09-24
**Bog'liq:** ADR-0002 (fail-closed qamrov), ADR-0026 (rol berish shipi), `server/src/common/auth/user-branch-scope.ts`, `server/src/users/users.service.ts`, `server/src/teachers/teachers.service.ts`, `docs/role-access.md`

## Kontekst

Mavjud xodim hisobiga yozadigan besh eshik bor: `PATCH /users/:id`,
`DELETE /users/:id`, `PATCH /teachers/:id`, `PATCH /teachers/:id/status`,
`DELETE /teachers/:id`. Ularning hammasi bitta savol berardi: chaqiruvchi va
xodimning filiali kesishadimi? Daraja so'ralmasdi. Shuning uchun administrator
o'z filiali direktorining parolini, loginini, telefonini va holatini
o'zgartira olardi, direktor esa boshqa direktorni. `/teachers/:id` o'qituvchi
roli bor HAR QANDAY hisobni topadi, shu jumladan dars beradigan direktorni ham.

Prodda (2026-09-24) bu nazariy emas edi:

- To'rtta CEO hisobiga filial biriktirilgan (10562, 10740, 10917, 11064).
  Filial kesishmasi ularni o'sha filial administratorlaridan himoya qilmaydi.
- Telefon — kirish kaliti. Admin portalida Telegram orqali kirish yoqilgan,
  u hisobni telefon raqami bo'yicha topadi va parol so'ramaydi. Administrator
  CEO telefonini o'zi boshqaradigan raqamga almashtirsa, o'sha CEO bo'lib
  kiradi. Holatni `TERMINATED` qilsa, CEO ni tizimdan chiqarib qo'yadi.
- Administrator CEO parolini yoza olmasdi, lekin tasodifan: eski «CEO rolini
  faqat CEO beradi» tekshiruvi xodimning hozirgi rollarini qayta o'qirdi.
  ADR-0026 uni rol shipi bilan almashtirdi, ship esa o'zgarmagan rol
  to'plamini tekshirmaydi. Shu qarorsiz ADR-0026 CEO parolini administratorga
  ochib qo'yardi.

Qat'iy qoidaning amaldagi narxi: prodda sof filial direktori yo'q (direktor
roli bor uch kishi CEO ham). Administratorlar boshqa xodim hisobini jami bir
marta tahrirlagan (aprelda o'qituvchi ismi), hamkasb administratorni hech
qachon, hech kimni arxivlamagan.

## Qaror

Xodim hisobiga yozish uchun filial kesishmasi yetmaydi: CEO bo'lmagan
chaqiruvchi xodimdan yuqori bo'lishi shart.

1. **Daraja — rol berish shipi.** Chaqiruvchi faqat har bir roli
   `grantableRoleIdsFor(chaqiruvchi rollari)` ichida bo'lgan hisobga yozadi.
   Xarita ADR-0026 niki, ikkinchi ierarxiya yo'q: administrator — o'qituvchi,
   kassir va rolsiz xodimga; direktor — ularga va administratorga. Tengdosh
   va yuqoridagining hisobi undan yuqori rahbarniki.
2. **Butun hisob, «xavfli maydonlar» ro'yxati emas.** Ism, telefon, holat,
   filial, arxivlash — hammasi. Formaga keyin qo'shilgan maydon ham o'z-o'zidan
   himoyada.
3. **Shipi bo'sh chaqiruvchi hech kimni boshqarmaydi**, rolsiz xodimni ham
   (ADR-0002 ruhida): bo'sh rol ro'yxati «ship ichida» degan shartdan
   bo'shligi uchun o'tib ketmasligi kerak.
4. **O'zingiz:** filial va daraja tekshirilmaydi, lekin CEO dan pastdagi hech
   kim o'z holatini o'zgartirmaydi va o'zini arxivlamaydi. Forma `status` ni
   har saqlashda qayta yuboradi, shuning uchun faqat boshqa qiymat o'zgarish
   hisoblanadi.
5. **O'qish va izoh — faqat filial.** Xodim tarixi, izohlari, o'qituvchi
   guruhlari, holat tarixi va oylik xulosasi eski qoidada qoladi: o'qish
   hech kimdan hech narsa olmaydi.
6. **Administrator `POST /users` va `PATCH /users/:id` dan olib tashlandi**,
   `docs/role-access.md` jadvaliga moslab. O'z profili va paroli
   (`/users/profile`, `/users/password`) hamda Telegram havolasi qoladi.

Qoida bitta joyda: `assertCallerMayManageUser` va
`assertCallerMayManageUserRecord` (`common/auth/user-branch-scope.ts`). Besh
eshikning hammasi shuni chaqiradi.

**Taqiqlanadi:**
- yozish eshigida `assertCallerMayTouchUser` (faqat filial) ishlatish;
- darajani rol id raqamidan chiqarish: 6 (o'quvchi) «eng past» emas, u hech
  kimning shipida yo'q;
- himoyani maydonlar ro'yxati sifatida yozish.

## Ko'rib chiqilgan muqobillar

**Faqat xavfli maydonlar** (parol, login, telefon, `telegramChatId`, holat,
filial, arxiv). Rad etildi: har yangi maydonni kimdir qo'lda tasniflashi
kerak, aks holda u ochiq qoladi. Telefon aynan shunday «zararsiz» ko'ringan
maydon edi. Pastdagi odam yuqoridagining ismini o'zgartira olishi ham qolardi.

**Faqat parol, login, holat, filial va arxiv.** Rad etildi: telefon orqali
Telegram kirishi ochiq qoladi, `telegramChatId` esa rahbarning xabarlarini
(kechki moliya hisoboti ham) boshqa chatga yo'naltiradi.

**Alohida daraja jadvali** (CEO > direktor > administrator > ...). Rad
etildi: ikkinchi ierarxiya vaqt o'tib ADR-0026 xaritasidan ajralib ketadi;
xarita allaqachon «mendan pastda kim» degan savolga javob beradi.

**Administratorni formada qoldirish.** Rad etildi: UI unga sahifani
ko'rsatmaydi, prodda u formadan deyarli foydalanmagan. Eshik ochiq tursa,
jadval va backend yana bir-biriga zid bo'ladi.

## Oqibatlari

**Yutuq:** administrator direktor yoki CEO hisobiga, direktor boshqa
direktorga yoza olmaydi; telefonni almashtirib hisobni egallash yopildi;
ADR-0026 yolg'iz holda ham xavfli emas.

**Narx:** administrator hamkasb administratorning telefonini ham tuzata
olmaydi, direktor boshqa direktorni tahrirlay olmaydi — bu CEO ga o'tadi.
O'z holatini faqat yuqoridagi rahbar o'zgartiradi.

**Bu qaror yopmaydi** (`docs/role-access.md`, «Known gaps»): kirish tokeni
arxiv yoki lavozim pasaytirilgandan keyin ham bir soatgacha ishlaydi;
Telegram havolasi chaqiruvchi rollarini tokendan oladi va muddatsiz; forma
har bir chaqiruvchiga barcha rollarni ko'rsatadi.
