import { create } from "zustand";
import type { Lead, LeadStage } from "@/data/lead-model";
import { leads as initialLeads } from "@/data/lead-model";

interface LeadsBoardState {
  leads: Lead[];
  moveLead: (leadId: string, toStage: LeadStage, toIndex?: number) => void;
  reorderLead: (leadId: string, overLeadId: string) => void;
}

export const useLeadsBoard = create<LeadsBoardState>((set) => ({
  leads: initialLeads,

  moveLead: (leadId, toStage, toIndex = 0) =>
    set((state) => {
      const lead = state.leads.find((l) => l.id === leadId);
      if (!lead || lead.stage === toStage) return state;

      // Remove from current position
      const without = state.leads.filter((l) => l.id !== leadId);
      const updated = { ...lead, stage: toStage };

      // Find insert position among leads in target stage
      const stageLeads = without.filter((l) => l.stage === toStage);
      const clampedIndex = Math.min(toIndex, stageLeads.length);

      // Find the global index to insert at
      let globalIndex: number;
      if (stageLeads.length === 0 || clampedIndex >= stageLeads.length) {
        // Insert after the last lead in this stage, or at end if no leads
        const lastInStage = stageLeads[stageLeads.length - 1];
        globalIndex = lastInStage
          ? without.indexOf(lastInStage) + 1
          : without.length;
      } else {
        globalIndex = without.indexOf(stageLeads[clampedIndex]);
      }

      const newLeads = [...without];
      newLeads.splice(globalIndex, 0, updated);
      return { leads: newLeads };
    }),

  reorderLead: (leadId, overLeadId) =>
    set((state) => {
      const leadIndex = state.leads.findIndex((l) => l.id === leadId);
      const overIndex = state.leads.findIndex((l) => l.id === overLeadId);
      if (leadIndex === -1 || overIndex === -1 || leadIndex === overIndex)
        return state;

      const newLeads = [...state.leads];
      const [moved] = newLeads.splice(leadIndex, 1);
      newLeads.splice(overIndex, 0, moved);
      return { leads: newLeads };
    }),
}));
