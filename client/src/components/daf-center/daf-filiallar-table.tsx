"use client";

import { useT } from "@/i18n/context";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { foizRangi } from "@/components/groups/app-activity/activity-format";
import { formatNumber } from "@/lib/format-utils";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { cn } from "@/lib/utils";
import type { MarkazFilialQatori } from "./types";

const foizMatn = (n: number | null) => (n === null ? "—" : `${n}%`);
const kasr = (n: number | null) => (n === null ? "—" : String(n).replace(".", ","));

/**
 * Faqat CEO «Barcha filiallar» tanlaganda keladi (server `filiallar: []`
 * aks holda). Qatorga bosilsa global tanlagichda o'sha filial tanlanadi —
 * `BranchScopedMain` sahifani o'zi qayta yuklaydi.
 */
export function DafFiliallarTable({ qatorlar }: { qatorlar: MarkazFilialQatori[] }) {
  const branches = useBranchSwitcher((s) => s.branches);
  const selectBranch = useBranchSwitcher((s) => s.selectBranch);
  const t = useT();

  return (
    <div className="rounded-xl border bg-card">
      <div className="px-4 pt-4">
        <h3 className="text-base font-semibold">{t("Filiallar")}</h3>
        <p className="text-xs text-muted-foreground">{t("Qatorga bosilsa o'sha filial tanlanadi")}</p>
      </div>
      <div className="overflow-x-auto p-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Filial")}</TableHead>
              <TableHead className="text-right">{t("O'quvchilar")}</TableHead>
              <TableHead className="text-right">{t("Qamrov")}</TableHead>
              <TableHead className="text-right">{t("Norma")}</TableHead>
              <TableHead className="text-right">{t("O'rt. faol kun")}</TableHead>
              <TableHead className="text-right">{t("To'g'ri javob")}</TableHead>
              <TableHead className="text-right">{t("Tugatilgan darslar")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {qatorlar.map((q) => {
              const filial = branches.find((b) => b.id === q.branchId) ?? null;
              return (
                <TableRow
                  key={q.branchId}
                  className={cn(filial && "cursor-pointer hover:bg-muted/50")}
                  onClick={() => filial && selectBranch(filial)}
                >
                  <TableCell className="font-medium">{q.nomi}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(q.oquvchilar)}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", foizRangi(q.qamrovFoiz))}>{foizMatn(q.qamrovFoiz)}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", foizRangi(q.normaFoiz))}>{foizMatn(q.normaFoiz)}</TableCell>
                  <TableCell className="text-right tabular-nums">{kasr(q.ortachaFaolKunHaftada)}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", foizRangi(q.foiz))}>{foizMatn(q.foiz)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(q.tugatilganDarslar)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
