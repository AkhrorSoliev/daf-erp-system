import { ReportPageHeader } from "@/components/reports/report-page-header";
import { msg } from "@/i18n/msg";

export default function GraduatesPage() {
  return (
    <div className="space-y-4">
      <ReportPageHeader
        title={msg("Bitiruvchilar")}
        description={msg("Kurslarni muvaffaqiyatli tugatgan o'quvchilar ro'yxati")}
      />
    </div>
  );
}
