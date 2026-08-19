# ADR-0007 — Lavozim roldan ajratilgan

**Holati:** Qabul qilindi
**Sana:** 2026-08-16
**Bog'liq:** ADR-0002, `server/prisma/schema.prisma` (`User.position`), migratsiya `20260816120000_user_position`, PR #424

## Kontekst

Tizimda `Role` — tizimga kirish huquqi (CEO, Filial direktori, Administrator, Ustoz, Kassir, O'quvchi; sobit ID 1–6, `UserRole` orqali bog'lanadi).

Lekin markazda **rol talab qilmaydigan, ammo oylik oladigan** xodimlar bor: farrosh, qorovul, oshpaz. Ilgari ularni tizimga qo'shish uchun sun'iy rol berish kerak edi — ya'ni oylik ro'yxatiga tushishi uchun ular **tizimga kira oladigan** bo'lib qolardi.

## Qaror

**Lavozim va rol — ikki xil narsa.**

- `Role` — foydalanuvchi **nima qila oladi** (kirish huquqi)
- `User.position` — erkin matnli maydon, xodim **kim** ekani (farrosh, qorovul, oshpaz)

Rolsiz xodim mavjud va normal holat: u **oylik oladi, lekin tizimga kira olmaydi**.

Oylik ro'yxatiga tushish roldan emas, **stavka konfiguratsiyasi borligidan** kelib chiqadi.

## Ko'rib chiqilgan muqobillar

**Har bir lavozim uchun yangi rol qo'shish** («Farrosh» roli). Rad etildi: rol jadvali kirish huquqi uchun, va sobit ID'larga ega. Kirish bermaydigan rol — bo'sh tushuncha, va u har bir `@Roles()` tekshiruvida shovqin qo'shadi.

**`position` ni sanaladigan `enum` qilish.** Rad etildi: markaz yangi lavozim qo'shganda migratsiya kerak bo'lardi. Erkin matn CEO'ga kod tegmasdan lavozim qo'shishga imkon beradi. Bu maydon **hech qachon** huquq tekshiruvida ishlatilmaydi, shuning uchun matn bo'lgani xavfsiz.

## Oqibatlari

**Yutuq:** rolsiz xodim to'liq qo'llab-quvvatlanadi. Rol jadvali faqat kirish huquqi haqida qoldi.

**Narx:** `position` — erkin matn, shuning uchun imlo xilma-xilligi bo'ladi («farrosh» / «Farrosh»). Bu qabul qilingan, chunki maydon faqat ko'rsatish uchun.

**Endi taqiqlangan:** `position` maydonidan huquq tekshiruvida foydalanish. Huquq — faqat `Role`. Filial qamrovi esa — ADR-0002.
