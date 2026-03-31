"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { uz } from "date-fns/locale";
import {
  Trash2,
  CheckCircle2,
  Eye,
  Pencil,
  Check,
  MoreHorizontal,
  ListTodo,
  MessageSquare,
  Clock,
  CircleDot,
  CircleCheck,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";

interface CommentAuthor {
  id: number;
  name: string;
  photo: string | null;
}

interface CommentAssignee {
  id: string;
  userId: number;
  user: { id: number; name: string };
  status: "PENDING" | "SEEN" | "DONE";
  seenAt: string | null;
  doneAt: string | null;
}

export interface CommentData {
  id: string;
  entityType: string;
  entityId: string;
  content: string;
  isTask: boolean;
  isSystem?: boolean;
  author: CommentAuthor;
  assignees: CommentAssignee[];
  createdAt: string;
  _pending?: boolean;
  _failed?: boolean;
}

interface CommentListProps {
  entityType: string;
  entityId: string | number;
  optimisticComments?: CommentData[];
  onCommentChange?: () => void;
}

// --- Skeleton ---
function CommentSkeleton() {
  return (
    <div className="py-3">
      <div className="flex gap-3">
        <Skeleton className="size-7 rounded-full shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    </div>
  );
}

// --- Relative time ---
function RelativeTime({ date }: { date: string }) {
  const d = new Date(date);
  const now = new Date();
  const diffHours = (now.getTime() - d.getTime()) / (1000 * 60 * 60);

  if (diffHours < 24) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-[11px] text-muted-foreground/70 cursor-default">
            {formatDistanceToNow(d, { addSuffix: true, locale: uz })}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {format(d, "dd.MM.yyyy, HH:mm:ss")}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <span className="text-[11px] text-muted-foreground/70">
      {format(d, "dd.MM.yyyy, HH:mm")}
    </span>
  );
}

