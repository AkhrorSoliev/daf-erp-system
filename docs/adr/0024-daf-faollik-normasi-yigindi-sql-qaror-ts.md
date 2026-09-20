# ADR-0024 — DaF faollik normasi sozlamada; yig'indi SQL da, qaror TypeScript da

**Holati:** Qabul qilindi
**Sana:** 2026-09-20
**Bog'liq:** ADR-0002 (fail-closed qamrov), ADR-0015 (faol o'quvchi ta'rifi manifest), ADR-0019 (mashq natijasi umumiy shartnoma), ADR-0020 (ilova faolligi klientda o'lchanadi), `server/src/app-activity/norma/norma.ts`, `server/src/app-activity/center/`, [dizayn](../superpowers/specs/2026-09-20-daf-markaz-nazorati-design.md)

## Kontekst

O'quvchi ilovasidagi faollik 13.09.2026 dan o'lchanadi (ADR-0020), lekin u faqat
bitta guruh tabi va bitta o'quvchi paneli kesimida ko'rinardi. Markaz darajasida
«kim ishlamayapti», «qaysi filial orqada» degan savollarga javob yo'q edi, va
chuqurroq muammo — **«yaxshi ishlayapti» degani nima ekani hech qayerda yozilmagan
edi**: ekranlar xom raqam ko'rsatardi (14 daqiqa, 76 %), lekin bu ko'p yoki
ozligini aytmasdi.

Markaz sahifasi 1000+ o'quvchi uchun hisoblanadi. Guruh tabi har o'quvchining
seanslarini serverga tortib TypeScript da yig'adi (`kunlikYigindi`,
`savolNatijalari`); markaz uchun bu yo'l yuz minglab qator degani. Yig'indini
bazada olish kerak — va shu yerda savol tug'iladi: **qoida qayerda yashaydi?**

ADR-0015 ning saboqi: `activeStudentWhere()` bitta faylga yig'ilgan bo'lsa ham,
uni chaqirmagan uch joy eski shartini yozib qolaverdi va uchta ekran uch xil
«faol o'quvchi» soni ko'rsatdi. Bu yerda xavf undan katta: qoida SQL da ham,
TypeScript da ham bo'lsa, ikkisi bir-biridan bexabar o'zgaradi.

Uchinchi kuzatuv: «to'g'ri javob %» qoidasi (ADR-0019, `savolNatijalari`)
oddiy emas — juftlash formatida 4/6 juft hammasi to'g'ri bo'lishi kerak,
o'rinbosar urinish sanalmaydi, tugallanmagan savol chetda. Uni SQL da
qaytadan yozish shartnomaning ikkinchi nusxasi bo'lardi. Lekin `DafSession`
seans yakunida **o'sha qoida bilan** hisoblangan `questionCount` /
`firstTryCorrect` ni saqlaydi.

## Qaror

**1. Norma — `Company` ustunlari, kod emas.** `dafKunlikDaqiqa`,
`dafKunlikSavol`, `dafHaftalikKun`, `dafSariqKun`. CEO `/settings/daf` da
o'zgartiradi. Boshlang'ich 10 / 12 / 4 / 2 — taxminiy; real taqsimot ko'rilib
sozlanadi, deploy kutmaydi. Norma o'zgarsa o'tmish ham yangi norma bilan
hisoblanadi: norma tarixiy fakt emas, bugungi nazorat mezoni.

**2. «Faol kun» = LERNEN ≥ N daqiqa YOKI tugatilgan seanslarda ≥ K savol.**
Dars tugatish shart emas — takrorlash (Wiederholung) seansi darsni tugatmaydi,
lekin u ilovadagi eng muhim kunlik ish. Faqat `LERNEN` bo'limi vaqti sanaladi;
radio va boshqa bo'limlar normani bajarmaydi. Holat rangi maxrajga mutanosib
chegaralar bilan: `kerakliKun = max(1, round(haftalikKun × maxraj / 7))`.

