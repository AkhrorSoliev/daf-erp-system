import { PaymentMethod, PaymentSource } from '@prisma/client';
import type { TaxRateKey } from './tax-rates';

export type FeeChannel =
  | 'app.payme'
  | 'app.click'
  | 'app.uzum'
  | 'integration'
  | 'qr';

const APP: Partial<Record<PaymentMethod, FeeChannel>> = {
  PAYME: 'app.payme',
  CLICK: 'app.click',
  UZUM: 'app.uzum',
};

/**
 * To'lov qaysi komissiya kanalidan o'tgani (spec 2026-10-25 «Kanallar xaritasi»).
 * Admin qo'lda kiritgan Payme/Click/Uzum = o'quvchi ilovada o'zi to'lagan;
 * ulanish orqali kelgani (webhook yoki biriktirish) = integratsiya.
 */
export function feeChannelOf(
  method: PaymentMethod,
  source: PaymentSource,
): FeeChannel | null {
  if (method === PaymentMethod.QR) return 'qr';
  const app = APP[method];
  if (!app) return null;
  return source === PaymentSource.ADMIN_MANUAL ? app : 'integration';
}

export function channelRateKey(c: FeeChannel): TaxRateKey {
  return `fees.${c}` as TaxRateKey;
}
