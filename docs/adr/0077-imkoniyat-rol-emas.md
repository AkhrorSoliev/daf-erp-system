# ADR-0077 — Ruxsat imkoniyat bilan tekshiriladi, rol faqat kimlikni bildiradi

**Holati:** Qabul qilindi
**Sana:** 2026-10-10
**Bog'liq:** ADR-0026, ADR-0027, ADR-0028, ADR-0034, ADR-0074, `docs/superpowers/specs/2026-10-05-ruxsatlar-tizimi-design.md`

## Kontekst

Kim nima qila olishi kodga qattiq yozilgan edi: serverda 250 ta `@Roles(...)`, saytda 65 faylda rol raqamlari. Har o'zgarish uchun dasturchi kerak bo'lardi, CEO esa xodimlarga imkoniyatni o'zi ochib-yopmoqchi (05.10.2026). Bundan tashqari token o'z rollarini bir soat saqlardi (ADR-0028): roldan chiqarilgan xodim bir soatgacha eski rolida ishlardi.

## Qaror

1. **Rol — kimlik, imkoniyat — ruxsat.** Rol qaysi portalga kirish, filial qamrovi, kimning hisobini o'zgartirish (ADR-0026/0027) va o'qituvchining o'z guruhlarini belgilaydi. «Nima qila oladi?» degan savolga imkoniyat javob beradi.
2. **Katalog bitta:** `server/src/common/permissions/permission-catalog.ts` — 14 bo'lim, 64 imkoniyat, har birining o'zbekcha nomi va boshlang'ich rollari. Boshlang'ich holat 10.10.2026 dagi route'larning aniq nusxasi.
3. **Har route aniq bitta belgi oladi:** `@Can`, `@AnyStaff`, `@AnyUser`, `@StudentOnly` yoki `@Public`. Belgisiz route rad etiladi. `@Roles` va `RolesGuard` olib tashlandi.
4. **Rollar har so'rovda bazadan o'qiladi** (`whereUserMayAct()`, 10 soniyalik kesh). Roldan chiqarish 10 soniya ichida ishlaydi. Bloklangan hisob Redis ishlamasa ham hech narsa qila olmaydi.
5. **CEO hamma imkoniyatga ega**, bu o'chmaydi.
6. **Boshlang'ich holat qotirilgan.** `permission-routes.spec.ts` har bir route'ni o'zgarishdan oldingi suratga (`route-access.snapshot.json`) solishtiradi. Ataylab qilingan 33 ta farq `intentional-access-changes.ts` da sababi bilan yozilgan: 28 tasida ekranda yopiq ma'lumot serverda ham yopildi, 5 tasida kassir o'z oyligini o'qiy oladi.

## Ko'rib chiqilgan muqobillar

- **Faqat ekrandan yashirish.** Rad etildi: yopilgan sahifa manzil orqali ochilardi, bugun yopiq narsani ochib bo'lmasdi.
- **Har route'ga alohida kalit.** Rad etildi: 375 ta texnik kalitni CEO tushunmaydi, bog'liqlikni kuzatib bo'lmaydi.
- **CEO o'zi yangi rol yaratadi.** Rad etildi (CEO, 05.10): yangi rol uchun portal, rank, kim beradi kabi qoidalarni ham yozish kerak bo'lardi. Buning o'rniga alohida xodimga istisno beriladi (3-bosqich).

## Oqibatlari

- 2-bosqichda CEO «Ruxsatlar» sahifasida boshlang'ich holatni o'zgartiradi. U faqat `PermissionsService` ichida o'qiladi, boshqa kod o'zgarmaydi.
- Yangi route: belgi + suratda qator; standartni o'zgartirish: `intentional-access-changes.ts` da sabab bilan.
- Xizmat ichidagi «nima qila oladi» tekshiruvlari `PermissionsService.has()` dan foydalanadi, rol nomidan emas.
- ADR-0028 dagi «rol o'zgarishi tokenni to'xtatmaydi» bandi endi amal qilmaydi: rollar bazadan olinadi, o'zgarish 10 soniya ichida kuchga kiradi.
- Bir nechta rolli xodim rollari imkoniyatlarining yig'indisini oladi. Shuning uchun bir vaqtda O'qituvchi va Kassir bo'lgan xodim bosh sahifada jadval o'rniga panelni va davomatda qarzdorlar blokini ko'radi. Filial direktori Telegram guruhidan botni uzish tugmasini endi ko'rmaydi: bu amal serverda doim faqat CEO'ga ochiq edi.
