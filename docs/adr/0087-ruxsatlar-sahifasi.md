# ADR-0087 — «Ruxsatlar» sahifasi: CEO rol imkoniyatlarini o'zgartiradi, bazada faqat farq saqlanadi, texnik qulf server va ekranda bir xil

**Holati:** Qabul qilindi
**Sana:** 2026-10-11
**Bog'liq:** ADR-0026, ADR-0027, ADR-0030, ADR-0075, ADR-0079, ADR-0081, ADR-0082, `docs/superpowers/specs/2026-10-05-ruxsatlar-tizimi-design.md`

## Kontekst

ADR-0079 da ruxsat imkoniyatga o'tdi, lekin boshlang'ich holatni faqat dasturchi o'zgartira olardi. CEO (05.10.2026) har bir rol nima qila olishini o'zi yoqib-o'chirmoqchi. Buning uch xavfi bor:

1. Imkoniyat yangi rolga berilsa, kod hech qachon sinamagan yo'l ochiladi: filial chegarasi tekshirilmagan route, butun kompaniyaga ta'sir qiladigan yozuv yoki xizmat ichidagi rol taxmini.
2. Imkoniyatlar bir-biriga tayanadi: talabi o'chirilgan imkoniyat yarim ishlaydi.
3. O'zgarish qachon kuchga kirgani va kim nimani o'zgartirgani noma'lum qoladi.

## Qaror

1. **Sahifa va API faqat CEO uchun.** Sahifa — `/settings/permissions`. API — `GET /permissions`, `PUT /permissions/roles/:roleId`, `POST /permissions/roles/:roleId/reset`, `GET /permissions/history`. Ularda yangi belgi turadi: `@CeoOnly()`. U bazadan o'qilgan rollarda CEO bor-yo'qligini tekshiradi. Bu imkoniyat emas: katalogda yo'q va hech kimga berilmaydi. Sozlamalar menyusida sahifa `ceoOnly` bilan belgilangan, ya'ni CEO kimligi (rol id 1) bo'yicha ko'rinadi.
2. **Bazada faqat farq saqlanadi.** Yangi jadval `RolePermission (companyId, roleId, key, granted)`. Boshlang'ich holatga teng bo'lib qolgan yozuv o'chiriladi. Jadval bo'sh holda qo'shiladi, shuning uchun chiqqan kuni hech kim uchun hech narsa o'zgarmaydi. «Boshlang'ich holatga qaytarish» shu rolning yozuvlarini o'chiradi. O'qishda katalogda yo'q kalit tashlab yuboriladi va jurnalga yoziladi.
3. **Texnik qulf.** Har bir imkoniyatda `allowedRoles` bor: shu imkoniyat berilishi mumkin bo'lgan rollar. Ro'yxatdan tashqaridagi har bir rolga bitta sabab yoziladi (`lockReasons`). Sabablar oltita:
   - «o'qituvchi faqat o'z guruhlarini ko'radi» — o'qituvchini o'z guruhlari bilan cheklaydigan kod faqat guruh va bosh sahifa yo'llarida bor;
   - «o'qituvchi saytida bunday sahifa yo'q» — o'qituvchi faqat o'z portaliga kiradi;
   - «bu rol uchun kod sinalmagan» — xizmat ichida rol bo'yicha taxmin bor;
   - «butun kompaniyaga ta'sir qiladi» — `COMPANY_WIDE` yozuv;
   - «filial chegarasi hali tekshirilmagan» — `UNREVIEWED` route yoki filialsiz id bo'yicha qidiruv;
   - «guruhga moliya hisoboti ketadi» — Telegram guruhini tasdiqlash unga 21:00 hisobotini ochadi.

   Qoidalar testlarda qotirilgan: boshlang'ich rollar `allowedRoles` ichida; `allowedRoles` bog'liqlik bo'yicha yopiq; boshlang'ichdan kengroq imkoniyatning birorta route'i `UNREVIEWED` emas va ko'rib chiqilmagan `COMPANY_WIDE` yozuvi yo'q. O'qituvchiga faqat «Guruhlarni ko'rish» va «Davomat olish» beriladi. Yetti imkoniyat faqat CEO'da qoladi: to'lov tizimlari jurnali (`payments.gateway-log`), stavkani o'zgartirish (`salary.rate-edit`), oylikni hisoblash, tasdiqlash va oyni yopish (`salary.close`, CEO 11.10), boshqalarning izohini o'chirish (`comments.delete`), Telegram guruhlariga e'lon (`telegram.announce`), kompaniya sozlamalari (`settings.company`) va arxiv (`settings.archive`). Qulfni sahifa ham, server ham tekshiradi. Qulflangan o'zgarishda tasdiq oynasi sabab bilan ochiladi, lekin tasdiqlash tugmasi bo'lmaydi. Server ham qulflangan rolga yoqishni 400 bilan rad etadi, o'qishda esa bunday yozuvni e'tiborsiz qoldiradi.
