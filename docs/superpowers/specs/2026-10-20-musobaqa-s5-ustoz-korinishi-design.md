# Musobaqa tizimi — S5: ustoz ko'rinishi — dizayn

**Sana:** 2026-10-20
**Bog'liq:** [S1](2026-10-18-musobaqa-s1-poydevor-design.md) (`DafStudentDay`),
[S2](2026-10-18-musobaqa-s2-shaxsiy-osish-design.md) (maqsad, nishonlar, seriya),
[S3](2026-10-18-musobaqa-s3-liga-design.md) (liga, guruhlar jadvali, `DafGroupWeek`),
ADR-0020 (ilova faolligi tabi)

Guruh sahifasida «Ilova faolligi» tabi allaqachon bor (vaqt, to'g'ri
javob foizi, norma). Unda musobaqa yo'q: ustoz guruhi markazda nechanchi
o'rinda ekanini, kim shu hafta mashq qilmaganini ko'rmaydi. S5 shu
bo'shliqni yopadi: guruh sahifasida alohida **«Musobaqa»** tabi.

CEO qarorlari (2026-10-20): ustoz ko'radi — guruh o'rni, o'quvchilar
ballari, «kim mashq qilmadi» ro'yxati. Joylashuv: alohida tab. Ustozga
Telegram xabar BU bosqichda yo'q.

---

## 1. Kim ko'radi

- Endpoint huquqi `groups.view` (ilova faolligi bilan bir xil). Sof ustoz
  faqat o'z guruhini, qolganlar (administrator, filial direktori, CEO)
  o'z filialidagi guruhni — `assertCallerMayTouchGroup`, xato matni
  ilova faolligidagi kabi.
- Faqat o'qiydi. Hech narsa yozmaydi, jadval/migratsiya YO'Q.
- O'quvchi ismi `reytingIsmi` bilan (to'liq ism). Telefon, to'lov,
  Telegram holati ko'rsatilmaydi.
- Arxivlangan/yopilgan guruhda tab ochiladi, lekin guruh kartasi
  «Guruh faol emas — musobaqada qatnashmaydi» deydi (§2).

## 2. Guruh kartasi (tabning tepasi)

Joriy hafta (jonli, S3 `guruhlarYigindisi` + `guruhlarniSarala` — hech
narsa yangidan hisoblanmaydi):

