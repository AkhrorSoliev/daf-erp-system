/**
 * Paycom Merchant API error codes and helper.
 *
 * Error codes follow the JSON-RPC 2.0 spec and Paycom's extension codes.
 * Every error carries a tri-lingual message object { uz, ru, en }.
 */

// ─── Error codes ──────────────────────────────────────────────────

/** Invalid JSON received */
export const PARSE_ERROR = -32700;

/** Requested method does not exist */
export const METHOD_NOT_FOUND = -32601;

/** Authorization failed (bad Basic Auth) */
export const AUTH_ERROR = -32504;

/** Internal server error */
export const INTERNAL_ERROR = -32400;

/** Invalid amount */
export const INVALID_AMOUNT = -31001;

/** Transaction not found */
export const TRANSACTION_NOT_FOUND = -31003;

/** Cannot cancel — order already completed */
export const CANNOT_CANCEL = -31007;

/** Operation cannot be performed (wrong state) */
export const CANNOT_PERFORM = -31008;

/** Student not found (account validation) */
export const STUDENT_NOT_FOUND = -31050;

// ─── Pre-built error messages ─────────────────────────────────────

export const ERROR_MESSAGES = {
  [AUTH_ERROR]: {
    uz: 'Avtorizatsiya xatosi',
    ru: 'Ошибка авторизации',
    en: 'Authorization error',
  },
  [METHOD_NOT_FOUND]: {
    uz: 'Metod topilmadi',
    ru: 'Метод не найден',
    en: 'Method not found',
  },
  [INVALID_AMOUNT]: {
    uz: "Noto'g'ri summa",
    ru: 'Неверная сумма',
    en: 'Invalid amount',
  },
  [TRANSACTION_NOT_FOUND]: {
    uz: 'Tranzaksiya topilmadi',
    ru: 'Транзакция не найдена',
    en: 'Transaction not found',
  },
  [CANNOT_CANCEL]: {
    uz: "Bajarilgan to'lovni bekor qilib bo'lmaydi",
    ru: 'Невозможно отменить выполненный платеж',
    en: 'Cannot cancel a performed transaction',
  },
  [CANNOT_PERFORM]: {
    uz: 'Bu amalni bajarib bo\'lmaydi',
    ru: 'Невозможно выполнить данную операцию',
    en: 'Unable to perform this operation',
  },
  [STUDENT_NOT_FOUND]: {
    uz: 'Talaba topilmadi',
    ru: 'Студент не найден',
    en: 'Student not found',
  },
  [INTERNAL_ERROR]: {
    uz: 'Ichki server xatosi',
    ru: 'Внутренняя ошибка сервера',
    en: 'Internal server error',
  },
} as const;

// ─── Helper ───────────────────────────────────────────────────────

/**
 * Build a JSON-RPC 2.0 error response.
 */
export function paymeError(
  rpcId: number,
  code: number,
  message?: { uz: string; ru: string; en: string },
  data?: string,
) {
  return {
    jsonrpc: '2.0' as const,
    id: rpcId,
    error: {
      code,
      message: message ?? ERROR_MESSAGES[code] ?? ERROR_MESSAGES[INTERNAL_ERROR],
      data,
    },
  };
}

/**
 * Build a JSON-RPC 2.0 success response.
 */
export function paymeSuccess<T>(rpcId: number, result: T) {
  return {
    jsonrpc: '2.0' as const,
    id: rpcId,
    result,
  };
}
