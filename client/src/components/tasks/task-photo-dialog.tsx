"use client";
import { useRef } from "react";
import { Camera, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { TaskDetail } from "@/hooks/use-tasks";
import { PHOTO_ACCEPT } from "./task-file-rules";
import { useTaskFiles } from "./use-task-files";

/** Spec screen 18: the photo is added first, then the task goes to review. */
export function TaskPhotoDialog({ task, open, onOpenChange, onSend }: { task: TaskDetail; open: boolean; onOpenChange: (o: boolean) => void; onSend: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const files = useTaskFiles((s) => s.files);
  const listIsOurs = useTaskFiles((s) => s.taskId === task.id);
  const hasFreshPhoto = useTaskFiles((s) => (s.taskId === task.id ? s.hasFreshPhoto : false));
  const uploading = useTaskFiles((s) => s.uploading > 0);
  const upload = useTaskFiles((s) => s.upload);

  // The same rule as the server; the send button trusts `hasFreshPhoto`, not this list.
  const since = Date.parse(task.lastReturnedAt ?? task.createdAt);
  const added = listIsOurs ? files.filter((f) => f.kind === "IMAGE" && Date.parse(f.createdAt) > since) : [];

  const pick = (list: FileList | null) => {
    const picked = list ? Array.from(list) : [];
    if (input.current) input.current.value = "";
    for (const f of picked) void upload(task.id, f, f.name);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>Rasm bilan yuborish</DialogTitle>
          <DialogDescription>{"Bajarilgan ishning rasmini qo'shing. Rasm qo'shilmaguncha topshiriq tekshiruvga yuborilmaydi."}</DialogDescription>
        </DialogHeader>
        <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
          {/* No `capture`: a phone offers the camera and the gallery itself. */}
          <input ref={input} type="file" accept={PHOTO_ACCEPT} multiple hidden aria-label="Rasm tanlash" onChange={(e) => pick(e.target.files)} />
          <Button type="button" variant="outline" disabled={uploading} onClick={() => input.current?.click()}>
            {uploading ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Camera className="mr-1 size-4" />}Rasm tanlash
          </Button>
          {added.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {added.map((f) => (
                // eslint-disable-next-line @next/next/no-img-element -- a presigned URL: Next image optimisation would break it
                <img key={f.id} src={f.url} alt={f.name} className="aspect-square w-full rounded-md object-cover" />
              ))}
            </div>
          )}
        </div>
        <DialogFooter className="border-t px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Bekor qilish</Button>
          <Button type="button" disabled={!hasFreshPhoto || uploading} onClick={() => { onSend(); onOpenChange(false); }}>Tekshiruvga yuborish</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
