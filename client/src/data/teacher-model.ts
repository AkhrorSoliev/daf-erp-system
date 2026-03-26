export interface TeacherGroup {
  id: string;
  name: string;
  level: string;
  studentCount: number;
  schedule: string;
  status: "active" | "completed" | "upcoming";
}

export interface Teacher {
  id: string; // 6-digit string
  firstName: string;
  lastName: string;
  phone: string;
  gender: "male" | "female";

  groups: TeacherGroup[];

  avatar: string;

  specialization?: string;

  /**
   * Future audit info
   * (who added, when added, etc.)
   */
  createdBy?: { by: string; at: string };
}

