"use client";

import Link from "next/link";
import {
  CalendarClock,
  MoreHorizontal,
  Phone,
  PhoneCall,
  Plus,
} from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AvatarWithPreview } from "@/components/ui/avatar-with-preview";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatBalance, formatPhone } from "@/lib/format-utils";
import {
  CALL_OUTCOME_INFO,
  type CallOutcome,
} from "@/components/outreach/outreach-types";

export interface Debtor {
  id: number;
  firstName: string;
  lastName: string;
  phone: string;
  photo: string | null;
  balance: number;
  debtAmount: number;
  enrollments: {
    group: { id: string; name: string; course: { name: string } };
  }[];
  // Active payment commitment (OPEN = belgilangan, BROKEN = muddati o'tgan).
  promise: {
    promiseDate: string;
    comment: string | null;
    status: "OPEN" | "BROKEN";
  } | null;
  // Last call logged from the Aloqa markazi (so it shows here too).
  lastCall: {
    note: string | null;
    outcome: CallOutcome;
    // "Call again later" date set on the call (NO_ANSWER / ANSWERED / WILL_COME).
    followUpAt: string | null;
    createdAt: string;
    calledByName: string;
  } | null;
}

export function DebtorRow({
  debtor,
  index,
  onRecordPayment,
  onLogCall,
}: {
  debtor: Debtor;
  index: number;
  onRecordPayment: () => void;
  onLogCall: () => void;
}) {
  const name = `${debtor.firstName} ${debtor.lastName}`;
  return (
    <TableRow>
      <TableCell className="border-r text-muted-foreground">{index}</TableCell>
      <TableCell>
        <AvatarWithPreview src={debtor.photo} alt={name}>
          <Avatar className="size-8">
            <AvatarImage src={debtor.photo ?? undefined} alt={name} />
            <AvatarFallback className="text-xs">
              {debtor.firstName[0]}
              {debtor.lastName[0]}
            </AvatarFallback>
          </Avatar>
        </AvatarWithPreview>
      </TableCell>
      <TableCell className="font-medium">
        <Link
          href={`/students/profile/${debtor.id}`}
          className="hover:underline"
        >
          {name}
        </Link>
        <div className="text-xs text-muted-foreground">#{debtor.id}</div>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {debtor.phone ? (
          <a href={`tel:+998${debtor.phone}`} className="hover:underline">
            {formatPhone(debtor.phone)}
          </a>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell className="text-sm">
        {debtor.enrollments.length > 0 ? (
          <div className="flex flex-wrap gap-x-2 gap-y-0.5">
            {debtor.enrollments.map((e) => (
              <Link
                key={e.group.id}
                href={`/groups/${e.group.id}`}
                className="hover:underline"
              >
                {e.group.name}
              </Link>
            ))}
          </div>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell className="text-sm">
        <DebtorActivity promise={debtor.promise} lastCall={debtor.lastCall} />
      </TableCell>
      <TableCell className="text-right font-medium text-red-600 tabular-nums">
        {formatBalance(debtor.debtAmount)}
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="size-4" />
              <span className="sr-only">Amallar</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onRecordPayment}>
              <Plus className="mr-2 size-4" />
              To&apos;lov qayd qilish
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onLogCall}>
              <PhoneCall className="mr-2 size-4" />
              Aloqa natijasini qayd qilish
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

/**
 * Compact "To'lov sanasi / Izoh" cell: the active payment promise (date badge +
 * comment), the "call again later" date from the last call, and the last call's
 * outcome + note. The call note line is hidden when it duplicates the promise
 * comment (a "To'laydi" call with a date upserts the promise using the same note).
 */
function DebtorActivity({
  promise,
  lastCall,
}: {
  promise: Debtor["promise"];
  lastCall: Debtor["lastCall"];
}) {
  if (!promise && !lastCall) {
    return <span className="text-muted-foreground">—</span>;
  }

  const callNote = lastCall?.note?.trim() ?? "";
  const promiseComment = promise?.comment?.trim() ?? "";
  const showCall = !!lastCall && (!promise || callNote !== promiseComment);
  const overdue = promise?.status === "BROKEN";
  const outcome = lastCall ? CALL_OUTCOME_INFO[lastCall.outcome] : null;

  return (
    <div className="space-y-1">
      {promise && (
        <div className="space-y-0.5">
          <Badge
            variant="outline"
            className={
              overdue
                ? "border-red-200 bg-red-100 text-red-700 hover:bg-red-100"
                : "border-amber-200 bg-amber-100 text-amber-800 hover:bg-amber-100"
            }
          >
            <CalendarClock className="mr-1 size-3" />
            {format(new Date(promise.promiseDate), "dd.MM.yyyy")}
            {overdue && " · muddati o'tgan"}
          </Badge>
          {promiseComment && (
            <Tooltip>
              <TooltipTrigger asChild>
                <p className="max-w-[220px] truncate text-xs text-muted-foreground">
                  {promiseComment}
                </p>
              </TooltipTrigger>
              <TooltipContent className="max-w-[260px]">
                {promiseComment}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      )}

      {lastCall?.followUpAt && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className="border-sky-200 bg-sky-100 text-sky-800 hover:bg-sky-100"
            >
              <PhoneCall className="mr-1 size-3" />
              Keyingi aloqa: {format(new Date(lastCall.followUpAt), "dd.MM.yyyy")}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            Bu o&apos;quvchiga shu sanada qayta qo&apos;ng&apos;iroq qilish kerak
          </TooltipContent>
        </Tooltip>
      )}

      {showCall && lastCall && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex max-w-[220px] items-center gap-1 text-xs text-muted-foreground">
              <Phone className="size-3 shrink-0" />
              <span className="truncate">
                {outcome?.label}
                {callNote ? `: ${callNote}` : ""}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent className="max-w-[260px]">
            <div className="font-medium">{outcome?.label}</div>
            {callNote && <div>{callNote}</div>}
            <div className="mt-1 text-[11px] opacity-80">
              {lastCall.calledByName} ·{" "}
              {format(new Date(lastCall.createdAt), "dd.MM.yyyy, HH:mm")}
            </div>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
