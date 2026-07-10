"use client";

import { useState } from "react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { Download, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useAuth } from "@/hooks/use-auth";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Comparison bases offered on download. "custom" reveals a date-range pair.
const COMPARE_OPTS = [
  { key: "prev", label: "Oldingi davr" },
  { key: "yoy", label: "O'tgan yil (shu davr)" },
  { key: "yearly", label: "Yillar kesimida" },
  { key: "custom", label: "Maxsus davr" },
] as const;

type CompareKey = (typeof COMPARE_OPTS)[number]["key"];

/**
 * Export options for the /payments/overview financial Excel — lets the user pick
 * the branch (Barcha filiallar / bitta filial) and which comparisons to include
 * (previous period / last year / multi-year / a custom range) before downloading.
 * The download itself is an auth-gated blob fetch (same as before), now with the
 * branch + compare params threaded through.
 */
export function ExportOptionsPopover({
  startStr,
  endStr,
}: {
  startStr: string;
  endStr: string;
}) {
  const user = useAuth((s) => s.user);
  const isCeo = user?.roles.some((r) => r.id === 1) ?? false;
  const branches = useBranchSwitcher((s) => s.branches);

  const [open, setOpen] = useState(false);
  const [branchId, setBranchId] = useState<string>("all"); // "all" | branchId
  // Default: no comparisons — an untouched download yields ONLY the selected
  // period's report. Comparisons are opt-in via the checkboxes below.
  const [modes, setModes] = useState<Record<CompareKey, boolean>>({
    prev: false,
    yoy: false,
    yearly: false,
    custom: false,
  });
  const [cmpStart, setCmpStart] = useState<Date>(
    startOfMonth(subMonths(new Date(), 1)),
  );
  const [cmpEnd, setCmpEnd] = useState<Date>(
    endOfMonth(subMonths(new Date(), 1)),
  );
  const [exporting, setExporting] = useState(false);

  const toggle = (k: CompareKey) =>
    setModes((m) => ({ ...m, [k]: !m[k] }));

  const download = async () => {
    setExporting(true);
    try {
      const active = COMPARE_OPTS.filter((o) => modes[o.key]).map((o) => o.key);
      const params: Record<string, string | number> = {
        startDate: startStr,
        endDate: endStr,
        compare: active.join(","),
      };
      if (branchId !== "all") params.branchId = Number(branchId);
      if (modes.custom) {
        params.compareStartDate = format(cmpStart, "yyyy-MM-dd");
        params.compareEndDate = format(cmpEnd, "yyyy-MM-dd");
      }
      const res = await api.get("/reports/financial-excel", {
        params,
        responseType: "blob",
      });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `moliyaviy-hisobot-${startStr}_${endStr}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      setOpen(false);
    } catch (e) {
      toast.error(getErrorMessage(e, "Excel yuklab olishda xatolik"));
    } finally {
      setExporting(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline">
          <Download className="size-4 mr-2" />
          Excel yuklab olish
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-4">
        {/* Filial */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">
            Filial
          </Label>
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {isCeo ? "Barcha filiallar" : "Barcha filiallarim"}
              </SelectItem>
              {branches.map((b) => (
                <SelectItem key={b.id} value={String(b.id)}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Taqqoslash */}
        <div className="space-y-2">
          <Label className="text-xs font-medium text-muted-foreground">
            Taqqoslash (ixtiyoriy)
          </Label>
          <p className="text-xs text-muted-foreground">
            Bo&apos;sh qoldirilsa — faqat tanlangan davr hisoboti chiqadi.
          </p>
          {COMPARE_OPTS.map((o) => (
            <div key={o.key} className="flex items-center gap-2">
              <Checkbox
                id={`cmp-${o.key}`}
                checked={modes[o.key]}
                onCheckedChange={() => toggle(o.key)}
              />
              <Label
                htmlFor={`cmp-${o.key}`}
                className="cursor-pointer text-sm font-normal"
              >
                {o.label}
              </Label>
            </div>
          ))}
          {modes.custom && (
            <div className="flex items-center gap-2 pl-6 pt-1">
              <DatePicker
                value={cmpStart}
                onChange={(d) => d && setCmpStart(d)}
                className="w-32"
                maxDate={cmpEnd}
                defaultMonth={cmpEnd}
                placeholder="Boshi"
              />
              <span className="text-xs text-muted-foreground">—</span>
              <DatePicker
                value={cmpEnd}
                onChange={(d) => d && setCmpEnd(d)}
                className="w-32"
                minDate={cmpStart}
                defaultMonth={cmpStart}
                placeholder="Oxiri"
              />
            </div>
          )}
        </div>

        <Button onClick={download} disabled={exporting} className="w-full">
          {exporting ? (
            <Loader2 className="size-4 mr-2 animate-spin" />
          ) : (
            <Download className="size-4 mr-2" />
          )}
          Yuklab olish
        </Button>
      </PopoverContent>
    </Popover>
  );
}
