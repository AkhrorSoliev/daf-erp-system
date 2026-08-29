import type { TranslateModel } from '../translate/translate-model';
import { FUNCTION_WORDS, unknownWords, wordsOf } from './sentence-validate';

export interface GeneratedSentence {
  de: string;
  uz: string;
}

/**
 * Gap qayerdan keldi. Prisma'dagi `DafSentenceOrigin` bilan bir xil.
 *
 * `SOURCE` — lug'at yozuvining o'zi tayyor gap bo'lgan hol
 * (`Wer ist das?`). Ularni yasashga urinish ham, tashlab yuborish ham
 * noto'g'ri edi: ular allaqachon mavjud, tarjimasi bilan, va ularni
 * ODAM yozgan — ya'ni to'plamdagi eng sifatli qism.
 */
export type SentenceOrigin = 'GENERATED' | 'SOURCE';

export interface StoredSentence extends GeneratedSentence {
  origin: SentenceOrigin;
}

export const MAX_TRIES = 3;

/**
 * Mashq gapining uzunlik oynasi (mazmunli so'zlar soni).
 *
 * Rejadagi maqsad shu. Uzunlik validatorda emas, shu yerda tekshiriladi:
 * `sentence-validate.ts` bitta savolga javob beradi — «so'z tanishmi?».
 * «Bu gapmi?» esa generatsiya sifati masalasi, va u modelning niyatiga
 * emas, kodga tayanishi kerak.
 */
export const MIN_WORDS = 3;
export const MAX_WORDS = 7;

/**
 * Modeldan kerakidan qancha ko'p so'raladi.
 *
 * Takror va uzunlik filtri javobning bir qismini yeydi. `temperature: 0`
 * ni ko'tarish bilan hal qilinmadi — `OpenAiTranslateModel` tarjima yo'li
 * bilan umumiy, va uni beqarorlashtirish tarjimaga ham tegardi.
 */
export const OVERASK = 1.5;

/** Gap nega rad etildi. */
export type RejectReason = 'unknown' | 'length' | 'no-new-word';

export interface RejectedSentence {
  de: string;
  /** Faqat `reason === 'unknown'` da to'ladi. */
  unknown: string[];
  reason: RejectReason;
}

/**
 * Takrorni topish uchun normallashtirilgan kalit.
 *
 * Bosh harf va oxirgi tinish belgisi farqi gapni boshqa gapga
 * aylantirmaydi: «Ich bin Student.» va «ich bin Student» — bitta mashq.
 * Ularni ikkitaga sanash dedupni foydasiz qilardi.
 */
export function sentenceKey(de: string): string {
  return de
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?…,;:]+$/, '')
    .trim();
}

/**
 * Gap so'rovi.
 *
 * Qoidalarning ko'pi brief'dagi so'rovga 1-bo'limdagi yuritishlardan
 * KEYIN qo'shildi — har biri kuzatilgan xatoning javobi:
 *
 * - «GANZER Satz» va «Kopiere die Wortliste NICHT ab»: birinchi
 *   yuritishda model lug'at ro'yxatining o'zini qaytardi (30 «gap»ning
 *   18 tasi «Hallo!», «Danke.» kabi bitta so'z edi). Ular validatordan
 *   o'tadi — hamma so'z tanish — lekin mashq emas.
 * - O'zbekcha qatorga qo'yilgan talab va TARJIMA NAMUNALARI: model
 *   so'zma-so'z kalka yozardi («Wie heißt sie?» → «U nima deb
 *   ataladi?», bu buyum haqidagi savol). Namunalar QO'LDA yozilgan;
 *   lug'atdagi tarjimalar namuna sifatida BERILMAYDI, chunki ularning
 *   o'zida kalka bor va u yasalgan gaplarga ko'chardi.
 * - Salbiy misol («Falsch wäre: …») so'rovdan OLIB TASHLANDI. U turgan
 *   yuritishda xato baribir qaytdi: `temperature: 0` da model matndagi
 *   naqshni takrorlaydi, ya'ni noto'g'ri variantni ko'rsatish uni
 *   o'chirish o'rniga mustahkamlaydi. O'rniga `heißen` uchun uchta
 *   ijobiy juft berildi.
 */
