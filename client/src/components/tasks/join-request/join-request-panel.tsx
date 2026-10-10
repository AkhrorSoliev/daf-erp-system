"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { formatPhone } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { LEAD_STATUS_LABELS, type LeadStatus } from "@/hooks/use-leads-board";
import { useCan, usePermissionsReady } from "@/hooks/use-permissions";
import { canApprove, decidedLine, initialGroupId, joinRequestNotes, requestedAtText, type JoinNote, type JoinRequestView } from "./join-request-rules";

// Blue and yellow, not sky and amber: outside the student portal those two
// resolve to Lumio variables and render transparent.
const TONE: Record<JoinNote["tone"], string> = {
  info: "bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200",
  warning: "bg-yellow-50 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-200",
  error: "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200",
};

/** «Yangi o'quvchi so'rovi» (ADR-0080): the request, what the server found, and the decision. */
export function JoinRequestPanel({ taskId, onDecided }: { taskId: string; onDecided: () => void }) {
  // Every route behind the panel is `students.enroll`: without it the read
  // would only come back 403, so it is not sent.
  const ready = usePermissionsReady();
  const allowed = useCan("students.enroll");
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["join-request", taskId],
    queryFn: async () => (await api.get<JoinRequestView>(`/student-join-requests/by-task/${taskId}`)).data,
    enabled: allowed,
    retry: false,
    staleTime: 0,
  });
  const [picked, setPicked] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);

  if (!ready || (allowed && isLoading)) return <Skeleton className="h-44 w-full" />;
  if (!allowed) return <p className="rounded-md bg-muted px-3 py-2 text-sm">Javob berish uchun ruxsat yo&apos;q</p>;
  if (isError || !data) {
    return (
      <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
        <span>So&apos;rovni yuklab bo&apos;lmadi</span>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>Qayta urinish</Button>
      </div>
    );
  }

  const decided = decidedLine(data);
  if (decided) {
    return (
      <p className="rounded-md bg-muted px-3 py-2 text-sm">
        {decided.text}
        {decided.studentId !== null && (
          <Link href={`/students/profile/${decided.studentId}`} className="font-medium text-primary hover:underline">#{decided.studentId}</Link>
        )}
        {decided.tail}
      </p>
    );
  }

  const groupId = picked ?? initialGroupId(data);
  const leadLabel = data.lead ? (LEAD_STATUS_LABELS[data.lead.status as LeadStatus] ?? null) : null;
  const notes = joinRequestNotes(data, groupId, leadLabel);

  const approve = async () => {
    if (!groupId) return;
    setBusy("approve");
    try {
      const res = await api.post<{ studentId: number; delivered: boolean }>(`/student-join-requests/${data.id}/approve`, { groupId });
      toast.success(`O'quvchi guruhga qo'shildi — #${res.data.studentId}`);
      if (!res.data.delivered) toast.error("Xabar Telegram'ga yetmadi — o'quvchi parolni botdagi «Parolni tiklash» orqali oladi");
      onDecided();
    } catch (e) {
      toast.error(getErrorMessage(e, "Tasdiqlashda xatolik yuz berdi"));
    } finally {
      setBusy(null);
      void refetch();
    }
  };

  const reject = async () => {
    setBusy("reject");
    try {
      await api.post(`/student-join-requests/${data.id}/reject`, { reason: reason.trim() });
      toast.success("So'rov rad etildi");
      setRejectOpen(false);
      setReason("");
      onDecided();
    } catch (e) {
      toast.error(getErrorMessage(e, "Rad etishda xatolik yuz berdi"));
    } finally {
      setBusy(null);
      void refetch();
    }
  };

  return (
    <section className="space-y-3 rounded-lg border p-3">
      <div className="flex gap-3">
        {data.photo
          ? <img src={data.photo} alt="" className="size-20 shrink-0 rounded-md object-cover" />
          : <div className="size-20 shrink-0 rounded-md bg-muted" />}
        <div className="min-w-0 space-y-0.5 text-sm">
          <p className="font-semibold">{data.firstName} {data.lastName}</p>
          <p className="text-muted-foreground">{formatPhone(data.phone)}</p>
          {data.telegramUsername && (
            <a href={`https://t.me/${data.telegramUsername}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">@{data.telegramUsername}</a>
          )}
          <p className="text-xs text-muted-foreground">So&apos;rov: {requestedAtText(data.createdAt)}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <span className="shrink-0 text-muted-foreground">Guruh</span>
        <Select value={groupId ?? undefined} onValueChange={setPicked}>
          <SelectTrigger className="w-full"><SelectValue placeholder="Guruhni tanlang" /></SelectTrigger>
          <SelectContent>
            {data.groups.map((g) => (
              <SelectItem key={g.id} value={g.id}>{g.name}{g.teacherName ? ` — ${g.teacherName}` : ""}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {notes.map((n) => <p key={n.text} className={cn("rounded-md px-3 py-2 text-xs", TONE[n.tone])}>{n.text}</p>)}

      <div className="flex justify-end gap-2">
        <Button variant="outline" disabled={busy !== null} onClick={() => setRejectOpen(true)}>Rad etish</Button>
        <Button disabled={!canApprove(data, groupId) || busy !== null} onClick={() => void approve()}>
          {busy === "approve" && <Loader2 className="mr-1.5 size-4 animate-spin" />}Tasdiqlash
        </Button>
      </div>

      <Dialog open={rejectOpen} onOpenChange={(open) => { if (busy === null) setRejectOpen(open); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>So&apos;rovni rad etish</DialogTitle>
            <DialogDescription>Sabab faqat xodimlarga ko&apos;rinadi. O&apos;quvchiga sababsiz, muloyim xabar boradi.</DialogDescription>
          </DialogHeader>
          <Textarea value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="Masalan: bu odam markazda o'qimaydi" />
          <DialogFooter>
            <Button variant="outline" disabled={busy !== null} onClick={() => setRejectOpen(false)}>Bekor qilish</Button>
            <Button variant="destructive" disabled={!reason.trim() || busy !== null} onClick={() => void reject()}>
              {busy === "reject" && <Loader2 className="mr-1.5 size-4 animate-spin" />}Rad etish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
