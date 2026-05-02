import { Info } from "lucide-react";

interface Props {
  /**
   * "teacher" — show only the line that affects the teacher (Ustoz oyligidan 12%).
   * "all" — show all six deductions. Use for CEO / Branch Director / Administrator views.
   */
  variant?: "teacher" | "all";
}

/**
 * Static info note listing the deductions that may be applied to salary
 * and income outside the system. Pure visual — no API calls, no calculations.
 * Numbers here are not enforced anywhere in the codebase.
 */
export function PossibleDeductionsInfo({ variant = "all" }: Props) {
  return (
    <div className="rounded-md border bg-muted/30 px-4 py-3 text-xs text-muted-foreground space-y-1.5">
      <div className="font-medium text-foreground flex items-center gap-2">
        <Info className="size-3.5" />
        Eslatma — bu summalardan ushlanishi mumkin:
      </div>
      <ul className="list-disc list-inside space-y-0.5 ml-1">
        <li>Ustoz oyligidan — 12%</li>
        {variant === "all" && (
          <>
            <li>Markaz tomonidan ustoz oyligiga — 12%</li>
            <li>Markaz oylik tushimidan — 4%</li>
            <li>Click har bir to&apos;lovdan — 2%</li>
            <li>Payme har bir to&apos;lovdan — 2%</li>
            <li>Uzum har bir to&apos;lovdan — 2%</li>
          </>
        )}
      </ul>
    </div>
  );
}
