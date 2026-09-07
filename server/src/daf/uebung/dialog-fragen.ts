import { normalisieren } from './antwort';
import {
  materialSchluessel,
  type Frage,
  type MaterialDialog,
  type MaterialDialogZeile,
} from './frage.types';

/** Savol qurish uchun dialogda kamida shuncha satr bo'lishi shart. */
const MIN_ZEILEN = 4;

function mischen<T>(items: T[], rnd: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Dialogdan bir satr olib tashlanadi — o'quvchi qolgan suhbatdan kelib
 * chiqib, o'sha o'rinda nima aytilgan bo'lishi mumkinligini topadi.
 *
 * BIRINCHI SATR HECH QACHON OLIB TASHLANMAYDI: usiz suhbat kontekstsiz
 * boshlanadi va topshiriq "nima gaplashilyapti" degan taxminga aylanadi.
 * Bu qoida tanlov puliga QAT'IY YOZILGAN — nomzod ro'yxati
 * `zeilen.slice(1)` dan tuziladi, ya'ni tasodifiy generator qanchalik
 * yomon bo'lmasin (hatto doim bir xil qiymat qaytarsa ham) birinchi
 * satr hech qachon tanlanmaydi.
 *
 * CHALG'ITUVCHILAR FAQAT BOSHQA DIALOGLARDAN (`andere`): shu dialogning
 * o'z satri chalg'ituvchi bo'lsa, u ko'p hollarda kontekstga HAQIQATDA
 * mos keladi (masalan boshqa satr ham "salomlashish" bo'lishi mumkin),
 * ya'ni "xato" javob aslida to'g'ri bo'lib chiqishi mumkin edi. Shuning
 * uchun shu dialogning satrlari `andere`dan chiqarib tashlanadi — hatto
 * chaqiruvchi ularni chetlab o'tishni unutgan taqdirda ham (himoya
 * qatlami, `wort-fragen.ts`dagi `ablenker`ga o'xshash).
 *
 * `normalisieren` bilan solishtiriladi — grading ham shu funksiya orqali
 * ishlaydi, xom teng emas solishtirilsa richtigdan faqat tinish belgisi
 * bilan farq qiladigan chalg'ituvchi ham "to'g'ri" bo'lib qolardi
 * (`satzUebersetzen`dagi bir xil sabab).
 */
export function dialogLuecke(
  dialog: MaterialDialog,
  andere: MaterialDialogZeile[],
  rnd: () => number,
): Frage | null {
  if (dialog.zeilen.length < MIN_ZEILEN) return null;

  // Birinchidan boshqa har qanday satr — pastga qarang, nega bu yerda
  // chegaralanishi shart.
  const nomzodlar = dialog.zeilen.slice(1);
  const ziel = mischen(nomzodlar, rnd)[0];

  const eigeneIds = new Set(dialog.zeilen.map((z) => z.id));
  const zielNorm = normalisieren(ziel.de);
  const falschKandidaten = andere
    .filter((z) => !eigeneIds.has(z.id) && normalisieren(z.de) !== zielNorm)
    .map((z) => z.de);
  const falsch = [...new Set(falschKandidaten)];
  if (falsch.length < 3) return null;

  // Butun suhbat — bo'shatilgan satr o'rnida `___`. To'g'ri javob (ziel.de)
  // boshqa hech qanday qatorda chiqmasligi kerak, aks holda savol o'zi
  // javob berib qo'yardi.
  const prompt = dialog.zeilen
    .map((z) =>
      z.id === ziel.id ? `${z.sprecher}: ___` : `${z.sprecher}: ${z.de}`,
    )
    .join('\n');

  return {
    format: 'DIALOG_LUECKE',
    itemType: 'DIALOGZEILE',
    itemId: ziel.id,
    prompt,
    hilfe: null,
    options: mischen([ziel.de, ...mischen(falsch, rnd).slice(0, 3)], rnd),
    richtig: ziel.de,
    akzeptiert: [],
    belegteItems: [materialSchluessel('DIALOGZEILE', ziel.id)],
  };
}
