# SMS orqali parolni tiklash (Eskiz OTP) — Reja

> Holat: **taklif** (tasdiqlanmagan). Sana: 2026-06-23.
> Maqsad: student portal (`student.dafzentrum.uz`) login sahifasiga **"Parolni unutdim?"** oqimini qo'shish — foydalanuvchi telefon raqamini kiritadi, **4 xonali SMS kod** (Eskiz orqali) oladi, kodni tasdiqlab yangi parol o'rnatadi.

---

## 0. Qamrov va qaror nuqtalari

**Qamrov (v1):** **web student portal** (`client/`) **VA native app** (`student-app/`). Ikkalasi ham bir xil backend endpointlarni ishlatadi (kanal/klient-agnostik). Native app'da Telegram-link login ham qoladi (muqobil yo'l).

**Qabul qilingan qarorlar (2026-06-23):**
1. ✅ **Variant B** — kod tasdiqlangach foydalanuvchi *o'zi* yangi parol o'rnatadi (1 ta SMS). Avtomatik parol SMS yo'q → **faqat Shablon 1 moderatsiya qilinadi**.
2. ✅ **Resurs nomi (matn ichida)** = **"DaF Sprachzentrum"**. Jo'natuvchi nik (`from`) — alohida, ≤11 belgi bo'lishi shart (GSM alfa-name limiti), shuning uchun u qisqaroq bo'ladi (tavsiya: `DaFZentrum`) — Eskizда ro'yxatdan o'tkazishda yakunlanadi (4.1 ga qarang).
3. ✅ **Global soatlik SMS limiti — qo'shiladi.** Bu shunchaki bitta Redis hisoblagich (deyarli tekin) bo'lib, kutilmagan xato/hujum Eskiz balansini (haqiqiy pul) bo'shatib yuborishidan himoya qiladi. Boshlang'ich qiymat **300 SMS/soat** (env orqali sozlanadi).
4. ✅ Kod uzunligi: **4 xonali**.

---

## 1. Foydalanuvchi oqimi (UX)

Login sahifasida ([client/src/app/(auth)/login/login-form.tsx](client/src/app/(auth)/login/login-form.tsx)) "Kirish" tugmasi ostida **"Parolni unutdim?"** havolasi. Bosilganda modal ochiladi (3 qadam):

```
1-qadam: Telefon raqam        →  [PhoneInput +998 __ ___ __ __]  → "Kod yuborish"
            ↓ (POST /auth/forgot-password/request)
        "Agar bu raqam tizimda bo'lsa, SMS kod yuborildi" (anti-enumeratsiya)

2-qadam: 4 xonali kod         →  [ _ _ _ _ ]  → "Tasdiqlash"   ("Kod kelmadimi? 60s dan keyin qayta yuborish")
            ↓ (POST /auth/forgot-password/verify) → resetToken
3-qadam: Yangi parol          →  [parol] [parolni takrorlang]  → "Saqlash"
            ↓ (POST /auth/forgot-password/reset)
        "Parol o'zgartirildi" → modal yopiladi → login formaga qaytadi
```

> **Variant A** tanlansa: 2-qadam (kod tasdiqlash) muvaffaqiyatli bo'lgach tizim avtomatik yangi parol generatsiya qilib **ikkinchi SMS** orqali yuboradi; 3-qadam bo'lmaydi. Bu Telegram oqimiga mos, lekin har tiklashda **2 ta SMS** (qimmatroq) va Variant B (1 SMS) dan kam qulay.

---

## 2. Eskiz moderatsiyasi (BLOKER — birinchi boshlanadigan ish)

Rasmlardagi qoidalar (Eskiz kabinet → "Mening matnlarim" → "+ Matn qo'shish"):

