import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { parentApi } from "@/api/parent";
import { messageApi } from "@/api/message";
import { useAppSelector } from "@/store";

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
 * Resolves the student's linked parent(s) (studentId -> GET
 * /users/students/{studentId}/parents), mirroring useLinkedChild on the
 * parent side. Only approved links can be messaged.
 */
export function useLinkedParent() {
  const user = useAppSelector((s) => s.auth.user);
  const studentId = user?.id ?? "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["student-parents", studentId],
    queryFn: () => parentApi.getParentLinks(studentId).then((r) => r.data),
    enabled: !!studentId,
    staleTime: 0,
  });

  const parents: ParentLink[] = Array.isArray(data) ? data : [];
  const approvedParents = parents.filter((p) => p.is_approved === true);
  const parent = approvedParents[0] ?? null;

  // Latest-message preview + unread count for the pinned "family" row on
  // the student's Chat tab — same polling cadence as the friend-request
  // badge (see MessagesScreen.tsx) since this is a REST-polling thread,
  // not the WS-driven chatApi rooms.
  const { data: threads } = useQuery({
    queryKey: ["student-message-threads", studentId],
    queryFn: () => messageApi.getThreads(studentId).then((r) => r.data as ThreadSummary[]),
    enabled: !!studentId && approvedParents.length > 0,
    refetchInterval: 12_000,
  });

  const parentThread = useMemo(() => {
    if (!threads || approvedParents.length === 0) return null;
    const parentIds = new Set(approvedParents.map((p) => p.parent_user_id));
    const matches = threads.filter((t) => parentIds.has(t.other_user_id));
    if (matches.length === 0) return null;
    return matches.reduce((latest, t) => (t.last_message_time > latest.last_message_time ? t : latest));
  }, [threads, approvedParents]);

  return {
    studentId,
    parents,
    approvedParents,
    parent,
    parentId: parent?.parent_user_id ?? null,
    parentName: parent?.parent_name ?? "Parent",
    hasParent: approvedParents.length > 0,
    hasMultipleParents: approvedParents.length > 1,
    parentThread,
    isLoading,
    isError,
    refetch,
  };
}
