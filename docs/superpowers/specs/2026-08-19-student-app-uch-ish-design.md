# Student App: uz/de til, backend mustahkamlash, o'quvchiga push

**Sana:** 2026-08-19
**Holat:** Dizayn ma'qullangan (CEO, 2026-08-19)
**Qamrov:** uchta mustaqil ish = uchta alohida PR

## Nima uchun

Student App tahlili (2026-08-19) uchta aniq bo'shliqni ko'rsatdi:

1. **Yozilgan ish main'ga chiqmagan.** `origin/feat/student-app-learning-hub`
   (bitta WIP commit `3ff2b33`, 2026-07-07, PR ochilmagan) ichida uz/de ikki
   tilli qatlam bor. Xotirada bu ish «yo'qolgan» deb qayd etilgan edi — noto'g'ri.
2. **Uchta backend MUST-HAVE bajarilmagan** (dastlabki reja
   ro'yxatidan 3, 5, 6-bandlar): to'lov `returnUrl` oq ro'yxati, refresh token
   muddati, versiya gate.
3. **Push infratuzilmasi qurilgan va bekor turibdi.** Ilova qurilma tokenini
   ro'yxatdan o'tkazadi, server undan hech qachon foydalanmaydi.

## Boshqaruvchi qarorlar

| Qaror | Tanlov | Sabab |
|---|---|---|
| Dummy ma'lumot | **Ishlatilmaydi** | CEO: «faqat real datalar bilan ishlaymiz» |
| O'quv ekranlari (Jang, Lug'at, Peshqadamlar, Hören, Darslar, Resurslar) | Ko'chirilmaydi | Ular uchun backend umuman yo'q; hammasi qattiq yozilgan massivlardan oziqlanadi |
| Darslar / Resurslar tab'lari | «Tez orada» plagi bo'lib qoladi | CEO tanlovi |
| Telegram va push dublikati | Ikkalasi ham yuboriladi | Telegram `SmsMessage` qatoriga yoziladi (audit izi); push yetkazilganini ishonchli bilib bo'lmaydi |
| Web va native parity | Parallel, lekin ketma-ket alohida PR | Bitta PR tekshirib bo'lmas darajada kattalashadi. Qarang: «Web va native parity» qaydi |

---

# 1-ish: uz/de ikki tilli qatlam (native)

## Yondashuv

`git rebase` **qilinmaydi**. Branch'da 6000 qatorlik `package-lock.json` farqi,
4 ta mp3 va 7 ta dummy ekran bor — ularni ko'chirib keyin o'chirish tarixni
loyqalatadi. O'rniga main'dan toza branch olinadi va faqat keraklisi
ko'chiriladi. `origin/feat/student-app-learning-hub` **tegilmaydi**, arxiv
sifatida qoladi.

## Ko'chiriladigan

- `src/i18n/de.ts` — nemischa lug'at
- `src/i18n/index.ts` — zustand store; tanlov `expo-secure-store` da
  `app-lang` kaliti ostida saqlanadi; `useT()` / `useLang()` / `useSetLang()`
- `src/i18n/uz.ts` — `export type Dict = typeof uz`, ya'ni o'zbekcha lug'at
  shakl manbai. Main'da branch'dan keyin qo'shilgan 4 ta kalit qo'shib ketiladi
- 13 ta ekranni `t` → `useT()` ga o'tkazish (ekran mantig'i o'zgarmaydi)
- `settings.tsx` — «Til — Tez orada» plagi o'rniga haqiqiy almashtirgich
- Tab nomlari `t.nav[route.name]` dan
- Root `_layout.tsx` — til store'ini hydrate qilish, boot shu tayyor bo'lguncha kutadi

## Ko'chirilmaydigan

