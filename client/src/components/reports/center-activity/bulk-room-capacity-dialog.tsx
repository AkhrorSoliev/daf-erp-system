"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { type CenterActivityRoom } from "./metric-helpers";

interface Props {
  open: boolean;
  onClose: () => void;
  rooms: CenterActivityRoom[];
  onSaved: (updates: Array<{ id: string; capacity: number }>) => void;
}

export function BulkRoomCapacityDialog({
  open,
  onClose,
  rooms,
  onSaved,
}: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      const initial: Record<string, string> = {};
      for (const r of rooms) {
        initial[r.id] = r.capacity != null ? String(r.capacity) : "";
      }
      setValues(initial);
    }
  }, [open, rooms]);

  const handleSave = async () => {
    const changes: Array<{ id: string; capacity: number }> = [];
    for (const r of rooms) {
      const newRaw = values[r.id];
      const newCap = Number(newRaw);
      if (newRaw === "" || !Number.isInteger(newCap) || newCap < 1) continue;
      if (newCap !== r.capacity) {
        changes.push({ id: r.id, capacity: newCap });
      }
    }

    if (changes.length === 0) {
      toast("O'zgarish yo'q", { icon: "ℹ️" });
      return;
    }

    setSubmitting(true);
    try {
      const results = await Promise.allSettled(
        changes.map((c) => api.patch(`/rooms/${c.id}`, { capacity: c.capacity })),
      );
      const success: Array<{ id: string; capacity: number }> = [];
      let failed = 0;
      results.forEach((r, i) => {
        if (r.status === "fulfilled") success.push(changes[i]);
        else failed++;
      });

      if (success.length > 0) {
        toast.success(
          failed === 0
            ? `${success.length} ta xona yangilandi`
            : `${success.length} ta yangilandi, ${failed} ta xato`,
        );
        onSaved(success);
      } else {
        toast.error("Hech qaysi xona yangilanmadi");
      }
      if (failed === 0) onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, "Saqlashda xatolik yuz berdi"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && !submitting && onClose()}>
      <SheetContent className="w-full max-w-md sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Xonalar sig&apos;imini sozlash</SheetTitle>
          <SheetDescription>
            Har bir xona uchun maksimal o&apos;quvchi sig&apos;imini
            o&apos;zgartiring.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-2 py-4">
          {rooms.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-8">
              Xonalar topilmadi
            </div>
          )}
          {rooms.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-3 rounded-lg border p-3"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{r.name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {r.branchName}
                </div>
              </div>
              <Input
                type="number"
                min={1}
                step={1}
                value={values[r.id] ?? ""}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [r.id]: e.target.value }))
                }
                disabled={submitting}
                className="w-24"
                placeholder="Sig'im"
              />
            </div>
          ))}
        </div>
        <SheetFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={submitting}
          >
            Bekor qilish
          </Button>
          <Button onClick={handleSave} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            Saqlash
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
