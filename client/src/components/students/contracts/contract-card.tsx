"use client";

import { format } from "date-fns";
import {
  Ban,
  CheckCircle2,
  FileText,
  Loader2,
  MoreHorizontal,
  PenLine,
  Printer,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatPrice } from "@/lib/format-utils";
import { CONTRACT_STATUS_LABEL, LINK_STATE_LABEL, canCancel, dmy } from "./contract-rules";
import type { ContractStatus, ContractView } from "./contract-types";

interface Props {
  contract: ContractView;
  isCeo: boolean;
  /** `students.manage`: edit, sign and cancel. Without it the card only prints. */
  canManage: boolean;
  busy: boolean;
  onPdf: () => void;
  onEdit: () => void;
  onSign: () => void;
  onCancel: () => void;
}

const STATUS_CLASS: Record<ContractStatus, string> = {
  UNSIGNED:
    "border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300",
  SIGNED:
    "border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300",
  CANCELLED: "border-transparent bg-muted text-muted-foreground",
};

const stamp = (iso: string) => format(new Date(iso), "dd.MM.yyyy, HH:mm");

export function ContractCard({
  contract: c,
  isCeo,
  canManage,
  busy,
  onPdf,
  onEdit,
  onSign,
  onCancel,
}: Props) {
  const unsigned = canManage && c.status === "UNSIGNED";
  const cancellable = canManage && canCancel(c, isCeo);
  return (
    <article className="space-y-3 rounded-lg border p-4">
      <header className="flex flex-wrap items-center gap-2">
        <FileText className="size-4 text-muted-foreground" />
        <span className="font-semibold">№ {c.number}</span>
        <span className="text-sm text-muted-foreground">{dmy(c.contractDate)}</span>
        <Badge variant="outline" className={STATUS_CLASS[c.status]}>
          {CONTRACT_STATUS_LABEL[c.status]}
        </Badge>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={onPdf} disabled={busy}>
            {busy ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <Printer className="mr-1.5 size-4" />
            )}
            PDF
          </Button>
          {(unsigned || cancellable) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" disabled={busy}>
                  <MoreHorizontal className="size-4" />
                  <span className="sr-only">Amallar</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {unsigned && (
                  <DropdownMenuItem onClick={onEdit}>
                    <PenLine className="mr-2 size-4" />
                    Tahrirlash
                  </DropdownMenuItem>
                )}
                {unsigned && (
                  <DropdownMenuItem onClick={onSign}>
                    <CheckCircle2 className="mr-2 size-4" />
                    Qog&apos;ozda imzolandi
                  </DropdownMenuItem>
                )}
                {cancellable && (
                  <DropdownMenuItem
                    onClick={onCancel}
                    className="text-destructive focus:text-destructive"
                  >
                    <Ban className="mr-2 size-4" />
                    Bekor qilish
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </header>

      <ul className="space-y-1 text-sm">
        {c.fields.courses.map((course) => (
          <li key={course.enrollmentId}>
            <span className="font-medium">{course.courseName}</span> · {course.groupName} ·{" "}
            {formatPrice(course.monthlyPrice)} so&apos;m/oy
          </li>
        ))}
      </ul>

      {c.links.length > 0 && (
        <ul className="space-y-0.5 text-xs text-muted-foreground">
          {c.links.map((l) => (
            <li key={l.enrollmentId}>
              Hozir: {l.groupName} — {LINK_STATE_LABEL[l.status]}
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">
        Buyurtmachi: {c.fields.customer.fullName}
        {c.createdBy ? ` · Tuzdi: ${c.createdBy}` : ""}
      </p>
      {c.signedAt && (
        <p className="text-xs text-muted-foreground">
          Qog&apos;ozda imzolangan: {stamp(c.signedAt)}
          {c.signedBy ? ` · ${c.signedBy}` : ""}
        </p>
      )}
      {c.cancelledAt && (
        <p className="text-xs text-destructive">
          Bekor qilingan: {stamp(c.cancelledAt)}
          {c.cancelledBy ? ` · ${c.cancelledBy}` : ""} — {c.cancelReason}
        </p>
      )}
    </article>
  );
}
