# B4 — «To'lovlar» sahifasi — dizayn

**Sana:** 2026-10-11
**Holati:** CEO tomonidan tasdiqlangan (11.10.2026: 9 band, keyin yangi qismlar maketi va qolgan savollarga javob — §2)
**Maketlar:**
- https://claude.ai/artifact/YA4jhqf4NH8ZrqnBbjB9UL — `v-payments` bo'limi, `pdrawer` oynasi, «Qayerdan keldi» oynasi `dlg-income` (CEO 27.09 da tasdiqlagan)
- https://claude.ai/artifact/EYKB7GyymcsDT18fnYBRF3 — maket ko'rsatmagan qismlar: Administrator/Kassir ko'rinishi (yig'ma kartasiz), bekor qilingan va tuzatilgan qator, oynadagi ikki kvitansiya raqami, «Bekor qilish» oynasi (CEO 11.10 da o'zgarishsiz tasdiqlagan)

**Tayanadi:** ADR-0067 (kassa uch qismda, `getIncomeMonthAttribution`), ADR-0065 (chek va bekor qilish xabari darhol), ADR-0021 (bosma raqam va uning bo'linishi bitta chaqiruvdan), ADR-0072 (B2a: eski havolalar yo'naltiriladi), ADR-0079 (imkoniyatlar), ADR-0081 (filial chegarasi).
**Qaror yozuvi:** yangi ADR — shu PR'da yoziladi (§7.1). Raqami — PR paytidagi keyingi bo'sh raqam (yozilish paytida 0084; `origin/main` va lokal shoxlardagi `docs/adr/README.md` tekshiriladi). Quyida «yangi ADR» deb ataladi.

## 1. Nima uchun va qayerda

B to'plami Moliyani tasdiqlangan maket asosida qayta quradi. 1 (#658), 2a (#665) va 2b (#686) qismlar prodda; 3-qism (#699) merge kutmoqda. 4-qism — yangi «To'lovlar» sahifasi; u Hisobotlardagi «O'quvchi to'lovi»ni almashtiradi; Moliyadagi «Kutilyotgan to'lovlar» (aslida qarzdorlar ro'yxati) menyudan chiqib «Qarzdorlik»ka yo'naltiriladi. B1 shu qismga uchta qarz qoldirgan: «To'lovlar →» va «Barcha to'lovlar →» havolalari hamda «Guruh» ustunining qoidasi (B1 spec §2.2, §2.4).

Bugun nima noto'g'ri:
- To'lovlar ro'yxati Hisobotlar ostida, «O'quvchi to'lovi» nomi bilan, faqat CEO va filial direktoriga ochiq. Administrator va kassir pulni har kuni qabul qiladi, lekin ro'yxatni ko'rmaydi.
- Davr tugmalari yo'q (faqat ikki sana), qidiruv yo'q, jami summa yo'q (faqat yozuvlar soni), «Bonus» ustuni doim bo'sh.
- Bekor qilingan to'lovlar umuman ko'rinmaydi; tuzatilgan to'lovning aslini topib bo'lmaydi.
- To'lov qatoridan hech narsa ochilmaydi: pul nimaga ketgani, to'lov paytidagi balans, kvitansiya — hammasi boshqa sahifalarda.
- To'lovni bekor qilish serverda bor, lekin hech qaysi ekranda tugmasi yo'q; sabab ixtiyoriy.
- Kvitansiyaning tizim raqami (`R-2026-…`) faqat PDF birinchi marta ochilganda yaratiladi, shuning uchun raqam bo'yicha qidirib bo'lmaydi.
- «Guruh» ustuni o'quvchining HOZIRGI guruhini ko'rsatadi: o'tgan oydagi to'lov bugungi guruh bilan chiqadi.

## 2. CEO qarorlari (11.10.2026)

