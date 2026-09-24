import { truncateChars } from '../common/utils/text.util';

/**
 * Telegram rejects message text over 4096 characters ("message is too
 * long"). Parts are cut below that with room to spare.
 */
export const TELEGRAM_TEXT_LIMIT = 4000;

export interface DigestBlock {
  /**
   * Self-contained HTML — every tag it opens, it closes — so a part boundary
   * between blocks can never break markup. May span several lines. '' is a
   * blank line.
   */
  text: string;
  /** Queue rows this block shows. Empty for headers and spacers. */
  itemIds: string[];
  /** Headers set this so they never end a part without what follows them. */
  keepWithNext?: boolean;
}

export interface TelegramPart {
  text: string;
  itemIds: string[];
}

export const spacer = (): DigestBlock => ({ text: '', itemIds: [] });

export const header = (text: string): DigestBlock => ({
  text,
  itemIds: [],
  keepWithNext: true,
});

/**
 * Code-point-safe clip with an ellipsis. Free text is clipped before it is
 * rendered so that no single line can approach the Telegram limit.
 */
export function clipText(text: string, maxChars: number): string {
  const clipped = truncateChars(text, maxChars);
  return clipped === text ? text : `${clipped}...`;
}

/**
 * Last-resort guard for one block longer than a whole message. Upstream
 * clipping should make this unreachable; if it happens, the block loses its
 * formatting instead of the whole message being rejected by Telegram.
 */
export function clampBlock(text: string, limit: number): string {
  if (text.length <= limit) return text;
  let plain = truncateChars(text.replace(/<[^>]*>/g, ''), limit - 1);
  const amp = plain.lastIndexOf('&');
  if (amp > plain.lastIndexOf(';')) plain = plain.slice(0, amp);
  return `${plain}…`;
}

/**
 * Packs blocks into as few messages as possible, each at most `limit`
 * characters, splitting only between blocks. Parts never start or end with a
 * blank line, and a run of `keepWithNext` blocks moves to the next part
 * together with the first block after it.
 */
export function packBlocks(
  blocks: DigestBlock[],
  limit: number = TELEGRAM_TEXT_LIMIT,
): TelegramPart[] {
  const parts: TelegramPart[] = [];
  let lines: string[] = [];
  let ids: string[] = [];
  let length = 0;

  const flush = () => {
    while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    if (lines.length > 0) parts.push({ text: lines.join('\n'), itemIds: ids });
    lines = [];
    ids = [];
    length = 0;
  };

  for (let i = 0; i < blocks.length; i += 1) {
    const text = clampBlock(blocks[i].text, limit);
    if (text === '' && lines.length === 0) continue;

    // A header travels with everything up to and including the first
    // non-header block after it — a section header, a branch sub-header and
    // the first line under them move as one.
    let needed = text.length;
    for (let j = i; blocks[j].keepWithNext && j + 1 < blocks.length; j += 1) {
      needed += 1 + clampBlock(blocks[j + 1].text, limit).length;
    }
    if (lines.length > 0 && length + 1 + needed > limit) flush();
    if (text === '' && lines.length === 0) continue;

    length += (lines.length > 0 ? 1 : 0) + text.length;
    lines.push(text);
    ids.push(...blocks[i].itemIds);
  }
  flush();
  return parts;
}
