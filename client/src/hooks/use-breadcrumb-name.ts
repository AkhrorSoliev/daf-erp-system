import { create } from "zustand";

interface BreadcrumbNameState {
  names: Record<string, string>;
  setName: (segment: string, name: string) => void;
  clear: () => void;
}

/**
 * Dynamic segment uchun breadcrumb nomi saqlash.
 * Masalan: "/settings/branches/1001" da "1001" o'rniga "Asosiy filial" ko'rsatish.
 *
 * Sahifa componentida: useBreadcrumbName().setName("1001", "Asosiy filial")
 * AppBreadcrumb da: useBreadcrumbName().names["1001"] ?? fallback
 */
export const useBreadcrumbName = create<BreadcrumbNameState>((set) => ({
  names: {},
  setName: (segment, name) =>
    set((state) => ({ names: { ...state.names, [segment]: name } })),
  clear: () => set({ names: {} }),
}));
