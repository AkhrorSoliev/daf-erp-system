export type PortalType = "admin" | "lehrer" | "student";

interface PortalConfig {
  title: string;
  subtitle: string;
  footerText: string;
  icon: "shield" | "graduation-cap" | "book-open";
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
    allowedRoleIds: [], // hozircha hech kim
  },
};

export function getPortalType(host: string): PortalType {
  if (host.startsWith("lehrer.")) return "lehrer";
  if (host.startsWith("student.")) return "student";
  return "admin";
}

export function getPortalConfig(portal: PortalType): PortalConfig {
  return portalConfigs[portal];
}
