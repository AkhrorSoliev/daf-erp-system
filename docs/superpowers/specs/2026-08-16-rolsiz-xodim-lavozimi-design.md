# Rolsiz xodim va uning lavozimi — dizayn

> Holat: **Tasdiqlangan, amalga oshirish kutilmoqda** · Sana: 2026-08-16
> Muammo: farrosh, qorovul kabi xodimlarni tizimga qo'shib bo'lmaydi —
> forma majburan tizim roli tanlashni talab qiladi, rol esa huquq beradi.

## 1. Kontekst

`edit-employee-form.tsx` da «Lavozimlar» maydoni majburiy va faqat beshta tizim
rolidan iborat: CEO (1), Direktor (2), Administrator (3), O'qituvchi (4),
Kassir (5). Bu ro'yxat `Role` jadvaliga mos, va shu jadval butun tizimda
huquqni belgilaydi (`@Roles()` qorovullari, `portal-roles.config.ts`,
`GRANTABLE_ROLE_IDS`).

Natijada oylik oladigan, lekin tizimda hech qanday ishi yo'q xodimni
(farrosh, qorovul, haydovchi va h.k.) qo'shishning yo'li yo'q. Uni qo'shish
uchun yagona chora — biror rol berish, masalan Administrator. Bu ikki xato
qiladi: lavozimi noto'g'ri yoziladi, va unga kerak bo'lmagan huquq beriladi.

Bu, ayni paytda, «Xodimlar stavkalari» ro'yxatining (⚙ Sozlamalar) to'liq
ishlashiga ham to'sqinlik qiladi — u xodimni ko'rsatadi, lekin ro'yxatga
tushmagan xodimning stavkasini belgilab bo'lmaydi.

## 2. Qaror: lavozim va rol — ikki alohida narsa

| Maydon | Ma'nosi | Kimda bor |
|---|---|---|
| **Lavozim** (`User.position`) | ish nomi — «O'qituvchi», «Administrator», «Farrosh» | **hamma xodimda**, majburiy |
| **Rol** (`UserRole`) | tizimga kirish huquqi | faqat tizimda ishlaydiganlarda, ixtiyoriy |

«Tizimga kiradimi?» degan savol alohida tanlov emas — **rol berilganmi**
degan savolning natijasi. Rol tanlanmasa, login/parol bo'limi ko'rsatilmaydi
va xodim hech qaysi portalga kira olmaydi.

### Ko'rib chiqilgan va rad etilgan variantlar

**`Role` jadvaliga huquqsiz qator qo'shish** (masalan «Farrosh», id 7).
Eng arzon yo'l: sxema o'zgarmaydi, forma allaqachon ko'p rol tanlaydi.
Rad etildi — huquq jadvaliga huquqsiz qator qo'yish tuzoq. Rol id/nomlari
`@Roles()` qorovullarida, portal ro'yxatida va oylik filtrlarida ishlatiladi;
kelajakda biror joy bu qatorni istisno qilishni unutsa, farroshga jimgina
huquq berilib qoladi.

**Ikki rejimli forma** («Tizim xodimi» / «Oddiy xodim» tanlovi).
Rad etildi — formaga yashirin holat kiritadi va lavozim faqat yarim
xodimlarda to'ldiriladi, ya'ni «Lavozim» ustuni ikki xil manbadan o'qishga
majbur bo'ladi. Bu hozirgi muammoning yangi ko'rinishi.

