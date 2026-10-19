"use client";
import { useState } from "react";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight, Download, FileText, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import type { TaskFileView } from "@/hooks/use-tasks";
import { useT } from "@/i18n/context";
import { tashkentDayAndTime } from "./task-due";
import { personName, SYSTEM_NAME } from "./task-feed-text";
import { FILE_URL_REFRESH_MS, formatSize } from "./task-file-rules";
import { useTaskFiles } from "./use-task-files";

const NONE: TaskFileView[] = [];

// The Tashkent day and time, the same as the feed.
const when = (iso: string) => {
  const { day, time } = tashkentDayAndTime(iso);
  return `${format(day, "dd.MM")}, ${time}`;
};

/** The links die after 10 minutes: re-read the list first when they are old, then go to the fresh one. */
async function download(file: TaskFileView) {
  const { taskId, ensureFresh } = useTaskFiles.getState();
  if (taskId && !(await ensureFresh(taskId))) return;
  const fresh = useTaskFiles.getState().files.find((f) => f.id === file.id) ?? file;
  window.location.assign(fresh.downloadUrl);
}

/** A plain left-click: anything else (ctrl, middle, new tab) keeps the browser's own behaviour. */
const isPlainClick = (e: React.MouseEvent) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

/** Opens the document in a new tab; when the list is stale the tab is opened first (a popup blocker allows only a synchronous open), then pointed at the renewed link. */
export async function openFresh(e: React.MouseEvent, taskId: string, file: TaskFileView) {
  const { taskId: shown, loadedAt } = useTaskFiles.getState();
  if (!isPlainClick(e) || (shown === taskId && Date.now() - loadedAt < FILE_URL_REFRESH_MS)) return;
  e.preventDefault();
  const tab = window.open("", "_blank");
  const ok = await useTaskFiles.getState().ensureFresh(taskId);
  const fresh = ok ? useTaskFiles.getState().files.find((f) => f.id === file.id) : undefined;
  if (!tab) { if (fresh) window.open(fresh.url, "_blank", "noopener"); return; }
  if (!fresh) { tab.close(); return; }
  tab.opener = null;
  tab.location.href = fresh.url;
}

function DownloadLink({ file, label }: { file: TaskFileView; label?: string }) {
  const t = useT();
  return (
    <a
      href={file.downloadUrl}
      aria-label={t("Yuklab olish")}
      className={label ? buttonVariants({ variant: "outline", size: "sm" }) : buttonVariants({ variant: "ghost", size: "icon-sm" })}
      onClick={(e) => { if (!isPlainClick(e)) return; e.preventDefault(); void download(file); }}
    >
      <Download className="size-4" />{label}
    </a>
  );
}

