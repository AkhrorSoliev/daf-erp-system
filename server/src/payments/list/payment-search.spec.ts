import { paymentSearchWhere } from './payment-search';

const name = (t: string) => ({
  OR: [
    { student: { firstName: { contains: t, mode: 'insensitive' } } },
    { student: { lastName: { contains: t, mode: 'insensitive' } } },
  ],
});
const receipts = (q: string) => [
  { receiptCode: { contains: q, mode: 'insensitive' } },
  { receiptNumber: { contains: q, mode: 'insensitive' } },
];

describe('paymentSearchWhere', () => {
  it('no text, no clause', () => {
    expect(paymentSearchWhere(undefined)).toBeUndefined();
    expect(paymentSearchWhere('   ')).toBeUndefined();
  });

  it('every word in the first or last name, or a receipt number', () => {
    expect(paymentSearchWhere('  ism   fam ')).toEqual({
      OR: [{ AND: [name('ism'), name('fam')] }, ...receipts('ism   fam')],
    });
  });

  it('digits: the student id and the phone', () => {
    expect(paymentSearchWhere('10001')).toEqual({
      OR: [
        { AND: [name('10001')] },
        ...receipts('10001'),
        { studentId: 10001 },
        { student: { phone: { contains: '10001' } } },
      ],
    });
  });

  it('a phone with 998: no id (too long), the prefix dropped', () => {
    const or = paymentSearchWhere('998901234567')!.OR!;
    expect(or).toContainEqual({
      student: { phone: { contains: '901234567' } },
    });
    expect(or.some((c) => 'studentId' in c)).toBe(false);
  });

  it('fewer than 4 digits: the id only, no phone', () => {
    const or = paymentSearchWhere('123')!.OR!;
    expect(or).toContainEqual({ studentId: 123 });
    expect(or.some((c) => 'student' in c)).toBe(false);
  });

  it('cuts the text to 100 characters', () => {
    const where = paymentSearchWhere('a'.repeat(150))!;
    expect(where.OR![1]).toEqual({
      receiptCode: { contains: 'a'.repeat(100), mode: 'insensitive' },
    });
  });
});