**`Position` jadvali + FK (boshqariladigan ro'yxat).**
Hozircha kechiktirildi — 3-bo'limga qarang.

## 3. Hajm: matn ustuni, jadval emas

Bu bosqichda lavozim — `User.position String?`, oddiy nullable ustun.
Alohida jadval, FK, CRUD endpointlari, urug'lantirish va backfill yo'q.

**Nega:** boshqariladigan ro'yxat migratsiya + 2 endpoint + «yangi lavozim»
dialogi + 5 nomni urug'lantirish + mavjud xodimlarga backfill talab qiladi.
Muammo esa 13 xodimli, bitta boshqaruvchili markazniki. Matn ustuni bugun
yechim beradi.

**Narxi:** «Farrosh» va «farrosh» ikki xil yozilishi mumkin. Xodimni
tahrirlab to'g'rilanadi. Lavozim bo'yicha filtr/guruhlash bu bosqichda yo'q.

**Keyingi bosqichga o'tish sharti** (uchtasidan biri haqiqat bo'lsa):
hisobotda lavozim bo'yicha filtr/guruhlash kerak bo'lsa; xodim qo'shadigan
odam bittadan ko'p bo'lsa; lavozim nomini bir joyda o'zgartirib hammasida
o'zgarishi kerak bo'lsa. O'sha paytda mavjud matnlarni `Position` jadvaliga
ko'chirish — xavfsiz va arzon backfill. Matndan jadvalga o'tish oson,
teskarisi qiyin, shuning uchun bu tartib ortiqcha ish tug'dirmaydi.

## 4. Backend

### 4.1 Sxema

`User` modeliga bitta maydon:

```prisma
position String?
```

Migratsiya `prisma migrate dev` orqali emas — bu repoda u ishlamaydi.
`prisma migrate diff` + `db execute` + `migrate resolve` tartibi ishlatiladi.

### 4.2 DTO

- `CreateUserDto.roleIds` — `@IsArray()` saqlanadi, lekin **ixtiyoriy**
  (`@IsOptional()`), standart qiymati `[]`.
- `CreateUserDto.password` — **ixtiyoriy** (hozir `@IsNotEmpty()`).
- `CreateUserDto.position` — `@IsString()`, `@MaxLength(60)`, majburiy.
- `UpdateUserDto.position` — ixtiyoriy, `@MaxLength(60)`; yuborilsa bo'sh
  bo'lmasligi shart.

Servis lavozimni `trim()` qiladi va bo'sh qatorni rad etadi.

