import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Forma",
  description: "DaF Sprachzentrum public formasi",
  robots: { index: false, follow: false },
};

// Public form route — no app shell, no auth, no sidebar.
// Submission goes straight to a public API endpoint.
export default function PublicFormLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-muted/30 flex items-start justify-center p-4 py-10 sm:py-16">
      <div className="w-full max-w-lg">{children}</div>
    </div>
  );
}
