import { COMPANY } from "@/lib/company";

// The privacy policy text, kept as data so the same words render in both skins
// (Lumio on the student portal, shadcn everywhere else) and so the wording can
// be edited without touching layout code.
//
// Everything here describes what the system actually does today. When a data
// flow changes — a new payment provider, a new notification channel, a new
// field on the student record — this file changes in the same PR, and
// LAST_UPDATED moves with it.

export const LAST_UPDATED = "19.08.2026";

export type Block = { kind: "p"; text: string } | { kind: "ul"; items: string[] };

export interface Section {
  id: string;
  title: string;
  blocks: Block[];
}

export const INTRO = `${COMPANY.legalName} (keyingi o'rinlarda — «Markaz», «biz») o'quvchilari, ularning ota-onalari va xodimlarining shaxsiy ma'lumotlariga mas'uliyat bilan yondashadi. Ushbu siyosat Markazning axborot tizimlaridan foydalanganda qanday ma'lumotlar yig'ilishini, ular nima uchun kerakligini va ular bilan nima qilishimizni tushuntiradi.`;

export const SCOPE = `Siyosat quyidagilarga taalluqli: o'quvchi kabineti (student.${COMPANY.website}), o'quvchilar uchun mobil ilova, o'qituvchi portali (lehrer.${COMPANY.website}), boshqaruv paneli (admin.${COMPANY.website}) va Markazning Telegram boti.`;