**Mavjud xodimlar.** `position` nullable, ya'ni hozirgi 13 xodim
o'zgarishsiz ishlayveradi va ro'yxatlarda rol nomi bilan ko'rinadi
(5.2-bo'limdagi `position ?? roleLabel(roles)`). Alohida backfill skripti
yozilmaydi — forma tahrirlashda maydonni rol nomi bilan oldindan to'ldiradi,
shuning uchun xodim birinchi marta tahrirlanganda lavozimi o'zi yoziladi.

### 4.3 Validatsiya — `assertRoleAndBranchRules`

Hozirgi metod `if (!roleIds?.length) return;` bilan erta chiqib ketadi, ya'ni
rolsiz foydalanuvchida filial tekshiruvi umuman ishlamaydi. Qayta quriladi:

1. **Lavozim majburiy** — bo'sh bo'lsa 400.
2. **Filial majburiy** — CEO rolidan boshqa har qanday holatda (rolsiz xodim
   ham shu qoidaga tushadi). Filialsiz xodim na xodimlar ro'yxatida
   ko'rinadi, na oylik hisobotiga tushadi, shuning uchun bu qat'iy.
3. **Rolsiz xodimga parol berilmaydi** — `roleIds` bo'sh bo'lsa va `password`
   yoki `login` yuborilsa, 400. Yarim ochiq eshik qoldirmaymiz.
4. Mavjud qoidalar o'z kuchida: CEO rolini faqat CEO beradi; O'qituvchiga
   filial shart; filiallar shu kompaniyaniki bo'lishi shart.

`assertRoleAndBranchRules` endi `position` ni ham parametr sifatida oladi.

### 4.4 Kirish imkoniyati — ikki qatlamli kafolat

Rolsiz xodim hech qaysi portalga kira olmaydi, va buni ikki mustaqil narsa
ta'minlaydi:

1. **Paroli yo'q.** `AuthService.validateUser` da `if (!user || !user.password)
   return null` — bu localhostda ham ishlaydi, u yerda portal roli filtri
   `null` bo'lsa ham.
2. **Portal roli filtri.** `buildAccountLookup` `roles.some.role.id ∈
   allowedRoleIds` shartini qo'yadi; rolsiz foydalanuvchi hech qachon
   topilmaydi. Bundan tashqari `login()` dagi rol darvozasi ham bor.

Ikkalasi ham kodda mavjud — yangi to'siq yozilmaydi, faqat testlar bilan
mustahkamlanadi.

### 4.5 Oylik

`SalaryStaffConfigService.listStaff` rolsiz xodimni allaqachon qamrab oladi:
uning filtri `roles: { none: { role: { name: { in: ['Teacher','Student'] } } } }`,
va bo'sh rol ro'yxati bu shartga to'g'ri keladi. Kerakli o'zgarish — `select`
ga `position` qo'shish va uni `StaffConfigRow.user` ga chiqarish, aks holda
qatorda lavozim `—` bo'lib ko'rinadi.

`SalaryConfigRowSheet` ustoz emasligini rol 4 bo'yicha aniqlaydi — rolsiz
xodimda bu `false`, ya'ni faqat **Belgilangan oylik** taklif qilinadi. Bu
allaqachon to'g'ri ishlaydi, tegilmaydi.

Stavka belgilangach xodim «Xodimlar oyligi» bo'limida o'zi paydo bo'ladi —
u FIXED_MONTHLY konfiguratsiyasidan boshlaydi, roldan emas.

## 5. Frontend

### 5.1 Forma (`edit-employee-form.tsx`)

«Lavozim va filial» bo'limi:

- Yangi **«Lavozim \*»** matn maydoni — rol katakchalaridan yuqorida.
- **«Lavozimlar»** sarlavhasi **«Tizim huquqi»** ga o'zgaradi va majburiy
  emas. Ostida bir qatorlik izoh: rol berilmasa xodim tizimga kirmaydi.
- **«Kirish ma'lumotlari»** bo'limi (login + parol) — faqat kamida bitta rol
  tanlangan bo'lsa ko'rsatiladi.
- Zod sxemasi: `position` majburiy; `roleIds` `.min(1)` shartidan xalos
  bo'ladi; parol majburiyligi «yangi xodim **va** rol tanlangan» holatiga
  bog'lanadi.

### 5.2 Ro'yxatlar

- **`/settings/employees`** — «Lavozim» ustunida `position` ko'rsatiladi;
  rol badge'lari qoladi, lekin ikkinchi darajali (rolsiz xodimda umuman
  chiqmaydi). Lavozim bo'yicha filtr bu bosqichda **yo'q**.
- **⚙ Sozlamalar → Xodimlar stavkalari** — `roleLabel(row.user.roles)`
  o'rniga `position ?? roleLabel(roles)`. `salary-utils.ts` ga kichik
  `positionLabel(user)` yordamchisi qo'shiladi.

## 6. Testlar

Backend:
- Rolsiz + lavozimli + filialli xodim yaratiladi.
- Lavozimsiz — 400.
- Rolsiz + filialsiz — 400.
- Rolsiz + parol (yoki login) — 400.
- `validateUser`: parolsiz xodim hech qanday `allowedRoleIds` bilan
  (`null` holatida ham) `null` qaytaradi.
- `SalaryStaffConfigService`: rolsiz xodim ro'yxatda va `position` bilan
  qaytadi.

Frontend:
- `npm run build` xatosiz o'tadi.

## 7. Tegilmaydigan joylar

Ustozlar ro'yxati (rol 4 bo'yicha filtrlaydi), o'quvchilar, oylik hisoblash
kroni, ledger, portal konfiguratsiyasi — hech biriga o'zgartirish
kiritilmaydi.
