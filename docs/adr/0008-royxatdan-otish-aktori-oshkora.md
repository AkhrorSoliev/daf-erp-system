# ADR-0008 — Chaqiruvchisi yo'q yozuv o'zini oshkora e'lon qiladi

**Holati:** Qabul qilindi
**Sana:** 2026-08-19
**Bog'liq:** ADR-0002, `server/src/users/users.service.ts`, `server/src/common/auth/branch-scope.ts`, PR #419

## Kontekst

ADR-0002 filial qamrovini fail-closed qildi: noma'lum qamrov — hech narsa.
PR #419 shu qoidani `POST /users` ga ham yoydi — xodim yaratish **filialga
ruxsat berish** demak, shuning uchun har bir `branchId` chaqiruvchining o'z
filiallariga solishtiriladi. `resolveCallerBranchScope` esa `userId` bo'lmasa
`ForbiddenException` otadi.

Tizimda chaqiruvchisi bo'lmagan **bitta** yo'l bor: Telegram bot orqali
o'zini ro'yxatga olish. U yerda ro'yxatdan o'tayotgan odamning o'zi aktor,
tizimda hali akkaunti yo'q. Ikkala sahna ham `usersService.create(data)` ni
ikkinchi argumentsiz chaqirardi.

Natija: **2026-08-07 dan beri bot orqali birorta ham xodim ro'yxatdan o'ta
olmadi** — o'qituvchi ham, administrator ham, kassir ham, ikkala filialda
ham. Sahnadagi bo'sh `catch { }` xatoni butunlay yutar, foydalanuvchi
«Ro'yxatdan o'tishda xatolik yuz berdi» degan muloyim matnni ko'rar, logda
esa hech narsa qolmasdi. Namangan filialida bu qulf hosil qildi: o'qituvchi
qo'shib bo'lmagani uchun o'quvchi sahnasi ham «filialda o'qituvchilar mavjud
emas» deb to'xtardi.

Testlar tutmadi: sahna testlari `UsersService` ni mock qiladi, filial testi
esa har doim chaqiruvchi uzatadi — «chaqiruvchi yo'q» holati hech qayerda
sinalmagan.

## Qaror

Aktor **tur bilan oshkora ifodalanadi**, argumentning yo'qligi bilan emas:

```
{ kind: 'user'; id: number }      // tizimga kirgan chaqiruvchi
{ kind: 'self-registration' }     // bot: imzolangan havola bo'yicha o'zini ro'yxatga olish
```

`self-registration` filial-qorovulini **faqat o'sha bitta joyda** o'tkazib
yuboradi. Ruxsat allaqachon tekshirilgan: `generateEmployeeLinkPayload`
havolani imzolashda ham filialni, ham rol shipini (`GRANTABLE_ROLE_IDS`)
tekshiradi, bot esa HMAC imzosini sahna boshlanishidan oldin tasdiqlaydi.
Qolgan barcha qoidalar (lavozim, filialning kompaniyaga tegishliligi, parol
majburiyligi) ikkala aktor uchun bir xil ishlaydi.

**Taqiqlanadi:** `callerUserId` ning yo'qligini «tekshiruvni o'tkazib yubor»
deb talqin qilish. `{ kind: 'user', id: undefined }` — chaqiruv joyidagi
xato, u fail-closed rad etiladi.

## Ko'rib chiqilgan muqobillar

**`if (!callerUserId) return` — jimgina o'tkazib yuborish.** Rad etildi:
aynan shu shakl nuqsonni yaratdi. Kelajakda kimdir `callerId` uzatishni
unutsa, teshik jimgina ochiladi — buzilish o'rniga imtiyoz.

**Botga texnik «tizim» foydalanuvchisi berish.** Rad etildi: unga barcha
filiallar biriktirilishi kerak bo'lardi, ya'ni ADR-0002 ning `all` qamrovini
bot uchun tiklash. Bundan tashqari audit izida haqiqiy bo'lmagan odam paydo
bo'lardi.

**Qorovulni `POST /users` dan olib tashlash.** Rad etildi: u haqiqiy
teshikni yopgan — bir filial direktori boshqa filialda o'ziga akkaunt
ochishini.

## Oqibatlari

**Yutuq:** bot orqali ro'yxatdan o'tish ishlaydi; filial qorovuli esa
tizimga kirgan har bir chaqiruvchi uchun kuchida qoladi. Chaqiruvchisini
unutgan yangi kod endi kompilyatsiyada ushlanadi — argument majburiy.

**Narx:** `UsersService.create` imzosi o'zgardi; barcha chaqiruv joylari va
testlar yangilandi.

**Endi taqiqlangan:** xodim ro'yxatdan o'tish sahnalarida bo'sh `catch { }`.
Xato `logger.error` bilan yoziladi — bu nosozlik o'n ikki kun ko'rinmay
turganining yagona sababi shu edi.
