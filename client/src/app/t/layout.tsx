import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Hujjatni tekshirish",
  description: "DaF Sprachzentrum qatnashganlik hujjatini tekshirish",
  robots: { index: false, follow: false },
};

/** Public verification route — no app shell, no sidebar, no auth. The QR on the paper lands here. */
export default function CertificateVerifyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
