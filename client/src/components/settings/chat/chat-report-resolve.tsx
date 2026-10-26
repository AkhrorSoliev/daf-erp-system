"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useT } from "@/i18n/context";
import { useBanStudent, useResolveChatReport, useUnbanStudent } from "./chat-admin-queries";
import type { ChatReportDetail, ResolveReportBody } from "./chat-admin-types";
import { formatReportDate, resolveBody } from "./chat-report-rules";

const NOTE_MAX = 500;

/** Footer of an OPEN report: note, the ban choice and the two outcomes. */
export function ResolveFooter({ report }: { report: ChatReportDetail }) {
  const t = useT();
  const [note, setNote] = useState("");
  const [ban, setBan] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const resolve = useResolveChatReport(report.id);
  const busy = resolve.isPending;
  const canBan = report.reported.chatBannedAt === null;

  const send = (outcome: ResolveReportBody["outcome"]) => {
    setConfirming(false);
    resolve.mutate(resolveBody(outcome, note, canBan && ban));
  };

  return (
    <div className="space-y-3 border-t px-6 py-4">
      <div>
        <Textarea
          value={note}
          maxLength={NOTE_MAX}
          disabled={busy}
          rows={3}
          placeholder={t("Izoh (ixtiyoriy)")}
          onChange={(e) => setNote(e.target.value)}
        />
        {note.length >= NOTE_MAX - 50 && (
          <p className="mt-1 text-right text-xs text-muted-foreground">{note.length}/{NOTE_MAX}</p>
        )}
      </div>
      {canBan && (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={ban} disabled={busy} onCheckedChange={(v) => setBan(v === true)} />
          {t("Shikoyat qilingan o'quvchini chatdan chiqarish")}
        </label>
      )}
      <div className="flex gap-2">
        <Button disabled={busy} onClick={() => (canBan && ban ? setConfirming(true) : send("RESOLVED"))}>
          {busy && resolve.variables?.outcome !== "DISMISSED" && <Loader2 className="size-4 animate-spin" />}
          {t("Hal qilindi")}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => send("DISMISSED")}>
          {busy && resolve.variables?.outcome === "DISMISSED" && <Loader2 className="size-4 animate-spin" />}
          {t("Rad etish")}
        </Button>
      </div>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("{name} chatdan chiqariladimi?", { name: report.reported.name })}</AlertDialogTitle>
            <AlertDialogDescription>{t("U chatga yoza olmaydi, lekin o'qiy oladi. Keyin qaytarish mumkin.")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Bekor qilish")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => send("RESOLVED")}>
              {t("Chatdan chiqarish")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Footer of a closed report: the outcome, and the ban switch for the reported student. */
export function ClosedBlock({ report }: { report: ChatReportDetail }) {
  const t = useT();
  const [confirming, setConfirming] = useState(false);
  const ban = useBanStudent(report.id);
  const unban = useUnbanStudent(report.id);
  const banned = report.reported.chatBannedAt !== null;
  const busy = ban.isPending || unban.isPending;
  const run = () => {
    setConfirming(false);
    (banned ? unban : ban).mutate(report.reported.id);
  };

  return (
    <div className="space-y-3 border-t px-6 py-4 text-sm">
      <p className="font-medium">
        {report.status === "RESOLVED" ? t("Hal qilindi") : t("Rad etildi")}
        {report.resolvedAt && <span className="font-normal text-muted-foreground"> · {formatReportDate(report.resolvedAt)}</span>}
      </p>
      {report.resolutionNote && <p className="whitespace-pre-wrap break-words">{report.resolutionNote}</p>}
      <Button variant="outline" disabled={busy} onClick={() => setConfirming(true)}>
        {busy && <Loader2 className="size-4 animate-spin" />}
        {banned ? t("Chatga qaytarish") : t("Chatdan chiqarish")}
      </Button>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {banned
                ? t("{name} chatga qaytarilsinmi?", { name: report.reported.name })
                : t("{name} chatdan chiqariladimi?", { name: report.reported.name })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {banned ? t("U yana chatga yoza oladi.") : t("U chatga yoza olmaydi, lekin o'qiy oladi. Keyin qaytarish mumkin.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Bekor qilish")}</AlertDialogCancel>
            <AlertDialogAction variant={banned ? "default" : "destructive"} onClick={run}>
              {banned ? t("Chatga qaytarish") : t("Chatdan chiqarish")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
