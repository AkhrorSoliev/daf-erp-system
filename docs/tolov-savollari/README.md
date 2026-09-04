# To'lov tizimi — qaror savollari

`docs/tolov-tizimi-savollari.pdf` — ma'muriyat to'ldiradigan hujjat.
13 sahifa, 35 savol, 72 ta to'ldiriladigan maydon.

## Qayta yaratish

```
python3 docs/tolov-savollari/make_pdf.py docs/tolov-tizimi-savollari.pdf
```

`questions.py` — mazmun (savollar, variantlar, hozirgi holat jadvallari).
`make_pdf.py` — sahifa tuzilishi va forma maydonlari.

## Raqamlar qayerdan

Hujjatdagi barcha narx, foiz va sanoq 2026-09 holatiga ko'ra PROD bazadan
faqat-o'qish so'rovlari bilan olingan:
- 9 ta aktiv kurs, narxlari va paket hajmi
- 19 ta aktiv ustoz stavkasi (6 foiz, 8 o'quvchi-boshiga, 5 qat'iy oylik)
- 370 aktiv o'quvchi, 47 guruh, 14 ustoz, 2 filial
- 3 ta chegirmali o'quvchi (50%, 50%, 35%)

Javoblar kelgach raqamlarni yangilab, hujjatni qayta yaratish kerak.

## Shrift haqida

Hujjat matni `Arial Unicode` bilan chiziladi — `oʻ`, `gʻ` kabi harflar
to'g'ri chiqadi. Forma maydonlari esa Helvetica'da: reportlab AcroForm
faqat standart 14 shriftni qabul qiladi. Amalda muammo emas — to'ldiruvchi
oddiy apostrof yozadi.