| Maydon | Ma'nosi |
| --- | --- |
| `orin` / `guruhSoni` | Markaz bo'yicha o'rin va jadvaldagi guruhlar soni |
| `baho` | A'zolarning o'rtacha haftalik bali (S3 `bahoKorinishi`, 1 o'nlik) |
| `azolar` | Hozirgi faol a'zolar |
| `ball` | Guruhning jami haftalik bali |

Jadvalga kirmagan holat — matn bilan, xato sifatida emas:
- a'zolar `GURUH_MIN_AZO` (3) dan kam: «Jadvalga kirish uchun kamida 3
  a'zo kerak (hozir N)»;
- guruh `ACTIVE` emas: «Guruh faol emas».

**Tarix.** Oxirgi 8 hafta: `DafGroupWeek` (`weekStart`, `place`,
`average`). Yozuvi yo'q hafta (guruh o'sha paytda jadvalda bo'lmagan) —
«—». Kichik chiziq (sparkline) o'rin bo'yicha, kam bo'lsa — jadval.
Qator bosilsa o'sha haftaga o'tadi (§4).

## 3. O'quvchilar jadvali

Qatorlar — guruhning hozirgi faol a'zolari (`Enrollment.status =
ACTIVE`, takrorsiz; S3 `guruhlarYigindisi` a'zolar to'plami bilan AYNAN bir xil, shuning uchun guruh bali bilan parity mumkin). Standart saralash:
`jamiBall` kamayish, teng bo'lsa ism.

| Ustun | Manba va qoida |
| --- | --- |
| Ism | `reytingIsmi` |
| Shu guruh bali | `DafStudentDay`, `groupKey = groupId`, hafta ichida — guruhlar jadvali bilan BIR XIL qoida (guruh balining manbasi) |
| Jami ball | Hafta ichida barcha guruhlar bo'yicha yig'indi (o'quvchi hafta o'rtasida guruh almashtirgan bo'lishi mumkin) |
| Faol kunlar | Hafta ichida `attempts > 0` bo'lgan kunlar soni, 0–7 |
| Seriya | `serieAus` (S2 qoidasi, `attempts > 0` kunlar); FAQAT joriy haftada |
| Bugungi maqsad | `bugunBali` / `MAQSAD_BALL[dailyGoal]`; FAQAT joriy haftada. O'quvchi ekranidagi «bosh» qoidasi bu yerda QO'LLANMAYDI: ustoz sof ballni ko'radi |
| Liga | `DafStudentLeague.tier` → `LIGA_NOMLARI`; qator yo'q = Bronza |
| Nishonlar | `DafStudentBadge` soni |
| Oxirgi mashq | Eng oxirgi `attempts > 0` kuni (`YYYY-MM-DD`) yoki yo'q |
| Akkaunt | `Student.user !== null` (ilova faolligi tabi bilan bir xil) |

Seriya uchun kunlar oxirgi 400 kundan olinadi (`ponytail:` — 400 kundan
uzun seriya kesiladi; loyiha 2026-09 da boshlangan, chegara yetib
bo'lmaydi).

## 4. «Mashq qilmadi» bloki va hafta tanlagich

**Mashq qilmadi.** Tanlangan haftada `jamiBall = 0` bo'lgan a'zolar
alohida blokda: ism, oxirgi mashq sanasi («3 kun oldin» / «hech qachon»),
akkauntsiz bo'lsa «Akkaunt yo'q» belgisi. Qoida `jamiBall` bo'yicha, shu
guruh bali bo'yicha emas — boshqa guruhda mashq qilgan o'quvchi bu
ro'yxatga tushmasin. Hamma mashq qilgan bo'lsa blok o'rniga «Hamma shu
hafta mashq qildi» deyiladi. Blok jadvalning O'ZI emas, uning ustiga
qo'yilgan ro'yxat: o'quvchi ikkala joyda ham ko'rinadi.

Tizim hech kimga xabar yubormaydi: ro'yxat ustoz o'zi bog'lanishi uchun.

**Hafta tanlagich.** Joriy hafta + oldingi 8 hafta (dushanbalar).
`?hafta=YYYY-MM-DD` dushanba bo'lishi shart (`wochenStartTag` bilan
moslanadi), chegaradan tashqari yoki dushanba emas → 400. O'tgan haftada
seriya va bugungi maqsad ustunlari yo'q (o'sha kun hisobi ma'nosiz).

## 5. Server

```
GET /groups/:id/musobaqa?hafta=YYYY-MM-DD
```

Yangi papka `server/src/daf/ustoz/`:
- `musobaqa-ustoz.service.ts` — yig'uvchi, `PrismaService`;
- `musobaqa-ustoz.sql.ts` — a'zolar ballari va kunlari uchun raw SQL
  (`Prisma.sql` + izoh belgisi, `*Unsafe` yo'q);
- `musobaqa-ustoz.types.ts` — javob turlari.
Kontroller `groups` yo'lida, lekin DaF modulida
(`musobaqa-ustoz.controller.ts`), mavjud `app-activity` kontrolleriga
TEGILMAYDI. 500 qatordan oshmaydi.

Javob:

```
{
  haftaBoshi, joriy,
  haftalar: string[],                 // tanlagich uchun, yangidan eskiga
  guruh: { holat, orin|null, guruhSoni|null, baho|null, azolar, ball, minAzolar },
  // holat: JADVALDA | KAM_AZO | FAOL_EMAS | YOZUV_YOQ (o'tgan hafta, DafGroupWeek qatori yo'q)
  tarix: [{ haftaBoshi, orin|null, baho|null }],   // 8 hafta
  oquvchilar: [{
    studentId, ism, akkaunt, guruhBali, jamiBall, faolKunlar,
    seriya|null, bugunBali|null, maqsadBali|null,
    liga, nishonlar, oxirgiMashq|null
  }]
}
```

So'rovlar (guruh a'zolari ≤ ~30, shuning uchun hammasi bitta
`Promise.all`, o'quvchi bo'yicha sikl YO'Q):
1. a'zolar + akkaunt + liga + nishonlar soni + maqsad darajasi (bitta
   so'rov, o'quvchi ID ro'yxati bo'yicha);
2. hafta ballari: guruh bali va jami bali, faol kunlar — bitta SQL,
   `DafStudentDay`, indeks `(companyId, studentId, day)`;
3. kunlar (seriya, oxirgi mashq) — faqat joriy haftada, 400 kunlik oyna;
4. guruh o'rni: joriy haftada `guruhlarYigindisi` (markaz bo'yicha, 31 ms),
   o'tgan haftada `DafGroupWeek` bitta qator;
5. tarix: `DafGroupWeek` 8 qator.

Marshrut manifestiga `GET /groups/:id/musobaqa` qo'shiladi
(`BRANCH_SCOPED_BY_ENTITY`, `app-activity` bandi bilan bir qatorda,
sabab matni `assertCallerMayTouchGroup`ga ishora qiladi) va
`route-access.snapshot.json` yangilanadi.

## 6. Ekran

`client/src/components/groups/musobaqa/`:
- `group-musobaqa-tab.tsx` — tab ildizi (yuklanish, xato, bo'sh holat);
- `guruh-orni-karta.tsx` — §2 va tarix;
- `oquvchilar-jadvali.tsx` — §3;
- `mashq-qilmadi.tsx` — §4;
- `use-musobaqa.ts` — React Query (`staleTime` 60 s, tab ochilganda
  yuklanadi: `group-detail-tabs.tsx` dagi `ilova` tabi kabi bir marta
  ko'rsatilganda `musobaqaVisible`).

Qoidalar: tab yorlig'i «Musobaqa»; matnlar `t()` orqali va lotin
o'zbekcha, ekranda inglizcha so'z yo'q; jadval 390 px da gorizontal
aylanadi (ustun sticky ism), ranglar mavjud tokenlar (`text-ink-700`
va h.k.), tugmalar ≥ 44 px, jadval sarlavhalari `scope="col"`, hafta
tanlagich klaviatura bilan boshqariladi. Bo'sh holat: «Guruhda faol
o'quvchi yo'q».

## 7. Sinash

- Sof qoidalar (jadvalga kirmaslik sababi, «mashq qilmadi» ajratish,
  hafta chegarasi) — alohida fayllarda birlik testlari.
- Servis: soxta `Prisma` bilan javob shakli, o'tgan hafta (seriya/maqsad
  `null`), jadvalga kirmagan guruh, guruhsiz a'zosiz holat.
- Huquq: sof ustoz boshqa ustozning guruhida 403; boshqa filial 403;
  mavjud bo'lmagan guruh 404.
- Haqiqiy Postgres (vaqtinchalik skript): a'zosi boshqa guruhda mashq
  qilgan o'quvchi «mashq qilmadi»ga TUSHMAYDI; guruh bali S3 jadvalidagi
  `ball` bilan teng (parity, 0 farq).
- Yuklama: 12 000 o'quvchi, 50 parallel, endpoint p95 < 200 ms
  (chegara S1–S4 bilan bir xil); `fortschritt` p95 o'zgarmaydi (tegilmaydi).
- Mijoz: vitest (sof formatlar, hafta tanlagich), brauzer tekshiruvi
  (390/360/320 px, yorug va qorong'i, ustoz roli bilan).

## 8. Hujjat va deploy

- ADR-0118 («Ustoz musobaqa ko'rinishi: faqat o'qiydigan, mavjud
  hisoblardan»), `docs/adr/README.md` qatori.
- `server/CLAUDE.md` DaF bandi (ingliz tilida).
- Xodimlar yangiligi: bitta yozuv (ustozlar yangi tabdan xabardor bo'lsin).
- Deploy: migratsiya YO'Q; kod chiqadi — tab darrov ishlaydi. Orqaga
  qaytarish: kodni qaytarish yetadi.
- Merge tartibi: S1 → S2 → S3 → S4 → S5 (merge commit), ADR 0114–0118
  raqamlarini `git fetch`dan keyin qayta tekshir.

## 9. Bu bosqichda QILINMAYDI

Ustozga Telegram xabar · markaz bo'yicha barcha guruhlar sahifasi ·
ustoz nomidan o'quvchiga xabar/rag'bat · yangi ball yoki nishon
qoidasi · o'quvchi tomonidagi o'zgarish.

## 10. Xavflar

| Xavf | Chora |
| --- | --- |
| Ustoz boshqa ustoz guruhini ko'radi | `assertCallerMayTouchGroup` + 403 testi + manifest yozuvi |
| Guruh o'rni S3 jadvalidan farq qiladi | Bir manba (`guruhlarYigindisi`), parity sinovi |
| Ustoz ballni «jazo» sifatida ishlatadi | «Mashq qilmadi» ro'yxati neytral matnda, qizil rang/tahdid yo'q (loyiha qoidasi: jazo yo'q) |
| Katta guruhda sekin | ≤ 30 a'zo, sikl yo'q, yuklama sinovi |
| Eski haftada a'zolar tarkibi boshqacha edi | Tanlagich HOZIRGI a'zolarni ko'rsatadi; kartada izoh: «Hozirgi a'zolar bo'yicha» |

## 11. Yuklama natijalari

(Bajarilgach to'ldiriladi.)
