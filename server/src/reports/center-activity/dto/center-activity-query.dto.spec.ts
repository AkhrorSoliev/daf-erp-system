import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CenterActivityQueryDto } from './center-activity-query.dto';

const props = async (query: object) =>
  (
    await validate(plainToInstance(CenterActivityQueryDto, query), {
      whitelist: true,
      forbidNonWhitelisted: true,
    })
  ).map((e) => e.property);

describe('CenterActivityQueryDto', () => {
  it('accepts the URL the page keeps', async () => {
    expect(await props({ oy: '2026-09', filial: '2' })).toEqual([]);
    expect(await props({})).toEqual([]);
  });

  it.each([
    ['oy', '2026-13'],
    ['oy', '09.2026'],
    ['filial', '0'],
    ['filial', 'a'],
  ])('refuses %s=%s', async (key, value) => {
    expect(await props({ [key]: value })).toEqual([key]);
  });

  it('refuses an unknown key', async () => {
    expect(await props({ bucket: 'daily' })).toEqual(['bucket']);
  });
});
