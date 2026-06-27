"use client";

import { useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useLeadsBoard,
  type LeadBoardColumn,
  type LeadCard,
  type LeadBoardSection,
} from "@/hooks/use-leads-board";
import { LeadColumn } from "./lead-column";
import { LeadCardOverlay } from "./lead-card";
import { SectionOverlay } from "./lead-section";

/** Which section currently holds a lead, in local state. */
function findLeadSection(
  leadsBySection: Record<string, LeadCard[]>,
  leadId: UniqueIdentifier,
): string | undefined {
  return Object.keys(leadsBySection).find((sid) =>
    leadsBySection[sid].some((l) => l.id === leadId),
  );
}

/** Which column currently holds a section, in local state. */
function findSectionColumn(
  board: LeadBoardColumn[],
  sectionId: UniqueIdentifier,
): string | undefined {
  return board.find((c) => c.sections.some((s) => s.id === sectionId))?.id;
}

/**
 * Type-aware sortable collision: a dragged lead only collides with lead cards
 * and section lead-drop zones; a dragged section only with section items and
 * column bodies. A precise item hit (for an exact insert index) wins over its
 * container. pointerWithin first, closestCenter as a fast-drag fallback.
 */
const collisionStrategy: CollisionDetection = (args) => {
  const activeType = args.active.data.current?.type as string | undefined;
  const filtered = args.droppableContainers.filter((c) => {
    const t = c.data.current?.type;
    if (activeType === "lead") return t === "lead" || t === "lead-drop";
    if (activeType === "section") return t === "section" || t === "column";
    return true;
  });
  const pointer = pointerWithin({ ...args, droppableContainers: filtered });
  const collisions = pointer.length
    ? pointer
    : closestCenter({ ...args, droppableContainers: filtered });
  const itemType = activeType === "lead" ? "lead" : "section";
  const itemHit = collisions.find(
    (col) =>
      filtered.find((c) => c.id === col.id)?.data.current?.type === itemType,
  );
  return itemHit ? [itemHit] : collisions;
};

