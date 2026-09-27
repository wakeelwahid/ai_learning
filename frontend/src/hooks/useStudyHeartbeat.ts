import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAppSelector } from "@/store";
import { analyticsApi } from "@/lib/api";

const HEARTBEAT_MS = 60_000;

export function useStudyHeartbeat(active: boolean) {
  const user = useAppSelector(s => s.auth.user);
  const qc = useQueryClient();
  const isStudent = user?.role?.toLowerCase() === "student";
  const userId = user?.id;

  useEffect(() => {
    if (!active || !isStudent || !userId) return;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      analyticsApi.heartbeat(1)
        .then(() => qc.invalidateQueries({ queryKey: ["study-time", userId] }))
        .catch(() => {});
    };
    const iv = setInterval(tick, HEARTBEAT_MS);
    return () => clearInterval(iv);
  }, [active, isStudent, userId, qc]);
}
