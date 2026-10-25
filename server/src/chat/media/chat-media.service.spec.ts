import {
  GoneException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ChatMediaService } from './chat-media.service';

const PNG = Buffer.concat([
  Buffer.from('89504e470d0a1a0a', 'hex'),
  Buffer.alloc(32),
]);
// an Opus-in-Ogg header, as the sniffer needs (a bare 'OggS' is not audio)
const OGG = Buffer.concat([
  Buffer.from('OggS'),
  Buffer.alloc(24),
  Buffer.from('OpusHead'),
  Buffer.alloc(8),
]);

function make(
  o: { enabled?: boolean; commitFails?: boolean; message?: object | null } = {},
) {
  const prisma = {
    chatMessage: {
      findFirst: jest.fn().mockResolvedValue(
        o.message === undefined
          ? {
              id: 'm1',
              fileKey: 'chat/1/c1/a.png',
              mime: 'image/png',
              mediaPurgedAt: null,
              conversation: { studentLowId: 1, studentHighId: 2 },
            }
          : o.message,
      ),
    },
  };
  const storage = {
    enabled: o.enabled ?? true,
    put: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(true),
    signedGet: jest.fn().mockResolvedValue('https://signed.example/x'),
  };
  const conversations = {
    prepareSend: jest.fn().mockResolvedValue({ peerId: 2 }),
    commitMessage: o.commitFails
      ? jest.fn().mockRejectedValue(new Error('db down'))
      : jest.fn().mockResolvedValue({ id: 'm1' }),
  };
  return {
    service: new ChatMediaService(
      prisma as never,
      storage as never,
      conversations as never,
    ),
    prisma,
    storage,
    conversations,
  };
}

describe('ChatMediaService.upload', () => {
  it('is off without the bucket and checks nothing else', async () => {
    const { service, conversations } = make({ enabled: false });
    await expect(service.upload(1, 1, 'c1', { buffer: PNG })).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(conversations.prepareSend).not.toHaveBeenCalled();
  });

  it('runs the send checks, stores the bytes, then commits the row', async () => {
    const { service, storage, conversations } = make();
    await service.upload(1, 1, 'c1', { buffer: PNG });
    expect(conversations.prepareSend).toHaveBeenCalledWith(1, 1, 'c1');
    expect(storage.put).toHaveBeenCalledWith(
      expect.stringMatching(/^chat\/1\/c1\/.+\.png$/),
      PNG,
      'image/png',
    );
    expect(conversations.commitMessage).toHaveBeenCalledWith(1, 1, 'c1', 2, {
      kind: 'IMAGE',
      fileKey: expect.stringMatching(/^chat\/1\/c1\//),
      mime: 'image/png',
      sizeBytes: PNG.length,
      durationSec: null,
    });
  });

  it('keeps the declared duration for voice', async () => {
    const { service, conversations } = make();
    await service.upload(1, 1, 'c1', { buffer: OGG, durationSec: 30 });
    expect(conversations.commitMessage).toHaveBeenCalledWith(
      1,
      1,
      'c1',
      2,
      expect.objectContaining({ kind: 'VOICE', durationSec: 30 }),
    );
  });

  it('takes the object back when the row cannot be written', async () => {
    const { service, storage } = make({ commitFails: true });
    await expect(service.upload(1, 1, 'c1', { buffer: PNG })).rejects.toThrow(
      'db down',
    );
    expect(storage.remove).toHaveBeenCalledWith(storage.put.mock.calls[0][0]);
  });

  it('refuses a bad file after the checks and before touching storage', async () => {
    const { service, storage } = make();
    await expect(
      service.upload(1, 1, 'c1', { buffer: Buffer.from('salom') }),
    ).rejects.toThrow('Faqat rasm');
    expect(storage.put).not.toHaveBeenCalled();
  });
});

describe('ChatMediaService.signedUrl', () => {
  it('returns a link to a member', async () => {
    const { service, storage } = make();
    expect(await service.signedUrl(1, 'm1')).toEqual({
      url: 'https://signed.example/x',
      expiresInSec: 600,
    });
    expect(storage.signedGet).toHaveBeenCalledWith(
      'chat/1/c1/a.png',
      'image/png',
      'fayl.png',
      false,
    );
  });

  it('404s for a non-member and for a message without a file', async () => {
    await expect(make().service.signedUrl(99, 'm1')).rejects.toThrow(
      NotFoundException,
    );
    await expect(
      make({ message: null }).service.signedUrl(1, 'm1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('answers 410 for a purged file', async () => {
    const { service } = make({
      message: {
        id: 'm1',
        fileKey: 'k.png',
        mime: 'image/png',
        mediaPurgedAt: new Date(),
        conversation: { studentLowId: 1, studentHighId: 2 },
      },
    });
    await expect(service.signedUrl(1, 'm1')).rejects.toThrow(GoneException);
  });
});
