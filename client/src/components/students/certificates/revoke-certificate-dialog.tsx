"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage } from "@/lib/get-error-message";
import { certificatePreviewKey, revokeCertificate } from "./certificate-queries";
import {
  canSubmitRevoke,
  REVOKE_REASON_MAX,
  revokeDescription,
  revokeReasonHint,
} from "./certificate-rules";
import type { IssuedCertificate } from "./certificate-types";

// JS strings, not JSX text: an apostrophe entity plus a line break loses a space (SWC bug, Next 16.2).
const PLACEHOLDER = "Masalan: noto'g'ri o'quvchiga berilgan";

/**
 * «Hujjat bekor qilinsinmi?»: the cancel needs a written reason. Not
 * optimistic: the document is domain data, so the preview is read again.
 * The dialog cannot be closed while the request runs, and forgets the reason
 * when it closes.
 */
export function RevokeCertificateDialog({
  studentId,
  row,
  onClose,
}: {
  studentId: number;
  row: IssuedCertificate | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  function close() {
    setReason("");
    onClose();
  }

  async function submit() {
    if (!row || !canSubmitRevoke(reason, busy)) return;
    setBusy(true);
    try {
      await revokeCertificate(row.id, reason.trim());
      toast.success("Hujjat bekor qilindi");
      await queryClient.invalidateQueries({ queryKey: certificatePreviewKey(studentId) });
      close();
    } catch (err) {
      toast.error(getErrorMessage(err, "Bekor qilishda xatolik yuz berdi"));
    }
    setBusy(false);
  }

  const hint = revokeReasonHint(reason);

  return (
    <AlertDialog open={row !== null} onOpenChange={(open) => !open && !busy && close()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Hujjat bekor qilinsinmi?</AlertDialogTitle>
          <AlertDialogDescription>{row ? revokeDescription(row.number) : ""}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor="revoke-reason">Sabab</Label>
          <Textarea
            id="revoke-reason"
            value={reason}
            maxLength={REVOKE_REASON_MAX}
            disabled={busy}
            placeholder={PLACEHOLDER}
            onChange={(e) => setReason(e.target.value)}
          />
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Yopish</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={!canSubmitRevoke(reason, busy)}
            onClick={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            Bekor qilish
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
