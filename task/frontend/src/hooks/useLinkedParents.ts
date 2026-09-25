import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAppSelector } from "@/store";
import { parentApi, messageApi } from "@/lib/api";

export interface ParentLink {
  id: string;
  parent_user_id: string;
  parent_name: string | null;
  relationship: string;
  is_approved: boolean;
  approved_at?: string | null;
  created_at: string;
}

interface ThreadSummary {
  other_user_id: string;
  other_user_name: string;
  other_user_role: string;
  last_message: string;
  last_message_time: string;
  unread_count: number;
}

/**
 * Resolves the student's linked parent(s), mirroring useSelectedChild on
 * the parent side (GET /users/students/{studentId}/parents). Only approved
 * links can be messaged.
 */
export function useLinkedParents() {
  const user = useAppSelector(s => s.auth.user);
  const studentId = user?.id ?? "";

  const { data, isLoading, isError } = useQuery({
    queryKey: ["student-parents", studentId],
    queryFn: () => parentApi.getParentLinks(studentId).then(r => (r.data ?? []) as ParentLink[]),
    enabled: !!studentId,
  });

  const parents = useMemo<ParentLink[]>(() => data ?? [], [data]);
  const approvedParents = useMemo(() => parents.filter(p => p.is_approved), [parents]);

  // Latest-message preview + unread count for the pinned "family" row —
  // polled at the same cadence as the friend-chat unread badge so the
  // preview line and pinned-row unread count stay fresh without a
  // dedicated websocket for this REST-polling thread.
  const { data: threads } = useQuery({
    queryKey: ["student-message-threads", studentId],
    queryFn: () => messageApi.getThreads(studentId).then(r => (r.data ?? []) as ThreadSummary[]),
    enabled: !!studentId && approvedParents.length > 0,
    refetchInterval: 12_000,
  });

  const parentThread = useMemo(() => {
    if (!threads || approvedParents.length === 0) return null;
    const parentIds = new Set(approvedParents.map(p => p.parent_user_id));
    const matches = threads.filter(t => parentIds.has(t.other_user_id));
    if (matches.length === 0) return null;
    return matches.reduce((latest, t) => (t.last_message_time > latest.last_message_time ? t : latest));
  }, [threads, approvedParents]);

  return {
    studentId,
    parents,
    approvedParents,
    hasParent: approvedParents.length > 0,
    parentThread,
    isLoading,
    isError,
  };
}
