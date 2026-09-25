import client from "./client";

export const notesApi = {
  chapter: (chapterId: string) =>
    client.get(`/v1/content/chapters/${chapterId}/notes`),
  bookmark: (noteId: string, userId: string) =>
    client.post(`/v1/content/notes/${noteId}/bookmark`, { user_id: userId }),
};
