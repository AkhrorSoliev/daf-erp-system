import { StudentStatus } from '@prisma/client';

/** Uzbek labels for a departed student's status. ACTIVE here means "active but groupless". */
export const DEPARTED_STATUS_LABELS: Record<StudentStatus, string> = {
  ACTIVE: 'Faol (guruhsiz)',
  FROZEN: 'Muzlatilgan',
  EXPELLED: 'Chetlatilgan',
  INACTIVE: 'Nofaol',
  GRADUATED: 'Bitirgan',
  ARCHIVED: 'Arxivlangan',
  PROSPECT: 'Mock orqali kelgan',
};
