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
  it('is the one request message plus the bot explainer', () => {
    expect(msgs).toHaveLength(2);
    expect(msgs.filter((m) => m.keyboard)).toHaveLength(1);
    expect(
      msgs.filter((m) => m.text.includes(PROFILE_REQUEST_MARKER)),
    ).toHaveLength(1);
    expect(msgs[0].text).toContain('Assalomu alaykum, Aziz!');
    const joined = msgs.map((m) => m.text).join('\n');
    expect(joined).toContain("Rahmat! Ma'lumotingiz saqlandi");
    expect(joined).not.toContain('KK.OO');
  });
  it('the only preview button opens the wizard on student id 0', () => {
    const data = (msgs[0].keyboard?.reply_markup.inline_keyboard ?? [])
      .flat()
      .map((b: any) => b.callback_data);
    expect(data).toEqual(['pf:s:0']);
  });
});
