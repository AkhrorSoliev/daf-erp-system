/**
 * Shape returned by the public verification endpoint that the QR code
 * lands on. The frontend renders a "✓ Bu hujjat haqiqiy" / "✗ Bekor qilingan"
 * page from this DTO. Intentionally lean — only what the verifier needs
 * to confirm authenticity.
 */
export interface ReceiptVerificationDto {
  kind: 'payment' | 'refund';
  receiptCode: string;
  /** True when the underlying record is no longer in good standing
   *  (Payment.status=REVERSED or Refund.status≠COMPLETED). */
  reversed: boolean;
  reversedReason: string | null;
  amount: number;
  currency: 'UZS';
  date: string; // ISO
  studentName: string;
  studentId: number;
  groupName: string | null;
  branchName: string | null;
  companyName: string;
  receivedByName: string | null;
  /** Public PDF URL for download from the verification page. */
  pdfUrl: string;
}
