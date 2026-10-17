"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { FileCheck2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAuth, isCeoUser } from "@/hooks/use-auth";
import { useCan } from "@/hooks/use-permissions";
import { getErrorMessage } from "@/lib/get-error-message";
import {
  certificatePreviewKey,
  downloadCertificatePdf,
  issueCertificate,
  useCertificatePreview,
} from "./certificate-queries";
import { IssuedDocumentsList } from "./issued-documents-list";
import { RevokeCertificateDialog } from "./revoke-certificate-dialog";
import {
  dmy,
  issueClickAction,
  issueMode,
  levelSummary,
  needsReissueConfirm,
  REISSUE_CONFIRM_TEXT,
  REISSUE_EXEMPT_NOTICE,
} from "./certificate-rules";
import type { IssuedCertificate, LevelPreview } from "./certificate-types";

/** The student card's «Hujjatlar» tab (spec 2026-10-17 §7). Every figure is the server's. */
export function StudentCertificatesTab({ studentId }: { studentId: number }) {
  const queryClient = useQueryClient();
  const isCeo = isCeoUser(useAuth((s) => s.user));
  const canIssue = useCan("students.manage");
  const { data, isLoading, isFetching, refetch } = useCertificatePreview(studentId, true);

  const [busy, setBusy] = useState<string | null>(null);
  const [exemptFor, setExemptFor] = useState<LevelPreview | null>(null);
  // The level whose "give another one?" confirmation is open (a document already exists).
  const [reissueFor, setReissueFor] = useState<LevelPreview | null>(null);
  const [reason, setReason] = useState("");
  // The standing document whose «Bekor qilish» confirmation is open.
  const [revokeFor, setRevokeFor] = useState<IssuedCertificate | null>(null);

  async function give(level: LevelPreview, exemptReason?: string) {
    setBusy(level.level);
    try {
      const row = await issueCertificate(studentId, { level: level.level, exemptReason });
      toast.success(`Hujjat berildi: ${row.number}`);
      await queryClient.invalidateQueries({ queryKey: certificatePreviewKey(studentId) });
      setExemptFor(null);
      setReason("");
      await downloadCertificatePdf(row.id, row.number).catch(() => {});
    } catch (err) {
      toast.error(getErrorMessage(err, "Hujjat berishda xatolik yuz berdi"));
    }
    setReissueFor(null);
    setBusy(null);
  }

  async function download(row: IssuedCertificate) {
    try {
      await downloadCertificatePdf(row.id, row.number);
    } catch (err) {
      toast.error(getErrorMessage(err, "PDF yuklab bo'lmadi"));
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  // Only «no answer yet» is a full-screen error: a failed background refetch
  // (after issuing) keeps the list that is already on screen.
  if (!data) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">{"Hujjat ma'lumotini yuklab bo'lmadi."}</p>
        <Button variant="outline" disabled={isFetching} onClick={() => void refetch()}>
          {isFetching && <Loader2 className="size-4 animate-spin" />}
          Qayta urinish
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {data.levels.length === 0 && (
        <div className="flex h-24 items-center justify-center rounded-md border">
          <p className="text-sm text-muted-foreground">
            {"Bu o'quvchi hali hech bir darajada davomatga yozilmagan"}
          </p>
        </div>
      )}

      {data.unleveledGroups.length > 0 && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
          {`Guruh darajasi ko'rsatilmagan: ${data.unleveledGroups.join(", ")}. Bu guruhlar hisobga kirmaydi — guruhga daraja yozing.`}
        </p>
      )}

      {data.levels.map((level) => {
        const mode = issueMode(level, isCeo);
        return (
          <section key={level.level} className="space-y-3 rounded-lg border p-4">
            <header className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-base font-semibold">
                {level.level} daraja
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {dmy(level.from)} – {dmy(level.to)} · {level.groupNames.join(", ")}
                </span>
              </h3>
              <span
                className={
                  level.verdict.eligible
                    ? "rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                    : "rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-950 dark:text-red-300"
                }
              >
                {level.verdict.eligible ? "Shart bajarilgan" : "Shart bajarilmagan"}
              </span>
            </header>

            <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              {levelSummary(level, data.balance).map((line) => (
                <div key={line.label} className="flex items-baseline justify-between gap-3 border-b py-1">
                  <dt className="text-muted-foreground">{line.label}</dt>
                  <dd className="text-right font-medium tabular-nums">
                    {line.value}
                    {line.hint && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">{line.hint}</span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>

            {!level.verdict.eligible && (
              <p className="text-sm text-red-700 dark:text-red-400">{level.verdict.reasons.join(" · ")}</p>
            )}

            {canIssue && mode !== "blocked" && (
              <Button
                disabled={busy !== null}
                variant={mode === "exempt" ? "outline" : "default"}
                onClick={() => {
                  const action = issueClickAction(level, mode);
                  if (action === "exempt") setExemptFor(level);
                  else if (action === "confirm") setReissueFor(level);
                  else void give(level);
                }}
              >
                {busy === level.level ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <FileCheck2 className="size-4" />
                )}
                {mode === "exempt" ? "Istisno bilan berish" : "Hujjat berish"}
              </Button>
            )}

            {level.issued.length > 0 && (
              <IssuedDocumentsList
                rows={level.issued}
                canRevoke={canIssue}
                onDownload={(row) => void download(row)}
                onRevoke={setRevokeFor}
              />
            )}
          </section>
        );
      })}

      <RevokeCertificateDialog studentId={studentId} row={revokeFor} onClose={() => setRevokeFor(null)} />

      <Dialog open={exemptFor !== null} onOpenChange={(open) => !open && !busy && setExemptFor(null)}>
        <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>Istisno bilan hujjat berish</DialogTitle>
            <DialogDescription>
              {`${exemptFor?.verdict.reasons.join(" · ") ?? ""}. Sabab o'quvchi tarixiga yoziladi.`}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 space-y-2 overflow-y-auto px-6 py-4">
            {exemptFor && needsReissueConfirm(exemptFor) && (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
                {REISSUE_EXEMPT_NOTICE}
              </p>
            )}
            <Textarea
              value={reason}
              maxLength={500}
              placeholder="Sababi (masalan: kasal bo'lgan, hujjati bor)"
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <DialogFooter className="border-t px-6 py-4">
            <Button variant="outline" disabled={busy !== null} onClick={() => setExemptFor(null)}>
              Bekor qilish
            </Button>
            <Button
              disabled={busy !== null || reason.trim().length < 3}
              onClick={() => exemptFor && void give(exemptFor, reason.trim())}
            >
              {busy !== null && <Loader2 className="size-4 animate-spin" />}
              Berish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Another document for a level that already has one: asked first, the new one gets a new number. */}
      <Dialog open={reissueFor !== null} onOpenChange={(open) => !open && busy === null && setReissueFor(null)}>
        <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>Hujjat berish</DialogTitle>
            <DialogDescription>{REISSUE_CONFIRM_TEXT}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="border-t px-6 py-4">
            <Button variant="outline" disabled={busy !== null} onClick={() => setReissueFor(null)}>
              Bekor qilish
            </Button>
            <Button disabled={busy !== null} onClick={() => reissueFor && void give(reissueFor)}>
              {busy !== null && <Loader2 className="size-4 animate-spin" />}
              Ha, berish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
