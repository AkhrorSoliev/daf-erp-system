import type { TranslateModel } from '../translate/translate-model';
import { unknownWords, wordFormsOf } from './sentence-validate';

export interface GeneratedSentence {
  de: string;
  uz: string;
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
export type RejectReason = 'unknown' | 'length';

export interface RejectedSentence {
  de: string;
  /** Faqat `reason === 'unknown'` da to'ladi. */
  unknown: string[];
  reason: RejectReason;
}

/**
 * Solishtirish uchun normallashtirilgan shakl.
 *
 * Bosh harf va oxirgi tinish belgisi farqi gapni boshqa gapga
 * aylantirmaydi: «Ich bin Student.» va «ich bin Student» — bitta mashq.
 * Ularni ikkitaga sanash dedupni foydasiz qilardi.
 */
function normalizeForCompare(de: string): string {
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
 */
export function buildSentencePrompt(
  words: string[],
  examples: string[],
  count: number,
): string {
  return [
    `Du bist Deutschlehrer. Schreibe ${count} kurze A1-Sätze (${MIN_WORDS}–${MAX_WORDS} Wörter).`,
    '',
    'Regeln:',
    '- Benutze NUR diese Wörter und die häufigsten Funktionswörter:',
    words.join(', '),
    '- Jeder Satz muss natürlich und grammatisch korrekt sein.',
    '- Keine Eigennamen außer den unten gezeigten.',
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
    '- Richtig so:',
    '  Wie heißt sie? | Uning ismi nima?',
    '  Es tut mir leid. | Juda afsusdaman.',
    '  Wie geht es dir? | Ahvoling qanday?',
    '- Falsch wäre: «Wie heißt sie?» → «U nima deb ataladi?»',
    '  (das fragt nach einem Gegenstand, nicht nach einem Menschen).',
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
  allowed: Set<string>;
  words: string[];
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
  let duplicates = 0;

  for (let tries = 0; tries < MAX_TRIES && kept.length < opts.count; tries++) {
    const need = opts.count - kept.length;
    const raw = await model.complete(
      buildSentencePrompt(opts.words, opts.examples, Math.ceil(need * OVERASK)),
    );

    for (const s of parseSentences(raw)) {
      if (kept.length >= opts.count) break;

      const key = normalizeForCompare(s.de);
      if (seen.has(key)) {
        duplicates++;
        continue;
      }

      const wordCount = wordFormsOf(s.de).length;
      if (wordCount < MIN_WORDS || wordCount > MAX_WORDS) {
        rejected.push({ de: s.de, unknown: [], reason: 'length' });
        continue;
      }

      const bad = unknownWords(s.de, opts.allowed);
      if (bad.length > 0) {
        rejected.push({ de: s.de, unknown: bad, reason: 'unknown' });
        continue;
      }

      seen.add(key);
      kept.push(s);
    }
  }

  return { kept, rejected, duplicates };
}
