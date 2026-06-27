"use client";

import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useLeadsBoard,
  type LeadCard,
  type LeadBoardSection,
} from "@/hooks/use-leads-board";
import { LeadColumn } from "./lead-column";
import { LeadCardOverlay } from "./lead-card";
import { SectionOverlay } from "./lead-section";

/**
 * Sections are BOTH droppable (lead targets) and live inside droppable columns,
 * so a naive collision would let a lead resolve to its column instead of the
 * section under the pointer. Restrict candidates by what is being dragged:
 * a lead only collides with sections; a section only with columns/sections.
 */
const collisionStrategy: CollisionDetection = (args) => {
  const activeType = args.active.data.current?.type;
  const containers =
    activeType === "lead"
      ? args.droppableContainers.filter(
          (c) => c.data.current?.type === "section",
        )
      : activeType === "section"
        ? args.droppableContainers.filter(
            (c) =>
              c.data.current?.type === "column" ||
              c.data.current?.type === "section",
          )
        : args.droppableContainers;
  return pointerWithin({ ...args, droppableContainers: containers });
};

export function LeadsBoard() {
  const board = useLeadsBoard((s) => s.board);
  const loading = useLeadsBoard((s) => s.loadingBoard);
  const leadsBySection = useLeadsBoard((s) => s.leadsBySection);
  const moveLead = useLeadsBoard((s) => s.moveLead);
  const moveSectionToColumn = useLeadsBoard((s) => s.moveSectionToColumn);

  const [activeLead, setActiveLead] = useState<LeadCard | null>(null);
  const [activeSection, setActiveSection] = useState<LeadBoardSection | null>(
    null,
  );

  // A small drag threshold so a click on a card still opens its detail.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current;
    if (data?.type === "section") {
      const section = board
        .flatMap((c) => c.sections)
        .find((s) => s.id === event.active.id);
      setActiveSection(section ?? null);
      return;
    }
    const sectionId = data?.sectionId as string | undefined;
    if (!sectionId) return;
    const lead = (leadsBySection[sectionId] ?? []).find(
      (l) => l.id === event.active.id,
    );
    setActiveLead(lead ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveLead(null);
    setActiveSection(null);
    const { active, over } = event;
    if (!over) return;
    const overData = over.data.current;

    // Section drag → move it to whichever column it was dropped on (a column
    // body directly, or another section whose column we resolve).
    if (active.data.current?.type === "section") {
      const fromColumnId = active.data.current?.columnId as string | undefined;
      const toColumnId =
        overData?.type === "column"
          ? (over.id as string)
          : overData?.type === "section"
            ? (overData.columnId as string | undefined)
            : undefined;
      if (!fromColumnId || !toColumnId || fromColumnId === toColumnId) return;
      moveSectionToColumn(active.id as string, fromColumnId, toColumnId);
      return;
    }

    // Lead drag → only lands on a section.
    if (overData?.type !== "section") return;
    const fromSectionId = active.data.current?.sectionId as string | undefined;
    const toSectionId = over.id as string;
    if (!fromSectionId || fromSectionId === toSectionId) return;
    moveLead(active.id as string, fromSectionId, toSectionId);
  }

  if (loading) {
    return (
      <div className="flex h-full gap-4 overflow-x-auto pb-4">
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
      collisionDetection={collisionStrategy}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex h-full gap-4 overflow-x-auto pb-4">
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
        {activeLead ? (
          <LeadCardOverlay lead={activeLead} />
        ) : activeSection ? (
          <SectionOverlay section={activeSection} />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
