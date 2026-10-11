"use client";
import { useRef, useState } from "react";
import { format } from "date-fns";
import { FileText, Loader2, Paperclip } from "lucide-react";
import toast from "react-hot-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useTasks, type TaskEvent, type TaskFileView } from "@/hooks/use-tasks";
import { tashkentDayAndTime } from "./task-due";
import { TaskFileViewer, openFresh } from "./task-drawer-files";
import { describeEvent, viaLabel } from "./task-feed-text";
import { FILE_ACCEPT, fileOfEvent, formatSize } from "./task-file-rules";
import { TaskVoicePlayer } from "./task-voice-player";
import { TaskVoiceRecorder } from "./task-voice-recorder";
import { useTaskFiles } from "./use-task-files";

const NONE: TaskFileView[] = [];

// The Tashkent day and time, not the browser's zone (every other time on the page is Tashkent).
const when = (iso: string) => {
  const { day, time } = tashkentDayAndTime(iso);
  return `${format(day, "dd.MM")}, ${time}`;
};

/** The avatar, name, channel and time above a bubble. */
function Message({ ev, children }: { ev: TaskEvent; children: React.ReactNode }) {
  const { actor } = describeEvent(ev);
  const via = viaLabel(ev);
  return (
    <li className="flex gap-2">
      <Avatar size="sm">
        {ev.actor?.photo && <AvatarImage src={ev.actor.photo} alt={actor} />}
        <AvatarFallback className="text-[9px]">{ev.actor ? `${ev.actor.firstName.charAt(0)}${ev.actor.lastName.charAt(0)}` : "?"}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="text-xs">
          <span className="font-medium">{actor}</span>
          <span className="text-muted-foreground">{via ? ` · ${via}` : ""} · {when(ev.createdAt)}</span>
        </p>
        {children}
      </div>
    </li>
  );
}

function Comment({ ev }: { ev: TaskEvent }) {
  return (
    <Message ev={ev}>
      <p className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-muted px-3 py-2 text-sm">{describeEvent(ev).text}</p>
    </Message>
  );
}

/** A picture, a document or a voice message; a muted bubble once the file is gone. */
function Attachment({ taskId, ev, file, onImage }: { taskId: string; ev: TaskEvent; file: TaskFileView | undefined; onImage: (f: TaskFileView) => void }) {
  let body: React.ReactNode;
  if (file?.kind === "IMAGE") {
    body = (
      <button type="button" aria-label={file.name} className="mt-1 block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary/40" onClick={() => onImage(file)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a presigned URL: Next image optimisation would break it */}
        <img src={file.url} alt={file.name} loading="lazy" className="max-h-48 rounded-lg" />
      </button>
    );
  } else if (file?.kind === "DOCUMENT") {
    body = (
      <a href={file.url} target="_blank" rel="noopener noreferrer" onClick={(e) => void openFresh(e, taskId, file)} className="mt-1 inline-flex max-w-full items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm hover:underline">
        <FileText className="size-4 shrink-0" /><span className="truncate">{file.name}</span><span className="shrink-0 text-xs text-muted-foreground">{formatSize(file.size)}</span>
      </a>
    );
  } else if (file?.kind === "VOICE") {
    body = <div className="mt-1"><TaskVoicePlayer taskId={taskId} fileId={file.id} src={file.url} durationSec={file.durationSec} /></div>;
  } else {
    const gone = ev.type === "VOICE" ? "Ovozli xabar" : (ev.text ?? "fayl");
    body = <p className="mt-1 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">{gone} {"(o'chirilgan)"}</p>;
  }
  return <Message ev={ev}>{body}</Message>;
}

function Line({ ev }: { ev: TaskEvent }) {
  const { actor, text } = describeEvent(ev);
  const via = viaLabel(ev);
  return (
    <li className="break-words text-xs text-muted-foreground">
      <span className="font-medium text-foreground/80">{actor}</span> {text}{via ? ` · ${via}` : ""} · {when(ev.createdAt)}
    </li>
  );
}

function Composer({ taskId, canAttach }: { taskId: string; canAttach: boolean }) {
  const appendEvent = useTasks((s) => s.appendEvent);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const filesEnabled = useTaskFiles((s) => s.enabled === true);
  const upload = useTaskFiles((s) => s.upload);
  const uploading = useTaskFiles((s) => s.uploading > 0);
  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = ""; // the same file can be picked again
    for (const f of picked) await upload(taskId, f, f.name);
  };
  const canSend = text.trim() !== "" && !sending;

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      const { data } = await api.post<TaskEvent>(`/tasks/${taskId}/events`, { text: text.trim() });
      setText("");
      appendEvent(taskId, data);
      requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" }));
    } catch (error) {
      toast.error(getErrorMessage(error, "Izoh yuborishda xatolik yuz berdi"));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-2">
      <Textarea
        aria-label="Izoh"
        placeholder="Izoh yozing…"
        rows={2}
        maxLength={5000}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void send(); } }}
      />
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {filesEnabled && canAttach && (
            <>
              <TaskVoiceRecorder taskId={taskId} />
              <Button type="button" variant="ghost" size="icon-sm" aria-label={"Fayl qo'shish"} disabled={uploading} onClick={() => fileRef.current?.click()}>
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
              </Button>
              <input ref={fileRef} type="file" multiple accept={FILE_ACCEPT} className="hidden" onChange={(e) => void onPick(e)} />
            </>
          )}
          <span className="text-[11px] text-muted-foreground">Ctrl+Enter — yuborish</span>
        </div>
        <Button size="sm" onClick={() => void send()} disabled={!canSend}>
          {sending && <Loader2 className="mr-1 size-4 animate-spin" />}Yuborish
        </Button>
      </div>
      <div ref={endRef} />
    </div>
  );
}

/** The discussion: comments as bubbles, files and voice messages as attachments, everything else as one grey line, the composer below. */
export function TaskDrawerFeed({ taskId, events, canAttach }: { taskId: string; events: TaskEvent[]; canAttach: boolean }) {
  const files = useTaskFiles((s) => (s.taskId === taskId ? s.files : NONE));
  const ensureFresh = useTaskFiles((s) => s.ensureFresh);
  const [viewer, setViewer] = useState<number | null>(null);
  const images = files.filter((f) => f.kind === "IMAGE");
  // Every picture gone while the viewer is open: close it, or it would come back with the next upload.
  if (viewer !== null && images.length === 0) setViewer(null);

  // The links may have expired: renew them, then open at the picture's place in the fresh list.
  const openImage = (f: TaskFileView) => {
    void ensureFresh(taskId).then((ok) => {
      if (!ok) return;
      const at = useTaskFiles.getState().files.filter((x) => x.kind === "IMAGE").findIndex((x) => x.id === f.id);
      if (at >= 0) setViewer(at);
    });
  };

  return (
    <section className="space-y-3">
      <h4 className="text-sm font-semibold">Muhokama</h4>
      <ul className="space-y-2.5">
        {events.map((ev) =>
          ev.type === "COMMENT" ? <Comment key={ev.id} ev={ev} />
          : ev.type === "FILE" || ev.type === "VOICE" ? <Attachment key={ev.id} taskId={taskId} ev={ev} file={fileOfEvent(files, ev)} onImage={openImage} />
          : <Line key={ev.id} ev={ev} />,
        )}
      </ul>
      <Composer taskId={taskId} canAttach={canAttach} />
      {viewer !== null && <TaskFileViewer images={images} index={viewer} onIndex={setViewer} onClose={() => setViewer(null)} />}
    </section>
  );
}
