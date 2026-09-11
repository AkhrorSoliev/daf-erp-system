"use client";

import type { SyntheticEvent } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Eye, GraduationCap, MoreHorizontal, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatPhone } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import {
  displayName,
  displayPhone,
  formatSubmittedAt,
  telHref,
} from "./submission-format";
import type { SubmissionRow } from "./types";

/**
 * Qator bosilsa lid kartasi ochiladi. Ichidagi tugma va menyular buni
 * to'xtatadi: portal (dropdown, dialog) ichidagi bosish ham React daraxti
 * bo'ylab qatorga yetib boradi, shuning uchun o'rovchi element to'xtatadi.
 */
export function stopRowClick(event: SyntheticEvent) {
  event.stopPropagation();
}

export function SubmissionName({ row }: { row: SubmissionRow }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            "truncate",
            row.stage === "awaiting" ? "font-semibold" : "font-medium",
          )}
        >
          {displayName(row)}
        </span>
        {row.isRepeat && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="h-5 shrink-0 px-1.5 text-[10px]">
                Takroriy
              </Badge>
            </TooltipTrigger>
            <TooltipContent>Bu telefon avval ham lid bo&apos;lgan</TooltipContent>
          </Tooltip>
        )}
      </div>
      <SubmissionOutcome row={row} />
    </div>
  );
}

function SubmissionOutcome({ row }: { row: SubmissionRow }) {
  const studentId = row.lead?.convertedStudentId ?? null;
  if (row.stage === "converted" && studentId !== null) {
    return (
      <Link
        href={`/students/profile/${studentId}`}
        onClick={stopRowClick}
        className="text-xs text-primary hover:underline"
      >
        O&apos;quvchi bo&apos;ldi → #{studentId}
      </Link>
    );
  }
  if (row.stage !== "lost") return null;
  const text = !row.lead
    ? "Lid o'chirilgan"
    : row.lead.lostReason
      ? `Yo'qotildi: «${row.lead.lostReason}»`
      : "Yo'qotildi";
  return <p className="truncate text-xs text-muted-foreground">{text}</p>;
}

export function SubmissionPhone({ row }: { row: SubmissionRow }) {
  const phone = displayPhone(row);
  if (!phone) return <span className="text-muted-foreground">—</span>;
  return (
    <a
      href={telHref(phone)}
      onClick={stopRowClick}
      className="whitespace-nowrap tabular-nums hover:underline"
    >
      {formatPhone(phone)}
    </a>
  );
}

export function SubmittedAt({ iso }: { iso: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="whitespace-nowrap tabular-nums">
          {formatSubmittedAt(iso)}
        </span>
      </TooltipTrigger>
      <TooltipContent>{format(new Date(iso), "dd.MM.yyyy, HH:mm:ss")}</TooltipContent>
    </Tooltip>
  );
}

export function SubmissionActions({
  row,
  onOpenLead,
  onRestore,
}: {
  row: SubmissionRow;
  onOpenLead: (leadId: string) => void;
  onRestore: (row: SubmissionRow) => void;
}) {
  const lead = row.lead;
  if (!lead) return null;
  const canOpen = !lead.archived;
  const canRestore = lead.archived && row.stage === "lost";
  const studentId = lead.convertedStudentId;
  if (!canOpen && !canRestore && studentId === null) return null;

  return (
    <div onClick={stopRowClick}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" className="size-8">
            <MoreHorizontal className="size-4" />
            <span className="sr-only">Amallar</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canOpen && (
            <DropdownMenuItem onClick={() => onOpenLead(lead.id)}>
              <Eye className="mr-2 size-4" />
              Lidni ochish
            </DropdownMenuItem>
          )}
          {canRestore && (
            <DropdownMenuItem onClick={() => onRestore(row)}>
              <RotateCcw className="mr-2 size-4" />
              Tiklash
            </DropdownMenuItem>
          )}
          {studentId !== null && (
            <DropdownMenuItem asChild>
              <Link href={`/students/profile/${studentId}`}>
                <GraduationCap className="mr-2 size-4" />
                O&apos;quvchi profili
              </Link>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
