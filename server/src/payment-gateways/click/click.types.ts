/**
 * TypeScript interfaces for Click SHOP-API (two-phase webhook).
 *
 * Click sends POST requests to our server with Prepare (action=0) and
 * Complete (action=1) phases. Amounts are in so'm (not tiyin).
 */

// ─── Webhook request ─────────────────────────────────────────────

export interface ClickPrepareRequest {
  click_trans_id: number;
  service_id: number;
  click_paydoc_id: number;
  merchant_trans_id: string; // our studentId
  amount: number; // float N.NN (so'm)
  action: 0;
  error: number;
  error_note: string;
  sign_time: string; // "YYYY-MM-DD HH:mm:ss"
  sign_string: string; // MD5 hash
}

export interface ClickCompleteRequest {
  click_trans_id: number;
  service_id: number;
  click_paydoc_id: number;
  merchant_trans_id: string;
  merchant_prepare_id: string; // UUID from our Prepare response
  amount: number;
  action: 1;
  error: number;
  error_note: string;
  sign_time: string;
  sign_string: string;
}

export type ClickWebhookRequest = ClickPrepareRequest | ClickCompleteRequest;

// ─── Webhook response ────────────────────────────────────────────

export interface ClickWebhookResponse {
  click_trans_id: number;
  merchant_trans_id: string;
  merchant_prepare_id?: string | null;
  merchant_confirm_id?: string | null;
  error: number;
  error_note: string;
}
