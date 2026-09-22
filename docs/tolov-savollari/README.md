# To'lov tizimi — qaror savollari

`docs/tolov-tizimi-savollari.pdf` — to'ldiriladigan hujjat.
20 sahifa (15 savolnoma + 5 shartnoma), 26 savol, 27 ta maydon.

## Qayta yaratish

```
python3 docs/tolov-savollari/make_pdf.py docs/tolov-tizimi-savollari.pdf
```

`questions.py` — savollar, misollar, variantlar.
`make_pdf.py` — sahifa tuzilishi, shartnomani qo'shish, havolalar.
`shartnoma.pdf` — ommaviy oferta, hujjatning oxiriga qo'shiladi.
`ttf/` — Newsreader va DM Sans (CV manbasidan olingan, woff2 dan o'girilgan).

## Shartnoma havolalari

7-bo'limdagi «Shartnoma 5.2» yorliqlari bosiladigan havola. `questions.py` da
har savolning `refs` maydoni `(band, shartnoma sahifasi)` juftliklarini
saqlaydi; sahifa raqami `shartnoma.pdf` ning o'z ichidagi raqami. Birlashtirilgan
hujjatdagi o'rni `make_pdf.py` da hisoblanadi, shuning uchun savolnoma
uzayganda havolalar o'zi to'g'rilanadi.

pypdf `/Dest` ga sahifa raqamini yozadi — bu faqat tashqi hujjatga havolada
to'g'ri. `make_pdf.py` uni sahifa obyektiga ko'rsatkichga almashtiradi, aks
holda ba'zi ko'ruvchilarda havola ishlamaydi.

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
