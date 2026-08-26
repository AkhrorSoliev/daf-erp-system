# ADR-0011 — O'quv o'zagi Goethe standartiga bog'lanadi, manbaga emas

**Holati:** Qabul qilindi
**Sana:** 2026-08-26
**Bog'liq:** ADR-0009, ADR-0010, `server/src/daf-content/`,
[dizayn hujjati](../superpowers/specs/2026-08-25-daf-learning-system-design.md),
[amalga oshirish rejasi](../superpowers/plans/2026-08-25-daf-content-harvest.md)

## Kontekst

O'quvchi portalida nemis tili materiali bor edi — Radio (26 efir) va Videothek
(900+ YouTube video) — lekin **ikkalasi ham faqat iste'mol qilinardi**.
O'quvchi ko'radi va tinglaydi, hech narsa yechmaydi, va tizim uning nimani
bilganini bilmaydi.

Talab: mashqli, imtihonga yo'naltirilgan, progress hisoblanadigan haqiqiy o'quv
dasturi. Birinchi manba — Deutsch im Blick (UT Austin, CC BY 4.0): 263 video,
1 843 lug'at yozuvi, 70 grammatika sahifasi.

Eng qimmat xato shu yerda bo'lishi mumkin edi: **ma'lumot modelini birinchi
manbaning shakliga qurish.** DiB'ning atamalari — `Kapitel`, `Webquest`,
`Sprache im Kontext` — sxemaga singib ketsa, keyin Netzwerk neu yoki boshqa
kitob qo'shilganda uni majburan o'sha qolipga tiqish kerak bo'lardi, yoki
sxemani buzish kerak bo'lardi. O'quvchilarimiz esa real hayotda Netzwerk neu
o'qiydi va Goethe imtihoniga topshiradi.

O'lchov qaror foydasiga ishladi: Goethe A1, A2 va B1 ning rasmiy Modellsatz
hujjatlarini ochib chiqqanda, **butun A1–B1 bo'ylab atigi ~10 ta topshiriq
formati aylanishi** ma'lum bo'ldi. Faqat matn qiyinlashadi, vaqt qisqaradi.
Ya'ni standart yopiq va cheklangan to'plam — uni to'liq qamrab olsa bo'ladi.
Shu bilan birga Goethe'ning mavzular inventari, Netzwerk neu ning boblari va
DiB'ning boblari **bir xil mavzular ustiga tushdi** — demak umumiy o'q
allaqachon mavjud va u bizniki emas, standartniki.

## Qaror

O'quv tizimining o'zagi **GER/Goethe standartidan** olinadi: `Daraja`,
`Ko'nikma`, `Mavzu`, `Kann-Beschreibung`, `Grammatika nuqtasi`, `Redemittel`,
`Leksema`. Har bir manba **adapter** orqali shu o'zakka moslashtiriladi.
Kontent va mashqlar o'zak tugunlariga bog'lanadi, manba bobiga emas.

Mashq turlari taksonomiyasi **Goethe imtihonining real formatlaridan**
chiqariladi, umumiy QTI standartidan emas. Ikki qatlam bo'ladi:
`PRUEFUNG` (imtihon formati) va `UEBUNG` (o'sha formatga olib boradigan
mashg'ulot). Har bir `UEBUNG` majburan kamida bitta `PRUEFUNG` formatiga
bog'lanadi.

Kontentning darajasi **deterministik** aniqlanadi: manbaning bob tartibi va
o'sha bobga biriktirilgan grammatika mavzularining eng yuqorisi. Ikki signal
bir-biridan ikki pog'onadan ortiq farq qilsa, yozuv o'qituvchi ko'rigiga
belgilanadi.

**Taqiqlanadi:**
- Manbaning atamasini (`Kapitel`, `Handlungsfeld`, `Webquest`) o'zak
  tiplariga kiritish. Agar yangi manba qo'shilganda `dataset.types.ts` ni
  o'zgartirish kerak bo'lsa — bu adapter o'z atamasini olib kirayotganining
  belgisi.
- Darajani LLM bilan yorliqlash. Qayta hisoblanganda bir xil natija chiqishi
  va har bir qarorni tushuntirib bera olish shart.
- Hech qaysi imtihon formatiga xizmat qilmaydigan mashqni tizimga kiritish.
- Tijorat darsliklari (Netzwerk neu, Hueber, Cornelsen) kontentini ko'chirish.
  Ular faqat struktura o'lchovi bo'ladi — format mualliflik huquqi bilan
  himoyalanmaydi, aniq matn himoyalanadi.

## Ko'rib chiqilgan muqobillar

**Kitob-markazli model.** Har manba o'z kursi, o'z boblari; o'quvchi kitob
tanlab ketma-ket yuradi. Eng oddiy va eng tez yo'l. Rad etildi: kontentni
aralashtirib bo'lmaydi, mashq qayta ishlatilmaydi, va «A1» har kitobda boshqa
narsani anglatadi. Bundan tashqari kitob-markazli ko'rinishni standart o'zak
ustida **yo'nalish sifatida** baribir yasash mumkin — teskarisi mumkin emas.

**Faqat teglangan mashq banki**, o'quv yo'lisiz. Rad etildi: A1 o'quvchisiga
ketma-ketlik kerak, va «A1 ni tugatdim» degan gapni ayta olmaydi. Bu ham
standart o'zak ustida **rejim sifatida** yasaladi.

**Mashq turlarini umumiy QTI standartidan olish.** Rad etildi: QTI texnik
interfeys taksonomiyasi, u imtihon topshirig'ining maqsadini bilmaydi. Goethe
formatlaridan chiqarilgan ro'yxat esa qisqaroq, aniqroq va o'quvchining
haqiqiy maqsadiga bevosita bog'langan.

**Darajani matn tahlili yoki LLM bilan aniqlash.** Rad etildi: takrorlanmaydi
va himoya qilib bo'lmaydi. Leksik profil faqat **chetga chiqqanni belgilash**
uchun qoldirildi, qaror qilish uchun emas.

## Oqibatlari

**Yutuq:** yangi manba qo'shish sxemani buzmaydi — faqat yangi adapter
yoziladi. Amalda tekshirildi: DiB va ZUM ikkalasi ham bitta `DafDataset`
shakliga tushdi. Daraja qarori tushuntiriladi: har bir bob uchun qaysi
grammatika kodi darajani ko'targani hisobotda ko'rinadi, va 5- hamda 8-bob
o'qituvchi ko'rigi uchun avtomatik belgilandi.

**Narx:** har manba uchun xaritalash ishi qo'lda bajariladi — kimdir «DiB ning
3-bobi qaysi kann-beschreibung'larni qoplaydi» degan qarorni qabul qilishi
kerak. Grammatika→daraja xaritasi ham qo'lda yoziladi (hozir 46 qator, har
biri Grimm Grammar sarlavhasi bilan izohlangan).

**Endi taqiqlangan:** o'zak tiplarini bitta manbaning ehtiyoji uchun
kengaytirish. Bunday ehtiyoj paydo bo'lsa, u adapterning ichida hal qilinadi.
