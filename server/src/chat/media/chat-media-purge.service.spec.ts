import { ChatMediaPurgeService } from './chat-media-purge.service';

const NOW = new Date('2026-10-26T22:00:00Z');

function make(
  o: {
    rows?: { id: string; fileKey: string }[][];
    removeOk?: boolean;
    enabled?: boolean;
  } = {},
) {
  const batches = [...(o.rows ?? [])];
  const prisma = {
    $queryRaw: jest.fn(async () => batches.shift() ?? []),
    chatMessage: { update: jest.fn().mockResolvedValue({}) },
  };
  const storage = {
    enabled: o.enabled ?? true,
    remove: jest.fn().mockResolvedValue(o.removeOk ?? true),
  };
  return {
    service: new ChatMediaPurgeService(prisma as never, storage as never),
    prisma,
    storage,
  };
}

describe('ChatMediaPurgeService', () => {
  it('removes the object and stamps the row, keeping the text and the key', async () => {
    const { service, prisma, storage } = make({
      rows: [[{ id: 'm1', fileKey: 'chat/1/c1/a.png' }]],
    });
    expect(await service.purgeBatch(NOW)).toEqual({ purged: 1, failed: 0 });
    expect(storage.remove).toHaveBeenCalledWith('chat/1/c1/a.png');
    expect(prisma.chatMessage.update).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: { mediaPurgedAt: NOW },
    });
  });

  it('leaves a row alone when the object could not be removed (tomorrow retries)', async () => {
    const { service, prisma } = make({
      rows: [[{ id: 'm1', fileKey: 'k' }]],
      removeOk: false,
    });
    expect(await service.purgeBatch(NOW)).toEqual({ purged: 0, failed: 1 });
    expect(prisma.chatMessage.update).not.toHaveBeenCalled();
  });

  it('does nothing while the bucket is off', async () => {
    const { service, prisma } = make({ enabled: false });
    await service.run(NOW);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('stops looping as soon as a batch purges nothing', async () => {
    const { service, prisma } = make({
      rows: [
        [{ id: 'a', fileKey: 'ka' }],
        [{ id: 'b', fileKey: 'kb' }],
        [{ id: 'c', fileKey: 'kc' }],
      ],
      removeOk: false,
    });
    await service.run(NOW);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('keeps going while batches purge something, then stops on an empty one', async () => {
    const { service, prisma } = make({
      rows: [[{ id: 'a', fileKey: 'ka' }], [{ id: 'b', fileKey: 'kb' }]],
    });
    await service.run(NOW);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(3);
  });
});
