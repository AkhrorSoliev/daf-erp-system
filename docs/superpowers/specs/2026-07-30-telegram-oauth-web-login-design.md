# Telegram OAuth bilan kirish — web (3 portal)

Sana: 2026-07-30
Holat: dizayn tasdiqlangan (CEO), implementatsiya kutilmoqda
Bog'liq: `docs/superpowers/specs/2026-07-30-phone-login-open-input-design.md` (PR #381) — bu ish uning kimlik modeliga suyanadi

## Maqsad

Har uch web portalda («admin», «lehrer», «student») telefon+parol yonida
**«Telegram orqali kirish»** paydo bo'ladi. Ustozlar, adminlar, CEO, kassir,
o'quvchilar — hammasi.

## Nega uy qurmasi emas, Telegram'ning rasmiy OAuth'i

Bizda allaqachon Telegram orqali kirish bor, lekin **faqat student native
ilovada** va u Telegram autentifikatsiyasi EMAS: ilova `req_<uuid>` yasab
`t.me/<bot>?start=req_<uuid>` ni ochadi, bot START bosgan odamni tasdiqlaydi,
ilova poll qiladi (`app-login-otp-flow.ts`, `telegram.service.ts:264-289`,
`auth.service.ts` → `pollLoginRequest`). Ya'ni «kim START bosdi — o'sha egasi»
degan xulosani o'zimiz chiqaramiz.

**Shu yerda relay zaifligi bor:** `requestId` ni KLIENT yasaydi, tasdiqlovchi
esa boshqa odam bo'lishi mumkin — ikkisi orasida bog'lanish yo'q. Buzg'unchi o'z
brauzerida `req_X` yasab, qurbonga `t.me/bot?start=req_X` yuboradi; qurbon START
bosadi; **sessiya buzg'unchining brauzerida ochiladi**. Havola haqiqiy (`t.me`,
haqiqiy bot), parol kiritilmaydi, va «botga o'tib START bosing» — markazning
haqiqiy ko'rsatmasi, ya'ni so'rov tabiiy ko'rinadi.

Cheklovlar: 3 daqiqa TTL, bir martalik, portal darvozasi, kanal a'zoligi.
Zarar o'quvchi holatida maxfiylik bilan cheklangan (parol o'zgartirish joriy
parolni talab qiladi — `student-portal-write.service.ts:84`; to'lov faqat
balansga kirim qiladi), LEKIN refresh token **24 soat** va tizimda sessiyani
bekor qilish mexanizmi **yo'q** (`auth.service.ts:248-256` faqat JWT imzosini
tekshiradi). Xodimlarga ochilsa — CEO sessiyasi = butun moliya paneli.

Telegram'ning OAuth 2.0 / OIDC oqimi bu muammoni **tuzilishi bo'yicha** yo'q
qiladi:

1. `state` + PKCE oqimni **boshlagan brauzerga** bog'laydi
2. `code` bizning domenimizga, **foydalanuvchining o'z brauzerida** redirect
   bilan keladi — buzg'unchining brauzeriga yetib borish yo'li yo'q