1. «To'lovlar» — Moliya menyusida «Umumiy ma'lumotlar»dan keyin. CEO, filial direktori, administrator, kassir ko'radi. Yig'ma karta (davr jami, uch qism, usullar, onlayn avtomatik) — faqat CEO va filial direktoriga (`reports.finance`), «Umumiy ma'lumotlar»dagidek. Administrator va kassir ro'yxat, filtrlar, «Tanlangan: N ta · X so'm» va oynani ko'radi.
2. Har qatordagi «Nimaga ketdi» = «Kassaga tushdi»ning AYNAN o'sha hisobi (`getIncomeMonthAttribution`, ADR-0067: shu oy / oldindan / eski qarz, tanlangan davr OXIRIGA nisbatan). O'sha bitta dvigatel har to'lovning qismlarini ham qaytaradi; ikkinchi dvigatel yo'q. «Bu oy»da qatorlar qismlarining yig'indisi kartaning uch raqamiga teng. Bitta to'lovning yorlig'i tanlangan davrga qarab o'zgarishi mumkin — spec va qo'llanma buni aytadi.
3. «Guruh» — o'quvchining TO'LOV KUNIDAGI guruhi (§4.5); guruh, ustoz va kurs filtrlari ham shu qoida bilan.
4. `/reports/student-payments` («O'quvchi to'lovi») va `/payments/pending` («Kutilyotgan to'lovlar») menyulardan chiqadi va server tomonda yo'naltiriladi: «O'quvchi to'lovi» — yangi «To'lovlar» sahifasiga, «Kutilyotgan to'lovlar» — «Qarzdorlik»ka (`/payments/debt`; 13-band bilan o'zgartirildi). Ishlatilmay qolgan endpointlar olib tashlanadi (§5.11).
5. Kvitansiya: tizim raqami (`Payment.receiptCode`, `R-YYYY-NNNNN`) ham, qog'oz raqami (`Payment.receiptNumber`) ham ko'rsatiladi; qidiruv ikkalasini topadi. Tizim raqami to'lov yozilganda beriladi (§4.7), eski to'lovlarga bir martalik skript bilan (§5.10).
6. «Bekor qilinganlar» — REVERSED to'lovlar; tuzatilgan to'lovning eski qatori «tuzatildi → <yangi summa>» belgisi va yangi to'lovga havola bilan (§4.8).
7. Excel: jadval ustunlari + o'quvchi ID, telefon, kvitansiya (ikkalasi), izoh, manba, holat; joriy filtrlar; hamma sahifalar.
8. Maketdan: davr tugmalari, filtrlar, oyna, sahifalash, bo'sh holat — §3 dagidek. «Tuzatish» — o'quvchi profilidagi dialogning o'zi (`payments.correct`); «Bekor qilish» — faqat CEO (`money.undo`), sabab MAJBURIY (serverda ham), «pul darslarga sarflangan» rad javobi saqlanadi va ko'rsatiladi. Filial — tepadagi tanlovdan (`@BranchScope()`), sahifada filial filtri yo'q.
9. «Umumiy ma'lumotlar»dan havolalar: «Kassaga tushdi» kartasidagi «To'lovlar →», «Oxirgi to'lovlar»dagi «Barcha to'lovlar →», «Qayerdan keldi» oynasidagi «Barcha to'lovlar» — har biri yangi sahifani mos davr bilan ochadi (§6.3).

Ikkinchi javob (CEO, 11.10.2026, spec loyihasidan keyin):

10. Yangi qismlar maketi (https://claude.ai/artifact/EYKB7GyymcsDT18fnYBRF3) o'zgarishsiz tasdiqlandi.
11. Qator yorliqlari davrga moslashadi: davr oylar chegarasidan o'tsa «Shu davr to'lovi»; davr oyning oxirgi kunida tugamasa «Oldindan (balansda)», tugasa «{Keyingi oy} uchun oldindan» (§4.4).
12. Administrator va kassir har qatordagi «Nimaga ketdi»ni, uning filtrini va oynadagi bo'limni ko'radi; yig'ma karta faqat CEO va filial direktoriga qoladi (§3.12).
13. **O'zgarish (4-bandga):** `/payments/pending` («Kutilyotgan to'lovlar») «Qarzdorlik»ka (`/payments/debt`) yo'naltiriladi, «To'lovlar»ga emas; `/reports/student-payments` yangi sahifaga yo'naltirilishi o'zgarmaydi (§6.2).
14. Tasdiqlandi: kvitansiyaning tizim raqami to'lov commit bo'lgandan keyin, pul tranzaksiyasidan tashqarida beriladi (§4.7); Excel 20 000 qator bilan cheklanadi (§5.6); «pul darslarga sarflangan» rad javobi yangi o'zbekcha matn bilan (§5.7).

## 3. Sahifa — `/payments/list`

### 3.1 Menyu, marshrut, kirish

- Marshrut `/payments/list` (`/payments` o'zi bugungidek mobil menyu / `overview`ga yo'naltirish bo'lib qoladi). Breadcrumb «Moliya / To'lovlar» (`breadcrumb-routes.ts`ga `list: "To'lovlar"`).
- Moliya menyusi (`payments-nav.ts`): «Umumiy ma'lumotlar», **«To'lovlar»** (`/payments/list`, ikonka `Wallet`, `permission: "payments.view"`), «Xarajatlar», «Ish haqi», «Qaytariladigan pul», «Qarzdorlik», «To'lov tizimlari jurnali». «Kutilyotgan to'lovlar» olib tashlanadi.
- Hisobotlar menyusi (`reports-nav.ts`): «O'quvchi to'lovi» olib tashlanadi; «Moliyaviy hisobotlar»da faqat «To'lov hisobotlari» qoladi.
- Kirish: sahifa va uning o'qishlari — `payments.view` (sukut bo'yicha CEO, filial direktori, administrator, kassir — `permission-catalog.ts:201`). Uning yorlig'i «Moliya bo'limi: umumiy ma'lumotlar va to'lovlar ro'yxati» bo'ladi (endi «kutilayotgan to'lovlar» yo'q). Yig'ma karta — `reports.finance` (CEO, filial direktori). «To'lov qayd qilish» — `payments.create`. «Tuzatish» — `payments.correct` (direktor, admin). «Bekor qilish» — `money.undo` (sukut bo'yicha faqat CEO).
- Filial: tepadagi tanlov. Sahifada filial select'i yo'q.
- Qidiruv sahifasi (`client/src/data/searchable-pages.ts`) ga «To'lovlar» qo'shiladi (`/payments/list`, kalit so'zlar: to'lovlar, kvitansiya, tushum, bekor qilingan to'lov).

### 3.2 Sarlavha

«← Umumiy ma'lumotlar» (`/payments/overview`), H1 «To'lovlar». O'ngda «Excel» (download ikonka; §5.6) va asosiy «To'lov qayd qilish» (plyus; mavjud `RecordPaymentDialog`; muvaffaqiyatdan keyin ro'yxat, karta va «Umumiy ma'lumotlar» so'rovlari yangilanadi). Oy tanlagich yo'q.

### 3.3 Davr

Segment: «Bugun» · «Kecha» · «Bu hafta» · **«Bu oy»** (sukut) · «O'tgan oy» · «Oraliq». URL: `?davr=bugun|kecha|hafta|oy|otgan-oy|oraliq`, «Oraliq» uchun `&dan=YYYY-MM-DD&gacha=YYYY-MM-DD`.

Davr mijozda Toshkent kunlariga aylantiriladi (`lib/tashkent-time.ts` ustidagi bitta toza funksiya `periodRange(davr, today)`), serverga faqat `startDate` / `endDate` boradi:
- «Bugun» — bugun; «Kecha» — kecha.
- «Bu hafta» — shu haftaning dushanbasidan shu haftaning yakshanbasigacha (dushanbadan boshlanadi; maketdagi 21.09–27.09).
- «Bu oy» — shu oyning 1-sanasidan oxirgi sanasigacha (kelajak kunlar ham kiradi — «Kassaga tushdi» kartasi bilan bir xil davr).
- «O'tgan oy» — o'tgan oyning 1-sanasidan oxirigacha.
- «Oraliq» — ikki `date` maydon («Boshi» — «Oxiri»), `min="2026-05-01"`. Bo'sh yoki teskari bo'lsa so'rov yuborilmaydi va maydon ostida «Boshi oxiridan keyin bo'lmasin» yoziladi.

Pastki chegara `2026-05-01` (tizimning hisobot chegarasi). URL'dagi noto'g'ri `davr` → «Bu oy».

### 3.4 Yig'ma karta (faqat `reports.finance`)

Ma'lumot: `GET /payments/list/summary` (§5.4). Mijoz bu so'rovni faqat `reports.finance` egasi uchun yuboradi; boshqalar uchun karta joyi umuman chizilmaydi (§3.12).

- Sarlavha davrga qarab: «Bugun tushgan pul» / «Kecha tushgan pul» / «Shu hafta tushgan pul» / «{Oy}da tushgan pul» (Bu oy, O'tgan oy — masalan «Sentabrda tushgan pul») / «Tanlangan oraliqda tushgan pul».
- Katta raqam — dvigatelning `total`i (§4.4) har bir davrda; mln ko'rinishida («X.X mln»). Ostida «{paymentCount} ta to'lov · {payerCount} o'quvchi».
- **Faqat «Bu oy»da:**
  - yashil belgi ««Kassaga tushdi» kartasidagi raqamning o'zi» (qurilishiga ko'ra rost: ikkalasi bitta funksiyaning bitta davrdagi natijasi);
  - uch rangli chiziq va uch chip (0 bo'lgani chiqmaydi): «{Oy} to'lovi **X**» (yashil, `currentMonth`), «{Keyingi oy} uchun oldindan **X**» (ko'k, `advance`), «Eski qarzlar **X**» (sariq, `lateTotal`). Chip bosilganda «Nimaga ketdi» filtri o'sha qismga o'rnatiladi; qayta bosilsa bo'shatiladi. Chiziq va chiplar — `income-dialog.tsx`dagi `IncomeBreakdown`ning qayta ishlatilgan bo'laklari.
- Usul chiplari (har doim): «Naqd **X**», «Click **X**», «Payme **X**», «O'tkazma **X**», «Uzum **X**» (0 bo'lgani chiqmaydi, summasi bo'yicha kamayish tartibida) va punktir chip «shundan onlayn avtomatik **X** · N ta» (N = 0 bo'lsa chiqmaydi).
- Boshqa davrlarda yashil belgi, chiziq va uch chip yashiriladi; katta raqam, soni va usul chiplari qoladi.

### 3.5 Filtrlar

Asosiy qator:
- Qidiruv, placeholder «Ism, telefon, ID yoki kvitansiya raqami» (`?q=`, 300 ms kechikish bilan; qoida §4.6).
- «Barcha usullar» — Naqd, Click, Payme, O'tkazma, Uzum (`?usul=CASH|CLICK|PAYME|TRANSFER|UZUM`).
- «Nimaga ketdi: hammasi» — «Shu oy to'lovi» / «Oldindan» / «Eski qarz» (`?nimaga=joriy|oldindan|qarz`). Variant nomlari davrdan qat'i nazar shunday (qatordagi yorliqlar esa §4.4 bo'yicha).
- «Barcha guruhlar» (`?guruh=<groupId>`).
- «Yana filtrlar» (sliders ikonka; ochiq/yopiq holati faqat sahifada, URL'da emas; yopiq turganda ichidagi filtr tanlangan bo'lsa tugma yonida son pill'i: «Yana filtrlar · 2»), «Tozalash» (hamma filtr va qidiruvni tozalaydi, davrni emas).

«Yana filtrlar» ichida:
- «Barcha ustozlar» (`?ustoz=<userId>`), «Barcha kurslar» (`?kurs=<courseId>`).
- «Kim qabul qildi: hammasi» — qamrovdagi to'lovlarni qabul qilgan xodimlar + «Onlayn» (`?qabul=<userId>|onlayn`).
- «Manba: hammasi» — «Admin kiritgan» / «Onlayn avtomatik» (`?manba=admin|onlayn`).
- Holat: «Faqat o'tgan to'lovlar» (sukut) / «Bekor qilinganlar» / «Hammasi» (`?holat=otgan|bekor|hammasi`).

Mijozda har filtr bitta qiymat tanlaydi (maketdagidek); server esa ro'yxat oladi (§5.2), shuning uchun keyin ko'p tanlovga o'tish faqat mijoz ishi (§11). Variantlar ro'yxati — `GET /payments/list/filter-options` (§5.5). Filtr o'zgarsa sahifa 1 ga qaytadi.

### 3.6 Jami qatori

Jadval ustida: «Tanlangan: **N ta to'lov** · **X so'm**». N — filtrga tushgan hamma qatorlar (bekor qilinganlar ham); X — ulardan faqat amaldagilarining (COMPLETED) summasi. «Bekor qilinganlar» tanlanganda X = 0 bo'lgani uchun matn «Tanlangan: **N ta bekor qilingan to'lov** · summaga qo'shilmaydi» bo'ladi.

«Nimaga ketdi» filtri tanlanganda qatorga qo'shiladi: « · shundan {qism nomi}: **Y so'm**» — Y = tanlangan qatorlardagi aynan shu qismning yig'indisi. Bitta to'lov bo'linishi mumkin (masalan 150 000 eski qarz + 385 714 shu oy), shuning uchun X to'lovlarning to'liq summasi, Y esa qism. «Bu oy»da boshqa filtrsiz Y kartadagi chip raqamiga teng (§4.4).

Maket izohidagi «(namuna qatorlar; …)» qavsi yozilmaydi.

### 3.7 Jadval

Ustunlar: Sana | O'quvchi | Guruh | Summa (o'ngga tekislangan) | Usul | Nimaga ketdi | Qabul qildi. Tartib — `createdAt` kamayish bo'yicha.

- **Sana:** «26.09 18:20» (Toshkent). Davr bir yildan oshib ketsa ham yil yozilmaydi (pastki chegara 2026-05; yil oynada bor).
- **O'quvchi:** ism familiya (qalin); ostida kichik «ID 1XXXX». Kartasi arxivlangan o'quvchi (§5.1) — ism oddiy matn, yonida kulrang «arxivda» pill.
- **Guruh:** §4.5 bo'yicha birinchi guruh nomi; bir nechta bo'lsa yonida «+1» pill (title'da hammasi). Guruh yo'q — «—».
- **Summa:** «450 000». Bekor qilingan qator — kulrang, ustidan chizilgan.
- **Usul:** «Click» va onlayn bo'lsa (§4.3) yonida kulrang «onlayn» pill.
- **Nimaga ketdi:** har qism bitta pill + summa (shu oy — yashil, oldindan — ko'k, eski qarz — sariq; yorliqlar §4.4). Bekor qilingan qator: qizil «bekor qilingan» pill. Tuzatilgan to'lovning eski qatori: qizil «bekor qilingan» o'rniga to'q sariq «tuzatildi → 400 000» pill (bosilsa yangi to'lov oynasi ochiladi, §3.8). Qismlari hisoblanmagan amaldagi to'lov (dvigatel uni topmagan — §10) — «—».
- **Qabul qildi:** «Ism (admin)» — qabul qilgan xodimning ismi va eng yuqori rolining qisqa nomi (CEO → «CEO», Branch Director → «direktor», Administrator → «admin», Cashier → «kassir»); bu to'rt roldan birortasi yo'q akkaunt (masalan, faqat Teacher yoki rolsiz) — faqat ism, qavssiz; onlayn to'lov — «Onlayn»; qabul qiluvchisi yo'q eski qator — «—».
- Qator bosilganda (Enter/Space ham) — oyna (§3.8).
- Pastda sahifalash: «1–50 / N», «50 ta / 100 ta» (`?soni=50|100`, sukut 50), ‹ ›; sahifa `?sahifa=`. Joriy sahifa oxirgisidan katta bo'lib qolsa (filtr toraydi) — oxirgi sahifaga o'tiladi (B2a'dagi `lastPageIfPast`).

### 3.8 To'lov oynasi (o'ngdan)

Ma'lumot — qatorning o'zi (ro'yxat javobi oyna uchun hamma narsani olib keladi, alohida so'rov yo'q). Faqat «tuzatildi → …» havolasi va URL'dagi `?tolov=<id>` (sahifa yangilanganda oyna ochiq qolishi uchun) `GET /payments/list/rows/:id` bilan o'qiydi (§5.3). Enter bilan ochiladi, Esc bilan yopiladi; oyna ochilganda `?tolov=` URL'ga yoziladi, yopilganda o'chiriladi. `rows/:id` ro'yxat filtrlarini o'qimaydi va holat «Hammasi» bilan ishlaydi — bekor qilingan va tuzatilgan to'lov ham ochiladi.

- **Topilmadi:** `rows/:id` 404 qaytarsa (masalan, tepadagi filial almashtirilgandan keyin `?tolov=` boshqa filial to'lovini ko'rsatib qolsa) oyna ichida: «To'lov bu filialda topilmadi» + kulrang «Tepadagi filial tanlovini tekshiring.» + «Yopish» (oynani yopadi va `?tolov=`ni o'chiradi). Boshqa xato — «Ma'lumotni yuklab bo'lmadi» + «Qayta urinish».
- Sarlavha: o'quvchi ismi (arxivdagi o'quvchi — yonida «arxivda» pill); ostida «ID 1XXXX · 9X XXX XX XX · {guruh} · 26.09 18:20» (guruh bo'lmasa u qism tushib qoladi). X yopish.
- Ramka: «Summa» (bekor qilingan bo'lsa «Summa · bekor qilingan», tuzatilgan bo'lsa «Summa · tuzatildi») va «450 000 so'm».
- Qatorlar:
  - «Usul» — «Click» (+ «onlayn» pill).
  - «Manba» — «Onlayn, avtomatik tushgan» (GATEWAY_WEBHOOK) / «Admin kiritgan» (qolganlari).
  - «Qabul qildi» — §3.7 dagi kabi.
  - «Kvitansiya» — «R-2026-0NNNN · qog'oz № NNNNN» (ikkalasi bo'lsa); faqat tizim raqami bo'lsa «R-2026-0NNNN»; tizim raqami hali yo'q bo'lsa (§4.7) «— · qog'oz № NNNNN» yoki «—». Maketdagi «— (onlayn to'lovda kvitansiya to'lov tizimida)» matni olib tashlanadi: endi onlayn to'lovning ham tizim raqami bor.
  - «Izoh» — `note` yoki «—».
  - «Guruh» — §4.5 dagi hamma guruhlar (vergul bilan), bo'lmasa «—».
- «BU PUL NIMAGA KETDI»: har qism pill + summa, ostida kichik kulrang izoh «Tanlangan davr ({dd.MM}–{dd.MM}) oxiriga ko'ra.» Bekor qilinganda: «To'lov bekor qilingan — pul hech narsaga ketmagan, balans o'zgarmagan.» Tuzatilganda: «To'lov tuzatilgan — o'rniga {yangi summa} so'mlik to'lov yozilgan.» + «Yangi to'lovni ochish →». Qismlari hisoblanmagan bo'lsa: «Bu to'lovni hisoblab bo'lmadi.»
- «BALANS» (faqat amaldagi to'lovda): «−535 714 → **0 so'm**» — to'lovning o'z ledger yozuvidagi `balanceBefore` → `balanceAfter` (§4.9). Ostida kulrang «To'lov paytidagi balans».
- Bekor qilingan to'lovda «BALANS» o'rniga «BEKOR QILINDI»: «{dd.MM.yyyy HH:mm} · {Kim} · Sabab: {sabab}» (bekor qilish yozuvidan; sabab yozilmagan eski qator — «Sabab: —»).
- Yangi to'lov (boshqa to'lovni tuzatgan) oynasida «Izoh» ostida: «Bu to'lov {eski summa} so'mlik to'lovni tuzatgan» + «Eski to'lovni ochish →».
- Amallar (pastda): «Kvitansiya» (yangi oynada `/receipts/payment/:id.pdf`, mavjud `ReceiptLink`), «O'quvchi profili» (`/students/profile/:id`; kartasi arxivlangan o'quvchida bu tugma yo'q — arxiv faqat CEO'ning `/archive` sahifasidan ochiladi, mavjud qoida), «Tuzatish» (§3.10), «Bekor qilish» (qizil, §3.9). Tugma imkoniyati yo'q foydalanuvchiga ko'rinmaydi (`payments.correct`, `money.undo`). Bekor qilingan to'lovda «Tuzatish» va «Bekor qilish» yo'q.
- Pastki izoh (kulrang) foydalanuvchining imkoniyatlaridan yig'iladi, rol nomlari qattiq yozilmaydi: `payments.correct` bor — «Tuzatish: summa o'zgarsa sabab yozish majburiy.»; `money.undo` bor — «Bekor qilish: sabab yozish majburiy.»; ikkalasi ham yo'q — izoh yo'q. (Tasdiqlangan maketdagi «Tuzatish — CEO, direktor va admin…» matni imkoniyatlar sozlamasi o'zgarganda yolg'on bo'lib qolardi.)
- Oyna dialog ochishdan oldin yopiladi va amal muvaffaqiyatli bo'lgach o'sha to'lovda qayta ochiladi (B2a qoidasi); tuzatishdan keyin — YANGI to'lovda.

### 3.9 «Bekor qilish» oynasi

- Sarlavha «To'lovni bekor qilish».
- Matn: «**{Ism Familiya}** — 450 000 so'm, 26.09.2026 18:20.» va «Pul o'quvchi balansidan olinadi, o'quvchiga Telegram'da xabar boradi. Bekor qilingan to'lov ro'yxatda «Bekor qilinganlar» filtrida qoladi.»
- «Sabab» — textarea, majburiy, placeholder «Masalan: to'lov xato o'quvchiga yozilgan», 500 belgigacha.
- Tugmalar: «Yopish» / «Bekor qilish» (qizil). Sabab bo'sh (yoki faqat bo'shliq) turganda «Bekor qilish» o'chiq.
- Server rad etsa (§5.7), xabar oynaning o'zida qizil matn bilan chiqadi va oyna ochiq qoladi. Muvaffaqiyat: toast «To'lov bekor qilindi», ro'yxat, karta va «Umumiy ma'lumotlar» so'rovlari yangilanadi.

### 3.10 «Tuzatish»

O'quvchi profilidagi `CorrectPaymentDialog` (`components/students/correct-payment-dialog.tsx`) aynan o'zi; matni va qoidalari o'zgarmaydi. Tugma faqat amaldagi (COMPLETED), qo'lda kiritilgan (`source = ADMIN_MANUAL`) to'lovda ko'rinadi — server boshqasini baribir rad etadi. CEO bo'lmagan foydalanuvchi uchun to'lovga 72 soatdan ko'p bo'lsa tugma o'chiq va ostida «72 soatdan oldingi to'lovni faqat CEO tuzatadi» (serverdagi `ADMIN_CORRECTION_WINDOW_HOURS` qoidasining aksi; server qaroriga tayaniladi).

Dialogga ikki kichik o'zgarish (matni va qoidalari o'zgarmaydi):
- `onCorrected` chaqiruvi javobni ham uzatadi: `onCorrected(newBalance, { newPaymentId })` — `newPaymentId` = javobdagi `newPayment?.id ?? null` (faqat usul o'zgarganda `null`: to'lov o'z joyida yangilanadi). Profildagi yagona chaqiruvchi (`payment-statement.tsx:149`) ikkinchi argumentni o'qimaydi — unga ta'sir yo'q.
- Muvaffaqiyatda dialogning o'zi «To'lovlar» so'rov kalitlarini ham yangilaydi (`payments-list-rows`, `payments-list-row`, `payments-list-summary`), shuning uchun profildan qilingan tuzatish ham ochiq «To'lovlar» sahifasida darhol ko'rinadi.

«To'lovlar» sahifasida: `newPaymentId` bo'lsa oyna o'sha yangi to'lovda (`?tolov=<newPaymentId>`), bo'lmasa o'sha to'lovda qayta ochiladi.

### 3.11 Bo'sh holat, yuklanish, xato

- Bo'sh: «Bu tanlovda to'lov yo'q» (jadval o'rnida, «Tozalash» tugmasi bilan, agar filtr bo'lsa).
- Yuklanish: jadval va karta uchun skelet qatorlar.
- So'rov xatosi: «Ma'lumotni yuklab bo'lmadi» + «Qayta urinish».

### 3.12 Administrator va Kassir

Kartasiz: sarlavha, davr, filtrlar, jami qatori, jadval, oyna. Davr segmenti karta o'rnida turadi (bo'sh joy qolmaydi). «Nimaga ketdi» ustuni, filtri va oynadagi bo'lim ular uchun ham bor (CEO qarori 1: ro'yxat va oyna to'liq). «Bekor qilish» ko'rinmaydi; kassirga «Tuzatish» ham ko'rinmaydi. Ko'rinish — https://claude.ai/artifact/EYKB7GyymcsDT18fnYBRF3, (a) bo'lim.

## 4. Ma'lumot qoidalari

### 4.1 Davr chegaralari

Server `startDate`/`endDate` ni (`YYYY-MM-DD`, ikkalasi majburiy) `common/date/tashkent`dagi `tashkentRangeUtc(start, end)` bilan `Payment.createdAt` uchun `[gte, lt)` ga aylantiradi; dvigatel esa bugungidek `resolvePeriod(start, end)` (`common/finance/period-helpers.ts`) ni o'qiydi — ikkalasi bir xil Toshkent kunlari. Qo'lda `new Date('…')` yoki `T23:59:59` yo'q (`tashkent.single-source.spec.ts`).

Rad javoblari (400): ikkalasidan biri yo'q — «Davr boshi va oxiri kerak»; kalendarda yo'q kun — «Bunday sana kalendarda yo'q»; boshi oxiridan keyin — «Davr boshi oxiridan keyin bo'lishi mumkin emas»; boshi 2026-05-01 dan oldin — «To'lovlar 01.05.2026 dan boshlab ko'rsatiladi». Oxiri kelajakda bo'lishi mumkin («Bu oy»).

Hafta dushanbadan boshlanadi; buni mijoz hal qiladi, server faqat sanalarni oladi.

### 4.2 Holat va jamilar

- `PaymentStatus` qiymatlari: PENDING, COMPLETED, FAILED, REFUNDED, CANCELLED, REVERSED. Hozirgi kod faqat COMPLETED yozadi va bekor qilishda REVERSED qiladi.
- «Faqat o'tgan to'lovlar» = COMPLETED; «Bekor qilinganlar» = REVERSED; «Hammasi» = holat filtri yo'q.
- Har qanday jami (jami qatori X, karta, usul chiplari, Excel «Jami») faqat COMPLETED'ni qo'shadi.
- Tuzatilgan to'lovning eski qatori REVERSED — «Bekor qilinganlar»da, belgisi bilan (§4.8).

### 4.3 Manba va «onlayn»

`PaymentSource`: ADMIN_MANUAL, STUDENT_PORTAL, GATEWAY_WEBHOOK, MANUAL_ATTACH (`schema.prisma:334`).
- **Onlayn avtomatik** = `GATEWAY_WEBHOOK` (Payme va Click o'zi yuborgan to'lov — `payme-methods.service.ts:350`, `click-methods.service.ts:315`).
- **Admin kiritgan** = qolgan hammasi: ADMIN_MANUAL, MANUAL_ATTACH (admin to'lov tizimidagi tranzaksiyani qo'lda biriktirgan — pulni odam yozgan) va STUDENT_PORTAL (kod hech qayerda yozmaydi; eski qatorlar bo'lsa shu yerga tushadi).
- «onlayn» pill, «Qabul qildi: Onlayn», «Manba: Onlayn avtomatik», «Kim qabul qildi: Onlayn» va kartadagi «shundan onlayn avtomatik» — hammasi aynan `source = GATEWAY_WEBHOOK`.

### 4.4 «Nimaga ketdi» — bitta dvigatel

**Bugun.** `ReportsFinancialService.getIncomeMonthAttribution` (`reports-financial.service.ts:541-812`) davrdagi to'lovchilarning amaldagi ledgerini qayta o'ynaydi (bekor qilingan juftlar ikkalasi ham tashlanadi) va har to'lovning to'liq summasini uch qismdan biriga qo'shadi, lekin faqat davr yig'indisini qaytaradi.

**O'zgarish.** Qayta o'ynash halqasi (`:670-767`) sof funksiyaga ko'chadi: `common/finance/income-attribution.ts`:
- `loadAttributionRows(db, companyId, period, branchIds)` — bugungi ikki so'rov (davr to'lovchilari `groupBy`, ularning amaldagi ledger qatorlari), `select`ga `paymentId` qo'shiladi;
- `attributeIncome(rows, period, branchIds)` — toza; bugungi halqaning aynan o'zi, qo'shimcha ravishda har hisobga olingan PAYMENT qatorining `paymentId`si bo'yicha qismlarni yig'adi: `byPayment: Map<paymentId, { currentMonth, advance, late: { monthKey, amount }[] }>`. Kredit bo'laklari `inScope` bilan birga o'z `paymentId`sini ham olib yuradi, shuning uchun davr ichidagi debet bo'lakni yeganda summa aynan o'sha to'lovning `advance`idan `currentMonth`iga o'tadi.
- `getIncomeMonthAttribution` bu ikkalasini chaqiradi va javobi bir so'm ham o'zgarmaydi (`lessonsValue`, `collectionPct` unda qoladi). Yangi sahifa o'sha ikkalasini chaqiradi (`lessonsValue`siz). Ikkinchi qayta o'ynash yozilmaydi; `ledger-replay.ts` (profildagi «To'lovlar qayerga ketdi», boshqa savol — server/CLAUDE.md) bilan birlashtirilmaydi.
- **Arxivlangan o'quvchilar kiradi.** Dvigatelning to'lovchilar `groupBy`i `Student.deletedAt`ni o'qimaydi — kartasi keyin arxivlangan o'quvchining to'lovi ham kassaga tushgan pul va «Kassaga tushdi»da sanaladi. Shuning uchun ro'yxat ham ularni o'z ichiga oladi (`Payment` so'rovida `student.deletedAt` sharti yo'q), aks holda karta va qatorlar qo'shilmasdi. Qatorda `student.archived = deletedAt != null` (§3.7, §3.8).
- **Bir so'rovda bir marta.** Har HTTP so'rov dvigatelni aynan bir marta chaqiradi (`rows`, `excel`, `summary` — bitta davr bo'yicha; `rows/:id` — §5.3 dagi bitta davr bo'yicha); natija so'rov ichida qayta ishlatiladi. Keshlanmaydi — sababi §10.

**Tenglik (test bilan qotiriladi).** Bir chaqiruvda: Σ `byPayment` qismlari = `currentMonth`, `advance`, `late[]` (oyma-oy). Shuning uchun «Bu oy»da, filtrsiz, jadval qatorlari qismlarining yig'indisi karta chiplariga teng — ro'yxat va karta bir chaqiruvning ikki ko'rinishi. Jami qatoridagi X (`Payment` jadvalidan) va karta raqami (ledger'dan) G1 invarianti ushlab turganda teng (`scripts/audit-finance-reconciliation.ts`; `logIncomeBasisDrift` farqni logga yozadi) — B1 bilan bir xil holat.

**Davr oxiriga nisbatan.** Qismlar tanlangan davrga bog'liq (ADR-0067): «oldindan» = davr oxirida balansda turgan yoki davrdan keyingi debet yegan pul; davr ichidagi debet yegani — «shu oy». Shuning uchun bitta to'lov «Bu hafta»da «Oldindan», «Bu oy»da «Oktabr to'lovi» bo'lib ko'rinishi mumkin. Oyna buni «Tanlangan davr … oxiriga ko'ra» deb yozadi; qo'llanma tushuntiradi.

**Qator yorliqlari** (server qaytaradi, mijoz hisoblamaydi):
- `currentMonth` qismi: davr bitta kalendar oy ichida bo'lsa «{Oy} to'lovi» («Oktabr to'lovi»), aks holda «Shu davr to'lovi».
- `advance` qismi: davr oxiri oyning oxirgi kuni bo'lsa «{Keyingi oy} uchun oldindan» («Noyabr uchun oldindan»), aks holda «Oldindan (balansda)» — kun yoki hafta oxirida turgan pul keyingi oyniki ekani hali aniq emas.
- `late` qismlari: har oy uchun bitta pill «{Oy} qarzi» («Avgust qarzi»), eng yangi oy birinchi.
- Oy nomi yilsiz; oy joriy Toshkent yilidan boshqa yilda bo'lsa yil qo'shiladi («Dekabr 2026 qarzi»).

**«Nimaga ketdi» filtri:** «Shu oy to'lovi» — `currentMonth > 0`; «Oldindan» — `advance > 0`; «Eski qarz» — `late` yig'indisi > 0. Bekor qilingan va qismsiz qatorlar bu filtrda hech qachon chiqmaydi.

### 4.5 Guruh — to'lov kunidagi

Qoida (bitta toza funksiya `groupsOnPaymentDay`, `payments/list/payment-day-groups.ts`):
1. To'lovning Toshkent kuni D = `tashkentDateStr(payment.createdAt)`.
2. Nomzodlar: o'quvchining `deletedAt` bo'sh yozilishlari (kartasi bilan birga arxivlangan yozilish hisoblanmaydi — ketganlar o'quvchisidagidek), guruhi chaqiruvchining filial qamrovida (`branchIdWhere` guruh bo'yicha — bugungi `findAll` qoidasi). Guruhning o'zi o'chirilgan bo'lishi mumkin (3-band).
3. Yozilish D kuni guruhda hisoblanadi, agar o'sha Toshkent kunining biror lahzasida ACTIVE bo'lgan bo'lsa: kun boshidagi holati ACTIVE bo'lsa, yoki D kuni ichida ACTIVE ga o'tish yozuvi bo'lsa (shu kuni qo'shilgan — avval to'lab, keyin guruhga qo'shilgan o'quvchi ham tushadi). Holat `EnrollmentStateLog`dan `enrollmentStatusOn` bilan o'qiladi (`students/shared/enrollment-status-on.ts`); logning ikki uchidagi bo'shliq ketganlar o'quvchisidagidek (`reports/shared/departures.loader.ts:134-139`) to'ldiriladi — `supplyOpeningRow(log, createdAt)` VA `supplyClosingRow(log, row)`; logi bo'sh eski yozilish — o'z ustunlaridan (`enrollmentStatusOn`ning zaxirasi). Guruh o'chirilgan bo'lsa yozilish `group.deletedAt` lahzasida yopilgan hisoblanadi (o'sha loader'ning `GROUP_DELETED` qoidasi, `:197-198`): o'chirilishdan oldingi kunlarda guruh ko'rinadi, keyin — yo'q. `startDate` D dan keyin bo'lsa yozilish hisoblanmaydi.
4. Bir nechta guruh (masalan, o'sha kuni ko'chirilgan: eskisidan chiqdi, yangisiga kirdi) — hammasi, nom bo'yicha tartiblangan; ustunda birinchisi + «+N», oynada va Excel'da hammasi vergul bilan.
5. Hech biri — «—».
6. Filtrlar shu ro'yxat bo'yicha: «guruh» — ro'yxatda bor; «ustoz» — ro'yxatdagi biror guruhning (hozirgi) ustozi (`GroupTeacher`); «kurs» — ro'yxatdagi biror guruhning (hozirgi) kursi.
7. **O'chirilgan guruhlar:** qatorda, oynada va Excel'da ko'rinadi (to'lov kuni o'quvchi haqiqatan o'sha guruhda edi), lekin `filter-options`ga kirmaydi (§5.5) — shuning uchun «guruh» filtri bilan ularni tanlab bo'lmaydi; «ustoz» va «kurs» filtrlari o'chirilgan guruh orqali ham mos keladi.

Bir sahifa uchun emas, davrdagi barcha qatorlar uchun hisoblanadi (filtr va jami shunga tayanadi): bitta so'rov yozilishlar, bitta so'rov ularning logi.

### 4.6 Qidiruv

`q` (bo'shliqlari olib tashlanadi, 100 belgigacha) quyidagilardan birortasiga mos kelsa — YOKI:
- har so'z (bo'shliq bilan bo'lingan) o'quvchining `firstName` yoki `lastName`ida (katta-kichik harf farqsiz) uchraydi;
- faqat raqam bo'lsa: o'quvchi ID'siga teng (≤ 9 raqam bo'lsa); o'quvchi `phone`ida uchraydi (kamida 4 raqam; boshidagi `998` olib tashlanadi);
- `receiptCode`da uchraydi (katta-kichik farqsiz: «r-2026-0nnnn», «0nnnn» yoki raqamning bir qismi);
- `receiptNumber`da uchraydi.

### 4.7 Kvitansiyaning tizim raqami

**Bugun:** `ReceiptsService.ensurePaymentReceiptCode` → `allocateCode` (`receipts.service.ts:329-404`) raqamni PDF birinchi ochilganda beradi: `R-{yil}-{5 xonali tartib}`, yil — `new Date().getFullYear()` (`:360`, jarayon vaqt zonasi — Railway'da UTC, 31.12 soat 19:00 dan keyin Toshkentda yangi yil bo'lsa ham eski yil). Keyingi raqam `companyId` bo'yicha eng kattasidan olinadi, `receiptCode` esa butun jadval bo'yicha unique (`schema.prisma:2392`) — ikki kompaniya bir xil kodga urinib, biri yiqilishi mumkin.

**O'zgarish:**
- Ajratish `receipts/receipt-code.ts`ga ko'chadi: `allocatePaymentReceiptCode(db, paymentId)` — to'lovni o'zi o'qiydi; yil = to'lov `createdAt`ining TOSHKENT yili (`tashkentMonthKey(createdAt).slice(0, 4)`); keyingi raqam = shu prefiksli (`R-{yil}-`) eng katta kod + 1 — **butun jadval bo'yicha, `companyId` filtrisiz** (unique ham global); `nextSequence`, 5 xona; o'zining Serializable tranzaksiyasida, unique to'qnashuv yoki serializatsiya xatosida 3 martagacha qayta urinadi; kod allaqachon bo'lsa — o'shani qaytaradi. `ensurePaymentReceiptCode` (PDF yo'li) shu funksiyani chaqiradi va zaxira bo'lib qoladi.
- Qaytarish hujjati (`Q-…`) ham shu ikki tuzatishni oladi: keyingi raqam global eng kattasidan, yil — ajratish lahzasining Toshkent yili (`tashkentMonthKey(new Date()).slice(0, 4)`); `new Date().getFullYear()` kodda qolmaydi. Uning ajratilish vaqti (PDF ochilganda) o'zgarmaydi.
- **To'lov yozilganda beriladi:** yangi `ReceiptCodeListener` (`receipts/receipt-code.listener.ts`) `payment.received` hodisasini eshitib, `allocatePaymentReceiptCode` ni chaqiradi. Bu hodisa har to'lov yo'lida commit'dan keyin chiqadi: `POST /payments` (`create`), tuzatishning qayta yozuvi (`create` orqali), `POST /payments/attach-external` va Payme/Click (`createFromExternal`; tashqi tranzaksiyali chaqiruvchilar `announceCommitted` orqali). Raqam pul tranzaksiyasining ICHIDA berilmaydi: bir vaqtdagi ikki to'lov raqam uchun to'qnashsa, to'lovning o'zi (yoki Payme/Click javobi) rad etilmasligi kerak. Tinglovchi xatosi logga yoziladi va yutiladi; raqamsiz qolgan to'lov PDF ochilganda yoki §5.10 skriptining keyingi ishga tushishida raqam oladi.
- Ro'yxat javobi kodni o'qiydi; yo'q bo'lsa «—» (§3.8).

### 4.8 Tuzatish bog'lanishi

**Bugun:** summani tuzatish (`correctAmount`, `payments-write.service.ts:555-793`) eski to'lovni REVERSED qiladi (bekor qilish yozuvining tavsifi «Bekor qilindi: Summa to'g'rilandi: {sabab}») va yangi to'lovni `note` = «To'g'rilangan to'lov (avvalgi summa: {X} so'm). … Sabab: …» bilan yozadi. Ikkalasini bog'laydigan ustun yo'q; bog'lanish faqat matnda. (Faqat usulni tuzatish joyida yangilanadi, to'lov bekor qilinmaydi — u bu yerga tegishli emas.)

**O'zgarish:**
- `Payment.correctsPaymentId String? @unique` — YANGI to'lovda eski to'lovning id'si (o'z-o'ziga relation `PaymentCorrection`: `correctsPayment Payment?` / `correctedBy Payment?`). Migratsiya qo'shimcha (§5.9).
- `PaymentsWriteService.create(dto, userId, companyId, options?)` — ichki `options.correctsPaymentId` (DTO'da yo'q, tashqaridan yuborib bo'lmaydi); `correctAmount` qayta yozuvda uni beradi. Bog'lanish yangi to'lov bilan bitta tranzaksiyada yoziladi.
- Qayta yozuv muvaffaqiyatsiz bo'lsa (bugungi «To'lov bekor qilindi, lekin yangi summa qayd etilmadi…» holati) bog'lanish yo'q — eski qator oddiy «bekor qilingan» bo'lib, sababi bilan ko'rinadi.
- Eski tuzatishlar: §5.10 ning ikkinchi skripti bir marta bog'laydi. Bog'lab bo'lmaganlari oddiy «bekor qilingan» bo'lib qoladi (sababida «Summa to'g'rilandi: …» ko'rinadi). Sahifada matndan taxmin qiluvchi ikkinchi yo'l YO'Q: bog'lanish faqat ustundan o'qiladi.
- Ko'rinishi: eski qatorda «tuzatildi → {yangi summa}» (§3.7), oynalarda ikki tomonga havola (§3.8).

### 4.9 Balans oldin → keyin

To'lovning o'z PAYMENT ledger yozuvi: `Transaction` where `paymentId = payment.id`, `type = PAYMENT`, `reversedTransactionId = null` (asl yozuv; bekor qilingan bo'lsa ham u o'z joyida). Uning `balanceBefore` → `balanceAfter` ko'rsatiladi — bugungi balans emas. Yozuv topilmasa (bo'lmasligi kerak) «BALANS» bloki chiqmaydi. Bekor qilish ma'lumoti (`at`, `reason`, `by`) o'sha yozuvni bekor qilgan qatordan (`reversedTransactionId = asl.id`): sabab — `transactions/reversal-view.ts`dagi `reversalReason(description)` ning o'zi (prefiksni olib tashlaydi va eski inglizcha sabablarni o'zbekchalashtiradi), kim — `performedBy` (Payme bekor qilishida yo'q → «—»), qachon — `createdAt`.

`reversalReason`ga bitta qoida qo'shiladi: «Payme CancelTransaction» (Payme bekor qilishi, `payme-methods.service.ts:477`) → «Payme to'lovni bekor qildi». Qatorlarning o'zi qayta yozilmaydi; profilning «To'lovlar» tabi ham shu funksiyani o'qigani uchun u yerda ham o'zbekcha chiqadi. Ekranda inglizcha sabab qolmaydi.

### 4.10 Qabul qildi

`receivedBy` (ism, familiya) va CEO / Branch Director / Administrator / Cashier rollaridan eng yuqorisi (rol id'si eng kichigi) → qisqa nom (§3.7); bu to'rttasidan birortasi yo'q akkaunt (faqat Teacher, rolsiz yoki keyin rolidan ayrilgan xodim) — `roleLabel: null`, faqat ism. Rollar bugungi holatdan o'qiladi (to'lov paytidagi rol saqlanmaydi). Onlayn (§4.3) — «Onlayn», `receivedBy` qaysi bo'lishidan qat'i nazar.

## 5. Server

Yangi controller `PaymentsListController` (`@Controller('payments/list')`, `src/payments/list/`), xizmat `PaymentsListService`. Yo'llar ikki bo'g'inli — `GET /payments/:id` bilan to'qnashmaydi (B2a'dagi `payments/debt/*` andozasi).

### 5.1 Umumiy

- Har yo'l: `@BranchScope()` — qamrov tepadagi tanlovdan. Qamrov bo'sh bo'lsa `rows`, `rows/:id`, `filter-options`, `excel` bo'sh javob beradi (rad emas; `branchIdWhere([])` hech narsa qaytarmaydi; `rows/:id` — 404); `summary` esa 403 (§5.4). `companyId` har so'rovda.
- Arxivlangan o'quvchilarning to'lovlari kiradi (§4.4), qidiruvda ham.
- Qatorlar bitta yo'l bilan yig'iladi (`buildRows`): SQL filtrlar (davr, qamrov, usul, holat, manba, qabul qildi, qidiruv) → hamma mos qatorlar xotiraga → dvigatel (§4.4) so'rov boshiga bitta chaqiruv → guruhlar (§4.5) → guruh/ustoz/kurs va «Nimaga ketdi» filtrlari xotirada → jamilar → sahifa. Ro'yxat, `rows/:id` va Excel shu bitta yo'ldan o'tadi.

### 5.2 `GET /payments/list/rows`

`@Can('payments.view')`, `@BranchScope()`. DTO `PaymentListQueryDto`:
- `startDate`, `endDate` — majburiy (§4.1).
- `search?` (≤ 100), `part?` (`CURRENT` | `ADVANCE` | `LATE`), `source?` (`ADMIN` | `ONLINE`), `online?` (`true` — «Kim qabul qildi: Onlayn»; `receivedById` bilan birga berilsa — YOKI).
- Ko'p qiymatli filtrlar — server/CLAUDE.md'ning «Multi-value filter parameters» qoidasi bo'yicha vergul bilan ro'yxat (`common/dto/to-array.ts`; bo'sh → `undefined`, hech qachon `[]`; `where` `equalsOrIn` bilan): `method?` (`toStringArray` + `@IsEnum(PaymentMethod, { each: true })`), `groupId?` va `courseId?` (uuid satrlar — `toStringArray` + `@IsUUID('4', { each: true })`), `teacherId?` va `receivedById?` (`toNumberArray` + `@IsInt({ each: true })`). Mijoz hozircha har biriga bitta qiymat yuboradi (§3.5).
- `status?` (`COMPLETED` | `REVERSED` | `ALL`, sukut `COMPLETED`), `page?`, `pageSize?` (`PaginationDto`, ≤ 100).

Javob:
```
{
  period: { start, end, singleMonth: boolean, endsOnMonthEnd: boolean },
  data: PaymentRow[], total, page, pageSize,
  totals: { count, amount, partAmount: number | null }
}
PaymentRow = {
  id, createdAt, amount, method, source, online, status,
  receiptCode | null, receiptNumber | null, note | null,
  student: { id, firstName, lastName, phone, archived },
  groups: [{ id, name }],
  receivedBy: { id, firstName, lastName, roleLabel | null } | null,
  parts: [{ kind: 'CURRENT' | 'ADVANCE' | 'LATE', monthKey | null, label, amount }] | null,
  balanceBefore | null, balanceAfter | null,
  reversal: { at, reason | null, by: { id, firstName, lastName } | null } | null,
  correctedBy: { id, amount } | null,     // eski qatorda: uni tuzatgan yangi to'lov
  correctsPayment: { id, amount } | null  // yangi qatorda: u tuzatgan eski to'lov
}
```
`totals.count` — filtrga tushgan hamma qatorlar; `amount` — ulardan COMPLETED'lari; `partAmount` — `part` berilganda o'sha qism yig'indisi, aks holda `null`. `parts` bekor qilingan qatorda `null`.

### 5.3 `GET /payments/list/rows/:id`

`@Can('payments.view')`, `@BranchScope()`, so'rov `startDate`, `endDate` (ixtiyoriy). Bitta `PaymentRow` (§5.2 bilan bir xil yig'uvchi). Ro'yxat filtrlarini (qidiruv, usul, guruh, «Nimaga ketdi», holat va h.k.) o'qimaydi va holat «Hammasi» bilan ishlaydi — bekor qilingan, tuzatilgan va filtrdan tashqaridagi to'lov ham ochiladi; faqat qamrov va `companyId` cheklaydi. Qismlar davri: to'lov berilgan davr ichida bo'lsa — o'sha davr; tashqarida bo'lsa yoki davr berilmasa — to'lovning o'z Toshkent oyi (1-sanadan oxirigacha); javobdagi `period` qaysi biri ishlatilganini aytadi va oyna izohi shuni yozadi. Qamrovdan tashqari yoki yo'q to'lov — 404 «To'lov topilmadi» (bugungi `findOne` qoidasi: 403 id borligini fosh qilardi); mijoz uni «To'lov bu filialda topilmadi» holati bilan ko'rsatadi (§3.8).

### 5.4 `GET /payments/list/summary`

`@Can('reports.finance')`, `@BranchScope()`, `startDate`, `endDate` (§4.1). Filtrlarni o'qimaydi — karta davr va filialni tasvirlaydi. Qamrov bo'sh bo'lsa (`isEmptyScope`) — 403 «Bu filial ma'lumotlarini ko'rish huquqingiz yo'q», `GET /reports/income-month-attribution` bilan bir xil (`reports.controller.ts:519-534`): pul hisoboti nollar bilan javob bermaydi. Ro'yxat yo'llari esa bo'sh qaytaradi (§5.1); mijoz 403 da kartani chizmaydi.
```
{ period, total, paymentCount, payerCount,
  parts: { currentMonth, advance, lateTotal, late: [{ monthKey, label, amount }] },
  byMethod: [{ method, amount, count }],
  online: { amount, count } }
```
`total`, `paymentCount`, `payerCount`, `parts` — dvigatelning o'sha chaqiruvidan (§4.4). `byMethod` va `online` — `Payment` jadvalidan: COMPLETED, davr, qamrov (`financial-overview`ning `income.byMethod`i bilan bir xil qoida). Mijoz «Bu oy»dan boshqa davrda `parts`ni chizmaydi (§3.4).

### 5.5 `GET /payments/list/filter-options`

`@Can('payments.view')`, `@BranchScope()`. Javob: `groups[{ id, name }]` (qamrovdagi `deletedAt` bo'sh guruhlar, hamma holatda — yopilgan guruhning o'tgan to'lovlari ham bor; o'chirilgan guruhlar kirmaydi — §4.5, 7-band), `teachers[{ id, firstName, lastName }]` (shu guruhlarning ustozlari), `courses[{ id, name }]`, `receivers[{ id, firstName, lastName }]` (qamrovdagi to'lovlarning `receivedById`lari, `groupBy`). Nom bo'yicha tartib. (`GET /reports/student-payments/filter-options` `reports.finance`/`reports.students` talab qiladi — admin va kassirga yaramaydi; u «Ketgan o'quvchilar» sahifasi uchun qoladi.)

### 5.6 `GET /payments/list/excel`

`@Can('payments.view')`, `@BranchScope()`, §5.2 dagi filtrlar (sahifalashsiz). `buildRows` → hamma qatorlar. 20 000 dan ko'p bo'lsa 400 «Qatorlar juda ko'p ({N}) — davrni qisqartiring». `debt-list.excel.ts` andozasi (exceljs, bitta varaq «To'lovlar»).

Ustunlar: Sana (`dd.MM.yyyy HH:mm`), O'quvchi ID, O'quvchi, Telefon, Guruh (hammasi, vergul bilan), Summa, Usul, Nimaga ketdi (matn: «Oktabr to'lovi 385 714; Avgust qarzi 150 000»; bekor qilinganda bo'sh), Qabul qildi, Kvitansiya (tizim), Kvitansiya (qog'oz), Izoh, Manba («Admin kiritgan» / «Onlayn avtomatik»), Holat («O'tgan» / «Bekor qilingan» / «Tuzatildi → 400 000»).
Tepasida ikki qator: «Davr: {dd.MM.yyyy} – {dd.MM.yyyy}» va «Filtrlar: …» (tanlangan filtrlar nomlari bilan, bo'lmasa «yo'q»). Oxirida «Jami» — COMPLETED summalari. Fayl nomi `tolovlar-{start}-{end}.xlsx`.

### 5.7 `POST /payments/:id/reverse` — sabab majburiy

- DTO `ReversePaymentDto { reason: string }` — trim (`@Transform`) → `@IsNotEmpty({ message: 'Bekor qilish sababini yozing' })`, `@MaxLength(500)`. Controller `@Body('reason')` o'rniga DTO'ni oladi.
- Xizmatda ham: `performedById` bor (odam) va sabab bo'sh bo'lsa 400 «Bekor qilish sababini yozing». Tizim chaqiruvchilari (Payme `CancelTransaction` — `reason: 'Payme CancelTransaction'`, odamsiz) o'zgarmaydi; tuzatish o'z sababini yuboradi.
- Qolgan tekshiruvlar va matnlar o'zgarmaydi: 404 «To'lov topilmadi», 400 «Bu to'lov allaqachon bekor qilingan», ledger yozuvi topilmasa 400. Bitta matn o'zgaradi — ekranda inglizcha so'z qolmasligi uchun: «To'lov allaqachon darslarga sarflangan. Bekor qilish o'rniga refund'dan foydalaning.» → «To'lov allaqachon darslarga sarflangan — bekor qilib bo'lmaydi. Pulni o'quvchiga «Pul qaytarish» orqali qaytaring.» Rad etishning o'zi (qoida) saqlanadi.
- `payment.reversed` hodisasi, o'quvchiga Telegram xabari (ADR-0065), tarix yozuvlari — o'zgarmaydi.

### 5.8 To'lov yozish yo'llari

- `create` va `createFromExternal` — o'zgarmaydi, faqat `create`ga ichki `options.correctsPaymentId` (§4.8). Kvitansiya raqami tinglovchi orqali (§4.7).
- `findAll` (`GET /payments`) — o'zgarmaydi; «Oxirgi to'lovlar» bloki uni o'qishda davom etadi (B1 qoidasi: u yerda hozirgi guruh).
- `GET /payments/:id` (`findOne`) — mijozda chaqiruvchisi yo'q, tegilmaydi.

### 5.9 Migratsiya

`…_payment_corrects_payment`:
- `ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "correctsPaymentId" TEXT`, unique indeks, FK `REFERENCES "Payment"("id") ON DELETE SET NULL`.
- `Transaction` ga `@@index([paymentId])` (`CREATE INDEX IF NOT EXISTS "Transaction_paymentId_idx"`). Hozir bunday indeks yo'q (`schema.prisma:2460-2466`), sahifa esa davrdagi har to'lov uchun uning PAYMENT yozuvi va uni bekor qilgan qatorni `paymentId` bo'yicha o'qiydi (§4.9); `reverse`/`correctAmount`dagi `findFirst({ paymentId })` ham undan foyda ko'radi.

Faqat qo'shimcha; eski server ularni o'qimaydi. Repo `prisma.config.ts` ishlatgani uchun: `prisma migrate diff --from-config-datasource --to-schema=prisma/schema.prisma --script` → `prisma db execute --file` → `prisma migrate resolve --applied <nom>` → `prisma generate`.

### 5.10 Bir martalik skriptlar

Ikkalasi `scripts/open-unmarked-lessons.ts` andozasida: sukut — quruq ishga tushirish, faqat o'qiydigan ulanishda (`default_transaction_read_only=on`, tekshiriladi, aks holda to'xtaydi), har yozuvni ro'yxatlaydi; `--apply` `--expect=<N>` talab qiladi (quruq ishga tushirish chiqargan son) va yozishdan oldin yangi skan farq qilsa to'xtaydi; noma'lum bayroqlar rad etiladi; bitta yozuv xatosi logga yoziladi, qolgani davom etadi, chiqish kodi noldan farqli; qayta ishga tushirish tayyorlarini o'tkazib yuboradi.

1. `scripts/backfill-payment-receipt-codes.ts` — `receiptCode` bo'sh hamma to'lovlar (har qanday holat), `createdAt` o'sish tartibida; har biriga `allocatePaymentReceiptCode` (§4.7: o'z Toshkent yili, o'sha yilning global eng kattasidan keyin). Quruq ishga tushirish yil bo'yicha sonni va birinchi/oxirgi beriladigan kodni chiqaradi.
2. `scripts/link-payment-corrections.ts` — eski tuzatishlarni bog'laydi. Eski to'lov: REVERSED, uning PAYMENT yozuvini bekor qilgan qator tavsifi «Bekor qilindi: Summa to'g'rilandi:» YOKI «Bekor qilindi: To'lov usuli to'g'rilandi» bilan boshlanadi (ikkinchisi — faqat usul tuzatilganda ham bekor qilish + qayta yozuv qilingan davrdan, 2026-06-09 da shunday yozuv qilingan; o'shanda yangi to'lov `note`i ham «To'g'rilangan to'lov (avvalgi summa: …)» bilan boshlangan, summa teng). Yangi to'lov nomzodi: o'sha o'quvchi, `createdAt` bekor qilish yozuvidan keyingi 10 daqiqa ichida, `note` «To'g'rilangan to'lov (avvalgi summa: {formatSom(eski.amount)} so'm)» bilan boshlanadi, `correctsPaymentId` bo'sh va boshqa eski to'lovga hali berilmagan. Aynan bitta nomzod bo'lsa bog'lanadi; nol yoki bir nechta bo'lsa — «bog'lanmadi» ro'yxatiga (sababi bilan), yozilmaydi.

### 5.11 Olib tashlanadigan endpointlar

Grep (11.10.2026, `origin/main` 6a57c05e) bo'yicha boshqa chaqiruvchisi yo'q:
- `GET /reports/student-payments` — yagona chaqiruvchi `student-payments-client.tsx`. Olib tashlanadi: controller usuli (`reports.controller.ts:634-652`), `ReportsService.getStudentPaymentsReport`, `ReportsStudentPaymentsService.getStudentPaymentsReport`, `dto/student-payments-report-query.dto.ts`, tegishli spec bo'laklari, snapshot qatori va `intentional-access-changes.ts`dagi yozuvi.
- `GET /payments/pending-students` — yagona chaqiruvchi `pending-client.tsx`. Olib tashlanadi: controller usuli, `PaymentsService.getPending`, `PaymentsDebtorsService.getPending`, spec'lari, snapshot qatori, `payments.branch-isolation.spec.ts`dagi holati, server/CLAUDE.md'dagi «`getPending()` uses `balance: { lt: 0 }`» qatori.
- **Qoladi:** `GET /reports/student-payments/filter-options` (`departed-students-client.tsx:144` o'qiydi) va `ReportsStudentPaymentsService.getStudentPaymentsFilterOptions`.
- Mijozda o'chiriladi: `components/reports/student-payments/*`, `components/payments/pending-client.tsx`; ikki `page.tsx` yo'naltirishga aylanadi (§6.2). `refunds-queries.ts:67` va `record-payment-dialog.tsx:287`dagi `"student-payments"` so'rov kaliti yangi sahifa kaliti bilan almashtiriladi.

### 5.12 Ruxsatlar va manifest

- Yangi besh yo'l (`rows`, `rows/:id`, `summary`, `filter-options`, `excel`) `route-access.snapshot.json`ga (CEO, Branch Director, Administrator, Cashier — `payments.view`; `summary` — CEO, Branch Director) va `permission-routes.spec.ts` manifestiga.
- `branch-route-policy.ts`ning `ROUTE_POLICIES`iga **hech narsa qo'shilmaydi**: `@BranchScope()` oladigan yo'l manbadan avtomatik header bo'yicha qamrovli deb tasniflanadi, ortiqcha yozuv esa `branch-route-policy.spec.ts:66-69` («does not re-declare a route the source already evidences») ni yiqitadi. Olib tashlangan ikki yo'l u yerda yozilmagan (tekshirildi) — «names no route that does not exist» testi ham buzilmaydi.
- `POST /payments/:id/reverse` ruxsati o'zgarmaydi (`money.undo`).
- `payments.view` yorlig'i yangilanadi (§3.1). Yangi imkoniyat qo'shilmaydi.
- Controller spec'lari: `routeAccess()` + `defaultRolesOf()` bilan besh yo'l.

## 6. Mijoz

### 6.1 Fayllar

`client/src/components/payments/list/`:
- `payments-list-page.tsx` — sahifa (karta faqat `reports.finance` egasiga).
- `payments-url.ts` — URL ↔ filtrlar, `periodRange` (§3.3), `legacyStudentPaymentsRedirect` (§6.2) + test.
- `payments-summary-card.tsx` — `IncomeBreakdown` bo'laklarini qayta ishlatadi.
- `payments-filter-bar.tsx`, `payments-table.tsx`, `payment-drawer.tsx`, `reverse-payment-dialog.tsx`, `payments-queries.ts`, `payments-format.ts` (+ test: summa, mln, «Tanlangan» matni, «Qabul qildi» yorlig'i).
- `app/(dashboard)/payments/list/page.tsx` (`Suspense` — `useSearchParams`).
- Qayta ishlatiladi: `RecordPaymentDialog`, `CorrectPaymentDialog`, `ReceiptLink`, B2a'dagi `lastPageIfPast`.
- `client/` da prettier ishlatilmaydi.

### 6.2 Yo'naltirishlar (server tomonda, `redirect()` — B2a `legacyDebtRedirect` kabi)

- `/payments/pending` → `/payments/debt` («Qarzdorlik»; CEO, 11.10.2026 — u sahifa qarzdorlar ro'yxati edi, «To'lovlar» emas). Parametrlar tashlanadi; `/payments/debt` o'zining `legacyDebtRedirect`i bilan ochiladi.
- `/reports/student-payments?…` → `/payments/list?…`: `startDate` + `endDate` → `davr=oraliq&dan=…&gacha=…`, quyidagicha: ikkalasi haqiqiy sana va `startDate ≤ endDate` bo'lsa — faqat boshi 2026-05-01 dan oldin bo'lsa 2026-05-01 qilinadi; ikkalasi ham 2026-05-01 dan oldin bo'lsa, oxiri boshidan oldin bo'lsa, biri yo'q yoki noto'g'ri bo'lsa — davr tashlanadi (sukut «Bu oy»); `groupIds` → `guruh` (birinchisi), `teacherIds` → `ustoz` (birinchisi), `methods` → `usul` (birinchisi), `courseId` → `kurs`; `branchId`, `page`, `pageSize` tashlanadi.
- Qo'llanma: `qarzdorlik.mdx:124`dagi «Kutilyotgan to'lovlar» qatori olib tashlanadi; `tolov-qayd-qilish.mdx:105` va `sahifalar/tolovlar.ts:121`dagi `yollar` (`/payments/pending`) «To'lovlar» (`/payments/list`) ga almashtiriladi; «kutilyotgan to'lovlar» kalit so'zi «Qarzdorlik» sahifasi yozuviga ko'chadi.

### 6.3 «Umumiy ma'lumotlar» havolalari

Sahifa oyi `M` (`?month=`) bo'yicha davr: joriy oy → `davr=oy`; o'tgan oy → `davr=otgan-oy`; boshqa oy → `davr=oraliq&dan=M-01&gacha=<M oxiri>`. Bitta yordamchi `paymentsListHref(month)` (`payments-url.ts`).
- «Kassaga tushdi» kartasi (`cash-card.tsx`): «Qayerdan keldi →» yonida «To'lovlar →» → `paymentsListHref(month)`.
- «Oxirgi to'lovlar» (`recent-payments.tsx`): sarlavha yonida «Barcha to'lovlar →» → `/payments/list` (blok faqat joriy oyda; Administrator va Kassirga ham).
- «Qayerdan keldi» oynasi (`income-dialog.tsx`): pastda «Yopish» yonida «Barcha to'lovlar» → `paymentsListHref(month)`.

### 6.4 Menyular

§3.1. `reports-nav.test.ts` va menyu testlari yangilanadi.

## 7. Hujjatlar

### 7.1 Yangi ADR

`docs/adr/NNNN-tolovlar-sahifasi-tolov-boyicha-qismlar.md` (o'zbekcha), indeks qatori `docs/adr/README.md`ga. `NNNN` — PR paytidagi keyingi bo'sh raqam: yozilish paytida 0084, lekin raqam oldindan qotirilmaydi — PR ochishdan oldin `origin/main` va lokal shoxlardagi `docs/adr/README.md` (va `docs/adr/` fayllari) tekshiriladi; `main` boshqa ADR'ni oldinroq olsa `git mv` bilan qayta raqamlanadi, spec, qo'llanma (`adr: [...]`) va CLAUDE.md havolalari bilan birga. Sarlavha: «To'lovlar sahifasi: «Nimaga ketdi» kassa dvigatelining o'zidan har to'lov bo'yicha; guruh — to'lov kunidagi; kvitansiya raqami to'lov yozilganda; bekor qilish sababi majburiy; tuzatish ustun bilan bog'lanadi». Mazmuni:
1. Har to'lovning qismlari `attributeIncome`dan (`common/finance/income-attribution.ts`) — `getIncomeMonthAttribution` bilan bitta funksiya; tenglik testi; qismlar davr oxiriga bog'liq, yorliq qoidasi (§4.4). Taqiq: qismlarni boshqa joyda (mijozda ham) hisoblash.
2. Guruh — to'lovning Toshkent kunida biror lahzada ACTIVE bo'lgan yozilishlar (`EnrollmentStateLog`, ikki uchi `supplyOpeningRow` / `supplyClosingRow` bilan to'ldiriladi, o'chirilgan guruh `deletedAt` lahzasida yopiladi va qatorda ko'rinadi, filtr variantlarida emas), bir nechtasi — hammasi; filtrlar shu qoida bilan; ustoz va kurs — guruhning hozirgisi (§4.5). «Oxirgi to'lovlar» hozirgi guruhda qoladi (B1).
3. `receiptCode` har to'lovga `payment.received`dan keyin beriladi (pul tranzaksiyasidan tashqarida — sababi), yil Toshkent bo'yicha, keyingi raqam global eng kattasidan (unique global); PDF yo'li zaxira; eski to'lovlar skript bilan. `Q-…` ham Toshkent yili va global raqamga o'tadi.
4. Odam bekor qilganda sabab majburiy (DTO va xizmat); tizim chaqiruvlari istisno.
5. `Payment.correctsPaymentId` — tuzatishning yagona bog'lanishi; eski tuzatishlar skript bilan; matndan taxmin qilish taqiqlanadi.
6. `GET /reports/student-payments` va `GET /payments/pending-students` olib tashlandi; `/reports/student-payments` → `/payments/list`, `/payments/pending` → `/payments/debt`.
Ko'rib chiqilgan muqobillar: qismlarni to'lov KUNIDAGI holat bo'yicha (CEO rad etdi — karta bilan qo'shilmaydi); kodni pul tranzaksiyasi ichida berish (to'qnashuv to'lovni rad ettiradi); Postgres sequence (yillik qayta boshlanish yo'qoladi); tuzatishni matndan o'qish (ishonchsiz).

### 7.2 Boshqalar

- `server/CLAUDE.md`: Payment Module endpointlari (yangi besh yo'l, olib tashlangan ikki yo'l, `getPending` qatori), «Payment Reverse Block» (sabab majburiy, yangi matn), «Student transactions list»dagi `reversal` sabablari (Payme qoidasi), «Payment Amount Correction» (`correctsPaymentId`), «Cash in three parts» (bir qator: `byPayment` va To'lovlar sahifasi), receipts haqida qator (`receiptCode` to'lov yozilganda).
- `docs/role-access.md`: «To'lovlar» qatori (CEO/BD/Admin/Kassir; karta CEO/BD; bekor qilish CEO; tuzatish CEO/BD/Admin), «O'quvchi to'lovi» va «Kutilyotgan to'lovlar» qatorlari olib tashlanadi.
- Qo'llanma: yangi sahifa `client/src/qollanma/kontent/tolovlar/tolovlar-sahifasi.mdx` va `sahifalar/tolovlar.ts`ga yozuv (`sahifa: "tolovlar-sahifasi"`, sarlavha «To'lovlar», rollar `[1, 2, 3, 5]`, `adr: ["<yangi ADR raqami>", "0067", "0065"]`, `yollar: ["/payments/list"]`, kalit so'zlar: to'lovlar, to'lovlar ro'yxati, kvitansiya raqami, bekor qilingan to'lov, tuzatilgan to'lov, nimaga ketdi, oldindan, eski qarz, o'quvchi to'lovi). Mazmuni: davr tugmalari va hafta dushanbadan; karta faqat CEO/direktorga; «Nimaga ketdi» tanlangan davr oxiriga ko'ra (misol bilan: bitta to'lov haftada «Oldindan», oyda «Oktabr to'lovi»); guruh — to'lov kunidagi; ikki kvitansiya raqami; bekor qilish (faqat CEO, sabab, «darslarga sarflangan» holati); tuzatish; Excel. `tolov-qayd-qilish.mdx` va `tolovni-togrilash.mdx` yangi sahifaga havola oladi.
- `yangiliklar.ts` (2026-10-1x, rollar `[1, 2, 3, 5]`, sahifa `{ bolim: "tolovlar", sahifa: "tolovlar-sahifasi" }`): «Moliya → «To'lovlar» — yangi sahifa: hamma to'lovlar bitta ro'yxatda, davr tugmalari (Bugun, Kecha, Bu hafta, Bu oy, O'tgan oy, Oraliq), qidiruv (ism, telefon, ID, kvitansiya raqami) va filtrlar. Har to'lov yonida pul nimaga ketgani (shu oy, oldindan, eski qarz) — «Kassaga tushdi» kartasi bilan bir xil hisob, tanlangan davr oxiriga ko'ra. Qator bosilsa to'lov oynasi: kvitansiya, to'lov paytidagi balans, tuzatish; CEO to'lovni sabab yozib bekor qila oladi. «O'quvchi to'lovi» hisoboti shu yerga ko'chdi; «Kutilyotgan to'lovlar» o'rniga «Qarzdorlik» sahifasi ochiladi. Har to'lovning endi tizim kvitansiya raqami bor.»

## 8. Testlar

Server:
- `attributeIncome`: (a) bugungi `getIncomeMonthAttribution` spec'lari o'zgarmasdan o'tadi; (b) Σ `byPayment` = `currentMonth` / `advance` / `late[]` — aralash holatlar: oy o'rtasida qo'shilish (davr ichidagi debet oldindanni shu oyga o'tkazadi), qarzni yopib ortgani oldindan, ikki to'lov bir debetni bo'lishadi (FIFO bo'lak o'z to'loviga tegishli), boshqa filial krediti, bekor qilingan juft (qismsiz); (c) bitta to'lov hafta davrida `ADVANCE`, oy davrida `CURRENT`.
- Yorliqlar: bitta oy / ko'p oy; oy oxirida tugaydigan / tugamaydigan davr; boshqa yil.
- `groupsOnPaymentDay`: o'sha kuni qo'shilgan (to'lov qo'shilishdan oldin), o'sha kuni chiqqan, muzlatilgan davrda to'lov (guruh yo'q), ko'chirish kuni (ikki guruh), logsiz eski yozilish, ochilish qatori yo'q log (`supplyOpeningRow`), yopilishi yozilmagan log (`supplyClosingRow`), o'chirilgan guruh — o'chirilishdan oldingi kun ko'rinadi, keyingi kun yo'q, `startDate` keyin, boshqa filial guruhi ko'rinmaydi, arxivlangan yozilish sanalmaydi.
- `PaymentsListService`: har filtr; qidiruv (ism so'zlari, ID, telefon `998` bilan, `receiptCode` qismi, `receiptNumber`); `totals.amount` bekor qilinganlarsiz; `partAmount`; «Bekor qilinganlar»; sahifalash; qamrov (BD boshqa filialni ko'rmaydi, bo'sh qamrov — bo'sh); davr rad javoblari (to'rt matn); DTO vergulli ro'yxatlar (`method`, `groupId`, `courseId`, `teacherId`, `receivedById`; bo'sh qiymat → filtr yo'q, `[]` emas); arxivlangan o'quvchi to'lovi ro'yxatda va qidiruvda bor (`archived: true`); `rows/:id` ro'yxat filtrlarini e'tiborsiz qoldiradi va REVERSED to'lovni ham qaytaradi, qamrovdan tashqarida 404, davr tashqarisidagi to'lov o'z oyi bilan; balans oldin→keyin asl yozuvdan; bekor qilish sababi (`reversalReason` orqali) va kim; `correctedBy` / `correctsPayment`; `roleLabel` faqat Teacher yoki rolsiz akkauntda `null`; dvigatel so'rov boshiga bir marta chaqiriladi.
- Summary: «Bu oy» `total` va `parts` = `getIncomeMonthAttribution` bilan bir xil davrda; `byMethod`, `online` faqat COMPLETED va `GATEWAY_WEBHOOK`; bo'sh qamrov → 403.
- `reversalReason`: «Bekor qilindi: Payme CancelTransaction» → «Payme to'lovni bekor qildi»; mavjud qoidalar o'zgarmaydi.
- Excel: ustunlar, filtrlar qatori, «Jami» COMPLETED, 20 000 chegara.
- Reverse: sabab yo'q / bo'shliq → 400 (DTO va xizmat); Payme yo'li sababsiz ishlaydi; yangi «darslarga sarflangan» matni.
- Tuzatish: yangi to'lovda `correctsPaymentId`; qayta yozuv yiqilsa bog'lanish yo'q.
- `allocatePaymentReceiptCode`: Toshkent yili (31.12 soat 20:00 UTC → keyingi yil), ketma-ketlik, keyingi raqam boshqa kompaniyaning kodlarini ham hisobga oladi (global eng katta), mavjud kod qaytadi, to'qnashuvda qayta urinish; `Q-…` ham Toshkent yili va global eng katta; tinglovchi `payment.received`da chaqiradi, xatoni yutadi; `event-wiring.spec.ts` hodisani ko'radi.
- Ikki skript: quruq ishga tushirish yozmaydi, `--expect` mos kelmasa to'xtaydi, tuzatish bog'lashda bir nechta nomzod — bog'lanmaydi, ikkala sabab prefiksi («Summa to'g'rilandi:» va «To'lov usuli to'g'rilandi») taniladi.
- Migratsiya: `Transaction_paymentId_idx` yaratiladi.
- Controller spec'lari (besh yo'l), `permission-routes.spec.ts`, `branch-route-policy.spec.ts`; olib tashlangan yo'llar snapshot'dan chiqqan.

Mijoz (vitest):
- `periodRange`: Bugun/Kecha, Bu hafta dushanbadan (yakshanba kuni ham), Bu oy oxirgi kungacha, O'tgan oy yanvarda, Oraliq chegarasi.
- `legacyStudentPaymentsRedirect` (boshi chegaradan oldin → 2026-05-01; ikkalasi oldin, oxiri boshidan oldin yoki bitta sana → davrsiz), `/payments/pending` → `/payments/debt` yo'naltirish, `paymentsListHref`.
- `CorrectPaymentDialog`: `onCorrected` ikkinchi argumentda `newPaymentId` (usul tuzatilganda `null`), «To'lovlar» kalitlari yangilanadi; profildagi chaqiruvchi o'zgarishsiz ishlaydi.
- Oyna: 404 da «To'lov bu filialda topilmadi» + «Yopish» (`?tolov=` o'chadi); pastki izoh imkoniyatlarga qarab (ikkalasi / bittasi / yo'q); arxivlangan o'quvchida «O'quvchi profili» yo'q; «Qabul qildi» rolsiz akkauntda faqat ism.
- Karta faqat `reports.finance` bilan; «Bu oy»dan boshqa davrda split va belgi yo'q; chip filtrni o'rnatadi/bo'shatadi.
- Jami qatori matnlari (oddiy, «Bekor qilinganlar», «shundan …»).
- Jadval: bekor qilingan va «tuzatildi → …» qatorlari, «+1» guruh, «onlayn» pill.
- Oyna: kvitansiya qatorining uch ko'rinishi, «BALANS» / «BEKOR QILINDI», tugmalar rolga qarab, 72 soat hint.
- Bekor qilish oynasi: sababsiz tugma o'chiq, server xatosi oynada.

## 9. Deploy tartibi

1. Migratsiya (`correctsPaymentId` va `Transaction_paymentId_idx`) — prod bazaga, server deployidan oldin (qo'shimcha, eski server bilan xavfsiz).
2. Server (Railway) va mijoz (Vercel) **birga**, ketma-ket: yangi mijoz yangi yo'llarni o'qiydi; yangi server esa eski mijozning «Kutilyotgan to'lovlar» va «O'quvchi to'lovi» sahifalari o'qiydigan ikki yo'lni olib tashlaydi. Oradagi bir necha daqiqada faqat shu ikki eski sahifa ishlamaydi. `POST /payments/:id/reverse` sababi majburiyligi eski mijozni buzmaydi (unda bekor qilish tugmasi yo'q).
3. `scripts/backfill-payment-receipt-codes.ts` — quruq, keyin `--apply --expect=<N>` (`railway run …`, `server/` dan).
4. `scripts/link-payment-corrections.ts` — quruq, «bog'lanmadi» ro'yxatini CEO ko'radi, keyin `--apply --expect=<N>`.
5. Tekshiruv prodda: «Bu oy» kartasi = «Umumiy ma'lumotlar»dagi «Kassaga tushdi»; filtrsiz «Tanlangan» X = karta (G1); «Eski qarzlar» chipini bosish → «shundan Eski qarz» Y = chip; bitta to'lovni Excel bilan solishtirish; admin akkauntida karta yo'q.

## 10. Ma'lum cheklovlar

- **Tezlik va kesh yo'qligi.** Har so'rov (sahifa almashishi ham) dvigatelni bir marta chaqiradi (§4.4) — «Kassaga tushdi» bugun qilayotgan ish; oyiga bir necha yuz to'lov uchun yetarli, uzun «Oraliq» sekinroq. Birinchi chiqishda kesh qo'yilmaydi, chunki: (1) qismlarni nafaqat to'lov, balki har qanday ledger qatori (oy hisobi, tuzatish yozuvi, pul qaytarish, dars puli qaytishi) o'zgartiradi — `payment.received` / `payment.reversed` bo'yicha tozalanadigan kesh shu holatlarda eskirgan bo'linishni ko'rsatardi; (2) «Umumiy ma'lumotlar» kartasi keshlanmagan, kesh esa ««Kassaga tushdi» kartasidagi raqamning o'zi» belgisini bir muddat yolg'on qilardi. `// ponytail:` izohi: sekinlik o'lchansa — kalitga kompaniyaning eng oxirgi `Transaction` yozuvi (`max(createdAt), max(id)` — bitta arzon so'rov) qo'shilgan (kompaniya, qamrov, davr) Redis keshi; har ledger o'zgarishi kalitni o'zi almashtiradi, hodisa bo'yicha tozalash kerak bo'lmaydi.
- **Qismsiz amaldagi to'lov.** Dvigatel ledger'dagi PAYMENT qatorini davr va filial bo'yicha sanaydi, ro'yxat esa `Payment` qatorini. Ikkisi farq qilsa (ledger yozuvi `paymentId`siz, `createdAt` lahzalari kun chegarasining ikki tomonida, ledger filiali to'lov filialidan boshqa) qator «—» ko'rsatadi va karta bilan qatorlar farqi o'sha summaga teng. G1 auditi buni ushlaydi.
- **Ustoz va kurs filtri** guruhning HOZIRGI ustozi va kursi bo'yicha; to'lov kunidagi ustoz (`GroupTeacherHistory`) o'qilmaydi.
- **Kvitansiya raqami** bir necha millisekund kechikib beriladi (tinglovchi); tinglovchi yiqilsa raqam PDF ochilganda yoki skript qayta ishga tushganda beriladi — shu orada qidiruv uni topmaydi.
- **Kodlar tartibi** xronologik emas: eski PDF'lar bilan ochilish tartibida berilgan kodlar o'z joyida qoladi, skript qolganlarini ulardan keyin beradi.
- **Bog'lanmagan eski tuzatishlar** oddiy «bekor qilingan» bo'lib ko'rinadi (sababi bilan).
- **Payme bekor qilishlari** sababi «Payme to'lovni bekor qildi» (§4.9 dagi `reversalReason` qoidasi), «Kim» — «—».
- **Arxivlangan o'quvchi** qatorida guruh odatda «—» (kartasi bilan arxivlangan yozilishlar sanalmaydi, §4.5) va profilga havola yo'q.
- **«Qabul qildi» roli** bugungi rol: keyin lavozimi o'zgargan xodim yangi roli bilan ko'rinadi.

## 11. Ochiq emas / keyinga

- «To'lov hisobotlari»ning jami summasini bu sahifaga ko'chirish va hisobotni almashtirish — 5-qism.
- Mijozda ko'p tanlovli filtrlar (usul, guruh, ustoz, kurs, qabul qildi) — server ularni allaqachon vergulli ro'yxat sifatida oladi (§5.2), faqat mijoz ishi; saralash ustunlari.
- To'lov kunidagi ustoz bo'yicha filtr.
- Oynada tahrirlash (izoh, qog'oz raqamini o'zgartirish) va to'lovni boshqa o'quvchiga ko'chirish.
- «Bonus» ustuni (olib tashlandi, qaytmaydi).
- «Oxirgi to'lovlar» blokining guruh qoidasini to'lov kuniga o'tkazish (B1 qoidasi qoladi).