- **RULE A** — matnni **yakuniy aniq ko'rinishida** topshiring (placeholder emas, masalan `(KOD)` emas). O'zgaruvchan qismni (kodni) moderatorning o'zi maska qiladi.
- **RULE B** — tasdiqlash kodi bor har bir SMS'da **(1) resurs nomi** (loyiha/sayt/bot nomi) **+ (2) kodning maqsadi** ko'rsatilishi SHART. Aks holda uyali aloqa operatorlari qabul qilmaydi.
- Moderatsiya holatlari: **Moderatsiyada → Jarayonda → Tasdiqlangan / Rad etilgan**. Vaqt: ~1 soatdan 1 ish kunigacha, faqat ish kunlari 10:00–16:00 oralig'ida har 3 soatda. **Shuning uchun darhol topshirish kerak.**

### Topshiriladigan shablon (so'zma-so'z)

Variant B tanlangani uchun **faqat bitta shablon** kerak — OTP kodi (parol hech qachon SMS bilan ketmaydi):

```
DaF Sprachzentrum mobil ilovasining parolini tiklash uchun tasdiqlash kodi: 0000. Kodni hech kimga bermang. Amal qilish muddati: 5 daqiqa.
```

> **Tarix (2026-06-24 rad etildi → tuzatildi):** birinchi topshirilgan variant `DaF Sprachzentrum: parolni tiklash uchun tasdiqlash kodi: 1234. ...` Eskiz tomonidan **Punkt 2** bo'yicha rad etildi. Sabab: tasdiqlangan namunalarda (`Eskiz.uz sayti`, `Eskiz Media platformasi`, `Eskiz mobil ilovasi`) resurs nomi **doim tur so'zi bilan** keladi; bizda esa resurs turi yo'q edi va `:` matnni gap ichiga singdirmasdan yorliq qilib qo'ygan edi. OTP **mobil ilova** (talaba app) loginini/parolini tiklash uchun ekanligi sababli, yangi variant resurs nomini `DaF Sprachzentrum mobil ilovasi` ko'rinishida beradi va tasdiqlangan `... platformasi ning parolini tiklash uchun kod` strukturasini aynan takrorlaydi.
>
> Matn sof lotin/ASCII — bitta SMS segmenti (unicode emas, arzon, ~138 belgi). Ish vaqtida yuboriladigan matn tasdiqlangan shablonga **belgi-ma-belgi** mos kelishi shart (faqat o'zgaruvchan kod farq qiladi), aks holda Eskiz `REJECTED` qaytaradi. `RULE A`: `0000` aniq qiymat sifatida topshiriladi (placeholder emas, Eskiz namunalaridagidek), moderatorning o'zi o'sha joyni maska qiladi; runtime'da kod haqiqiy 4 xonali son (1000–9999) bo'ladi. `RULE B`: resurs nomi `DaF Sprachzentrum mobil ilovasi` + maqsad `parolini tiklash uchun` matn ichida bor.
>
> **Jo'natuvchi nik (`from`) eslatmasi:** SMS standarti bo'yicha alfa-name (harfli jo'natuvchi nomi) **≤11 belgi** bo'lishi mumkin. "DaF Sprachzentrum" (17 belgi) nik sifatida sig'maydi — u faqat matn *ichidagi* resurs nomi. Nik uchun qisqaroq tasdiqlangan nom kerak (tavsiya: `DaFZentrum` = 10 belgi). Bu Eskiz kabinetida nik ro'yxatdan o'tkazilganda yakunlanadi; `ESKIZ_FROM` env shu qiymatga teng bo'ladi.
>
> *(Variant A kelajakda kerak bo'lsa — yangi parol uchun ikkinchi shablon alohida moderatsiya qilinadi: `DaF Sprachzentrum: yangi parolingiz: Ab3k9npq. ...`. Hozir kerak emas.)*

---

## 3. OTP kodning to'liq hayot sikli (siyosat)

Barcha hisoblar Redis'da (`RedisService`, ioredis — `set ... EX`, `get`, `incr`, `expire`, `ttl`, `del`). Mavjud Telegram-reset throttle naqshi ([server/src/telegram/flows/password-reset-flow.ts](server/src/telegram/flows/password-reset-flow.ts)) shablon sifatida ishlatiladi, lekin kalit `studentId` o'rniga **`phone`** bo'yicha (chunki telefon o'quvchi aniqlanmasdan oldin ham ma'lum — anti-enumeratsiya uchun ham shart).

| Parametr | Qiymat | Izoh |
|---|---|---|
| Kod formati | 4 xonali raqam, **1000–9999** | `crypto.randomInt(1000, 10000)`. Boshida nol yo'q (`0042` xato terishga olib keladi). |
| Redis kalit (kod) | `otp_reset:code:<phone>` | Qiymat: kodning **hash**'i (sha256/bcrypt) + urinishlar. Ochiq kod hech qachon Redis/log/`SmsMessage`'ga yozilmaydi. |
| TTL (amal muddati) | **5 daqiqa (300s)** | Shablon 1'dagi "5 daqiqa" va Telegram'dagi 5-daqiqalik auto-delete bilan bir xil. |
| Maks. tekshirish urinishi | **3 ta** | 3 marta xato → kod o'chiriladi (`DEL`), yangi so'rov kerak. |
| Qayta yuborish kullati (cooldown) | **60 soniya** | `otp_reset:cooldown:<phone>` EX=60. |
| Bir telefonga kunlik limit | **3 ta SMS / 24s** | Telegram reset bilan bir xil (`DAILY_LIMIT=3`). Asosiy xarajat himoyasi. |
| Bir IP bo'yicha limit | **10 so'rov / soat** | `otp_reset:ip:<ip>` INCR + EXPIRE 3600. Bitta hujumchi ko'p raqam sinab ko'rmasin. |
| Global circuit-breaker | **300 SMS / soat** (env: `OTP_SMS_GLOBAL_HOURLY_CAP`) | `otp_reset:global:<soat>` INCR + EXPIRE 3600. Markaz bo'yicha "yugurib ketgan" hisobni cheklab, Eskiz balansini himoya qiladi. |
| Bir martalik (single-use) | Ha | Muvaffaqiyatli tekshiruvdan keyin kod `DEL` qilinadi. |
| Reset token (faqat Variant B) | `otp_reset:rtoken:<token>`, 32-bayt, **TTL 600s**, single-use | Kod to'g'ri kiritilgach beriladi; parol o'rnatish qadami ikkinchi OTP talab qilmaydi. Ichida `userId`. |

**Anti-enumeratsiya (muhim):** `/request` endpointi telefon mavjudligidan, portal hisobi borligidan yoki throttle holatidan **qat'i nazar bir xil 200 javob** qaytaradi:
`{ message: "Agar bu raqam tizimda mavjud bo'lsa, tasdiqlash kodi yuborildi" }`.
Cooldown/kunlik hisoblagichlar mavjud bo'lmagan raqamlarga ham qo'llaniladi (kiritilgan telefon bo'yicha), shunda xatti-harakat va vaqt bir xil bo'ladi (vaqt tahlili orqali raqam mavjudligini bilib bo'lmaydi).

---

## 4. Backend arxitekturasi (NestJS, `server/`)

### 4.1. Eskiz SMS provayderi (yangi)
`EskizService` — [docs/eskiz-uz](docs/eskiz-uz/index.html) ma'lumotnomasi asosida:
- Token olish (`POST /auth/login`, email+parol) → **Redis'da keshlash** (~25 kun TTL), avtomatik `PATCH /auth/refresh`, `401`'da bir marta retry.
- `sendSms(phone, message)` → `POST /message/sms/send` (`mobile_phone=998+telefon`, `from=ESKIZ_FROM`, `message`).
- (Keyin, ixtiyoriy) `POST /api/gateways/eskiz/callback` — Payme/Click webhook naqshidagi ([server/src/payment-gateways/gateways.controller.ts](server/src/payment-gateways/gateways.controller.ts)) ochiq endpoint, yetkazish holatini qabul qilish uchun.
- Env: `ESKIZ_EMAIL`, `ESKIZ_PASSWORD`, `ESKIZ_FROM`, `ESKIZ_CALLBACK_URL`. Token yo'q bo'lsa startup'da tushunarli xato.

> Eslatma: mavjud [SmsService.sendToStudent](server/src/sms/sms.service.ts) **faqat Telegram** orqali yuboradi va `telegramChatId` talab qiladi — qo'lda qo'shilgan o'quvchilarda u yo'q. Shu sababli OTP uchun uni qayta ishlatib bo'lmaydi; haqiqiy Eskiz kanali kerak.

### 4.2. Forgot-password endpointlari (`@Public()`, [auth.controller.ts](server/src/auth/auth.controller.ts))
| Endpoint | Body | Javob |
|---|---|---|
| `POST /auth/forgot-password/request` | `{ phone }` | Har doim bir xil 200 (anti-enumeratsiya) |
| `POST /auth/forgot-password/verify` | `{ phone, code }` | Variant B: `{ resetToken }`; Variant A: avtomatik parol SMS + success |
| `POST /auth/forgot-password/reset` | `{ resetToken, newPassword }` | Variant B: success (+ ixtiyoriy avtomatik login) |

Mavjud `@Public()` login/refresh/otp-poll yonida turadi. Yangi `ForgotPasswordService` (yoki `auth.service.ts` ichida) Redis OTP + throttle'ni boshqaradi.

### 4.3. Umumiy parol-tiklash xizmati (refactor)
Telegram va SMS oqimi bitta yadroni ulashishi uchun `password-reset-flow.ts`'dagi **`resetPassword` / `checkThrottle` / `recordThrottleHit` / `generatePassword`+hash+update+audit** mantig'i umumiy `PortalPasswordResetService` (`src/common/password-reset/`) ga ajratiladi:
- Kanal-agnostik (Telegram/SMS bilanmi — bilmaydi, faqat `{ plainPassword }` qaytaradi yoki Variant B'da parolni to'g'ridan-to'g'ri yangilaydi).
- Audit xabari parametr: Telegram → `"Telegram bot orqali tiklandi"`, SMS → `"SMS orqali tiklandi"`.
- Throttle kalitlari kanal-agnostik (`pwd_reset:*`) qoladi; OTP'ning o'z kalitlari (`otp_reset:*`) alohida.
- Mavjud Telegram sahifasi ([password-reset.scene.ts](server/src/telegram/scenes/password-reset.scene.ts)) shu umumiy xizmatni chaqiradi (buzilmaydi).

### 4.4. Telefon → hisob aniqlash (DETERMINISTIK — schema haqiqati)
**Diqqat:** `User.login` ham, `Student.phone` ham `@unique` **EMAS** (schema'da tasdiqlangan). Bitta telefon bir nechta hisobga tegishli bo'lishi mumkin (aka-uka, ota-ona raqami). Shuning uchun:
- `login = phone` bo'lgan **`User`** lar orasidan **Student roli (6)** ga ega va statusi **ACTIVE/INACTIVE** bo'lganini tanlash; bir nechta bo'lsa **eng so'nggi faolini** deterministik tanlash.
- Bu login mexanizmiga mos (`validateUser` `findFirst({ where: { login } })` + portal-rol gate), shunday qilib tiklangan hisob — aynan o'quvchi student portalda kiradigan hisob.
- Status SUSPENDED/TERMINATED/ARCHIVED bo'lsa — tiklamaydi (lekin javob baribir bir xil, anti-enumeratsiya).
- `userId IS NULL` (portal hisobi yo'q) — javob bir xil; ichkarida jim o'tkaziladi yoki (ixtiyoriy) hisob avtomatik yaratiladi.

### 4.5. Audit va loglar
- Har tiklash `EntityHistoryService.recordUpdate({ entityType: 'Student', newValues: { parol: 'SMS orqali tiklandi' } })`.
- OTP yuborish `SmsMessage` qatori sifatida yoziladi, lekin **kod matni maskalanadi** (`content = "Parol tiklash kodi yuborildi"`, ochiq kod EMAS).

### 4.6. Schema o'zgarishi (ixtiyoriy, observability uchun)
`SmsMessage` ga `channel` (`TELEGRAM` | `SMS`/`ESKIZ`) va `providerMessageId`/`requestId` ustunlari — Eskiz callback yetkazish holatini bog'lash uchun. OTP tekshiruvi uchun shart emas. Migratsiya: **`prisma migrate dev` ishlatilmaydi** — diff + `db execute` + `migrate resolve` ([loyiha qoidasi](docs)); prod migratsiyasi qo'lda (`railway`).

---

## 5. Frontend — web (`client/`, Next.js 16 / React 19)

- **Havola:** [login-form.tsx](client/src/app/(auth)/login/login-form.tsx) ga "Parolni unutdim?" qo'shish, `useState` bilan modal ochish.
- **Yangi komponent:** `client/src/components/auth/forgot-password-dialog.tsx` — 3 qadamli modal (shadcn `Dialog`), qadam holati `useState`.
- **Telefon:** mavjud [PhoneInput](client/src/components/ui/phone-input.tsx) (+998 formatlash, 9 xonali raw chiqaradi) qayta ishlatiladi.
- **Validatsiya:** `client/src/lib/schemas/forgot-password-schema.ts` — Zod (`phone` 9 xona, `code` 4 xona, `newPassword` min, `confirmPassword`).
- **So'rovlar:** TanStack Query `useMutation` × 3 (request/verify/reset); xato/muvaffaqiyat `react-hot-toast` orqali; xabar `getErrorMessage()` bilan ([client/src/lib/get-error-message.ts](client/src/lib/get-error-message.ts)).
- **Kod kiritish:** 4 xonali `inputMode="numeric"` maydon; "60s dan keyin qayta yuborish" taymeri.
- Alohida route shart emas — `/login` da modal.

## 5.5. Frontend — native app (`student-app/`, Expo + expo-router)

Native login ([student-app/src/app/(auth)/login.tsx](student-app/src/app/(auth)/login.tsx)) phone+password forma + "Telegram orqali kirish" tugmasiga ega. Qo'shiladi:

- **Havola:** login ekraniga "Parolni unutdim?" tugmasi (`variant="ghost"`, login tugmasi ostida) → `router.push('/(auth)/forgot-password')`.
- **Yangi ekran:** `student-app/src/app/(auth)/forgot-password.tsx` — 3 qadamli (telefon → kod → yangi parol), qadam holati `useState`. Mavjud design system komponentlari (`@/design/components`: `Screen`, `Input`, `Button`, `Text`), NativeWind className, xato `Alert.alert(getErrorMessage(e))` ([@/lib/get-error-message](student-app/src/lib/get-error-message.ts)).
- **API:** [student-app/src/api/auth.ts](student-app/src/api/auth.ts) ga 3 funksiya — `requestPasswordReset(phone)`, `verifyResetCode(phone, code) → { resetToken }`, `resetPassword(resetToken, newPassword)`. `@tanstack/react-query` `useMutation` (mavjud `login()` naqshi).
- **i18n:** matnlar [student-app/src/i18n/uz.ts](student-app/src/i18n/uz.ts) ga (`t.auth.*` naqshi).
- **Telefon:** 9 xonali, `v.replace(/\D/g, '').slice(0, 9)` (login ekranidagidek).
- Muvaffaqiyatdan keyin login ekraniga qaytadi (`router.back()`), foydalanuvchi yangi parol bilan kiradi. Telegram-link login muqobil yo'l sifatida qoladi.

> Ikkala klient ham aynan bir xil 3 endpointni chaqiradi — backend bitta, faqat UI har xil.

---

## 6. Fazalar (bosqichma-bosqich)

| Faza | Ish | Bog'liqlik |
|---|---|---|
| **Faza 0 — Eskiz tayyorgarlik** (tashqi, parallel) | Eskiz akkaunt + balans; brend nik (`from`, ≤11 belgi, masalan `DaFZentrum`) ro'yxatdan o'tkazish; **Shablon 1 moderatsiyaga topshirish**. | Boshqa hammasidan oldin boshlanadi (~1 ish kuni kutish). |
| **Faza 1 — EskizService** | `EskizService` (token kesh/refresh/retry, `sendSms`), env var'lar, sandbox test (`from=4546`, "Bu Eskiz dan test"). | Faza 0 (nik) bilan parallel boshlanadi; haqiqiy yuborish nik tasdiqlangach. |
| **Faza 2 — OTP backend** | 3 ta `@Public()` endpoint; Redis OTP + throttle; `PortalPasswordResetService` refactor; deterministik telefon→hisob; audit; testlar. | Faza 1. |
| **Faza 3 — Frontend (web + native)** | **Web:** "Parolni unutdim?" havola + 3 qadamli modal + Zod + mutatsiyalar. **Native:** login'ga havola + `forgot-password.tsx` ekrani + `api/auth.ts` 3 funksiya + i18n. | Faza 2 (endpoint shakli). Web va native parallel qilinadi. |
| **Faza 4 — Test + deploy** | Unit (OTP/throttle/anti-enum) + controller guard testlari; e2e qo'lda (haqiqiy SMS); `npm test`; deploy (Vercel + Railway). | Faza 2–3. |

---

## 7. Test rejasi

- **Unit:** `forgot-password.flow.spec.ts` — kod generatsiya (1000–9999), Redis set/get/hash, TTL tugashi, 3-urinish bloki, cooldown, kunlik limit, anti-enumeratsiya (mavjud/mavjud emas bir xil javob), status gating (SUSPENDED rad), deterministik telefon→hisob (bir nechta User bo'lsa).
- **Controller:** `auth.controller.spec.ts` — 3 endpoint `@Public()` ekani.
- **Shared service:** `PortalPasswordResetService` — Telegram oqimi buzilmaganini tasdiqlash.
- **Qo'lda e2e:** haqiqiy telefonga SMS (Faza 0 tasdiqlangach), 5-daqiqa muddati, 3-urinish, qayta yuborish 60s.
- `npm test` (to'liq) — hammasi o'tishi shart.

---

## 8. Qarorlar va qolgan xavf-xatarlar

**Hal qilingan (2026-06-23):**
- ✅ Oqim: **Variant B** (kod → o'z parolini o'rnatish, 1 SMS).
- ✅ Resurs nomi: **DaF Sprachzentrum** (matn ichida).
- ✅ Global soatlik limit: **qo'shiladi** (300/soat, sozlanadi).
- ✅ Native app: **v1 ga kiradi** (web bilan parallel).
- ✅ Kod: **4 xonali**.

**Qolgan kichik tasdiqlar / xavflar:**
1. **Brend nik (`from`)** — Eskizда ro'yxatdan o'tkazishda yakuniy ≤11-belgi satr tasdiqlanadi (tavsiya `DaFZentrum`). Reja uchun bloker emas.
2. **Telefon bir nechta hisobga ulanishi** — deterministik qoida (role 6, ACTIVE/INACTIVE, eng so'nggi faol). Implementatsiyada tasdiqlanadi.
3. **Yetkazish kechikishi** — SMS kechiksa/telefon o'chiq bo'lsa foydalanuvchi qotib qoladi → Telegram reset muqobil yo'l sifatida saqlanadi; UI'da "kod kelmadimi?" matni.
4. **Eskiz balansi** — har tiklash = 1 ta haqiqiy SMS (pul). Per-phone (3/kun) + per-IP (10/soat) + global (300/soat) limitlar himoya qiladi.

---

### Qisqa xulosa
Eng katta vaqt-bog'liqlik — **Eskiz shablon moderatsiyasi** (Faza 0), shuning uchun u darhol boshlanadi. Kod tomonda asosiy yangilik — `EskizService` + 3 ta public endpoint + Redis OTP siyosati; parol-tiklash yadrosi mavjud Telegram oqimidan ajratib olinadi va ikkalasi ulashadi.
