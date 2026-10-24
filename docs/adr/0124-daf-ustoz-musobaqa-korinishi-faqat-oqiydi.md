# ADR-0124 — DaF ustoz musobaqa ko'rinishi: guruh sahifasidagi «Musobaqa» tabi faqat o'qiydi, yangi jadval yo'q

**Holati:** Qabul qilindi
**Sana:** 2026-10-20
**Bog'liq:** `docs/superpowers/specs/2026-10-20-musobaqa-s5-ustoz-korinishi-design.md`, ADR-0020, ADR-0114, ADR-0115, ADR-0116, ADR-0117, `server/src/daf/ustoz/`

## Kontekst

Guruh sahifasida «Ilova faolligi» tabi bor (ADR-0020), lekin unda musobaqa yo'q: ustoz guruhi markazda nechanchi o'rinda ekanini va shu hafta kim mashq qilmaganini ko'rmaydi. S5 shu bo'shliqni yopadi: guruh sahifasida alohida «Musobaqa» tabi. Ustozga o'quvchi ekranidagi raqamlar kerak, yangi hisob emas.

## Qaror

1. **Ustoz ko'rinishi yangi jadval yozmaydi.** `GET /groups/:id/musobaqa?hafta=YYYY-MM-DD` hamma narsani S1–S3 hisoblaridan o'qiydi (`DafStudentDay`, `DafGroupWeek`, liga, nishonlar, maqsad). Migratsiya yo'q.
2. **Guruh o'rni bir manbadan:** joriy haftada S3 `guruhlarYigindisi` + `guruhlarniSarala` (o'quvchi ilovasidagi jadval bilan bir xil), o'tgan haftada `DafGroupWeek` qatori (yozuvi yo'q hafta — `YOZUV_YOQ`). Tarix — oxirgi 8 hafta `DafGroupWeek`; ekranda sakkiz ta bosiladigan chip.
3. **«Mashq qilmadi» jami ball bo'yicha:** o'quvchi shu haftada hamma guruhlardagi jami bali 0 bo'lsa ro'yxatga tushadi (boshqa guruhda mashq qilgan o'quvchi «mashq qilmagan» emas).
4. **Seriya va maqsad faqat joriy haftada** va o'quvchi ekranidagi «bosh» qoidasisiz; javobga `bugun` (Toshkent kuni) kiradi.
5. **Huquq ilova faolligi bilan bir xil:** `groups.view` + `assertCallerMayTouchGroup`; marshrut manifestida `BRANCH_SCOPED_BY_ENTITY`.
6. **O'qish-faqat qorovuli:** `src/daf/ustoz/` ichida yozish yo'q (`musobaqa-ustoz.read-only.spec.ts`). Ustozga Telegram xabar yuborilmaydi — ro'yxat ustoz o'zi bog'lanishi uchun.
7. **Bir vaqtdagi so'rovlar bitta o'qishga birlashadi (yuklama sinovida qo'shilgan qaror).** Bir kompaniya + bir hafta uchun parallel so'rovlar markaz bo'yicha guruhlar jadvalini bitta uchishdagi (in-flight) o'qish orqali oladi (`musobaqa-ustoz.service.ts`, `yigindi()`). Yozuv so'rov tugashi bilan o'chadi, shuning uchun kesh ham, eskirgan javob ham yo'q.

## Ko'rib chiqilgan muqobillar

- **Guruh o'rnini alohida jadvalda saqlash** — ikkinchi manba, S3 bilan farqlanib ketadi. Rad.
- **Har so'rovda markaz jadvalini alohida o'qish** — 50 parallel so'rovda 10 ulanishli pul navbat hosil qildi, p95 210–271 ms (chegara 200). Rad, 7-band bilan almashtirildi.
- **`yigindi()` natijasini vaqt bilan keshlash** — eskirgan raqam ko'rsatadi; ustoz o'quvchi ekranidan farq ko'radi. Rad.
- **Ustozga «mashq qilmadi» Telegram xabari** — S5 dan tashqarida (spec §9).

## Oqibatlari

- **Yuklama natijalari** (spec §11; 12 000 o'quvchi, 520 faol guruh, 50 parallel × 10 davra): parity — 200 guruh × 2 hafta = 400 guruh-hafta, **farq 0** (a'zo qatori, guruh bali, jami ball, faol kunlar, seriya; joriy haftada S3 jadvali va karta bali). p95 tinch **78–82 ms**, band (loadavg 8,0) **116 ms** (chegara 200 ms). 7-bandsiz p95 **210–271 ms** edi.
- **Deploy:** migratsiya yo'q, o'chirgich yo'q; kod chiqqach yangilik yozuvi ko'rinadi.
- **Ma'lum cheklovlar (qabul qilingan):**
  1. **Seriya oynasi 400 kun:** undan uzun seriya 400 deb ko'rinadi.
  2. **O'tgan haftaning o'quvchi ro'yxati bugungi ACTIVE a'zolar bo'yicha**, karta esa muzlatilgan `DafGroupWeek` sonlari bo'yicha: eski haftada tarkib boshqacha bo'lgan bo'lsa, ikkalasi mos kelmasligi mumkin.
  3. **Guruh darajasidagi `azolar()` guruhning ACTIVE holatini filtrlamaydi:** guruh `ACTIVE` emas bo'lsa karta `FAOL_EMAS` deydi, ro'yxat esa a'zolarni baribir ko'rsatadi.
  4. **Markaz so'rovi (≈ 31 ms)** har ochilishda bor (parallel so'rovlar birlashadi, ketma-ketlari yo'q).
  5. **`guruhlar` (S3) sekinlashsa** shu tab ham sekinlashadi (S3 limiti): ishga tushgach prodda `GET /groups/:id/musobaqa` p95 sini kuzatish.
