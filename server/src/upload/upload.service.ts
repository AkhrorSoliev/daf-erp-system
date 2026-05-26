import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { extname } from 'path';

@Injectable()
export class UploadService {
  private s3: S3Client;
  private bucket: string;
  private publicUrl: string;

  constructor(private config: ConfigService) {
    this.bucket = this.config.get<string>('R2_BUCKET_NAME')!;
    this.publicUrl = this.config.get<string>('R2_PUBLIC_URL')!;

    this.s3 = new S3Client({
      region: 'auto',
      endpoint: this.config.get<string>('R2_ENDPOINT')!,
      credentials: {
        accessKeyId: this.config.get<string>('R2_ACCESS_KEY_ID')!,
        secretAccessKey: this.config.get<string>('R2_SECRET_ACCESS_KEY')!,
      },
    });
  }

  async uploadFile(
    file: Express.Multer.File,
    folder: string = 'photos',
  ): Promise<string> {
    const ext = extname(file.originalname);
    const key = `${folder}/${randomUUID()}${ext}`;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

    return `${this.publicUrl}/${key}`;
  }

  /**
   * Uploads a raw buffer with an explicit content type. Used for
   * server-generated documents (mock exam results PDFs, contract PDFs, …)
   * that don't go through a multipart upload.
   */
  async uploadBuffer(
    buffer: Buffer,
    folder: string,
    ext: string,
    contentType: string,
  ): Promise<string> {
    const normalizedExt = ext.startsWith('.') ? ext : `.${ext}`;
    const key = `${folder}/${randomUUID()}${normalizedExt}`;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );

    return `${this.publicUrl}/${key}`;
  }

  async deleteFile(fileUrl: string): Promise<void> {
    try {
      const key = fileUrl.replace(`${this.publicUrl}/`, '');
      await this.s3.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
    } catch {
      // Eski fayl o'chirilmasa ham davom etamiz
    }
  }
}
