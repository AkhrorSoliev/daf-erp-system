# ADR-0131 — Ta'lim «O'rmon» temasi: shartnomaga sahna va joy o'rinlari, sahna unumdorligi qoidalari

**Holati:** Qabul qilindi
**Sana:** 2026-10-26
**Bog'liq:** `docs/superpowers/specs/2026-10-24-lernen-dizayn-tanlash-design.md` (§5, §7, §8, §9, §11, §12), `docs/superpowers/plans/2026-10-26-lernen-ormon-tema.md`, ADR-0125, ADR-0128

## Kontekst

Ta'lim dizaynining 3-bosqichi — «O'rmon» temasi (CEO tasdiqlagan mockup `docs/superpowers/mockups/2026-10-24-lernen-dizayn/ormon2.html`): yo'l va unit sahifasi orqasida uch biomli (tong, ko'l, kuz) qatlamli o'rmon, uchqunlar, nur dastasi, parallaks; unit sahifasida darslar sahnadagi «joy» (kulba, ko'prik, g'or, qal'a), qulflilari tumanda. 1–2-bosqich shartnomasida (`TugunBelgisi`, `MukofotFoni`, `UnitLavha`) sahna o'rni yo'q edi; unit sahifasidagi joy kartalari «Toza» modelidan to'g'ridan-to'g'ri chizilardi (ADR-0128, Oqibatlar). Doimiy fon animatsiyasi zaif telefonda og'ir bo'lishi mumkin (spec §14).

## Qaror

