# ADR-0026 — Rol faqat chaqiruvchining shipi ichida beriladi va olinadi

**Holati:** Qabul qilindi
**Sana:** 2026-09-24
**Bog'liq:** ADR-0002 (fail-closed qamrov), ADR-0008 (ro'yxatdan o'tish aktori oshkora), ADR-0022 (bir odam — har rolga alohida hisob), `server/src/users/users.service.ts`, `server/src/telegram/constants.ts`, `docs/role-access.md`

## Kontekst

Tizimda rolni tanlab beradigan ikki eshik bor: Telegram ro'yxatdan o'tish
havolasi (`POST /telegram/employee-link`) va xodim formasi (`POST /users`,
`PATCH /users/:id`). Havolani imzolashdan oldin `generateEmployeeLinkPayload`
`GRANTABLE_ROLE_IDS` shipini qo'llaydi: CEO — barcha rol; filial direktori —
administrator, o'qituvchi, kassir; administrator — o'qituvchi, kassir. Forma
esa bitta narsani tekshirardi: CEO rolini faqat CEO beradi.

Natijada administrator API ga to'g'ridan-to'g'ri murojaat qilib, o'z filialida
parolini o'zi tanlagan filial direktori hisobini ochishi yoki
`PATCH /users/<o'z id>` bilan o'zini direktor qilishi mumkin edi: o'zini
tahrirlash filial kesishmasi tekshiruvidan ozod, filial tekshiruvi esa o'tadi —
filial o'zida bor. UI xodimlar sahifasini administratordan yashiradi, lekin
chegara — backend. `users.service.ts` dagi izoh ikki eshik «bir xil ship»ga
bo'ysunadi deb yozgan edi, amalda bunday emas edi.

## Qaror

Tizimga kirgan chaqiruvchi (`{ kind: 'user' }`) rol bersa yoki olsa, havolaning
shipi qo'llanadi. Xarita bitta — `GRANTABLE_ROLE_IDS`, ikkala eshik uni
`grantableRoleIdsFor` orqali o'qiydi; chaqiruvchining eng yuqori roli (CEO,
direktor, administrator) shipni belgilaydi.

1. **Qo'shilgan har bir rol ship ichida bo'ladi.** Taqiqlangan rol ruxsat
   etilgani yonida ham o'tmaydi.
2. **To'plam o'zgarsa, xodimning hozirgi rollari ham ship ichida bo'lishi
   shart.** O'z darajangizdagi yoki undan yuqori odamning rollari — o'zingizniki
   ham — sizniki emas: administrator direktoriga o'qituvchi rolini qo'sha
   olmaydi, undan rol ololmaydi, o'ziga ham qo'sha olmaydi. Bu o'zgarishlar
   undan yuqoridagi rahbarniki.
3. **O'zgarmagan to'plam — berish emas.** Forma har saqlashda `roleIds` ni
   yuboradi; to'plamlar solishtiriladi, tartib va takror hisobga olinmaydi.
4. **Chaqiruvchining rollari bazadan, `deletedAt: null` bilan o'qiladi —
   tokendan emas.** Kirish tokeni arxivdan yoki lavozim pasaytirilgandan keyin
   ham bir soatgacha ishlaydi. Noma'lum, arxivlangan yoki ruxsat beruvchi roli
   yo'q chaqiruvchi hech narsa bera olmaydi — «eng past» standart ship yo'q
   (ADR-0002 ruhida).
5. **Bot orqali o'zini ro'yxatga olishda bu tekshiruv ham, filial tekshiruvi ham
   o'tkazib yuboriladi — boshqa hech qaysi qoida emas.** Uning filiali ham,
   rollari ham imzolangan havoladan keladi, havola esa imzolanishda shu ikki
   tekshiruvdan o'tgan (ADR-0008). Lavozim, filialning kompaniyaga tegishliligi
   va parol qoidalari unga ham qo'llanadi.

**Taqiqlanadi:**
- shipni `roleIds` maydoni borligiga qarab qo'llash — har oddiy saqlashni rad
  etadi;
- forma yo'lida chaqiruvchi rollarini tokendan olish;
- ruxsat beruvchi roli yo'q chaqiruvchiga administrator shipini «standart»
  sifatida berish.

## Ko'rib chiqilgan muqobillar

**Faqat qo'shilgan va olingan rollarni tekshirish, yuqori rolni saqlab qolishga
ruxsat.** Rad etildi: administrator o'z direktoriga kassir rolini qo'shar yoki
o'qituvchi rolini olib qo'yar edi — yuqoridagi odamning kirishini pastdagi
o'zgartiradi.

**CEO uchun shipsiz yo'l.** Rad etildi: CEO shipi ham xaritadan o'qiladi (1–5).
Shuning uchun xodim hisobiga o'quvchi roli (6) berilmaydi — ADR-0022 bitta
hisobga ikki turni rad etgan. Yangi rol qo'shilsa, xarita yangilanmaguncha uni
hech kim bera olmaydi (fail-closed).

**Administratorni `POST /users` va `PATCH /users/:id` dan butunlay olib
tashlash.** Bu qarorda qilinmadi — alohida mahsulot qarori. `docs/role-access.md`
jadvali «yo'q» deydi, backend ruxsat beradi; bo'shliq o'sha hujjatda yozilgan.

## Oqibatlari

**Yutuq:** administrator direktor yoki administrator yarata olmaydi va o'zini
ko'tara olmaydi; direktor direktor yoki CEO yarata olmaydi. Ikki eshik bitta
xaritani o'qiydi.

**Narx:** o'z rollarini faqat CEO o'zgartira oladi. Direktor boshqa
direktorning, administrator o'zining rollarini o'zgartira olmaydi — bu
yuqoridagi rahbarga o'tadi. Rol o'zgarishida bitta qo'shimcha so'rov. Shakl
xatolari (lavozim, filial) endi rol rad etilishidan oldin qaytadi — eski CEO
tekshiruvi eng boshida edi.

**Bu qaror yopmaydi** (`docs/role-access.md`, «Known gaps»): filial kesishmasi
tekshiruvi darajaga qaramaydi — administrator o'z filiali direktorining
parolini, loginini, holatini o'zgartira oladi; havola chaqiruvchi rollarini
tokendan oladi va muddatsiz; forma hamma rollarni ko'rsatadi.
