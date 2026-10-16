import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  GroupPaymentsFilterDto,
  GroupPaymentsQueryDto,
} from './group-payments-query.dto';

async function errors(cls: new () => object, query: object) {
  return validate(plainToInstance(cls, query), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
}
const props = async (cls: new () => object, query: object) =>
  (await errors(cls, query)).map((e) => e.property);

describe('GroupPaymentsQueryDto', () => {
  it('accepts the URL the page keeps', async () => {
    expect(
      await props(GroupPaymentsQueryDto, {
        oy: '2026-10',
        kesim: 'ustoz',
        q: 'olim',
        tartib: 'qoldi',
        qarzdor: '1',
        sahifa: '2',
        soni: '30',
      }),
    ).toEqual([]);
    expect(await props(GroupPaymentsQueryDto, {})).toEqual([]);
  });

  it.each([
    ['oy', '2026-13'],
    ['oy', '10.2026'],
    ['kesim', 'sinf'],
    ['tartib', 'summa'],
    ['qarzdor', 'ha'],
    ['sahifa', '0'],
    ['soni', '5'],
    ['soni', '60'],
    ['q', 'x'.repeat(101)],
  ])('refuses %s=%s', async (key, value) => {
    expect(await props(GroupPaymentsQueryDto, { [key]: value })).toEqual([key]);
  });

  it('speaks Uzbek', async () => {
    const [e] = await errors(GroupPaymentsQueryDto, { oy: '2026-13' });
    expect(Object.values(e.constraints ?? {})).toEqual([
      "Oy YYYY-MM ko'rinishida bo'lishi kerak",
    ]);
    const [s] = await errors(GroupPaymentsQueryDto, { soni: '60' });
    expect(Object.values(s.constraints ?? {})).toEqual([
      "Qatorlar soni 10 dan 50 gacha bo'ladi",
    ]);
  });

  it('the Excel filter takes no page', async () => {
    expect(await props(GroupPaymentsFilterDto, { sahifa: '1' })).toEqual([
      'sahifa',
    ]);
  });
});
