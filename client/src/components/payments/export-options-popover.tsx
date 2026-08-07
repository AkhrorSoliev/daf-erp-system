"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useAuth } from "@/hooks/use-auth";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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

// Sheet groups offered on download. Unticked = the ten-sheet report only.
const EXTRA_OPTS = [
  {
    key: "buxgalteriya",
    label: "Buxgalteriya",
    hint: "Foyda va zarar, Balans, Tekshiruv",
  },
  {
    key: "marketing",
    label: "Marketing va ustozlar",
    hint: "Lidlar, ustozlar samaradorligi",
  },
  {
    key: "qarzdorlar",
    label: "Qarzdorlar ro'yxati",
    hint: "Har bir qarzdor o'quvchi",
  },
] as const;

type ExtraKey = (typeof EXTRA_OPTS)[number]["key"];

/**
 * Export options for the /payments/overview "Hisobot" Excel — lets the user
 * pick the branch (Barcha filiallar / bitta filial) and which optional sheet
 * groups to bolt onto the ten-sheet default before downloading. The download
 * itself is an auth-gated blob fetch.
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
  // Default: none ticked — an untouched download yields the short ten-sheet
  // report. Everything else is opt-in via the checkboxes below.
  const [extras, setExtras] = useState<Record<ExtraKey, boolean>>({
    buxgalteriya: false,
    marketing: false,
    qarzdorlar: false,
  });
  const [exporting, setExporting] = useState(false);

  const toggle = (k: ExtraKey) => setExtras((m) => ({ ...m, [k]: !m[k] }));

  const download = async () => {
    setExporting(true);
    try {
      const active = EXTRA_OPTS.filter((o) => extras[o.key]).map((o) => o.key);
      const params: Record<string, string | number> = {
        startDate: startStr,
        endDate: endStr,
        include: active.join(","),
      };
      if (branchId !== "all") params.branchId = Number(branchId);
      const res = await api.get("/reports/financial-excel", {
        params,
        responseType: "blob",
      });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `hisobot-${startStr}_${endStr}.xlsx`;
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

        {/* Qo'shimcha bo'limlar */}
        <div className="space-y-2">
          <Label className="text-xs font-medium text-muted-foreground">
            Qo&apos;shimcha bo&apos;limlar (ixtiyoriy)
          </Label>
          <p className="text-xs text-muted-foreground">
            Bo&apos;sh qoldirilsa — 10 varaqli qisqa hisobot chiqadi.
          </p>
          {EXTRA_OPTS.map((o) => (
            <div key={o.key} className="flex items-start gap-2">
              <Checkbox
                id={`extra-${o.key}`}
                checked={extras[o.key]}
                onCheckedChange={() => toggle(o.key)}
                className="mt-0.5"
              />
              <Label
                htmlFor={`extra-${o.key}`}
                className="cursor-pointer flex-col items-start gap-0.5 text-sm leading-tight font-normal"
              >
                {o.label}
                <span className="text-xs font-normal text-muted-foreground">
                  {o.hint}
                </span>
              </Label>
            </div>
          ))}
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
