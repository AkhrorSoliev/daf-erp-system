# ADR-0133 — Ta'lim «Dengiz» temasi: arzon sahna (bitta tor harakatlanuvchi qatlam) va sahnali temalar uchun umumiy qismlar

**Holati:** Qabul qilindi
**Sana:** 2026-10-27
**Bog'liq:** `docs/superpowers/specs/2026-10-24-lernen-dizayn-tanlash-design.md` (§5, §7, §8, §9, §11, §12), `docs/superpowers/plans/2026-10-27-lernen-dengiz-tema.md`, ADR-0125, ADR-0128, ADR-0131, ADR-0132

## Kontekst

Ta'lim dizaynining 4-bosqichi — «Dengiz» temasi (CEO tasdiqlagan maket `docs/superpowers/mockups/2026-10-24-lernen-dizayn/dengiz.html`): sho'ng'ish, marjon rifi → kelp o'rmoni → chuqur dengiz, pufakchalar, baliqlar; unit sahifasida chig'anoq uyi, kema, g'or, xazina. 3-bosqich o'lchovida (protsessor 4× sekinlashtirilgan, dasturiy chizish) O'rmonning to'liq sahnasi skrollda ~30 kadr/s berdi (Toza ~60): narx uchta to'liq ekranli xira qatlamning parallaksida edi. Shu bilan birga O'rmon fayllarida temaga bog'liq bo'lmagan mantiq bor edi: tugun, joy kartasi, mukofot foni, darsning joyini tanlash, unit tsikli, boshlang'ich qiymatli tasodif.

## Qaror

1. **Arzon sahna:** har zona — qotgan suv rangi (yuqoridan pastga o'tish) va qotgan tog' tizmalari; yagona harakatlanuvchi qatlam — chetlardagi ikki tor (96 px) qoya tasmasi (640 px plitka, `TILE_COPIES` = 4 nusxa `<use>` bilan, ADR-0132 dagi aylanuvchi siljish); pufakcha, baliq to'dasi, tebranuvchi o'simlik va nur faqat `transform`/`opacity` bilan. CSS va SVG `filter`, `mix-blend-mode`, `feTurbulence` yo'q; `will-change` faqat ko'rinayotgan zona tasmalarida. Sahnada ≤ 300 element (spec chegarasi 1500). To'liq, yengil va «Kam harakat» rejimlaridagi sonlar `dengizPlan` da.
2. **Zona unit tartibidan:** `zoneForUnit` — marjon, kelp, chuqur, yana marjon (O'rmon biomlari bilan bitta `unitCycleIndex`). Yo'lda sahna ko'rinayotgan unitga 250 ms dan keyin ergashadi, unit sahifasida zona qotgan. Sahifalar o'zgarmadi.
3. **Chuqurlik — qotgan belgi:** zona chuqurligi («5 m», «25 m», «70 m») unit lavhasida, `t("{n} m")`, ekran o'quvchidan yashirin. Skrollga ergashuvchi o'lchagich qurilmadi.
4. **Umumiy qismlar:** `tema/sahna-umumiy.ts` (`unitCycleIndex`, `seededRandom`, `TILE`, `TILE_COPIES`, `CARD_SURFACE_ALPHA`, `joyTanla`) va `tema/sahna-qismlari.tsx` (`SharTugun`, `SahnaJoy`, `SahnaMukofotFoni`; tema id'si `<id>-ring`, `<id>-bob`, `<id>-burst` sinflarini va `--<id>-mukofot-*`, `--<id>-tepalik` o'zgaruvchilarini nomlaydi). O'rmon ularning o'ramiga aylandi; uning chizgan markup'i bayt-ma-bayt o'zgarmadi (oltin nusxa bilan solishtirib isbotlandi). Dengiz plitkasining 4 nusxasi ham shu umumiy `TILE`/`TILE_COPIES` dan: ikki tema bir xil balandlikka (1920 px gacha) chidaydi.
5. **Noma'lum dars turi:** har tema `joyTanla` ga `Record<DafLessonKind, J>` beradi (yangi tur kompilyatsiyani to'xtatadi); ishlash vaqtida noma'lum tur (server va klient alohida deploy qilinadi) va eski DiB darsi birinchi bosqichning joyini oladi.
6. **Unumdorlik chegarasi** (keyingi sahnali temalar uchun ham): protsessor 4× va 4 soniyalik skroll o'lchovida to'liq rejimning kadr medianasi (p50) ≤ 20 ms (va O'rmonning to'liq rejimidan kamida 30% pastroq, p95 ham O'rmonnikidan past); yengil va «Kam harakat» rejimlari Toza darajasida (p50 ≤ 1.1 × Toza). Dengizning o'lchov jadvali PR tavsifida.
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
- Unumdorlik faqat boshsiz brauzerda (protsessor 4× sekinlashtirilgan, dasturiy chizish) o'lchanadi; haqiqiy telefonda tekshiruv hali qilinmagan.
