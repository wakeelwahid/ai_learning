import { useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { parentApi } from "@/api/parent";
import { useAppDispatch, useAppSelector } from "@/store";
import { setSelectedChildId } from "@/store/parentSlice";

export interface StudentLink {
  id: string;
  student_user_id: string;
  student_name: string | null;
  student_class: number | null;
  student_board: string | null;
  relationship: string;
  approval_required: boolean;
  is_approved: boolean;
  approved_at?: string | null;
  created_at?: string;
}

/**
 * Resolves the parent's linked children (parentId -> GET
 * /users/parents/{parentId}/students) and the currently selected child.
 * The selection lives in the Redux `parent` slice so Home / Monitor /
 * Messages / AI Chat / Study Limits all share one choice; it defaults to
 * the first APPROVED link and self-corrects when the stored id disappears.
 */
export function useLinkedChild() {
  const user = useAppSelector((s) => s.auth.user);
  const parentId = user?.id ?? "";
  const storedId = useAppSelector((s) => s.parent.selectedChildId);
  const dispatch = useAppDispatch();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["parent-students", parentId],
    queryFn: () => parentApi.getStudents(parentId).then((r) => r.data),
    enabled: !!parentId,
    staleTime: 0,
  });

  const children: StudentLink[] = Array.isArray(data) ? data : [];
  const approvedChildren = children.filter((c) => c.is_approved === true);
  const fallback = approvedChildren[0] ?? children[0] ?? null;
  const stored = storedId ? children.find((c) => c.student_user_id === storedId) ?? null : null;
  const child = stored ?? fallback;

  useEffect(() => {
    if (children.length === 0) return;
    if (!stored && fallback && fallback.student_user_id !== storedId) {
      dispatch(setSelectedChildId(fallback.student_user_id));
    }
  }, [children.length, stored, fallback, storedId, dispatch]);

  const selectChild = useCallback(
    (id: string) => { dispatch(setSelectedChildId(id)); },
    [dispatch],
  );

  return {
    parentId,
    children,
    approvedChildren,
    child,
    selectedChildId: child?.student_user_id ?? null,
    selectChild,
    childId: child?.student_user_id ?? null,
    childName: child?.student_name ?? "Student",
    isApproved: child?.is_approved === true,
    hasMultipleChildren: children.length > 1,
    isLoading,
    isError,
    refetch,
  };
}
