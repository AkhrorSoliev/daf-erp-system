/**
 * Pure URL builders for Payme / Click checkout pages. Both URLs serve as
 * universal links: when opened on a phone with the Payme / Click app
 * installed, the OS routes them straight to the app (with the merchant
 * + amount fields pre-filled). Otherwise they open the provider's web
 * checkout.
 *
 * `accountId` is the value Payme/Click route by — it can be either a
 * real Student.id or a MockExamParticipant.publicId; the gateway webhook
 * handlers (click-methods / payme-methods) try Student first and fall
 * back to MockExamParticipant.publicId.
 */

export interface PaymeCheckoutParams {
  merchantId: string;
  accountId: number;
  amountTiyin: number;
  isProduction: boolean;
  returnUrl?: string | null;
  language?: 'uz' | 'ru' | 'en';
}

/**
 * Builds a Payme checkout URL.
 *
 * Format: `https://checkout.paycom.uz/<base64(m=...;ac.student_id=...;a=...;l=...;c=...)>`.
 * The semicolon-separated params (NOT JSON) are the GET-redirect form
 * documented by Paycom — works on web, iOS, Android.
 */
export function buildPaymeCheckoutUrl(params: PaymeCheckoutParams): string {
  const base = params.isProduction
    ? 'https://checkout.paycom.uz'
    : 'https://test.paycom.uz';

  // Account key is always `ac.student_id` even when the actual identity
  // is a MockExamParticipant.publicId — both come from the shared
  // Student_id_seq sequence, so the gateway webhook routes correctly.
  let paramStr =
    `m=${params.merchantId};` +
    `ac.student_id=${params.accountId};` +
    `a=${params.amountTiyin};` +
    `l=${params.language ?? 'uz'}`;

  // Payme rejects localhost; only append `c=` when the URL is public.
  if (params.returnUrl && !params.returnUrl.includes('localhost')) {
    paramStr += `;c=${params.returnUrl}`;
  }

  const encoded = Buffer.from(paramStr).toString('base64');
  return `${base}/${encoded}`;
}

export interface ClickCheckoutParams {
  serviceId: string;
  merchantId: string;
  accountId: number;
  amountSom: number;
  returnUrl?: string;
  merchantUserId?: string;
}

/**
 * Builds a Click checkout URL.
 *
 * Format: `https://my.click.uz/services/pay?service_id=...&merchant_id=...&amount=...&transaction_param=...`
 * `transaction_param` is the field Click sends back in webhooks as
 * `merchant_trans_id`.
 */
export function buildClickCheckoutUrl(params: ClickCheckoutParams): string {
  const parts: string[] = [
    `service_id=${params.serviceId}`,
    `merchant_id=${params.merchantId}`,
    `amount=${params.amountSom}`,
    `transaction_param=${params.accountId}`,
  ];
  if (params.returnUrl) {
    parts.push(`return_url=${encodeURIComponent(params.returnUrl)}`);
  }
  if (params.merchantUserId) {
    parts.push(`merchant_user_id=${params.merchantUserId}`);
  }
  return `https://my.click.uz/services/pay?${parts.join('&')}`;
}
