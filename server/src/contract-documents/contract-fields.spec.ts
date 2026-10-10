import {
  buildCourseFields,
  buildCustomer,
  courseList,
  customerProblem,
  isMinorOn,
  missingBranchFields,
  personName,
  storedBirthDay,
  withExtras,
  type EnrollmentForContract,
} from './contract-fields';

const enrollment = (
  over: Partial<EnrollmentForContract['group']> = {},
): EnrollmentForContract => ({
  id: 'e-1',
  startDate: null,
  createdAt: new Date('2026-09-14T05:00:00Z'),
  group: {
    name: '#032',
    level: ' A1 ',
    exactDays: ['friday', 'monday', 'wednesday'],
    lessonStartTime: '14:00',
    lessonEndTime: '15:30',
    lessonMinutes: null,
    course: { name: 'Standart', price: 450_000, lessonMinutes: 90 },
    teachers: [{ teacher: { firstName: 'Aziza', lastName: 'Karimova' } }],
    ...over,
  },
});

describe('missingBranchFields', () => {
  it('names every empty field in Uzbek', () => {
    expect(
      missingBranchFields({
        city: ' ',
        address: null,
        representativeName: 'Karimov Anvar',
        representativePosition: '',
      }),
    ).toEqual(['shahar', 'manzil', 'vakil lavozimi']);
  });

  it('is empty when all four are filled', () => {
    expect(
      missingBranchFields({
        city: 'Namangan',
        address: 'Istiqlol 48',
        representativeName: 'Karimov Anvar',
        representativePosition: 'Direktor',
      }),
    ).toEqual([]);
  });
});

describe('dates and age', () => {
  it('reads both stored birth-date shapes as the same calendar day', () => {
    // Staff picker: local midnight (19:00Z the day before in Tashkent).
    expect(storedBirthDay(new Date('2008-10-09T19:00:00Z'))).toBe('2008-10-10');
    // Student first-run form: UTC midnight.
    expect(storedBirthDay(new Date('2008-10-10T00:00:00Z'))).toBe('2008-10-10');
  });

  it('turns 18 on the birthday itself', () => {
    expect(isMinorOn('2008-10-10', '2026-10-09')).toBe(true);
    expect(isMinorOn('2008-10-10', '2026-10-10')).toBe(false);
  });

  it('writes a person surname first', () => {
    expect(personName({ firstName: 'Ahror', lastName: 'Soliyev' })).toBe(
      'Soliyev Ahror',
    );
  });
});

describe('customer', () => {
  const student = {
    fullName: 'Soliyev Ahror',
    birthDate: '2000-05-05',
    isMinor: false,
  };

  it('refuses a minor as their own customer', () => {
    expect(customerProblem('SELF', undefined, true)).toMatch(/Voyaga yetmagan/);
    expect(customerProblem('PARENT', undefined, true)).toBeNull();
  });

  it('asks for the basis when the kind is OTHER', () => {
    expect(customerProblem('OTHER', '  ', false)).toMatch(/Boshqa/);
    expect(customerProblem('OTHER', 'amaki', false)).toBeNull();
  });

  it('takes name and birth date from the student for SELF', () => {
    expect(
      buildCustomer(
        { kind: 'SELF', fullName: 'ignored', passport: ' AB1234567 ' },
        student,
      ),
    ).toEqual({
      kind: 'SELF',
      kindOther: null,
      fullName: 'Soliyev Ahror',
      birthDate: '2000-05-05',
      passport: 'AB1234567',
      address: null,
      phone: null,
      telegram: null,
      email: null,
    });
  });

  it('keeps what was typed for a parent, blanks become null', () => {
    expect(
      buildCustomer(
        {
          kind: 'PARENT',
          fullName: ' Soliyeva Malika ',
          birthDate: '1975-01-02',
          phone: '901234567',
          address: '',
        },
        student,
      ),
    ).toMatchObject({
      kind: 'PARENT',
      fullName: 'Soliyeva Malika',
      birthDate: '1975-01-02',
      phone: '901234567',
      address: null,
    });
  });
});

describe('courses', () => {
  it('builds the sealed course block from the enrollment', () => {
    expect(buildCourseFields(enrollment(), 10)).toEqual({
      enrollmentId: 'e-1',
      courseName: 'Standart',
      level: 'A1',
      groupName: '#032',
      teachers: ['Karimova Aziza'],
      startDate: '2026-09-14',
      days: ['monday', 'wednesday', 'friday'],
      lessonStartTime: '14:00',
      lessonEndTime: '15:30',
      lessonsPerWeek: 3,
      lessonMinutes: 90,
      monthlyPrice: 450_000,
      discountPercent: 10,
      firstPaymentAmount: 405_000,
      firstPaymentDate: null,
      discountReason: null,
      discountFrom: null,
      discountTo: null,
      includes: [],
    });
  });

  it('prefers the group lesson length and clamps the discount', () => {
    const c = buildCourseFields(enrollment({ lessonMinutes: 80 }), 150);
    expect(c.lessonMinutes).toBe(80);
    expect(c.discountPercent).toBe(100);
  });

  it('applies the extras an admin typed, in a fixed order', () => {
    expect(
      withExtras(
        {
          firstPaymentAmount: 200_000,
          firstPaymentDate: '2026-10-12',
          discountReason: '  ',
          includes: ['SERTIFIKAT', 'DARSLIK'],
        },
        405_000,
      ),
    ).toEqual({
      firstPaymentAmount: 200_000,
      firstPaymentDate: '2026-10-12',
      discountReason: null,
      discountFrom: null,
      discountTo: null,
      includes: ['DARSLIK', 'SERTIFIKAT'],
    });
  });

  it('names courses for the history row', () => {
    expect(
      courseList([
        { courseName: 'Standart', groupName: '#032' },
        { courseName: 'Intensive', groupName: '#041' },
      ]),
    ).toBe('Standart (#032), Intensive (#041)');
  });
});
