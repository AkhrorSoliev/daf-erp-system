"use client";

import {
  Check,
  CircleCheck,
  CircleDot,
  ListTodo,
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
  AssigneeChip,
  RelativeTime,
  SendStatus,
  type CommentData,
} from "./comment-list-helpers";

interface CommentItemProps {
  comment: CommentData;
  currentUserId: number | undefined;
  isCeo: boolean;
  isEditing: boolean;
  editContent: string;
  editSaving: boolean;
  onEditContentChange: (next: string) => void;
  onStartEdit: (comment: CommentData) => void;
  onCancelEdit: () => void;
  onSaveEdit: (commentId: string) => void;
  onDelete: (commentId: string) => void;
  onAssigneeStatus: (commentId: string, status: "SEEN" | "DONE") => void;
}

export function CommentItem({
  comment,
  currentUserId,
  isCeo,
  isEditing,
  editContent,
  editSaving,
  onEditContentChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onAssigneeStatus,
}: CommentItemProps) {
  const isAuthor = comment.author.id === currentUserId;
  const isSystemComment = comment.isSystem;
  const canEdit = (isAuthor || isCeo) && !comment._pending && !isSystemComment;
  const myAssignee = comment.assignees.find((a) => a.userId === currentUserId);
  const allDone =
    comment.isTask &&
    comment.assignees.length > 0 &&
    comment.assignees.every((a) => a.status === "DONE");

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
            {comment.author.photo && (
              <AvatarImage src={comment.author.photo} />
            )}
            <AvatarFallback className="text-[10px] font-medium">
              {`${comment.author.firstName?.[0] ?? ""}${comment.author.lastName?.[0] ?? ""}`}
            </AvatarFallback>
          </Avatar>
        )}

        {/* Body */}
        <div className="min-w-0 flex-1 space-y-1">
          {/* Author line */}
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold leading-none">
              {comment.author.firstName} {comment.author.lastName}
            </span>
            <RelativeTime date={comment.createdAt} />
            <SendStatus pending={comment._pending} failed={comment._failed} />

            {comment.isTask && (
              <span
                className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  allDone
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                    : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                }`}
              >
                <ListTodo className="size-2.5" />
                {allDone ? "Bajarildi" : "Topshiriq"}
              </span>
            )}

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
                    {isCeo && (
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
                  onClick={() => onAssigneeStatus(comment.id, "SEEN")}
                >
                  <CircleDot className="size-3" />
                  Ko&apos;rdim
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1 rounded-full border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                onClick={() => onAssigneeStatus(comment.id, "DONE")}
              >
                <CircleCheck className="size-3" />
                Bajarildi
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