**3. Yig'indi SQL da, qaror TypeScript da.** SQL (o'quvchi, kun) bo'yicha
faqat mexanik son qaytaradi: qirqilgan faol soniya, LERNEN soniya, kirdi,
savollar. «Bu kun faolmi», «bu o'quvchi qizilmi», saralash tartibi — faqat
`norma.ts` va `markaz-royxat.ts` da. Shuning uchun saralash va sahifalash
bazada emas, serverda: holat normadan chiqadi, norma SQL ga kirmasin.
Populyatsiya (≤ bir necha ming) buni ko'taradi; 3 000 faol o'quvchi yoki 2 s
dan uzoq so'rovda kunlik qoida parametrli SQL ga tushiriladi — chegaralar
baribir `norma.ts` dan parametr bo'lib boradi.

**4. To'g'ri javob % markazda tugatilgan seanslardan.**
`Σ firstTryCorrect / Σ questionCount` — seans yakunida `seansYigindisi()`
bilan yozilgan sonlar. Urinish qoidasi SQL da qaytadan yozilmaydi. Guruh tabi
urinishlardan hisoblaydi (tugallanmagan seanslar ham kiradi) — 1–2 % farq
kutilgan va ekranda «tugatilgan seanslar bo'yicha» deb yoziladi.

**5. Populyatsiya faqat Prisma + `activeStudentWhere()`.** `"Student"`
jadvaliga xom SQL yozilmaydi — ADR-0015 skaneri xom SQL ni ko'rmaydi. Filial
cheklovi `@BranchScope()` (sarlavhadagi tanlov ∩ ruxsat); `[]` bo'lsa bazaga
so'rov ketmaydi (ADR-0002).

## Ko'rib chiqilgan muqobillar

- **Holatni SQL da hisoblash, saralash bazada.** Tezroq, lekin norma va
  chegara formulasi SQL da ham, TypeScript da ham bo'lardi — ADR-0015 dagi
  holatning o'zi. Rad etildi.
- **Urinishlarni serverga tortib `savolNatijalari()` dan o'tkazish.** Qoida
  bitta joyda qolardi, lekin 1000 o'quvchining 30 kunlik urinishlari — yuz
  minglab qator har sahifa ochilishida. Rad etildi.
- **«Yoki bitta darsni tugatgan» sharti** (birinchi o'qishdagi variant).
  Takrorlash seansini ko'rmaydi: kuniga 5 daqiqada 15 so'zni takrorlagan
  intizomli o'quvchi qizil chiqardi. Rad etildi.
- **Kunlik agregat jadvali (cron bilan to'ldiriladigan).** Bir soatgacha
  eskirish va yana bir «haqiqat manbai» — norma o'zgarganda qayta to'ldirish
  kerak. Hozir keraksiz; hajm oshsa 3-banddagi parametrli SQL avval ko'riladi.
- **Norma kodda konstanta.** Har sozlash deploy — birinchi hafta CEO normani
  bir necha marta o'zgartirishi aniq. Rad etildi.

## Oqibatlari

**Yaxshi:**
- Bitta savolga bitta javob: «faol kun» va «holat» qayerda ko'rinsa ham
  `norma.ts` dan chiqadi. Guruh tabi holat ko'rsatadigan bo'lsa — shu fayldan.
- Norma bugundan sozlanadi; birinchi haftadagi «hamma qizil / hamma yashil»
  xavfi kod o'zgarishisiz yopiladi.
- Markaz so'rovlari soni o'quvchilar sonidan qat'i nazar doimiy (7 ta).
- Yangi filial route'lari manifestga yozilmaydi — dekorator manbada dalil.

**Narxi:**
- Kunlik **qirqish** qoidasi (mexanik, biznes emas) ikki joyda: `kunlikYigindi()`
  (TS, guruh tabi) va `kunlikSeanslar` SQL (markaz). `scripts/check-daf-markaz.ts`
  ikkisini bir xil kirish ustida yuritib farqni chiqaradi — relizdan oldin va
  shubha tug'ilganda.
- Har so'rovda ≤ o'quvchi × 30 kunlik qator serverga keladi (1000 o'quvchida
  ~1 MB). CEO sahifasi uchun yetadi; chegara va keyingi qadam 3-bandda.
- Markaz «to'g'ri javob %» guruh tabidan 1–2 % farq qiladi — qamrov farqi,
  ekranda yozilgan.
- Norma o'zgarganda o'tmishdagi ranglar ham o'zgaradi — bu ataylab, lekin
  «o'tgan hafta yashil edi» degan taqqoslash ma'nosini yo'qotadi.
