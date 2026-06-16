/**
 * Response shapes from the existing /api/student-portal/* endpoints.
 * Mirror of server DTOs; extend per phase as screens are built.
 */
export type ProfileGroup = {
  id: string;
  name: string;
  courseName: string;
  exactDays: string[];
  lessonStartTime?: string | null;
  lessonEndTime?: string | null;
};

export type Profile = {
  id: number;
  firstName: string;
  lastName: string;
  phone: string;
  photo?: string | null;
  balance: number;
  groups: ProfileGroup[];
};
