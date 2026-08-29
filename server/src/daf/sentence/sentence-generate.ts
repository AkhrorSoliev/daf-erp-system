import type { TranslateModel } from '../translate/translate-model';
import { unknownWords } from './sentence-validate';

export interface GeneratedSentence {
  de: string;
  uz: string;
}

export const MAX_TRIES = 3;

/**
 * Gap so'rovi.
 *
 * Uchta qoida (GANZER Satz, Kopiere … NICHT, verschieden) brief'dagi
 * so'rovga 1-bo'limdagi birinchi yuritishdan KEYIN qo'shildi. Usiz model
 * lug'at ro'yxatining o'zini qaytarardi: 30 «gap»ning 18 tasi
 * «Hallo!», «Danke.», «Angenehm.» kabi bitta so'z edi. Ular
 * validatordan o'tadi (hamma so'z tanish), lekin mashq emas — o'quvchi
 * ularni allaqachon lug'at kartochkasida ko'rgan. Ya'ni validator
 * «notanish so'z yo'q»ni tekshiradi, «bu gapmi?»ni emas; ikkinchisi
 * so'rovning zimmasida.
 *
 * O'zbekcha qatorga alohida talab bor, chunki birinchi yuritishda
 * «Es tut mir leid» → «Meni afsuslantiradi» chiqdi: so'zma-so'z to'g'ri,
 * ma'no jihatdan noto'g'ri.
 */
export function buildSentencePrompt(
  words: string[],
  examples: string[],
  count: number,
): string {
  return [
    `Du bist Deutschlehrer. Schreibe ${count} kurze A1-Sätze (3–7 Wörter).`,
    '',
    'Regeln:',
    '- Benutze NUR diese Wörter und die häufigsten Funktionswörter:',
    words.join(', '),
    '- Jeder Satz muss natürlich und grammatisch korrekt sein.',
    '- Keine Eigennamen außer den unten gezeigten.',
    '- Jeder Satz ist ein GANZER Satz (Aussage oder Frage) mit Subjekt und',
    '  konjugiertem Verb und hat MINDESTENS 3 Wörter. Einzelne Wörter,',
    '  Grußformeln und Wortlisten sind KEINE Sätze.',
    '- Kopiere die Wortliste NICHT ab — bilde neue Sätze aus ihren Wörtern.',
    `- Alle ${count} Sätze sind verschieden.`,
    '- Die usbekische Zeile ist eine natürliche Übersetzung des Sinns,',
    '  keine Wort-für-Wort-Abbildung.',
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

export function parseSentences(raw: string): GeneratedSentence[] {
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.includes('|'))
    .map((l) => {
      const [de, uz] = l.split('|');
      return { de: de.trim(), uz: uz.trim() };
    })
    .filter((s) => s.de.length > 0 && s.uz.length > 0);
}

export interface GenerateOpts {
  allowed: Set<string>;
  words: string[];
  examples: string[];
  count: number;
}

/**
 * Bo'lim uchun gaplar. Rad etilgan gap qayta so'raladi, lekin ko'pi
 * bilan `MAX_TRIES` marta — cheksiz urinish skriptni qotirib qo'yardi.
 */
export async function generateForUnit(
  model: TranslateModel,
  opts: GenerateOpts,
): Promise<{
  kept: GeneratedSentence[];
  rejected: { de: string; unknown: string[] }[];
}> {
  const kept: GeneratedSentence[] = [];
  const rejected: { de: string; unknown: string[] }[] = [];

  for (let tries = 0; tries < MAX_TRIES && kept.length < opts.count; tries++) {
    const need = opts.count - kept.length;
    const raw = await model.complete(
      buildSentencePrompt(opts.words, opts.examples, need),
    );

    for (const s of parseSentences(raw)) {
      if (kept.length >= opts.count) break;
      const bad = unknownWords(s.de, opts.allowed);
      if (bad.length > 0) {
        rejected.push({ de: s.de, unknown: bad });
        continue;
      }
      kept.push(s);
    }
  }

  return { kept, rejected };
}
