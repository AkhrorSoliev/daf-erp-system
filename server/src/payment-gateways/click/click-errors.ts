/**
 * Click SHOP-API error codes and helper functions.
 *
 * These are the error codes returned by the supplier (us) in response
 * to Click's Prepare/Complete webhook requests.
 */

// ─── Error codes ─────────────────────────────────────────────────

export const CLICK_SUCCESS = 0;
export const CLICK_SIGN_CHECK_FAILED = -1;
export const CLICK_INVALID_AMOUNT = -2;
export const CLICK_ACTION_NOT_FOUND = -3;
export const CLICK_ALREADY_PAID = -4;
export const CLICK_USER_NOT_FOUND = -5;
export const CLICK_TRANSACTION_NOT_FOUND = -6;
export const CLICK_UPDATE_FAILED = -7;
export const CLICK_REQUEST_ERROR = -8;
export const CLICK_TRANSACTION_CANCELLED = -9;

// ─── Tri-lingual error messages ──────────────────────────────────

export const CLICK_ERROR_MESSAGES: Record<
  number,
  { uz: string; ru: string; en: string }
> = {
  [CLICK_SUCCESS]: {
    uz: 'Muvaffaqiyatli',
    ru: 'Успешно',
    en: 'Success',
  },
  [CLICK_SIGN_CHECK_FAILED]: {
    uz: 'Imzo tekshiruvi xato',
    ru: 'Ошибка проверки подписи',
    en: 'SIGN CHECK FAILED!',
  },
  [CLICK_INVALID_AMOUNT]: {
    uz: "Noto'g'ri summa",
    ru: 'Неверная сумма',
    en: 'Incorrect parameter amount',
  },
  [CLICK_ACTION_NOT_FOUND]: {
    uz: 'Amal topilmadi',
    ru: 'Действие не найдено',
    en: 'Action not found',
  },
  [CLICK_ALREADY_PAID]: {
    uz: "Allaqachon to'langan",
    ru: 'Уже оплачено',
    en: 'Already paid',
  },
  [CLICK_USER_NOT_FOUND]: {
    uz: 'Foydalanuvchi topilmadi',
    ru: 'Пользователь не найден',
    en: 'User does not exist',
  },
  [CLICK_TRANSACTION_NOT_FOUND]: {
    uz: 'Tranzaksiya topilmadi',
    ru: 'Транзакция не найдена',
    en: 'Transaction does not exist',
  },
  [CLICK_UPDATE_FAILED]: {
    uz: 'Yangilash xatosi',
    ru: 'Ошибка обновления',
    en: 'Failed to update user',
  },
  [CLICK_REQUEST_ERROR]: {
    uz: "So'rov xatosi",
    ru: 'Ошибка запроса',
    en: 'Error in request from click',
  },
  [CLICK_TRANSACTION_CANCELLED]: {
    uz: 'Tranzaksiya bekor qilingan',
    ru: 'Транзакция отменена',
    en: 'Transaction cancelled',
  },
};

// ─── Helper ──────────────────────────────────────────────────────

/**
 * Build a Click webhook error response.
 */
export function clickError(
  clickTransId: number,
  merchantTransId: string,
  code: number,
): {
  click_trans_id: number;
  merchant_trans_id: string;
  merchant_prepare_id: null;
  merchant_confirm_id: null;
  error: number;
  error_note: string;
} {
  const msg =
    CLICK_ERROR_MESSAGES[code] ?? CLICK_ERROR_MESSAGES[CLICK_REQUEST_ERROR];
  return {
    click_trans_id: clickTransId,
    merchant_trans_id: merchantTransId,
    merchant_prepare_id: null,
    merchant_confirm_id: null,
    error: code,
    error_note: msg.en,
  };
}
