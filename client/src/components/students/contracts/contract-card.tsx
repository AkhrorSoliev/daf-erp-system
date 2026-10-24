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
import { useT } from "@/i18n/context";
import { CONTRACT_STATUS_LABEL, LINK_STATE_LABEL, canCancel, dmy } from "./contract-rules";
import type { ContractStatus, ContractView } from "./contract-types";

interface Props {
  contract: ContractView;
  isCeo: boolean;
  /** `contracts.manage`: edit, sign and cancel. Without it the card only prints. */
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
  const t = useT();
  const unsigned = canManage && c.status === "UNSIGNED";
  const cancellable = canManage && canCancel(c, isCeo);
  const statusLabel = CONTRACT_STATUS_LABEL[c.status];
  return (
    <article className="space-y-3 rounded-lg border p-4">
      <header className="flex flex-wrap items-center gap-2">
        <FileText className="size-4 text-muted-foreground" />
        <span className="font-semibold">№ {c.number}</span>
        <span className="text-sm text-muted-foreground">{dmy(c.contractDate)}</span>
        <Badge variant="outline" className={STATUS_CLASS[c.status]}>
          {t(statusLabel)}
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
                  <span className="sr-only">{t("Amallar")}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {unsigned && (
                  <DropdownMenuItem onClick={onEdit}>
                    <PenLine className="mr-2 size-4" />
                    {t("Tahrirlash")}
                  </DropdownMenuItem>
                )}
                {unsigned && (
                  <DropdownMenuItem onClick={onSign}>
                    <CheckCircle2 className="mr-2 size-4" />
                    {t("Qog'ozda imzolandi")}
                  </DropdownMenuItem>
                )}
                {cancellable && (
                  <DropdownMenuItem
                    onClick={onCancel}
                    className="text-destructive focus:text-destructive"
                  >
                    <Ban className="mr-2 size-4" />
                    {t("Shartnomani bekor qilish")}
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
            {t("{price} so'm/oy", { price: formatPrice(course.monthlyPrice) })}
          </li>
        ))}
      </ul>

      {c.links.length > 0 && (
        <ul className="space-y-0.5 text-xs text-muted-foreground">
          {c.links.map((l) => {
            const stateLabel = LINK_STATE_LABEL[l.status];
            return (
              <li key={l.enrollmentId}>
                {t("Hozir: {group} — {state}", { group: l.groupName, state: t(stateLabel) })}
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">
        {t("Buyurtmachi: {name}", { name: c.fields.customer.fullName })}
        {c.createdBy && (
          <>
            {" · "}
            {t("Tuzdi: {name}", { name: c.createdBy })}
          </>
        )}
      </p>
      {c.signedAt && (
        <p className="text-xs text-muted-foreground">
          {t("Qog'ozda imzolangan: {date}", { date: stamp(c.signedAt) })}
          {c.signedBy ? ` · ${c.signedBy}` : ""}
        </p>
      )}
      {c.cancelledAt && (
        <p className="text-xs text-destructive">
          {t("Bekor qilingan: {date}", { date: stamp(c.cancelledAt) })}
          {c.cancelledBy ? ` · ${c.cancelledBy}` : ""} — {c.cancelReason}
        </p>
      )}
    </article>
  );
}
