import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { describeError } from '../telegram-digest/telegram-send';
import {
  FILES_OFF_MESSAGE,
  SIGNED_URL_SECONDS,
  contentDisposition,
} from './task-file-rules';

/**
 * The PRIVATE bucket of task files (ADR-0086): `R2_TASKS_BUCKET_NAME` with the
 * same R2 endpoint and keys as the public photo bucket. Nothing is public: a
 * file is read only through `signedGet`, which the service calls after an
 * access check. Without the bucket name the feature is off (`enabled`).
 * Never log a URL here — a presigned one carries the access key id.
 */
@Injectable()
export class TaskFileStorage {
  private readonly logger = new Logger(TaskFileStorage.name);
  readonly enabled: boolean;
  private readonly bucket: string;
  private readonly s3: S3Client;

  constructor(config: ConfigService) {
    const get = (k: string) => config.get<string>(k)?.trim() || '';
    this.bucket = get('R2_TASKS_BUCKET_NAME');
    const endpoint = get('R2_ENDPOINT');
    const accessKeyId = get('R2_ACCESS_KEY_ID');
    const secretAccessKey = get('R2_SECRET_ACCESS_KEY');
    this.enabled = Boolean(
      this.bucket && endpoint && accessKeyId && secretAccessKey,
    );
    this.s3 = new S3Client({
      region: 'auto',
      endpoint: endpoint || undefined,
      credentials: { accessKeyId, secretAccessKey },
      // Cloudflare R2 rejects the SDK's default CRC32 trailer checksums.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  private assertOn(): void {
    if (!this.enabled) throw new ServiceUnavailableException(FILES_OFF_MESSAGE);
  }

  async put(key: string, body: Buffer, mime: string): Promise<void> {
    this.assertOn();
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: mime,
      }),
    );
  }

  /** DeleteObject (missing key = success on R2). Never throws: the caller decides. */
  async remove(key: string): Promise<boolean> {
    if (!this.enabled) return false;
    try {
      await this.s3.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return true;
    } catch (err) {
      this.logger.warn(`task file ${key} not deleted: ${describeError(err)}`);
      return false;
    }
  }

  /** A 10-minute GET; `download` asks the browser to save instead of show. */
  async signedGet(
    key: string,
    mime: string,
    name: string,
    download: boolean,
  ): Promise<string> {
    this.assertOn();
    return getSignedUrl(
      this.s3,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentType: mime,
        ResponseContentDisposition: contentDisposition(name, download),
      }),
      { expiresIn: SIGNED_URL_SECONDS },
    );
  }
}
