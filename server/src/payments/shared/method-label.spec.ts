import { PaymentMethod } from '@prisma/client';
import { PAYMENT_METHOD_LABEL } from './method-label';

describe('PAYMENT_METHOD_LABEL', () => {
  it('names the QR method', () => {
    expect(PAYMENT_METHOD_LABEL[PaymentMethod.QR]).toBe('QR-kod');
  });
});
