import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAppSelector } from "@/store";
import { parentApi } from "@/lib/api";

export interface StudentLink {
  id: string;
  student_user_id: string;
  student_name: string | null;
  student_class: number | null;
  student_board: string | null;
  relationship: string;
  is_approved: boolean;
  approval_required?: boolean;
  approved_at?: string | null;
  created_at?: string;
}

const STORAGE_KEY = "parent_selected_child_id";

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(id: string | null) {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function useSelectedChild() {
  const user = useAppSelector(s => s.auth.user);
  const parentId = user?.id ?? "";

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["parent-students", parentId],
    queryFn: () => parentApi.getStudents(parentId).then(r => (r.data ?? []) as StudentLink[]),
    enabled: !!parentId,
  });

  const children = useMemo<StudentLink[]>(() => data ?? [], [data]);
  const approvedChildren = useMemo(() => children.filter(c => c.is_approved), [children]);

  const [storedId, setStoredId] = useState<string | null>(() => readStored());

  const resolvedId = useMemo(() => {
    if (children.length === 0) return null;
    if (storedId && children.some(c => c.student_user_id === storedId)) return storedId;
    return (approvedChildren[0] ?? children[0]).student_user_id;
  }, [children, approvedChildren, storedId]);

  useEffect(() => {
    if (data && resolvedId !== storedId) {
      setStoredId(resolvedId);
      writeStored(resolvedId);
    }
  }, [data, resolvedId, storedId]);

  const setSelectedChildId = useCallback((id: string) => {
    setStoredId(id);
    writeStored(id);
  }, []);

  const selectedChild = children.find(c => c.student_user_id === resolvedId) ?? null;

  return {
    parentId,
    children,
    approvedChildren,
    selectedChild,
    selectedChildId: resolvedId,
    setSelectedChildId,
    isLoading,
    isError,
    error,
  };
}
