import {
  Controller,
  INestApplication,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { FILE_SIZE_MESSAGE, MAX_TASK_FILE_BYTES } from './task-file-rules';
import {
  TaskFileUploadInterceptor,
  UPLOAD_REFUSED_BODY_MESSAGE,
} from './task-file-upload.interceptor';

@Controller('probe')
class ProbeController {
  @Post()
  @UseInterceptors(TaskFileUploadInterceptor)
  take(@UploadedFile() file: Express.Multer.File) {
    return { size: file.buffer.length };
  }
}

// Real multer, real multipart bodies, no database: the limits are the
// request's whole memory budget, so they are pinned here and not in a mock.
describe('TaskFileUploadInterceptor', () => {
  let app: INestApplication<App>;
  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      controllers: [ProbeController],
    }).compile();
    app = mod.createNestApplication();
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });

  it('keeps one file in memory and hands its bytes to the route', async () => {
    const res = await request(app.getHttpServer())
      .post('/probe')
      .field('name', 'a.png')
      .field('durationSec', '3')
      .attach('file', Buffer.from('hello'), 'a.png')
      .expect(201);
    expect(res.body).toEqual({ size: 5 });
  });

  it('a file over 20 MB is a 400 with the Uzbek size message, not a 413 or a 500', async () => {
    const res = await request(app.getHttpServer())
      .post('/probe')
      .attach('file', Buffer.alloc(MAX_TASK_FILE_BYTES + 1), 'big.bin')
      .expect(400);
    expect((res.body as { message: string }).message).toBe(FILE_SIZE_MESSAGE);
  });

  it('a second file, a third field or a wrong field name is a 400 in Uzbek', async () => {
    const two = await request(app.getHttpServer())
      .post('/probe')
      .attach('file', Buffer.from('a'), 'a.png')
      .attach('file', Buffer.from('b'), 'b.png')
      .expect(400);
    const fields = await request(app.getHttpServer())
      .post('/probe')
      .field('a', '1')
      .field('b', '2')
      .field('c', '3')
      .attach('file', Buffer.from('a'), 'a.png')
      .expect(400);
    const other = await request(app.getHttpServer())
      .post('/probe')
      .attach('photo', Buffer.from('a'), 'a.png')
      .expect(400);
    for (const res of [two, fields, other]) {
      expect((res.body as { message: string }).message).toBe(
        UPLOAD_REFUSED_BODY_MESSAGE,
      );
    }
  });

  it('a text field over 1 KB is refused', async () => {
    const res = await request(app.getHttpServer())
      .post('/probe')
      .field('name', 'x'.repeat(2000))
      .attach('file', Buffer.from('a'), 'a.png')
      .expect(400);
    expect((res.body as { message: string }).message).toBe(
      UPLOAD_REFUSED_BODY_MESSAGE,
    );
  });
});
