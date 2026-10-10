"use client";

import {
  Check,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  RelativeTime,
  SendStatus,
  type CommentData,
} from "./comment-list-helpers";

interface CommentItemProps {
  comment: CommentData;
  currentUserId: number | undefined;
  canModerate: boolean;
  isEditing: boolean;
  editContent: string;
  editSaving: boolean;
  onEditContentChange: (next: string) => void;
  onStartEdit: (comment: CommentData) => void;
  onCancelEdit: () => void;
  onSaveEdit: (commentId: string) => void;
  onDelete: (commentId: string) => void;
}

export function CommentItem({
  comment,
  currentUserId,
  canModerate,
  isEditing,
  editContent,
  editSaving,
  onEditContentChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
}: CommentItemProps) {
  const isAuthor = comment.author?.id === currentUserId;
  const isSystemComment = comment.isSystem;
  const canEdit = (isAuthor || canModerate) && !comment._pending && !isSystemComment;

  return (
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
            {comment.author?.photo && (
              <AvatarImage src={comment.author.photo} />
            )}
            <AvatarFallback className="text-[10px] font-medium">
              {`${comment.author?.firstName?.[0] ?? ""}${comment.author?.lastName?.[0] ?? ""}`}
            </AvatarFallback>
          </Avatar>
        )}

        {/* Body */}
        <div className="min-w-0 flex-1 space-y-1">
          {/* Author line */}
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold leading-none">
              {comment.author
                ? `${comment.author.firstName} ${comment.author.lastName}`
                : "Tizim"}
            </span>
            <RelativeTime date={comment.createdAt} />
            <SendStatus pending={comment._pending} failed={comment._failed} />

            {canEdit && !isEditing && (
              <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-6">
                      <MoreHorizontal className="size-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-36">
                    <DropdownMenuItem onClick={() => onStartEdit(comment)}>
                      <Pencil className="mr-2 size-3.5" />
                      Tahrirlash
                    </DropdownMenuItem>
                    {canModerate && (
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => onDelete(comment.id)}
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
                onChange={(e) => onEditContentChange(e.target.value)}
                rows={3}
                className="resize-none text-sm"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    onSaveEdit(comment.id);
                  }
                  if (e.key === "Escape") onCancelEdit();
                }}
              />
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="h-7 text-xs px-3"
                  onClick={() => onSaveEdit(comment.id)}
                  disabled={!editContent.trim() || editSaving}
                >
                  <Check className="mr-1 size-3" />
                  {editSaving ? "..." : "Saqlash"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={onCancelEdit}
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
            <p
              className={`text-[13px] leading-relaxed whitespace-pre-wrap pr-4 ${
                isSystemComment
                  ? "text-muted-foreground italic"
                  : "text-foreground/90"
              }`}
            >
              {comment.content}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
