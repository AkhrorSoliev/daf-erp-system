import { ConflictException } from '@nestjs/common';
import {
  CONCURRENT_CHANGE_MESSAGE,
  isTransactionConflict,
  rethrowAsConflict,
} from './transaction-conflict';

// The exact object @prisma/adapter-pg produces for SQLSTATE 40P01: it maps
// only 40001 to P2034, so a deadlock reaches the caller as a raw
// DriverAdapterError with the SQLSTATE on `cause.code`.
const deadlock = Object.assign(new Error('deadlock detected'), {
  name: 'DriverAdapterError',
  cause: {
    originalCode: '40P01',
    originalMessage: 'deadlock detected',
    kind: 'postgres',
    code: '40P01',
  },
});

describe('isTransactionConflict', () => {
  it('knows a Serializable write conflict and a deadlock', () => {
    expect(isTransactionConflict({ code: 'P2034' })).toBe(true);
    expect(isTransactionConflict(deadlock)).toBe(true);
  });

  it('knows nothing else', () => {
    expect(isTransactionConflict({ code: 'P2002' })).toBe(false);
    expect(isTransactionConflict(new Error('boom'))).toBe(false);
    expect(isTransactionConflict(null)).toBe(false);
  });
});

describe('rethrowAsConflict', () => {
  it('turns a conflict into 409', () => {
    expect(() => rethrowAsConflict({ code: 'P2034' })).toThrow(
      new ConflictException(CONCURRENT_CHANGE_MESSAGE),
    );
    expect(() => rethrowAsConflict(deadlock)).toThrow(ConflictException);
    expect(CONCURRENT_CHANGE_MESSAGE).toBe(
      "Bir vaqtda boshqa o'zgarish bo'ldi — qayta urinib ko'ring",
    );
  });

  it('turns a unique violation into 409 only where it can only be a concurrent duplicate', () => {
    const duplicate = { code: 'P2002' };
    expect(() => rethrowAsConflict(duplicate, { duplicate: true })).toThrow(
      ConflictException,
    );
    let thrown: unknown;
    try {
      rethrowAsConflict(duplicate);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBe(duplicate);
  });

  it('rethrows anything else unchanged', () => {
    const boom = new Error('boom');
    let thrown: unknown;
    try {
      rethrowAsConflict(boom, { duplicate: true });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBe(boom);
  });
});
