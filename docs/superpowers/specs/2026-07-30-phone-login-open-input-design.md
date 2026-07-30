# Telefon raqam = login: bot xabari va ochiq kirish inputi

Sana: 2026-07-30
Holat: tasdiqlangan (CEO), implementatsiya kutilmoqda

## Muammo

Ikki alohida, lekin bir-biriga bog'liq muammo:

1. **Bot generatsiya qilingan username beradi.** Ustoz/xodim Telegram bot orqali
   ro'yxatdan o'tganda `generateUniqueLogin` ism-familiyadan username yasaydi
   (`namangantest`) va xabarda shuni «login» deb ko'rsatadi. Ammo tizim
   2026-07-15 dan beri (PR #333) barcha rollarda telefon bo'yicha kirishga
   o'tgan. O'quvchilarda `login` allaqachon telefon raqam. Natijada bot bir
   narsani aytadi, kirish sahifasi boshqa narsani so'raydi.

2. **Chet el raqamli akkaunt tizimga kira olmaydi.** `normalizeSharedPhone`
   Telegram kontakt tugmasidan kelgan chet el raqamini mamlakat kodi bilan
   saqlaydi (`+49 174 9493338` → `491749493338`), ya'ni bazada bunday
   akkauntlar yaratilishi mumkin. Lekin:
   - kirish formasi `slice(-9)` qiladi — kod tashlab ketiladi;
   - `validateUser` faqat 9 xonali yoki `998` prefiksli 12 xonali raqamni
     tanidi.

   Ya'ni chet el raqami bilan ro'yxatdan o'tgan odam hech qachon kira olmaydi.
   Kirish inputini ochish — shunchaki ko'rinish emas, aynan shu akkauntlarni
   ishga tushiradi.

## Qabul qilingan qarorlar

| Savol | Qaror |
|---|---|
| Bazadagi `login` maydoni | Yangi akkauntlarda `login` = telefon raqam (bot VA admin panel). Mavjud akkauntlar tegilmaydi — eski username fallback sifatida ishlashda davom etadi |
| Input ko'rinishi (kirish) | Chapda o'zgarmas `+` addon, input butunlay bo'sh, jonli formatlash (`XX XXX XX XX`) yo'q — chet el raqamiga to'g'ri kelmaydi |
| Qamrov | Faqat **kirish** ekranlari: web (admin/lehrer/student) + native student-app login |
| «Parolni unutdingizmi?» | **Tegilmaydi** — avvalgidek `+998` static prefiks + 9 xonali jonli formatlangan input. Sabab: Eskiz SMS ni faqat O'zbekiston raqamlariga yetkazadi, ya'ni bu cheklov haqiqatni aks ettiradi |
| Mavjud username akkauntlar (`namangantest`) | Telefon raqami bilan kirish **allaqachon ishlaydi** — `validateUser` `User.phone` bo'yicha ham topadi. Ular bilmasligining sababi — bot ularga username aytgan. Bazada tegilmaydi, username ham ishlashda davom etadi |

## 1. Bot xabari: login = telefon raqam

`generateUniqueLogin` ishlatilmaydi, akkaunt yaratishda `login: data.phone`.

Tegiladigan joylar:
- `server/src/telegram/scenes/teacher-registration.scene.ts` (~353) — bot orqali ustoz
- `server/src/telegram/scenes/employee-registration.scene.ts` (~358) — bot orqali xodim
- `server/src/teachers/teachers.service.ts` (~213) — admin panel orqali ustoz

Yangi xabar matni (ustoz va xodim uchun bir xil shaklda, portal havolasi
avvalgidek roldan kelib chiqadi):

```
✅ Ro'yxatdan muvaffaqiyatli o'tdingiz!

📱 Sizning login (telefon raqamingiz): `901234567`
🔑 Sizning parol: `Zr24qUyG`

🌐 Platformaga kirish:
lehrer.dafzentrum.uz

⚠️ Parolni eslab qoling yoki saqlang!
```

Raqam backtick ichida — Telegramda bir tegishda ko'chiriladi. Bazada
saqlangan ko'rinishida ko'rsatiladi (O'zbekiston → 9 xona, chet el → mamlakat
kodi bilan), shunda foydalanuvchi ko'rgan narsasini aynan kiritadi.

`User.login` da DB unique cheklovi yo'q (`schema.prisma:282`), shuning uchun
bir xil raqamli ikki akkaunt yozilishini buzmaydi. Portal bo'yicha ajratish va
«eng oxirgi yangilangan akkaunt yutadi» qoidasi `validateUser` da allaqachon bor.

**Tozalash:** `generateUniqueLogin` va uning transliteratsiya jadvali hech
qayerda ishlatilmay qoladi → `server/src/telegram/utils/login-generator.ts`
o'chiriladi, `generatePassword` to'g'ridan-to'g'ri
`server/src/common/utils/password.util` dan import qilinadi.

## 2. Ochiq telefon input + backend moslash

### Client

| Fayl | O'zgarish |
|---|---|
| `client/src/app/(auth)/login/login-form.tsx` (113–133) | `+998` span → `+` addon; `formatPhoneInput` va `maxLength` olib tashlanadi; placeholder `998 90 123 45 67` |
| `client/src/app/(auth)/login/student-login-form.tsx` (84) | `addon="+998"` → `addon="+"`, formatlashsiz |
| `student-app/src/app/(auth)/login.tsx` (116) | `phone.length === 9` → kamida 8 raqam |

**Tegilmaydigan fayllar** (ataylab):
- `client/src/components/auth/forgot-password-dialog.tsx` — `+998` static
  prefiks + `formatPhoneInput` avvalgidek qoladi.
- `student-app/src/app/(auth)/forgot-password.tsx` — `length === 9` sharti
  avvalgidek qoladi.

Serverga qiymat **yozilganidek** (trim qilingan xom satr) yuboriladi —
`slice(-9)` olib tashlanadi. Yon foyda: eski username bilan kirish ham qayta
ishlaydi, chunki raqamga aylantirish endi klientda emas, serverda bo'ladi.

### Server

1. `server/src/telegram/phone-utils.ts` to'liq
   `server/src/common/utils/phone.util.ts` ga ko'chiriladi (`normalizeSharedPhone`,
   `isUzbekPhone`, `SHARED_PHONE_INVALID` — uchtasi ham), eski fayl o'chiriladi.
   Endi qoida faqat Telegramga xos emas: auth ham aynan shu normalizatsiyani
   ishlatadi, ikki joyda ikki xil qoida bo'lib ketmasligi kerak. 4 sahna importi
   yangilanadi (`teacher-`, `employee-`, `student-`, `mock-exam-registration`).