4. **Bog'liqlik bitta faylda.** Yoqilgan imkoniyat o'z talablarini birga yoqadi, o'chirilgani unga tayanganlarni birga o'chiradi. Funksiyalar `server/src/common/permissions/permission-deps.ts` da, saytdagi `client/src/lib/permission-deps.ts` uning harfma-harf nusxasi. Bitta test jadvali ikkalasini tekshiradi. Server bog'liqlikni buzadigan to'plamni 400 bilan rad etadi, o'qishda esa natijani barqarorlashtiradi.
5. **Keyingi so'rovda kuchga kiradi.** Yozuvdan keyin shu server jarayonidagi kesh darhol tozalanadi (`invalidateAll()`). Boshqa nusxada bu 10 soniyagacha cho'ziladi. Bir xodim uchun bir vaqtda kelgan o'qishlar bitta so'rovga birlashadi. Sayt `/permissions/me` ni oynaga qaytilganda, 30 soniyadan keyin va 403 dan keyin qayta o'qiydi.
6. **Tarix.** Har bir saqlash `EntityHistory` ga bitta yozuv qo'shadi (`entityType: 'RolePermission'`, `entityId` — rol). Unga bog'liqlik bilan birga o'zgargan kalitlar ham kiradi. Hech narsani o'zgartirmagan saqlash yozilmaydi. Tarix faqat `GET /permissions/history` orqali o'qiladi va sahifaning pastida ko'rinadi.
7. **Xodim istisnosi (`UserPermission`) 3-bosqichga qoldi.** Bu bosqichda uni hech bir kod o'qimaydi va yozmaydi. O'qilmaydigan jadvalni sinab bo'lmaydi; 3-bosqich uni o'z migratsiyasi bilan qo'shadi.
8. **Shu PR'dagi qo'shimcha qarorlar:**
   - **Avans** (CEO, 10.10 va 11.10). O'qituvchiga avansni (`TEACHER_ADVANCE`) yozish, tahrirlash va o'chirish faqat «Oylik va avans to'lash» (`salary.pay`) bilan mumkin. Boshqa xarajat uchun «Xarajat kiritish» (`expenses.manage`) kerak. Faqat `expenses.manage` bor xodim avans yoza olmaydi, faqat `salary.pay` bor xodim esa boshqa xarajat yoza olmaydi. Xarajat route'lari ikkala imkoniyatni qabul qiladi (`@Can('expenses.manage', 'salary.pay')`), toifa qoidasini esa `ExpensesService` tekshiradi. Oylik sahifasidagi «Avans berish» tugmasi `salary.pay` bo'yicha ko'rinadi. Bugun ikkalasi ham faqat filial direktori va CEO'da, shuning uchun hech kim uchun hech narsa o'zgarmaydi.
   - **Shartnoma.** Yangi imkoniyat «Shartnoma tuzish va imzolash» (`contracts.manage`). Uning boshlang'ich rollari filial direktori va administrator, ya'ni bugungidek. Shartnoma yozuv route'lari va saytdagi tugmalar shu imkoniyatga o'tdi. O'qish «O'quvchi profilidagi tablar» (`students.details`) da qoldi. Imzolangan shartnomani bekor qilish CEO kimligi bilan qoladi (ADR-0075).
   - **Moliya hisobotida oyliklar bor**, shuning uchun «Moliya va marketing hisobotlari» (`reports.finance`) «Xodimlar oyligini ko'rish»ni (`salary.view`) talab qiladi (CEO, 11.10).
   - **Xodimning oylik balansi** (`balance`) endi `GET /users`, `GET /users/:id`, `GET /teachers` va `GET /teachers/:id` javobida faqat `salary.view` bor chaqiruvchiga qaytadi (nazoratchilar `includeBalance` uzatadi).
   - **Xodim tarixida oylik balansi yo'q.** `User` tarixi `balance` maydonini saqlamaydi. Ilgari saqlanganini umumiy tarix yo'lida va ustoz taymlaynida o'qishda olib tashlaydi.
   - **Bosh sahifa keshi** kalitini javob tanasi bog'liq bo'lgan imkoniyat bayroqlaridan (pul va aloqa markazi) tuzadi. Pul ko'rinadigan javob bir nechta filialga to'g'ri kelsa, kalitga `:u<xodim id>` ham qo'shiladi.

