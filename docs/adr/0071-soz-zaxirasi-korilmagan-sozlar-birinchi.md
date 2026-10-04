# ADR-0071 — A1 so'z zaxirasi: Goethe va Netzwerk so'zlari to'liq, dars ko'rilmagan so'zlarni birinchi so'raydi

**Holati:** Qabul qilindi
**Sana:** 2026-10-04
**Bog'liq:** ADR-0011, `server/src/daf/uebung/seans.ts` (`baueSeans`), `server/src/daf/uebung/uebung.service.ts` (`baueKandidaten`), `server/src/daf/daf-portal-read.service.ts` (`woerter`), `server/src/daf/inhalt/wortliste.validate.ts`, `docs/superpowers/specs/2026-10-04-a1-soz-zaxirasi-design.md`

## Kontekst

A1 kursi bo'limiga 8–12, unitga 50 asosiy so'z bilan qurilgan edi. Goethe A1
so'z ro'yxati faqat «bu so'z A1 darajasidami?» degan tekshiruvga ishlatilardi;
Netzwerk neu bilan so'zlar umuman solishtirilmagan. 03.10.2026 o'lchovi:
Goethe ro'yxatidagi 812 so'zdan 1–3-unitlar 169 tasini o'rgatgan, 643 tasi
hech qayerda yo'q; Netzwerk A1 lug'atidagi 1844 so'zdan 188 tasi bor. Qolgan
9 unitda 450 o'rin qolgan — Goethe'ning o'zi ham sig'mas edi.

CEO (03.10): ikkala kitob so'zlari ham A1 oxirida mashqlarda bo'lsin;
unitlar soni va mashqlar soni o'zgarmasin; o'quvchi qayta mashq qilsa,
qolgan so'zlari chiqsin.

## Qaror

1. **Bo'limning so'z zaxirasi darsdan katta bo'lishi mumkin.** Unit, dars va
   darsdagi savollar soni o'zgarmaydi. Bo'limga Goethe va Netzwerkning
   o'sha mavzudagi so'zlari kiradi; aniq byudjet (`wortliste` qoidasi)
   taqsimot rejasi bilan birga o'zgaradi.
2. **Dars ko'rilmagan so'zlarni birinchi so'raydi.** So'z ko'rilgan =
   o'quvchida `DafLexemeState` qatori bor. `baueSeans` tartibi: o'z bo'limi
   → ko'rilmagan so'z → format moyilligi. So'zsiz savollar (gap, ibora,
   dialog) ko'rilmagan so'z bilan teng turadi, faqat ko'rilgan so'zning
   savoli orqaga suriladi. Bu tartib, xilma-xillik qoidalari (format
   chegarasi, ketma-ketlik, `MIN_FORMATE`) o'zgarmaydi.
3. **Hisoblagich.** Unit sahifasi bo'limning «So'zlar: ko'rilgan / jami»
   sonini ko'rsatadi; server uni o'quvchining holatlaridan sanaydi
   (`woerter: { jami, gesehen }`). Dars birinchi o'tishda «bajarildi»
   bo'ladi; hisoblagich qayta mashqqa undaydi, yo'lni to'smaydi.
4. **Netzwerk ro'yxati repoga tushmaydi.** U tijorat darsligidan olingan
   (ADR-0011): faqat qamrovni o'lchash uchun, mahalliy nusxada. Repoda
   Goethe asosidagi qamrov tekshiruvi turadi.

## Ko'rib chiqilgan muqobillar

- **Bo'limga 15 yoki ≈28 so'z, hammasi bir o'tishda.** Darslar 25% yoki
  2,5 barobar uzayardi; CEO darslar soni va hajmi o'zgarmasligini xohladi.
- **Goethe 100% + Netzwerkdan faqat ≈80 so'z.** Darslar o'zgarmasdi, lekin
  A1 oxirida Netzwerkning yarmi mashqlarda bo'lmasdi.
- **Tasodifiy tanlov (hozirgidek), faqat zaxira katta.** Qayta o'tishlar bir
  xil so'zlarni qaytarishi mumkin edi; ko'rilmagan so'zga yetish kafolatsiz.

## Oqibatlar

- Birinchi o'tishda o'quvchi bo'limning hamma so'zini ko'rmaydi — bu
  ataylab: qolgani qayta mashqda va takrorlashda.
- Yakuniy sinov va o'tish darsi butun unitning ko'rilmagan so'zlarini
  birinchi oladi.
- Har yangi unit matni katta zaxira bilan yoziladi; ovoz va rasm narxi
  so'zlar soniga qarab oshadi (har unit uchun alohida ruxsat).
