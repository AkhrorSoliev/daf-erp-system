# Ta'lim (Lernen) qayta dizayni: o'quvchi tanlaydigan ko'rinish, Dafi va ovozlar

**Sana:** 2026-10-24 · **Holati:** qoralama (CEO ko'rigi kutadi) · **Mockuplar:** `docs/superpowers/mockups/2026-10-24-lernen-dizayn/`

## 1. Muammo

Student app'ning `portal/lernen` qismi (yo'l, `units/[id]`, mashq, natija) juda oddiy: oq kartalar, bitta zigzag yo'l, deyarli animatsiyasiz, interfeys ovozi umuman yo'q. CEO kirganda **bo'shliq hissi** bor: yo'lning ikki yonida hech narsa yo'q, bitta daraxt yoki bitta bulut yetmaydi. `units/[id]` esa oddiy ro'yxat.

Maqsad: o'quvchi har kirganda jonli, to'liq, yoqimli dunyoga tushsin; har o'tish (yo'l ochilishi, tugunga bosish, unit ochilishi, javob, dars tugashi) Duolingo kabi harakat va ovoz bilan kelsin.

## 2. Qamrov

**Kiradi:** `app/(student-portal)/portal/lernen/*` ning ko'rinishi: yo'l (`lernen-levels-page`, `yol/*`), unit sahifasi (`lernen-unit-page`), mashq ekrani chrome'i va natija ekrani (`uebung/seans-ekrani`, `natija-ekrani`, `pastki-panel`), takrorlash, Dafi, ovoz effektlari, ko'rinish tanlash.

