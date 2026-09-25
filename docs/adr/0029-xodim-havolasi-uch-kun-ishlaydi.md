# ADR-0029 — Xodim havolasi uch kun ishlaydi, berilgan vaqti imzo ichida

**Holati:** Qabul qilindi
**Sana:** 2026-09-24
**Bog'liq:** ADR-0008 (ro'yxatdan o'tish aktori), ADR-0022 (xodim hisobi va Telegram), `docs/superpowers/specs/2026-09-19-xodim-hisobi-va-telegram-design.md` (2-bosqich dizayni), ADR-0026 (rol berish shipi) va ADR-0028 (bloklangan xodim) — ikkalasi 2026-09-24 da parallel shoxlarda, `server/src/telegram/utils/signed-link.util.ts`, `server/src/telegram/telegram.service.ts`, `server/src/telegram/constants.ts`, `docs/role-access.md`

## Kontekst

Telegram ro'yxatdan o'tish havolasi (`POST /telegram/employee-link`) —
`employee_<filial>_roles_<rollar>_sig_<imzo>`. Uni ochgan har kim o'sha
filialda o'sha rollar bilan ishlaydigan xodim hisobini oladi, bot unga kirish
ma'lumotlarini yuboradi. Ruxsat havola imzolanganda tekshiriladi (ADR-0008),
bot esa faqat imzoni tekshirardi.

Havola:

- **muddatsiz** edi — bir yil oldin chatga tashlangan havola bugun ham hisob
  ochardi;
- **ko'p martalik** edi — bitta havola bilan istalgancha hisob ochilardi;
- **o'zgarmas** edi — bir xil filial va rollar har doim aynan bir xil havolani
  berardi. «Yangi havola» eskisini bekor qilmasdi; bitta havolani to'xtatib
  bo'lmasdi, faqat `TELEGRAM_LINK_SECRET` ni almashtirib hammasini birdan.

Havola uch joyda ochiq turadi (xodimlar sozlamasidagi dialog, filial sahifasi,
o'qituvchilar sahifasi — QR kod bilan) va chatlarga tarqaladi. Tarqalgan havola
abadiy hisob ochuvchi kalit edi. ADR-0022 ning 2-bosqichi uni shaxsiy, bir
martalik havolaga almashtiradi (dizayn hujjatida — 3 kunlik), lekin u hisobni
avval admin ochishini talab qiladi va hali qurilmagan. Bu qaror — o'sha
bosqichgacha oraliq mustahkamlash, 2026-09-24 da kelishilgan.

Cheklov: Telegram `?start=` ni faqat base64url (`A-Z a-z 0-9 _ -`) va 64
belgigacha bo'lsa yetkazadi, aks holda jimgina tashlab yuboradi.

## Qaror

1. **Havola berilgan vaqtini o'zida olib yuradi, vaqt imzo ichida:**
   `employee_<filial>_roles_<rollar>_t_<vaqt>_sig_<imzo>`. `<vaqt>` — 1970
   dan beri o'tgan butun soniyalar, 36 lik sanoq tizimida (2038 yil
   dekabrigacha 6 belgi, keyin 7). Eng uzun holat (filial 999999, beshala rol)
   — 61 belgi, 2038 dan keyin 62.
2. **Bot havolani faqat berilganidan keyingi 3 kun (72 soat) ichida qabul
   qiladi** — 2-bosqich dizaynidagi shaxsiy havola bilan bir xil muddat. Keyin
   javob: «Bu havolaning muddati tugagan. Administratordan yangi havola
   so'rang.» Muddat havola ochilganda tekshiriladi.
3. **Vaqti yo'q havola ham xuddi shu javob bilan rad etiladi.** Bu o'zgarish
   chiqqan zahoti undan oldin tarqatilgan barcha havola ishlamay qoladi. Admin
   yangisini o'sha joylardan oladi: dialog har bosilganda, filial va
   o'qituvchilar sahifalari esa har ochilganda yangi havola yaratadi.
4. **Avval imzo, keyin muddat, keyin filial.** «Muddati tugagan» faqat shu
   server imzolagan havolaga aytiladi; vaqti o'zgartirilgan havola imzodan
   o'tmaydi va «noto'g'ri havola» javobini oladi. Vaqti ochayotgan serverning
   soatidan 5 daqiqadan ko'proq oldinda bo'lgan havola o'sha vaqt
   yaqinlashguncha «noto'g'ri» deb rad etiladi: soat qanchalik adashmasin,
   havola jami 3 kun 5 daqiqadan ortiq qabul qilinmaydi.
5. Filial va rol shipi tekshiruvlari o'zgarmaydi.

**Taqiqlanadi:** havolani faqat imzosi bo'yicha qabul qilish. Imzo va yosh
bitta funksiyada (`checkEmployeePayload`) tekshiriladi; «faqat imzo»
tekshiruvi yo'q. Muddatni o'zgartirish — yangi ADR.

## Ko'rib chiqilgan muqobillar

**Eski havolalarga o'tish davri berish** (vaqtsiz havolani chiqarilgan kundan
yana 3 kun qabul qilish). Rad etildi: vaqtsiz havolaning qachon berilgani va
qayerga tarqalgani noma'lum — yil oldingisi ham kechagisi bilan bir xil
ko'rinadi. Yangi havola bir zumda olinadi, toza chiziq arzon.

**Hozirning o'zida bir martalik havola** (Redis'da token). Hozircha rad etildi:
bugungi havola bitta odamga emas, ko'pchilikka mo'ljallangan (filial va
o'qituvchilar sahifasidagi havola, QR kod). Bir martalik havola shu ishni
buzadi; 2-bosqich havolani shaxsiy qiladi va bir martalikni o'sha yerda beradi.

**Faqat `TELEGRAM_LINK_SECRET` ni almashtirish.** Rad etildi: tarqalgan
havolalarni bir marta o'chiradi, yangilari esa yana abadiy bo'ladi.

**Havolalarni bazada saqlab, bittalab bekor qilish.** Rad etildi: jadval,
migratsiya va boshqaruv sahifasi kerak, 2-bosqich esa baribir almashtiradi.

**Vaqtni millisekund yoki ISO sana bilan yozish.** Rad etildi: 64 belgilik
chegaraga sig'maydi yoki unga juda yaqinlashadi; 36 lik soniya — 6 belgi.

**Muddatni sozlamaga (env) chiqarish.** Rad etildi: qiymat bitta, u shu ADR da.

## Oqibatlari

**Yutuq:** tarqalgan havola faqat berilganidan keyingi 3 kun ichida ochilsa
ishlaydi; muomaladagi barcha eski havola chiqarilgan kuni o'chadi. Baza, Redis
va migratsiya kerak emas.

**Narx:** oldin tarqatilgan havolalar (chatlardagi, chop etilgan QR kodlar)
ishlamay qoladi — egasi admindan yangisini so'raydi; havolani 3 kundan keyin
ochgan odam ham. 3 kun ichida havola hali ko'p martalik va bittasini alohida
bekor qilib bo'lmaydi (faqat kalitni almashtirib, hammasini birdan). Muddat
faqat ochilganda tekshiriladi: 3 kun ichida boshlangan ro'yxatdan o'tish
keyinroq ham tugallanadi (bitta chatda bitta hisob).

**Bu qaror yopmaydi:** shaxsiy va bir martalik havola — ADR-0022 ning
2-bosqichi.
