"use client";

import { useState } from "react";
import { ArrowRight, Info, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatNumber } from "@/lib/format-utils";
import { TeacherChangesDialog } from "./teacher-changes-dialog";
import { DepartedAfterChangeDialog } from "./departed-after-change-dialog";
import { capitalize } from "./departed-format";
import type { RetentionMetrics, RetentionQueryParams } from "./teacher-change-types";

interface Props {
  data: RetentionMetrics | undefined;
  isLoading: boolean;
  /** Period, branch, course and teachers the page is filtered by; both dialogs send all of it. */
  queryParams: RetentionQueryParams;
  /** The period in the locative, e.g. «sentabrda» (`rangeLabel`). */
  periodLabel?: string;
}

const WINDOW_EXPLANATION =
  "Ustoz almashgandan keyin guruhning dastlabki 5 dars davomida ketgan o'quvchilar hisoblanadi.\n" +
  "6-darsdan keyin ketsa — ustoz sabab emas deb hisoblanadi.";

export function TeacherChangeRetentionCards({ data, isLoading, queryParams, periodLabel = "shu davrda" }: Props) {
  const [changesOpen, setChangesOpen] = useState(false);
  const [departedOpen, setDepartedOpen] = useState(false);

  if (isLoading || !data) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-5 w-full max-w-lg" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardContent className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Repeat className="size-4" />
            Ustoz almashgandan keyin
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" aria-label="Tushuntirish" className="transition-colors hover:text-foreground">
                  <Info className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs whitespace-pre-line">{WINDOW_EXPLANATION}</TooltipContent>
            </Tooltip>
          </div>
          <p className="text-sm">
            {data.totalTeacherChanges === 0 ? (
              <>{capitalize(periodLabel)} ustoz almashgan guruh yo&apos;q.</>
            ) : (
              <>
                {capitalize(periodLabel)} {formatNumber(data.totalTeacherChanges)} marta ustoz almashdi. Keyingi 5 darsda shu guruhlardan{" "}
                <b>{formatNumber(data.departedAfterTeacherChange)} o&apos;quvchi</b> ketdi.
              </>
            )}
          </p>
          <div className="flex flex-wrap gap-x-4">
            <Button type="button" variant="link" size="sm" className="px-0" disabled={data.totalTeacherChanges === 0} onClick={() => setChangesOpen(true)}>
              Guruhlar
              <ArrowRight />
            </Button>
            <Button type="button" variant="link" size="sm" className="px-0" disabled={data.departedAfterTeacherChange === 0} onClick={() => setDepartedOpen(true)}>
              Ketgan o&apos;quvchilar
              <ArrowRight />
            </Button>
          </div>
        </CardContent>
      </Card>

      <TeacherChangesDialog open={changesOpen} onOpenChange={setChangesOpen} queryParams={queryParams} />
      <DepartedAfterChangeDialog open={departedOpen} onOpenChange={setDepartedOpen} queryParams={queryParams} />
    </>
  );
}