1. **Shartnoma:** `LernenTema` ga `UnitJoyi` (majburiy; «Toza»niki — eski karta so'zma-so'z ko'chirildi), `Sahna?` va `Miniatyura?` (ixtiyoriy) qo'shildi; `UnitLavhaProps` ga `unitTartibi?`. Sahnasiz tema («Toza») o'zgarmaydi. Yo'l mantig'i (`yol-tuzilishi`, `fortschritt`, `seans-navbat`) tegilmadi; `LernenYol` faqat ko'rinayotgan unitni sahifaga aytadi (`onUnitKorindi`).
2. **Sahnani sahifa chizadi:** `SahnaRamka` (`tema/sahna-ramka.tsx`) — `fixed`, `-z-10` (sahifa ildizi `isolate`), `CONTENT_INSET` bilan rail'dan chiqadi, `aria-hidden`, bosishni olmaydi. U yuklash holatidan oldin chiziladi: ma'lumot kelmasa yoki yiqilsa ham fon turadi.
3. **Biom unitning darajadagi tartibidan:** `biomeForUnit(order)` — tong, ko'l, kuz, yana tong (spec §5 dagi `palitraUnitga`). Yo'l ham, unit sahifasi ham `order` ni biladi — qo'shimcha so'rov yo'q, ikki ekran bir biomni ko'rsatadi.
4. **Unumdorlik qoidalari** (keyingi temalar uchun ham majburiy): faqat `transform` va `opacity` animatsiya qilinadi (`globals-css.test.ts`); sahna boshiga bitta `requestAnimationFrame` (parallaks), yashirin tabda va ekrandan tashqarida to'xtaydi (`data-tinch`); qatlam — aylanuvchi 640 px SVG plitka va uchta `<use>` nusxa (`TILE_COPIES = 4`), siljish (−640, 0] da aylanadi va balandligi 1920 px gacha oynani yopadi, DOM yo'l uzunligiga bog'liq emas; xiralik SVG ichida, harakatlanuvchi qatlamda CSS `filter` yo'q; biom almashinuvi — `opacity` almashuvi, ko'rinmayotgan biom chizilmaydi (`visibility: hidden`); sahnada ≤ 1500 element (amalda ~400); zaif qurilmada (`hardwareConcurrency <= 4` yoki `deviceMemory <= 2`; brauzer javob bermaguncha shunday deb olinadi) qatlam va bezak yarmi; «Kam harakat» (tizim yoki qurilma) — qotgan rasm: parallaks, uchqun va tushayotgan barg yo'q, biom darrov almashadi; joriy tugunning halqasi `opacity: 0` da turgani uchun tugun statik belgi saqlaydi.
5. **Sahna ustida `backdrop-filter` yo'q:** ambient qatlamlar doim animatsiya qilinadi, shuning uchun shisha xiralik har kadr qayta hisoblanardi. Sahna turganda qobiqning shisha elementlari (pastki navigatsiya, radio paneli, rail) xiralikni yo'qotadi: `.lumio:has([data-sahna]) .glass { backdrop-filter: none }`. `:has()` yo'q WebView'larda (Chrome < 105, Safari < 15.4) xiralik qoladi.
6. **Hujjatda bitta sahna:** filtr va plitka `id`'lari (biom, qatlam) bo'yicha beriladi, shu sababli bir hujjatda faqat BITTA sahna nusxasi turadi. Kelajakdagi `Miniatyura` yoki har qanday ikkinchi ko'rinish sahnaning qatlam komponentlarini qayta ishlatmasligi shart (O'rmon miniatyurasi o'z statik SVG'ini chizadi).
7. **Kontrast:** sahifaning umumiy matni (sarlavha, daraja yorlig'i, bo'lim sarlavhasi, bo'sh/xato holat) sahnada shaffof bo'lmagan `bg-surface` parda ustida turadi — faqat sahnali temada. Temaning o'z matni (tugun yorlig'i, joy kartasi, lavha, «Boshlash», mukofot foni) 4.5:1 dan past emas: `ormon-kontrast.test.ts` uni `globals.css` tokenlari va biom ranglaridan, yorug' va qorong'u rejimda hisoblaydi.
8. **Tanlash:** `ormon` — `tayyor: true`; Sozlamalardagi karta temaning statik `Miniatyura` sini chizadi. Server ro'yxati o'zgarmadi (`ormon` id'si allaqachon bor).

## Rad etilgan yo'llar

- **Rangni skroll bilan uzluksiz aralashtirish** (mockupdagi `palAt`, har kadrda CSS o'zgaruvchilari): har kadrda katta xira qatlamlarni qayta chizadi.
- **Yo'l balandligiga teng qatlamlar** (mockupdagi `lh`): DOM va GPU xotirasi yo'l bilan o'sadi, ma'lumot kelmaguncha balandlik noma'lum.
- **«Shisha» kartalar (`backdrop-filter`) va qatlamlarda CSS `blur`:** sahna har skroll kadrida ostidan siljiydi — zaif telefonda har kadr qayta xiralash.
- **Sahnani har tema o'zi `fixed` qilishi:** rail, qatlam tartibi va «yuklanayotganda ham» qoidalari har temada takrorlanardi.
- **Biomni yo'ldagi unitning umumiy indeksidan:** unit sahifasi uchun butun yo'l so'rovi kerak bo'lardi.
- **Daraxtlar tebranishi va tugunlarni bog'lovchi yorug' lenta:** birinchisi SVG ichida qayta chizadi, ikkinchisi tugun koordinatalarini DOM'dan o'lchashni talab qiladi.

## Oqibatlar

- Yangi tema (Dengiz, Nemis sayohati) o'z `Sahna` sini beradi, sahifa uni `SahnaRamka` ichida chizadi; 4–6-bandlardagi qoidalar unga ham tegishli. `layerOffset`, `scenePaused` (`harakat/parallaks.ts`) va `useParallaks`, `useSahnaPauza`, `useYengilRejim` (`harakat/use-sahna.ts`) qayta ishlatiladi.
- O'rmonning tokenlari (`--ormon-*`) `.lumio` va `.dark .lumio` ichida; animatsiyalar `.ormon-*` sinflari, `data-kam-harakat`, `data-tinch` va `prefers-reduced-motion` ostida to'xtaydi.
- Ataylab qoldirildi (4–5-bosqich yoki kerak bo'lganda): yo'ldagi eski unit qatorlari va daraja ajratgichlari tema ko'rinishini olmaydi (shartnomada o'rni yo'q), tugunlarni bog'lovchi lenta, temalar kodini alohida chunk'ka bo'lish.
- Qabul qilingan cheklovlar: yengil rejimdan to'liq rejimga (gidratatsiyadan keyin) o'tganda kuchli qurilmada nur sharlari va o'rta daraxtlar joyi o'zgarishi mumkin; birinchi chizishda biom tong'dan boshlanadi, ko'rinayotgan unit ma'lum bo'lguncha; 1920 px dan baland oynada qatlam tugab, ostida faqat osmon gradienti qoladi (kerak bo'lsa `TILE_COPIES` oshiriladi).
