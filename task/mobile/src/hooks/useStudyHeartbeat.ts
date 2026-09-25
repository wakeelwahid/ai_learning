import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import { analyticsApi } from "@/api/analytics";
import { useAppSelector } from "@/store";
import { studyTimeKey, type StudyTimeStatus } from "@/hooks/useStudyTime";

const HEARTBEAT_MS = 60_000;

/**
 * Posts one study-minute every 60s while `active`, the app is foregrounded
 * and this screen is focused. `stillActive` (optional) is re-checked on every
 * tick so callers can gate on transient state (e.g. "video actually playing")
 * without re-rendering.
 */
export function useStudyHeartbeat(active: boolean, stillActive?: () => boolean) {
  const focused = useIsFocused();
  const user = useAppSelector((s) => s.auth.user);
  const userId = user?.id ?? "";
  const isStudent = (user?.role ?? "").toLowerCase() === "student";
  const qc = useQueryClient();
  const [appActive, setAppActive] = useState(AppState.currentState !== "background" && AppState.currentState !== "inactive");
  const stillActiveRef = useRef(stillActive);
  stillActiveRef.current = stillActive;

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => setAppActive(next === "active"));
    return () => sub.remove();
  }, []);

  const running = active && focused && appActive && isStudent && !!userId;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      if (stillActiveRef.current && !stillActiveRef.current()) return;
      analyticsApi
        .heartbeat(1)
        .then(({ data }) => {
          const used = typeof data?.used_today_minutes === "number" ? data.used_today_minutes : null;
          if (used === null) return;
          qc.setQueryData<StudyTimeStatus | undefined>(studyTimeKey(userId), (old) => {
            if (!old) return old;
            const limit = old.daily_limit_minutes;
            return {
              ...old,
              used_today_minutes: used,
              limit_reached: old.is_enabled && typeof limit === "number" ? used >= limit : old.limit_reached,
            };
          });
        })
        .catch(() => {});
    }, HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [running, userId, qc]);
}
