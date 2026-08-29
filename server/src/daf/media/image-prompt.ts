/**
 * Rasm so'rovi.
 *
 * Uslub qismi NAMUNADA TASDIQLANGAN va o'zgarmaydi: har bo'lim boshqa
 * so'rov bilan chizilsa bo'limlar bir-biridan farq qilib ketadi va
 * ekran chalkash ko'rinadi.
 *
 * Yozuv uch marta taqiqlanadi, chunki rasmdagi harf ikki tomondan
 * zarar: javobni oshkor qiladi, va Flux harflarni buzib chizadi.
 */
const STYLE =
  'Soft rounded 3D illustration, claymation style: {SCENE}. ' +
  'Friendly pastel colors, gentle soft shadows, plain light neutral ' +
  'background, subject fills most of the frame, centered. ' +
  'No text, no letters, no words, no writing anywhere.';

export function imagePrompt(scene: string): string {
  return STYLE.replace('{SCENE}', scene);
}

/**
 * Modeldan (`TranslateModel`) so'z uchun sahna tavsifi so'raladigan
 * so'rov matnini quradi. Bu funksiyaning o'zi modelga MUROJAAT QILMAYDI
 * — faqat so'rov matnini qaytaradi; chaqiruvchi (`daf-gen-images.ts`)
 * uni `model.complete()` ga uzatadi.
 *
 * Nega inglizcha ma'no (`en`) ham beriladi: nemischa ko'p ma'noli
 * bo'lishi mumkin (masalan `die Bank` — o'rindiqmi, bankmi), inglizcha
 * izoh sahnani aniqlashtiradi. Nemischa esa asosiy manba — model
 * inglizchaga qarab emas, so'zning haqiqiy ma'nosiga qarab yozsin deb
 * ikkalasi ham beriladi.
 */
export function sceneFor(de: string, en: string): string {
  return [
    "Siz nemis tili lug'at kartochkasi uchun rasm sahnasi yozasiz.",
    '',
    `So'z: "${de}" (inglizcha ma'no: ${en})`,
    '',
    "Ushbu so'zni BITTA aniq, konkret sahna bilan tasvirlang — inglizcha,",
    "10-15 so'zda, rasm chizuvchi sun'iy intellekt uchun.",
    "Sahnada odam bo'lsa, harakatning o'zi ko'rinadigan bo'lsin.",
    '',
    'Faqat sahna tavsifini yozing — tirnoq, raqam, izoh yoki boshqa hech',
    "narsa qo'shmang.",
  ].join('\n');
}
