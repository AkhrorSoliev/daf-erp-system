import { escapeHtml } from '../telegram-groups/utils/format.util';

/** Telegram xabari 4096 belgidan oshmasin: tarix shundan oldin qisqartiriladi. */
const MAX_MESSAGE_CHARS = 3800;
const LETTERS = ['A', 'B', 'C', 'D'] as const;

/** Javob berilgan savolning tarixdagi qatori. `picked: null` — vaqt tugagan. */
export interface QuizLogLine {
  n: number;
  text: string;
  picked: string | null;
}

/** Hozir javob kutilayotgan savol. */
export interface QuizCurrent {
  n: number;
  text: string;
  options: string[];
  /** Savolga berilgan jami soniya va hozir qolgani. */
  seconds: number;
  remaining: number;
}

export const optionLetter = (index: number): string => LETTERS[index] ?? '?';

/** `▰▰▰▱▱`: `filled` ta to'la katak, qolgani bo'sh. */
export function bar(filled: number, cells: number, on: string, off: string) {
  const f = Math.max(0, Math.min(cells, filled));
  return on.repeat(f) + off.repeat(cells - f);
}

/** Qolgan vaqt chizig'i: `⏱ ████████░░  14 s`. */
export function timeLine(remaining: number, seconds: number): string {
  const cells = 10;
  const filled = remaining <= 0 ? 0 : Math.ceil((remaining / seconds) * cells);
  return `⏱ ${bar(filled, cells, '█', '░')}  ${Math.max(0, remaining)} s`;
}

function historyBlock(log: QuizLogLine[]): string {
  if (log.length === 0) return '';
  const lines = log.map((l) => {
    const answer =
      l.picked === null
        ? '<i>⏱ javobsiz</i>'
        : `<b>${escapeHtml(l.picked)}</b>`;
    return `${l.n}. ${escapeHtml(l.text)} → ${answer}`;
  });
  // Uzun tarix yig'ilib turadi: ochilmaguncha qisqa ko'rinadi.
  return `<blockquote expandable>${lines.join('\n')}</blockquote>`;
}

function currentBlock(c: QuizCurrent): string {
  const options = c.options
    .map((o, i) => `<b>${optionLetter(i)}</b>  ${escapeHtml(o)}`)
    .join('\n');
  return [
    `<b>Savol ${c.n}</b>`,
    `<b>${escapeHtml(c.text)}</b>`,
    '',
    options,
    '',
    timeLine(c.remaining, c.seconds),
  ].join('\n');
}

/**
 * Test davomida YAGONA xabar: tepada sarlavha va umumiy jarayon, keyin
 * javob berilgan savollar (tahrirlanib to'planib boradi), pastda hozirgi savol,
 * variantlar va qolgan vaqt. `current` bo'lmasa — test tugagan ko'rinish.
 *
 * To'g'ri javob hech qayerda ko'rsatilmaydi, faqat odam tanlagani.
 */
export function renderQuiz(
  log: QuizLogLine[],
  current: QuizCurrent | null,
  total: number,
): string {
  const build = (shown: QuizLogLine[], hidden: number): string => {
    const head = current
      ? `📊 <b>Daraja testi</b> · <b>${current.n}</b> / ${total}`
      : `📊 <b>Daraja testi</b> · tugadi`;
    const parts = [head, bar(log.length, total, '▰', '▱')];
    if (hidden > 0) {
      parts.push('', `<i>… oldingi ${hidden} ta savol yashirildi</i>`);
    }
    const history = historyBlock(shown);
    if (history) parts.push('', history);
    if (current) parts.push('', currentBlock(current));
    return parts.join('\n');
  };

  let hidden = 0;
  let text = build(log, hidden);
  while (text.length > MAX_MESSAGE_CHARS && hidden < log.length) {
    hidden += 1;
    text = build(log.slice(hidden), hidden);
  }
  return text;
}