function ConfirmDelete({ file, onCancel, onDone }: { file: TaskFileView; onCancel: () => void; onDone: () => void }) {
  const t = useT();
  const remove = useTaskFiles((s) => s.remove);
  const taskId = useTaskFiles((s) => s.taskId);
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    if (!taskId) return;
    setBusy(true);
    const ok = await remove(taskId, file.id);
    setBusy(false);
    if (ok) onDone();
    else onCancel();
  };
  return (
    <AlertDialog open onOpenChange={(open) => { if (!open && !busy) onCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("Faylni o'chirasizmi?")}</AlertDialogTitle>
          <AlertDialogDescription>{t("Muhokamada «faylni o'chirdi» degan yozuv qoladi.")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{t("Bekor qilish")}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={busy} onClick={(e) => { e.preventDefault(); void confirm(); }}>
            {t("O'chirish")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Opens at `images[index]`; the parent owns the index (and may close it). Also used by the feed. */
export function TaskFileViewer({ images, index, onIndex, onClose }: {
  images: TaskFileView[]; index: number; onIndex: (i: number) => void; onClose: () => void;
}) {
  const t = useT();
  const [confirming, setConfirming] = useState(false);
  // After a delete the list is shorter for a moment while the index still points past it.
  const at = Math.min(index, images.length - 1);
  const image = images[at];
  if (!image) return null;

  const go = (i: number) => { if (i >= 0 && i < images.length) onIndex(i); };
  const afterDelete = () => {
    setConfirming(false);
    if (images.length <= 1) onClose();
    else onIndex(Math.min(at, images.length - 2));
  };

  return (
    <>
      <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent
          className="sm:max-w-3xl"
          aria-describedby={undefined}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") go(at - 1);
            else if (e.key === "ArrowRight") go(at + 1);
          }}
        >
          <DialogTitle className="truncate pr-8">{image.name}</DialogTitle>
          {/* eslint-disable-next-line @next/next/no-img-element -- a presigned URL: Next image optimisation would break it */}
          <img src={image.url} alt={image.name} className="max-h-[70dvh] w-full object-contain" />
          <DialogFooter className="items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={at === 0} onClick={() => go(at - 1)}>
                <ChevronLeft className="size-4" />{t("Oldingi")}
              </Button>
              <span className="text-xs text-muted-foreground">{at + 1} / {images.length}</span>
              <Button variant="outline" size="sm" disabled={at >= images.length - 1} onClick={() => go(at + 1)}>
                {t("Keyingi")}<ChevronRight className="size-4" />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <DownloadLink file={image} label={t("Yuklab olish")} />
              {image.canDelete && (
                <Button variant="destructive" size="sm" onClick={() => setConfirming(true)}>
                  <Trash2 className="size-4" />{t("O'chirish")}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {confirming && <ConfirmDelete file={image} onCancel={() => setConfirming(false)} onDone={afterDelete} />}
    </>
  );
}

function DocumentRow({ taskId, file, onDelete }: { taskId: string; file: TaskFileView; onDelete: () => void }) {
  const t = useT();
  return (
    <li className="flex items-center gap-2 rounded-md border px-2.5 py-2">
      <FileText className="size-5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <a href={file.url} target="_blank" rel="noopener noreferrer" onClick={(e) => void openFresh(e, taskId, file)} className="block truncate text-sm font-medium hover:underline">{file.name}</a>
        <p className="truncate text-xs text-muted-foreground">
          {formatSize(file.size, t)} · {file.uploadedBy ? personName(file.uploadedBy) : t(SYSTEM_NAME)} · {when(file.createdAt)}
        </p>
      </div>
      <DownloadLink file={file} />
      {file.canDelete && (
        <Button variant="ghost" size="icon-sm" aria-label={t("O'chirish")} onClick={onDelete}>
          <Trash2 className="size-4" />
        </Button>
      )}
    </li>
  );
}

/** The task's pictures (thumbnails) and documents (rows); voices stay in the feed. */
export function TaskDrawerFiles({ taskId }: { taskId: string }) {
  const t = useT();
  const files = useTaskFiles((s) => (s.taskId === taskId ? s.files : NONE));
  const enabled = useTaskFiles((s) => s.enabled);
  const ensureFresh = useTaskFiles((s) => s.ensureFresh);
  const [viewer, setViewer] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<TaskFileView | null>(null);

  const images = files.filter((f) => f.kind === "IMAGE");
  const documents = files.filter((f) => f.kind === "DOCUMENT");
  // Every picture gone while the viewer is open (deleted elsewhere): close it, or it would come back with the next upload.
  if (viewer !== null && images.length === 0) setViewer(null);
  if (enabled !== true || (images.length === 0 && documents.length === 0)) return null;

  return (
    <section className="space-y-2">
      <h4 className="text-sm font-semibold">{t("Fayllar")}</h4>
      {images.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {images.map((f, i) => (
            <button
              key={f.id}
              type="button"
              aria-label={f.name}
              className="overflow-hidden rounded-md outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              onClick={() => { void ensureFresh(taskId).then((ok) => { if (ok) setViewer(i); }); }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- a presigned URL: Next image optimisation would break it */}
              <img src={f.url} alt={f.name} loading="lazy" className="aspect-square w-full rounded-md object-cover" />
            </button>
          ))}
        </div>
      )}
      {documents.length > 0 && (
        <ul className="space-y-1.5">
          {documents.map((f) => <DocumentRow key={f.id} taskId={taskId} file={f} onDelete={() => setDeleting(f)} />)}
        </ul>
      )}
      {viewer !== null && (
        <TaskFileViewer images={images} index={viewer} onIndex={setViewer} onClose={() => setViewer(null)} />
      )}
      {deleting && <ConfirmDelete file={deleting} onCancel={() => setDeleting(null)} onDone={() => setDeleting(null)} />}
    </section>
  );
}
