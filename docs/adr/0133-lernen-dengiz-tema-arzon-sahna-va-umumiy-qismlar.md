# ADR-0133 — Ta'lim «Dengiz» temasi: arzon sahna (skrollga ergashuvchi bitta tor qatlam) va sahnali temalar uchun umumiy qismlar

**Holati:** Qabul qilindi
**Sana:** 2026-10-27
**Bog'liq:** `docs/superpowers/specs/2026-10-24-lernen-dizayn-tanlash-design.md` (§5, §7, §8, §9, §11, §12), `docs/superpowers/plans/2026-10-27-lernen-dengiz-tema.md`, ADR-0125, ADR-0128, ADR-0131, ADR-0132

## Kontekst

Ta'lim dizaynining 4-bosqichi — «Dengiz» temasi (CEO tasdiqlagan maket `docs/superpowers/mockups/2026-10-24-lernen-dizayn/dengiz.html`): sho'ng'ish, marjon rifi → kelp o'rmoni → chuqur dengiz, pufakchalar, baliqlar; unit sahifasida chig'anoq uyi, kema, g'or, xazina. 3-bosqich o'lchovida (protsessor 4× sekinlashtirilgan, dasturiy chizish) O'rmonning to'liq sahnasi skrollda ~30 kadr/s berdi (Toza ~60): narx uchta to'liq ekranli xira qatlamning parallaksida edi. Shu bilan birga O'rmon fayllarida temaga bog'liq bo'lmagan mantiq bor edi: tugun, joy kartasi, mukofot foni, darsning joyini tanlash, unit tsikli, boshlang'ich qiymatli tasodif.

## Qaror

