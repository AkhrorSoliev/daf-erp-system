import type { Metadata } from "next";
import { PublicPageI18n } from "@/components/public-page-i18n";
import { LanguagePicker } from "@/components/student-portal/lumio/language-picker";
import { serverTranslator } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await serverTranslator();
  return {
    title: t("Hujjatni tekshirish"),
    description: t("DaF Sprachzentrum kvitansiyasini tekshirish"),
    robots: { index: false, follow: false },
  };
}

/**
 * Public verification route — no app shell, no sidebar, no auth.
 * The QR code on a paper receipt lands here. The page itself does the
 * fetch from the public verify endpoint.
 */
export default function ReceiptVerifyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PublicPageI18n>
      <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="mb-3 flex justify-end">
            <LanguagePicker variant="plain" />
          </div>
          {children}
        </div>
      </div>
    </PublicPageI18n>
  );
}
