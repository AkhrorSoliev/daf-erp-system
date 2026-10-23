import {
  groupPausedText,
  groupResumeDayText,
  groupResumedText,
} from './group-pause-text';

describe('group pause messages (CEO-approved 23.10.2026)', () => {
  it('pause with a restart day', () => {
    expect(
      groupPausedText({
        firstName: 'Madina',
        groupName: '#071',
        resumeDay: '2026-11-05',
        phone: '901234567',
      }),
    ).toBe(
      [
        "<b>⏸ Darslar vaqtincha to'xtatildi</b>",
        '',
        'Hurmatli Madina!',
        '',
        "<b>#071</b> guruhi darslari vaqtincha to'xtatildi.",
        'Darslar <b>05.11</b> dan qayta boshlanadi.',
        '',
        "To'xtagan kunlardagi darslar puli balansingizga qaytariladi.",
        '',
        "📞 Savollar bo'lsa: +998 90 123 45 67",
        '',
        'Rahmat!',
      ].join('\n'),
    );
  });

  it('pause without a restart day promises to tell when it is known', () => {
    const text = groupPausedText({
      firstName: 'Madina',
      groupName: '#071',
      resumeDay: null,
      phone: null,
    });
    expect(text).toContain(
      "Qayta boshlanish sanasi aniq bo'lishi bilan sizga xabar beramiz.",
    );
    expect(text).not.toContain('📞');
    expect(text).not.toContain('dan qayta boshlanadi');
  });

  it('a restart day set later', () => {
    expect(
      groupResumeDayText({
        firstName: 'Madina',
        groupName: '#071',
        resumeDay: '2026-11-12',
      }),
    ).toBe(
      [
        '<b>📅 Darslar boshlanish sanasi</b>',
        '',
        'Hurmatli Madina!',
        '',
        '<b>#071</b> guruhi darslari <b>12.11</b> dan qayta boshlanadi.',
        '',
        'Rahmat!',
      ].join('\n'),
    );
  });

  it('the group is back: first lesson with weekday and time', () => {
    expect(
      groupResumedText({
        firstName: 'Madina',
        groupName: '#071',
        firstLessonDay: '2026-11-05',
        firstLessonTime: '19:00',
      }),
    ).toBe(
      [
        '<b>▶️ Darslar qayta boshlanmoqda</b>',
        '',
        'Hurmatli Madina!',
        '',
        '<b>#071</b> guruhi darslari qayta boshlanadi.',
        'Birinchi dars: <b>05.11, payshanba, 19:00</b>.',
        '',
        "Oylik to'lov shu kundan boshlab hisoblanadi.",
        '',
        "Darslarda ko'rishguncha. Rahmat!",
      ].join('\n'),
    );
  });

  it('escapes a name that carries markup and greets a nameless student', () => {
    expect(
      groupResumeDayText({
        firstName: '<b>X</b>',
        groupName: 'A&B',
        resumeDay: '2026-11-12',
      }),
    ).toContain('Hurmatli &lt;b&gt;X&lt;/b&gt;!');
    expect(
      groupResumeDayText({
        firstName: '',
        groupName: 'A&B',
        resumeDay: '2026-11-12',
      }),
    ).toContain('Assalomu alaykum!');
  });

  it('leaves out the lesson time when the group has none', () => {
    expect(
      groupResumedText({
        firstName: 'A',
        groupName: 'G',
        firstLessonDay: '2026-11-05',
        firstLessonTime: null,
      }),
    ).toContain('<b>05.11, payshanba</b>');
  });
});