export function buildSentencePrompt(
  words: string[],
  examples: string[],
  count: number,
  knownWords: string[] = [],
): string {
  return [
    `Du bist Deutschlehrer. Schreibe ${count} kurze A1-Sätze (${MIN_WORDS}–${MAX_WORDS} Wörter).`,
    '',
    'Regeln:',
    '- JEDER Satz benutzt mindestens ein Wort aus dieser NEUEN Liste:',
    words.join(', '),
    knownWords.length > 0
      ? '- Diese Wörter kennt der Lernende schon und darfst du frei dazu\n  benutzen:'
      : '',
    knownWords.length > 0 ? knownWords.join(', ') : '',
    '- Andere Wörter sind VERBOTEN, außer den häufigsten Funktionswörtern.',
    '- Jeder Satz muss natürlich und grammatisch korrekt sein.',
    '- Keine Eigennamen außer den unten gezeigten.',
    '- Vor Berufen, Nationalitäten und Religionen steht KEIN Artikel.',
    '  So ist es richtig: «Ich bin Student.», «Sie ist Ärztin.»,',
    '  «Er ist Deutscher.»',
    '- Jeder Satz ist ein GANZER Satz (Aussage oder Frage) mit Subjekt und',
    `  konjugiertem Verb und hat MINDESTENS ${MIN_WORDS} und HÖCHSTENS`,
    `  ${MAX_WORDS} Wörter. Einzelne Wörter, Grußformeln und Wortlisten`,
    '  sind KEINE Sätze.',
    '- Kopiere die Wortliste NICHT ab — bilde neue Sätze aus ihren Wörtern.',
    `- Alle ${count} Sätze sind verschieden.`,
    '- Nummeriere die Zeilen NICHT und benutze keine Aufzählungszeichen.',
    '',
    'Zur usbekischen Zeile:',
    '- Sie gibt den SINN wieder. Schreibe den Satz, den ein Usbeke in',
    '  dieser Situation wirklich sagt — keine Wort-für-Wort-Abbildung.',
    '- So ist es richtig:',
    '  Wie heißt er? | Uning ismi nima?',
    '  Wie heißt sie? | Uning ismi nima?',
    '  Wie heißt du? | Isming nima?',
    '  Ich finde das nett. | Bu menga yoqadi.',
    '  Es tut mir leid. | Juda afsusdaman.',
    '  Wie geht es dir? | Ahvoling qanday?',
    '',
    examples.length > 0 ? 'Beispiele für den Stil (nicht abschreiben):' : '',
    ...examples.slice(0, 8),
    '',
    'Format — eine Zeile pro Satz, Deutsch und Usbekisch mit "|" getrennt:',
    'Ich heiße Anna. | Mening ismim Anna.',
  ]
    .filter((l) => l !== '')
    .join('\n');
}

/**
 * Qator boshidagi ro'yxat belgisi: «17. », «3) », «- », «* ».
 *
 * So'rov raqamlashni taqiqlaganiga qaramay model qatorlarni raqamlab
 * qaytardi, va «17.» gapning ichiga kirib qoldi. Bundan ikki zarar:
 * saqlangan matn buzuq bo'ladi, va takror nazorati ishlamay qoladi —
 * «14. Wie heißt du?» bilan «Wie heißt du?» boshqa-boshqa kalit beradi,
 * shuning uchun bitta gap ikki marta saqlanardi.
 */
const LIST_MARKER = /^\s*(?:\d+\s*[.)]|[-*•])\s*/;

/** Gap tugallanganini bildiruvchi tinish belgisi. */
const SENTENCE_END = /[.?!]\s*$/;

/**
 * Yozuv o'zi tugallangan ifodami?
 *
 * Ikki alomat: ichida gap tinish belgisi bor, yoki uch so'zdan uzun.
 * `wohnen`, `Student`, `die Unterschrift` — qurilish materiali;
 * `Bis nächste Woche.`, `Wer ist das?` — tayyor ifoda.
 */
export function isPhraseEntry(de: string): boolean {
  return /[.?!]/.test(de) || wordsOf(de).length > 3;
}

