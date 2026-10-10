import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { defaultRolesOf, routeAccess } from '../common/permissions/testing';
import { MockExamParticipantsController } from './mock-exam-participants.controller';
import { RemoveMockParticipantQueryDto } from './dto/remove-mock-participant-query.dto';
import { UpdateMockPaymentDto } from './dto/update-mock-payment.dto';
import { CancelMockPaymentDto } from './dto/cancel-mock-payment.dto';

describe('MockExamParticipantsController — route access', () => {
  const MANAGES = ['addManual', 'remove', 'convertToStudent'] as const;
  // Accepting, fixing and undoing a payment the administrator took by hand.
  const PAYMENTS = ['updatePayment', 'cancelPayment', 'markPaid'] as const;

  it("an exam's participant list is gated by the mock exam view capability", () => {
    expect(routeAccess(MockExamParticipantsController, 'list')).toEqual({
      kind: 'can',
      keys: ['mock.view'],
    });
  });

  it("a student's mock exams are open to the student details and the mock exam view capabilities", () => {
    expect(
      routeAccess(MockExamParticipantsController, 'listForStudent'),
    ).toEqual({ kind: 'can', keys: ['students.details', 'mock.view'] });
  });

  it.each(MANAGES)('%s is gated by the mock exam manage capability', (name) => {
    expect(routeAccess(MockExamParticipantsController, name)).toEqual({
      kind: 'can',
      keys: ['mock.manage'],
    });
  });

  it.each(PAYMENTS)(
    '%s is gated by the mock exam payments capability',
    (name) => {
      expect(routeAccess(MockExamParticipantsController, name)).toEqual({
        kind: 'can',
        keys: ['mock.payments'],
      });
    },
  );

  it.each(['list', 'listForStudent', ...MANAGES, ...PAYMENTS])(
    '%s admits the three admin roles by default, not the Teacher or the Cashier',
    (name) => {
      expect(defaultRolesOf(MockExamParticipantsController, name)).toEqual([
        'Administrator',
        'Branch Director',
        'CEO',
      ]);
    },
  );
});

describe("MockExamParticipantsController — to'lagan ishtirokchini o'chirish", () => {
  it('?refundConfirmed=true ni servisga uzatadi', async () => {
    const service = { remove: jest.fn().mockResolvedValue({}) };
    const controller = new MockExamParticipantsController(service as any);

    await controller.remove('p1', 1001, 7, null, { refundConfirmed: true });

    expect(service.remove).toHaveBeenCalledWith('p1', 1001, 7, null, {
      refundConfirmed: true,
    });
  });

  it("query satridagi 'true' / 'false' ni boolean'ga aylantiradi", async () => {
    const yes = plainToInstance(RemoveMockParticipantQueryDto, {
      refundConfirmed: 'true',
    });
    const no = plainToInstance(RemoveMockParticipantQueryDto, {
      refundConfirmed: 'false',
    });

    expect(yes.refundConfirmed).toBe(true);
    expect(no.refundConfirmed).toBe(false);
    expect(await validate(yes)).toHaveLength(0);
  });
});

describe("MockExamParticipantsController — qabul qilingan to'lovni tuzatish", () => {
  it('tahrirlash va bekor qilishni servisga filial qamrovi bilan uzatadi', async () => {
    const service = {
      updatePayment: jest.fn().mockResolvedValue({}),
      cancelPayment: jest.fn().mockResolvedValue({}),
    };
    const controller = new MockExamParticipantsController(service as any);
    const edit = { method: 'CLICK', note: 'chek' } as UpdateMockPaymentDto;
    const cancel = { reason: 'xato belgilangan' };

    await controller.updatePayment('p1', edit, 1001, 7, [3]);
    await controller.cancelPayment('p1', cancel, 1001, 7, [3]);

    expect(service.updatePayment).toHaveBeenCalledWith(
      'p1',
      edit,
      1001,
      7,
      [3],
    );
    expect(service.cancelPayment).toHaveBeenCalledWith(
      'p1',
      cancel,
      1001,
      7,
      [3],
    );
  });

  it('faqat naqd, Payme va Click usulini qabul qiladi', async () => {
    const ok = plainToInstance(UpdateMockPaymentDto, { method: 'PAYME' });
    const uzum = plainToInstance(UpdateMockPaymentDto, { method: 'UZUM' });
    const missing = plainToInstance(UpdateMockPaymentDto, { note: 'izoh' });

    expect(await validate(ok)).toHaveLength(0);
    expect(await validate(uzum)).not.toHaveLength(0);
    expect(await validate(missing)).not.toHaveLength(0);
  });

  it('bekor qilish sababsiz qabul qilinmaydi', async () => {
    const none = plainToInstance(CancelMockPaymentDto, {});
    const short = plainToInstance(CancelMockPaymentDto, { reason: 'ha' });
    const ok = plainToInstance(CancelMockPaymentDto, {
      reason: 'Pul odamga qaytarildi',
    });

    expect(await validate(none)).not.toHaveLength(0);
    expect(await validate(short)).not.toHaveLength(0);
    expect(await validate(ok)).toHaveLength(0);
  });
});
