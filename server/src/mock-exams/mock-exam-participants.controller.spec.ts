import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ROLES_KEY } from '../common/decorators';
import { MockExamParticipantsController } from './mock-exam-participants.controller';
import { RemoveMockParticipantQueryDto } from './dto/remove-mock-participant-query.dto';

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