1. **Arzon sahna:** har zona — qotgan suv rangi (yuqoridan pastga o'tish) va qotgan tog' tizmalari; skrollga ergashuvchi yagona qatlam — chetlardagi ikki tor (96 px) qoya tasmasi (640 px plitka va uchta `<use>` nusxa — `TILE_COPIES = 4` —, ADR-0132 dagi aylanuvchi siljish); pufakcha, baliq to'dasi, tebranuvchi o'simlik va nur faqat `transform`/`opacity` bilan. Sahnada CSS va SVG `filter`, `mix-blend-mode`, `feTurbulence` yo'q (yagona istisno: qulflangan joy belgisidagi Tailwind `grayscale` sinfi — kartadagi kichik qotgan SVG, reja ruxsat bergan); `will-change` faqat ko'rinayotgan zona tasmalarida. Sahnada ≤ 300 element (spec chegarasi 1500). To'liq, yengil va «Kam harakat» rejimlaridagi sonlar `dengizPlan` da.
2. **Zona unit tartibidan:** `zoneForUnit` — marjon, kelp, chuqur, yana marjon (O'rmon biomlari bilan bitta `unitCycleIndex`). Yo'lda sahna ko'rinayotgan unitga 250 ms dan keyin ergashadi, unit sahifasida zona qotgan. Sahifalar o'zgarmadi.
3. **Chuqurlik — qotgan belgi:** zona chuqurligi («5 m», «25 m», «70 m») unit lavhasida, `t("{n} m")`, ekran o'quvchidan yashirin. Skrollga ergashuvchi o'lchagich qurilmadi.
4. **Umumiy qismlar:** `tema/sahna-umumiy.ts` (`unitCycleIndex`, `seededRandom`, `TILE`, `TILE_COPIES`, `CARD_SURFACE_ALPHA`, `joyTanla`) va `tema/sahna-qismlari.tsx` (`SharTugun`, `SahnaJoy`, `SahnaMukofotFoni`; tema id'si `<id>-ring`, `<id>-bob`, `<id>-burst` sinflarini va `--<id>-mukofot-*`, `--<id>-tepalik` o'zgaruvchilarini nomlaydi). O'rmon ularning o'ramiga aylandi; uning chizgan markup'i bayt-ma-bayt o'zgarmadi (bu bir martalik tekshiruv bilan isbotlandi: vaqtinchalik oltin nusxa testi, keyin o'chirildi; repoda doimiy test sifatida qolmagan). Dengiz plitkasining 4 nusxasi ham shu umumiy `TILE`/`TILE_COPIES` dan: ikki tema bir xil balandlikka (1920 px gacha) chidaydi.
5. **Noma'lum dars turi:** har tema `joyTanla` ga `Record<DafLessonKind, J>` beradi (yangi tur kompilyatsiyani to'xtatadi); ishlash vaqtida noma'lum tur (server va klient alohida deploy qilinadi) va eski DiB darsi birinchi bosqichning joyini oladi.
6. **Unumdorlik chegarasi** (keyingi sahnali temalar uchun ham): protsessor 4× va 4 soniyalik skroll o'lchovida to'liq rejimning kadr medianasi (p50) ≤ 20 ms (va O'rmonning to'liq rejimidan kamida 30% pastroq, p95 ham O'rmonnikidan past); yengil va «Kam harakat» rejimlari Toza darajasida (p50 ≤ 1.1 × Toza). Dengizning o'lchov natijasi «Oqibatlar» dagi jadvalda.
7. **CSS skaneri ikkala temani qo'riqlaydi:** `globals-css.test.ts` dagi skaner temaga parametrlangan (`SCENE_THEMES`); har `.ormon-*` va `.dengiz-*` qoidasi `.lumio` bilan boshlanishi, ichida izoh, `filter`/`backdrop-filter` va `mix-blend-mode` bo'lmasligi, `will-change` esa faqat ko'rinayotgan qatlamda bo'lishi tekshiriladi. O'rmonning mavjud kutilmalari so'zma-so'z qoldi; yangi `mix-blend-mode` tekshiruvi ikkala temaga tegadi.
8. **Tanlash:** `dengiz` — `tayyor: true`, kartada o'z statik `Miniatyura` si; «Tez orada» endi faqat «Nemis sayohati». Server ro'yxati o'zgarmadi.

## Rad etilgan yo'llar

- **O'rmon qurilishini takrorlash** (uchta to'liq ekranli xira qatlam): o'lchangan narxi ikki baravar.
- **Skrollga ergashuvchi chuqurlik o'lchagichi** (maketdagi «3 m → 85 m»): har kadr matn yozish (joylashuv va bo'yash), yo'l ustidagi qotgan element uchun shartnomada o'rin yo'q.
- **Kaustika (`feTurbulence`), sirt to'lqinlari, meduza va plankton:** filtrli yoki ko'p elementli bezak, byudjetdan chiqadi.
- **Har temada tugun, joy kartasi va mukofot fonining nusxasi:** ko'rik tuzatishlari (qulf semantikasi, nishon chetidagi joy, faqat bezak qatlamini kesish) temalar orasida ajralib ketardi.

## Oqibatlar

- 5-bosqich («Nemis sayohati») `sahna-qismlari.tsx` va `sahna-umumiy.ts` ni oladi va faqat palitra, reja, bezak va CSS beradi; uning `.alp-*` qoidalari `globals-css.test.ts` dagi `SCENE_THEMES` ga bitta qator bilan skanerga qo'shiladi.
- Dengiz fayllari `tema/dengiz/`, o'zgaruvchilar `--dengiz-*` `.lumio` va `.dark .lumio` ichida, harakat `.dengiz-*` sinflarida.
- Qabul qilingan cheklovlar: keng ekranda o'rta qism faqat suv, tizma, nur, pufakcha va baliqdan iborat (qoyalar chetlarda); 1920 px dan baland oynada tasmalar tugaydi (ADR-0132 dagi kabi, kerak bo'lsa `TILE_COPIES` oshiriladi).
- Qabul qilingan cheklovlar (yo'l): ko'rinayotgan unit ma'lum bo'lib `BIOME_SETTLE_MS` (250 ms) o'zgarmay turguncha sahna birinchi zonada turadi (sahifa ochilganda yo'l oldingi unitlar yonidan o'tib boradi, sahna esa har xabarga ergashsa zonalar bo'ylab ketma-ket xiralashib o'tardi); yo'ldagi eski unit qatorlari va daraja ajratgichlari tema ko'rinishini olmaydi (shartnomada o'rni yo'q).
- ADR-0132 dagi shisha va qoplama xiraligini o'chirish qoidalari (pastki navigatsiya, radio paneli, yon panel, varaq va muloqot oynalari) Dengizga ham tegadi: ular `[data-sahna]` bo'yicha ishlaydi, sahna ildizi esa `data-sahna="dengiz"`; yangi qoida yozilmadi.
- **Unumdorlik o'lchovi** (6-band; 2026-10-27, rejaning 8-vazifasi): ishlab chiqarish qurilmasi (`next build`), boshsiz Chromium, CDP `Emulation.setCPUThrottlingRate = 4`, ekran 390×844, 4 soniyalik skroll tsikli, `requestAnimationFrame` oraliqlari, 3 o'lchovning medianasi, soxta API. Chizish dasturiy, shuning uchun mutlaq raqamlar haqiqiy telefondagidan yomonroq; faqat taqqoslash ma'noli.

  | Ko'rinish | Rejim | p50, ms | p95, ms | kadr/s | Sahna elementlari |
  |---|---|---|---|---|---|
  | Toza | to'liq | 16.7 | 16.7 | 60 | — |
  | Toza | yengil | 16.7 | 16.8 | 60 | — |
  | Toza | «Kam harakat» | 16.7 | 16.8 | 61 | — |
  | O'rmon | to'liq | 33.3 | 50 | 34 | 392 |
  | O'rmon | yengil | 16.7 | 33.4 | 52 | 201 |
  | O'rmon | «Kam harakat» | 16.7 | 33.4 | 42 | 384 |
  | Dengiz | to'liq | 16.7 | 16.7 | 61 | 180 |
  | Dengiz | yengil | 16.7 | 16.7 | 60 | 112 |
  | Dengiz | «Kam harakat» | 16.7 | 16.8 | 61 | 140 |

  Besh qabul sharti bajarildi: Dengiz to'liq p50 ≤ 20 ms; u O'rmon p50 sining 0.7 qismidan oshmaydi; p95 O'rmonnikidan past; yengil va «Kam harakat» rejimlarida p50 ≤ 1.1 × Toza. Elementlar soni (180) ham ≤ 300. Dengiz hamma rejimda Toza darajasida (60–61 kadr/s). O'rmonning o'z to'liq sahnasi qimmat (34 kadr/s), hatto uning «Kam harakat» rejimi 42 kadr/s berdi; O'rmonni yengillashtirish alohida keyingi ish, bu ADR uni o'zgartirmaydi.
- **Haqiqiy telefonda tekshiruv hali QILINMAGAN:** yuqoridagi raqamlar faqat boshsiz brauzerning dasturiy chizishi va 4× sekinlashtirilgan protsessorida olingan.
