import {
  ACTIVE_ENROLLMENT_WHERE,
  activeStudentWhere,
  ungroupedStudentWhere,
} from './active-student-where';

describe("faol o'quvchi ta'rifi", () => {
  it("faol o'quvchi statusi ACTIVE bo'lishini talab qiladi", () => {
    expect(activeStudentWhere().status).toBe('ACTIVE');
  });

  it("faol o'quvchi faol guruhda faol yozuvga ega bo'lishini talab qiladi", () => {
    expect(activeStudentWhere().enrollments).toEqual({
      some: {
        deletedAt: null,
        status: 'ACTIVE',
        group: { deletedAt: null, statusEnum: 'ACTIVE' },
      },
    });
  });

  it("guruhlashtirilmagan — xuddi shu shartning yo'qligi", () => {
    expect(ungroupedStudentWhere().enrollments).toEqual({
      none: ACTIVE_ENROLLMENT_WHERE,
    });
  });

  /**
   * Eng muhim test. Ikki toifa AYNAN bitta shartdan quriladi, faqat biri
   * `some`, ikkinchisi `none`. Shu sababli ular bir-birini istisno qiladi va
   * birga statusi ACTIVE bo'lgan hamma o'quvchini qoplaydi.
   *
   * Ilgari bu shunday emas edi: `active` bo'shroq shart ishlatardi va 496 ta
   * o'quvchi ikkala ro'yxatda ham turardi. Kimdir shartlarni ajratib
   * yuborsa, shu test yiqiladi.
   */
  it("faol va guruhlashtirilmagan bir-birining to'ldiruvchisi", () => {
    const active = activeStudentWhere();
    const ungrouped = ungroupedStudentWhere();

    expect(active.status).toBe(ungrouped.status);
    expect((active.enrollments as { some: unknown }).some).toBe(
      (ungrouped.enrollments as { none: unknown }).none,
    );
  });
});