Jang (`battle.tsx`, `battle-play.tsx`), Lug'at (`vocabulary.tsx`),
Peshqadamlar (`leaderboard.tsx`, `data/leaderboard.ts`), Hören (`hoeren.tsx`),
gamifikatsiyalangan Home (skill barlar + 4 hub karta + no-op bildirishnoma
qo'ng'irog'i), `hub-card.tsx`, `skill-bars.tsx`, `audio-player.tsx`,
`assets/audio/*.mp3`, `expo-audio` va `expo-asset` override.

Shunga mos ravishda `uz.ts`/`de.ts` dagi `darslar`, `resurslar`, `vocabulary`,
`battle`, `battlePlay`, `hoeren`, `leaderboard` bo'limlari **tushiriladi**.
Qoladigan bo'limlar: `common`, `nav`, `tabs`, `auth`, `forgotPassword`, `home`,
`schedule`, `attendance`, `payments`, `profile`, `more`, `settings`, `scan`,
`about`, `faq`.

## Natijaviy xossalar

- **Birorta yangi paket qo'shilmaydi.** i18n qatlami mavjud `zustand` +
  `expo-secure-store` ustida ishlaydi. Lockfile tegilmaydi, EAS qayta build
  shart emas.
- Kalit yetishmasa `Dict` tipi kompilyatsiyada yiqiladi — jim bo'shliq
  bo'lishi mumkin emas.
- Til qoidasi: o'quv atamalari (Wortschatz, Hörübung, A1, Grundstufe) ikkala
  tilda ham nemischa qoladi; faqat interfeys tili almashadi.

## Xavf

DE tarjimasi ilgari dummy ekranlar bilan birga yozilgan. Saqlanadigan 15
bo'limda tarjima to'liqligini `tsc` kafolatlaydi, **sifatini** esa yo'q — matnlar
ko'zdan kechiriladi.

---

# 2-ish: uchta backend fix

## a) Refresh token muddati (MUST-HAVE #5)

**Hozir:** `generateTokens` ([auth.service.ts:181](../../../server/src/auth/auth.service.ts))
barcha portallar uchun umumiy va refresh tokenga `expiresIn: '24h'` beradi.
O'quvchi ilovaga har kuni qaytadan kiradi.

**Muammo:** muddatni global oshirish admin panel sessiyasini ham 30 kunga
uzaytiradi — xavfsizlik chekinishi.

**Yechim:** muddat sessiya turiga bog'lanadi.

| Sessiya | Refresh muddati |
|---|---|
| Native ilova (`X-Portal: student`) | **30 kun** |
| Admin, o'qituvchi, web student | 24 soat (o'zgarishsiz) |

Refresh token o'z ichiga muddat sinfini olib yuradi:
`{ sub, type: 'refresh', ttl: 'long' }`. Token yangilanganda
([auth.service.ts:354](../../../server/src/auth/auth.service.ts)) o'sha sinf
saqlanadi — native sessiya rotatsiyadan keyin ham uzun, web esa qisqa qoladi.

`generateTokens` ga ixtiyoriy `longLived` parametri qo'shiladi. U ikki joyda
`true` bo'ladi:

- `login()` — `portal === 'student'` bo'lganda (telefon+parol bilan kirish)
- `buildStudentSession()` — **har doim**. Uning yagona chaqiruvchisi
  `pollLoginRequest`, ya'ni ilovaning Telegram orqali kirishi; bu metod
  allaqachon rol 6 ni majburlaydi va web bu yo'ldan kirmaydi. Bu bandsiz
  Telegram orqali kirgan o'quvchi 24 soatda chiqib ketaverardi.

Access token 1 soatligicha qoladi.

**Ochiq e'tirof:** tizimda refresh tokenni bekor qilish ro'yxati yo'q. 30
kunlik token o'g'irlansa 30 kun yashaydi. Bu bugun ham shunday (24 soat), biz
oynani kengaytiramiz. Token bekor qilish jadvali — alohida ish, bu qamrovda emas.

## b) To'lov `returnUrl` oq ro'yxati (MUST-HAVE #3)

**Hozir:** [init-payment.dto.ts](../../../server/src/students/dto/init-payment.dto.ts)
`returnUrl` sifatida ixtiyoriy satrni qabul qiladi va u to'g'ridan-to'g'ri Payme
`c=` yoki Click `return_url` parametriga qo'yiladi. Ya'ni har qanday o'quvchi
to'lovdan keyin foydalanuvchini begona saytga yuboradigan havola yasay oladi.

**Yechim:** yangi tekshiruv yozilmaydi — loyihada `isKnownPortalOrigin()`
([portal-roles.config.ts](../../../server/src/auth/portal-roles.config.ts)) bor,
u Telegram OAuth qaytish manzili uchun aynan shu ishni bajaradi: faqat ma'lum
portal hostlari, faqat `https` (localhost istisno), `user:pass` shakli rad
etiladi. `returnUrl` parse qilinib shu funksiyaga beriladi; o'tmasa `400`.

