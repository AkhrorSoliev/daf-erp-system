import { ServiceUnavailableException, Logger } from '@nestjs/common';
import {
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { TaskFileStorage } from './task-file-storage';
import { FILES_OFF_MESSAGE } from './task-file-rules';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://signed.example/x'),
}));

const ENV = {
  R2_TASKS_BUCKET_NAME: 'daf-tasks',
  R2_ENDPOINT: 'https://acc.r2.cloudflarestorage.com',
  R2_ACCESS_KEY_ID: 'id',
  R2_SECRET_ACCESS_KEY: 'secret',
};
const config = (over: Record<string, string | undefined> = {}) =>
  ({
    get: (k: string) => ({ ...ENV, ...over })[k as keyof typeof ENV],
  }) as never;
const make = (over: Record<string, string | undefined> = {}) => {
  const storage = new TaskFileStorage(config(over));
  const send = jest.fn().mockResolvedValue({});
  (storage as unknown as { s3: { send: jest.Mock } }).s3 = { send };
  return { storage, send };
};

afterEach(() => jest.clearAllMocks());

it('is on with the bucket and the R2 keys, off without the bucket', () => {
  expect(make().storage.enabled).toBe(true);
  expect(make({ R2_TASKS_BUCKET_NAME: undefined }).storage.enabled).toBe(false);
  expect(make({ R2_TASKS_BUCKET_NAME: '  ' }).storage.enabled).toBe(false);
  expect(make({ R2_ENDPOINT: undefined }).storage.enabled).toBe(false);
});

it('builds the client with R2-safe checksum settings', async () => {
  const storage = new TaskFileStorage(config());
  const s3 = (storage as unknown as { s3: S3Client }).s3;
  await expect(s3.config.requestChecksumCalculation()).resolves.toBe(
    'WHEN_REQUIRED',
  );
  await expect(s3.config.responseChecksumValidation()).resolves.toBe(
    'WHEN_REQUIRED',
  );
});

it('put: one PutObject into the tasks bucket with the type', async () => {
  const { storage, send } = make();
  await storage.put('tasks/1/T/a.png', Buffer.from('x'), 'image/png');
  const cmd = send.mock.calls[0][0];
  expect(cmd).toBeInstanceOf(PutObjectCommand);
  expect(cmd.input).toEqual({
    Bucket: 'daf-tasks',
    Key: 'tasks/1/T/a.png',
    Body: Buffer.from('x'),
    ContentType: 'image/png',
  });
});

it('off: put and signedGet answer 503, nothing is sent', async () => {
  const { storage, send } = make({ R2_TASKS_BUCKET_NAME: undefined });
  await expect(storage.put('k', Buffer.from('x'), 'image/png')).rejects.toThrow(
    ServiceUnavailableException,
  );
  await expect(
    storage.signedGet('k', 'image/png', 'a.png', false),
  ).rejects.toThrow(FILES_OFF_MESSAGE);
  expect(send).not.toHaveBeenCalled();
});

it('signedGet: 10 minutes, the type and the disposition ride on the URL', async () => {
  const { storage } = make();
  await expect(
    storage.signedGet(
      'tasks/1/T/a.pdf',
      'application/pdf',
      'Hisobot.pdf',
      true,
    ),
  ).resolves.toBe('https://signed.example/x');
  const [, cmd, opts] = (getSignedUrl as jest.Mock).mock.calls[0];
  expect(cmd).toBeInstanceOf(GetObjectCommand);
  expect(cmd.input).toEqual({
    Bucket: 'daf-tasks',
    Key: 'tasks/1/T/a.pdf',
    ResponseContentType: 'application/pdf',
    ResponseContentDisposition: `attachment; filename="Hisobot.pdf"; filename*=UTF-8''Hisobot.pdf`,
  });
  expect(opts).toEqual({ expiresIn: 600 });
});

it('remove: true when deleted; false and a warning with the key (never a URL) when not', async () => {
  const { storage, send } = make();
  await expect(storage.remove('tasks/1/T/a.png')).resolves.toBe(true);
  expect(send.mock.calls[0][0]).toBeInstanceOf(DeleteObjectCommand);
  const warn = jest
    .spyOn(Logger.prototype, 'warn')
    .mockImplementation(() => undefined);
  send.mockRejectedValueOnce(new Error('network'));
  await expect(storage.remove('tasks/1/T/b.png')).resolves.toBe(false);
  expect(warn.mock.calls[0][0]).toContain('tasks/1/T/b.png');
  warn.mockRestore();
});
