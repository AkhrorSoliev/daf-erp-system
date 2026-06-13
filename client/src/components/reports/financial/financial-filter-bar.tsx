"use client";

import { format } from "date-fns";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";

const ALL = "all";

/** Current calendar month [first, last] as YYYY-MM-DD — the default period. */
export function currentMonthRange() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
  return { start: `${y}-${m}-01`, end: `${y}-${m}-${String(lastDay).padStart(2, "0")}` };
}

/** Reads branchId/startDate/endDate from the URL into an api params object. */
export function useFinancialParams(): Record<string, string> {
  const sp = useSearchParams();
  const range = currentMonthRange();
  const params: Record<string, string> = {};
  const branchId = sp.get("branchId");
  if (branchId) params.branchId = branchId;
  params.startDate = sp.get("startDate") ?? range.start;
  params.endDate = sp.get("endDate") ?? range.end;
  return params;
}

function toDate(s?: string | null): Date | null {
  return s ? new Date(`${s}T00:00:00`) : null;
}
function toStr(d?: Date): string | null {
  return d ? format(d, "yyyy-MM-dd") : null;
}

export function FinancialFilterBar({ withPeriod = true }: { withPeriod?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const branches = useBranchSwitcher((s) => s.branches);
  const range = currentMonthRange();

  const branchId = searchParams.get("branchId") ?? ALL;
  const startD = toDate(searchParams.get("startDate") ?? range.start);
  const endD = toDate(searchParams.get("endDate") ?? range.end);

  const update = (patch: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === ALL || v === "") params.delete(k);
      else params.set(k, v);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select value={branchId} onValueChange={(v) => update({ branchId: v })}>
        <SelectTrigger className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Barcha filiallar</SelectItem>
          {branches.map((b) => (
            <SelectItem key={b.id} value={String(b.id)}>
              {b.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {withPeriod && (
        <>
          <DatePicker
            value={startD}
            maxDate={endD ?? undefined}
            defaultMonth={endD ?? undefined}
            placeholder="Boshlanish sanasi"
            onChange={(d) => update({ startDate: toStr(d) })}
          />
          <DatePicker
            value={endD}
            minDate={startD ?? undefined}
            defaultMonth={startD ?? undefined}
            placeholder="Tugash sanasi"
            onChange={(d) => update({ endDate: toStr(d) })}
          />
        </>
      )}

      <Button variant="outline" onClick={() => router.replace(pathname, { scroll: false })}>
        Tozalash
      </Button>
    </div>
  );
}
