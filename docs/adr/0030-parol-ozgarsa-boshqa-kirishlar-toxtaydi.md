# ADR-0030 — Parol o'zgarsa, hisobning boshqa kirishlari keyingi so'rovda to'xtaydi

**Holati:** Qabul qilindi
**Sana:** 2026-09-24
**Bog'liq:** ADR-0022 (har parol tiklash jurnalga), ADR-0028 (bloklangan xodim — Redis kaliti naqshi), `server/src/common/auth/session-version.ts`, `server/src/auth/auth.service.ts`, `server/src/auth/strategies/jwt.strategy.ts`, `server/src/common/guards/jwt-auth.guard.ts`, `docs/superpowers/specs/2026-09-24-parol-ozgarsa-kirishlar-tugaydi-design.md`

## Kontekst

Kirish chiptasi 1 soat, yangilash chiptasi 24 soat yashaydi. `refresh` imzoni
va hisob holatini tekshirib, har safar yangi 24 soatlik chipta berardi. Shu
sababli kuniga bir marta ochilgan sessiya cheksiz davom etardi. Parol
yoziladigan yetti yo'lning hech biri eski chiptalarga tegmasdi, `User`
jadvalida parol o'zgarganini bildiradigan hech narsa yo'q edi. `JwtStrategy`
chipta turini tekshirmasdi: yangilash chiptasi rol talab qilmaydigan
route'larda 24 soatlik kirish chiptasi bo'lib ishlardi. Natija: parolni bilib
olgan yoki chiptani ko'chirib olgan odam egasi parolni o'zgartirgandan keyin
ham tizimda qolardi.

Qaror paytida prodda parol bilan kira oladigan 31 xodim va 1048 o'quvchi bor
edi. Jurnalda oyiga 28–36 ta parol o'zgarishi yozilgan, hammasi o'quvchilarniki:
yetti yo'ldan faqat uchtasi jurnalga yozardi.

## Qaror

1. **Har bir hisobda kirish raqami bor:** `User.sessionVersion`, 0 dan
   boshlanadi. Har bir chipta uni `sv` da olib yuradi. `sv` siz eski chipta 0
   hisoblanadi, buzuq `sv` li chipta yaroqsiz.
2. **Parol ustuniga har qanday yozuv raqamni oshiradi**, o'sha `update` ichida,
   `passwordWrite()` orqali. "Boshqa qurilmalardan chiqish" raqamni parolsiz
   oshiradi. Yozuvdan keyin yangi raqam Redis'ga yoziladi
   (`user:session-version:<id>`, kirish chiptasi muddati + 5 daqiqa); Redis
   xatosi yozuvni buzmaydi. Har bir parol o'zgarishi jurnalga yoziladi.
3. **Chegara bazada:** `refresh` chiptadagi raqam hisobnikidan farq qilsa rad
   etadi. **Tez yo'l Redis'da:** `JwtAuthGuard` eskirgan kirish chiptasini
   keyingi so'rovdayoq 401 bilan to'xtatadi va rad etishdan oldin bazaga
   solishtiradi. Redis ishlamasa so'rovni o'tkazadi: ko'pi bilan 1 soat,
   keyin `refresh` to'xtatadi.
4. **Yangilash chiptasi faqat `refresh` da ishlaydi:** `JwtStrategy` uni rad
   etadi.
5. **Harakat qilgan qurilma tizimda qoladi:** o'z parolini o'zgartirgan yoki
   "boshqa qurilmalardan chiqish" ni bosgan qurilma javobda yangi chipta
   oladi. Boshqa qurilmalar chiqadi.

**Taqiqlanadi:** `User.password` ni `passwordWrite()` siz yozish (qorovul:
`password-write.single-source.spec.ts`); chipta beradigan yangi yo'lni
`generateTokens` dan o'tkazmasdan qo'shish.

## Ko'rib chiqilgan muqobillar

**Faqat `refresh` da tekshirish.** Rad etildi (CEO tanlovi): kirib olgan
odamga 1 soat qolardi, ADR-0028 bloklashda ham bunday soatni qabul qilmagan.

**Har bir kirish bazada alohida yozuv (sessiya jadvali).** "Chiqish" ni
serverda ham ishlatadi va qurilmalar ro'yxatini beradi, lekin kirish,
yangilash va chiqish yo'llarini qayta yozadi. Hozirgi muammo uchun kerak emas.
Keyin qurilsa, kirish raqami "hammasini tugatish" dastagi bo'lib qoladi.

**`passwordChangedAt` vaqt belgisi.** Rad etildi: `iat` soniyali, shuning
uchun joriy qurilmaga berilgan yangi chipta o'z belgisidan "eski" chiqadi.

**Parol xeshidan barmoq izi.** Rad etildi: eski chiptalarda u yo'q. Bu yo'l
yo hammani bir marta majburan chiqarardi, yo 24 soatlik himoyasiz oyna
qoldirardi. "Boshqa qurilmalardan chiqish" uchun baribir raqam kerak bo'lardi.

## Oqibatlari

**Yutuq:** parol qaysi yo'l bilan o'zgarmasin, boshqa qurilmalar keyingi
so'rovda chiqadi. Deploy kuni hech kim chiqmaydi. Yetti yo'lning hammasi
jurnalga yozadi.

**Narx:** har bir so'rovga bitta Redis o'qishi qo'shiladi. `UsersService`,
`StudentsWriteService`, `StudentPortalWriteService` va
`PortalPasswordResetService` Redis'ga bog'landi. Chipta tarkibi o'zgardi
(`sv`). Parolni o'zgartirgan qurilmada, yangi chipta saqlanguncha ketgan
parallel so'rov uni kirish sahifasiga tushirishi mumkin (millisekundlar).

**Bu qaror yopmaydi:** "Chiqish" hanuz faqat brauzerni tozalaydi; sessiyaning
eng uzun muddati yo'q; yangilash chiptasi skript o'qiy oladigan cookie'da;
allaqachon ochiq turgan bildirishnoma oqimi (SSE) uzilguncha xabar olaveradi,
boshqa hech narsa qila olmaydi (ADR-0028 dagi bloklashda ham shunday);
parolga bog'liq bo'lmagan kirish yo'llari (alohida vazifa).
