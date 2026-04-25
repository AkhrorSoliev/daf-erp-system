"use client";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface StudentRemoveFromGroupDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  reasons: { id: string; name: string }[] | undefined;
  reasonId: string | null;
  onReasonIdChange: (id: string | null) => void;
  reasonText: string;
  onReasonTextChange: (text: string) => void;
  removing: boolean;
  canSubmit: boolean;
  onConfirm: () => void;
}

export function StudentRemoveFromGroupDialog({
  open,
  onOpenChange,
  reasons,
  reasonId,
  onReasonIdChange,
  reasonText,
  onReasonTextChange,
  removing,
  canSubmit,
  onConfirm,
}: StudentRemoveFromGroupDialogProps) {
  const hasConfiguredReasons = (reasons?.length ?? 0) > 0;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Guruhdan chiqarish</AlertDialogTitle>
          <AlertDialogDescription>
            {hasConfiguredReasons
              ? "Ketish sababini tanlang"
              : "O'quvchini guruhdan chiqarish sababini kiriting"}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {hasConfiguredReasons ? (
          <div className="space-y-2">
            <Select
              value={reasonId ?? undefined}
              onValueChange={(v) => onReasonIdChange(v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Sababni tanlang" />
              </SelectTrigger>
              <SelectContent>
                {reasons?.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              placeholder="Qo'shimcha izoh (ixtiyoriy)"
              value={reasonText}
              onChange={(e) => onReasonTextChange(e.target.value)}
              rows={2}
              className="resize-none"
            />
          </div>
        ) : (
          <Textarea
            placeholder="Sabab yozing..."
            value={reasonText}
            onChange={(e) => onReasonTextChange(e.target.value)}
            rows={3}
            className="resize-none"
          />
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={removing}>Bekor qilish</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={!canSubmit || removing}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {removing ? "Chiqarilmoqda..." : "Chiqarish"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