**Kirmaydi:** mashq turlarining mantiqi, ball/qulf hisobi (`fortschritt.ts`, `seans-navbat.ts`, `yol-tuzilishi.ts` o'zgarmaydi), kontent, reyting ma'lumoti, faollik o'lchovi (ADR-0020), radio.

## 3. Qarorlar (CEO bilan, 24.10.2026)

1. **O'quvchi ko'rinishni o'zi tanlaydi.** 4 ta tema: **Toza** (sukut), **O'rmon**, **Dengiz**, **Nemis sayohati**.
2. **Mantiq bitta, sahna almashadi.** Temalar faqat ko'rinish va harakat qatlamidir; ma'lumot, qulf, ball, mashq oqimi hamma temada bir xil.
3. **Mascot — Dafi, ayiqcha (qush emas), faqat 2D BOSH.** Besh holat: tinch, salom, bayram, o'ylayapti, yumshoq xato. Xato **jazolamaydi** (to'g'ri javobni jazolama qoidasi): yumshoq, hamdard.
4. **Ovoz:** brauzerda sintez qilinadigan (Web Audio) effektlar; tashqi fayl va litsenziya yo'q. Yorqin, yumshoq, kam aks-sado (CEO eshitib tanlagan «v4» ovozi).
5. **Dizayn tamoyili:** to'liq lekin minimalist (yirik yumshoq shakllar, mayda dekor kam), yumshoq (qattiq qirra, to'q-qora ranglar yo'q).
6. Tanlov **hisobda** saqlanadi (qurilmalar orasida bir xil), xodimlarning `uiSkin` namunasi bo'yicha (ADR-0101).

## 4. Rad etilgan yo'llar (qayta ochma)

| Yo'l | Nega rad etildi |
|---|---|
| 3D ayiqcha kodda (Three.js, sferalar) | «Hunuk» chiqdi; referens (mo'ynali Pixar) darajasiga yetmaydi |
| AI bilan rasmdan 3D model + AI skelet (Hunyuan, Meshy; ~$1.7 sarflandi) | Yurish yaxshi, lekin qo'l ko'targanda qo'l yassi tasmaga aylanadi (AI og'irliklari xato), yuz animatsiyasi yo'q, fayl 25 MB. Tuzatish uchun 3D rassom kerak |
| Pixar rasm + kodda harakat (poza almashuvi) | CEO 3D ni istadi; 3D bo'lmagach, eng oddiy 2D bosh tanlandi |
| Rive/Lottie (rassom) | Kelajakdagi **almashtirish** varianti: `Dafi` interfeysi (`set('cheer')`) shu uchun ajratiladi, hozir shart emas |

## 5. Arxitektura

```
client/src/components/student-portal/lernen/
  tema/                     ← YANGI: temalar
    tema-reyestri.ts        ← id, nom, sahna, tugun, unit-lavha, palitra; sof, test bor
    tema-konteksti.tsx      ← joriy tema (hisobdan + localStorage keshi), `useLernenTema()`
    toza/ ormon/ dengiz/ alp/   ← har tema: Sahna, TugunBelgisi, UnitLavha, MukofotFoni
  dafi/                     ← YANGI: Dafi boshi (SVG) + holat mashinasi
  ovoz/                     ← YANGI: Web Audio sintezi + `ovozChal(hodisa)` + yoqish/o'chirish
  harakat/                  ← YANGI: umumiy animatsiya yordamchilari (prujina, kechikib ergashish, kam-harakat)
```

- **Temaning shartnomasi (`LernenTema`)**: `{ id, nom, Sahna, TugunBelgisi, UnitLavha, MukofotFoni, palitraUnitga(unitIndeksi) }`. Yo'l, unit va natija ekranlari faqat shu shartnoma orqali chizadi; tema ma'lumotni qayta hisoblamaydi.
- **Mavjud kod buzilmaydi:** `yolTugunlari`, `yolQatorMetasi`, `seansHolatlari` o'zgarmaydi; `LernenYol` tugunni chizishni `TugunBelgisi` ga topshiradi (hozir `LessonNode`). «Toza» tema = hozirgi Lumio tugunining boyitilgan varianti.
- **Sahna qatlamlari:** fon qatlamlari `position:absolute`, faqat `transform`/`opacity` animatsiya qilinadi; skroll parallaksi bitta `requestAnimationFrame` ichida; ko'rinmay qolganda (`visibilitychange`, `IntersectionObserver`) to'xtaydi.
- **Animatsiya vositasi:** `gsap` (bepul litsenziya) **faqat lernen yo'llarida lazy yuklanadi** (`next/dynamic`); asosiy portal paketiga kirmaydi. Alternativ: o'zimizning ~150 qatorli prujina/timeline; ADR da asoslab tanlanadi (6-bo'lim).
- **Dafi** — sof SVG + yuqoridagi harakat yordamchilari; GSAP'siz ham ishlay oladigan interfeys: `<Dafi holat="bayram" olcham="lg" />`. Qiyofa va 5 holat mockupdagi `dafi-head.js` ga mos (prujinali quloq, ko'z qisish/qarash, og'iz morf, qosh, yonoq, yulduz/«?»/ter belgilari).
- **Ovoz** — `ovoz/ovoz.ts`: `AudioContext` birinchi bosishda `resume()`; hodisalar: `bos`, `togri`, `xato`, `unitOchildi`, `mukofot`, `qulf` (v.1); keyin `seriya`. Tinglash darsi/klipi o'ynayotganda effektlar o'chiriladi (`lib/media-registry.ts`). Radio effektlarga xalaqit bermaydi (alohida element).

## 6. Ma'lumot va server

- Yangi ustun: `Student.lernenTema String?` (null = «toza»). `User.uiSkin` ga **tegmaymiz**: u xodim skinlari (`ormon` nomi xodimlarda ham bor, nom to'qnashmasin deb o'quvchi temalari alohida ro'yxat).
- `server/src/common/lernen-temalar.ts`: `LERNEN_TEMA_IDLARI = ['toza','ormon','dengiz','alp']`, `DEFAULT = 'toza'`; `client/src/lib/lernen-temalar.ts` — nusxa, test ikkalasini solishtiradi (`ui-skins` namunasi).
- `PATCH /student-portal/lernen-tema` (`@StudentOnly()`, `@CurrentUser('studentId')`; `students/student-portal.controller.ts`, `getProfile` yonida), DTO `IsIn(LERNEN_TEMA_IDLARI)`; `GET /student-portal/profile` javobiga `lernenTema` qo'shiladi.
- **Klient:** `useLernenTema()` hisobdan o'qiydi; birinchi chizishda xira bo'lmasligi uchun `localStorage` keshi (`daf.lernen.tema`); o'zgartirish optimistik, xato bo'lsa qaytariladi (`changeUiSkin` ning mantig'i). Ovoz yoqilgan/o'chirilgan va «kam harakat» — **qurilma sozlamasi**, `localStorage` (`daf.lernen.ovoz`, `daf.lernen.harakat`), serverga yozilmaydi.
- **Migratsiya** qo'lda qo'llanadi (loyiha qoidasi: `prisma migrate dev` buzuq), `prisma generate`.

## 7. Tanlash ekrani

`/portal/settings` ichida **«Ta'lim ko'rinishi»** bo'limi (Profil ≠ Sozlamalar qoidasi: bu *ilova xatti-harakati*, shuning uchun Sozlamalar). 4 ta kartochka: har birida tema miniatyurasi (statik SVG/CSS), nomi, qisqa izoh; tanlangani belgilangan. Pastda ikkita tugma-qator: **«Ovozlar»** (yoqish/o'chirish; yoqilganda bitta namuna chaladi) va **«Kam harakat»** (tizim `prefers-reduced-motion` ni ham hisobga oladi). Hamma matn o'zbek (lotin), inglizcha so'z yo'q.

## 8. Temalar (qisqacha; to'liq ko'rinish mockuplarda)

| Tema | Xarakter | Muhim nuqtalar |
|---|---|---|
| **Toza** (sukut) | Oq fon, qalin yumshoq 3D tugmalar, qorong'u rejim | Yo'l tepasida unit lavhasi (skrollda rangi o'zgaradi), joriy tugunda progress halqa va «BOSHLASH» yorlig'i, tugunga bosilsa pastdan varaq |
| **O'rmon** | Yumshoq qatlamli o'rmon | 3 biom (tong, ko'l, kuz), uchqunlar, nur dastasi, parallaks; unit sahnasi: kulba/ko'prik/g'or/qal'a |
| **Dengiz** | Sho'ng'ish | Skroll = chuqurlik (3 m → 85 m), marjon → kelp → chuqur dengiz, pufakchalar, baliqlar; unit sahnasi: chig'anoq uyi/kema/g'or/xazina |
| **Nemis sayohati** | Tongdan tungacha | Osmon tong→kun→shom→tun bo'lib o'tadi, Alp qishlog'i, tegirmon, qal'a, shahar chiroqlari; unit = kunning bir vaqti |

Har temada: **bo'shliq yo'q** (fon butun balandlikni to'ldiradi), **minimalist** (mayda dekor kam, yirik yumshoq shakllar), **yumshoq** (to'q-qora yo'q, yumaloq burchak, yengil soya). Unit sahifasi ro'yxat EMAS: tema sahnasi, darslar sahnadagi «joylar»; qulflilar tuman/qorong'ulik bilan yopiq.

## 9. Harakat va ovoz tamoyillari

- **Harakat qoidalari:** kutish (anticipation) → asosiy harakat (cho'zilish) → ezilib qo'nish (squash) → elastik qaytish (overshoot); ikkilamchi harakat (quloq, sharf/dum) prujinada kechikib ergashadi; tinch holatda ham jonli (nafas, tasodifiy ko'z qisish, qarash).
- **Ovoz xaritasi:** tugun/tugma bosish → `bos`; to'g'ri javob → `togri` + Dafi «bayram»; xato → `xato` (yumshoq) + Dafi «yumshoq xato»; yopiq tugun → `qulf` (qisqa «tuk») + silkinish; unit/dars ochilishi → `unitOchildi`; dars tugashi → `mukofot` + konfeti + Dafi 3 sakrashi.
- **Kam harakat:** `prefers-reduced-motion` yoki qurilma sozlamasi bo'lsa — Dafi statik poza, parallaks va ambient o'chadi, o'tishlar qisqa fade; ovoz alohida.
- **Yengil rejim:** zaif qurilmada (`navigator.hardwareConcurrency <= 4` yoki `deviceMemory <= 2`) ambient elementlar va qatlamlar yarmiga kamayadi.

## 10. Mavjud qoidalar bilan moslik (buzmaslik shartlari)

- `.lumio` doirasi: tema tokenlari `.lumio` ichida; global `@theme` da Tailwind nomlari qayta aniqlanmaydi (`globals-css.test.ts`).
- Mashq paytida pastki panel va radio qoidalari o'zgarmaydi (`isExerciseSessionRoute`, `CONTENT_INSET`); fixed qatlam rail'dan chiqib turishi shart.
- Yuklash holati: `loadState(query)` qoidasi (ma'lumot yo'q bo'lsa bo'sh holat chizilmaydi); sahna yo'l ma'lumotiga bog'liq emas (yuklanayotganda ham fon turadi).
- Faollik o'lchovi (ADR-0020): effekt ovozlari «ovoz» hisoblanmaydi; `registerMedia` faqat dars audiosiga.
- Telegram Mini App: Web Audio WebView'da jim bo'lishi mumkin — ovoz yo'q bo'lsa hech narsa yiqilmasin (try/catch, jimgina o'tkazib yuborish).
- `client/` da Prettier ishlatilmaydi; matnlar o'zbek lotin, inglizcha so'z yo'q.

## 11. Test strategiyasi

- **vitest (DOM'siz):** `tema-reyestri` (hamma id uchun sahna/palitra bor), `lernen-temalar` klient↔server nusxa testi, ovoz hodisa xaritasi, Dafi holat o'tishlari (sof model), kam-harakat qarori, `palitraUnitga`.
- **server jest:** `PATCH lernen-tema` (to'g'ri id, noto'g'ri id → 400, boshqa o'quvchiga yozib bo'lmaydi), `GET profile` `lernenTema` qaytaradi; route marker testi (`routeAccess`).
- **Qo'lda:** har tema 3 skroll nuqtasida, mashq → natija oqimi, qorong'u rejim, 360 px telefon va rail bilan desktop, kam-harakat, ovoz o'chiq.
- **Unumdorlik byudjeti:** 60 fps skrollda o'rta qurilmada; lernen paketi (gsap bilan) asosiy portalga qo'shilmaydi; har tema sahnasi ≤ ~1500 DOM/SVG element.

## 12. Bosqichlar (har biri alohida PR)

1. **Asos:** `tema/` reyestri + «Toza» tema, `ovoz/`, `dafi/`, server maydoni + tanlash ekrani, ADR.
2. **Mashq va natija ekrani:** Dafi holatlari, ovozlar, natija ekrani, unit sahifasi.
3. **O'rmon** temasi.
4. **Dengiz** temasi.
5. **Nemis sayohati** temasi.

Tanlash ekrani faqat reyestrdagi (tayyor) temalarni ko'rsatadi: 1-bosqichda faqat «Toza», keyingi bosqichlarda yangi tema reyestrga qo'shilgach kartochkasi paydo bo'ladi.

## 13. ADR (shu spetsifikatsiya bilan birga, 1-bosqich PR'ida)

«Ta'lim ko'rinishi o'quvchi hisobida tanlanadi; temalar faqat ko'rinish qatlami; animatsiya kutubxonasi» — `docs/adr/0125-…` (raqam PR vaqtida `README.md` indeksidan tekshiriladi, to'qnashsa `git mv` bilan qayta raqamlanadi). Mazmuni: tanlov hisobda (`Student.lernenTema`), qurilma sozlamalari `localStorage`da, gsap lazy yuklanadi yoki o'z prujinamiz (tanlov va sababi), 3D/AI yo'llari rad etilgani.

## 14. Xavflar va ochiq savollar

- **gsap yoki o'z prujinamiz.** gsap tez va sinalgan (~70 KB, lazy), o'z kodimiz bog'liqliksiz lekin ko'proq ish. Tavsiya: gsap, lazy. **CEO ko'rigida tasdiqlanadi.**
- **Aloqa tezligi/akkumulyator:** ambient animatsiyalar zaif telefonda og'ir bo'lishi mumkin → yengil rejim va ko'rinmaganda to'xtatish majburiy.
- **Dafi sifati:** hozirgi 2D bosh «oddiy» darajada; Duolingo darajasi uchun professional animator (Rive) keyingi bosqichda — interfeys shunga tayyor.
- **Ovoz sifati** brauzerlarda bir xil emas; Telegram Mini App'da ishlamasligi mumkin.
- **Tema soni:** har yangi tema ish va sinov qo'shadi; 4 tadan oshirilmaydi (YAGNI), 5-bosqichdan keyin foydalanish statistikasiga qarab qayta ko'riladi.
- **Mockuplar** emoji va qo'lda yozilgan SVG ishlatadi; real ilovada ikonalar `@phosphor-icons/react` (loyiha standarti) bilan almashtiriladi.
