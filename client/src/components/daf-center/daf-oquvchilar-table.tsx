"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DayBars, ProgressLine } from "@/components/groups/app-activity/activity-ui";
import { formatDavomiylik, formatKunOy, formatOxirgiFaollik, foizRangi } from "@/components/groups/app-activity/activity-format";
import { cn } from "@/lib/utils";
import { HolatBadge } from "./holat-badge";
import type { MarkazOquvchiQatori, Saralash, Yonalish } from "./types";

function boshHarflar(ism: string): string {
  const q = ism.trim().split(/\s+/).filter(Boolean);
  if (q.length === 0) return "?";
  if (q.length === 1) return q[0].slice(0, 2).toUpperCase();
  return `${q[0][0]}${q[q.length - 1][0]}`.toUpperCase();
}

function SortHead({
  kalit,
  matn,
  sort,
  dir,
  onSort,
  className,
}: {
  kalit: Saralash;
  matn: string;
  sort: Saralash;
  dir: Yonalish;
  onSort: (kalit: Saralash) => void;
  className?: string;
}) {
  const faol = sort === kalit;
  const Icon = !faol ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead className={className}>
      <button type="button" onClick={() => onSort(kalit)} className={cn("inline-flex items-center gap-1 hover:text-foreground", faol && "text-foreground")}>
        {matn}
        <Icon className="size-3.5" />
      </button>
    </TableHead>
  );
}

export function DafOquvchilarTable({
  qatorlar,
  sahifa,
  sahifaHajmi,
  filialUstuni,
  sort,
  dir,
  onSort,
  onSelect,
  selectedId,
}: {
  qatorlar: MarkazOquvchiQatori[];
  sahifa: number;
  sahifaHajmi: number;
  filialUstuni: boolean;
  sort: Saralash;
  dir: Yonalish;
  onSort: (kalit: Saralash) => void;
  onSelect: (id: number) => void;
  selectedId: number | null;
}) {
  const [now] = useState(() => new Date());
  const s = { sort, dir, onSort };

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12 border-r">#</TableHead>
            <SortHead kalit="ism" matn="O'quvchi" className="min-w-44" {...s} />
            <SortHead kalit="guruh" matn="Guruh" className="min-w-36" {...s} />
            {filialUstuni && <TableHead className="hidden lg:table-cell">Filial</TableHead>}
            <SortHead kalit="holat" matn="Holat" className="min-w-40" {...s} />
            <SortHead kalit="faolKun" matn="Faol kun" className="min-w-40" {...s} />
            <SortHead kalit="vaqt" matn="Vaqt" className="min-w-24 text-right" {...s} />
            <SortHead kalit="foiz" matn="To'g'ri javob" className="min-w-28 text-right" {...s} />
            <TableHead className="hidden min-w-40 xl:table-cell">Kurs</TableHead>
            <SortHead kalit="oxirgi" matn="Oxirgi kirish" className="min-w-32" {...s} />
          </TableRow>
        </TableHeader>
        <TableBody>
          {qatorlar.map((row, i) => (
            <TableRow
              key={row.studentId}
              className={cn("cursor-pointer hover:bg-muted/50", selectedId === row.studentId && "bg-muted")}
              onClick={() => onSelect(row.studentId)}
            >
              <TableCell className="border-r text-muted-foreground">{(sahifa - 1) * sahifaHajmi + i + 1}</TableCell>
              <TableCell>
                <div className="flex items-center gap-3">
                  <Avatar className="size-8">
                    <AvatarImage src={row.photo ?? undefined} alt="" />
                    <AvatarFallback className="text-xs">{boshHarflar(row.ism)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="truncate font-medium">{row.ism}</div>
                    {!row.akkaunt && <div className="text-xs text-muted-foreground">Akkaunt yo&apos;q</div>}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                {row.guruh ? (
                  <div className="min-w-0">
                    <div className="truncate text-sm">{row.guruh.nomi}</div>
                    {row.oqituvchi && <div className="truncate text-xs text-muted-foreground">{row.oqituvchi.ism}</div>}
                  </div>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              {filialUstuni && (
                <TableCell className="hidden text-sm lg:table-cell">{row.filial?.nomi ?? "—"}</TableCell>
              )}
              <TableCell><HolatBadge holat={row.holat} /></TableCell>
              <TableCell>
                {row.akkaunt ? (
                  <div className="flex items-center gap-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="w-12 cursor-default text-sm tabular-nums">{row.faolKun}/{row.maxraj}</span>
                      </TooltipTrigger>
                      <TooltipContent>
                        {formatKunOy(row.hisobBoshi)} dan beri · yashil uchun {row.kerakliKun}, sariq uchun {row.sariqKerak} kun kerak
                      </TooltipContent>
                    </Tooltip>
                    <DayBars kunlar={row.kunlar} className="hidden sm:flex" shugullanganMatni="Faol kun (norma)" />
                  </div>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {row.akkaunt && row.lernenSoniya > 0 ? (
                  <div className="flex flex-col items-end">
                    <span className="font-medium">{formatDavomiylik(row.ortachaKunlikSoniya)}</span>
                    <span className="text-xs text-muted-foreground">kuniga</span>
                  </div>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-right">
                {row.akkaunt && row.foiz !== null ? (
                  <div className="flex flex-col items-end">
                    <span className={cn("font-medium tabular-nums", foizRangi(row.foiz))}>{row.foiz}%</span>
                    <span className="text-xs text-muted-foreground">{row.savollar} savol</span>
                  </div>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="hidden xl:table-cell">
                {row.akkaunt && row.kurs ? (
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{row.kurs.daraja}</Badge>
                    {row.kurs.holat === "KURS_YOQ" ? (
                      <span className="text-xs text-muted-foreground">Kurs hali yo&apos;q</span>
                    ) : (
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="text-xs tabular-nums text-muted-foreground">{row.kurs.tugatilgan}/{row.kurs.jami} dars</div>
                        <ProgressLine value={row.kurs.tugatilgan} total={row.kurs.jami} />
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className={cn("text-sm", !row.oxirgiFaollik && row.akkaunt && "text-red-600 dark:text-red-400")}>
                {row.akkaunt ? formatOxirgiFaollik(row.oxirgiFaollik?.vaqt ?? null, now) : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
