import { create } from "zustand";
import type { Lead } from "@/data/lead-model";

interface AddStudentFromLeadState {
  open: boolean;
  lead: Lead | null;
  openDrawer: (lead: Lead) => void;
  closeDrawer: () => void;
}

export const useAddStudentFromLead = create<AddStudentFromLeadState>(
  (set) => ({
    open: false,
    lead: null,
    openDrawer: (lead) => set({ open: true, lead }),
    closeDrawer: () => set({ open: false, lead: null }),
  })
);
