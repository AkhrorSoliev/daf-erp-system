import { ArchiveRestoreService } from './archive-restore.service';
import { ArchiveEntityType } from './dto/archive-query.dto';

/**
 * ADR-0070: a restored card may not bring back a backup number another live
 * student now signs in with. The restore goes through; the number goes.
 */
describe('ArchiveRestoreService — backup number on restore (ADR-0070)', () => {
  const CARD = {
    id: 20001,
    phone: '901112233',
    extraPhone: '935554433',
    userId: null,
    companyId: 1001,
    status: 'ARCHIVED',
    deletionBatchId: null,
  };
  let prisma: any;
  let tx: any;
  let history: any;
  let service: ArchiveRestoreService;

  function build(holder: any, card: typeof CARD = CARD) {
    tx = { student: { update: jest.fn().mockResolvedValue({}) }, user: {} };
    prisma = {
      student: {
        // 1st: the archived record; 2nd: another live card on the MAIN number;
        // 3rd: the rule's "another card on the backup number".
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(card)
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(holder),
        update: jest.fn(),
      },
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((fn: (t: any) => unknown) => fn(tx)),
    };
    history = { recordRestore: jest.fn(), recordUpdate: jest.fn() };
    service = new ArchiveRestoreService(
      prisma,
      { changeStatus: jest.fn().mockResolvedValue({}) } as any,
      history,
    );
  }

  it('keeps a free backup number', async () => {
    build(null);
    await service.restore(ArchiveEntityType.STUDENTS, 20001, 7, 1001);
    const data = tx.student.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('extraPhone');
    expect(history.recordUpdate).not.toHaveBeenCalled();
  });

  it('clears a backup number another live student holds and says so in the history', async () => {
    build({ id: 10999, firstName: 'Vali', lastName: 'Aliyev' });
    await service.restore(ArchiveEntityType.STUDENTS, 20001, 7, 1001);
    const data = tx.student.update.mock.calls[0][0].data;
    expect(data.extraPhone).toBeNull();
    expect(history.recordUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'Student',
        entityId: 20001,
        oldValues: { extraPhone: '935554433', sabab: null },
        newValues: {
          extraPhone: null,
          sabab: "Arxivdan tiklanganda: raqam boshqa o'quvchida (#10999)",
        },
        changedById: 7,
        companyId: 1001,
        tx,
      }),
    );
  });

  it('names the account when a live student account holds the backup number', async () => {
    build(null);
    prisma.user.findFirst.mockResolvedValue({ id: 30077 });
    await service.restore(ArchiveEntityType.STUDENTS, 20001, 7, 1001);
    expect(tx.student.update.mock.calls[0][0].data.extraPhone).toBeNull();
    expect(history.recordUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        newValues: {
          extraPhone: null,
          sabab:
            "Arxivdan tiklanganda: raqam boshqa o'quvchi hisobida (#30077)",
        },
        tx,
      }),
    );
  });

  it('clears a backup number equal to the main number with its own reason', async () => {
    build(null, { ...CARD, extraPhone: CARD.phone });
    await service.restore(ArchiveEntityType.STUDENTS, 20001, 7, 1001);
    expect(tx.student.update.mock.calls[0][0].data.extraPhone).toBeNull();
    expect(history.recordUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        oldValues: { extraPhone: '901112233', sabab: null },
        newValues: {
          extraPhone: null,
          sabab:
            'Arxivdan tiklanganda: zaxira raqam asosiy raqam bilan bir xil edi',
        },
        tx,
      }),
    );
  });
});