export function LeadsBoard() {
  const board = useLeadsBoard((s) => s.board);
  const loading = useLeadsBoard((s) => s.loadingBoard);
  const leadsBySection = useLeadsBoard((s) => s.leadsBySection);
  const captureDragSnapshot = useLeadsBoard((s) => s.captureDragSnapshot);
  const clearDragSnapshot = useLeadsBoard((s) => s.clearDragSnapshot);
  const rollbackDrag = useLeadsBoard((s) => s.rollbackDrag);
  const moveLeadLocal = useLeadsBoard((s) => s.moveLeadLocal);
  const moveSectionLocal = useLeadsBoard((s) => s.moveSectionLocal);
  const setLeadsForSection = useLeadsBoard((s) => s.setLeadsForSection);
  const setSectionsForColumn = useLeadsBoard((s) => s.setSectionsForColumn);
  const persistLeadReorder = useLeadsBoard((s) => s.persistLeadReorder);
  const persistLeadMove = useLeadsBoard((s) => s.persistLeadMove);
  const persistSectionReorder = useLeadsBoard((s) => s.persistSectionReorder);
  const persistSectionMove = useLeadsBoard((s) => s.persistSectionMove);

  const [activeLead, setActiveLead] = useState<LeadCard | null>(null);
  const [activeSection, setActiveSection] = useState<LeadBoardSection | null>(
    null,
  );
  // The lead's current target section during a drag — used as a fallback on
  // drop when the target is collapsed (the card isn't in any loaded array).
  const overSectionRef = useRef<string | null>(null);

  // Which columns are collapsed to a narrow strip (transient, per-session).
  const [collapsedColumns, setCollapsedColumns] = useState<Set<string>>(
    () => new Set(),
  );

  function toggleColumnCollapse(columnId: string) {
    setCollapsedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(columnId)) next.delete(columnId);
      else next.add(columnId);
      return next;
    });
  }

  const sensors = useSensors(
    // A small drag threshold so a click on a card still opens its detail.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current;
    captureDragSnapshot();
    overSectionRef.current = null;
    if (data?.type === "section") {
      const section = board
        .flatMap((c) => c.sections)
        .find((s) => s.id === event.active.id);
      setActiveSection(section ?? null);
    } else if (data?.type === "lead") {
      const sid = data.sectionId as string;
      const lead = (leadsBySection[sid] ?? []).find(
        (l) => l.id === event.active.id,
      );
      setActiveLead(lead ?? null);
    }
  }

  // Live cross-container reflow: move the dragged item between containers in
  // LOCAL state (no API) so the destination slides to make room. Same-container
  // reordering is handled visually by SortableContext and finalized on drop.
  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeType = active.data.current?.type;
    const state = useLeadsBoard.getState();
    const overData = over.data.current;

    if (activeType === "lead") {
      const activeId = active.id as string;
      const fromSectionId = findLeadSection(state.leadsBySection, activeId);
      if (!fromSectionId) return;
      let toSectionId: string | undefined;
      let overIndex = -1;
      if (overData?.type === "lead") {
        toSectionId = findLeadSection(state.leadsBySection, over.id);
        if (toSectionId)
          overIndex = state.leadsBySection[toSectionId].findIndex(
            (l) => l.id === over.id,
          );
      } else if (overData?.type === "lead-drop") {
        toSectionId = overData.sectionId as string;
      }
      if (!toSectionId) return;
      overSectionRef.current = toSectionId;
      if (toSectionId === fromSectionId) return;
      const toLeads = state.leadsBySection[toSectionId];
      const toIndex = overIndex >= 0 ? overIndex : (toLeads?.length ?? 0);
      moveLeadLocal({ leadId: activeId, fromSectionId, toSectionId, toIndex });
      return;
    }

    if (activeType === "section") {
      const activeId = active.id as string;
      const fromColumnId = findSectionColumn(state.board, activeId);
      if (!fromColumnId) return;
      let toColumnId: string | undefined;
      let overIndex = -1;
      if (overData?.type === "section") {
        toColumnId = overData.columnId as string;
        const col = state.board.find((c) => c.id === toColumnId);
        overIndex = col ? col.sections.findIndex((s) => s.id === over.id) : -1;
      } else if (overData?.type === "column") {
        toColumnId = over.id as string;
      }
      if (!toColumnId || toColumnId === fromColumnId) return;
      const toCol = state.board.find((c) => c.id === toColumnId);
      const toIndex = overIndex >= 0 ? overIndex : (toCol?.sections.length ?? 0);
      moveSectionLocal({ sectionId: activeId, fromColumnId, toColumnId, toIndex });
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    const activeType = active.data.current?.type;
    setActiveLead(null);
    setActiveSection(null);

    if (!over) {
      overSectionRef.current = null;
      rollbackDrag();
      return;
    }

    const state = useLeadsBoard.getState();
    const snapshot = state.dragSnapshot;

    if (activeType === "lead") {
      const activeId = active.id as string;
      const original = snapshot
        ? findLeadSection(snapshot.leadsBySection, activeId)
        : undefined;
      const current =
        findLeadSection(state.leadsBySection, activeId) ??
        overSectionRef.current ??
        undefined;
      overSectionRef.current = null;
      if (!current) {
        rollbackDrag();
        return;
      }

      // Collapsed target: card isn't in a loaded array → append on the server.
      if (!state.leadsBySection[current]) {
        persistLeadMove({ leadId: activeId, toSectionId: current, toLeadIds: [] });
        return;
      }

      const arr = state.leadsBySection[current];
      const ids = arr.map((l) => l.id);
      const oldIndex = ids.indexOf(activeId);
      let newIndex = ids.length - 1;
      if (over.data.current?.type === "lead") {
        const overSec = findLeadSection(state.leadsBySection, over.id);
        if (overSec === current) newIndex = ids.indexOf(over.id as string);
      }
      if (newIndex < 0) newIndex = oldIndex;
      const finalLeads =
        oldIndex !== newIndex ? arrayMove(arr, oldIndex, newIndex) : arr;
      if (oldIndex !== newIndex) setLeadsForSection(current, finalLeads);
      const toLeadIds = finalLeads.map((l) => l.id);

      if (current === original) {
        if (oldIndex !== newIndex) persistLeadReorder(current, toLeadIds);
        else clearDragSnapshot();
      } else {
        persistLeadMove({ leadId: activeId, toSectionId: current, toLeadIds });
      }
      return;
    }

    if (activeType === "section") {
      const activeId = active.id as string;
      const original = snapshot
        ? findSectionColumn(snapshot.board, activeId)
        : undefined;
      const current = findSectionColumn(state.board, activeId);
      if (!current) {
        rollbackDrag();
        return;
      }

      const col = state.board.find((c) => c.id === current)!;
      const ids = col.sections.map((s) => s.id);
      const oldIndex = ids.indexOf(activeId);
      let newIndex = ids.length - 1;
      if (over.data.current?.type === "section") {
        const overCol = findSectionColumn(state.board, over.id);
        if (overCol === current) newIndex = ids.indexOf(over.id as string);
      }
      if (newIndex < 0) newIndex = oldIndex;
      const finalSections =
        oldIndex !== newIndex
          ? arrayMove(col.sections, oldIndex, newIndex)
          : col.sections;
      if (oldIndex !== newIndex) setSectionsForColumn(current, finalSections);
      const toSectionIds = finalSections.map((s) => s.id);

      if (current === original) {
        if (oldIndex !== newIndex) persistSectionReorder(current, toSectionIds);
        else clearDragSnapshot();
      } else {
        persistSectionMove({
          sectionId: activeId,
          toColumnId: current,
          toSectionIds,
        });
      }
      return;
    }

    clearDragSnapshot();
  }

  function handleDragCancel() {
    setActiveLead(null);
    setActiveSection(null);
    overSectionRef.current = null;
    rollbackDrag();
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
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex h-full gap-4 overflow-x-auto pb-4">
        {board.map((column) => {
          const customIdx = customColumns.findIndex((c) => c.id === column.id);
          return (
            <LeadColumn
              key={column.id}
              column={column}
              canMoveLeft={customIdx > 0}
              canMoveRight={
                customIdx >= 0 && customIdx < customColumns.length - 1
              }
              collapsed={collapsedColumns.has(column.id)}
              onToggleCollapse={() => toggleColumnCollapse(column.id)}
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