// --- Assignee chip ---
function AssigneeChip({ assignee }: { assignee: CommentAssignee }) {
  const statusConfig = {
    PENDING: {
      icon: Clock,
      color: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800",
      label: "Kutilmoqda",
    },
    SEEN: {
      icon: Eye,
      color: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800",
      label: "Ko'rdi",
    },
    DONE: {
      icon: CheckCircle2,
      color: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800",
      label: "Bajardi",
    },
  };

  const config = statusConfig[assignee.status];
  const Icon = config.icon;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${config.bg} ${config.color}`}
        >
          <Icon className="size-3" />
          {assignee.user.name}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {config.label}
        {assignee.doneAt && ` — ${format(new Date(assignee.doneAt), "dd.MM.yyyy, HH:mm")}`}
        {!assignee.doneAt && assignee.seenAt && ` — ${format(new Date(assignee.seenAt), "dd.MM.yyyy, HH:mm")}`}
      </TooltipContent>
    </Tooltip>
  );
}

// --- Send status (Telegram-like) ---
function SendStatus({ pending, failed }: { pending?: boolean; failed?: boolean }) {
  if (failed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-destructive text-[10px] font-bold">!</span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">Yuborilmadi</TooltipContent>
      </Tooltip>
    );
  }
  if (pending) {
    return <Clock className="size-3 text-muted-foreground/50 animate-pulse" />;
  }
  return null;
}

export function CommentList({ entityType, entityId, optimisticComments, onCommentChange }: CommentListProps) {
  const user = useAuth((s) => s.user);
  const [comments, setComments] = useState<CommentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const fetched = useRef(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const isCeo = user?.roles.some((r) => r.id === 1) ?? false;

  const fetchComments = useCallback(
    async (p: number) => {
      setLoading(true);
      try {
        const { data } = await api.get("/comments", {
          params: { entityType, entityId: String(entityId), page: p, pageSize },
        });
        setComments(data.data);
        setTotal(data.total);
        setPage(data.page);
      } catch {
        setComments([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [entityType, entityId],
  );

  useEffect(() => {
    if (!fetched.current) {
      fetched.current = true;
      fetchComments(1);
    }
  }, [fetchComments]);

  // Merge optimistic on top
  const allComments: CommentData[] = [
    ...(optimisticComments || []),
    ...comments.filter(
      (c) => !(optimisticComments || []).some((oc) => oc.id === c.id),
    ),
  ];

  // Refetch when optimistic gets confirmed
  const prevOptLen = useRef(optimisticComments?.length ?? 0);
  useEffect(() => {
    const curLen = optimisticComments?.length ?? 0;
    if (prevOptLen.current > 0 && curLen < prevOptLen.current) {
      fetchComments(1);
    }
    prevOptLen.current = curLen;
  }, [optimisticComments?.length, fetchComments]);

  // --- Edit ---
  const startEdit = (comment: CommentData) => {
    setEditingId(comment.id);
    setEditContent(comment.content);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditContent("");
  };

  const saveEdit = async (commentId: string) => {
    if (!editContent.trim()) return;
    setEditSaving(true);
    try {
      const { data } = await api.patch(`/comments/${commentId}`, {
        content: editContent.trim(),
      });
      setComments((prev) =>
        prev.map((c) => (c.id === commentId ? { ...c, content: data.content } : c)),
      );
      toast.success("Izoh tahrirlandi");
      cancelEdit();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Tahrirlashda xatolik");
    } finally {
      setEditSaving(false);
    }
  };

  // --- Delete (CEO only, instant hard delete) ---
  const handleDelete = async (commentId: string) => {
    try {
      await api.delete(`/comments/${commentId}`);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      setTotal((prev) => prev - 1);
      toast.success("Izoh o'chirildi");
      onCommentChange?.();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "O'chirishda xatolik");
    }
  };

  // --- Assignee status ---
  const handleAssigneeStatus = async (commentId: string, status: "SEEN" | "DONE") => {
    try {
      const { data } = await api.patch(`/comments/${commentId}/assignee-status`, { status });
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId
            ? {
                ...c,
                assignees: c.assignees.map((a) =>
                  a.userId === user?.id ? { ...a, status: data.status, seenAt: data.seenAt, doneAt: data.doneAt } : a,
                ),
              }
            : c,
        ),
      );
      toast.success(status === "SEEN" ? "Ko'rildi deb belgilandi" : "Bajarildi deb belgilandi");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Xatolik yuz berdi");
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  // --- Loading skeleton ---
  if (loading && comments.length === 0 && !optimisticComments?.length) {
    return (
      <div>
        <CommentSkeleton />
        <Separator />
        <CommentSkeleton />
        <Separator />
        <CommentSkeleton />
      </div>
    );
  }

  if (!loading && allComments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted/50 mb-3">
          <MessageSquare className="size-5 text-muted-foreground/50" />
        </div>
        <p className="text-sm text-muted-foreground">Hozircha izohlar yo&apos;q</p>
        <p className="text-xs text-muted-foreground/60 mt-0.5">Birinchi izohni qoldiring</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {/* Header */}
      <div className="flex items-center gap-2 pb-2">
        <MessageSquare className="size-4 text-muted-foreground/60" />
        <span className="text-xs font-medium text-muted-foreground">
          {total} ta izoh
        </span>
      </div>

      {/* Scrollable comments container */}
      <div className="max-h-125 overflow-y-auto space-y-0 pr-1">
        {allComments.map((comment, index) => {
          const isAuthor = comment.author.id === user?.id;
          const isSystemComment = comment.isSystem;
          const canEdit = (isAuthor || isCeo) && !comment._pending && !isSystemComment;
          const myAssignee = comment.assignees.find((a) => a.userId === user?.id);
          const isEditing = editingId === comment.id;
          const allDone = comment.isTask && comment.assignees.length > 0 &&
            comment.assignees.every((a) => a.status === "DONE");

          return (
            <div key={comment.id}>
              {index > 0 && <Separator className="my-0" />}
              <div
                className={`group relative py-3 transition-opacity duration-200 ${
                  comment._pending ? "opacity-60" : ""
                } ${comment._failed ? "opacity-40" : ""}`}
              >
                <div className="flex gap-3">
                  {/* Avatar / System icon */}
                  {isSystemComment ? (
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted mt-0.5">
                      <RefreshCw className="size-3.5 text-muted-foreground" />
                    </div>
                  ) : (
                    <Avatar className="size-7 shrink-0 mt-0.5">
                      {comment.author.photo && <AvatarImage src={comment.author.photo} />}
                      <AvatarFallback className="text-[10px] font-medium">
                        {comment.author.name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  )}

                  {/* Body */}
                  <div className="min-w-0 flex-1 space-y-1">
                    {/* Author line */}
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold leading-none">
                        {comment.author.name}
                      </span>
                      <RelativeTime date={comment.createdAt} />
                      <SendStatus pending={comment._pending} failed={comment._failed} />

                      {comment.isTask && (
                        <span className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          allDone
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                            : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                        }`}>
                          <ListTodo className="size-2.5" />
                          {allDone ? "Bajarildi" : "Topshiriq"}
                        </span>
                      )}

                      {/* Actions — hover */}
                      {canEdit && !isEditing && (
                        <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="size-6">
                                <MoreHorizontal className="size-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-36">
                              <DropdownMenuItem onClick={() => startEdit(comment)}>
                                <Pencil className="mr-2 size-3.5" />
                                Tahrirlash
                              </DropdownMenuItem>
                              {isCeo && (
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => handleDelete(comment.id)}
                                >
                                  <Trash2 className="mr-2 size-3.5" />
                                  O&apos;chirish
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )}
                    </div>

                    {/* Content / Edit */}
                    {isEditing ? (
                      <div className="space-y-2 pr-4">
                        <Textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          rows={3}
                          className="resize-none text-sm"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                              e.preventDefault();
                              saveEdit(comment.id);
                            }
                            if (e.key === "Escape") cancelEdit();
                          }}
                        />
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            className="h-7 text-xs px-3"
                            onClick={() => saveEdit(comment.id)}
                            disabled={!editContent.trim() || editSaving}
                          >
                            <Check className="mr-1 size-3" />
                            {editSaving ? "..." : "Saqlash"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={cancelEdit}
                            disabled={editSaving}
                          >
                            Bekor
                          </Button>
                          <span className="text-[11px] text-muted-foreground/40 ml-auto hidden sm:inline">
                            Esc — bekor, Ctrl+Enter — saqlash
                          </span>
                        </div>
                      </div>
                    ) : (
                      <p className={`text-[13px] leading-relaxed whitespace-pre-wrap pr-4 ${
                        isSystemComment ? "text-muted-foreground italic" : "text-foreground/90"
                      }`}>
                        {comment.content}
                      </p>
                    )}

                    {/* Task assignees */}
                    {comment.isTask && comment.assignees.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        {comment.assignees.map((assignee) => (
                          <AssigneeChip key={assignee.id} assignee={assignee} />
                        ))}
                      </div>
                    )}

                    {/* My action buttons */}
                    {myAssignee && myAssignee.status !== "DONE" && (
                      <div className="flex items-center gap-2 pt-1.5">
                        {myAssignee.status === "PENDING" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1 rounded-full"
                            onClick={() => handleAssigneeStatus(comment.id, "SEEN")}
                          >
                            <CircleDot className="size-3" />
                            Ko&apos;rdim
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1 rounded-full border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                          onClick={() => handleAssigneeStatus(comment.id, "DONE")}
                        >
                          <CircleCheck className="size-3" />
                          Bajarildi
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-3 border-t">
          <span className="text-xs text-muted-foreground/60">
            {page} / {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              disabled={page <= 1 || loading}
              onClick={() => fetchComments(page - 1)}
            >
              Oldingi
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              disabled={page >= totalPages || loading}
              onClick={() => fetchComments(page + 1)}
            >
              Keyingi
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
