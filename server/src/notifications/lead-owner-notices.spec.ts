import { leadOwnerNotices } from './lead-owner-notices';

const base = { leadId: 'L1', companyId: 1, leadName: 'Ali Valiyev' };

describe('leadOwnerNotices', () => {
  it('tells the former owner a lead went back to the pool', () => {
    expect(
      leadOwnerNotices({
        ...base,
        kind: 'EXPIRE',
        fromUserId: 11,
        toUserId: null,
        actorId: null,
      }),
    ).toEqual([
      {
        userId: 11,
        title: "Lid umumiy ro'yxatga qaytdi",
        message: "Ali Valiyev — muddatida harakat bo'lmadi",
      },
    ]);
  });

  it('tells the new owner and the former owner when a manager moves a lead', () => {
    expect(
      leadOwnerNotices({
        ...base,
        kind: 'ASSIGN',
        fromUserId: 11,
        toUserId: 12,
        actorId: 2,
      }),
    ).toEqual([
      {
        userId: 12,
        title: 'Sizga lid berildi',
        message: "Ali Valiyev — muddat lid kartochkasida ko'rsatilgan",
      },
      { userId: 11, title: 'Lid sizdan olindi', message: 'Ali Valiyev' },
    ]);
  });

  it('tells nobody about their own claim or release', () => {
    expect(
      leadOwnerNotices({
        ...base,
        kind: 'CLAIM',
        fromUserId: null,
        toUserId: 11,
        actorId: 11,
      }),
    ).toEqual([]);
    expect(
      leadOwnerNotices({
        ...base,
        kind: 'RELEASE',
        fromUserId: 11,
        toUserId: null,
        actorId: 11,
      }),
    ).toEqual([]);
  });
});
