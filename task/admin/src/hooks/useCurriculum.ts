import { useQuery } from "@tanstack/react-query";
import { contentApi } from "@/lib/api";

/**
 * Dynamic curriculum options sourced from the real content service.
 * Pass the currently-selected board name and class number to cascade.
 */
export function useCurriculum(board?: string, cls?: string | number) {
  const { data: boards = [] } = useQuery({
    queryKey: ["cur-boards"],
    queryFn: () => contentApi.boards().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });
  const boardId = (boards as any[]).find((b: any) => b.name === board || b.code === board)?.id;

  const { data: classes = [] } = useQuery({
    queryKey: ["cur-classes", boardId],
    queryFn: () => contentApi.classes(boardId).then((r) => r.data),
    enabled: !!boardId,
  });
  const classId = (classes as any[]).find((c: any) => String(c.number) === String(cls))?.id;

  const { data: subjects = [] } = useQuery({
    queryKey: ["cur-subjects", classId],
    queryFn: () => contentApi.subjects(classId).then((r) => r.data),
    enabled: !!classId,
  });

  const subjectId = undefined; // resolved by caller when needed

  return {
    boards, classes, subjects, boardId, classId, subjectId,
    boardOpts:   (boards as any[]).map((b: any) => b.name) as string[],
    classOpts:   (classes as any[]).map((c: any) => c.number) as number[],
    subjectOpts: (subjects as any[]).map((s: any) => s.name) as string[],
  };
}

/** Dynamic chapters for a given subject name (needs board+class+subject). */
export function useChapters(subjectId?: string) {
  const { data: chapters = [] } = useQuery({
    queryKey: ["cur-chapters", subjectId],
    queryFn: () => contentApi.chapters(subjectId!).then((r) => r.data),
    enabled: !!subjectId,
  });
  return {
    chapters,
    chapterOpts: (chapters as any[]).map((c: any) => c.title) as string[],
  };
}
