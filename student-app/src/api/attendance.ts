import { api } from './client';

export type ScanResult = {
  balanceInsufficient?: boolean;
  debtAmount?: number;
  message?: string;
  [key: string]: unknown;
};

/** POST /api/student-portal/attendance/scan — token comes from the scanned QR JSON `{ t }`. */
export async function scanQr(token: string): Promise<ScanResult> {
  const { data } = await api.post<ScanResult>('/student-portal/attendance/scan', { token });
  return data;
}
