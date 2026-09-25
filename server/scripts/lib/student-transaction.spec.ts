import { runStudentTransaction } from './student-transaction';

/** A fake $transaction that records whether it committed or rolled back. */
function fakePrisma() {
  const log: string[] = [];
  const $transaction = jest.fn(
    async (fn: (tx: never) => Promise<unknown>, _opts?: unknown) => {
      log.push('begin');
      try {
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
});
