"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { format } from "date-fns";
import {
  Send,
  Bot,
  User,
  MessageSquare,
  ChevronUp,
  Loader2,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import toast from "react-hot-toast";
import api from "@/lib/api";

function sanitizeHtml(html: string): string {
  return html.replace(/<\/?(?!b|i|u|br\s*\/?)[\w\s="'-]*>/gi, "");
}

interface SmsMessageData {
  id: string;
  content: string;
  type: "AUTO" | "MANUAL";
  status: "SENT" | "FAILED";
  senderUser: { id: number; name: string } | null;
  telegramMessageId: number | null;
  errorMessage: string | null;
  createdAt: string;
  _pending?: boolean;
}

interface SmsTabProps {
  studentId: number;
  telegramChatId: string | null;
}

export function SmsTab({ studentId, telegramChatId }: SmsTabProps) {
  const [messages, setMessages] = useState<SmsMessageData[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [content, setContent] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const initialLoad = useRef(true);
  const pageSize = 20;

  const fetchMessages = useCallback(
    async (pageNum: number, prepend = false) => {
      try {
        const res = await api.get(`/students/${studentId}/sms`, {
          params: { page: pageNum, pageSize },
        });
        const { data, total: t } = res.data;
        setTotal(t);
        if (prepend) {
          setMessages((prev) => [...prev, ...data]);
        } else {
          setMessages(data);
        }
      } catch {
        toast.error("SMS tarixini yuklashda xatolik");
      }
    },
    [studentId],
  );

  useEffect(() => {
    if (!telegramChatId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchMessages(1).finally(() => {
      setLoading(false);
      initialLoad.current = false;
    });
  }, [fetchMessages, telegramChatId]);

  useEffect(() => {
    if (messagesEndRef.current && !loadingMore) {
      messagesEndRef.current.scrollIntoView(
        initialLoad.current ? { behavior: "instant" } : { behavior: "smooth" },
      );
    }
  }, [messages.length, loadingMore]);

  const loadOlder = async () => {
    const nextPage = page + 1;
    setLoadingMore(true);
    await fetchMessages(nextPage, true);
    setPage(nextPage);
    setLoadingMore(false);
  };

  const handleSend = async () => {
    const text = content.trim();
    if (!text) return;

    const tempId = `temp-${Date.now()}`;
    const optimistic: SmsMessageData = {
      id: tempId,
      content: text,
      type: "MANUAL",
      status: "SENT",
      senderUser: null,
      telegramMessageId: null,
      errorMessage: null,
      createdAt: new Date().toISOString(),
      _pending: true,
    };

    setMessages((prev) => [optimistic, ...prev]);
    setContent("");
    setSending(true);

    try {
      const res = await api.post(`/students/${studentId}/sms`, {
        content: text,
      });
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...res.data, _pending: false } : m)),
      );
      setTotal((t) => t + 1);
      if (res.data.status === "SENT") {
        toast.success("Xabar yuborildi");
      } else {
        toast.error(res.data.errorMessage || "Xabar yuborishda xatolik");
      }
    } catch (err: unknown) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "Xabar yuborishda xatolik";
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!telegramChatId) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="rounded-full bg-muted p-3 mb-3">
          <Info className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="text-muted-foreground text-sm max-w-sm">
          O&apos;quvchining Telegram akkaunti bog&apos;lanmagan. Telegram bot
          orqali ro&apos;yxatdan o&apos;tgandan so&apos;ng xabar yuborish
          mumkin.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-3 p-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-8 w-8 rounded-full shrink-0" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-16 w-full rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const hasMore = messages.length < total;

  // Reverse for chat display: oldest at top, newest at bottom
  const displayMessages = [...messages].reverse();

  return (
    <div className="flex flex-col h-[500px] border rounded-lg bg-background">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* Load older button */}
        {hasMore && (
          <div className="flex justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={loadOlder}
              disabled={loadingMore}
              className="text-xs h-7 rounded-full px-4"
            >
              {loadingMore ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
              ) : (
                <ChevronUp className="h-3 w-3 mr-1.5" />
              )}
              Eski xabarlarni yuklash
            </Button>
          </div>
        )}

        {displayMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-muted p-4 mb-3">
              <MessageSquare className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">
              SMS tarixi mavjud emas
            </p>
            <p className="text-muted-foreground text-xs mt-1">
              Xabar yuborish uchun pastdagi formadan foydalaning
            </p>
          </div>
        )}

        {displayMessages.map((msg, i) => {
          const prev = displayMessages[i - 1];
          const showDateSeparator =
            !prev ||
            format(new Date(msg.createdAt), "dd.MM.yyyy") !==
              format(new Date(prev.createdAt), "dd.MM.yyyy");

          return (
            <div key={msg.id}>
              {showDateSeparator && (
                <div className="flex items-center gap-3 my-3">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-[11px] text-muted-foreground font-medium">
                    {format(new Date(msg.createdAt), "dd.MM.yyyy")}
                  </span>
                  <div className="flex-1 h-px bg-border" />
                </div>
              )}
              <MessageBubble message={msg} />
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Send area */}
      <div className="border-t bg-muted/30 p-3 flex gap-2 items-end rounded-b-lg">
        <Textarea
          placeholder="Xabar yozing..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          className="min-h-[40px] max-h-[120px] resize-none bg-background"
          rows={1}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              onClick={handleSend}
              disabled={sending || !content.trim()}
              className="shrink-0"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Yuborish (Ctrl+Enter)</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: SmsMessageData }) {
  const isSystem = message.type === "AUTO";
  const senderName = message.senderUser?.name ?? "Tizim";
  const fullTime = format(new Date(message.createdAt), "HH:mm");

  return (
    <div
      className={`flex gap-3 ${message._pending ? "opacity-50" : ""}`}
    >
      <div
        className={`shrink-0 h-9 w-9 rounded-full flex items-center justify-center shadow-sm ${
          isSystem
            ? "bg-blue-50 text-blue-500 ring-1 ring-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:ring-blue-800"
            : "bg-emerald-50 text-emerald-500 ring-1 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:ring-emerald-800"
        }`}
      >
        {isSystem ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[13px] font-semibold">{senderName}</span>
          {isSystem && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium dark:bg-blue-950 dark:text-blue-400">
              Avtomatik
            </span>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-[11px] text-muted-foreground cursor-default">
                {fullTime}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {format(new Date(message.createdAt), "dd.MM.yyyy, HH:mm:ss")}
            </TooltipContent>
          </Tooltip>
        </div>

        <div
          className={`text-sm leading-relaxed rounded-xl rounded-tl-sm px-3.5 py-2.5 inline-block max-w-[90%] shadow-sm ${
            isSystem
              ? "bg-muted/70 text-muted-foreground"
              : "bg-primary/5 border border-border/60"
          }`}
        >
          <p
            className="whitespace-pre-wrap break-words [&>b]:font-semibold [&>b]:text-foreground"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(message.content) }}
          />
        </div>
      </div>
    </div>
  );
}
