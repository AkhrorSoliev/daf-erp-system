# -*- coding: utf-8 -*-
"""To'lov tizimi — qaror savollari. Mazmun.

`refs` — shartnomaning bandiga havola: (yorliq, shartnoma sahifasi).
Sahifa raqami `shartnoma.pdf` ning O'Z ichidagi raqami (1..5); yakuniy
hujjatdagi o'rni `make_pdf.py` da hisoblanadi.
"""

LEAD = [
    "Bu hujjat to'lov va ustoz haqi bo'yicha qarorlarni bir joyga yig'adi.",
    "Har savolda qisqa misol va tanlov variantlari bor. Tanlaganingizni katakchaga yozing.",
    "Variantlar to'g'ri kelmasa, o'z javobingizni yozing.",
    "Oxirgi bo'limda o'quvchilar bilan tuziladigan shartnoma keltirilgan.",
]

PRICES = [
    ["Kurs", "Narx", "Darslar"],
    ["Intensive", "740 000", "20"],
    ["KKB Vorbereitung", "600 000", "19"],
    ["Standart B2", "500 000", "12"],
    ["Vorbereitung", "500 000", "12"],
    ["Standart B1", "475 000", "12"],
    ["Standart A2", "450 000", "12"],
    ["Standart", "450 000", "12"],
    ["B1 Telc", "400 000", "12"],
]

FACTS = [
    "Ustozning haqi kurs narxidan kelib chiqib belgilanadi. Tizimda uni har kurs "
    "uchun alohida, kerak bo'lsa alohida ustoz uchun ham qo'yish mumkin bo'ladi.",
    "Markazda 370 o'quvchi, 47 guruh, 14 ustoz, 2 filial.",
]

