# ADR-0128 — Ta'lim mashq va natija ekrani: tema shartnomasiga ikki o'rin, xato javob yumshoq

**Holati:** Qabul qilindi
**Sana:** 2026-10-25
**Bog'liq:** `docs/superpowers/specs/2026-10-24-lernen-dizayn-tanlash-design.md` (§3, §8, §9, §12), `docs/superpowers/plans/2026-10-25-lernen-dizayn-mashq-natija.md`, ADR-0125

## Kontekst

Ta'lim dizaynining 2-bosqichi: mashq ekrani, javob ovozi va Dafi, natija ekrani (mukofot) va unit sahifasi. Ilgari xato javob qizil «Noto'g'ri» edi — spec §3 dagi «xato jazolamaydi» qoidasiga zid; natija ekranida ovoz, konfeti va Dafi yo'q edi; unit sahifasi oddiy ro'yxat edi. Keyingi temalar (O'rmon, Dengiz, Nemis sayohati) natija foni va unit sarlavhasini o'zicha chizadi: shartnoma hozir kengaytirilmasa, har tema bosqichida bu ekranlarga qayta tegish kerak bo'lardi.

## Qaror

1. **Tema shartnomasi `LernenTema = { id, TugunBelgisi, MukofotFoni, UnitLavha }`** (`tema/tema-turlari.ts`). Ikki yangi o'rin: `MukofotFoni` (`{ bayram, children }` — natija sahnasining foni; «Toza»: oddiy koral tus) va `UnitLavha` (`{ daraja, matn }` — unit sahifasining sarlavhasi; «Toza»: daraja rangidagi lavha va salom berayotgan Dafi). Reyestr testi (`tema-reyestri.test.ts`) har tayyor temada ikkalasi borligini tekshiradi. Mashq sarlavhasi va chizig'i, variantlar, pastki panel, konfeti, ball sanog'i, ovoz va Dafi qarorlari temaga bog'liq emas: tema faqat CHIZADI.
2. **Xato javob — yumshoq «Deyarli!»:** amber rang (qizil emas), «To'g'ri javob: X», yumshoq `xato` ovozi, Dafi «yumshoq xato». Ranglar bitta joyda (`uebung/javob-ohangi.ts`); «Deyarli!» sarlavhasi amber tusli panelda yorqin amberda 3:1 dan past o'qilgani uchun `.lumio` ostidagi `--amber-ink` tokenini oladi (yorug' rejimda to'q jigarrang, qorong'uda och amber; `globals.css`). Yakuniy sinovdan o'tilmaganda va natija tekshirilmay qolganda ham natija ekranida amber karta chiqadi. `javob-ohangi.test.ts` javob vidjetlari va natija ekranida `danger` sinfi yo'qligini tekshiradi. Tarmoq xatosi (so'rov yuborilmadi) xato javob emas va qizil matn bo'lib qoladi.
3. **Natija bayrami (`natijaHissiyoti`, `uebung/hissiyot.ts`):** oddiy dars va takrorlash — har doim (`mukofot` ovozi bir marta, konfeti, Dafi 3 sakrashi); yakuniy sinov — faqat server `tayyor` deb javob bergan va `bestanden` bo'lsa. Kutilayotganda Dafi o'ylaydi, o'tilmasa yumshoq xato, so'rov yiqilsa tinch (o'quvchining aybi emas). `mukofot` natija ekrani har ochilganda bir marta chalinadi: ref qo'riqchisi React StrictMode'ning ikkinchi effekt yurishidan ham saqlaydi. Konfeti canvas'i `FadeIn` ning QO'SHNISI, ichidagisi emas: `.lumio-fade-up` ning `transform`'i ~320 ms davomida `position: fixed` ni shu quti o'lchamiga bog'laydi. Kam harakatda konfeti yo'q, Dafi statik, o'tishlar darrov; ovoz alohida sozlama.
4. **Javob ovozi va Dafi server hukmi callback'idan** (`pruefen` ning va har juftning `onSuccess`'i, `useJavobSezgisi().javobKeldi`) chalinadi, `natija` effektidan emas: juftlash formatlarining sintetik yakuniy natijasi ikkinchi marta chalardi. Tarmoq xatosida jim. `togri` va `xato` mashq ekranida faqat shu yo'ldan keladi; `mukofot` — natija ekranida; `bos` va `qulf` — unit sahifasida (yo'l varag'idagi tugun bilan bir xil); `unitOchildi` — faqat yo'l varag'ida. `ovozniUygot()` bosishning o'zida chaqiriladi (iOS, Telegram). `Dafi` ga `tetik` berilgan: bir xil holat takror o'ynashi uchun (hukmlar sanog'i).
5. **Qurilmaning «Kam harakat» kaliti** ekran ildizidagi `data-kam-harakat` orqali `lumio-fade-up`, `lumio-stagger` va `lumio-shake` ni ham tizim sozlamasi kabi darrov yechadi: `globals.css` dagi `.lumio [data-kam-harakat] …` avlod qoidalari (shuning uchun atribut tashqi ildizda, o'tishlar uning ichida turadi).

## Rad etilgan yo'llar

- **Qizil «Noto'g'ri»ni qoldirish:** spec §3 ga zid; CEO yumshoq ohangli mockupni (duo.html) tanlagan.
- **Shartnomani 3-bosqichgacha kengaytirmaslik:** har tema bosqichida natija va unit ekranlari qayta ochilardi.
- **Yakuniy sinovni mijoz sanog'i bo'yicha nishonlash:** o'tdi/o'tmadini faqat server aytadi (`sinov-natijasi.ts`); noto'g'ri bayram o'chirib bo'lmaydigan xato.
- **Ovozni `natija` effektidan chalish:** juftlashda sintetik natija ikkinchi ovozni berardi, StrictMode'da esa effekt ikki marta yuradi.

## Oqibatlar

- Yangi tema `TugunBelgisi`, `MukofotFoni` va `UnitLavha` ni beradi.
- Unit sahifasidagi «joy» kartalari hozircha «Toza» tugun modelidan (`toza-tugun-model.ts`) to'g'ridan-to'g'ri foydalanadi, shartnoma o'rni emas; o'z unit sahnasi bo'lgan tema kelganda ular `UnitLavha` ga yoki yangi o'ringa ko'chirilishi kerak.
- `tema/toza/toza-unit-lavha.tsx` `DARAJA_FONI` ni `yol/yopishqoq-unit-lavha.tsx` dan oladi; o'sha fayl `tema/` dan HECH QACHON import qilmasligi kerak (qiymat tsikli bo'lib qoladi).
- «Noto'g'ri», «+{n} ball» va kichik harfli «seriya» matnlari lug'atlardan olib tashlandi.
- Juftlash mashqidagi ilgaridan bor xato (ikki juft bir vaqtda yo'lda bo'lsa, birinchisi abadiy kutilayotgan holatda qolardi, chunki TanStack Query `mutate` ning faqat oxirgi chaqiruvidagi callback'larni saqlaydi) shu tarmoqda TUZATILDI: har juftning hukmi `juftTekshir.mutateAsync(…).then(ok, err)` bilan biriktiriladi, shuning uchun har juftning o'z va'dasi hal bo'ladi va har biri bitta ovoz va Dafi reaksiyasini beradi; ekran yopilgandan keyin kelgan hukm jim qoladi (`tirik` ref).
- Ma'lum cheklovlar (ataylab shu ishda tuzatilmagan):
  - Ikkala lavhada (yo'ldagi yopishqoq va unit sahifasidagi) daraja ranglaridagi oq matn 2.5–4.2:1, «Toza» belgilaridagi ikonalar 3:1 dan past. Palitrani CEO tasdiqlagan; to'qroq qilish — ko'rinish qarori, ochiq qoldi.
  - iOS/Telegram'da ovozni uyg'otish haqiqiy qurilmada tekshirilmagan (mexanizm: bosishning o'zida dinamik import orqali `ovozniUygot()`).
