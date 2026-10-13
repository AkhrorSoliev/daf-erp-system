export interface RatingTotals {
  average: number | null;
  rated: number;
  delivered: number;
  responseRate: number | null;
  low: number;
}

export interface RatingTeacherRow extends RatingTotals {
  teacherId: number;
  name: string;
  previousAverage: number | null;
}

export interface RatingSummary {
  enabled: boolean;
  month: string;
  totals: RatingTotals;
  previousAverage: number | null;
  teachers: RatingTeacherRow[];
}

export interface TeacherRatings {
  teacher: { id: number; name: string };
  months: { month: string; average: number | null; rated: number }[];
  groups: { groupId: string; name: string; average: number | null; rated: number }[];
  comments: {
    date: string;
    groupName: string;
    studentId: number;
    studentName: string;
    score: number;
    comment: string;
  }[];
}

export interface LowRating {
  id: string;
  date: string;
  groupId: string;
  groupName: string;
  teacherNames: string[];
  studentId: number;
  studentName: string;
  score: number;
  comment: string | null;
}

export interface Paged<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}
