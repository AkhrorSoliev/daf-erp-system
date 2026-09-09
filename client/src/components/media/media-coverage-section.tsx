"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import api from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type {
  MediaCoverageOverview,
  MediaSectionCoverage,
  MediaUnitCoverage,
} from "./media-coverage-types";
import {
  type CoverageStatus,
  coverageLabel,
  coverageStatus,
  unitHasNoMaterial,
  unitTotals,
  worstStatus,
} from "./media-coverage-utils";

const STATUS_DOT: Record<CoverageStatus, string> = {
  complete: "bg-emerald-500",
  partial: "bg-amber-500",
  none: "bg-rose-500",
  na: "bg-muted-foreground/30",
};

const STATUS_LEGEND: { status: CoverageStatus; label: string }[] = [
  { status: "complete", label: "To'liq" },
  { status: "partial", label: "Qisman" },
  { status: "none", label: "Hali yo'q" },
  { status: "na", label: "Kerak emas" },
];

function CoverageCell({ have, total }: { have: number; total: number }) {
  const status = coverageStatus(have, total);
  return (
    <span className="inline-flex items-center gap-1.5 tabular-nums">
      <span
        className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATUS_DOT[status])}
      />
      {coverageLabel(have, total)}
    </span>
  );
}

function SectionRow({ s, index }: { s: MediaSectionCoverage; index: number }) {
  return (
    <TableRow>
      <TableCell className="w-12 border-r text-muted-foreground">
        {index + 1}
      </TableCell>
      <TableCell>
        <div className="font-medium">{s.titleUz}</div>
        <div className="font-mono text-[11px] text-muted-foreground">
          {s.code}
        </div>
      </TableCell>
      <TableCell>
        <CoverageCell have={s.words.withAudio} total={s.words.total} />
      </TableCell>
      <TableCell>
        <CoverageCell
          have={s.words.withImage}
          total={s.words.pictureEligible}
        />
      </TableCell>
      <TableCell>
        <CoverageCell
          have={s.sentences.withAudio}
          total={s.sentences.total}
        />
      </TableCell>
      <TableCell>
        <CoverageCell have={s.phrases.withAudio} total={s.phrases.total} />
      </TableCell>
      <TableCell>
        <CoverageCell
          have={s.dialogLines.withAudio}
          total={s.dialogLines.total}
        />
      </TableCell>
    </TableRow>
  );
}

function UnitBlock({
  unit,
  defaultOpen,
}: {
  unit: MediaUnitCoverage;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const empty = unitHasNoMaterial(unit);
  const totals = unitTotals(unit);
  const worst = worstStatus([
    coverageStatus(totals.words.withAudio, totals.words.total),
    coverageStatus(totals.words.withImage, totals.words.pictureEligible),
    coverageStatus(totals.sentences.withAudio, totals.sentences.total),
    coverageStatus(totals.phrases.withAudio, totals.phrases.total),
    coverageStatus(totals.dialogLines.withAudio, totals.dialogLines.total),
  ]);

  return (
    <Collapsible
      open={open && !empty}
      onOpenChange={setOpen}
      className="rounded-lg border"
    >
      <CollapsibleTrigger
        disabled={empty}
        className={cn(
          "flex w-full items-center gap-3 p-3 text-left",
          !empty && "hover:bg-muted/50",
        )}
      >
        {empty ? (
          <span className="h-4 w-4 shrink-0" />
        ) : open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">
              {unit.order}-unit — {unit.titleUz}
            </span>
            {unit.code && (
              <span className="font-mono text-[11px] text-muted-foreground">
                {unit.code}
              </span>
            )}
          </div>
          {empty ? (
            <div className="text-xs text-muted-foreground">
              Hali material yo&apos;q
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">
              {unit.sections.length} ta bo&apos;lim · {totals.words.total}{" "}
              so&apos;z · {totals.sentences.total} gap ·{" "}
              {totals.phrases.total} ibora · {totals.dialogLines.total} dialog
              qatori
            </div>
          )}
        </div>
        {!empty && (
          <span
            className={cn(
              "h-2 w-2 shrink-0 rounded-full",
              STATUS_DOT[worst],
            )}
            title="Ushbu unitdagi eng zaif ko'rsatkich"
          />
        )}
      </CollapsibleTrigger>

      {!empty && (
        <CollapsibleContent>
          <div className="border-t">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 border-r">#</TableHead>
                  <TableHead>Bo&apos;lim</TableHead>
                  <TableHead>So&apos;z — ovoz</TableHead>
                  <TableHead>
                    <Tooltip>
                      <TooltipTrigger className="cursor-default">
                        So&apos;z — rasm
                      </TooltipTrigger>
                      <TooltipContent>
                        Faqat rasm chizib bo&apos;ladigan (picturable) so&apos;zlar
                        hisoblanadi — mavhum so&apos;zlarga rasm kerak emas.
                      </TooltipContent>
                    </Tooltip>
                  </TableHead>
                  <TableHead>Gap — ovoz</TableHead>
                  <TableHead>Ibora — ovoz</TableHead>
                  <TableHead>Dialog qatori — ovoz</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unit.sections.map((s, i) => (
                  <SectionRow key={s.sectionId} s={s} index={i} />
                ))}
              </TableBody>
            </Table>
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}

/**
 * `/media` sahifasining bazadan o'zi to'ladigan bo'limi.
 *
 * Yuqoridagi eski bo'lim `content/daf/*.json` manifestini o'qiydi — u yerga
 * hech qanday generatsiya skripti yozmaydi, shuning uchun sahifa hech qachon
 * o'z-o'zidan yangilanmasdi. Bu bo'lim `GET /daf/media/coverage` orqali
 * to'g'ridan-to'g'ri `Daf*` kontent jadvallarini o'qiydi, shuning uchun yangi
 * audio/rasm kaliti yozilishi bilanoq shu yerda ko'rinadi.
 */
export function MediaCoverageSection() {
  const [data, setData] = useState<MediaCoverageOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<MediaCoverageOverview>("/daf/media/coverage")
      .then(({ data }) => {
        if (!cancelled) setData(data);
      })
      .catch(() => {
        if (!cancelled) setError("Qamrov ma'lumoti olinmadi");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Kurs qamrovi</h2>
          <p className="text-sm text-muted-foreground">
            Har bir unit va bo&apos;lim bo&apos;yicha nechta so&apos;z, gap,
            ibora va dialog qatori bor — va ulardan qanchasida ovoz yoki rasm
            tayyor. Bazadan avtomatik.
          </p>
        </div>
        {!loading && !error && (
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {STATUS_LEGEND.map(({ status, label }) => (
              <span key={status} className="inline-flex items-center gap-1.5">
                <span
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    STATUS_DOT[status],
                  )}
                />
                {label}
              </span>
            ))}
          </div>
        )}
      </div>

      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      )}

      {!loading && error && (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            {error}
          </CardContent>
        </Card>
      )}

      {!loading && !error && data && (
        <div className="space-y-4">
          {data.levels.length === 0 && (
            <Card>
              <CardContent className="p-4 text-sm text-muted-foreground">
                Hali hech qanday unit yaratilmagan.
              </CardContent>
            </Card>
          )}
          {data.levels.map((lvl) => (
            <div key={lvl.level} className="space-y-2">
              {data.levels.length > 1 && (
                <div className="text-sm font-semibold text-muted-foreground">
                  {lvl.level}
                </div>
              )}
              {lvl.units.map((u, i) => (
                <UnitBlock key={u.unitId} unit={u} defaultOpen={i === 0} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
