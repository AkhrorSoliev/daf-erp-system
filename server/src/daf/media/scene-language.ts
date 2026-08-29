/**
 * Sahna tavsifi INGLIZCHA ekanini tekshiradi.
 *
 * Nega kerak: `sceneFor` so'rovi modeldan inglizcha tavsif so'raydi,
 * ammo model ba'zan o'zbekchada javob beradi. FLUX o'zbekchani
 * tushunmaydi — natijada ma'nosiz rasm chiziladi, va HECH QANDAY XATO
 * CHIQMAYDI: model javob berdi, fal.ai rasm qaytardi, R2 qabul qildi,
 * baza yozildi. Xato faqat odam rasmga qaraganda ko'rinadi.
 *
 * 12-bo'limda aynan shunday bo'lgan: 13 tadan 3 tasi o'zbekcha sahna
 * bilan chizilgan. `sich die Zähne putzen` («tish yuvish») o'rniga
 * kulayotgan shaklsiz oq shar chiqqan — tish ham, cho'tka ham, odam ham
 * yo'q.
 *
 * Tekshiruv IKKI belgiga tayanadi, chunki bittasi yetarli emas:
 *   - o'zbekcha yuqori chastotali so'zlar (inglizchada uchramaydi);
 *   - o'zbekcha qo'shimchalar (`-moqda`, `-yapti`, `-ning`, ...) — qisqa
 *     tavsifda yuqoridagi so'zlar bo'lmasligi mumkin, qo'shimcha esa
 *     deyarli har doim bor.
 */

/** Inglizcha matnda uchramaydigan o'zbekcha so'zlar. */
const UZBEK_WORDS = new Set([
  'bir',
  'odam',
  'bilan',
  'uchun',
  'va',
  'ushlab',
  'turgan',
  'qilib',
  'ichida',
  'ustida',
  'oldida',
  'yonida',
  'kishi',
  'ayol',
  'erkak',
  'bola',
  'qo',
  'ko',
  'yoki',
  'orqali',
  'holda',
  'stol',
  'xona',
  'fonda',
  'rasmda',
  'sahnada',
]);

/**
 * O'zbekcha fe'l qo'shimchalari.
 *
 * Ro'yxat ATAYLAB qisqa. Birinchi urinishda `-ning`, `-gan`, `-adi` ham
 * bor edi va tekshiruv INGLIZCHA so'zlarni rad eta boshladi:
 * `glistening` `-ning` bilan tugaydi, va shu sababli `das Getränk` bilan
 * `der Joghurt` rasmi umuman chizilmay qoldi. Yolg'on ushlash bu yerda
 * qimmat — rasm chizilmaydi va ish to'xtaydi.
 *
 * Shuning uchun faqat inglizchada UMUMAN uchramaydigan qo'shimchalar
 * qoldi. Yuqoridagi so'z ro'yxati asosiy to'siq: haqiqiy o'zbekcha
 * sahnalarning uchalasi ham («Bir odam …») so'z ro'yxatiga tushadi,
 * qo'shimchalar esa qo'shimcha himoya.
 */
const UZBEK_SUFFIXES = ['moqda', 'yapti', 'ayotgan', 'tirib', 'sini'];

function words(scene: string): string[] {
  return scene
    .toLowerCase()
    .replace(/[^\p{L}\s'’ʻ]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Sahna o'zbekcha bo'lsa sababni qaytaradi, inglizcha bo'lsa `null`.
 *
 * Xabar TOPILGAN dalilni aytadi ("bir" so'zi topildi), umumiy "noto'g'ri
 * til" emas — chunki bu tekshiruvni kimdir noto'g'ri ishlayapti deb
 * o'ylasa, aynan qaysi so'z ushlaganini ko'rishi kerak.
 */
export function uzbekSceneReason(scene: string): string | null {
  for (const w of words(scene)) {
    // `qo'l`, `ko'z` kabi so'zlar apostrofda bo'linadi, shuning uchun
    // birinchi bo'lak ham tekshiriladi.
    const head = w.split(/['’ʻ]/)[0];
    if (UZBEK_WORDS.has(w) || UZBEK_WORDS.has(head)) {
      return `o'zbekcha so'z topildi: "${w}"`;
    }
    for (const suf of UZBEK_SUFFIXES) {
      if (w.length > suf.length + 2 && w.endsWith(suf)) {
        return `o'zbekcha qo'shimcha topildi: "${w}" (-${suf})`;
      }
    }
  }
  return null;
}

export function isEnglishScene(scene: string): boolean {
  return uzbekSceneReason(scene) === null;
}
