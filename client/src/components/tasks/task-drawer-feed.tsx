"use client";
import { useRef, useState } from "react";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useTasks, type TaskEvent } from "@/hooks/use-tasks";
import { tashkentDayAndTime } from "./task-due";
import { describeEvent, viaLabel } from "./task-feed-text";

// The Tashkent day and time, not the browser's zone (every other time on the page is Tashkent).
const when = (iso: string) => {
  const { day, time } = tashkentDayAndTime(iso);
  return `${format(day, "dd.MM")}, ${time}`;
};

function Comment({ ev }: { ev: TaskEvent }) {
  const { actor, text } = describeEvent(ev);
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
        <p className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-muted px-3 py-2 text-sm">{text}</p>
      </div>
    </li>
  );
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

function Composer({ taskId }: { taskId: string }) {
  const appendEvent = useTasks((s) => s.appendEvent);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
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
        <span className="text-[11px] text-muted-foreground">Ctrl+Enter — yuborish</span>
        <Button size="sm" onClick={() => void send()} disabled={!canSend}>
          {sending && <Loader2 className="mr-1 size-4 animate-spin" />}Yuborish
        </Button>
      </div>
      <div ref={endRef} />
    </div>
  );
}

/** The discussion: comments as bubbles, everything else as one grey line, the composer below. */
export function TaskDrawerFeed({ taskId, events }: { taskId: string; events: TaskEvent[] }) {
  return (
    <section className="space-y-3">
      <h4 className="text-sm font-semibold">Muhokama</h4>
      <ul className="space-y-2.5">
        {events.map((ev) => (ev.type === "COMMENT" ? <Comment key={ev.id} ev={ev} /> : <Line key={ev.id} ev={ev} />))}
      </ul>
      <Composer taskId={taskId} />
    </section>
  );
}
