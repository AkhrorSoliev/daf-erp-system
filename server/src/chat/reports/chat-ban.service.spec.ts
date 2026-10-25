import { NotFoundException } from '@nestjs/common';
import { ChatBanService } from './chat-ban.service';

function make(
  student: object | null = { id: 5, userId: 55, chatBannedAt: null },
) {
  const tx = { student: { update: jest.fn().mockResolvedValue({}) } };
  const prisma = {
    student: { findFirst: jest.fn().mockResolvedValue(student) },
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const history = { recordUpdate: jest.fn().mockResolvedValue(undefined) };
  const gateway = { sendToUser: jest.fn() };
  return {
    service: new ChatBanService(
      prisma as never,
      history as never,
      gateway as never,
    ),
    prisma,
    tx,
    history,
    gateway,
  };
}

describe('ChatBanService', () => {
  it('sets chatBannedAt, writes Student history in the same transaction and tells the student', async () => {
    const { service, tx, history, gateway } = make();
    const out = await service.ban(5, 7, 99);
    expect(tx.student.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { chatBannedAt: expect.any(Date) },
    });
    expect(history.recordUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        tx,
        entityType: 'Student',
        oldValues: { chatBannedAt: null },
        newValues: { chatBannedAt: expect.any(Date) },
      }),
    );
    expect(gateway.sendToUser).toHaveBeenCalledWith(55, {
      type: 'chat.access',
    });
    expect(out.chatBannedAt).toEqual(expect.any(String));
  });

  it('is idempotent', async () => {
    const at = new Date('2026-10-25T08:00:00Z');
    const { service, tx } = make({ id: 5, userId: 55, chatBannedAt: at });
    expect(await service.ban(5, 7, 99)).toEqual({
      chatBannedAt: at.toISOString(),
    });
    expect(tx.student.update).not.toHaveBeenCalled();
  });

  it('unban clears it', async () => {
    const { service, tx } = make({
      id: 5,
      userId: 55,
      chatBannedAt: new Date(),
    });
    expect(await service.unban(5, 7, 99)).toEqual({ chatBannedAt: null });
    expect(tx.student.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { chatBannedAt: null },
    });
  });

  it('404s for a student outside the company', async () => {
    await expect(make(null).service.ban(5, 7, 99)).rejects.toThrow(
      NotFoundException,
    );
  });
});
