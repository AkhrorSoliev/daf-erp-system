# ADR-0028 — Bloklangan xodim hech narsa bera olmaydi, uning tokeni keyingi so'rovda to'xtaydi

**Holati:** Qabul qilindi
**Sana:** 2026-09-24
**Bog'liq:** ADR-0002 (fail-closed qamrov), ADR-0022 (xodim havolasi), ADR-0026 (rol berish shipi), `server/src/common/auth/blocked-user.ts`, `server/src/common/guards/jwt-auth.guard.ts`, `server/src/telegram/telegram.service.ts`, `server/src/users/users.service.ts`, `docs/role-access.md`

## Kontekst

Kirish tokeni bir soat yashaydi va `JwtStrategy` hisobni har so'rovda qayta
o'qimaydi, ya'ni token ichidagi rollar bir soatgacha eskirgan bo'lishi
mumkin. Tokenni muddatidan oldin to'xtatadigan yagona narsa — `JwtAuthGuard`
o'qiydigan Redis kaliti `user:blocked:<id>`. Uni faqat `TeachersService`
yozardi. Xodimlar sahifasi esa holatni `PATCH /users/:id` bilan, arxivni
`DELETE /users/:id` bilan o'zgartiradi, `UsersService` esa kalitni yozmasdi.
Natijada arxivlangan, to'xtatilgan yoki ishdan bo'shatilgan xodim tokenidan
bir soatgacha to'liq foydalanardi.

Eng xavflisi — Telegram ro'yxatdan o'tish havolasi. `generateEmployeeLinkPayload`
chaqiruvchining rollarini va CEO ekanini tokendan olardi, imzolangan havola
esa muddatsiz va ko'p martalik: har ochilishda ishlaydigan xodim hisobi
yaratiladi. Arxivlangan CEO tokeni abadiy ishlaydigan CEO havolasini, lavozimi
pasaytirilgan filial direktori esa bir soat davomida administrator havolasini
yarata olardi.

## Qaror

1. **Havola eshigi ham chaqiruvchini bazadan o'qiydi.** Rollar, filiallar va
   CEO ekani o'sha bitta qatordan olinadi, tokendan faqat `id`. ADR-0026 ning
   4-qoidasi endi ikkala eshikda amal qiladi.
2. **Bloklangan chaqiruvchi ikkala eshikda ham hech narsa bermaydi.**
   Bloklangan — `SUSPENDED`, `TERMINATED` yoki `ARCHIVED` holati, yoxud
   `deletedAt`. Ikkala eshik chaqiruvchini `whereUserMayAct()` orqali o'qiydi.
   Bu ADR-0026 ning 4-qoidasini kengaytiradi: u faqat arxivlanganni aytgan
   edi. Redis ishlamay qolsa ham shu ikki eshik yopiq qoladi.
3. **Hisobni bloklaydigan yoki blokdan chiqaradigan har bir yo'l kalitni
   yangilaydi**: xodimlar sahifasi (`UsersService`: holat, arxiv) va
   o'qituvchilar sahifasi (`TeachersService`: holat, arxiv). Kalit, bloklovchi
   holatlar ro'yxati va yozish qoidasi bitta faylda (`blocked-user.ts`),
   qo'riqchi ham o'sha fayldan o'qiydi. Kalit baza yozuvidan KEYIN yoziladi,
   Redis xatosi esa yozuvni buzmaydi, faqat logga tushadi. Qo'riqchi
   avvalgidek: Redis ishlamasa so'rovni o'tkazadi, kalitni esa bazaga
   solishtiradi.
4. **Rol o'zgarishi tokenni to'xtatmaydi.** Lavozimi pasaytirilgan xodim eski
   rolining boshqa sahifalarini bir soatgacha ko'radi, lekin ikkala eshik
   bazaga qaragani uchun yangi darajasidan yuqori hisob yoki havola yarata
   olmaydi.

**Taqiqlanadi:** kirish beradigan kodda chaqiruvchining rollarini tokendan
olish; hisobni bloklaydigan yangi yo'lni `recordUserBlocked` chaqirmasdan
qo'shish.

## Ko'rib chiqilgan muqobillar

**Rol o'zgarganda ham tokenni bekor qilish** («shu paytdan oldin berilgan
tokenlar eskirgan» belgisi; qo'riqchi 401 qaytaradi, klient jimgina yangi
token oladi). Hozircha rad etildi: token shartnomasini o'zgartiradi, har
so'rovga Redis o'qishi qo'shadi, `iat` soniyali bo'lgani uchun qo'shimcha
da'vo talab qiladi. Pasaytirishdan qolgan xavf — bir soatlik oddiy sahifalar.
Xodimdan xavf sezilganda u to'xtatiladi yoki arxivlanadi, bu esa 3-band bilan
yopilgan.

**Har so'rovda hisobni bazadan o'qish.** Rad etildi: har bir so'rovga baza
so'rovi qo'shadi va har bir `@Roles` tekshiruvining manbasini o'zgartiradi.

**Faqat kalit, eshiklarda holat tekshiruvisiz.** Rad etildi: kalit Redis
ishlamaganda so'rovni o'tkazadi, havola esa abadiy — bitta nosozlik soati
abadiy hisob yaratuvchi havolaga aylanishi mumkin edi.

## Oqibatlari

**Yutuq:** bloklangan xodim qaysi sahifada bloklanganidan qat'i nazar keyingi
so'rovidayoq to'xtaydi. Ikkala eshik tokenga ishonmaydi. O'qituvchi holati
`ARCHIVED` qilinganda ham token to'xtaydi (ilgari faqat `SUSPENDED` va
`TERMINATED`), `INACTIVE` esa kalitni olib tashlaydi.

**Narx:** `UsersService` Redis ga bog'landi. Redis ishlamay qolgan soatda
bloklangan xodim ikki eshikdan boshqa yo'llardan foydalana oladi. Arxivdan
tiklash yo'li kalitni olib tashlamaydi — qo'riqchi bazaga solishtirib uni
o'zi o'chiradi (bitta ortiqcha so'rov).

**Bu qaror yopmaydi:** imzolangan havola hanuz muddatsiz va ko'p martalik
(ADR-0022 ning 2-bosqichi uni almashtiradi, muddat alohida o'zgarish sifatida
rejalashtirilgan); pasaytirilgan rolning bir soati.
