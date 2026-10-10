import { NotificationResolverService } from './notification-resolver.service';

describe('NotificationResolverService — join requests', () => {
  it("closes the open rows of the request's task and tells their owners", async () => {
    const prisma = {
      notification: {
        findMany: jest.fn().mockResolvedValue([{ id: 'n1', userId: 3 }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const gateway = { sendToUser: jest.fn() };
    const service = new NotificationResolverService(
      prisma as any,
      gateway as any,
    );

    await service.onJoinRequestClosed({ companyId: 1001, taskId: 't1' });

    expect(prisma.notification.findMany).toHaveBeenCalledWith({
      where: {
        companyId: 1001,
        taskId: 't1',
        actionRequired: true,
        resolvedAt: null,
      },
      select: { id: true, userId: true },
    });
    expect(gateway.sendToUser).toHaveBeenCalledWith(
      3,
      expect.objectContaining({ type: 'notification.resolved', ids: ['n1'] }),
    );
  });
});
