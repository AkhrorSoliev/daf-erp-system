import { TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { MonthlyResponse } from "./salary-types";

interface Props {
  attention: MonthlyResponse["attention"];
  /** The settings sheet's staff section rule (`canManageCompanyPayroll`). */
  canEditStaffRates: boolean;
  /** Opens the rates sheet; without it the rows carry no button. */
  onOpenSettings?: () => void;
}

const fullName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`;

/** «E'tibor talab qiladi» (spec §2.3): lessons without a rate, staff without a salary. */
export function SalaryAttentionCard({ attention, canEditStaffRates, onOpenSettings }: Props) {
  const rows = attention.lessonsWithoutRate.map((t) => ({
    key: `t-${t.userId}`,
    bold: `${t.units} ta darsga ustoz haqi yozilmagan`,
    rest: ` — ${fullName(t)} uchun stavka qo'yilmagan.`,
  }));
  const staff = attention.staffWithoutRate;
  if (canEditStaffRates && staff.length > 0) {
    rows.push({
      key: "staff",
      bold: `${staff.length} xodimning oyligi hisoblanmaydi`,
      rest: ` — ${staff.map(fullName).join(", ")} uchun oylik summa kiritilmagan.`,
    });
  }
  if (rows.length === 0) return null;

  return (
    <Alert className="border-amber-500/40 bg-amber-500/10">
      <TriangleAlert />
      <AlertTitle>E&apos;tibor talab qiladi</AlertTitle>
      <AlertDescription className="text-foreground">
        <ul className="flex flex-col gap-2 pt-1">
          {rows.map((r) => (
            <li key={r.key} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <span>
                <b>{r.bold}</b>
                {r.rest}
              </span>
              {onOpenSettings && (
                <Button size="sm" variant="outline" className="shrink-0 self-start sm:self-auto" onClick={onOpenSettings}>
                  Stavka qo&apos;yish
                </Button>
              )}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
