/**
 * Where the backend API itself is reachable — the host the public receipt
 * PDFs are served from (`api.dafzentrum.uz`), not the frontend portal.
 * `API_BASE_URL`, else Railway's auto-injected `RAILWAY_PUBLIC_DOMAIN`, else
 * the canonical production host. Read from `process.env` on every call.
 */
export function apiBaseUrl(): string {
  const explicit = process.env.API_BASE_URL;
  if (explicit) return explicit;
  const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN;
  if (railwayDomain) return `https://${railwayDomain}`;
  return 'https://api.dafzentrum.uz';
}

/**
 * The public refund receipt (`GET /receipts/refund/:id.pdf`, `@Public()`) —
 * the verification page's download button and the «Berildi» message to the
 * student both use it, so there is one place that knows the address.
 */
export const refundReceiptPdfUrl = (refundId: string): string =>
  `${apiBaseUrl()}/api/receipts/refund/${refundId}.pdf`;
