import {
  computeChangedFields,
  redactHistoryValues,
  stripSensitiveFields,
} from './diff.util';

describe('computeChangedFields', () => {
  it('never journals the session version — a security counter, not business data', () => {
    expect(
      computeChangedFields(
        { firstName: 'Ali', sessionVersion: 2 },
        { firstName: 'Ali', sessionVersion: 3 },
      ),
    ).toBeNull();
  });

  it('still journals an ordinary field beside it', () => {
    expect(
      computeChangedFields(
        { firstName: 'Ali', sessionVersion: 2 },
        { firstName: 'Vali', sessionVersion: 3 },
      ),
    ).toEqual({
      oldValues: { firstName: 'Ali' },
      newValues: { firstName: 'Vali' },
    });
  });
});

describe('an employee balance in history (ADR-0087)', () => {
  it('drops User.balance from a diff and keeps the rest', () => {
    expect(
      computeChangedFields(
        { firstName: 'Ali', balance: 1 },
        { firstName: 'Vali', balance: 2 },
        'User',
      ),
    ).toEqual({
      oldValues: { firstName: 'Ali' },
      newValues: { firstName: 'Vali' },
    });
  });

  it('keeps Student.balance, a money view behind its own capabilities', () => {
    expect(
      computeChangedFields({ balance: 1 }, { balance: 2 }, 'Student'),
    ).toEqual({ oldValues: { balance: 1 }, newValues: { balance: 2 } });
  });

  it('drops User.balance from a create or delete snapshot only', () => {
    expect(
      stripSensitiveFields({ firstName: 'Ali', balance: 1 }, 'User'),
    ).toEqual({ firstName: 'Ali' });
    expect(stripSensitiveFields({ firstName: 'Ali', balance: 1 })).toEqual({
      firstName: 'Ali',
      balance: 1,
    });
  });

  it('redacts a stored row on the way out and leaves other shapes alone', () => {
    expect(redactHistoryValues('User', { phone: '1', balance: 1 })).toEqual({
      phone: '1',
    });
    expect(redactHistoryValues('Student', { balance: 1 })).toEqual({
      balance: 1,
    });
    expect(redactHistoryValues('User', null)).toBeNull();
    expect(redactHistoryValues('User', ['balance'])).toEqual(['balance']);
    expect(redactHistoryValues('toString', { balance: 1 })).toEqual({
      balance: 1,
    });
  });
});

describe('an employee official salary in history (spec 2026-10-25)', () => {
  it('records a User.officialSalary change', () => {
    expect(
      computeChangedFields(
        { officialSalary: null },
        { officialSalary: 2_000_000 },
        'User',
      ),
    ).toEqual({
      oldValues: { officialSalary: null },
      newValues: { officialSalary: 2_000_000 },
    });
  });

  it('hides it from a reader without salary.view, shows it to one with', () => {
    const row = { phone: '1', officialSalary: 1, balance: 2 };
    expect(redactHistoryValues('User', row)).toEqual({ phone: '1' });
    expect(redactHistoryValues('User', row, true)).toEqual({
      phone: '1',
      officialSalary: 1,
    });
    expect(redactHistoryValues('Student', { officialSalary: 1 })).toEqual({
      officialSalary: 1,
    });
  });
});