SECTIONS = [
    {
        "n": 2, "title": "Ustoz haqi",
        "questions": [
            {
                "q": "Oyda dars soni o'zgarsa, ustozning oyligi o'zgarsinmi?",
                "ex": "Sentabrda guruhda 13 ta dars bo'ldi, oktabrda 14 ta. "
                      "O'quvchi ikkala oyda ham 450 000 to'laydi.",
                "opts": [
                    "Ustoz ikkala oyda ham bir xil olsin",
                    "Ustoz 14 darslik oyda ko'proq olsin",
                ],
            },
            {
                "q": "Ustoz davomatni kech kiritsa, haqi yozilaveradimi?",
                "ex": "Ustoz sentabr darslarining davomatini noyabrda kiritdi. "
                      "Sentabr oyligi allaqachon berib bo'lingan.",
                "opts": [
                    "Yozilaversin — qachon kiritilishidan qat'i nazar",
                    "Oy yopilgandan keyin faqat direktor ruxsati bilan",
                    "Muddat belgilansin: dars kunidan _____ kun ichida",
                ],
            },
            {
                "q": "Ustoz oy o'rtasida ishdan ketsa, oyligi qanday hisoblansin?",
                "ex": "Oyiga 3 000 000 oladigan ustoz 15-oktabrda ishdan ketdi. "
                      "Oktabrning yarmini ishlagan.",
                "opts": [
                    "Ishlagan kunlariga qarab — taxminan 1 500 000",
                    "To'liq oylik — 3 000 000",
                    "Har holat alohida hal qilinsin",
                ],
            },
        ],
    },
    {
        "n": 3, "title": "O'quvchining puli",
        "questions": [
            {
                "q": "Kelmay qo'ygan o'quvchining puli qancha kutsin?",
                "ex": "O'quvchi uch oydan beri kelmayapti — muzlatilgan yoki shunchaki "
                      "yo'qolgan. Balansida 180 000 so'm turibdi.",
                "opts": [
                    "Cheksiz kutsin — o'quvchi kelib so'raguncha",
                    "_____ oydan keyin alohida ro'yxatda chiqsin, qarorni markaz qabul qilsin",
                    "_____ oydan keyin o'quvchiga xabar berilsin, javob bo'lmasa markaz hisobiga o'tsin",
                ],
            },
            {
                "q": "Pulni markaz hisobiga o'tkazishga kim qaror qilsin?",
                "ex": "O'quvchining 180 000 so'mi markaz daromadiga yoziladi. "
                      "Bu qaytarib bo'lmaydigan amal.",
                "opts": ["Faqat direktor", "Direktor va filial direktori", "Administrator ham"],
            },
            {
                "q": "Oy o'rtasida ketgan o'quvchiga pul qaytarilsinmi?",
                "ex": "O'quvchi oktabr uchun 450 000 to'lagan. 20-oktabrda guruhdan chiqdi. "
                      "Oyning o'n kuni qolgan edi.",
                "opts": [
                    "O'tmagan darslar puli qaytarilsin",
                    "Qaytarilmasin — oy to'liq hisoblansin",
                    "Qaytarilsin, lekin _____ % ushlab qolinsin",
                ],
            },
            {
                "q": "Uzrli sabab bilan kelmagan darsi uchun nima berilsin?",
                "ex": "O'quvchi kasal bo'lib ikki darsga kelmadi va buni oldindan aytdi.",
                "opts": [
                    "Keyingi oy to'lovi ikki dars miqdorida kamaysin",
                    "Ikki dars puli balansiga qaytarilsin",
                    "Hech narsa berilmasin — uzrli dars ham to'lanadi",
                ],
            },
            {
                "q": "Uzrli darslarga oylik chegara bo'lsinmi?",
                "ex": "O'quvchi bir oyda o'n darsdan sakkiztasini uzrli qildi. "
                      "Keyingi oyni deyarli bepul o'qiydi.",
                "opts": [
                    "Chegara bo'lmasin",
                    "Oyiga eng ko'pi _____ ta dars",
                    "Faqat shifokor ma'lumotnomasi bilan qabul qilinsin",
                ],
            },
            {
                "q": "Undirib bo'lmagan qarz qachon hisobdan chiqarilsin?",
                "ex": "O'quvchi sakkiz oydan beri yo'q, telefoni o'chiq. Qarzi 600 000 so'm.",
                "opts": [
                    "_____ oydan keyin hisobdan chiqarilsin",
                    "Har holat alohida ko'rilsin",
                    "Hisobda qolaversin",
                ],
            },
        ],
    },
    {
        "n": 4, "title": "Darslar va kalendar",
        "questions": [
            {
                "q": "Bayram tufayli dars bo'lmasa nima qilinsin?",
                "ex": "Bayram kuni guruhning darsi bo'lmadi. O'quvchi o'sha oy uchun "
                      "to'liq to'lagan.",
                "opts": [
                    "Dars shu oy ichida boshqa kunga ko'chirilsin",
                    "Guruhning tugash sanasi bir dars kechiktirilsin",
                    "O'sha darsning puli o'quvchiga qaytarilsin",
                ],
            },
            {
                "q": "Ko'chirilgan darsga o'quvchi kela olmasa nima bo'lsin?",
                "ex": "Ustoz kasal bo'lib payshanba darsi o'tilmadi va shanbaga "
                      "ko'chirildi. Uch o'quvchi shanbada band.",
                "opts": [
                    "Ular uchun uzrli deb belgilansin va o'sha dars puli qaytarilsin",
                    "Dars o'tilgan hisoblansin — puli qaytarilmasin",
                    "Ko'chirish faqat hamma kela oladigan kunga qilinsin, aks holda dars o'tilmasin",
                ],
            },
            {
                "q": "Bir oyda dars kunlari ko'p yoki kam bo'lsa, to'lov o'zgarsinmi?",
                "ex": "Sentabrda guruhda 13 ta dars, oktabrda 14 ta dars bor. "
                      "Kurs narxi ikkalasida ham 450 000.",
                "opts": [
                    "To'lov o'zgarmasin — oylik narx qat'iy",
                    "Dars soniga qarab o'zgarsin — 14 darslik oy qimmatroq",
                ],
            },
            {
                "q": "O'quvchi oy o'rtasida boshqa kursga o'tsa, to'lov qanday hisoblansin?",
                "ex": "O'quvchi 15-oktabrda A1 dan A2 ga o'tdi. A1 — 450 000, "
                      "A2 — 500 000. Oktabr uchun 450 000 to'lab bo'lgan edi.",
                "opts": [
                    "Kunlarga bo'lib hisoblansin — yarim oy eski, yarim oy yangi narxda",
                    "Butun oktabr eski kurs narxida qolsin, yangi narx noyabrdan",
                    "Butun oktabr yangi kurs narxida hisoblansin",
                ],
            },
        ],
    },
    {
        "n": 5, "title": "Muzlatish",
        "questions": [
            {
                "q": "O'quvchi muzlatilganda puli nima bo'lsin?",
                "ex": "O'quvchi 10-oktabrda muzlatildi. Oktabrning sakkiz darsi "
                      "o'tilmay qolgan edi.",
                "opts": [
                    "O'tmagan darslar puli balansiga qaytarilsin va kutib tursin",
                    "Pul hisobda qolsin, qaytarilmasin",
                ],
            },
            {
                "q": "Muzlatishdan qaytgandan keyin oyning qolgani uchun pul olinsinmi?",
                "ex": "O'quvchi 10-oktabrda muzlatildi — o'tilmagan sakkiz dars puli "
                      "balansiga qaytdi. 20-oktabrda qaytib keldi, oktabrning to'rt darsi qoldi.",
                "opts": [
                    "Faqat qolgan to'rt dars uchun olinsin, ortig'i balansda tursin",
                    "Butun oy uchun to'liq olinsin",
                ],
            },
        ],
    },
    {
        "n": 6, "title": "Chegirma",
        "questions": [
            {
                "q": "Chegirmali o'quvchi uchun ustozning haqi kamaysinmi?",
                "ex": "O'quvchiga 50% chegirma berildi — u 450 000 o'rniga 225 000 to'laydi. "
                      "Ustozning haqi qaysi summadan hisoblansin?",
                "opts": [
                    "To'liq narxdan — chegirmani markaz ko'taradi",
                    "Chegirmali narxdan — ustoz ham kamroq oladi",
                    "Yarmi-yarmi bo'linsin",
                ],
            },
            {
                "q": "Butunlay bepul o'qiydigan o'quvchi bo'lishi mumkinmi?",
                "ex": "Bir o'quvchiga 100% chegirma berildi — u hech narsa to'lamaydi. "
                      "Ustoz esa u uchun ham dars o'tadi.",
                "opts": [
                    "Bo'lsin — ustozning haqini markaz o'z hisobidan to'laydi",
                    "Bo'lsin, lekin bunday o'quvchi uchun ustozga haq yozilmasin",
                    "Bo'lmasin — eng kamida _____ % to'lansin",
                ],
            },
        ],
    },
    {
        "n": 7, "title": "Ruxsatlar",
        "questions": [
            {
                "q": "Kurs narxini kim o'zgartira olsin?",
                "ex": "Standart kursining narxi 450 000 dan 500 000 ga oshirildi. "
                      "Bu 51 ta guruhning barchasiga tegadi.",
                "opts": ["Faqat direktor", "Direktor va filial direktori", "Administrator ham"],
            },
            {
                "q": "Pul qaytarishga summa chegarasi bo'lsinmi?",
                "ex": "Administrator o'quvchiga 800 000 so'm qaytardi.",
                "opts": [
                    "Chegara bo'lmasin",
                    "_____ so'mdan yuqorisi direktor tasdig'i bilan",
                    "Faqat direktor qaytara olsin",
                ],
            },
            {
                "q": "Oylik to'lovni bekor qilishga kim haqli bo'lsin?",
                "ex": "Bekor qilinganda o'quvchiga bir oylik pul qaytadi — 450 000 so'm.",
                "opts": ["Faqat direktor", "Direktor va filial direktori", "Administrator ham"],
            },
        ],
    },
    {
        "n": 8, "title": "Shartnoma bilan farqlar",
        "note": "Quyidagi joylarda shartnoma bir narsani, tizim boshqa narsani aytadi. "
                "Band raqamiga bosilsa shartnomaning o'sha yeriga o'tadi.",
        "questions": [
            {
                "q": "Uzrli dars qayta o'tilsinmi yoki puli qaytarilsinmi?",
                "ex": "Shartnoma: uzrli sabab bilan qoldirilgan darslar kelishuvga ko'ra "
                      "qayta o'tiladi. Tizim: uzrli dars puli o'quvchining balansiga qaytadi.",
                "refs": [("5.2", 3)],
                "opts": [
                    "Shartnomadagidek — dars qayta o'tilsin, pul qaytarilmasin",
                    "Tizimdagidek — pul qaytarilsin, shartnoma shunga moslansin",
                    "Ikkalasi ham bo'lsin — markaz holatga qarab tanlasin",
                ],
            },
            {
                "q": "Muzlatilganda kurs muddati uzaytirilsinmi yoki pul qaytarilsinmi?",
                "ex": "Shartnoma: 10 kundan ortiq kela olmasa kursni to'xtatib turish mumkin, "
                      "kurs muddati shunga uzaytiriladi. Tizim: o'tilmagan darslar puli "
                      "balansga qaytadi.",
                "refs": [("5.4", 3)],
                "opts": [
                    "Kurs muddati uzaytirilsin",
                    "Pul balansga qaytsin",
                    "O'quvchining o'zi tanlasin",
                ],
            },
            {
                "q": "Kursni tashlagan o'quvchidan 50% ushlab qolinsinmi?",
                "ex": "Shartnoma: kurs boshlangandan keyin o'quvchi o'zi to'xtatsa 50% "
                      "ushlab qolinadi, darslarning 30% dan ko'pi o'tilgan bo'lsa umuman "
                      "qaytarilmaydi. Tizim: faqat o'tilgan darslar puli ushlanadi, qolgani "
                      "to'liq qaytadi.",
                "refs": [("6.3.2", 3), ("6.3.3", 3)],
                "opts": [
                    "Shartnomadagidek — 50% ushlansin",
                    "Tizimdagidek — faqat o'tilgan darslar puli ushlansin",
                    "Boshqacha: _____ % ushlansin",
                ],
            },
            {
                "q": "To'lov muddati oyning 1-kunimi yoki 10-kuni?",
                "ex": "Shartnoma: keyingi oylik to'lovlar har oyning 10-sanasiga qadar "
                      "to'lanadi. Tizim: oyning birinchi kunidan qarz ko'rinadi.",
                "refs": [("3.2", 2)],
                "opts": [
                    "Qarz 1-kundan ko'rinsin, lekin 10-kungacha ogohlantirilmasin",
                    "Shartnomaga moslansin — qarz 10-kundan keyin sanalsin",
                    "Shartnoma o'zgartirilsin: to'lov oyning _____ -sanasigacha",
                ],
            },
            {
                "q": "Shartnomadagi narxlar tizimdagi narxlarga to'g'ri kelmaydi.",
                "ex": "Shartnoma: A1, A2, B1 — 400 000; B2 — 500 000; intensiv — 690 000. "
                      "Tizim: Standart 450 000, Standart A2 450 000, Standart B1 475 000, "
                      "Intensive 740 000.",
                "refs": [("3.2", 2), ("3.1", 1)],
                "opts": [
                    "Shartnomadagi narxlar yangilansin",
                    "Shartnomada narx umuman yozilmasin — 3.1-banddagidek e'lon qilingan narx amal qilsin",
                    "Tizim narxlari shartnomadagi narxlarga tushirilsin",
                ],
            },
            {
                "q": "Shartnoma bir oyda 12 dars deydi, kalendar oyda esa 13-14 bo'ladi.",
                "ex": "Shartnoma: «bir oyda o'tilishi kerak bo'lgan 12 ta dars». "
                      "Oylik to'lovda dars soni oyga qarab 12 dan 14 gacha o'zgaradi.",
                "refs": [("6.3.3", 3)],
                "opts": [
                    "Shartnomadan «12 ta dars» olib tashlansin — oy to'liq hisoblansin",
                    "Oyiga 12 tadan ortiq dars uchun to'lov olinmasin deb yozilsin",
                    "Har kursning oylik dars soni shartnomada alohida ko'rsatilsin",
                ],
            },
            {
                "q": "Uzrli dars uchun 24 soat va ma'lumotnoma talab qilinsinmi?",
                "ex": "Shartnoma: o'quvchi kamida 24 soat oldin xabar berishi shart, "
                      "kasallik tibbiy ma'lumotnoma bilan tasdiqlanadi. Tizim: uzrlini "
                      "administrator hech qanday shartsiz belgilay oladi.",
                "refs": [("4.3.5", 2), ("5.1", 3)],
                "opts": [
                    "Shartnomadagidek — 24 soat va ma'lumotnoma talab qilinsin",
                    "Oldindan xabar bersa yetarli, ma'lumotnoma shart emas",
                    "Har holatda administrator o'zi qaror qilsin",
                ],
            },
            {
                "q": "Markaz aybi bilan dars o'tilmasa, shartnomada hech narsa yozilmagan.",
                "ex": "Shartnomaning 5-bo'limi faqat o'quvchi qoldirgan darsni tartibga "
                      "soladi. Ustoz kelmagani yoki bayram tufayli o'tilmagan dars haqida "
                      "band yo'q.",
                "refs": [("5.1", 3), ("6.2.2", 3)],
                "opts": [
                    "Shartnomaga qo'shilsin: bunday dars boshqa kunga ko'chiriladi",
                    "Shartnomaga qo'shilsin: bunday darsning puli qaytariladi",
                    "Qo'shilmasin — hozirgicha qolsin",
                ],
            },
            {
                "q": "Narx oshganda 15 kun oldin xabar berish tizimda yo'q.",
                "ex": "Shartnoma: narxni oshirishdan kamida 15 kun oldin o'quvchi "
                      "xabardor qilinadi. Tizim: kurs narxi o'zgartirilsa o'sha zahoti "
                      "kuchga kiradi.",
                "refs": [("3.5", 2)],
                "opts": [
                    "Tizim narx o'zgarishini kelajak sanaga qo'yadigan qilinsin",
                    "Xabar berish qo'lda qilinaversin, tizim o'zgarmasin",
                    "Bu band shartnomadan olib tashlansin",
                ],
            },
        ],
    },
]

CLOSING = "Bu yerda ko'rilmagan, lekin siz muhim deb bilgan holatlarni yozing."

CONTRACT_LEAD = [
    "Quyida o'quvchilar bilan tuziladigan ommaviy oferta keltirilgan.",
    "8-bo'limdagi band raqamlari shu hujjatga havola qiladi.",
]
