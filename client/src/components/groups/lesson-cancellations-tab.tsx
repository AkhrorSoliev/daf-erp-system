"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";

interface LessonCancellation {
  id: string;
  date: string;
  reason: string;
  createdAt: string;
  cancelledBy: { id: number; firstName: string; lastName: string };
}

interface Props {
  groupId: string;
}

export function LessonCancellationsTab({ groupId }: Props) {
  const user = useAuth((s) => s.user);
  const queryClient = useQueryClient();
  const canCreate =
    user?.roles?.some((r) => [1, 2, 3].includes(r.id)) ?? false;
  const canDelete = user?.roles?.some((r) => [1, 2].includes(r.id)) ?? false;

  const { data, isLoading } = useQuery({
    queryKey: ["lesson-cancellations", groupId],
    queryFn: () =>
      api
        .get<LessonCancellation[]>("/lesson-cancellations", {
          params: { groupId },
        })
        .then((r) => r.data),
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    // Q7 — Backend only soft-deletes the cancellation row. Attendance
    // (set to EXCUSED with cancellationId), prepaid restoration, and
    // accrual reversal that the original cancel cascade applied are
    // NOT undone — admins must re-take attendance manually if the lesson
    // turned out to actually happen. Make this explicit in the prompt.
    if (
      !confirm(
        "Bekor qilingan dars yozuvini o'chirmoqchimisiz?\n\n" +
          "Diqqat: bu davomat va to'lovni tiklamaydi. Agar dars haqiqatda " +
          "o'tilgan bo'lsa, admin keyin davomatni qo'lda olishi kerak.",
      )
    )
      return;
    setDeleting(id);
    try {
      await api.delete(`/lesson-cancellations/${id}`);
      toast.success("Bekor qilingan dars yozuvi o'chirildi");
      queryClient.invalidateQueries({ queryKey: ["lesson-cancellations", groupId] });
    } catch (err) {
      toast.error(getErrorMessage(err, "O'chirishda xatolik"));
    } finally {
      setDeleting(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Bekor qilingan darslar</CardTitle>
        {canCreate && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            Bu darsni bekor qilish
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : !data?.length ? (
          <p className="text-muted-foreground text-sm py-4 text-center">
            Hech qanday dars bekor qilinmagan
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 border-r">#</TableHead>
                <TableHead>Sana</TableHead>
                <TableHead>Sabab</TableHead>
                <TableHead>Bekor qilgan</TableHead>
                <TableHead>Vaqti</TableHead>
                {canDelete && <TableHead className="w-16">Amal</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((c, i) => (
                <TableRow key={c.id}>
                  <TableCell className="border-r text-muted-foreground">
                    {i + 1}
                  </TableCell>
                  <TableCell className="font-medium">
                    {format(new Date(c.date), "dd.MM.yyyy")}
                  </TableCell>
                  <TableCell>{c.reason}</TableCell>
                  <TableCell>
                    {c.cancelledBy.firstName} {c.cancelledBy.lastName}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {format(new Date(c.createdAt), "dd.MM.yyyy, HH:mm")}
                  </TableCell>
                  {canDelete && (
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(c.id)}
                        disabled={deleting === c.id}
                      >
                        {deleting === c.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Trash2 className="size-4 text-red-500" />
                        )}
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {canCreate && (
        <CreateCancellationDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          groupId={groupId}
          onSaved={() =>
            queryClient.invalidateQueries({ queryKey: ["lesson-cancellations", groupId] })
          }
        />
      )}
    </Card>
  );
}

interface CreateProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  onSaved: () => void;
}

function CreateCancellationDialog({
  open,
  onOpenChange,
  groupId,
  onSaved,
}: CreateProps) {
  const [date, setDate] = useState<Date | undefined>();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!date || !reason.trim()) {
      toast.error("Sana va sababni kiriting");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/lesson-cancellations", {
        groupId,
        date: format(date, "yyyy-MM-dd"),
        reason: reason.trim(),
      });
      toast.success("Dars bekor qilindi");
      onSaved();
      onOpenChange(false);
      setDate(undefined);
      setReason("");
    } catch (err) {
      toast.error(getErrorMessage(err, "Bekor qilishda xatolik"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!submitting) onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Darsni bekor qilish</DialogTitle>
          <DialogDescription>
            Agar bu kuni davomat allaqachon olingan bo&apos;lsa, har attendance
            EXCUSED ga o&apos;tadi. Pul yechilgan bo&apos;lsa, oldindan-to&apos;langan
            darslar hisobchisi 1 ga oshadi va dars kelajakka o&apos;tadi.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Bekor qilingan sana</Label>
            <DatePicker value={date} onChange={setDate} disabled={submitting} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cancel-reason">Sabab</Label>
            <Textarea
              id="cancel-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ustoz kasal, bayram, va h.k."
              maxLength={500}
              rows={3}
              disabled={submitting}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Bekor qilish
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="size-4 animate-spin mr-2" />}
            Saqlash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
