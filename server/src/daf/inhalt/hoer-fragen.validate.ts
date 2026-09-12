import { normalisieren } from '../uebung/antwort';
import { tokensOf } from './progression';
import type { Dialog } from './unit-inhalt.types';

/** Har dialogda aniq shuncha savol — dizayn 4.2. */
export const FRAGEN_PRO_DIALOG = 2;

/**
 * «To'g'ri javob suhbatda aytilgan» tekshiruvida HISOBGA OLINMAYDIGAN
 * so'zlar: artikl, old ko'makchi, `sein` shakllari, olmosh, bog'lovchi.
 *
 * `hilfswoerter.json` EMAS — u yerda atoqli otlar ham bor, «Lena»
 * esa aynan tekshirilishi kerak bo'lgan javob. Ro'yxat ataylab qisqa
 * va yopiq: kengaytirish qoidani bo'shatadi.
 */
const SCHWACHE_WOERTER = new Set([
  'der',
  'die',
  'das',
  'ein',
  'eine',
  'den',
  'dem',
  'in',
  'aus',
  'ist',
  'sind',
  'bin',
  'bist',
  'er',
  'sie',
  'es',
  'ich',
  'du',
  'wir',
  'ihr',
  'und',
  'oder',
  'nicht',
  'ja',
  'nein',
  'auch',
  'sehr',
]);

const NICHT_LATEIN = /[Ѐ-ԯ؀-ۿ]/;

/**
 * Bitta dialogning eshitish savollari qoidalari (dizayn 4.2).
 *
 * `unbekannt` — progressiya funksiyasi: matndagi hali o'rgatilmagan
 * so'zlarni qaytaradi. Bu yerda EMAS, chaqiruvchida quriladi (bo'lim
 * tartibi va yordamchi so'zlar u yerda ma'lum) — validator sof qoladi.
 */
export function validateHoerFragen(
  dialog: Dialog,
  unbekannt: (text: string) => string[],
): string[] {
  const problems: string[] = [];
  const fragen = dialog.fragen ?? [];

  if (fragen.length !== FRAGEN_PRO_DIALOG) {
    problems.push(
      `${dialog.id}: ${fragen.length} ta savol — aniq ${FRAGEN_PRO_DIALOG} kerak`,
    );
  }

  // Suhbatda aytilgan so'zlar — `normalisieren` bilan, grading kabi.
  const gesagt = new Set(
    dialog.zeilen.flatMap((z) => tokensOf(normalisieren(z.de))),
  );

  fragen.forEach((f, i) => {
    const code = `${dialog.id}-f${i + 1}`;
    const varianten = [f.richtig, ...f.falsch];

    if (varianten.length !== 3) {
      problems.push(
        `${code}: ${varianten.length} variant — 3 kerak (richtig + 2 falsch)`,
      );
    }

    const gesehen = new Set<string>();
    for (const v of varianten) {
      const n = normalisieren(v);
      if (gesehen.has(n)) {
        problems.push(`${code}: variantlar har xil emas — «${v}» takror`);
      }
      gesehen.add(n);
    }

    const fremd = [
      ...unbekannt(f.frageDe),
      ...varianten.flatMap((v) => unbekannt(v)),
    ];
    if (fremd.length > 0) {
      problems.push(
        `${code}: notanish so\`z — ${[...new Set(fremd)].join(', ')}`,
      );
    }

    if (f.frageUz.trim() === '') {
      problems.push(`${code}: frageUz bo\`sh`);
    } else if (NICHT_LATEIN.test(f.frageUz)) {
      problems.push(`${code}: frageUz lotin alifbosida emas`);
    }

    // Qo'pol tekshiruv: javobning kamida bitta MAZMUNLI so'zi suhbatda
    // aytilgan bo'lsin. Mazmunli so'z yo'q bo'lsa («ja») — odam ko'radi.
    const stark = tokensOf(normalisieren(f.richtig)).filter(
      (t) => !SCHWACHE_WOERTER.has(t),
    );
    if (stark.length > 0 && !stark.some((t) => gesagt.has(t))) {
      problems.push(
        `${code}: to\`g\`ri javob «${f.richtig}» suhbatda aytilmagan`,
      );
    }
  });

  return problems;
}
