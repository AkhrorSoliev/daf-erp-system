import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePaymentPromiseDto } from './create-payment-promise.dto';

async function rejected(over: object) {
  const dto = plainToInstance(CreatePaymentPromiseDto, {
    studentId: 10001,
    promiseDate: '2026-10-14',
    comment: 'Maoshdan keyin',
    ...over,
  });
  return (
    await validate(dto, { whitelist: true, forbidNonWhitelisted: true })
  ).map((e) => e.property);
}

describe('CreatePaymentPromiseDto', () => {
  // The payment dialog's day, the drawer's 23:00 and the call dialog's 23:59:59 instants.
  it.each([
    '2026-10-14',
    '2026-10-14T18:00:00.000Z',
    '2026-10-14T18:59:59.000Z',
  ])('accepts what the clients send: %s', async (promiseDate) => {
    expect(await rejected({ promiseDate })).toEqual([]);
  });

  it('refuses a day that does not exist (V8 would roll 30.02 over to 02.03)', async () => {
    expect(await rejected({ promiseDate: '2026-02-30' })).toEqual([
      'promiseDate',
    ]);
  });

  it('caps the amount at int4', async () => {
    expect(await rejected({ promisedAmount: 2_147_483_647 })).toEqual([]);
    expect(await rejected({ promisedAmount: 2_147_483_648 })).toEqual([
      'promisedAmount',
    ]);
  });
});
