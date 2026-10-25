import {
  ALREADY_FILLED,
  THANKS,
  buildRequestKeyboard,
  buildRequestText,
} from '../../src/telegram/profile-request/profile-request-text';
import { YEAR_PROMPT } from '../../src/telegram/profile-request/profile-date-picker';
import { UsageError, parseApplyExpectArgs } from './apply-expect-args';

export type RunMode =
  | { mode: 'dry' }
  | { mode: 'preview'; chatId: string }
  | { mode: 'apply'; expect: number };

const USAGE =
  'Usage: send-profile-request.ts [--preview=<chatId> | --apply --expect=<N>]';

export function parseProfileRequestArgs(argv: string[]): RunMode {
  const preview = argv.find((a) => a.startsWith('--preview='));
  if (preview) {
    if (argv.length !== 1) {
      throw new UsageError(
        `--preview cannot be combined with others. ${USAGE}`,
      );
    }
    const chatId = preview.slice('--preview='.length);
    if (!/^-?\d+$/.test(chatId)) {
      throw new UsageError(`--preview needs a numeric chat id. ${USAGE}`);
    }
    return { mode: 'preview', chatId };
  }
  const { apply, expect } = parseApplyExpectArgs(argv, USAGE);
  if (apply) return { mode: 'apply', expect: expect as number };
  if (expect !== null) {
    throw new UsageError(`--expect only goes with --apply. ${USAGE}`);
  }
  return { mode: 'dry' };
}

/**
 * CEO o'z chatida ko'radigan to'plam: bitta so'rov xabari (tugmasi haqiqiy
 * savol-javobni ochadi, lekin hech narsa yozilmaydi) va botning javoblari.
 */
export function buildPreviewMessages() {
  return [
    {
      text: buildRequestText('Aziz'),
      keyboard: buildRequestKeyboard('preview'),
    },
    {
      text:
        '👁 <b>Botning javoblari</b> (namuna):\n\n' +
        "Tugma bosilgach: jins savoli (faqat jinsi yo'q o'quvchiga)\n" +
        `Keyin: ${YEAR_PROMPT} — yil, oy, kun tugmalari\n` +
        "Keyin: «Tekshirib ko'ring» — jins va sana, «Ha, saqlash»\n" +
        `Saqlangach: ${THANKS}\n` +
        `Eski tugma bosilsa: ${ALREADY_FILLED}`,
    },
  ];
}
