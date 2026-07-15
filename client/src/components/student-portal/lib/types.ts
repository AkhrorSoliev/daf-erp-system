// Student portal API response shapes. Mirror of the backend
// `student-portal.service` (also mirrored by student-app/src/api/types.ts).

export interface Teacher {
  id: number;
  firstName: string;
  lastName: string;
}

export interface ProfileGroup {
  id: number;
  enrollmentId: number;
  name: string;
  status: string;
  course_name: string | null;
  days: string | null;
  exactDays: string[];
  lessonStartTime: string | null;
  lessonEndTime: string | null;
  startDate: string | null;
  endDate: string | null;
  room: { id: number; name: string } | null;
  teachers: Teacher[];
  enrolledAt: string | null;
}

export interface StudentProfile {
  id: number;
  firstName: string;
  lastName: string;
  phone: string | null;
  extraPhone: string | null;
  parentPhone: string | null;
  parentName: string | null;
  telegram: string | null;
  photo: string | null;
  balance: number;
  status: string;
  login: string | null;
  date_of_birth: string | null;
  address: string | null;
  branches: { id: number; name: string }[];
  groups: ProfileGroup[];
}

export interface StudentScheduleItem {
  groupId: number;
  groupName: string;
  courseName: string | null;
  exactDays: string[];
  lessonStartTime: string | null;
  lessonEndTime: string | null;
  startDate: string | null;
  endDate: string | null;
  teachers: Teacher[];
  room: { id: number; name: string } | null;
}

export type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";

export interface AttendanceStats {
  total: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  percentage: number;
}

export interface AttendanceRecord {
  date: string;
  status: AttendanceStatus;
  note: string | null;
}

export interface AttendanceGroup {
  groupId: number;
  groupName: string;
  courseName: string | null;
  lessonTime: string | null;
  stats: AttendanceStats;
  records: AttendanceRecord[];
}

export interface PaymentItem {
  id: number;
  amount: number;
  method: string;
  status: string;
  createdAt: string;
}

export interface TransactionItem {
  id: number;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string | null;
  createdAt: string;
}

export interface PaymentHistory {
  payments: PaymentItem[];
  transactions: TransactionItem[];
}
