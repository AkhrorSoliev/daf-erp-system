"use client";

import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { LEAD_STAGES } from "@/data/lead-model";
import type { Lead, LeadStage } from "@/data/lead-model";
import { useLeadsBoard } from "@/hooks/use-leads-board";
import { LeadsColumn } from "./leads-column";
import { LeadCard } from "./lead-card";

export function LeadsBoard() {
  const { leads, moveLead, reorderLead } = useLeadsBoard();
  const [activeLead, setActiveLead] = useState<Lead | null>(null);
  const [collapsedColumns, setCollapsedColumns] = useState<Set<string>>(
    new Set()
  );

  function toggleColumn(stageId: string) {
    setCollapsedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(stageId)) {
        next.delete(stageId);
      } else {
        next.add(stageId);
      }
      return next;
    });
  }

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  function findStageId(id: string): LeadStage | null {
    // Check if it's a stage ID
    const stage = LEAD_STAGES.find((s) => s.id === id);
    if (stage) return stage.id;

    // Otherwise it's a lead ID — find which stage it belongs to
    const lead = leads.find((l) => l.id === id);
    return lead?.stage ?? null;
  }

  function handleDragStart(event: DragStartEvent) {
    const lead = leads.find((l) => l.id === event.active.id);
    setActiveLead(lead ?? null);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over || !activeLead) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const activeStage = activeLead.stage;
    const overStage = findStageId(overId);

    if (!overStage || activeStage === overStage) return;

    // Moving to a different column — find insert index
    const overStageLeads = leads.filter((l) => l.stage === overStage);
    const overLeadIndex = overStageLeads.findIndex((l) => l.id === overId);
    const insertIndex = overLeadIndex === -1 ? 0 : overLeadIndex;

    moveLead(activeId, overStage, insertIndex);

    // Update activeLead stage so subsequent dragOver calls use correct stage
    setActiveLead((prev) => (prev ? { ...prev, stage: overStage } : null));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveLead(null);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    if (activeId === overId) return;

    // If over a stage (empty column), move to top
    const isStage = LEAD_STAGES.some((s) => s.id === overId);
    if (isStage) {
      const lead = leads.find((l) => l.id === activeId);
      if (lead && lead.stage !== overId) {
        moveLead(activeId, overId as LeadStage, 0);
      }
      return;
    }

    // Reorder within the same column
    const activeLead2 = leads.find((l) => l.id === activeId);
    const overLead = leads.find((l) => l.id === overId);
    if (activeLead2 && overLead && activeLead2.stage === overLead.stage) {
      reorderLead(activeId, overId);
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {LEAD_STAGES.map((stage) => {
          const stageLeads = leads.filter((l) => l.stage === stage.id);
          return (
            <LeadsColumn
              key={stage.id}
              stage={stage}
              leads={stageLeads}
              collapsed={collapsedColumns.has(stage.id)}
              onToggle={() => toggleColumn(stage.id)}
            />
          );
        })}
      </div>

      <DragOverlay>
        {activeLead ? <LeadCard lead={activeLead} isOverlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}
