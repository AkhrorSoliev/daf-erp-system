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

describe('an employee balance in history (ADR-0086)', () => {
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
