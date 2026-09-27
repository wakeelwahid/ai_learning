import { useQuery } from "@tanstack/react-query";
import { userApi } from "@/api/user";
import { useAppSelector } from "@/store";

export interface StudyTimeStatus {
  user_id: string;
  daily_limit_minutes: number | null;
  is_enabled: boolean;
  used_today_minutes: number;
  limit_reached: boolean;
}

export const studyTimeKey = (userId: string) => ["study-time", userId];

export function useStudyTime() {
  const user = useAppSelector((s) => s.auth.user);
  const userId = user?.id ?? "";
  const isStudent = (user?.role ?? "").toLowerCase() === "student";

  const { data, refetch } = useQuery({
    queryKey: studyTimeKey(userId),
    queryFn: () => userApi.studyTime(userId).then((r) => r.data as StudyTimeStatus),
    enabled: !!userId && isStudent,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const limitMinutes = data?.daily_limit_minutes ?? null;
  const isEnabled = data?.is_enabled === true;
  const limitReached = data?.limit_reached === true;

  return {
    limitMinutes,
    isEnabled,
    usedToday: data?.used_today_minutes ?? 0,
    limitReached,
    blocked: isEnabled && limitReached,
    refetch,
  };
}
