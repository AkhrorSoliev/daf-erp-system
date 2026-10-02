export type PortalType =
  | "admin"
  | "lehrer"
  | "student"
  | "invoice"
  | "form";

interface PortalConfig {
  /** The heading of the portal's sign-in sheet (`DaftarSheet`). */
  title: string;
  allowedRoleIds: number[];
}

const portalConfigs: Record<PortalType, PortalConfig> = {
  admin: {
    title: "Boshqaruv",
    allowedRoleIds: [1, 2, 3, 5], // CEO, Branch Director, Administrator, Cashier
  },
  lehrer: {
    title: "O'qituvchi",
    allowedRoleIds: [4], // Teacher
  },
  student: {
    title: "Talaba portali",
    allowedRoleIds: [6], // Student
  },
  // Public document portal — no login, no role checks. Receipt verification
  // pages live here so QR scans and Telegram receipt links open directly
  // without an auth wall.
  invoice: {
    title: "DaF Sprachzentrum hujjatlari",
    allowedRoleIds: [],
  },
  // Public form portal — `form.dafzentrum.uz/<slug>` lets anyone fill out
  // a custom lead-collection form. No auth, no roles.
  form: {
    title: "DaF Sprachzentrum formalari",
    allowedRoleIds: [],
  },
};

export function getPortalType(host: string): PortalType {
  if (host.startsWith("invoice.")) return "invoice";
  if (host.startsWith("form.")) return "form";
  if (host.startsWith("lehrer.")) return "lehrer";
  if (host.startsWith("student.")) return "student";
  return "admin";
}

export function getPortalConfig(portal: PortalType): PortalConfig {
  return portalConfigs[portal];
}

/**
 * Scope classes of the staff sign-in theme (`.daftar` in globals.css): squared
 * paper and navy ink by default, ruled paper and green ink on the teacher
 * portal. One source for the page shell and for content Radix portals to
 * <body>, which no class on the page reaches.
 */
export function daftarScope(portal: PortalType): string {
  return portal === "lehrer" ? "daftar daftar-lines" : "daftar";
}

// True for portals that have no login wall — every path is public.
export function isPublicPortal(portal: PortalType): boolean {
  return portal === "invoice" || portal === "form";
}
