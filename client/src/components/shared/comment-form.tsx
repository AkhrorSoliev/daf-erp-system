"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Send, ListTodo, X, CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useAuth } from "@/hooks/use-auth";
import type { CommentData } from "./comment-list";

interface AssignableUser {
  id: number;
  firstName: string;
  lastName: string;
  photo: string | null;
}

interface CommentFormProps {
  entityType: string;
  entityId: string | number;
  onOptimisticAdd?: (comment: CommentData) => void;
  onConfirmed?: (tempId: string, real: CommentData) => void;
  onFailed?: (tempId: string) => void;
  focusKey?: number;
}

export function CommentForm({
  entityType,
  entityId,
  onOptimisticAdd,
  onConfirmed,
  onFailed,
  focusKey,
}: CommentFormProps) {
  const user = useAuth((s) => s.user);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [content, setContent] = useState("");
  const [isTask, setIsTask] = useState(false);
  const [assigneeIds, setAssigneeIds] = useState<number[]>([]);
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
  const [priority, setPriority] = useState<string>("");
  const [assignableUsers, setAssignableUsers] = useState<AssignableUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [focused, setFocused] = useState(false);

  const canAssignTask = user?.roles.some((r) => [1, 2].includes(r.id)) ?? false;

  useEffect(() => {
    if (focusKey && focusKey > 0) {
      setTimeout(() => {
        textareaRef.current?.focus();
        setFocused(true);
      }, 100);
    }
  }, [focusKey]);

  // Fetch assignable users on mount (not on task toggle)
  const fetchAssignableUsers = useCallback(async () => {
    if (!canAssignTask) return;
    setUsersLoading(true);
    try {
      const { data } = await api.get("/users", {
        params: {
          user_type: "Branch Director,Administrator",
          pageSize: 100,
          active_only: true,
        },
      });
      const users: AssignableUser[] = (data.data || []).map((u: any) => ({
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        photo: u.photo ?? null,
      }));
      setAssignableUsers(users.filter((u) => u.id !== user?.id));
    } catch {
      setAssignableUsers([]);
    } finally {
      setUsersLoading(false);
    }
  }, [canAssignTask, user?.id]);

  useEffect(() => {
    fetchAssignableUsers();
  }, [fetchAssignableUsers]);

  const toggleAssignee = (id: number) => {
    setAssigneeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleSubmit = async () => {
    if (!content.trim() || submitting) return;

    const tempId = `temp-${Date.now()}`;
    const trimmedContent = content.trim();
    const taskMode = canAssignTask ? isTask : false;
    const selectedIds = canAssignTask && taskMode ? [...assigneeIds] : [];

    // Optimistic
    const optimistic: CommentData = {
      id: tempId,
      entityType,
      entityId: String(entityId),
      content: trimmedContent,
      isTask: taskMode,
      author: {
        id: user?.id ?? 0,
        firstName: user?.firstName ?? "",
        lastName: user?.lastName ?? "",
        photo: user?.photo ?? null,
      },
      assignees: [],
      createdAt: new Date().toISOString(),
      _pending: true,
    };
    onOptimisticAdd?.(optimistic);

    setContent("");
    setIsTask(false);
    setAssigneeIds([]);
    setDueDate(undefined);
    setPriority("");
    setFocused(false);

    setSubmitting(true);
    try {
      const payload: Record<string, any> = {
        entityType,
        entityId: String(entityId),
        content: trimmedContent,
        isTask: taskMode,
      };
      if (selectedIds.length > 0) payload.assigneeIds = selectedIds;
      if (taskMode && dueDate) payload.dueDate = dueDate.toISOString();
      if (taskMode && priority) payload.priority = priority;
      const { data } = await api.post("/comments", payload);
      onConfirmed?.(tempId, data);
    } catch (err) {
      onFailed?.(tempId);
      toast.error(getErrorMessage(err, "Saqlashda xatolik"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const isExpanded = focused || content.trim().length > 0;

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="p-3">
        <Textarea
          ref={textareaRef}
          placeholder="Izoh yozing..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={handleKeyDown}
          rows={isExpanded ? 3 : 1}
          className="resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 text-sm placeholder:text-muted-foreground/60 p-2"
        />
      </div>

      {isExpanded && (
        <div className="border-t px-3 py-2 space-y-2.5">
          {/* Toolbar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {canAssignTask && (
                <div className="flex items-center gap-1.5">
                  <Switch
                    id="task-toggle"
                    checked={isTask}
                    onCheckedChange={setIsTask}
                    className="scale-90"
                  />
                  <Label
                    htmlFor="task-toggle"
                    className="text-xs cursor-pointer text-muted-foreground"
                  >
                    <ListTodo className="mr-0.5 inline size-3" />
                    Topshiriq
                  </Label>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground/50 hidden sm:inline">
                Ctrl+Enter
              </span>
              <Button
                size="sm"
                className="h-7 text-xs px-3"
                onClick={handleSubmit}
                disabled={
                  !content.trim() ||
                  submitting ||
                  (isTask && assigneeIds.length === 0)
                }
              >
                <Send className="mr-1 size-3" />
                {submitting ? "..." : "Yuborish"}
              </Button>
            </div>
          </div>

          {/* Task options: dueDate + priority */}
          {canAssignTask && isTask && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <CalendarIcon className="size-3 text-muted-foreground" />
                <DatePicker
                  value={dueDate}
                  onChange={setDueDate}
                  placeholder="Muddat"
                  className="h-7 text-xs w-36"
                />
              </div>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="h-7 text-xs w-32">
                  <SelectValue placeholder="Ustuvorlik" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">Oddiy</SelectItem>
                  <SelectItem value="MEDIUM">O&apos;rta</SelectItem>
                  <SelectItem value="HIGH">Yuqori</SelectItem>
                  <SelectItem value="URGENT">Shoshilinch</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Assignee picker — inline chips */}
          {canAssignTask && isTask && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium text-muted-foreground">
                Kimga topshiriq berilsin?
              </p>
              {usersLoading ? (
                <div className="flex gap-2">
                  <Skeleton className="h-8 w-28 rounded-full" />
                  <Skeleton className="h-8 w-24 rounded-full" />
                  <Skeleton className="h-8 w-32 rounded-full" />
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {assignableUsers.map((u) => {
                    const selected = assigneeIds.includes(u.id);
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => toggleAssignee(u.id)}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all ${
                          selected
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"
                        }`}
                      >
                        <Avatar className="size-4">
                          {u.photo && <AvatarImage src={u.photo} />}
                          <AvatarFallback className="text-[8px]">
                            {`${u.firstName?.[0] ?? ""}${u.lastName?.[0] ?? ""}`}
                          </AvatarFallback>
                        </Avatar>
                        {u.firstName} {u.lastName}
                        {selected && <X className="size-3 ml-0.5" />}
                      </button>
                    );
                  })}
                  {assignableUsers.length === 0 && !usersLoading && (
                    <p className="text-xs text-muted-foreground">
                      Topshiriq berish mumkin bo&apos;lgan xodimlar topilmadi
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