/**
 * So'rovga beriladigan so'zlar — faqat qurilish materiali.
 *
 * Tayyor ifodalar chiqarib tashlanadi, chunki model ularni gap
 * yasashning o'rniga shundoq QAYTARARDI: 1-bo'limda rad etishlarning
 * eng katta toifasi (35 ta) aynan shu edi — «Hallo!», «Bis bald!»,
 * uzunlik chegarasidan o'tmaydigan undovlar.
 *
 * Bu ularni lug'atdan o'chirmaydi. Ular `sourceSentences` orqali gap
 * sifatida qaytadi, qolganini esa o'quvchi boshqa mashq turlarida
 * ko'radi.
 */
export function materialWords(entries: string[]): string[] {
  return entries.filter((de) => !isPhraseEntry(de));
}

/**
 * Lug'at yozuvidan tayyor gap.
 *
 * Uch qoida bilan tanlanadi:
 *
 * 1. **Gap tinish belgisi bilan tugaydi.** «das Land (die Länder)» yoki
 *    «Ich bin Student/Studentin» uch so'zdan uzun bo'lsa ham gap emas,
 *    va uni mashqqa qo'yish xato bo'lardi.
 * 2. **Qavs bo'lmaydi.** «(Es) tut mir leid.» — ixtiyoriy bo'lakli
 *    yozuv, ya'ni bitta aniq gap emas. Matnni qayta yozib qavsni olib
 *    tashlash oson edi, lekin manba matnini jimgina tahrirlash shu
 *    loyihada ataylab qilinmaydi.
 * 3. **`MIN_WORDS`–`MAX_WORDS` oralig'ida.** «Bis Samstag.» ikki so'z —
 *    mashq uchun juda qisqa, u lug'at bo'lib qolaveradi. Yuqori chegara
 *    ham xuddi shunday kerak: yasalgan gap ikkala chegaradan o'tadi, va
 *    manbadagi gap boshqa o'lchov bilan o'lchansa mashqlar bir xil
 *    bo'lmasdi. Avval bu yerda faqat quyi chegara turgan edi va
 *    «Möchtest du Salz oder Zucker auf deinem Popcorn?» (8 so'z)
 *    o'tib ketgan.
 *
 * `A / B` shaklidagi yozuvdan BIRINCHI variant olinadi
 * («Wie heißt du? / Wie ist dein Name?» → «Wie heißt du?»), lekin faqat
 * o'sha birinchi variantning o'zi gap bo'lsa. «Es ist nett, dich / Sie
 * kennen zu lernen» da qiyshiq chiziq gap ichida turadi va bo'lingani
 * parcha berardi — bunday yozuv olinmaydi.
 *
 * Notanish so'z tekshiruvi qo'llanmaydi: bu gaplar bo'limning o'z
 * lug'ati, ta'rif bo'yicha tanish.
 */
export function sourceSentences(
  entries: { de: string; uz: string | null }[],
): StoredSentence[] {
  const out: StoredSentence[] = [];
  for (const e of entries) {
    if (e.uz === null || e.uz.trim() === '') continue;
    const de = e.de.split(' / ')[0].trim();
    if (!SENTENCE_END.test(de)) continue;
    if (/[()]/.test(de)) continue;
    const n = wordsOf(de).length;
    if (n < MIN_WORDS || n > MAX_WORDS) continue;
    out.push({ de, uz: e.uz.trim(), origin: 'SOURCE' });
  }
  return out;
}

export function parseSentences(raw: string): GeneratedSentence[] {
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.includes('|'))
    .map((l) => {
      const [de, uz] = l.split('|');
      return { de: de.replace(LIST_MARKER, '').trim(), uz: uz.trim() };
    })
    .filter((s) => s.de.length > 0 && s.uz.length > 0);
}

