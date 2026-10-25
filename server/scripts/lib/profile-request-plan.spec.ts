import { PROFILE_REQUEST_MARKER } from '../../src/telegram/profile-request/profile-request-text';
import { UsageError } from './apply-expect-args';
import {
  buildPreviewMessages,
  parseProfileRequestArgs,
} from './profile-request-plan';

describe('parseProfileRequestArgs', () => {
  it('no args = dry run', () =>
    expect(parseProfileRequestArgs([])).toEqual({ mode: 'dry' }));
  it('reads --preview=<chatId>', () => {
    expect(parseProfileRequestArgs(['--preview=123456'])).toEqual({
      mode: 'preview',
      chatId: '123456',
    });
    expect(parseProfileRequestArgs(['--preview=-100123'])).toEqual({
      mode: 'preview',
      chatId: '-100123',
    });
  });
  it('reads --apply --expect=N', () =>
    expect(parseProfileRequestArgs(['--apply', '--expect=40'])).toEqual({
      mode: 'apply',
      expect: 40,
    }));
  it.each([
    [['--preview=abc']],
    [['--preview=']],
    [['--preview=1', '--apply', '--expect=2']],
    [['--preview=1', '--expect=2']],
    [['--apply']],
    [['--bogus']],
  ])('refuses %j', (argv) =>
    expect(() => parseProfileRequestArgs(argv)).toThrow(UsageError),
  );
});

describe('buildPreviewMessages', () => {
  const msgs = buildPreviewMessages();
  it('covers the three request variants and the bot replies', () => {
    expect(msgs.length).toBeGreaterThanOrEqual(4);
    expect(msgs.filter((m) => m.keyboard).length).toBe(3);
    const joined = msgs.map((m) => m.text).join('\n');
    expect(joined).toContain(
      "Kartangizda jinsingiz va tug'ilgan sanangiz yo'q",
    );
    expect(
      msgs.filter((m) => m.text.includes(PROFILE_REQUEST_MARKER)).length,
    ).toBe(3);
    expect(joined).toContain("Rahmat! Ma'lumotingiz saqlandi");
  });
  it('preview buttons never carry a student id', () => {
    for (const m of msgs) {
      const data = (m.keyboard?.reply_markup.inline_keyboard ?? [])
        .flat()
        .map((b: any) => b.callback_data);
      for (const d of data) expect(d).toMatch(/^pf:p:[gd]$/);
    }
  });
});
