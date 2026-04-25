"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useAuth } from "@/hooks/use-auth";
import {
  CommentSkeleton,
  type CommentData,
} from "./comment-list-helpers";
import { CommentItem } from "./comment-item";

export type { CommentData } from "./comment-list-helpers";

interface CommentListProps {
  entityType: string;
  entityId: string | number;
  optimisticComments?: CommentData[];
  onCommentChange?: () => void;
}

export function CommentList({
  entityType,
  entityId,
  optimisticComments,
  onCommentChange,
}: CommentListProps) {
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
        prev.map((c) =>
          c.id === commentId ? { ...c, content: data.content } : c,
        ),
      );
      toast.success("Izoh tahrirlandi");
      cancelEdit();
    } catch (err) {
      toast.error(getErrorMessage(err, "Tahrirlashda xatolik"));
    } finally {
      setEditSaving(false);
    }
  };

  // Delete (CEO only, instant hard delete)
  const handleDelete = async (commentId: string) => {
    try {
      await api.delete(`/comments/${commentId}`);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      setTotal((prev) => prev - 1);
      toast.success("Izoh o'chirildi");
      onCommentChange?.();
    } catch (err) {
      toast.error(getErrorMessage(err, "O'chirishda xatolik"));
    }
  };

  const handleAssigneeStatus = async (
    commentId: string,
    status: "SEEN" | "DONE",
  ) => {
    try {
      const { data } = await api.patch(
        `/comments/${commentId}/assignee-status`,
        { status },
      );
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId
            ? {
                ...c,
                assignees: c.assignees.map((a) =>
                  a.userId === user?.id
                    ? {
                        ...a,
                        status: data.status,
                        seenAt: data.seenAt,
                        doneAt: data.doneAt,
                      }
                    : a,
                ),
              }
            : c,
        ),
      );
      toast.success(
        status === "SEEN"
          ? "Ko'rildi deb belgilandi"
          : "Bajarildi deb belgilandi",
      );
    } catch (err) {
      toast.error(getErrorMessage(err, "Xatolik yuz berdi"));
    }
  };

  const totalPages = Math.ceil(total / pageSize);

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
        <p className="text-sm text-muted-foreground">
          Hozircha izohlar yo&apos;q
        </p>
        <p className="text-xs text-muted-foreground/60 mt-0.5">
          Birinchi izohni qoldiring
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 pb-2">
        <MessageSquare className="size-4 text-muted-foreground/60" />
        <span className="text-xs font-medium text-muted-foreground">
          {total} ta izoh
        </span>
      </div>

      <div className="max-h-125 overflow-y-auto space-y-0 pr-1">
        {allComments.map((comment, index) => (
          <div key={comment.id}>
            {index > 0 && <Separator className="my-0" />}
            <CommentItem
              comment={comment}
              currentUserId={user?.id}
              isCeo={isCeo}
              isEditing={editingId === comment.id}
              editContent={editContent}
              editSaving={editSaving}
              onEditContentChange={setEditContent}
              onStartEdit={startEdit}
              onCancelEdit={cancelEdit}
              onSaveEdit={saveEdit}
              onDelete={handleDelete}
              onAssigneeStatus={handleAssigneeStatus}
            />
          </div>
        ))}
      </div>

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
