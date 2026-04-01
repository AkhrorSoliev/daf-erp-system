import { useState, useEffect, useRef } from "react";
import api from "@/lib/api";

export interface AvailableRoom {
  id: string;
  name: string;
  capacity: number | null;
  available: boolean;
  busyGroup: string | null;
}

export interface AvailableTeacher {
  id: number;
  firstName: string;
  lastName: string;
  photo: string | null;
  available: boolean;
  busyGroup: string | null;
}

interface UseScheduleAvailabilityParams {
  branchId?: number;
  exactDays: string[];
  startTime: string;
  endTime: string;
  excludeGroupId?: string;
}

export function useScheduleAvailability(params: UseScheduleAvailabilityParams) {
  const { branchId, exactDays, startTime, endTime, excludeGroupId } = params;
  const [rooms, setRooms] = useState<AvailableRoom[]>([]);
  const [teachers, setTeachers] = useState<AvailableTeacher[]>([]);
  const [loading, setLoading] = useState(false);
  const prevKey = useRef("");

  useEffect(() => {
    if (!branchId) {
      setRooms([]);
      setTeachers([]);
      return;
    }

    const key = `${branchId}-${exactDays.sort().join(",")}-${startTime}-${endTime}-${excludeGroupId}`;
    if (key === prevKey.current) return;

    const hasSchedule = exactDays.length > 0 && startTime && endTime;

    const timer = setTimeout(async () => {
      prevKey.current = key;
      setLoading(true);
      try {
        const queryParams: Record<string, string> = {
          branchId: String(branchId),
          exactDays: exactDays.join(","),
          startTime: startTime || "",
          endTime: endTime || "",
        };
        if (excludeGroupId) queryParams.excludeGroupId = excludeGroupId;

        if (hasSchedule) {
          const [roomsRes, teachersRes] = await Promise.all([
            api.get("/groups/available-rooms", { params: queryParams }),
            api.get("/groups/available-teachers", { params: queryParams }),
          ]);
          setRooms(roomsRes.data);
          setTeachers(teachersRes.data);
        } else {
          // Kun/vaqt tanlanmagan — barcha xona va ustozlarni olish (hammasi available)
          const [roomsRes, teachersRes] = await Promise.all([
            api.get("/groups/available-rooms", { params: queryParams }),
            api.get("/groups/available-teachers", { params: queryParams }),
          ]);
          setRooms(roomsRes.data);
          setTeachers(teachersRes.data);
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [branchId, exactDays, startTime, endTime, excludeGroupId]);

  return { rooms, teachers, loading };
}
