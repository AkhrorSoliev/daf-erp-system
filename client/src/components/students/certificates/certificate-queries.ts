import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { downloadAuthedFile } from "@/lib/download-file";
import type { CertificatePreview, IssuedCertificate } from "./certificate-types";

export const certificatePreviewKey = (studentId: number) =>
  ["participation-certificates", "preview", studentId] as const;

/** Lazy: pass `enabled` once the tab has been opened. */
export function useCertificatePreview(studentId: number, enabled: boolean) {
  return useQuery({
    queryKey: certificatePreviewKey(studentId),
    queryFn: () =>
      api
        .get<CertificatePreview>(`/students/${studentId}/participation-certificates/preview`)
        .then((r) => r.data),
    enabled,
    staleTime: 0,
  });
}

export async function issueCertificate(
  studentId: number,
  body: { level: string; exemptReason?: string },
): Promise<IssuedCertificate> {
  return (
    await api.post<IssuedCertificate>(`/students/${studentId}/participation-certificates`, body)
  ).data;
}

export function downloadCertificatePdf(id: string, number: string): Promise<void> {
  return downloadAuthedFile(`/participation-certificates/${id}/pdf`, `${number}.pdf`);
}
