import { ServiceUnavailableException } from '@nestjs/common';
import { ChatFileStorage } from './chat-file-storage';
import { CHAT_FILES_OFF_MESSAGE } from '../chat.constants';

const ENV = {
  R2_CHAT_BUCKET_NAME: 'daf-chat',
  R2_ENDPOINT: 'https://acc.r2.cloudflarestorage.com',
  R2_ACCESS_KEY_ID: 'id',
  R2_SECRET_ACCESS_KEY: 'secret',
};
const config = (over: Record<string, string | undefined> = {}) =>
  ({
    get: (k: string) => ({ ...ENV, ...over })[k as keyof typeof ENV],
  }) as never;

describe('ChatFileStorage', () => {
  it('is off without the chat bucket name', () => {
    const storage = new ChatFileStorage(
      config({ R2_CHAT_BUCKET_NAME: undefined }),
    );
    expect(storage.enabled).toBe(false);
  });

  it('is on with the bucket and all three R2 keys', () => {
    const storage = new ChatFileStorage(config());
    expect(storage.enabled).toBe(true);
  });

  it('is off when an R2 key is missing, even with the bucket', () => {
    expect(
      new ChatFileStorage(config({ R2_ENDPOINT: undefined })).enabled,
    ).toBe(false);
  });

  it('put answers 503 with the chat wording while off', async () => {
    const storage = new ChatFileStorage(
      config({ R2_CHAT_BUCKET_NAME: undefined }),
    );
    await expect(
      storage.put('chat/1/c1/a.png', Buffer.from('x'), 'image/png'),
    ).rejects.toThrow(ServiceUnavailableException);
    await expect(
      storage.put('chat/1/c1/a.png', Buffer.from('x'), 'image/png'),
    ).rejects.toThrow(CHAT_FILES_OFF_MESSAGE);
  });

  it('remove resolves false while off', async () => {
    const storage = new ChatFileStorage(
      config({ R2_CHAT_BUCKET_NAME: undefined }),
    );
    await expect(storage.remove('chat/1/c1/a.png')).resolves.toBe(false);
  });
});
