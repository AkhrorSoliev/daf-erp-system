# -*- coding: utf-8 -*-
"""To'lov tizimi bo'yicha ma'muriyat uchun qaror savollari — mazmun."""

INTRO = [
    ("Bu hujjat nima uchun",
     "DaF Sprachzentrum to'lov tizimi 12 talik dars paketidan kalendar oy to'loviga "
     "o'tmoqda. O'tishdan oldin bir qancha holat bo'yicha yozma qaror kerak: bugun "
     "ular kodda u yoki bu tarzda hal qilingan, lekin ko'pchiligi hech qachon "
     "ochiq muhokama qilinmagan. Javob berilmagan har bir savol — kelajakdagi "
     "nizo yoki yo'qolgan pul."),
    ("Qanday to'ldiriladi",
     "Har savolda vaziyat, uning nega muhimligi va tanlov variantlari bor. "
     "Tanlagan variantingizni katakchaga yozing (A, B yoki C) va kerak bo'lsa "
     "izoh qoldiring. Variantlar to'liq bo'lmasa, o'z javobingizni yozing."),
    ("Raqamlar haqiqiy",
     "Hujjatdagi barcha narx, foiz va sanoq 2026-yil sentabr holatiga ko'ra "
     "tizimdan olingan. Ular misol emas — sizning bugungi ma'lumotingiz."),
]

STATE = {
    "title": "0-BO'LIM. HOZIRGI HOLAT (ma'lumot, savol emas)",
    "blocks": [
        ("Kurs narxlari va paket hajmi", [
            ["Kurs", "Narx", "Paket", "1 dars", "Guruh"],
            ["Intensive", "740 000", "20 dars", "37 000", "4"],
            ["KKB Vorbereitung", "600 000", "19 dars", "31 579", "2"],
            ["Standart B2", "500 000", "12 dars", "41 667", "5"],
            ["Vorbereitung", "500 000", "12 dars", "41 667", "1"],
            ["Standart B1", "475 000", "12 dars", "39 583", "1"],
            ["Standart A2", "450 000", "12 dars", "37 500", "5"],
            ["Standart", "450 000", "12 dars", "37 500", "51"],
            ["B1 Telc", "400 000", "12 dars", "33 333", "1"],
            ["Standart (2-filial)", "400 000", "12 dars", "33 333", "7"],
        ]),
        ("Ustoz stavkalari — bugungi holat", [
            ["Stavka turi", "Nechta", "Qiymatlari"],
            ["Foiz (dars narxidan)", "6 ta", "60%, 45% x4, 40%"],
            ["O'quvchi boshiga qat'iy", "8 ta", "hammasi 200 000 so'm"],
            ["Qat'iy oylik", "5 ta", "1.5 mln — 6 mln"],
        ]),
    ],
    "notes": [
        "MUHIM: 19 ta stavkaning HAMMASI umumiy — bittasi ham kursga yoki guruhga "
        "bog'lanmagan. Ya'ni 200 000 stavkasidagi ustoz Standart (450 000) o'qitsa ham, "
        "Intensive (740 000) o'qitsa ham bir xil 200 000 oladi. Markazning ulushi "
        "birinchi holatda 250 000, ikkinchisida 540 000 bo'lib ketadi.",
        "Tizim guruhga alohida stavka belgilashni QO'LLAB-QUVVATLAYDI, lekin bu "
        "imkoniyat hech qachon ishlatilmagan.",
        "«O'quvchi boshiga qat'iy» stavka bir sikl (12 dars) uchun hisoblanadi. "
        "Oylik tizimda u bir OY uchun bo'ladi.",
        "Aktiv: 370 o'quvchi, 47 guruh, 14 ustoz, 2 filial.",
    ],
}

