import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CenterStudentsQueryDto,
  sorovniOqi,
} from './center-students-query.dto';

async function tekshir(query: Record<string, unknown>) {
  const dto = plainToInstance(CenterStudentsQueryDto, query);
  return {
    dto,
    xatolar: await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  };
}

describe('CenterStudentsQueryDto', () => {
  it('vergul bilan bir nechta holat massivga aylanadi', async () => {
    const { dto, xatolar } = await tekshir({
      status: 'QIZIL,SARIQ',
      kirgan: 'yoq',
      page: '2',
    });
    expect(xatolar).toEqual([]);
    expect(dto.status).toEqual(['QIZIL', 'SARIQ']);
    expect(dto.page).toBe(2);
  });

  it("noma'lum holat, davr yoki katta sahifa hajmi rad etiladi", async () => {
    expect((await tekshir({ status: 'BINAFSHA' })).xatolar).not.toEqual([]);
    expect((await tekshir({ period: '15' })).xatolar).not.toEqual([]);
    expect((await tekshir({ pageSize: '500' })).xatolar).not.toEqual([]);
    expect((await tekshir({ sort: 'telefon' })).xatolar).not.toEqual([]);
  });

  it("bo'sh so'rov standartlarga tushadi", async () => {
    const { dto } = await tekshir({});
    expect(sorovniOqi(dto)).toEqual({
      davr: 7,
      status: undefined,
      kirgan: undefined,
      groupId: undefined,
      teacherId: undefined,
      level: undefined,
      q: undefined,
      sort: 'holat',
      dir: 'asc',
      page: 1,
      pageSize: 50,
    });
  });

  it("kirgan 'ha'/'yoq' mantiqiy qiymatga aylanadi", async () => {
    expect(sorovniOqi((await tekshir({ kirgan: 'ha' })).dto).kirgan).toBe(true);
    expect(sorovniOqi((await tekshir({ kirgan: 'yoq' })).dto).kirgan).toBe(
      false,
    );
  });
});
