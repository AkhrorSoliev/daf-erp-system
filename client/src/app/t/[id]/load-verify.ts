// What the server's `VerifyView` answers: no branch, no birth date, no percentages.
export interface VerifyDto {
  valid: boolean;
  revoked: boolean;
  number: string;
  studentName: string;
  level: string;
  from: string;
  to: string;
  issuedAt: string;
  companyName: string;
}

export type VerifyResult =
  | { kind: "ok"; data: VerifyDto }
  /** The API said 404: this document was never issued. */
  | { kind: "not-found" }
  /** Anything else (429, 5xx, timeout, a broken body): no verdict either way. */
  | { kind: "unavailable" };

/**
 * Asks the API for the live verdict. Never cached: the page answers «haqiqiy» or
 * «bekor qilingan», and a stale copy would keep saying «haqiqiy» after a revoke.
 * Only a 404 means «not issued»; a busy or failing server must never make a genuine
 * document read as fake.
 */
export async function loadVerify(id: string, fetchImpl: typeof fetch = fetch): Promise<VerifyResult> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
  try {
    const res = await fetchImpl(`${apiUrl}/participation-certificates/${encodeURIComponent(id)}/verify`, {
      cache: "no-store",
    });
    if (res.status === 404) return { kind: "not-found" };
    if (!res.ok) return { kind: "unavailable" };
    return { kind: "ok", data: (await res.json()) as VerifyDto };
  } catch {
    return { kind: "unavailable" };
  }
}