Ta'sir: web portal `https://student.dafzentrum.uz/portal/payments/result`
yuboradi ([student-payment-summary.tsx:85](../../../client/src/components/student-portal/student-payment-summary.tsx)) —
o'tadi. Native ilova `returnUrl` umuman yubormaydi, serverdagi standart
qiymat ishlatiladi — o'tadi. Ya'ni ikkala klient uchun ham hech narsa buzilmaydi.

**Status-poll endpoint bu qamrovda emas.** Ilova to'lov holatini bilmaydi,
webhook'ga tayanadi. Bu ma'lum bo'shliq, alohida ish.

## c) Versiya gate (MUST-HAVE #6)

**Maqsad:** eski build yangi backend bilan tushunisha olmay qolganda ilova jim
qulamasin, tushunarli «yangilang» ekranini ko'rsatsin.

**Mexanizm:**

1. Ilova har so'rovga `X-App-Version: <version>` qo'shadi — `X-Portal` yonidagi
   bitta qator ([client.ts](../../../student-app/src/api/client.ts)).
2. Kichik global guard: so'rov native ilovadan (`X-Portal: student`) va versiya
   `MIN_APP_VERSION` dan past bo'lsa → **426 Upgrade Required**
   (Nest'da tayyor klass yo'q, `new HttpException(msg, 426)`).
3. Ilova javob interceptor'ida 426 ni ushlaydi → zustand bayrog'i → root layout
   butun ilova o'rniga bloklovchi ekran chizadi: «Ilovaning yangi versiyasi
   chiqdi» + Play Market tugmasi.

**Standart holatda gate o'chiq — bu eng muhim tafsilot.** Bugungi 1.0.0 bu
headerni umuman yubormaydi. «Header yo'q = eski» deb bloklansa, `MIN_APP_VERSION`
qo'yilgan zahoti hamma o'rnatilgan ilova o'lardi. Shuning uchun:

- `MIN_APP_VERSION` belgilanmagan → guard umuman ishlamaydi (bugungi holat)
- Header yo'q → `0.0.0` deb hisoblanadi
- Gate faqat yangi build tarqalgandan **keyin**, Railway'da qiymat qo'lda
  ko'tarilganda yoqiladi

Ya'ni bu PR hech kimni bloklamaydi; u bloklash **imkonini** beradi.

**CORS:** `enableCors` da `allowedHeaders` belgilanmagan, Express default'i
so'ralgan headerlarni aks ettiradi — o'zgartirish shart emas.

---

# 3-ish: o'quvchiga push (web + native)

## Hozirgi holat

- Serverda 12 ta `pushService.sendToUser` chaqiruvi bor — **hammasi** o'qituvchi,
  admin, CEO yoki vazifa mas'uli uchun. O'quvchiga bitta ham push ketmaydi.
- Web portalda push umuman ulanmagan: `usePushNotifications`
  ([use-push-notifications.ts](../../../client/src/hooks/use-push-notifications.ts))
  faqat admin paneldagi bildirishnoma qo'ng'irog'ida chaqiriladi.
- Ilova tokenni to'g'ri ro'yxatdan o'tkazadi, lekin push bosilganda hech narsa
  qilmaydi — tap ishlovchisi yo'q.

## Tuzilma

**Yangi xizmat: `StudentNotifier`** (`server/src/notifications/`).
Yagona vazifasi: o'quvchi raqamidan foydalanuvchi hisobini topib,
`pushService.sendToUser` ga uzatish. `PushService` allaqachon web-push va native
Expo push'ga birga yuboradi, ya'ni brauzer va telefon bitta chaqiruvdan qamraladi.

Interfeys: `notify(studentId, { title, body, url, appRoute })`.

Telegram kodiga **tegilmaydi**. Push mavjud Telegram yuborish joylarining
yonига qo'shiladi.

## Qamraladigan voqealar

| Voqea | Fayl | Push sarlavhasi | Manzil (web / native) |
|---|---|---|---|
| To'lov qabul qilindi | `payments/payment-events.listener.ts` → `handle` | «To'lov qabul qilindi» | `/portal/payments` / `/payments` |
| To'lov bekor qilindi | `payments/payment-events.listener.ts` → `handleReversed` | «To'lov bekor qilindi» | `/portal/payments` / `/payments` |
| Dars bekor qilindi | `lesson-cancellations/lesson-cancellation-events.listener.ts` | «Dars bekor qilindi» | `/portal/schedule` / `/schedule` |
| Dars ko'chirildi | `lesson-reschedules/lesson-reschedule-events.listener.ts` | «Dars vaqti o'zgardi» | `/portal/schedule` / `/schedule` |

