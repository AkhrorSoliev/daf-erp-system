import type { AttendanceGroup, AttendanceStats, PaymentHistory, Profile, ScheduleItem } from '@/api/types';

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
/** The weekday key the app compares against, for whatever day the test runs. */
export const TODAY = WEEKDAYS[new Date().getDay()];

export const profile: Profile = {
  id: 10042,
  firstName: 'Aziza',
  lastName: 'Karimova',
  phone: '998901234567',
  extraPhone: null,
  parentPhone: null,
  parentName: null,
  telegram: null,
  photo: null,
  balance: -150000,
  status: 'ACTIVE',
  login: 'aziza',
  date_of_birth: null,
  branches: [{ id: 1, name: 'Chilonzor' }],
  groups: [],
};

export const attendanceStats: AttendanceStats = {
  total: 10,
  present: 8,
  absent: 1,
  late: 1,
  excused: 0,
  percentage: 90,
};

export const lessonToday: ScheduleItem = {
  groupId: 'g-1',
  groupName: 'A1.2 Kechki',
  courseName: 'Nemis tili A1',
  exactDays: [TODAY],
  lessonStartTime: '18:00',
  lessonEndTime: '19:30',
  startDate: null,
  endDate: null,
  teachers: [{ id: 20001, firstName: 'Thomas', lastName: 'Weber' }],
  room: { id: 'r-1', name: '203' },
};

export const attendanceHistory: AttendanceGroup[] = [];

export const payments: PaymentHistory = { payments: [], transactions: [] };
