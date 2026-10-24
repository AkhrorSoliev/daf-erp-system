import { queryOptions, useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { downloadAuthedFile } from "@/lib/download-file";
import { retryDrawer } from "@/components/payments/debt/debt-queries";
import type { CertificatePreview, IssuedCertificate } from "./certificate-types";

export const certificatePreviewKey = (studentId: number) =>
  ["participation-certificates", "preview", studentId] as const;

/**
 * `retryDrawer`: only a network or 5xx failure is retried. An archived student's
 * 404 (or a 403) will not change, so the CEO must not wait on a skeleton for it.
 */
export const certificatePreviewOptions = (studentId: number, enabled: boolean) =>
  queryOptions({
    queryKey: certificatePreviewKey(studentId),
    queryFn: () =>
      api
        .get<CertificatePreview>(`/students/${studentId}/participation-certificates/preview`)
        .then((r) => r.data),
    enabled,
    staleTime: 0,
    retry: retryDrawer,
  });

/** Lazy: pass `enabled` once the tab has been opened. */
export function useCertificatePreview(studentId: number, enabled: boolean) {
  return useQuery(certificatePreviewOptions(studentId, enabled));
}

export async function issueCertificate(
  studentId: number,
  body: { level: string; exemptReason?: string },
): Promise<IssuedCertificate> {
  return (
    await api.post<IssuedCertificate>(`/students/${studentId}/participation-certificates`, body)
  ).data;
}

/** Soft cancel of an issued document; the server returns the updated row. */
export async function revokeCertificate(id: string, reason: string): Promise<IssuedCertificate> {
  return (await api.post<IssuedCertificate>(`/participation-certificates/${id}/revoke`, { reason })).data;
}

export function downloadCertificatePdf(id: string, number: string): Promise<void> {
  return downloadAuthedFile(`/participation-certificates/${id}/pdf`, `${number}.pdf`);
}
