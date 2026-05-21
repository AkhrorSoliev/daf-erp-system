"use client";

import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Skeleton } from "@/components/ui/skeleton";
import { useLeadsBoard, type LeadCard } from "@/hooks/use-leads-board";
import { LeadColumn } from "./lead-column";
import { LeadCardOverlay } from "./lead-card";

export function LeadsBoard() {
  const board = useLeadsBoard((s) => s.board);
  const loading = useLeadsBoard((s) => s.loadingBoard);
  const leadsBySection = useLeadsBoard((s) => s.leadsBySection);
  const moveLead = useLeadsBoard((s) => s.moveLead);

  const [activeLead, setActiveLead] = useState<LeadCard | null>(null);

  // A small drag threshold so a click on a card still opens its detail.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  function handleDragStart(event: DragStartEvent) {
    const sectionId = event.active.data.current?.sectionId as
      | string
      | undefined;
    if (!sectionId) return;
    const lead = (leadsBySection[sectionId] ?? []).find(
      (l) => l.id === event.active.id,
    );
    setActiveLead(lead ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveLead(null);
    const { active, over } = event;
    if (!over) return;
    const fromSectionId = active.data.current?.sectionId as string | undefined;
    const toSectionId = over.id as string;
    if (!fromSectionId || fromSectionId === toSectionId) return;
    moveLead(active.id as string, fromSectionId, toSectionId);
  }

  if (loading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="flex w-80 min-w-80 shrink-0 flex-col gap-3 rounded-lg border bg-muted/30 p-3"
          >
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
          </div>
        ))}
      </div>
    );
  }

  const customColumns = board.filter((c) => !c.isSystem);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {board.map((column) => {
          const customIdx = customColumns.findIndex(
            (c) => c.id === column.id,
          );
          return (
            <LeadColumn
              key={column.id}
              column={column}
              canMoveLeft={customIdx > 0}
              canMoveRight={
                customIdx >= 0 && customIdx < customColumns.length - 1
              }
            />
          );
        })}
      </div>

      <DragOverlay>
        {activeLead ? <LeadCardOverlay lead={activeLead} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
