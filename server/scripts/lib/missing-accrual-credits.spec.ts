import { chainCredits } from './missing-accrual-credits';

describe('chainCredits', () => {
  const lesson = (att: string, day: string, amount: number) => ({
    attendanceId: att,
    amount,
    lessonDate: new Date(`${day}T00:00:00.000Z`),
    branchId: 7,
  });

  it('chains the balance through the credits in lesson order', () => {
    const { rows, balanceAfter } = chainCredits(-100_000, [
      lesson('b', '2026-09-05', 15_385),
      lesson('a', '2026-09-02', 16_667),
    ]);

    expect(
      rows.map((r) => [r.attendanceId, r.balanceBefore, r.balanceAfter]),
    ).toEqual([
      ['a', -100_000, -83_333],
      ['b', -83_333, -67_948],
    ]);
    expect(balanceAfter).toBe(-67_948);
  });

  it('writes nothing and leaves the balance when nothing is missing', () => {
    expect(chainCredits(5_000, [])).toEqual({ rows: [], balanceAfter: 5_000 });
  });

  it('orders two lessons of one day by lesson id, so a re-run plans the same rows', () => {
    const { rows } = chainCredits(0, [
      lesson('z', '2026-09-10', 1),
      lesson('m', '2026-09-10', 1),
    ]);
    expect(rows.map((r) => r.attendanceId)).toEqual(['m', 'z']);
  });
});
