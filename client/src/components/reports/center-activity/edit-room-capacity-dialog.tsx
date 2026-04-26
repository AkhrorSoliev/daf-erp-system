"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";

interface Props {
  open: boolean;
  onClose: () => void;
  room: { id: string; name: string; capacity: number | null } | null;
  onSaved: (capacity: number) => void;
}

export function EditRoomCapacityDialog({
  open,
  onClose,
  room,
  onSaved,
}: Props) {
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (room) {
      setValue(room.capacity != null ? String(room.capacity) : "");
    }
  }, [room]);

  if (!room) return null;

  const handleSubmit = async () => {
    const capacity = Number(value);
    if (!Number.isInteger(capacity) || capacity < 1) {
      toast.error("Sig'im kamida 1 bo'lishi kerak");
      return;
    }
    setSubmitting(true);
    try {
      await api.patch(`/rooms/${room.id}`, { capacity });
      toast.success("Xona sig'imi yangilandi");
      onSaved(capacity);
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, "Saqlashda xatolik yuz berdi"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !submitting && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Xona sig&apos;imini o&apos;zgartirish</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Xona</Label>
            <div className="text-sm font-medium">{room.name}</div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="capacity">Sig&apos;im (o&apos;quvchi soni)</Label>
            <Input
              id="capacity"
              type="number"
              min={1}
              step={1}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={submitting}
              autoFocus
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={submitting}
          >
            Bekor qilish
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            Saqlash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
