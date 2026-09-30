import type { Yangilik } from "./turlar";

/**
 * Foydalanuvchiga ko'rinadigan har o'zgarish shu yerga bitta yozuv qo'shadi
 * (o'sha PR'da). Eng yangisi tepada.
 */
export const yangiliklar: Yangilik[] = [
  {
    sana: "2026-09-30",
    sarlavha: "Qo'llanma ishga tushdi",
    matn: "Tizim qoidalari endi admin panel ichida. Har sahifadagi «?» tugmasi shu sahifaning qoidasini ochadi.",
    sahifa: { bolim: "boshlash", sahifa: "interfeys" },
  },
  {
    sana: "2026-09-27",
    sarlavha: "Guruhdan chiqarishda pul qoidasi (shartnoma 6.2)",
    matn: "Guruhdan chiqarish va chetlatish oynasida «Pul (shartnoma bo'yicha)» bloki paydo bo'ldi: u tanlangan tartib bilan balansga nima bo'lishini oldindan ko'rsatadi. 01.10.2026 dan o'quvchi o'zi to'xtatsa va oyning 40% idan ko'pi o'tgan bo'lsa, oylik puli qaytmaydi. «Darajani tugatdi» tartibida o'tilmagan darslar puli qaytadi.",
    rollar: [1, 2, 3],
    sahifa: { bolim: "oquvchilar", sahifa: "guruhdan-chiqarish" },
  },
  {
    sana: "2026-09-27",
    sarlavha: "O'quvchi birinchi kirishda jins va tug'ilgan sanani kiritadi",
    matn: "O'quvchi portalga yoki ilovaga birinchi marta kirganda jinsi va tug'ilgan sanasini kiritadi. Telefonni SMS kod bilan tasdiqlash qadami sozlama bilan yoqiladi. O'quvchi kartasida «Telefon tasdiqlangan» va «Telegram botda ro'yxatdan o'tgan» belgilari alohida ko'rinadi.",
    rollar: [1, 2, 3],
    sahifa: { bolim: "oquvchilar", sahifa: "yangi-oquvchi" },
  },
  {
    sana: "2026-09-27",
    sarlavha: "Muzlatishdan qaytganda faqat qaytgan kundan keyingi darslar hisoblanadi",
    matn: "Oylik kursdagi o'quvchi muzlatishdan qaytganda balansdan faqat qaytgan kundan keyingi darslar puli yechiladi: muzlatilgan paytda o'tgan darslar va qaytgan kunning o'zi hisoblanmaydi. Muzlatish oynasi oylik kurs uchun qaytadigan pulni ko'rsatadi.",
    rollar: [1, 2, 3],
    sahifa: { bolim: "oquvchilar", sahifa: "muzlatish" },
  },
  {
    sana: "2026-09-26",
    sarlavha: "Muzlatilgan o'quvchini to'g'ridan-to'g'ri chetlatish mumkin",
    matn: "Muzlatilgan o'quvchi qaytmasa, uni avval «Faol» qilmasdan «Chetlatilgan» qilish mumkin. Bu bitta ketish hisoblanadi.",
    rollar: [1, 2, 3],
    sahifa: { bolim: "oquvchilar", sahifa: "chetlatish-va-arxiv" },
  },
  {
    sana: "2026-09-26",
    sarlavha: "O'quvchi kartasida «To'lovlar» tabi yangi hisobotga o'tdi",
    matn: "«To'lovlar» tabi endi «To'lovlar hisoboti»ni ko'rsatadi: bitta gapli javob, «Oylar bo'yicha» jadvali, «To'lovlar qayerga ketdi» bo'limi va PDF. Hisobot balans bilan so'mma-so'm mos keladi; farq chiqsa, u yashirilmaydi.",
    rollar: [1, 2, 3],
    sahifa: { bolim: "oquvchilar", sahifa: "oquvchi-kartasi" },
  },
  {
    sana: "2026-09-25",
    sarlavha: "Oylik kursda boshqa guruhga o'tkazilsa, eski oy puli qisqaradi",
    matn: "O'quvchi oy o'rtasida oylik kursdan boshqa guruhga o'tkazilsa, eski guruhning shu oydagi hisobi o'tkazish kunigacha o'tilgan darslarga qisqaradi va o'tilmagan darslar puli balansga qaytadi. Yangi kurs o'z narxida, qolgan darslar uchun olinadi.",
    rollar: [1, 2, 3],
    sahifa: { bolim: "oquvchilar", sahifa: "guruhga-qoshish" },
  },
  {
    sana: "2026-09-24",
    sarlavha: "Boshqa qurilmalardan chiqish",
    matn: "Profil sahifasida «Boshqa qurilmalardan chiqish» tugmasi paydo bo'ldi. Parol o'zgarganda (Profilda, SMS orqali yoki rahbar yozib bersa) ham boshqa qurilmalardagi kirishlar tugaydi. Profilda o'zingiz o'zgartirsangiz yoki tugmani bossangiz, shu qurilmada qolasiz.",
    sahifa: { bolim: "boshlash", sahifa: "tizimga-kirish" },
  },
  {
    sana: "2026-09-24",
    sarlavha: "Telefon raqam joriy parol bilan o'zgaradi",
    matn: "Profilda telefon raqamni o'zgartirganda «Joriy parol» so'raladi. Eski raqam kirish uchun ishlamay qoladi: keyingi safar yangi raqam bilan kirasiz.",
    sahifa: { bolim: "boshlash", sahifa: "tizimga-kirish" },
  },
  {
    sana: "2026-09-24",
    sarlavha: "Rol berish va xodim hisobini o'zgartirish qoidalari",
    matn: "Rolni faqat o'zingizdan pastdagilarga bera olasiz. Xodim hisobini faqat undan yuqori rahbar o'zgartiradi: direktor boshqa direktorning hisobini o'zgartira olmaydi, administrator esa hech kimning hisobini o'zgartira olmaydi.",
    rollar: [1, 2, 3],
    sahifa: { bolim: "boshlash", sahifa: "rollar-va-huquqlar" },
  },
  {
    sana: "2026-09-24",
    sarlavha: "Bloklangan xodim darhol to'xtaydi",
    matn: "«To'xtatilgan» yoki «Ishdan bo'shatilgan» qilingan, yoki arxivlangan xodim keyingi harakatidayoq to'xtaydi va «Hisobingiz bloklangan» xabarini ko'radi. Ilgari u bir soatgacha ishlashda davom etardi.",
    rollar: [1, 2],
    sahifa: { bolim: "boshlash", sahifa: "rollar-va-huquqlar" },
  },
  {
    sana: "2026-09-24",
    sarlavha: "Kartadagi telefon raqam o'zgarsa, o'quvchining kirish raqami ham o'zgaradi",
    matn: "O'quvchi kartasidagi «Telefon raqam»ni o'zgartirsangiz, kirish raqami ham shu zahoti o'zgaradi: eski raqam kirish uchun ishlamay qoladi, parol o'zgarmaydi. Ilgari faqat karta o'zgarardi, kirish esa eski raqamda qolardi.",
    rollar: [1, 2, 3],
    sahifa: { bolim: "oquvchilar", sahifa: "yangi-oquvchi" },
  },
  {
    sana: "2026-09-24",
    sarlavha: "Arxivlangan o'quvchi kira olmaydi",
    matn: "O'quvchi kartasini arxivga o'tkazsangiz, uning kirish hisobi ham yopiladi va raqami bo'shaydi. Karta arxivdan tiklansa, hisob ham qaytadi. Chetlatilgan, muzlatilgan va bitirgan o'quvchining hisobi ochiq qoladi: u qarzini portalda to'laydi.",
    rollar: [1, 2, 3],
    sahifa: { bolim: "oquvchilar", sahifa: "chetlatish-va-arxiv" },
  },
  {
    sana: "2026-09-19",
    sarlavha: "Bir odam ikki rolda — alohida hisob",
    matn: "O'quvchi hisobi xodim hisobi ochilishiga endi to'sqinlik qilmaydi: bir odam o'quvchi ham, xodim ham bo'lsa, unda ikkita alohida hisob va ikkita parol bo'ladi. Bitta telefonga bitta ishlab turgan xodim hisobi to'g'ri keladi.",
    rollar: [1, 2],
    sahifa: { bolim: "boshlash", sahifa: "tizimga-kirish" },
  },
  {
    sana: "2026-09-13",
    sarlavha: "Bot va mock imtihondan kelgan o'quvchi ham lid bilan yoziladi",
    matn: "Telegram bot orqali ro'yxatdan o'tgan va mock imtihon ishtirokchisidan aylantirilgan o'quvchi ham lid bilan bog'lanadi: manbasi «Telegram bot» yoki «Mock imtihon» bo'ladi.",
    rollar: [1, 2, 3],
    sahifa: { bolim: "oquvchilar", sahifa: "hayot-davri" },
  },
  {
    sana: "2026-09-10",
    sarlavha: "Faol o'quvchilar soni hamma joyda bir xil",
    matn: "Bosh sahifa, «O'quvchilar» sahifasi va Telegram hisobotida «faol o'quvchi» endi bir xil qoida bilan sanaladi: holati «Faol» va hozir faol guruhda o'qiydi.",
    rollar: [1, 2, 3],
    sahifa: { bolim: "boshlash", sahifa: "lugat" },
  },
  {
    sana: "2026-09-10",
    sarlavha: "«Yangi o'quvchi» oynasida «Qayerdan bildi?» majburiy",
    matn: "Har yangi o'quvchi lid bilan bog'lanadi. Shuning uchun «O'quvchilar» sahifasidagi «Yangi o'quvchi» oynasida «Qayerdan bildi?» maydonini tanlash shart.",
    rollar: [1, 2, 3],
    sahifa: { bolim: "oquvchilar", sahifa: "yangi-oquvchi" },
  },
];