3. Tasdiqlash ekranini **Telegram** chizadi va qaysi saytga kirilayotganini
   aytadi (bizning bot faqat «kirish tasdiqlandi» deydi, kimga ekani noma'lum)
4. Allowed URLs oldindan ro'yxatga olinadi — «For security reasons, Telegram
   will only process logins or redirect users using your pre-registered URLs»
5. `code` bir martalik va brauzer ko'rmaydigan client secret bilan server
   tomonda almashtiriladi

## Qabul qilingan qarorlar

| Savol | Qaror |
|---|---|
| Mexanizm | Telegram'ning rasmiy OAuth 2.0 / OIDC (uy qurmasi emas) |
| Qamrov | Faqat **web** (3 portal). Native ilova bu ishda tegilmaydi |
| Akkauntni topish | `id_token.phone_number` (Telegram tasdiqlagan) → `normalizeSharedPhone` → mavjud `validateUser` mantiqi kabi |
| `telegramChatId` | **Yozilmaydi** — `sub` ning bot ko'radigan `chat.id` ga tengligi tasdiqlanmagan. Migration yo'q |
| Tokenlarni yetkazish | URL'da emas — bir martalik `handoff` kodi orqali |
| QR kod | Kerak emas — `oauth.telegram.org` sahifasi kompyuterda ham ishlaydi |
| Parol bilan kirish | Qoladi. Telegram — qo'shimcha yo'l, almashtiruvchi emas |

## 1. Kimlik modeli — PR #381 bilan mos tushadi

`scope=phone` → `id_token.phone_number` = **Telegram tasdiqlagan raqam**,
foydalanuvchi ruxsati bilan. PR #381 dan keyin telefon raqam allaqachon barcha
rollarda login, ya'ni yangi kimlik mexanizmi qurilmaydi:

```
phone_number → normalizeSharedPhone (common/utils/phone.util.ts)
             → akkauntni topish (staff User.phone / o'quvchi User.login=phone)
             → portal rollari bo'yicha cheklash (portal-roles.config)
```

Topish va portal darvozasi mantiqiy jihatdan `validateUser` dagi bilan bir xil
bo'lishi kerak — parolsiz yo'l parolli yo'ldan **kengroq bo'lib qolmasligi**
shart. Amalda buni takrorlamaslik uchun akkauntni topish qismi `validateUser`
dan ajratib olinadi va ikki joydan chaqiriladi (parol tekshiruvi faqat parolli
yo'lda qoladi).

Bir raqam bir necha akkauntga tegishli bo'lsa — **parolsiz yo'l yopiq holatga
o'tadi** (implementatsiya paytida o'zgardi, 5-bo'lim talabiga ko'ra shu yerga
yozildi). Parol bilan kirishda qoida o'zgarmaydi: portal bo'yicha cheklash +
`orderBy: { updatedAt: 'desc' }` — «g'olib» akkauntga kirish uchun baribir
O'SHA akkauntning paroli kerak, ya'ni tanlov zararsiz. Telegram yo'lida esa
parol so'ralmaydi: bitta ofis raqami kassirda ham, administratorda ham bo'lsa
(ikkisi BIR portalda, ya'ni portal darvozasi ajratib bermaydi), g'olibni tanlash
Telegram akkaunti egasini BEGONA akkauntga kiritib qo'yardi. Shuning uchun
`AuthService.findAccountsByIdentifier` (`findMany`, `take: 2` — `where` sharti
`findAccountByIdentifier` bilan bitta manbadan) bittadan ko'p qatorni topsa,
kirish rad etiladi:

> «Bu raqam bir nechta akkauntga tegishli. Iltimos, telefon raqam va parol
> bilan kiring.»

`validateUser` ataylab tegilmaydi — parol bilan kirish aynan avvalgidek qoladi.

Raqam tizimda topilmasa: tushunarli xato — «Bu Telegram raqami tizimda yo'q.
Administrator bilan bog'laning.»

Bu **enumeration xavfi emas**, chunki bu yo'lga faqat **o'z** raqami bilan
kirish mumkin: raqamni Telegram beradi va u foydalanuvchining o'zi tasdiqlagan
raqami bo'ladi. Ya'ni begona raqamni tekshirib ko'rishning imkoni yo'q, shuning
uchun aniq xabar berish xavfsiz va foydali (aks holda odam nima qilishini
bilmay qoladi).

## 2. Server

### Endpointlar

| Endpoint | Nima qiladi |
|---|---|
| `GET /auth/telegram/status` | `{ enabled: boolean }` — config bor-yo'qligi. Klient tugmani ko'rsatish uchun shuni so'raydi (public, arzon) |
| `GET /auth/telegram/start` | `state` (random) + PKCE `code_verifier` yasaydi, Redis'ga yozadi (TTL 5 daq, bir martalik, ichida portal origin'i), `oauth.telegram.org/auth` URL'ini qaytaradi. `code_verifier` brauzerga **chiqmaydi** |
| `GET /auth/telegram/callback` | `code` bor-yo'qligini tekshiradi (bir martalik `state` bekorga yoqilmasin) → `state` ni Redis'dan **iste'mol qiladi** → yo'q/muddati o'tgan bo'lsa JSON 400 → `code` ni `/token` da almashtiradi → `id_token` ni tekshiradi → akkauntni topadi → portal darvozasi → bizning tokenlar → portalga `?handoff=` bilan redirect. `state` iste'mol qilingandan KEYINGI har qanday rad etish ham portalga redirect (`?error=<xabar>`) — foydalanuvchi API domenida xom JSON bilan qolmasligi uchun |
| `POST /auth/telegram/complete` | `handoff` ni iste'mol qiladi (bir martalik, TTL 60 sek) → access+refresh token + user obyekti |

### `redirect_uri` — bitta, API domenida

`redirect_uri` = **`https://api.dafzentrum.uz/api/auth/telegram/callback`** —
uchta portal uchun bitta, chunki kodni almashtirish client secret bilan server
tomonda bo'lishi kerak va secret hech qachon brauzerga chiqmasligi kerak.
Telegram'da ham **bitta** redirect URI ro'yxatga olinadi.

Foydalanuvchi qaysi portaldan kelgani `start` da aniqlanadi (`Origin`) va
`state` bilan birga Redis'ga yoziladi — `callback` ga Telegram keladi, u yerda
`Origin` ishonchsiz. Kirish muvaffaqiyatli bo'lsa, `callback` shu saqlangan
portalga qaytaradi:
`https://<portal>.dafzentrum.uz/auth/telegram/callback?handoff=<kod>`.

Portal origin'i **oq ro'yxatdan** olinadi (uchta ma'lum subdomen) — `state`
ichidagi qiymat bo'lsa ham, ochiq redirect bo'lib qolmasligi uchun qaytarishdan
oldin ro'yxatga solishtiriladi.

### `id_token` tekshiruvi (majburiy, hammasi)

- RS256 imzo — `https://oauth.telegram.org/.well-known/jwks.json` kalitlari
  (kalitlar keshlanadi, `kid` bo'yicha tanlanadi)
- `iss === 'https://oauth.telegram.org'`
- `aud === <bot client id>`
- `exp` o'tmagan
- `phone_number` mavjud (yo'q bo'lsa — `scope=phone` ga ruxsat berilmagan →
  tushunarli xato)

Bironta tekshiruv o'tmasa — **kirish rad etiladi**. Tekshiruvni «yumshoq»
qilish, xatoni yutib yuborish yoki `id_token` ni imzosiz o'qish taqiqlanadi.

### Rate limit

`start`, `callback`, `complete` — uchtasiga ham `IpThrottlerGuard`. Parol
login'da 10/min, refresh'da 30/min bor; bu uchtasiga ham shu tartibda chek
qo'yiladi.

**Aloqador tuzatish:** mavjud `GET /auth/otp/poll` (native ilova ishlatadi)
da throttle **umuman yo'q**. Bu ish davomida unga ham chek qo'yiladi
(60/min/IP — klient har 2.5 sek so'raydi ≈ 24/min).

### Konfiguratsiya

**UCHTA** env kerak (implementatsiya paytida uchinchisi qo'shildi — 5-bo'lim
talabiga ko'ra shu yerga yozildi):

- `TELEGRAM_OAUTH_CLIENT_ID`
- `TELEGRAM_OAUTH_CLIENT_SECRET`
- `TELEGRAM_OAUTH_REDIRECT_URI` — BotFather'dagi Redirect URI bilan **bayt-ba-bayt**
  mos bo'lishi shart (Telegram «Must match exactly» deydi), shuning uchun kodga
  yozib qo'yilmaydi

Bironta bo'lmasa, funksiya **butunlay o'chiq**: `start` **503**
(`ServiceUnavailableException`, «Telegram orqali kirish hozircha yoqilmagan»)
qaytaradi va `status` `{ enabled: false }` beradi, ya'ni klient tugmani
ko'rsatmaydi (config yo'qligi jimgina buzilishga olib kelmasin).

`status` bundan tashqari `Origin` ni ham tekshiradi: portal bo'lmagan manzilda
(CORS ruxsat bergan Vercel preview aliasi kabi) `{ enabled: false }` qaytaradi —
aks holda tugma chizilib, bosilganda «Noma'lum portal manzili» 400 berardi.

## 3. Client

- Ikkala forma (`login-form.tsx` — admin/lehrer/student, va Lumio
  `student-login-form.tsx`) ostida «yoki» ajratuvchi + «Telegram orqali kirish»
  tugmasi. Tugma faqat backend funksiya yoniq deb aytganda ko'rinadi
- Bosilganda `GET /auth/telegram/start` → `window.location.href = authorizeUrl`
- Yangi sahifa `/auth/telegram/callback`: `?handoff=` ni o'qiydi →
  `POST /auth/telegram/complete` → `setAuth` → parol yo'lidagi aynan shu
  redirect (o'quvchi → `/portal`, qolganlar → `/`). Xato bo'lsa — kirish
  sahifasiga tushunarli xabar bilan qaytaradi
- **Yangi `NEXT_PUBLIC_*` env kerak emas** (URL'ni server yasaydi) — ya'ni
  Vercel env tuzog'i (`.env` fayllari yuklanmaydi) bu ishga tegmaydi
- Yangi paket kerak emas (QR yo'q)

## 4. Native ilova — bu ishda tegilmaydi

`student-app/` hozirgi poll oqimida qoladi, ya'ni **yuqoridagi relay zaifligi
prod'da ochiq turadi**. Bu ongli qaror (CEO, 2026-07-30). Server tomonidan
yamash imkoni yo'q — kod solishtirish ham ilovaning kodni ko'rsatishini talab
qiladi, ya'ni har qanday yechim yangi build talab qiladi.

**Native ishi boshlanganda Telegram auth alohida hal qilinadi** — lekin yo'l
avvalgi taxminlardan aniqroq. BotFather'ning OIDC ekranida (2026-07-30 da
ko'rilgan) **«Native Login → Add Native App»** bo'limi bor:

> Register native apps to enable Telegram Login via deep links without a
> browser redirect.

Ya'ni native yo'l Telegram tomonidan **rasman qo'llab-quvvatlanadi** va brauzer
redirect'i kerak emas. Bu avvalgi noaniqlikni (custom scheme qabul qilinadimi,
universal link kerakmi) hal qiladi. Native ish boshlanganda birinchi qadam:
ilovani shu bo'limda ro'yxatga olib, deep-link oqimi Expo'da qanday
ulanishini aniqlash.

## 5. Implementatsiyadan oldin majburiy tekshiruv

Yuqoridagi Telegram tafsilotlari `core.telegram.org/widgets/login` dan
**WebFetch summarizatsiyasi** orqali olingan, verbatim emas. Kod yozishdan
oldin sahifa to'liq o'qilib tasdiqlanishi shart:

- endpointlar: `oauth.telegram.org/auth`, `/token`,
  `/.well-known/jwks.json`
- parametr nomlari: `client_id`, `redirect_uri`, `response_type=code`,
  `scope=openid profile phone`, `state`, `code_challenge`,
  `code_challenge_method=S256`
- token almashtirish: `POST /token`, Basic auth `base64(client_id:secret)`
- claim nomlari: `phone_number`, va `id` ning `sub` dan farqi (misolda `sub`
  19 xonali, `id` esa Telegram user id ko'rinishida)
- legacy hash-widget holati (arxivlangan)

Farq chiqsa — spec shu joyda yangilanadi, keyin kod yoziladi.

## 6. CEO tomonidan qilinadigan sozlash (kod emas)

BotFather → Login Widget → **Switch to OpenID Connect Login** (2026-07-30 da
bajarilgan). Ekranda: Client ID + Client Secret, **Redirect URIs**, **Trusted
Origins**, **Native Login**.

1. **Client ID:** `8576891251` (maxfiy emas). **Client Secret** — faqat Railway
   env'iga, hech qayerga nusxalanmaydi
2. **Redirect URIs** → «Add a Redirect URI» (*«Must match exactly»*):
   - `https://api.dafzentrum.uz/api/auth/telegram/callback` — bitta, API
     domenida (kodni client secret bilan server almashtiradi)
   - Lokal ishlash uchun (Telegram qabul qilsa):
     `http://localhost:4000/api/auth/telegram/callback`. Rad etilsa — lokalda
     funksiya o'chiq holatda sinaladi
3. **Trusted Origins** → uchta portal:
   `https://admin.dafzentrum.uz`, `https://lehrer.dafzentrum.uz`,
   `https://student.dafzentrum.uz`
4. **Railway env:** `TELEGRAM_OAUTH_CLIENT_ID`,
   `TELEGRAM_OAUTH_CLIENT_SECRET`
5. **Native Login** — bu ishda ishlatilmaydi (4-bo'limga qara)

Bularsiz funksiya o'chiq turadi (tugma ko'rinmaydi) — ya'ni sozlash
kechiksa ham kod xavfsiz joylashtiriladi.

## 7. Testlar

Server (Jest):

- `state`: bir martalik (ikkinchi callback rad), muddati o'tgani rad, boshqa
  portalga tegishli `state` bilan aralashtirib bo'lmasligi
- `id_token` tekshiruvining **har bir** buzilishi alohida rad etilishi: yolg'on
  imzo, noto'g'ri `iss`, noto'g'ri `aud`, muddati o'tgan `exp`,
  `phone_number` yo'q. Testlarda o'z RSA kalit juftligimiz bilan soxta JWKS
- akkaunt topish: staff raqami, o'quvchi raqami, chet el raqami
  (`normalizeSharedPhone` bilan), tizimda yo'q raqam → tushunarli xato
- portal darvozasi: admin portalda ustoz → rad; lehrer'da ustoz → OK;
  **bir raqam ikki akkauntda → kirish umuman rad etilishi** (1-bo'limga qara)
  va Redis'da almashtiriladigan `handoff` QOLMASLIGI
- `state` iste'mol qilingandan keyingi har qanday rad etish portalning kirish
  sahifasiga `?error=` bilan qaytishi (API domenida xom JSON qolmasligi)
- `handoff`: bir martalik, muddati o'tgani rad
- config yo'q bo'lsa `status` `{ enabled: false }` va `start` funksiya o'chiq
  deb javob berishi
- **ochiq redirect:** `state` ichiga oq ro'yxatda yo'q portal origin'i
  qo'yilsa, `callback` u yerga qaytarmasligi
- **regressiya:** native ilovaning `otp/poll` oqimi avvalgidek ishlashi
  (throttle qo'shilgandan keyin ham)

Client: test infratuzilmasi yo'q — `tsc` + lint + qo'lda tekshirish.

## 8. Joylashtirish

Migration yo'q, sxema o'zgarmaydi. Server: qo'lda `railway up` + env
o'zgaruvchilar. Client: Vercel. Native: tegilmaydi.

## 9. Qamrovdan tashqarida (keyingi ish)

- Native ilova auth'i (4-bo'lim) — alohida spec
- Sessiyani bekor qilish mexanizmi (refresh token qora ro'yxati): hozir
  o'g'irlangan sessiyani 24 soat to'xtatib bo'lmaydi. Bu OAuth'dan mustaqil,
  umumiy xavfsizlik qarzi
- Mavjud `req_` poll oqimini o'chirish — native OAuth'ga o'tgandan keyin
