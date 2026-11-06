import {
  AudienceStudent,
  PHONE_VERIFY_MARKER,
  buildPhoneVerifyKeyboard,
  buildPhoneVerifyText,
  greetingName,
  groupByChat,
} from './phone-verify-request-plan';

const st = (over: Partial<AudienceStudent>): AudienceStudent => ({
  id: 10001,
  firstName: 'Aziz',
  companyId: 1,
  telegramChatId: '111',
  phone: '901234567',
  verifiedPhone: null,
  ...over,
});

describe('buildPhoneVerifyText', () => {
  it('greets by name, escapes it, never mentions SMS or a code', () => {
    const t = buildPhoneVerifyText('<b>Ali</b>');
    expect(t).toContain('Assalomu alaykum, &lt;b&gt;Ali&lt;/b&gt;!');
    expect(t).toContain(PHONE_VERIFY_MARKER);
    expect(t).not.toMatch(/sms|kod/i);
  });
  it('has no name for a shared chat', () =>
    expect(buildPhoneVerifyText(null).startsWith('Assalomu alaykum! ')).toBe(
      true,
    ));
});

describe('buildPhoneVerifyKeyboard', () => {
  it('is one web_app button with the Mini App url', () => {
    const rows = buildPhoneVerifyKeyboard('https://student.example/tg')
      .reply_markup.inline_keyboard;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveLength(1);
    expect((rows[0][0] as any).web_app.url).toBe('https://student.example/tg');
  });
});

describe('groupByChat', () => {
  it('skips proved, foreign and already-sent students', () => {
    const out = groupByChat(
      [
        st({ id: 1 }),
        st({ id: 2, telegramChatId: '222', verifiedPhone: '901234567' }),
        st({ id: 3, telegramChatId: '333', phone: '4915112345678' }),
        st({ id: 4, telegramChatId: '444' }),
      ],
      new Set([4]),
    );
    expect(out.map((t) => t.chatId)).toEqual(['111']);
  });
  it('a verified number from before a phone change counts as unproved', () =>
    expect(
      groupByChat([st({ verifiedPhone: '909999999' })], new Set()),
    ).toHaveLength(1));
  it('one message per chat; name only when the chat holds one student', () => {
    const out = groupByChat(
      [st({ id: 1 }), st({ id: 2, firstName: 'Laylo' })],
      new Set(),
    );
    expect(out).toHaveLength(1);
    expect(out[0].students.map((s) => s.id)).toEqual([1, 2]);
    expect(greetingName(out[0])).toBeNull();
    expect(greetingName({ chatId: '1', students: [st({})] })).toBe('Aziz');
  });
});
