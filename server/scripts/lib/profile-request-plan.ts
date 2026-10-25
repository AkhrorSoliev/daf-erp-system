import {
  ALREADY_FILLED,
  DATE_PROMPT,
  GENDER_SAVED,
  THANKS,
  buildRequestKeyboard,
  buildRequestText,
} from '../../src/telegram/profile-request/profile-request-text';
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
 * CEO o'z chatida ko'radigan to'plam: uch so'rov varianti (tugmalari bosilsa
 * hech narsa yozilmaydi) va botning javob matnlari.
 */
export function buildPreviewMessages() {
  const name = 'Aziz';
  return [
    {
      text: buildRequestText(name, ['gender', 'dateOfBirth']),
      keyboard: buildRequestKeyboard('preview', ['gender', 'dateOfBirth']),
    },
    {
      text: buildRequestText(name, ['gender']),
      keyboard: buildRequestKeyboard('preview', ['gender']),
    },
    {
      text: buildRequestText(name, ['dateOfBirth']),
      keyboard: buildRequestKeyboard('preview', ['dateOfBirth']),
    },
    {
      text:
        '👁 <b>Botning javoblari</b> (namuna):\n\n' +
        `Jins tanlangach: ${GENDER_SAVED}\n` +
        `Keyin: ${DATE_PROMPT}\n` +
        `Sana saqlangach: ${THANKS}\n` +
        `Eski tugma bosilsa: ${ALREADY_FILLED}\n` +
        "Sana xato bo'lsa (masalan 01.01.2030): Tug'ilgan sana kelajakda bo'lishi mumkin emas",
    },
  ];
}
