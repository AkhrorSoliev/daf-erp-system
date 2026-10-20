"use client";

import { TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/context";
import { markedText } from "../debt-history/marked-text";
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
  const t = useT();
  // One sentence per row; its «**…**» part is drawn bold (`markedText`).
  const rows = attention.lessonsWithoutRate.map((teacher) => ({
    key: `t-${teacher.userId}`,
    text: t("**{n} ta darsga ustoz haqi yozilmagan** — {name} uchun stavka qo'yilmagan.", {
      n: teacher.units,
      name: fullName(teacher),
    }),
  }));
  const staff = attention.staffWithoutRate;
  if (canEditStaffRates && staff.length > 0) {
    rows.push({
      key: "staff",
      text: t("**{n} xodimning oyligi hisoblanmaydi** — {names} uchun oylik summa kiritilmagan.", {
        n: staff.length,
        names: staff.map(fullName).join(", "),
      }),
    });
  }
  if (rows.length === 0) return null;

  return (
    <Alert className="border-amber-500/40 bg-amber-500/10">
      <TriangleAlert />
      <AlertTitle>{t("E'tibor talab qiladi")}</AlertTitle>
      <AlertDescription className="text-foreground">
        <ul className="flex flex-col gap-2 pt-1">
          {rows.map((r) => (
            <li key={r.key} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <span>{markedText(r.text)}</span>
              {onOpenSettings && (
                <Button size="sm" variant="outline" className="shrink-0 self-start sm:self-auto" onClick={onOpenSettings}>
                  {t("Stavka qo'yish")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
