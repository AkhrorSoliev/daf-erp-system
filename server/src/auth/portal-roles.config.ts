/**
 * Portal → allowed role IDs mapping
 *
 * admin.dafzentrum.uz  → CEO (1), Branch Director (2), Administrator (3), Cashier (5)
 * lehrer.dafzentrum.uz → Teacher (4)
 * student.dafzentrum.uz → hozircha hech kim (Student auth alohida implement qilinadi)
 */
const PORTAL_ROLES: Record<string, number[]> = {
  'admin.dafzentrum.uz': [1, 2, 3, 5],
  'lehrer.dafzentrum.uz': [4],
  'student.dafzentrum.uz': [],
};

/**
 * Origin headerdan allowed role ID larni aniqlaydi.
 * @returns number[] — faqat shu role'lar kirishi mumkin, null — cheklov yo'q (dev mode)
 */
export function getAllowedRoleIds(origin: string | undefined): number[] | null {
  if (!origin) return null;

  try {
    const { hostname } = new URL(origin);

    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return null;
    }

    return PORTAL_ROLES[hostname] ?? null;
  } catch {
    return null;
  }
}
