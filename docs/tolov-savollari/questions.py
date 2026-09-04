# -*- coding: utf-8 -*-
"""To'lov tizimi — qaror savollari. Mazmun."""

LEAD = [
    "Bu hujjat to'lov va ustoz haqi bo'yicha qarorlarni bir joyga yig'adi.",
    "Har savolda qisqa misol va tanlov variantlari bor. Tanlaganingizni katakchaga yozing.",
    "Variantlar to'g'ri kelmasa, o'z javobingizni yozing.",
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
    "Ustozlarning haqi uch xil hisoblanadi: dars narxidan foiz, har o'quvchi uchun "
    "qat'iy summa, yoki qat'iy oylik.",
    "Ustozning haqi qaysi kursni o'qitishiga bog'liq emas — bitta ustoz barcha "
    "kurslarda bir xil oladi.",
    "Markazda 370 o'quvchi, 47 guruh, 14 ustoz, 2 filial.",
]

SECTIONS = [
    {
        "n": 2, "title": "Ustoz haqi",
        "note": "Ustozning haqi kurs narxidan kelib chiqib belgilanadi.",
        "questions": [
            {
                "q": "Har kurs uchun ustozning ulushi qancha bo'lsin?",
                "ex": "Har qatorga ustoz bir o'quvchi uchun bir oyda oladigan summani "
                      "yozing. Masalan Standart kursi 450 000 bo'lsa, ustoz ulushi "
                      "200 000.",
                "table": True,
            },
            {
                "q": "Ulush qat'iy summa bo'lsinmi yoki foiz?",
                "ex": "Kurs narxi oshsa: qat'iy summada ustozning haqi o'zgarmaydi, "
                      "foizda esa o'zi ham oshadi.",
                "opts": [
                    "Qat'iy summa — narx oshsa alohida qayta ko'riladi",
                    "Foiz — narx oshsa ustozning haqi ham avtomatik oshadi",
                ],
            },
            {
                "q": "Bir xil kursni o'qitadigan ustozlar bir xil olsinmi?",
                "ex": "Malika opa va Nodira opa ikkalasi ham Standart kursda dars beradi. "
                      "Malika opa besh yillik tajribali, Nodira opa yangi kelgan.",
                "opts": [
                    "Bir xil olsin",
                    "Tajriba darajalari belgilansin va haq shunga qarab farq qilsin",
                    "Har ustoz bilan alohida kelishilsin",
                ],
            },
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
                "q": "To'lamagan o'quvchi darsga kelsa, ustozga qachon to'lansin?",
                "ex": "O'quvchi oktabr uchun to'lamadi, lekin darslarga kelaverdi. "
                      "Ustoz o'z ishini qildi.",
                "opts": [
                    "Ustozga darhol to'lansin — markaz o'z hisobidan beradi, keyin o'quvchidan undiradi",
                    "O'quvchi to'lagandan keyin to'lansin",
                    "Darhol to'lansin, lekin markazning bir oylik chegarasi bo'lsin: _____ so'm",
                ],
            },
        ],
    },
    {
        "n": 3, "title": "O'quvchining puli",
        "questions": [
            {
                "q": "Kelmay qo'ygan o'quvchining puli qancha kutsin?",
                "ex": "O'quvchi uch oydan beri kelmayapti. Balansida 180 000 so'm bor. "
                      "Guruhdan hali chiqarilmagan.",
                "opts": [
                    "Cheksiz kutsin — o'quvchi kelib so'raguncha",
                    "_____ oydan keyin markaz hisobiga o'tkazilsin",
                    "_____ oydan keyin o'quvchiga xabar berilsin, javob bo'lmasa o'tkazilsin",
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
                "q": "To'lov qaysi kundan boshlab qarz sanalsin?",
                "ex": "Oyning birinchi kunida hamma o'quvchiga 450 000 hisoblanadi. "
                      "Ko'pchilik 5-10 kunlari to'laydi.",
                "opts": [
                    "Birinchi kundanoq qarz sanalsin",
                    "Oyning _____ -sanasidan keyin qarz sanalsin",
                ],
            },
            {
                "q": "Qarzi bor o'quvchi darsga kiritilsinmi?",
                "ex": "O'quvchi ikki oydan beri to'lamagan, qarzi 900 000 so'm. "
                      "Darslarga kelaveradi.",
                "opts": [
                    "Kiritilaversin",
                    "Qarzi _____ so'mdan oshsa kiritilmasin",
                    "Bir oy to'lamasa kiritilmasin",
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
                "q": "Ko'chirilgan kun ba'zi o'quvchilarga to'g'ri kelmasa?",
                "ex": "Bayram darsi shanba kuniga ko'chirildi. Uch o'quvchi shanbada band "
                      "va kela olmaydi.",
                "opts": [
                    "Ular uchun uzrli deb belgilansin",
                    "Oddiy kelmagan deb belgilansin",
                    "Ko'chirish faqat hamma kela oladigan kunga qilinsin",
                ],
            },
            {
                "q": "Ustoz kelmagani uchun dars bo'lmasa?",
                "ex": "Ustoz kasal bo'ldi, o'rinbosar topilmadi, dars o'tilmadi. "
                      "O'quvchi o'sha oy uchun to'lagan.",
                "opts": [
                    "Dars boshqa kunga ko'chirilsin",
                    "O'sha darsning puli o'quvchiga qaytarilsin",
                    "Ustozning haqidan ushlab qolinsin",
                ],
            },
            {
                "q": "Rejadagidan ortiq dars o'tilsa, qo'shimcha to'lov olinsinmi?",
                "ex": "Oyda o'n uch dars rejalashtirilgan edi, o'n to'rttasi o'tildi.",
                "opts": [
                    "Qo'shimcha to'lov olinmasin",
                    "Ortiqcha dars uchun qo'shimcha to'lov olinsin",
                ],
            },
            {
                "q": "Guruh oy o'rtasida tugasa, qolgan kunlar puli nima bo'lsin?",
                "ex": "Guruh 15-oktabrda kursni tamomladi. O'quvchi butun oktabr uchun "
                      "to'lagan edi.",
                "opts": [
                    "Qolgan kunlar puli qaytarilsin",
                    "Qaytarilmasin",
                    "Keyingi kursga o'tkazilsin",
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
                "q": "Muzlatishdan qaytganda oy qayta hisoblansinmi?",
                "ex": "O'quvchi 10-oktabrda muzlatilib, 15-oktabrda qaytdi. "
                      "Oktabrning yana besh darsi bor.",
                "opts": [
                    "Qolgan darslar uchun qayta hisoblansin",
                    "Oyning qolgani bepul bo'lsin",
                ],
            },
            {
                "q": "Muzlatilgan o'quvchining puli qancha kutsin?",
                "ex": "O'quvchi ikki oydan beri muzlatilgan. Balansida 250 000 so'm turibdi.",
                "opts": [
                    "_____ kundan keyin alohida ro'yxatda chiqsin",
                    "Cheksiz kutsin",
                ],
            },
        ],
    },
    {
        "n": 6, "title": "Chegirma",
        "questions": [
            {
                "q": "Chegirmani kim bera oladi va qancha?",
                "ex": "Administrator o'quvchiga 30% chegirma berdi. Bu yiliga taxminan "
                      "1 600 000 so'm.",
                "opts": [
                    "Faqat direktor bersin, chegarasiz",
                    "Direktor chegarasiz, filial direktori _____ % gacha",
                    "Administrator ham _____ % gacha bera olsin",
                ],
            },
            {
                "q": "Butunlay bepul o'qiydigan o'quvchi bo'ladimi?",
                "ex": "Xodim farzandi bepul o'qiydi. Ustozga haq baribir to'lanadi va "
                      "uni markaz o'z hisobidan beradi.",
                "opts": [
                    "Bo'lsin — ustozning haqi markaz zimmasida",
                    "Bo'lsin, lekin ustozning haqi ham kamaysin",
                    "Bo'lmasin",
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
]

CLOSING = "Bu yerda ko'rilmagan, lekin siz muhim deb bilgan holatlarni yozing."
