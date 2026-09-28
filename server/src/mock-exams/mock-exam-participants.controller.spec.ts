import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ROLES_KEY } from '../common/decorators';
import { MockExamParticipantsController } from './mock-exam-participants.controller';
import { RemoveMockParticipantQueryDto } from './dto/remove-mock-participant-query.dto';
import { UpdateMockPaymentDto } from './dto/update-mock-payment.dto';
import { CancelMockPaymentDto } from './dto/cancel-mock-payment.dto';

describe('MockExamParticipantsController — guards', () => {
  const reflector = new Reflector();

  it('restricts the entire controller to CEO / Branch Director / Administrator', () => {
    const roles = reflector.get<string[]>(
      ROLES_KEY,
      MockExamParticipantsController,
    );
    expect(roles).toEqual(['CEO', 'Branch Director', 'Administrator']);
  });
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
