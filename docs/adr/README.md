# Arxitektura qarorlari (ADR)

Bu papka loyihaning **qaytarish qiyin bo'lgan qarorlari** jurnali. Har bir fayl bitta qarorni yozib qo'yadi: qaror paytida nima haqiqat edi, nima qaror qilindi, va buning evaziga nima yutildi-yo'qotildi.

Maqsad bitta savolga javob berish: **«nega shunday qilingan, boshqacha emas?»**

---

## Asosiy qoida: ADR o'zgarmaydi

ADR — jurnal, wiki emas. Qabul qilingan ADR **hech qachon tahrirlanmaydi** (imlo xatosidan tashqari).

Qaror eskirsa:

1. Yangi ADR yoziladi, unda eskisiga havola bo'ladi
2. Eski ADR'ning `Holati` maydoni `Almashtirildi — ADR-00NN` ga o'zgartiriladi
3. Eski matn **o'sha joyda qoladi**

Shuning uchun bu jurnalga ishonish mumkin. Agar eski qarorlarni tahrirlab yursak, u shunchaki yana bitta eskirgan hujjatga aylanadi.

---

## Qachon ADR yoziladi

ADR **quyidagilar uchun** yoziladi:

- Ma'lumot modeli qarori — jadval, bog'lanish, majburiy maydon (`User.position` roldan ajratilgani)
- Pul semantikasi — balans, qarz, oylik, qaytarish nimani anglatishi
- Filial/ijara qoidalari — nima ajratiladi, nima ajratilmaydi
- Fail-open vs fail-closed tanlovi
- Tashqi xizmat tanlovi va undan qaytish narxi
- «Ataylab qilmadik» qarorlari — masalan «o'quvchini filialdan filialga ko'chirish qurilmaydi»

ADR **quyidagilar uchun yozilmaydi:**

| Nima | Qayerga yoziladi |
|---|---|
| Kodlash uslubi, nomlash, papka tuzilishi | `server/CLAUDE.md`, `client/CLAUDE.md` |
| «Bu funksiyani qanday ishlatish kerak» | Fayl ichidagi izoh yoki `docs/` qo'llanmasi |
| Bir martalik tuzatish, bug fix | Commit xabari va PR tavsifi |
| Reja, keyin nima qilinadi | `docs/*-plan.md` |
| Audit natijasi, topilmalar ro'yxati | `docs/*-audit.md` |

**Oddiy sinov:** olti oydan keyin kimdir bu koddagi qatorni ko'rib «bu xato-ku, tuzataman» desa va **noto'g'ri qilsa** — demak ADR kerak edi.

---

## Qanday yoziladi

1. `0000-shablon.md` dan nusxa oling
2. Keyingi bo'sh raqamni oling. **Raqam hech qachon qayta ishlatilmaydi**, hatto ADR rad etilsa ham
3. Fayl nomi: `NNNN-qisqa-sarlavha.md` — kichik harf, chiziqcha bilan
4. **O'sha ishning o'zi bilan bitta commit/PR ichida** yoziladi, keyinga qoldirilmaydi
5. Quyidagi indeksga bitta qator qo'shiladi

Uzunligi: bir sahifadan oshmasin. ADR uzun bo'lsa, demak u aslida bir nechta qaror.

