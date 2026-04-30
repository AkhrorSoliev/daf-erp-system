"use client";

import { DollarSign, TrendingUp } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBalance } from "@/lib/format-utils";
import {
  formatPctValue,
  type PotentialBreakdown,
} from "./metric-helpers";

interface Props {
  open: boolean;
  onClose: () => void;
  data: PotentialBreakdown | undefined;
}

export function PotentialRevenueDialog({ open, onClose, data }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="!max-w-5xl w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Potensial qo&apos;shimcha daromad</DialogTitle>
          <DialogDescription>
            Potensial qo&apos;shimcha daromadning o&apos;zgarishi, yuqori qiymat
            kam samaradorlikni bildiradi.
          </DialogDescription>
        </DialogHeader>

        {!data ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Ma&apos;lumot yuklanmoqda...
          </div>
        ) : (
          <div className="space-y-4">
            <section className="rounded-xl border bg-blue-50 p-4 dark:bg-blue-950/30">
              <h3 className="font-semibold text-blue-700 dark:text-blue-300">
                Joriy holat
              </h3>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-xs text-muted-foreground">
                    Joriy daromad:
                  </div>
                  <div className="text-2xl font-semibold tabular-nums text-blue-700 dark:text-blue-300">
                    {formatBalance(data.currentIncome)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">
                    Foydalanish darajasi:
                  </div>
                  <div className="text-2xl font-semibold tabular-nums text-blue-700 dark:text-blue-300">
                    {formatPctValue(data.utilizationPct)}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-xl border bg-emerald-50 p-4 dark:bg-emerald-950/30">
              <div className="flex items-center gap-2">
                <DollarSign className="size-5 text-emerald-700 dark:text-emerald-400" />
                <h3 className="font-semibold text-emerald-700 dark:text-emerald-300">
                  Maksimal potensial daromad
                </h3>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-lg border bg-card p-3">
                  <div className="text-xs text-muted-foreground">
                    Agar markaz 100% sig&apos;imda ishlasa:
                  </div>
                  <div className="text-xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                    {formatBalance(data.maxIncome)}
                  </div>
                </div>
                <div className="rounded-lg border bg-amber-50 p-3 dark:bg-amber-950/40">
                  <div className="text-xs text-muted-foreground">
                    Qo&apos;shimcha daromad imkoniyati:
                  </div>
                  <div className="text-xl font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                    {formatBalance(data.gap)}
                  </div>
                </div>
              </div>
              {data.growthPct > 0 && (
                <div className="mt-3 flex items-center gap-2 rounded-lg border border-dashed border-emerald-400 bg-card px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
                  <TrendingUp className="size-4" />
                  <span>
                    <strong>Tavsiya:</strong> Bo&apos;sh o&apos;rinlarni
                    to&apos;ldirish orqali daromadni{" "}
                    {formatPctValue(data.growthPct)} ga oshirish mumkin.
                  </span>
                </div>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                * Hisob-kitob har bir guruh uchun alohida amalga oshiriladi:
                (xona sig&apos;imi − guruh o&apos;quvchilari) × shu guruhning
                kurs narxi. Xona bo&apos;yicha barcha guruhlar yig&apos;indisi
                va kompaniya bo&apos;yicha umumiy hosil qilinadi.
              </p>
            </section>

            <section className="rounded-xl border bg-card p-4">
              <h3 className="font-semibold">Xonalar bo&apos;yicha tafsilot</h3>
              <div className="mt-3 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12 border-r">#</TableHead>
                      <TableHead>Xona</TableHead>
                      <TableHead>Filial</TableHead>
                      <TableHead className="text-right">O&apos;quvchilar</TableHead>
                      <TableHead className="text-right">Joriy</TableHead>
                      <TableHead className="text-right">Maksimal</TableHead>
                      <TableHead className="text-right">Bo&apos;sh</TableHead>
                      <TableHead className="text-right">Foydalanish</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.rooms.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={8}
                          className="text-center text-sm text-muted-foreground py-8"
                        >
                          Xonalar topilmadi
                        </TableCell>
                      </TableRow>
                    )}
                    {data.rooms.map((r, i) => (
                      <TableRow key={r.roomId}>
                        <TableCell className="border-r text-muted-foreground">
                          {i + 1}
                        </TableCell>
                        <TableCell className="font-medium">
                          {r.roomName}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {r.branchName}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.enrolled}
                          {r.capacity != null && (
                            <span className="text-muted-foreground">
                              /{r.capacity}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatBalance(r.currentIncome)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatBalance(r.maxIncome)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-amber-600 dark:text-amber-400">
                          {formatBalance(r.gap)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatPctValue(r.fillPct)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
