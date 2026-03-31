"use client";

import { useCallback, useRef, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EntityHistoryTable } from "@/components/shared/entity-history-table";
import { CommentList, type CommentData } from "@/components/shared/comment-list";
import { CommentForm } from "@/components/shared/comment-form";
import type { EmployeeUser } from "@/hooks/use-edit-employee";

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-24 items-center justify-center rounded-md border">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

interface EmployeeProfileTabsProps {
  employee: EmployeeUser;
  onCommentChange?: () => void;
}

export function EmployeeProfileTabs({ employee, onCommentChange }: EmployeeProfileTabsProps) {
  const [historyVisible, setHistoryVisible] = useState(false);
  const [commentsVisible, setCommentsVisible] = useState(false);
  const [optimisticComments, setOptimisticComments] = useState<CommentData[]>([]);
  const historyShown = useRef(false);
  const commentsShown = useRef(false);

  const handleOptimisticAdd = useCallback((comment: CommentData) => {
    setOptimisticComments((prev) => [comment, ...prev]);
  }, []);

  const handleConfirmed = useCallback((tempId: string) => {
    setOptimisticComments((prev) => prev.filter((c) => c.id !== tempId));
    onCommentChange?.();
  }, [onCommentChange]);

  const handleFailed = useCallback((tempId: string) => {
    setOptimisticComments((prev) =>
      prev.map((c) => (c.id === tempId ? { ...c, _pending: false, _failed: true } : c)),
    );
  }, []);

  const handleTabChange = (value: string) => {
    if (value === "tarix" && !historyShown.current) {
      historyShown.current = true;
      setHistoryVisible(true);
    }
    if (value === "izohlar" && !commentsShown.current) {
      commentsShown.current = true;
      setCommentsVisible(true);
    }
  };

  return (
    <Tabs defaultValue="izohlar" className="w-full" onValueChange={handleTabChange}>
      <TabsList className="w-full justify-start overflow-x-auto">
        <TabsTrigger value="izohlar">Izohlar</TabsTrigger>
        <TabsTrigger value="tarix">Tarix</TabsTrigger>
      </TabsList>

      {/* Izohlar */}
      <TabsContent value="izohlar">
        {commentsVisible ? (
          <div className="space-y-4">
            <CommentForm
              entityType="User"
              entityId={employee.id}
              onOptimisticAdd={handleOptimisticAdd}
              onConfirmed={handleConfirmed}
              onFailed={handleFailed}
            />
            <CommentList
              entityType="User"
              entityId={employee.id}
              optimisticComments={optimisticComments}
              onCommentChange={onCommentChange}
            />
          </div>
        ) : (
          <EmptyState message="Izohlar mavjud emas" />
        )}
      </TabsContent>

      {/* Tarix */}
      <TabsContent value="tarix">
        {historyVisible ? (
          <EntityHistoryTable entityType="User" entityId={employee.id} />
        ) : (
          <EmptyState message="Tarix mavjud emas" />
        )}
      </TabsContent>
    </Tabs>
  );
}
