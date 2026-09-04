# To'lov tizimi — qaror savollari

`docs/tolov-tizimi-savollari.pdf` — to'ldiriladigan hujjat.
14 sahifa, 28 savol, 30 ta maydon.

## Qayta yaratish

```
python3 docs/tolov-savollari/make_pdf.py docs/tolov-tizimi-savollari.pdf
```

`questions.py` — savollar, misollar, variantlar.
`make_pdf.py` — sahifa tuzilishi.
`ttf/` — Newsreader va DM Sans (CV manbasidan olingan, woff2 dan o'girilgan).

## Dizayn

CV bilan bir xil: qog'oz `#FAF9F5`, siyoh `#1A1915`, urg'u `#B4532F`,
sarlavhalar Newsreader, matn DM Sans. Har bo'lim yangi sahifadan.

`ʻ` (U+02BB) shriftlarda yo'q, shuning uchun matnda oddiy apostrof
ishlatiladi (`to'lov`). Forma maydonlari Helvetica'da — reportlab AcroForm
faqat standart shriftlarni qabul qiladi.

## Raqamlar

Kurs narxlari va sanoqlar prod bazadan faqat-o'qish so'rovlari bilan
olingan. Narxlar o'zgarsa `questions.py` dagi `PRICES` va `FACTS`
yangilanadi va hujjat qayta yaratiladi.
