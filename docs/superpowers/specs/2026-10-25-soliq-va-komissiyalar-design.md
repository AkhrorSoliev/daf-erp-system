# Soliq va komissiyalar sozlamasi — dizayn (1-bosqich)

**Sana:** 2026-10-25
**Holati:** Dizayn tasdiqlangan (CEO), ko'rikdagi 10 kamchilik tuzatildi
**Bog'liq:** ADR-0038, ADR-0094, `server/src/reports/reports-excel.helpers.ts` (`buildNetProfit`), `server/src/reports/reports-financial.service.ts` (`getPeriodOutflows`), `server/src/reports/net-profit-cache.ts`, `server/src/settings/settings.types.ts`, `server/src/payment-gateways/{payme,click}/*-methods.service.ts`

## Maqsad

Sof foyda hisobotida hozir yo'q bo'lgan xarajatlar (to'lov komissiyasi, oylik solig'i, aylanma solig'i, bank xarajati) qoidalari tizimga o'rnatiladi. Stavkalarni kodga yozmaymiz: ularni CEO yoki buxgalter sozlama sahifasida kiritadi. Stavka kiritilmaguncha hisobot buni yashirmaydi.

## Hozirgi holat

- `Setting` jadvali (kalit → JSON qiymat, kompaniya yoki filial darajasi) va `SETTING_DEFINITIONS` registri bor.
- `Payment.providerFee` / `providerFeePercent` bor, faqat qo'lda biriktirishda (`MANUAL_ATTACH`) to'ldiriladi.
- Payme va Click ulanishi to'lovni `source: GATEWAY_WEBHOOK` bilan yozadi. `STUDENT_PORTAL` kodda hech qayerda yozilmaydi.
- `buildNetProfit`: tushum − ustoz oyligi − admin oyligi − xarajat − qaytarish. Komissiya faqat «memo».
- Oylik to'lovida «rasmiy / naqd» belgisi yo'q.
- Bosh paneldagi foyda grafigi `net-profit-cache.ts` da bir kunga keshlanadi.

## Qoidalar (foydalanuvchi kiritgan ma'lumot)

1. To'lov komissiyasi: ilova orqali 2–2.5% (to'lov tizimiga qarab), integratsiya orqali (ID kiritilgan) 2.5%, QR-kod orqali 1%.
2. Rasmiy oylik: xodimdan 12% ushlanadi (xodim 88% oladi), korxona yana 12% ijtimoiy soliq to'laydi. 2 000 000 → xodim 1 760 000, korxona jami 2 240 000.
3. Naqd oylik: soliqsiz.
4. Hisob raqamga tushgan mablag'dan aylanma solig'i 4% (kelajakda 6% bo'lishi mumkin).
5. Bank xarajati hisob raqamdagi aylanmaga qarab.
6. Dividend (5% soliq, 1% bank, karta 0.5%, o'tkazma 0.5–0.8%) — 2-bosqich, bu spec'ga kirmaydi.

## Dizayn

### Ruxsat
Yangi ruxsat `settings.tax` (repo uslubi: `settings.payment`, `settings.archive`). Sukut bo'yicha faqat CEO'da. CEO buxgalterga «Ruxsatlar» sahifasidan beradi. Yangi rol qo'shilmaydi.

### Saqlash
Yangi kalitlar `SETTING_DEFINITIONS` ga qo'shiladi, hammasi `companyLevelOnly: true`.

Har stavka sanali ro'yxat: `[{ fromMonth: 'YYYY-MM', value }]`. Oy uchun `fromMonth <= oy` bo'lgan eng oxirgi qator olinadi. Stavka o'zgarsa eski oylar o'zgarmaydi. Qator bo'lmasa — «kiritilmagan». Ro'yxatning o'zi o'zgarishlar tarixi; har saqlash `entity-history` ga kim va qachon bilan yoziladi.

Kalitlar:
- `fees.app.payme`, `fees.app.click`, `fees.app.uzum`, `fees.integration`, `fees.qr` — foiz.
- `payroll.employeeWithholdingPercent`, `payroll.employerSocialPercent` — foiz.
- `tax.turnoverPercent` — foiz.
- `bank.turnoverTiers` — qatorlar `{ fromAmount, toAmount|null, percent }`; birinchi qator 0 dan boshlanadi, qatorlar kesishmaydi va orada bo'shliq qolmaydi, oxirgisi `toAmount: null`.

### Kanallar xaritasi
| Kanal | Qaysi to'lov | Stavka |
|---|---|---|
| Ilova orqali | usul PAYME / CLICK / UZUM, manba `ADMIN_MANUAL` (o'quvchi ilovada o'zi to'lagan, admin kiritgan) | `fees.app.<usul>` |
| Integratsiya (ID bilan) | manba `GATEWAY_WEBHOOK` | `fees.integration` |
| QR | yangi usul `QR` (o'quvchi bank QR-kodi orqali to'laydi, chekni adminga ko'rsatadi, admin «QR-kod» deb kiritadi) | `fees.qr` |
| Komissiyasiz | usul `CASH` yoki `TRANSFER` | — |

CEO aniqladi (25.10.2026): QR to'lov bankka tushadi, admin uni chek bo'yicha qo'lda kiritadi. Hozir bunday usul yo'q (`PaymentMethod`: CASH, PAYME, CLICK, UZUM, TRANSFER), shuning uchun:
- `PaymentMethod` ga `QR` qo'shiladi (migratsiya);
- «To'lov qabul qilish» oynasida «QR-kod» varianti paydo bo'ladi;
- usul yorlig'i bor hamma joyga (to'lovlar ro'yxati filtri, sharh, o'quvchi profili, mock imtihon statistikasi) «QR-kod» qo'shiladi;
- `QR` naqd emas: aylanmaga kiradi;
- eski `TRANSFER` to'lovlar o'zgarmaydi (komissiyasiz qoladi).

Xarita bitta funksiyada (`feeChannelOf`).

### Komissiya qanday hisoblanadi
Komissiya to'lov yozilganda saqlanmaydi; hisobot vaqtida sanali stavkadan hisoblanadi: `to'lov summasi × kanal stavkasi (to'lov oyi uchun)`. Shu sabab stavka keyin kiritilsa ham eski oylar to'g'ri chiqadi. Istisno: to'lovda `providerFee` qo'lda yoki ulanishdan kelgan bo'lsa, o'sha summa olinadi.

### Hisob asosi
Tushum o'tgan darslar bo'yicha qoladi (ADR-0038). Komissiya, aylanma solig'i va bank xarajati **pul tushgan oy** bo'yicha olinadi (`Payment.createdAt`, Toshkent vaqti). Ijtimoiy soliq oylik hisoblangan oy bo'yicha. Hisobotda shu farq izoh bilan yoziladi.

### Oylik: rasmiy va naqd
Xodim profilida yangi maydon «Rasmiy oylik summasi» (so'm, bo'sh = 0).

Oy uchun: `rasmiy = min(kiritilgan summa, shu oy hisoblangan oylik)`. Qolgan qism naqd.
- Korxona ijtimoiy solig'i = rasmiy × `employerSocialPercent`. Bu korxona xarajati, sof foydadan ayriladi.
- Xodimdan ushlanma = rasmiy × `employeeWithholdingPercent`. Bu korxona xarajati emas: hisoblangan oylik ichida.
- **Oylik to'lash ekrani** rasmiy qism uchun «Rasmiy qism · Budjetga · Xodim qo'liga» va korxona ijtimoiy solig'ini ko'rsatadi, shunda kassir xodimga ortiqcha bermaydi. Naqd + karta jami avvalgidek oylik summasiga teng: pul korxonadan baribir chiqadi (bir qismi budjetga). Budjetga to'lovni alohida yozish 1-bosqichga kirmaydi.

### Aylanma solig'i va bank xarajati
- Aylanma = pul tushgan oydagi COMPLETED to'lovlar, `CASH` dan tashqari, summa yalpi (komissiya ayirilmasdan).
- Aylanma solig'i = aylanma × `tax.turnoverPercent`.
- Bank xarajati = kompaniya aylanmasi tushgan `bank.turnoverTiers` qatori foizi × butun aylanma.
- **Filialga bo'lish:** bank xarajati kompaniya aylanmasidan hisoblanadi va filiallarga ularning aylanma ulushiga qarab bo'linadi. Aylanma solig'i va komissiya to'lovning o'z filialiga yoziladi.
- **Qaytarish:** pul qaytarilganda aylanma solig'i, komissiya va bank xarajati kamaymaydi (bank va to'lov tizimi qaytarmaydi).

### Hisobot
`buildNetProfit` ga qatorlar qo'shiladi: to'lov komissiyasi, ijtimoiy soliq, aylanma solig'i, bank xarajati. Komissiya «memo»dan chiqib, ayriladi (ADR yangilanadi).

`missingRates: string[]` — shu oyda **ishlatilgan**, lekin stavkasi kiritilmagan narsalar. Masalan, Uzum orqali shu oy to'lov bo'lmasa, Uzum stavkasi so'ralmaydi. Excel «Sof foyda» varag'i, Telegram hisoboti va bosh panel ro'yxat bo'sh bo'lmasa «hisob to'liq emas: …» belgisini chiqaradi. Kiritilmagan stavka 0 deb hisoblanadi, lekin belgisiz qolmaydi.

**Kesh:** `net-profit-cache.ts` versiyasi oshiriladi. Soliq sozlamasi saqlanganda kompaniyaning foyda keshi tozalanadi.

**Ikki marta sanash:** sahifada ogohlantirish chiqadi: «Avtomatik hisoblanadigan soliqlarni xarajatga qo'lda yozmang». Xarajatlar sahifasidagi «hali yozilmagan» belgisi (ADR-0094) aylanma solig'i stavkasi kiritilgan oyda «Soliqlar» uchun chiqmaydi.

### Sahifa
`/settings/tax` «Soliq va komissiyalar». Bo'limlar:
- To'lov komissiyasi
- Oylik
- Aylanma solig'i
- Bank xarajati

Tepada «To'ldirilgan: X/Y» ko'rinadi. Saqlash qatorma-qator bo'ladi. Pul o'zgarishlari uchun tasdiq so'raladi (to'lov sozlamalaridagi kabi).

### Tekshiruv
Server testlari:
- stavka tanlash (sanali, o'tgan oy uchun eski stavka);
- kanal xaritasi;
- kiritilmagan stavka faqat ishlatilgan kanal uchun;
- bank jadvali tekshiruvi va filialga bo'lish;
- `rasmiy = min(...)`;
- qaytarish soliqni kamaytirmasligi;
- `buildNetProfit` yangi qatorlar bilan;
- kesh tozalanishi.

Misol testi: rasmiy 2 000 000 → qo'lga 1 760 000, ijtimoiy soliq 240 000.

Klient testlari: sahifa holatlari, ruxsatsiz foydalanuvchi, oylik to'lash ekranidagi «Qo'lga / Budjetga».

## Chegaradan tashqari (2-bosqich)

Dividend. Buning uchun «hisob raqamdan yechish» yozuvi (yangi jadval va forma) kerak. Stavkalar: soliq 5%, bank 1%, karta 0.5%, o'tkazma 0.5–0.8%. Alohida spec va PR bo'ladi.

## Ochiq qaror

Yo'q.
