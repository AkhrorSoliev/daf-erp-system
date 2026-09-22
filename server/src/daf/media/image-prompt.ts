/**
 * Rasm so'rovi.
 *
 * Uslub qismi NAMUNADA TASDIQLANGAN va o'zgarmaydi: har bo'lim boshqa
 * so'rov bilan chizilsa bo'limlar bir-biridan farq qilib ketadi va
 * ekran chalkash ko'rinadi.
 *
 * Yozuv uch marta taqiqlanadi, chunki rasmdagi harf ikki tomondan
 * zarar: javobni oshkor qiladi, va Flux harflarni buzib chizadi.
 * Bunga suv belgisi (watermark) va logo ham qo'shildi: 12-bo'limning
 * `der Honig` rasmida FLUX o'z o'quv ma'lumotidan olingan "www.…"
 * suv belgisini chizib qo'ygan edi — "no text" bandi uni to'xtatmagan,
 * chunki model suv belgisini matn emas, rasmning bir qismi deb biladi.
 */
const STYLE =
  'Soft rounded 3D illustration, claymation style: {SCENE}. ' +
  'Friendly pastel colors, gentle soft shadows, plain light neutral ' +
  'background, subject fills most of the frame, centered. ' +
  'No text, no letters, no words, no writing anywhere. ' +
  'No watermark, no logo, no signature, no border.';

export function imagePrompt(scene: string): string {
  return STYLE.replace('{SCENE}', scene);
}

/**
 * So'z ot (narsa nomi) ekanini aniqlaydi: lug'atda otlar HAR DOIM
 * artikl bilan yoziladi (`der Käse`, `das Brot`, `die Milch`).
 *
 * Fe'l va ibora artikldan boshlanmaydi — `sich die Zähne putzen`,
 * `in die Kurse gehen`, `zu Mittag essen`, `trinken`. Ichida `die`
 * bo'lsa ham boshida emas, shuning uchun `^` majburiy.
 */
export function isNounEntry(de: string): boolean {
  return /^(der|die|das)\s/.test(de.trim());
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
 *
 * So'rov IKKIGA bo'lingan — ot uchun boshqa, harakat uchun boshqa.
 * Nega: bitta umumiy so'rov ("sahnada odam bo'lsa harakat ko'rinsin")
 * otlarga ham odam qo'shib yuborardi. 12-bo'limda `der Käse` so'ziga
 * model "oshpaz makaron ustiga pishloq qirmoqda" sahnasini yozdi —
 * rasmda hukmron narsa MAKARON bo'lib chiqdi, va o'quvchi "pishloq"
 * emas "makaron" deb javob berardi. Kartochkada so'z bitta narsani
 * bildiradi, shuning uchun ot uchun sahnada FAQAT o'sha narsa bo'ladi.
 */
export function sceneFor(de: string, en: string): string {
  return isNounEntry(de) ? nounScene(de, en) : actionScene(de, en);
}

function nounScene(de: string, en: string): string {
  return [
    'You write image scene descriptions for a German vocabulary flashcard.',
    '',
    `Word: "${de}" (English meaning: ${en}) — this is an OBJECT.`,
    '',
    'Describe a scene showing ONLY that object, in 10-15 words, for an',
    'image-generation AI.',
    '',
    'Strict rules:',
    '- NO people, NO hands, NO faces;',
    '- NO room, NO kitchen, NO table setting, NO landscape;',
    '- NO other food or props — exactly one object in frame;',
    '- if it is a food, show that ingredient ITSELF, not a dish made from it.',
    '',
    'Answer in ENGLISH ONLY. Write the scene description and nothing else —',
    'no quotes, no numbering, no commentary.',
  ].join('\n');
}

function actionScene(de: string, en: string): string {
  return [
    'You write image scene descriptions for a German vocabulary flashcard.',
    '',
    `Word: "${de}" (English meaning: ${en}) — this is an ACTION.`,
    '',
    'Describe a scene showing one person performing that action, in 10-15',
    'words, for an image-generation AI.',
    '',
    'Strict rules:',
    '- the action ITSELF must be clearly visible, including the object used;',
    '- exactly one person in frame, NO other people;',
    '- empty background — NO furniture, NO landscape, NO crowd.',
    '',
    'Answer in ENGLISH ONLY. Write the scene description and nothing else —',
    'no quotes, no numbering, no commentary.',
  ].join('\n');
}
