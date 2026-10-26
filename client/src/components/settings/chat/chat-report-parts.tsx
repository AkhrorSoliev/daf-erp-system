"use client";

import { useT } from "@/i18n/context";
import { Pill } from "../../payments/debt/debt-table";
import type { ChatPerson, ChatReportStatus } from "./chat-admin-types";
import { statusLabel } from "./chat-report-rules";

const TONE = { OPEN: "amber", RESOLVED: "green", DISMISSED: "muted" } as const;

export function ReportStatusPill({ status }: { status: ChatReportStatus }) {
  const t = useT();
  return <Pill tone={TONE[status]}>{statusLabel(status, t)}</Pill>;
}

/** Name (data), `@username` muted, and the red mark of a student already out of the chat. */
export function PersonLine({ person }: { person: ChatPerson }) {
  const t = useT();
  return (
    <div>
      <div className="font-medium">{person.name}</div>
      {person.username && <div className="text-xs text-muted-foreground">@{person.username}</div>}
      {person.chatBannedAt && <div className="text-xs font-medium text-destructive">{t("Chatdan chiqarilgan")}</div>}
    </div>
  );
}