**Qo'llanma.** Foydalanuvchiga ko'rinadigan qaror (xodim ko'radigan, qiladigan yoki
tushuntirishi kerak bo'lgan pul/holat natijasi) — shu PR'da
`client/src/qollanma/kontent/` dagi sahifa yangilanadi, reyestrdagi `adr` ro'yxatiga
raqam qo'shiladi va `client/src/qollanma/yangiliklar.ts` ga yozuv tushadi. Faqat
texnik qaror — `client/src/qollanma/texnik-adrlar.ts` ga sababi bilan. Bu ro'yxat va
`client/src/qollanma/adr-qamrovi.test.ts` qo'llanmaning qolgan bo'limlari bilan
qo'shiladi; shundan keyin ikkalasidan hech birida yo'q ADR CI'ni yiqitadi. Hozircha
buni ko'rib chiquvchi qo'lda tekshiradi.

---

## Indeks

| # | Sarlavha | Holati | Sana |
|---|---|---|---|
| [0001](0001-bir-yozuv-bitta-filial.md) | Har bir yozuv aniq bitta filialga tegishli | Qabul qilindi | 2026-07-29 |
| [0002](0002-filial-qamrovi-fail-closed.md) | Noma'lum filial qamrovi hech narsani ko'rsatmaydi | Qabul qilindi; `PayrollBranchScope` turi va «asosiy filiali yo'q xodim bo'sh ekran ko'radi» qismi — ADR-0058 bilan o'zgardi | 2026-07-29 |
| [0003](0003-route-siyosati-manifest.md) | Har bir route filial siyosati bo'yicha toifalanadi | Qabul qilindi | 2026-08-06 |
| [0004](0004-balans-haqiqati-ledgerda.md) | Balans haqiqati ledger'da saqlangan, qayta hisoblanmaydi | Qabul qilindi | 2026-08-06 |
| [0005](0005-hisobot-pastki-chegarasi.md) | Hisobotlar `Company.systemStartDate` dan boshlanadi | Qabul qilindi | 2026-06-06 |
| [0006](0006-oylik-yagona-manba.md) | Ustoz oyligi faqat `getMonthly` dan o'qiladi | Qabul qilindi | 2026-07-05 |
| [0007](0007-lavozim-roldan-ajratilgan.md) | Lavozim roldan ajratilgan | Qabul qilindi | 2026-08-16 |
| [0008](0008-royxatdan-otish-aktori-oshkora.md) | Chaqiruvchisi yo'q yozuv o'zini oshkora e'lon qiladi | Qabul qilindi | 2026-08-19 |
| [0009](0009-deutsch-tutor-olib-tashlandi.md) | Deutsch Tutor noldan qayta quriladi, eski qatlam olib tashlandi | Qabul qilindi | 2026-08-19 |
| [0011](0011-oquv-ozagi-standartga-boglanadi.md) | O'quv o'zagi Goethe standartiga bog'lanadi, manbaga emas | Qabul qilindi | 2026-08-26 |
| [0012](0012-bosh-sahifa-qayta-hisoblamaydi.md) | Bosh sahifa paneli raqamlarni qayta hisoblamaydi | Qabul qilindi | 2026-09-02 |
| [0013](0013-majburiy-royxat-boshqaruvsiz-qolmaydi.md) | Majburiy tanlov ro'yxati boshqaruv sahifasisiz qolmaydi | Qabul qilindi | 2026-09-03 |
| [0014](0014-a1-kursi-on-ikki-unitga-bolinadi.md) | A1 kursi o'n ikki unitga bo'linadi | Qabul qilindi | 2026-09-03 |
| [0015](0015-faol-oquvchi-tarifi-manifest.md) | «Faol o'quvchi» sanog'i manifest bilan majburlanadi | Qabul qilindi; «Pul o'lchovlari ataylab chetda» bandi qarz yuzalari uchun — ADR-0059 bilan o'zgardi | 2026-09-10 |
| [0016](0016-kun-chegarasi-toshkent-boyicha.md) | Kun chegarasi Toshkent bo'yicha, ustun tipiga qarab | Qabul qilindi | 2026-09-10 |
| [0017](0017-har-bir-oquvchi-lid-sifatida-tugiladi.md) | Har bir o'quvchi lid sifatida tug'iladi | Qabul qilindi | 2026-09-10 |
| [0018](0018-oquvchi-lidsiz-tugilmaydi-qorovul-bilan.md) | O'quvchi lidsiz tug'ilmaydi — kafolat qorovul bilan | Qabul qilindi | 2026-09-13 |
| [0019](0019-mashq-natijasi-umumiy-shartnoma.md) | Mashq natijasi umumiy shartnomaga yoziladi, ko'nikma o'qishda hisoblanadi | Qabul qilindi | 2026-09-13 |
| [0020](0020-ilova-faolligi-klientda-olchanadi.md) | Ilova faolligi klientda o'lchanadi, server jami qiymatni qirqadi | Qabul qilindi | 2026-09-13 |
| [0021](0021-bosma-pul-raqami-va-bolinishi-bitta-manbadan.md) | Bosma pul raqami va uning bo'linishi bitta manbadan olinadi | Qabul qilindi | 2026-09-19 |
| [0022](0022-bir-odam-har-rolga-alohida-hisob.md) | Bir odam — har rolga alohida hisob; kimlik telefon emas, bog'lanish | Qabul qilindi | 2026-09-19 |
| [0023](0023-avtomatik-pauza-chiqarmaydi.md) | Avtomatik pauza o'quvchini guruhdan chiqarmaydi | Qabul qilindi | 2026-09-19 |
| [0024](0024-daf-faollik-normasi-yigindi-sql-qaror-ts.md) | DaF faollik normasi sozlamada; yig'indi SQL da, qaror TypeScript da | Qabul qilindi | 2026-09-20 |
| [0025](0025-telegram-xabarlari-kunlik-navbatga-jamlanadi.md) | Ko'pchilik Telegram xabari kunlik yagona navbatga jamlanadi, darhol yubormaydi | Qisman almashtirildi — ADR-0078 | 2026-09-23 |
| [0026](0026-rol-berish-shipi-ikkala-eshikda.md) | Rol faqat chaqiruvchining shipi ichida beriladi va olinadi | Qabul qilindi | 2026-09-24 |
| [0027](0027-xodim-hisobini-faqat-yuqoridagi-rahbar-ozgartiradi.md) | Xodim hisobini faqat undan yuqoridagi rahbar o'zgartiradi | Qabul qilindi | 2026-09-24 |
| [0028](0028-bloklangan-xodim-hech-narsa-bermaydi.md) | Bloklangan xodim hech narsa bera olmaydi, uning tokeni keyingi so'rovda to'xtaydi | Qabul qilindi; «rol o'zgarishi tokenni to'xtatmaydi» qismi — ADR-0079 bilan almashtirildi | 2026-09-24 |
| [0029](0029-xodim-havolasi-uch-kun-ishlaydi.md) | Xodim havolasi uch kun ishlaydi, berilgan vaqti imzo ichida | Qabul qilindi | 2026-09-24 |
| [0030](0030-parol-ozgarsa-boshqa-kirishlar-toxtaydi.md) | Parol o'zgarsa, hisobning boshqa kirishlari keyingi so'rovda to'xtaydi | Qabul qilindi | 2026-09-24 |
| [0031](0031-oz-kirish-kalitingiz-joriy-parol-bilan-ozgaradi.md) | O'z kirish kalitingiz faqat joriy parol bilan o'zgaradi | Qabul qilindi; o'quvchi qismi — ADR-0039 | 2026-09-24 |
| [0032](0032-oquvchi-kirish-raqami-kartaga-ergashadi.md) | O'quvchining kirish raqami kartadagi raqamga ergashadi | Qabul qilindi | 2026-09-24 |
| [0033](0033-oquvchi-hisobi-kartasi-bilan-yopiladi.md) | O'quvchining kirish hisobi kartasi bilan birga yopiladi va qaytadi | Qabul qilindi | 2026-09-24 |
| [0034](0034-direktor-oz-filiali-ustozlariga-stavka-qoyadi.md) | Filial direktori o'z filiali ustozlariga stavka qo'yadi | Qabul qilindi | 2026-09-24 |
| [0035](0035-ketgan-oquvchi-tarifi.md) | O'quvchi to'xtagan kuni ketgan sanaladi; guruhsizlik va pauzada N kun kutiladi | Qabul qilindi | 2026-09-25 |
| [0036](0036-guruh-yopilganda-muzlatilgan-yozilish-ham-yopiladi.md) | Guruh yopilganda muzlatilgan yozilish ham yopiladi; tugallangan guruhda u DROPPED bo'ladi | Qabul qilindi | 2026-09-26 |
| [0037](0037-tolovlar-hisoboti-pul-qoidalari.md) | To'lovlar hisoboti: pul dars o'tilgan oyga yoziladi, ichki tuzatishlar darsga qo'shiladi, taqsimot FIFO | Qabul qilindi; 5-band — ADR-0073 bilan aniqlashtirildi | 2026-09-26 |
| [0038](0038-foyda-tarkibi-dars-narxi-va-xodim-filiali.md) | Foyda tarkibi: dars o'zini yechgan hisob narxida, xodim bitta filialda sanaladi; ochiq oy oxiri taxmin qilinadi | Qabul qilindi | 2026-09-27 |
| [0039](0039-oquvchi-birinchi-kirishda-telefon-jins-yosh.md) | O'quvchi ilovaga kirishdan oldin telefonini SMS bilan tasdiqlaydi, jinsi va tug'ilgan sanasini beradi | Qabul qilindi | 2026-09-27 |
| [0040](0040-mini-app-ichida-faqat-telegram-orqali-kirish.md) | Mini App ichida o'quvchi faqat Telegram orqali kiradi; bog'lanmagan akkauntga xabar ko'rsatiladi | Qabul qilindi | 2026-09-27 |
| [0041](0041-guruh-holati-bitta-tranzaksiyada-ozgaradi.md) | Guruh holati bitta tranzaksiyada o'zgaradi: yo hammasi, yo hech narsa | Qabul qilindi | 2026-09-27 |
| [0042](0042-oylik-tolov-xabari.md) | Oylik to'lov xabari: hisob kuni va 2-dars eslatmasi (Telegram) | Qabul qilindi; ADR-0064 bilan to'ldirildi | 2026-09-27 |
| [0043](0043-shartnoma-6-2-40-foizdan-keyin-pul-qaytmaydi.md) | Shartnoma 6.2: o'quvchi oyning 40% idan ko'pi o'tgach o'zi ketsa, oy to'lovi qaytarilmaydi; boshqa tartibni CEO yoki filial direktori tanlaydi | Almashtirildi — ADR-0044 | 2026-09-27 |
| [0044](0044-darajani-tugatgan-oquvchi-shartnoma-bajarilgan.md) | Darajani tugatgan o'quvchi: shartnoma bajarilgan, oyning o'tilmagan darslari puli qaytadi; 40% qoidasining to'liq hozirgi holati | Qabul qilindi | 2026-09-27 |
| [0045](0045-bot-xodimni-taniydi-xodim-kabineti-mini-appda.md) | Bot xodimni Telegram bog'lanishi bilan taniydi; xodim kabineti Mini App'da parolsiz ochiladi | Qabul qilindi | 2026-09-28 |
| [0046](0046-qabul-qilingan-mock-tolovi-tuzatiladi.md) | Admin qabul qilgan mock to'lovi tuzatiladi va bekor qilinadi; onlayn va balans to'lovi — yo'q | Qabul qilindi | 2026-09-28 |
| [0047](0047-davomat-oynasi-va-tolovsiz-oquvchi.md) | Davomat dars tugashi bilan yopiladi; to'lov qilmagan o'quvchi 2-darsdan puli yetgan darslargacha qatnashadi | Qabul qilindi; dars tugagach tuzatish — ADR-0054; kamida 50% — ADR-0064 | 2026-09-27 |
| [0048](0048-davomat-2-bosqich-berilmadi-kechikish-sinov-darsi.md) | «Berilmadi» o'qishda hisoblanadi; kechikish daqiqasi; sinov darsi (3.5) oyni to'liq qaytaradi; qarzdorning 1-darsga kelmagani to'lovgacha ustozga yozilmaydi; uchta sozlama | Qabul qilindi; «Berilmadi» — ADR-0054 bilan to'ldirildi; sinov darsi javobsiz dars bilan — ADR-0060 | 2026-09-27 |
| [0049](0049-markaz-qoplagan-birinchi-dars.md) | Markaz qoplagan 1-dars markazning puli bo'lib ko'rinadi | Rad etildi | 2026-09-28 |
| [0050](0050-stavka-sanasidan-yozilgan-darslar-qayta-hisoblanadi.md) | Stavka o'z sanasidan beri yozilgan, oyligi hisoblanmagan darslarga ham qo'llanadi; saqlashdan oldin ta'siri ko'rsatiladi | Qabul qilindi | 2026-09-29 |
| [0051](0051-oylik-hisobsiz-dars-paket-narxida-baholanadi.md) | Oylik kursdagi hisobsiz dars paket narxida baholanadi; ustoz haqi tushib qolmaydi | Qabul qilindi | 2026-09-29 |
| [0052](0052-oylik-hisobning-tolanmagan-ulushi-markaz-ustunida.md) | Oylik hisobning to'lanmagan ulushi «Markaz qo'shdi» ustunida ko'rinadi; oylik summasi o'zgarmaydi | Qabul qilindi | 2026-09-29 |
| [0053](0053-bekor-qilingan-dars-puli-darhol-qaytadi.md) | Bekor qilingan darsning puli oylik to'lovchilarga darhol qaytadi — davomati belgilanmaganlarga ham | Qabul qilindi; 5-band — ADR-0063 | 2026-09-29 |
| [0054](0054-davomat-olinmagan-dars-ustoz-haqisiz.md) | Dars tugaguncha davomat olinmasa — «Dars bo'ldimi?»; «Bo'ldi» bo'lsa ustozga haq yozilmaydi | Qabul qilindi | 2026-09-30 |
| [0055](0055-balansdan-yechib-olingan-pul-oy-daromadi.md) | Balansdan yechib olingan pul yechilgan oyning daromadi; oy tanlanmaydi | Qabul qilindi | 2026-09-30 |
| [0056](0056-mock-royxat-manbasi-qatorda.md) | Mock ro'yxati qayerdan kelgani (bot yoki admin) qatorning o'zida yoziladi | Qabul qilindi | 2026-09-30 |
| [0058](0058-oylik-oyning-asosiy-raqami-hisoblandi.md) | Oylik oyning asosiy raqami hisoblandi / to'landi / qoldi; bekor qilingan qaytarish va kechirish sanalmaydi; oylik qamrovi — filiallar to'plami | Qabul qilindi | 2026-10-01 |
| [0059](0059-qarz-ikki-alohida-raqam.md) | Qarz ikki alohida raqamda: o'qiyotganlar va o'qimayotganlar qarzi; ikkisi hech qayerda qo'shilmaydi | Qabul qilindi | 2026-10-01 |
| [0060](0060-sinov-darsi-javobsiz-dars-bilan-hal-qilinmaydi.md) | Sinov darsi javobsiz «Dars bo'ldimi?» bilan hal qilinmaydi: chiqarish va chetlatish avval javobni kutadi | Qabul qilindi | 2026-10-01 |
| [0062](0062-oylik-yozilish-sikl-emas-oy.md) | Oylik yozilish «sikl»ga bo'linmaydi: «Darslar» va «Qarzdorlar» oy bo'yicha, qarz kechirish oylikda taklif qilinmaydi | Qabul qilindi | 2026-10-02 |
| [0063](0063-bekor-qilishni-ochirish-pulni-qaytarib-oladi.md) | Bekor qilishni o'chirish qaytarilgan dars pulini ham qaytarib oladi; o'zgargan yozilishning puli qoldiriladi | Qabul qilindi | 2026-10-02 |
| [0064](0064-darsga-kirish-uchun-oy-tolovining-eng-kam-qismi.md) | Darsga kirish uchun oy to'lovining kamida 50% i (har guruhda o'z 2-darsidan, 01.11.2026 dan); to'langan darslar tugashidan 3 kun oldin eslatma | Qabul qilindi | 2026-10-02 |
| [0065](0065-tolov-cheki-darhol-ketadi.md) | To'lov cheki va to'lov bekor qilingani haqidagi xabar darhol ketadi; Payme/Click to'lovi ham chek oladi | Qabul qilindi | 2026-10-02 |
| [0066](0066-telegram-uzilgan-oquvchi.md) | Botni bloklagan o'quvchi «Telegram uzilgan» deb belgilanadi; botga qaytsa belgi o'zi olinadi | Qabul qilindi | 2026-09-30 |
| [0067](0067-kassa-uch-qism-marketing-va-umumiy-sahifa.md) | Kassaga tushgan pul uch qismda (shu oy, oldindan, eski qarz); marketing ko'rsatkichlari birinchi to'lov bo'yicha; o'qimayotganlar qarzi uch turga bo'linadi; «financial-overview» faqat CEO va filial direktoriga | Qabul qilindi | 2026-10-02 |
| [0068](0068-javobsiz-dars-savoli-bor-guruh-yopilmaydi.md) | «Dars bo'ldimi?» savoliga javob berilmaguncha guruh yopilmaydi; filialni yopish va kursni arxivlash ham | Qabul qilindi | 2026-10-03 |
| [0069](0069-orinbosar-ustoz-guruh-ustozi-qoidalarida.md) | O'rinbosar ustoz guruh ustozi qoidalariga bo'ysunadi: o'qituvchi roli, guruh filiali, ish haqi stavkasi | Qabul qilindi | 2026-10-03 |
| [0070](0070-zaxira-raqam-ikkinchi-kirish-kaliti.md) | Zaxira raqam — o'quvchining ikkinchi kirish kaliti; asosiy raqam ustun, o'quvchi o'zi parol + SMS bilan qo'shadi | Qabul qilindi | 2026-10-03 |
| [0071](0071-soz-zaxirasi-korilmagan-sozlar-birinchi.md) | A1 so'z zaxirasi: Goethe va Netzwerk so'zlari to'liq; dars ko'rilmagan so'zlarni birinchi so'raydi; bo'lim hisoblagichi | Qabul qilindi | 2026-10-04 |
| [0072](0072-qarzdorlik-qatorlari-va-vada-qoidasi.md) | Qarzdorlik sahifasi qarz bo'linishining qatorlarini ko'rsatadi; to'lov va'dasi ko'pi bilan 7 kunga, oyiga bir marta; «Markaz qoplagani» faqat CEO va filial direktoriga | Qabul qilindi | 2026-10-04 |
| [0073](0073-tolovlar-hisoboti-manfiy-oy-kredit.md) | To'lovlar hisoboti: narxi manfiy chiqqan oy kredit bo'lib FIFO'da taqsimlanadi, to'lanmagan qatorlar doim qarzga teng | Qabul qilindi | 2026-10-05 |
| [0074](0074-topshiriq-alohida-bolim.md) | Topshiriq izohning turi emas, alohida bo'lim: bitta holat, tekshiruv bosqichi (Yangi → Jarayonda → Tekshiruvda → Bajarildi), yuqoridan pastga berish zinasi, tizim topshirig'ini faqat manbasi yopadi, `Task*` ga yozish faqat `src/tasks/` da | Qabul qilindi | 2026-10-07 |
| [0075](0075-shartnoma-hujjati-alohida-jadval.md) | Shartnoma hujjati alohida `ContractDocument` jadvalida: qiymatlar tuzilganda muhrlanadi, matn versiyalanadi, guruh almashganda bog'lanish o'tadi, eski `Contract` ishlatilmaydi | Qabul qilindi | 2026-10-10 |
| [0076](0076-qongiroqcha-kutilayotgan-xabar-ozi-yopiladi.md) | Qo'ng'iroqcha: son faqat sizdan ish kutayotgan o'qilmagan xabarlarni sanaydi, ish bajarilganda xabar o'zi yopiladi, bir xil dars xabarlari bitta qatorga yig'iladi; bir martalik tozalash hech narsani o'chirmaydi | Qisman almashtirildi — ADR-0090 (dars ogohlantirishining Telegram nusxasi yopilganda tahrirlanadi) | 2026-10-10 |
| [0077](0077-pul-qaytarish-sorov-va-markazga-otkazish-sharti.md) | Pul qaytarish so'rov bilan: balans so'rov kuni so'ralgan summaga kamayadi, pul kassadan «Berildi»da chiqadi, muddat 10 bank kuni; markazga o'tkazish xabardan 10 bank kuni va 30 kun keyin ochiladi | Qabul qilindi | 2026-10-10 |
| [0078](0078-topshiriq-xabarlari-telegramga-darhol.md) | Topshiriq xabarlari Telegram'ga darhol, tugmalar bilan ketadi (holat tugmalari xabarni tahrirlaydi, javob — izoh yoki qaytarish sababi); 22:00–08:00 tungi tinchlik, «Shoshilinch» bundan mustasno; 20:00 yig'madan chiqdi | Qisman almashtirildi — ADR-0089 | 2026-10-10 |
| [0079](0079-imkoniyat-rol-emas.md) | Ruxsat imkoniyat bilan tekshiriladi, rol faqat kimlikni bildiradi | Qabul qilindi | 2026-10-10 |
| [0080](0080-botdan-qoshilish-sorov-va-tasdiq.md) | Botdan ro'yxatdan o'tish so'rov: administrator tasdiqlamaguncha karta, guruh, hisob va pul yozilmaydi; 7 kunda o'zi yopiladi, hech qachon o'zi tasdiqlanmaydi; bot guruh va ustoz holatini tekshiradi | Qabul qilindi | 2026-10-10 |
| [0081](0081-filial-chegarasi-qoidalari.md) | Filial chegarasi: bayram filialga tegishli, filialni faqat CEO ochadi, o'z oyligini o'zi to'lamaydi | Qabul qilindi | 2026-10-10 |
| [0082](0082-avans-oz-oyidan-ushlanadi-berildi-sana-va-kassa.md) | Avans o'z oyining oyligidan ushlanadi (sanasi davr oxiridan oldingisi, cron va hisobot bitta funksiya bilan); «Berildi» kun va naqd/karta summalarini so'raydi, xodimga bot xabari boradi; hisoblash davri — faqat kalendar oyi | Qabul qilindi | 2026-10-10 |
| [0083](0083-avtomatik-topshiriqlar.md) | Tizim uch topshiriqni o'zi beradi: buzilgan va'da (har o'quvchiga, administratorlarga — ertalabki ro'yxat o'rniga), qayta qo'ng'iroq (qo'ng'iroqdagi sana kuni), qo'ng'iroqsiz lid (24 soat, faqat yangi lidlar); faqat manbasi yopadi; 21:00 hisobotida topshiriqlar qatori | Qabul qilindi | 2026-10-11 |
| [0084](0084-takrorlanuvchi-topshiriq.md) | Takrorlanuvchi topshiriq: birinchisi qoida bilan darhol, keyingilari har kuni 07:00 da; yakshanba/bayram keyingi ish kuniga; oldingisi ochiq bo'lsa yangisi yo'q; ikki nusxa ikki marta bermaydi; muallif ketsa qoida to'xtaydi; to'xtatish/o'chirishda topshiriqlar qoladi | Qabul qilindi | 2026-10-11 |
| [0085](0085-dialog-ovozi-gemini-3-8-har-obrazga-ovoz.md) | Dialog ovozi Gemini 3.8 da, har obrazning CEO tanlagan o'z ovozi; unitlar navbat bilan o'tkaziladi, navbati kelmagan unitning 3.1 yozuvi qoladi | Qabul qilindi | 2026-10-11 |
| [0086](0086-topshiriq-fayllari.md) | Topshiriq fayllari yopiq bucket'da, 10 daqiqalik havola; yuklash server orqali (tur baytlardan), CORS'siz; ovoz 3 daqiqa; «Rasm bilan tasdiqlansin» — tekshiruvga faqat ijrochining yangi rasmi bilan; Telegram javobidagi fayl va rasm | Qabul qilindi | 2026-10-11 |
| [0087](0087-ruxsatlar-sahifasi.md) | «Ruxsatlar» sahifasi: CEO rol imkoniyatlarini o'zgartiradi (faqat CEO, `@CeoOnly()`, imkoniyat emas); bazada faqat farq saqlanadi; texnik qulf olti sabab bilan server va ekranda bir xil; bog'liqlik bitta umumiy faylda; har saqlash tarixda; avans faqat «Oylik va avans to'lash» bilan | Qabul qilindi | 2026-10-11 |
| [0088](0088-tolovlar-sahifasi-tolov-boyicha-qismlar.md) | To'lovlar sahifasi: «Nimaga ketdi» kassa dvigatelining o'zidan har to'lov bo'yicha (`attributeIncome`, ikkinchi hisob yo'q); guruh — to'lov kunidagi; kvitansiya raqami to'lov yozilganda, pul tranzaksiyasidan tashqarida; bekor qilish sababi majburiy; tuzatish `correctsPaymentId` ustuni bilan bog'lanadi | Qabul qilindi | 2026-10-11 |
| [0089](0089-topshiriq-xabari-tirik-karta.md) | Topshiriq xabari Telegram'da tirik karta: har odamga har topshiriq bo'yicha bitta `CARD` xabar, holat o'zgarganda hammaniki tahrirlanadi (ovozsiz), birinchi holat xabari yangi karta; izoh, eslatma, «Muddati o'tdi» avvalgidek yangi xabar; o'chirilgan karta qatori o'chadi, 429 bir marta kutiladi; «Ochish» xodim Mini App'ida ochiladi | Qabul qilindi | 2026-10-15 |
| [0090](0090-davomat-ogohlantirishi-telegramda-ozi-yopiladi.md) | Dars ogohlantirishi yopilganda Telegram'dagi nusxasi ham tahrirlanadi: bot xabar raqamini `Notification` qatoriga yozadi, resolver sabab va vaqtni yozib dars ma'lumotini qoldiradi, ko'rsatma va havolani oladi (ovozsiz); topshiriq va to'lov xabarlariga tegilmaydi; deploydan oldingi xabarlar o'zgarmaydi | Qabul qilindi | 2026-10-16 |
| [0091](0091-dars-bahosi-faqat-ceo-telegram-darhol.md) | Dars bahosi: dars tugagach 10 daq – 3 soat ichida kelgan o'quvchiga Telegram'da 1–5 (darhol, ADR-0025 ro'yxatiga qo'shimcha); bitta qator, 48 soat, bitta baho va izoh; ustoz muzlatiladi; faqat CEO ko'radi (`@CeoOnly()`); `lessonRating.enabled` boshida o'chiq | Qabul qilindi | 2026-10-13 |
| [0092](0092-guruhlar-tolovi-hisob-ulushida.md) | Guruhlar bo'yicha to'lov: oy hisobi (`month-charges.ts`) guruhlarga hisob ulushida bo'linadi (largest remainder, `splitMonthChargesByCharge`), guruhlar yig'indisi «Qoldi» bilan so'mma-so'm teng; ustoz va kurs — hozirgi; eski uch `payment-reports` endpoint olib tashlandi | Qabul qilindi | 2026-10-16 |
| [0093](0093-lid-egasi.md) | Lidning bitta egasi bor: xodim band qiladi, muddatda harakat qilmasa lid qaytadi | Qabul qilindi | 2026-10-16 |
| [0094](0094-xarajatlar-oy-boyicha-foyda-bilan-bitta-toplam.md) | Xarajatlar sahifasi oy bo'yicha (`?oy=`, may 2026 dan): jami — kanonik sof foydaning `operatingExpenses` i bilan bitta to'plam (tenglik testi); «Bu oy hali yozilmagan» — `missingRecurringExpenses` har filialga alohida, «Yozish» qolganini yozadi; maslahat belgilari serverda, faqat «Boshqa» | Qabul qilindi | 2026-10-16 |
| [0095](0095-shaxsiy-telegram-hisobot.md) | Kunlik hisobot shaxsiy chatga: CEO oluvchi, filial va bo'limni belgilaydi | Qabul qilindi | 2026-10-16 |
| [0096](0096-kpi-natijasi.md) | KPI natijasi: administratorga, bir marta, summa muhrlanadi | Qabul qilindi | 2026-10-16 |
| [0097](0097-xodim-telegram-yetib-borishi.md) | Xodimning Telegrami: xabar yetib borishi sahifada ko'rinadi | Qabul qilindi | 2026-10-17 |
| [0098](0098-ketgan-oquvchilar-hisoboti-bitta-malumot-toplami.md) | «Ketgan o'quvchilar» hisoboti bitta fakt to'plamidan (`loadDepartureFacts`): sabab epizodniki, ustoz to'xtash paytidagi, kesim maxraji «oy boshida»; filtr hamma blokka; «Kursni tugatdi» hozircha ketgan | Qabul qilindi | 2026-10-17 |
| [0099](0099-markaz-faoliyati-bitta-malumot-toplami.md) | Markaz faoliyati: hamma blok bitta ma'lumot to'plamidan (`CenterFacts` + sof `evaluateCenter`), o'tgan oy o'sha oyning holatida (keyin yopilgan/o'chirilgan guruhlar ham hisobga kiradi), hafta du–sha, o'rin guruh bo'yicha `Σ min(o'quvchi, sig'im)`, tushum taxmini faqat oylik kurslar; eski `GET /reports/center-activity` olib tashlandi | Qabul qilindi | 2026-10-17 |
| [0100](0100-teilnahmebestatigung-qatnashganlik-hujjati.md) | Teilnahmebestätigung: qatnashganlik hujjati davomat va ilova bo'yicha, natija muhrlanadi | Qabul qilindi | 2026-10-17 |
| [0101](0101-xodimning-dizayn-uslubi-akkauntda.md) | Xodimning dizayn uslubi akkauntda; uslub tokenlarni almashtiradi, holat ranglarini emas | Qabul qilindi | 2026-10-17 |
| [0102](0102-interfeys-tili-matn-kalit-akkaunt-va-qurilma.md) | Interfeys tili: matn kalit, akkaunt va qurilmada saqlanadi | Qabul qilindi | 2026-10-17 |
| [0103](0103-davomat-hisoboti-bitta-malumot-toplami.md) | Davomat hisoboti: hamma blok bitta yozuvlar to'plamidan, foiz (Keldi+Kechikdi) ÷ (Keldi+Kechikdi+Kelmadi) bitta funksiyadan (`countRows` + `rateOf`), maxraj 0 → «—», markaz bekor qilgan dars alohida, bosh sahifa davomati shu funksiyadan; eski to'rt yo'l olib tashlandi | Qabul qilindi | 2026-10-17 |
| [0104](0104-hujjatni-bekor-qilish.md) | Hujjatni bekor qilish: qator o'chmaydi, raqam qayta berilmaydi, sabab majburiy, tarix bir tranzaksiyada; PDF berilmaydi, QR «bekor qilingan» deydi (ADR-0100 ni to'ldiradi) | Qabul qilindi | 2026-10-17 |
| [0105](0105-bot-hisoboti-oy-kohorti.md) | Bot hisoboti: tanlangan oyda to'xtatilgan odamlar kohorti, uch raqam faqat shu odamlar bo'yicha (foiz 100% dan oshmaydi), qator holati bitta funksiyadan (`classifyGateRow`), ro'yxat ham kohort, «Butun davr» yo'q | Qabul qilindi | 2026-10-17 |
| [0106](0106-kirish-sahifasida-til-tanlash.md) | Kirish sahifasida til tanlash: qobiq tilni cookie'dan o'qiydi, kirishda profil tili yutadi | Qabul qilindi | 2026-10-17 |
| [0107](0107-hujjat-berish-shartlari-qarz-dars-kech-qolish-sinov.md) | Hujjat berish shartlari: qarz yo'q, eng kam dars (20), kech qolish chegarasi (20%), yakuniy sinovlar topshirilgan; hammasi `participation-rules.ts` da, ikki yangi CEO sozlamasi, snapshotga chegaralar ixtiyoriy qo'shiladi (ADR-0100 ni kengaytiradi) | Qabul qilindi | 2026-10-17 |
| [0108](0108-auditoriya-hisoboti-jins-va-yosh.md) | «Auditoriya» hisoboti: hozir o'qiyotganlar jinsi va yoshi (kurs va filial kesimida), mavjud maydonlardan; noma'lum foizga kirmaydi va alohida ko'rsatiladi, 5 dan kam ma'lumotda foiz yo'q, yosh Toshkent kuni bilan bitta funksiyadan | Qabul qilindi | 2026-10-17 |
| [0109](0109-marketing-kanal-boyicha.md) | Marketing hisoboti kanal bo'yicha: marketing xarajati lid manbasiga bog'lanadi (`Expense.leadSourceId`, faqat MARKETING); kanal qatori = oydagi lid kohorti, 1 o'quvchi narxi = sarf ÷ to'lagan odamlar, samara = ularning to'lovi ÷ sarf; kanalsiz sarf «Hammasi»da, kanal qatorlarida emas | Qabul qilindi | 2026-10-18 |
| [0110](0110-lugat-alohida-chunk.md) | Lug'at sahifa payload'iga qo'shilmaydi: layout faqat tilni beradi, `I18nProvider` lug'atni `use()` bilan keshlangan, xeshli chunk'dan o'qiydi (server HTML tarjima qilingan holda chiqadi); yuklash xatosi 3 s keshda qolib error boundary'ga boradi | Qabul qilindi | 2026-10-18 |
| [0111](0111-dars-baholari-togri-anonim.md) | Dars baholari hisoboti to'liq anonim: o'quvchi ismi/id'si hech bir javobda yo'q, «Ko'rsatish» yo'q, bot «hech kimga ismingiz ko'rinmaydi» deydi; `studentId` faqat takrorni oldini olish uchun bazada | Qabul qilindi | 2026-10-18 |
| [0113](0113-faol-seanslar-royxati.md) | Faol seanslar ro'yxati: har kirish bitta `UserSession` qatori, token `sid` ko'taradi; bitta qurilmani o'chirish (qator + Redis belgisi), `sessionVersion` o'z o'rnida qoladi va ro'yxatni parol o'zgarganda o'zi tozalaydi; shahar yo'q, eski token birinchi refresh'da qator oladi | Qabul qilindi | 2026-10-18 |
| [0112](0112-xodim-oyligini-qolda-tuzatish.md) | Xodim oyligi tizim tomonidan hisoblanib taklif qilinadi, CEO esa oy uchun qo'lda summa kirita oladi; stavka o'zgarmaydi, oylik hisobi bitta funksiyadan chiqadi | Qabul qilindi | 2026-10-18 |
| [0114](0114-daf-kunlik-yigindi-hosila-jadval.md) | DaF kunlik yig'indisi hosila jadval `DafStudentDay`: asl yozuv `DafAttempt`, yagona yozuvchi `recordAttempt` (urinish va kunlik qator bitta tranzaksiyada, `ON CONFLICT` bilan oshirish), `groupKey` NULL emas, `fortschritt` va reyting faqat shu jadvaldan o'qiydi; qamrab oluvchi indeks qo'lda yozilgan migratsiyada | Qabul qilindi | 2026-10-18 |
| [0115](0115-daf-nishon-qaytarilmas-maqsad-asl-tanlov.md) | DaF kunlik maqsad `DafStudentSetting` — asl tanlov (bitta qator, `upsert`, ballar kodda); nishon `DafStudentBadge` — bir marta beriladi, olib qo'yilmaydi, yagona yozuvchi `grantBadges` (`ON CONFLICT DO NOTHING RETURNING`), faqat seans oxirida; bir martalik berish skripti | Qabul qilindi | 2026-10-18 |
| [0116](0116-daf-liga-faqat-kotarilish-haftalik-xona.md) | DaF haftalik liga: 5 doimiy daraja (`DafStudentLeague`, faqat o'sadi), haftalik xona (`DafLeagueRoom`/`DafLeagueEntry`), ko'tarilish — birinchi 5, ≥ 50 ball, xona ≥ 15; `settleWeek` takrorlanuvchi, kompaniya advisory qulfi, `joinRoom` da 2 s `lock_timeout`; guruhlar jadvali — a'zolar o'rtachasi (`DafGroupWeek`) | Qabul qilindi | 2026-10-18 |
| [0117](0117-daf-telegram-eslatma-darhol-royxat.md) | DaF Telegram eslatmasi (19:30, du–sha) va dushanba xulosasi (09:00, tayyorlik + 10–18 qayta urinish) ADR-0025 ning «darhol» ro'yxatida, `SmsService` orqali; uzilgan chat o'tkaziladi (ADR-0066 istisnosi); `DafReminderLog` yuborishdan oldin egallanadi (`ON CONFLICT DO NOTHING RETURNING`), `FAILED` qayta urinilmaydi; `remindersEnabled` — yagona yozuvchi; `DAF_ESLATMALAR` off/log/on | Qabul qilindi | 2026-10-19 |
| [0118](0118-guruh-ochilganda-oylik-hisob-yoziladi.md) | Guruh ochilganda (FORMING/PAUSED → ACTIVE) uning ACTIVE o'quvchilariga joriy oy hisobi shu tranzaksiyada yoziladi (`chargeActivatedGroup`); xato yutilmaydi — hisob yozilmasa guruh ochilmaydi; avtomatik 00:05 faollashtirishni 04:00 qorovul yopadi | Qabul qilindi | 2026-10-21 |
| [0119](0119-guruh-pauzasi-pul-qaytadi.md) | Guruh pauzasi markaz qarori: `GroupPause` davri (qo'lda va filial kaskadi); har kecha pauzada o'tmagan dars ADR-0053 yo'li bilan avtomatik bekor qilinib, puli qaytadi; pauza paytida chiqqan o'quvchiga `CENTER_INITIATIVE` (6.2 yo'q), 6.2 ulushi pauza kunlarini sanamaydi; qaytishda hisob guruh qaytgan kundan (`chargeStartDate`); pauza va qaytish xabari o'quvchiga darhol | Qabul qilindi | 2026-10-23 |
| [0120](0120-oquvchi-portalida-til-qurilmada.md) | O'quvchi portalida til faqat qurilmada (`daf-locale` cookie, `setLocale(…, { save: false })`, `LocaleSync` yo'q, server maydoni yo'q); Lumio `LanguagePicker` (Sozlamalar) va kirish sahifasida `<select>`; o'quv kontenti ma'lumot — `t()` dan o'tmaydi; `/portal/*` har so'rovda render qilinadi | Qabul qilindi | 2026-10-24 |
| [0121](0121-darajani-aniqlash-boti-savollar-havzasi.md) | Botdagi «Darajani aniqlash»: 200 savolli qo'lda yozilgan havza (A1–B2), urinishda hamma 4 darajadan 20 ta tasodifiy savol (avval ko'rilmaganlari), natija `judge` (daraja uchun 5 dan 4), `LevelTestAttempt`; telefon (faqat o'z kontakti) va botning filial so'rashidan keyin lid, `LeadsService`siz | Qabul qilindi | 2026-10-24 |
| [0122](0122-daraja-testi-natijalari-oquvchi-va-statistika.md) | Daraja testi natijalari: urinish boshlanganda yoziladi (holatlar, tashlab ketilgan = 1 soatdan eski `IN_PROGRESS`), «Natijani bilish» bilan o'rtada to'xtatish, bitta kartali chat — o'quvchiga bog'lanadi (lidsiz), profilda «Guruhlar» yorlig'ida blok, «Bot hisoboti»da oylik statistika | Qabul qilindi | 2026-10-24 |
| [0123](0123-meta-lead-ads-webhook.md) | Instagram/Facebook reklama formasidagi lidlar `POST /webhooks/meta-leads` orqali bitta env bo'limiga tushadi; imzo tekshiriladi, `Lead.metaLeadId` unique takrorni to'xtatadi | Qabul qilindi | 2026-10-24 |
| [0124](0124-daf-ustoz-musobaqa-korinishi-faqat-oqiydi.md) | DaF ustoz ko'rinishi: guruh sahifasida «Musobaqa» tabi (`GET /groups/:id/musobaqa`), yangi jadval yo'q — S1–S3 hisoblaridan o'qiydi; guruh o'rni joriy haftada `guruhlarYigindisi`, o'tgan haftada `DafGroupWeek`; «mashq qilmadi» jami ball bo'yicha; huquq `assertCallerMayTouchGroup`; bir vaqtdagi so'rovlar markaz jadvalini bitta o'qishga birlashtiradi (`yigindi()`, keshsiz) | Qabul qilindi | 2026-10-20 |
| [0125](0125-lernen-korinish-oquvchi-hisobida-tanlanadi.md) | Ta'lim ko'rinishini o'quvchi hisobida tanlaydi (`Student.lernenTema`, 4 tema id, hozircha 1 tayyor); temalar faqat ko'rinish qatlami, mantiq bitta; ovoz/kam harakat qurilmada (`localStorage`); Web Audio sintezi; `gsap` faqat lernen'da lazy; Dafi — 2D bosh; 3D va AI yo'llari rad etildi | Qabul qilindi | 2026-10-24 |
| [0126](0126-vaziyat-asosidagi-kontent-oqish-matni-va-gap-sahnasi.md) | Kontent vaziyat asosida quriladi: o'qish matni (`LESEN_WAHL`), e'lon (`ANSAGE`) va gap sahnasi; Netzwerk topshiriqlari ko'chirilmaydi, onlayn shaklga moslanadi | Qabul qilindi | 2026-10-17 |
| [0127](0127-daraja-testi-taklifi-bir-martalik-yuborish.md) | «Darajani aniqlash» taklifi botdan foydalana oladigan hammaga BIR marta: auditoriya (hamma holatdagi o'quvchilar + kanal tekshiruvidagi odamlar, xodimlarsiz), `LevelTestInvite` yuborishdan oldin egallanadi, `LEVEL_TEST_INVITE` off/log/on va sana, cron 20:00 | Qabul qilindi | 2026-10-25 |
| [0128](0128-lernen-mashq-natija-tema-orinlari-yumshoq-xato.md) | Ta'lim mashq va natija ekrani: `LernenTema` ga `MukofotFoni` va `UnitLavha`; xato javob yumshoq (amber «Deyarli!», qizil yo'q); natija bayrami faqat server o'tdi deganda (yakuniy sinov); javob ovozi server hukmidan; «Kam harakat» fade/stagger/shake ga ham | Qabul qilindi | 2026-10-25 |
| [0129](0129-oquvchilar-chati-telegram-xabari-darhol.md) | O'quvchilar chatida «yangi xabar» Telegram xabari darhol (ADR-0025 ning «darhol» ro'yxatiga): `SmsService.sendToStudent`, mazmunsiz, bir suhbatdan o'qilmaguncha bitta, 22:00–08:00 da ushlanib 08:00 da, `web_app` tugmasi Mini App chatiga | Qabul qilindi | 2026-10-26 |
| [0130](0130-soliq-va-komissiyalar-sof-foydada.md) | Soliq va komissiyalar sof foydadan ayriladi: stavkalar `Setting` da oydan kuchga kiradigan ro'yxat (kodda yo'q), kanallar xaritasi `feeChannelOf`, yangi `QR` usuli, komissiya to'lov oyiga va ijtimoiy soliq oylik oyiga, `rasmiy = min(officialSalary, hisoblangan oylik)`, hisob bitta joyda `TaxCostsService`, kesh `v6`, `settings.tax` (faqat CEO); dividend 2-bosqichda | Qisman almashtirildi — ADR-0139 (bank xarajati va rasmiy oylik qismi) | 2026-10-25 |
| [0131](0131-oquvchi-sozlamalari-ochiladigan-royxat-modal-misol-qurilmalar.md) | O'quvchi sozlamalari: Til va Mavzu loyihaning o'z `Select` ida, «Ta'lim ko'rinishi» va «Kam harakat» haqiqiy misolli modal (tayyor bo'lmagan ko'rinishlar «Tez orada» bilan ko'rinadi, ADR-0125 ning shu qoidasini almashtiradi), alohida «Ulangan qurilmalar» sahifasi (`/users/sessions`), kirill sarlavhalari Rubik shriftida | Qabul qilindi | 2026-10-26 |
| [0132](0132-lernen-ormon-tema-sahna-va-joy-orinlari.md) | Ta'lim «O'rmon» temasi: `LernenTema` ga `UnitJoyi`, `Sahna`, `Miniatyura`; sahnani sahifa `SahnaRamka` da chizadi (fixed, yon paneldan chiqib, yuklanayotganda ham); biom unit tartibidan; faqat transform/opacity, bitta rAF, yashirin/ekrandan tashqarida pauza, zaif qurilmada yarmi, ≤ 1500 element; sahna ustida `backdrop-filter` yo'q, hujjatda bitta sahna; sahnadagi umumiy matn parda ustida | Qabul qilindi | 2026-10-26 |
| [0133](0133-lernen-dengiz-tema-arzon-sahna-va-umumiy-qismlar.md) | Ta'lim «Dengiz» temasi: skrollga ergashuvchi yagona qatlam — chetdagi ikki tor qoya tasmasi, sahnada `filter` va `mix-blend-mode` yo'q (qulflangan belgining `grayscale` sinfidan tashqari), ≤ 300 element; zona unit tartibidan, chuqurlik lavhada qotgan belgi; tugun, joy kartasi, mukofot foni va sof yordamchilar sahnali temalar uchun umumiy (`sahna-qismlari`, `sahna-umumiy`); noma'lum dars turi birinchi joyni oladi; CSS skaneri ikkala temani qo'riqlaydi; unumdorlik chegarasi va o'lchovi protsessor 4× da (boshsiz brauzer; haqiqiy telefon tekshirilmagan) | Qabul qilindi | 2026-10-27 |
| [0134](0134-chat-javob-tahrirlash-bitta-telegram-xabari.md) | Chat: xabarga javob (`replyToId`), o'z matnini 3 soat ichida tahrirlash (birinchi matn CEO uchun saqlanadi), Telegram'da bir o'qilmagan davr uchun bitta tahrirlanuvchi xabar (2 daqiqa faol bo'lsa jim, 10 daqiqa ichida jiringlamaydi) | Qabul qilindi | 2026-10-27 |
| [0135](0135-bekor-qilingan-darsni-bir-qadamda-kochirish.md) | Bekor qilingan darsni bir qadamda ko'chirish: `POST /lesson-cancellations/:id/reschedule` bitta Serializable tranzaksiyada bekor qilishni qaytarib oladi (pul qayta yechiladi, ADR-0063) va darsni ko'chiradi (`createWithin`, «Dars bo'ldimi?» ga javob); voqealar commitdan keyin; ruxsat `lessons.change` (Administrator ham), `lessons.change-delete` emas; «Dars o'zgarishlari» ⋯ menyusida «Boshqa kunga ko'chirish» | Qabul qilindi | 2026-10-27 |
| [0136](0136-jang-asinxron-ruh.md) | Jang: raqib — boshqa o'quvchining avvalgi tugagan jangi («ruh»), mos ruh yo'q yoki har 3-jang bo'lsa ochiq Dafi bot; liga balli yo'q, kuniga 5 jang; alohida unitga bog'liq savol bazasi (`DRAFT` → CEO tasdiqlaydi); vaqtni server o'lchaydi (`KIRISH_MS` 3 s, `JAVOB_KORISH_MS` 1,5 s mijoz bilan bir xil); `JANG_10/50/100` nishonlari; `DAF_JANG` bilan bosqichli yoqish | Qabul qilindi | 2026-10-27 |
| [0137](0137-guruh-almashganda-kun-bir-marta-hisoblanadi.md) | Guruh almashganda o'tkazish kuni bir marta hisoblanadi: yangi guruh hisobi eski guruh ketgan kunigacha qoplagan kunlarni olmaydi (faqat ketgan kungacha, 6.2 bo'yicha pul qolganda keyingi kunlar emas); eski ma'lumot alohida tuzatiladi | Qabul qilindi | 2026-10-28 |
| [0138](0138-bugungi-dars-tugagan-bolsa-oquvchidan-sorash.md) | Bugungi dars tugagan bo'lsa, guruhga qo'shishda «o'quvchi unda bo'ldimi?» deb so'raladi (admin oynasi, lid aylantirish, so'rovni tasdiqlash; o'tkazish ham): «Yo'q» boshlanishni keyingi dars kuniga suradi; javobsiz 400, jim standart yo'q; bitta sof qoida `todayLessonQuestion` | Qabul qilindi | 2026-10-28 |
| [0139](0139-oyni-yopish-bank-va-ijtimoiy-soliq.md) | Oyni yopish: bank xarajati har oy har bank hisobi uchun qo'lda kiritiladi (`BANK_FEES` xarajati, shu hisobdan chiqim), ijtimoiy soliq faqat bankdan berilgan oylikdan; `User.officialSalary` va bank pog'onalari olib tashlandi; oyni qulflash yo'q, byudjetga to'lov qoldiqni o'zgartirmaydi, `CARD` hisob soliqqa kirmaydi | Qabul qilindi | 2026-10-28 |
| [0140](0140-ketishda-hisob-zanjir-boyicha-topiladi.md) | Ketishda oy hisobi yozilishlar zanjiri bo'yicha topiladi: qayta qo'shilgan yozilishning o'z hisobi bo'lmasa, `loadDepartureInput` oldingi yozilishning hisobidan o'tmagan kunlarni qaytaradi (jim `null` o'rniga); ledger metadatasiga `chargeEnrollmentId`; qaytarish, dialoglar va cascade bitta joydan | Qabul qilindi | 2026-10-30 |
| [0141](0141-aloqa-markazi-darsga-qoyilmayotganlar-tabi.md) | Aloqa markazi «Darsga qo'yilmayotganlar» tabi: to'lamagani uchun davomatga qo'yilmaydigan, lekin hali guruhda turgan qarzdor o'quvchilar (ustoz davomat olgan kunlarda o'ziga belgi yo'q); sof qoida `unmarkedLessonDays`; amallari — qo'ng'iroq va guruhdan chiqarish (pul 6.2 bo'yicha), qarz kechirilmaydi; statistikada `blockedFromLessons`, «e'tibor» raqamiga kirmaydi | Qabul qilindi | 2026-10-30 |
| [0142](0142-davomat-olib-bolmagan-darslar-pauza-va-qaytish.md) | To'lov yo'qligi uchun davomat olib bo'lmagan darslar: profilda binafsha nuqta, yumshoq xabarlar (summasiz), ketma-ket 3 darsdan keyin pauza va belgilab bo'lmagan kunlarni hisobdan chiqarish, qaytishda admin kelgan kunlarni belgilaydi; shartnoma matni o'zgarmaydi, markaz 3.2 dagi huquqidan voz kechadi (CEO); yetti mustaqil katak `absence.barred.*` | Qisman almashtirildi ([0143](0143-kech-tolov-keldi-ustozga-haq-yoq.md)) | 2026-10-30 |
| [0143](0143-kech-tolov-keldi-ustozga-haq-yoq.md) | Kech to'lov: to'lov yetgan davomatsiz darslar to'lov paytida «Keldi» bo'ladi (`teacherPayWaived`), ustozga haq yozilmaydi, pul markazda; davomat olib bo'lmagan dars ham to'lanadi, ADR-0142 dagi hisobdan chiqarish va qaytish oynasi olib tashlandi | Qabul qilindi | 2026-10-31 |

> 0001–0007 **retroaktiv** yozilgan (2026-08-19): qarorlar o'sha sanalarda amalda qabul qilingan, ADR keyinroq rasmiylashtirilgan. Sana ustunida qaror sanasi turadi, yozilgan sana emas.

> **ADR-0010 indeksda yo'q, chunki fayli repoda yo'q.** U 2026-08-24 da Videothek ishi bilan yozilgan («Videothek darajani pleylistdan meros oladi, transkript qurilmaydi»), lekin o'sha shox `main` ga qo'shilmagan. ADR-0011 ning «Bog'liq» qatori va `docs/superpowers/specs/2026-08-25-daf-learning-system-design.md` unga havola qiladi. Qabul qilingan ADR tahrirlanmagani uchun ADR-0011 dagi havola o'z joyida qoldirildi. 0010 raqami band, qayta ishlatilmaydi.
