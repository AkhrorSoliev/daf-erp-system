/**
 * TypeScript interfaces for Paycom Merchant API (JSON-RPC 2.0).
 *
 * Paycom sends requests TO our server; we return JSON-RPC responses.
 * All amounts are in tiyin (1 so'm = 100 tiyin).
 * All timestamps are in milliseconds (Unix epoch).
 */

// ─── JSON-RPC envelope ────────────────────────────────────────────

export interface PaymeRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params: Record<string, unknown>;
}

export interface PaymeRpcSuccess<T = unknown> {
  jsonrpc: '2.0';
  id: number;
  result: T;
}

export interface PaymeRpcError {
  jsonrpc: '2.0';
  id: number;
  error: {
    code: number;
    message: { uz: string; ru: string; en: string };
    data?: string;
  };
}

export type PaymeRpcResponse<T = unknown> = PaymeRpcSuccess<T> | PaymeRpcError;

// ─── Account field ────────────────────────────────────────────────

export interface PaymeAccount {
  student_id: number;
}

// ─── Method params ────────────────────────────────────────────────

export interface CheckPerformParams {
  amount: number;
  account: PaymeAccount;
}

export interface CreateTransactionParams {
  id: string; // 24-char Paycom transaction ID
  time: number; // ms timestamp
  amount: number;
  account: PaymeAccount;
}

export interface PerformTransactionParams {
  id: string;
}

export interface CancelTransactionParams {
  id: string;
  reason: number; // 1-6
}

export interface CheckTransactionParams {
  id: string;
}

export interface GetStatementParams {
  from: number; // ms timestamp
  to: number; // ms timestamp
}

// ─── Method results ───────────────────────────────────────────────

export interface CheckPerformResult {
  allow: boolean;
}

export interface CreateTransactionResult {
  create_time: number;
  transaction: string;
  state: number;
}

export interface PerformTransactionResult {
  transaction: string;
  perform_time: number;
  state: number;
}

export interface CancelTransactionResult {
  transaction: string;
  cancel_time: number;
  state: number;
}

export interface CheckTransactionResult {
  create_time: number;
  perform_time: number;
  cancel_time: number;
  transaction: string;
  state: number;
  reason: number | null;
}

export interface StatementTransaction {
  id: string;
  time: number;
  amount: number;
  account: PaymeAccount;
  create_time: number;
  perform_time: number;
  cancel_time: number;
  transaction: string;
  state: number;
  reason: number | null;
}

export interface GetStatementResult {
  transactions: StatementTransaction[];
}