## Ko'rib chiqilgan muqobillar

- **Har rol uchun to'liq to'plamni saqlash.** Rad etildi. Yangi imkoniyat qo'shilganda migratsiya kerak bo'lardi. Faqat farq saqlansa, boshlang'ich holat kodda qoladi va «qaytarish» oddiy o'chirish bo'ladi.
- **Sahifani imkoniyat qilish (masalan `permissions.manage`).** Rad etildi (spec 4-bo'lim, 2-band). Bu imkoniyatni olgan xodim o'ziga hamma narsani ocha olardi.
- **Qulfsiz: har kalit har rolga.** Rad etildi. Filial chegarasi tekshirilmagan route'lar va butun kompaniyaga ta'sir qiladigan yozuvlar ochilib qolardi.
- **Keshni Redis orqali hamma nusxada tozalash.** Rad etildi: hozir server bitta nusxada ishlaydi, 10 soniya yetarli. Kerak bo'lsa ADR-0030 dagi kabi Redis versiya kaliti qo'shiladi.
- **`UserPermission` jadvalini hozir qo'shish.** Rad etildi: 7-band.

## Oqibatlari

- Yangi imkoniyat qo'shilganda `defaultRoles`, `allowedRoles` va har qulflangan rol uchun sabab yoziladi. Ikki test buni tekshiradi: `permission-catalog.spec.ts` va `permission-allowed-roles.spec.ts`.
- Qulfni olishdan oldin imkoniyatning route'lari filial bo'yicha ko'rib chiqiladi (`branch-route-policy.ts`). Ko'rib chiqilmagan yo'l qolsa, qulf turadi.
- Chiqarish tartibi: avval server (migratsiya bilan), keyin sayt.
- Kassirga ko'p imkoniyat ochilishi mumkin, chunki server uni administrator kabi filial bilan cheklaydi. Lekin CEO bilishi kerak bo'lgan uch narsa bor:
  - kassirga ochilgan «Davomat olish» olingan davomatni tahrirlashni ham beradi;
  - «O'qituvchilar ro'yxati» yoki «Xodimlar ro'yxati» filialdagi yozuvlarning tarixi va izohlarini ham ochadi;
  - «Filiallar» o'z filialini yopishga ham imkon beradi.
- Server bir nechta nusxada ishlasa, o'zgarish 10 soniyagacha kechikadi.
