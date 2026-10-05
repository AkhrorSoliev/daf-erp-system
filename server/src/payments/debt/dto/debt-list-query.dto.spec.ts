import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DebtListQueryDto } from './debt-list-query.dto';

const parse = (query: object) => plainToInstance(DebtListQueryDto, query);
async function rejected(query: object) {
  return (
    await validate(parse(query), {
      whitelist: true,
      forbidNonWhitelisted: true,
    })
  ).map((e) => e.property);
}

describe('DebtListQueryDto', () => {
  it('accepts the URL the page keeps, with its defaults', async () => {
    expect(
      await rejected({
        tab: 'eski',
        sort: 'oldest',
        promise: 'broken',
        page: '2',
        pageSize: '100',
      }),
    ).toEqual([]);
    expect(parse({})).toMatchObject({ tab: 'shu-oy', sort: 'debt' });
  });

  it.each([
    ['tab', 'hammasi'],
    ['sort', 'amount'],
    ['promise', 'overdue'],
    ['pageSize', '101'],
  ])('refuses %s=%s', async (key, value) => {
    expect(await rejected({ [key]: value })).toEqual([key]);
  });

  it('reads teacherIds=1,2 as [1, 2]; junk is no filter', () => {
    expect(parse({ teacherIds: '1,2' }).teacherIds).toEqual([1, 2]);
    expect(parse({ teacherIds: 'abc' }).teacherIds).toBeUndefined();
  });
});