SECTIONS = [
    {
        "title": "1-BO'LIM. USTOZ HAQI",
        "intro": "Eng ko'p qaror talab qiladigan bo'lim. Bugungi qoidalarning "
                 "ko'pchiligi hech qachon yozma tasdiqlanmagan.",
        "questions": [
            {
                "q": "Ustoz haqi kursga bog'lansinmi?",
                "situation":
                    "Bugun ustozning stavkasi bitta — u qaysi kursni o'qitishidan qat'i "
                    "nazar o'zgarmaydi. 200 000 stavkasidagi ustoz Standart (450 000) "
                    "o'qitganda markazga 250 000, Intensive (740 000) o'qitganda 540 000 "
                    "qoladi.",
                "why": "Qimmat kurslarda markaz ulushi nomutanosib katta, arzonlarida kichik. "
                       "Ustoz uchun esa qiyinroq kursni o'qitishning rag'bati yo'q.",
                "options": [
                    "A) Hozirgidek qolsin — ustozning bitta umumiy stavkasi",
                    "B) Har kurs uchun alohida summa (masalan: Standart 200 000, Intensive 345 000)",
                    "C) Har kurs uchun alohida FOIZ (masalan: Standart 45%, Intensive 40%)",
                ],
            },
            {
                "q": "Bitta ustozga boshqalardan farqli stavka berish mumkinmi?",
                "situation":
                    "Bugun har ustozning o'z stavkasi bor (60%, 45%, 40%, 200 000), "
                    "ya'ni individual farq allaqachon mavjud. Lekin u kursga bog'liq emas.",
                "why": "Tajribali ustozga yuqoriroq to'lash tabiiy. Lekin qoida yozilmagan "
                       "bo'lsa, kim qancha olishi tushuntirib bo'lmaydigan holga keladi.",
                "options": [
                    "A) Ha — har ustoz bilan alohida kelishiladi, qoida yo'q",
                    "B) Ha, lekin darajalar bo'yicha (masalan: yangi 40%, tajribali 45%, katta 50%)",
                    "C) Yo'q — bir kursni o'qitgan hamma bir xil oladi",
                ],
            },
            {
                "q": "Oyda 12 ta yoki 14 ta dars bo'lsa, ustoz haqi o'zgaradimi?",
                "situation":
                    "Oylik tizimda o'quvchi har oy bir xil to'laydi (450 000), lekin oyda "
                    "12, 13 yoki 14 dars bo'lishi mumkin. Hozirgi kodda ustoz haqi ham "
                    "oyiga bir xil chiqadi: dars narxi oy ichida qayta hisoblanadi "
                    "(450 000 / 13 = 34 615; 450 000 / 14 = 32 143).",
                "why": "Ustoz 14 darslik oyda ko'proq ishlaydi, lekin bir xil pul oladi. "
                       "Yoki teskarisi: har darsga qat'iy summa berilsa, markazning "
                       "xarajati oydan oyga suzib yuradi.",
                "options": [
                    "A) Ustozning oylik daromadi BARQAROR — dars soni ta'sir qilmaydi (hozirgi)",
                    "B) Har darsga qat'iy summa — ko'p dars = ko'p pul",
                    "C) Barqaror, lekin dars soni chegaradan chiqsa qayta ko'riladi",
                ],
            },
            {
                "q": "Ustoz davomat olmasa unga pul yozilmaydi. Bu qancha vaqt kutiladi?",
                "situation":
                    "Bugun ustozga haq faqat davomat belgilanganda yoziladi. Davomat "
                    "olinmasa — o'sha dars uchun pul yo'q, muddat cheklovi yo'q: keyin "
                    "olinsa ham yoziladi.",
                "why": "Muddatsiz ochiq qolsa, o'tgan oylarning davomati keyin kiritilib, "
                       "yopilgan oylik qayta ochiladi. Juda qisqa bo'lsa, ustoz o'z "
                       "aybisiz pul yo'qotadi.",
                "options": [
                    "A) Muddatsiz — qachon kiritilsa ham yoziladi (hozirgi)",
                    "B) Oy yopilgunicha — keyin faqat direktor ruxsati bilan",
                    "C) Aniq muddat (nechchi kun? ____)",
                ],
            },
            {
                "q": "O'quvchi to'lamagan bo'lsa, ustozga pul yozilsinmi?",
                "situation":
                    "Bugun: ha. Dars o'tilgan bo'lsa, ustozga haq yoziladi va pulni "
                    "MARKAZ oldindan to'laydi. O'quvchi keyin to'laganda markaz o'z "
                    "pulini qaytarib oladi. Iyul 2026 da markaz shu tarzda 622 ta "
                    "dars uchun oldindan to'lagan.",
                "why": "Ustoz o'z ishini qildi. Lekin o'quvchi umuman to'lamasa, o'sha "
                       "pul markazning doimiy zarariga aylanadi.",
                "options": [
                    "A) Ha — markaz oldindan to'laydi, keyin undiradi (hozirgi)",
                    "B) Yo'q — o'quvchi to'laganda ustozga yoziladi",
                    "C) Ha, lekin chegara bilan (oyiga eng ko'pi ____ so'm)",
                ],
            },
            {
                "q": "Darsni o'rinbosar ustoz o'tsa, pul kimga yoziladi?",
                "situation":
                    "Tizimda o'rinbosar belgilash imkoniyati bor. Pul o'rinbosarga "
                    "yoziladi — lekin uning stavkasi bo'yicha, guruh ustozining "
                    "stavkasi bo'yicha emas.",
                "why": "O'rinbosarning stavkasi yuqori bo'lsa, o'sha dars markazga "
                       "qimmatga tushadi. Past bo'lsa, o'rinbosar kam oladi.",
                "options": [
                    "A) O'rinbosarning o'z stavkasi bo'yicha (hozirgi)",
                    "B) Guruh asosiy ustozining stavkasi bo'yicha",
                    "C) Asosiy ustoz oladi, o'rinbosar bilan alohida hisoblashadi",
                ],
            },
            {
                "q": "Chegirmali o'quvchi uchun ustoz to'liq haq oladimi?",
                "situation":
                    "Bugun: ha. 50% chegirmali o'quvchi 225 000 to'laydi, lekin ustoz "
                    "to'liq 450 000 dan foiz oladi. Farqni markaz ko'taradi. Hozir "
                    "3 ta chegirmali o'quvchi bor (50%, 50%, 35%).",
                "why": "Chegirma markazning marketing qarori. Ustoz undan zarar "
                       "ko'rmasligi mantiqan to'g'ri — lekin bu yozma tasdiqlanmagan.",
                "options": [
                    "A) Ha — ustoz to'liq narxdan oladi, chegirma markaz zimmasida (hozirgi)",
                    "B) Yo'q — ustoz ham chegirmali summadan oladi",
                    "C) Yarmi-yarmi",
                ],
            },
            {
                "q": "Ustoz oy o'rtasida ishdan ketsa yoki guruhni tashlab ketsa?",
                "situation":
                    "Bugun aniq qoida yo'q. Ustoz o'zi o'tgan darslar uchun haq oladi, "
                    "qolganini yangi ustoz oladi. Lekin oylik stavkadagi ustoz uchun "
                    "bu hisoblanmagan.",
                "why": "Qat'iy oylik stavkadagi ustoz oyning yarmida ketsa, to'liq oylik "
                       "olishi kerakmi yoki yarmini?",
                "options": [
                    "A) O'tgan darslar bo'yicha — qat'iy oylik ham kunlarga bo'linadi",
                    "B) To'liq oylik — oyning ichida ketgani ahamiyatsiz",
                    "C) Direktor har holatda alohida hal qiladi",
                ],
            },
        ],
    },
    {
        "title": "2-BO'LIM. O'QUVCHINING PULI",
        "intro": "Balansda qolgan pul kimniki va u bilan nima qilinadi.",
        "questions": [
            {
                "q": "O'quvchi kelmay qo'ydi, lekin balansida puli bor. Nima qilamiz?",
                "situation":
                    "O'quvchi darslarga kelmay qo'ydi, guruhdan chiqarilmagan yoki "
                    "muzlatilgan, balansida puli qolgan. Bugun bu pul u yerda cheksiz "
                    "turaveradi — hech kim eslatmaydi, hech qayerda ko'rinmaydi.",
                "why": "Bu markazning hisobida turgan, lekin markazniki bo'lmagan pul. "
                       "Buxgalteriya uchun ham, o'quvchi bilan munosabat uchun ham "
                       "aniq qoida kerak.",
                "options": [
                    "A) O'quvchi so'ramaguncha turaveradi, muddat yo'q",
                    "B) Belgilangan muddatdan keyin markaz hisobiga o'tkaziladi (necha oy? ____)",
                    "C) Muddatdan keyin o'quvchiga xabar beriladi, javob bo'lmasa o'tkaziladi",
                ],
            },
            {
                "q": "Pulni markaz hisobiga o'tkazishga kim qaror qiladi?",
                "situation":
                    "Tizimda «markaz hisobiga o'tkazish» amali bor va u pulni markaz "
                    "daromadiga yozadi. Bugun buni CEO, filial direktori va administrator "
                    "bajara oladi.",
                "why": "Bu qaytarib bo'lmaydigan amal — o'quvchining puli markaz daromadiga "
                       "aylanadi. Kim qila olishi aniq bo'lishi kerak.",
                "options": [
                    "A) Faqat direktor",
                    "B) Direktor va filial direktori",
                    "C) Administrator ham (hozirgi)",
                ],
            },
            {
                "q": "O'quvchi oy o'rtasida guruhdan chiqsa, puli qaytariladimi?",
                "situation":
                    "Oylik tizimda: ha, o'tmagan darslar puli balansiga qaytariladi. "
                    "Masalan 20-oktabrda chiqsa, 21-31 oktabr darslari puli qaytadi.",
                "why": "Aks holda o'quvchi olmagan xizmat uchun to'lagan bo'lib qoladi.",
                "options": [
                    "A) Ha — o'tmagan darslar puli qaytariladi (hozirgi)",
                    "B) Yo'q — oy to'liq hisoblanadi, chiqish sanasi ahamiyatsiz",
                    "C) Ha, lekin ushlab qolish bilan (necha foiz? ____)",
                ],
            },
            {
                "q": "Uzrli dars uchun pul qaytariladimi yoki kredit beriladimi?",
                "situation":
                    "Hozirgi qaror: pul qaytarilmaydi, lekin keyingi oy to'lovi shuncha "
                    "dars miqdorida kamayadi. Ya'ni o'quvchi qo'shimcha darsga ega bo'ladi.",
                "why": "Bu ilgari og'zaki kelishilgan, yozma tasdiqlanmagan.",
                "options": [
                    "A) Kredit — keyingi oy to'lovi kamayadi (hozirgi)",
                    "B) Pul darhol balansga qaytariladi",
                    "C) Hech narsa — uzrli ham to'lanadi",
                ],
            },
            {
                "q": "Uzrli dars kreditiga oylik chegara bo'lsinmi?",
                "situation":
                    "Bugun chegara yo'q. O'quvchi butun oyni uzrli qilsa, keyingi oy "
                    "deyarli bepul o'qiydi. Tizimda chegara qo'yish imkoniyati bor, "
                    "lekin yoqilmagan.",
                "why": "Chegarasiz qolsa suiiste'mol ehtimoli bor. Juda past bo'lsa, "
                       "haqiqatan kasal bo'lgan o'quvchi jazolanadi.",
                "options": [
                    "A) Chegara yo'q (hozirgi)",
                    "B) Oyiga eng ko'pi ____ ta dars",
                    "C) Faqat hujjat bilan tasdiqlangan uzr (kasallik varaqasi)",
                ],
            },
            {
                "q": "O'quvchi oylikdan ko'p to'lasa, ortiqchasi nima bo'ladi?",
                "situation":
                    "O'quvchi 1 000 000 to'ladi, oylik 450 000. Bugun ortiqcha 550 000 "
                    "balansda qoladi va keyingi oylarda avtomatik ishlatiladi.",
                "why": "Bu odatiy holat va hozirgi qoida to'g'ri ishlaydi — lekin "
                       "tasdiqlanishi kerak.",
                "options": [
                    "A) Balansda qoladi, keyingi oylarga o'tadi (hozirgi)",
                    "B) Faqat bir necha oy oldindan qabul qilinadi (nechta? ____)",
                    "C) Ortiqcha to'lov qabul qilinmaydi",
                ],
            },
            {
                "q": "Qarz qachondan boshlab qarz deb sanaladi?",
                "situation":
                    "Hozirgi qaror: oyning 1-kuni hisob yoziladi va o'sha kunoq qarz "
                    "hisoblanadi. Ya'ni har oy boshida 370 ta o'quvchi qarzdor bo'lib "
                    "ko'rinadi, oy davomida bu son kamayadi.",
                "why": "Qarz ko'rsatkichi har oy boshida keskin sakraydi. Muhlat "
                       "berilsa, ko'rsatkich silliqroq bo'ladi, lekin intizom pasayishi mumkin.",
                "options": [
                    "A) Darhol — 1-sanadan qarz (hozirgi)",
                    "B) Muhlat berilsin (oyning nechanchi sanasigacha? ____)",
                ],
            },
            {
                "q": "Qarzdor o'quvchi darsga kirishi mumkinmi?",
                "situation":
                    "Bugun: ha. Qarzdor darsga kiradi, davomat olinadi, qarzi ortadi. "
                    "To'lov kelganda o'tgan darslar avtomatik hisoblanadi.",
                "why": "Bu markazning eng katta moliyaviy tavakkali. Qarz cheksiz o'sishi mumkin.",
                "options": [
                    "A) Ha, cheksiz (hozirgi)",
                    "B) Ha, lekin chegaragacha (necha dars yoki necha so'm? ____)",
                    "C) Yo'q — qarzdor darsga kiritilmaydi",
                ],
            },
            {
                "q": "Qarz qachon kechiriladi (hisobdan chiqariladi)?",
                "situation":
                    "Tizimda «qarzni kechirish» amali bor va u faqat direktorga ochiq. "
                    "Lekin qachon qo'llanishi haqida qoida yo'q.",
                "why": "Qoidasiz kechirish — hisobotdagi qarz raqamini ishonchsiz qiladi.",
                "options": [
                    "A) O'quvchi bilan aloqa uzilgach (necha oydan keyin? ____)",
                    "B) Har holat alohida ko'riladi",
                    "C) Hech qachon — qarz hisobda qolaveradi",
                ],
            },
        ],
    },
    {
        "title": "3-BO'LIM. DARSLAR VA KALENDAR",
        "intro": "Oylik tizimda oyning barcha darslari o'tilishi kerak. Bu bo'lim "
                 "o'tilmay qolgan darslar haqida.",
        "questions": [
            {
                "q": "Bayram tufayli dars bo'lmadi. Nima qilamiz?",
                "situation":
                    "Bugun tizim bayram kunini darsdan chiqaradi va guruhning tugash "
                    "sanasini avtomatik uzaytiradi. Ya'ni dars boshqa kunga emas, "
                    "guruhning OXIRIGA ko'chadi. Oylik tizimda esa o'sha oy narxi "
                    "bir dars kam darsga bo'linadi — o'quvchi kam dars uchun bir xil to'laydi.",
                "why": "Oylik to'lovda «oy uchun to'laganman, darslar to'liq bo'lishi kerak» "
                       "degan talab tabiiy. Hozirgi mexanizm bunga javob bermaydi.",
                "options": [
                    "A) Dars boshqa kunga ko'chiriladi (shu oy ichida)",
                    "B) Guruh oxiriga qo'shiladi (hozirgi)",
                    "C) O'sha dars puli o'quvchiga qaytariladi",
                ],
            },
            {
                "q": "Ko'chirilgan kun ba'zi o'quvchilarga to'g'ri kelmasa?",
                "situation":
                    "Bayram darsi boshqa kunga ko'chirildi, lekin 3 ta o'quvchi o'sha "
                    "kuni kela olmaydi. Bugun tizimda bunday holat uchun qoida yo'q — "
                    "ular oddiy qilib «kelmagan» deb belgilanadi.",
                "why": "Ular o'z aybisiz darsni o'tkazib yuboradi va oylik puli to'liq olinadi.",
                "options": [
                    "A) Ular uchun uzrli deb belgilanadi (keyingi oyga kredit)",
                    "B) Oddiy kelmagan deb belgilanadi — pul qaytmaydi",
                    "C) Ko'chirish faqat hamma rozi bo'lgan kunga qilinadi",
                ],
            },
            {
                "q": "Ustoz kelmagani uchun dars bo'lmadi. Kim javobgar?",
                "situation":
                    "Tizimda «darsni bekor qilish» amali bor. Bekor qilinganda "
                    "o'quvchidan pul yechilmaydi va ustozga haq yozilmaydi. Lekin "
                    "oylik tizimda o'quvchi allaqachon butun oyni to'lagan.",
                "why": "O'quvchi to'lagan, dars bo'lmagan. Pul kimda qoladi?",
                "options": [
                    "A) Dars boshqa kunga ko'chiriladi, pul qaytmaydi",
                    "B) O'sha darsning puli o'quvchiga qaytariladi",
                    "C) Ustozning haqidan ushlab qolinadi",
                ],
            },
            {
                "q": "Rejadan ortiq dars o'tilsa (masalan 13 o'rniga 14)?",
                "situation":
                    "Bugun: o'quvchidan qo'shimcha pul olinmaydi (oylik qat'iy), "
                    "lekin ustozga o'sha dars uchun haq yoziladi. Ya'ni farqni markaz ko'taradi.",
                "why": "Bu ataylab shunday qilingan, lekin tasdiqlanmagan.",
                "options": [
                    "A) Qo'shimcha olinmaydi, ustozga to'lanadi (hozirgi)",
                    "B) Qo'shimcha dars uchun qo'shimcha to'lov",
                    "C) Rejadan ortiq dars umuman o'tilmaydi",
                ],
            },
            {
                "q": "Dars bekor bo'ldi va boshqa kunga ko'chirilmadi?",
                "situation":
                    "Hozirgi qaror: pul qaytarilmaydi — oylik narx «joy va oy» uchun, "
                    "dars sanog'i uchun emas.",
                "why": "Bu markaz foydasiga ishlaydigan qoida. O'quvchiga tushuntirish "
                       "kerak bo'ladi.",
                "options": [
                    "A) Qaytarilmaydi (hozirgi)",
                    "B) Qaytariladi",
                    "C) Ko'chirish imkoni bo'lmasa qaytariladi",
                ],
            },
            {
                "q": "Guruh oy o'rtasida tugasa?",
                "situation":
                    "Guruh 15-oktabrda kursni tugatdi. O'quvchi butun oktabr uchun "
                    "to'lagan. Bugun bu holat alohida hisoblanmagan.",
                "why": "O'quvchi 15 kun uchun bir oylik to'lagan bo'lib qoladi.",
                "options": [
                    "A) Qolgan kunlar puli qaytariladi",
                    "B) Qaytarilmaydi — kurs tugadi, oy to'landi",
                    "C) Keyingi kursga o'tkaziladi",
                ],
            },
        ],
    },
    {
        "title": "4-BO'LIM. MUZLATISH",
        "intro": "O'quvchi vaqtincha to'xtaganda pul bilan nima bo'ladi.",
        "questions": [
            {
                "q": "Muzlatilganda pul balansga qaytarilsinmi?",
                "situation":
                    "Hozirgi qaror: ha, o'tmagan darslar puli darhol balansga qaytadi "
                    "va u yerda kutib turadi.",
                "why": "Tasdiqlanishi kerak — bu pul oqimiga bevosita ta'sir qiladi.",
                "options": [
                    "A) Ha, darhol qaytadi (hozirgi)",
                    "B) Yo'q — faqat butunlay chiqarilganda qaytadi",
                ],
            },
            {
                "q": "Muzlatishdan chiqqanda oy qayta hisoblansinmi?",
                "situation":
                    "Hozirgi qaror: ha. 10-oktabrda muzlatilib, 15-oktabrda qaytsa, "
                    "16-31 oktabr darslari qayta hisoblanadi va balansdan yechiladi.",
                "why": "Aks holda o'quvchi oyning qolganini bepul o'qiydi.",
                "options": [
                    "A) Ha — qolgan darslar qayta hisoblanadi (hozirgi)",
                    "B) Yo'q — qaytgan oy bepul",
                ],
            },
            {
                "q": "Muzlatilgan o'quvchining puli qancha kutadi?",
                "situation":
                    "Hozirgi qaror: 30 kun. Undan keyin o'quvchi alohida ro'yxatda "
                    "chiqadi va administrator pulni qaytaradi yoki markaz hisobiga o'tkazadi.",
                "why": "Muddat juda qisqa bo'lsa, vaqtincha to'xtagan o'quvchi bezovta "
                       "qilinadi. Juda uzoq bo'lsa, pul unutiladi.",
                "options": [
                    "A) 30 kun (hozirgi)",
                    "B) Boshqa muddat (necha kun? ____)",
                    "C) Muddat yo'q",
                ],
            },
            {
                "q": "Muzlatish uchun sabab talab qilinsinmi?",
                "situation":
                    "Bugun muzlatishda sabab tanlash majburiy. Lekin sabablar ro'yxati "
                    "va ularning oqibati (masalan kasallik — bepul, sayohat — pullik) "
                    "farqlanmaydi.",
                "why": "Sabab yozilsa ham, u hech narsaga ta'sir qilmasa — shunchaki "
                       "qo'shimcha ish bo'lib qoladi.",
                "options": [
                    "A) Sabab yoziladi, lekin pulga ta'sir qilmaydi (hozirgi)",
                    "B) Sabab turiga qarab pul boshqacha hisoblanadi",
                    "C) Sabab talab qilinmaydi",
                ],
            },
        ],
    },
    {
        "title": "5-BO'LIM. CHEGIRMA VA MAXSUS HOLATLAR",
        "intro": "Hozir 3 ta chegirmali o'quvchi bor (50%, 50%, 35%), lekin chegirma "
                 "berish qoidasi yozilmagan.",
        "questions": [
            {
                "q": "Chegirmani kim bera oladi va qancha?",
                "situation":
                    "Bugun chegirma o'quvchi kartochkasida foiz sifatida yoziladi. "
                    "Kim yoza olishi va yuqori chegarasi belgilanmagan.",
                "why": "Chegirmasiz nazorat — markaz daromadidagi eng oson oqish yo'li.",
                "options": [
                    "A) Faqat direktor, chegarasiz",
                    "B) Direktor chegarasiz, filial direktori ____% gacha",
                    "C) Administrator ham ____% gacha",
                ],
            },
            {
                "q": "Qanday chegirma turlari rasman mavjud?",
                "situation":
                    "Bugun tizimda faqat foiz bor — turi yo'q. Ya'ni «aka-uka chegirmasi» "
                    "bilan «moliyaviy yordam» bir xil ko'rinadi.",
                "why": "Turi yozilmasa, chegirmalarning umumiy qiymati va sababi tahlil "
                       "qilinmaydi.",
                "options": [
                    "A) Tur kerak emas — foiz yetarli (hozirgi)",
                    "B) Turlar belgilansin (qaysilar? ______________________)",
                ],
            },
            {
                "q": "Butunlay bepul o'quvchilar bo'ladimi?",
                "situation":
                    "Xodim farzandi, ustoz farzandi, imtiyozli o'quvchi. Bugun bu "
                    "100% chegirma orqali qilinadi — lekin o'shanda ustozga haq "
                    "baribir to'liq narxdan yoziladi va uni markaz ko'taradi.",
                "why": "Bepul o'quvchi markazga tekin emas — ustozning haqi baribir to'lanadi.",
                "options": [
                    "A) Ha, 100% chegirma orqali (hozirgi)",
                    "B) Ha, lekin ustoz haqi ham kamayadi",
                    "C) Bepul o'quvchi bo'lmaydi",
                ],
            },
        ],
    },
    {
        "title": "6-BO'LIM. TO'LOV TURINI ALMASHTIRISH",
        "intro": "Tizim 12 talik va oylik turlarni yonma-yon qo'llab-quvvatlaydi.",
        "questions": [
            {
                "q": "Bitta kursning turli guruhlari har xil turda bo'lishi mumkinmi?",
                "situation":
                    "Bugun to'lov turi KURS darajasida. «Standart» kursida 51 ta guruh "
                    "bor — turni almashtirsangiz, 51 tasi ham birdan o'tadi.",
                "why": "Bosqichma-bosqich o'tish yoki tajriba qilish imkoni yo'q.",
                "options": [
                    "A) Yo'q — kurs darajasida yetarli (hozirgi)",
                    "B) Ha — har guruh alohida belgilansin",
                ],
            },
            {
                "q": "Oy o'rtasida tur almashtirilsa, allaqachon hisoblangan o'quvchi?",
                "situation":
                    "O'quvchidan oktabr oyligi olindi. 15-oktabrda kurs 12 talikka "
                    "qaytarildi. Bugun bu holat uchun qoida yo'q.",
                "why": "Pul allaqachon olingan, qoida esa o'zgargan.",
                "options": [
                    "A) Tur faqat oy boshida almashtiriladi",
                    "B) Oy o'rtasida almashsa, joriy oy eski qoida bilan tugaydi",
                    "C) Darhol qayta hisoblanadi",
                ],
            },
        ],
    },
    {
        "title": "7-BO'LIM. RUXSATLAR",
        "intro": "Kim qaysi pul amalini bajara oladi. Bugungi holat qavs ichida.",
        "questions": [
            {
                "q": "Oylik hisobni bekor qilish kimga ochiq bo'lsin?",
                "situation":
                    "Bekor qilinganda o'quvchiga bir oylik pul qaytadi. Bugun bu "
                    "direktor va filial direktoriga ochiq.",
                "why": "Bir bosishda 450 000 harakat qiladi.",
                "options": ["A) Faqat direktor", "B) Direktor va filial direktori (hozirgi)",
                            "C) Administrator ham"],
            },
            {
                "q": "Kurs narxini kim o'zgartira oladi?",
                "situation":
                    "Narx o'zgarishi keyingi oydan boshlab hamma o'quvchiga ta'sir qiladi. "
                    "Bugun direktor, filial direktori va administrator o'zgartira oladi.",
                "why": "«Standart» kursida 51 guruh bor — narx o'zgarsa hammasiga tegadi.",
                "options": ["A) Faqat direktor", "B) Direktor va filial direktori",
                            "C) Administrator ham (hozirgi)"],
            },
            {
                "q": "Pul qaytarishni kim tasdiqlaydi va chegara bormi?",
                "situation":
                    "Bugun direktor, filial direktori va administrator qaytara oladi, "
                    "summa chegarasi yo'q.",
                "why": "Chegarasiz qaytarish — markaz kassasidan tekshiruvsiz chiqish yo'li.",
                "options": ["A) Chegarasiz, hozirgidek", "B) ____ so'mdan yuqorisi direktor tasdig'i bilan",
                            "C) Faqat direktor"],
            },
        ],
    },
]

CLOSING = (
    "QO'SHIMCHA IZOHLAR",
    "Ushbu hujjatda ko'rilmagan, lekin siz muhim deb hisoblagan holatlarni "
    "shu yerga yozing."
)
