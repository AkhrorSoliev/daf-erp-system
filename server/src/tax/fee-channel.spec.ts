import { PaymentMethod as M, PaymentSource as S } from '@prisma/client';
import { feeChannelOf, channelRateKey } from './fee-channel';

describe('feeChannelOf', () => {
  it.each([
    [M.QR, S.ADMIN_MANUAL, 'qr'],
    [M.PAYME, S.GATEWAY_WEBHOOK, 'integration'],
    [M.CLICK, S.MANUAL_ATTACH, 'integration'],
    [M.UZUM, S.STUDENT_PORTAL, 'integration'],
    [M.PAYME, S.ADMIN_MANUAL, 'app.payme'],
    [M.UZUM, S.ADMIN_MANUAL, 'app.uzum'],
    [M.CASH, S.ADMIN_MANUAL, null],
    [M.TRANSFER, S.ADMIN_MANUAL, null],
  ])('%s via %s → %s', (method, source, expected) => {
    expect(feeChannelOf(method, source)).toBe(expected);
  });
  it('maps a channel to its setting key', () => {
    expect(channelRateKey('app.click')).toBe('fees.app.click');
    expect(channelRateKey('qr')).toBe('fees.qr');
  });
});
