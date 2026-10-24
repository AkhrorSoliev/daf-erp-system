"use client";

// Sahifalanmaydi — dizayn 7: o'qituvchi butun guruhni bir qarashda solishtiradi (CLAUDE.md sahifalash qoidasiga ongli istisno).

import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { DayBars, ProgressLine } from "./activity-ui";
import { PLATFORMA_NOMLARI, formatDavomiylik, formatKunOy, formatOxirgiFaollik, foizRangi } from "./activity-format";
import { useT } from "@/i18n/context";
import type { Daraja, Davr, GuruhOquvchiQatori } from "./types";

function ismInitsiallari(ism: string): string {
  const qismlar = ism.trim().split(/\s+/);
  if (qismlar.length === 0 || qismlar[0] === "") return "?";
  if (qismlar.length === 1) return qismlar[0].slice(0, 2).toUpperCase();
  return `${qismlar[0][0]}${qismlar[qismlar.length - 1][0]}`.toUpperCase();
}

export function GroupActivityTable({
  oquvchilar,
  davr,
  onSelect,
  selectedId,
}: {
  oquvchilar: GuruhOquvchiQatori[];
  davr: Davr;
  guruhDarajasi: Daraja | null;
  onSelect: (id: number) => void;
  selectedId: number | null;
}) {
  const t = useT();
  const platformaNomi = (p: keyof typeof PLATFORMA_NOMLARI) => {
    const nom = PLATFORMA_NOMLARI[p];
    return t(nom);
  };
  const [now] = useState(() => new Date());

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12 border-r">#</TableHead>
            <TableHead className="min-w-44">{t("O'quvchi")}</TableHead>
            <TableHead className="min-w-24 text-right">{t("Faol vaqt")}</TableHead>
            <TableHead className="min-w-32">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-default">{t("Shug'ullangan kunlar")}</span>
                </TooltipTrigger>
                <TooltipContent>{t("Shu kuni kamida bitta mashq qildi yoki kamida 5 daqiqa radio tingladi")}</TooltipContent>
              </Tooltip>
            </TableHead>
            <TableHead className="min-w-28 text-right">{t("To'g'ri javob")}</TableHead>
            <TableHead className="hidden min-w-40 md:table-cell">{t("Kurs")}</TableHead>
            <TableHead className="hidden text-right lg:table-cell">{t("Radio")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {oquvchilar.map((row, index) => {
            const neverSeen = row.oxirgiFaollik === null;
            const kamMaxraj = row.maxraj < davr;
            return (
              <TableRow
                key={row.studentId}
                className={cn("cursor-pointer hover:bg-muted/50", selectedId === row.studentId && "bg-muted")}
                onClick={() => onSelect(row.studentId)}
              >
                <TableCell className="border-r text-muted-foreground">{index + 1}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="size-8">
                      <AvatarImage src={row.photo ?? undefined} alt="" />
                      <AvatarFallback className="text-xs">{ismInitsiallari(row.ism)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="truncate font-medium">{row.ism}</div>
                      {!row.akkaunt ? (
                        <div className="truncate text-xs text-red-600 dark:text-red-400">{t("Akkaunt yo'q")}</div>
                      ) : (
                        <div
                          className={cn(
                            "truncate text-xs",
                            neverSeen ? "text-red-600 dark:text-red-400" : "text-muted-foreground",
                          )}
                        >
                          {formatOxirgiFaollik(row.oxirgiFaollik?.vaqt ?? null, now, t)}
                          {row.oxirgiFaollik && ` · ${platformaNomi(row.oxirgiFaollik.platforma)}`}
                        </div>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {row.akkaunt && row.faolSoniya > 0 ? (
                    formatDavomiylik(row.faolSoniya, t)
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {row.akkaunt ? (
                    <div className="flex items-center gap-2">
                      {kamMaxraj ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="w-10 cursor-default text-sm tabular-nums">
                              {row.shugullanganKunlar}/{row.maxraj}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>{t("{date} dan beri", { date: formatKunOy(row.hisobBoshi) })}</TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="w-10 text-sm tabular-nums">
                          {row.shugullanganKunlar}/{row.maxraj}
                        </span>
                      )}
                      <DayBars kunlar={row.kunlar} className="hidden sm:flex" />
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {row.akkaunt && row.mashq.foiz !== null ? (
                    <div className="flex flex-col items-end">
                      <span className={cn("font-medium tabular-nums", foizRangi(row.mashq.foiz))}>
                        {row.mashq.foiz}%
                      </span>
                      <span className="text-xs text-muted-foreground">{t("{n} savol", { n: row.mashq.savollar })}</span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {row.akkaunt ? (
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{row.kurs.daraja}</Badge>
                      {row.kurs.holat === "KURS_YOQ" ? (
                        <span className="text-xs text-muted-foreground">{t("Kurs hali yo'q")}</span>
                      ) : (
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="text-xs tabular-nums text-muted-foreground">
                            {t("{done}/{total} dars", { done: row.kurs.tugatilgan, total: row.kurs.jami })}
                          </div>
                          <ProgressLine value={row.kurs.tugatilgan} total={row.kurs.jami} />
                        </div>
                      )}
                      {row.kurs.guruhdanOrqada && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="destructive" className="shrink-0 text-[10px]">{t("Guruhdan orqada")}</Badge>
                          </TooltipTrigger>
                          <TooltipContent>{t("O'quvchi darajasi guruh darajasidan past")}</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="hidden text-right tabular-nums lg:table-cell">
                  {row.akkaunt && row.radioSoniya > 0 ? (
                    formatDavomiylik(row.radioSoniya, t)
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
