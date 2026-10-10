import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { NotificationQueryDto } from './notification-query.dto';

// The pipe `main.ts` installs globally.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});
const parse = (query: object) =>
  pipe.transform(query, { type: 'query', metatype: NotificationQueryDto });

describe('NotificationQueryDto', () => {
  // A stale pre-phase-5 bell tab keeps sending these for days after the deploy;
  // `forbidNonWhitelisted` would turn a removed field into a 400 and the old
  // bell into an error.
  it("accepts the old bell's ?page=1&pageSize=20", async () => {
    await expect(parse({ page: '1', pageSize: '20' })).resolves.toMatchObject({
      page: 1,
      pageSize: 20,
    });
  });

  it("accepts the new bell's query", async () => {
    await expect(
      parse({ filter: 'pending', type: 'task', q: 'x', pageSize: '30' }),
    ).resolves.toMatchObject({ filter: 'pending', type: 'task', pageSize: 30 });
  });

  it('is still strict: an unknown field and a page size over 50 are refused', async () => {
    await expect(parse({ page: '1', limit: '20' })).rejects.toThrow(
      BadRequestException,
    );
    await expect(parse({ pageSize: '51' })).rejects.toThrow(
      BadRequestException,
    );
  });
});
