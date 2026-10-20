import { AbsencePauseController } from './absence-pause.controller';
import { defaultRolesOf, routeAccess } from '../common/permissions/testing';

describe('AbsencePauseController — rollar', () => {
  it("o'qish CEO va Branch Director uchun ochiq", () => {
    for (const name of ['get', 'history', 'preview']) {
      expect(routeAccess(AbsencePauseController, name)).toEqual({
        kind: 'can',
        keys: ['settings.absence-pause'],
      });
      expect(defaultRolesOf(AbsencePauseController, name)).toEqual([
        'Branch Director',
        'CEO',
      ]);
    }
  });

  it('yozish faqat CEO uchun — sozlama butun kompaniyaga taalluqli', () => {
    expect(routeAccess(AbsencePauseController, 'update')).toEqual({
      kind: 'can',
      keys: ['settings.company'],
    });
    expect(defaultRolesOf(AbsencePauseController, 'update')).toEqual(['CEO']);
  });

  it('Student hech qayerga kira olmaydi', () => {
    for (const name of ['get', 'update', 'history', 'preview']) {
      expect(defaultRolesOf(AbsencePauseController, name)).not.toContain(
        'Student',
      );
    }
  });
});

describe('AbsencePauseController — tarix va oldindan ko‘rish', () => {
  const settings = {} as never;
  const streaks = { computeStreaks: jest.fn() };
  const entityHistory = { getHistory: jest.fn() };
  let controller: AbsencePauseController;

  beforeEach(() => {
    jest.resetAllMocks();
    controller = new AbsencePauseController(
      settings,
      streaks as never,
      entityHistory as never,
    );
  });

  it("tarix: kompaniya raqami entityId bo'ladi va faqat kerakli maydonlar qaytadi", async () => {
    entityHistory.getHistory.mockResolvedValue({
      data: [
        {
          id: 'h1',
          action: 'UPDATE',
          createdAt: new Date('2026-10-18T09:32:00Z'),
          oldValues: { enabled: false },
          newValues: { enabled: true },
          entityType: 'AbsencePauseSetting',
          changedBy: {
            id: 10001,
            firstName: 'Ahror',
            lastName: 'S',
            photo: 'x.jpg',
            roles: [{ role: { id: 1 } }],
          },
        },
        {
          id: 'h2',
          action: 'UPDATE',
          createdAt: new Date('2026-10-17T09:32:00Z'),
          oldValues: { pauseThreshold: 3 },
          newValues: { pauseThreshold: 4 },
          changedBy: null,
        },
      ],
      total: 2,
      page: 1,
      pageSize: 10,
    });

    const res = await controller.history({ page: 1, pageSize: 10 }, 1001);

    expect(entityHistory.getHistory).toHaveBeenCalledWith(
      'AbsencePauseSetting',
      '1001',
      1001,
      { page: 1, pageSize: 10 },
    );
    expect(res.total).toBe(2);
    expect(res.data[0]).toEqual({
      id: 'h1',
      action: 'UPDATE',
      createdAt: new Date('2026-10-18T09:32:00Z'),
      oldValues: { enabled: false },
      newValues: { enabled: true },
      changedBy: { id: 10001, firstName: 'Ahror', lastName: 'S' },
    });
    // Rasm va rollar mijozga chiqmaydi.
    expect(JSON.stringify(res)).not.toContain('x.jpg');
    expect(res.data[1].changedBy).toBeNull();
  });

  it("oldindan ko'rish: cron bilan bir xil hisob, butun kompaniya bo'yicha", async () => {
    streaks.computeStreaks.mockResolvedValue([{}, {}, {}]);

    const res = await controller.preview({ pauseThreshold: 4 }, 1001);

    expect(streaks.computeStreaks).toHaveBeenCalledWith({
      companyId: 1001,
      threshold: 4,
    });
    expect(res).toEqual({ candidates: 3 });
  });
});
