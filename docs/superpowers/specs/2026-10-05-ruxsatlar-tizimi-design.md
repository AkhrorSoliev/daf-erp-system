# Ruxsatlar tizimi — CEO xodimlarga imkoniyat ochadi va yopadi

**Sana:** 2026-10-05 (yangilandi 2026-10-10) · **Holati:** CEO bilan suhbatda kelishildi; 10.10 da CEO davom etishni aytdi · **ADR:** 1-bosqich PR'ida yoziladi (keyingi bo'sh raqam; hozir 0076, chunki 0074 — topshiriqlar, 0075 — «Qaytariladigan pul» ishi)

## 0. Qisqacha

- CEO «Sozlamalar → Ruxsatlar» sahifasida har bir rol uchun (filial direktori, administrator, kassir, o'qituvchi) qaysi imkoniyat ochiq ekanini kalitlar bilan belgilaydi.
- Kerak bo'lsa bitta xodimga istisno beradi: unga qo'shimcha imkoniyat ochadi yoki rolidagi imkoniyatni yopadi.
- Yopilgan imkoniyat ikki joyda yopiladi: ekranda (menyu, tugma, tab ko'rinmaydi) va serverda (manzil qo'lda yozilsa ham ochilmaydi).
- Bog'liq imkoniyatlar o'zi hisobga olinadi. Imkoniyat yoqilganda u ishlashi uchun kerak bo'lganlar ham yoqiladi. O'chirilganda unga tayangan imkoniyatlar ham o'chadi. Ikkala holat ham saqlashdan oldin ko'rsatiladi.
- O'zgarish xodimning keyingi bosishida kuchga kiradi. Xodim qayta kirishi shart emas.
- Birinchi kuni hech narsa o'zgarmaydi. Boshlang'ich holat bugungi holatning aniq nusxasi bo'ladi. Buni avtomatik test isbotlaydi.
- Ish uch bosqichda bajariladi: (1) poydevor, foydalanuvchiga ko'rinmaydi; (2) «Ruxsatlar» sahifasi va o'zgarishlar tarixi; (3) xodim istisnolari, Telegram bot tugmalari va xabarlar.

## 1. Kelishilgan qarorlar (05.10.2026, CEO bilan suhbatda)

| # | Savol | Qaror |
|---|---|---|
| Q1 | Qaysi darajada sozlanadi? | Rol bo'yicha umumiy sozlama + alohida xodimga istisno (qo'shish yoki yopish). Yangi rol yaratish qilinmaydi. |
| Q2 | Yopilgan imkoniyat qanday yopiladi? | To'liq qulf: ekranda ham, serverda ham. «Faqat ekrandan yashirish» va «har bir route'ga alohida kalit» rad etildi. |
| Q3 | Sahifa ko'rinishi | Jadval: qatorlarda bo'limlarga guruhlangan imkoniyatlar, ustunlarda rollar. Bog'liqlik avtomatik hisoblanadi va tasdiqdan oldin ko'rsatiladi. Sariq nuqta — boshlang'ich holatdan farq. Qizil belgi — pulni o'zgartiradigan yoki qaytarib bo'lmaydigan amal. Har bir rol uchun «Boshlang'ich holatga qaytarish» tugmasi bor. Telefonda avval rol tanlanadi, keyin ro'yxat chiqadi. Maket suhbatda ko'rsatildi va ma'qullandi. |
| Q4 | O'zgarmas qoidalar | 4-bo'limdagi 1–7 bandlar. |
| Q5 | Qachon kuchga kiradi? | Xodimning keyingi so'rovida. Roldan chiqarilgan xodimga ham darhol ta'sir qiladi (bugun bu 1 soatgacha cho'ziladi). |
| Q6 | Xabarlar | Shaxsiy xabarlar va Telegram bot tugmalari kalitlarga ergashadi. Telegram guruhlariga ketadigan hisobotlar o'zgarmaydi. |
| Q7 | Tarix | Kim, qachon, qaysi rol yoki xodimga nimani ochgani yoki yopgani yoziladi va sahifada ko'rinadi. |
| Q8 | Bosqichlar | 3 bosqich, har biri saytga alohida chiqariladi (11-bo'lim). |

## 2. Hozirgi holat (kod va prod bazasi o'qildi, 05.10.2026)

- **Ruxsat kod ichiga qattiq yozilgan.** Serverda `@Roles(...)` 250 joyda (74 fayl) uchraydi. Har bir route rol nomlari ro'yxatini `RolesGuard` orqali tekshiradi. Rollar `Role` jadvalida (6 qator), xodim bilan bog'lanishi `UserRole` jadvalida.
- **Route'lar** `scripts/route-inventory.ts` bilan sanaldi (10.10 dagi `main`), jami 453 ta:
  - xodimlar ishlatadigan route — 375 ta;
  - har qanday kirgan foydalanuvchiga ochiq — 15 ta;
  - o'quvchi route'lari — 39 ta;
  - ochiq route — 24 ta.
- **Xodim route'larining rol to'plamlari:**
  - faqat CEO — 23;
  - CEO + direktor — 68;
  - CEO + direktor + admin — 200;
  - CEO + direktor + admin + o'qituvchi — 22;
  - CEO + direktor + admin + kassir — 33;
  - barcha xodim — 29 (17 tasi yangi topshiriqlar bo'limi, ADR-0074).
- **Server ichida route'dan tashqari 40 ta rol tekshiruvi bor** (19 fayl). Ularning bir qismi «xodim kim?» degan savolga javob beradi: CEO barcha filialni ko'radi, o'qituvchi faqat o'z guruhini, ADR-0026/0027 shiplari. Boshqa qismi «xodim nima qila oladi?» degan savolga javob beradi: masalan, to'lov sozlamasining kompaniya qismini faqat CEO o'zgartiradi.
- **Saytda 65 faylda rol tekshiruvi bor:** `roles.some(...)`, `hasAnyRole`, `isCeo`. Menyu ro'yxatlari `visibleForRoles` bilan berilgan: `nav-items.ts`, `payments-nav.ts`, `reports-nav.ts`, `daf-nav.ts`, `settings-nav.ts`. Sahifa havolalari `role-access.ts` va `RoleLink` orqali.
- **Menyu va server ro'yxatlari ba'zi joylarda farq qiladi.** Masalan, bir nechta hisobot menyuda faqat CEO va direktorga ko'rinadi, server esa uning ma'lumotini adminga ham beradi. 30.09 dagi tuzatish (#638) bunday 5 ta farqni yopgan edi. Qolganlari 1-bosqichda ro'yxatga olinadi (7.6).
- **Prod bazasi:** 1 kompaniya, 3 faol filial, 30 faol xodim:
  - 18 tasi faqat o'qituvchi;
  - 4 tasi faqat CEO;
  - 3 tasi CEO + direktor + admin;
  - 3 tasi faqat admin;
  - 1 tasi admin + kassir;
  - 1 tasi direktor + admin + o'qituvchi + kassir.

  Ko'p rolli hisoblar bor, shuning uchun imkoniyatlar rollar bo'yicha qo'shib hisoblanadi.
- **Rollar token ichida saqlanadi.** Access token 1 soat yashaydi va rollarni o'zida olib yuradi (`JwtStrategy`). Shuning uchun roldan chiqarilgan xodim eski rolidan yana 1 soatgacha foydalanadi. Bu bo'shliq ADR-0028 da ochiq qoldirilgan.
- **Kerakli infratuzilma tayyor:**
  - `EntityHistory` — o'zgarishlar tarixi;
  - `branch-route-policy.ts` — har bir route'ning filial chegarasi manifesti; 88 tasi hali `UNREVIEWED`;
  - `route-inventory.ts` — route'larni AST bilan topadi.

## 3. Asosiy tushunchalar

- **Rol — kimlik.** Rol quyidagilarni belgilaydi:
  - xodim qaysi saytga kiradi (portal);
  - kimning hisobini o'zgartira oladi (ADR-0026/0027);
  - filial qamrovi (CEO hamma filialni ko'radi);
  - o'qituvchi o'z guruhlari bilan cheklanishi;
  - stavka kimga qo'yiladi (ADR-0034).

  Bular o'zgarmaydi va rol bo'yicha qoladi.
- **Imkoniyat — ruxsat.** Imkoniyat xodim nima qila olishini belgilaydi: sahifani ochish, tugmani bosish. Har bir imkoniyatda quyidagilar bor:
  - koddagi nomi (masalan, `payments.create`);
  - ekrandagi o'zbekcha nomi;
  - boshlang'ich rollari;
  - bog'liqliklari;
  - texnik chegarasi.
- **Boshlang'ich holat kodda yoziladi** (katalog). Bazada faqat CEO o'zgartirgan joylar saqlanadi. Yangi imkoniyat qo'shilsa, u o'z boshlang'ich holati bilan darhol ishlaydi va baza migratsiyasi kerak bo'lmaydi. «Boshlang'ich holatga qaytarish» o'sha rolning bazadagi yozuvlarini o'chiradi.
- **Xodimning amaldagi imkoniyatlari quyidagicha hisoblanadi:**
  1. Xodimda CEO roli bo'lsa, unga hamma imkoniyat ochiq. Buni o'chirib bo'lmaydi.
  2. Aks holda xodimning har bir xodim roli uchun to'plam olinadi: boshlang'ich holat va CEO o'zgarishlari. Bu to'plamlar birlashtiriladi.
  3. Ustiga xodim istisnolari qo'llanadi: ochilganlari qo'shiladi, yopilganlari olib tashlanadi.
  4. Bog'liqlik nazorati: talabi bajarilmagan imkoniyat amalda yo'q hisoblanadi. Bu qadam to'plam o'zgarmay qolguncha takrorlanadi. Saqlash paytida bunday holatga yo'l qo'yilmaydi (5-bo'lim). Bu qatlam faqat qo'shimcha kafolat.

  O'quvchi roli imkoniyat olmaydi. O'quvchi ilovasi bu tizimdan alohida.

## 4. O'zgarmas qoidalar (kalit bilan o'chmaydi)

1. CEO uchun hamma narsa ochiq.
2. «Ruxsatlar» sahifasi va uning API'si faqat CEO roliga ochiq. U imkoniyat sifatida hech kimga berilmaydi.
3. **Filial chegarasi.** Xodim faqat o'zi biriktirilgan filial(lar)ni ko'radi (`UserBranch`). Imkoniyat sahifani ochadi, lekin boshqa filialni ochmaydi.
4. O'qituvchi roli faqat o'z guruhlari va ularning davomatini ko'radi.
5. **Xodim hisoblari.** ADR-0026 (rol berish shipi) va ADR-0027 (hisobni faqat yuqoridagi rahbar o'zgartiradi) o'z kuchida qoladi. «Xodimlarni boshqarish» adminga ochilsa ham, admin faqat o'qituvchi va kassir hisobi bilan ishlay oladi.
6. **O'z ma'lumotlari va ma'lumotnomalar hammaga ochiq.** Har bir xodim o'z profilini, parolini, xabarlarini, topshiriqlarini va «Mening oyligim» sahifasini ko'radi. Har ekranga kerak bo'lgan ro'yxatlar ham hammaga ochiq: filiallar, kurslar, xonalar, dam olish kunlari.
7. O'quvchi portali va ochiq sahifalar (anketa, to'lov cheki, to'lov tizimidan keladigan xabarlar) bu tizimdan tashqarida.
8. **Texnik qulf** (6-bo'lim). Ba'zi imkoniyatlarni ayrim rollarga xavfsiz berib bo'lmaydi. Sahifada bunday katak qulf belgisi va sababi bilan ko'rsatiladi. Bu band 1–7 bandlarning texnik davomi: u noto'g'ri sozlama paydo bo'lishiga yo'l qo'ymaydi.

## 5. Bog'liqlik qoidalari

- Har bir imkoniyatda `requires` ro'yxati bor. Undagi hamma talab bajarilishi shart. Ro'yxatda aylana bo'lmasligini test tekshiradi.
- **Rolga yoqish.** Imkoniyat zanjir bo'yicha barcha talablari bilan birga yoqiladi. Sahifa «Birga yoqiladi: …» deb ko'rsatadi.
- **Roldan o'chirish.** Imkoniyat unga tayangan barcha imkoniyatlar bilan birga o'chadi. Sahifa «Birga o'chadi: …» deb ko'rsatadi.
- **Xodimga istisno.** Xuddi shu qoida xodimning amaldagi to'plamida ishlaydi. Xodimdan imkoniyat yopilganda, unga tayanganlar ham shu xodimdan istisno sifatida yopiladi.
- **Rol sozlamasi o'zgarganda** xodim istisnolari saqlanib qoladi. Agar natijada to'plam bog'liqlikni buzsa, 3-bo'limdagi 4-qadam ishlaydi. Sahifa bunday xodimni «e'tibor bering» belgisi bilan ko'rsatadi.
- **Server saqlash paytida tekshiradi.** Natijaviy to'plam bog'liqlik bo'yicha noto'g'ri bo'lsa, 400 qaytaradi va hech narsa saqlanmaydi. Sayt xuddi shu funksiyalardan foydalanadi va natijani tasdiqdan oldin ko'rsatadi.
- **Texnik qulf bog'liqlikdan ustun.** Agar talab qilingan imkoniyat shu rol uchun qulflangan bo'lsa, asosiy imkoniyat ham yoqilmaydi. Sababi ko'rsatiladi.

## 6. Texnik qulf (`allowedRoles`)

Bugun har bir route faqat o'z rollari bilan sinalgan. Imkoniyat yangi rolga berilsa, kod hech qachon ko'rmagan yo'l ochiladi. Bu uchta xavf tug'diradi:

1. **Filial chegarasi tekshirilmagan route.** `branch-route-policy.ts` da `UNREVIEWED` deb belgilangan route orqali yangi rol boshqa filial ma'lumotini ko'rib qolishi mumkin.
2. **Butun kompaniyaga ta'sir qiladigan amal.** Faqat CEO uchun yozilgan `COMPANY_WIDE` yozuvlar bunga misol: oylikni hisoblash, oylik davri, umumiy stavka, avtomatik pauza sozlamasi, kompaniya ma'lumotlari. Ular direktorga berilsa, u boshqa filiallarga ham ta'sir qiladi.
3. **Xizmat ichidagi rol taxminlari.** Masalan, `if (roles.includes('Branch Director')) … else …` kabi kodda yangi rol kutilmagan shoxga tushadi.

**Qoida.** Har bir imkoniyatda `allowedRoles` bor — u berilishi mumkin bo'lgan rollar ro'yxati. Boshlang'ich rollar doim shu ro'yxat ichida bo'ladi.

- `allowedRoles` boshlang'ich rollardan kengroq bo'lsa, imkoniyatning birorta route'i ham `UNREVIEWED` bo'lmasligi shart. Buni test tekshiradi.
- `COMPANY_WIDE` yozuvi bor imkoniyat faqat filialga bog'lab ko'rib chiqilgandan keyin kengaytiriladi. Aks holda u CEO'ga qulflanadi.
- 1-bosqichda har bir imkoniyatning route'lari xizmat ichidagi rol taxminlari bo'yicha ko'rib chiqiladi. Natija katalogga yoziladi: `allowedRoles` va har bir qulflangan rol uchun sabab. Sabab sahifada ko'rsatiladi, masalan: «butun kompaniyaga ta'sir qiladi», «filial chegarasi hali tekshirilmagan».
- 88 ta `UNREVIEWED` route'dan xodimlarga tegishlilari (~68 ta) 1-bosqichda ko'rib chiqiladi. Ular dam olish kunlari, sabablar, xonalar, lid manbalari, mock bo'limlari, Telegram guruhlari, arxiv, filiallar va boshqa qismlarga tegishli. Ko'rib chiqilmay qolgan route'ga tayangan imkoniyat sahifada qulf bilan chiqadi.
- Istisno ham shu qoidaga bo'ysunadi. Xodimga imkoniyat faqat uning rollaridan biri `allowedRoles` ichida bo'lsa beriladi.

## 7. Server tomoni

### 7.1 Katalog

`server/src/common/permissions/permission-catalog.ts` — yagona manba:

```ts
export const PERMISSIONS = {
  'payments.create': {
    section: 'payments',
    label: "To'lov qayd qilish",
    defaultRoles: [BRANCH_DIRECTOR, ADMINISTRATOR, CASHIER],
    allowedRoles: [BRANCH_DIRECTOR, ADMINISTRATOR, CASHIER],
    requires: ['payments.view'],
    // danger: 'money' | 'irreversible' — sahifadagi qizil belgi
  },
  // ...
} as const satisfies Record<string, PermissionDef>;

export type PermissionKey = keyof typeof PERMISSIONS;
```

Bo'limlar tartibi va nomi `PERMISSION_SECTIONS` da yoziladi. `label` ekranda ko'rinadi, shuning uchun unda inglizcha so'z bo'lmaydi. Qulflangan rolning sababi `lockReasons` maydonida turadi. `allowedRoles` va `lockReasons` 2-bosqichda qo'shiladi: 1-bosqichda hech kim boshlang'ich holatni o'zgartira olmaydi.

### 7.2 Baza (2-bosqich)

Bu jadvallar 2-bosqichda, «Ruxsatlar» sahifasi bilan birga qo'shiladi. 1-bosqichda CEO hech narsani o'zgartira olmaydi, shuning uchun imkoniyatlar faqat katalogdagi boshlang'ich holatdan hisoblanadi va bazada saqlanadigan narsa yo'q.

Ikkita yangi jadval qo'shiladi. Mavjud jadvallarga tegilmaydi.

```prisma
/// CEO'ning rol bo'yicha o'zgarishi. Faqat boshlang'ich holatdan farqi saqlanadi.
model RolePermission {
  companyId   Int
  roleId      Int
  key         String
  granted     Boolean
  updatedById Int?
  updatedAt   DateTime @updatedAt

  @@id([companyId, roleId, key])
}

/// Xodim istisnosi: true — qo'shib ochilgan, false — yopilgan.
model UserPermission {
  userId      Int
  key         String
  granted     Boolean
  updatedById Int?
  updatedAt   DateTime @updatedAt

  @@id([userId, key])
}
```

- `Company`, `Role` va `User` bilan bog'lanishlar `onDelete: Cascade` bilan qo'yiladi.
- `key` katalogdagi nom. Bazada unga cheklov yo'q, lekin yozishda katalog bo'yicha tekshiriladi.
- O'qishda noma'lum `key` e'tiborsiz qoldiriladi va jurnalga yoziladi. Agar katalogda nom o'zgarsa, eski yozuvlarni migratsiya qayta nomlaydi.
- Jadvallar bo'sh holda qo'shiladi. Demak 2-bosqich chiqqan kuni ham hamma narsa boshlang'ich holatda ishlaydi.

### 7.3 Amaldagi imkoniyatlarni hisoblash

`PermissionsService.effectiveFor(userId)`:

- **Rollar bazadan o'qiladi** (`UserRole`), token'dan emas. Shuning uchun roldan chiqarish darhol ishlaydi (Q5). Bloklangan hisobni `JwtAuthGuard` allaqachon to'xtatadi.
- **Guard `request.user.roles` ni bazadagi rollar bilan almashtiradi.** Shunda «kim?» degan tekshiruvlar ham yangi rolni ko'radi: filial qamrovi, ADR-0026/0027. Masalan, CEO rolidan chiqarilgan xodim keyingi so'rovdayoq barcha filialni ko'rishdan to'xtaydi. Bu ADR-0028 da ochiq qoldirilgan bo'shliqni yopadi.
- **Natija kesh qilinadi.** U jarayon ichida har bir xodim uchun 10 soniya saqlanadi. 1-bosqichda faqat shu muddat ishlaydi. 2-bosqichdan boshlab ruxsat yozilganda kesh shu jarayonda darhol tozalanadi.
- **Bloklangan yoki arxivlangan hisob rol olmaydi.** Rollar `whereUserMayAct()` sharti bilan o'qiladi. Redis ishlamay qolgan paytda ham bloklangan xodim hech bir imkoniyatni ishlata olmaydi.
  - Kodda `// ponytail:` izohi qoldiriladi. Server bir nechta nusxada ishlasa, boshqa nusxada kechikish 10 soniyagacha bo'ladi. Bu yetmasa, ADR-0030 dagi kabi Redis versiya kaliti qo'shiladi.
- Natija shakli: `{ roleIds, keys: Set<PermissionKey> }`.

### 7.4 Route belgilari va global guard

Har bir route'da aniq bitta belgi bo'ladi:

| Belgi | Ma'nosi | Bugun qayerda |
|---|---|---|
| `@Public()` | ochiq | o'zgarmaydi (24) |
| `@StudentOnly()` | o'quvchi portali | `@Roles('Student')` o'rniga (39) |
| `@AnyUser()` | bloklanmagan har qanday kirgan hisob, faqat o'z ma'lumoti | bugun `@Roles` siz route'lar (15) |
| `@AnyStaff()` | har qanday xodim: ma'lumotnomalar, o'z ma'lumoti, topshiriqlar | ma'lumotnoma ro'yxatlari, fayl yuklash, o'z telefoni, `/salary/me/*`, `/tasks/*` (33) |
| `@Can(...keys)` | sanab o'tilgan imkoniyatlardan **birortasi** bo'lsa | qolgan xodim route'lari (342) |

- `PermissionGuard` `APP_GUARD` sifatida `JwtAuthGuard` dan keyin ro'yxatdan o'tkaziladi. Belgisiz route 403 qaytaradi, ya'ni xato bo'lsa eshik yopiq qoladi.
- `RolesGuard` va `@Roles` 1-bosqich oxirida o'chiriladi.
- Bir route bir nechta sahifaga xizmat qilishi mumkin. Masalan, `GET /students` o'quvchilar ro'yxatida, to'lov oynasidagi qidiruvda va guruhga qo'shishda ishlatiladi. Bunda `@Can` o'sha sahifalarning imkoniyatlarini sanaydi va «birortasi» qoidasi ishlaydi. Shuning uchun CEO «To'lov qayd qilish»ni ochsa, o'quvchi qidiruvini alohida ochishi shart emas.

### 7.5 Xizmat ichidagi tekshiruvlar

40 ta ichki rol tekshiruvi ikki turga ajratiladi:

- **«Kim?» degan tekshiruvlar** rol bo'yicha qoladi: filial qamrovi, ADR-0026/0027, o'qituvchi guruhlari, ADR-0034.
- **«Nima qila oladi?» degan tekshiruvlar** `permissions.has(user, key)` ga o'tkaziladi. Masalan: to'lov sozlamasining kompaniya qismi, Telegram guruhlariga e'lon yuborish.

Har bir tekshiruv qaysi turga kirishi 1-bosqich rejasida jadval qilib yoziladi.

### 7.6 Manifest va tenglik testlari

**`permission-route-manifest.spec.ts`**

- `route-inventory.ts` belgilarni ham o'qiydigan qilib kengaytiriladi.
- Test har bir route'da aniq bitta belgi borligini tekshiradi.
- Belgisiz yangi route qo'shilsa, build yiqiladi.

**`permission-equivalence.spec.ts`**

- O'zgarishdan oldin `main` dan surat olinadi: `permission-equivalence.snapshot.json` (route → bugungi rollar).
- Test shart: `@Can` kalitlarining boshlang'ich rollari birlashmasi + CEO = bugungi rollar.
- Har bir farq `INTENTIONAL_CHANGES` ro'yxatida sababi bilan yozilgan bo'lishi kerak. Faqat ikki xil farqqa ruxsat bor:
  1. **Toraytirish.** Rol route'ni chaqira oladi, lekin uning birorta ekrani uni chaqirmaydi. Buni sayt kodidagi chaqiruvlar isbotlaydi. Masalan, menyuda yashirilgan hisobotning server qismi.
  2. **Kengaytirish** faqat o'z ma'lumotiga (`@AnyUser`, `@AnyStaff`). Masalan, `/salary/me/*` kassirga ham ochiladi.

**Saytdagi tenglik testi.** Har bir rol va proddagi har bir rol birikmasi uchun menyu, sozlamalar va hisobotlar ro'yxatining ko'rinishi eski `visibleForRoles` surati bilan bir xil bo'lishi kerak.

### 7.7 API

- `GET /permissions/me` → `{ keys: PermissionKey[] }` (1-bosqich). Xodimlar uchun; o'quvchiga bo'sh ro'yxat qaytadi. Yo'l ataylab `/auth/` ostida emas: saytning so'rov tutuvchisi `/auth/` so'rovlarida tokenni yangilamaydi, eskirgan token bilan ro'yxat yuklanmay qolardi.
- CEO uchun API (2-bosqich, `@CeoOnly()`, 4-bo'limning 2-bandi):
  - `GET /permissions` qaytaradi:
    - katalogni: bo'lim, nom, bog'liqlik, `allowedRoles`, qulf sababi, pul belgisi;
    - har bir rolning holatini;
    - o'zgartirilgan joylarni;
    - istisnosi bor xodimlarni.
  - `PUT /permissions/roles/:roleId` `{ changes: { key, granted }[] }` quyidagilarni tekshiradi:
    - rol CEO yoki o'quvchi emas;
    - `key` katalogda bor;
    - rol `allowedRoles` ichida;
    - natijaviy to'plam bog'liqlik bo'yicha to'g'ri.

    Boshlang'ich holatga teng bo'lib qolgan yozuv o'chiriladi. Hammasi bitta tranzaksiyada bajariladi va tarixga yoziladi.
  - `POST /permissions/roles/:roleId/reset`.
  - `GET /permissions/users/:userId` va `PUT /permissions/users/:userId` xuddi shunday ishlaydi. Xodim CEO bo'lsa yoki boshqa kompaniyada bo'lsa, so'rov rad etiladi.
  - `GET /permissions/history`.

### 7.8 Tarix

`EntityHistory` qayta ishlatiladi:

- `entityType`: `'RolePermission'` yoki `'UserPermission'`;
- `entityId` — rol yoki xodim id'si;
- `oldValues` va `newValues` — o'zgargan kalitlar;
- `changedById` va `companyId`.

## 8. Sayt tomoni

- **`usePermissions`** (zustand) `/permissions/me` ni o'qiydi:
  - `staleTime` 30 soniya;
  - oynaga qaytilganda yangilanadi;
  - serverdan 403 kelsa, axios interceptor ro'yxatni darhol qayta so'raydi. Shu tufayli yopilgan narsa xodim ekranidan tez yo'qoladi.
  - Oxirgi ma'lum ro'yxat `localStorage` da saqlanadi va sahifa ochilganda darhol ishlatiladi; yangisi fonda olinadi. Ro'yxat eskirgan bo'lsa ham xavf yo'q, chunki server o'zi tekshiradi.
- **`useCan(key | key[])`, `<Can>` va `CanLink`** (`RoleLink` o'rniga) qo'shiladi. Quyidagilar `visibleForRoles` o'rniga `permission` oladi:
  - menyu elementlari;
  - sahifa qo'riqchilari: `canOpenSettingsPath`, `canOpenReportPath`, `canOpenDafPath`, layout'lar;
  - bosh sahifa bo'limlari (masalan, pul kartalari `payments.view` ga bog'lanadi);
  - topshiriq va xabar havolalari (`task-entity-href.ts`, `notification-href.ts`);
  - umumiy qidiruv (o'quvchi, lid yoki o'qituvchi imkoniyatlaridan birortasi bo'lsa ochiladi).
- Qo'llanma sahifalarining rol filtri o'zgarmaydi: u sahifa kimga yozilganini (auditoriya) bildiradi, ruxsat emas.
- **Kalit nomlari turi** `client/src/lib/permission-keys.ts` faylida turadi. Bu server katalogining nusxasi, test ikkalasini solishtiradi (`role-grant-ceiling` dagi usul).
- **Chiqarish tartibi:** avval server, keyin sayt.
- **«Ruxsatlar» sahifasi** — `/settings/permissions`, `settings-nav.ts` ning CEO bo'limida. Maket suhbatda ma'qullangan. Tarkibi:
  - bo'limlar yig'ilib turadi va har birida «5 tadan 3 tasi» kabi hisob ko'rinadi;
  - kalit bosilganda tasdiq oynasi chiqadi, unda bog'liqlik ro'yxati bo'ladi;
  - qizil belgili amalda qo'shimcha ogohlantirish chiqadi;
  - qulflangan katakda qulf belgisi va sababi ko'rinadi;
  - sariq nuqta boshlang'ich holatdan farqni bildiradi;
  - har bir rol uchun «Boshlang'ich holatga qaytarish» tugmasi bor;
  - pastda «Istisnosi bor xodimlar» va «O'zgarishlar tarixi» bo'limlari turadi;
  - telefonda yuqorida rol tanlagich, pastda ro'yxat chiqadi.
- **Xodim kartasi** (`/settings/employees/[id]`) «Alohida ruxsatlar» bo'limini oladi. Uni faqat CEO ko'radi. Har bir imkoniyat yonida manbai yoziladi: «roldan», «shaxsan ochilgan» yoki «shaxsan yopilgan».

## 9. Telegram bot va xabarlar (3-bosqich)

- **Xodim botidagi tugmalar** (`telegram/staff/staff-cabinet.ts`, masalan «👥 Guruhlar») amaldagi imkoniyatlarga qarab ko'rsatiladi.
- **Shaxsiy xabarlar.** Hozir ba'zi joylarda xabarni oladigan xodimlar rol bo'yicha tanlanadi:
  - `notification-events.listener.ts`;
  - `absence-pause-notify.service.ts`;
  - `attendance-reminder.service.ts`;
  - `unmarked-lessons/lesson-task.ts`;
  - `telegram-group-report-menu.service.ts` va boshqalar.

  Har bir xabar o'zi olib boradigan sahifaning imkoniyatiga bog'lanadi. O'sha imkoniyati yo'q xodimga xabar ketmaydi. Umumiy yordamchi: `PermissionsService.usersWith(key, { companyId, branchId })`.
- **Rolga biriktirilgan vazifa** saqlanadi. Masalan, davomat eslatmasi administratorga boradi: rol shartligicha qoladi, imkoniyat esa qo'shimcha filtr bo'ladi.
- **Telegram guruhlariga ketadigan hisobotlar** (`telegram-groups`) o'zgarmaydi.

## 10. Imkoniyatlar katalogi (1-bosqich uchun yakuniy)

Belgilar:

- D — filial direktori, A — administrator, K — kassir, O — o'qituvchi.
- «—» — boshlang'ich holatda hech kimda yo'q, faqat CEO'da.
- «pul» — pulni o'zgartiradigan amal. «qaytmaydi» — qaytarib bo'lmaydigan amal. Ikkalasi ham sahifada qizil belgi bilan ko'rsatiladi.

Ro'yxat 10.10 dagi kod bilan route'ma-route' solishtirib tuzildi: har bir route qaysi imkoniyatga tegishli ekani 1-bosqich ish rejasining B ilovasida yozilgan. «Bog'liq» ustuni 5-bo'limdagi bog'liqlik qoidasi uchun. Texnik qulf (6-bo'lim) 2-bosqich boshida ko'rib chiqiladi. Ekrandagi nomlar 2-bosqichda haqiqiy sahifa ko'rinishi bilan CEO'ga ko'rsatiladi.

### O'quvchilar
| Kalit | Ekrandagi nomi | Boshlang'ich | Bog'liq | Belgi |
|---|---|---|---|---|
| `students.list` | O'quvchilar ro'yxati | D A | — | |
| `students.profile` | O'quvchi profilini ochish | D A K | — | |
| `students.details` | O'quvchi profilidagi tablar: to'lovlar, darslar, izohlar, lid tarixi, ilova | D A | `students.profile` | |
| `students.manage` | O'quvchi qo'shish, tahrirlash va holatini o'zgartirish | D A | `students.profile` | |
| `students.enroll` | Guruhga qo'shish va guruhdan chiqarish | D A | `students.profile`, `groups.view` | |
| `students.sms` | O'quvchiga SMS yuborish | D A | `students.details` | |
| `students.initial-balance` | Boshlang'ich balans kiritish | — | `students.profile` | pul |

### Guruhlar va davomat
| Kalit | Ekrandagi nomi | Boshlang'ich | Bog'liq | Belgi |
|---|---|---|---|---|
| `groups.view` | Guruhlarni ko'rish (o'qituvchi faqat o'z guruhlarini) | D A O | — | |
| `groups.manage` | Guruh ochish, tahrirlash va yopish | D A | `groups.view` | |
| `lessons.change` | Darsni bekor qilish, ko'chirish va o'rinbosar ustoz qo'yish | D A | `groups.view` | |
| `lessons.change-delete` | Bekor qilish, ko'chirish va o'rinbosarni o'chirish | D | `lessons.change` | pul |
| `attendance.mark` | Davomat olish | D A O | `groups.view` | |
| `attendance.fix` | Kech davomat, «Dars bo'ldimi?» javobi va oldindan aytilgan qoldirish | D A | `attendance.mark` | |

### Lidlar
| Kalit | Ekrandagi nomi | Boshlang'ich | Bog'liq | Belgi |
|---|---|---|---|---|
| `leads.view` | Lidlar doskasi | D A | — | |
| `leads.manage` | Lid qo'shish, tahrirlash va o'quvchiga aylantirish | D A | `leads.view` | |
| `leads.setup` | Doska ustunlari, bo'limlari va manbalari | D A | `leads.view` | |
| `leads.forms` | Anketalar va ularning javoblari | D A | — | |

### Aloqa markazi
| Kalit | Ekrandagi nomi | Boshlang'ich | Bog'liq | Belgi |
|---|---|---|---|---|
| `outreach.view` | Aloqa markazi sahifasi | D A | — | |
| `calls.log` | Qo'ng'iroq natijasini kiritish | D A | — | |

### Mock imtihonlar
| Kalit | Ekrandagi nomi | Boshlang'ich | Bog'liq | Belgi |
|---|---|---|---|---|
| `mock.view` | Mock imtihonlarni ko'rish | D A | — | |
| `mock.manage` | Imtihon yaratish, natija kiritish va e'lon qilish | D A | `mock.view` | |
| `mock.payments` | Mock to'lovini qabul qilish va bekor qilish | D A | `mock.view` | pul |

### To'lovlar va qarzdorlik
| Kalit | Ekrandagi nomi | Boshlang'ich | Bog'liq | Belgi |
|---|---|---|---|---|
| `payments.view` | Moliya bo'limi: to'lovlar va kutilayotgan to'lovlar | D A K | — | |
| `payments.create` | To'lov qayd qilish | D A K | — | |
| `payments.correct` | To'lovni tuzatish | D A | `students.details` | pul |
| `debt.view` | Qarzdorlik sahifasi | D A K | — | |
| `debt.promise` | To'lov va'dasini yozish | D A K | `debt.view` | |
| `balance.withdraw` | Balansdagi pulni markaz hisobiga o'tkazish | D A | `students.profile` | pul |
| `refunds.create` | O'quvchiga pul qaytarish | D A | `students.profile` | pul |
| `debt.write-off` | Qarzni kechirish | D A | `students.details` | pul |
| `balance.adjust` | Balansni qo'lda tuzatish va yechilgan dars pulini qaytarish | D | `students.details` | pul |
| `money.undo` | To'lov, pul qaytarish va qarz kechirishni bekor qilish | — | `students.details` | pul |
| `payments.gateway-log` | To'lov tizimlari jurnali (Payme, Click) | — | `payments.view` | |

### Xarajatlar va kassa
| Kalit | Ekrandagi nomi | Boshlang'ich | Bog'liq | Belgi |
|---|---|---|---|---|
| `expenses.view` | Xarajatlarni ko'rish | D | — | |
| `expenses.manage` | Xarajat kiritish, tahrirlash va o'chirish | D | `expenses.view` | pul |
| `cash.manage` | Kassa hisoblari va ular orasida o'tkazma | D | — | pul |

### Ish haqi
| Kalit | Ekrandagi nomi | Boshlang'ich | Bog'liq | Belgi |
|---|---|---|---|---|
| `salary.view` | Xodimlar oyligini ko'rish | D | — | |
| `salary.rate` | O'qituvchiga stavka qo'yish (ADR-0034 qoidalari bilan) | D | `salary.view` | pul |
| `salary.pay` | Oylik va avans to'lash | D | `salary.view` | pul |
| `salary.rate-edit` | Stavkani o'zgartirish va umumiy stavka | — | `salary.view` | pul |
| `salary.close` | Oylikni hisoblash, tasdiqlash, oyni yopish va oylik davri | — | `salary.view` | pul |

### Hisobotlar
| Kalit | Ekrandagi nomi | Boshlang'ich | Bog'liq | Belgi |
|---|---|---|---|---|
| `reports.finance` | Moliya va marketing hisobotlari | D | — | |
| `reports.payments` | To'lov hisobotlari | D A | — | |
| `reports.students` | O'quvchilar, davomat va faoliyat hisobotlari | D | — | |
| `reports.leads` | Lidlar hisoboti | D A | — | |

### Xodimlar
| Kalit | Ekrandagi nomi | Boshlang'ich | Bog'liq | Belgi |
|---|---|---|---|---|
| `teachers.view` | O'qituvchilar ro'yxati va profili | D A | — | |
| `teachers.manage` | O'qituvchi qo'shish, tahrirlash va holatini o'zgartirish | D | `teachers.view` | |
| `employees.view` | Xodimlar ro'yxati va kartasi | D | — | |
| `employees.manage` | Xodim qo'shish, tahrirlash va bloklash (ADR-0026/0027 bilan) | D | `employees.view` | |
| `employees.invite` | Telegram orqali xodim taklif qilish | D A | — | |

### Izohlar
| Kalit | Ekrandagi nomi | Boshlang'ich | Bog'liq | Belgi |
|---|---|---|---|---|
| `comments.write` | Izoh yozish | D A | — | |
| `comments.delete` | Boshqalarning izohini tahrirlash va o'chirish | — | `comments.write` | |

Topshiriqlar bu katalogga kirmaydi: ADR-0074 bo'yicha har bir xodim topshiriq bilan ishlaydi, kim kimga topshiriq bera olishini esa o'zgarmas zinapoya qoidasi hal qiladi.

### Sozlamalar
| Kalit | Ekrandagi nomi | Boshlang'ich | Bog'liq | Belgi |
|---|---|---|---|---|
| `settings.reference` | Kurslar, xonalar, dam olish kunlari va sabablar ro'yxatlari | D A | — | |
| `courses.create` | Kurs ochish va to'lov turini tanlash | D | `settings.reference` | |
| `settings.branches` | Filiallar | D | — | |
| `settings.payment` | To'lov sozlamalari (filial qismi) | D | — | |
| `settings.telegram-groups` | Telegram guruhlarini tasdiqlash va sozlash | D | — | |
| `settings.absence-pause` | Avtomatik pauza sozlamasini ko'rish | D | — | |
| `telegram.announce` | Telegram guruhlariga e'lon yuborish va botni guruhdan uzish | — | `settings.telegram-groups` | |
| `settings.company` | Kompaniya darajasidagi sozlamalar (kompaniya ma'lumotlari, avtomatik pauza, DaF normasi) | — | — | |
| `settings.archive` | Arxiv: tiklash va butunlay o'chirish | — | — | qaytmaydi |

### Bosh sahifa
| Kalit | Ekrandagi nomi | Boshlang'ich | Bog'liq | Belgi |
|---|---|---|---|---|
| `dashboard.view` | Bosh sahifa paneli | D A K | — | |

Bosh sahifaning bo'limlari mos imkoniyatga ergashadi: pul kartalari — `reports.finance`, aloqa markazi qatorlari — `outreach.view`, lid voronkasi — `reports.leads`. `dashboard.view` yo'q xodim bosh sahifada jadvalni ko'radi (bugun o'qituvchi ko'rgandek).

### DaF ilovasi va media
| Kalit | Ekrandagi nomi | Boshlang'ich | Bog'liq | Belgi |
|---|---|---|---|---|
| `daf.activity` | DaF ilovasi: markaz bo'yicha faollik | D A | — | |
| `media.view` | Media | D A | — | |

**Jami: 14 bo'lim, 64 ta imkoniyat.**

## 11. Bosqichlar

Har bir bosqich uchun alohida ish rejasi yoziladi. Birinchi reja 1-bosqich uchun: `docs/superpowers/plans/2026-10-10-ruxsatlar-1-poydevor.md`.

### 1-bosqich — poydevor (foydalanuvchiga ko'rinmaydi)

**Tarkibi:**
- katalog (10-bo'lim) va uning testlari;
- `PermissionsService`: rollar bazadan, imkoniyatlar katalogning boshlang'ich holatidan;
- route belgilari va global guard; `RolesGuard` va `@Roles` o'chiriladi;
- 375 ta xodim route'i va xizmat ichidagi «nima qila oladi» tekshiruvlari;
- `GET /permissions/me`;
- saytdagi rol tekshiruvlari va menyu ro'yxatlari imkoniyatlarga o'tadi;
- manifest va tenglik testlari (serverda route'lar, saytda menyu);
- ADR;
- `docs/role-access.md` ni qayta yozish: undagi jadval endi «boshlang'ich holat» deb ataladi, manbasi katalog bo'ladi.

**Ataylab qilinadigan o'zgarishlar.** Ekranda hech narsa o'zgarmaydi. Serverda esa 33 ta route uchun farq bor, ularning har biri reja ilovasida dalili bilan yozilgan:
- 28 ta route'da ekranda yashirilgan ma'lumot server orqali ham yopiladi. Masalan, ketgan o'quvchilar hisoboti menyuda adminga ko'rinmaydi, endi server ham bermaydi. Bu route'larni o'sha rolning birorta ekrani chaqirmaydi.
- 5 ta route — `/salary/me/*` — kassirga ham ochiladi. Bu xodimning faqat o'z oyligi.

**Chiqarish:** avval server, keyin sayt.

**Tekshiruv:**
- avtomatik testlar;
- lokal brauzerda har bir rol bilan kirib ko'rish: CEO, direktor, admin, kassir, o'qituvchi, admin + kassir;
- chiqarilgandan keyin 24 soat davomida server jurnalidagi 403 javoblar soni oldingi kun bilan solishtiriladi.

**Tugash sharti:** birorta rolning ekranida farq yo'q.

### 2-bosqich — «Ruxsatlar» sahifasi

- Avval ikki ko'rik:
  - har bir imkoniyat uchun `allowedRoles` (6-bo'lim);
  - xodimlarga tegishli ~68 ta `UNREVIEWED` route'ning filial chegarasi.
- Ikki jadval (7.2), API'ning rol qismi (7.7), sahifa va tarix.
- Saytga chiqarishdan oldin CEO'ga sahifaning haqiqiy ko'rinishi (skrinshot) ko'rsatiladi.

### 3-bosqich — istisnolar, bot va xabarlar

- Xodim istisnolari: API, xodim kartasidagi bo'lim, sahifadagi «Istisnosi bor xodimlar» ro'yxati.
- 9-bo'limdagi hamma ish.

## 12. Sinovlar

- **Katalog:**
  - bog'liqlikda aylana yo'q;
  - har bir `requires` katalogda bor;
  - `defaultRoles ⊆ allowedRoles`;
  - `label` va qulf sabablarida inglizcha so'z yo'q.
- **Bog'liqlik funksiyalari:** yoqish zanjiri, o'chirish zanjiri, barqarorlashtirish. Server va saytdagi nusxa bitta test jadvali bilan sinaladi.
- **`effectiveFor`:**
  - CEO;
  - ko'p rolli xodimda birlashma;
  - istisno qo'shish va yopish;
  - talabi yo'qolgan istisno;
  - roldan chiqarilgan xodim (token eski, baza yangi);
  - keshning tozalanishi.
- **Guard:**
  - har bir belgi;
  - belgisiz route — 403;
  - o'quvchi xodim route'iga kira olmaydi;
  - xodim o'quvchi route'iga kira olmaydi.
- **API — rad etiladigan holatlar:**
  - CEO'dan boshqa foydalanuvchi;
  - CEO rolini o'zgartirish;
  - `allowedRoles` tashqarisidagi rol;
  - bog'liqlikni buzadigan to'plam;
  - boshqa kompaniyaning xodimi.

  Muvaffaqiyatli so'rovda tarix yozuvi paydo bo'lishi ham tekshiriladi.
- **Manifest va tenglik testlari** (7.6).
- **Mavjud testlar:** `*.branch-isolation.spec.ts` va ADR-0026/0027 testlari o'zgarishsiz yashil qoladi.
- **Sayt:**
  - menyu ko'rinishining tengligi;
  - `useCan`;
  - 403 kelganda ro'yxatni qayta so'rash;
  - sahifadagi tasdiq oynasining matni.

## 13. Xavflar

| Xavf | Chora |
|---|---|
| O'tkazish paytida biror route'ning rollari o'zgarib qoladi | Tenglik testi; har bir farq sababi bilan ro'yxatda turadi |
| Menyu va server farqini tuzatish ekranni buzadi | Toraytirishga faqat sayt kodidagi chaqiruvlar bilan isbotlanganda ruxsat beriladi |
| Yangi rolga berilgan imkoniyat sinalmagan kodga olib boradi | Texnik qulf (6-bo'lim) |
| Server bir nechta nusxada ishlasa, o'zgarish kechikadi | Kechikish 10 soniyagacha; kerak bo'lsa Redis versiya kaliti qo'shiladi |
| Sayt serverdan oldin chiqariladi | Chiqarish tartibi: server, keyin sayt. Sayt oxirgi ma'lum ro'yxat bilan ishlayveradi |
| Migratsiya prodda xato beradi | Faqat ikkita yangi jadval qo'shiladi, mavjud jadvallarga tegilmaydi |

## 14. Qamrovdan tashqarida

- Yangi rol yaratish (Q1 da rad etilgan).
- Bir rol uchun filial bo'yicha har xil sozlama. Bu ehtiyojni istisno qoplaydi.
- Maydon darajasidagi ruxsat (masalan, «telefon raqamini ko'rmasin»).
- Muddatli ruxsat (masalan, «bir haftaga och»).
- O'quvchi portali.
- Telegram guruhlariga ketadigan hisobotlar.
- Filial direktorining o'z xodimlariga ruxsat berishi. So'rovda tizimni faqat CEO boshqarishi aytilgan.

## 15. O'zgarishlar

- 2026-10-05 — birinchi yozilishi.
- 2026-10-10 — 1-bosqich rejasidan oldin kod bilan qayta solishtirildi:
  - **Route'lar soni** 453 ga yetdi. Topshiriqlar alohida bo'limga chiqdi (ADR-0074), ularning 17 ta route'i hamma xodimga ochiq.
  - **Katalog yakunlandi:** 14 ta bo'lim, 64 ta imkoniyat.
    - `tasks.assign` olib tashlandi: kim kimga topshiriq berishini ADR-0074 zinapoyasi hal qiladi.
    - `debt.frozen` o'rniga `balance.withdraw` qo'shildi: o'tkazish oynasi o'quvchi profilida ham bor.
    - `reports.payments` ajratildi: 05.10 da CEO to'lov hisobotlarini adminga ochgan.
    - `dashboard.view` qo'shildi.
    - «Topshiriqlar va izohlar» bo'limi «Izohlar» bo'ldi.
  - **Bosqichlar chegarasi:** jadvallar, CEO API'si, `allowedRoles` ko'rigi va `UNREVIEWED` ko'rigi 2-bosqichga o'tdi. 1-bosqichda CEO hech narsani o'zgartira olmaydi, ular faqat 2-bosqichda kerak bo'ladi.
  - **Yo'l nomi:** `GET /auth/permissions` o'rniga `GET /permissions/me` (7.7).
  - **Ataylab o'zgarishlar** ro'yxati tuzildi: 33 ta route (11-bo'lim).
- 2026-10-10 (reja) — qo'llanmaning rol filtri imkoniyatga o'tmaydi: u auditoriya, ruxsat emas (8-bo'lim).
