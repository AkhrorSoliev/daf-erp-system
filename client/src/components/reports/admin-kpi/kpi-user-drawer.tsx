"use client";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { monthLabel } from "@/components/payments/salary-utils";
import { KpiUserPanel } from "./kpi-user-panel";

/** Row click on «Xodimlar KPI» (spec §7.7): the person's results of the page's month. Closing deletes `?xodim=`. */
export function KpiUserDrawer({
  userId,
  name,
  month,
  onClose,
}: {
  userId: number | null;
  name: string | undefined;
  month: string;
  onClose: () => void;
}) {
  return (
    <Sheet open={userId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b px-6 py-4">
          {/* pr-8 keeps the title clear of the sheet's own close button. */}
          <div className="min-w-0 pr-8">
            <SheetTitle className="truncate">{name ?? "Xodim natijalari"}</SheetTitle>
            <SheetDescription>{monthLabel(month)} natijalari</SheetDescription>
          </div>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {userId !== null && <KpiUserPanel key={`${userId}-${month}`} userId={userId} month={month} />}
        </div>
        <SheetFooter className="border-t px-6 py-4">
          <Button variant="outline" onClick={onClose}>
            Yopish
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
