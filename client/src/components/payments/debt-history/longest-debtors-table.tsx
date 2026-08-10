"use client";

import Link from "next/link";
import { ArrowRight, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatPrice } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { STATUS_COLORS, type LongestDebtor } from "./types";

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Faol",
  INACTIVE: "Nofaol",
  FROZEN: "Muzlatilgan",
  GRADUATED: "Bitirgan",
  EXPELLED: "Chetlatilgan",
  ARCHIVED: "Arxivlangan",
  PROSPECT: "Ro'yxatda",
};

/** A column header carrying a plain-language explanation. */
function HintHead({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <TableHead className={className}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger className="inline-flex items-center gap-1 text-left">
            {label}
            <Info className="size-3.5 shrink-0 text-muted-foreground" />
          </TooltipTrigger>
          <TooltipContent className="max-w-72 flex-col items-stretch">
            {children}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </TableHead>
  );
}

/** "3 oy (May 2026)" — the age first, because that is what ranks the row. */
function ageLabel(d: LongestDebtor): string {
  if (d.monthsInDebt === 0) return "Shu oyda";
  return `${d.monthsInDebt} oy`;
}

interface Props {
  debtors: LongestDebtor[] | undefined;
  isLoading: boolean;
}

export function LongestDebtorsTable({ debtors, isLoading }: Props) {
  const rows = debtors ?? [];

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-1.5 text-base font-semibold">
            Eng uzoq qarzdorlar
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="size-3.5 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-72">
                  Qarzi eng uzoq vaqtdan beri turganlar. Agar o&apos;quvchi bir
                  marta qarzini to&apos;liq to&apos;lasa, hisob noldan
                  boshlanadi — shuning uchun bu yerdagi muddat haqiqatan ham
                  uzluksiz qarzda o&apos;tgan vaqt.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </h2>
          <p className="text-sm text-muted-foreground">
            Avval muddat, keyin summa bo&apos;yicha — eski kichik qarz yangi
            kattasidan yomonroq belgi.
          </p>
        </div>
        <Button variant="outline" size="sm" className="shrink-0" asChild>
          <Link href="/payments/debtors">
            Barcha qarzdorlar
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead>O&apos;quvchi</TableHead>
              <TableHead>Telefon</TableHead>
              <HintHead label="Qarz" className="text-right">
                O&apos;quvchining bugungi qarzi.
              </HintHead>
              <HintHead label="Qachondan">
                Qarz qachondan beri uzluksiz turibdi. Qavs ichida — qarz
                boshlangan oy.
              </HintHead>
              <HintHead label="Holat">
                O&apos;quvchi hozir o&apos;qiyaptimi yoki ketganmi. Ketgan
                o&apos;quvchidan pul undirish qiyinroq.
              </HintHead>
              <TableHead>Guruh</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={7}>
                    <Skeleton className="h-8 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  Bu kesimda qarzdor yo&apos;q.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((d, idx) => (
                <TableRow key={d.id}>
                  <TableCell className="border-r tabular-nums text-muted-foreground">
                    {idx + 1}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/students/profile/${d.id}`}
                      className="font-medium hover:underline"
                    >
                      <span className="text-muted-foreground">#{d.id}</span>{" "}
                      {`${d.firstName} ${d.lastName}`.trim()}
                    </Link>
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {d.phone ?? "—"}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums text-red-600 dark:text-red-400">
                    {formatPrice(d.debt)}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "font-medium",
                        d.monthsInDebt >= 2 &&
                          "text-red-600 dark:text-red-400",
                      )}
                    >
                      {ageLabel(d)}
                    </span>
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      ({d.sinceMonthKey})
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5 text-sm">
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{
                          backgroundColor:
                            STATUS_COLORS[d.status] ?? "#94a3b8",
                        }}
                      />
                      {STATUS_LABELS[d.status] ?? d.status}
                      {d.isArchived && (
                        <Badge
                          variant="outline"
                          className="h-4 px-1 text-[10px] font-normal"
                        >
                          arxiv
                        </Badge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-40 truncate text-muted-foreground">
                    {d.groups.length ? d.groups.join(", ") : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
