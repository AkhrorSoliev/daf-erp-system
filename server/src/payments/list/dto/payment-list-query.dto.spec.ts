import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PaymentListQueryDto } from './payment-list-query.dto';

const parse = async (raw: Record<string, unknown>) => {
  const dto = plainToInstance(PaymentListQueryDto, raw);
  return { dto, errors: await validate(dto) };
};
const G1 = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const G2 = '0f8fad5b-d9cb-469f-a165-70867728950e';

describe('PaymentListQueryDto', () => {
  it('reads comma lists for every multi-value filter', async () => {
    const { dto, errors } = await parse({
      method: 'CASH,CLICK',
      groupId: `${G1},${G2}`,
      courseId: G1,
      teacherId: '10003,10004',
      receivedById: '10002',
    });
    expect(errors).toEqual([]);
    expect(dto.method).toEqual(['CASH', 'CLICK']);
    expect(dto.groupId).toEqual([G1, G2]);
    expect(dto.courseId).toEqual([G1]);
    expect(dto.teacherId).toEqual([10003, 10004]);
    expect(dto.receivedById).toEqual([10002]);
  });

  it('an empty value is no filter, never an empty list', async () => {
    const { dto, errors } = await parse({ method: '', groupId: ',' });
    expect(errors).toEqual([]);
    expect(dto.method).toBeUndefined();
    expect(dto.groupId).toBeUndefined();
  });

  it('defaults to 50 rows and the page, and reads online', async () => {
    const { dto } = await parse({ online: 'true' });
    expect(dto.pageSize).toBe(50);
    expect(dto.page).toBe(1);
    expect(dto.online).toBe(true);
  });

  it('refuses an unknown method, a bad date and more than 100 rows', async () => {
    const { errors } = await parse({
      method: 'BITCOIN',
      startDate: '01.10.2026',
      pageSize: '200',
    });
    expect(errors.map((e) => e.property).sort()).toEqual([
      'method',
      'pageSize',
      'startDate',
    ]);
  });
});
