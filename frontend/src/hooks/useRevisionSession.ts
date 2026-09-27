import { useEffect, useRef } from "react";
import { useAppSelector } from "@/store";
import { revisionApi } from "@/lib/api";

/** Tracks one revision sitting: POSTs a session while `active`, PATCHes it
 * with the elapsed seconds when `active` goes false or the screen unmounts.
 * Fire-and-forget like the study-time heartbeat — never blocks the UI. */
export function useRevisionSession(active: boolean, source = "weak_topics") {
  const user = useAppSelector(s => s.auth.user);
  const isStudent = user?.role?.toLowerCase() === "student";
  const sessionRef = useRef<{ id: string; startedAt: number } | null>(null);

  useEffect(() => {
    if (!active || !isStudent) return;
    let cancelled = false;
    revisionApi.startSession({ source })
      .then(r => {
        if (!cancelled) sessionRef.current = { id: r.data.id, startedAt: Date.now() };
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      const s = sessionRef.current;
      if (!s) return;
      sessionRef.current = null;
      const seconds = Math.round((Date.now() - s.startedAt) / 1000);
      revisionApi.endSession(s.id, seconds, true).catch(() => {});
    };
  }, [active, isStudent, source]);
}
