import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CancelContractDocumentDto,
  CreateContractDocumentDto,
} from './contract-document.dto';

const ENR = '11111111-1111-4111-8111-111111111111';

// Same options as the global ValidationPipe in main.ts.
async function errors<T extends object>(cls: new () => T, body: object) {
  const dto = plainToInstance(cls, body);
  const found = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return found.map((e) => e.property);
}

const valid = {
  studentId: 10001,
  enrollmentIds: [ENR],
  customer: {
    kind: 'PARENT',
    fullName: 'Soliyeva Malika',
    phone: '901234567',
  },
  courses: [
    { enrollmentId: ENR, firstPaymentAmount: 405000, includes: ['DARSLIK'] },
  ],
};

describe('CreateContractDocumentDto', () => {
  it('accepts what the dialog sends', async () => {
    expect(await errors(CreateContractDocumentDto, valid)).toEqual([]);
  });

  it('needs at least one course', async () => {
    expect(
      await errors(CreateContractDocumentDto, { ...valid, enrollmentIds: [] }),
    ).toEqual(['enrollmentIds']);
  });

  it('checks the nested customer and course extras', async () => {
    expect(
      await errors(CreateContractDocumentDto, {
        ...valid,
        customer: { kind: 'FRIEND', fullName: ' ' },
        courses: [{ enrollmentId: ENR, includes: ['KITOB'] }],
      }),
    ).toEqual(['customer', 'courses']);
  });

  it('refuses unknown fields', async () => {
    expect(
      await errors(CreateContractDocumentDto, { ...valid, number: 'X' }),
    ).toEqual(['number']);
  });
});

describe('CancelContractDocumentDto', () => {
  it('needs a reason of at least 3 letters after trimming', async () => {
    expect(
      await errors(CancelContractDocumentDto, { reason: '  ab ' }),
    ).toEqual(['reason']);
    expect(
      await errors(CancelContractDocumentDto, { reason: 'Xato tuzildi' }),
    ).toEqual([]);
  });
});
