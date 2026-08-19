import { executeBranchReset } from './branch-reset-execute';
import { BranchResetPlan } from './branch-reset-plan';

const PLAN: BranchResetPlan = {
  branchId: 2,
  branchName: 'Namangan filali',
  companyId: 1,
  studentIds: [10795, 10796],
  studentUserIds: [20795],
  staffUserIds: [10768, 10904],
  keptUserIds: [10562],
  enrollmentIds: ['e-1'],
  groupIds: ['g-1'],
  roomIds: ['r-1'],
  courseIds: ['c-1'],
  snapshotIds: [501],
};

/** Har bir deleteMany chaqiruvini tartibi bilan yozib boradigan soxta tx. */
function recordingTx() {
  const calls: { model: string; where: any }[] = [];
  const handler: ProxyHandler<any> = {
    get(_t, model: string) {
      return {
        deleteMany: jest.fn(async ({ where }: any) => {
          calls.push({ model, where });
          return { count: 0 };
        }),
      };
    },
  };
  return { tx: new Proxy({}, handler) as any, calls };
}

describe('executeBranchReset', () => {
  it("RESTRICT bog'liqliklarni ota-jadvaldan oldin o'chiradi", async () => {
    const { tx, calls } = recordingTx();
    await executeBranchReset(tx, PLAN);
    const order = calls.map((c) => c.model);
    const at = (m: string) => order.indexOf(m);

    // O'quvchi tomoni
    expect(at('smsMessage')).toBeLessThan(at('student'));
    expect(at('enrollment')).toBeLessThan(at('student'));
    expect(at('enrollmentStateLog')).toBeLessThan(at('enrollment'));
    expect(at('studentBranch')).toBeLessThan(at('student'));
    // Student.userId User ga ishora qiladi, demak Student avval ketadi
    expect(at('student')).toBeLessThan(at('user'));
    // Xodim tomoni
    expect(at('notification')).toBeLessThan(at('user'));
    expect(at('userRole')).toBeLessThan(at('user'));
    expect(at('userBranch')).toBeLessThan(at('user'));
    // Guruh / xona / kurs
    expect(at('groupScheduleSnapshot')).toBeLessThan(at('group'));
    expect(at('groupHolidayExtension')).toBeLessThan(at('group'));
    expect(at('roomCapacitySnapshot')).toBeLessThan(at('room'));
    expect(at('coursePriceSnapshot')).toBeLessThan(at('course'));
    // Guruh xonaga va kursga ishora qiladi
    expect(at('group')).toBeLessThan(at('room'));
    expect(at('group')).toBeLessThan(at('course'));
  });

  it("hech qachon branchId bo'yicha o'chirmaydi", async () => {
    const { tx, calls } = recordingTx();
    await executeBranchReset(tx, PLAN);

    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(JSON.stringify(call.where)).not.toContain('branchId');
    }
  });

  it("filial qatorini, kassani va lid ustunini umuman tegmaydi", async () => {
    const { tx, calls } = recordingTx();
    await executeBranchReset(tx, PLAN);
    const touched = calls.map((c) => c.model);

    expect(touched).not.toContain('branch');
    expect(touched).not.toContain('cashAccount');
    expect(touched).not.toContain('leadColumn');
    expect(touched).not.toContain('leadSection');
  });

  it("saqlanadigan foydalanuvchiga tegishli bironta o'chirish yo'q", async () => {
    const { tx, calls } = recordingTx();
    await executeBranchReset(tx, PLAN);

    for (const call of calls) {
      expect(JSON.stringify(call.where)).not.toContain('10562');
    }
  });

  it("bo'sh reja bilan hech nima o'chirmaydi (ikkinchi marta ishga tushirish xavfsiz)", async () => {
    const { tx, calls } = recordingTx();
    const empty: BranchResetPlan = {
      ...PLAN,
      studentIds: [],
      studentUserIds: [],
      staffUserIds: [],
      enrollmentIds: [],
      groupIds: [],
      roomIds: [],
      courseIds: [],
      snapshotIds: [],
    };
    await executeBranchReset(tx, empty);
    expect(calls).toEqual([]);
  });
});
