import { notHeldGroupText } from './unmarked-lesson-text';
import { formatSum } from './format.util';

const base = {
  companyId: 1,
  branchId: 2,
  groupId: 'g1',
  groupName: '#014 <A1>',
  date: '2026-09-28',
  lessonStartTime: '16:00',
  lessonEndTime: '17:30',
  reason: 'Ustoz kasal',
  decidedById: 3,
};

describe('notHeldGroupText', () => {
  it('reports a cancelled lesson with the refund', () => {
    expect(
      notHeldGroupText(
        {
          ...base,
          outcome: 'CANCELLED',
          refundedStudents: 4,
          refundedAmount: 150000,
        },
        'Ali Valiyev',
      ),
    ).toBe(
      [
        "❌ <b>Dars bo'lmadi</b>",
        '👥 #014 &lt;A1&gt; — 28.09.2026 16:00–17:30',
        '📝 Sabab: Ustoz kasal',
        // formatSum separates thousands with a non-breaking space.
        `💰 Pul qaytarildi: 4 o'quvchi, ${formatSum(150000)}`,
        '👤 Belgilagan: Ali Valiyev',
      ].join('\n'),
    );
  });

  it('reports a moved lesson with its new time', () => {
    const text = notHeldGroupText(
      {
        ...base,
        outcome: 'RESCHEDULED',
        newDate: '2026-10-02',
        newLessonStartTime: '10:00',
        newLessonEndTime: '11:30',
      },
      'Ali Valiyev',
    );
    expect(text).toContain("📅 Ko'chirildi: 02.10.2026 10:00–11:30");
    expect(text).not.toContain('Pul qaytarildi');
  });

  it('escapes the name of the person who marked it', () => {
    const text = notHeldGroupText({ ...base, outcome: 'CANCELLED' }, 'A & <B>');
    expect(text).toContain('👤 Belgilagan: A &amp; &lt;B&gt;');
  });
});
