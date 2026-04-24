import { BarChart3 } from "lucide-react";

export default function ReportsPage() {
  return (
    <div className="hidden md:flex min-h-[320px] flex-col items-center justify-center rounded-lg border border-dashed text-center p-10">
      <BarChart3 className="h-10 w-10 text-muted-foreground mb-3" />
      <p className="text-base font-medium">Hisobot bo&apos;limini tanlang</p>
      <p className="text-sm text-muted-foreground mt-1">
        Chap tarafdagi menyudan kerakli hisobotni oching
      </p>
    </div>
  );
}
