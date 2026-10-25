import { dialogBelegt, mischen } from './dialog-fragen';
import {
  materialSchluessel,
  type Frage,
  type MaterialDialog,
} from './frage.types';

/** O'qish matni turlari — audiosi yo'q, `HOEREN_WAHL` emas, `LESEN_WAHL`. */
const LESE_ARTEN = ['CHAT', 'TEXT', 'TABELLE'] as const;
type LeseArt = (typeof LESE_ARTEN)[number];

const istLeseArt = (art: string | undefined): art is LeseArt =>
  (LESE_ARTEN as readonly string[]).includes(art ?? '');

/**
 * `LESEN_WAHL` — matnni o'qib, tushunish savoliga javob berish.
 *
 * `HOEREN_WAHL`ning matnli ikkilamchisi: savol, javob va chalg'ituvchilar
 * bir xil material (`DafHoerFrage`), farqi — matn savol bilan birga ko'rinadi
 * (`lesetext`), ovoz o'rniga. O'zbekcha tarjima yuborilmaydi: u javobdan
 * keyin ochiladi (`pruefen` → `transkript`).
 *
 * Audio matn (`DIALOG`, `ANSAGE`) uchun QURILMAYDI: u eshitish materiali va
 * matnini ko'rsatish eshitish mashqini o'qish mashqiga aylantirardi.
 *
 * `belegteItems` matnning HAMMA satrini oladi (`dialogBelegt`) — bir matnning
 * ikki savoli bir seansga tushmasin.
 */
export function lesenWahl(
  text: MaterialDialog,
  rnd: () => number,
): Frage | null {
  if (!istLeseArt(text.art) || text.fragen.length === 0) return null;

  const frage = text.fragen[Math.floor(rnd() * text.fragen.length)];

  return {
    format: 'LESEN_WAHL',
    itemType: 'HOERFRAGE',
    itemId: frage.id,
    prompt: frage.frageDe,
    hilfe: frage.frageUz,
    options: mischen([frage.richtig, ...frage.falsch], rnd),
    richtig: frage.richtig,
    akzeptiert: [],
    belegteItems: [
      ...dialogBelegt(text),
      materialSchluessel('HOERFRAGE', frage.id),
    ],
    audioUrl: null,
    lesetext: {
      art: text.art,
      titel: text.titelDe,
      sahnaUz: text.sahnaUz ?? null,
      zeilen: text.zeilen.map((z) => ({ sprecher: z.sprecher, de: z.de })),
    },
  };
}
