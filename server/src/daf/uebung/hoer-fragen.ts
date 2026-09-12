import { dialogBelegt, mischen } from './dialog-fragen';
import type { MediaUrlResolver } from './wort-fragen';
import {
  materialSchluessel,
  type Frage,
  type MaterialDialog,
} from './frage.types';

/**
 * `HOEREN_WAHL` — suhbatni eshitib, tushunish savoliga javob berish.
 *
 * SUHBAT MATNI SAVOLDA YO'Q: `prompt` — savolning o'zi (`frageDe`),
 * `hilfe` — o'zbekchasi, `audioUrl` — butun suhbat. Matn faqat javobdan
 * keyin (`pruefen` → `transkript`) ochiladi — aks holda bu o'qish
 * mashqi bo'lib qolardi.
 *
 * AUDIOSIZ QURILMAYDI (`audioKey` yoki resolver `null`): so'z audiosidagi
 * qoida — `R2_PUBLIC_URL` sozlanmagan bazada xom kalit sizmaydi,
 * format ovoz yasalmaguncha o'z-o'zidan o'chiq turadi.
 *
 * `belegteItems` suhbatning HAMMA satrini oladi (`dialogBelegt`) —
 * `DIALOG_LUECKE` bilan bir seansga tushmasin.
 */
export function hoerenWahl(
  dialog: MaterialDialog,
  rnd: () => number,
  mediaUrl: MediaUrlResolver,
): Frage | null {
  if (!dialog.audioKey || dialog.fragen.length === 0) return null;
  const audioUrl = mediaUrl(dialog.audioKey);
  if (!audioUrl) return null;

  const frage = dialog.fragen[Math.floor(rnd() * dialog.fragen.length)];

  return {
    format: 'HOEREN_WAHL',
    itemType: 'HOERFRAGE',
    itemId: frage.id,
    prompt: frage.frageDe,
    hilfe: frage.frageUz,
    options: mischen([frage.richtig, ...frage.falsch], rnd),
    richtig: frage.richtig,
    akzeptiert: [],
    belegteItems: [
      ...dialogBelegt(dialog),
      materialSchluessel('HOERFRAGE', frage.id),
    ],
    titel: dialog.titelDe,
    audioUrl,
  };
}
