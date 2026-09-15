import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatNomi } from "@/lib/daf-format-nomlari";
import { KONIKMA_NOMLARI } from "./activity-format";
import type { GuruhQiyinElement } from "./types";

export function DifficultItems({ items }: { items: GuruhQiyinElement[] }) {
  return (
    <section className="rounded-xl border bg-card">
      <div className="border-b px-4 py-3">
        <h3 className="text-sm font-semibold">Guruh qiynalayotgan so&apos;z va gaplar</h3>
        <p className="text-xs text-muted-foreground">
          Birinchi urinishdagi xato foizi bo&apos;yicha · kamida 3 o&apos;quvchi ishlagan
        </p>
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          Hali yetarli ma&apos;lumot yo&apos;q — kamida 3 o&apos;quvchi bir xil so&apos;z yoki gapni ishlashi kerak
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 border-r">#</TableHead>
                <TableHead className="min-w-48">So&apos;z yoki gap</TableHead>
                <TableHead className="min-w-44">Ko&apos;nikma va format</TableHead>
                <TableHead className="min-w-36">Xato</TableHead>
                <TableHead className="text-right">O&apos;quvchilar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, index) => (
                <TableRow key={`${item.itemType}-${item.itemId}`}>
                  <TableCell className="border-r text-muted-foreground">{index + 1}</TableCell>
                  <TableCell>
                    <div className="font-medium">{item.de}</div>
                    <div className="text-xs text-muted-foreground">{item.uz}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{item.konikma ? KONIKMA_NOMLARI[item.konikma].uz : "—"}</Badge>
                    <div className="mt-1 text-xs text-muted-foreground">{formatNomi(item.format)}</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            item.xatoFoizi >= 50 ? "bg-red-500" : "bg-yellow-400",
                          )}
                          style={{ width: `${item.xatoFoizi}%` }}
                        />
                      </div>
                      <span
                        className={cn(
                          "text-sm font-medium tabular-nums",
                          item.xatoFoizi >= 50
                            ? "text-red-600 dark:text-red-400"
                            : "text-yellow-600 dark:text-yellow-400",
                        )}
                      >
                        {item.xatoFoizi}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{item.oquvchilar}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
