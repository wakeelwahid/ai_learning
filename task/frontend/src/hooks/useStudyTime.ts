import { useQuery } from "@tanstack/react-query";
import { useAppSelector } from "@/store";
import { userApi } from "@/lib/api";

interface StudyTimeResponse {
  user_id: string;
  daily_limit_minutes: number | null;
  is_enabled: boolean;
  used_today_minutes: number;
  limit_reached: boolean;
}

export function useStudyTime() {
  const user = useAppSelector(s => s.auth.user);
  const userId = user?.id ?? "";
  const isStudent = user?.role?.toLowerCase() === "student";

  const { data } = useQuery({
    queryKey: ["study-time", userId],
    queryFn: () => userApi.studyTime(userId).then(r => r.data as StudyTimeResponse),
    enabled: !!userId && isStudent,
    refetchInterval: 60_000,
    retry: 0,
  });

  const isEnabled = data?.is_enabled ?? false;
  const limitReached = isEnabled && (data?.limit_reached ?? false);

  return {
    limitMinutes: data?.daily_limit_minutes ?? null,
    isEnabled,
    usedToday: data?.used_today_minutes ?? 0,
    limitReached,
  };
}
