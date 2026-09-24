import {
  clampBlock,
  clipText,
  DigestBlock,
  header,
  packBlocks,
  spacer,
} from './telegram-message-parts';

const line = (text: string, ...itemIds: string[]): DigestBlock => ({
  text,
  itemIds,
});

describe('packBlocks', () => {
  it('returns no parts for no blocks', () => {
    expect(packBlocks([])).toEqual([]);
  });

  it('joins short blocks into one part and keeps their item ids in order', () => {
    const parts = packBlocks([
      header('<b>A</b>'),
      line('• one', 'r1'),
      spacer(),
      line('• two', 'r2', 'r3'),
    ]);
    expect(parts).toEqual([
      { text: '<b>A</b>\n• one\n\n• two', itemIds: ['r1', 'r2', 'r3'] },
    ]);
  });

  it('splits at block boundaries so no part exceeds the limit', () => {
    const parts = packBlocks(
      [
        line('x'.repeat(30), 'r1'),
        line('y'.repeat(30), 'r2'),
        line('z'.repeat(30), 'r3'),
      ],
      70,
    );
    expect(parts.map((p) => p.itemIds)).toEqual([['r1', 'r2'], ['r3']]);
    for (const p of parts) expect(p.text.length).toBeLessThanOrEqual(70);
  });

  it('moves a header to the next part together with its first line', () => {
    const parts = packBlocks(
      [
        line('x'.repeat(50), 'r1'),
        header('H'.repeat(10)),
        line('y'.repeat(30), 'r2'),
      ],
      70,
    );
    expect(parts[0].text).toBe('x'.repeat(50));
    expect(parts[1].text).toBe(`${'H'.repeat(10)}\n${'y'.repeat(30)}`);
  });

  it('moves a chain of headers to the next part together with the first line', () => {
    const parts = packBlocks(
      [
        line('x'.repeat(40), 'r1'),
        header('H'.repeat(10)),
        header('B'.repeat(10)),
        line('y'.repeat(20), 'r2'),
      ],
      70,
    );
    expect(parts[0].text).toBe('x'.repeat(40));
    expect(parts[1].text).toBe(
      `${'H'.repeat(10)}\n${'B'.repeat(10)}\n${'y'.repeat(20)}`,
    );
  });

  it('never starts or ends a part with a blank line', () => {
    const parts = packBlocks(
      [
        spacer(),
        line('x'.repeat(50), 'r1'),
        spacer(),
        line('y'.repeat(50), 'r2'),
        spacer(),
      ],
      70,
    );
    expect(parts.map((p) => p.text)).toEqual(['x'.repeat(50), 'y'.repeat(50)]);
  });

  it('clamps a single block longer than the limit instead of letting Telegram reject it', () => {
    const parts = packBlocks([line(`<b>${'a'.repeat(100)}</b>`, 'r1')], 40);
    expect(parts).toHaveLength(1);
    expect(parts[0].text.length).toBeLessThanOrEqual(40);
    expect(parts[0].text).not.toContain('<b>');
    expect(parts[0].itemIds).toEqual(['r1']);
  });
});

describe('clampBlock', () => {
  it('returns short text untouched', () => {
    expect(clampBlock('<b>ok</b>', 40)).toBe('<b>ok</b>');
  });

  it('never cuts an HTML entity in half', () => {
    const out = clampBlock(`${'a'.repeat(8)}&amp;${'b'.repeat(20)}`, 11);
    expect(out).toBe(`${'a'.repeat(8)}…`);
  });
});

describe('clipText', () => {
  it('leaves short text alone', () => {
    expect(clipText('salom', 10)).toBe('salom');
  });

  it('clips long text with an ellipsis', () => {
    expect(clipText('abcdefghij', 4)).toBe('abcd...');
  });

  it('never splits a surrogate pair', () => {
    expect(clipText('ab📄cd', 3)).toBe('ab📄...');
  });
});
