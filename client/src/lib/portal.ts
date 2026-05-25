export type PortalType =
  | "admin"
  | "lehrer"
  | "student"
  | "invoice"
  | "form";

interface PortalConfig {
  title: string;
  subtitle: string;
  footerText: string;
  icon: "shield" | "graduation-cap" | "book-open" | "file-text";
  allowedRoleIds: number[];
}

const portalConfigs: Record<PortalType, PortalConfig> = {
  admin: {
    title: "DaF Sprachzentrum",
    subtitle: "Hisobingizga kiring",
    footerText: "DaF Sprachzentrum. Barcha huquqlar himoyalangan.",
    icon: "shield",
    allowedRoleIds: [1, 2, 3, 5], // CEO, Branch Director, Administrator, Cashier
  },
  lehrer: {
    title: "O'qituvchi portali",
    subtitle: "O'qituvchi hisobingizga kiring",
    footerText:
      "DaF Sprachzentrum — O'qituvchi portali. Barcha huquqlar himoyalangan.",
    icon: "graduation-cap",
    allowedRoleIds: [4], // Teacher
  },
  student: {
    title: "Talaba portali",
    subtitle: "Talaba hisobingizga kiring",
    footerText:
      "DaF Sprachzentrum — Talaba portali. Barcha huquqlar himoyalangan.",
    icon: "book-open",
    allowedRoleIds: [6], // Student
  },
  // Public document portal — no login, no role checks. Receipt verification
  // pages live here so QR scans and Telegram receipt links open directly
  // without an auth wall.
  invoice: {
    title: "DaF Sprachzentrum hujjatlari",
    subtitle: "Hujjatni tekshirish",
    footerText: "DaF Sprachzentrum — Hujjatlarni tekshirish portali.",
    icon: "file-text",
    allowedRoleIds: [],
  },
  // Public form portal — `form.dafzentrum.uz/<slug>` lets anyone fill out
  // a custom lead-collection form. No auth, no roles.
  form: {
    title: "DaF Sprachzentrum formalari",
    subtitle: "",
    footerText: "DaF Sprachzentrum — Public formalar portali.",
    icon: "file-text",
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

// True for portals that have no login wall — every path is public.
export function isPublicPortal(portal: PortalType): boolean {
  return portal === "invoice" || portal === "form";
}
