import {
  resolvedLessonAlertText,
  type LessonOutcome,
} from './lesson-alert-telegram';

const DETAILS =
  "👥 Guruh: Deutsch A1\n🕐 Vaqt: 09:00–10:30\n🚪 Xona: 201-xona\n👨‍🏫 O'qituvchi: Ali Valiev";

const alert = (over: Partial<{ title: string; message: string }> = {}) => ({
  title: "O'qituvchi hali davomat olmadi",
  message: `👀 Dars tugashiga 30 daqiqa qoldi\n\n${DETAILS}\n\nIltimos, o'qituvchini ogohlantiring.\n🔗 https://admin.dafzentrum.uz`,
  ...over,
});

// 05:47Z is 10:47 in Tashkent (UTC+5).
const AT = new Date('2026-10-16T05:47:00Z');

describe('resolvedLessonAlertText', () => {
  it('keeps the lesson details in a blockquote and names the old message', () => {
    expect(resolvedLessonAlertText(alert(), 'TAKEN', AT)).toBe(
      '<b>✅ Davomat olindi · 10:47</b>\n' +
        `<blockquote>${DETAILS}</blockquote>\n` +
        "<i>Avvalgi xabar: O'qituvchi hali davomat olmadi</i>",
    );
  });

  it.each<[LessonOutcome, string]>([
    ['TAKEN', '✅ Davomat olindi · 10:47'],
    ['CANCELLED', '❌ Dars bekor qilindi · 10:47'],
    ['MOVED', "🔀 Dars ko'chirildi · 10:47"],
    ['HELD', "✅ «Bo'ldi» deb belgilandi · 10:47"],
    ['NOT_HELD', "❌ «Bo'lmadi» deb belgilandi · 10:47"],
    ['CLOSED', '☑️ Savol yopildi'],
    ['GROUP_DELETED', "🗑 Guruh o'chirildi"],
    ['EXPIRED', '☑️ Yopildi'],
  ])('%s has its own headline', (outcome, head) => {
    expect(resolvedLessonAlertText(alert(), outcome, AT)).toMatch(
      new RegExp(`^<b>${head.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</b>\n`),
    );
  });

  it('escapes < and & in the title and the details', () => {
    const text = resolvedLessonAlertText(
      alert({
        title: 'A & B <x>',
        message: `head\n\n👥 Guruh: <A1> & co\n\ntail`,
      }),
      'TAKEN',
      AT,
    );
    expect(text).toContain(
      '<blockquote>👥 Guruh: &lt;A1&gt; &amp; co</blockquote>',
    );
    expect(text).toContain('<i>Avvalgi xabar: A &amp; B &lt;x&gt;</i>');
  });

  it('leaves the blockquote out when the message has no details block', () => {
    expect(
      resolvedLessonAlertText(alert({ message: 'just one line' }), 'TAKEN', AT),
    ).toBe(
      '<b>✅ Davomat olindi · 10:47</b>\n' +
        "<i>Avvalgi xabar: O'qituvchi hali davomat olmadi</i>",
    );
  });

  it('prints the time on the Tashkent clock, zero-padded', () => {
    expect(
      resolvedLessonAlertText(
        alert(),
        'TAKEN',
        new Date('2026-10-16T19:05:00Z'),
      ),
    ).toMatch(/^<b>✅ Davomat olindi · 00:05<\/b>/);
  });
});
