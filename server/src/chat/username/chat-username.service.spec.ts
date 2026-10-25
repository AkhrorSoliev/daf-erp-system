import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ChatUsernameService } from './chat-username.service';

const p2002 = () =>
  new Prisma.PrismaClientKnownRequestError('unique', {
    code: 'P2002',
    clientVersion: 'x',
  });

function make(update: jest.Mock) {
  const prisma = { student: { updateMany: update } };
  return new ChatUsernameService(prisma as never);
}

describe('ChatUsernameService.set', () => {
  it('stores the normalised username on the caller card', async () => {
    const update = jest.fn().mockResolvedValue({ count: 1 });
    const out = await make(update).set(5, 1, '@Asror_01');
    expect(out).toEqual({ username: 'asror_01' });
    expect(update).toHaveBeenCalledWith({
      where: { id: 5, companyId: 1, deletedAt: null },
      data: { username: 'asror_01' },
    });
  });

  it('refuses a malformed one before touching the database', async () => {
    const update = jest.fn();
    await expect(make(update).set(5, 1, '1x')).rejects.toThrow(
      BadRequestException,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('turns a unique violation into a 409 in Uzbek', async () => {
    const update = jest.fn().mockRejectedValue(p2002());
    await expect(make(update).set(5, 1, 'asror_01')).rejects.toThrow(
      new ConflictException('Bu username band'),
    );
  });
});
