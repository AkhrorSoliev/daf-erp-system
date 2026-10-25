import {
  chatDeepLink,
  isQuietHour,
  needsTelegram,
  noticeText,
} from './chat-notify.rules';

// Tashkent is UTC+5 all year: 17:00Z = 22:00, 03:00Z = 08:00.
describe('isQuietHour', () => {
  it.each([
    ['2026-10-25T16:59:00Z', false], // 21:59
    ['2026-10-25T17:00:00Z', true], //  22:00
    ['2026-10-25T22:00:00Z', true], //  03:00
    ['2026-10-26T02:59:00Z', true], //  07:59
    ['2026-10-26T03:00:00Z', false], // 08:00
  ])('%s -> %s', (iso, quiet) => {
    expect(isQuietHour(new Date(iso))).toBe(quiet);
  });
});

describe('needsTelegram', () => {
  const read = new Date('2026-10-25T10:00:00Z');
  it('is true when never notified', () => {
    expect(needsTelegram(null, null)).toBe(true);
    expect(needsTelegram({ notifiedAt: null }, read)).toBe(true);
  });
  it('is false while the last notice is still unread', () => {
    expect(
      needsTelegram({ notifiedAt: new Date('2026-10-25T11:00:00Z') }, read),
    ).toBe(false);
    expect(
      needsTelegram({ notifiedAt: new Date('2026-10-25T11:00:00Z') }, null),
    ).toBe(false);
  });
  it('is true again after the recipient read past the last notice', () => {
    expect(
      needsTelegram({ notifiedAt: new Date('2026-10-25T09:00:00Z') }, read),
    ).toBe(true);
  });
});

describe('texts', () => {
  it('escapes the name and never carries message content', () => {
    expect(noticeText('A <b>li')).toBe(
      '<b>A &lt;b&gt;li</b> sizga yangi xabar yubordi.',
    );
  });
  it('builds the Mini App deep link', () => {
    expect(chatDeepLink('https://student.dafzentrum.uz/tg', 'c1')).toBe(
      'https://student.dafzentrum.uz/tg?next=%2Fportal%2Fchat%2Fc1',
    );
    expect(chatDeepLink(undefined, 'c1')).toBeUndefined();
    expect(chatDeepLink('not a url', 'c1')).toBeUndefined();
  });
});