export interface GenerateOpts {
  /** Shu va OLDINGI bo'limlarning so'z shakllari — gap shulardan tuziladi. */
  allowed: Set<string>;
  /**
   * Faqat SHU bo'limning so'z shakllari.
   *
   * Berilsa, gap ulardan kamida bittasini ishlatishi shart. Sababi:
   * «Wer ist das?» va «Ich bin hier.» validatordan ham, uzunlik
   * chegarasidan ham o'tadi, lekin butunlay yordamchi so'zlardan
   * tuzilgan — bo'limning yangi materialini mashq qilmaydi.
   *
   * Berilmasa qoida qo'llanmaydi: «yangi so'z» tushunchasi faqat
   * bo'lim ma'lum bo'lganda ma'noga ega.
   */
  newWords?: Set<string>;
  /** So'rovga «yangi» deb beriladigan so'zlar — bo'limning materiali. */
  words: string[];
  /**
   * Oldingi bo'limlarning materiali — so'rovga «allaqachon bilasan»
   * deb beriladi.
   *
   * Busiz so'rov bilan validator bir-biriga zid turardi: validator
   * TO'PLANGAN lug'atni kechiradi, so'rov esa modelga faqat shu
   * bo'limning so'zlarini ko'rsatardi. 2-bo'lim (sof sonlar) shu
   * ziddiyatni o'ldiruvchi qildi — sonlardan yolg'iz gap qurib
   * bo'lmaydi, va model bo'shliqni o'ylab topgan so'z bilan
   * to'ldirib, 213 marta rad etildi (100 %).
   */
  knownWords?: string[];
  examples: string[];
  count: number;
}

export interface GenerateResult {
  kept: GeneratedSentence[];
  rejected: RejectedSentence[];
  /**
   * Tashlangan takrorlar soni.
   *
   * `rejected` ga qo'shilmaydi: takror gap YAROQSIZ emas, shunchaki
   * ortiqcha. Ularni aralashtirsak «rad etish darajasi» so'rovning
   * sifatini emas, modelning takrorchanligini o'lchay boshlardi.
   */
  duplicates: number;
}

/**
 * Bo'lim uchun gaplar. Rad etilgan gap qayta so'raladi, lekin ko'pi
 * bilan `MAX_TRIES` marta — cheksiz urinish skriptni qotirib qo'yardi.
 *
 * Rad etilgan gap `seen` ga QO'SHILMAYDI: u chiqishda yo'q, demak uni
 * takror deb sanash noto'g'ri bo'lardi — va har urinishda qaytgan bir
 * xil yomon gap hisobotda ko'rinib turishi kerak.
 */
export async function generateForUnit(
  model: TranslateModel,
  opts: GenerateOpts,
): Promise<GenerateResult> {
  const kept: GeneratedSentence[] = [];
  const rejected: RejectedSentence[] = [];
  const seen = new Set<string>();
  const newWords = opts.newWords;
  let duplicates = 0;

  for (let tries = 0; tries < MAX_TRIES && kept.length < opts.count; tries++) {
    const need = opts.count - kept.length;
    const raw = await model.complete(
      buildSentencePrompt(opts.words, opts.examples, Math.ceil(need * OVERASK)),
    );

    for (const s of parseSentences(raw)) {
      if (kept.length >= opts.count) break;

      const key = sentenceKey(s.de);
      if (seen.has(key)) {
        duplicates++;
        continue;
      }

      // `wordsOf`, `wordFormsOf` emas: ikkinchisi endi lug'at uchun
      // tuslangan shakllarni ham hosil qiladi va takrorni yig'ib
      // tashlaydi — uzunlik sanog'i uchun ikkalasi ham noto'g'ri.
      const wordCount = wordsOf(s.de).length;
      if (wordCount < MIN_WORDS || wordCount > MAX_WORDS) {
        rejected.push({ de: s.de, unknown: [], reason: 'length' });
        continue;
      }

      const bad = unknownWords(s.de, opts.allowed);
      if (bad.length > 0) {
        rejected.push({ de: s.de, unknown: bad, reason: 'unknown' });
        continue;
      }

      // Yordamchi so'z «yangi» hisoblanmaydi, garchi u bo'lim
      // yozuvlarida uchrasa ham: «Wer ist das?» ning uchala so'zi ham
      // 1-bo'lim yozuvlaridan keladi, lekin gap hech nima o'rgatmaydi.
      if (
        newWords !== undefined &&
        !wordsOf(s.de).some((w) => newWords.has(w) && !FUNCTION_WORDS.has(w))
      ) {
        rejected.push({ de: s.de, unknown: [], reason: 'no-new-word' });
        continue;
      }

      seen.add(key);
      kept.push(s);
    }
  }

  return { kept, rejected, duplicates };
}