export const SECTIONS: Section[] = [
  {
    id: "yigiladigan-malumotlar",
    title: "1. Biz yig'adigan ma'lumotlar",
    blocks: [
      { kind: "p", text: "Shaxsni tasdiqlovchi ma'lumotlar:" },
      {
        kind: "ul",
        items: [
          "ism va familiya",
          "telefon raqam — u ayni paytda tizimga kirish logini hamdir",
          "profil surati, agar uni o'zingiz yuklagan bo'lsangiz",
          "Telegram akkaunt identifikatori va foydalanuvchi nomi — agar Telegram orqali kirishni tanlasangiz",
        ],
      },
      { kind: "p", text: "O'quv jarayoniga oid ma'lumotlar:" },
      {
        kind: "ul",
        items: [
          "qaysi kurs va guruhga yozilganingiz, dars jadvalingiz",
          "davomat yozuvlari — darsda bo'lgan, kelmagan yoki sababli deb belgilanganingiz",
          "sinov imtihonlariga ro'yxatdan o'tish va ularning natijalari",
        ],
      },
      { kind: "p", text: "Moliyaviy ma'lumotlar:" },
      {
        kind: "ul",
        items: [
          "to'lovlar tarixi, joriy balans va qarzdorlik",
          "to'lov usuli va to'lov tizimidan qaytgan tranzaksiya raqami",
        ],
      },
      { kind: "p", text: "Texnik ma'lumotlar:" },
      {
        kind: "ul",
        items: [
          "kirish sessiyasi — brauzer cookie'sida saqlanadigan token",
          "push-bildirishnoma uchun qurilma tokeni, agar bildirishnomalarga ruxsat bergan bo'lsangiz",
          "parolni tiklash uchun yuborilgan bir martalik SMS kodlari",
        ],
      },
      {
        kind: "p",
        text: "Biz bank kartangiz raqamini, amal qilish muddatini va boshqa maxfiy to'lov ma'lumotlarini yig'maymiz va saqlamaymiz — 4-bo'limga qarang.",
      },
    ],
  },
  {
    id: "foydalanish-maqsadi",
    title: "2. Ma'lumotlardan nima uchun foydalanamiz",
    blocks: [
      {
        kind: "ul",
        items: [
          "o'quv jarayonini yuritish: guruhlar, dars jadvali va davomat",
          "to'lovlarni hisoblash, tasdiqlash va kvitansiya berish",
          "tizimga kirish imkonini berish va akkauntingizni himoyalash",
          "dars, to'lov va e'lonlar yuzasidan xabar berish — Telegram, push-bildirishnoma yoki SMS orqali",
          "Markaz ishini tahlil qilish va ichki hisobotlar tuzish",
        ],
      },
      {
        kind: "p",
        text: "Biz shaxsiy ma'lumotlaringizni sotmaymiz va reklama maqsadida uchinchi shaxslarga bermaymiz.",
      },
    ],
  },
  {
    id: "kim-bilan-boishiladi",
    title: "3. Ma'lumot kim bilan bo'lishiladi",
    blocks: [
      {
        kind: "p",
        text: "Faqat xizmat ko'rsatish uchun zarur bo'lgan hajmda va faqat quyidagi hamkorlar bilan:",
      },
      {
        kind: "ul",
        items: [
          "Payme (Paycom) va Click — onlayn to'lovni amalga oshirish uchun",
          "Eskiz — SMS yuborish uchun",
          "Telegram — bot orqali xabar yuborish va Telegram orqali tizimga kirish uchun",
          "Vercel va Railway — tizim joylashgan server infratuzilmasi",
        ],
      },
      {
        kind: "p",
        text: "Bundan tashqari, qonun talab qilgan hollarda vakolatli davlat organlariga ma'lumot berilishi mumkin.",
      },
    ],
  },
  {
    id: "tolov",
    title: "4. To'lov ma'lumotlari",
    blocks: [
      {
        kind: "p",
        text: "Onlayn to'lov Payme yoki Click ning o'z to'lov sahifasida amalga oshiriladi. Karta raqami, amal qilish muddati va tasdiqlash kodi bizning serverlarimizga umuman tushmaydi.",
      },
      {
        kind: "p",
        text: "To'lov tizimidan biz faqat to'lov muvaffaqiyatli o'tgani, uning summasi va tranzaksiya raqamini olamiz — shu ma'lumot asosida balansingiz to'ldiriladi.",
      },
    ],
  },
  {
    id: "voyaga-yetmaganlar",
    title: "5. Voyaga yetmagan o'quvchilar",
    blocks: [
      {
        kind: "p",
        text: "Markaz o'quvchilari orasida 18 yoshga to'lmaganlar ham bor. Ularning ma'lumotlari ota-onasi yoki qonuniy vakilining roziligi bilan, faqat o'quv jarayonini yuritish maqsadida qayta ishlanadi.",
      },
      {
        kind: "p",
        text: "Ota-ona yoki qonuniy vakil farzandi haqidagi ma'lumotni ko'rish, uni tuzattirish yoki o'chirishni so'rash huquqiga ega.",
      },
    ],
  },
  {
    id: "saqlash-muddati",
    title: "6. Ma'lumotlar qancha muddat saqlanadi",
    blocks: [
      {
        kind: "p",
        text: "O'quv va moliyaviy yozuvlar buxgalteriya hisobi talab qiladigan muddat davomida saqlanadi.",
      },
      {
        kind: "p",
        text: "Akkaunt o'chirilganda kirish ma'lumotlari — parol, faol sessiyalar va qurilma tokeni — o'chiriladi. To'lov yozuvlari esa moliyaviy hisobot uchun saqlanib qolishi mumkin.",
      },
    ],
  },
  {
    id: "xavfsizlik",
    title: "7. Xavfsizlik",
    blocks: [
      {
        kind: "ul",
        items: [
          "barcha ulanishlar HTTPS orqali shifrlanadi",
          "parollar ochiq ko'rinishda saqlanmaydi — ular qaytarib bo'lmaydigan xesh sifatida saqlanadi",
          "tizimga kirish rollarga bo'lingan: har bir xodim faqat o'z ishi uchun zarur ma'lumotni ko'radi",
        ],
      },
      {
        kind: "p",
        text: "Shu bilan birga, hech bir tizim mutlaqo xavfsiz emas. Ma'lumotlar xavfsizligi buzilganini aniqlasak, ta'sirlangan foydalanuvchilarni xabardor qilamiz.",
      },
    ],
  },
  {
    id: "huquqlaringiz",
    title: "8. Sizning huquqlaringiz",
    blocks: [
      {
        kind: "ul",
        items: [
          "o'zingiz haqingizdagi ma'lumotni ko'rish va uning nusxasini olish",
          "noto'g'ri yoki eskirgan ma'lumotni tuzattirish",
          "akkauntingizni va unga bog'liq ma'lumotlarni o'chirishni so'rash",
          "xabarnomalardan voz kechish",
          "ilgari bergan rozilikni qaytarib olish",
        ],
      },
      {
        kind: "p",
        text: "So'rovni yuborish uchun quyidagi «Aloqa» bo'limidagi ma'lumotlardan foydalaning. Javobni odatda 10 ish kuni ichida beramiz.",
      },
    ],
  },
  {
    id: "akkauntni-ochirish",
    title: "9. Akkauntni o'chirish",
    blocks: [
      {
        kind: "p",
        text: "Akkauntingizni va u bilan bog'liq shaxsiy ma'lumotlarni o'chirishni istasangiz, Telegram yoki telefon orqali murojaat qiling. So'rovni tasdiqlaganimizdan so'ng akkaunt va kirish ma'lumotlari o'chiriladi.",
      },
      {
        kind: "p",
        text: "6-bo'limda aytilganidek, moliyaviy hisobot uchun zarur bo'lgan to'lov yozuvlari saqlanib qolishi mumkin — ular akkauntga bog'lanmagan holda qoladi.",
      },
    ],
  },
  {
    id: "cookie",
    title: "10. Cookie fayllari",
    blocks: [
      {
        kind: "p",
        text: "Biz cookie fayllaridan faqat sizni tizimda ushlab turish uchun foydalanamiz: kirish tokeni va tanlagan mavzu (yorug'/qorong'i). Reklama yoki kuzatuv cookie'lari ishlatilmaydi.",
      },
    ],
  },
  {
    id: "ozgarishlar",
    title: "11. Siyosatdagi o'zgarishlar",
    blocks: [
      {
        kind: "p",
        text: "Siyosat yangilanganda ushbu sahifadagi «Oxirgi yangilanish» sanasi o'zgaradi. Muhim o'zgarishlar haqida tizim orqali alohida xabar beramiz.",
      },
    ],
  },
];
