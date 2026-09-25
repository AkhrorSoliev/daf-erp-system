import { runStudentTransaction } from './student-transaction';

/** What Prisma throws when Postgres gives up on a Serializable transaction. */
function writeConflict(): Error {
  return Object.assign(
    new Error(
      'Transaction failed due to a write conflict or a deadlock. Please retry your transaction',
    ),
    { code: 'P2034' },
  );
}

/**
 * A fake $transaction that records whether it committed or rolled back.
 * The first `conflicts` attempts fail with a write conflict.
 */
function fakePrisma(conflicts = 0) {
  const log: string[] = [];
  let attempts = 0;
  const $transaction = jest.fn(
    async (fn: (tx: never) => Promise<unknown>, _opts?: unknown) => {
      log.push('begin');
      attempts++;
      try {
        if (attempts <= conflicts) throw writeConflict();
        const result = await fn({} as never);
        log.push('commit');
        return result;
      } catch (err) {
        log.push('rollback');
        throw err;
      }
    },
  );
  return { log, $transaction };
}

const noDelay = { retryDelayMs: 0 };

describe('runStudentTransaction', () => {
  it('commits a real run and returns its result', async () => {
    const prisma = fakePrisma();
    const result = await runStudentTransaction(
      prisma as never,
      () => Promise.resolve({ studentId: 1 }),
      { rehearse: false },
    );
    expect(result).toEqual({ studentId: 1 });
    expect(prisma.log).toEqual(['begin', 'commit']);
  });

  it('rolls a rehearsal back every time, yet hands back what it would have done', async () => {
    const prisma = fakePrisma();
    const result = await runStudentTransaction(
      prisma as never,
      () => Promise.resolve({ studentId: 1 }),
      { rehearse: true },
    );
    expect(result).toEqual({ studentId: 1 });
    expect(prisma.log).toEqual(['begin', 'rollback']);
  });

  it('still reports a real failure in a rehearsal', async () => {
    const prisma = fakePrisma();
    await expect(
      runStudentTransaction(
        prisma as never,
        () => Promise.reject(new Error('balans mos kelmadi')),
        { rehearse: true },
      ),
    ).rejects.toThrow('balans mos kelmadi');
    expect(prisma.log).toEqual(['begin', 'rollback']);
  });

  it('runs every student in a Serializable transaction', async () => {
    const prisma = fakePrisma();
    await runStudentTransaction(prisma as never, () => Promise.resolve(1), {
      rehearse: false,
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: 'Serializable' }),
    );
  });

  it('runs the whole student again after a write conflict', async () => {
    const prisma = fakePrisma(1);
    const work = jest.fn(() => Promise.resolve({ studentId: 1 }));
    const result = await runStudentTransaction(prisma as never, work, {
      rehearse: false,
      ...noDelay,
    });
    expect(result).toEqual({ studentId: 1 });
    expect(prisma.log).toEqual(['begin', 'rollback', 'begin', 'commit']);
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('retries a rehearsal too, and still rolls it back', async () => {
    const prisma = fakePrisma(2);
    const result = await runStudentTransaction(
      prisma as never,
      () => Promise.resolve({ studentId: 1 }),
      { rehearse: true, ...noDelay },
    );
    expect(result).toEqual({ studentId: 1 });
    expect(prisma.log).toEqual([
      'begin',
      'rollback',
      'begin',
      'rollback',
      'begin',
      'rollback',
    ]);
  });

  it('gives up after three write conflicts and reports the last one', async () => {
    const prisma = fakePrisma(5);
    await expect(
      runStudentTransaction(prisma as never, () => Promise.resolve(1), {
        rehearse: false,
        ...noDelay,
      }),
    ).rejects.toMatchObject({ code: 'P2034' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });

  it('never retries any other failure', async () => {
    const prisma = fakePrisma();
    await expect(
      runStudentTransaction(
        prisma as never,
        () => Promise.reject(new Error('balans mos kelmadi')),
        { rehearse: false, ...noDelay },
      ),
    ).rejects.toThrow('balans mos kelmadi');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