Davomat voqeasi **qamralmaydi** — u Telegram uchun ataylab o'chirilgan
(`STUDENT_ATTENDANCE_NOTIFICATIONS_ENABLED`), xabar juda ko'p bo'lgani uchun.

## Matnlar haqida aniqlik

Telegram xabari uzun, HTML bezakli, chek havolasi bilan; push esa telefon
ekranida ikki qatorga sig'ishi kerak. Shuning uchun **matnlar bir xil bo'lmaydi**.
Bir xil bo'ladigani — qachon yuborilishi: ikkalasi bitta listener'da, bitta
voqeada chiqadi, ya'ni biri ketib ikkinchisi qolib ketmaydi.

## Klient tomonidagi o'zgarishlar

**Web portal**
- `usePushNotifications()` o'quvchi layout'iga ulanadi
  (`student-portal-layout.tsx`)
- `public/icon-192.png` qo'shiladi — `sw.js` uni chaqiradi, fayl mavjud emas

**Native ilova**
- `Notifications.addNotificationResponseReceivedListener` → `router.push(appRoute)`
- `appRoute` `data` ichida keladi; web `url` dan alohida maydon, chunki yo'llar
  farq qiladi (`/portal/payments` ≠ `/payments`)

`sendToUser` payload tipiga ixtiyoriy `appRoute` qo'shiladi — mavjud 12 ta
chaqiruv joyi uchun orqaga mos.

## Deploydan oldingi shart

Web push VAPID kalitlari (`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`) Railway'da
sozlangan bo'lishi kerak. Sozlanmagan bo'lsa `PushService` ogohlantirish yozadi
va **jimgina hech narsa yubormaydi**. Deploydan oldin tekshiriladi.

---

# Test strategiyasi

**Server** (jest o'rnatilgan, ko'p `.spec.ts` bor) — yangi mantiqning har biriga:

- versiya solishtirish: past/teng/yuqori, header yo'q, `MIN_APP_VERSION` yo'q,
  noto'g'ri formatdagi versiya
- `returnUrl` tekshiruvi: ruxsat etilgan host, begona host, `http`, `user:pass`,
  buzuq URL, `returnUrl` umuman berilmagan
- refresh muddati sinfi: native login → `ttl: 'long'`, web login → uzun emas,
  rotatsiyada sinf saqlanadi
- `StudentNotifier`: `userId` yo'q o'quvchi (jim o'tadi), push chaqirilishi,
  xato push butun listener'ni yiqitmasligi

**Web** — mavjud test sozlamasidan foydalaniladi; yangi mantiq minimal
(bitta hook chaqiruvi).

**Native** — test infratuzilmasi umuman yo'q (0 ta test). Uni bu ishda
qurmaymiz, bu alohida qaror. Ilova tomoni `tsc --noEmit` va qo'lda sinovdan
o'tadi.

# PR va deploy tartibi

| PR | Qamrov | Deploy |
|---|---|---|
| 1 | uz/de i18n (native) | Faqat ilova. EAS build; yangi paket yo'q |
| 2 | Backend mustahkamlash + ilovaning versiya headeri/ekrani | Railway (`railway up`) + EAS build |
| 3 | O'quvchiga push (server + web + native) | Railway + Vercel + EAS build |

**Muhim ketma-ketlik:** `MIN_APP_VERSION` faqat 2-PR ning build'i o'quvchilarga
tarqalgandan keyin ko'tariladi. PR merge qilinishi bilan emas.

# Qamrovdan tashqarida (ro'yxatga yozildi)

- Web portalga uz/de — keyingi alohida PR
- Ilovaga AI chat (backend tayyor, `/portal/ai` web'da bor)
- Web'ga QR davomat
- To'lov status-poll endpoint'i
- Refresh token bekor qilish jadvali
- Ilova uchun test infratuzilmasi
- O'quv kontenti backend'i (dars, resurs, lug'at, XP) — busiz
  `origin/feat/student-app-learning-hub` dagi ekranlar ma'nosiz