2. `server/src/auth/auth.service.ts` → `validateUser` OR shartlari kengaytiriladi:

   ```
   raw satr        → { login: identifier }            (eski username fallback)
   normalized      → { phone: normalized }, { login: normalized }
   digits (8–15)   → { phone: digits }                (998 bilan saqlangan legacy qatorlar)
   ```

   Shartlar dublikatsiz yig'iladi. 9 xonali va `998`+12 xonali xatti-harakat
   o'zgarmaydi — mavjud foydalanuvchilar uchun regressiya yo'q.

3. Parolni tiklash oqimi (`forgot-password-request.dto.ts`,
   `forgot-password.service.ts`) **tegilmaydi**: DTO avvalgidek `^\d{9}$`,
   `normalize()` avvalgidek, Redis kalitlari avvalgidek. Front ham `+998`
   prefiksni saqlab qolgani uchun bu oqim butunlay o'zgarishsiz qoladi.

## 3. Testlar

- `server/src/auth/auth.service.spec.ts` — chet el 12 xonali raqam bilan
  kirish ishlaydi; 9 xonali avvalgidek; `998`+12 xonali avvalgidek; eski
  username (`namangantest`) bilan kirish avvalgidek; **username akkaunt o'z
  telefon raqami bilan kiradi** (1-muammoning asosiy tekshiruvi).
- `server/src/common/utils/phone.util.spec.ts` — `phone-utils.spec.ts` dan
  ko'chirilgan holatlar (UZ 9/12, chet el, juda qisqa/uzun → null).
- Sahna darajasida: yaratilgan `User.login === data.phone` (ustoz va xodim),
  `generateUniqueLogin` chaqirilmasligi.
- `forgot-password.service.spec.ts` tegilmaydi (oqim o'zgarmaydi) — mavjud
  testlar yashil qolishi regressiya yo'qligining dalili.

## Joylashtirish

- Migration **yo'q**, ma'lumot o'zgartirilmaydi.
- Server: `railway up` (qo'lda — backend GitHub'ga ulanmagan; aloqasi yo'q WIP
  ni oldin stash qilish kerak).
- Client: Vercel.
- Native student-app: alohida build, shu relizga bog'lanmaydi.

## Qamrovdan tashqarida (keyingi ish)

`client/src/components/ui/phone-input.tsx` hamon 9 xonaga majburlaydi — ya'ni
admin panelda qo'lda chet el raqamli o'quvchi/ustoz kiritilmaydi. Bu so'rov
kirish sahifasi haqida bo'lgani uchun tegilmaydi.
