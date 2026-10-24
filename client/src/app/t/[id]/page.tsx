import { notFound } from "next/navigation";
import { CertificateUnavailable, CertificateView } from "./certificate-view";
import { loadVerify } from "./load-verify";

export default async function CertificateVerifyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await loadVerify(id);
  if (result.kind === "not-found") notFound();
  // No verdict at all: a busy or failing server must not make a genuine document read as fake.
  if (result.kind === "unavailable") return <CertificateUnavailable />;
  return <CertificateView data={result.data} />;
}
