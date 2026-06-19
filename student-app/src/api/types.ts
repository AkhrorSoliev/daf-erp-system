/** Response shapes from /api/student-portal/* (mirror of server read service). */

export type Teacher = { id: number; firstName: string; lastName: string };
export type Room = { id: string; name: string } | null;

export type ProfileGroup = {
  id: string;
  enrollmentId: string;
  name: string;
  status: string;
  course_name: string | null;
  exactDays: string[];
  lessonStartTime: string | null;
  lessonEndTime: string | null;
  startDate: string | null;
  endDate: string | null;
  room: Room;
  teachers: Teacher[];
  enrolledAt: string;
};

export type Profile = {
  id: number;
  firstName: string;
  lastName: string;
  phone: string;
  extraPhone: string | null;
  parentPhone: string | null;
  parentName: string | null;
  telegram: string | null;
  photo: string | null;
  balance: number;
  status: string;
  login: string | null;
  date_of_birth: string | null;
  branches: { id: number; name: string }[];
  groups: ProfileGroup[];
};

export type ScheduleItem = {
  groupId: string;
  groupName: string;
  courseName: string | null;
  exactDays: string[];
  lessonStartTime: string | null;
  lessonEndTime: string | null;
  startDate: string | null;
  endDate: string | null;
  teachers: Teacher[];
  room: Room;
};

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';

export type AttendanceStats = {
  total: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  percentage: number;
};

export type AttendanceRecord = { date: string; status: AttendanceStatus; note: string | null };

export type AttendanceGroup = {
  groupId: string;
  groupName: string;
  courseName: string | null;
  lessonTime: string | null;
  stats: AttendanceStats;
  records: AttendanceRecord[];
};

export type PaymentItem = {
  id: string;
  amount: number;
  method: string;
  status: string;
  createdAt: string;
};

export type TransactionItem = {
  id: string;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string | null;
  createdAt: string;
};

export type PaymentHistory = { payments: PaymentItem[]; transactions: TransactionItem[] };
